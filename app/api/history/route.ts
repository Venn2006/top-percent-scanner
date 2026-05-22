import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { normalizeMarketLocation } from '@/lib/locationBenchmark';
import { normalizeWorkProvince } from '@/lib/workProvinces';
import { enforceOrigin, protectPublicMutation, rateLimit } from '@/lib/apiProtection';

// POST — lưu 1 lần quét vào history
export async function POST(req: NextRequest) {
  try {
    const { phone, job_title, salary, percent, experience, market_location, work_province } = await req.json();
    const protectionError = protectPublicMutation(req, {
      phone, job_title, salary, percent, experience, market_location, work_province,
      formStartedAt: Date.now() - 2_000,
      website: '',
      privacyConsent: true,
    }, {
      namespace: 'scan-history-write',
      maxRequests: 20,
      requireConsent: true,
      requireHumanSignal: false,
    });
    if (protectionError) return protectionError;

    if (!job_title || !salary || !percent) {
      return NextResponse.json({ error: 'Missing params' }, { status: 400 });
    }

    const payload = {
      phone:      phone || null,
      job_title:  String(job_title).slice(0, 200),
      salary:     Number(salary),
      percent:    Number(percent),
      experience: experience || null,
      market_location: normalizeMarketLocation(market_location),
      work_province: normalizeWorkProvince(work_province),
    };

    const { error } = await supabaseServer.from('scan_history').insert(payload);
    if (error && /market_location|work_province|schema cache|column/i.test(error.message)) {
      const fallback = await supabaseServer.from('scan_history').insert({
        phone: payload.phone,
        job_title: payload.job_title,
        salary: payload.salary,
        percent: payload.percent,
        experience: payload.experience,
      });
      if (fallback.error) throw fallback.error;
    } else if (error) {
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('[history] POST error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// GET — lấy lịch sử theo SĐT
export async function GET(req: NextRequest) {
  try {
    const originError = enforceOrigin(req);
    if (originError) return originError;
    const limitError = rateLimit(req, 'scan-history-read', 10);
    if (limitError) return limitError;

    const { searchParams } = new URL(req.url);
    const phone = searchParams.get('phone');

    if (!phone || !/^0[0-9]{9}$/.test(phone)) {
      return NextResponse.json({ error: 'Invalid phone' }, { status: 400 });
    }

    const query = await supabaseServer
      .from('scan_history')
      .select('job_title, salary, percent, experience, market_location, work_province, scanned_at')
      .eq('phone', phone)
      .order('scanned_at', { ascending: false })
      .limit(20);
    let history = query.data as unknown[] | null;
    let error = query.error;

    if (error && /market_location|work_province|schema cache|column/i.test(error.message)) {
      const fallback = await supabaseServer
        .from('scan_history')
        .select('job_title, salary, percent, experience, scanned_at')
        .eq('phone', phone)
        .order('scanned_at', { ascending: false })
        .limit(20);
      history = fallback.data as unknown[] | null;
      error = fallback.error;
    }

    if (error) throw error;

    return NextResponse.json({ history: history || [] });
  } catch (err: unknown) {
    console.error('[history] GET error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
