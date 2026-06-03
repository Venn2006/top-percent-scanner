import {
  CAREER_COMPASS,
  CareerCompassEntry,
  SalaryBand,
  type CareerLadderStep,
} from './careerCompassData'
import {
  detectRoleSegment,
  getRoleLanguage,
  getRoleSegmentLabel,
  isAirportGroundRole,
  isBarBeverageRole,
  isBaristaRole,
  isBartenderRole,
  isRestaurantFrontlineRole,
  isRestaurantManagerRole,
  isSchoolHealthcareRole,
} from './roleTaxonomy'
import { inferRoleLevelBand, isExecutiveLevel } from './roleSeniority'

function entryForTaxonomySegment(jobTitle: string, industry?: string | null): CareerCompassEntry | null {
  const segment = detectRoleSegment(jobTitle, industry)
  const map: Partial<Record<ReturnType<typeof detectRoleSegment>, keyof typeof CAREER_COMPASS>> = {
    it: 'IT',
    finance: 'FINANCE',
    accounting: 'FINANCE',
    sales: 'SALES',
    retail: 'SALES',
    real_estate: 'SALES',
    marketing: 'MARKETING',
    media_content: 'MARKETING',
    design: 'DESIGN',
    photography: 'PHOTOGRAPHY',
    healthcare: 'HEALTHCARE',
    pharma_chemical: 'HEALTHCARE',
    education: 'EDUCATION',
    school_leadership: 'SCHOOL_LEADERSHIP',
    freelance_teaching: 'FREELANCE_TEACHING',
    language_center: 'LANGUAGE_CENTER',
    engineering: 'ENGINEERING',
    semiconductor: 'ENGINEERING',
    construction: 'ENGINEERING',
    environment_energy: 'ENGINEERING',
    agriculture: 'ENGINEERING',
    procurement_supply: 'ENGINEERING',
    logistics: 'ENGINEERING',
    blue_collar: 'BLUE_COLLAR',
    aviation: 'AVIATION',
    fnb: 'FNB',
    events: 'EVENTS',
    executive: 'EXECUTIVE',
  }
  const key = map[segment]
  return key ? CAREER_COMPASS[key] : null
}

function normalizeForCompassMatch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9+#&.\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function keywordMatchesJob(jobText: string, keyword: string): boolean {
  const normalizedKeyword = normalizeForCompassMatch(keyword);
  if (!normalizedKeyword) return false;
  const escaped = normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(jobText);
}

// ── Detect job group from job title ────────────────────────────────────────
export function detectJobGroup(jobTitle: string, industry?: string | null): CareerCompassEntry {
  if (isSchoolHealthcareRole(jobTitle, industry)) return CAREER_COMPASS.HEALTHCARE
  if (detectRoleSegment(jobTitle, industry) === 'executive' && CAREER_COMPASS.EXECUTIVE) return CAREER_COMPASS.EXECUTIVE

  const taxonomyEntry = entryForTaxonomySegment(jobTitle, industry)
  if (taxonomyEntry) return taxonomyEntry

  const lower = normalizeForCompassMatch(jobTitle)

  // Iterate all groups (except FALLBACK) and score by keyword matches
  const groups = Object.entries(CAREER_COMPASS).filter(([key]) => key !== 'FALLBACK')

  let bestKey = 'FALLBACK'
  let bestScore = 0

  for (const [key, entry] of groups) {
    let score = 0
    for (const kw of entry.keywords) {
      if (keywordMatchesJob(lower, kw)) {
        // Longer keyword = more specific = higher score
        score += kw.trim().length
      }
    }
    if (score > bestScore) {
      bestScore = score
      bestKey = key
    }
  }

  return CAREER_COMPASS[bestKey]
}

// ── Detect salary band for a given job group ───────────────────────────────
export function detectSalaryBand(
  salary: number,
  entry: CareerCompassEntry
): SalaryBand {
  const bands = entry.salaryBands
  // Walk from highest to lowest — first band where salary >= min wins
  const order: SalaryBand[] = ['executive', 'lead', 'senior', 'mid', 'entry']
  for (const band of order) {
    if (salary >= bands[band].min) return band
  }
  return 'entry'
}

// ── Get next band min salary ───────────────────────────────────────────────
function getNextBandMin(entry: CareerCompassEntry, band: SalaryBand): number {
  const progression: Record<SalaryBand, SalaryBand | null> = {
    entry: 'mid',
    mid: 'senior',
    senior: 'lead',
    lead: 'executive',
    executive: null,
  }
  const next = progression[band]
  if (!next) return entry.salaryBands.executive.max
  return entry.salaryBands[next].min
}

// ── Format VND ─────────────────────────────────────────────────────────────
function fmtVND(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)} triệu`
  return `${(n / 1_000).toFixed(0)}k`
}

// ── Main context builder ───────────────────────────────────────────────────
export interface CareerCompassContext {
  jobGroup: string
  band: SalaryBand
  bandLabel: string
  painPoint: string
  opportunity: string
  nextMilestone: string
  marketInsight: string
  topSkillGap: string
  nextBandMin: number
  nextBandMinFmt: string
  salaryGap: number
  salaryGapFmt: string
  salaryFmt: string
  currentBandRange: string
  careerLadder: CareerLadderStep[]
  isFallback: boolean  // true = nghề tự nhập, dữ liệu ước tính
}

export function getCareerCompassContext(
  jobTitle: string,
  salary: number,
  _topPercent: number,
  industry?: string | null
): CareerCompassContext {
  void _topPercent
  const entry = detectJobGroup(jobTitle, industry)
  let band = detectSalaryBand(salary, entry)
  const normalizedTitle = jobTitle
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

  if (entry.jobGroup.includes('Lãnh đạo trường học')) {
    if (/hieu truong|principal|headmaster|head of school|school director/.test(normalizedTitle) && (band === 'entry' || band === 'mid')) {
      band = 'senior'
    } else if (/hieu pho|pho hieu truong|vice principal/.test(normalizedTitle) && band === 'entry') {
      band = 'mid'
    }
  }
  const nextMin = getNextBandMin(entry, band)
  const gap = Math.max(0, nextMin - salary)
  // Kiểm tra có phải FALLBACK không (nghề tự nhập không có trong DB)
  const isFallback = entry.jobGroup === 'Thị trường lao động chung'
  const taxonomySegment = detectRoleSegment(jobTitle, industry)
  const levelBand = inferRoleLevelBand({ jobTitle, industry })
  const isAirportGround = isAirportGroundRole(jobTitle, industry)
  const isBarBeverage = isBarBeverageRole(jobTitle, industry)
  const isBartender = isBartenderRole(jobTitle, industry)
  const isBarista = isBaristaRole(jobTitle, industry)
  const isRestaurantOpsRole = isRestaurantManagerRole(jobTitle, industry)
  const isRestaurantServiceRole = isRestaurantFrontlineRole(jobTitle, industry)
  const shouldUseTaxonomyText = !isExecutiveLevel(levelBand) && taxonomySegment !== 'general' && taxonomySegment !== 'executive'
  const roleLanguage = shouldUseTaxonomyText ? getRoleLanguage(jobTitle, industry) : null
  const taxonomyJobGroup = shouldUseTaxonomyText
    ? isRestaurantOpsRole
      ? 'Quản lý nhà hàng / F&B Operations'
      : isRestaurantServiceRole
      ? 'Phục vụ / thu ngân nhà hàng'
      : isBarBeverage
      ? isBartender ? 'Bar / Beverage service / Bartender' : 'Coffee bar / Barista service'
      : isAirportGround
      ? 'Airport passenger service / Check-in ground service'
      : getRoleSegmentLabel(taxonomySegment)
    : entry.jobGroup
  const taxonomyStepTitle = (step: CareerLadderStep) => {
    if (isAirportGround) {
      return step.band === 'entry' ? 'Nhân viên quầy check-in sân bay' :
        step.band === 'mid' ? 'Passenger Service Agent có KPI check-in rõ' :
        step.band === 'senior' ? 'Senior Passenger Service / hỗ trợ gate' :
        step.band === 'lead' ? 'Ground Service Supervisor / Passenger Service Lead' :
        'Airport Operations / Ground Service Coordinator'
    }
    if (isRestaurantOpsRole) {
      return step.band === 'entry' ? 'Quản lý ca nhà hàng nhỏ' :
        step.band === 'mid' ? 'Restaurant Manager có KPI ca rõ' :
        step.band === 'senior' ? 'F&B Operations / Venue Manager' :
        step.band === 'lead' ? 'Area Manager chuỗi nhà hàng' :
        'F&B Director / Operations Director'
    }
    if (isRestaurantServiceRole) {
      return step.band === 'entry' ? 'Phục vụ / thu ngân ca cơ bản' :
        step.band === 'mid' ? 'Nhân viên ca chuẩn SOP và upsell' :
        step.band === 'senior' ? 'Senior Service / Cashier Lead' :
        step.band === 'lead' ? 'Ca trưởng sàn nhà hàng' :
        'Restaurant Supervisor track'
    }
    if (isBartender) {
      return step.band === 'entry' ? 'Bartender ca co ban' :
        step.band === 'mid' ? 'Bartender giu chuan recipe/POS' :
        step.band === 'senior' ? 'Senior Bartender / Lead Bartender' :
        step.band === 'lead' ? 'Bar Supervisor / Beverage Specialist' :
        'Bar Manager track'
    }
    if (isBarista) {
      return step.band === 'entry' ? 'Barista ca co ban' :
        step.band === 'mid' ? 'Barista giu chuan espresso/recipe' :
        step.band === 'senior' ? 'Senior Barista / Bar Lead' :
        step.band === 'lead' ? 'Coffee Trainer / Beverage Specialist' :
        'Cafe/Bar Operations lead'
    }
    return step.band === 'entry' ? `Nền tảng ${taxonomyJobGroup}` :
      step.band === 'mid' ? `${taxonomyJobGroup} có KPI rõ` :
      step.band === 'senior' ? `Senior / Specialist ${taxonomyJobGroup}` :
      step.band === 'lead' ? `Lead / Owner mảng ${taxonomyJobGroup}` :
      `Expert / Director track ${taxonomyJobGroup}`
  }
  const taxonomyLadder = roleLanguage
    ? entry.careerLadder.map((step) => ({
        ...step,
        title: taxonomyStepTitle(step),
        unlock: step.band === 'entry' ? [
          `Chọn 1 KPI lõi để theo dõi: ${roleLanguage.kpiGuidance}`,
          `Tạo bằng chứng đầu tiên: ${roleLanguage.proofAsset}`,
          `Viết lại CV/LinkedIn theo ${roleLanguage.productWord}, không chỉ liệt kê đầu việc`,
        ] : step.band === 'mid' ? [
          `Đóng gói 1 case study có trước/sau dựa trên ${roleLanguage.mainSkill}`,
          `Xin feedback từ quản lý/khách hàng/đồng nghiệp để xác nhận output`,
          `Lọc role hoặc scope mới trong nhóm cơ hội: ${roleLanguage.opportunityList}`,
        ] : step.band === 'senior' ? [
          `Chuẩn hóa ${roleLanguage.portfolioWord} thành bộ case có KPI, link/ảnh và người xác nhận`,
          `Own một phần scope lớn hơn: quy trình, khách hàng, dự án, lớp, ca, line hoặc danh mục`,
          `Trình bày kết quả bằng ngôn ngữ tiền, rủi ro, thời gian, chất lượng hoặc retention`,
        ] : step.band === 'lead' ? [
          `Biến kinh nghiệm thành playbook để người khác làm theo được`,
          `Gắn scope với KPI/bonus/title rõ trước khi nhận thêm trách nhiệm`,
          `Xây pipeline cơ hội trả cao hơn trong ${roleLanguage.opportunityList}`,
        ] : [
          `Đóng gói năng lực thành IP, advisory, đội nhóm hoặc mô hình vận hành có thể nhân rộng`,
          `Có dashboard chứng minh hiệu quả ở cấp bộ phận/nhóm/portfolio`,
          `Deal theo scope, bonus, profit-share hoặc quyền quyết định thay vì chỉ lương fixed`,
        ],
        warning: `Bẫy: dùng lộ trình chung chung. Với ${taxonomyJobGroup}, thị trường trả cho ${roleLanguage.mainSkill} và bằng chứng như ${roleLanguage.proofAsset}.`,
      }))
    : entry.careerLadder

  return {
    jobGroup: taxonomyJobGroup,
    band,
    bandLabel: roleLanguage ? taxonomyStepTitle({ band, title: '', salary: '', duration: '', unlock: [], warning: '' }) : entry.salaryBands[band].label,
    painPoint: roleLanguage
      ? `Bạn không thiếu chăm chỉ; nút thắt là chưa biến công việc thành ${roleLanguage.productWord} có KPI và người xác nhận. Nếu chỉ mô tả đầu việc, thị trường vẫn xếp bạn vào nhóm dễ thay thế.`
      : entry.painPoints[band],
    opportunity: roleLanguage
      ? `Cửa tăng lương nằm ở ${roleLanguage.opportunityList}. Muốn mở cửa đó, hãy chứng minh ${roleLanguage.mainSkill} bằng output thật thay vì học lan man.`
      : entry.opportunities[band],
    nextMilestone: roleLanguage
      ? `Trong 30 ngày: tạo ${roleLanguage.proofAsset}, gắn với 1 KPI rõ rồi dùng nó để xin review hoặc apply role tốt hơn.`
      : entry.nextMilestone[band],
    marketInsight: roleLanguage
      ? `${taxonomyJobGroup} (${jobTitle.trim() || 'vai trò này'}) trả cao hơn khi hồ sơ có bằng chứng đúng nghề: ${roleLanguage.kpiGuidance} Hồ sơ chỉ kể đầu việc sẽ bị so theo mặt bằng trung bình của nhóm ${roleLanguage.productWord}.`
      : entry.marketInsight,
    topSkillGap: roleLanguage?.mainSkill || entry.topSkillGap,
    nextBandMin: nextMin,
    nextBandMinFmt: fmtVND(nextMin),
    salaryGap: gap,
    salaryGapFmt: gap > 0 ? fmtVND(gap) : '0',
    salaryFmt: fmtVND(salary),
    currentBandRange: `${fmtVND(entry.salaryBands[band].min)}–${fmtVND(entry.salaryBands[band].max)}`,
    careerLadder: taxonomyLadder || [],
    isFallback,
  }
}
