import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

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

    console.log('[webhook] Auth header:', authHeader.slice(0, 40));
    console.log('[webhook] Secret configured:', webhookSecret ? 'YES' : 'NO - MISSING ENV VAR');

    if (webhookSecret && receivedToken !== webhookSecret) {
      console.error('[webhook] Auth failed');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── 2. Parse body ────────────────────────────────────────────────────────
    const body = await req.json();
    console.log('[webhook] Body:', JSON.stringify(body));

    if (body.transferType !== 'in') {
      return NextResponse.json({ success: true, message: 'Ignored: not incoming' }, { status: 200 });
    }

    const safeContent = (body.content || '').toUpperCase().replace(/\s+/g, '');
    const paymentRef  = body.referenceCode || body.id || null;
    const amount      = Number(body.transferAmount || body.amount || 0);

    console.log('[webhook] safeContent:', safeContent, '| amount:', amount);

    if (!safeContent) {
      return NextResponse.json({ success: true, message: 'Ignored: empty content' }, { status: 200 });
    }

    // ── 3. Helper: strip VSPI ID để so khớp ──────────────────────────────────
    const strip = (id: string) =>
      id.toUpperCase().replace(/-/g, '').replace(/\s+/g, '');

    // ── 4. Match bảng PURCHASES (gói 29k) ────────────────────────────────────
    const { data: pendingPurchases, error: pErr } = await supabaseServer
      .from('purchases')
      .select('vspi_id, status')
      .eq('status', 'pending');

    if (pErr) console.error('[webhook] Fetch purchases error:', pErr.message);

    if (pendingPurchases?.length) {
      for (const p of pendingPurchases) {
        if (safeContent.includes(strip(p.vspi_id))) {
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
          return NextResponse.json({ success: true, message: 'Matched roadmap', vspiId: r.vspi_id }, { status: 200 });
        }
      }
    }

    // ── 6. Không match đơn nào ──────────────────────────────────────────────
    console.error('[webhook] NO MATCH for content:', safeContent);
    return NextResponse.json({ success: true, message: 'No match found' }, { status: 200 });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[webhook] Error:', message);
    return NextResponse.json({ success: true, error: 'Internal error' }, { status: 200 });
  }
}
