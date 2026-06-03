import { getAllRoleProfiles, type RoleProfile } from '../lib/roleProfiles';
import { inferRoleLevelBand } from '../lib/roleSeniority';

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

const GENERIC_TERMS = new Set([
  'kpi', 'bao cao', 'quy trinh', 'dich vu', 'khach hang', 'khach', 'feedback', 'sop', 'dashboard',
  'team', 'training', 'portfolio', 'case', 'log', 'ho so', 'bang chung', 'quality', 'process',
  'stakeholder', 'review', 'lead', 'senior', 'manager', 'specialist', 'staff', 'nhan vien',
  'quan ly', 'chuyen vien', 'cong viec', 'ket qua', 'du lieu', 'thoi gian', 'doanh thu',
]);

function splitTerms(value: string) {
  const normalized = normalize(value);
  const words = normalized.split(' ').filter(Boolean);
  const terms = new Set<string>();
  for (let i = 0; i < words.length; i += 1) {
    for (const len of [1, 2, 3]) {
      const phrase = words.slice(i, i + len).join(' ');
      if (!phrase || phrase.length < 4 || GENERIC_TERMS.has(phrase)) continue;
      if (/^\d+$/.test(phrase)) continue;
      terms.add(phrase);
    }
  }
  return terms;
}

function profileCorpus(profile: RoleProfile) {
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
    profile.language?.mainSkill || '',
    profile.language?.proofAsset || '',
    profile.language?.opportunityList || '',
    profile.language?.productWord || '',
    profile.language?.portfolioWord || '',
    profile.language?.kpiGuidance || '',
  ].join('\n');
}

function topTerms(profile: RoleProfile) {
  const terms = Array.from(splitTerms(profileCorpus(profile)));
  const preferred = terms.filter((term) => term.includes(' ') || /[a-z]/.test(term));
  return preferred.slice(0, 10);
}

function groupKey(profile: RoleProfile) {
  return profile.industry || profile.industryKey || profile.segment || 'unknown';
}

function highRiskGroupName(industry: string, profiles: RoleProfile[]) {
  const text = normalize(`${industry} ${profiles.map((p) => p.title).join(' ')}`);
  if (/giao duc|truong hoc|y te truong hoc|teacher|mentor|du hoc|tuyen sinh|ngoai ngu|hoc vien|phu huynh|lop hoc/.test(text)) return 'education/school/language-center';
  if (/nha hang|khach san|du lich|bartender|barista|bep|phuc vu/.test(text)) return 'fnb/hospitality';
  if (/y te|cham soc suc khoe|nha si|dieu duong|duoc|xet nghiem/.test(text)) return 'healthcare';
  if (/ke toan|tai chinh|cfo|accounting|finance/.test(text)) return 'accounting/finance';
  if (/ban le|sieu thi|ban hang|sales|cua hang|retail/.test(text)) return 'sales/retail';
  if (/logistics|van tai|kho|hang khong|phi cong|check-in/.test(text)) return 'logistics/aviation';
  if (/ky thuat|dien lanh|dien tu|o to|software|it|mep/.test(text)) return 'technical';
  if (/marketing|brand|cmo|content|seo/.test(text)) return 'marketing';
  if (/nhan su|hr|tuyen dung|c&b/.test(text)) return 'hr';
  return profiles.length > 1 ? 'generic-sibling-risk' : 'single-role';
}

const profiles = getAllRoleProfiles();
const groups = new Map<string, RoleProfile[]>();
for (const profile of profiles) {
  const key = groupKey(profile);
  groups.set(key, [...(groups.get(key) || []), profile]);
}

const grouped = Array.from(groups.entries())
  .sort((a, b) => a[0].localeCompare(b[0], 'vi'))
  .map(([industry, items]) => ({
    industry,
    count: items.length,
    highRiskGroup: highRiskGroupName(industry, items),
    roles: items
      .sort((a, b) => a.title.localeCompare(b.title, 'vi'))
      .map((profile) => ({
        title: profile.title,
        role_id: profile.key,
        levelBand: inferRoleLevelBand({ jobTitle: profile.title, industry: profile.industry }),
        terms: topTerms(profile),
      })),
  }));

const highRiskSiblingGroups = grouped.filter((group) => group.count > 1 && group.highRiskGroup !== 'single-role');
const summary = {
  totalJobs: profiles.length,
  totalIndustries: groups.size,
  jobsPerIndustry: grouped.map((group) => ({ industry: group.industry, count: group.count, highRiskGroup: group.highRiskGroup })),
  highRiskSiblingGroups: highRiskSiblingGroups.map((group) => ({ industry: group.industry, count: group.count, highRiskGroup: group.highRiskGroup })),
};

console.log(JSON.stringify({ summary, grouped }, null, 2));

if (profiles.length !== 315) process.exit(1);
