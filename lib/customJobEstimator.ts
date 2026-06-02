import type { SalaryBandInput } from '@/lib/salaryBenchmark';
import {
  detectRoleSegment,
  getRoleLanguage,
  getRoleSegmentLabel,
  normalizeRoleText,
  type RoleSegment,
} from '@/lib/roleTaxonomy';

export interface CustomJobEstimate {
  bands: SalaryBandInput;
  industry: string;
  functionGroup: string;
  confidenceScore: number;
  sources: string[];
}

const segmentMedianBands: Partial<Record<RoleSegment, SalaryBandInput>> = {
  blue_collar: { top_50: 10_000_000, top_20: 14_000_000, top_10: 18_000_000, top_5: 24_000_000 },
  cleaning: { top_50: 8_000_000, top_20: 10_000_000, top_10: 12_000_000, top_5: 15_000_000 },
  security: { top_50: 8_500_000, top_20: 11_000_000, top_10: 14_000_000, top_5: 17_000_000 },
  driver_delivery: { top_50: 12_000_000, top_20: 16_000_000, top_10: 22_000_000, top_5: 30_000_000 },
  fnb: { top_50: 11_000_000, top_20: 16_000_000, top_10: 23_000_000, top_5: 32_000_000 },
  hospitality: { top_50: 10_000_000, top_20: 15_000_000, top_10: 22_000_000, top_5: 30_000_000 },
  retail: { top_50: 11_000_000, top_20: 16_000_000, top_10: 23_000_000, top_5: 32_000_000 },
  customer_service: { top_50: 12_000_000, top_20: 18_000_000, top_10: 25_000_000, top_5: 35_000_000 },
  admin_office: { top_50: 12_000_000, top_20: 18_000_000, top_10: 25_000_000, top_5: 35_000_000 },
  statistics_data: { top_50: 8_000_000, top_20: 10_000_000, top_10: 12_000_000, top_5: 15_000_000 },
  accounting: { top_50: 15_000_000, top_20: 23_000_000, top_10: 32_000_000, top_5: 45_000_000 },
  hr: { top_50: 15_000_000, top_20: 23_000_000, top_10: 32_000_000, top_5: 45_000_000 },
  sales: { top_50: 16_000_000, top_20: 28_000_000, top_10: 45_000_000, top_5: 70_000_000 },
  marketing: { top_50: 18_000_000, top_20: 30_000_000, top_10: 45_000_000, top_5: 65_000_000 },
  media_content: { top_50: 14_000_000, top_20: 22_000_000, top_10: 32_000_000, top_5: 45_000_000 },
  design: { top_50: 18_000_000, top_20: 30_000_000, top_10: 45_000_000, top_5: 65_000_000 },
  it: { top_50: 25_000_000, top_20: 40_000_000, top_10: 60_000_000, top_5: 85_000_000 },
  finance: { top_50: 22_000_000, top_20: 38_000_000, top_10: 60_000_000, top_5: 90_000_000 },
  legal: { top_50: 20_000_000, top_20: 35_000_000, top_10: 55_000_000, top_5: 80_000_000 },
  education: { top_50: 12_000_000, top_20: 18_000_000, top_10: 28_000_000, top_5: 40_000_000 },
  language_center: { top_50: 14_000_000, top_20: 22_000_000, top_10: 32_000_000, top_5: 45_000_000 },
  healthcare: { top_50: 18_000_000, top_20: 32_000_000, top_10: 55_000_000, top_5: 90_000_000 },
  engineering: { top_50: 18_000_000, top_20: 28_000_000, top_10: 40_000_000, top_5: 55_000_000 },
  logistics: { top_50: 15_000_000, top_20: 24_000_000, top_10: 35_000_000, top_5: 48_000_000 },
  procurement_supply: { top_50: 17_000_000, top_20: 28_000_000, top_10: 42_000_000, top_5: 60_000_000 },
  agriculture: { top_50: 13_000_000, top_20: 20_000_000, top_10: 30_000_000, top_5: 42_000_000 },
  beauty_spa: { top_50: 11_000_000, top_20: 18_000_000, top_10: 28_000_000, top_5: 45_000_000 },
  events: { top_50: 12_000_000, top_20: 22_000_000, top_10: 35_000_000, top_5: 55_000_000 },
  business_owner: { top_50: 18_000_000, top_20: 35_000_000, top_10: 60_000_000, top_5: 100_000_000 },
  executive: { top_50: 60_000_000, top_20: 100_000_000, top_10: 160_000_000, top_5: 240_000_000 },
};

const generalBands: SalaryBandInput = { top_50: 15_000_000, top_20: 22_000_000, top_10: 32_000_000, top_5: 45_000_000 };

const roleSpecificBands: Array<{ matcher: RegExp; bands: SalaryBandInput }> = [
  { matcher: /nhan vien y te truong hoc|y te truong hoc|y te hoc duong|school nurse|school health/, bands: { top_50: 9_000_000, top_20: 13_000_000, top_10: 17_000_000, top_5: 24_000_000 } },
  { matcher: /tro ly nha khoa|phu ta nha khoa|dental assistant/, bands: { top_50: 8_000_000, top_20: 11_000_000, top_10: 14_000_000, top_5: 18_000_000 } },
  { matcher: /bao mau|mam non|preschool assistant|kindergarten assistant/, bands: { top_50: 7_500_000, top_20: 9_500_000, top_10: 12_000_000, top_5: 15_000_000 } },
  { matcher: /giao vu|academic admin|academic coordinator/, bands: { top_50: 9_000_000, top_20: 12_000_000, top_10: 16_000_000, top_5: 22_000_000 } },
  { matcher: /nhap lieu|data entry/, bands: { top_50: 7_500_000, top_20: 9_500_000, top_10: 12_000_000, top_5: 15_000_000 } },
  { matcher: /nhan vien kho|kho hang|warehouse/, bands: { top_50: 9_000_000, top_20: 12_000_000, top_10: 16_000_000, top_5: 22_000_000 } },
  { matcher: /van hanh san thuong mai dien tu|ecommerce operator|e-commerce operator|marketplace operator/, bands: { top_50: 12_000_000, top_20: 18_000_000, top_10: 26_000_000, top_5: 36_000_000 } },
  { matcher: /ky thuat vien dien lanh|dien lanh dan dung|hvac technician/, bands: { top_50: 11_000_000, top_20: 15_000_000, top_10: 20_000_000, top_5: 28_000_000 } },
  { matcher: /\besg\b|sustainability|phat trien ben vung/, bands: { top_50: 17_000_000, top_20: 25_000_000, top_10: 36_000_000, top_5: 50_000_000 } },
  { matcher: /spa tri lieu|ky thuat vien spa|spa therapist/, bands: { top_50: 9_000_000, top_20: 13_000_000, top_10: 18_000_000, top_5: 28_000_000 } },
  { matcher: /thu mua nong san|nong san.*thu mua/, bands: { top_50: 10_000_000, top_20: 15_000_000, top_10: 22_000_000, top_5: 30_000_000 } },
];

function getDeterministicBands(jobTitle: string, segment: RoleSegment) {
  const text = normalizeRoleText(jobTitle);
  return roleSpecificBands.find(item => item.matcher.test(text))?.bands || segmentMedianBands[segment] || generalBands;
}

function roundSalary(value: number) {
  return Math.max(500_000, Math.round(value / 500_000) * 500_000);
}

function normalizeBands(input: SalaryBandInput): SalaryBandInput {
  const top50 = roundSalary(input.top_50);
  const top20 = roundSalary(Math.max(input.top_20 ?? top50 * 1.4, top50 * 1.12));
  const top10 = roundSalary(Math.max(input.top_10 ?? top20 * 1.25, top20 * 1.12));
  const top5 = roundSalary(Math.max(input.top_5 ?? top10 * 1.25, top10 * 1.12));
  return { top_50: top50, top_20: top20, top_10: top10, top_5: top5 };
}

function hasDomainLeak(segment: RoleSegment, value: string) {
  const text = normalizeRoleText(value);
  const schoolHealthcare = /y te hoc duong|y te truong hoc|school nurse|so cuu hoc duong|ho so suc khoe hoc sinh|thuoc|di ung|chuyen tuyen|tiem chung/.test(text);
  if (!['it', 'semiconductor'].includes(segment) && /github|typescript|javascript|system design|code review|pull request|frontend|backend|devops/.test(text)) return true;
  if (!['engineering', 'blue_collar', 'agriculture'].includes(segment) && /\boee\b|\brca\b|lean|six sigma|plc|nha may|san xuat|line leader|van hanh may|defect rate|downtime/.test(text)) return true;
  if (!['education', 'school_leadership', 'language_center', 'freelance_teaching', 'research'].includes(segment) && /tesol|celta|lesson plan|hoc vien|curriculum|rubric speaking|rubric writing/.test(text)) return true;
  if (!['education', 'school_leadership', 'language_center', 'freelance_teaching', 'research'].includes(segment) && /phu huynh/.test(text) && !schoolHealthcare) return true;
  return false;
}

function validateAiEstimate(raw: unknown, segment: RoleSegment, guardBands: SalaryBandInput): SalaryBandInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const bands = normalizeBands({
    top_50: Number(obj.top_50),
    top_20: Number(obj.top_20),
    top_10: Number(obj.top_10),
    top_5: Number(obj.top_5),
  });
  if (!Number.isFinite(bands.top_50) || bands.top_50 < 4_000_000 || bands.top_50 > 250_000_000) return null;
  if ((bands.top_20 ?? 0) <= bands.top_50 || (bands.top_10 ?? 0) <= (bands.top_20 ?? 0) || (bands.top_5 ?? 0) <= (bands.top_10 ?? 0)) return null;
  const maxRatio = ['executive', 'business_owner', 'sales', 'creator_entertainment'].includes(segment) ? 8 : 4.5;
  if ((bands.top_5 ?? 0) > bands.top_50 * maxRatio) return null;
  const guard = normalizeBands(guardBands);
  const highVariance = ['executive', 'business_owner', 'sales', 'creator_entertainment', 'finance', 'it'].includes(segment);
  const maxTop50 = guard.top_50 * (highVariance ? 1.8 : 1.45);
  const maxTop5 = (guard.top_5 ?? guard.top_50 * 2) * (highVariance ? 2.0 : 1.6);
  const minTop50 = guard.top_50 * 0.65;
  if (bands.top_50 < minTop50 || bands.top_50 > maxTop50 || (bands.top_5 ?? 0) > maxTop5) return null;
  if (hasDomainLeak(segment, JSON.stringify(raw))) return null;
  return bands;
}

async function estimateWithDeepSeek(jobTitle: string, segment: RoleSegment, guardBands: SalaryBandInput): Promise<SalaryBandInput | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;
  const language = getRoleLanguage(jobTitle);
  const label = getRoleSegmentLabel(segment);
  try {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey, baseURL: 'https://api.deepseek.com', timeout: 8000, maxRetries: 0 });
    const completion = await client.chat.completions.create({
      model: 'deepseek-v4-pro',
      response_format: { type: 'json_object' },
      temperature: 0.15,
      max_tokens: 420,
      messages: [
        {
          role: 'system',
          content: 'Bạn ước tính benchmark lương Việt Nam cho job ngoài database. Trả JSON thuần. Không bịa nguồn. Không đổi domain nghề theo học vấn/chứng chỉ. top_50/top_20/top_10/top_5 là VND/tháng cho mid-level toàn quốc trước hệ số tỉnh.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            jobTitle,
            detectedSegment: segment,
            segmentLabel: label,
            conservativeVietnamBandGuard: guardBands,
            roleLanguage: language,
            requiredJson: { top_50: 'number', top_20: 'number', top_10: 'number', top_5: 'number', rationale: 'short Vietnamese string' },
            hardRules: [
              'top_20 > top_50, top_10 > top_20, top_5 > top_10',
              'Không đưa thuật ngữ giáo dục nếu không phải giáo dục',
              'Không đưa thuật ngữ sản xuất/kỹ thuật nếu không phải sản xuất/kỹ thuật',
              'Ước tính bảo thủ để owner duyệt sau, không phóng đại.',
            ],
          }),
        },
      ],
    });
    const text = completion.choices[0]?.message?.content || '';
    return validateAiEstimate(JSON.parse(text), segment, guardBands);
  } catch {
    return null;
  }
}

export async function estimateCustomJobBenchmark(jobTitle: string): Promise<CustomJobEstimate> {
  const segment = detectRoleSegment(jobTitle);
  const industry = getRoleSegmentLabel(segment);
  const language = getRoleLanguage(jobTitle);
  const deterministicBands = normalizeBands(getDeterministicBands(jobTitle, segment));
  const text = normalizeRoleText(jobTitle);
  if (/nhan vien y te truong hoc|y te truong hoc|y te hoc duong|school nurse|school health/.test(text)) {
    return {
      bands: deterministicBands,
      industry,
      functionGroup: language.rolePath,
      confidenceScore: 62,
      sources: ['VSPI school healthcare guard - pending owner review'],
    };
  }
  const aiBands = await estimateWithDeepSeek(jobTitle, segment, deterministicBands);

  return {
    bands: aiBands || deterministicBands,
    industry,
    functionGroup: language.rolePath,
    confidenceScore: aiBands ? 58 : 52,
    sources: aiBands
      ? ['DeepSeek V4 Pro estimate - pending owner review', 'VSPI taxonomy guard']
      : ['VSPI taxonomy fallback - pending owner review'],
  };
}
