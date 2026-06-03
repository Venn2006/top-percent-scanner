import { getCareerCompassContext } from '../lib/careerCompassEngine';
import { buildJobJumpMap } from '../lib/jobJumpMap';
import { fillScript, getRoleAwareNegotiationScript } from '../lib/negotiationScripts';
import { buildSafePremiumInsight } from '../lib/reportPremiumInsight';
import { getAllRoleProfiles, getRoleProfileById, type RoleProfile } from '../lib/roleProfiles';
import {
  getPremiumRolePreviewForRole,
  getRoleLanguage,
  getSimulatorSkillsForRole,
  getWorkTiersForRole,
  type SimulatorSkillBase,
  type WorkTierBase,
} from '../lib/roleTaxonomy';

type FailureGroup = 'cross-role contamination' | 'missing required terms' | 'broken Vietnamese' | 'entry/manager mismatch';

interface Failure {
  group: FailureGroup;
  jobTitle: string;
  roleId: string;
  reason: string;
  forbiddenHits: string[];
  missingRequiredTerms: string[];
  sample: string;
}

const SAMPLE_SALARY = 8_000_000;
const SAMPLE_PERCENT = 65;

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

const HR_FORBIDDEN = [
  'recruitment funnel',
  'onboarding checklist',
  'JD analysis',
  'time-to-fill',
  'C&B benchmark',
  'headcount',
  'employee retention',
  'HR dashboard',
  'HR data/KPI',
];

const CABIN_FORBIDDEN = [
  'cabin crew',
  'senior crew',
  'purser',
  'cabin leader',
  'cabin trainer',
  'international route',
  'in-flight',
  'flight attendant',
  'cabin safety',
  'english announcement',
  'announcement tiếng Anh',
  'training cabin crew',
  'route readiness',
  'grooming cabin crew',
];

const AIRPORT_CHECKIN_FORBIDDEN = [
  'quầy check-in',
  'boarding pass',
  'DCS check-in',
  'baggage service',
  'Passenger Service Agent',
  'Ground Service Supervisor',
];

const RESTAURANT_ENTRY_MANAGER_FORBIDDEN = [
  'P&L',
  'food cost ownership',
  'labor cost ownership',
  'COGS',
  'gross margin',
  'budget ownership',
  'menu engineering ownership',
];

const MEDICAL_DENTAL_FORBIDDEN = [
  'bệnh án',
  'điều trị tủy',
  'nhổ răng',
  'X-quang nha khoa',
  'phòng khám nha khoa',
];

const TECHNICAL_FORBIDDEN = [
  'block máy',
  'gas lạnh',
  'dàn nóng',
  'dàn lạnh',
  'board mạch',
  'đo dòng điện',
  'OBD',
];

const BROKEN_VIETNAMESE = [
  'ho chieu',
  'hanh ly',
  'quay check-in',
  'co KPI',
  'bang chung',
  'luong',
  'khach',
  'can gate',
  'can supervisor',
  'tu thao tac',
  'toi uu',
  'nhay viec',
  'phong van',
  'chung minh',
  'ky nang',
];

const ENTRY_FORBIDDEN = [
  'owns P&L',
  'budget ownership',
  'headcount planning',
  'department strategy',
  'hiring plan',
  'manager dashboard',
  'gross margin ownership',
];

const MANAGER_REQUIRED = ['KPI', 'reporting', 'team', 'process', 'cost', 'revenue', 'quality', 'schedule', 'training', 'audit'];

const RISKY_REQUIRED: Array<{
  roleId: string;
  label: string;
  minHits: number;
  terms: string[];
  forbidden?: string[];
  forbiddenLabel?: string;
}> = [
  {
    roleId: 'nhan vien check-in san bay__van tai - logistics',
    label: 'Nhân viên check-in sân bay',
    minHits: 5,
    terms: ['check-in', 'boarding pass', 'hộ chiếu', 'visa', 'hành lý', 'quầy check-in', 'hành khách', 'passenger service', 'supervisor', 'gate', 'baggage'],
    forbidden: CABIN_FORBIDDEN,
    forbiddenLabel: 'cabin_forbidden_for_checkin',
  },
  {
    roleId: 'tiep vien hang khong__van tai - logistics',
    label: 'Tiếp viên hàng không',
    minHits: 3,
    terms: ['cabin crew', 'cabin safety', 'service recovery', 'announcement', 'grooming', 'in-flight', 'purser'],
    forbidden: AIRPORT_CHECKIN_FORBIDDEN,
    forbiddenLabel: 'checkin_counter_forbidden_for_flight_attendant',
  },
  {
    roleId: 'nha si__y te - cham soc suc khoe',
    label: 'Nha sĩ',
    minHits: 4,
    terms: ['răng', 'bệnh án', 'điều trị', 'phòng khám', 'X-quang', 'tư vấn điều trị', 'vô khuẩn'],
    forbidden: HR_FORBIDDEN,
    forbiddenLabel: 'hr_forbidden_for_dentist',
  },
  {
    roleId: 'nhan vien phuc vu ban (waiter/waitress)__nha hang - khach san - du lich',
    label: 'Nhân viên phục vụ nhà hàng',
    minHits: 4,
    terms: ['khách', 'bàn', 'order', 'menu', 'POS', 'phục vụ món', 'dọn bàn', 'upsell'],
    forbidden: RESTAURANT_ENTRY_MANAGER_FORBIDDEN,
    forbiddenLabel: 'restaurant_manager_ownership_forbidden_for_server',
  },
  {
    roleId: 'quan ly nha hang__nha hang - khach san - du lich',
    label: 'Quản lý nhà hàng',
    minHits: 4,
    terms: ['food cost', 'labor cost', 'tồn kho', 'SOP', 'doanh thu theo ca', 'complaint', 'lịch làm việc', 'KPI', 'team'],
  },
  {
    roleId: 'quan ly trung tam ngoai ngu__giao duc',
    label: 'Quản lý trung tâm ngoại ngữ',
    minHits: 4,
    terms: ['tuyển sinh', 'lớp học', 'giáo viên', 'học viên', 'phụ huynh', 'lịch học', 'doanh thu trung tâm', 'tỷ lệ tái tục', 'vận hành trung tâm'],
  },
];

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9+#&/.\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hits(text: string, terms: string[]) {
  const raw = text.toLowerCase();
  const normalizedText = normalize(text);
  return terms.filter((term) => raw.includes(term.toLowerCase()) || normalizedText.includes(normalize(term)));
}

function brokenHits(text: string) {
  const raw = text.replace(/topluong\.com/gi, '').toLowerCase();
  return BROKEN_VIETNAMESE.filter((term) => raw.includes(term.toLowerCase()));
}

function firstSnippet(text: string, terms: string[]) {
  const lower = text.toLowerCase();
  const term = terms.find((candidate) => lower.includes(candidate.toLowerCase())) || terms[0] || '';
  const index = term ? lower.indexOf(term.toLowerCase()) : -1;
  if (index < 0) return text.slice(0, 260).replace(/\s+/g, ' ').trim();
  return text.slice(Math.max(0, index - 120), index + 220).replace(/\s+/g, ' ').trim();
}

function hasAny(text: string, terms: string[]) {
  return hits(text, terms).length > 0;
}

function isHrRole(profile: RoleProfile) {
  const identity = normalize(`${profile.title} ${profile.industry || ''} ${profile.segment}`);
  return profile.segment === 'hr' || /\bhr\b|nhan su|tuyen dung|headhunter|c&b|compensation|benefit/.test(identity);
}

function isFlightAttendant(profile: RoleProfile) {
  return profile.key === 'tiep vien hang khong__van tai - logistics';
}

function isPilotRole(profile: RoleProfile) {
  const identity = normalize(`${profile.title} ${profile.industry || ''} ${profile.segment}`);
  return profile.segment === 'pilot' || /phi cong|pilot|flight deck|captain bay|co pho/.test(identity);
}

function isAirportGround(profile: RoleProfile) {
  return profile.key === 'nhan vien check-in san bay__van tai - logistics';
}

function isHealthcare(profile: RoleProfile) {
  const identity = normalize(`${profile.title} ${profile.industry || ''} ${profile.segment}`);
  return ['healthcare', 'pharma_chemical'].includes(profile.segment) || /y te|cham soc suc khoe|duoc|nha si|dieu duong|x-quang|xet nghiem|dinh duong|thu y/.test(identity);
}

function isTechnical(profile: RoleProfile) {
  const technicalSegments = new Set(['it', 'semiconductor', 'engineering', 'blue_collar', 'construction', 'environment_energy', 'agriculture', 'pilot', 'logistics', 'security']);
  const identity = normalize(`${profile.title} ${profile.industry || ''} ${profile.segment}`);
  return technicalSegments.has(profile.segment) || /ky thuat|ky su|tho |dien lanh|co khi|bao tri|o to|xay dung|mep|noc|network|engineer|technician/.test(identity);
}

function isRestaurantEntryRole(profile: RoleProfile) {
  return [
    'nhan vien phuc vu ban (waiter/waitress)__nha hang - khach san - du lich',
    'barista (pha che ca phe)__nha hang - khach san - du lich',
    'phu bep__nha hang - khach san - du lich',
  ].includes(profile.key);
}

function isManagerRole(profile: RoleProfile) {
  const identity = normalize(`${profile.title} ${profile.industry || ''}`);
  return /quan ly|truong phong|giam doc|manager|director|lead|supervisor|head|chief|ceo|cfo|cto|cmo|vp|founder|owner|chu cua hang|chu xuong|bep truong|truong kho|quan doc|hieu truong/.test(identity);
}

function isEntryRole(profile: RoleProfile) {
  const identity = normalize(`${profile.title} ${profile.industry || ''}`);
  if (isManagerRole(profile)) return false;
  return /nhan vien|tro ly|tro giang|phu bep|barista|thu ngan|le tan|cong nhan|tho |tai xe|shipper|telesales|giao dich vien|agent|junior|assistant|entry/.test(identity);
}

function buildRenderedReportText(profile: RoleProfile) {
  const jobTitle = profile.title;
  const industry = profile.industry;
  const compass = getCareerCompassContext(jobTitle, SAMPLE_SALARY, SAMPLE_PERCENT, industry);
  const jobMap = buildJobJumpMap(jobTitle, SAMPLE_SALARY, SAMPLE_PERCENT, industry);
  const negotiation = getRoleAwareNegotiationScript(jobTitle, 'FALLBACK', compass.band, industry);
  const scriptVars = {
    bandRange: compass.currentBandRange,
    nextBandMin: compass.nextBandMinFmt,
    salary: compass.salaryFmt,
    salaryGap: compass.salaryGapFmt,
  };

  const rendered = {
    jobTitle,
    industry,
    premiumPreview: getPremiumRolePreviewForRole(jobTitle, industry),
    insightRieng: buildSafePremiumInsight(jobTitle, SAMPLE_SALARY, SAMPLE_PERCENT, compass.bandLabel, compass.nextBandMin, industry),
    banDoRoleTraCaoHon: {
      headline: jobMap.headline,
      summary: jobMap.summary,
      targetRoles: jobMap.targetRoles,
      cvBulletsNenSuaNgay: jobMap.cvBullets,
      cauAnchorLuong: jobMap.interviewAnchor,
      neuChuaNhayViecNgay: jobMap.internalRaiseAngle,
    },
    jobMapCareerLadder: compass.careerLadder,
    banDangODay: compass.bandLabel,
    marketInsight: compass.marketInsight,
    opportunity: compass.opportunity,
    topSkillGap: compass.topSkillGap,
    nextMilestone: compass.nextMilestone,
    simulatorSkills: getSimulatorSkillsForRole(jobTitle, DEFAULT_SKILLS, industry).map((skill) => skill.label),
    workTiers: getWorkTiersForRole(jobTitle, DEFAULT_TIERS, industry).map((tier) => tier.name),
    roleLanguage: getRoleLanguage(jobTitle, industry),
    negotiation: {
      interview: fillScript(negotiation.interview, scriptVars),
      raise: fillScript(negotiation.raise, scriptVars),
      tip: fillScript(negotiation.tip, scriptVars),
    },
  };

  return flattenUserFacingStrings(rendered).join('\n');
}

function flattenUserFacingStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) return [];
  if (Array.isArray(value)) return value.flatMap((item) => flattenUserFacingStrings(item));
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).flatMap((item) => flattenUserFacingStrings(item));
  return [];
}

function pushFailure(failures: Failure[], group: FailureGroup, profile: RoleProfile, reason: string, forbiddenHits: string[], missingRequiredTerms: string[], text: string) {
  failures.push({
    group,
    jobTitle: profile.title,
    roleId: profile.key,
    reason,
    forbiddenHits,
    missingRequiredTerms,
    sample: firstSnippet(text, [...forbiddenHits, ...missingRequiredTerms]),
  });
}

function auditProfile(profile: RoleProfile, text: string): Failure[] {
  const failures: Failure[] = [];

  if (!isHrRole(profile)) {
    const found = hits(text, HR_FORBIDDEN).filter((term) => !(term === 'headcount' && isManagerRole(profile)));
    if (found.length) pushFailure(failures, 'cross-role contamination', profile, 'hr_terms_for_non_hr_role', found, [], text);
  }

  if (!isFlightAttendant(profile)) {
    const found = hits(text, CABIN_FORBIDDEN).filter((term) => !(term === 'route readiness' && isPilotRole(profile)));
    if (found.length) pushFailure(failures, 'cross-role contamination', profile, 'cabin_terms_for_non_flight_attendant', found, [], text);
  }

  if (!isAirportGround(profile)) {
    const found = hits(text, AIRPORT_CHECKIN_FORBIDDEN);
    if (found.length) pushFailure(failures, 'cross-role contamination', profile, 'airport_checkin_terms_for_non_airport_ground_role', found, [], text);
  }

  if (isRestaurantEntryRole(profile)) {
    const found = hits(text, RESTAURANT_ENTRY_MANAGER_FORBIDDEN);
    if (found.length) pushFailure(failures, 'cross-role contamination', profile, 'restaurant_manager_ownership_for_entry_service_role', found, [], text);
  }

  if (!isHealthcare(profile)) {
    const found = hits(text, MEDICAL_DENTAL_FORBIDDEN);
    if (found.length) pushFailure(failures, 'cross-role contamination', profile, 'medical_dental_terms_for_non_healthcare_role', found, [], text);
  }

  if (!isTechnical(profile)) {
    const found = hits(text, TECHNICAL_FORBIDDEN);
    if (found.length) pushFailure(failures, 'cross-role contamination', profile, 'technical_terms_for_non_technical_role', found, [], text);
  }

  const broken = brokenHits(text);
  if (broken.length) pushFailure(failures, 'broken Vietnamese', profile, 'broken_no_diacritic_display_phrases', broken, [], text);

  if (isEntryRole(profile)) {
    const found = hits(text, ENTRY_FORBIDDEN);
    if (found.length) pushFailure(failures, 'entry/manager mismatch', profile, 'manager_scope_for_entry_role', found, [], text);
  }

  if (isManagerRole(profile) && !hasAny(text, MANAGER_REQUIRED)) {
    pushFailure(failures, 'entry/manager mismatch', profile, 'manager_role_missing_manager_language', [], MANAGER_REQUIRED, text);
  }

  const risky = RISKY_REQUIRED.find((item) => item.roleId === profile.key);
  if (risky) {
    const requiredHits = hits(text, risky.terms);
    const missing = risky.terms.filter((term) => !requiredHits.includes(term));
    if (requiredHits.length < risky.minHits) {
      pushFailure(failures, 'missing required terms', profile, `${risky.label}_required_terms_min_${risky.minHits}`, [], missing, text);
    }
    if (risky.forbidden?.length) {
      const found = hits(text, risky.forbidden);
      if (found.length) pushFailure(failures, 'cross-role contamination', profile, risky.forbiddenLabel || `${risky.label}_forbidden_terms`, found, [], text);
    }
  }

  return failures;
}

function countDuplicates(values: string[]) {
  const counts = new Map<string, number>();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
  return Array.from(counts.entries()).filter(([, count]) => count > 1).map(([value, count]) => ({ value, count }));
}

const profiles = getAllRoleProfiles();
const roleIds = profiles.map((profile) => profile.key);
const duplicateRoleIds = countDuplicates(roleIds);
const missingRoleIds = profiles.filter((profile) => !profile.key || !getRoleProfileById(profile.key));

const allFailures: Failure[] = [];
const riskyRoleResults: Record<string, { passed: boolean; requiredHits: string[]; forbiddenHits: string[]; brokenHits: string[] }> = {};

for (const profile of profiles) {
  const text = buildRenderedReportText(profile);
  const failures = auditProfile(profile, text);
  allFailures.push(...failures);

  const risky = RISKY_REQUIRED.find((item) => item.roleId === profile.key);
  if (risky) {
    riskyRoleResults[risky.label] = {
      passed: failures.length === 0,
      requiredHits: hits(text, risky.terms),
      forbiddenHits: risky.forbidden ? hits(text, risky.forbidden) : [],
      brokenHits: brokenHits(text),
    };
  }
}

const groupCounts: Record<FailureGroup, number> = {
  'cross-role contamination': 0,
  'missing required terms': 0,
  'broken Vietnamese': 0,
  'entry/manager mismatch': 0,
};
allFailures.forEach((failure) => { groupCounts[failure.group] += 1; });

const summary = {
  counts: {
    jobsChecked: profiles.length,
    jobsWithRoleId: profiles.filter((profile) => Boolean(profile.key)).length,
    missingRoleId: missingRoleIds.length,
    duplicateRoleId: duplicateRoleIds.length,
    roleProfiles: profiles.length,
    duplicateRoleProfileKey: duplicateRoleIds.length,
  },
  audit: {
    totalFailedJobs: new Set(allFailures.map((failure) => failure.roleId)).size,
    totalFailures: allFailures.length,
    crossRoleContamination: groupCounts['cross-role contamination'],
    missingRequiredTerms: groupCounts['missing required terms'],
    brokenVietnamese: groupCounts['broken Vietnamese'],
    entryManagerMismatch: groupCounts['entry/manager mismatch'],
  },
  riskyRoleResults,
  top50Failures: allFailures.slice(0, 50),
};

console.log(JSON.stringify(summary, null, 2));

if (
  profiles.length !== 315 ||
  missingRoleIds.length > 0 ||
  duplicateRoleIds.length > 0 ||
  allFailures.length > 0
) {
  process.exit(1);
}
