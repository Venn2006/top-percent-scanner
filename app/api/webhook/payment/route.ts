import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

const PREMIUM_MIN_AMOUNT = 29_000;
const ROADMAP_MIN_AMOUNT = 79_000;

async function recordPaymentEvent(event: {
  status: 'matched' | 'ignored' | 'amount_too_low' | 'no_match' | 'error' | 'unauthorized';
  product?: 'premium' | 'roadmap' | null;
  vspiId?: string | null;
  amount?: number | null;
  paymentRef?: string | null;
  content?: string | null;
  message?: string | null;
}) {
  const { error } = await supabaseServer
    .from('payment_events')
    .insert({
      status: event.status,
      product: event.product ?? null,
      vspi_id: event.vspiId ?? null,
      amount: event.amount ?? null,
      payment_ref: event.paymentRef ?? null,
      content: event.content ? event.content.slice(0, 500) : null,
      message: event.message ? event.message.slice(0, 500) : null,
    });
  if (error && !/payment_events|schema cache|relation/i.test(error.message)) {
    console.warn('[webhook] Could not record payment event:', error.message);
  }
}

/**
 * Webhook SePay — match nội dung CK với cả 2 bảng:
 *   1. purchases  (gói 29k — báo cáo Premium)
 *   2. roadmaps   (gói 79k — Lộ trình AI)
 *
 * Brute-force matching: lấy hết đơn pending, so khớp VSPI ID đã strip.
 */
export async function POST(req: Request) {
  try {
    // ── 1. Xác thực webhook secret ───────────────────────────────────────────
    const webhookSecret = process.env.WEBHOOK_SECRET_KEY;
    const authHeader    = (req.headers.get('authorization') || '').trim();
    const receivedToken = authHeader.replace(/^(Apikey|Bearer)\s+/i, '').trim();

    if (!webhookSecret && process.env.NODE_ENV === 'production') {
      console.error('[webhook] WEBHOOK_SECRET_KEY missing in production');
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
    }

    if (webhookSecret && receivedToken !== webhookSecret) {
      console.error('[webhook] Auth failed');
      await recordPaymentEvent({ status: 'unauthorized', message: 'Auth failed' });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── 2. Parse body ────────────────────────────────────────────────────────
    const body = await req.json();

    if (body.transferType !== 'in') {
      await recordPaymentEvent({ status: 'ignored', message: 'Ignored: not incoming' });
      return NextResponse.json({ success: true, message: 'Ignored: not incoming' }, { status: 200 });
    }

    const safeContent = (body.content || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const paymentRef  = body.referenceCode || body.id || null;
    const amount      = Number(body.transferAmount || body.amount || 0);

    console.info('[webhook] Incoming transfer parsed:', {
      hasContent: Boolean(safeContent),
      amount,
      reference: paymentRef ? 'present' : 'missing',
    });

    if (!safeContent) {
      await recordPaymentEvent({ status: 'ignored', amount, paymentRef, message: 'Ignored: empty content' });
      return NextResponse.json({ success: true, message: 'Ignored: empty content' }, { status: 200 });
    }

    // ── 3. Helper: strip VSPI ID để so khớp ──────────────────────────────────
    const strip = (id: string) =>
      id.toUpperCase().replace(/[^A-Z0-9]/g, '');

    // ── 4. Match bảng PURCHASES (gói 29k) ────────────────────────────────────
    const { data: pendingPurchases, error: pErr } = await supabaseServer
      .from('purchases')
      .select('vspi_id, status, amount')
      .eq('status', 'pending');

    if (pErr) console.error('[webhook] Fetch purchases error:', pErr.message);

    if (pendingPurchases?.length) {
      for (const p of pendingPurchases) {
        if (safeContent.includes(strip(p.vspi_id))) {
          const expectedAmount = Number(p.amount || PREMIUM_MIN_AMOUNT);
          if (amount > 0 && amount < expectedAmount) {
            console.warn(`[webhook] Matched PURCHASE ${p.vspi_id} but amount too low: ${amount}/${expectedAmount}`);
            await recordPaymentEvent({ status: 'amount_too_low', product: 'premium', vspiId: p.vspi_id, amount, paymentRef, content: safeContent, message: `Expected at least ${expectedAmount}` });
            return NextResponse.json({ success: true, message: 'Matched purchase but amount too low', vspiId: p.vspi_id }, { status: 200 });
          }

          const { error: uErr } = await supabaseServer
            .from('purchases')
            .update({
              status:      'paid',
              paid_at:     new Date().toISOString(),
              payment_ref: paymentRef,
            })
            .eq('vspi_id', p.vspi_id);

          if (uErr) {
            console.error('[webhook] UPDATE purchases error:', uErr);
            return NextResponse.json({ success: true, message: 'DB update error' }, { status: 200 });
          }

          console.log(`[webhook] ✅ Matched PURCHASE: ${p.vspi_id}`);
          await recordPaymentEvent({ status: 'matched', product: 'premium', vspiId: p.vspi_id, amount, paymentRef, content: safeContent, message: 'Matched purchase' });
          return NextResponse.json({ success: true, message: 'Matched purchase', vspiId: p.vspi_id }, { status: 200 });
        }
      }
    }

    // ── 5. Match bảng ROADMAPS (gói 79k) ─────────────────────────────────────
    const { data: pendingRoadmaps, error: rErr } = await supabaseServer
      .from('roadmaps')
      .select('vspi_id, status')
      .eq('status', 'pending');

    if (rErr) console.error('[webhook] Fetch roadmaps error:', rErr.message);

    if (pendingRoadmaps?.length) {
      for (const r of pendingRoadmaps) {
        if (safeContent.includes(strip(r.vspi_id))) {
          if (amount > 0 && amount < ROADMAP_MIN_AMOUNT) {
            console.warn(`[webhook] Matched ROADMAP ${r.vspi_id} but amount too low: ${amount}/${ROADMAP_MIN_AMOUNT}`);
            await recordPaymentEvent({ status: 'amount_too_low', product: 'roadmap', vspiId: r.vspi_id, amount, paymentRef, content: safeContent, message: `Expected at least ${ROADMAP_MIN_AMOUNT}` });
            return NextResponse.json({ success: true, message: 'Matched roadmap but amount too low', vspiId: r.vspi_id }, { status: 200 });
          }

          const { error: uErr } = await supabaseServer
            .from('roadmaps')
            .update({
              status:  'paid',
              paid_at: new Date().toISOString(),
            })
            .eq('vspi_id', r.vspi_id);

          if (uErr) {
            console.error('[webhook] UPDATE roadmaps error:', uErr);
            return NextResponse.json({ success: true, message: 'DB update error' }, { status: 200 });
          }

          console.log(`[webhook] ✅ Matched ROADMAP: ${r.vspi_id}`);
          await recordPaymentEvent({ status: 'matched', product: 'roadmap', vspiId: r.vspi_id, amount, paymentRef, content: safeContent, message: 'Matched roadmap' });
          return NextResponse.json({ success: true, message: 'Matched roadmap', vspiId: r.vspi_id }, { status: 200 });
        }
      }
    }

    // ── 6. Không match đơn nào ──────────────────────────────────────────────
    console.error('[webhook] NO MATCH for content:', safeContent);
    await recordPaymentEvent({ status: 'no_match', amount, paymentRef, content: safeContent, message: 'No pending order matched' });
    return NextResponse.json({ success: true, message: 'No match found' }, { status: 200 });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[webhook] Error:', message);
    await recordPaymentEvent({ status: 'error', message });
    return NextResponse.json({ success: true, error: 'Internal error' }, { status: 200 });
  }
}
