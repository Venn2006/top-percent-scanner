import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { normalizeMarketLocation } from '@/lib/locationBenchmark';
import { normalizeWorkProvince } from '@/lib/workProvinces';
import { protectPublicMutation } from '@/lib/apiProtection';

// checkSecurity đã bỏ — tương tự verify route.
// Route này chỉ INSERT 1 bản ghi với VSPI ID do client sinh ra,
// không đọc dữ liệu nhạy cảm. supabaseServer (service role) bypass RLS.

const VSPI_ID_REGEX = /^VSPI-2026-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const PREMIUM_AMOUNT = 29_000;

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
      percent,
      experience,
      salary,
      market_location,
      work_province,
      utm_source,
      utm_medium,
      utm_campaign,
      referrer,
    } = body;

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
    const currentSalary = salary == null ? null : Number(salary);
    if (currentSalary != null && (!Number.isFinite(currentSalary) || currentSalary < 500_000 || currentSalary > 2_000_000_000)) {
      return NextResponse.json({ error: 'Invalid salary range' }, { status: 400 });
    }

    // ── Ghi vào DB bằng supabaseServer (service role, bypass RLS) ────────────
    const purchasePayload = {
      vspi_id:   vspiId,
      phone:     phone    || null,
      email:     email    || null,
      job_title: job_title.trim(),
      percent:   typeof percent === 'number' ? percent : null,
      experience: typeof experience === 'string' && ['junior', 'mid', 'senior'].includes(experience) ? experience : null,
      market_location: normalizeMarketLocation(market_location),
      work_province: normalizeWorkProvince(work_province),
      current_salary: currentSalary ? Math.round(currentSalary) : null,
      utm_source: cleanTrackingValue(utm_source),
      utm_medium: cleanTrackingValue(utm_medium),
      utm_campaign: cleanTrackingValue(utm_campaign),
      referrer: cleanTrackingValue(referrer),
      amount:    29000,
      status:    'pending',
    };

    let { error } = await supabaseServer
      .from('purchases')
      .upsert(purchasePayload, { onConflict: 'vspi_id' });

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
        .upsert(withoutProvince, { onConflict: 'vspi_id' });
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
        .upsert(withoutLocation, { onConflict: 'vspi_id' });
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
        .upsert(minimalPayload, { onConflict: 'vspi_id' });
      error = fallback.error;
    }

    if (error) {
      console.error('DB Insert Error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const recoveredPayment = await recoverEarlyWebhookPayment(vspiId, PREMIUM_AMOUNT);

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

async function recoverEarlyWebhookPayment(vspiId: string, expectedAmount: number): Promise<boolean> {
  const safeVspiId = vspiId.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const since = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const { data: events, error } = await supabaseServer
    .from('payment_events')
    .select('created_at, amount, payment_ref, content')
    .eq('status', 'no_match')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    if (!/payment_events|schema cache|relation/i.test(error.message)) {
      console.warn('[checkout] Could not recover early webhook payment:', error.message);
    }
    return false;
  }

  const matched = events?.find(event => {
    const content = String(event.content || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const amount = Number(event.amount || 0);
    return content.includes(safeVspiId) && (!amount || amount >= expectedAmount);
  });

  if (!matched) return false;

  const { error: updateError } = await supabaseServer
    .from('purchases')
    .update({
      status: 'paid',
      paid_at: matched.created_at || new Date().toISOString(),
      payment_ref: matched.payment_ref || null,
    })
    .eq('vspi_id', vspiId);

  if (updateError) {
    console.warn('[checkout] Matched early webhook but could not mark paid:', updateError.message);
    return false;
  }

  await supabaseServer
    .from('payment_events')
    .insert({
      status: 'matched',
      product: 'premium',
      vspi_id: vspiId,
      amount: matched.amount ?? null,
      payment_ref: matched.payment_ref ?? null,
      content: matched.content ? String(matched.content).slice(0, 500) : null,
      message: 'Recovered early webhook during checkout',
    })
    .then(({ error: eventError }) => {
      if (eventError && !/payment_events|schema cache|relation/i.test(eventError.message)) {
        console.warn('[checkout] Could not record recovered payment event:', eventError.message);
      }
    });

  return true;
}
