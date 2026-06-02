import { getCareerCompassContext } from '../lib/careerCompassEngine';
import { buildJobJumpMap } from '../lib/jobJumpMap';
import { fillScript, getRoleAwareNegotiationScript } from '../lib/negotiationScripts';
import {
  getPremiumRolePreviewForRole,
  getRoleLanguage,
  getSimulatorSkillsForRole,
  getWorkTiersForRole,
  type SimulatorSkillBase,
  type WorkTierBase,
} from '../lib/roleTaxonomy';
import { sanitizePremiumInsightForRender } from '../lib/reportPremiumInsight';
import { validateReportRoleContentGuard } from '../lib/validateReportRoleContentGuard';

const AIRPORT_CHECKIN_ROLE_ID = 'nhan vien check-in san bay__van tai - logistics';
const AIRPORT_INDUSTRY = 'Van tai - Logistics';

const DEFAULT_SKILLS: SimulatorSkillBase[] = [
  { id: 'base-1', label: 'Base skill 1', boost: 1_000_000, pctBoost: 5 },
  { id: 'base-2', label: 'Base skill 2', boost: 1_000_000, pctBoost: 5 },
  { id: 'base-3', label: 'Base skill 3', boost: 1_000_000, pctBoost: 5 },
  { id: 'base-4', label: 'Base skill 4', boost: 1_000_000, pctBoost: 5 },
];

const DEFAULT_TIERS: WorkTierBase[] = [
  { name: 'Tier 1', mul: 1, color: '#94a3b8', badge: '1' },
  { name: 'Tier 2', mul: 1.2, color: '#60a5fa', badge: '2' },
  { name: 'Tier 3', mul: 1.5, color: '#34d399', badge: '3' },
  { name: 'Tier 4', mul: 1.9, color: '#fbbf24', badge: '4' },
];

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function buildRenderedReportText(jobTitle: string, salary: number, percent: number, industry?: string | null, aiAnalysis?: string) {
  const compass = getCareerCompassContext(jobTitle, salary, percent, industry);
  const jobMap = buildJobJumpMap(jobTitle, salary, percent, industry);
  const negotiation = getRoleAwareNegotiationScript(jobTitle, 'AVIATION', compass.band, industry);
  const scriptVars = {
    bandRange: compass.currentBandRange,
    nextBandMin: compass.nextBandMinFmt,
    salary: compass.salaryFmt,
    salaryGap: compass.salaryGapFmt,
  };

  return JSON.stringify({
    insight: sanitizePremiumInsightForRender({
      text: aiAnalysis,
      job: jobTitle,
      salary,
      percent,
      industry,
      targetLabel: compass.bandLabel,
      targetSalary: compass.nextBandMin,
    }),
    compass,
    jobMap,
    simulatorSkills: getSimulatorSkillsForRole(jobTitle, DEFAULT_SKILLS, industry),
    workTiers: getWorkTiersForRole(jobTitle, DEFAULT_TIERS, industry),
    preview: getPremiumRolePreviewForRole(jobTitle, industry),
    roleLanguage: getRoleLanguage(jobTitle, industry),
    negotiation: {
      interview: fillScript(negotiation.interview, scriptVars),
      raise: fillScript(negotiation.raise, scriptVars),
      tip: fillScript(negotiation.tip, scriptVars),
    },
  }, null, 2);
}

const dirtyCabinInsight = 'Insight riêng: Cabin Crew cần grooming, English announcement, Senior crew feedback, route readiness và Purser track.';
const checkinText = buildRenderedReportText('Nhân viên check-in sân bay', 8_000_000, 65, AIRPORT_INDUSTRY, dirtyCabinInsight);
const checkinGuard = validateReportRoleContentGuard({
  jobTitle: 'Nhân viên check-in sân bay',
  roleId: AIRPORT_CHECKIN_ROLE_ID,
  text: checkinText,
});

assert(checkinGuard.passed, `rendered check-in report copy failed guard: ${JSON.stringify(checkinGuard, null, 2)}`);
assert(checkinGuard.forbiddenHits.length === 0, `rendered check-in report leaked Cabin terms: ${checkinGuard.forbiddenHits.join(', ')}`);
assert(checkinGuard.brokenNoDiacriticHits.length === 0, `rendered check-in report has broken no-diacritic copy: ${checkinGuard.brokenNoDiacriticHits.join(', ')}`);
assert(checkinGuard.requiredHits.length >= 5, `rendered check-in report needs at least 5 check-in terms, got ${checkinGuard.requiredHits.join(', ')}`);

const flightAttendantText = buildRenderedReportText('Tiếp viên hàng không', 18_000_000, 35, AIRPORT_INDUSTRY, dirtyCabinInsight);
const normalizedFlightAttendant = normalize(flightAttendantText);
assert(
  /cabin crew|purser|cabin leader/.test(normalizedFlightAttendant),
  'flight attendant control should still allow Cabin Crew/Purser language',
);
assert(
  !/dcs check-in|quay check-in|passenger service agent co kpi check-in/.test(normalizedFlightAttendant),
  'flight attendant control must not be rewritten into airport check-in content',
);

console.log(JSON.stringify({
  checkin: {
    passed: checkinGuard.passed,
    requiredHits: checkinGuard.requiredHits,
    forbiddenHits: checkinGuard.forbiddenHits,
    brokenNoDiacriticHits: checkinGuard.brokenNoDiacriticHits,
  },
  flightAttendant: {
    cabinCrewAllowed: true,
    notMappedToCheckin: true,
  },
  passed: true,
}, null, 2));

