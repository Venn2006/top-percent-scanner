import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { protectPublicMutation } from '@/lib/apiProtection';
import { recoverNoMatchPayment } from '@/lib/paymentRecovery';
import { parseTrustedSalaryInput, resolveTrustedSalaryBenchmark } from '@/lib/serverSalaryGuard';

// checkSecurity đã bỏ — tương tự verify route.
// Route này chỉ INSERT 1 bản ghi với VSPI ID do client sinh ra,
// không đọc dữ liệu nhạy cảm. supabaseServer (service role) bypass RLS.

const VSPI_ID_REGEX = /^VSPI-2026-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const PREMIUM_AMOUNTS = {
  '29k': 29_000,
} as const;
type PremiumCheckoutPackage = keyof typeof PREMIUM_AMOUNTS;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const protectionError = protectPublicMutation(req, body, {
      namespace: 'premium-checkout',
      maxRequests: 6,
      requireConsent: true,
    });
    if (protectionError) return protectionError;

    const {
      vspiId,
      phone,
      email,
      job_title,
      experience,
      salary,
      market_location,
      work_province,
      utm_source,
      utm_medium,
      utm_campaign,
      referrer,
    } = body;
    const checkoutPackage: PremiumCheckoutPackage = '29k';
    const checkoutAmount = PREMIUM_AMOUNTS[checkoutPackage];

    // ── Input validation ─────────────────────────────────────────────────────
    if (!vspiId || !job_title) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }
    if (typeof vspiId !== 'string' || !VSPI_ID_REGEX.test(vspiId)) {
      return NextResponse.json({ error: 'Invalid VSPI ID format' }, { status: 400 });
    }
    if (typeof job_title !== 'string' || job_title.trim().length === 0 || job_title.length > 200) {
      return NextResponse.json({ error: 'Invalid job_title' }, { status: 400 });
    }
    if (phone && (typeof phone !== 'string' || !/^0[0-9]{9}$/.test(phone))) {
      return NextResponse.json({ error: 'Invalid phone format' }, { status: 400 });
    }
    if (email && (typeof email !== 'string' || email.length > 254 || !email.includes('@'))) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }
    const trustedInput = parseTrustedSalaryInput({ job_title, salary, experience, market_location, work_province });
    if ('error' in trustedInput) {
      return NextResponse.json({ error: trustedInput.error }, { status: 400 });
    }
    const resolved = await resolveTrustedSalaryBenchmark(supabaseServer, trustedInput, true);

    // ── Ghi vào DB bằng supabaseServer (service role, bypass RLS) ────────────
    const purchasePayload = {
      vspi_id:   vspiId,
      phone:     phone    || null,
      email:     email    || null,
      job_title: trustedInput.jobTitle,
      percent:   resolved.percentileBucket,
      experience: trustedInput.experience,
      market_location: trustedInput.marketLocation,
      work_province: trustedInput.workProvince,
      current_salary: trustedInput.salary,
      utm_source: cleanTrackingValue(utm_source),
      utm_medium: cleanTrackingValue(utm_medium),
      utm_campaign: cleanTrackingValue(utm_campaign),
      referrer: cleanTrackingValue(referrer),
      amount:    checkoutAmount,
      status:    'pending',
    };

    let { error } = await supabaseServer
      .from('purchases')
      .insert(purchasePayload);

    if (error && /utm_|referrer|work_province|schema cache|column/i.test(error.message)) {
      const withoutProvince = {
        vspi_id: purchasePayload.vspi_id,
        phone: purchasePayload.phone,
        email: purchasePayload.email,
        job_title: purchasePayload.job_title,
        percent: purchasePayload.percent,
        experience: purchasePayload.experience,
        market_location: purchasePayload.market_location,
        current_salary: purchasePayload.current_salary,
        status: purchasePayload.status,
        amount: purchasePayload.amount,
      };
      const fallback = await supabaseServer
        .from('purchases')
        .insert(withoutProvince);
      error = fallback.error;
    }

    if (error && /market_location|schema cache|column/i.test(error.message)) {
      const withoutLocation = {
        vspi_id: purchasePayload.vspi_id,
        phone: purchasePayload.phone,
        email: purchasePayload.email,
        job_title: purchasePayload.job_title,
        percent: purchasePayload.percent,
        experience: purchasePayload.experience,
        current_salary: purchasePayload.current_salary,
        status: purchasePayload.status,
        amount: purchasePayload.amount,
      };
      const fallback = await supabaseServer
        .from('purchases')
        .insert(withoutLocation);
      error = fallback.error;
    }

    if (error && /current_salary|schema cache|column/i.test(error.message)) {
      const minimalPayload = {
        vspi_id: purchasePayload.vspi_id,
        phone: purchasePayload.phone,
        email: purchasePayload.email,
        job_title: purchasePayload.job_title,
        percent: purchasePayload.percent,
        experience: purchasePayload.experience,
        status: purchasePayload.status,
        amount: purchasePayload.amount,
      };
      const fallback = await supabaseServer
        .from('purchases')
        .insert(minimalPayload);
      error = fallback.error;
    }

    if (error && isDuplicateOrderError(error)) {
      const existing = await supabaseServer
        .from('purchases')
        .select('status, amount')
        .eq('vspi_id', vspiId)
        .maybeSingle();

      if (existing.error) throw existing.error;
      const recoveredPayment = existing.data?.status === 'paid'
        ? true
        : await recoverEarlyWebhookPayment(vspiId, Number(existing.data?.amount || checkoutAmount));
      return NextResponse.json({ success: true, recoveredPayment, duplicate: true });
    }

    if (error) {
      console.error('DB Insert Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const recoveredPayment = await recoverEarlyWebhookPayment(vspiId, checkoutAmount);

    console.log('[checkout] ✅ Created pending order:', vspiId, recoveredPayment ? '(recovered paid webhook)' : '');
    return NextResponse.json({ success: true, recoveredPayment });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[checkout] Unhandled error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function cleanTrackingValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().slice(0, 120);
  return cleaned || null;
}

function isDuplicateOrderError(error: { code?: string; message?: string }) {
  return error.code === '23505' || /duplicate key|unique constraint/i.test(error.message || '');
}

async function recoverEarlyWebhookPayment(vspiId: string, expectedAmount: number): Promise<boolean> {
  return recoverNoMatchPayment({
    supabase: supabaseServer,
    vspiId,
    expectedAmount,
    product: 'premium',
    table: 'purchases',
    message: 'Recovered early webhook during checkout',
  });
}
