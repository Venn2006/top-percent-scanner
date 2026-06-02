import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_DASHBOARD_COOKIE, isAdminDashboardAuthorized } from '@/lib/adminDashboard';
import { enforceOrigin, rateLimit } from '@/lib/apiProtection';

export async function POST(req: NextRequest) {
  const originError = enforceOrigin(req);
  if (originError) return originError;

  const form = await req.formData();
  const key = String(form.get('key') || '').trim();
  const target = new URL('/admin', req.url);

  if (!isAdminDashboardAuthorized(key)) {
    const limitError = rateLimit(req, 'admin-login-failed', 10, 10 * 60 * 1000);
    if (limitError) return limitError;
    target.searchParams.set('locked', '1');
    return NextResponse.redirect(target, { status: 303 });
  }

  const res = NextResponse.redirect(target, { status: 303 });
  res.cookies.set(ADMIN_DASHBOARD_COOKIE, '', {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/admin',
    maxAge: 0,
  });
  res.cookies.set(ADMIN_DASHBOARD_COOKIE, key, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 8 * 60 * 60,
  });
  return res;
}
