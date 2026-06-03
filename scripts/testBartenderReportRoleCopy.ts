import { getCareerCompassContext } from '../lib/careerCompassEngine';
import { buildJobJumpMap } from '../lib/jobJumpMap';
import { fillScript, getRoleAwareNegotiationScript } from '../lib/negotiationScripts';
import { buildSafePremiumInsight } from '../lib/reportPremiumInsight';
import {
  getPremiumRolePreviewForRole,
  getRoleLanguage,
  getSimulatorSkillsForRole,
  getWorkTiersForRole,
  type SimulatorSkillBase,
  type WorkTierBase,
} from '../lib/roleTaxonomy';

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

function buildRenderedReportText(jobTitle: string, salary: number, percent: number, industry: string) {
  const compass = getCareerCompassContext(jobTitle, salary, percent, industry);
  const jobMap = buildJobJumpMap(jobTitle, salary, percent, industry);
  const negotiation = getRoleAwareNegotiationScript(jobTitle, 'FALLBACK', compass.band, industry);
  const scriptVars = {
    bandRange: compass.currentBandRange,
    nextBandMin: compass.nextBandMinFmt,
    salary: compass.salaryFmt,
    salaryGap: compass.salaryGapFmt,
  };
  const rendered = {
    insightRieng: buildSafePremiumInsight(jobTitle, salary, percent, compass.bandLabel, compass.nextBandMin, industry),
    premiumPreview: getPremiumRolePreviewForRole(jobTitle, industry),
    banDoRoleTraCaoHon: jobMap,
    careerLadder: compass.careerLadder,
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
  return flatten(rendered).join('\n');
}

function assertRole(name: string, text: string, requiredTerms: string[], minRequired: number, forbiddenTerms: string[]) {
  const requiredHits = hits(text, requiredTerms);
  const forbiddenHits = hits(text, forbiddenTerms);
  if (requiredHits.length < minRequired || forbiddenHits.length > 0) {
    console.error(JSON.stringify({ name, requiredHits, forbiddenHits }, null, 2));
    process.exit(1);
  }
  return { requiredHits, forbiddenHits };
}

const INDUSTRY = 'Nhà hàng - Khách sạn - Du lịch';

const kitchenForbiddenForBar = [
  'dau bep', 'sous chef', 'bep truong', 'kitchen manager', 'ca truong bep', 'phu bep',
  'bep chinh', 'mise en place', 'so che', 'kitchen kpi', 'food cost ownership',
  'p&l', 'labor cost ownership', 'bep nong', 'bep lanh',
];
const bartenderForbidden = [...kitchenForbiddenForBar, 'ra mon'];

const bartender = assertRole(
  'Bartender',
  buildRenderedReportText('Bartender', 9_000_000, 65, INDUSTRY),
  ['bartender', 'pha che', 'cocktail', 'mocktail', 'do uong', 'quay bar', 'bar station', 'recipe', 'dinh luong', 'garnish', 'upsell', 'pos', 'ton kho quay bar', 've sinh quay bar', 'speed of service', 'khach hang'],
  5,
  bartenderForbidden,
);

const barista = assertRole(
  'Barista',
  buildRenderedReportText('Barista (Pha chế cà phê)', 8_000_000, 65, INDUSTRY),
  ['barista', 'ca phe', 'espresso', 'recipe', 'do uong', 'quay bar', 'ticket time', 'wastage', 'upsell', 'khach'],
  4,
  kitchenForbiddenForBar,
);

const phuBep = assertRole(
  'Phu bep',
  buildRenderedReportText('Phụ bếp', 7_000_000, 70, INDUSTRY),
  ['phu bep', 'so che', 'bao quan', 'ban giao ca', 've sinh khu vuc', 'hao hut'],
  3,
  ['bartender', 'cocktail', 'mocktail', 'mixologist', 'bar supervisor', 'p&l', 'food cost ownership', 'labor cost ownership'],
);

const restaurantManager = assertRole(
  'Quan ly nha hang',
  buildRenderedReportText('Quản lý nhà hàng', 18_000_000, 30, INDUSTRY),
  ['food cost', 'labor cost', 'ton kho', 'sop', 'kpi', 'team', 'complaint', 'doanh thu'],
  5,
  ['phuc vu ca co ban only', 'entry-only', 'chi lam order'],
);

console.log(JSON.stringify({
  bartender,
  barista,
  phuBep,
  restaurantManager,
  passed: true,
}, null, 2));
