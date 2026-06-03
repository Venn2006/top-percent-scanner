import type { CareerLadderStep, SalaryBand } from './careerCompassData';
import {
  buildPercentileThresholds,
  getPercentileBucket,
  type PercentileThresholds,
  type SalaryBandInput,
} from './salaryBenchmark';
import { computeCurrentTier, computeStrategicTarget } from './salaryTargetConsistency';

export type SalaryDataLike = SalaryBandInput | null | undefined;
export type BenchmarkThresholdLike = { thresholds?: PercentileThresholds | null } | null | undefined;

const CAREER_BAND_ORDER: SalaryBand[] = ['entry', 'mid', 'senior', 'lead', 'executive'];

const fmtVND = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return '0 triệu';
  return `${(value / 1_000_000).toFixed(1)} triệu`;
};

function hasBenchmarkData(dbData: SalaryDataLike) {
  return Boolean(dbData && Number(dbData.top_50) > 0);
}

export function getDisplayThresholds(
  dbData: SalaryDataLike,
  benchmark?: BenchmarkThresholdLike
): PercentileThresholds | null {
  if (benchmark?.thresholds) return benchmark.thresholds;
  if (!hasBenchmarkData(dbData)) return null;
  return buildPercentileThresholds(dbData as SalaryBandInput);
}

export function getCareerBandFromPercentile(percent: number): SalaryBand {
  if (percent >= 80) return 'entry';
  if (percent >= 50) return 'mid';
  if (percent >= 30) return 'senior';
  if (percent >= 10) return 'lead';
  return 'executive';
}

function nextPercentile(percent: number) {
  if (percent >= 100) return 80;
  if (percent >= 80) return 70;
  if (percent >= 70) return 60;
  if (percent >= 60) return 50;
  if (percent >= 50) return 40;
  if (percent >= 40) return 30;
  if (percent >= 30) return 20;
  if (percent >= 20) return 10;
  if (percent >= 10) return 5;
  if (percent >= 5) return 1;
  return null;
}

function thresholdValue(thresholds: PercentileThresholds, percent: number) {
  return thresholds[`top_${percent}` as keyof PercentileThresholds] as number | undefined;
}

function rangeLabel(thresholds: PercentileThresholds, bottomPercent: number, topPercent: number | null) {
  if (bottomPercent >= 100) return `< ${fmtVND(thresholds.top_80)}`;
  const bottom = thresholdValue(thresholds, bottomPercent);
  if (!bottom) return '';
  if (!topPercent) return `>= ${fmtVND(bottom)}`;
  const top = thresholdValue(thresholds, topPercent);
  return top ? `${fmtVND(bottom)}-${fmtVND(top)}` : `>= ${fmtVND(bottom)}`;
}

function labelForRange(bottomPercent: number, topPercent: number | null) {
  if (bottomPercent >= 100) return 'Dưới Top 80';
  if (!topPercent) return `Top ${bottomPercent}+`;
  return `Top ${bottomPercent} - Top ${topPercent}`;
}

function ladderSalaryForBand(thresholds: PercentileThresholds, band: SalaryBand) {
  if (band === 'entry') return `Top 80 - Top 70: ${fmtVND(thresholds.top_80)}-${fmtVND(thresholds.top_70)}`;
  if (band === 'mid') return `Top 70 - Top 50: ${fmtVND(thresholds.top_70)}-${fmtVND(thresholds.top_50)}`;
  if (band === 'senior') return `Top 50 - Top 30: ${fmtVND(thresholds.top_50)}-${fmtVND(thresholds.top_30)}`;
  if (band === 'lead') return `Top 30 - Top 10: ${fmtVND(thresholds.top_30)}-${fmtVND(thresholds.top_10)}`;
  return `Top 10 - Top 1: ${fmtVND(thresholds.top_10)}-${fmtVND(thresholds.top_1)}`;
}

export function buildMarketPositionDisplay(input: {
  salary: number;
  percent?: number;
  dbData?: SalaryDataLike;
  benchmark?: BenchmarkThresholdLike;
}) {
  const thresholds = getDisplayThresholds(input.dbData, input.benchmark);
  if (!thresholds) return null;

  const computedPercent = getPercentileBucket(input.salary, thresholds);
  const reportedPercent = Number.isFinite(input.percent) && Number(input.percent) > 0
    ? Math.round(Number(input.percent))
    : computedPercent;
  const percent = Math.max(computedPercent, reportedPercent);
  const topPercent = nextPercentile(percent);
  const currentTier = computeCurrentTier({ salary: input.salary, benchmark: thresholds });
  const strategic = computeStrategicTarget({
    currentSalary: input.salary,
    currentTier,
    benchmark: thresholds,
  });

  return {
    thresholds,
    percentile: computedPercent,
    currentBand: getCareerBandFromPercentile(computedPercent),
    currentBandLabel: labelForRange(percent, topPercent),
    currentBandRange: rangeLabel(thresholds, percent, topPercent),
    strategicTargetLabel: strategic.targetTier,
    strategicTargetSalary: strategic.targetSalary,
    strategicGap: Math.max(0, strategic.targetSalary - input.salary),
    strategicTargetFmt: fmtVND(strategic.targetSalary),
    strategicGapFmt: fmtVND(Math.max(0, strategic.targetSalary - input.salary)),
  };
}

export function alignCareerLadderToBenchmark(
  ladder: CareerLadderStep[],
  input: { salary: number; percent?: number; dbData?: SalaryDataLike; benchmark?: BenchmarkThresholdLike }
) {
  const display = buildMarketPositionDisplay(input);
  if (!display) {
    return {
      display,
      ladder,
      currentBand: null as SalaryBand | null,
    };
  }

  return {
    display,
    currentBand: display.currentBand,
    ladder: ladder.map((step) => ({
      ...step,
      salary: step.band === display.currentBand
        ? `${display.currentBandLabel}: ${display.currentBandRange}`
        : ladderSalaryForBand(display.thresholds, step.band),
    })),
  };
}

export function isPastCareerBand(stepBand: SalaryBand, currentBand: SalaryBand) {
  return CAREER_BAND_ORDER.indexOf(stepBand) < CAREER_BAND_ORDER.indexOf(currentBand);
}
