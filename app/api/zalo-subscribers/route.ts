import { NextRequest, NextResponse } from 'next/server';
import { protectPublicMutation } from '@/lib/apiProtection';
import { parseTrustedSalaryInput, resolveTrustedSalaryBenchmark } from '@/lib/serverSalaryGuard';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const protectionError = protectPublicMutation(req, body, {
      namespace: 'zalo-subscriber-write',
      maxRequests: 10,
      requireConsent: false,
      requireHumanSignal: true,
    });
    if (protectionError) return protectionError;

    const phone = cleanPhone(body.phone);
    const job = cleanText(body.job, 200);
    const city = cleanText(body.city, 120);
    if (!phone || !job || !city) {
      return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const trustedInput = parseTrustedSalaryInput({
      job_title: job,
      salary: body.salary,
      experience: body.experience,
      market_location: body.market_location,
      work_province: body.work_province,
    });
    if ('error' in trustedInput) {
      return NextResponse.json({ error: trustedInput.error }, { status: 400 });
    }

    const { supabaseServer } = await import('@/lib/supabaseServer');
    const resolved = await resolveTrustedSalaryBenchmark(supabaseServer, trustedInput, false);
    const { error } = await supabaseServer
      .from('zalo_subscribers')
      .insert({
        phone,
        job,
        city,
        percentile: resolved.percentileBucket,
      });

    if (error && isMissingZaloSubscribersTable(error)) {
      const fallback = await supabaseServer
        .from('scan_history')
        .insert({
          phone,
          job_title: job,
          salary: trustedInput.salary,
          percent: resolved.percentileBucket,
          experience: trustedInput.experience,
          market_location: trustedInput.marketLocation,
          work_province: trustedInput.workProvince,
        });
      if (fallback.error) throw fallback.error;
    } else if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('[zalo-subscribers] POST error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

function cleanPhone(value: unknown) {
  if (typeof value !== 'string') return '';
  const cleaned = value.replace(/[^0-9+]/g, '').slice(0, 20);
  return cleaned.length >= 8 ? cleaned : '';
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

function isMissingZaloSubscribersTable(error: { code?: string; message?: string }) {
  return error.code === 'PGRST205' || /zalo_subscribers|schema cache|relation/i.test(error.message || '');
}
