import { buildBenchmarkMeta, buildPercentileThresholds, getPercentileBucket, type PercentileThresholds, type SalaryBandInput } from '../lib/salaryBenchmark';
import { resolveSalaryBenchmark } from '../lib/salaryResolver';
import { buildTrustedRoadmapTarget } from '../lib/serverSalaryGuard';
import { computeCurrentTier, computeStrategicTarget } from '../lib/salaryTargetConsistency';

interface CaseDef {
  role: string;
  industry?: string;
  bands: SalaryBandInput;
  samples: Array<{ label: string; salary: number }>;
}

interface Failure {
  role: string;
  sample?: string;
  reason: string;
  detail: unknown;
}

const CMO_TITLE = 'CMO (Gi\u00e1m \u0111\u1ed1c Marketing)';
const CEO_TITLE = 'CEO / T\u1ed5ng gi\u00e1m \u0111\u1ed1c';

const cases: CaseDef[] = [
  {
    role: CMO_TITLE,
    industry: 'Qu\u1ea3n tr\u1ecb \u0111i\u1ec1u h\u00e0nh',
    bands: { top_50: 100_000_000, top_20: 141_000_000, top_10: 190_000_000, top_5: 260_000_000 },
    samples: [{ label: 'low', salary: 35_000_000 }, { label: 'median-ish', salary: 100_000_000 }, { label: 'high', salary: 190_000_000 }],
  },
  {
    role: CEO_TITLE,
    industry: 'Qu\u1ea3n tr\u1ecb \u0111i\u1ec1u h\u00e0nh',
    bands: { top_50: 180_000_000, top_20: 280_000_000, top_10: 420_000_000, top_5: 650_000_000 },
    samples: [{ label: 'low', salary: 80_000_000 }, { label: 'median-ish', salary: 180_000_000 }, { label: 'high', salary: 300_000_000 }],
  },
  { role: 'Nh\u00e2n vi\u00ean check-in s\u00e2n bay', industry: 'D\u1ecbch v\u1ee5/V\u1eadn t\u1ea3i h\u00e0ng kh\u00f4ng', bands: { top_50: 10_000_000, top_20: 16_000_000, top_10: 22_000_000, top_5: 30_000_000 }, samples: [{ label: 'low', salary: 8_000_000 }, { label: 'median-ish', salary: 10_000_000 }, { label: 'high', salary: 22_000_000 }] },
  { role: 'Nh\u00e2n vi\u00ean ph\u1ee5c v\u1ee5 nh\u00e0 h\u00e0ng', industry: 'Nh\u00e0 h\u00e0ng - Kh\u00e1ch s\u1ea1n - Du l\u1ecbch', bands: { top_50: 8_500_000, top_20: 13_000_000, top_10: 17_000_000, top_5: 23_000_000 }, samples: [{ label: 'low', salary: 6_500_000 }, { label: 'median-ish', salary: 8_500_000 }, { label: 'high', salary: 17_000_000 }] },
  { role: 'Qu\u1ea3n l\u00fd nh\u00e0 h\u00e0ng', industry: 'Nh\u00e0 h\u00e0ng - Kh\u00e1ch s\u1ea1n - Du l\u1ecbch', bands: { top_50: 18_000_000, top_20: 30_000_000, top_10: 42_000_000, top_5: 60_000_000 }, samples: [{ label: 'low', salary: 14_000_000 }, { label: 'median-ish', salary: 18_000_000 }, { label: 'high', salary: 42_000_000 }] },
  { role: 'Nha s\u0129', industry: 'Y t\u1ebf - Ch\u0103m s\u00f3c s\u1ee9c kh\u1ecfe', bands: { top_50: 28_000_000, top_20: 50_000_000, top_10: 75_000_000, top_5: 110_000_000 }, samples: [{ label: 'low', salary: 18_000_000 }, { label: 'median-ish', salary: 28_000_000 }, { label: 'high', salary: 75_000_000 }] },
  { role: 'C\u00f4ng nh\u00e2n may', industry: 'S\u1ea3n xu\u1ea5t - K\u1ef9 thu\u1eadt', bands: { top_50: 8_000_000, top_20: 12_000_000, top_10: 16_000_000, top_5: 22_000_000 }, samples: [{ label: 'low', salary: 6_000_000 }, { label: 'median-ish', salary: 8_000_000 }, { label: 'high', salary: 16_000_000 }] },
  { role: 'Nh\u00e2n vi\u00ean b\u00e1n h\u00e0ng', industry: 'B\u00e1n l\u1ebb - Si\u00eau th\u1ecb', bands: { top_50: 10_000_000, top_20: 16_000_000, top_10: 23_000_000, top_5: 32_000_000 }, samples: [{ label: 'low', salary: 7_000_000 }, { label: 'median-ish', salary: 10_000_000 }, { label: 'high', salary: 23_000_000 }] },
  { role: 'Barista (Pha ch\u1ebf c\u00e0 ph\u00ea)', industry: 'Nh\u00e0 h\u00e0ng - Kh\u00e1ch s\u1ea1n - Du l\u1ecbch', bands: { top_50: 6_700_000, top_20: 9_500_000, top_10: null, top_5: null }, samples: [{ label: 'barista-7m', salary: 7_000_000 }, { label: 'barista-8m', salary: 8_000_000 }, { label: 'barista-10m', salary: 10_000_000 }] },
];

function labelForSalary(salary: number, thresholds: PercentileThresholds) {
  const bucket = getPercentileBucket(salary, thresholds);
  return bucket >= 100 ? 'D\u01b0\u1edbi Top 80%' : `Top ${bucket}%`;
}

function isMonotonic(thresholds: PercentileThresholds) {
  return thresholds.top_80 < thresholds.top_70
    && thresholds.top_70 < thresholds.top_60
    && thresholds.top_60 < thresholds.top_50
    && thresholds.top_50 < thresholds.top_40
    && thresholds.top_40 < thresholds.top_30
    && thresholds.top_30 < thresholds.top_20
    && thresholds.top_20 < thresholds.top_10
    && thresholds.top_10 < thresholds.top_5
    && thresholds.top_5 < thresholds.top_1;
}

async function main() {
  const failures: Failure[] = [];
  const results: Record<string, unknown> = {};

  for (const item of cases) {
    const thresholds = buildPercentileThresholds(item.bands);
    if (!isMonotonic(thresholds)) failures.push({ role: item.role, reason: 'thresholds_not_monotonic', detail: thresholds });

    results[item.role] = item.samples.map(sample => {
      const meta = buildBenchmarkMeta(sample.salary, item.bands, true, item.industry, undefined, { matchedJobTitle: item.role, matchType: 'audit_fixture' });
      const currentTier = computeCurrentTier({ salary: sample.salary, benchmark: meta.thresholds });
      const helperTarget = computeStrategicTarget({ currentSalary: sample.salary, currentTier, benchmark: meta.thresholds });
      const roadmapTargetSalary = buildTrustedRoadmapTarget(sample.salary, 6, meta.strategicTargetSalary);
      const roadmapTargetTier = labelForSalary(roadmapTargetSalary, meta.thresholds);
      const reportTargetTierBySalary = labelForSalary(meta.strategicTargetSalary, meta.thresholds);

      const detail = {
        salary: sample.salary,
        currentTier,
        reportPercentile: meta.percentileBucket,
        reportStrategicTargetLabel: meta.strategicTargetLabel,
        reportStrategicTargetSalary: meta.strategicTargetSalary,
        reportTargetTierBySalary,
        roadmapTargetSalary,
        roadmapTargetTier,
        helperTarget,
      };

      if (meta.strategicTargetSalary !== helperTarget.targetSalary || meta.strategicTargetLabel !== helperTarget.targetTier) failures.push({ role: item.role, sample: sample.label, reason: 'report_target_not_using_shared_helper', detail });
      if (roadmapTargetSalary !== meta.strategicTargetSalary) failures.push({ role: item.role, sample: sample.label, reason: 'roadmap_target_salary_differs_from_report_target', detail });
      if (roadmapTargetTier !== meta.strategicTargetLabel) failures.push({ role: item.role, sample: sample.label, reason: 'roadmap_target_tier_differs_from_report_target', detail });
      if (reportTargetTierBySalary !== meta.strategicTargetLabel) failures.push({ role: item.role, sample: sample.label, reason: 'report_target_label_does_not_match_target_salary', detail });

      return { sample: sample.label, salary: sample.salary, percentileBucket: meta.percentileBucket, currentTier, strategicTargetLabel: meta.strategicTargetLabel, strategicTargetSalary: meta.strategicTargetSalary, roadmapTargetSalary, roadmapTargetTier };
    });
  }

  const cmo35 = (results[CMO_TITLE] as Array<Record<string, unknown>>).find(row => row.sample === 'low');
  const ceo300 = (results[CEO_TITLE] as Array<Record<string, unknown>>).find(row => row.sample === 'high');
  const baristaRows = results['Barista (Pha ch\u1ebf c\u00e0 ph\u00ea)'] as Array<Record<string, unknown>>;
  const barista7 = baristaRows.find(row => row.sample === 'barista-7m');
  const barista8 = baristaRows.find(row => row.sample === 'barista-8m');
  const barista10 = baristaRows.find(row => row.sample === 'barista-10m');
  if (String(barista7?.currentTier || '').includes('D\u01b0\u1edbi Top 80')) failures.push({ role: 'Barista (Pha ch\u1ebf c\u00e0 ph\u00ea)', sample: 'barista-7m', reason: 'barista_7m_should_not_be_below_median', detail: barista7 });
  if (String(barista8?.currentTier || '').includes('D\u01b0\u1edbi Top 80')) failures.push({ role: 'Barista (Pha ch\u1ebf c\u00e0 ph\u00ea)', sample: 'barista-8m', reason: 'barista_8m_should_not_be_below_median', detail: barista8 });
  if (barista10?.currentTier === 'Top 50%') failures.push({ role: 'Barista (Pha ch\u1ebf c\u00e0 ph\u00ea)', sample: 'barista-10m', reason: 'barista_10m_cannot_be_top50_when_top20_is_9_5m', detail: barista10 });
  const fakeSupabase = {} as never;
  const cmoResolver = await resolveSalaryBenchmark(fakeSupabase, CMO_TITLE, 35_000_000, 'mid', false, 'hcm');
  const ceoResolver = await resolveSalaryBenchmark(fakeSupabase, CEO_TITLE, 300_000_000, 'senior', false, 'hcm');

  if (cmoResolver.matchedJobTitle !== CMO_TITLE || cmoResolver.benchmark.strategicTargetSalary !== 68_000_000 || cmoResolver.benchmark.strategicTargetLabel !== 'Top 80%') failures.push({ role: CMO_TITLE, sample: 'resolver', reason: 'resolver_executive_target_mismatch', detail: cmoResolver.benchmark });
  if (ceoResolver.matchedJobTitle !== CEO_TITLE || ceoResolver.benchmark.strategicTargetSalary !== 420_000_000 || ceoResolver.benchmark.strategicTargetLabel !== 'Top 10%') failures.push({ role: CEO_TITLE, sample: 'resolver', reason: 'resolver_executive_target_mismatch', detail: ceoResolver.benchmark });

  console.log(JSON.stringify({
    rolesChecked: cases.length,
    contradictions: failures.length,
    cmo35,
    ceo300,
    barista: { barista7, barista8, barista10 },
    resolverSmoke: {
      cmo: { matchedJobTitle: cmoResolver.matchedJobTitle, strategicTargetSalary: cmoResolver.benchmark.strategicTargetSalary, strategicTargetLabel: cmoResolver.benchmark.strategicTargetLabel },
      ceo: { matchedJobTitle: ceoResolver.matchedJobTitle, strategicTargetSalary: ceoResolver.benchmark.strategicTargetSalary, strategicTargetLabel: ceoResolver.benchmark.strategicTargetLabel },
    },
    failuresDetail: failures,
  }, null, 2));

  if (failures.length > 0) process.exit(1);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
