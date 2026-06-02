import { NextRequest, NextResponse } from 'next/server';

type LimitRecord = { count: number; resetTime: number };

const rateBuckets = new Map<string, LimitRecord>();

if (typeof setInterval !== 'undefined') {
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, value] of rateBuckets.entries()) {
      if (value.resetTime < now) rateBuckets.delete(key);
    }
  }, 10 * 60 * 1000) as ReturnType<typeof setInterval> & { unref?: () => void };
  cleanupTimer.unref?.();
}

const ALLOWED_HOSTS = new Set([
  'localhost:3000',
  'localhost:3001',
  '127.0.0.1:3000',
  'topluong.com',
  'www.topluong.com',
  'top-percent-scanner.vercel.app',
  'top-percent-scanner-trongvan2006-gmailcoms-projects.vercel.app',
]);

function getHeaderHostname(value: string): string {
  if (!value) return '';
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return value.trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
  }
}

function isAllowedHost(host: string): boolean {
  if (!host) return false;
  if (host === 'topluong.com' || host === 'www.topluong.com') return true;
  if (process.env.NODE_ENV === 'production') return false;
  if (ALLOWED_HOSTS.has(host)) return true;
  if (/^192\.168\.\d{1,3}\.\d{1,3}(:\d+)?$/.test(host)) return true;
  return /^top-percent-scanner-[a-z0-9-]+\.vercel\.app$/.test(host);
}

export function getClientIp(req: NextRequest | Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  );
}

function originAllowed(req: NextRequest | Request): boolean {
  if (process.env.NODE_ENV !== 'production') return true;
  const originHost = getHeaderHostname(req.headers.get('origin') || '');
  const refererHost = getHeaderHostname(req.headers.get('referer') || '');
  return isAllowedHost(originHost) || isAllowedHost(refererHost);
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
