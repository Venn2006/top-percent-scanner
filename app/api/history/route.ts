import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

// POST — lưu 1 lần quét vào history
export async function POST(req: NextRequest) {
  try {
    const { phone, job_title, salary, percent, experience } = await req.json();
    if (!job_title || !salary || !percent) {
      return NextResponse.json({ error: 'Missing params' }, { status: 400 });
    }

    await supabaseServer.from('scan_history').insert({
      phone:      phone || null,
      job_title:  String(job_title).slice(0, 200),
      salary:     Number(salary),
      percent:    Number(percent),
      experience: experience || null,
    });

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('[history] POST error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// GET — lấy lịch sử theo SĐT
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const phone = searchParams.get('phone');

    if (!phone || !/^0[0-9]{9}$/.test(phone)) {
      return NextResponse.json({ error: 'Invalid phone' }, { status: 400 });
    }

    const { data, error } = await supabaseServer
      .from('scan_history')
      .select('job_title, salary, percent, experience, scanned_at')
      .eq('phone', phone)
      .order('scanned_at', { ascending: false })
      .limit(20);

    if (error) throw error;

    return NextResponse.json({ history: data || [] });
  } catch (err: unknown) {
    console.error('[history] GET error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
