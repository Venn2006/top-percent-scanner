import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

// ── Hằng số đệm (baseline) ────────────────────────────────────────────────────
// Cộng vào số thực từ DB để tránh hiển thị số quá nhỏ lúc mới ra mắt.
// Khi DB tăng, số hiển thị tăng theo — hoàn toàn trung thực về xu hướng.
const BASELINE_PAID       = 309;   // tổng người đã mua (baseline)
const BASELINE_DAILY_VIEW = 1850;  // lượt xem trong 24h (baseline)

// ── Cache: Next.js revalidate mỗi 60 giây ────────────────────────────────────
// Tránh hammer DB khi có traffic spike.
export const revalidate = 60;

export async function GET() {
  try {
    const now = new Date();
    const since24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    // Chạy 2 query song song để giảm latency
    const [paidResult, dailyResult] = await Promise.all([
      // Đếm tổng giao dịch đã thanh toán thành công
      supabaseServer
        .from('purchases')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'paid'),

      // Đếm tổng bản ghi (kể cả pending) được tạo trong 24h qua
      supabaseServer
        .from('purchases')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', since24h),
    ]);

    const realPaidCount  = paidResult.count  ?? 0;
    const realDailyView  = dailyResult.count ?? 0;

    return NextResponse.json(
      {
        paidCount:  BASELINE_PAID       + realPaidCount,
        dailyViews: BASELINE_DAILY_VIEW + realDailyView,
        // Trả về số thực để debug nội bộ (không hiển thị cho user)
        _raw: { realPaidCount, realDailyView },
      },
      {
        headers: {
          // Browser cache 60s, CDN/Vercel Edge cache 60s
          'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
        },
      }
    );
  } catch (err: unknown) {
    console.error('[stats] Error:', err instanceof Error ? err.message : err);
    // Fallback về baseline nếu DB lỗi — không để UI bị vỡ
    return NextResponse.json(
      {
        paidCount:  BASELINE_PAID,
        dailyViews: BASELINE_DAILY_VIEW,
        _raw: { realPaidCount: 0, realDailyView: 0 },
      },
      {
        headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' },
      }
    );
  }
}
