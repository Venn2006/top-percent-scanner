import { NextRequest, NextResponse } from 'next/server';

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

export function checkSecurity(req: NextRequest, maxRequests: number = 30) {
  // 1. Check Referer/Origin (Anti-Clone)
  const referer = req.headers.get('referer') || '';
  const origin = req.headers.get('origin') || '';
  const allowedDomains = ['localhost:3000', 'localhost:3001', '192.168.', 'top-percent-scanner.vercel.app'];
  
  // Basic validation to prevent arbitrary POSTman/curl calls.
  // Note: Referer can be spoofed, but it blocks basic embedding and casual scraping.
  const isAllowed = allowedDomains.some(d => referer.includes(d) || origin.includes(d));
  
  if (!isAllowed && process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Forbidden. Invalid origin.' }, { status: 403 });
  }

  // 2. Basic IP Rate Limiting (In-memory - ephemeral but adds a layer of protection)
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
  const now = Date.now();
  
  let record = rateLimitMap.get(ip);
  if (!record || record.resetTime < now) {
    record = { count: 0, resetTime: now + 60000 }; // 1 minute window
  }
  
  record.count += 1;
  rateLimitMap.set(ip, record);

  if (record.count > maxRequests) {
    return NextResponse.json({ error: 'Too Many Requests' }, { status: 429 });
  }

  return null; // Passed
}
