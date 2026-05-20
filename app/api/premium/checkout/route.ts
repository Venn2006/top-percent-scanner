import { NextRequest, NextResponse } from 'next/server';
import { checkSecurity } from '@/lib/security';
import { supabaseServer } from '@/lib/supabase';

// Regex đơn giản để validate VSPI ID format: VSPI-2026-XXXX-XXXX
const VSPI_ID_REGEX = /^VSPI-2026-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

export async function POST(req: NextRequest) {
  const securityError = checkSecurity(req, 10);
  if (securityError) return securityError;

  try {
    const body = await req.json();
    const { vspiId, phone, email, job_title, percent } = body;

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

    const { error } = await supabaseServer
      .from('purchases')
      .upsert({
        vspi_id:   vspiId,
        phone:     phone     || null,
        email:     email     || null,
        job_title: job_title.trim(),
        percent:   typeof percent === 'number' ? percent : null,
        amount:    29000,
        status:    'pending',
      }, { onConflict: 'vspi_id' });

    if (error) throw error;

    return NextResponse.json({ success: true });

  } catch (err: unknown) {
    console.error('[checkout] Error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
