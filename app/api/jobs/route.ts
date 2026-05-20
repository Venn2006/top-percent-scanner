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

    return NextResponse.json({ data });

  } catch (err: unknown) {
    console.error('[jobs] Error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
