import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { NextResponse } from 'next/server';

type RateLimitOptions = {
  namespace: string;
  requests: number;
};

const WINDOW = '60 s';
const TOO_MANY_REQUESTS_BODY = { error: 'Quá nhiều yêu cầu, vui lòng thử lại sau' };

let redisClient: Redis | null = null;
const limiters = new Map<string, Ratelimit>();

function getClientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    req.headers.get('cf-connecting-ip') ||
    'unknown'
  );
}

function getRedis(): Redis {
  if (redisClient) return redisClient;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error('Missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN');
  }

  redisClient = new Redis({ url, token });
  return redisClient;
}

function getLimiter(options: RateLimitOptions): Ratelimit {
  const key = `${options.namespace}:${options.requests}:${WINDOW}`;
  const existing = limiters.get(key);
  if (existing) return existing;

  const limiter = new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.fixedWindow(options.requests, WINDOW),
    prefix: `ratelimit:${options.namespace}`,
    analytics: true,
  });
  limiters.set(key, limiter);
  return limiter;
}

export async function enforceUpstashRateLimit(req: Request, options: RateLimitOptions): Promise<NextResponse | null> {
  try {
    const result = await getLimiter(options).limit(getClientIp(req));
    if (result.success) return null;

    const resetSeconds = Math.max(1, Math.ceil((result.reset - Date.now()) / 1000));
    return NextResponse.json(TOO_MANY_REQUESTS_BODY, {
      status: 429,
      headers: {
        'Retry-After': String(resetSeconds),
        'X-RateLimit-Limit': String(options.requests),
        'X-RateLimit-Remaining': '0',
      },
    });
  } catch (error) {
    console.error('[rate-limit] Upstash rate limit unavailable:', error instanceof Error ? error.message : error);
    if (process.env.NODE_ENV !== 'production') return null;
    return NextResponse.json({ error: 'Rate limit chưa được cấu hình' }, { status: 503 });
  }
}
