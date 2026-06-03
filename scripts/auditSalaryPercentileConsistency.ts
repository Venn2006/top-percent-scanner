import { buildBenchmarkMeta, buildPercentileThresholds, getPercentileBucket, type PercentileThresholds, type SalaryBandInput } from '../lib/salaryBenchmark';
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

const cases: CaseDef[] = [
  {
    role: 'CMO (Giám đốc Marketing)',
    industry: 'Quản trị điều hành',
    bands: { top_50: 100_000_000, top_20: 141_000_000, top_10: 190_000_000, top_5: 260_000_000 },
    samples: [{ label: 'low', salary: 35_000_000 }, { label: 'median-ish', salary: 100_000_000 }, { label: 'high', salary: 190_000_000 }],
  },
  {
    role: 'CEO / Tổng giám đốc',
    industry: 'Quản trị điều hành',
    bands: { top_50: 180_000_000, top_20: 280_000_000, top_10: 420_000_000, top_5: 650_000_000 },
    samples: [{ label: 'low', salary: 80_000_000 }, { label: 'median-ish', salary: 180_000_000 }, { label: 'high', salary: 300_000_000 }],
  },
  { role: 'Nhân viên check-in sân bay', industry: 'Dịch vụ/Vận tải hàng không', bands: { top_50: 10_000_000, top_20: 16_000_000, top_10: 22_000_000, top_5: 30_000_000 }, samples: [{ label: 'low', salary: 8_000_000 }, { label: 'median-ish', salary: 10_000_000 }, { label: 'high', salary: 22_000_000 }] },
  { role: 'Nhân viên phục vụ nhà hàng', industry: 'Nhà hàng - Khách sạn - Du lịch', bands: { top_50: 8_500_000, top_20: 13_000_000, top_10: 17_000_000, top_5: 23_000_000 }, samples: [{ label: 'low', salary: 6_500_000 }, { label: 'median-ish', salary: 8_500_000 }, { label: 'high', salary: 17_000_000 }] },
  { role: 'Quản lý nhà hàng', industry: 'Nhà hàng - Khách sạn - Du lịch', bands: { top_50: 18_000_000, top_20: 30_000_000, top_10: 42_000_000, top_5: 60_000_000 }, samples: [{ label: 'low', salary: 14_000_000 }, { label: 'median-ish', salary: 18_000_000 }, { label: 'high', salary: 42_000_000 }] },
  { role: 'Nha sĩ', industry: 'Y tế - Chăm sóc sức khỏe', bands: { top_50: 28_000_000, top_20: 50_000_000, top_10: 75_000_000, top_5: 110_000_000 }, samples: [{ label: 'low', salary: 18_000_000 }, { label: 'median-ish', salary: 28_000_000 }, { label: 'high', salary: 75_000_000 }] },
  { role: 'Công nhân may', industry: 'Sản xuất - Kỹ thuật', bands: { top_50: 8_000_000, top_20: 12_000_000, top_10: 16_000_000, top_5: 22_000_000 }, samples: [{ label: 'low', salary: 6_000_000 }, { label: 'median-ish', salary: 8_000_000 }, { label: 'high', salary: 16_000_000 }] },
  { role: 'Nhân viên bán hàng', industry: 'Bán lẻ - Siêu thị', bands: { top_50: 10_000_000, top_20: 16_000_000, top_10: 23_000_000, top_5: 32_000_000 }, samples: [{ label: 'low', salary: 7_000_000 }, { label: 'median-ish', salary: 10_000_000 }, { label: 'high', salary: 23_000_000 }] },
];

function labelForSalary(salary: number, thresholds: PercentileThresholds) {
  const bucket = getPercentileBucket(salary, thresholds);
  return bucket >= 100 ? 'Dưới Top 80%' : `Top ${bucket}%`;
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

    if (meta.strategicTargetSalary !== helperTarget.targetSalary || meta.strategicTargetLabel !== helperTarget.targetTier) {
      failures.push({ role: item.role, sample: sample.label, reason: 'report_target_not_using_shared_helper', detail });
    }

    if (roadmapTargetSalary !== meta.strategicTargetSalary) {
      failures.push({ role: item.role, sample: sample.label, reason: 'roadmap_target_salary_differs_from_report_target', detail });
    }

    if (roadmapTargetTier !== meta.strategicTargetLabel) {
      failures.push({ role: item.role, sample: sample.label, reason: 'roadmap_target_tier_differs_from_report_target', detail });
    }

    if (reportTargetTierBySalary !== meta.strategicTargetLabel) {
      failures.push({ role: item.role, sample: sample.label, reason: 'report_target_label_does_not_match_target_salary', detail });
    }

    return {
      sample: sample.label,
      salary: sample.salary,
      percentileBucket: meta.percentileBucket,
      currentTier,
      strategicTargetLabel: meta.strategicTargetLabel,
      strategicTargetSalary: meta.strategicTargetSalary,
      roadmapTargetSalary,
      roadmapTargetTier,
    };
  });
}

const cmo35 = (results['CMO (Giám đốc Marketing)'] as Array<Record<string, unknown>>).find(row => row.sample === 'low');
const ceo300 = (results['CEO / Tổng giám đốc'] as Array<Record<string, unknown>>).find(row => row.sample === 'high');

console.log(JSON.stringify({ rolesChecked: cases.length, contradictions: failures.length, cmo35, ceo300, failuresDetail: failures }, null, 2));
if (failures.length > 0) process.exit(1);
