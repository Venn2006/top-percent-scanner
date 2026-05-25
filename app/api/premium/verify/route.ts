import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { normalizeExperience, resolveSalaryBenchmark } from '@/lib/salaryResolver';
import { enforceOrigin, rateLimit } from '@/lib/apiProtection';
import { getBenchmarkMarketLocation } from '@/lib/workProvinces';

// Bắt buộc Next.js luôn chạy route này ở runtime, không cache tĩnh
export const dynamic = 'force-dynamic';

const VSPI_ID_REGEX = /^VSPI-2026-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

// Header chống cache — gắn vào mọi response của route này
const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  'Pragma': 'no-cache',
};

interface PurchaseLookup {
  status: string;
  job_title: string;
  percent: number | null;
  experience?: string | null;
  current_salary?: number | null;
  market_location?: string | null;
  work_province?: string | null;
}

async function fetchPurchase(vspiId: string): Promise<PurchaseLookup | null> {
  const withSalary = await supabaseServer
    .from('purchases')
    .select('status, job_title, percent, experience, current_salary, market_location, work_province')
    .eq('vspi_id', vspiId)
    .maybeSingle();

  if (!withSalary.error) return withSalary.data as PurchaseLookup | null;
  if (!/current_salary|market_location|work_province|schema cache|column/i.test(withSalary.error.message)) {
    throw withSalary.error;
  }

  const fallback = await supabaseServer
    .from('purchases')
    .select('status, job_title, percent, experience')
    .eq('vspi_id', vspiId)
    .maybeSingle();
  if (fallback.error) throw fallback.error;
  return fallback.data as PurchaseLookup | null;
}

// ── Gọi Gemini để sinh phân tích chuyên gia cá nhân hóa ──────────────────────
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
  if (!apiKey) return FALLBACK;

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
      return FALLBACK;
    }

    const data = await res.json();
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    const trimmed = text.trim();
    // Nếu text bị cắt giữa câu (không kết thúc bằng dấu chấm/!) → dùng fallback
    if (!trimmed || trimmed.length < 50 || (!trimmed.endsWith('.') && !trimmed.endsWith('!') && !trimmed.endsWith('?'))) {
      return FALLBACK;
    }
    return trimmed;

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // AbortError = timeout — không log như lỗi nghiêm trọng
    if (msg.includes('abort') || msg.includes('AbortError')) {
      console.warn('[verify/expert] Gemini timeout, using fallback');
    } else {
      console.error('[verify/expert] Gemini failed:', msg);
    }
    return FALLBACK;
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
    const salaryParam = body.salary as string | undefined;
    const marketLocationParam = body.market_location;
    const workProvinceParam = body.work_province;

    if (!vspiId) {
      return NextResponse.json({ error: 'Missing ID' }, { status: 400 });
    }
    if (!VSPI_ID_REGEX.test(vspiId)) {
      return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 });
    }

    // ── Kiểm tra trạng thái purchase ─────────────────────────────────────────
    const purchase = await fetchPurchase(vspiId);

    if (!purchase) {
      return NextResponse.json({ status: 'pending' }, { headers: NO_CACHE_HEADERS });
    }
    if (purchase.status !== 'paid') {
      return NextResponse.json({ status: purchase.status }, { headers: NO_CACHE_HEADERS });
    }

    const salary = salaryParam ? Number(salaryParam) : (purchase.current_salary ?? 15_000_000);
    if (!Number.isFinite(salary) || salary < 500_000 || salary > 2_000_000_000) {
      return NextResponse.json({ error: 'Invalid salary range' }, { status: 400, headers: NO_CACHE_HEADERS });
    }
    if (salaryParam && !purchase.current_salary) {
      await supabaseServer
        .from('purchases')
        .update({ current_salary: Math.round(salary) })
        .eq('vspi_id', vspiId)
        .then(({ error }) => {
          if (error && !/current_salary|schema cache|column/i.test(error.message)) {
            console.warn('[verify] Could not backfill current_salary:', error.message);
          }
        });
    }
    const resolved = await resolveSalaryBenchmark(
      supabaseServer,
      purchase.job_title,
      salary,
      normalizeExperience(purchase.experience),
      true,
      getBenchmarkMarketLocation(workProvinceParam ?? purchase.work_province, marketLocationParam ?? purchase.market_location)
    );
    const percent = salaryParam ? resolved.percentileBucket : (purchase.percent ?? resolved.percentileBucket);

    const aiAnalysis = await generateExpertInsight(purchase.job_title, salary, percent);

    return NextResponse.json(
      {
        status: 'paid',
        dbData: resolved.fullDbData,
        benchmark: resolved.benchmark,
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
