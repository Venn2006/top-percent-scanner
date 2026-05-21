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

    // Chuẩn hóa nội dung: uppercase, giữ nguyên để so sánh cả 2 dạng
    const content = (body.content || '').toUpperCase();
    const paymentRef = body.referenceCode || body.id || null;

    console.log('[webhook] Content:', content);

    if (!content) {
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

    // ── 4. Brute-force matching ───────────────────────────────────────────────
    // So sánh 2 dạng:
    //   (a) Dạng gốc có dấu gạch ngang: "VSPI-2026-XCZZ-36PF"
    //   (b) Dạng đã xóa gạch ngang:     "VSPI2026XCZZ36PF"
    // Ngân hàng có thể gửi bất kỳ dạng nào trong content
    for (const purchase of pendingPurchases) {
      const originalId  = String(purchase.vspi_id).toUpperCase();
      const strippedId  = originalId.replace(/-/g, '');

      const matched = content.includes(strippedId) || content.includes(originalId);

      if (matched) {
        console.log(`[webhook] ✅ Match found: ${originalId} in content: ${content}`);

        // ── 5. Update thành 'paid' ────────────────────────────────────────────
        const { error: updateError } = await supabaseServer
          .from('purchases')
          .update({
            status:      'paid',
            paid_at:     new Date().toISOString(),
            payment_ref: paymentRef,
          })
          .eq('id', purchase.id)
          .eq('status', 'pending'); // guard chống race condition

        if (updateError) {
          console.error('[webhook] Update error:', updateError.message);
          return NextResponse.json({ success: true, message: 'DB update error, check logs' }, { status: 200 });
        }

        console.log(`[webhook] ✅ Updated to paid: ${originalId}`);
        return NextResponse.json({ success: true, message: 'Matched and Updated' }, { status: 200 });
      }
    }

    // ── 6. Không tìm thấy match ───────────────────────────────────────────────
    console.error('[webhook] NO MATCH FOUND for content:', content);
    return NextResponse.json({ success: true, message: 'Ignored: No match found' }, { status: 200 });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[webhook] Unhandled error:', message);
    // Luôn trả 200 để SePay không retry vô hạn
    return NextResponse.json({ success: true, error: 'Internal error' }, { status: 200 });
  }
}
