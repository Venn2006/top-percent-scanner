import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';
import { protectPublicMutation } from '@/lib/apiProtection';
import { getRoadmapAccessCode } from '@/lib/roadmapAccess';

function genVSPIId(): string {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = 'VSPI-2026-';
  for (let i = 0; i < 4; i++) s += c[Math.floor(Math.random() * c.length)];
  s += '-';
  for (let i = 0; i < 4; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const protectionError = protectPublicMutation(req, body, {
      namespace: 'roadmap-checkout',
      maxRequests: 5,
      requireConsent: true,
    });
    if (protectionError) return protectionError;

    const {
      phone,
      job_title,
      current_salary,
      target_salary,
      duration_months,
      goal_label,
      utm_source,
      utm_medium,
      utm_campaign,
      referrer,
    } = body;

    if (!job_title || !current_salary || !target_salary) {
      return NextResponse.json({ error: 'Missing params' }, { status: 400 });
    }

    const vspiId = genVSPIId();

    let { error } = await supabaseServer
      .from('roadmaps')
      .insert({
        vspi_id:         vspiId,
        phone:           phone || null,
        job_title:       String(job_title).slice(0, 200),
        current_salary:  Number(current_salary),
        target_salary:   Number(target_salary),
        duration_months: Number(duration_months) || 3,
        goal_label:      goal_label || null,
        utm_source:      cleanTrackingValue(utm_source),
        utm_medium:      cleanTrackingValue(utm_medium),
        utm_campaign:    cleanTrackingValue(utm_campaign),
        referrer:        cleanTrackingValue(referrer),
        status:          'pending',
      });

    if (error && /utm_|referrer|schema cache|column/i.test(error.message)) {
      const fallback = await supabaseServer
        .from('roadmaps')
        .insert({
          vspi_id:         vspiId,
          phone:           phone || null,
          job_title:       String(job_title).slice(0, 200),
          current_salary:  Number(current_salary),
          target_salary:   Number(target_salary),
          duration_months: Number(duration_months) || 3,
          goal_label:      goal_label || null,
          status:          'pending',
        });
      error = fallback.error;
    }

    if (error) {
      console.error('[roadmap/checkout]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, vspiId, accessCode: getRoadmapAccessCode(vspiId) });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[roadmap/checkout]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

function cleanTrackingValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().slice(0, 120);
  return cleaned || null;
}
