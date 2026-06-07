import { normalizeRoleText } from '@/lib/roleTaxonomy';

export type RoleLevelBand =
  | 'entry'
  | 'staff'
  | 'senior'
  | 'specialist'
  | 'supervisor'
  | 'manager'
  | 'head'
  | 'director'
  | 'c_level'
  | 'owner';

const LEVEL_RANK: Record<RoleLevelBand, number> = {
  entry: 0,
  staff: 1,
  senior: 2,
  specialist: 2,
  supervisor: 3,
  manager: 4,
  head: 5,
  director: 6,
  c_level: 7,
  owner: 8,
};

export function getRoleLevelRank(level: RoleLevelBand): number {
  return LEVEL_RANK[level];
}

function has(text: string, pattern: RegExp) {
  return pattern.test(text);
}

export function inferRoleLevelBand(input: {
  jobTitle: string;
  roleId?: string | null;
  industry?: string | null;
}): RoleLevelBand {
  const text = normalizeRoleText(`${input.jobTitle} ${input.roleId || ''} ${input.industry || ''}`);

  if (has(text, /\b(founder|co founder|owner|chu doanh nghiep|chu cua hang|agency owner|business owner)\b/)) {
    return 'owner';
  }

  if (has(text, /chief accountant|ke toan truong|accounting manager/)) {
    return 'manager';
  }

  if (has(text, /thu ky giam doc|assistant to director|executive assistant|tro ly giam doc/)) {
    return 'staff';
  }

  if (has(text, /\b(ceo|cmo|cfo|coo|cto|chro|chief|vp)\b|tong giam doc|pho tong giam doc|general director|managing director/)) {
    return 'c_level';
  }

  if (has(text, /giam doc|director|country manager|regional director|business unit director/)) {
    return 'director';
  }

  if (has(text, /head of|\bhead\b|truong phong/)) {
    return 'head';
  }

  if (has(text, /\b(manager|quan ly|product manager|project manager|area manager|regional manager|store manager|center manager|restaurant manager|hotel manager)\b/)) {
    return 'manager';
  }

  if (has(text, /\b(supervisor|lead|leader|shift lead)\b|giam sat|truong nhom|to truong|to pho|ca truong/)) {
    return 'supervisor';
  }

  if (has(text, /\b(senior|sr\.)\b/)) return 'senior';

  if (has(text, /\b(specialist|expert|engineer|developer|analyst|designer|doctor|dentist)\b|chuyen vien|bac si|nha si|ky su/)) {
    return 'specialist';
  }

  if (has(text, /\b(intern|trainee|apprentice|assistant|helper)\b|thuc tap|hoc viec|phu bep|phu viec/)) {
    return 'entry';
  }

  if (has(text, /nhan vien|thu ngan|le tan|barista|cong nhan|tai xe|shipper|phuc vu/)) {
    return 'staff';
  }

  return 'staff';
}

export function isExecutiveLevel(level: RoleLevelBand): boolean {
  return level === 'director' || level === 'c_level' || level === 'owner';
}

export function isManagerOrAbove(level: RoleLevelBand): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK.manager;
}

export function assertRoleProgressionAllowed(input: {
  currentLevel: RoleLevelBand;
  targetTitle: string;
  targetLevel?: RoleLevelBand;
}): boolean {
  const targetLevel = input.targetLevel ?? inferRoleLevelBand({ jobTitle: input.targetTitle });
  const targetText = normalizeRoleText(input.targetTitle);

  if (input.currentLevel === 'owner') return LEVEL_RANK[targetLevel] >= LEVEL_RANK.director;
  if (input.currentLevel === 'c_level') {
    if (/brand manager|marketing lead|specialist|staff|junior|assistant|executive\b/.test(targetText)) return false;
    return LEVEL_RANK[targetLevel] >= LEVEL_RANK.director;
  }
  if (input.currentLevel === 'director') {
    if (/staff|junior|assistant|intern|nhan vien|chuyen vien/.test(targetText)) return false;
    return LEVEL_RANK[targetLevel] >= LEVEL_RANK.manager;
  }
  if (input.currentLevel === 'manager' || input.currentLevel === 'head') {
    if (/staff|junior|assistant|intern|nhan vien/.test(targetText)) return false;
  }

  return LEVEL_RANK[targetLevel] >= Math.max(0, LEVEL_RANK[input.currentLevel] - 1);
}
