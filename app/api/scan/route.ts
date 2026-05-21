import { NextRequest, NextResponse } from 'next/server';
import { checkSecurity } from '@/lib/security';
import { supabaseServer } from '@/lib/supabase';

// ── Hệ số điều chỉnh theo kinh nghiệm ────────────────────────────────────────
// Dữ liệu gốc trong salary_data là mốc chuẩn cho "3–5 năm" (mid-level).
// Junior (0–2 năm): thị trường trả thấp hơn ~30% so với mid.
// Senior (5+ năm): thị trường trả cao hơn ~30% so với mid.
const EXPERIENCE_MULTIPLIER: Record<string, number> = {
  junior: 0.70,
  mid:    1.00,
  senior: 1.30,
};

type ExperienceKey = keyof typeof EXPERIENCE_MULTIPLIER;

// ── Áp dụng hệ số lên toàn bộ salary band, đảm bảo thứ tự tăng dần ─────────
// Sau khi nhân hệ số, thứ tự top_50 < top_20 < top_10 < top_5 vẫn được bảo toàn
// vì tất cả nhân cùng 1 hệ số — không có nguy cơ đảo ngược thứ tự.
function applyMultiplier(
  raw: { top_50: number; top_20: number | null; top_10: number | null; top_5: number | null },
  multiplier: number
) {
  return {
    top_50: Math.round(raw.top_50 * multiplier),
    top_20: raw.top_20 != null ? Math.round(raw.top_20 * multiplier) : null,
    top_10: raw.top_10 != null ? Math.round(raw.top_10 * multiplier) : null,
    top_5:  raw.top_5  != null ? Math.round(raw.top_5  * multiplier) : null,
  };
}

export async function POST(req: NextRequest) {
  const securityError = checkSecurity(req, 10);
  if (securityError) return securityError;

  try {
    const body = await req.json();
    const { job_title, salary, experience } = body;

    // ── Input validation ─────────────────────────────────────────────────────
    if (!job_title || salary === undefined || salary === null) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }
    if (typeof job_title !== 'string' || job_title.trim().length === 0 || job_title.length > 200) {
      return NextResponse.json({ error: 'Invalid job_title' }, { status: 400 });
    }
    const userSal = Number(salary);
    if (isNaN(userSal) || userSal < 500_000 || userSal > 500_000_000) {
      return NextResponse.json({ error: 'Invalid salary range' }, { status: 400 });
    }

    // Validate experience — fallback về 'mid' nếu không hợp lệ
    const expKey: ExperienceKey =
      typeof experience === 'string' && experience in EXPERIENCE_MULTIPLIER
        ? (experience as ExperienceKey)
        : 'mid';
    const multiplier = EXPERIENCE_MULTIPLIER[expKey];

    // ── Fetch raw salary data ─────────────────────────────────────────────────
    const { data, error } = await supabaseServer
      .from('salary_data')
      .select('top_50, top_20, top_10, top_5, industry, job_title')
      .eq('job_title', job_title.trim())
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    let percent = 80;
    let lostMoney = 48_000_000;
    let isAboveMedian = false;

    // ── Masked data trả về client (top_10, top_5 ẩn — Premium only) ──────────
    // Trả về mốc đã điều chỉnh theo kinh nghiệm để chart hiển thị đúng
    const rawFallback = { top_50: 15_000_000, top_20: null, top_10: null, top_5: null };
    const rawData = data
      ? { top_50: data.top_50, top_20: data.top_20, top_10: data.top_10, top_5: data.top_5 }
      : rawFallback;

    const adjusted = applyMultiplier(rawData, multiplier);

    const safeData = {
      top_50:    adjusted.top_50,
      top_20:    adjusted.top_20,
      top_10:    null as number | null, // Masked — Premium only
      top_5:     null as number | null, // Masked — Premium only
      industry:  data?.industry  ?? null,
      job_title: data?.job_title ?? null,
    };

    if (data) {
      // So sánh lương user với các mốc ĐÃ ĐIỀU CHỈNH theo kinh nghiệm
      if      (userSal >= (adjusted.top_5  ?? Infinity)) percent = 5;
      else if (userSal >= (adjusted.top_10 ?? Infinity)) percent = 10;
      else if (userSal >= (adjusted.top_20 ?? Infinity)) percent = 20;
      else if (userSal >= (adjusted.top_50 ?? Infinity)) percent = 50;

      isAboveMedian = userSal >= adjusted.top_50;

      // lostMoney = khoảng cách đến mốc tiếp theo (đã điều chỉnh)
      if (!isAboveMedian) {
        lostMoney = Math.max(0, (adjusted.top_50 - userSal) * 12);
      } else if (percent > 10) {
        const top10Adj = adjusted.top_10 ?? Math.round(adjusted.top_50 * 1.8);
        lostMoney = Math.max(0, (top10Adj - userSal) * 12);
      } else {
        const top5Adj = adjusted.top_5 ?? Math.round(adjusted.top_50 * 2.2);
        lostMoney = Math.max(0, (top5Adj - userSal) * 12);
      }
    }

    return NextResponse.json({
      percent,
      lostMoney,
      isAboveMedian,
      dbData: safeData,
      // Trả về experience để client có thể hiển thị thông báo
      experience: expKey,
    });

  } catch (err: unknown) {
    console.error('[scan] Error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
