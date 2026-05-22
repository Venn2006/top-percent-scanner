import { NextRequest, NextResponse } from 'next/server';
import { getAdminDashboardData, isAdminDashboardAuthorized } from '@/lib/adminDashboard';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const key = req.nextUrl.searchParams.get('key') || req.headers.get('x-admin-key');
    if (!isAdminDashboardAuthorized(key)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const data = await getAdminDashboardData();
    return NextResponse.json(data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown admin dashboard error';
    console.error('[admin/dashboard]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
