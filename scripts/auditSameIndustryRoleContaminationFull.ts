import { getCareerCompassContext } from '../lib/careerCompassEngine';
import { buildJobJumpMap } from '../lib/jobJumpMap';
import { fillScript, getRoleAwareNegotiationScript } from '../lib/negotiationScripts';
import { buildSafePremiumInsight } from '../lib/reportPremiumInsight';
import { getAllRoleProfiles, type RoleProfile } from '../lib/roleProfiles';
import {
  getPremiumRolePreviewForRole,
  getRoleLanguage,
  getSimulatorSkillsForRole,
  getWorkTiersForRole,
  type SimulatorSkillBase,
  type WorkTierBase,
} from '../lib/roleTaxonomy';

type Family = 'education/school' | 'F&B' | 'healthcare' | 'accounting/finance' | 'sales/retail' | 'logistics/aviation' | 'technical' | 'marketing' | 'HR' | 'generic';

interface ManualRule {
  family: Family;
  keys: string[];
  required?: string[];
  minRequired?: number;
  forbidden?: string[];
  reason: string;
}

interface Failure {
  jobTitle: string;
  roleId: string;
  family: Family;
  reason: string;
  ownHits: string[];
  siblingRoleId?: string;
  siblingTitle?: string;
  siblingHits: string[];
  forbiddenHits: string[];
  missingRequiredTerms: string[];
  sample: string;
}

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

const GENERIC_TERMS = new Set([
  'kpi', 'bao cao', 'quy trinh', 'dich vu', 'khach hang', 'khach', 'feedback', 'sop', 'dashboard',
  'team', 'training', 'portfolio', 'case', 'log', 'ho so', 'bang chung', 'quality', 'process',
  'stakeholder', 'review', 'lead', 'senior', 'manager', 'specialist', 'staff', 'nhan vien',
  'quan ly', 'chuyen vien', 'cong viec', 'ket qua', 'du lieu', 'thoi gian', 'doanh thu',
  'hanh dong', 'ung vien', 'phu hop', 'thi truong', 'muc tieu', 'role', 'career', 'salary',
  'output', 'owner', 'scope', 'track', 'premium', 'junior', 'entry', 'ca', 'nghe', 'thang',
]);

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u0111\u0110]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9+#&/.\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function includesTerm(text: string, term: string) {
  const normalizedText = normalize(text);
  const normalizedTerm = normalize(term);
  if (!normalizedTerm) return false;
  const escaped = normalizedTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(normalizedText);
}

function hits(text: string, terms: string[]) {
  const raw = text.toLowerCase();
  const normalizedText = normalize(text);
  return Array.from(new Set(terms.filter((term) => raw.includes(term.toLowerCase()) || normalizedText.includes(normalize(term)))));
}

function phraseTerms(value: string) {
  const normalized = normalize(value);
  const words = normalized.split(' ').filter(Boolean);
  const terms = new Set<string>();
  for (let i = 0; i < words.length; i += 1) {
    for (const len of [1, 2, 3, 4]) {
      const phrase = words.slice(i, i + len).join(' ');
      if (!phrase || phrase.length < 5 || GENERIC_TERMS.has(phrase)) continue;
      if (/^\d+$/.test(phrase)) continue;
      terms.add(phrase);
    }
  }
  return terms;
}

function corpus(profile: RoleProfile) {
  return [
    profile.title,
    profile.industry || '',
    ...profile.skills,
    ...profile.tiers,
    profile.preview?.coreSkill || '',
    profile.preview?.path || '',
    profile.preview?.firstAction || '',
    profile.preview?.cvBullet || '',
    ...(profile.preview?.skills || []),
    profile.language?.rolePath || '',
    profile.language?.mainSkill || '',
    profile.language?.proofAsset || '',
    profile.language?.opportunityList || '',
    profile.language?.productWord || '',
    profile.language?.portfolioWord || '',
    profile.language?.kpiGuidance || '',
  ].join('\n');
}

function ownProfileTerms(profile: RoleProfile) {
  return Array.from(phraseTerms(corpus(profile))).filter((term) => term.includes(' ') || term.length >= 6).slice(0, 120);
}

function flatten(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) return [];
  if (Array.isArray(value)) return value.flatMap(flatten);
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).flatMap(flatten);
  return [];
}

function renderReportText(profile: RoleProfile) {
  const salary = 8_000_000;
  const percent = 65;
  const compass = getCareerCompassContext(profile.title, salary, percent, profile.industry);
  const jobMap = buildJobJumpMap(profile.title, salary, percent, profile.industry);
  const negotiation = getRoleAwareNegotiationScript(profile.title, 'FALLBACK', compass.band, profile.industry);
  const scriptVars = {
    bandRange: compass.currentBandRange,
    nextBandMin: compass.nextBandMinFmt,
    salary: compass.salaryFmt,
    salaryGap: compass.salaryGapFmt,
  };
  return flatten({
    insightRieng: buildSafePremiumInsight(profile.title, salary, percent, compass.bandLabel, compass.nextBandMin, profile.industry),
    premiumPreview: getPremiumRolePreviewForRole(profile.title, profile.industry),
    banDoRoleTraCaoHon: {
      headline: jobMap.headline,
      summary: jobMap.summary,
      targetRoles: jobMap.targetRoles,
      cvBulletsNenSuaNgay: jobMap.cvBullets,
      cauAnchorLuong: jobMap.interviewAnchor,
      neuChuaNhayViecNgay: jobMap.internalRaiseAngle,
    },
    careerLadder: compass.careerLadder,
    banDangODay: compass.bandLabel,
    marketInsight: compass.marketInsight,
    opportunity: compass.opportunity,
    topSkillGap: compass.topSkillGap,
    nextMilestone: compass.nextMilestone,
    simulatorSkills: getSimulatorSkillsForRole(profile.title, DEFAULT_SKILLS, profile.industry).map((skill) => skill.label),
    workTiers: getWorkTiersForRole(profile.title, DEFAULT_TIERS, profile.industry).map((tier) => tier.name),
    roleLanguage: getRoleLanguage(profile.title, profile.industry),
    negotiation: {
      interview: fillScript(negotiation.interview, scriptVars),
      raise: fillScript(negotiation.raise, scriptVars),
      tip: fillScript(negotiation.tip, scriptVars),
    },
  }).join('\n');
}

function firstSnippet(text: string, terms: string[]) {
  const term = terms.find((candidate) => includesTerm(text, candidate)) || terms[0] || '';
  const index = term ? normalize(text).indexOf(normalize(term)) : -1;
  if (index < 0) return text.slice(0, 260).replace(/\s+/g, ' ').trim();
  return text.slice(Math.max(0, index - 140), index + 260).replace(/\s+/g, ' ').trim();
}

function profileGroupKey(profile: RoleProfile) {
  return profile.industry || profile.industryKey || profile.segment || 'unknown';
}

function familyForProfile(profile: RoleProfile): Family {
  const text = normalize(`${profile.title} ${profile.industry || ''} ${profile.segment}`);
  if (/giao duc|truong hoc|y te truong hoc|teacher|mentor|du hoc|tuyen sinh|ngoai ngu|hoc vien|phu huynh|lop hoc/.test(text)) return 'education/school';
  if (/nha hang|khach san|du lich|bartender|barista|bep|phuc vu/.test(text)) return 'F&B';
  if (/y te|cham soc suc khoe|nha si|dieu duong|duoc|xet nghiem/.test(text)) return 'healthcare';
  if (/ke toan|tai chinh|cfo|accounting|finance/.test(text)) return 'accounting/finance';
  if (/ban le|sieu thi|ban hang|sales|cua hang|retail/.test(text)) return 'sales/retail';
  if (/logistics|van tai|kho|hang khong|phi cong|check-in/.test(text)) return 'logistics/aviation';
  if (/ky thuat|dien lanh|dien tu|o to|software|it|mep|engineer|developer/.test(text)) return 'technical';
  if (/marketing|brand|cmo|content|seo/.test(text)) return 'marketing';
  if (/nhan su|hr|tuyen dung|c&b/.test(text)) return 'HR';
  return 'generic';
}

const MANUAL_RULES: ManualRule[] = [
  {
    family: 'education/school',
    keys: ['nhan vien y te truong hoc__y te - cham soc suc khoe'],
    required: ['so cuu', 'ho so suc khoe', 'y te hoc duong', 'theo doi suc khoe hoc sinh', 'thuoc', 'phong y te', 'tai nan hoc duong', 'phoi hop phu huynh', 'benh truyen nhiem', 'kham suc khoe dinh ky'],
    minRequired: 5,
    forbidden: ['giao an', 'giang day', 'cham bai', 'lop hoc tieng anh', 'lesson plan', 'mentor', 'tutor', 'ielts', 'cambridge', 'tuyen sinh', 'sales admission'],
    reason: 'school_healthcare_must_not_be_teacher_or_admissions',
  },
  {
    family: 'education/school',
    keys: ['giao vien tieu hoc__giao duc', 'giao vien tieng anh__giao duc', 'giao vien mam non__giao duc'],
    forbidden: ['so cuu y te', 'ho so suc khoe', 'phong y te', 'thuoc', 'benh truyen nhiem', 'kham suc khoe dinh ky'],
    reason: 'teacher_must_not_be_school_healthcare',
  },
  {
    family: 'education/school',
    keys: ['nhan vien tu van du hoc__giao duc'],
    required: ['tu van du hoc', 'study abroad', 'ho so', 'visa', 'checklist', 'crm follow-up', 'offer/visa', 'admissions', 'enrollment', 'shortlist truong'],
    minRequired: 5,
    forbidden: ['giang day', 'cham bai', 'giao an', 'so cuu', 'ho so suc khoe', 'quay check-in', 'boarding pass'],
    reason: 'study_abroad_consultant_must_not_be_teacher_healthcare_or_airport',
  },
  {
    family: 'education/school',
    keys: ['quan ly trung tam ngoai ngu__giao duc'],
    required: ['tuyen sinh', 'lich hoc', 'giao vien', 'hoc vien', 'phu huynh', 'tai tuc', 'doanh thu trung tam', 'van hanh trung tam', 'xep lop', 'chat luong lop hoc'],
    minRequired: 5,
    forbidden: ['chi giang day', 'cham bai', 'giao an ca nhan', 'mentor 1-1 thuan', 'so cuu y te'],
    reason: 'language_center_manager_must_not_be_teacher_only',
  },

  { family: 'F&B', keys: ['bartender__nha hang - khach san - du lich'], required: ['bartender', 'pha che', 'cocktail', 'mocktail', 'do uong', 'quay bar', 'bar station', 'recipe', 'dinh luong', 'garnish', 'upsell', 'pos', 'ton kho quay bar', 've sinh quay bar', 'speed of service', 'khach hang'], minRequired: 5, forbidden: ['dau bep', 'sous chef', 'bep truong', 'kitchen manager', 'ca truong bep', 'phu bep', 'bep chinh', 'mise en place', 'so che', 'ra mon', 'kitchen kpi', 'food cost ownership', 'p&l', 'labor cost ownership', 'bep nong', 'bep lanh'], reason: 'bartender_must_not_be_kitchen' },
  { family: 'F&B', keys: ['barista (pha che ca phe)__nha hang - khach san - du lich'], required: ['barista', 'ca phe', 'espresso', 'recipe', 'do uong', 'quay bar', 'ticket time', 'wastage', 'upsell'], minRequired: 4, forbidden: ['dau bep', 'sous chef', 'bep truong', 'kitchen manager', 'mise en place', 'so che'], reason: 'barista_must_not_be_chef_kitchen' },
  { family: 'F&B', keys: ['phu bep__nha hang - khach san - du lich'], required: ['phu bep', 'so che', 'bao quan', 'dinh luong', 've sinh khu vuc', 'ban giao ca'], minRequired: 4, forbidden: ['bartender', 'cocktail', 'mocktail', 'mixologist', 'p&l', 'food cost ownership'], reason: 'prep_cook_must_not_be_bar_or_manager' },
  { family: 'F&B', keys: ['nhan vien phuc vu ban (waiter/waitress)__nha hang - khach san - du lich'], required: ['khach', 'ban', 'order', 'menu', 'pos', 'phuc vu mon', 'don ban', 'upsell'], minRequired: 4, forbidden: ['p&l', 'food cost ownership', 'labor cost ownership'], reason: 'server_must_not_own_manager_metrics' },
  { family: 'F&B', keys: ['quan ly nha hang__nha hang - khach san - du lich'], required: ['food cost', 'labor cost', 'ton kho', 'sop', 'kpi', 'team', 'complaint'], minRequired: 5, reason: 'restaurant_manager_requires_manager_terms' },

  { family: 'healthcare', keys: ['nha si__y te - cham soc suc khoe'], required: ['rang', 'benh an nha khoa', 'dieu tri', 'x-quang', 'phong kham', 'vo khuan', 'tu van dieu tri'], minRequired: 4, forbidden: ['giang day', 'giao an', 'recruitment', 'hr dashboard', 'ban thuoc tai quay'], reason: 'dentist_must_not_be_hr_teacher_or_pharmacy_counter' },
  { family: 'healthcare', keys: ['dieu duong vien__y te - cham soc suc khoe'], forbidden: ['dieu tri tuy', 'nho rang', 'tram composite', 'ke don thuoc doc lap', 'giao an'], reason: 'nurse_must_not_be_doctor_dentist_or_teacher' },

  { family: 'accounting/finance', keys: ['ke toan thanh toan__ke toan - kiem toan - tai chinh', 'ke toan thue__ke toan - kiem toan - tai chinh', 'ke toan tong hop__ke toan - kiem toan - tai chinh'], forbidden: ['cfo', 'finance director', 'p&l owner', 'board reporting', 'capital strategy', 'headcount ownership'], reason: 'accountants_must_not_be_cfo' },
  { family: 'accounting/finance', keys: ['ke toan truong__ke toan - kiem toan - tai chinh'], required: ['closing calendar', 'tax/audit compliance', 'control checklist', 'team ke toan', 'cashflow', 'dashboard', 'ban giam doc', 'controller', 'internal control'], minRequired: 4, reason: 'chief_accountant_requires_control_scope' },
  { family: 'accounting/finance', keys: ['cfo (giam doc tai chinh)__ke toan - kiem toan - tai chinh'], required: ['cashflow', 'p&l', 'capital', 'board', 'budget', 'forecast', 'financial strategy'], minRequired: 4, reason: 'cfo_requires_executive_finance_scope' },

  { family: 'sales/retail', keys: ['nhan vien ban hang sieu thi__ban le - sieu thi'], forbidden: ['quan ly ca', 'doanh thu cua hang', 'lich nhan su', 'ton kho toan cua hang', 'p&l', 'team kpi ownership'], reason: 'retail_staff_must_not_be_store_manager' },
  { family: 'sales/retail', keys: ['quan ly cua hang__ban le - sieu thi'], required: ['doanh thu cua hang', 'ton kho', 'lich ca', 'team', 'kpi', 'trung bay', 'that thoat', 'complaint'], minRequired: 4, reason: 'store_manager_requires_store_ops_terms' },

  { family: 'logistics/aviation', keys: ['nhan vien kho van__van tai - logistics'], forbidden: ['quan ly kho toan bo', 'inventory strategy', 'team kpi ownership', 'flight attendant', 'cabin crew', 'boarding pass'], reason: 'warehouse_staff_must_not_be_manager_or_aviation' },
  { family: 'logistics/aviation', keys: ['truong kho__chuoi cung ung - logistics'], required: ['ton kho', 'layout kho', 'cycle count', 'nhap xuat', 'team kho', 'kpi kho', 'that thoat', 'sop'], minRequired: 4, reason: 'warehouse_manager_requires_manager_terms' },
  { family: 'logistics/aviation', keys: ['nhan vien check-in san bay__van tai - logistics'], forbidden: ['cabin crew', 'purser', 'senior crew', 'flight attendant'], reason: 'airport_checkin_must_not_be_cabin' },
  { family: 'logistics/aviation', keys: ['tiep vien hang khong__van tai - logistics'], forbidden: ['quay check-in', 'boarding pass', 'passenger service agent', 'ground service supervisor'], reason: 'flight_attendant_must_not_be_checkin' },

  { family: 'technical', keys: ['ky thuat vien dien lanh__ky thuat - tho lanh nghe'], forbidden: ['board mach dien tu chuyen sau', 'obd', 'dong co o to', 'software deployment', 'benh an'], reason: 'hvac_technician_must_not_be_electronics_auto_software_or_healthcare' },
  { family: 'technical', keys: ['tho sua chua o to / co khi o to__ky thuat - tho lanh nghe'], forbidden: ['gas lanh dan dung', 'dan lanh dan dung', 'board mach dien tu laptop', 'benh an'], reason: 'auto_mechanic_must_not_be_hvac_electronics_or_healthcare' },

  { family: 'marketing', keys: ['chuyen vien marketing__marketing - truyen thong', 'chuyen vien digital marketing__marketing - truyen thong', 'chuyen vien content marketing__marketing - truyen thong', 'chuyen vien chay quang cao (performance marketing)__marketing - truyen thong', 'chuyen vien seo__marketing - truyen thong'], forbidden: ['chief marketing officer', 'cmo larger scope', 'fractional cmo', 'board growth advisor'], reason: 'marketing_staff_must_not_be_cmo' },
  { family: 'marketing', keys: ['cmo (giam doc marketing)__quan tri dieu hanh'], required: ['growth mandate', 'revenue', 'budget', 'board', 'compensation package'], minRequired: 3, forbidden: ['junior marketing', 'campaign execution only'], reason: 'cmo_requires_executive_scope' },

  { family: 'HR', keys: ['chuyen vien tuyen dung__nhan su'], forbidden: ['hr director', 'people director', 'head of hr', 'department strategy'], reason: 'recruiter_must_not_be_hr_director' },
  { family: 'HR', keys: ['chuyen vien c&b (luong thuong & phuc loi)__nhan su'], required: ['c&b', 'luong', 'phuc loi', 'benchmark', 'payroll'], minRequired: 3, forbidden: ['recruiter funnel only'], reason: 'cb_must_not_be_recruiter_only' },
  { family: 'HR', keys: ['truong phong nhan su__nhan su'], required: ['hr', 'dashboard', 'team', 'retention', 'policy', 'c&b'], minRequired: 3, forbidden: ['recruiter-only', 'chi tuyen dung'], reason: 'hr_director_must_not_be_recruiter_only' },
];

const profiles = getAllRoleProfiles();
const byKey = new Map(profiles.map((profile) => [profile.key, profile]));
const profilesByGroup = new Map<string, RoleProfile[]>();
for (const profile of profiles) {
  const key = profileGroupKey(profile);
  profilesByGroup.set(key, [...(profilesByGroup.get(key) || []), profile]);
}

const manualKeys = new Set(MANUAL_RULES.flatMap((rule) => rule.keys));
const failures: Failure[] = [];
const coverage = { explicitRules: 0, genericOwnProfile: 0, noMeaningfulCoverage: 0 };
const familyFailures: Record<Family, number> = {
  'education/school': 0,
  'F&B': 0,
  healthcare: 0,
  'accounting/finance': 0,
  'sales/retail': 0,
  'logistics/aviation': 0,
  technical: 0,
  marketing: 0,
  HR: 0,
  generic: 0,
};

function pushFailure(failure: Failure) {
  failures.push(failure);
  familyFailures[failure.family] += 1;
}

const renderedByKey = new Map<string, string>();
const termsByKey = new Map<string, string[]>();
for (const profile of profiles) {
  renderedByKey.set(profile.key, renderReportText(profile));
  termsByKey.set(profile.key, ownProfileTerms(profile));
}

for (const profile of profiles) {
  const text = renderedByKey.get(profile.key) || '';
  const family = familyForProfile(profile);
  const ownTerms = termsByKey.get(profile.key) || [];
  const ownHits = hits(text, ownTerms).slice(0, 25);
  const ownMin = ownTerms.length >= 4 ? 4 : Math.min(3, ownTerms.length);

  if (manualKeys.has(profile.key)) coverage.explicitRules += 1;
  else if (ownTerms.length >= 3) coverage.genericOwnProfile += 1;
  else coverage.noMeaningfulCoverage += 1;

  if (ownMin > 0 && ownHits.length < ownMin) {
    pushFailure({
      jobTitle: profile.title,
      roleId: profile.key,
      family,
      reason: `own_profile_terms_min_${ownMin}`,
      ownHits,
      siblingHits: [],
      forbiddenHits: [],
      missingRequiredTerms: ownTerms.filter((term) => !ownHits.includes(term)).slice(0, 20),
      sample: firstSnippet(text, ownTerms),
    });
  }

  const siblings = (profilesByGroup.get(profileGroupKey(profile)) || []).filter((sibling) => sibling.key !== profile.key);
  for (const sibling of siblings) {
    const siblingTerms = (termsByKey.get(sibling.key) || [])
      .filter((term) => !GENERIC_TERMS.has(normalize(term)))
      .filter((term) => !ownTerms.includes(term))
      .filter((term) => term.length >= 5)
      .slice(0, 80);
    const siblingHits = hits(text, siblingTerms).slice(0, 25);
    const siblingDistinctiveThreshold = manualKeys.has(profile.key) ? 3 : 5;
    if (siblingHits.length >= siblingDistinctiveThreshold && siblingHits.length > ownHits.length) {
      pushFailure({
        jobTitle: profile.title,
        roleId: profile.key,
        family,
        reason: 'dominant_sibling_profile_terms',
        ownHits,
        siblingRoleId: sibling.key,
        siblingTitle: sibling.title,
        siblingHits,
        forbiddenHits: [],
        missingRequiredTerms: [],
        sample: firstSnippet(text, siblingHits),
      });
      break;
    }
  }
}

for (const rule of MANUAL_RULES) {
  for (const key of rule.keys) {
    const profile = byKey.get(key);
    if (!profile) {
      pushFailure({ jobTitle: key, roleId: key, family: rule.family, reason: 'missing_profile_for_manual_rule', ownHits: [], siblingHits: [], forbiddenHits: [], missingRequiredTerms: [], sample: '' });
      continue;
    }
    const text = renderedByKey.get(profile.key) || '';
    const requiredHits = rule.required ? hits(text, rule.required) : [];
    const forbiddenHits = rule.forbidden ? hits(text, rule.forbidden) : [];
    const missingRequiredTerms = rule.required ? rule.required.filter((term) => !requiredHits.includes(term)) : [];
    if ((rule.minRequired || 0) > requiredHits.length || forbiddenHits.length > 0) {
      pushFailure({
        jobTitle: profile.title,
        roleId: profile.key,
        family: rule.family,
        reason: rule.reason,
        ownHits: hits(text, termsByKey.get(profile.key) || []).slice(0, 25),
        siblingHits: [],
        forbiddenHits,
        missingRequiredTerms,
        sample: firstSnippet(text, [...forbiddenHits, ...missingRequiredTerms]),
      });
    }
  }
}

if (coverage.noMeaningfulCoverage > 0) {
  for (const profile of profiles.filter((item) => (termsByKey.get(item.key) || []).length < 3 && !manualKeys.has(item.key))) {
    pushFailure({
      jobTitle: profile.title,
      roleId: profile.key,
      family: familyForProfile(profile),
      reason: 'no_meaningful_sibling_coverage',
      ownHits: [],
      siblingHits: [],
      forbiddenHits: [],
      missingRequiredTerms: [],
      sample: corpus(profile).slice(0, 260),
    });
  }
}

const summary = {
  jobsChecked: profiles.length,
  manualRuleChecks: MANUAL_RULES.reduce((sum, rule) => sum + rule.keys.length, 0),
  coverage,
  failures: failures.length,
  familyFailures,
  topFailures: failures.slice(0, 80),
};

console.log(JSON.stringify(summary, null, 2));

if (profiles.length !== 315 || failures.length > 0) process.exit(1);
