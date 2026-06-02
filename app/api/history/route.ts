import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { enforceOrigin, protectPublicMutation, rateLimit } from '@/lib/apiProtection';
import { parseTrustedSalaryInput, resolveTrustedSalaryBenchmark } from '@/lib/serverSalaryGuard';

const NO_CACHE_HEADERS = { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' };

// POST — lưu 1 lần quét vào history
export async function POST(req: NextRequest) {
  try {
    const {
      phone,
      job_title,
      salary,
      experience,
      market_location,
      work_province,
      utm_source,
      utm_medium,
      utm_campaign,
      referrer,
      is_custom_job,
      match_type,
      estimated_industry,
      estimated_top_50,
      estimated_top_20,
      estimated_top_10,
      estimated_top_5,
      estimated_skills,
    } = await req.json();
    const protectionError = protectPublicMutation(req, {
      phone, job_title, salary, experience, market_location, work_province,
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

    const trustedInput = parseTrustedSalaryInput({ job_title, salary, experience, market_location, work_province });
    if ('error' in trustedInput) {
      return NextResponse.json({ error: trustedInput.error }, { status: 400 });
    }
    const resolved = await resolveTrustedSalaryBenchmark(supabaseServer, trustedInput, false);

    const isCustomJob = is_custom_job === true;
    const hasDirectData = resolved.hasDirectData;
    const matchType = resolved.matchType || (typeof match_type === 'string' ? match_type : '');

    const payload = {
      phone:      phone || null,
      job_title:  trustedInput.jobTitle.slice(0, 200),
      salary:     trustedInput.salary,
      percent:    resolved.percentileBucket,
      experience: trustedInput.experience,
      market_location: trustedInput.marketLocation,
      work_province: trustedInput.workProvince,
      utm_source: cleanTrackingValue(utm_source),
      utm_medium: cleanTrackingValue(utm_medium),
      utm_campaign: cleanTrackingValue(utm_campaign),
      referrer: cleanTrackingValue(referrer),
    };

    const { error } = await supabaseServer.from('scan_history').insert(payload);
    if (error && /utm_|referrer|market_location|work_province|schema cache|column/i.test(error.message)) {
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

    if (isCustomJob || (!hasDirectData && ['national_fallback', 'industry_estimate', 'ai_estimate'].includes(matchType))) {
      await insertCustomJobSuggestion({
        job_title: payload.job_title,
        salary: payload.salary,
        percent: payload.percent,
        experience: payload.experience,
        market_location: payload.market_location,
        work_province: payload.work_province,
        match_type: matchType || (isCustomJob ? 'custom_input' : null),
        has_direct_data: hasDirectData,
        note: buildEstimateNote({
          estimated_industry: resolved.industry ?? estimated_industry,
          estimated_top_50: resolved.fullDbData.top_50 ?? estimated_top_50,
          estimated_top_20: resolved.fullDbData.top_20 ?? estimated_top_20,
          estimated_top_10: resolved.fullDbData.top_10 ?? estimated_top_10,
          estimated_top_5: resolved.fullDbData.top_5 ?? estimated_top_5,
          estimated_skills,
        }),
      });
    }

    return NextResponse.json({ success: true, queuedForReview: isCustomJob || (!hasDirectData && ['national_fallback', 'industry_estimate', 'ai_estimate'].includes(matchType)) });
  } catch (err: unknown) {
    console.error('[history] POST error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

async function insertCustomJobSuggestion(payload: {
  job_title: string;
  salary: number;
  percent: number;
  experience: unknown;
  market_location: string;
  work_province: string;
  match_type: string | null;
  has_direct_data: boolean;
  note?: string | null;
}) {
  const { error } = await supabaseServer
    .from('custom_job_suggestions')
    .insert({
      job_title: payload.job_title,
      salary: payload.salary,
      percent: payload.percent,
      experience: typeof payload.experience === 'string' ? payload.experience : null,
      market_location: payload.market_location,
      work_province: payload.work_province,
      match_type: payload.match_type,
      has_direct_data: payload.has_direct_data,
      status: 'pending',
      note: payload.note,
    });

  if (error && !/custom_job_suggestions|schema cache|relation/i.test(error.message)) {
    console.warn('[history] custom job suggestion insert failed:', error.message);
  }
}

function buildEstimateNote(input: Record<string, unknown>) {
  const skills = Array.isArray(input.estimated_skills)
    ? input.estimated_skills.filter(item => typeof item === 'string').slice(0, 4)
    : [];
  const note = {
    industry: typeof input.estimated_industry === 'string' ? input.estimated_industry.slice(0, 120) : null,
    top_50: Number(input.estimated_top_50) || null,
    top_20: Number(input.estimated_top_20) || null,
    top_10: Number(input.estimated_top_10) || null,
    top_5: Number(input.estimated_top_5) || null,
    skills,
  };
  if (!note.industry && !note.top_50 && !skills.length) return null;
  return JSON.stringify(note).slice(0, 900);
}

function cleanTrackingValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().slice(0, 120);
  return cleaned || null;
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

    return NextResponse.json({ history: history || [] }, { headers: NO_CACHE_HEADERS });
  } catch (err: unknown) {
    console.error('[history] GET error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
