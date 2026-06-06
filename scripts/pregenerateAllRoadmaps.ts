import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import {
  SENIORITY_LEVELS,
  type RoadmapSeniorityLevel,
} from '../lib/pregeneratedRoadmaps';
import {
  getAllRoleProfiles,
  normalizeRoleProfileText,
  type RoleProfile,
} from '../lib/roleProfiles';
import { repairMojibakeDeep, repairMojibakeText } from '../lib/mojibake';

loadEnvConfig(process.cwd());

type Status = 'APPROVED' | 'NEEDS_REVIEW';

interface RoadmapContent {
  format?: 'weekly' | 'markdown' | 'expert_v2';
  version?: number;
  goal: string;
  summary: string;
  weeks: unknown[];
  negotiation_timing: string;
  salary_projection: string;
  markdown?: string;
  actionPlan?: unknown;
  selfCheck?: { topKeywords?: string[] };
}

interface ValidationResult {
  roleMatch: number;
  topKeywords: string[];
  suspiciousItems: string[];
  verdict: 'PASS' | 'FAIL';
}

interface FlaggedRole {
  roleId: string;
  jobTitle: string;
  seniorityLevel: RoadmapSeniorityLevel;
  reason: string;
  suspiciousItems: string[];
}

type AnySupabaseClient = any;

const BATCH_SIZE = Number(process.env.PREGENERATE_BATCH_SIZE || 10);
const CALL_DELAY_MS = Number(process.env.PREGENERATE_CALL_DELAY_MS || 2000);
const REQUEST_TIMEOUT_MS = Number(process.env.PREGENERATE_REQUEST_TIMEOUT_MS || 90_000);
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro';
const ROLE_ID_FILTER = (process.env.PREGENERATE_ROLE_IDS || '')
  .split(',')
  .map(value => value.trim())
  .filter(Boolean);
const FORCE_REGENERATE = process.env.PREGENERATE_FORCE === '1';
const OUTPUT_DIR = join(process.cwd(), 'output');
const FLAGGED_PATH = join(OUTPUT_DIR, 'flagged_roles.json');

let nextCallAt = 0;
let callGate: Promise<void> = Promise.resolve();

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForRateLimit() {
  const waitTurn = callGate.then(async () => {
    const delay = Math.max(0, nextCallAt - Date.now());
    if (delay > 0) await sleep(delay);
    nextCallAt = Date.now() + CALL_DELAY_MS;
  });
  callGate = waitTurn.catch(() => undefined);
  await waitTurn;
}

async function callDeepSeek<T>(
  client: OpenAI,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  parse: (text: string) => T,
  maxTokens = 2400
): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await waitForRateLimit();
      const completion = await client.chat.completions.create(
        {
          model: MODEL,
          messages,
          temperature: 0.1,
          max_tokens: maxTokens,
        },
        { timeout: REQUEST_TIMEOUT_MS },
      );
      const text = completion.choices[0]?.message?.content?.trim() || '';
      if (!text) throw new Error('empty model response');
      return parse(text);
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(CALL_DELAY_MS * attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError || 'model call failed'));
}

function parseJsonObject<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]) as T;
    throw new Error(`Model did not return JSON: ${text.slice(0, 180)}`);
  }
}

function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value || '');
}

function normalizeForCheck(value: unknown): string {
  return normalizeRoleProfileText(repairMojibakeText(textOf(value)));
}

function uniqueClean(values: unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const cleaned = repairMojibakeText(String(value || '')).replace(/\s+/g, ' ').trim();
    if (!cleaned || seen.has(cleaned.toLowerCase())) continue;
    seen.add(cleaned.toLowerCase());
    result.push(cleaned);
  }
  return result;
}

function skillBlock(profile: RoleProfile): string {
  return uniqueClean([
    ...(profile.skills || []),
    ...(profile.preview?.skills || []),
    profile.preview?.coreSkill,
    profile.preview?.path,
    profile.preview?.firstAction,
    profile.preview?.cvBullet,
    profile.language?.rolePath,
    profile.language?.mainSkill,
    profile.language?.proofAsset,
    profile.language?.opportunityList,
    profile.language?.kpiGuidance,
  ]).map((skill, index) => `${index + 1}. ${skill}`).join('\n');
}

function isHotelSpaProfile(profile: RoleProfile): boolean {
  return normalizeRoleProfileText(`${profile.key} ${profile.title}`).includes('nhan vien spa khach san');
}

function generationSystemPrompt(profile: RoleProfile, seniorityLevel: RoadmapSeniorityLevel): string {
  return `Bạn là chuyên gia thị trường lao động Việt Nam.
Tạo lộ trình tăng lương cho đúng nghề này.

NGHỀ: ${profile.title}
CẤP BẬC: ${seniorityLevel}
BỘ KỸ NĂNG CỦA NGHỀ NÀY:
${skillBlock(profile)}

NGÀNH CHÍNH: ${profile.industry || 'Không rõ'}
NGÀNH PHỤ: ${profile.segment || profile.industryKey || 'Không rõ'}

QUY TẮC CỨNG:
1. Chỉ dùng vocabulary từ BỘ KỸ NĂNG trên
2. Mỗi task phải do người làm ${profile.title}
   thực hiện, không phải nghề khác
3. Viết tiếng Việt đầy đủ dấu
4. KHÔNG dùng từ nào thuộc ngành khác
5. TIMELINE THỰC TẾ:
   - Tăng lương 20-30%: tối thiểu 6-12 tháng
   - Tăng lương 50%: tối thiểu 12-18 tháng
   - Tăng lương 100% (x2): tối thiểu 24-36 tháng
   - KHÔNG được ghi timeline ngắn hơn các mốc trên
   - Nếu user muốn tăng 100% trong 9 tháng, ghi rõ: "Mục tiêu này cần 24-36 tháng thực tế. Lộ trình dưới đây tối ưu cho giai đoạn đầu."
${isHotelSpaProfile(profile) ? '6. ROLE SPA KHÁCH SẠN: FORBIDDEN tuyệt đối dọn phòng, housekeeping, buồng phòng, room attendant, room cleaning, check-out room, amenities, minibar, laundry handover, lost & found, PMS/front desk. REQUIRED skills: massage, trị liệu, chăm sóc da, facial, body treatment, aromatherapy, tư vấn liệu trình spa, phòng trị liệu, chống chỉ định sức khỏe, feedback khách spa.' : ''}

SELF-CHECK TRƯỚC KHI OUTPUT:
Liệt kê 3 từ khóa ngành đặc trưng nhất
xuất hiện trong lộ trình:
- Từ khóa 1: ___
- Từ khóa 2: ___
- Từ khóa 3: ___
Nếu 3 từ khóa này không match với
${profile.title} → viết lại toàn bộ.

Sau khi self-check pass → output lộ trình.

OUTPUT FORMAT BẮT BUỘC:
Trả Markdown thuần, không code fence, không JSON. Phần đầu phải có self-check 3 từ khóa, sau đó là lộ trình chi tiết có mục tiêu, task, bằng chứng, KPI và thời điểm deal lương.`;
}

function normalizeRoadmapContent(raw: unknown, profile: RoleProfile, seniorityLevel: RoadmapSeniorityLevel): RoadmapContent {
  if (typeof raw === 'string') {
    const markdown = repairMojibakeText(raw).trim();
    return {
      format: 'expert_v2',
      version: 2,
      goal: `Lộ trình tăng lương cho ${profile.title} - ${seniorityLevel}`,
      summary: `Roadmap pre-generated cho ${profile.title} ở cấp ${seniorityLevel}.`,
      weeks: [],
      negotiation_timing: 'Sau khi có bằng chứng KPI đủ mạnh.',
      salary_projection: 'Không cam kết tăng lương; dùng roadmap để tăng xác suất có bằng chứng khi review.',
      markdown,
      actionPlan: {
        standardWeeks: 12,
        flexibleWeeks: 16,
        weeklyHours: '3-5 giờ/tuần',
        completionRule: 'Hoàn thành task và lưu bằng chứng đo được trước khi deal lương.',
        levelName: seniorityLevel,
        milestones: [],
      },
      selfCheck: { topKeywords: [] },
    };
  }
  const repaired = repairMojibakeDeep(raw) as Record<string, unknown>;
  const selfCheck = (repaired.selfCheck || repaired.self_check || {}) as { topKeywords?: string[] };
  const roadmap = (repaired.roadmap || repaired.roadmapContent || repaired) as Partial<RoadmapContent> & Record<string, unknown>;
  const markdown = typeof roadmap.markdown === 'string'
    ? roadmap.markdown
    : typeof repaired.markdown === 'string'
      ? repaired.markdown
      : textOf(raw);

  return {
    format: roadmap.format === 'weekly' || roadmap.format === 'markdown' || roadmap.format === 'expert_v2' ? roadmap.format : 'expert_v2',
    version: Number(roadmap.version || 2),
    goal: typeof roadmap.goal === 'string' && roadmap.goal.trim() ? roadmap.goal : `Lộ trình tăng lương cho ${profile.title} - ${seniorityLevel}`,
    summary: typeof roadmap.summary === 'string' && roadmap.summary.trim() ? roadmap.summary : `Roadmap pre-generated cho ${profile.title} ở cấp ${seniorityLevel}.`,
    weeks: Array.isArray(roadmap.weeks) ? roadmap.weeks : [],
    negotiation_timing: typeof roadmap.negotiation_timing === 'string' ? roadmap.negotiation_timing : 'Sau khi có bằng chứng KPI đủ mạnh.',
    salary_projection: typeof roadmap.salary_projection === 'string' ? roadmap.salary_projection : 'Không cam kết tăng lương; dùng roadmap để tăng xác suất có bằng chứng khi review.',
    markdown,
    actionPlan: roadmap.actionPlan,
    selfCheck: { topKeywords: Array.isArray(selfCheck.topKeywords) ? selfCheck.topKeywords : [] },
  };
}

async function generateOne(client: OpenAI, profile: RoleProfile, seniorityLevel: RoadmapSeniorityLevel): Promise<RoadmapContent> {
  const raw = await callDeepSeek<string>(
    client,
    [
      { role: 'system', content: generationSystemPrompt(profile, seniorityLevel) },
      { role: 'user', content: 'Tạo lộ trình ngay bây giờ. Chỉ trả Markdown thuần, không JSON, không code fence.' },
    ],
    text => text,
    2600
  );
  return normalizeRoadmapContent(raw, profile, seniorityLevel);
}

function validationPrompt(profile: RoleProfile, output: RoadmapContent): string {
  return `Nghề: ${profile.title}
Ngành: ${profile.industry || 'Không rõ'}

Lộ trình vừa generate:
${JSON.stringify(output)}

Trả JSON:
{
  "roleMatch": 0-100,
  "topKeywords": ["kw1","kw2","kw3"],
  "suspiciousItems": [],
  "verdict": "PASS" | "FAIL"
}

FAIL nếu:
- roleMatch < 75
- suspiciousItems có từ thuộc ngành khác
- topKeywords không match với ${profile.title}
KHÔNG FAIL chỉ vì seniorityLevel là Junior/Mid/Senior trong khi title là C-level, Director, VP hoặc Head. Ở đây seniorityLevel là biến thể roadmap theo mức kinh nghiệm/scope, không phải phủ định title.
${isHotelSpaProfile(profile) ? '- Với Nhân viên spa khách sạn: FAIL nếu có dọn phòng, housekeeping, buồng phòng, room attendant, room cleaning, check-out room, amenities, minibar, laundry handover, lost & found, PMS/front desk; PASS chỉ khi có massage/trị liệu/chăm sóc da/facial/body treatment/tư vấn liệu trình spa.' : ''}`;
}

async function validateOne(client: OpenAI, profile: RoleProfile, output: RoadmapContent): Promise<ValidationResult> {
  let raw: Record<string, unknown>;
  try {
    raw = await callDeepSeek<Record<string, unknown>>(
      client,
      [
        { role: 'system', content: 'Bạn là bộ kiểm định chất lượng. Chỉ trả JSON hợp lệ, không thêm chữ ngoài JSON.' },
        { role: 'user', content: validationPrompt(profile, output) },
      ],
      parseJsonObject,
      1000
    );
  } catch (error) {
    return {
      roleMatch: 0,
      topKeywords: [],
      suspiciousItems: [`validation_call_failed: ${error instanceof Error ? error.message : String(error)}`],
      verdict: 'FAIL',
    };
  }
  const suspiciousItems = Array.isArray(raw.suspiciousItems) ? raw.suspiciousItems.map(String) : [];
  const topKeywords = Array.isArray(raw.topKeywords) ? raw.topKeywords.map(String).slice(0, 3) : [];
  const roleMatch = Math.max(0, Math.min(100, Number(raw.roleMatch || 0)));
  const verdict = raw.verdict === 'PASS' && roleMatch >= 75 && suspiciousItems.length === 0 ? 'PASS' : 'FAIL';
  return { roleMatch, topKeywords, suspiciousItems, verdict };
}

async function saveRoadmap(input: {
  supabase: AnySupabaseClient;
  profile: RoleProfile;
  seniorityLevel: RoadmapSeniorityLevel;
  roadmapContent: RoadmapContent;
  validation: ValidationResult;
  status: Status;
  reason: string;
}) {
  const { supabase, profile, seniorityLevel, roadmapContent, validation, status, reason } = input;
  const generatedAt = new Date().toISOString();
  const deleteResult = await supabase
    .from('pregenerated_roadmaps')
    .delete()
    .eq('roleId', profile.key)
    .eq('seniorityLevel', seniorityLevel);
  if (deleteResult.error) throw deleteResult.error;

  const insertResult = await supabase.from('pregenerated_roadmaps').insert({
    roleId: profile.key,
    jobTitle: profile.title,
    seniorityLevel,
    roadmapContent,
    qualityScore: validation.roleMatch,
    topKeywords: validation.topKeywords,
    status,
    generatedAt,
    reviewReason: reason || null,
    suspiciousItems: validation.suspiciousItems,
  });
  if (insertResult.error) throw insertResult.error;
}

async function ensureTableExists(supabase: AnySupabaseClient) {
  const { error } = await supabase
    .from('pregenerated_roadmaps')
    .select('roleId')
    .limit(1);
  if (error) {
    throw new Error(`pregenerated_roadmaps is not queryable. Apply supabase/14_pregenerated_roadmaps.sql first. Supabase error: ${error.message}`);
  }
}

function firstWords(value: string, limit = 220) {
  return value.replace(/\s+/g, ' ').trim().slice(0, limit);
}

function variantKey(roleId: string, seniorityLevel: RoadmapSeniorityLevel) {
  return `${roleId}::${seniorityLevel}`;
}

async function loadExistingVariantKeys(supabase: AnySupabaseClient): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('pregenerated_roadmaps')
    .select('roleId, seniorityLevel');
  if (error) throw error;
  return new Set<string>((data || []).map((row: { roleId: string; seniorityLevel: RoadmapSeniorityLevel }) => variantKey(row.roleId, row.seniorityLevel)));
}

async function summarizePregeneratedTable(supabase: AnySupabaseClient, roles: RoleProfile[]) {
  const roleIds = new Set(roles.map(role => role.key));
  const { data, error } = await supabase
    .from('pregenerated_roadmaps')
    .select('roleId, jobTitle, seniorityLevel, status, reviewReason, suspiciousItems');
  if (error) throw error;

  const rows = ((data || []) as Array<{
    roleId: string;
    jobTitle: string;
    seniorityLevel: RoadmapSeniorityLevel;
    status: Status;
    reviewReason?: string | null;
    suspiciousItems?: string[] | null;
  }>).filter(row => roleIds.has(row.roleId));

  const rowsByRole = new Map<string, typeof rows>();
  for (const row of rows) {
    const group = rowsByRole.get(row.roleId) || [];
    group.push(row);
    rowsByRole.set(row.roleId, group);
  }

  const approvedRows = rows.filter(row => row.status === 'APPROVED').length;
  const needsReviewRows = rows.filter(row => row.status === 'NEEDS_REVIEW').length;
  let approvedRoles = 0;
  let needsReviewRoles = 0;
  for (const role of roles) {
    const roleRows = rowsByRole.get(role.key) || [];
    const hasAllVariants = SENIORITY_LEVELS.every(level => roleRows.some(row => row.seniorityLevel === level));
    const hasNeedsReview = roleRows.some(row => row.status === 'NEEDS_REVIEW');
    if (hasAllVariants && !hasNeedsReview) approvedRoles += 1;
    else needsReviewRoles += 1;
  }

  const flagged = rows
    .filter(row => row.status === 'NEEDS_REVIEW')
    .map(row => ({
      jobTitle: repairMojibakeText(row.jobTitle),
      seniorityLevel: row.seniorityLevel,
      reason: row.reviewReason || 'NEEDS_REVIEW',
      suspiciousItems: row.suspiciousItems || [],
    }));

  return { approvedRows, needsReviewRows, approvedRoles, needsReviewRoles, flagged };
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function legacyRunConfusionTests(supabase: AnySupabaseClient) {
  const tests = [
    {
      title: 'Chuyên viên tư vấn thuế',
      must: ['thuế gtgt', 'tndn', 'tncn', 'kê khai', 'quyết toán thuế'],
      mustNot: ['sop văn phòng', 'vendor tracking', 'onboarding'],
    },
    {
      title: 'Nha sĩ',
      must: ['điều trị', 'x quang', 'hồ sơ bệnh án'],
      mustNot: ['kpi tuyển dụng', 'financial model'],
    },
    {
      title: 'Kỹ thuật viên điện lạnh',
      must: ['hvac', 'gas', 'làm lạnh'],
      mustNot: ['bệnh án', 'audit'],
    },
    {
      title: 'Quản lý trung tâm ngoại ngữ',
      must: ['enrollment', 'class fill', 'retention học viên'],
      mustNot: ['giáo án', 'lesson plan'],
    },
    {
      title: 'Chief Accountant',
      must: ['ifrs', 'consolidation', 'financial statement'],
      mustNot: ['sop văn phòng', 'recruitment'],
    },
  ];

  const profiles = getAllRoleProfiles();
  const results = [];
  for (const test of tests) {
    const profile = profiles.find(item => normalizeForCheck(item.title) === normalizeForCheck(test.title))
      || profiles.find(item => normalizeForCheck(item.title).includes(normalizeForCheck(test.title)));
    if (!profile) {
      results.push({ jobTitle: test.title, verdict: 'FAIL', reason: 'role profile not found' });
      continue;
    }
    const { data, error } = await supabase
      .from('pregenerated_roadmaps')
      .select('seniorityLevel, roadmapContent, status')
      .eq('roleId', profile.key)
      .eq('status', 'APPROVED');
    if (error || !data?.length) {
      results.push({ jobTitle: profile.title, verdict: 'FAIL', reason: error?.message || 'no approved roadmap' });
      continue;
    }
    const rows = (data || []) as Array<{ roadmapContent?: unknown }>;
    const text = normalizeForCheck(rows.map(row => JSON.stringify(row.roadmapContent || '')).join('\n'));
    const missing = test.must.filter(term => !text.includes(normalizeForCheck(term)));
    const forbidden = test.mustNot.filter(term => text.includes(normalizeForCheck(term)));
    results.push({
      jobTitle: profile.title,
      verdict: missing.length === 0 && forbidden.length === 0 ? 'PASS' : 'FAIL',
      missing,
      forbidden,
      variantsChecked: data.length,
    });
  }
  console.log('Five confusion tests:');
  console.log(JSON.stringify(results, null, 2));
}

async function runConfusionTests(supabase: AnySupabaseClient) {
  const tests = [
    {
      title: 'Chuyên viên tư vấn thuế',
      requiredAny: ['thuế', 'gtgt', 'tndn', 'tncn', 'kê khai', 'quyết toán', 'hoàn thuế'],
      mustNot: ['sop văn phòng', 'vendor tracking', 'onboarding'],
    },
    {
      title: 'Nha sĩ',
      requiredAny: ['x-quang', 'x quang', 'xquang', 'cbct', 'chụp phim', 'chẩn đoán', 'điều trị nha'],
      mustNot: ['kpi tuyển dụng', 'financial model'],
    },
    {
      title: 'Kỹ thuật viên điện lạnh',
      requiredAny: ['làm lạnh', 'lạnh', 'hvac', 'gas', 'áp suất', 'rò gas', 'điện lạnh'],
      mustNot: ['bệnh án', 'audit'],
    },
    {
      title: 'Quản lý trung tâm ngoại ngữ',
      requiredAny: ['enrollment', 'học viên', 'retention', 'class fill', 'tuyển sinh'],
      mustNot: ['giáo án', 'lesson plan'],
    },
    {
      title: 'Chief Accountant',
      requiredAny: ['ifrs', 'consolidation', 'kết chuyển', 'báo cáo tài chính', 'financial statement', 'closing', 'audit', 'kiểm toán'],
      mustNot: ['sop văn phòng', 'recruitment'],
    },
  ];

  const normalizeKeywordText = (content: string) => content
    .toLowerCase()
    .replace(/[-/.]/g, ' ')
    .replace(/\s+/g, ' ');

  const check = (keywords: string, terms: string[]) => terms.some(term => keywords.includes(normalizeKeywordText(term)));

  const profiles = getAllRoleProfiles();
  const results = [];
  for (const test of tests) {
    const profile = profiles.find(item => normalizeForCheck(item.title) === normalizeForCheck(test.title))
      || profiles.find(item => normalizeForCheck(item.title).includes(normalizeForCheck(test.title)));
    if (!profile) {
      results.push({ jobTitle: test.title, verdict: 'FAIL', reason: 'role profile not found' });
      continue;
    }
    const { data, error } = await supabase
      .from('pregenerated_roadmaps')
      .select('seniorityLevel, roadmapContent, status')
      .eq('roleId', profile.key)
      .eq('status', 'APPROVED');
    if (error || !data?.length) {
      results.push({ jobTitle: profile.title, verdict: 'FAIL', reason: error?.message || 'no approved roadmap' });
      continue;
    }
    const rows = (data || []) as Array<{ roadmapContent?: unknown }>;
    const keywords = normalizeKeywordText(rows.map(row => JSON.stringify(row.roadmapContent || '')).join('\n'));
    const hasRequired = check(keywords, test.requiredAny);
    const forbidden = test.mustNot.filter(term => keywords.includes(normalizeKeywordText(term)));
    results.push({
      jobTitle: profile.title,
      verdict: hasRequired && forbidden.length === 0 ? 'PASS' : 'FAIL',
      missing: hasRequired ? [] : test.requiredAny,
      forbidden,
      variantsChecked: data.length,
    });
  }
  console.log('Five confusion tests:');
  console.log(JSON.stringify(results, null, 2));
}

async function processRole(input: {
  client: OpenAI;
  supabase: AnySupabaseClient;
  profile: RoleProfile;
  position: number;
  total: number;
  existingKeys: Set<string>;
}): Promise<{ flagged: FlaggedRole[]; approvedRows: number; needsReviewRows: number; roleNeedsReview: boolean }> {
  const { client, supabase, profile, position, total, existingKeys } = input;
  const flagged: FlaggedRole[] = [];
  let approvedRows = 0;
  let needsReviewRows = 0;
  let roleNeedsReview = false;

  console.log(`Processing ${position}/${total}: ${repairMojibakeText(profile.title)}...`);

  for (const seniorityLevel of SENIORITY_LEVELS) {
    if (existingKeys.has(variantKey(profile.key, seniorityLevel))) {
      console.log(`  SKIP ${repairMojibakeText(profile.title)} ${seniorityLevel} already saved`);
      continue;
    }

    let roadmapContent: RoadmapContent;
    let validation: ValidationResult;
    let reason = '';

    try {
      roadmapContent = await generateOne(client, profile, seniorityLevel);
      validation = await validateOne(client, profile, roadmapContent);
      reason = validation.verdict === 'PASS' ? '' : `validation failed: roleMatch=${validation.roleMatch}; suspicious=${validation.suspiciousItems.join(', ')}`;

      if (validation.verdict === 'FAIL') {
        console.warn(`  FAIL ${repairMojibakeText(profile.title)} ${seniorityLevel}; regenerating once. ${firstWords(reason)}`);
        roadmapContent = await generateOne(client, profile, seniorityLevel);
        validation = await validateOne(client, profile, roadmapContent);
        reason = validation.verdict === 'PASS' ? '' : `validation failed after retry: roleMatch=${validation.roleMatch}; suspicious=${validation.suspiciousItems.join(', ')}`;
      }
    } catch (error) {
      reason = `variant failed after retries: ${error instanceof Error ? error.message : String(error)}`;
      roadmapContent = normalizeRoadmapContent(`NEEDS_REVIEW: ${reason}`, profile, seniorityLevel);
      validation = {
        roleMatch: 0,
        topKeywords: [],
        suspiciousItems: [reason],
        verdict: 'FAIL',
      };
    }

    const status: Status = validation.verdict === 'PASS' ? 'APPROVED' : 'NEEDS_REVIEW';
    await saveRoadmap({ supabase, profile, seniorityLevel, roadmapContent, validation, status, reason });
    existingKeys.add(variantKey(profile.key, seniorityLevel));

    if (status === 'APPROVED') {
      approvedRows += 1;
      console.log(`  APPROVED ${repairMojibakeText(profile.title)} ${seniorityLevel} score=${validation.roleMatch} keywords=${validation.topKeywords.join(', ')}`);
    } else {
      needsReviewRows += 1;
      roleNeedsReview = true;
      flagged.push({
        roleId: profile.key,
        jobTitle: repairMojibakeText(profile.title),
        seniorityLevel,
        reason,
        suspiciousItems: validation.suspiciousItems,
      });
      console.warn(`  NEEDS_REVIEW ${repairMojibakeText(profile.title)} ${seniorityLevel} ${firstWords(reason)}`);
    }
  }

  return { flagged, approvedRows, needsReviewRows, roleNeedsReview };
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!supabaseUrl || !serviceKey) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  if (!apiKey) throw new Error('Missing DEEPSEEK_API_KEY');

  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  await ensureTableExists(supabase);

  const client = new OpenAI({ baseURL: 'https://api.deepseek.com', apiKey });
  const allRoles = getAllRoleProfiles();
  const roleFilter = new Set(ROLE_ID_FILTER);
  const roles = roleFilter.size ? allRoles.filter(role => roleFilter.has(role.key)) : allRoles;
  if (roleFilter.size && roles.length !== roleFilter.size) {
    const found = new Set(roles.map(role => role.key));
    const missing = [...roleFilter].filter(roleId => !found.has(roleId));
    throw new Error(`PREGENERATE_ROLE_IDS not found: ${missing.join(', ')}`);
  }
  const existingKeys = FORCE_REGENERATE ? new Set<string>() : await loadExistingVariantKeys(supabase);
  const flagged: FlaggedRole[] = [];
  let approvedRoles = 0;
  let needsReviewRoles = 0;
  let approvedRows = 0;
  let needsReviewRows = 0;

  console.log(`Starting pregeneration for ${roles.length} roles (${roles.length * SENIORITY_LEVELS.length} variants). Existing variants: ${existingKeys.size}. Batch size: ${BATCH_SIZE}. Delay: ${CALL_DELAY_MS}ms/call. Force: ${FORCE_REGENERATE ? 'yes' : 'no'}.`);

  for (let index = 0; index < roles.length; index += BATCH_SIZE) {
    const batch = roles.slice(index, index + BATCH_SIZE);
    const batchStart = index + 1;
    const batchEnd = Math.min(roles.length, index + batch.length);
    console.log(`Batch ${Math.floor(index / BATCH_SIZE) + 1}: roles ${batchStart}-${batchEnd}/${roles.length}`);

    const results = await Promise.all(batch.map((profile, offset) => processRole({
      client,
      supabase,
      profile,
      position: index + offset + 1,
      total: roles.length,
      existingKeys,
    })));

    for (const result of results) {
      flagged.push(...result.flagged);
      approvedRows += result.approvedRows;
      needsReviewRows += result.needsReviewRows;
      if (result.roleNeedsReview) needsReviewRoles += 1;
      else approvedRoles += 1;
    }
  }

  const summary = await summarizePregeneratedTable(supabase, roles);
  approvedRoles = summary.approvedRoles;
  needsReviewRoles = summary.needsReviewRoles;
  approvedRows = summary.approvedRows;
  needsReviewRows = summary.needsReviewRows;

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const flaggedForReport = summary.flagged.length ? summary.flagged : flagged.map(item => ({
    jobTitle: item.jobTitle,
    seniorityLevel: item.seniorityLevel,
    reason: item.reason,
    suspiciousItems: item.suspiciousItems,
  }));
  writeFileSync(FLAGGED_PATH, JSON.stringify(flaggedForReport, null, 2), 'utf8');

  console.log(`Tổng APPROVED: ${approvedRoles}/${roles.length}`);
  console.log(`Tổng NEEDS_REVIEW: ${needsReviewRoles}/${roles.length}`);
  console.log(`Rows APPROVED: ${approvedRows}/${roles.length * SENIORITY_LEVELS.length}`);
  console.log(`Rows NEEDS_REVIEW: ${needsReviewRows}/${roles.length * SENIORITY_LEVELS.length}`);
  console.log(`File flagged_roles.json: ${FLAGGED_PATH}`);
  console.log('First 5 flagged roles:');
  console.log(JSON.stringify(flaggedForReport.slice(0, 5), null, 2));

  await runConfusionTests(supabase);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
