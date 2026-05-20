import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

export async function POST(req: Request) {
  try {
    // ── Xác thực webhook secret từ env, không hardcode ──────────────────────
    const webhookSecret = process.env.WEBHOOK_SECRET_KEY;
    if (!webhookSecret) {
      console.error('[webhook] WEBHOOK_SECRET_KEY is not configured');
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    const authHeader = req.headers.get('authorization') || '';
    if (!authHeader.includes(webhookSecret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Parse body ───────────────────────────────────────────────────────────
    const body = await req.json();

    // Chỉ xử lý giao dịch tiền vào
    if (body.transferType !== 'in') {
      return NextResponse.json({ message: 'ok' }, { status: 200 });
    }

    // ── Chuẩn hóa nội dung chuyển khoản ─────────────────────────────────────
    const cleanContent = (body.content || '')
      .replace(/[\s\-]/g, '')
      .toUpperCase();

    if (!cleanContent) {
      return NextResponse.json({ message: 'no content' }, { status: 200 });
    }

    // ── Trích xuất VSPI ID từ nội dung (format: VSPI2026XXXXXX) ──────────────
    // Thay vì fetch ALL pending records, dùng pattern matching trực tiếp trên DB.
    // VSPI ID format: VSPI-2026-XXXX-XXXX → sau khi clean: VSPI2026XXXXXXXX
    const vspiPattern = cleanContent.match(/VSPI2026[A-Z0-9]{4,8}/);
    if (!vspiPattern) {
      // Nội dung không chứa VSPI ID hợp lệ — bỏ qua
      return NextResponse.json({ message: 'no vspi id found' }, { status: 200 });
    }

    // Reconstruct ID dạng VSPI-2026-XXXX-XXXX để match với DB
    const rawId = vspiPattern[0]; // e.g. "VSPI2026ABCD1234"
    const reconstructed = `VSPI-2026-${rawId.slice(8, 12)}-${rawId.slice(12, 16)}`;

    // ── Query đúng 1 record thay vì fetch all ────────────────────────────────
    const { data: targetRecord, error: findError } = await supabaseServer
      .from('purchases')
      .select('id, vspi_id, status')
      .eq('vspi_id', reconstructed)
      .eq('status', 'pending')
      .maybeSingle();

    if (findError) {
      console.error('[webhook] DB find error:', findError.message);
      throw findError;
    }

    if (!targetRecord) {
      // Không tìm thấy record pending với ID này — có thể đã paid hoặc không tồn tại
      return NextResponse.json({ message: 'record not found or already processed' }, { status: 200 });
    }

    // ── Cập nhật trạng thái ──────────────────────────────────────────────────
    const { error: updateError } = await supabaseServer
      .from('purchases')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        payment_ref: body.referenceCode || body.id || null,
      })
      .eq('id', targetRecord.id)
      .eq('status', 'pending'); // Double-check để tránh race condition

    if (updateError) {
      console.error('[webhook] DB update error:', updateError.message);
      throw updateError;
    }

    console.log(`[webhook] Payment confirmed for VSPI ID: ${reconstructed}`);
    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[webhook] Unhandled error:', message);
    // Trả về 200 để dịch vụ banking không retry liên tục
    return NextResponse.json({ error: 'Internal error' }, { status: 200 });
  }
}
