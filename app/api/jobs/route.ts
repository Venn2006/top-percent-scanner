import { NextRequest, NextResponse } from 'next/server';
import { checkSecurity } from '@/lib/security';
import { supabaseServer } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const securityError = checkSecurity(req, 30);
  if (securityError) return securityError;

  try {
    const { data, error } = await supabaseServer
      .from('salary_data')
      .select('industry, job_title'); // chỉ lấy 2 cột cần thiết

    if (error) throw error;

    const merged = new Map<string, { industry: string | null; job_title: string }>();
    (data ?? []).forEach(item => {
      if (item.job_title) merged.set(item.job_title, { industry: item.industry ?? null, job_title: item.job_title });
    });

    // Bảng mới có thể chưa tồn tại ở một số môi trường; nếu lỗi thì bỏ qua để app vẫn chạy.
    const { data: benchmarks } = await supabaseServer
      .from('salary_benchmarks')
      .select('industry, canonical_job_title')
      .limit(2000);

    (benchmarks ?? []).forEach(item => {
      const title = item.canonical_job_title as string | undefined;
      if (title) merged.set(title, { industry: item.industry ?? null, job_title: title });
    });

    return NextResponse.json({ data: Array.from(merged.values()) });

  } catch (err: unknown) {
    console.error('[jobs] Error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
