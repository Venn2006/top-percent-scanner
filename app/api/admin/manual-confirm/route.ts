/**
 * API thủ công để confirm thanh toán khi webhook bị lỗi.
 * Chỉ dùng nội bộ — bảo vệ bằng WEBHOOK_SECRET_KEY + rate limit chống brute force.
 *
 * POST /api/admin/manual-confirm
 * Body: { vspiId: "VSPI-2026-XXXX-XXXX", adminKey: "..." }
 *
 * Hỗ trợ cả 2 bảng: purchases (29k) và roadmaps (79k).
 */
import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

// ── In-memory rate limit (per-instance) ────────────────────────────────────
// Mỗi IP chỉ được thử tối đa 5 lần / 10 phút → chống brute force secret.
const adminRateLimit = new Map<string, { count: number; resetTime: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS    = 10 * 60 * 1000; // 10 phút

if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of adminRateLimit.entries()) {
      if (v.resetTime < now) adminRateLimit.delete(k);
    }
  }, 5 * 60 * 1000);
}

function getIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

export async function POST(req: NextRequest) {
  try {
    // ── 1. Rate limit theo IP ────────────────────────────────────────────────
    const ip = getIp(req);
    const now = Date.now();
    let rec = adminRateLimit.get(ip);
    if (!rec || rec.resetTime < now) rec = { count: 0, resetTime: now + WINDOW_MS };
    rec.count += 1;
    adminRateLimit.set(ip, rec);

    if (rec.count > MAX_ATTEMPTS) {
      console.warn(`[admin/manual-confirm] Rate limit hit for IP ${ip}`);
      return NextResponse.json(
        { error: 'Too Many Requests' },
        {
          status: 429,
          headers: {
            'Retry-After': String(Math.ceil((rec.resetTime - now) / 1000)),
            'X-RateLimit-Limit': String(MAX_ATTEMPTS),
            'X-RateLimit-Remaining': '0',
          },
        }
      );
    }

    // ── 2. Parse body ────────────────────────────────────────────────────────
    const body = await req.json().catch(() => ({}));
    const { vspiId, adminKey } = body as { vspiId?: string; adminKey?: string };

    // ── 3. Auth bằng WEBHOOK_SECRET_KEY ──────────────────────────────────────
    const secret = process.env.WEBHOOK_SECRET_KEY;
    if (!secret || !adminKey || adminKey !== secret) {
      // Để chống timing attack, response giống nhau cho mọi case fail.
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!vspiId || typeof vspiId !== 'string') {
      return NextResponse.json({ error: 'Missing vspiId' }, { status: 400 });
    }

    // ── 4. Tìm trong bảng purchases trước ────────────────────────────────────
    const { data: purchase, error: pFindErr } = await supabaseServer
      .from('purchases')
      .select('id, vspi_id, status')
      .eq('vspi_id', vspiId)
      .maybeSingle();

    if (pFindErr) throw pFindErr;

    if (purchase) {
      if (purchase.status === 'paid') {
        return NextResponse.json({ message: 'Already paid', vspiId, table: 'purchases' });
      }
      const { error: uErr } = await supabaseServer
        .from('purchases')
        .update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', purchase.id);
      if (uErr) throw uErr;

      console.log(`[admin] Manual confirm PURCHASE ${vspiId} from IP ${ip}`);
      return NextResponse.json({
        success: true, vspiId, previousStatus: purchase.status, table: 'purchases',
      });
    }

    // ── 5. Không thấy trong purchases → check bảng roadmaps (79k) ────────────
    const { data: roadmap, error: rFindErr } = await supabaseServer
      .from('roadmaps')
      .select('id, vspi_id, status')
      .eq('vspi_id', vspiId)
      .maybeSingle();

    if (rFindErr) throw rFindErr;

    if (!roadmap) {
      return NextResponse.json({ error: `No record found for ${vspiId}` }, { status: 404 });
    }

    if (roadmap.status === 'paid') {
      return NextResponse.json({ message: 'Already paid', vspiId, table: 'roadmaps' });
    }

    const { error: uErr2 } = await supabaseServer
      .from('roadmaps')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('id', roadmap.id);
    if (uErr2) throw uErr2;

    console.log(`[admin] Manual confirm ROADMAP ${vspiId} from IP ${ip}`);
    return NextResponse.json({
      success: true, vspiId, previousStatus: roadmap.status, table: 'roadmaps',
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown';
    console.error('[admin/manual-confirm]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
