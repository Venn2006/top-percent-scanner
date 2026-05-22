import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { normalizeMarketLocation } from '@/lib/locationBenchmark';
import { normalizeWorkProvince } from '@/lib/workProvinces';
import { protectPublicMutation } from '@/lib/apiProtection';

// checkSecurity đã bỏ — tương tự verify route.
// Route này chỉ INSERT 1 bản ghi với VSPI ID do client sinh ra,
// không đọc dữ liệu nhạy cảm. supabaseServer (service role) bypass RLS.

const VSPI_ID_REGEX = /^VSPI-2026-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const protectionError = protectPublicMutation(req, body, {
      namespace: 'premium-checkout',
      maxRequests: 6,
      requireConsent: true,
    });
    if (protectionError) return protectionError;

    const { vspiId, phone, email, job_title, percent, experience, salary, market_location, work_province } = body;

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
      amount:    29000,
      status:    'pending',
    };

    let { error } = await supabaseServer
      .from('purchases')
      .upsert(purchasePayload, { onConflict: 'vspi_id' });

    if (error && /work_province|schema cache|column/i.test(error.message)) {
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

    console.log('[checkout] ✅ Created pending order:', vspiId);
    return NextResponse.json({ success: true });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[checkout] Unhandled error:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
