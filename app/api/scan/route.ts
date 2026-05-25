import { NextRequest, NextResponse } from 'next/server';
import { checkSecurity } from '@/lib/security';
import { supabaseServer } from '@/lib/supabase';
import { normalizeExperience, resolveSalaryBenchmark } from '@/lib/salaryResolver';
import { getBenchmarkMarketLocation, getWorkProvince } from '@/lib/workProvinces';

export async function POST(req: NextRequest) {
  const securityError = checkSecurity(req, 10);
  if (securityError) return securityError;

  try {
    const body = await req.json();
    const { job_title, salary, experience, market_location, work_province } = body;

    if (!job_title || salary === undefined || salary === null) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }
    if (typeof job_title !== 'string' || job_title.trim().length === 0 || job_title.length > 200) {
      return NextResponse.json({ error: 'Invalid job_title' }, { status: 400 });
    }

    const userSalary = Number(salary);
    if (Number.isNaN(userSalary) || userSalary < 500_000 || userSalary > 2_000_000_000) {
      return NextResponse.json({ error: 'Invalid salary range' }, { status: 400 });
    }

    const expKey = normalizeExperience(experience);
    const province = getWorkProvince(work_province);
    const benchmarkMarketLocation = getBenchmarkMarketLocation(work_province, market_location);
    const result = await resolveSalaryBenchmark(
      supabaseServer,
      job_title.trim(),
      userSalary,
      expKey,
      false,
      benchmarkMarketLocation
    );

    return NextResponse.json({
      percent: result.percentileBucket,
      lostMoney: result.lostMoney,
      isAboveMedian: result.isAboveMedian,
      dbData: result.publicDbData,
      benchmark: result.benchmark,
      experience: expKey,
      marketLocation: result.benchmark.marketLocation,
      workProvince: province.key,
    });

  } catch (err: unknown) {
    console.error('[scan] Error:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
