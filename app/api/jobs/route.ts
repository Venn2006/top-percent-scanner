import { NextRequest, NextResponse } from 'next/server';
import { checkSecurity } from '@/lib/security';
import { supabaseServer } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const securityError = checkSecurity(req, 30);
  if (securityError) return securityError;

  try {
    const { data, error } = await supabaseServer
      .from('salary_data')
      .select('industry, job_title');

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
