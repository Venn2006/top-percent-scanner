import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_DASHBOARD_COOKIE, isAdminDashboardAuthorized } from '@/lib/adminDashboard';
import { enforceOrigin, rateLimit } from '@/lib/apiProtection';

export function protectAdminRequest(
  req: NextRequest,
  namespace: string,
  options: { maxRequests?: number; windowMs?: number; requireOrigin?: boolean } = {}
): NextResponse | null {
  if (options.requireOrigin ?? req.method !== 'GET') {
    const originError = enforceOrigin(req);
    if (originError) return originError;
  }

  const cookieKey = req.cookies.get(ADMIN_DASHBOARD_COOKIE)?.value;
  if (!isAdminDashboardAuthorized(cookieKey)) {
    const unauthorizedLimitError = rateLimit(
      req,
      `${namespace}:unauthorized`,
      20,
      options.windowMs ?? 10 * 60 * 1000
    );
    if (unauthorizedLimitError) return unauthorizedLimitError;
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limitError = rateLimit(
    req,
    namespace,
    options.maxRequests ?? 120,
    options.windowMs ?? 10 * 60 * 1000
  );
  if (limitError) return limitError;

  return null;
}
