import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { getAllRoleProfiles, normalizeRoleProfileText } from '../lib/roleProfiles';

loadEnvConfig(process.cwd());

interface GeneratedSkillEntry {
  skills: string[];
  status: 'APPROVED' | 'NEEDS_MANUAL';
  industry: string;
  roleId: string;
}

interface RoadmapRow {
  roleId: string;
  jobTitle: string;
  seniorityLevel: string;
  topKeywords: string[] | null;
  status: 'APPROVED' | 'NEEDS_REVIEW';
}

const OUTPUT_DIR = join(process.cwd(), 'output');
const OUTPUT_PATH = join(OUTPUT_DIR, 'roles_to_regenerate_from_skills.json');

const STOPWORDS = new Set([
  'cua', 'cho', 'voi', 'theo', 'hang', 'ngay', 'cong', 'viec', 'ky', 'nang', 'nhan', 'vien',
  'chuyen', 'quan', 'ly', 'truong', 'phong', 'giam', 'doc', 'dung', 'quy', 'trinh', 'bao',
  'cao', 'lap', 'xay', 'dung', 'kiem', 'tra', 'the', 'hien', 'thuc', 'te', 'khach', 'hang',
]);

function normalize(value: unknown) {
  return normalizeRoleProfileText(String(value || ''));
}

function tokens(value: unknown) {
  return normalize(value)
    .split(' ')
    .filter(token => token.length >= 3 && !STOPWORDS.has(token));
}

function keywordOverlapsSkills(topKeywords: string[], skills: string[]) {
  const skillText = normalize(skills.join(' | '));
  const skillTokens = new Set(tokens(skills.join(' | ')));
  const keywordTokens = tokens(topKeywords.join(' | '));

  for (const keyword of topKeywords) {
    const normalizedKeyword = normalize(keyword);
    if (normalizedKeyword.length >= 3 && skillText.includes(normalizedKeyword)) return true;
  }
  return keywordTokens.some(token => skillTokens.has(token));
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceKey) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

  const generated = JSON.parse(readFileSync(join(process.cwd(), 'data', 'generated_role_skills.json'), 'utf8')) as Record<string, GeneratedSkillEntry>;
  const generatedByRoleId = new Map(Object.values(generated).map(entry => [entry.roleId, entry]));
  const profiles = getAllRoleProfiles();
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabase
    .from('pregenerated_roadmaps')
    .select('roleId, jobTitle, seniorityLevel, topKeywords, status');
  if (error) throw error;

  const rows = (data || []) as RoadmapRow[];
  const rowsByRoleId = new Map<string, RoadmapRow[]>();
  for (const row of rows) {
    const group = rowsByRoleId.get(row.roleId) || [];
    group.push(row);
    rowsByRoleId.set(row.roleId, group);
  }

  const flagged = profiles.flatMap(profile => {
    const generatedEntry = generatedByRoleId.get(profile.key);
    const roleRows = rowsByRoleId.get(profile.key) || [];
    const approvedRows = roleRows.filter(row => row.status === 'APPROVED');
    const topKeywords = approvedRows.flatMap(row => Array.isArray(row.topKeywords) ? row.topKeywords : []);
    const skills = generatedEntry?.skills || [];
    const hasOverlap = topKeywords.length > 0 && skills.length > 0 && keywordOverlapsSkills(topKeywords, skills);
    if (generatedEntry?.status !== 'APPROVED') {
      return [{ roleId: profile.key, jobTitle: profile.title, reason: 'generated_skills_not_approved', approvedRows: approvedRows.length, topKeywords, skills }];
    }
    if (!approvedRows.length) {
      return [{ roleId: profile.key, jobTitle: profile.title, reason: 'no_approved_roadmap_rows', approvedRows: approvedRows.length, topKeywords, skills }];
    }
    if (!hasOverlap) {
      return [{ roleId: profile.key, jobTitle: profile.title, reason: 'db_top_keywords_do_not_overlap_new_skills', approvedRows: approvedRows.length, topKeywords, skills }];
    }
    return [];
  });

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(flagged, null, 2), 'utf8');
  console.log(`totalRoles=${profiles.length}`);
  console.log(`dbRows=${rows.length}`);
  console.log(`flaggedRoles=${flagged.length}`);
  console.log(`output=${OUTPUT_PATH}`);
  console.log('roleIdsCsv=');
  console.log(flagged.map(item => item.roleId).join(','));
  console.log('first10=');
  console.log(JSON.stringify(flagged.slice(0, 10).map(item => ({ jobTitle: item.jobTitle, reason: item.reason, topKeywords: item.topKeywords })), null, 2));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
