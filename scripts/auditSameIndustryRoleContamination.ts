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

type Family = 'F&B' | 'aviation' | 'marketing' | 'HR' | 'accounting' | 'sales/retail' | 'healthcare';

interface Rule {
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
  requiredHits: string[];
  forbiddenHits: string[];
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

function normalize(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[Ä‘Ä]/g, 'd')
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

function flatten(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (typeof value === 'number' || typeof value === 'boolean' || value == null) return [];
  if (Array.isArray(value)) return value.flatMap(flatten);
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).flatMap(flatten);
  return [];
}

function firstSnippet(text: string, terms: string[]) {
  const normalizedText = normalize(text);
  const term = terms.find((candidate) => normalizedText.includes(normalize(candidate))) || terms[0] || '';
  const index = term ? normalizedText.indexOf(normalize(term)) : -1;
  if (index < 0) return text.slice(0, 260).replace(/\s+/g, ' ').trim();
  return text.slice(Math.max(0, index - 140), index + 240).replace(/\s+/g, ' ').trim();
}

function buildRenderedReportText(profile: RoleProfile) {
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
    banDoRoleTraCaoHon: jobMap,
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

const kitchenChefTerms = ['dau bep', 'sous chef', 'bep truong', 'kitchen manager', 'ca truong bep', 'phu bep', 'bep chinh', 'mise en place', 'so che', 'kitchen kpi', 'food cost ownership', 'p&l', 'labor cost ownership', 'bep nong', 'bep lanh'];
const bartenderKitchenChefTerms = [...kitchenChefTerms, 'ra mon'];
const managerOwnershipTerms = ['p&l', 'food cost ownership', 'labor cost ownership', 'cogs', 'gross margin', 'budget ownership', 'headcount planning'];

const rules: Rule[] = [
  { family: 'F&B', keys: ['bartender__nha hang - khach san - du lich'], required: ['bartender', 'pha che', 'cocktail', 'mocktail', 'do uong', 'quay bar', 'bar station', 'recipe', 'dinh luong', 'garnish', 'upsell', 'pos', 'ton kho quay bar', 've sinh quay bar', 'speed of service', 'khach hang'], minRequired: 5, forbidden: bartenderKitchenChefTerms, reason: 'bartender_must_stay_bar_beverage' },
  { family: 'F&B', keys: ['barista (pha che ca phe)__nha hang - khach san - du lich'], required: ['barista', 'ca phe', 'espresso', 'recipe', 'do uong', 'quay bar', 'ticket time', 'wastage', 'upsell'], minRequired: 4, forbidden: kitchenChefTerms, reason: 'barista_must_stay_coffee_bar' },
  { family: 'F&B', keys: ['nhan vien phuc vu ban (waiter/waitress)__nha hang - khach san - du lich'], required: ['khach', 'ban', 'order', 'menu', 'pos', 'upsell'], minRequired: 4, forbidden: managerOwnershipTerms, reason: 'server_must_not_own_manager_metrics' },
  { family: 'F&B', keys: ['phu bep__nha hang - khach san - du lich'], required: ['phu bep', 'so che', 'bao quan', 'ban giao ca', 've sinh khu vuc', 'hao hut'], minRequired: 3, forbidden: ['bartender', 'cocktail', 'mocktail', 'mixologist', 'bar supervisor', ...managerOwnershipTerms], reason: 'prep_cook_must_not_be_bar_or_manager' },
  { family: 'F&B', keys: ['dau bep (chef)__nha hang - khach san - du lich', 'bep truong (head chef)__nha hang - khach san - du lich'], required: ['food cost', 'waste', 'toc do ra mon', 'sop', 'recipe'], minRequired: 3, forbidden: ['bartender', 'cocktail', 'mocktail', 'mixologist', 'bar supervisor'], reason: 'chef_must_not_be_bar_primary' },
  { family: 'F&B', keys: ['quan ly nha hang__nha hang - khach san - du lich'], required: ['food cost', 'labor cost', 'ton kho', 'sop', 'kpi', 'team', 'complaint', 'doanh thu'], minRequired: 5, reason: 'restaurant_manager_requires_ops_terms' },

  { family: 'aviation', keys: ['nhan vien check-in san bay__van tai - logistics'], required: ['check-in', 'boarding pass', 'ho chieu', 'visa', 'hanh ly', 'quay check-in', 'passenger service', 'supervisor', 'gate', 'baggage'], minRequired: 5, forbidden: ['cabin crew', 'purser', 'senior crew', 'cabin safety', 'in-flight', 'flight attendant'], reason: 'checkin_must_not_be_cabin' },
  { family: 'aviation', keys: ['tiep vien hang khong__van tai - logistics'], required: ['cabin crew', 'cabin safety', 'service recovery', 'announcement', 'grooming', 'purser'], minRequired: 3, forbidden: ['quay check-in', 'boarding pass', 'passenger service agent', 'ground service supervisor'], reason: 'flight_attendant_must_not_be_checkin' },

  { family: 'marketing', keys: ['chuyen vien marketing__marketing - truyen thong', 'chuyen vien digital marketing__marketing - truyen thong', 'chuyen vien content marketing__marketing - truyen thong', 'chuyen vien chay quang cao (performance marketing)__marketing - truyen thong', 'chuyen vien seo__marketing - truyen thong', 'pr executive__marketing - truyen thong'], forbidden: ['cmo', 'chief marketing officer', 'board/ceo', 'growth mandate', 'p&l ownership'], reason: 'marketing_staff_must_not_be_cmo' },
  { family: 'marketing', keys: ['cmo (giam doc marketing)__quan tri dieu hanh'], required: ['growth mandate', 'revenue', 'budget', 'board', 'compensation package'], minRequired: 3, forbidden: ['junior marketing', 'marketing staff', 'campaign execution only'], reason: 'cmo_requires_executive_scope' },
  { family: 'marketing', keys: ['brand manager__marketing - truyen thong'], required: ['brand', 'campaign', 'budget', 'positioning', 'stakeholder'], minRequired: 3, forbidden: ['cmo larger scope', 'chief growth officer', 'fractional cmo'], reason: 'brand_manager_must_not_be_cmo_primary' },

  { family: 'HR', keys: ['nhan vien hanh chinh nhan su__nhan su', 'chuyen vien tuyen dung__nhan su', 'chuyen vien c&b (luong thuong & phuc loi)__nhan su'], forbidden: ['hr director', 'people director', 'head of hr', 'department strategy', 'headcount planning ownership'], reason: 'hr_staff_must_not_be_hr_director' },
  { family: 'HR', keys: ['truong phong nhan su__nhan su'], required: ['hr', 'dashboard', 'team', 'retention', 'policy', 'c&b'], minRequired: 3, forbidden: ['recruiter-only', 'chi tuyen dung'], reason: 'hr_head_must_not_be_recruiter_only' },

  { family: 'accounting', keys: ['ke toan thanh toan__ke toan - kiem toan - tai chinh', 'ke toan thue__ke toan - kiem toan - tai chinh', 'ke toan tong hop__ke toan - kiem toan - tai chinh'], forbidden: ['cfo', 'finance director', 'p&l ownership', 'budget ownership', 'controller ownership'], reason: 'accountant_must_not_be_cfo_or_owner' },
  { family: 'accounting', keys: ['ke toan truong__ke toan - kiem toan - tai chinh', 'chief accountant / accounting manager__ke toan - tai chinh'], required: ['closing', 'tax', 'compliance', 'audit', 'control', 'team'], minRequired: 3, forbidden: ['entry bookkeeper only', 'nhap lieu only'], reason: 'chief_accountant_requires_control_scope' },

  { family: 'sales/retail', keys: ['nhan vien ban hang sieu thi__ban le - sieu thi'], forbidden: ['store manager ownership', 'p&l', 'budget ownership', 'headcount planning'], reason: 'retail_staff_must_not_be_store_manager' },
  { family: 'sales/retail', keys: ['quan ly cua hang__ban le - sieu thi'], required: ['ton kho', 'team', 'kpi', 'shift', 'revenue', 'doanh so'], minRequired: 3, reason: 'store_manager_requires_manager_terms' },

  { family: 'healthcare', keys: ['nha si__y te - cham soc suc khoe'], required: ['rang', 'benh an', 'dieu tri', 'phong kham', 'x-quang', 'vo khuan'], minRequired: 4, forbidden: ['receptionist', 'clinic admin', 'front desk'], reason: 'dentist_must_not_be_clinic_admin' },
  { family: 'healthcare', keys: ['dieu duong vien__y te - cham soc suc khoe'], forbidden: ['doctor ownership', 'bac si dieu tri chinh', 'dentist', 'implant', 'chinh nha'], reason: 'nurse_must_not_be_doctor_or_dentist' },
];

const profiles = getAllRoleProfiles();
const byKey = new Map(profiles.map((profile) => [profile.key, profile]));
const failures: Failure[] = [];
const familySummary: Record<Family, { rules: number; failures: number }> = {
  'F&B': { rules: 0, failures: 0 },
  aviation: { rules: 0, failures: 0 },
  marketing: { rules: 0, failures: 0 },
  HR: { rules: 0, failures: 0 },
  accounting: { rules: 0, failures: 0 },
  'sales/retail': { rules: 0, failures: 0 },
  healthcare: { rules: 0, failures: 0 },
};

for (const rule of rules) {
  for (const key of rule.keys) {
    const profile = byKey.get(key);
    if (!profile) {
      failures.push({ jobTitle: key, roleId: key, family: rule.family, reason: 'missing_profile_for_rule', requiredHits: [], forbiddenHits: [], sample: '' });
      familySummary[rule.family].failures += 1;
      continue;
    }
    familySummary[rule.family].rules += 1;
    const text = buildRenderedReportText(profile);
    const requiredHits = rule.required ? hits(text, rule.required) : [];
    const forbiddenHits = rule.forbidden ? hits(text, rule.forbidden) : [];
    if ((rule.minRequired || 0) > requiredHits.length || forbiddenHits.length > 0) {
      failures.push({
        jobTitle: profile.title,
        roleId: profile.key,
        family: rule.family,
        reason: rule.reason,
        requiredHits,
        forbiddenHits,
        sample: firstSnippet(text, [...forbiddenHits, ...(rule.required || [])]),
      });
      familySummary[rule.family].failures += 1;
    }
  }
}

const summary = {
  jobsChecked: profiles.length,
  ruleChecks: rules.reduce((sum, rule) => sum + rule.keys.length, 0),
  failures: failures.length,
  familySummary,
  topFailures: failures.slice(0, 50),
};

console.log(JSON.stringify(summary, null, 2));

if (failures.length > 0 || profiles.length !== 315) process.exit(1);
