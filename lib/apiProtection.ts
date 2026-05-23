import { NextRequest, NextResponse } from 'next/server';

type LimitRecord = { count: number; resetTime: number };

const rateBuckets = new Map<string, LimitRecord>();

if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of rateBuckets.entries()) {
      if (value.resetTime < now) rateBuckets.delete(key);
    }
  }, 10 * 60 * 1000);
}

const ALLOWED_DOMAINS = [
  'localhost:3000',
  'localhost:3001',
  '127.0.0.1:3000',
  '192.168.',
  'topluong.com',
];

export function getClientIp(req: NextRequest | Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

function originAllowed(req: NextRequest | Request): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  const referer = req.headers.get('referer') || '';
  const origin = req.headers.get('origin') || '';
  return ALLOWED_DOMAINS.some(domain => referer.includes(domain) || origin.includes(domain));
}

export function enforceOrigin(req: NextRequest | Request): NextResponse | null {
  if (originAllowed(req)) return null;
  return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
}

export function rateLimit(
  req: NextRequest | Request,
  namespace: string,
  maxRequests: number,
  windowMs = 60_000
): NextResponse | null {
  const key = `${namespace}:${getClientIp(req)}`;
  const now = Date.now();
  let record = rateBuckets.get(key);

  if (!record || record.resetTime < now) {
    record = { count: 0, resetTime: now + windowMs };
  }

  record.count += 1;
  rateBuckets.set(key, record);

  if (record.count <= maxRequests) return null;

  return NextResponse.json(
    { error: 'Too Many Requests' },
    {
      status: 429,
      headers: {
        'Retry-After': String(Math.max(1, Math.ceil((record.resetTime - now) / 1000))),
        'X-RateLimit-Limit': String(maxRequests),
        'X-RateLimit-Remaining': '0',
      },
    }
  );
}

export function validateHumanSignal(body: unknown): NextResponse | null {
  const data = body && typeof body === 'object' ? body as Record<string, unknown> : {};

  if (typeof data.website === 'string' && data.website.trim().length > 0) {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }

  const startedAt = Number(data.formStartedAt);
  if (!Number.isFinite(startedAt)) {
    return NextResponse.json({ error: 'Missing verification signal' }, { status: 400 });
  }

  const age = Date.now() - startedAt;
  if (age < 1_000 || age > 60 * 60 * 1000) {
    return NextResponse.json({ error: 'Invalid verification signal' }, { status: 400 });
  }

  return null;
}

export function requirePrivacyConsent(body: unknown): NextResponse | null {
  const data = body && typeof body === 'object' ? body as Record<string, unknown> : {};
  if (data.privacyConsent === true) return null;
  return NextResponse.json({ error: 'Privacy consent required' }, { status: 400 });
}

export function protectPublicMutation(
  req: NextRequest,
  body: unknown,
  options: {
    namespace: string;
    maxRequests?: number;
    windowMs?: number;
    requireConsent?: boolean;
    requireHumanSignal?: boolean;
  }
): NextResponse | null {
  const originError = enforceOrigin(req);
  if (originError) return originError;

  const limitError = rateLimit(req, options.namespace, options.maxRequests ?? 12, options.windowMs);
  if (limitError) return limitError;

  if (options.requireHumanSignal ?? true) {
    const humanError = validateHumanSignal(body);
    if (humanError) return humanError;
  }

  if (options.requireConsent) {
    const consentError = requirePrivacyConsent(body);
    if (consentError) return consentError;
  }

  return null;
}
