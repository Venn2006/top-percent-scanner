import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { normalizeExperience, resolveSalaryBenchmark } from '@/lib/salaryResolver';
import { enforceOrigin, rateLimit } from '@/lib/apiProtection';
import { getBenchmarkMarketLocation } from '@/lib/workProvinces';
import { recoverNoMatchPayment } from '@/lib/paymentRecovery';
import { repairMojibakeDeep, repairMojibakeText } from '@/lib/mojibake';
import { detectRoleSegment, getRoleLanguage, isPublicSubjectTeacherRole, type RoleSegment } from '@/lib/roleTaxonomy';

// Bắt buộc Next.js luôn chạy route này ở runtime, không cache tĩnh
export const dynamic = 'force-dynamic';

const VSPI_ID_REGEX = /^VSPI-2026-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

// Header chống cache — gắn vào mọi response của route này
const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  'Pragma': 'no-cache',
};

function isLooseRoleSegment(segment: RoleSegment) {
  return segment === 'general' || segment === 'fresh';
}

function isCrossRoleBenchmark(requestedJobTitle: string, matchedJobTitle?: string | null, industry?: string | null) {
  if (!matchedJobTitle) return false;
  const requestedSegment = detectRoleSegment(requestedJobTitle);
  if (isLooseRoleSegment(requestedSegment)) return false;
  return detectRoleSegment(matchedJobTitle, industry) !== requestedSegment;
}

function buildRoleAwarePremiumInsight(jobTitle: string, salary: number, percent: number, industry?: string | null) {
  const language = getRoleLanguage(jobTitle, industry);
  const salaryText = `${(salary / 1_000_000).toFixed(1)} triệu/tháng`;
  const segment = detectRoleSegment(jobTitle, industry);
  const roleName = jobTitle.trim() || 'nghề của bạn';
  const proofExamples = language.proofAsset
    .split(/,| và |\+|;/)
    .map(item => item.trim())
    .filter(Boolean)
    .slice(0, 3)
    .join(', ');
  const roleSpecificNudge = segment === 'events'
    ? 'Bộ bằng chứng dễ hiểu nhất: showreel 60-90 giây, 3 sự kiện đã dẫn, feedback khách/agency và rate card.'
    : isPublicSubjectTeacherRole(jobTitle, industry)
      ? 'Bộ bằng chứng dễ hiểu nhất: giáo án bộ môn, ma trận đề/rubric, điểm học sinh trước-sau và góp ý dự giờ.'
      : `Bộ bằng chứng dễ hiểu nhất: ${proofExamples || language.mainSkill}.`;

  return `Bạn đang làm ${roleName}, lương ${salaryText}, vị trí thị trường là ${percent >= 100 ? 'dưới Top 80%' : `Top ${percent}%`}. Muốn tăng lương thì đừng học lan man; hãy chứng minh bạn tạo ra kết quả cụ thể trong đúng nghề này. ${roleSpecificNudge} Trong 30 ngày tới, chọn 1 việc thật đang làm, ghi số trước khi làm, cải thiện nó, rồi lưu lại kết quả sau khi làm kèm người xác nhận. Khi có 2-3 bằng chứng như vậy, bạn mới có lý do để xin review lương hoặc nhắm tới ${language.rolePath}. Kỹ năng nên ưu tiên trước: ${language.mainSkill}.`;
}

interface PurchaseLookup {
  status: string;
  amount?: number | null;
  job_title: string;
  percent: number | null;
  experience?: string | null;
  current_salary?: number | null;
  market_location?: string | null;
  work_province?: string | null;
}

function normalizeVerifyText(value: unknown): string {
  return typeof value === 'string'
    ? value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[đĐ]/g, 'd')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim()
    : '';
}

function requestMatchesPaidPurchase(
  purchase: PurchaseLookup,
  input: { jobTitle: unknown; salary: unknown; experience: unknown }
): boolean {
  const requestedJob = normalizeVerifyText(input.jobTitle);
  const paidJob = normalizeVerifyText(purchase.job_title);
  if (!requestedJob || !paidJob || requestedJob !== paidJob) return false;

  const requestedSalary = Number(input.salary || 0);
  const paidSalary = Number(purchase.current_salary || 0);
  if (!Number.isFinite(requestedSalary) || !Number.isFinite(paidSalary) || paidSalary <= 0) return false;
  if (Math.abs(requestedSalary - paidSalary) > 1) return false;

  const requestedExperience = normalizeVerifyText(input.experience);
  const paidExperience = normalizeVerifyText(purchase.experience);
  if (!requestedExperience || !paidExperience || requestedExperience !== paidExperience) return false;

  return true;
}

function hasCompleteProfilePayload(input: { jobTitle: unknown; salary: unknown; experience: unknown }): boolean {
  return input.jobTitle !== undefined && input.salary !== undefined && input.experience !== undefined;
}

async function fetchPurchase(vspiId: string): Promise<PurchaseLookup | null> {
  const withSalary = await supabaseServer
    .from('purchases')
    .select('status, amount, job_title, percent, experience, current_salary, market_location, work_province')
    .eq('vspi_id', vspiId)
    .maybeSingle();

  if (!withSalary.error) return withSalary.data as PurchaseLookup | null;
  if (!/current_salary|market_location|work_province|schema cache|column/i.test(withSalary.error.message)) {
    throw withSalary.error;
  }

  const fallback = await supabaseServer
    .from('purchases')
    .select('status, amount, job_title, percent, experience')
    .eq('vspi_id', vspiId)
    .maybeSingle();
  if (fallback.error) throw fallback.error;
  return fallback.data as PurchaseLookup | null;
}

// ── Gọi Gemini để sinh phân tích chuyên gia cá nhân hóa ──────────────────────
// Kept as a fallback reference; production currently uses deterministic role-aware insight.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function generateExpertInsight(
  jobTitle: string,
  salary: number,
  percent: number
): Promise<string> {
  // Fallback đầy đủ — không bị cắt giữa chừng
  const FALLBACK =
    `Với vị trí ${jobTitle} ở Top ${percent}% thị trường, bạn đang có nền tảng tốt hơn phần lớn đồng nghiệp. ` +
    `Tuy nhiên, rủi ro lớn nhất ở vị trí này là "bẫy comfort zone" — thu nhập đủ sống nhưng không đủ để tích lũy tài sản, ` +
    `và mỗi năm trôi qua mà không hành động là mỗi năm khoảng cách với nhóm Top ${Math.max(5, percent - 20)}% ngày càng rộng ra. ` +
    `Hành động đột phá trong 90 ngày tới: xác định 1 kỹ năng cụ thể mà nhóm trên bạn có nhưng bạn chưa có, ` +
    `học trong 30 ngày, áp dụng vào công việc thực tế trong 30 ngày tiếp theo, ` +
    `và dùng kết quả đó làm bằng chứng để đàm phán lương trong 30 ngày cuối.`;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return repairMojibakeText(FALLBACK);

  const prompt = `Bạn là chuyên gia tư vấn nghề nghiệp cấp cao tại Việt Nam với 20 năm kinh nghiệm, ` +
    `đã tư vấn cho hơn 10,000 người lao động tăng lương thành công. ` +
    `Không viết chung chung; viết như chuyên gia thực chiến biết rõ thị trường lao động Việt Nam 2026.\n\n` +
    `Viết đoạn phân tích 150-180 từ cho người dùng sau:\n` +
    `- Chức danh: ${jobTitle}\n` +
    `- Mức lương: ${(salary/1_000_000).toFixed(1)} triệu VNĐ/tháng\n` +
    `- Vị trí thị trường: Top ${percent}%\n\n` +
    `Phân tích PHẢI bao gồm đủ 3 phần:\n` +
    `1. Tại sao họ đang ở Top ${percent}% (lý do cụ thể, không chung chung)\n` +
    `2. Rủi ro tiềm ẩn lớn nhất (tự động hóa / trần lương / thay đổi thị trường — chọn 1 phù hợp nhất với ${jobTitle})\n` +
    `3. 1 hành động đột phá cụ thể trong 90 ngày tới\n\n` +
    `Tông văn: thẳng thắn như người bạn thật sự quan tâm, không vòng vo, không sáo rỗng. ` +
    `Viết tiếng Việt, 1 đoạn văn liền mạch, KHÔNG dùng bullet points, KHÔNG dùng tiêu đề.`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000); // tăng lên 12s

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 500,  // tăng lên để không bị cắt
            temperature: 0.75,
          },
        }),
      }
    );

    clearTimeout(timeoutId);

    if (!res.ok) {
      console.error('[verify/expert] Gemini error:', res.status);
      return repairMojibakeText(FALLBACK);
    }

    const data = await res.json();
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const trimmed = text.trim();
    // Nếu text bị cắt giữa câu (không kết thúc bằng dấu chấm/!) → dùng fallback
    if (!trimmed || trimmed.length < 50 || (!trimmed.endsWith('.') && !trimmed.endsWith('!') && !trimmed.endsWith('?'))) {
      return repairMojibakeText(FALLBACK);
    }
    return repairMojibakeText(trimmed);

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // AbortError = timeout — không log như lỗi nghiêm trọng
    if (msg.includes('abort') || msg.includes('AbortError')) {
      console.warn('[verify/expert] Gemini timeout, using fallback');
    } else {
      console.error('[verify/expert] Gemini failed:', msg);
    }
    return repairMojibakeText(FALLBACK);
  }
}

export async function POST(req: NextRequest) {
  // checkSecurity đã được bỏ — route này chỉ tra cứu 1 VSPI ID ngẫu nhiên,
  // không lộ dữ liệu hàng loạt. supabaseServer (service role) bypass RLS.
  try {
    const originError = enforceOrigin(req);
    if (originError) return originError;
    const limitError = rateLimit(req, 'premium-verify', 24);
    if (limitError) return limitError;

    const body        = await req.json();
    const vspiId      = body.id as string | undefined;
    const requestedJobTitle = body.job_title;
    const requestedExperience = body.experience;
    const requestedSalary = body.salary;
    const marketLocationParam = body.market_location;
    const workProvinceParam = body.work_province;

    if (!vspiId) {
      return NextResponse.json({ error: 'Missing ID' }, { status: 400 });
    }
    if (!VSPI_ID_REGEX.test(vspiId)) {
      return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 });
    }

    // ── Kiểm tra trạng thái purchase ─────────────────────────────────────────
    let purchase = await fetchPurchase(vspiId);

    if (!purchase) {
      return NextResponse.json({ status: 'pending' }, { headers: NO_CACHE_HEADERS });
    }
    if (purchase.status !== 'paid') {
      if (purchase.status === 'pending') {
        const recoveredPayment = await recoverNoMatchPayment({
          supabase: supabaseServer,
          vspiId,
          expectedAmount: Number(purchase.amount || 29_000),
          product: 'premium',
          table: 'purchases',
          message: 'Recovered no_match webhook during premium verify',
        });
        if (recoveredPayment) {
          purchase = await fetchPurchase(vspiId);
        }
      }

      if (purchase?.status !== 'paid') {
        return NextResponse.json(
          { status: purchase?.status ?? 'pending' },
          { headers: NO_CACHE_HEADERS }
        );
      }
    }

    const requestedProfile = {
      jobTitle: requestedJobTitle,
      salary: requestedSalary,
      experience: requestedExperience,
    };
    if (hasCompleteProfilePayload(requestedProfile) && !requestMatchesPaidPurchase(purchase, requestedProfile)) {
      return NextResponse.json(
        { status: 'pending', error: 'Purchase profile mismatch' },
        { status: 409, headers: NO_CACHE_HEADERS }
      );
    }

    // Security: premium report inputs are authoritative from the paid order.
    // Do not trust client-supplied salary here; otherwise F12/API tampering can
    // change the unlocked report after checkout.
    const salary = purchase.current_salary ?? 15_000_000;
    if (!Number.isFinite(salary) || salary < 500_000 || salary > 500_000_000) {
      return NextResponse.json({ error: 'Invalid salary range' }, { status: 400, headers: NO_CACHE_HEADERS });
    }
    const resolved = await resolveSalaryBenchmark(
      supabaseServer,
      purchase.job_title,
      salary,
      normalizeExperience(purchase.experience),
      true,
      getBenchmarkMarketLocation(workProvinceParam ?? purchase.work_province, marketLocationParam ?? purchase.market_location)
    );
    const percent = purchase.percent ?? resolved.percentileBucket;
    const crossRoleBenchmark = isCrossRoleBenchmark(purchase.job_title, resolved.matchedJobTitle, resolved.industry);
    const safeFullDbData = crossRoleBenchmark
      ? { ...resolved.fullDbData, job_title: purchase.job_title, industry: null }
      : resolved.fullDbData;
    const safeBenchmark = crossRoleBenchmark
      ? {
          ...resolved.benchmark,
          matchedJobTitle: purchase.job_title,
          matchType: 'ai_estimate',
          confidenceScore: Math.min(resolved.benchmark.confidenceScore, 52),
          confidenceLabel: 'Tham khảo',
          confidenceDescription: 'Benchmark gốc bị lệch nhóm nghề nên VSPI đã giữ theo chức danh bạn nhập và hạ độ tin cậy để owner duyệt lại.',
          sourceType: 'Ước tính theo nghề - chờ owner duyệt',
        }
      : resolved.benchmark;

    const aiAnalysis = buildRoleAwarePremiumInsight(purchase.job_title, salary, percent, resolved.industry);

    return NextResponse.json(
      {
        status: 'paid',
        dbData: repairMojibakeDeep(safeFullDbData),
        benchmark: repairMojibakeDeep(safeBenchmark),
        workProvince: workProvinceParam ?? purchase.work_province ?? null,
        aiAnalysis,
      },
      { headers: NO_CACHE_HEADERS }
    );

  } catch (err: unknown) {
    console.error('[verify] Error:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: NO_CACHE_HEADERS }
    );
  }
}
