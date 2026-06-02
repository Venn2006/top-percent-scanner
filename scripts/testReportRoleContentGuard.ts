import { getCareerCompassContext } from '../lib/careerCompassEngine';
import { buildJobJumpMap } from '../lib/jobJumpMap';
import {
  getPremiumRolePreviewForRole,
  getRoleLanguage,
  getSimulatorSkillsForRole,
  getWorkTiersForRole,
  type SimulatorSkillBase,
  type WorkTierBase,
} from '../lib/roleTaxonomy';
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
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
}

function buildReportHelperPayload(jobTitle: string, salary: number, percent: number, industry?: string | null) {
  return {
    compass: getCareerCompassContext(jobTitle, salary, percent, industry),
    jobMap: buildJobJumpMap(jobTitle, salary, percent, industry),
    simulatorSkills: getSimulatorSkillsForRole(jobTitle, DEFAULT_SKILLS, industry),
    workTiers: getWorkTiersForRole(jobTitle, DEFAULT_TIERS, industry),
    preview: getPremiumRolePreviewForRole(jobTitle, industry),
    roleLanguage: getRoleLanguage(jobTitle, industry),
  };
}

const checkinPayload = buildReportHelperPayload('Nhan vien check-in san bay', 8_000_000, 65, AIRPORT_INDUSTRY);
const checkinText = JSON.stringify(checkinPayload, null, 2);
const checkinGuard = validateReportRoleContentGuard({
  jobTitle: 'Nhan vien check-in san bay',
  roleId: AIRPORT_CHECKIN_ROLE_ID,
  text: checkinText,
});

assert(checkinGuard.passed, `check-in report helper leaked wrong role content: ${JSON.stringify(checkinGuard, null, 2)}`);
assert(checkinGuard.requiredHits.length >= 4, `check-in report helper needs at least 4 ground-service terms, got ${checkinGuard.requiredHits.join(', ')}`);

const flightAttendantPayload = buildReportHelperPayload('Tiep vien hang khong', 18_000_000, 35, AIRPORT_INDUSTRY);
const flightAttendantText = normalize(JSON.stringify(flightAttendantPayload));
assert(
  /cabin crew|purser|cabin leader/.test(flightAttendantText),
  'flight attendant report should still be allowed to use Cabin Crew/Purser content',
);
assert(
  !/quay check-in|boarding pass|baggage service|dcs check-in/.test(flightAttendantText),
  'flight attendant report should not be rewritten into airport check-in counter content',
);

const serverPayload = buildReportHelperPayload('Nhan vien phuc vu nha hang', 7_000_000, 70, 'Nha hang');
const serverText = normalize(JSON.stringify(serverPayload));
for (const forbidden of ['p&l', 'food cost', 'labor cost']) {
  assert(!serverText.includes(forbidden), `restaurant server report must not own manager metric: ${forbidden}`);
}

const managerPayload = buildReportHelperPayload('Quan ly nha hang', 18_000_000, 30, 'Nha hang');
const managerText = normalize(JSON.stringify(managerPayload));
for (const required of ['food cost', 'labor cost', 'ton kho', 'sop', 'team', 'kpi']) {
  assert(managerText.includes(required), `restaurant manager report missing manager term: ${required}`);
}

console.log(JSON.stringify({
  checkin: {
    passed: checkinGuard.passed,
    requiredHits: checkinGuard.requiredHits,
    forbiddenHits: checkinGuard.forbiddenHits,
    jobGroup: checkinPayload.compass.jobGroup,
    targetRoles: checkinPayload.jobMap.targetRoles.map((role) => role.title),
  },
  flightAttendant: {
    cabinCrewAllowed: true,
    targetRoles: flightAttendantPayload.jobMap.targetRoles.map((role) => role.title),
  },
  restaurant: {
    serverNoManagerOwnership: true,
    managerHasOpsTerms: true,
  },
  passed: true,
}, null, 2));

