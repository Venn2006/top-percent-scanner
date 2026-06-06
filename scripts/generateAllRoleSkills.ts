import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnvConfig } from '@next/env';
import OpenAI from 'openai';
import { getAllRoleProfiles, normalizeRoleProfileText, type RoleProfile } from '../lib/roleProfiles';
import { repairMojibakeText } from '../lib/mojibake';

loadEnvConfig(process.cwd());

type SkillStatus = 'APPROVED' | 'NEEDS_MANUAL';

interface GeneratedSkillEntry {
  skills: string[];
  status: SkillStatus;
  industry: string;
  roleId: string;
  reason?: string;
  requestedTitle?: string;
}

type GeneratedSkillMap = Record<string, GeneratedSkillEntry>;

const OUTPUT_PATH = join(process.cwd(), 'data', 'generated_role_skills.json');
const MODEL = process.env.ROLE_SKILLS_MODEL || process.env.DEEPSEEK_MODEL || 'deepseek-v4-pro';
const CALL_DELAY_MS = Number(process.env.ROLE_SKILLS_CALL_DELAY_MS || 900);
const REQUEST_TIMEOUT_MS = Number(process.env.ROLE_SKILLS_TIMEOUT_MS || 60_000);
const SPOT_CHECK_TITLES = [
  'Chuyên viên nail',
  'Nhân viên spa khách sạn',
  'Kỹ thuật viên điện lạnh',
  'Nha sĩ',
  'Chuyên viên tư vấn thuế',
  'Quản lý trung tâm ngoại ngữ',
  'Chủ quán cà phê',
  'Brand Designer',
  'Nhân viên bếp',
  'Công nhân vận hành máy',
];

const SPOT_ALIASES: Record<string, string> = {
  'Nhân viên bếp': 'Đầu bếp (Chef)',
};

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function parseArgs() {
  const args = process.argv.slice(2);
  const spot = args.includes('--spot');
  const force = args.includes('--force');
  const dryRun = args.includes('--dry-run');
  const skipCrossIndustryCheck = args.includes('--skip-cross-industry-check');
  const titleArg = args.find(arg => arg.startsWith('--titles='));
  const titles = titleArg
    ? titleArg.replace(/^--titles=/, '').split('|').map(item => item.trim()).filter(Boolean)
    : spot
      ? SPOT_CHECK_TITLES
      : [];
  return { spot, force, dryRun, skipCrossIndustryCheck, titles };
}

function normalize(value: unknown) {
  return normalizeRoleProfileText(repairMojibakeText(String(value || '')));
}

function readExisting(): GeneratedSkillMap {
  if (!existsSync(OUTPUT_PATH)) return {};
  return JSON.parse(readFileSync(OUTPUT_PATH, 'utf8')) as GeneratedSkillMap;
}

function resolveProfiles(titles: string[]) {
  const profiles = getAllRoleProfiles();
  if (!titles.length) return profiles.map(profile => ({ profile, requestedTitle: profile.title }));

  return titles.map(requestedTitle => {
    const resolvedTitle = SPOT_ALIASES[requestedTitle] || requestedTitle;
    const normalizedTitle = normalize(resolvedTitle);
    const exact = profiles.find(profile => normalize(profile.title) === normalizedTitle)
      || profiles.find(profile => normalize(profile.titleKey) === normalizedTitle)
      || profiles.find(profile => normalize(profile.title).includes(normalizedTitle) || normalizedTitle.includes(normalize(profile.title)));
    if (!exact) throw new Error(`Role not found for spot title: ${requestedTitle}`);
    return { profile: exact, requestedTitle };
  });
}

function parseJsonArray(text: string): string[] {
  const cleaned = repairMojibakeText(text).trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const arrayText = cleaned.startsWith('[') ? cleaned : cleaned.match(/\[[\s\S]*\]/)?.[0] || cleaned;
  const parsed = JSON.parse(arrayText) as unknown;
  if (!Array.isArray(parsed)) throw new Error('model_output_not_array');
  return parsed.map(item => String(item).replace(/\s+/g, ' ').trim()).filter(Boolean);
}

const crossIndustryRules: Array<{ when: (profile: RoleProfile) => boolean; forbidden: RegExp; reason: string }> = [
  {
    when: profile => profile.segment !== 'beauty_spa' && !/spa|nail|tham my|salon/.test(normalize(profile.industry)),
    forbidden: /\bspa\b|massage thuy dien|deep tissue|hot stone|facial|cham soc da|tri lieu|lieu trinh spa|nail art|son gel|noi mi|phun xam/,
    reason: 'beauty_spa_terms_in_other_industry',
  },
  {
    when: profile => !/khach san|nha hang|du lich/.test(normalize(profile.industry)) && !['hospitality', 'fnb'].includes(profile.segment),
    forbidden: /housekeeping|buong phong|don phong|room attendant|front desk|pms|check in|check out|minibar|food cost|plating|recipe|bep|kitchen/,
    reason: 'hospitality_fnb_terms_in_other_industry',
  },
  {
    when: profile => !/giao duc/.test(normalize(profile.industry)) && profile.segment !== 'education',
    forbidden: /lesson plan|giao an|hoc vien|phu huynh|rubric|ielts|tesol|celta|curriculum|tuyen sinh|enrollment/,
    reason: 'education_terms_in_other_industry',
  },
  {
    when: profile => !/ke toan|tai chinh|kiem toan/.test(normalize(profile.industry)) && profile.segment !== 'finance' && !/tu van thue|ke toan thue|thue/.test(normalize(profile.title)),
    forbidden: /ke toan|bao cao tai chinh|thue gtgt|tndn|tncn|quyet toan thue|audit|ifrs|cashflow|p&l|financial model/,
    reason: 'finance_terms_in_other_industry',
  },
  {
    when: profile => !/nhan su/.test(normalize(profile.industry)) && profile.segment !== 'hr',
    forbidden: /tuyen dung|recruitment|onboarding|c&b|payroll|hrbp|jd analysis|time to fill|offer acceptance/,
    reason: 'hr_terms_in_other_industry',
  },
  {
    when: profile => !/it|phan mem|data/.test(normalize(profile.industry)) && !['technology', 'data'].includes(profile.segment),
    forbidden: /github|typescript|javascript|api|sql|python|machine learning|model training|code review|frontend|backend/,
    reason: 'tech_terms_in_other_industry',
  },
  {
    when: profile => !/y te|cham soc suc khoe/.test(normalize(profile.industry)) && !['healthcare', 'dental'].includes(profile.segment),
    forbidden: /benh an|x quang|cbct|vo khuan|phac do dieu tri|tiem chung|so cuu|benh nhan/,
    reason: 'healthcare_terms_in_other_industry',
  },
];

const roleBoundaryRules: Array<{ match: RegExp; requiredAny: RegExp[]; forbidden: RegExp; reason: string }> = [
  {
    match: /chuyen vien nail|nail/,
    requiredAny: [/son gel/, /cat da/, /ve nail/, /nail art/, /noi mong/, /thao gel/, /cham soc mong/],
    forbidden: /massage thuy dien|deep tissue|hot stone|facial|body treatment|tri lieu spa|buong phong|housekeeping|food cost|recipe|giao an|ke toan|recruitment/,
    reason: 'nail_must_not_be_spa_or_other_role',
  },
  {
    match: /spa khach san|ky thuat vien spa|chuyen vien spa/,
    requiredAny: [/massage/, /facial/, /cham soc da/, /body treatment/, /tu van lieu trinh/, /phong tri lieu/],
    forbidden: /housekeeping|buong phong|don phong|room attendant|minibar|lost found|front desk|pms|recipe|food cost/,
    reason: 'spa_must_not_be_housekeeping',
  },
  {
    match: /nha si|dentist/,
    requiredAny: [/chan doan/, /dieu tri/, /rang/, /x quang/, /vo khuan/, /benh an nha khoa/],
    forbidden: /recruitment|hr|lesson plan|giao an|food cost|massage|facial|github|typescript/,
    reason: 'dentist_must_be_dental',
  },
  {
    match: /tu van thue|ke toan thue/,
    requiredAny: [/thue/, /gtgt/, /tndn/, /tncn/, /quyet toan/, /ke khai thue/, /hoan thue/],
    forbidden: /massage|facial|lesson plan|housekeeping|github|food cost|tuyen dung/,
    reason: 'tax_must_be_tax',
  },
  {
    match: /quan ly trung tam ngoai ngu/,
    requiredAny: [/tuyen sinh/, /hoc vien/, /lich lop/, /giao vien/, /retention/, /doanh thu trung tam/],
    forbidden: /massage|facial|housekeeping|food cost|chan doan|ke khai thue|github/,
    reason: 'language_center_manager_must_be_ops',
  },
  {
    match: /dien lanh|hvac/,
    requiredAny: [/gas lanh/, /may lanh/, /block/, /ap suat/, /bao tri/, /sua chua/, /dien lanh/],
    forbidden: /massage|facial|lesson plan|ke khai thue|food cost|recruitment|benh an/,
    reason: 'hvac_must_be_hvac',
  },
  {
    match: /brand designer/,
    requiredAny: [/brand identity/, /logo/, /key visual/, /guideline/, /layout/, /typography/],
    forbidden: /massage|facial|ke khai thue|housekeeping|benh an|food cost|recruitment/,
    reason: 'brand_designer_must_be_design',
  },
  {
    match: /chu quan ca phe/,
    requiredAny: [/menu/, /nguyen lieu/, /ca phe/, /nhan vien/, /doanh thu/, /pos/, /khach hang/],
    forbidden: /massage|facial|ke khai thue|benh an|lesson plan|github|housekeeping/,
    reason: 'coffee_owner_must_be_cafe_ops',
  },
  {
    match: /dau bep|nhan vien bep|phu bep|chef/,
    requiredAny: [/so che/, /ra mon/, /recipe/, /food cost/, /an toan thuc pham/, /bep/, /plating/],
    forbidden: /massage|facial|ke khai thue|lesson plan|github|benh an|recruitment|front desk/,
    reason: 'kitchen_must_be_kitchen',
  },
  {
    match: /cong nhan van hanh may/,
    requiredAny: [/van hanh may/, /sop/, /san luong/, /loi may/, /bao tri/, /an toan lao dong/, /ban giao ca/],
    forbidden: /massage|facial|ke khai thue|lesson plan|github|benh an|food cost|recruitment/,
    reason: 'machine_operator_must_be_machine_ops',
  },
];

function validateSkills(profile: RoleProfile, skills: string[], options: { skipCrossIndustryCheck?: boolean } = {}) {
  const reasons: string[] = [];
  if (skills.length !== 10) reasons.push(`expected_10_items_got_${skills.length}`);
  if (options.skipCrossIndustryCheck) return { passed: reasons.length === 0, reasons };

  if (new Set(skills.map(skill => normalize(skill))).size !== skills.length) reasons.push('duplicate_items');
  if (skills.some(skill => skill.length < 8 || skill.length > 120)) reasons.push('item_length_out_of_bounds');

  const title = normalize(profile.title);
  const text = normalize(skills.join(' | '));
  for (const rule of crossIndustryRules) {
    if (rule.when(profile) && rule.forbidden.test(text)) reasons.push(rule.reason);
  }
  for (const rule of roleBoundaryRules) {
    if (!rule.match.test(title)) continue;
    if (rule.forbidden.test(text)) reasons.push(rule.reason + '_forbidden');
    if (!rule.requiredAny.some(pattern => pattern.test(text))) reasons.push(rule.reason + '_missing_required');
  }

  return { passed: reasons.length === 0, reasons };
}

async function generateSkills(client: OpenAI, profile: RoleProfile) {
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    {
      role: 'system',
      content: 'Bạn là chuyên gia HR Việt Nam.\nLiệt kê đúng 10 kỹ năng/công việc thực tế của nghề này. Chỉ output JSON, không giải thích.',
    },
    {
      role: 'user',
      content: `Nghề: ${profile.title}\nNgành: ${profile.industry || 'Không rõ'}\n\nYêu cầu:\n- Đây là việc người làm "${profile.title}" thực sự làm hàng ngày tại công ty Việt Nam\n- Không phải kỹ năng của nghề khác\n- Dùng tiếng Việt, đủ dấu\n- Output JSON array duy nhất:\n["skill 1","skill 2",...,"skill 10"]`,
    },
  ];

  const completion = await client.chat.completions.create(
    {
      model: MODEL,
      messages,
      temperature: 0.1,
      max_tokens: 1600,
    },
    { timeout: REQUEST_TIMEOUT_MS },
  );
  return parseJsonArray(completion.choices[0]?.message?.content || '');
}

async function generateOne(
  client: OpenAI,
  profile: RoleProfile,
  options: { skipCrossIndustryCheck?: boolean } = {},
): Promise<{ skills: string[]; status: SkillStatus; reason?: string }> {
  let lastReason = 'unknown_error';
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      if (attempt > 1) await sleep(CALL_DELAY_MS);
      const skills = await generateSkills(client, profile);
      const validation = validateSkills(profile, skills, options);
      if (validation.passed) return { skills, status: 'APPROVED' };
      lastReason = validation.reasons.join(', ');
    } catch (error) {
      lastReason = error instanceof Error ? error.message : String(error);
    }
  }
  return { skills: [], status: 'NEEDS_MANUAL', reason: lastReason };
}

async function main() {
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Missing DEEPSEEK_API_KEY or OPENAI_API_KEY');
  const baseURL = process.env.ROLE_SKILLS_BASE_URL || (process.env.DEEPSEEK_API_KEY ? 'https://api.deepseek.com' : undefined);
  const client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}) });
  const args = parseArgs();
  const targets = resolveProfiles(args.titles);
  const output = readExisting();

  mkdirSync(join(process.cwd(), 'data'), { recursive: true });
  console.log(`Generating role skills for ${targets.length} roles. Model=${MODEL}. Force=${args.force ? 'yes' : 'no'}. DryRun=${args.dryRun ? 'yes' : 'no'}. SkipCrossIndustryCheck=${args.skipCrossIndustryCheck ? 'yes' : 'no'}.`);

  for (let index = 0; index < targets.length; index += 1) {
    const { profile, requestedTitle } = targets[index];
    if (!args.force && output[profile.title]?.status === 'APPROVED') {
      console.log(`SKIP ${index + 1}/${targets.length}: ${profile.title}`);
      continue;
    }
    console.log(`RUN ${index + 1}/${targets.length}: ${requestedTitle}${requestedTitle !== profile.title ? ` -> ${profile.title}` : ''}`);
    const result = await generateOne(client, profile, { skipCrossIndustryCheck: args.skipCrossIndustryCheck });
    output[profile.title] = {
      skills: result.skills,
      status: result.status,
      industry: profile.industry || 'Không rõ',
      roleId: profile.key,
      ...(requestedTitle !== profile.title ? { requestedTitle } : {}),
      ...(result.reason ? { reason: result.reason } : {}),
    };
    if (!args.dryRun) writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf8');
    console.log(`${result.status} ${profile.title}${result.reason ? ` (${result.reason})` : ''}`);
    await sleep(CALL_DELAY_MS);
  }

  const selected = Object.fromEntries(targets.map(({ profile }) => [profile.title, output[profile.title]]));
  console.log(JSON.stringify(selected, null, 2));
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
