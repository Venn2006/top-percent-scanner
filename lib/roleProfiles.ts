import rawRoleProfiles from '@/data/role_profiles.json';

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

export function getRoleProfileBundleMeta() {
  return { version: bundle.version, generatedAt: bundle.generatedAt, count: (bundle.profiles || []).length };
}
