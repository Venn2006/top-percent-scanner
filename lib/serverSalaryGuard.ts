import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeExperience, resolveSalaryBenchmark, type ExperienceKey } from '@/lib/salaryResolver';
import { getBenchmarkMarketLocation, normalizeWorkProvince } from '@/lib/workProvinces';
import { capSalaryTargetForTimeline, computeAlignedRoadmapTarget } from '@/lib/salaryTargetConsistency';

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
  const floors: Record<3 | 6 | 9, { mult: number; abs: number }> = {
    3: { mult: 1.12, abs: 1_500_000 },
    6: { mult: 1.25, abs: 3_000_000 },
    9: { mult: 1.32, abs: 4_000_000 },
  };
  const floor = floors[durationMonths];
  const target = Math.max(currentSalary * floor.mult, currentSalary + floor.abs);

  const fallbackTarget = Math.min(target, currentSalary * 2);

  return computeAlignedRoadmapTarget({
    currentSalary,
    strategicTargetSalary,
    fallbackTargetSalary: fallbackTarget,
    durationMonths,
  }).targetSalary;
}

export function buildTrustedRequestedRoadmapTarget(
  currentSalary: number,
  durationMonths: 3 | 6 | 9,
  requestedTargetSalary: unknown,
  fallbackTargetSalary: number
) {
  const requested = Number(requestedTargetSalary);
  if (!Number.isFinite(requested) || requested < 500_000 || requested > 500_000_000) {
    return fallbackTargetSalary;
  }

  return capSalaryTargetForTimeline({
    currentSalary,
    targetSalary: Math.round(requested),
    durationMonths,
  }).targetSalary;
}
