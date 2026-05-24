export interface SalaryBandInput {
  top_50: number;
  top_20: number | null;
  top_10: number | null;
  top_5: number | null;
  top_40?: number | null;
  top_30?: number | null;
  top_1?: number | null;
}

export interface PercentileThresholds {
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
  top_1000: number;
  top_500: number;
}

export interface BenchmarkMeta {
  confidenceScore: number;
  confidenceLabel: string;
  confidenceDescription: string;
  sourceType: string;
  sources: string[];
  percentileBucket: number;
  rankEstimate: number;
  rankLabel: string;
  ultraRankLabel: string | null;
  nextTargetSalary: number;
  matchedJobTitle?: string;
  matchType?: string;
  marketLocation?: string;
  locationMultiplier?: number;
  strategicTargetSalary: number;
  strategicTargetLabel: string;
  thresholds: PercentileThresholds;
}

export interface BenchmarkMetaOptions {
  confidenceScore?: number;
  sourceType?: string;
  sources?: string[];
  matchedJobTitle?: string;
  matchType?: string;
  marketLocation?: string;
  locationMultiplier?: number;
}

const DEFAULT_LABOR_FORCE = 53_300_000;
const MIN_STRATEGIC_GAP_VND = 2_000_000;

export const CORE_SALARY_SOURCES = [
  'Adecco 2026',
  'ManpowerGroup 2025',
  'CareerViet VietnamSalary',
  'TopCV Salary Tool',
  'VietnamWorks/Navigos',
  'ITviec',
  'JobOKO 2025',
  'Reeracoen',
  'PERSOLKELLY',
  'NSO/GSO',
];

const roundSalary = (value: number) => Math.max(500_000, Math.round(value / 500_000) * 500_000);

function getMeaningfulStrategicGap(salary: number) {
  return Math.max(MIN_STRATEGIC_GAP_VND, salary * 0.08);
}

function getStrategicCandidateLabels(percentileBucket: number) {
  if (percentileBucket >= 60) return ['Top 50%', 'Top 40%', 'Top 30%', 'Top 20%', 'Top 10%', 'Top 5%', 'Top 1%'];
  if (percentileBucket >= 50) return ['Top 40%', 'Top 30%', 'Top 20%', 'Top 10%', 'Top 5%', 'Top 1%'];
  if (percentileBucket >= 40) return ['Top 30%', 'Top 20%', 'Top 10%', 'Top 5%', 'Top 1%'];
  if (percentileBucket >= 30) return ['Top 20%', 'Top 10%', 'Top 5%', 'Top 1%'];
  if (percentileBucket >= 20) return ['Top 10%', 'Top 5%', 'Top 1%'];
  if (percentileBucket >= 10) return ['Top 5%', 'Top 1%'];
  return ['Top 1%'];
}

function thresholdByLabel(thresholds: PercentileThresholds, label: string) {
  const n = label.match(/\d+/)?.[0];
  if (!n) return null;
  const key = `top_${n}` as keyof PercentileThresholds;
  return typeof thresholds[key] === 'number' ? thresholds[key] : null;
}

export function buildPercentileThresholds(raw: SalaryBandInput): PercentileThresholds {
  const top50 = roundSalary(raw.top_50 || 15_000_000);
  const top20 = roundSalary(raw.top_20 ?? top50 * 1.45);
  const top10 = roundSalary(raw.top_10 ?? top20 * 1.28);
  const top5 = roundSalary(raw.top_5 ?? top10 * 1.22);

  const lowBand = {
    top_100: 500_000,
    top_80: roundSalary(top50 * 0.68),
    top_70: roundSalary(top50 * 0.78),
    top_60: roundSalary(top50 * 0.88),
  };

  const top40 = roundSalary(raw.top_40 ?? top50 + (top20 - top50) * 0.33);
  const top30 = roundSalary(raw.top_30 ?? top50 + (top20 - top50) * 0.66);
  const top1 = roundSalary(raw.top_1 ?? top5 * 1.8);

  return {
    ...lowBand,
    top_50: top50,
    top_40: top40,
    top_30: top30,
    top_20: top20,
    top_10: top10,
    top_5: top5,
    top_1: top1,
    top_1000: roundSalary(Math.max(top5 * 8, 500_000_000)),
    top_500: roundSalary(Math.max(top5 * 10, 800_000_000)),
  };
}

export function getPercentileBucket(salary: number, thresholds: PercentileThresholds): number {
  if (salary >= thresholds.top_500) return 1;
  if (salary >= thresholds.top_1000) return 1;
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

export function getNextTargetSalary(salary: number, thresholds: PercentileThresholds): number {
  const ordered = [
    thresholds.top_80,
    thresholds.top_70,
    thresholds.top_60,
    thresholds.top_50,
    thresholds.top_40,
    thresholds.top_30,
    thresholds.top_20,
    thresholds.top_10,
    thresholds.top_5,
    thresholds.top_1,
  ];
  return ordered.find(threshold => threshold > salary) ?? thresholds.top_1;
}

export function getStrategicOpportunityTarget(
  salary: number,
  percentileBucket: number,
  thresholds: PercentileThresholds
): { salary: number; label: string } {
  const minGap = getMeaningfulStrategicGap(salary);
  const candidates = getStrategicCandidateLabels(percentileBucket)
    .map(label => ({ salary: thresholdByLabel(thresholds, label) ?? 0, label }))
    .filter(target => target.salary > salary);

  const meaningful = candidates.find(target => target.salary - salary >= minGap);
  if (meaningful) return meaningful;

  const bestAvailable = candidates[candidates.length - 1];
  if (bestAvailable) return bestAvailable;

  const fallback = [
    { salary: thresholds.top_80, label: 'Top 80%' },
    { salary: thresholds.top_70, label: 'Top 70%' },
    { salary: thresholds.top_60, label: 'Top 60%' },
    { salary: thresholds.top_50, label: 'Top 50%' },
    { salary: thresholds.top_40, label: 'Top 40%' },
    { salary: thresholds.top_30, label: 'Top 30%' },
    { salary: thresholds.top_20, label: 'Top 20%' },
    { salary: thresholds.top_10, label: 'Top 10%' },
    { salary: thresholds.top_5, label: 'Top 5%' },
    { salary: thresholds.top_1, label: 'Top 1%' },
  ].find(target => target.salary > salary);

  return fallback ?? { salary: thresholds.top_1, label: 'Top 1%' };
}

export function scoreBenchmarkConfidence(hasDirectData: boolean, raw: SalaryBandInput): number {
  if (!hasDirectData) return 48;
  let score = 62;
  if (raw.top_20) score += 10;
  if (raw.top_10) score += 12;
  if (raw.top_5) score += 10;
  return Math.min(score, 94);
}

export function buildBenchmarkMeta(
  salary: number,
  raw: SalaryBandInput,
  hasDirectData: boolean,
  industry?: string | null,
  laborForce = DEFAULT_LABOR_FORCE,
  options: BenchmarkMetaOptions = {}
): BenchmarkMeta {
  const thresholds = buildPercentileThresholds(raw);
  const percentileBucket = getPercentileBucket(salary, thresholds);
  const rankEstimate =
    salary >= thresholds.top_500 ? 500 :
    salary >= thresholds.top_1000 ? 1000 :
    Math.max(1, Math.ceil((percentileBucket / 100) * laborForce));
  const confidenceScore = options.confidenceScore ?? scoreBenchmarkConfidence(hasDirectData, raw);
  const sourceCount = hasDirectData ? (confidenceScore >= 90 ? 4 : confidenceScore >= 80 ? 3 : 2) : 1;
  const sources = options.sources?.length ? options.sources : CORE_SALARY_SOURCES.slice(0, sourceCount);
  const nextTargetSalary = getNextTargetSalary(salary, thresholds);
  const strategicTarget = getStrategicOpportunityTarget(salary, percentileBucket, thresholds);

  const ultraRankLabel =
    salary >= thresholds.top_500
      ? 'Top 500 thu nhập lao động ước tính tại Việt Nam'
      : salary >= thresholds.top_1000
        ? 'Top 1000 thu nhập lao động ước tính tại Việt Nam'
        : null;

  const confidenceLabel =
    confidenceScore >= 85 ? 'Cao' :
    confidenceScore >= 70 ? 'Khá cao' :
    confidenceScore >= 55 ? 'Trung bình' :
    'Tham khảo';

  return {
    confidenceScore,
    confidenceLabel,
    confidenceDescription: hasDirectData
      ? 'Có benchmark trực tiếp hoặc gần trực tiếp cho chức danh/nhóm nghề này.'
      : 'Đang ước tính theo benchmark nền của thị trường và nhóm nghề gần nhất.',
    sourceType: options.sourceType ?? (hasDirectData ? 'Benchmark tổng hợp' : 'Ước tính theo ngành'),
    sources,
    percentileBucket,
    rankEstimate,
    rankLabel: `Ước tính trong nhóm ${rankEstimate.toLocaleString('vi-VN')} người thu nhập lao động cao nhất`,
    ultraRankLabel,
    nextTargetSalary,
    strategicTargetSalary: strategicTarget.salary,
    strategicTargetLabel: strategicTarget.label,
    matchedJobTitle: options.matchedJobTitle,
    matchType: options.matchType,
    marketLocation: options.marketLocation,
    locationMultiplier: options.locationMultiplier,
    thresholds,
    ...(!industry ? {} : { industry }),
  };
}
