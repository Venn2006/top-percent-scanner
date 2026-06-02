import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export const revalidate = 60;

export async function GET() {
  try {
    const now = new Date();
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    const [paidResult, dailyResult] = await Promise.all([
      supabaseServer
        .from('purchases')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'paid'),
      supabaseServer
        .from('purchases')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', since24h),
    ]);

    const realPaidCount = paidResult.count ?? 0;
    const realDailyView = dailyResult.count ?? 0;

    return NextResponse.json(
      {
        paidCount: realPaidCount,
        dailyViews: realDailyView,
        _raw: { realPaidCount, realDailyView },
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        },
      }
    );
  } catch (err: unknown) {
    console.error('[stats] Error:', err instanceof Error ? err.message : err);
    return NextResponse.json(
      {
        paidCount: 0,
        dailyViews: 0,
        _raw: { realPaidCount: 0, realDailyView: 0 },
      },
      {
        headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
      }
    );
  }
}
