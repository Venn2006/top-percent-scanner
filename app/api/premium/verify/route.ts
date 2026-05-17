import { NextRequest, NextResponse } from 'next/server';
import { checkSecurity } from '@/lib/security';
import { supabaseServer } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const securityError = checkSecurity(req, 60); // Allow more polling
  if (securityError) return securityError;

  try {
    const { searchParams } = new URL(req.url);
    const vspiId = searchParams.get('id');

    if (!vspiId) {
      return NextResponse.json({ error: 'Missing ID' }, { status: 400 });
    }

    // 1. Verify purchase
    const { data: purchase, error: purchaseError } = await supabaseServer
      .from('purchases')
      .select('status, job_title')
      .eq('vspi_id', vspiId)
      .single();

    if (purchaseError || !purchase) {
      return NextResponse.json({ status: 'pending' });
    }

    if (purchase.status !== 'paid') {
      return NextResponse.json({ status: purchase.status });
    }

    // 2. Fetch full data if paid
    const { data: dbData, error: dbError } = await supabaseServer
      .from('salary_data')
      .select('*')
      .eq('job_title', purchase.job_title)
      .limit(1)
      .maybeSingle();

    if (dbError) throw dbError;

    return NextResponse.json({ status: 'paid', dbData });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
