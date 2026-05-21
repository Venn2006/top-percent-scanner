import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

// checkSecurity đã bỏ — tương tự verify route.
// Route này chỉ INSERT 1 bản ghi với VSPI ID do client sinh ra,
// không đọc dữ liệu nhạy cảm. supabaseServer (service role) bypass RLS.

const VSPI_ID_REGEX = /^VSPI-2026-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { vspiId, phone, email, job_title, percent, experience } = body;

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

    const validExperience = ['junior', 'mid', 'senior'];
    const expValue = typeof experience === 'string' && validExperience.includes(experience)
      ? experience : null;

    // ── Ghi vào DB bằng supabaseServer (service role, bypass RLS) ────────────
    const { error } = await supabaseServer
      .from('purchases')
      .upsert(
        {
          vspi_id:    vspiId,
          phone:      phone     || null,
          email:      email     || null,
          job_title:  job_title.trim(),
          percent:    typeof percent === 'number' ? percent : null,
          experience: expValue,
          amount:     29000,
          status:     'pending',
        },
        { onConflict: 'vspi_id' }
      );

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
