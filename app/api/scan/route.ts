import { NextRequest, NextResponse } from 'next/server';
import { checkSecurity } from '@/lib/security';
import { supabaseServer } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const securityError = checkSecurity(req, 10);
  if (securityError) return securityError;

  try {
    const body = await req.json();
    const { job_title, salary } = body;

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

    const { data, error } = await supabaseServer
      .from('salary_data')
      .select('top_50, top_20, top_10, top_5, industry, job_title') // chỉ select cột cần thiết
      .eq('job_title', job_title.trim())
      .limit(1)
      .maybeSingle();

    if (error) throw error;

    let percent = 80;
    let lostMoney = 48_000_000;
    let isAboveMedian = false;

    // Masked data — top_10 và top_5 không trả về client (chỉ dùng để tính %)
    const safeData = {
      top_50: data?.top_50 ?? 15_000_000,
      top_20: data?.top_20 ?? null,
      top_10: null as number | null, // Masked — Premium only
      top_5:  null as number | null, // Masked — Premium only
      industry: data?.industry ?? null,
      job_title: data?.job_title ?? null,
    };

    if (data) {
      if      (userSal >= (data.top_5  ?? Infinity)) percent = 5;
      else if (userSal >= (data.top_10 ?? Infinity)) percent = 10;
      else if (userSal >= (data.top_20 ?? Infinity)) percent = 20;
      else if (userSal >= (data.top_50 ?? Infinity)) percent = 50;

      isAboveMedian = userSal >= (data.top_50 ?? 0);

      if (!isAboveMedian) {
        lostMoney = Math.max(0, (data.top_50 - userSal) * 12);
      } else if (percent > 10) {
        lostMoney = Math.max(0, ((data.top_10 ?? data.top_50 * 1.8) - userSal) * 12);
      } else {
        lostMoney = Math.max(0, ((data.top_5 ?? data.top_50 * 2.2) - userSal) * 12);
      }
    }

    return NextResponse.json({ percent, lostMoney, isAboveMedian, dbData: safeData });

  } catch (err: unknown) {
    console.error('[scan] Error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
