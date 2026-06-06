import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { getAllRoleProfiles, normalizeRoleProfileText, type RoleProfile } from '../lib/roleProfiles';
import { ROLE_SIBLING_GUARD_RULES } from '../lib/roleSiblingGuards';
import { repairMojibakeText } from '../lib/mojibake';

loadEnvConfig(process.cwd());

interface Candidate {
  roleId: string;
  title: string;
  industry?: string | null;
  reasons: Set<string>;
  topKeywords?: string[];
}

interface PregeneratedRow {
  roleId?: string | null;
  role_id?: string | null;
  jobTitle?: string | null;
  job_title?: string | null;
  topKeywords?: string[] | null;
  top_keywords?: string[] | null;
}

const OUTPUT_DIR = join(process.cwd(), 'output');
const OUTPUT_PATH = join(OUTPUT_DIR, 'roles_need_manual_skills.txt');
const FLAGGED_PATH = join(OUTPUT_DIR, 'flagged_roles.json');

const profiles = getAllRoleProfiles();
const byId = new Map(profiles.map(profile => [profile.key, profile]));
const candidates = new Map<string, Candidate>();

function addCandidate(profile: RoleProfile, reason: string, topKeywords?: string[]) {
  const existing = candidates.get(profile.key) || {
    roleId: profile.key,
    title: profile.title,
    industry: profile.industry,
    reasons: new Set<string>(),
  };
  existing.reasons.add(reason);
  if (topKeywords?.length) existing.topKeywords = topKeywords;
  candidates.set(profile.key, existing);
}

function titleHas(profile: RoleProfile, pattern: RegExp) {
  return pattern.test(normalizeRoleProfileText(`${profile.title} ${profile.key} ${profile.industry || ''}`));
}

function addPatternCandidates() {
  const ambiguousPatterns: Array<[RegExp, string]> = [
    [/\bspa\b|massage|facial|cham soc da|tri lieu/, 'same_industry_spa_vs_housekeeping'],
    [/housekeeping|buong phong|don phong|room attendant/, 'same_industry_spa_vs_housekeeping'],
    [/dau bep|phu bep|chef|cook|kitchen/, 'same_industry_kitchen_vs_service'],
    [/phuc vu|waiter|waitress|thu ngan nha hang|cashier nha hang|barista|bartender/, 'same_industry_kitchen_vs_service'],
    [/giao vien|teacher|giang day/, 'same_industry_teacher_vs_center_manager'],
    [/quan ly trung tam|center manager|academic operations/, 'same_industry_teacher_vs_center_manager'],
    [/ke toan|accountant|accounting|kiem toan|\btax\b|\bthue\b/, 'same_industry_accounting_vs_hr'],
    [/nhan su|hr|tuyen dung|c&b|talent acquisition/, 'same_industry_accounting_vs_hr'],
  ];

  for (const profile of profiles) {
    for (const [pattern, reason] of ambiguousPatterns) {
      if (titleHas(profile, pattern)) addCandidate(profile, reason);
    }
  }

  for (const rule of ROLE_SIBLING_GUARD_RULES) {
    for (const key of rule.keys) {
      const profile = byId.get(key);
      if (profile) addCandidate(profile, `sibling_guard:${rule.reason}`);
    }
  }
}

function addFlaggedRoles() {
  if (!existsSync(FLAGGED_PATH)) return;
  const raw = JSON.parse(readFileSync(FLAGGED_PATH, 'utf8')) as unknown;
  const rows = Array.isArray(raw) ? raw : [];
  for (const row of rows) {
    const item = row && typeof row === 'object' ? row as Record<string, unknown> : {};
    const roleId = String(item.roleId || item.role_id || '').trim();
    const profile = byId.get(roleId);
    if (profile) addCandidate(profile, 'flagged_roles_json');
  }
}

function keywordMismatch(profile: RoleProfile, keywords: string[]) {
  const title = normalizeRoleProfileText(profile.title);
  const skillText = normalizeRoleProfileText([
    profile.title,
    ...(profile.skills || []),
    profile.preview?.coreSkill,
    profile.language?.mainSkill,
    profile.language?.proofAsset,
    profile.language?.kpiGuidance,
  ].filter(Boolean).join(' '));
  const normalizedKeywords = keywords.map(keyword => normalizeRoleProfileText(keyword)).filter(Boolean);
  if (!normalizedKeywords.length) return true;
  const hasOwnTerm = normalizedKeywords.some(keyword => skillText.includes(keyword) || title.includes(keyword));
  const hasHousekeepingLeak = /spa|massage|facial|cham soc da|tri lieu/.test(title) && normalizedKeywords.some(keyword => /housekeeping|buong phong|don phong|room attendant|minibar|lost found|check out room|amenities/.test(keyword));
  return !hasOwnTerm || hasHousekeepingLeak;
}

async function addPregeneratedKeywordMismatches() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!supabaseUrl || !supabaseKey) {
    return 'Skipped DB query: missing Supabase URL/service key.';
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { data, error } = await supabase
    .from('pregenerated_roadmaps')
    .select('roleId, jobTitle, topKeywords')
    .eq('status', 'APPROVED')
    .order('jobTitle', { ascending: true });

  if (error) return `Skipped DB query: ${error.message}`;

  for (const row of (data || []) as PregeneratedRow[]) {
    const roleId = String(row.roleId || row.role_id || '').trim();
    const jobTitle = repairMojibakeText(String(row.jobTitle || row.job_title || '')).trim();
    const profile = byId.get(roleId) || profiles.find(item => normalizeRoleProfileText(item.title) === normalizeRoleProfileText(jobTitle));
    if (!profile) continue;
    const keywords = Array.isArray(row.topKeywords) ? row.topKeywords : Array.isArray(row.top_keywords) ? row.top_keywords : [];
    if (keywordMismatch(profile, keywords)) addCandidate(profile, 'approved_topKeywords_mismatch', keywords);
  }

  return `Checked ${(data || []).length} APPROVED pregenerated rows.`;
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  addPatternCandidates();
  addFlaggedRoles();
  const dbStatus = await addPregeneratedKeywordMismatches();

  const rows = [...candidates.values()].sort((a, b) => a.title.localeCompare(b.title, 'vi'));
  const content = [
    `Roles need manual skills: ${rows.length}`,
    `DB check: ${dbStatus}`,
    '',
    ...rows.map((item, index) => [
      `${index + 1}. ${item.title}`,
      `   roleId: ${item.roleId}`,
      `   industry: ${item.industry || 'unknown'}`,
      `   reasons: ${[...item.reasons].join(', ')}`,
      item.topKeywords?.length ? `   topKeywords: ${item.topKeywords.join(', ')}` : '',
    ].filter(Boolean).join('\n')),
    '',
  ].join('\n');

  writeFileSync(OUTPUT_PATH, content, 'utf8');
  console.log(content);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
