import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { supabaseServer } from '@/lib/supabaseServer';

const PREMIUM_MIN_AMOUNT = 29_000;
const ROADMAP_MIN_AMOUNT = 79_000;
const WEBHOOK_MAX_BODY_BYTES = 64_000;

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

function safeTokenCompare(input: string, expected: string): boolean {
  const inputBuffer = Buffer.from(input);
  const expectedBuffer = Buffer.from(expected);
  if (inputBuffer.length !== expectedBuffer.length) {
    const paddedInput = Buffer.alloc(expectedBuffer.length);
    inputBuffer.copy(paddedInput, 0, 0, Math.min(inputBuffer.length, expectedBuffer.length));
    timingSafeEqual(paddedInput, expectedBuffer);
    return false;
  }
  return timingSafeEqual(inputBuffer, expectedBuffer);
}

function isWebhookAuthorized(req: Request, rawBody: string, webhookSecret: string): boolean {
  const signature = (req.headers.get('x-webhook-signature') || req.headers.get('x-sepay-signature') || '').trim();
  if (signature) {
    const expectedHex = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
    const cleanSignature = signature.replace(/^sha256=/i, '').trim().toLowerCase();
    return safeTokenCompare(cleanSignature, expectedHex);
  }

  const authHeader = (req.headers.get('authorization') || '').trim();
  const receivedToken = authHeader.replace(/^(Apikey|Bearer)\s+/i, '').trim();
  return Boolean(receivedToken) && safeTokenCompare(receivedToken, webhookSecret);
}

async function hasMatchedPaymentRef(paymentRef: string): Promise<boolean> {
  const { data, error } = await supabaseServer
    .from('payment_events')
    .select('id')
    .eq('payment_ref', paymentRef)
    .eq('status', 'matched')
    .limit(1);

  if (error) {
    if (!/payment_events|schema cache|relation/i.test(error.message)) {
      console.warn('[webhook] Could not check duplicate payment_ref:', error.message);
    }
    return false;
  }

  return Boolean(data?.length);
}

/**
 * Webhook SePay — match nội dung CK với cả 2 bảng:
 *   1. purchases  (gói 29k — báo cáo Premium)
 *   2. roadmaps   (gói 79k — Checklist AI tăng lương)
 *
 * Brute-force matching: lấy hết đơn pending, so khớp VSPI ID đã strip.
 */
export async function POST(req: Request) {
  try {
    // ── 1. Xác thực webhook secret ───────────────────────────────────────────
    const webhookSecret = process.env.WEBHOOK_SECRET_KEY;
    const rawBody = await req.text();

    if (rawBody.length > WEBHOOK_MAX_BODY_BYTES) {
      await recordPaymentEvent({ status: 'unauthorized', message: 'Body too large' });
      return NextResponse.json({ error: 'Payload too large' }, { status: 413 });
    }

    if ((!webhookSecret || webhookSecret.length < 32) && process.env.NODE_ENV === 'production') {
      console.error('[webhook] WEBHOOK_SECRET_KEY missing in production');
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
    }

    if (webhookSecret && !isWebhookAuthorized(req, rawBody, webhookSecret)) {
      console.error('[webhook] Auth failed');
      await recordPaymentEvent({ status: 'unauthorized', message: 'Auth failed' });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── 2. Parse body ────────────────────────────────────────────────────────
    const body = JSON.parse(rawBody);

    if (body.transferType !== 'in') {
      await recordPaymentEvent({ status: 'ignored', message: 'Ignored: not incoming' });
      return NextResponse.json({ success: true, message: 'Ignored: not incoming' }, { status: 200 });
    }

    const safeContent = (body.content || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const paymentRef  = body.referenceCode || body.id || null;
    const amount      = Number(body.transferAmount || body.amount || 0);

    if (!Number.isFinite(amount) || amount <= 0) {
      await recordPaymentEvent({ status: 'amount_too_low', amount: null, paymentRef, content: safeContent, message: 'Invalid transfer amount' });
      return NextResponse.json({ success: true, message: 'Ignored: invalid amount' }, { status: 200 });
    }

    console.info('[webhook] Incoming transfer parsed:', {
      hasContent: Boolean(safeContent),
      amount,
      reference: paymentRef ? 'present' : 'missing',
    });

    if (!safeContent) {
      await recordPaymentEvent({ status: 'ignored', amount, paymentRef, message: 'Ignored: empty content' });
      return NextResponse.json({ success: true, message: 'Ignored: empty content' }, { status: 200 });
    }

    if (paymentRef && await hasMatchedPaymentRef(String(paymentRef))) {
      await recordPaymentEvent({ status: 'ignored', amount, paymentRef, content: safeContent, message: 'Duplicate payment_ref ignored' });
      return NextResponse.json({ success: true, message: 'Duplicate payment ignored' }, { status: 200 });
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
          if (amount < expectedAmount) {
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
            .eq('vspi_id', p.vspi_id)
            .eq('status', 'pending')
            .select('vspi_id')
            .maybeSingle();

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
          if (amount < ROADMAP_MIN_AMOUNT) {
            console.warn(`[webhook] Matched ROADMAP ${r.vspi_id} but amount too low: ${amount}/${ROADMAP_MIN_AMOUNT}`);
            await recordPaymentEvent({ status: 'amount_too_low', product: 'roadmap', vspiId: r.vspi_id, amount, paymentRef, content: safeContent, message: `Expected at least ${ROADMAP_MIN_AMOUNT}` });
            return NextResponse.json({ success: true, message: 'Matched roadmap but amount too low', vspiId: r.vspi_id }, { status: 200 });
          }

          let { error: uErr } = await supabaseServer
            .from('roadmaps')
            .update({
              status:      'paid',
              paid_at:     new Date().toISOString(),
              payment_ref: paymentRef,
            })
            .eq('vspi_id', r.vspi_id)
            .eq('status', 'pending')
            .select('vspi_id')
            .maybeSingle();

          if (uErr && /payment_ref|schema cache|column/i.test(uErr.message)) {
            const fallback = await supabaseServer
              .from('roadmaps')
              .update({
                status:  'paid',
                paid_at: new Date().toISOString(),
              })
              .eq('vspi_id', r.vspi_id)
              .eq('status', 'pending')
              .select('vspi_id')
              .maybeSingle();
            uErr = fallback.error;
          }

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
