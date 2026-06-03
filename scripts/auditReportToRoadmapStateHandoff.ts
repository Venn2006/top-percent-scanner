import fs from 'node:fs';
import { getCareerCompassContext } from '../lib/careerCompassEngine';
import { computeAlignedRoadmapTarget } from '../lib/salaryTargetConsistency';

interface DraftProfile {
  selectedJob?: string;
  selectedRoleId?: string;
  salary?: number;
  resultPercent?: number;
  experience?: string;
  marketLocation?: string;
  workProvince?: string;
  compassTargetSalary?: number;
  compassTargetLabel?: string;
  benchmarkMeta?: { strategicTargetSalary?: number; strategicTargetLabel?: string };
  savedAt?: number;
}

interface QueryProfile {
  job?: string;
  selectedRoleId?: string;
  salary?: number;
  percent?: number;
  experience?: string;
  marketLocation?: string;
  workProvince?: string;
  targetSalary?: number;
  targetLabel?: string;
  duration?: number;
}

interface Failure {
  caseName: string;
  reason: string;
  detail: Record<string, unknown>;
}

function readPremiumRoadmapProfile(session: DraftProfile, now = Date.now()) {
  const savedAt = Number(session.savedAt || 0);
  const maxAge = 24 * 60 * 60 * 1000;
  if (!savedAt || now - savedAt > maxAge) return {};
  const salary = Number(session.salary || 0);
  return {
    job: typeof session.selectedJob === 'string' ? session.selectedJob : undefined,
    selectedRoleId: typeof session.selectedRoleId === 'string' ? session.selectedRoleId : undefined,
    salary: Number.isFinite(salary) && salary > 0 ? salary : undefined,
    duration: 6,
    percent: Number(session.resultPercent || 0) || undefined,
    experience: session.experience,
    marketLocation: session.marketLocation,
    workProvince: session.workProvince,
    compassTargetSalary: Number(session.compassTargetSalary || 0) || Number(session.benchmarkMeta?.strategicTargetSalary || 0) || undefined,
    compassTargetLabel: session.compassTargetLabel || session.benchmarkMeta?.strategicTargetLabel,
    savedAt,
  };
}

function calcTargetSalary(currentSalary: number, job: string, months: number, compassTargetSalary = 0, compassTargetLabel = '') {
  const ctx = getCareerCompassContext(job, currentSalary, 50);
  const floors: Record<number, { mult: number; abs: number }> = {
    3: { mult: 1.12, abs: 1_500_000 },
    6: { mult: 1.25, abs: 3_000_000 },
    9: { mult: 1.32, abs: 4_000_000 },
    12: { mult: 1.40, abs: 5_000_000 },
  };
  const f = floors[months] ?? floors[6];
  let target = Math.max(currentSalary * f.mult, currentSalary + f.abs);
  if (months === 12 && ctx.nextBandMin > target) target += Math.min(ctx.nextBandMin - target, target * 0.15);
  const hasCompassTarget = compassTargetSalary > currentSalary + Math.max(1_000_000, currentSalary * 0.08);
  const compassTarget = hasCompassTarget ? compassTargetSalary : 0;
  if (hasCompassTarget) {
    target = computeAlignedRoadmapTarget({
      currentSalary,
      strategicTargetSalary: compassTarget,
      fallbackTargetSalary: target,
      durationMonths: months,
    }).targetSalary;
  }
  else target = Math.min(target, currentSalary * 2);
  return { target: Math.round(target / 500_000) * 500_000, compassTarget, compassTargetLabel: compassTargetLabel || 'đích La Bàn' };
}

function mergeHandoff(session: DraftProfile, query: QueryProfile, savedDraft: Record<string, unknown> = {}) {
  const premiumDraft = readPremiumRoadmapProfile(session);
  const draftFromQuery = {
    ...(query.job ? { job: query.job } : {}),
    ...(query.selectedRoleId ? { selectedRoleId: query.selectedRoleId } : {}),
    ...(query.salary ? { salary: query.salary } : {}),
    ...(query.percent ? { percent: query.percent } : {}),
    ...(query.experience ? { experience: query.experience } : {}),
    ...(query.marketLocation ? { marketLocation: query.marketLocation } : {}),
    ...(query.workProvince ? { workProvince: query.workProvince } : {}),
    ...(query.targetSalary ? { compassTargetSalary: query.targetSalary } : {}),
    ...(query.targetLabel ? { compassTargetLabel: query.targetLabel } : {}),
    ...(query.duration ? { duration: query.duration === 12 ? 9 : query.duration } : {}),
  };
  return { duration: 6, ...savedDraft, ...premiumDraft, ...draftFromQuery } as Record<string, unknown>;
}

const cases: Array<{ caseName: string; session: DraftProfile; query: QueryProfile }> = [
  {
    caseName: 'CMO 35M report handoff',
    session: { selectedJob: 'CMO (Giám đốc Marketing)', selectedRoleId: 'cmo (giam doc marketing)__quan tri dieu hanh', salary: 35_000_000, resultPercent: 100, experience: 'mid', marketLocation: 'hcm', workProvince: 'hcm', benchmarkMeta: { strategicTargetSalary: 68_000_000, strategicTargetLabel: 'Top 80%' }, savedAt: Date.now() },
    query: { job: 'CMO (Giám đốc Marketing)', selectedRoleId: 'cmo (giam doc marketing)__quan tri dieu hanh', salary: 35_000_000, experience: 'mid', marketLocation: 'hcm', workProvince: 'hcm', targetSalary: 68_000_000, targetLabel: 'Top 80%' },
  },
  {
    caseName: 'Check-in sân bay 8M handoff',
    session: { selectedJob: 'Nhân viên check-in sân bay', selectedRoleId: 'nhan vien check-in san bay__van tai - logistics', salary: 8_000_000, resultPercent: 80, savedAt: Date.now() },
    query: { job: 'Nhân viên check-in sân bay', selectedRoleId: 'nhan vien check-in san bay__van tai - logistics', salary: 8_000_000 },
  },
  {
    caseName: 'Barista 7M report handoff beats stale HR cache',
    session: { selectedJob: 'Barista (Pha chế cà phê)', selectedRoleId: 'barista (pha che ca phe)__nha hang - khach san - du lich', salary: 7_000_000, resultPercent: 50, experience: 'junior', marketLocation: 'hcm', workProvince: 'hcm', benchmarkMeta: { strategicTargetSalary: 9_500_000, strategicTargetLabel: 'Top 20%' }, savedAt: Date.now() },
    query: { job: 'Barista (Pha chế cà phê)', selectedRoleId: 'barista (pha che ca phe)__nha hang - khach san - du lich', salary: 7_000_000, experience: 'junior', marketLocation: 'hcm', workProvince: 'hcm', targetSalary: 9_500_000, targetLabel: 'Top 20%' },
  },
  {
    caseName: 'CEO 300M handoff',
    session: { selectedJob: 'CEO / Tổng giám đốc', selectedRoleId: 'ceo / tong giam doc__quan tri dieu hanh', salary: 300_000_000, resultPercent: 20, benchmarkMeta: { strategicTargetSalary: 420_000_000, strategicTargetLabel: 'Top 10%' }, savedAt: Date.now() },
    query: { job: 'CEO / Tổng giám đốc', selectedRoleId: 'ceo / tong giam doc__quan tri dieu hanh', salary: 300_000_000, targetSalary: 420_000_000, targetLabel: 'Top 10%' },
  },
];

const failures: Failure[] = [];
const results = cases.map(testCase => {
  const merged = mergeHandoff(testCase.session, testCase.query, { job: 'Stale role', salary: 16_000_000, selectedRoleId: 'stale_role' });
  const target = calcTargetSalary(Number(merged.salary || 0), String(merged.job || ''), Number(merged.duration || 6), Number(merged.compassTargetSalary || 0), String(merged.compassTargetLabel || ''));
  const expectedSalary = testCase.query.salary || testCase.session.salary;
  const expectedJob = testCase.query.job || testCase.session.selectedJob;
  const expectedRoleId = testCase.query.selectedRoleId || testCase.session.selectedRoleId;
  const expectedTargetSalary = testCase.query.targetSalary || testCase.session.compassTargetSalary || testCase.session.benchmarkMeta?.strategicTargetSalary;
  const expectedTargetLabel = testCase.query.targetLabel || testCase.session.compassTargetLabel || testCase.session.benchmarkMeta?.strategicTargetLabel;
  if (merged.salary !== expectedSalary) failures.push({ caseName: testCase.caseName, reason: 'salary_not_preserved', detail: { merged, expectedSalary } });
  if (merged.job !== expectedJob) failures.push({ caseName: testCase.caseName, reason: 'job_not_preserved', detail: { merged, expectedJob } });
  if (merged.selectedRoleId !== expectedRoleId) failures.push({ caseName: testCase.caseName, reason: 'role_id_not_preserved', detail: { merged, expectedRoleId } });
  if (expectedTargetSalary && target.target !== expectedTargetSalary) failures.push({ caseName: testCase.caseName, reason: 'target_salary_not_preserved', detail: { merged, target, expectedTargetSalary } });
  if (expectedTargetLabel && target.compassTargetLabel !== expectedTargetLabel) failures.push({ caseName: testCase.caseName, reason: 'target_label_not_preserved', detail: { merged, target, expectedTargetLabel } });
  if (JSON.stringify(merged).includes('16000000') || JSON.stringify(merged).includes('Stale role')) failures.push({ caseName: testCase.caseName, reason: 'stale_draft_leaked_into_handoff', detail: { merged } });
  return { caseName: testCase.caseName, merged, target };
});

const roadmapSource = fs.readFileSync('app/roadmap/page.tsx', 'utf8');
const premiumSource = fs.readFileSync('app/components/PremiumSection.tsx', 'utf8');
if (!/\.\.\.freshDraft, \.\.\.premiumDraft, \.\.\.draftFromQuery/.test(roadmapSource)) {
  failures.push({ caseName: 'source merge order', reason: 'query_should_override_premium_and_stale_draft', detail: { expected: 'freshDraft, premiumDraft, draftFromQuery merge order' } });
}
if (!/localStorage\.removeItem\('vspi-roadmap-v2'\)/.test(premiumSource)) {
  failures.push({ caseName: 'premium cta source', reason: 'premium_cta_must_clear_stale_roadmap_cache', detail: { expected: 'PremiumSection removes vspi-roadmap-v2 before draft handoff' } });
}
for (const token of ['selectedRoleId', 'experience', 'marketLocation', 'workProvince', 'benchmarkMatchedRole']) {
  if (!premiumSource.includes(token)) failures.push({ caseName: 'premium cta source', reason: `premium_cta_missing_${token}`, detail: { token } });
}

console.log(JSON.stringify({ failures: failures.length, results, failuresDetail: failures }, null, 2));
if (failures.length > 0) process.exit(1);
