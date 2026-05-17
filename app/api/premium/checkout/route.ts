import { NextRequest, NextResponse } from 'next/server';
import { checkSecurity } from '@/lib/security';
import { supabaseServer } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const securityError = checkSecurity(req, 10);
  if (securityError) return securityError;

  try {
    const body = await req.json();
    const { vspiId, phone, email, job_title, percent } = body;

    if (!vspiId || !job_title) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const { error } = await supabaseServer.from('purchases').upsert({
      vspi_id: vspiId,
      phone: phone || null,
      email: email || null,
      job_title: job_title,
      percent: percent,
      status: 'pending',
    }, { onConflict: 'vspi_id' });

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
