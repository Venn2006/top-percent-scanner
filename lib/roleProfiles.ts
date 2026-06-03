import rawRoleProfiles from '@/data/role_profiles.json';
import { isRoadmapIntentPhrase } from '@/lib/roadmapAccess';

export interface RoleProfileLanguage {
  rolePath: string;
  mainSkill: string;
  proofAsset: string;
  opportunityList: string;
  portfolioWord: string;
  productWord: string;
  kpiGuidance: string;
}

export interface RoleProfilePreview {
  coreSkill: string;
  path: string;
  firstAction: string;
  skills: string[];
  cvBullet: string;
}

export interface RoleProfile {
  key: string;
  titleKey: string;
  title: string;
  industry: string | null;
  industryKey: string;
  segment: string;
  skills: string[];
  tiers: string[];
  preview: RoleProfilePreview;
  language: RoleProfileLanguage;
  semanticTags: string[];
  source: string;
}

interface RoleProfileBundle {
  version: number;
  generatedAt: string;
  profiles: RoleProfile[];
}

const bundle = rawRoleProfiles as RoleProfileBundle;

export function normalizeRoleProfileText(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s/()+&.-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildRoleProfileKey(title: string, industry?: string | null) {
  const titleKey = normalizeRoleProfileText(title);
  const industryKey = normalizeRoleProfileText(industry || '');
  return `${titleKey}__${industryKey}`;
}

const profilesByKey = new Map<string, RoleProfile>();
const profilesByTitle = new Map<string, RoleProfile[]>();

for (const profile of bundle.profiles || []) {
  profilesByKey.set(profile.key, profile);
  const titleProfiles = profilesByTitle.get(profile.titleKey) || [];
  titleProfiles.push(profile);
  profilesByTitle.set(profile.titleKey, titleProfiles);
}

export function getExactRoleProfile(jobTitle: string, industry?: string | null): RoleProfile | null {
  const exact = profilesByKey.get(buildRoleProfileKey(jobTitle, industry));
  if (exact) return exact;
  const titleKey = normalizeRoleProfileText(jobTitle);
  const titleProfiles = profilesByTitle.get(titleKey) || [];
  if (titleProfiles.length === 1) return titleProfiles[0];
  if (industry) {
    const industryKey = normalizeRoleProfileText(industry);
    return titleProfiles.find(profile => profile.industryKey === industryKey) || null;
  }
  return null;
}

export function getRoleProfileById(roleId: string | null | undefined): RoleProfile | null {
  if (typeof roleId !== 'string') return null;
  const cleaned = roleId.trim();
  if (!cleaned) return null;
  return profilesByKey.get(cleaned) || null;
}

export function getAllRoleProfiles() {
  return bundle.profiles || [];
}

const ROLE_SUGGESTION_STOPWORDS = new Set([
  'lam',
  'tren',
  'duoi',
  'nam',
  'nhung',
  'dam',
  'chan',
  'tai',
  'cho',
  'cong',
  'viec',
  'nghe',
  'nganh',
  'nguoi',
  'dang',
  'can',
  'muon',
  'luong',
]);

function roleSuggestionTokens(value: string) {
  return normalizeRoleProfileText(value)
    .split(' ')
    .filter(token => token.length >= 3 && !ROLE_SUGGESTION_STOPWORDS.has(token));
}

function roleSuggestionPhrases(value: string) {
  const tokens = normalizeRoleProfileText(value)
    .split(' ')
    .filter(token => token.length >= 2 && !ROLE_SUGGESTION_STOPWORDS.has(token));
  const phrases = new Set<string>();
  for (let index = 0; index < tokens.length - 1; index += 1) {
    phrases.add(`${tokens[index]} ${tokens[index + 1]}`);
  }
  for (let index = 0; index < tokens.length - 2; index += 1) {
    phrases.add(`${tokens[index]} ${tokens[index + 1]} ${tokens[index + 2]}`);
  }
  return phrases;
}

export function findClosestRoleProfiles(jobTitle: string, limit = 3): RoleProfile[] {
  if (isRoadmapIntentPhrase(jobTitle)) return [];
  const normalizedQuery = normalizeRoleProfileText(jobTitle);
  const queryTokens = new Set(roleSuggestionTokens(jobTitle));
  const queryPhrases = roleSuggestionPhrases(jobTitle);
  if (!queryTokens.size) return [];

  return getAllRoleProfiles()
    .map(profile => {
      const titleText = normalizeRoleProfileText(profile.title);
      const industryText = normalizeRoleProfileText(profile.industry || '');
      const semanticText = normalizeRoleProfileText((profile.semanticTags || []).join(' '));
      const skillText = normalizeRoleProfileText(profile.skills.join(' '));
      const titleTokens = new Set(roleSuggestionTokens(profile.title));
      const industryTokens = new Set(roleSuggestionTokens(profile.industry || ''));
      const semanticTokens = new Set(roleSuggestionTokens((profile.semanticTags || []).join(' ')));
      const skillTokens = new Set(roleSuggestionTokens(profile.skills.join(' ')));
      const titlePhrases = roleSuggestionPhrases(profile.title);
      const industryPhrases = roleSuggestionPhrases(profile.industry || '');
      let score = 0;

      if (titleText && (normalizedQuery.includes(titleText) || titleText.includes(normalizedQuery))) score += 60;
      if (industryText && (normalizedQuery.includes(industryText) || queryPhrases.has(industryText))) score += 45;

      for (const phrase of queryPhrases) {
        if (titlePhrases.has(phrase)) score += 14;
        if (industryPhrases.has(phrase)) score += 22;
        if (semanticText.includes(phrase)) score += 8;
        if (skillText.includes(phrase)) score += 4;
      }

      for (const token of queryTokens) {
        if (titleTokens.has(token)) score += 5;
        if (industryTokens.has(token)) score += 10;
        if (semanticTokens.has(token)) score += 3;
        if (skillTokens.has(token)) score += 1;
      }
      return { profile, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.profile.title.localeCompare(b.profile.title, 'vi'))
    .slice(0, limit)
    .map(item => item.profile);
}

export function getRoleProfileBundleMeta() {
  return { version: bundle.version, generatedAt: bundle.generatedAt, count: (bundle.profiles || []).length };
}
