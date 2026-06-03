export type SalaryTierLabel =
  | 'Dưới Top 80%'
  | 'Top 80%'
  | 'Top 70%'
  | 'Top 60%'
  | 'Top 50%'
  | 'Top 40%'
  | 'Top 30%'
  | 'Top 20%'
  | 'Top 10%'
  | 'Top 5%'
  | 'Top 1%';

export interface SalaryTargetBenchmark {
  top100?: number | null;
  top_100?: number | null;
  top80?: number | null;
  top_80?: number | null;
  top70?: number | null;
  top_70?: number | null;
  top60?: number | null;
  top_60?: number | null;
  median?: number | null;
  top50?: number | null;
  top_50?: number | null;
  top40?: number | null;
  top_40?: number | null;
  top30?: number | null;
  top_30?: number | null;
  top20?: number | null;
  top_20?: number | null;
  top10?: number | null;
  top_10?: number | null;
  top5?: number | null;
  top_5?: number | null;
  top1?: number | null;
  top_1?: number | null;
  minimumMonthlySalary?: number | null;
}

interface NormalizedSalaryTargetThresholds {
  top_100: number;
  top_80: number;
  top_70: number;
  top_60: number;
  top_50: number;
  top_40: number;
  top_30: number;
  top_20: number;
  top_10: number;
  top_5: number;
  top_1: number;
}

const MIN_STRATEGIC_GAP_VND = 2_000_000;

const roundSalary = (value: number) => Math.max(500_000, Math.round(value / 500_000) * 500_000);
const ceilSalary = (value: number) => Math.max(500_000, Math.ceil(value / 500_000) * 500_000);

function numeric(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function readBenchmarkValue(benchmark: SalaryTargetBenchmark, camelKey: keyof SalaryTargetBenchmark, snakeKey: keyof SalaryTargetBenchmark) {
  return numeric(benchmark[camelKey]) ?? numeric(benchmark[snakeKey]);
}

function normalizeBenchmark(benchmark: SalaryTargetBenchmark): NormalizedSalaryTargetThresholds {
  const legalFloor = numeric(benchmark.minimumMonthlySalary) ? ceilSalary(Number(benchmark.minimumMonthlySalary)) : 0;
  let top50 = roundSalary(readBenchmarkValue(benchmark, 'top50', 'top_50') ?? numeric(benchmark.median) ?? 15_000_000);
  let top20 = roundSalary(readBenchmarkValue(benchmark, 'top20', 'top_20') ?? top50 * 1.45);
  let top10 = roundSalary(readBenchmarkValue(benchmark, 'top10', 'top_10') ?? top20 * 1.28);
  let top5 = roundSalary(readBenchmarkValue(benchmark, 'top5', 'top_5') ?? top10 * 1.22);

  const top100 = Math.max(roundSalary(readBenchmarkValue(benchmark, 'top100', 'top_100') ?? 500_000), legalFloor || 500_000);
  const top80 = Math.max(roundSalary(readBenchmarkValue(benchmark, 'top80', 'top_80') ?? top50 * 0.68), legalFloor, top100);
  const top70 = Math.max(roundSalary(readBenchmarkValue(benchmark, 'top70', 'top_70') ?? top50 * 0.78), top80 + 500_000);
  const top60 = Math.max(roundSalary(readBenchmarkValue(benchmark, 'top60', 'top_60') ?? top50 * 0.88), top70 + 500_000);
  top50 = Math.max(top50, top60 + 500_000);

  const top40 = Math.max(roundSalary(readBenchmarkValue(benchmark, 'top40', 'top_40') ?? top50 + (top20 - top50) * 0.33), top50 + 500_000);
  const top30 = Math.max(roundSalary(readBenchmarkValue(benchmark, 'top30', 'top_30') ?? top50 + (top20 - top50) * 0.66), top40 + 500_000);
  top20 = Math.max(top20, top30 + 500_000);
  top10 = Math.max(top10, top20 + 1_500_000);
  top5 = Math.max(top5, top10 + 1_500_000);
  const top1 = Math.max(roundSalary(readBenchmarkValue(benchmark, 'top1', 'top_1') ?? top5 * 1.8), top5 + 1_500_000);

  return {
    top_100: top100,
    top_80: top80,
    top_70: top70,
    top_60: top60,
    top_50: top50,
    top_40: top40,
    top_30: top30,
    top_20: top20,
    top_10: top10,
    top_5: top5,
    top_1: top1,
  };
}

function bucketForSalary(salary: number, thresholds: NormalizedSalaryTargetThresholds) {
  if (salary >= thresholds.top_1) return 1;
  if (salary >= thresholds.top_5) return 5;
  if (salary >= thresholds.top_10) return 10;
  if (salary >= thresholds.top_20) return 20;
  if (salary >= thresholds.top_30) return 30;
  if (salary >= thresholds.top_40) return 40;
  if (salary >= thresholds.top_50) return 50;
  if (salary >= thresholds.top_60) return 60;
  if (salary >= thresholds.top_70) return 70;
  if (salary >= thresholds.top_80) return 80;
  return 100;
}

function tierLabelForBucket(bucket: number): SalaryTierLabel {
  if (bucket >= 100) return 'Dưới Top 80%';
  return `Top ${bucket}%` as SalaryTierLabel;
}

function bucketForTier(tier: SalaryTierLabel) {
  if (tier === 'Dưới Top 80%') return 100;
  return Number(tier.match(/\d+/)?.[0] || 100);
}

function thresholdForTier(thresholds: NormalizedSalaryTargetThresholds, tier: SalaryTierLabel) {
  if (tier === 'Dưới Top 80%') return thresholds.top_100;
  const bucket = bucketForTier(tier);
  return thresholds[`top_${bucket}` as keyof NormalizedSalaryTargetThresholds] ?? thresholds.top_1;
}

function getStrategicCandidateLabels(bucket: number): SalaryTierLabel[] {
  if (bucket >= 100) return ['Top 80%', 'Top 70%', 'Top 60%', 'Top 50%', 'Top 40%', 'Top 30%', 'Top 20%', 'Top 10%', 'Top 5%', 'Top 1%'];
  if (bucket >= 80) return ['Top 70%', 'Top 60%', 'Top 50%', 'Top 40%', 'Top 30%', 'Top 20%', 'Top 10%', 'Top 5%', 'Top 1%'];
  if (bucket >= 70) return ['Top 60%', 'Top 50%', 'Top 40%', 'Top 30%', 'Top 20%', 'Top 10%', 'Top 5%', 'Top 1%'];
  if (bucket >= 60) return ['Top 50%', 'Top 40%', 'Top 30%', 'Top 20%', 'Top 10%', 'Top 5%', 'Top 1%'];
  if (bucket >= 50) return ['Top 40%', 'Top 30%', 'Top 20%', 'Top 10%', 'Top 5%', 'Top 1%'];
  if (bucket >= 40) return ['Top 30%', 'Top 20%', 'Top 10%', 'Top 5%', 'Top 1%'];
  if (bucket >= 30) return ['Top 20%', 'Top 10%', 'Top 5%', 'Top 1%'];
  if (bucket >= 20) return ['Top 10%', 'Top 5%', 'Top 1%'];
  if (bucket >= 10) return ['Top 5%', 'Top 1%'];
  return ['Top 1%'];
}

function getMeaningfulStrategicGap(salary: number) {
  return Math.max(MIN_STRATEGIC_GAP_VND, salary * 0.08);
}

export function computeCurrentTier(input: {
  salary: number;
  median?: number | null;
  top80?: number | null;
  top50?: number | null;
  top20?: number | null;
  top10?: number | null;
  top5?: number | null;
  top1?: number | null;
  benchmark?: SalaryTargetBenchmark;
}): SalaryTierLabel {
  const thresholds = normalizeBenchmark({
    ...input.benchmark,
    median: input.median ?? input.benchmark?.median,
    top80: input.top80 ?? input.benchmark?.top80,
    top50: input.top50 ?? input.benchmark?.top50,
    top20: input.top20 ?? input.benchmark?.top20,
    top10: input.top10 ?? input.benchmark?.top10,
    top5: input.top5 ?? input.benchmark?.top5,
    top1: input.top1 ?? input.benchmark?.top1,
  });
  return tierLabelForBucket(bucketForSalary(input.salary, thresholds));
}

export function computeStrategicTarget(input: {
  currentSalary: number;
  currentTier: SalaryTierLabel;
  benchmark: SalaryTargetBenchmark;
  timelineMonths?: number;
  roleLevel?: string;
}): {
  targetSalary: number;
  targetTier: SalaryTierLabel;
  reason: string;
} {
  const thresholds = normalizeBenchmark(input.benchmark);
  const salaryBucket = bucketForSalary(input.currentSalary, thresholds);
  const tierBucket = bucketForTier(input.currentTier);
  const currentBucket = Math.min(salaryBucket, tierBucket);
  const minGap = getMeaningfulStrategicGap(input.currentSalary);
  const candidates = getStrategicCandidateLabels(currentBucket)
    .map(targetTier => ({ targetTier, targetSalary: thresholdForTier(thresholds, targetTier) }))
    .filter(target => target.targetSalary > input.currentSalary);

  const meaningful = candidates.find(target => target.targetSalary - input.currentSalary >= minGap);
  const selected = meaningful ?? candidates[candidates.length - 1] ?? { targetTier: 'Top 1%' as SalaryTierLabel, targetSalary: thresholds.top_1 };

  return {
    targetSalary: roundSalary(selected.targetSalary),
    targetTier: selected.targetTier,
    reason: `Target ${selected.targetTier} is the nearest benchmark tier with a meaningful salary gap from ${input.currentTier}.`,
  };
}

export function computeAlignedRoadmapTarget(input: {
  currentSalary: number;
  strategicTargetSalary?: number | null;
  fallbackTargetSalary?: number | null;
  durationMonths?: number;
}): {
  targetSalary: number;
  usesStrategicTarget: boolean;
  reason: string;
} {
  const currentSalary = Math.max(0, Number(input.currentSalary) || 0);
  const strategicTargetSalary = Number(input.strategicTargetSalary || 0);
  const hasStrategicTarget = strategicTargetSalary > currentSalary + Math.max(1_000_000, currentSalary * 0.08);

  if (hasStrategicTarget) {
    return {
      targetSalary: roundSalary(strategicTargetSalary),
      usesStrategicTarget: true,
      reason: `Roadmap target uses the same strategic salary tier as the report for ${input.durationMonths || 6} months.`,
    };
  }

  return {
    targetSalary: roundSalary(Math.max(currentSalary, Number(input.fallbackTargetSalary || currentSalary))),
    usesStrategicTarget: false,
    reason: 'Roadmap target uses fallback progression because no meaningful strategic report target is available.',
  };
}
