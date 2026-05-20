import { NextRequest, NextResponse } from 'next/server';

// ── In-memory rate limit map ─────────────────────────────────────────────────
// Lưu ý: map này là per-instance (serverless). Trên Vercel production có thể có
// nhiều instance song song → rate limit không hoàn toàn chính xác, nhưng vẫn
// là lớp bảo vệ hữu ích chống brute force từ 1 IP trên cùng 1 instance.
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

// Cleanup entries hết hạn mỗi 10 phút để tránh memory leak trong dev mode
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, val] of rateLimitMap.entries()) {
      if (val.resetTime < now) rateLimitMap.delete(key);
    }
  }, 10 * 60 * 1000);
}

const ALLOWED_DOMAINS = [
  'localhost:3000',
  'localhost:3001',
  '192.168.',
  'top-percent-scanner.vercel.app',
];

export function checkSecurity(req: NextRequest, maxRequests = 30): NextResponse | null {
  // ── 1. Origin / Referer check (chống embedding và casual scraping) ──────────
  // Lưu ý: Referer/Origin có thể bị spoof bởi attacker có kỹ năng,
  // nhưng chặn được phần lớn bot và clone site đơn giản.
  const referer = req.headers.get('referer') || '';
  const origin  = req.headers.get('origin')  || '';

  const isAllowedOrigin = ALLOWED_DOMAINS.some(
    d => referer.includes(d) || origin.includes(d)
  );

  if (!isAllowedOrigin && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ── 2. IP-based rate limiting ────────────────────────────────────────────────
  // Lấy IP thực từ header của Vercel/proxy
  const rawIp =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown';

  const now = Date.now();
  let record = rateLimitMap.get(rawIp);

  if (!record || record.resetTime < now) {
    record = { count: 0, resetTime: now + 60_000 }; // window 1 phút
  }

  record.count += 1;
  rateLimitMap.set(rawIp, record);

  if (record.count > maxRequests) {
    return NextResponse.json(
      { error: 'Too Many Requests' },
      {
        status: 429,
        headers: {
          'Retry-After': '60',
          'X-RateLimit-Limit': String(maxRequests),
          'X-RateLimit-Remaining': '0',
        },
      }
    );
  }

  return null; // passed
}
