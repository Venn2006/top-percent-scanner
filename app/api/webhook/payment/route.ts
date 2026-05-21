import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

export async function POST(req: Request) {
  try {
    // ── 1. Xác thực webhook secret ───────────────────────────────────────────
    const webhookSecret = process.env.WEBHOOK_SECRET_KEY;
    if (!webhookSecret) {
      console.error('[webhook] WEBHOOK_SECRET_KEY not configured');
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    const authHeader    = (req.headers.get('authorization') || '').trim();
    const receivedToken = authHeader.replace(/^(Apikey|Bearer)\s+/i, '').trim();

    if (receivedToken !== webhookSecret) {
      console.error('[webhook] Auth failed | header:', authHeader.slice(0, 30));
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── 2. Parse body ────────────────────────────────────────────────────────
    const body = await req.json();
    console.log('[webhook] Body:', JSON.stringify(body));

    // Chỉ xử lý giao dịch tiền vào
    if (body.transferType !== 'in') {
      return NextResponse.json({ success: true, message: 'Ignored: not incoming' }, { status: 200 });
    }

    // Chuẩn hóa tuyệt đối: uppercase + xóa sạch mọi khoảng trắng
    const safeContent = (body.content || '').toUpperCase().replace(/\s+/g, '');
    const paymentRef  = body.referenceCode || body.id || null;

    console.log('[webhook] safeContent:', safeContent);

    if (!safeContent) {
      return NextResponse.json({ success: true, message: 'Ignored: empty content' }, { status: 200 });
    }

    // ── 3. Lấy toàn bộ đơn đang chờ (supabaseServer bypass RLS) ─────────────
    const { data: pendingPurchases, error: fetchError } = await supabaseServer
      .from('purchases')
      .select('*')
      .eq('status', 'pending');

    if (fetchError) {
      console.error('[webhook] Fetch pending error:', fetchError.message);
      // Trả 200 để SePay không retry spam
      return NextResponse.json({ success: true, message: 'DB error, check logs' }, { status: 200 });
    }

    if (!pendingPurchases || pendingPurchases.length === 0) {
      console.log('[webhook] No pending purchases found');
      return NextResponse.json({ success: true, message: 'Ignored: no pending orders' }, { status: 200 });
    }

    // ── 4. Absolute brute-force matching ─────────────────────────────────────
    // safeContent và strippedDbId đều đã uppercase + xóa khoảng trắng
    // → không bị miss do chữ thường hay khoảng trắng ẩn
    for (const purchase of pendingPurchases) {
      // Chuẩn hóa ID từ DB: uppercase, xóa dấu gạch ngang và khoảng trắng
      const strippedDbId = purchase.vspi_id
        .toUpperCase()
        .replace(/-/g, '')
        .replace(/\s+/g, '');

      console.log(`[webhook] Comparing safeContent with strippedDbId: ${strippedDbId}`);

      if (safeContent.includes(strippedDbId)) {
        console.log(`[webhook] ✅ Match found: ${purchase.vspi_id}`);

        // ── 5. Update thành 'paid' ────────────────────────────────────────────
        const { error: updateError } = await supabaseServer
          .from('purchases')
          .update({
            status:      'paid',
            paid_at:     new Date().toISOString(),
            payment_ref: paymentRef,
          })
          .eq('vspi_id', purchase.vspi_id);

        if (updateError) {
          console.error('LỖI UPDATE DB:', updateError);
          return NextResponse.json({ success: true, message: 'DB update error, check logs' }, { status: 200 });
        }

        console.log('UPDATE THÀNH CÔNG CHO ID:', purchase.vspi_id);
        return NextResponse.json({ success: true, message: 'Matched and Updated' }, { status: 200 });
      }
    }

    // ── 6. Không tìm thấy match ───────────────────────────────────────────────
    console.error('Webhook received but NO MATCH FOUND for content:', safeContent);
    return NextResponse.json({ success: true, message: 'Ignored: No match found' }, { status: 200 });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[webhook] Unhandled error:', message);
    // Luôn trả 200 để SePay không retry vô hạn
    return NextResponse.json({ success: true, error: 'Internal error' }, { status: 200 });
  }
}
