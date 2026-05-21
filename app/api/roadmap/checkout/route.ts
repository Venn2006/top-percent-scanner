import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

const VSPI_ID_REGEX = /^VSPI-2026-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

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
    const { phone, job_title, current_salary, target_salary, duration_months, goal_label } = await req.json();

    if (!job_title || !current_salary || !target_salary) {
      return NextResponse.json({ error: 'Missing params' }, { status: 400 });
    }

    const vspiId = genVSPIId();

    const { error } = await supabaseServer
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

    if (error) {
      console.error('[roadmap/checkout]', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, vspiId });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[roadmap/checkout]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
