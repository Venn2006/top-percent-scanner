import { NextRequest, NextResponse } from 'next/server';
import { protectPublicMutation } from '@/lib/apiProtection';
import { supabaseServer } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const protectionError = protectPublicMutation(req, body, {
      namespace: 'privacy-delete-request',
      maxRequests: 4,
      requireConsent: false,
    });
    if (protectionError) return protectionError;

    const phone = typeof body.phone === 'string' ? body.phone.replace(/\D/g, '') : '';
    const vspiId = typeof body.vspiId === 'string' ? body.vspiId.trim().toUpperCase() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : '';

    if (!phone && !vspiId && !email) {
      return NextResponse.json({ error: 'Cần ít nhất SĐT, VSPI ID hoặc email' }, { status: 400 });
    }
    if (phone && !/^0[0-9]{9}$/.test(phone)) {
      return NextResponse.json({ error: 'SĐT không hợp lệ' }, { status: 400 });
    }
    if (vspiId && !/^VSPI-2026-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(vspiId)) {
      return NextResponse.json({ error: 'VSPI ID không hợp lệ' }, { status: 400 });
    }
    if (email && (email.length > 254 || !email.includes('@'))) {
      return NextResponse.json({ error: 'Email không hợp lệ' }, { status: 400 });
    }

    const { error } = await supabaseServer
      .from('data_deletion_requests')
      .insert({
        phone: phone || null,
        vspi_id: vspiId || null,
        email: email || null,
        note: note || null,
        status: 'pending',
      });

    if (error && /data_deletion_requests|schema cache|relation/i.test(error.message)) {
      return NextResponse.json({ error: 'Data request table is not ready. Please run the latest Supabase migration.' }, { status: 500 });
    }
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    console.error('[privacy/delete-request]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
