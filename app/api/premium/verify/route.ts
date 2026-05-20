import { NextRequest, NextResponse } from 'next/server';
import { checkSecurity } from '@/lib/security';
import { supabaseServer } from '@/lib/supabase';

const VSPI_ID_REGEX = /^VSPI-2026-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

export async function GET(req: NextRequest) {
  const securityError = checkSecurity(req, 60); // polling cần limit cao hơn
  if (securityError) return securityError;

  try {
    const { searchParams } = new URL(req.url);
    const vspiId = searchParams.get('id');

    // ── Input validation ─────────────────────────────────────────────────────
    if (!vspiId) {
      return NextResponse.json({ error: 'Missing ID' }, { status: 400 });
    }
    if (!VSPI_ID_REGEX.test(vspiId)) {
      return NextResponse.json({ error: 'Invalid ID format' }, { status: 400 });
    }

    // ── Kiểm tra trạng thái purchase ─────────────────────────────────────────
    const { data: purchase, error: purchaseError } = await supabaseServer
      .from('purchases')
      .select('status, job_title')
      .eq('vspi_id', vspiId)
      .maybeSingle(); // dùng maybeSingle thay vì single để không throw khi không có record

    if (purchaseError) throw purchaseError;

    if (!purchase) {
      return NextResponse.json({ status: 'pending' });
    }
    if (purchase.status !== 'paid') {
      return NextResponse.json({ status: purchase.status });
    }

    // ── Fetch full salary data khi đã paid ───────────────────────────────────
    const { data: dbData, error: dbError } = await supabaseServer
      .from('salary_data')
      .select('top_50, top_20, top_10, top_5, industry, job_title') // explicit columns
      .eq('job_title', purchase.job_title)
      .limit(1)
      .maybeSingle();

    if (dbError) throw dbError;

    return NextResponse.json({ status: 'paid', dbData });

  } catch (err: unknown) {
    console.error('[verify] Error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
