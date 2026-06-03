import { getCareerCompassContext } from '../lib/careerCompassEngine';
import { buildJobJumpMap, type JobJumpMap } from '../lib/jobJumpMap';
import { fillScript, getRoleAwareNegotiationScript } from '../lib/negotiationScripts';
import { buildSafePremiumInsight } from '../lib/reportPremiumInsight';
import { getAllRoleProfiles, type RoleProfile } from '../lib/roleProfiles';
import { inferRoleLevelBand, isExecutiveLevel, type RoleLevelBand } from '../lib/roleSeniority';
import { getPremiumRolePreviewForRole, getRoleLanguage, normalizeRoleText } from '../lib/roleTaxonomy';

interface Failure {
  roleId: string;
  title: string;
  levelBand: RoleLevelBand;
  reason: string;
  hits: string[];
  sample: string;
}

const SAMPLE_SALARY = 35_000_000;
const SAMPLE_PERCENT = 50;

const EXECUTIVE_REQUIRED = [
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
const EXECUTIVE_FORBIDDEN = [
  'câu trả lời HR',
  'xin review',
  'xin review lương',
  'lên quản lý',
  'đi sâu chuyên môn',
  'mục tiêu tăng lương kiểu staff',
];
const CMO_FORBIDDEN_HIGHER_PATH = ['Brand Manager', 'Marketing Lead tại SME', 'Marketing Lead'];
const CEO_FORBIDDEN_HIGHER_PATH = ['Specialist', 'Executive', 'Manager', 'Head'];
const ENTRY_MANAGER_SCOPE = [
  'owns P&L',
  'budget ownership',
  'headcount planning',
  'department strategy',
  'gross margin ownership',
];

function normalize(value: string) {
  return normalizeRoleText(value);
}

function hits(text: string, terms: string[]) {
  const raw = text.toLowerCase();
  const normalized = normalize(text);
  return terms.filter((term) => raw.includes(term.toLowerCase()) || normalized.includes(normalize(term)));
}

function snippet(text: string, terms: string[]) {
  const lower = text.toLowerCase();
  const normalized = normalize(text);
  const term = terms.find((candidate) => lower.includes(candidate.toLowerCase()) || normalized.includes(normalize(candidate))) || terms[0] || '';
  const rawIndex = term ? lower.indexOf(term.toLowerCase()) : -1;
  const normalizedIndex = term ? normalized.indexOf(normalize(term)) : -1;
  const index = rawIndex >= 0 ? rawIndex : normalizedIndex;
  if (index < 0) return text.slice(0, 260).replace(/\s+/g, ' ').trim();
  return text.slice(Math.max(0, index - 140), index + 240).replace(/\s+/g, ' ').trim();
}

function renderedText(profile: RoleProfile) {
  const jobTitle = profile.title;
  const industry = profile.industry;
  const compass = getCareerCompassContext(jobTitle, SAMPLE_SALARY, SAMPLE_PERCENT, industry);
  const jobMap = buildJobJumpMap(jobTitle, SAMPLE_SALARY, SAMPLE_PERCENT, industry);
  const preview = getPremiumRolePreviewForRole(jobTitle, industry);
  const language = getRoleLanguage(jobTitle, industry);
  const insight = buildSafePremiumInsight(jobTitle, SAMPLE_SALARY, SAMPLE_PERCENT, compass.bandLabel, compass.nextBandMin, industry);
  const negotiation = getRoleAwareNegotiationScript(jobTitle, 'FALLBACK', compass.band, industry);
  const vars = {
    bandRange: compass.currentBandRange,
    nextBandMin: compass.nextBandMinFmt,
    salary: compass.salaryFmt,
    salaryGap: compass.salaryGapFmt,
  };
  return JSON.stringify({
    jobTitle,
    industry,
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

function mapText(map: JobJumpMap) {
  return map.targetRoles
    .flatMap((role) => [role.title, role.why, ...role.keywords])
    .join(' ');
}

function isEntry(level: RoleLevelBand) {
  return level === 'entry' || level === 'staff';
}

function isCmo(profile: RoleProfile) {
  return /\bcmo\b|giam doc marketing|marketing director/.test(normalize(`${profile.title} ${profile.key}`));
}

function isCeo(profile: RoleProfile) {
  return /\bceo\b|tong giam doc|general director|managing director/.test(normalize(`${profile.title} ${profile.key}`));
}

function push(failures: Failure[], profile: RoleProfile, levelBand: RoleLevelBand, reason: string, found: string[], text: string) {
  failures.push({ roleId: profile.key, title: profile.title, levelBand, reason, hits: found, sample: snippet(text, found) });
}

const failures: Failure[] = [];
const levelCounts = new Map<RoleLevelBand, number>();
const profiles = getAllRoleProfiles();

for (const profile of profiles) {
  const levelBand = inferRoleLevelBand({ jobTitle: profile.title, roleId: profile.key, industry: profile.industry });
  levelCounts.set(levelBand, (levelCounts.get(levelBand) || 0) + 1);
  const fullText = renderedText(profile);
  const roleMapText = mapText(buildJobJumpMap(profile.title, SAMPLE_SALARY, SAMPLE_PERCENT, profile.industry));

  if (isExecutiveLevel(levelBand)) {
    const forbidden = hits(fullText, EXECUTIVE_FORBIDDEN);
    if (forbidden.length) push(failures, profile, levelBand, 'executive_employee_style_framing', forbidden, fullText);

    const required = hits(fullText, EXECUTIVE_REQUIRED);
    if (required.length < 5) push(failures, profile, levelBand, 'executive_missing_scope_pl_bonus_board_language', EXECUTIVE_REQUIRED.filter((term) => !required.includes(term)), fullText);
  }

  if (isCmo(profile)) {
    const lowerPathHits = hits(roleMapText, CMO_FORBIDDEN_HIGHER_PATH);
    if (lowerPathHits.length) push(failures, profile, levelBand, 'cmo_recommends_lower_marketing_path', lowerPathHits, roleMapText);
  }

  if (isCeo(profile)) {
    const lowerPathHits = hits(roleMapText, CEO_FORBIDDEN_HIGHER_PATH);
    if (lowerPathHits.length) push(failures, profile, levelBand, 'ceo_recommends_lower_employee_path', lowerPathHits, roleMapText);
  }

  if (isEntry(levelBand)) {
    const managerScope = hits(fullText, ENTRY_MANAGER_SCOPE);
    if (managerScope.length) push(failures, profile, levelBand, 'entry_role_forced_into_manager_ownership', managerScope, fullText);
  }
}

const cmo = profiles.find(isCmo);
const ceo = profiles.find(isCeo);

const summary = {
  totalJobsChecked: profiles.length,
  levelCounts: Object.fromEntries(levelCounts),
  failures: failures.length,
  cmoResult: cmo ? failures.filter((failure) => failure.roleId === cmo.key) : [],
  ceoResult: ceo ? failures.filter((failure) => failure.roleId === ceo.key) : [],
  entryManagerIssues: failures.filter((failure) => failure.reason === 'entry_role_forced_into_manager_ownership').length,
  topFailures: failures.slice(0, 80),
};

console.log(JSON.stringify(summary, null, 2));
if (failures.length > 0 || profiles.length !== 315) process.exit(1);
