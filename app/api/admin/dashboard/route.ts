import { NextRequest, NextResponse } from 'next/server';
import { getAdminDashboardData } from '@/lib/adminDashboard';
import { protectAdminRequest } from '@/lib/adminRequest';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const adminError = protectAdminRequest(req, 'admin-dashboard-read', { maxRequests: 300, requireOrigin: false });
    if (adminError) return adminError;

    const data = await getAdminDashboardData();
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown admin dashboard error';
    console.error('[admin/dashboard]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
