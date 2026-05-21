/**
 * API thủ công để confirm thanh toán khi webhook bị lỗi.
 * Chỉ dùng nội bộ — bảo vệ bằng ADMIN_SECRET_KEY.
 *
 * POST /api/admin/manual-confirm
 * Body: { vspiId: "VSPI-2026-XXXX-XXXX", adminKey: "..." }
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { vspiId, adminKey } = body;

    // Dùng WEBHOOK_SECRET_KEY làm admin key luôn cho đơn giản
    const secret = process.env.WEBHOOK_SECRET_KEY;
    if (!secret || adminKey !== secret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!vspiId) {
      return NextResponse.json({ error: 'Missing vspiId' }, { status: 400 });
    }

    // Tìm record
    const { data: record, error: findErr } = await supabaseServer
      .from('purchases')
      .select('id, vspi_id, status')
      .eq('vspi_id', vspiId)
      .maybeSingle();

    if (findErr) throw findErr;
    if (!record) {
      return NextResponse.json({ error: `No record found for ${vspiId}` }, { status: 404 });
    }

    if (record.status === 'paid') {
      return NextResponse.json({ message: 'Already paid', vspiId }, { status: 200 });
    }

    // Update
    const { error: updateErr } = await supabaseServer
      .from('purchases')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', record.id);

    if (updateErr) throw updateErr;

    console.log(`[admin] Manual confirm for ${vspiId}`);
    return NextResponse.json({ success: true, vspiId, previousStatus: record.status });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown';
    console.error('[admin/manual-confirm]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
