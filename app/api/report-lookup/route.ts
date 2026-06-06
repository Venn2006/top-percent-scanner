import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';
import { normalizeExperience, resolveSalaryBenchmark } from '@/lib/salaryResolver';
import { rateLimit } from '@/lib/apiProtection';
import { getBenchmarkMarketLocation } from '@/lib/workProvinces';
import { enforceUpstashRateLimit } from '@/lib/rateLimit';

const VSPI_ID_REGEX = /^VSPI-2026-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const NO_CACHE_HEADERS = { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' };

interface PaidPurchaseLookup {
  vspi_id: string;
  job_title: string;
  percent: number | null;
  status: string;
  paid_at: string | null;
  phone: string | null;
  experience?: string | null;
  current_salary?: number | null;
  market_location?: string | null;
  work_province?: string | null;
}

async function fetchPaidPurchase(vspiId: string): Promise<PaidPurchaseLookup | null> {
  const withSalary = await supabaseServer
    .from('purchases')
    .select('vspi_id, job_title, percent, status, paid_at, phone, experience, current_salary, market_location, work_province')
    .eq('vspi_id', vspiId)
    .eq('status', 'paid')
    .maybeSingle();

  if (!withSalary.error) return withSalary.data as PaidPurchaseLookup | null;
  if (!/current_salary|market_location|work_province|schema cache|column/i.test(withSalary.error.message)) {
    throw withSalary.error;
  }

  const fallback = await supabaseServer
    .from('purchases')
    .select('vspi_id, job_title, percent, status, paid_at, phone, experience')
    .eq('vspi_id', vspiId)
    .eq('status', 'paid')
    .maybeSingle();

  if (fallback.error) throw fallback.error;
  return fallback.data as PaidPurchaseLookup | null;
}

export async function POST(req: NextRequest) {
  const upstashLimitError = await enforceUpstashRateLimit(req, { namespace: 'api:report-lookup', requests: 10 });
  if (upstashLimitError) return upstashLimitError;

  try {
    const limitError = rateLimit(req, 'report-lookup', 10);
    if (limitError) return limitError;

    const { vspiId, phone } = await req.json();
    const cleanVspiId = typeof vspiId === 'string' ? vspiId.trim().toUpperCase() : '';
    const cleanPhone = typeof phone === 'string' ? phone.trim() : '';

    if (!cleanVspiId) {
      return NextResponse.json({ error: 'Thiếu mã VSPI ID' }, { status: 400 });
    }
    if (!VSPI_ID_REGEX.test(cleanVspiId)) {
      return NextResponse.json({ error: 'Mã VSPI ID không hợp lệ' }, { status: 400 });
    }
    if (!cleanPhone || !/^0[0-9]{9}$/.test(cleanPhone)) {
      return NextResponse.json({ error: 'SĐT không hợp lệ' }, { status: 400 });
    }

    const data = await fetchPaidPurchase(cleanVspiId);

    if (!data) {
      return NextResponse.json({ error: 'Không tìm thấy báo cáo với mã này hoặc chưa thanh toán' }, { status: 404 });
    }

    if (data.phone !== cleanPhone) {
      return NextResponse.json({ error: 'SĐT không khớp với mã VSPI ID này' }, { status: 403 });
    }

    const salary = data.current_salary ?? null;
    const resolved = salary
      ? await resolveSalaryBenchmark(
          supabaseServer,
          data.job_title,
          salary,
          normalizeExperience(data.experience),
          true,
          getBenchmarkMarketLocation(data.work_province, data.market_location)
        )
      : null;

    return NextResponse.json({
      vspi_id: data.vspi_id,
      job_title: data.job_title,
      percent: resolved?.percentileBucket ?? data.percent,
      paid_at: data.paid_at,
      salary,
      experience: normalizeExperience(data.experience),
      marketLocation: resolved?.benchmark.marketLocation ?? null,
      workProvince: data.work_province ?? null,
      dbData: resolved?.fullDbData ?? null,
      benchmark: resolved?.benchmark ?? null,
    }, { headers: NO_CACHE_HEADERS });

  } catch (err: unknown) {
    console.error('[report-lookup]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
