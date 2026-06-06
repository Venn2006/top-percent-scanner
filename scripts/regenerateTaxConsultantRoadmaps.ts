import { loadEnvConfig } from '@next/env';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { SENIORITY_LEVELS, type RoadmapSeniorityLevel } from '../lib/pregeneratedRoadmaps';
import { getAllRoleProfiles, normalizeRoleProfileText, type RoleProfile } from '../lib/roleProfiles';

loadEnvConfig(process.cwd());

type Status = 'APPROVED' | 'NEEDS_REVIEW';

interface RoadmapContent {
  format: 'expert_v2';
  version: number;
  goal: string;
  summary: string;
  weeks: Array<{
    week: number;
    focus: string;
    tasks: string[];
    milestone: string;
  }>;
  negotiation_timing: string;
  salary_projection: string;
  markdown: string;
  selfCheck: { topKeywords: string[] };
}

interface ValidationResult {
  roleMatch: number;
  topKeywords: string[];
  suspiciousItems: string[];
  verdict: 'PASS' | 'FAIL';
}

const JOB_TITLE = 'Chuyên viên tư vấn thuế';
const MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro';
const REQUIRED_KEYWORDS = ['thuế', 'gtgt', 'tndn', 'tncn', 'kê khai', 'quyết toán', 'htkk', 'hoàn thuế', 'tư vấn thuế'];
const FORBIDDEN_PATTERN = /sop văn phòng|sla xử lý yêu cầu|hồ sơ hành chính|onboarding|vendor tracking|ticket nội bộ/i;
const MANDATORY_SKILLS = [
  'Kê khai thuế GTGT, TNDN, TNCN',
  'Quyết toán thuế cuối năm',
  'Đọc và phân tích chính sách thuế mới',
  'Làm việc với cơ quan thuế (thanh tra, kiểm tra)',
  'Lập hồ sơ hoàn thuế',
  'Tư vấn tối ưu thuế cho doanh nghiệp/cá nhân',
  'Rà soát hợp đồng về khía cạnh thuế',
  'Sử dụng phần mềm HTKK, MISA',
  'Theo dõi công văn/thông tư thuế mới',
];

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function normalize(value: unknown) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase();
}

function parseJsonObject<T>(text: string): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]) as T;
    throw new Error(`Model did not return JSON: ${text.slice(0, 240)}`);
  }
}

async function callDeepSeek<T>(client: OpenAI, messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[], parse: (text: string) => T, maxTokens = 2800): Promise<T> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const completion = await client.chat.completions.create({
        model: MODEL,
        messages,
        temperature: 0.05,
        max_tokens: maxTokens,
      });
      const text = completion.choices[0]?.message?.content?.trim() || '';
      if (!text) throw new Error('empty model response');
      return parse(text);
    } catch (error) {
      lastError = error;
      if (attempt < 3) await sleep(2000 * attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError || 'model call failed'));
}

function hasEnoughTaxKeywords(topKeywords: string[], roadmap: RoadmapContent) {
  const keywordText = normalize(topKeywords.join(' '));
  const fullText = normalize(`${topKeywords.join(' ')} ${JSON.stringify(roadmap)}`);
  const matches = REQUIRED_KEYWORDS.filter(term => keywordText.includes(normalize(term)) || fullText.includes(normalize(term)));
  return new Set(matches).size >= 2;
}

function hasForbiddenLeak(roadmap: RoadmapContent, validation?: ValidationResult) {
  return FORBIDDEN_PATTERN.test(JSON.stringify(roadmap)) || FORBIDDEN_PATTERN.test((validation?.suspiciousItems || []).join(' '));
}

function buildSystemPrompt(seniorityLevel: RoadmapSeniorityLevel) {
  return `Bạn là chuyên gia thị trường lao động Việt Nam.
Tạo lộ trình tăng lương cho đúng nghề này.

NGHỀ: ${JOB_TITLE}
CẤP BẬC: ${seniorityLevel}
NGÀNH: Tài chính - Kế toán - Thuế

BỘ KỸ NĂNG BẮT BUỘC (không được dùng skill ngoài list này):
- ${MANDATORY_SKILLS.join('\n- ')}

FORBIDDEN - TUYỆT ĐỐI KHÔNG DÙNG:
SOP văn phòng, SLA xử lý yêu cầu, hồ sơ hành chính, onboarding, vendor tracking, ticket nội bộ

QUY TẮC CỨNG:
1. Chỉ dùng vocabulary từ BỘ KỸ NĂNG BẮT BUỘC.
2. Mỗi task phải do người làm ${JOB_TITLE} thực hiện, không phải nghề khác.
3. Viết tiếng Việt đầy đủ dấu.
4. KHÔNG dùng từ nào thuộc ngành khác.
5. topKeywords phải chứa ít nhất 2 nhóm từ thuế như thuế, GTGT, TNDN, TNCN, kê khai, quyết toán, HTKK, hoàn thuế, tư vấn thuế.

SELF-CHECK TRƯỚC KHI OUTPUT:
Liệt kê 3 từ khóa ngành đặc trưng nhất xuất hiện trong lộ trình:
- Từ khóa 1: ___
- Từ khóa 2: ___
- Từ khóa 3: ___
Nếu 3 từ khóa này không match với ${JOB_TITLE} → viết lại toàn bộ.

Trả JSON hợp lệ, không markdown fence, theo schema:
Sau khi self-check pass, output lộ trình bằng Markdown đầy đủ. Không trả JSON.`;
}

function extractSelfCheckKeywords(markdown: string) {
  const keywords: string[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(/từ khóa\s*\d+\s*:\s*(.+)$/i);
    if (match?.[1]) keywords.push(match[1].trim());
  }
  return keywords.slice(0, 3);
}

function normalizeRoadmapContent(value: Partial<RoadmapContent>, seniorityLevel: RoadmapSeniorityLevel): RoadmapContent {
  const topKeywords = Array.isArray(value.selfCheck?.topKeywords) ? value.selfCheck.topKeywords.map(String).slice(0, 3) : [];
  return {
    format: 'expert_v2',
    version: 2,
    goal: String(value.goal || `Lộ trình tăng lương cho ${JOB_TITLE} - ${seniorityLevel}`),
    summary: String(value.summary || `Roadmap pre-generated cho ${JOB_TITLE} ở cấp ${seniorityLevel}.`),
    weeks: Array.isArray(value.weeks) ? value.weeks : [],
    negotiation_timing: String(value.negotiation_timing || 'Đàm phán khi có bằng chứng kê khai, quyết toán và tư vấn thuế đo được.'),
    salary_projection: String(value.salary_projection || 'Tăng lương phụ thuộc mức độ hoàn thành hồ sơ thuế và bằng chứng tác động.'),
    markdown: String(value.markdown || ''),
    selfCheck: { topKeywords },
  };
}

async function generateOne(client: OpenAI, seniorityLevel: RoadmapSeniorityLevel): Promise<RoadmapContent> {
  return callDeepSeek(
    client,
    [
      { role: 'system', content: buildSystemPrompt(seniorityLevel) },
      { role: 'user', content: `Generate riêng lộ trình cho ${JOB_TITLE}, cấp ${seniorityLevel}. Chỉ dùng kỹ năng thuế bắt buộc.` },
    ],
    text => normalizeRoadmapContent({
      markdown: text,
      selfCheck: { topKeywords: extractSelfCheckKeywords(text) },
    }, seniorityLevel),
    3600
  );
}

async function validateOne(client: OpenAI, seniorityLevel: RoadmapSeniorityLevel, roadmap: RoadmapContent): Promise<ValidationResult> {
  const validation = await callDeepSeek(
    client,
    [
      {
        role: 'system',
        content: `Bạn là validator roadmap nghề thuế. Trả JSON hợp lệ. FAIL nếu topKeywords không đúng nghề tư vấn thuế hoặc có forbidden terms: SOP văn phòng, SLA xử lý yêu cầu, hồ sơ hành chính, onboarding, vendor tracking, ticket nội bộ.`,
      },
      {
        role: 'user',
        content: `Nghề: ${JOB_TITLE}
Ngành: Tài chính - Kế toán - Thuế
Cấp bậc: ${seniorityLevel}

Lộ trình vừa generate:
${JSON.stringify(roadmap)}

Trả JSON:
{
  "roleMatch": 0-100,
  "topKeywords": ["kw1","kw2","kw3"],
  "suspiciousItems": [],
  "verdict": "PASS" | "FAIL"
}`,
      },
    ],
    text => parseJsonObject<ValidationResult>(text),
    1200
  );

  const topKeywords = Array.isArray(validation.topKeywords) && validation.topKeywords.length
    ? validation.topKeywords.map(String)
    : roadmap.selfCheck.topKeywords;
  const localPass = hasEnoughTaxKeywords(topKeywords, roadmap) && !hasForbiddenLeak(roadmap, validation);
  return {
    roleMatch: Number(validation.roleMatch) || 0,
    topKeywords,
    suspiciousItems: Array.isArray(validation.suspiciousItems) ? validation.suspiciousItems.map(String) : [],
    verdict: validation.verdict === 'PASS' && localPass ? 'PASS' : 'FAIL',
  };
}

function findTaxProfile(): RoleProfile {
  const exact = getAllRoleProfiles().find(profile => normalizeRoleProfileText(profile.title) === normalizeRoleProfileText(JOB_TITLE));
  if (exact) return exact;
  const contains = getAllRoleProfiles().find(profile => normalizeRoleProfileText(profile.title).includes(normalizeRoleProfileText(JOB_TITLE)));
  if (contains) return contains;
  throw new Error(`Role profile not found: ${JOB_TITLE}`);
}

async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!supabaseUrl || !serviceKey) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  if (!apiKey) throw new Error('Missing DEEPSEEK_API_KEY');

  const supabase = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const client = new OpenAI({ baseURL: 'https://api.deepseek.com', apiKey });
  const profile = findTaxProfile();

  const deleteResult = await supabase.from('pregenerated_roadmaps').delete().eq('jobTitle', JOB_TITLE);
  if (deleteResult.error) throw deleteResult.error;
  console.log(`Deleted existing rows for ${JOB_TITLE}`);

  const report: Array<{ seniorityLevel: RoadmapSeniorityLevel; status: Status; topKeywords: string[]; roleMatch: number; suspiciousItems: string[] }> = [];

  for (const seniorityLevel of SENIORITY_LEVELS) {
    let roadmap = await generateOne(client, seniorityLevel);
    let validation = await validateOne(client, seniorityLevel, roadmap);

    if (validation.verdict === 'FAIL') {
      console.warn(`FAIL ${seniorityLevel}; regenerating once. keywords=${validation.topKeywords.join(', ')} suspicious=${validation.suspiciousItems.join(', ')}`);
      await sleep(2000);
      roadmap = await generateOne(client, seniorityLevel);
      validation = await validateOne(client, seniorityLevel, roadmap);
    }

    const status: Status = validation.verdict === 'PASS' ? 'APPROVED' : 'NEEDS_REVIEW';
    const insertResult = await supabase.from('pregenerated_roadmaps').insert({
      roleId: profile.key,
      jobTitle: JOB_TITLE,
      seniorityLevel,
      roadmapContent: roadmap,
      qualityScore: validation.roleMatch,
      topKeywords: validation.topKeywords,
      status,
      generatedAt: new Date().toISOString(),
      reviewReason: status === 'APPROVED' ? null : `tax keyword validation failed; roleMatch=${validation.roleMatch}`,
      suspiciousItems: validation.suspiciousItems,
    });
    if (insertResult.error) throw insertResult.error;

    report.push({ seniorityLevel, status, topKeywords: validation.topKeywords, roleMatch: validation.roleMatch, suspiciousItems: validation.suspiciousItems });
    console.log(`${status} ${seniorityLevel}: ${validation.topKeywords.join(', ')}`);
    await sleep(2000);
  }

  console.log('Tax regenerate report:');
  console.log(JSON.stringify(report, null, 2));
}

main().catch(error => {
  console.error(error instanceof Error ? error.stack : error);
  process.exit(1);
});
