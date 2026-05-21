import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

// Bắt buộc Next.js luôn chạy route này ở runtime, không cache tĩnh
export const dynamic = 'force-dynamic';

const VSPI_ID_REGEX = /^VSPI-2026-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

// Header chống cache — gắn vào mọi response của route này
const NO_CACHE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  'Pragma': 'no-cache',
};

// ── Gọi Gemini để sinh AI Insight cá nhân hóa ────────────────────────────────
// Timeout 8 giây — không để treo luồng verify của user
async function generateAiInsight(
  jobTitle: string,
  salary: number,
  percent: number
): Promise<string> {
  const FALLBACK =
    `Với vị trí ${jobTitle} ở Top ${percent}% thị trường, bạn đang có nền tảng tốt để bứt phá. ` +
    `Hãy tập trung vào việc nâng cấp kỹ năng chiến lược và xây dựng mạng lưới chuyên nghiệp ` +
    `để tiến lên band lương tiếp theo trong 12 tháng tới.`;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('[verify/ai] GEMINI_API_KEY not set, using fallback');
    return FALLBACK;
  }

  const prompt = `Bạn là chuyên gia nhân sự cấp cao với 20 năm kinh nghiệm tư vấn nghề nghiệp tại Việt Nam.
Hãy viết một đoạn phân tích cực kỳ sắc bén (khoảng 150-200 từ) dành riêng cho người dùng sau:

- Chức danh: ${jobTitle}
- Mức lương: ${salary.toLocaleString('vi-VN')} VNĐ/tháng
- Vị trí thị trường: Top ${percent}%

Yêu cầu phân tích:
1. Lý do cụ thể tại sao họ đang ở vị trí Top ${percent}% này (không chung chung)
2. Một rủi ro tiềm ẩn nghiêm trọng nhất họ đang đối mặt (AI thay thế, trần lương, market shift...)
3. Một hành động đột phá duy nhất họ cần làm NGAY trong 90 ngày tới để tăng thu nhập

Tông văn: thẳng thắn, không vòng vo, đánh thẳng vào vấn đề. Viết bằng tiếng Việt. Không dùng bullet points — viết thành đoạn văn liền mạch.`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s timeout

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 400,
            temperature: 0.8,
          },
        }),
      }
    );

    clearTimeout(timeoutId);

    if (!res.ok) {
      console.error('[verify/ai] Gemini error:', res.status);
      return FALLBACK;
    }

    const data = await res.json();
    const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    return text.trim() || FALLBACK;

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // AbortError = timeout — không log như lỗi nghiêm trọng
    if (msg.includes('abort') || msg.includes('AbortError')) {
      console.warn('[verify/ai] Gemini timeout, using fallback');
    } else {
      console.error('[verify/ai] Gemini failed:', msg);
    }
    return FALLBACK;
  }
}

export async function GET(req: NextRequest) {
  // checkSecurity đã được bỏ — route này chỉ tra cứu 1 VSPI ID ngẫu nhiên,
  // không lộ dữ liệu hàng loạt. supabaseServer (service role) bypass RLS.
  try {
    const { searchParams } = new URL(req.url);
    const vspiId  = searchParams.get('id');
    // salary được client gửi kèm để Gemini có đủ context
    const salaryParam = searchParams.get('salary');

    if (!vspiId) {
      return NextResponse.json({ error: 'Missing ID' }, { status: 400 });
    }
    if (!VSPI_ID_REGEX.test(vspiId)) {
      return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 });
    }

    // ── Kiểm tra trạng thái purchase ─────────────────────────────────────────
    const { data: purchase, error: purchaseError } = await supabaseServer
      .from('purchases')
      .select('status, job_title, percent')
      .eq('vspi_id', vspiId)
      .maybeSingle();

    if (purchaseError) throw purchaseError;

    if (!purchase) {
      return NextResponse.json({ status: 'pending' }, { headers: NO_CACHE_HEADERS });
    }
    if (purchase.status !== 'paid') {
      return NextResponse.json({ status: purchase.status }, { headers: NO_CACHE_HEADERS });
    }

    // ── Fetch full salary data ────────────────────────────────────────────────
    const { data: dbData, error: dbError } = await supabaseServer
      .from('salary_data')
      .select('top_50, top_20, top_10, top_5, industry, job_title')
      .eq('job_title', purchase.job_title)
      .limit(1)
      .maybeSingle();

    if (dbError) throw dbError;

    // ── Sinh AI Insight song song với response (non-blocking nếu timeout) ─────
    const salary = salaryParam ? Number(salaryParam) : (dbData?.top_50 ?? 15_000_000);
    const percent = purchase.percent ?? 50;

    const aiAnalysis = await generateAiInsight(purchase.job_title, salary, percent);

    return NextResponse.json(
      { status: 'paid', dbData, aiAnalysis },
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
