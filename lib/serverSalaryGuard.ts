import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeExperience, resolveSalaryBenchmark, type ExperienceKey } from '@/lib/salaryResolver';
import { getBenchmarkMarketLocation, normalizeWorkProvince } from '@/lib/workProvinces';

export interface TrustedSalaryInput {
  jobTitle: string;
  salary: number;
  experience: ExperienceKey;
  marketLocation: ReturnType<typeof getBenchmarkMarketLocation>;
  workProvince: ReturnType<typeof normalizeWorkProvince>;
}

export function parseTrustedSalaryInput(input: {
  job_title?: unknown;
  salary?: unknown;
  current_salary?: unknown;
  experience?: unknown;
  market_location?: unknown;
  work_province?: unknown;
}): TrustedSalaryInput | { error: string } {
  const rawJobTitle = input.job_title;
  if (typeof rawJobTitle !== 'string' || rawJobTitle.trim().length === 0 || rawJobTitle.length > 200) {
    return { error: 'Invalid job_title' };
  }

  const rawSalary = input.salary ?? input.current_salary;
  const salary = Number(rawSalary);
  if (!Number.isFinite(salary) || salary < 500_000 || salary > 500_000_000) {
    return { error: 'Invalid salary range' };
  }

  return {
    jobTitle: rawJobTitle.trim(),
    salary: Math.round(salary),
    experience: normalizeExperience(input.experience),
    marketLocation: getBenchmarkMarketLocation(input.work_province, input.market_location),
    workProvince: normalizeWorkProvince(input.work_province),
  };
}

export async function resolveTrustedSalaryBenchmark(
  supabase: SupabaseClient,
  input: TrustedSalaryInput,
  includeLockedThresholds = false
) {
  return resolveSalaryBenchmark(
    supabase,
    input.jobTitle,
    input.salary,
    input.experience,
    includeLockedThresholds,
    input.marketLocation
  );
}

export function normalizeRoadmapDuration(value: unknown): 3 | 6 | 9 {
  const duration = Number(value);
  return duration === 3 || duration === 6 || duration === 9 ? duration : 6;
}

export function buildTrustedRoadmapTarget(
  currentSalary: number,
  durationMonths: 3 | 6 | 9,
  strategicTargetSalary: number
) {
  const floors: Record<3 | 6 | 9, { mult: number; abs: number; progress: number }> = {
    3: { mult: 1.12, abs: 1_500_000, progress: 0.35 },
    6: { mult: 1.25, abs: 3_000_000, progress: 0.6 },
    9: { mult: 1.32, abs: 4_000_000, progress: 1 },
  };
  const floor = floors[durationMonths];
  let target = Math.max(currentSalary * floor.mult, currentSalary + floor.abs);

  const hasStrategicTarget = strategicTargetSalary > currentSalary + Math.max(1_000_000, currentSalary * 0.08);
  const cappedStrategicTarget = hasStrategicTarget
    ? Math.min(strategicTargetSalary, currentSalary * 2.8)
    : 0;

  if (cappedStrategicTarget) {
    const milestone = currentSalary + (cappedStrategicTarget - currentSalary) * floor.progress;
    target = Math.min(cappedStrategicTarget, Math.max(target, milestone));
  } else {
    target = Math.min(target, currentSalary * 2);
  }

  return Math.max(currentSalary, Math.round(target / 500_000) * 500_000);
}
