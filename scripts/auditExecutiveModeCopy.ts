import { getCareerCompassContext } from '../lib/careerCompassEngine';
import { buildJobJumpMap } from '../lib/jobJumpMap';
import { fillScript, getRoleAwareNegotiationScript } from '../lib/negotiationScripts';
import { buildSafePremiumInsight } from '../lib/reportPremiumInsight';
import { getAllRoleProfiles, type RoleProfile } from '../lib/roleProfiles';
import { inferRoleLevelBand, isExecutiveLevel } from '../lib/roleSeniority';
import { getPremiumRolePreviewForRole, getRoleLanguage, normalizeRoleText } from '../lib/roleTaxonomy';

interface Failure {
  roleId: string;
  title: string;
  reason: string;
  hits: string[];
  sample: string;
}

const SAMPLE_SALARY = 120_000_000;
const SAMPLE_PERCENT = 20;
const FORBIDDEN = [
  'câu trả lời HR',
  'xin review',
  'xin review lương',
  'lên quản lý',
  'đi sâu chuyên môn',
  'mục tiêu tăng lương',
  'đàm phán lương kiểu nhân viên',
  'apply role manager',
];
const REQUIRED = [
  'P&L',
  'scope',
  'mandate',
  'board',
  'owner',
  'compensation package',
  'bonus',
  'equity',
  'operating authority',
  'strategic outcome',
  'growth',
  'revenue',
  'profit',
];
const CMO_FORBIDDEN = ['Brand Manager', 'Marketing Lead tại SME', 'Marketing Lead'];
const CEO_FORBIDDEN = ['Specialist CEO', 'Senior / Specialist CEO', 'Executive CEO', 'Manager CEO', 'Head CEO'];

function normalize(value: string) {
  return normalizeRoleText(value);
}

function isExecutive(profile: RoleProfile) {
  return isExecutiveLevel(inferRoleLevelBand({ jobTitle: profile.title, roleId: profile.key, industry: profile.industry }));
}

function hits(text: string, terms: string[]) {
  const raw = text.toLowerCase();
  const normalized = normalize(text);
  return terms.filter((term) => raw.includes(term.toLowerCase()) || normalized.includes(normalize(term)));
}

function sample(text: string, terms: string[]) {
  const lower = text.toLowerCase();
  const normalized = normalize(text);
  const term = terms.find((candidate) => lower.includes(candidate.toLowerCase()) || normalized.includes(normalize(candidate))) || terms[0] || '';
  const rawIndex = term ? lower.indexOf(term.toLowerCase()) : -1;
  const normalizedIndex = term ? normalized.indexOf(normalize(term)) : -1;
  const index = rawIndex >= 0 ? rawIndex : normalizedIndex;
  return text.slice(Math.max(0, index < 0 ? 0 : index - 140), index < 0 ? 260 : index + 260).replace(/\s+/g, ' ').trim();
}

function render(profile: RoleProfile) {
  const compass = getCareerCompassContext(profile.title, SAMPLE_SALARY, SAMPLE_PERCENT, profile.industry);
  const jobMap = buildJobJumpMap(profile.title, SAMPLE_SALARY, SAMPLE_PERCENT, profile.industry);
  const preview = getPremiumRolePreviewForRole(profile.title, profile.industry);
  const language = getRoleLanguage(profile.title, profile.industry);
  const insight = buildSafePremiumInsight(profile.title, SAMPLE_SALARY, SAMPLE_PERCENT, compass.bandLabel, compass.nextBandMin, profile.industry);
  const negotiation = getRoleAwareNegotiationScript(profile.title, 'FALLBACK', compass.band, profile.industry);
  const vars = { bandRange: compass.currentBandRange, nextBandMin: compass.nextBandMinFmt, salary: compass.salaryFmt, salaryGap: compass.salaryGapFmt };
  return JSON.stringify({
    compass,
    jobMap,
    preview,
    language,
    insight,
    negotiation: {
      interview: fillScript(negotiation.interview, vars),
      raise: fillScript(negotiation.raise, vars),
      tip: fillScript(negotiation.tip, vars),
    },
  });
}

function isCmo(profile: RoleProfile) {
  return /\bcmo\b|giam doc marketing|marketing director/.test(normalize(`${profile.title} ${profile.key}`));
}

function isCeo(profile: RoleProfile) {
  return /\bceo\b|tong giam doc|general director|managing director/.test(normalize(`${profile.title} ${profile.key}`));
}

const profiles = getAllRoleProfiles().filter(isExecutive);
const failures: Failure[] = [];

for (const profile of profiles) {
  const text = render(profile);
  const forbidden = hits(text, FORBIDDEN);
  if (forbidden.length) failures.push({ roleId: profile.key, title: profile.title, reason: 'employee_style_executive_copy', hits: forbidden, sample: sample(text, forbidden) });

  const required = hits(text, REQUIRED);
  if (required.length < 5) failures.push({ roleId: profile.key, title: profile.title, reason: 'missing_executive_compensation_scope_language', hits: REQUIRED.filter((term) => !required.includes(term)), sample: sample(text, REQUIRED) });

  if (isCmo(profile)) {
    const cmoForbidden = hits(text, CMO_FORBIDDEN);
    if (cmoForbidden.length) failures.push({ roleId: profile.key, title: profile.title, reason: 'cmo_lower_role_copy', hits: cmoForbidden, sample: sample(text, cmoForbidden) });
  }

  if (isCeo(profile)) {
    const ceoForbidden = hits(text, CEO_FORBIDDEN);
    if (ceoForbidden.length) failures.push({ roleId: profile.key, title: profile.title, reason: 'ceo_lower_role_copy', hits: ceoForbidden, sample: sample(text, ceoForbidden) });
  }
}

const ceo = failures.filter((failure) => /\bceo\b|tong giam doc/i.test(normalize(failure.title)));
const cmo = failures.filter((failure) => /\bcmo\b|marketing/i.test(normalize(failure.title)));

console.log(JSON.stringify({
  executiveRolesChecked: profiles.length,
  failures: failures.length,
  CEO: ceo,
  CMO: cmo,
  requiredExecutiveLanguage: REQUIRED,
  topFailures: failures.slice(0, 80),
}, null, 2));

if (failures.length > 0) process.exit(1);
