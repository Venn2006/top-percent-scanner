import OpenAI from 'openai';
import { detectRoleSegment } from './roleTaxonomy';
import { getExactRoleProfile, getRoleProfileById, normalizeRoleProfileText, type RoleProfile } from './roleProfiles';
import { repairMojibakeText } from './mojibake';

export type RoadmapRoleValidationSeverity = 'none' | 'low' | 'medium' | 'high';

export interface RoadmapRoleValidationResult {
  passed: boolean;
  wrongItems: string[];
  severity: RoadmapRoleValidationSeverity;
}

interface ManualRolePack {
  matcher: RegExp;
  label: string;
  canonicalTitle?: string;
  skills: string[];
  required: RegExp[];
  forbidden?: RegExp;
}

const manualRolePacks: ManualRolePack[] = [
  {
    matcher: /\b(nha si|nha s|dentist|bac si nha khoa|nha khoa|rang ham mat)\b/,
    label: 'Nha si',
    canonicalTitle: 'Nha sĩ',
    skills: [
      'Khám chẩn đoán và treatment plan nha khoa',
      'Vô khuẩn, an toàn thủ thuật và infection control',
      'X-quang/CBCT, photo intraoral và hồ sơ bệnh án ẩn danh',
      'Tư vấn ca điều trị, tái khám và feedback bệnh nhân',
    ],
    required: [/nha khoa|dental|rang ham mat|x quang|cbct|photo intraoral|ho so benh an/, /treatment plan|ke hoach dieu tri|chan doan/, /vo khuan|infection control|x quang|cbct|tai kham|benh nhan/],
    forbidden: /recruitment|recruiting|onboarding|hr dashboard|\bhr\b|time-to-fill|c&b|headcount/i,
  },
  {
    matcher: /ky su mep|mep engineer|co dien lanh/,
    label: 'Ky su MEP',
    canonicalTitle: 'Kỹ sư MEP (Cơ điện lạnh)',
    skills: [
      'MEP coordination, heat load và design basis',
      'BIM clash, shop drawing, BOQ và technical submittal',
      'Site supervision, test and commissioning và punch list',
      'Code compliance, safety, O&M handover và vendor coordination',
    ],
    required: [/mep|co dien lanh/, /bim|shop drawing|clash/, /boq|submittal|commissioning|punch list|o&m/],
    forbidden: /benh an|benh nhan|patient|dieu tri|treatment plan nha khoa|dental|nha khoa/i,
  },
  {
    matcher: /chuyen vien dinh duong|tu van dinh duong|nutritionist|dietitian|dietician/,
    label: 'Chuyen vien dinh duong',
    canonicalTitle: 'Chuyên viên dinh dưỡng',
    skills: [
      'Nutrition assessment và khai thác khẩu phần ăn',
      'Meal plan/chế độ ăn theo mục tiêu và bệnh lý liên quan',
      'Diet counseling, behavior change, adherence và follow-up',
      'Theo dõi chỉ số: cân nặng, BMI, vòng eo, đường huyết/lipid nếu có',
    ],
    required: [/nutrition|dinh duong|khau phan/, /meal plan|che do an|diet/, /bmi|vong eo|duong huyet|lipid|adherence|follow-up/],
    forbidden: /circuit breaker|mccb|contactor|welding|may han|tho han|han tig|han mig|cb\/rcd|vfd/i,
  },
  {
    matcher: /ky thuat vien dien lanh|dien lanh|hvac|may lanh|dieu hoa|chiller|vrv|vrf|kho lanh/,
    label: 'Ky thuat vien dien lanh',
    canonicalTitle: 'Kỹ thuật viên điện lạnh',
    skills: [
      'Chẩn đoán lỗi điều hòa/máy lạnh/chiller bằng áp suất, dòng điện và nhiệt độ',
      'Lắp đặt, bảo trì và vệ sinh hệ thống điều hòa đúng quy trình',
      'Xử lý rò gas, hút chân không, nạp gas và kiểm tra leak an toàn',
      'Báo giá vật tư, SLA sửa chữa và bàn giao nghiệm thu cho khách',
    ],
    required: [/hvac|dien lanh|may lanh|dieu hoa|chiller/, /gas|ro gas|hut chan khong|leak/, /bao tri|lap dat|lam lanh|nghiem thu/],
    forbidden: /financial model|financial modeling|fp&a|fpa|cashflow forecast|ifrs consolidation|audit plan|audit checklist/i,
  },
  {
    matcher: /chief accountant|accounting manager|ke toan truong|truong phong ke toan|controller/,
    label: 'Chief Accountant',
    canonicalTitle: 'Chief Accountant / Accounting Manager',
    skills: [
      'IFRS/VAS, closing calendar và soát xét báo cáo tài chính',
      'Tax compliance, audit file, internal control và risk checklist',
      'Consolidation, reconciliation và phân công team kế toán theo SLA chứng từ',
      'Cashflow/reporting dashboard cho ban giám đốc và decision memo tài chính',
    ],
    required: [/ifrs|vas|closing|bao cao tai chinh|bao cao tai chinh/, /audit|kiem toan|tax|thue|control|kiem soat|compliance|tuan thu/, /consolidation|hop nhat|reconciliation|doi soat|cashflow|dong tien|team ke toan/],
    forbidden: /patient care|benh nhan|dental|nha khoa|treatment plan|recruitment funnel|recruiting funnel|onboarding checklist/i,
  },
  {
    matcher: /nhan su|human resources|\bhr\b|tuyen dung|recruit|headhunter|c&b|hrbp|people operations|hanh chinh nhan su/,
    label: 'Nhan su',
    skills: [
      'Hồ sơ nhân sự, hợp đồng, chấm công và payroll/C&B operations',
      'Recruiting funnel, JD intake, time-to-fill và offer acceptance nếu phù hợp role',
      'Onboarding checklist, HR SLA, training completion và employee service',
      'Retention, engagement, HR dashboard và policy compliance',
    ],
    required: [/nhan su|human resources|\bhr\b|recruiting|tuyen dung|c&b/, /onboarding|payroll|hr sla|employee/, /retention|engagement|policy|dashboard/],
    forbidden: /nha khoa|dental|x-quang|cbct|treatment plan nha khoa|vo khuan.*thu thuat|hvac|shop drawing|welding|circuit breaker/i,
  },
];

const nonHrForbidden = /recruitment funnel|recruiting funnel|\brecruitment\b|onboarding checklist|hr dashboard|hr data|hr kpi|hr case study|\bhr\b|time-to-fill|c&b benchmark|jd analysis|headcount|employee retention|training feedback|people dashboard|hrbp|talent acquisition|workforce plan|people operations|people ops|stakeholder communication \(hr context\)/i;
const unaccentedVietnameseLeak = /\b(kham chan doan|vo khuan|an toan thu thuat|ho so benh an|tu van ca dieu tri|tai kham|benh nhan|giao tiep|neu duoc phep|duoc phep|phim\/anh|trong mieng|mieng|phai lien quan den|lien quan den|dong goi|mo 5 jd|doc jd|lap log|chon 1 ca|gan nhat|ghi chu|da an thong tin|viet script|tu van|van de|lua chon|rui ro|chi phi|thoi gian|cham soc|lich tai kham|khong hua chac|bac si phu trach|bien chung|it nhat|chi so|chep|yeu cau|da an danh|da ẩn danh|da co|con thieu|moi bang chung|gom trieu chung|\bva\b|khau phan|che do an|duong huyet|can nang|vong eo|dien lanh|may lanh|hut chan khong|lap dat|bao tri|nghiem thu|bao cao tai chinh|kiem toan|thue|kiem soat|ke toan|chung tu|ban giam doc|nhan su|hop dong|cham cong)\b/i;

export function normalizeRoadmapRoleLockText(value: string | null | undefined) {
  return normalizeRoleProfileText(repairMojibakeText(value || '')).replace(/[đĐ]/g, 'd');
}

function dedupe(values: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const cleaned = repairMojibakeText(value || '').replace(/\s+/g, ' ').trim();
    const key = normalizeRoadmapRoleLockText(cleaned);
    if (!cleaned || !key || seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
  }
  return result;
}

export function getManualRoadmapRolePack(jobTitle: string) {
  const normalized = normalizeRoadmapRoleLockText(jobTitle);
  return manualRolePacks.find(pack => pack.matcher.test(normalized)) || null;
}

function profileContainsWrongDomain(jobTitle: string, profile: RoleProfile) {
  const normalized = normalizeRoadmapRoleLockText([
    profile.title,
    profile.industry || '',
    profile.segment,
    ...profile.skills,
    ...profile.preview.skills,
    profile.preview.coreSkill,
    profile.preview.path,
    profile.preview.firstAction,
    profile.preview.cvBullet,
    profile.language.rolePath,
    profile.language.mainSkill,
    profile.language.proofAsset,
    profile.language.kpiGuidance,
  ].join(' | '));
  const manual = getManualRoadmapRolePack(jobTitle);
  if (manual?.forbidden?.test(normalized)) return true;
  const segment = detectRoleSegment(jobTitle);
  return segment !== 'hr' && segment !== 'education_admissions' && nonHrForbidden.test(normalized);
}

export function getRoadmapRoleProfileOrThrow(jobTitle: string): RoleProfile {
  const manual = getManualRoadmapRolePack(jobTitle);
  const profile = getExactRoleProfile(jobTitle) || (manual?.canonicalTitle ? getExactRoleProfile(manual.canonicalTitle) : null);
  if (!profile) {
    console.warn('[roadmap-role-lock] missing exact role profile', { jobTitle });
    throw new Error(`Missing exact role profile for ${jobTitle}`);
  }
  return profile;
}

export function getRoadmapRoleProfileByIdOrThrow(roleId: string): RoleProfile {
  const profile = getRoleProfileById(roleId);
  if (!profile) {
    console.warn('[roadmap-role-lock] missing role profile by id', { roleId });
    throw new Error(`Missing exact role profile for ${roleId}`);
  }
  return profile;
}

export function buildRoadmapRoleSkillsFromProfile(profile: RoleProfile, extras: string[] = []) {
  const skills = dedupe([
    ...profile.skills,
    profile.preview.coreSkill,
    ...profile.preview.skills,
    profile.language.mainSkill,
    profile.language.proofAsset,
    profile.language.kpiGuidance,
    ...extras,
  ]).slice(0, 14);
  return { profile, manual: null, skills };
}

export function buildRoadmapRoleSkills(jobTitle: string, extras: string[] = []) {
  const profile = getRoadmapRoleProfileOrThrow(jobTitle);
  const manual = getManualRoadmapRolePack(jobTitle);
  const hasManualPack = Boolean(manual);
  const hasWrongProfileDomain = Boolean(manual && profileContainsWrongDomain(jobTitle, profile));
  if (hasWrongProfileDomain) {
    console.warn('[roadmap-role-lock] profile domain mismatch; using manual role pack first', {
      jobTitle,
      profileTitle: profile.title,
    });
  }
  const skills = dedupe([
    ...(hasManualPack ? manual?.skills || [] : profile.skills),
    ...(hasManualPack ? profile.skills : manual?.skills || []),
    profile.preview.coreSkill,
    ...profile.preview.skills,
    profile.language.mainSkill,
    profile.language.proofAsset,
    profile.language.kpiGuidance,
    ...extras,
  ]).slice(0, 14);
  return { profile, manual, skills };
}

export function formatRoleSkillsForPrompt(skills: string[]) {
  return skills.map((skill, index) => `${index + 1}. ${skill}`).join('\n');
}

const accentRepairs: Array<[RegExp, string]> = [
  [/\bKham chan doan\b/gi, 'Khám chẩn đoán'],
  [/\bnha si\b/gi, 'nha sĩ'],
  [/\bMo 5 JD\b/g, 'Mở 5 JD'],
  [/\bDoc JD\b/g, 'Đọc JD'],
  [/\bLap log\b/g, 'Lập log'],
  [/\bLap bang\b/g, 'Lập bảng'],
  [/\bLap\b/g, 'Lập'],
  [/\bChon\b/g, 'Chọn'],
  [/\bchon\b/gi, 'chọn'],
  [/\bDong goi\b/g, 'Đóng gói'],
  [/\bdong goi\b/gi, 'đóng gói'],
  [/\bViet script\b/g, 'Viết script'],
  [/\bviet script\b/gi, 'viết script'],
  [/\bTu review\b/g, 'Tự review'],
  [/\btu review\b/gi, 'tự review'],
  [/\bchep\b/gi, 'chép'],
  [/\bye[uê] cau\b/gi, 'yêu cầu'],
  [/\blap lai\b/gi, 'lặp lại'],
  [/\bdung nghe\b/gi, 'đúng nghề'],
  [/\bbang chung\b/gi, 'bằng chứng'],
  [/\bbang\b/gi, 'bảng'],
  [/\bmoi bang chung\b/gi, 'mọi bằng chứng'],
  [/\bmoi\b/gi, 'mọi'],
  [/\bgan nhat\b/gi, 'gần nhất'],
  [/\bghi chu\b/gi, 'ghi chú'],
  [/\b5 dong\b/gi, '5 dòng'],
  [/\b10 dong\b/gi, '10 dòng'],
  [/\bda an thong tin\b/gi, 'đã ẩn thông tin'],
  [/\bda an\b/gi, 'đã ẩn'],
  [/\ban thong tin\b/gi, 'ẩn thông tin'],
  [/\bdiem can cai thien\b/gi, 'điểm cần cải thiện'],
  [/\bcan cai thien\b/gi, 'cần cải thiện'],
  [/\btiep theo\b/gi, 'tiếp theo'],
  [/\blu[uư]\b/gi, 'lưu'],
  [/\btu van\b/gi, 'tư vấn'],
  [/\bvan de\b/gi, 'vấn đề'],
  [/\brang-miệng\b/gi, 'răng-miệng'],
  [/\brang\b/gi, 'răng'],
  [/\blua chọn\b/gi, 'lựa chọn'],
  [/\blua chon\b/gi, 'lựa chọn'],
  [/\brui ro\b/gi, 'rủi ro'],
  [/\bchi phi\b/gi, 'chi phí'],
  [/\bthoi gian\b/gi, 'thời gian'],
  [/\bcham soc\b/gi, 'chăm sóc'],
  [/\blich tai kham\b/gi, 'lịch tái khám'],
  [/\blich\b/gi, 'lịch'],
  [/\bco ngon ngu de hieu\b/gi, 'có ngôn ngữ dễ hiểu'],
  [/\bde hieu\b/gi, 'dễ hiểu'],
  [/\bkhong hua chac\b/gi, 'không hứa chắc'],
  [/\bmuc rui ro\b/gi, 'mức rủi ro'],
  [/\bCo it nhat\b/g, 'Có ít nhất'],
  [/\bco it nhat\b/gi, 'có ít nhất'],
  [/\bit nhat\b/gi, 'ít nhất'],
  [/\bchi so\b/gi, 'chỉ số'],
  [/\bbien chung\b/gi, 'biến chứng'],
  [/\bbac si phu trach\b/gi, 'bác sĩ phụ trách'],
  [/\bbac si\b/gi, 'bác sĩ'],
  [/\bphu trach\b/gi, 'phụ trách'],
  [/\bDo KPI\b/g, 'Đo KPI'],
  [/\bCo 1 diem\b/g, 'Có 1 điểm'],
  [/\bco 1 diem\b/gi, 'có 1 điểm'],
  [/\bco muc rủi ro\b/gi, 'có mức rủi ro'],
  [/\bmuc rủi ro\b/gi, 'mức rủi ro'],
  [/\bco\b/gi, 'có'],
  [/\bphai lien quan den\b/gi, 'phải liên quan đến'],
  [/\blien quan den\b/gi, 'liên quan đến'],
  [/\bphai\b/gi, 'phải'],
  [/\bden\b/gi, 'đến'],
  [/\bneu duoc phep\b/gi, 'nếu được phép'],
  [/\bduoc phep\b/gi, 'được phép'],
  [/\bneu\b/gi, 'nếu'],
  [/\bduoc\b/gi, 'được'],
  [/\bphep\b/gi, 'phép'],
  [/\bva\b/gi, 'và'],
  [/\bgiao tiep\b/gi, 'giao tiếp'],
  [/\bda an danh\b/gi, 'đã ẩn danh'],
  [/\bda (?=ẩn danh|điều trị|có|làm|che|xử lý|lưu|tạo)/gi, 'đã '],
  [/\bgom trieu chung\b/gi, 'gồm triệu chứng'],
  [/\bgom\b/gi, 'gồm'],
  [/\bdung no\b/gi, 'dùng nó'],
  [/\bnhu\b/gi, 'như'],
  [/\bmuc luong\b/gi, 'mức lương'],
  [/\bda co\b/gi, 'đã có'],
  [/\bcon thieu\b/gi, 'còn thiếu'],
  [/\bKhong dung\b/g, 'Không dùng'],
  [/\bkhong dung\b/gi, 'không dùng'],
  [/\bvan phong\b/gi, 'văn phòng'],
  [/\bchung\b/gi, 'chung'],
  [/\bclinical\b/gi, 'clinical'],
  [/\bchan doan\b/gi, 'chẩn đoán'],
  [/\bVo khuan\b/gi, 'Vô khuẩn'],
  [/\bvo khuan\b/gi, 'vô khuẩn'],
  [/\ban toan thu thuat\b/gi, 'an toàn thủ thuật'],
  [/\bho so benh an\b/gi, 'hồ sơ bệnh án'],
  [/\bho so\b/gi, 'hồ sơ'],
  [/\bbenh nhan\b/gi, 'bệnh nhân'],
  [/\btai kham\b/gi, 'tái khám'],
  [/\bTu van ca dieu tri\b/gi, 'Tư vấn ca điều trị'],
  [/\btu van ca dieu tri\b/gi, 'tư vấn ca điều trị'],
  [/\bdieu tri\b/gi, 'điều trị'],
  [/\bcase lam sang\b/gi, 'case lâm sàng'],
  [/\btrieu chung\b/gi, 'triệu chứng'],
  [/\bphim\/anh duoc phep\b/gi, 'phim/ảnh được phép'],
  [/\bphim\/anh\b/gi, 'phim/ảnh'],
  [/\bke hoach\b/gi, 'kế hoạch'],
  [/\bbuoc\b/gi, 'bước'],
  [/\bbai hoc\b/gi, 'bài học'],
  [/\bkhong lo\b/gi, 'không lộ'],
  [/\bten\/SDT\b/g, 'tên/SĐT'],
  [/\bhinh nhan dien\b/gi, 'hình nhận diện'],
  [/\bNguoi doc thay ro\b/g, 'Người đọc thấy rõ'],
  [/\bquy trinh\b/gi, 'quy trình'],
  [/\ban toan\b/gi, 'an toàn'],
  [/\bket qua\b/gi, 'kết quả'],
  [/\bphim\/anh trong mieng\b/gi, 'phim/ảnh trong miệng'],
  [/\btrong mieng\b/gi, 'trong miệng'],
  [/\bmieng\b/gi, 'miệng'],
  [/\ban danh\b/gi, 'ẩn danh'],
  [/\bkhau phan\b/gi, 'khẩu phần'],
  [/\bche do an\b/gi, 'chế độ ăn'],
  [/\bduong huyet\b/gi, 'đường huyết'],
  [/\bcan nang\b/gi, 'cân nặng'],
  [/\bvong eo\b/gi, 'vòng eo'],
  [/\bdien lanh\b/gi, 'điện lạnh'],
  [/\bmay lanh\b/gi, 'máy lạnh'],
  [/\bhut chan khong\b/gi, 'hút chân không'],
  [/\blap dat\b/gi, 'lắp đặt'],
  [/\bbao tri\b/gi, 'bảo trì'],
  [/\bnghiem thu\b/gi, 'nghiệm thu'],
  [/\bbao cao tai chinh\b/gi, 'báo cáo tài chính'],
  [/\bkiem toan\b/gi, 'kiểm toán'],
  [/\bthue\b/gi, 'thuế'],
  [/\bkiem soat\b/gi, 'kiểm soát'],
  [/\bke toan\b/gi, 'kế toán'],
  [/\bchung tu\b/gi, 'chứng từ'],
  [/\bban giam doc\b/gi, 'ban giám đốc'],
  [/\bnhan su\b/gi, 'nhân sự'],
  [/\bhop dong\b/gi, 'hợp đồng'],
  [/\bcham cong\b/gi, 'chấm công'],
];

export function repairRoadmapRoleLanguage<T>(value: T): T {
  if (typeof value === 'string') {
    let repaired: string = value;
    for (const [pattern, replacement] of accentRepairs) repaired = repaired.replace(pattern, replacement);
    return repaired as T;
  }
  if (Array.isArray(value)) return value.map(item => repairRoadmapRoleLanguage(item)) as T;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, repairRoadmapRoleLanguage(item)]);
    return Object.fromEntries(entries) as T;
  }
  return value;
}

export function buildRoadmapRoleLockPrompt(params: {
  jobTitle: string;
  experience: string;
  currentSalary: number;
  targetSalary: number;
  timeline: number;
  roleSkills: string[];
}) {
  return `Bạn là chuyên gia tư vấn lộ trình nghề nghiệp chuyên sâu tại thị trường Việt Nam.

THÔNG TIN NGƯỜI DÙNG:
- Nghề nghiệp: ${params.jobTitle}
- Kinh nghiệm/vị trí hiện tại: ${params.experience}
- Lương hiện tại: ${(params.currentSalary / 1_000_000).toFixed(1)} triệu/tháng
- Lương mục tiêu: ${(params.targetSalary / 1_000_000).toFixed(1)} triệu/tháng
- Thời gian: ${params.timeline} tháng

BỘ KỸ NĂNG CHUYÊN NGÀNH CỦA NGHỀ NÀY (BẮT BUỘC DÙNG):
${formatRoleSkillsForPrompt(params.roleSkills)}

QUAN TRỌNG VỀ NGÔN NGỮ:
- Viết tiếng Việt đầy đủ dấu, chuẩn chính tả.
- KHÔNG được bỏ dấu hoặc viết không dấu bất kỳ từ tiếng Việt nào.
- Nếu bộ kỹ năng có cụm tiếng Việt không dấu từ dữ liệu cũ, phải tự phục hồi dấu tiếng Việt trước khi đưa vào output.
- Thuật ngữ tiếng Anh giữ nguyên tiếng Anh: CBCT, treatment plan, infection control, KPI, dashboard, IFRS/VAS.

QUY TẮC CỨNG - VI PHẠM = OUTPUT SAI:
1. 100% task và bằng chứng phải dùng đúng công việc thực tế của "${params.jobTitle}" tại công ty Việt Nam.
2. Vocabulary bắt buộc lấy từ danh sách BỘ KỸ NĂNG trên.
3. TUYỆT ĐỐI KHÔNG dùng các từ sau trừ khi jobTitle là HR/Nhân sự/Tuyển dụng: recruitment funnel, onboarding checklist, HR dashboard, time-to-fill, C&B benchmark, JD analysis, headcount, employee retention, training feedback, HR data/KPI, HR case study, stakeholder communication (HR context).
4. Mỗi task phải trả lời được câu hỏi: "Người làm ${params.jobTitle} tạo ra thứ này như thế nào trong tuần làm việc bình thường?"
5. W1/Tháng 1 phải dùng trực tiếp ít nhất 4 cụm chuyên ngành trong bộ kỹ năng sau, không diễn giải thành từ chung chung: ${params.roleSkills.slice(0, 6).join(' | ')}.

KIỂM TRA TRƯỚC KHI OUTPUT:
Đọc lại toàn bộ lộ trình. Nếu xóa tên "${params.jobTitle}" đi, người đọc có nhận ra đây là lộ trình cho nghề nào không?
- KHÔNG nhận ra -> viết lại, thêm từ khóa chuyên ngành.
- CÓ nhận ra -> output.`;
}

export function serializeRoadmapForRoleValidation(value: unknown) {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value || '');
  }
}

function requiredMisses(pack: ManualRolePack | null, normalized: string) {
  if (!pack) return [];
  return pack.required
    .filter(pattern => !pattern.test(normalized))
    .map(pattern => `Thiếu keyword bắt buộc cho ${pack.label}: ${pattern.source}`);
}

export function validateRoadmapRoleLock(jobTitle: string, generatedRoadmap: unknown): RoadmapRoleValidationResult {
  const text = serializeRoadmapForRoleValidation(generatedRoadmap);
  const normalized = normalizeRoadmapRoleLockText(text);
  const wrongItems: string[] = [];
  const segment = detectRoleSegment(jobTitle);
  const manual = getManualRoadmapRolePack(jobTitle);

  if (segment !== 'hr' && segment !== 'education_admissions' && nonHrForbidden.test(normalized)) {
    wrongItems.push('Có thuật ngữ HR/tuyển dụng trong roadmap không phải nghề nhân sự');
  }
  if (manual?.forbidden?.test(normalized)) {
    wrongItems.push(`Có thuật ngữ sai ngành với ${manual.label}: ${manual.forbidden.source}`);
  }
  if (unaccentedVietnameseLeak.test(text)) {
    wrongItems.push('Có cụm tiếng Việt bị bỏ dấu trong roadmap');
  }
  wrongItems.push(...requiredMisses(manual, normalized));

  return {
    passed: wrongItems.length === 0,
    wrongItems,
    severity: wrongItems.length ? 'high' : 'none',
  };
}

function parseJsonObject(content: string): RoadmapRoleValidationResult | null {
  const raw = content.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim();
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[0]) as Partial<RoadmapRoleValidationResult>;
    return {
      passed: parsed.passed === true,
      wrongItems: Array.isArray(parsed.wrongItems) ? parsed.wrongItems.map(String) : [],
      severity: parsed.severity === 'none' || parsed.severity === 'low' || parsed.severity === 'medium' || parsed.severity === 'high'
        ? parsed.severity
        : parsed.passed === true ? 'none' : 'high',
    };
  } catch {
    return null;
  }
}

export async function validateRoadmapRoleLockWithAi(
  client: OpenAI,
  jobTitle: string,
  generatedRoadmap: unknown,
  signal?: AbortSignal
): Promise<RoadmapRoleValidationResult> {
  const deterministic = validateRoadmapRoleLock(jobTitle, generatedRoadmap);
  const validationPrompt = `Đây là lộ trình tăng lương vừa tạo cho "${jobTitle}":
${serializeRoadmapForRoleValidation(generatedRoadmap).slice(0, 18000)}

Kiểm tra: có task hoặc bằng chứng nào KHÔNG phù hợp với nghề "${jobTitle}" không?

Trả về JSON duy nhất, không markdown:
{
  "passed": true,
  "wrongItems": [],
  "severity": "none"
}
hoặc:
{
  "passed": false,
  "wrongItems": ["tên task sai 1", "tên task sai 2"],
  "severity": "high"
}`;

  try {
    const completion = await client.chat.completions.create(
      {
        model: 'deepseek-v4-pro',
        messages: [
          { role: 'system', content: 'Bạn là QA kiểm tra lộ trình nghề nghiệp. Chỉ trả JSON hợp lệ, không markdown.' },
          { role: 'user', content: validationPrompt },
        ],
        max_tokens: 700,
        temperature: 0,
      },
      signal ? { signal } : undefined
    );
    const parsed = parseJsonObject(completion.choices[0]?.message?.content || '');
    if (!parsed) {
      return { passed: false, wrongItems: [...deterministic.wrongItems, 'AI validation không trả JSON hợp lệ'], severity: 'high' };
    }
    const wrongItems = dedupe([...deterministic.wrongItems, ...parsed.wrongItems]);
    return {
      passed: deterministic.passed && parsed.passed && wrongItems.length === 0,
      wrongItems,
      severity: wrongItems.length ? 'high' : parsed.severity,
    };
  } catch (error) {
    return {
      passed: false,
      wrongItems: [...deterministic.wrongItems, `AI validation lỗi: ${error instanceof Error ? error.message : String(error)}`],
      severity: 'high',
    };
  }
}
