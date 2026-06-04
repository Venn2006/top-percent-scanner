import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import {
  isPaymentAmountEnough,
  normalizePaymentCode,
  resolvePaymentTargetFromContent,
  summarizePaymentContentForLog,
  verifyPaymentWebhookAuth,
} from '@/lib/paymentWebhookSecurity';

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

function isWebhookAuthorized(req: Request, rawBody: string, webhookSecret: string): boolean {
  return verifyPaymentWebhookAuth({
    rawBody,
    webhookSecret,
    signature: req.headers.get('x-webhook-signature') || req.headers.get('x-sepay-signature'),
    authorization: req.headers.get('authorization'),
  });
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

export async function POST(req: Request) {
  try {
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

    const body = JSON.parse(rawBody);

    if (body.transferType !== 'in') {
      await recordPaymentEvent({ status: 'ignored', message: 'Ignored: not incoming' });
      return NextResponse.json({ success: true, message: 'Ignored: not incoming' }, { status: 200 });
    }

    const safeContent = normalizePaymentCode(body.content || '');
    const paymentRef = body.referenceCode || body.id || null;
    const amount = Number(body.transferAmount || body.amount || 0);

    if (!Number.isFinite(amount) || amount <= 0) {
      await recordPaymentEvent({
        status: 'amount_too_low',
        amount: null,
        paymentRef,
        content: safeContent,
        message: 'Invalid transfer amount',
      });
      return NextResponse.json({ success: true, message: 'Ignored: invalid amount' }, { status: 200 });
    }

    console.info('[webhook] Incoming transfer parsed:', {
      content: summarizePaymentContentForLog(safeContent),
      amount,
      reference: paymentRef ? 'present' : 'missing',
    });

    if (!safeContent) {
      await recordPaymentEvent({ status: 'ignored', amount, paymentRef, message: 'Ignored: empty content' });
      return NextResponse.json({ success: true, message: 'Ignored: empty content' }, { status: 200 });
    }

    if (paymentRef && await hasMatchedPaymentRef(String(paymentRef))) {
      await recordPaymentEvent({
        status: 'ignored',
        amount,
        paymentRef,
        content: safeContent,
        message: 'Duplicate payment_ref ignored',
      });
      return NextResponse.json({ success: true, message: 'Duplicate payment ignored' }, { status: 200 });
    }

    const { data: pendingPurchases, error: pErr } = await supabaseServer
      .from('purchases')
      .select('vspi_id, status, amount')
      .eq('status', 'pending');

    if (pErr) console.error('[webhook] Fetch purchases error:', pErr.message);

    const { data: pendingRoadmaps, error: rErr } = await supabaseServer
      .from('roadmaps')
      .select('vspi_id, status, amount')
      .eq('status', 'pending');

    if (rErr) console.error('[webhook] Fetch roadmaps error:', rErr.message);

    const targetResolution = resolvePaymentTargetFromContent({
      content: safeContent,
      pendingPurchases: pendingPurchases || [],
      pendingRoadmaps: pendingRoadmaps || [],
    });

    if (targetResolution.kind === 'ambiguous') {
      console.warn('[webhook] Ambiguous payment target:', {
        candidates: targetResolution.candidates,
        amount,
        reference: paymentRef ? 'present' : 'missing',
      });
      await recordPaymentEvent({
        status: 'no_match',
        amount,
        paymentRef,
        content: safeContent,
        message: targetResolution.message,
      });
      return NextResponse.json({ success: true, message: 'Ambiguous VSPI content; no unlock' }, { status: 200 });
    }

    if (targetResolution.kind === 'no_match') {
      console.warn('[webhook] No payment target matched:', {
        candidates: targetResolution.candidates,
        amount,
        reference: paymentRef ? 'present' : 'missing',
      });
      await recordPaymentEvent({
        status: 'no_match',
        amount,
        paymentRef,
        content: safeContent,
        message: targetResolution.message,
      });
      return NextResponse.json({ success: true, message: 'No match found' }, { status: 200 });
    }

    const target = targetResolution.target;

    if (!isPaymentAmountEnough(amount, target.expectedAmount)) {
      console.warn('[webhook] Matched target but amount too low:', {
        product: target.product,
        vspiId: target.vspiId,
        amount,
        expectedAmount: target.expectedAmount,
      });
      await recordPaymentEvent({
        status: 'amount_too_low',
        product: target.product,
        vspiId: target.vspiId,
        amount,
        paymentRef,
        content: safeContent,
        message: `Expected at least ${target.expectedAmount}`,
      });
      return NextResponse.json({ success: true, message: `Matched ${target.product} but amount too low`, vspiId: target.vspiId }, { status: 200 });
    }

    if (target.table === 'purchases') {
      const { error: uErr } = await supabaseServer
        .from('purchases')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
          payment_ref: paymentRef,
        })
        .eq('vspi_id', target.vspiId)
        .eq('status', 'pending')
        .select('vspi_id')
        .maybeSingle();

      if (uErr) {
        console.error('[webhook] UPDATE purchases error:', uErr);
        return NextResponse.json({ success: true, message: 'DB update error' }, { status: 200 });
      }

      console.log(`[webhook] Matched PURCHASE: ${target.vspiId}`);
      await recordPaymentEvent({
        status: 'matched',
        product: 'premium',
        vspiId: target.vspiId,
        amount,
        paymentRef,
        content: safeContent,
        message: 'Matched purchase',
      });
      return NextResponse.json({ success: true, message: 'Matched purchase', vspiId: target.vspiId }, { status: 200 });
    }

    let { error: uErr } = await supabaseServer
      .from('roadmaps')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        payment_ref: paymentRef,
      })
      .eq('vspi_id', target.vspiId)
      .eq('status', 'pending')
      .select('vspi_id')
      .maybeSingle();

    if (uErr && /payment_ref|schema cache|column/i.test(uErr.message)) {
      const fallback = await supabaseServer
        .from('roadmaps')
        .update({
          status: 'paid',
          paid_at: new Date().toISOString(),
        })
        .eq('vspi_id', target.vspiId)
        .eq('status', 'pending')
        .select('vspi_id')
        .maybeSingle();
      uErr = fallback.error;
    }

    if (uErr) {
      console.error('[webhook] UPDATE roadmaps error:', uErr);
      return NextResponse.json({ success: true, message: 'DB update error' }, { status: 200 });
    }

    console.log(`[webhook] Matched ROADMAP: ${target.vspiId}`);
    await recordPaymentEvent({
      status: 'matched',
      product: 'roadmap',
      vspiId: target.vspiId,
      amount,
      paymentRef,
      content: safeContent,
      message: 'Matched roadmap',
    });
    return NextResponse.json({ success: true, message: 'Matched roadmap', vspiId: target.vspiId }, { status: 200 });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[webhook] Error:', message);
    await recordPaymentEvent({ status: 'error', message });
    return NextResponse.json({ success: true, error: 'Internal error' }, { status: 200 });
  }
}
