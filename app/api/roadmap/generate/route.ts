import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabaseServer } from '@/lib/supabaseServer';
import { getCareerCompassContext } from '@/lib/careerCompassEngine';
import { enforceOrigin, rateLimit } from '@/lib/apiProtection';
import { hasMojibakeText, repairMojibakeDeep, repairMojibakeText } from '@/lib/mojibake';
import { issueRoadmapAccessCode, roadmapAccessCodeMatches } from '@/lib/roadmapAccessServer';
import { validateGeneratedRoadmapRoleGuard } from '@/lib/validateGeneratedRoadmapRoleGuard';
import {
  buildRoadmapRoleLockPrompt,
  buildRoadmapRoleSkills,
  buildRoadmapRoleSkillsFromProfile,
  formatRoleSkillsForPrompt,
  getRoadmapRoleProfileByIdOrThrow,
  repairRoadmapRoleLanguage,
  validateRoadmapRoleLock,
  validateRoadmapRoleLockWithAi,
} from '@/lib/roadmapRoleLock';
import type { RoleProfile } from '@/lib/roleProfiles';
import {
  detectRoleSegment,
  getRoleLanguage as getTaxonomyRoleLanguage,
  getSimulatorSkillsForRole,
  getTourismRoleProfile,
  isLanguageCenterManagerRole,
  isInsuranceRole,
  isNutritionRole,
  isSchoolHealthcareRole,
  isStatisticsDataRole,
  isVeterinaryRole,
  type SimulatorSkillBase,
} from '@/lib/roleTaxonomy';
import {
  hasKitchenSkillLeakForRestaurantNonChefRole,
  hasGenericSkillLeakForDentalRole,
  hasJuniorMarketingSkillLeakForManagerRole,
  hasManagerSkillLeakForFrontlineServiceRole,
  isDriverDeliveryRoadmapRole,
  isDentalAssistantRoadmapRole,
  isDentalRoadmapRole,
  isHotelFrontlineRoadmapRole,
  isHotelManagerRoadmapRole,
  isMarketingManagerRoadmapRole,
  isRestaurantFrontlineRoadmapRole,
  isRestaurantManagerRoadmapRole,
} from '@/lib/roadmapPresentation';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const NO_CACHE_HEADERS = { 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' };

const ROADMAP_TAXONOMY_SKILL_BASES: SimulatorSkillBase[] = [1, 2, 3, 4].map(index => ({
  id: `roadmap-taxonomy-${index}`,
  label: `ROADMAP_TAXONOMY_${index}`,
  boost: 0.12 + index * 0.02,
  pctBoost: 8 + index * 2,
}));

function getRoadmapTaxonomySkillLabels(roleText: string) {
  return getSimulatorSkillsForRole(roleText, ROADMAP_TAXONOMY_SKILL_BASES)
    .map(skill => skill.label.trim())
    .filter(label => label.length > 2 && !/^ROADMAP_TAXONOMY_/i.test(label));
}

function getRoadmapTaxonomySkillLine(roleText: string) {
  return getRoadmapTaxonomySkillLabels(roleText).slice(0, 4).join(', ');
}

interface WeekPlan {
  week: number;
  focus: string;       // "Tuáº§n 1: XÃ¢y portfolio"
  tasks: string[];     // 3-4 tasks cá»¥ thá»ƒ
  milestone: string;   // Káº¿t quáº£ Ä‘o Ä‘Æ°á»£c cuá»‘i tuáº§n
}

interface RoadmapData {
  format?: 'weekly' | 'markdown' | 'expert_v2';
  version?: number;
  goal: string;
  summary: string;
  weeks: WeekPlan[];
  negotiation_timing: string;  // "Tuáº§n X lÃ  thá»i Ä‘iá»ƒm tá»‘t nháº¥t Ä‘á»ƒ Ä‘Ã m phÃ¡n"
  salary_projection: string;   // "Náº¿u hoÃ n thÃ nh 80% tasks, lÆ°Æ¡ng ká»³ vá»ng: X triá»‡u"
  markdown?: string;
  intake?: RoadmapIntake;
  actionPlan?: RoadmapActionPlan;
}

interface RoadmapIntake {
  currentPosition?: string;
  mainWeakness?: string;
  twoYearGoal?: string;
  educationLevel?: string;
  educationDetail?: string;
  strongSkills?: string;
  proofAssets?: string;
  bottleneck?: string;
  preferredPath?: string;
  weeklyTime?: string;
}

interface RoadmapActionPlan {
  standardWeeks: number;
  flexibleWeeks: number;
  weeklyHours: string;
  completionRule: string;
  levelName: string;
  milestones: RoadmapMilestone[];
}

interface RoadmapMilestone {
  month: number;
  title: string;
  objective: string;
  skills: string[];
  weeks: RoadmapActionWeek[];
}

interface RoadmapActionWeek {
  week: number;
  focus: string;
  tasks: RoadmapActionTask[];
  checkpoint: string;
}

interface RoadmapActionTask {
  title: string;
  skill: string;
  output: string;
  kpi: string;
  doneDefinition: string;
}

class RoadmapRoleLockError extends Error {
  constructor(message = 'Hệ thống đang kiểm tra lại lộ trình để đảm bảo đúng nghề của bạn. Vui lòng thử lại sau 1 phút.') {
    super(message);
    this.name = 'RoadmapRoleLockError';
  }
}

function formatRoadmapDuration(months: number) {
  return months === 12 ? '1 nÄƒm' : `${months} thÃ¡ng`;
}

function getRoadmapMilestoneLabels(months: number) {
  const monthCount = Math.max(1, Math.min(12, Math.round(months) || 1));
  return Array.from({ length: monthCount }, (_, index) => `ThÃ¡ng ${index + 1}`);
}

function getRoadmapMilestoneMonths(months: number) {
  const monthCount = Math.max(1, Math.min(12, Math.round(months) || 1));
  return Array.from({ length: monthCount }, (_, index) => index + 1);
}

function getCompactPlanWeeks(months: number) {
  if (months <= 3) return 6;
  if (months <= 6) return 8;
  if (months <= 9) return 12;
  return 12;
}

function getWeeklyTaskLimit(weeklyTime?: string) {
  const normalized = normalizeForRoadmapQuality(weeklyTime || '');
  if (/1\s*[-â€“]\s*2|1\s*2|duoi\s*2|it\s*gio/.test(normalized)) return 1;
  if (/6\s*[-â€“]\s*8|6\s*8|8\s*gio|nhieu\s*gio/.test(normalized)) return 3;
  return 2;
}

function isLooseRoadmapSegment(segment: ReturnType<typeof detectRoleSegment>) {
  return segment === 'general' || segment === 'fresh';
}

function isCrossSegmentValue(jobTitle: string, value?: string) {
  const cleanValue = cleanIntakeValue(value);
  if (!cleanValue) return false;
  const jobSegment = detectRoleSegment(jobTitle);
  const valueSegment = detectRoleSegment(cleanValue);
  if (isLooseRoadmapSegment(jobSegment) || isLooseRoadmapSegment(valueSegment)) return false;
  return jobSegment !== valueSegment;
}

const staleHrIntakePattern = /nhan su di lam|recruitment funnel|recruiting funnel|recruitment\b|jd analysis|time-to-fill|offer acceptance|onboarding checklist|onboarding\/training|training feedback|c&b benchmark|hr dashboard|people dashboard|employee feedback|employee retention|retention\/churn|hr data|hr kpi|hr case study|headcount|hrbp|talent acquisition|workforce plan|stakeholder communication/i;

const nonHrRoadmapLeakPattern = /recruitment funnel|recruiting funnel|recruitment\b|jd analysis|time-to-fill|offer acceptance|onboarding checklist|onboarding\/training|training feedback|c&b benchmark|hr dashboard|people dashboard|employee feedback|employee retention|retention\/churn|hr data|hr kpi|hr case study|headcount|hrbp|talent acquisition|workforce plan|people operations|people ops|payroll\/c&b|engagement dashboard|hiring quality|stakeholder communication \(hr context\)/i;

function sanitizeRoadmapIntakeForJob(jobTitle: string, intake: RoadmapIntake): RoadmapIntake {
  const jobSegment = detectRoleSegment(jobTitle);
  const allowHrTerms = jobSegment === 'hr';
  const cleanIfStale = (value?: string) => {
    if (!value) return value;
    if (!allowHrTerms && staleHrIntakePattern.test(normalizeForRoadmapQuality(value))) return undefined;
    return value;
  };
  return {
    ...intake,
    currentPosition: (!allowHrTerms && staleHrIntakePattern.test(normalizeForRoadmapQuality(intake.currentPosition || ''))) || isCrossSegmentValue(jobTitle, intake.currentPosition) ? jobTitle : (intake.currentPosition || jobTitle),
    mainWeakness: cleanIfStale(intake.mainWeakness),
    twoYearGoal: cleanIfStale(intake.twoYearGoal),
    strongSkills: cleanIfStale(intake.strongSkills),
    proofAssets: cleanIfStale(intake.proofAssets),
    bottleneck: cleanIfStale(intake.bottleneck),
    preferredPath: cleanIfStale(intake.preferredPath),
  };
}

function getRoleIdentityText(jobTitle: string, intake: RoadmapIntake = {}) {
  const safeCurrentPosition = isCrossSegmentValue(jobTitle, intake.currentPosition) ? undefined : intake.currentPosition;
  const parts = [jobTitle, safeCurrentPosition]
    .map(value => cleanIntakeValue(value))
    .filter((value): value is string => Boolean(value));
  const uniqueParts: string[] = [];
  for (const part of parts) {
    const normalizedPart = normalizeForRoadmapQuality(part);
    if (!normalizedPart) continue;
    if (uniqueParts.some(existing => normalizeForRoadmapQuality(existing) === normalizedPart)) continue;
    uniqueParts.push(part);
  }
  return uniqueParts.join(' ');
}

function isFreshOrUndirectedRole(value: string) {
  const normalized = normalizeForRoadmapQuality(value);
  return /fresher|sinh vien|moi tot nghiep|moi ra truong|new graduate|chua ro dinh huong|chua dinh huong|khong biet/.test(normalized);
}

function isCareerPivotRole(value: string) {
  const normalized = normalizeForRoadmapQuality(value);
  return /doi huong|chuyen huong|pivot|muon doi huong|muon chuyen/.test(normalized);
}

function isHumanResourcesRole(value: string) {
  const normalized = normalizeForRoadmapQuality(value);
  return /nhan su|human resources|\bhr\b|recruit|tuyen dung|talent acquisition|\bta\b|c&b|compensation|benefit|l&d|learning|dao tao|hrbp|people operations|people ops|hr ops/.test(normalized);
}

function isEnglishTeacherRole(value: string) {
  if (isSchoolHealthcareRole(value)) return false;
  if (isLanguageCenterManagerRole(value)) return false;
  const normalized = normalizeForRoadmapQuality(value);
  return /giao vien tieng anh|english teacher|ielts teacher|toeic teacher|cambridge teacher|tesol|celta|ngon ngu anh/.test(normalized);
}

function isPublicSubjectTeacherRole(value: string) {
  const normalized = normalizeForRoadmapQuality(value);
  return /giao vien (toan|vat ly|ly|hoa|hoa hoc|lich su|su|dia ly|dia|ngu van|van|tin hoc|sinh hoc|sinh|gdcd|cong nghe|my thuat|am nhac|the duc)|teacher (math|physics|chemistry|history|geography|literature|informatics|computer science|biology|civics|technology|art|music|pe)/.test(normalized) && !isEnglishTeacherRole(value);
}

function isEducationAdmissionsRole(value: string) {
  const normalized = normalizeForRoadmapQuality(value);
  return /tu van du hoc|du hoc|study abroad|overseas education|education consultant|admissions?|admission counselor|tu van tuyen sinh|tuyen sinh|enrollment advisor|student recruitment|visa du hoc/.test(normalized);
}

function isStudyAbroadAdmissionsRole(value: string) {
  const normalized = normalizeForRoadmapQuality(value);
  return /tu van du hoc|du hoc|study abroad|overseas education|visa du hoc/.test(normalized);
}

function isSchoolEducationRole(value: string) {
  if (isSchoolHealthcareRole(value)) return false;
  const normalized = normalizeForRoadmapQuality(value);
  return /giao vien|teacher|hieu truong|hieu pho|principal|vice principal|tieu hoc|thcs|thpt|truong hoc|school/.test(normalized);
}

function isSchoolPrincipalRole(value: string) {
  const normalized = normalizeForRoadmapQuality(value);
  return /hieu truong|principal|hieu pho|vice principal/.test(normalized);
}

function sanitizeEducationDetailForRole(roleText: string, educationDetail?: string) {
  const raw = cleanIntakeValue(educationDetail);
  if (!raw) return '';
  const normalized = normalizeForRoadmapQuality(raw);
  const roleAllowsEnglishCredential = isEnglishTeacherRole(roleText);
  if (!roleAllowsEnglishCredential && /tesol|celta|ielts|toeic|cambridge|ngon ngu anh|english/.test(normalized)) {
    return 'Chá»©ng chá»‰/ngÃ nh há»c Ä‘Ã£ khai bÃ¡o chÆ°a pháº£i Ä‘Ã²n báº©y trá»±c tiáº¿p cho track nghá» nÃ y; chá»‰ dÃ¹ng nhÆ° tÃ­n hiá»‡u ká»· luáº­t há»c táº­p khi cáº§n.';
  }
  return raw;
}

function isExplicitFactoryRole(value: string) {
  const normalized = normalizeForRoadmapQuality(value);
  return /cong nhan|factory|production|san xuat|van hanh may|machine operator|operator line|line worker|kho|warehouse|qc line|qa line|to pho|to truong/.test(normalized);
}

function hasStatisticsProductionLeak(roleText: string, value: string): boolean {
  if (!isStatisticsDataRole(roleText)) return false;
  const text = normalizeForRoadmapQuality(value);
  return /\boee\b|\brca\b|lean|six sigma|defect rate|downtime|\byield\b|cycle time|safety incidents|plc|automation|process improvement|nha may|san xuat|production|manufacturing|line leader|training line/.test(text);
}

function hasFactorySkillLeak(roleText: string, value: string): boolean {
  const role = normalizeForRoadmapQuality(roleText);
  const text = normalizeForRoadmapQuality(value);
  const factoryLeak = /5s|qc checklist|qc\b|qa line|san luong|nang suat line|van hanh may|an toan lao dong|cong nhan|nha may|to pho san xuat|to truong san xuat|line leader/.test(text);
  return factoryLeak && !isExplicitFactoryRole(role);
}

function getPracticalKpiGuidance(roleText: string) {
  const role = normalizeForRoadmapQuality(roleText);
  if (isMcRole(role)) {
    return 'KPI sÃ¡t nghá» MC: sá»‘ show/clip Ä‘áº¡t chuáº©n, feedback khÃ¡ch/agency, chÆ°Æ¡ng trÃ¬nh Ä‘Ãºng timeline, sá»‘ lead booking, tá»· lá»‡ chá»‘t show, má»©c phÃ­ trung bÃ¬nh/show.';
  }
  if (isFreshOrUndirectedRole(role)) {
    return 'KPI cho ngÆ°á»i má»›i: sá»‘ JD Ä‘Ã£ phÃ¢n tÃ­ch, sá»‘ bÃ i test/mini project hoÃ n thÃ nh, sá»‘ feedback mentor nháº­n Ä‘Æ°á»£c, sá»‘ CV gá»­i Ä‘Ãºng role vÃ  tá»· lá»‡ Ä‘Æ°á»£c pháº£n há»“i.';
  }
  if (isCareerPivotRole(role)) {
    if (isHumanResourcesRole(role)) {
      return 'KPI Ä‘á»•i hÆ°á»›ng cho nhÃ¢n sá»±: sá»‘ role HR Ä‘Ã£ test, sá»‘ JD bÃ³c tÃ¡ch, sá»‘ cuá»™c coffee chat, sá»‘ mini case HR hoÃ n thÃ nh, sá»‘ CV gá»­i Ä‘Ãºng hÆ°á»›ng vÃ  sá»‘ pháº£n há»“i nháº­n Ä‘Æ°á»£c.';
    }
    return 'KPI Ä‘á»•i hÆ°á»›ng: sá»‘ role má»¥c tiÃªu Ä‘Ã£ lá»c, sá»‘ skill chuyá»ƒn Ä‘á»•i chá»©ng minh Ä‘Æ°á»£c, sá»‘ portfolio mini hoÃ n thÃ nh, sá»‘ cuá»™c coffee chat/feedback vÃ  sá»‘ há»“ sÆ¡ gá»­i thá»­.';
  }
  if (isHumanResourcesRole(role)) {
    return 'KPI nhÃ¢n sá»±: time-to-fill, tá»‰ lá»‡ pass CV/phá»ng váº¥n, offer acceptance, cháº¥t lÆ°á»£ng onboarding, training completion, retention/churn, SLA xá»­ lÃ½ yÃªu cáº§u nhÃ¢n sá»± hoáº·c Ä‘á»™ hÃ i lÃ²ng ná»™i bá»™.';
  }
  if (isVeterinaryRole(role)) {
    return 'KPI thu y: so ca kham/dieu tri, vaccination/deworming completion, follow-up adherence, complication/revisit rate, surgery/anesthesia safety, owner satisfaction va ho so dieu tri dung.';
  }
  if (isNutritionRole(role)) {
    return 'KPI dinh duong: so ca tu van, adherence meal plan, thay doi can nang/BMI/vong eo, chi so duong huyet-lipid neu co, ty le follow-up, muc do hai long va ket qua hanh vi an uong.';
  }
  if (isInsuranceRole(role)) {
    return 'KPI bao hiem phi nhan tho: quote/underwriting SLA, renewal ratio, loss ratio, claim cycle time, claim accuracy, premium written, broker/client retention va compliance policy wording.';
  }
  if (isSchoolHealthcareRole(role)) {
    return 'KPI y táº¿ há»c Ä‘Æ°á»ng: thá»i gian pháº£n á»©ng sá»± cá»‘, há»“ sÆ¡ sá»©c khá»e há»c sinh cáº­p nháº­t Ä‘Ãºng háº¡n, sá»‘ ca sÆ¡ cá»©u/chuyá»ƒn tuyáº¿n, theo dÃµi thuá»‘c/dá»‹ á»©ng khÃ´ng lá»—i, tiÃªm chá»§ng/bá»‡nh truyá»n nhiá»…m vÃ  feedback nhÃ  trÆ°á»ng-phá»¥ huynh.';
  }
  if (isLanguageCenterManagerRole(role)) {
    return 'KPI quáº£n lÃ½ trung tÃ¢m ngoáº¡i ngá»¯: lead-to-enrollment, trial-to-paid, active students, class fill rate, teacher utilization, retention/renewal, dropout/refund rate, parent complaint SLA, revenue per class vÃ  margin lá»›p.';
  }
  if (isEnglishTeacherRole(role)) {
    return 'KPI giÃ¡o viÃªn tiáº¿ng Anh: pre-test/post-test, mock test IELTS/TOEIC, homework completion, attendance, Speaking/Writing rubric, sá»‘ lá»—i ngá»¯ phÃ¡p/phÃ¡t Ã¢m giáº£m, feedback há»c viÃªn/phá»¥ huynh vÃ  retention/renewal.';
  }
  if (isEducationAdmissionsRole(role)) {
    return isStudyAbroadAdmissionsRole(role)
      ? 'KPI tÆ° váº¥n du há»c: lead qualified, lá»‹ch tÆ° váº¥n Ä‘Ã£ Ä‘áº·t, há»“ sÆ¡ ná»™p Ä‘Ãºng háº¡n, offer rate, visa pass rate, enrollment conversion, SLA follow-up, tá»· lá»‡ thiáº¿u giáº¥y tá» vÃ  feedback khÃ¡ch.'
      : 'KPI tÆ° váº¥n tuyá»ƒn sinh: lead qualified, lá»‹ch tÆ° váº¥n Ä‘Ã£ Ä‘áº·t, placement test booked, Ä‘Äƒng kÃ½/ghi danh, tá»· lá»‡ Ä‘Ã³ng phÃ­-nháº­p há»c, SLA follow-up, tá»· lá»‡ no-show, tá»· lá»‡ thiáº¿u thÃ´ng tin vÃ  feedback khÃ¡ch.';
  }
  if (isHousekeepingRole(role)) {
    return 'KPI buá»“ng phÃ²ng: sá»‘ phÃ²ng/ca, phÃºt/phÃ²ng, lá»—i QC/rework, checklist Ä‘áº¡t chuáº©n, amenities/minibar Ä‘Ãºng, maintenance/lost & found bÃ¡o Ä‘Ãºng, feedback giÃ¡m sÃ¡t vÃ  complaint khÃ¡ch giáº£m.';
  }
  if (isStatisticsDataRole(role)) {
    return 'KPI thá»‘ng kÃª dá»¯ liá»‡u: Ä‘á»™ chÃ­nh xÃ¡c bÃ¡o cÃ¡o, thá»i gian chá»‘t bÃ¡o cÃ¡o, data error rate, sá»‘ dashboard Ä‘Æ°á»£c dÃ¹ng, deadline bÃ¡o cÃ¡o, sá»‘ insight Ä‘Æ°á»£c quáº£n lÃ½ Ã¡p dá»¥ng vÃ  sá»‘ giá» xá»­ lÃ½ thá»§ cÃ´ng giáº£m.';
  }
  if (isSchoolEducationRole(role)) {
    return 'KPI giÃ¡o dá»¥c trÆ°á»ng há»c: tiáº¿n bá»™ Ä‘iá»ƒm sá»‘/nÄƒng lá»±c há»c sinh, tá»· lá»‡ ná»™p bÃ i, pháº£n há»“i phá»¥ huynh, cháº¥t lÆ°á»£ng giÃ¡o Ã¡n/rubric, dá»± giá»/coaching giÃ¡o viÃªn. Náº¿u cÃ´ng láº­p/biÃªn cháº¿, gáº¯n vá»›i há»“ sÆ¡ chuyÃªn mÃ´n, thi Ä‘ua, phá»¥ cáº¥p vÃ  bá»• nhiá»‡m; náº¿u tÆ° thá»¥c/quá»‘c táº¿, gáº¯n vá»›i retention, phá»¥ huynh vÃ  deal lÆ°Æ¡ng theo thá»‹ trÆ°á»ng.';
  }
  if (isChefRole(role)) {
    return 'KPI nghá» báº¿p: food cost, waste rate, thá»i gian ra mÃ³n, complaint/rating mÃ³n, sá»‘ suáº¥t/ca vÃ  sá»‘ ngÆ°á»i Ä‘Æ°á»£c hÆ°á»›ng dáº«n.';
  }
  if (isPilotRole(role)) {
    return 'KPI pilot: flight hours, safety/incident-free record, recurrent check pass, simulator performance, SOP compliance, route/aircraft qualification, cockpit CRM and ATC communication feedback.';
  }
  if (isAviationRole(role)) {
    return 'KPI cabin crew: checklist safety-service hoÃ n thÃ nh, feedback senior crew, announcement luyá»‡n cÃ³ ghi Ã¢m, tÃ¬nh huá»‘ng service recovery vÃ  route readiness.';
  }
  return getTaxonomyRoleLanguage(role).kpiGuidance;
}

function detectRoadmapSegment(jobTitle: string) {
  const normalized = jobTitle
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (/fresher|new graduate|sinh vien|moi tot nghiep|moi ra truong/.test(normalized)) {
    return {
      label: 'sinh viÃªn má»›i tá»‘t nghiá»‡p',
      priority: 'offer Ä‘áº§u Ä‘á»i, thá»­ viá»‡c, portfolio, CV bullet, LinkedIn proof vÃ  script deal sau 60-90 ngÃ y',
      proof: 'portfolio mini, feedback cá»§a mentor/quáº£n lÃ½, checklist há»c viá»‡c, KPI hoÃ n thÃ nh task Ä‘Ãºng háº¡n',
    };
  }

  if (/cong nhan|binh duong|factory worker|machine operator|production operator|van hanh may/.test(normalized)) {
    return {
      label: 'cÃ´ng nhÃ¢n sáº£n xuáº¥t táº¡i cá»¥m BÃ¬nh DÆ°Æ¡ng/FDI',
      priority: 'nÄƒng suáº¥t, chuyÃªn cáº§n, an toÃ n lao Ä‘á»™ng, ká»¹ nÄƒng váº­n hÃ nh mÃ¡y, Ä‘á» xuáº¥t lÃªn tá»• phÃ³/tá»• trÆ°á»Ÿng',
      proof: 'sáº£n lÆ°á»£ng/giá», tá»· lá»‡ lá»—i, sá»‘ ngÃ y chuyÃªn cáº§n, sá»‘ láº§n há»— trá»£ line, chá»©ng nháº­n an toÃ n hoáº·c váº­n hÃ nh mÃ¡y',
    };
  }

  if (isMcRole(normalized)) {
    return {
      label: 'MC / ngÆ°á»i dáº«n chÆ°Æ¡ng trÃ¬nh / host sá»± kiá»‡n',
      priority: 'showreel bÃ¡n hÃ ng, ká»‹ch báº£n sÃ¢n kháº¥u, xá»­ lÃ½ tÃ¬nh huá»‘ng live, rate card theo format sá»± kiá»‡n vÃ  feedback khÃ¡ch/agency',
      proof: 'video highlight 60-90 giÃ¢y, 3 máº«u lá»i dáº«n, feedback khÃ¡ch hÃ ng, checklist briefing/rehearsal, case xá»­ lÃ½ sá»± cá»‘ sÃ¢n kháº¥u',
    };
  }

  if (isChefRole(normalized)) {
    return {
      label: 'Äáº§u báº¿p / báº¿p nhÃ  hÃ ng / F&B',
      priority: 'food cost, waste rate, tá»‘c Ä‘á»™ ra mÃ³n, chuáº©n mÃ³n giá» cao Ä‘iá»ƒm, an toÃ n báº¿p vÃ  nÄƒng lá»±c dáº«n ca',
      proof: 'recipe card cÃ³ Ä‘á»‹nh lÆ°á»£ng/cost, báº£ng waste, log tá»‘c Ä‘á»™ ra mÃ³n, feedback khÃ¡ch, checklist SOP báº¿p vÃ  báº±ng chá»©ng training phá»¥ báº¿p',
    };
  }

  if (isPilotRole(normalized)) {
    return {
      label: 'Phi cong / pilot / flight deck',
      priority: 'flight safety, SOP compliance, type rating/recurrent training, simulator check, cockpit CRM/ATC, flight hours/logbook va route-aircraft qualification',
      proof: 'logbook/flight hours summary, type rating/recurrent certificates, simulator check record, safety/incident-free record, route-aircraft qualification va instructor/check feedback neu duoc phep chia se',
    };
  }

  if (isAviationRole(normalized)) {
    return {
      label: 'Tiáº¿p viÃªn hÃ ng khÃ´ng / cabin crew / dá»‹ch vá»¥ hÃ ng khÃ´ng',
      priority: 'an toÃ n bay, service recovery, giao tiáº¿p tiáº¿ng Anh, grooming, teamwork, feedback senior crew vÃ  sáºµn sÃ ng tuyáº¿n/role khÃ³ hÆ¡n',
      proof: 'checklist safety-service, ghi Ã¢m announcement tiáº¿ng Anh, feedback senior crew/Ä‘á»“ng nghiá»‡p, chá»©ng chá»‰ training, ghi chÃº tÃ¬nh huá»‘ng xá»­ lÃ½ khÃ¡ch Ä‘Ã£ che thÃ´ng tin riÃªng tÆ°',
    };
  }

  const taxonomySegment = detectRoleSegment(jobTitle);
  if (taxonomySegment !== 'general') {
    const language = getTaxonomyRoleLanguage(jobTitle);
    return {
      label: language.rolePath,
      priority: language.mainSkill,
      proof: language.proofAsset,
    };
  }

  return null;
}

function isMcRole(value: string) {
  const normalized = normalizeForRoadmapQuality(value);
  return /\bmc\b|nguoi dan|dan chuong trinh|host|su kien|event host|livestream host|presenter|moderator|voice over|wedding mc/.test(normalized);
}

function isChefRole(value: string) {
  const normalized = normalizeForRoadmapQuality(value);
  if (isRestaurantManagerRoadmapRole(normalized) || isRestaurantFrontlineRoadmapRole(normalized)) return false;
  return /dau bep|chef|bep truong|bep pho|sous chef|cook|phu bep|barista|bartender|pha che|kitchen/.test(normalized);
}

function isPilotRole(value: string) {
  const normalized = normalizeForRoadmapQuality(value);
  return /phi cong|pilot|co pho|co-pilot|first officer|airline pilot|flight deck|buong lai|lai may bay|captain pilot|captain bay|captain hang khong/.test(normalized) || detectRoleSegment(value) === 'pilot';
}

function isAirportGroundCheckinRole(value: string) {
  const normalized = normalizeForRoadmapQuality(value);
  return /check[- ]?in san bay|nhan vien mat dat hang khong|ground staff airline|airport ground|passenger service|ground service|dich vu mat dat|quay check[- ]?in|boarding gate|gate agent|baggage service/.test(normalized);
}

function isAviationRole(value: string) {
  const normalized = normalizeForRoadmapQuality(value);
  if (isPilotRole(value)) return false;
  if (isAirportGroundCheckinRole(value)) return false;
  return /tiep vien hang khong|cabin crew|flight attendant|stewardess|steward/.test(normalized);
}

function isHousekeepingRole(value: string) {
  const normalized = normalizeForRoadmapQuality(value);
  return /buong phong|housekeeping|room attendant|room service attendant|amenities|minibar|lost found|lost and found|room speed/.test(normalized);
}

function isHospitalityRole(value: string) {
  return detectRoleSegment(value) === 'hospitality';
}

function isTourismRole(value: string) {
  return Boolean(getTourismRoleProfile(value));
}

function isCleaningRole(value: string) {
  return detectRoleSegment(value) === 'cleaning';
}

function isDriverDeliveryRole(value: string) {
  return detectRoleSegment(value) === 'driver_delivery' || isDriverDeliveryRoadmapRole(value);
}

function describePreferredPath(path: string | undefined, jobTitle: string) {
  const value = path || 'deal_internal';
  const role = normalizeForRoadmapQuality(jobTitle);

  if (isRestaurantManagerRoadmapRole(role)) {
    const labels: Record<string, string> = {
      deal_internal: 'TÄƒng lÆ°Æ¡ng táº¡i nhÃ  hÃ ng hiá»‡n táº¡i báº±ng KPI ca, roster, labor cost, food cost, service quality vÃ  complaint recovery.',
      jump_job: 'Chuyá»ƒn sang chuá»—i nhÃ  hÃ ng/F&B ops tráº£ tá»‘t hÆ¡n báº±ng dashboard váº­n hÃ nh vÃ  báº±ng chá»©ng quáº£n lÃ½ ca.',
      leadership: 'LÃªn F&B Ops/Area Manager báº±ng nÄƒng lá»±c quáº£n nhiá»u ca, training Ä‘á»™i ngÅ© vÃ  kiá»ƒm soÃ¡t P&L cÆ¡ báº£n.',
      expert: 'Äi sÃ¢u restaurant operations: SOP, floor control, food/labor cost, review score vÃ  dashboard owner/GM.',
    };
    return labels[value] || labels.deal_internal;
  }

  if (isRestaurantFrontlineRoadmapRole(role)) {
    const labels: Record<string, string> = {
      deal_internal: 'Tang luong tai ca hien tai bang order/bill accuracy, upsell, handover va feedback quan ly ca.',
      jump_job: 'Chuyen sang nha hang/chuoi tra tot hon bang log ca, POS/order accuracy va service feedback.',
      leadership: 'Len senior service/cashier lead hoac ca truong san bang kha nang kem nguoi moi va giu SOP ca.',
      expert: 'Di sau frontline service: table service, POS, complaint tai ban, upsell va shift handover.',
    };
    return labels[value] || labels.deal_internal;
  }

  if (isHotelManagerRoadmapRole(role)) {
    const labels: Record<string, string> = {
      deal_internal: 'Tang luong tai khach san hien tai bang occupancy, ADR/RevPAR, review score, staffing SLA va complaint recovery.',
      jump_job: 'Chuyen sang khach san/resort/chain tra tot hon bang operating dashboard va evidence van hanh.',
      leadership: 'Len Operations Manager/GM track bang SOP audit, revenue coordination, staff roster va P&L/budget.',
      expert: 'Di sau hotel operations: revenue, OTA, guest experience, service SLA va operating dashboard.',
    };
    return labels[value] || labels.deal_internal;
  }

  if (isHotelFrontlineRoadmapRole(role)) {
    const labels: Record<string, string> = {
      deal_internal: 'Tang luong tai khach san hien tai bang PMS accuracy, check-in SOP, guest request SLA va feedback khach.',
      jump_job: 'Chuyen sang front desk/guest service tra tot hon bang log check-in, request SLA va complaint recovery.',
      leadership: 'Len senior front desk/front office supervisor bang handover, kem nguoi moi va xu ly escalation.',
      expert: 'Di sau front office: PMS, booking accuracy, guest request, upsell va service recovery.',
    };
    return labels[value] || labels.deal_internal;
  }

  if (isChefRole(role)) {
    const labels: Record<string, string> = {
      deal_internal: 'TÄƒng lÆ°Æ¡ng táº¡i báº¿p hiá»‡n táº¡i báº±ng food cost, waste rate, tá»‘c Ä‘á»™ ra mÃ³n, chuáº©n mÃ³n vÃ  feedback xÃ¡c nháº­n.',
      jump_job: 'Äá»•i sang báº¿p/Ä‘Æ¡n vá»‹ tráº£ cao hÆ¡n: chuá»—i nhÃ  hÃ ng, khÃ¡ch sáº¡n, catering hoáº·c báº¿p trung tÃ¢m cÃ³ KPI váº­n hÃ nh rÃµ.',
      leadership: 'LÃªn quáº£n lÃ½ báº¿p hoáº·c quáº£n lÃ½ nhÃ  hÃ ng: Ca trÆ°á»Ÿng, Sous Chef, Báº¿p trÆ°á»Ÿng, Kitchen Manager hoáº·c váº­n hÃ nh nhÃ  hÃ ng.',
      expert: 'Äi sÃ¢u menu/F&B chuyÃªn sÃ¢u: recipe, costing, SOP, training báº¿p, concept menu hoáº·c tÆ° váº¥n váº­n hÃ nh.',
    };
    return labels[value] || labels.deal_internal;
  }

  if (isAviationRole(role)) {
    const labels: Record<string, string> = {
      deal_internal: 'Xin review á»Ÿ hÃ£ng hiá»‡n táº¡i báº±ng safety-service, service recovery, feedback senior crew vÃ  route readiness.',
      jump_job: 'Chuyá»ƒn sang hÃ£ng/tuyáº¿n/role dá»‹ch vá»¥ hÃ ng khÃ´ng tráº£ tá»‘t hÆ¡n, cÃ³ tiÃªu chuáº©n vÃ  phá»¥ cáº¥p tá»‘t hÆ¡n.',
      leadership: 'LÃªn Purser/Cabin Leader báº±ng briefing, debrief, há»— trá»£ junior vÃ  xá»­ lÃ½ escalation trong cabin.',
      expert: 'Äi sÃ¢u trainer/service expert: checklist, training, chuáº©n phá»¥c vá»¥ vÃ  tÃ¬nh huá»‘ng máº«u Ä‘Ã£ che thÃ´ng tin riÃªng tÆ°.',
    };
    return labels[value] || labels.deal_internal;
  }

  if (isPilotRole(role)) {
    const labels: Record<string, string> = {
      deal_internal: 'Xin review o hang hien tai bang logbook/flight hours, recurrent/simulator check, SOP safety record, cockpit CRM/ATC va route-aircraft readiness.',
      jump_job: 'Chuyen sang hang/charter/cargo hoac route-aircraft scope tra tot hon khi co type rating, recurrent check va safety record ro.',
      leadership: 'Di theo captain upgrade track bang flight hours, SOP compliance, simulator performance, CRM/ATC va instructor/check feedback.',
      expert: 'Di sau Training Captain / Check Pilot / simulator instructor bang debrief, SOP, check record va kha nang huan luyen phi cong khac.',
    };
    return labels[value] || labels.deal_internal;
  }

  if (isHousekeepingRole(role)) {
    const labels: Record<string, string> = {
      deal_internal: 'TÄƒng lÆ°Æ¡ng táº¡i khÃ¡ch sáº¡n hiá»‡n táº¡i báº±ng tá»‘c Ä‘á»™ phÃ²ng, checklist Ä‘áº¡t chuáº©n, giáº£m rework/lá»—i vÃ  feedback giÃ¡m sÃ¡t.',
      jump_job: 'Äá»•i sang khÃ¡ch sáº¡n/cÄƒn há»™ dá»‹ch vá»¥/resort tráº£ tá»‘t hÆ¡n hoáº·c role Room Attendant senior cÃ³ tiÃªu chuáº©n rÃµ.',
      leadership: 'LÃªn Housekeeping Senior/Supervisor báº±ng bÃ n giao ca, kiá»ƒm phÃ²ng, há»— trá»£ ngÆ°á»i má»›i vÃ  xá»­ lÃ½ complaint/lost & found.',
      expert: 'Äi sÃ¢u housekeeping chuáº©n cao: SOP phÃ²ng, room inspection, amenities/minibar, maintenance report vÃ  evidence log sáº¡ch.',
    };
    return labels[value] || labels.deal_internal;
  }

  if (isDriverDeliveryRole(role)) {
    const labels: Record<string, string> = {
      deal_internal: 'TÄƒng lÆ°Æ¡ng/thu nháº­p táº¡i Ä‘á»™i xe hoáº·c ná»n táº£ng hiá»‡n táº¡i báº±ng Ä‘Ãºng giá», tá»· lá»‡ hoÃ n thÃ nh Ä‘Æ¡n, an toÃ n, rating vÃ  log xá»­ lÃ½ phÃ¡t sinh.',
      jump_job: 'Äá»•i sang fleet/ná»n táº£ng/Ä‘á»™i xe tráº£ tá»‘t hÆ¡n hoáº·c tuyáº¿n/ca cÃ³ chuyáº¿n/Ä‘Æ¡n á»•n Ä‘á»‹nh hÆ¡n, cÃ³ KPI váº­n táº£i rÃµ.',
      leadership: 'LÃªn lead tÃ i xáº¿/tá»• trÆ°á»Ÿng Ä‘á»™i xe/Ä‘iá»u phá»‘i váº­n táº£i báº±ng nÄƒng lá»±c há»— trá»£ tuyáº¿n, xá»­ lÃ½ phÃ¡t sinh vÃ  kÃ¨m ngÆ°á»i má»›i.',
      expert: 'Äi sÃ¢u váº­n hÃ nh tÃ i xáº¿: tá»‘i Æ°u tuyáº¿n, an toÃ n, giáº£m há»§y/hoÃ n, tiáº¿t kiá»‡m chi phÃ­ vÃ  báº±ng chá»©ng rating/chuyáº¿n/Ä‘Æ¡n.',
    };
    return labels[value] || labels.deal_internal;
  }

  if (isMcRole(role)) {
    const labels: Record<string, string> = {
      deal_internal: 'TÄƒng fee vá»›i khÃ¡ch/agency hiá»‡n táº¡i báº±ng showreel, feedback, rate card vÃ  case xá»­ lÃ½ sÃ¢n kháº¥u.',
      jump_job: 'Chuyá»ƒn sang format tráº£ cao hÆ¡n: corporate, activation, livestream, talkshow hoáº·c brand event.',
      leadership: 'Lead sá»± kiá»‡n hoáº·c team MC: nháº­n format lá»›n hÆ¡n, training MC má»›i vÃ  phá»‘i há»£p agency.',
      expert: 'Äi sÃ¢u host chuyÃªn nghiá»‡p: ká»‹ch báº£n, rehearsal, xá»­ lÃ½ live, thÆ°Æ¡ng hiá»‡u cÃ¡ nhÃ¢n vÃ  rate card premium.',
    };
    return labels[value] || labels.deal_internal;
  }

  const labels: Record<string, string> = {
    deal_internal: 'á»ž láº¡i vÃ  tÄƒng lÆ°Æ¡ng báº±ng KPI, scope, báº±ng chá»©ng vÃ  lá»‹ch review rÃµ.',
    jump_job: 'Äá»•i sang role/mÃ´i trÆ°á»ng tráº£ cao hÆ¡n, cÃ³ dáº£i lÆ°Æ¡ng, scope vÃ  KPI tá»‘t hÆ¡n vá»‹ trÃ­ hiá»‡n táº¡i.',
    leadership: 'LÃªn quáº£n lÃ½/lead báº±ng báº±ng chá»©ng quáº£n ngÆ°á»i, quáº£n scope, chá»‹u KPI hoáº·c owner má»™t máº£ng.',
    expert: 'Äi sÃ¢u chuyÃªn mÃ´n báº±ng nÄƒng lá»±c hiáº¿m, chá»©ng chá»‰/case study vÃ  portfolio nghá».',
  };
  return labels[value] || labels.deal_internal;
}

function hasWrongDomainLeak(jobTitle: string, value: string): boolean {
  const role = normalizeForRoadmapQuality(jobTitle);
  const text = normalizeForRoadmapQuality(value);
  if (detectRoleSegment(jobTitle) !== 'hr' && nonHrRoadmapLeakPattern.test(text)) return true;
  if (isTourismRole(jobTitle)) {
    return /housekeeping|buong phong|room attendant|room speed|amenities|minibar|lost found|lost and found|pms|front desk|front office|check\s?in|check\s?out|upsell phong|food cost|table service|pos\/order|restaurant manager|nha hang|khach san|can ho dich vu|resort/.test(text);
  }
  if (isVeterinaryRole(role)) {
    return /patient outcome|patient communication|benh nhan|nguoi nha|phong kham tu|healthtech|human doctor|nha si|dental|chair time|treatment plan nha khoa/.test(text);
  }
  if (isNutritionRole(role)) {
    return /clinical protocol|patient communication|case evidence|benh an|benh nhan|healthtech|human doctor|nha si|dental|chair time|treatment plan nha khoa|vaccination|deworming|surgery|anesthesia/.test(text);
  }
  if (isInsuranceRole(role)) {
    return /fp&a|fpa|finance analyst|financial analyst|financial modeling|senior accountant|controller|chief accountant|tax filing|closing calendar|reconciliation|cfa|acca|lap bao cao tai chinh noi bo|ke toan tong hop|ke toan truong/.test(text);
  }
  if (isSchoolHealthcareRole(role)) {
    return /tesol|celta|ielts|cambridge|lesson plan|demo class|speaking|writing rubric|pre test|post test|homework completion|giao an|hoc vien|curriculum|teacher utilization|giao vien moi|tro giang/.test(text);
  }
  if (isLanguageCenterManagerRole(role) && /tesol|celta|lesson plan|demo class|speaking|writing rubric|pre test|post test|homework completion|giao an|day thu|quay thu/.test(text)) return true;
  if (!isEnglishTeacherRole(role) && !isLanguageCenterManagerRole(role) && /tesol|celta|ielts|cambridge|lesson plan|demo class|speaking|writing rubric|pre test|post test|homework completion/.test(text)) return true;
  if (isPublicSubjectTeacherRole(role) && /center manager|academic operations|teacher utilization|trial-to-paid|class fill rate|enrollment funnel|revenue per class|trung tam ngoai ngu|ielts|toeic|tesol|celta|cambridge/.test(text)) return true;
  if (!isSchoolEducationRole(role) && !isLanguageCenterManagerRole(role) && /giao an|hoc vien|phu huynh|rubric|lesson|curriculum|teacher utilization/.test(text)) return true;
  if (isEducationAdmissionsRole(role) && /center manager|teacher utilization|tesol|celta|lesson plan|demo class|curriculum|speaking|writing rubric|homework completion|giao an|van hanh lop/.test(text)) return true;
  if (isPilotRole(jobTitle) && /cabin crew|purser|senior crew|grooming|service recovery|passenger complaint|announcement|checklist cabin|cabin service|phuc vu hanh khach|hanh khach kho|complaint dich vu|feedback senior crew/.test(text)) return true;
  const isNonTechPersonalRole = isMcRole(jobTitle) || isChefRole(jobTitle) || isAviationRole(jobTitle) || (isHospitalityRole(jobTitle) && !isTourismRole(jobTitle)) || isCleaningRole(jobTitle);
  if (hasFactorySkillLeak(jobTitle, value)) return true;
  if (hasStatisticsProductionLeak(jobTitle, value)) return true;
  if (hasJuniorMarketingSkillLeakForManagerRole(jobTitle, value)) return true;
  if (hasKitchenSkillLeakForRestaurantNonChefRole(jobTitle, value)) return true;
  if (hasManagerSkillLeakForFrontlineServiceRole(jobTitle, value)) return true;
  if (hasGenericSkillLeakForDentalRole(jobTitle, value)) return true;
  if (isDriverDeliveryRole(jobTitle) && /tesol|celta|ielts|cambridge|lesson plan|demo class|hoc vien|phu huynh|power bi|python|financial|tai chinh|ke toan|cfa|acca|audit|5s|qc checklist|van hanh may|san luong|line leader|ho so len to pho|ho so len to truong|to truong san xuat|to pho san xuat/.test(text)) return true;
  if (!isNonTechPersonalRole) return false;
  const techLeak = /github|typescript|javascript|api integration|system design|debugging|technical doc|code review|developer workflow|sql\b|codebase|pull request|frontend|backend/i.test(value);
  if (techLeak) return true;
  if (isHospitalityRole(jobTitle) || isCleaningRole(jobTitle)) {
    return /tesol|celta|lesson plan|demo class|speaking\/writing|hoc vien|phu huynh|teacher|curriculum|rubric/i.test(value);
  }
  if (isAviationRole(jobTitle)) {
    return /dashboard|doanh thu|revenue|há»c viÃªn|hoc vien|student|trial-to-paid|teacher utilization|food cost|recipe card|kitchen sop|showreel|rate card/i.test(value);
  }
  if (isChefRole(jobTitle)) {
    return /Ä‘ang á»Ÿ cÃ´ng ty|dang o cong ty|táº¡i cÃ´ng ty|tai cong ty|cÃ´ng ty tráº£|cong ty tra/i.test(value);
  }
  return false;
}

function getRoleLanguage(jobTitle: string, compass: ReturnType<typeof getCareerCompassContext>) {
  const normalized = normalizeForRoadmapQuality(jobTitle);
  if (isVeterinaryRole(jobTitle) || isNutritionRole(jobTitle) || isInsuranceRole(jobTitle)) {
    const language = getTaxonomyRoleLanguage(jobTitle);
    return {
      rolePath: language.rolePath,
      mainSkill: language.mainSkill,
      proofAsset: language.proofAsset,
      opportunityList: language.opportunityList,
      portfolioWord: language.portfolioWord,
      productWord: language.productWord,
    };
  }
  if (isSchoolHealthcareRole(jobTitle)) {
    const language = getTaxonomyRoleLanguage(jobTitle);
    return {
      rolePath: language.rolePath,
      mainSkill: language.mainSkill,
      proofAsset: language.proofAsset,
      opportunityList: language.opportunityList,
      portfolioWord: language.portfolioWord,
      productWord: language.productWord,
    };
  }
  if (
    isRestaurantManagerRoadmapRole(normalized) ||
    isRestaurantFrontlineRoadmapRole(normalized) ||
    isHotelManagerRoadmapRole(normalized) ||
    isHotelFrontlineRoadmapRole(normalized) ||
    isDentalRoadmapRole(normalized) ||
    isDentalAssistantRoadmapRole(normalized)
  ) {
    const language = getTaxonomyRoleLanguage(jobTitle);
    return {
      rolePath: language.rolePath,
      mainSkill: language.mainSkill,
      proofAsset: language.proofAsset,
      opportunityList: language.opportunityList,
      portfolioWord: language.portfolioWord,
      productWord: language.productWord,
    };
  }
  const tourismLanguage = getTourismRoleProfile(jobTitle)?.language;
  if (tourismLanguage) {
    return {
      rolePath: tourismLanguage.rolePath,
      mainSkill: tourismLanguage.mainSkill,
      proofAsset: tourismLanguage.proofAsset,
      opportunityList: tourismLanguage.opportunityList,
      portfolioWord: tourismLanguage.portfolioWord,
      productWord: tourismLanguage.productWord,
    };
  }
  if (isMcRole(normalized)) {
    return {
      rolePath: 'MC chuyÃªn nghiá»‡p / host sá»± kiá»‡n cÃ³ showreel, rate card vÃ  case xá»­ lÃ½ sÃ¢n kháº¥u',
      mainSkill: 'showreel bÃ¡n hÃ ng + ká»‹ch báº£n sÃ¢n kháº¥u + xá»­ lÃ½ tÃ¬nh huá»‘ng live + rate card theo format sá»± kiá»‡n',
      proofAsset: 'video highlight, máº«u lá»i dáº«n, feedback khÃ¡ch hÃ ng, áº£nh/link show vÃ  checklist briefing/rehearsal',
      opportunityList: 'agency sá»± kiá»‡n, wedding planner, brand activation, livestream commerce, talkshow, corporate event',
      portfolioWord: 'há»“ sÆ¡ MC',
      productWord: 'báº±ng chá»©ng nghá»',
    };
  }
  if (isChefRole(normalized)) {
    return {
      rolePath: 'Ca trÆ°á»Ÿng báº¿p / Sous Chef / báº¿p chuá»—i cÃ³ KPI váº­n hÃ nh',
      mainSkill: 'food cost + waste rate + tá»‘c Ä‘á»™ ra mÃ³n + chuáº©n SOP báº¿p giá» cao Ä‘iá»ƒm',
      proofAsset: 'recipe card cÃ³ Ä‘á»‹nh lÆ°á»£ng/cost, báº£ng waste, log tá»‘c Ä‘á»™ ra mÃ³n, feedback khÃ¡ch vÃ  checklist training phá»¥ báº¿p',
      opportunityList: 'chuá»—i nhÃ  hÃ ng, khÃ¡ch sáº¡n, catering, báº¿p trung tÃ¢m hoáº·c báº¿p cÃ³ KPI váº­n hÃ nh rÃµ',
      portfolioWord: 'há»“ sÆ¡ báº¿p',
      productWord: 'báº±ng chá»©ng nghá» báº¿p',
    };
  }
  if (isPilotRole(normalized)) {
    const language = getTaxonomyRoleLanguage(jobTitle);
    return {
      rolePath: language.rolePath,
      mainSkill: language.mainSkill,
      proofAsset: language.proofAsset,
      opportunityList: language.opportunityList,
      portfolioWord: language.portfolioWord,
      productWord: language.productWord,
    };
  }
  if (isAviationRole(normalized)) {
    return {
      rolePath: 'Senior Cabin Crew / Purser / tuyáº¿n quá»‘c táº¿',
      mainSkill: 'an toÃ n bay + service recovery + announcement tiáº¿ng Anh + feedback senior crew',
      proofAsset: 'checklist safety-service, feedback senior crew/Ä‘á»“ng nghiá»‡p, ghi Ã¢m announcement, chá»©ng chá»‰ training vÃ  ghi chÃº tÃ¬nh huá»‘ng xá»­ lÃ½ khÃ¡ch Ä‘Ã£ che thÃ´ng tin riÃªng tÆ°',
      opportunityList: 'hÃ£ng bay, tuyáº¿n quá»‘c táº¿, senior cabin crew, purser track, cabin service trainer hoáº·c Ä‘Æ¡n vá»‹ dá»‹ch vá»¥ hÃ ng khÃ´ng tráº£ tá»‘t hÆ¡n',
      portfolioWord: 'há»“ sÆ¡ cabin crew',
      productWord: 'báº±ng chá»©ng dá»‹ch vá»¥ bay',
    };
  }
  if (isHousekeepingRole(normalized)) {
    return {
      rolePath: 'Room Attendant senior / Housekeeping Supervisor / khÃ¡ch sáº¡n-cÄƒn há»™ dá»‹ch vá»¥ chuáº©n cao',
      mainSkill: 'room cleaning checklist + tá»‘c Ä‘á»™ phÃ²ng + giáº£m lá»—i/rework + amenities/minibar + feedback giÃ¡m sÃ¡t',
      proofAsset: 'checklist phÃ²ng Ä‘Ã£ tick, áº£nh trÆ°á»›c-sau Ä‘Ã£ che thÃ´ng tin khÃ¡ch, báº£ng phÃºt/phÃ²ng, log lá»—i/rework, feedback giÃ¡m sÃ¡t vÃ  case xá»­ lÃ½ request/complaint nhá»',
      opportunityList: 'khÃ¡ch sáº¡n, resort, cÄƒn há»™ dá»‹ch vá»¥, housekeeping senior, housekeeping supervisor hoáº·c facility-hospitality tráº£ tá»‘t hÆ¡n',
      portfolioWord: 'há»“ sÆ¡ buá»“ng phÃ²ng',
      productWord: 'báº±ng chá»©ng housekeeping',
    };
  }
  if (isHumanResourcesRole(normalized) && isCareerPivotRole(normalized)) {
    return {
      rolePath: 'chá»n 1 nhÃ¡nh HR má»›i: Talent Acquisition, L&D, C&B, HR Operations, HRBP junior hoáº·c People Analytics nháº¹',
      mainSkill: 'bÃ³c JD HR, phá»ng váº¥n Ä‘á»‹nh hÆ°á»›ng, viáº¿t mini case nhÃ¢n sá»±, Ä‘á»c KPI HR vÃ  chuyá»ƒn kinh nghiá»‡m hiá»‡n cÃ³ thÃ nh portfolio',
      proofAsset: 'báº£ng so sÃ¡nh 5 nhÃ¡nh HR, 1 mini case tuyá»ƒn dá»¥ng/Ä‘Ã o táº¡o/C&B, 3 cuá»™c coffee chat, CV theo nhÃ¡nh Ä‘Ã£ chá»n vÃ  tracker pháº£n há»“i',
      opportunityList: 'role TA/L&D/C&B/HR Ops/HRBP junior, agency tuyá»ƒn dá»¥ng, cÃ´ng ty cÃ³ team People rÃµ hoáº·c startup cáº§n HR generalist',
      portfolioWord: 'há»“ sÆ¡ chuyá»ƒn hÆ°á»›ng HR',
      productWord: 'báº±ng chá»©ng chuyá»ƒn hÆ°á»›ng nghá»',
    };
  }
  if (isHumanResourcesRole(normalized)) {
    return {
      rolePath: 'HRBP junior / Talent Acquisition / L&D / C&B / HR Operations cÃ³ KPI rÃµ',
      mainSkill: 'KPI nhÃ¢n sá»± + case tuyá»ƒn dá»¥ng/Ä‘Ã o táº¡o/onboarding + bÃ¡o cÃ¡o insight cho quáº£n lÃ½',
      proofAsset: 'JD analysis, funnel tuyá»ƒn dá»¥ng, training feedback, onboarding checklist, C&B benchmark hoáº·c dashboard HR Ä‘Æ¡n giáº£n',
      opportunityList: 'team HR cÃ³ KPI rÃµ, agency tuyá»ƒn dá»¥ng, cÃ´ng ty tÄƒng trÆ°á»Ÿng nhanh, trung tÃ¢m Ä‘Ã o táº¡o ná»™i bá»™ hoáº·c role People Operations',
      portfolioWord: 'há»“ sÆ¡ nhÃ¢n sá»±',
      productWord: 'báº±ng chá»©ng HR',
    };
  }
  if (isLanguageCenterManagerRole(normalized)) {
    const language = getTaxonomyRoleLanguage(jobTitle);
    return {
      rolePath: language.rolePath,
      mainSkill: language.mainSkill,
      proofAsset: language.proofAsset,
      opportunityList: language.opportunityList,
      portfolioWord: language.portfolioWord,
      productWord: language.productWord,
    };
  }
  if (isEnglishTeacherRole(normalized)) {
    return {
      rolePath: 'IELTS/Cambridge Teacher â†’ Academic Lead / Curriculum Lead mÃ´n tiáº¿ng Anh',
      mainSkill: 'lesson plan TESOL/CELTA-style + rubric Speaking/Writing + Ä‘o tiáº¿n bá»™ há»c viÃªn + retention lá»›p tiáº¿ng Anh',
      proofAsset: 'demo class 10-15 phÃºt, lesson plan, pre-test/post-test sheet, Speaking/Writing rubric, feedback há»c viÃªn/phá»¥ huynh vÃ  attendance/homework tracker',
      opportunityList: 'trung tÃ¢m IELTS/Cambridge, trÆ°á»ng quá»‘c táº¿, chÆ°Æ¡ng trÃ¬nh tiáº¿ng Anh há»c thuáº­t, academic team hoáº·c curriculum team',
      portfolioWord: 'há»“ sÆ¡ giÃ¡o viÃªn tiáº¿ng Anh',
      productWord: 'báº±ng chá»©ng lá»›p tiáº¿ng Anh',
    };
  }
  if (isEducationAdmissionsRole(normalized)) {
    const language = getTaxonomyRoleLanguage(jobTitle);
    return {
      rolePath: language.rolePath,
      mainSkill: language.mainSkill,
      proofAsset: language.proofAsset,
      opportunityList: language.opportunityList,
      portfolioWord: language.portfolioWord,
      productWord: language.productWord,
    };
  }
  const taxonomySegment = detectRoleSegment(jobTitle);
  if (taxonomySegment !== 'general') {
    const language = getTaxonomyRoleLanguage(jobTitle);
    return {
      rolePath: language.rolePath,
      mainSkill: language.mainSkill,
      proofAsset: language.proofAsset,
      opportunityList: language.opportunityList,
      portfolioWord: language.portfolioWord,
      productWord: language.productWord,
    };
  }
  return {
    rolePath: compass.nextMilestone,
    mainSkill: compass.topSkillGap,
    proofAsset: 'file/link/áº£nh chá»¥p chá»©ng minh káº¿t quáº£, sá»‘ liá»‡u trÆ°á»›c/sau vÃ  ngÆ°á»i xÃ¡c nháº­n',
    opportunityList: 'cÃ´ng ty/trÆ°á»ng/trung tÃ¢m/nhÃ  mÃ¡y/role cÃ³ kháº£ nÄƒng tráº£ cao hÆ¡n',
    portfolioWord: 'portfolio',
    productWord: 'sáº£n pháº©m/báº±ng chá»©ng',
  };
}

function normalizeSurveyText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[Ä‘Ä]/g, 'd')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isLowInfoSurveyValue(value: string) {
  const normalized = normalizeSurveyText(value);
  if (!normalized) return true;
  return /^(khong biet|chua biet|khong ro|chua ro|khong chac|chua chac|khong co|chua co|none|null|na|n a)$/i.test(normalized) ||
    normalized.includes('khong biet nen') ||
    normalized.includes('khong biet minh') ||
    normalized.includes('chua biet nen');
}

function cleanIntakeValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(/\s+/g, ' ').trim().slice(0, 240);
  if (!cleaned || isLowInfoSurveyValue(cleaned)) return undefined;
  return cleaned;
}

function sameOptionalValue(a?: string, b?: string): boolean {
  return (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
}

function intakeMatches(existing: unknown, incoming: RoadmapIntake): boolean {
  const saved = (existing as RoadmapData | null)?.intake;
  if (!saved) return false;
  return (
    sameOptionalValue(saved.currentPosition, incoming.currentPosition) &&
    sameOptionalValue(saved.mainWeakness, incoming.mainWeakness) &&
    sameOptionalValue(saved.twoYearGoal, incoming.twoYearGoal) &&
    sameOptionalValue(saved.educationLevel, incoming.educationLevel) &&
    sameOptionalValue(saved.educationDetail, incoming.educationDetail) &&
    sameOptionalValue(saved.strongSkills, incoming.strongSkills) &&
    sameOptionalValue(saved.proofAssets, incoming.proofAssets) &&
    sameOptionalValue(saved.bottleneck, incoming.bottleneck) &&
    sameOptionalValue(saved.preferredPath, incoming.preferredPath) &&
    sameOptionalValue(saved.weeklyTime, incoming.weeklyTime)
  );
}

function getSavedIntake(existing: unknown): RoadmapIntake {
  const saved = (existing as RoadmapData | null)?.intake;
  return {
    currentPosition: cleanIntakeValue(saved?.currentPosition),
    mainWeakness: cleanIntakeValue(saved?.mainWeakness),
    twoYearGoal: cleanIntakeValue(saved?.twoYearGoal),
    educationLevel: cleanIntakeValue(saved?.educationLevel),
    educationDetail: cleanIntakeValue(saved?.educationDetail),
    strongSkills: cleanIntakeValue(saved?.strongSkills),
    proofAssets: cleanIntakeValue(saved?.proofAssets),
    bottleneck: cleanIntakeValue(saved?.bottleneck),
    preferredPath: cleanIntakeValue(saved?.preferredPath),
    weeklyTime: cleanIntakeValue(saved?.weeklyTime),
  };
}

const normalizeForRoadmapQuality = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\bw\d+\b|\btuan\s+\d+\b|\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim();

function isManagerOrExecutiveRoadmapRole(value: string) {
  const normalized = normalizeForRoadmapQuality(value);
  const falseManager = /quan ly rui ro|quan ly quan he khach hang|risk management|management consultant/.test(normalized);
  if (falseManager) return false;
  return /\b(ceo|coo|cfo|cto|vp)\b|tong giam doc|pho tong giam doc|general director|managing director|director|giam doc|head of|\bhead\b|manager|quan ly|truong phong|truong nhom|supervisor|lead|leader|chief|principal|hieu truong|hieu pho|bep truong|cua hang truong|area manager|regional|event coordinator|event producer|creative director|design director|medical director|giam doc y te/.test(normalized);
}

function hasGoodMarkdownRoadmap(value: unknown): boolean {
  const roadmap = value as RoadmapData | null;
  const markdown = typeof roadmap?.markdown === 'string' ? roadmap.markdown.trim() : '';
  return markdown.length >= 700 && /thÃ¡ng\s*(1|3|6|12)/i.test(markdown);
}

function hasEducationFitSection(value: unknown): boolean {
  const roadmap = value as RoadmapData | null;
  const markdown = typeof roadmap?.markdown === 'string' ? roadmap.markdown : '';
  return /Ä‘á»™ khá»›p há»c váº¥n vá»›i lÆ°Æ¡ng|Ä‘á»™ khá»›p há»c váº¥n vá»›i lÆ°Æ¡ng/i.test(markdown);
}

function hasActionPlan(value: unknown): boolean {
  const plan = (value as RoadmapData | null)?.actionPlan;
  const milestones = Array.isArray(plan?.milestones) ? plan.milestones : [];
  const taskCount = milestones.reduce((total, milestone) => (
    total + (milestone.weeks || []).reduce((weekTotal, week) => weekTotal + (week.tasks || []).length, 0)
  ), 0);
  return Boolean(plan?.standardWeeks && plan?.flexibleWeeks && taskCount >= 6);
}

function hasRepeatedActionTasks(value: unknown): boolean {
  const plan = (value as RoadmapData | null)?.actionPlan;
  const milestones = Array.isArray(plan?.milestones) ? plan.milestones : [];
  const titles = milestones.flatMap(milestone => (
    (milestone.weeks || []).flatMap(week => (
      (week.tasks || [])
        .map(task => normalizeForRoadmapQuality(task?.title || ''))
        .filter(Boolean)
    ))
  ));

  if (titles.length < 8) return false;

  const counts = new Map<string, number>();
  for (const title of titles) counts.set(title, (counts.get(title) || 0) + 1);

  if ([...counts.values()].some(count => count >= 2)) return true;

  const uniqueRatio = counts.size / titles.length;
  if (uniqueRatio < 0.75) return true;

  return [...counts].some(([title, count]) => (
    count >= 2 && /tao ho so housekeeping|chon 1 kpi sat voi|portfolio chung|case study chung|checklist phong, anh before-after/.test(title)
  ));
}

function hasBlockedCustomerTerm(value: string): boolean {
  return /\b(AI|DeepSeek|ChatGPT|Claude)\b/.test(value);
}

function hasUnknownSurveyLeak(value: string): boolean {
  return /khÃ´ng biáº¿t|khÃ´ng biáº¿t|khong biet|chÆ°a biáº¿t|chÆ°a biáº¿t|chua biet/i.test(value);
}

function hasGenericRoadmapCopy(value: string): boolean {
  const normalized = normalizeForRoadmapQuality(value);
  return /tang level thang|nang skill tao chenh lech|nen mong bang chung|dong goi case tang luong|chon # kpi sat voi|portfolio chung|case study chung|hoan thanh # output do duoc/.test(normalized);
}

function hasBrokenMilestoneSequence(roadmap: RoadmapData | null): boolean {
  const milestones = Array.isArray(roadmap?.actionPlan?.milestones) ? roadmap.actionPlan.milestones : [];
  if (milestones.length === 0) return true;
  const months = milestones.map(milestone => Number(milestone.month));
  if (months[0] !== 1 || months.some(month => !Number.isFinite(month) || month < 1)) return true;
  return months.some((month, index) => index > 0 && month !== months[index - 1] + 1);
}

function isLowQualityRoadmap(value: unknown, jobTitle = ''): value is RoadmapData {
  const roadmap = value as RoadmapData | null;
  const roleText = repairMojibakeText(getRoleIdentityText(jobTitle, roadmap?.intake || {}));
  const roadmapContent = { ...roadmap, intake: undefined };
  const serialized = JSON.stringify(roadmapContent);
  const roleLockValidation = jobTitle ? validateRoadmapRoleLock(jobTitle, roadmapContent) : { passed: true };
  const milestones = Array.isArray(roadmap?.actionPlan?.milestones) ? roadmap.actionPlan.milestones : [];
  const taskCount = milestones.reduce((total, milestone) => (
    total + (milestone.weeks || []).reduce((weekTotal, week) => weekTotal + (week.tasks || []).length, 0)
  ), 0);
  if (roadmap?.format === 'expert_v2') {
    const markdown = typeof roadmap.markdown === 'string' ? roadmap.markdown : '';
    return (
      roadmap.version !== 2 ||
      taskCount > 48 ||
      !hasGoodMarkdownRoadmap(roadmap) ||
      !hasEducationFitSection(roadmap) ||
      !hasActionPlan(roadmap) ||
      hasBrokenMilestoneSequence(roadmap) ||
      hasRepeatedActionTasks(roadmap) ||
      hasBlockedCustomerTerm(markdown) ||
      hasUnknownSurveyLeak(markdown) ||
      hasGenericRoadmapCopy(serialized) ||
      !roleLockValidation.passed ||
      (isEnglishTeacherRole(roleText) && /Chá»n 1 KPI sÃ¡t vá»›i|Chon 1 KPI sat voi|Photoshop\/Canva|Instructional Design|Thiáº¿t káº¿ slide Canva|Thiet ke slide Canva/i.test(serialized)) ||
      hasWrongDomainLeak(roleText, serialized)
    );
  }
  return true;
}

function buildFallbackRoadmap(
  jobTitle: string,
  currentSalary: number,
  targetSalary: number,
  durationMonths: number,
  compass: ReturnType<typeof getCareerCompassContext>,
  segment: ReturnType<typeof detectRoadmapSegment>,
  intake: RoadmapIntake = {}
): RoadmapData {
  const totalWeeks = getCompactPlanWeeks(durationMonths);
  const roleText = repairMojibakeText(getRoleIdentityText(jobTitle, intake));
  const normalized = normalizeForRoadmapQuality(roleText);
  const roleSegment = detectRoleSegment(roleText);
  const isLanguageCenterManager = isLanguageCenterManagerRole(roleText);
  const isSchoolPrincipal = isSchoolPrincipalRole(roleText);
  const isTeacher = ['education', 'freelance_teaching'].includes(roleSegment) && !isLanguageCenterManager && !isSchoolPrincipal;
  const isEnglishTeacher = isEnglishTeacherRole(roleText);
  const isPublicSubjectTeacher = isPublicSubjectTeacherRole(roleText);
  const isWorker = /cong nhan|factory|production|van hanh may|operator/.test(normalized);
  const isFresh = isFreshOrUndirectedRole(roleText);
  const isPivot = isCareerPivotRole(roleText);
  const isHrPivot = isHumanResourcesRole(roleText) && isPivot;
  const isPerformer = isMcRole(normalized);
  const isChef = isChefRole(normalized);
  const isPilot = isPilotRole(normalized);
  const isAviation = isAviationRole(normalized);
  const isRestaurantManager = isRestaurantManagerRoadmapRole(roleText);
  const isRestaurantFrontline = isRestaurantFrontlineRoadmapRole(roleText);
  const isHotelManager = isHotelManagerRoadmapRole(roleText);
  const isHotelFrontline = isHotelFrontlineRoadmapRole(roleText);
  const isDental = isDentalRoadmapRole(roleText);
  const isDentalAssistant = isDentalAssistantRoadmapRole(roleText);
  const tourismProfile = getTourismRoleProfile(roleText);
  const isTourism = Boolean(tourismProfile);
  const isHospitality = isHospitalityRole(roleText) && !isTourism;
  const isCleaning = isCleaningRole(roleText);
  const isDriverDelivery = isDriverDeliveryRole(roleText);
  const isStatistics = isStatisticsDataRole(roleText);
  const isSchoolHealthcare = isSchoolHealthcareRole(roleText);
  const isEducationAdmissions = isEducationAdmissionsRole(roleText);
  const isStudyAbroadAdmissions = isStudyAbroadAdmissionsRole(roleText);
  const isInsurance = isInsuranceRole(roleText);
  const roleLanguage = getRoleLanguage(roleText, compass);
  const kpiGuidance = getPracticalKpiGuidance(roleText);
  const targetLabel = `${(targetSalary / 1_000_000).toFixed(1)} triá»‡u/thÃ¡ng`;
  const gapLabel = `${Math.max(0, targetSalary - currentSalary).toLocaleString('vi-VN')}Ä‘/thÃ¡ng`;
  const segmentNote = segment ? ` Æ¯u tiÃªn riÃªng cho nhÃ³m nÃ y: ${segment.priority}.` : '';
  const rolePath = isPerformer
    ? roleLanguage.rolePath
    : isChef
    ? roleLanguage.rolePath
    : isPilot
    ? roleLanguage.rolePath
    : isAviation
    ? roleLanguage.rolePath
    : isTourism || isHospitality || isCleaning
    ? roleLanguage.rolePath
    : isDriverDelivery
    ? roleLanguage.rolePath
    : isStatistics
    ? roleLanguage.rolePath
    : isSchoolHealthcare
    ? roleLanguage.rolePath
    : isEducationAdmissions
    ? roleLanguage.rolePath
    : isInsurance
    ? roleLanguage.rolePath
    : isPublicSubjectTeacher
    ? roleLanguage.rolePath
    : isEnglishTeacher
    ? roleLanguage.rolePath
    : isTeacher
    ? 'Corporate Training / E-learning'
      : isWorker && !isPivot && !isFresh
      ? 'tá»• phÃ³/tá»• trÆ°á»Ÿng hoáº·c line váº­n hÃ nh tá»‘t hÆ¡n'
      : isFresh
        ? 'chá»n 1 role Ä‘áº§u Ä‘á»i phÃ¹ há»£p vÃ  cÃ³ offer tá»‘t hÆ¡n sau thá»­ viá»‡c'
      : isHrPivot
        ? roleLanguage.rolePath
        : isPivot
        ? roleLanguage.rolePath
        : compass.nextMilestone;

  const blueprints = [
    {
      focus: `Chá»‘t hÆ°á»›ng tÄƒng lÆ°Æ¡ng: ${rolePath}`,
      milestone: `CÃ³ 1 trang má»¥c tiÃªu gá»“m má»©c hiá»‡n táº¡i, má»©c Ä‘Ã­ch ${targetLabel}, 3 nÄƒng lá»±c thiáº¿u vÃ  10 nÆ¡i/role Ä‘Ã¡ng nháº¯m tá»›i.`,
      tasks: [
        `Viáº¿t rÃµ 3 role cÃ³ thá»ƒ tráº£ cao hÆ¡n cho ${jobTitle}; ghi má»©c lÆ°Æ¡ng má»¥c tiÃªu, yÃªu cáº§u chÃ­nh vÃ  lÃ½ do báº¡n phÃ¹ há»£p.`,
        'Chá»¥p láº¡i hoáº·c lÆ°u 5 tin tuyá»ƒn dá»¥ng/band lÆ°Æ¡ng liÃªn quan Ä‘á»ƒ lÃ m báº±ng chá»©ng thá»‹ trÆ°á»ng.',
        isFresh
          ? 'Táº¡o báº£ng chá»n hÆ°á»›ng gá»“m 3 role Ä‘áº§u Ä‘á»i: viá»‡c háº±ng ngÃ y lÃ  gÃ¬, cáº§n skill nÃ o, bÃ i test thÆ°á»ng gáº·p, má»©c lÆ°Æ¡ng entry vÃ  vÃ¬ sao mÃ¬nh há»£p/khÃ´ng há»£p.'
          : isHrPivot
          ? 'Táº¡o báº£ng so sÃ¡nh 5 nhÃ¡nh HR cÃ³ thá»ƒ chuyá»ƒn: Talent Acquisition, L&D, C&B, HR Operations, HRBP junior; má»—i nhÃ¡nh ghi viá»‡c háº±ng ngÃ y, KPI, lÆ°Æ¡ng tham kháº£o, Ä‘iá»ƒm há»£p vÃ  Ä‘iá»ƒm khÃ´ng há»£p.'
          : isPerformer
          ? 'Táº¡o kho báº±ng chá»©ng MC gá»“m: video showreel, áº£nh sÃ¢n kháº¥u, feedback khÃ¡ch/agency, format sá»± kiá»‡n, má»©c phÃ­ Ä‘Ã£ nháº­n vÃ  ngÆ°á»i xÃ¡c nháº­n.'
          : isChef
          ? 'Táº¡o kho báº±ng chá»©ng nghá» báº¿p gá»“m: recipe card, Ä‘á»‹nh lÆ°á»£ng/cost mÃ³n, waste log, tá»‘c Ä‘á»™ ra mÃ³n, áº£nh plating, feedback khÃ¡ch vÃ  ngÆ°á»i xÃ¡c nháº­n.'
          : isPilot
          ? 'Táº¡o kho báº±ng chá»©ng pilot gá»“m: logbook/flight hours summary, type rating/recurrent certificates, simulator check record, safety/incident-free record, route-aircraft qualification vÃ  instructor/check feedback náº¿u Ä‘Æ°á»£c phÃ©p chia sáº».'
          : isAviation
          ? 'Táº¡o kho báº±ng chá»©ng cabin crew gá»“m: checklist safety-service, ghi Ã¢m announcement tiáº¿ng Anh, feedback senior crew/Ä‘á»“ng nghiá»‡p, chá»©ng chá»‰ training vÃ  3 tÃ¬nh huá»‘ng xá»­ lÃ½ khÃ¡ch Ä‘Ã£ che thÃ´ng tin riÃªng tÆ°.'
          : isStatistics
          ? 'Táº¡o kho báº±ng chá»©ng thá»‘ng kÃª gá»“m: 1 file dá»¯ liá»‡u Ä‘Ã£ lÃ m sáº¡ch, data dictionary 10 cá»™t chÃ­nh, pivot/dashboard, log Ä‘á»‘i soÃ¡t sai lá»‡ch vÃ  1 ghi chÃº insight 1 trang cho quáº£n lÃ½.'
          : isSchoolHealthcare
          ? 'Táº¡o kho báº±ng chá»©ng y táº¿ há»c Ä‘Æ°á»ng gá»“m: sá»• há»“ sÆ¡ sá»©c khá»e há»c sinh Ä‘Ã£ áº©n thÃ´ng tin, checklist sÆ¡ cá»©u, log thuá»‘c/dá»‹ á»©ng, log sá»± cá»‘/chuyá»ƒn tuyáº¿n vÃ  káº¿ hoáº¡ch tiÃªm chá»§ng/bá»‡nh truyá»n nhiá»…m.'
          : isEducationAdmissions
          ? isStudyAbroadAdmissions
            ? 'Táº¡o kho báº±ng chá»©ng tÆ° váº¥n du há»c gá»“m: tracker 20 lead Ä‘Ã£ áº©n thÃ´ng tin, nhu cáº§u-ngÃ¢n sÃ¡ch, shortlist trÆ°á»ng/ngÃ nh, checklist giáº¥y tá», deadline, offer/visa outcome, next step vÃ  feedback khÃ¡ch.'
            : 'Táº¡o kho báº±ng chá»©ng tÆ° váº¥n tuyá»ƒn sinh gá»“m: tracker 20 lead Ä‘Ã£ áº©n thÃ´ng tin, nguá»“n lead, nhu cáº§u há»c, há»c phÃ­/ngÃ¢n sÃ¡ch, chÆ°Æ¡ng trÃ¬nh phÃ¹ há»£p, lá»‹ch tÆ° váº¥n/placement test, tráº¡ng thÃ¡i Ä‘Äƒng kÃ½-Ä‘Ã³ng phÃ­-nháº­p há»c, next step vÃ  feedback khÃ¡ch.'
          : isPublicSubjectTeacher
          ? 'Táº¡o kho báº±ng chá»©ng giÃ¡o viÃªn bá»™ mÃ´n gá»“m: giÃ¡o Ã¡n bá»™ mÃ´n, ma tráº­n Ä‘á», rubric cháº¥m bÃ i, Ä‘iá»ƒm trÆ°á»›c-sau, bÃ i há»c sinh Ä‘Ã£ áº©n danh, chuyÃªn Ä‘á» tá»•, phá»¥ Ä‘áº¡o/bá»“i dÆ°á»¡ng vÃ  xÃ¡c nháº­n dá»± giá»/gÃ³p Ã½.'
          : isRestaurantManager
          ? 'Chá»n 3 tÃ¬nh huá»‘ng quáº£n lÃ½ nhÃ  hÃ ng hay gáº·p: thiáº¿u ngÆ°á»i trong ca, complaint lá»›n, food/labor cost vÆ°á»£t ngÆ°á»¡ng hoáº·c order/bill lá»—i; ghi cÃ¡ch xá»­ lÃ½ vÃ  KPI theo dÃµi.'
          : isRestaurantFrontline
          ? 'Chon 3 tinh huong phuc vu/thu ngan hay gap: order sai, bill loi, khach complaint hoac request gap; ghi cach xu ly trong 3 buoc va ai xac nhan.'
          : isHotelManager
          ? 'Chon 3 tinh huong quan ly khach san: occupancy thap, review xau, complaint qua SLA hoac staffing lech; ghi root cause va 3 action 30 ngay.'
          : isHotelFrontline
          ? 'Chon 3 tinh huong le tan/front desk: booking sai, check-in tre, guest request qua SLA hoac complaint; ghi cach xu ly va handover.'
          : isRestaurantManager
          ? 'Láº­p dashboard ca/thÃ¡ng cho nhÃ  hÃ ng: doanh thu, table turn, labor cost, food cost/waste, complaint recovery vÃ  training team.'
          : isRestaurantFrontline
          ? 'Lap log 10 bill/ban: order dung/sai, bill loi, upsell/request, complaint va ai xac nhan.'
          : isHotelManager
          ? 'Lap operating dashboard khach san: occupancy, ADR/RevPAR, review score, request SLA, complaint recovery, staffing va action log.'
          : isHotelFrontline
          ? 'Lap log 10 check-in/request: booking dung tren PMS, thoi gian xu ly, upsell neu co, complaint va handover.'
          : isDental
          ? 'Chon 3 ca nha khoa co the dong goi thanh bang chung: chan doan, treatment plan, vo khuan, tai kham va feedback benh nhan.'
          : isDentalAssistant
          ? 'Chon 3 ca tro ly nha khoa: chuan bi ghe, vo khuan, suction/chuyen dung cu, huong dan sau dieu tri va feedback bac si.'
          : isDental
          ? 'Dong goi 1 case nha khoa an danh: trieu chung, chan doan, phim/anh duoc phep, treatment plan, vo khuan, tai kham va feedback.'
          : isDentalAssistant
          ? 'Lam checklist ca tro ly nha khoa: chuan bi ghe, dung cu, vo khuan, suction/chuyen dung cu, huong dan va hen tai kham.'
          : isHospitality
          ? 'Táº¡o kho báº±ng chá»©ng housekeeping/hospitality gá»“m: checklist phÃ²ng, áº£nh before-after Ä‘Ã£ che thÃ´ng tin khÃ¡ch, log thá»i gian dá»n phÃ²ng, lá»—i/rework, feedback giÃ¡m sÃ¡t vÃ  case xá»­ lÃ½ yÃªu cáº§u khÃ¡ch.'
          : isCleaning
          ? 'Táº¡o kho báº±ng chá»©ng vá»‡ sinh gá»“m: checklist khu vá»±c, áº£nh before-after, log hÃ³a cháº¥t/dá»¥ng cá»¥, rework/complaint vÃ  feedback giÃ¡m sÃ¡t.'
          : isDriverDelivery
          ? 'Táº¡o kho báº±ng chá»©ng tÃ i xáº¿ gá»“m: log chuyáº¿n/Ä‘Æ¡n, tá»· lá»‡ Ä‘Ãºng giá», sá»‘ chuyáº¿n/Ä‘Æ¡n hoÃ n thÃ nh, rating/feedback khÃ¡ch, checklist an toÃ n xe/giáº¥y tá» vÃ  3 case xá»­ lÃ½ phÃ¡t sinh trong ca.'
          : isEnglishTeacher
          ? 'Táº¡o kho báº±ng chá»©ng giÃ¡o viÃªn tiáº¿ng Anh gá»“m: demo class 10-15 phÃºt, lesson plan TESOL/CELTA-style, pre-test/post-test sheet, rubric Speaking/Writing, feedback há»c viÃªn/phá»¥ huynh vÃ  tracker attendance/homework.'
          : isInsurance
          ? 'Tao kho bang chung bao hiem phi nhan tho gom: case underwriting/claims/renewal da an thong tin, dieu khoan coverage/loai tru, premium logic, loss ratio neu co, feedback broker/khach hang va SLA xu ly.'
          : 'Táº¡o file evidence log gá»“m: viá»‡c Ä‘Ã£ lÃ m, sá»‘ liá»‡u trÆ°á»›c/sau, áº£nh/link chá»©ng minh, ngÆ°á»i xÃ¡c nháº­n.',
        `Chá»n 1 nÄƒng lá»±c trá»ng tÃ¢m tuáº§n sau: ${roleLanguage.mainSkill}.`,
      ],
    },
    {
      focus: `Há»c Ä‘Ãºng 1 ká»¹ nÄƒng táº¡o chÃªnh lá»‡ch lÆ°Æ¡ng`,
      milestone: `CÃ³ checklist ká»¹ nÄƒng vÃ  1 bÃ i thá»±c hÃ nh chá»©ng minh báº¡n Ä‘Ã£ dÃ¹ng Ä‘Æ°á»£c ${roleLanguage.mainSkill}.`,
      tasks: [
        isFresh
          ? 'Chá»n 1 role má»¥c tiÃªu Ä‘áº§u tiÃªn, xem 3 JD tháº­t vÃ  ghi láº¡i 5 viá»‡c ngÆ°á»i má»›i pháº£i lÃ m trong thÃ¡ng Ä‘áº§u.'
          : isPerformer
          ? 'Xem láº¡i 3 video MC/host cÃ¹ng phÃ¢n khÃºc, ghi ra cÃ¡ch há» má»Ÿ mÃ n, chuyá»ƒn Ä‘oáº¡n, cá»©u nhá»‹p vÃ  xá»­ lÃ½ khÃ¡ch má»i khÃ³.'
          : isChef
          ? 'Chá»n 3 mÃ³n Ä‘ang bÃ¡n/cháº¿ biáº¿n nhiá»u nháº¥t, ghi rÃµ Ä‘á»‹nh lÆ°á»£ng, thá»i gian chuáº©n bá»‹, food cost Æ°á»›c tÃ­nh vÃ  lá»—i thÆ°á»ng gáº·p khi ra mÃ³n.'
          : isPilot
          ? 'Chon 3 tinh huong flight deck can chung minh: SOP abnormal, CRM coordination, ATC communication hoac simulator check; ghi boi canh, quy trinh ap dung, bang chung co the luu va thong tin nao phai an.'
          : isAviation
          ? 'Chá»n 3 tÃ¬nh huá»‘ng cabin crew hay gáº·p: khÃ¡ch lo láº¯ng, complaint dá»‹ch vá»¥, yÃªu cáº§u Ä‘áº·c biá»‡t hoáº·c trá»… ná»‘i chuyáº¿n; ghi cÃ¡ch xá»­ lÃ½ Ä‘Ãºng quy trÃ¬nh vÃ  cÃ¢u nÃ³i nÃªn dÃ¹ng.'
          : isSchoolHealthcare
          ? 'Chá»n 3 tÃ¬nh huá»‘ng y táº¿ há»c Ä‘Æ°á»ng hay gáº·p: há»c sinh sá»‘t/Ä‘au bá»¥ng, va cháº¡m tÃ© ngÃ£, quÃªn thuá»‘c/dá»‹ á»©ng; ghi cÃ¡ch tiáº¿p nháº­n, sÆ¡ cá»©u, gá»i phá»¥ huynh vÃ  chuyá»ƒn tuyáº¿n.'
          : isEducationAdmissions
          ? isStudyAbroadAdmissions
            ? 'Chá»n 3 tÃ¬nh huá»‘ng tÆ° váº¥n hay gáº·p: há»“ sÆ¡ thiáº¿u giáº¥y tá», chá»n ngÃ nh chÆ°a rÃµ, ngÃ¢n sÃ¡ch lá»‡ch vá»›i trÆ°á»ng má»¥c tiÃªu hoáº·c rá»§i ro visa; ghi cÃ¡ch há»i nhu cáº§u, kiá»ƒm Ä‘iá»u kiá»‡n, Ä‘á» xuáº¥t phÆ°Æ¡ng Ã¡n vÃ  next step.'
            : 'Chá»n 3 tÃ¬nh huá»‘ng tuyá»ƒn sinh hay gáº·p: lead chÆ°a rÃµ nhu cáº§u, phá»¥ huynh/há»c viÃªn lÄƒn tÄƒn há»c phÃ­, lá»‹ch há»c khÃ´ng phÃ¹ há»£p hoáº·c no-show tÆ° váº¥n; ghi cÃ¡ch há»i nhu cáº§u, Ä‘á» xuáº¥t chÆ°Æ¡ng trÃ¬nh vÃ  next step.'
          : isRestaurantManager
          ? 'Biáº¿n 1 ca nhÃ  hÃ ng thÃ nh checklist quáº£n lÃ½: roster, floor control, POS/order issue, complaint, food/labor cost note vÃ  handover.'
          : isRestaurantFrontline
          ? 'Bien 1 ca phuc vu/thu ngan thanh checklist: nhan ban/order, nhap POS, confirm mon/bill, upsell, complaint va handover.'
          : isHotelManager
          ? 'Bien 1 ngay van hanh khach san thanh checklist: occupancy, ADR/RevPAR, staffing, review, complaint SLA, OTA/revenue action va SOP audit.'
          : isHotelFrontline
          ? 'Bien 1 ca front desk thanh checklist: booking/PMS, check-in/out, guest request, upsell, complaint, note PMS va handover.'
          : isDental
          ? 'Bien 1 ca nha khoa thanh checklist clinical: chan doan, phim/anh duoc phep, treatment plan, vo khuan, tai kham va case note an danh.'
          : isDentalAssistant
          ? 'Bien 1 ca tro ly nha khoa thanh checklist: ghe, dung cu, vo khuan, suction/chuyen dung cu, don dep, huong dan va tai kham.'
          : isHospitality
          ? 'Chá»n 3 tÃ¬nh huá»‘ng housekeeping/hospitality hay gáº·p: phÃ²ng checkout gáº¥p, khÃ¡ch yÃªu cáº§u thÃªm amenities, lá»—i phÃ²ng hoáº·c complaint vá»‡ sinh; ghi cÃ¡ch xá»­ lÃ½ Ä‘Ãºng SOP vÃ  cÃ¢u nÃ³i nÃªn dÃ¹ng.'
          : isCleaning
          ? 'Chá»n 3 khu vá»±c vá»‡ sinh hay phÃ¡t sinh lá»—i: sáº£nh/toilet/khu lÃ m viá»‡c/kho; ghi tiÃªu chuáº©n sáº¡ch, dá»¥ng cá»¥ hÃ³a cháº¥t, lá»—i thÆ°á»ng gáº·p vÃ  cÃ¡ch nghiá»‡m thu.'
          : isDriverDelivery
          ? 'Chá»n 3 tÃ¬nh huá»‘ng tÃ i xáº¿ hay gáº·p: sai Ä‘iá»ƒm Ä‘Ã³n/giao, khÃ¡ch khÃ´ng nghe mÃ¡y, trá»… giá», há»§y chuyáº¿n/hoÃ n Ä‘Æ¡n hoáº·c sá»± cá»‘ trong ca; ghi cÃ¡ch xá»­ lÃ½, thá»i gian pháº£n há»“i vÃ  báº±ng chá»©ng cáº§n lÆ°u.'
          : isInsurance
          ? 'Chon 3 tinh huong bao hiem phi nhan tho hay gap: quote/underwriting can them thong tin, claim/boi thuong thieu chung tu, renewal co nguy co mat khach hoac dieu khoan coverage bi hieu sai; ghi cach xu ly dung quy trinh.'
          : `Há»c 3 tÃ i liá»‡u/video ngáº¯n vá» ${roleLanguage.mainSkill}; ghi láº¡i 10 Ã½ cÃ³ thá»ƒ Ã¡p dá»¥ng ngay vÃ o cÃ´ng viá»‡c.`,
        isFresh
          ? 'Biáº¿n 1 bÃ i test tuyá»ƒn dá»¥ng/mini project máº«u thÃ nh checklist tá»«ng bÆ°á»›c: Ä‘á»c Ä‘á», há»i láº¡i yÃªu cáº§u, lÃ m báº£n nhÃ¡p, tá»± kiá»ƒm lá»—i, ná»™p báº£n cuá»‘i.'
          : isHrPivot
          ? 'Chá»n 1 nhÃ¡nh HR muá»‘n thá»­ trÆ°á»›c vÃ  lÃ m checklist 14 ngÃ y: Ä‘á»c 5 JD, há»i 2 ngÆ°á»i trong nghá», lÃ m 1 mini case, sá»­a CV theo nhÃ¡nh Ä‘Ã³ vÃ  gá»­i thá»­ 5 nÆ¡i.'
          : isPerformer
          ? 'Biáº¿n 1 format sá»± kiá»‡n quen thuá»™c thÃ nh checklist: brief khÃ¡ch, key message, timeline, Ä‘iá»ƒm chuyá»ƒn Ä‘oáº¡n, phÆ°Æ¡ng Ã¡n xá»­ lÃ½ trá»… giá».'
          : isChef
          ? 'Biáº¿n 1 ca báº¿p Ä‘Ã´ng khÃ¡ch thÃ nh checklist: chuáº©n bá»‹ mise en place, thá»© tá»± ra mÃ³n, Ä‘iá»ƒm kiá»ƒm cháº¥t lÆ°á»£ng, an toÃ n vÃ  bÃ n giao cuá»‘i ca.'
          : isPilot
          ? 'Bien 1 duty/simulator session thanh checklist ca nhan: pre-flight brief, SOP callout, ATC phraseology, CRM handoff, abnormal item, debrief va logbook/evidence update.'
          : isAviation
          ? 'Biáº¿n 1 ca/chuyáº¿n bay thÃ nh checklist cÃ¡ nhÃ¢n: grooming, briefing, safety demo, service flow, xá»­ lÃ½ complaint, teamwork vÃ  debrief sau chuyáº¿n.'
          : isSchoolHealthcare
          ? 'Bien 1 ca truc y te thanh checklist ca nhan: tiep nhan hoc sinh, do dau hieu, so cuu, ghi so, bao giao vien/phu huynh, chuyen tuyen va ban giao.'
          : isEducationAdmissions
          ? isStudyAbroadAdmissions
            ? 'Biáº¿n 1 ca tÆ° váº¥n thÃ nh checklist cÃ¡ nhÃ¢n: xÃ¡c nháº­n nhu cáº§u, ngÃ¢n sÃ¡ch, quá»‘c gia/ngÃ nh, Ä‘iá»ƒm há»c táº­p/ngoáº¡i ngá»¯, shortlist trÆ°á»ng, giáº¥y tá» cÃ²n thiáº¿u, deadline vÃ  lá»‹ch follow-up.'
            : 'Biáº¿n 1 ca tuyá»ƒn sinh thÃ nh checklist cÃ¡ nhÃ¢n: xÃ¡c nháº­n nguá»“n lead, nhu cáº§u há»c, má»¥c tiÃªu, lá»‹ch ráº£nh, há»c phÃ­/ngÃ¢n sÃ¡ch, chÆ°Æ¡ng trÃ¬nh/lá»›p/ngÃ nh phÃ¹ há»£p, placement test náº¿u cÃ³ vÃ  lá»‹ch follow-up.'
          : isHospitality
          ? 'Biáº¿n 1 ca housekeeping thÃ nh checklist cÃ¡ nhÃ¢n: nháº­n phÃ²ng, kiá»ƒm minibar/amenities, dá»n giÆ°á»ng, vá»‡ sinh toilet, bÃ¡o maintenance/lost & found, bÃ n giao vÃ  debrief.'
          : isCleaning
          ? 'Biáº¿n 1 ca vá»‡ sinh thÃ nh checklist cÃ¡ nhÃ¢n: chuáº©n bá»‹ dá»¥ng cá»¥, khoanh vÃ¹ng, vá»‡ sinh tá»«ng khu, kiá»ƒm mÃ¹i/váº¿t báº©n, thu gom rÃ¡c, nghiá»‡m thu vÃ  bÃ n giao.'
          : isDriverDelivery
          ? 'Biáº¿n 1 ca tÃ i xáº¿ thÃ nh checklist cÃ¡ nhÃ¢n: kiá»ƒm xe/giáº¥y tá», nháº­n chuyáº¿n/Ä‘Æ¡n, tá»‘i Æ°u tuyáº¿n, liÃªn há»‡ khÃ¡ch, hoÃ n thÃ nh chuyáº¿n/Ä‘Æ¡n, xá»­ lÃ½ phÃ¡t sinh, cáº­p nháº­t app vÃ  bÃ n giao cuá»‘i ca.'
          : 'Chá»n 1 Ä‘áº§u viá»‡c tháº­t hoáº·c bÃ i test máº«u cá»§a role má»¥c tiÃªu, rá»“i viáº¿t checklist: bÆ°á»›c 1 lÃ m gÃ¬, bÆ°á»›c 2 kiá»ƒm gÃ¬, lá»—i nÃ o cáº§n trÃ¡nh, khi nÃ o Ä‘Æ°á»£c xem lÃ  Ä‘áº¡t.',
        `LÃ m 1 bÃ i thá»±c hÃ nh nhá» liÃªn quan trá»±c tiáº¿p tá»›i ${jobTitle}, khÃ´ng há»c lan man.`,
        'Nhá» 1 ngÆ°á»i cÃ³ kinh nghiá»‡m review checklist vÃ  ghi láº¡i 3 Ä‘iá»ƒm cáº§n sá»­a.',
      ],
    },
    {
      focus: isPerformer ? 'Táº¡o showreel vÃ  bá»™ há»“ sÆ¡ MC cÃ³ thá»ƒ gá»­i khÃ¡ch' : isChef ? 'Táº¡o há»“ sÆ¡ báº¿p cÃ³ recipe card, cost vÃ  SOP' : isPilot ? 'Táº¡o há»“ sÆ¡ pilot cÃ³ logbook, recurrent/simulator check, SOP safety record vÃ  CRM/ATC feedback' : isAviation ? 'Táº¡o há»“ sÆ¡ cabin crew cÃ³ feedback vÃ  tÃ¬nh huá»‘ng phá»¥c vá»¥ tháº­t' : isSchoolHealthcare ? 'Táº¡o há»“ sÆ¡ y táº¿ há»c Ä‘Æ°á»ng cÃ³ checklist sÆ¡ cá»©u, log sá»± cá»‘ vÃ  há»“ sÆ¡ sá»©c khá»e' : isEducationAdmissions ? (isStudyAbroadAdmissions ? 'Táº¡o há»“ sÆ¡ tÆ° váº¥n du há»c cÃ³ funnel, checklist há»“ sÆ¡ vÃ  outcome' : 'Táº¡o há»“ sÆ¡ tÆ° váº¥n tuyá»ƒn sinh cÃ³ funnel, follow-up vÃ  conversion nháº­p há»c') : isRestaurantManager ? 'Táº¡o há»“ sÆ¡ quáº£n lÃ½ nhÃ  hÃ ng cÃ³ KPI ca, chi phÃ­, service vÃ  complaint recovery' : isRestaurantFrontline ? 'Táº¡o há»“ sÆ¡ phá»¥c vá»¥/thu ngÃ¢n nhÃ  hÃ ng cÃ³ log ca, POS/order accuracy vÃ  feedback' : isHotelManager ? 'Táº¡o há»“ sÆ¡ quáº£n lÃ½ khÃ¡ch sáº¡n cÃ³ operating dashboard, review score vÃ  SLA' : isHotelFrontline ? 'Táº¡o há»“ sÆ¡ lá»… tÃ¢n/front desk cÃ³ PMS accuracy, request SLA vÃ  complaint recovery' : isDental ? 'Táº¡o há»“ sÆ¡ nha sÄ© cÃ³ case Ä‘iá»u trá»‹ áº©n danh, treatment plan vÃ  feedback bá»‡nh nhÃ¢n' : isDentalAssistant ? 'Táº¡o há»“ sÆ¡ trá»£ lÃ½ nha khoa cÃ³ checklist gháº¿, vÃ´ khuáº©n vÃ  feedback bÃ¡c sÄ©' : isHospitality ? 'Táº¡o há»“ sÆ¡ housekeeping cÃ³ checklist phÃ²ng, tá»‘c Ä‘á»™, rework vÃ  feedback' : isCleaning ? 'Táº¡o há»“ sÆ¡ vá»‡ sinh cÃ³ checklist khu vá»±c, áº£nh before-after, rework vÃ  feedback' : isDriverDelivery ? 'Táº¡o há»“ sÆ¡ tÃ i xáº¿/giao nháº­n cÃ³ log chuyáº¿n, rating, an toÃ n vÃ  case phÃ¡t sinh' : isInsurance ? 'Tao ho so bao hiem phi nhan tho co underwriting, claims/boi thuong, renewal va policy wording' : isHrPivot ? 'Táº¡o mini portfolio chuyá»ƒn hÆ°á»›ng HR' : 'Táº¡o sáº£n pháº©m máº«u cÃ³ thá»ƒ Ä‘Æ°a vÃ o portfolio',
      milestone: isPerformer ? 'CÃ³ 1 showreel 60-90 giÃ¢y, 3 máº«u lá»i dáº«n vÃ  1 rate card theo format sá»± kiá»‡n.' : isChef ? 'CÃ³ 3 recipe card cÃ³ cost, 1 waste log, 1 checklist SOP báº¿p vÃ  áº£nh plating trÆ°á»›c/sau.' : isPilot ? 'CÃ³ 1 logbook/flight hours summary, 1 recurrent/simulator check record náº¿u Ä‘Æ°á»£c phÃ©p, 1 SOP safety note, 1 CRM/ATC feedback vÃ  1 route-aircraft readiness note.' : isAviation ? 'CÃ³ checklist safety-service, 2 feedback senior crew/Ä‘á»“ng nghiá»‡p, 1 báº£n ghi announcement vÃ  3 tÃ¬nh huá»‘ng service recovery Ä‘Ã£ che thÃ´ng tin khÃ¡ch.' : isSchoolHealthcare ? 'CÃ³ 1 checklist sÆ¡ cá»©u, 1 log sá»± cá»‘/chuyá»ƒn tuyáº¿n, 1 báº£ng theo dÃµi thuá»‘c/dá»‹ á»©ng vÃ  1 feedback tá»« nhÃ  trÆ°á»ng hoáº·c phá»¥ huynh.' : isEducationAdmissions ? (isStudyAbroadAdmissions ? 'CÃ³ 1 tracker 20 lead/há»“ sÆ¡, 1 checklist giáº¥y tá»/visa, 1 máº«u follow-up CRM, 1 case tÆ° váº¥n khÃ³ vÃ  báº£ng KPI offer/visa/enrollment.' : 'CÃ³ 1 tracker 20 lead, 1 checklist tÆ° váº¥n chÆ°Æ¡ng trÃ¬nh há»c, 1 máº«u follow-up CRM, 1 case xá»­ lÃ½ objection vÃ  báº£ng KPI lá»‹ch tÆ° váº¥n/Ä‘Äƒng kÃ½/Ä‘Ã³ng phÃ­/nháº­p há»c.') : isRestaurantManager ? 'CÃ³ 1 dashboard ca/thÃ¡ng vá» doanh thu, labor/food cost, table turn, complaint recovery vÃ  feedback owner/GM.' : isRestaurantFrontline ? 'CÃ³ 1 log 10 bill/bÃ n vá» order Ä‘Ãºng, bill lá»—i, upsell/request, complaint vÃ  feedback quáº£n lÃ½ ca.' : isHotelManager ? 'CÃ³ 1 operating dashboard vá» occupancy, ADR/RevPAR, review score, staffing, complaint SLA vÃ  action log.' : isHotelFrontline ? 'CÃ³ 1 log 10 check-in/request vá» PMS accuracy, request SLA, upsell, complaint vÃ  handover.' : isDental ? 'CÃ³ 3 case nha khoa áº©n danh gá»“m cháº©n Ä‘oÃ¡n, treatment plan, vÃ´ khuáº©n, tÃ¡i khÃ¡m vÃ  feedback.' : isDentalAssistant ? 'CÃ³ 1 checklist 10 ca trá»£ lÃ½ nha khoa gá»“m gháº¿/dá»¥ng cá»¥, vÃ´ khuáº©n, suction/chuyá»ƒn dá»¥ng cá»¥, hÆ°á»›ng dáº«n vÃ  feedback bÃ¡c sÄ©.' : isHospitality ? 'CÃ³ 1 checklist phÃ²ng/area, áº£nh before-after Ä‘Ã£ che thÃ´ng tin khÃ¡ch, log thá»i gian dá»n phÃ²ng, lá»—i/rework vÃ  feedback giÃ¡m sÃ¡t.' : isCleaning ? 'CÃ³ 1 checklist khu vá»±c, áº£nh before-after, log hÃ³a cháº¥t/dá»¥ng cá»¥, lá»—i/rework hoáº·c complaint vÃ  feedback giÃ¡m sÃ¡t.' : isDriverDelivery ? 'CÃ³ 1 checklist ca tÃ i xáº¿, log 20 chuyáº¿n/Ä‘Æ¡n, tá»· lá»‡ Ä‘Ãºng giá», rating/feedback, checklist an toÃ n xe/giáº¥y tá» vÃ  3 case xá»­ lÃ½ phÃ¡t sinh.' : isInsurance ? 'Co 3 case bao hiem phi nhan tho an thong tin gom underwriting risk, policy wording/coverage, claims/boi thuong hoac renewal outcome va KPI SLA/loss ratio neu co.' : isHrPivot ? 'CÃ³ 1 mini case HR, 1 báº£ng chá»n nhÃ¡nh nghá», 1 CV sá»­a theo nhÃ¡nh Ä‘Ã£ chá»n vÃ  3 insight tá»« ngÆ°á»i trong nghá».' : 'CÃ³ 1 báº±ng chá»©ng nhÃ¬n tháº¥y Ä‘Æ°á»£c: tÃ i liá»‡u, video, dashboard, quy trÃ¬nh, bÃ i máº«u hoáº·c case study.',
      tasks: [
        isFresh
          ? 'LÃ m 1 mini project 2-3 giá» theo role má»¥c tiÃªu: vÃ­ dá»¥ 1 bÃ i content, 1 file Excel phÃ¢n tÃ­ch, 1 ká»‹ch báº£n tÆ° váº¥n khÃ¡ch hoáº·c 1 checklist váº­n hÃ nh vÄƒn phÃ²ng.'
          : isHrPivot
          ? 'LÃ m 1 mini case HR trong 2-3 giá»: phÃ¢n tÃ­ch 1 JD tuyá»ƒn dá»¥ng, thiáº¿t káº¿ 5 cÃ¢u há»i phá»ng váº¥n, hoáº·c lÃ m 1 outline onboarding/training cho nhÃ¢n viÃªn má»›i.'
          : isPerformer
          ? 'Cáº¯t 1 video showreel 60-90 giÃ¢y gá»“m: má»Ÿ mÃ n, chuyá»ƒn Ä‘oáº¡n, tÆ°Æ¡ng tÃ¡c khÃ¡n giáº£ vÃ  xá»­ lÃ½ tÃ¬nh huá»‘ng.'
          : isChef
          ? 'LÃ m 3 recipe card cho mÃ³n chá»§ lá»±c: Ä‘á»‹nh lÆ°á»£ng, cost nguyÃªn liá»‡u, thá»i gian chuáº©n bá»‹, tiÃªu chuáº©n plating vÃ  lá»—i cáº§n trÃ¡nh.'
          : isPilot
          ? 'Lam 1 flight deck evidence note: logbook/flight hours, type rating/recurrent status, simulator check, SOP safety record, route-aircraft qualification va feedback can xin them.'
          : isAviation
          ? 'LÃ m 1 checklist safety-service cho ca bay: trÆ°á»›c chuyáº¿n, lÃºc boarding, phá»¥c vá»¥, xá»­ lÃ½ yÃªu cáº§u Ä‘áº·c biá»‡t, complaint vÃ  debrief.'
          : isSchoolHealthcare
          ? 'LÃ m 1 checklist trá»±c phÃ²ng y táº¿ há»c Ä‘Æ°á»ng: tiáº¿p nháº­n ca, sÆ¡ cá»©u ban Ä‘áº§u, gá»i phá»¥ huynh, chuyá»ƒn tuyáº¿n, ghi log vÃ  bÃ n giao cho giÃ¡o viÃªn/ban giÃ¡m hiá»‡u.'
          : isEducationAdmissions
          ? isStudyAbroadAdmissions
            ? 'LÃ m 1 checklist há»“ sÆ¡ du há»c: thÃ´ng tin á»©ng viÃªn, Ä‘iá»u kiá»‡n Ä‘áº§u vÃ o, ngÃ¢n sÃ¡ch, shortlist trÆ°á»ng-ngÃ nh, giáº¥y tá» cáº§n cÃ³, deadline, rá»§i ro visa vÃ  next step.'
            : 'LÃ m 1 checklist tÆ° váº¥n tuyá»ƒn sinh: nguá»“n lead, nhu cáº§u há»c, chÆ°Æ¡ng trÃ¬nh/lá»›p/ngÃ nh phÃ¹ há»£p, há»c phÃ­, Æ°u Ä‘Ã£i náº¿u cÃ³, lá»‹ch tÆ° váº¥n/placement test, tráº¡ng thÃ¡i Ä‘Äƒng kÃ½-Ä‘Ã³ng phÃ­-nháº­p há»c vÃ  next step.'
          : isHospitality
          ? 'LÃ m 1 room/area SOP cho ca housekeeping: nháº­n phÃ²ng, dá»n phÃ²ng, kiá»ƒm amenities, bÃ¡o maintenance, xá»­ lÃ½ lost & found, bÃ n giao vÃ  tiÃªu chÃ­ Ä‘áº¡t.'
          : isCleaning
          ? 'LÃ m 1 checklist vá»‡ sinh khu vá»±c: chuáº©n sáº¡ch, dá»¥ng cá»¥/hÃ³a cháº¥t, thá»© tá»± thao tÃ¡c, Ä‘iá»ƒm kiá»ƒm tra cuá»‘i ca, lá»—i cáº§n trÃ¡nh vÃ  tiÃªu chÃ­ nghiá»‡m thu.'
          : isDriverDelivery
          ? 'LÃ m 1 checklist ca tÃ i xáº¿: kiá»ƒm xe/giáº¥y tá», nháº­n chuyáº¿n/Ä‘Æ¡n, tá»‘i Æ°u tuyáº¿n, liÃªn há»‡ khÃ¡ch, cáº­p nháº­t app, xá»­ lÃ½ phÃ¡t sinh vÃ  bÃ n giao cuá»‘i ca.'
          : isPublicSubjectTeacher
          ? 'Thiáº¿t káº¿ 1 giÃ¡o Ã¡n/bÃ i kiá»ƒm tra ngáº¯n Ä‘Ãºng bá»™ mÃ´n Ä‘ang dáº¡y, cÃ³ má»¥c tiÃªu bÃ i há»c, ma tráº­n cÃ¢u há»i, rubric cháº¥m vÃ  cÃ¡ch phÃ¢n nhÃ³m há»c sinh cáº§n phá»¥ Ä‘áº¡o.'
          : isInsurance
          ? 'Dong goi 1 case bao hiem phi nhan tho an thong tin: loai nghiep vu, rui ro, dieu khoan coverage/loai tru, premium/claim/renewal outcome, SLA va bai hoc.'
          : isTeacher
          ? 'Thiáº¿t káº¿ outline 1 buá»•i há»c/mini course 30-45 phÃºt cho ngÆ°á»i Ä‘i lÃ m, cÃ³ má»¥c tiÃªu há»c, bÃ i táº­p vÃ  tiÃªu chÃ­ Ä‘Ã¡nh giÃ¡.'
          : `Táº¡o 1 báº±ng chá»©ng nghá» gáº¯n vá»›i ${rolePath}: tÃ i liá»‡u, bÃ i máº«u, báº£ng theo dÃµi, ká»‹ch báº£n xá»­ lÃ½ tÃ¬nh huá»‘ng hoáº·c demo nhá».`,
        isPerformer
          ? 'Viáº¿t 3 máº«u lá»i dáº«n: khai máº¡c, chuyá»ƒn tiáº¿t má»¥c/khÃ¡ch má»i vÃ  cá»©u timeline khi chÆ°Æ¡ng trÃ¬nh bá»‹ trá»….'
          : isHrPivot
          ? 'Viáº¿t 1 trang â€œvÃ¬ sao tÃ´i há»£p nhÃ¡nh nÃ yâ€: ká»¹ nÄƒng cÅ© chuyá»ƒn sang Ä‘Æ°á»£c gÃ¬, cÃ²n thiáº¿u gÃ¬, 14 ngÃ y tá»›i kiá»ƒm chá»©ng báº±ng bÃ i test nÃ o.'
          : isChef
          ? 'Ghi waste log trong 3 ca: nguyÃªn liá»‡u hao há»¥t, lÃ½ do há»ng/thiáº¿u, cÃ¡ch giáº£m hao há»¥t ca sau.'
          : isAviation
          ? 'Ghi 3 tÃ¬nh huá»‘ng phá»¥c vá»¥ Ä‘Ã£ gáº·p hoáº·c mÃ´ phá»ng: chuyá»‡n xáº£y ra, cÃ¡ch báº¡n pháº£n há»“i, quy trÃ¬nh Ä‘Ã£ theo vÃ  Ä‘iá»u cáº§n cáº£i thiá»‡n.'
          : isDriverDelivery
          ? 'Ghi 3 tÃ¬nh huá»‘ng giao hÃ ng Ä‘Ã£ gáº·p hoáº·c mÃ´ phá»ng: sai Ä‘á»‹a chá»‰, khÃ¡ch khÃ´ng nghe mÃ¡y, giao trá»…, hÃ ng lá»—i/hoÃ n; ghi cÃ¡ch xá»­ lÃ½ vÃ  káº¿t quáº£.'
          : 'Ghi láº¡i phiÃªn báº£n trÆ°á»›c/sau Ä‘á»ƒ chá»©ng minh báº±ng chá»©ng nÃ y giÃºp tiáº¿t kiá»‡m thá»i gian, giáº£m lá»—i hoáº·c tÄƒng cháº¥t lÆ°á»£ng.',
        isPerformer
          ? 'LÃ m rate card theo 3 táº§ng: event nhá», corporate/wedding premium, livestream/activation; ghi rÃµ bao gá»“m rehearsal hay khÃ´ng.'
          : isHrPivot
          ? 'Xin 1 feedback tá»« ngÆ°á»i lÃ m HR vá» mini case, há»i tháº³ng: náº¿u tuyá»ƒn entry/junior nhÃ¡nh nÃ y thÃ¬ bÃ i nÃ y thiáº¿u gÃ¬.'
          : isChef
          ? 'Táº¡o checklist SOP cho 1 ca Ä‘Ã´ng khÃ¡ch: prep, line setup, ra mÃ³n, kiá»ƒm plating, vá»‡ sinh vÃ  bÃ n giao.'
          : isAviation
          ? 'Xin 2 feedback ngáº¯n tá»« senior crew/Ä‘á»“ng nghiá»‡p vá»: grooming, teamwork, xá»­ lÃ½ khÃ¡ch vÃ  má»©c sáºµn sÃ ng cho tuyáº¿n/role khÃ³ hÆ¡n.'
          : isDriverDelivery
          ? 'Xin 1 feedback ngáº¯n tá»« Ä‘iá»u phá»‘i/quáº£n lÃ½ hoáº·c khÃ¡ch quen vá» Ä‘Ãºng giá», thÃ¡i Ä‘á»™ phá»¥c vá»¥, xá»­ lÃ½ phÃ¡t sinh vÃ  má»©c Ä‘á»™ tin cáº­y.'
          : 'ÄÆ°a báº±ng chá»©ng nghá» cho 1 quáº£n lÃ½/Ä‘á»“ng nghiá»‡p/khÃ¡ch hÃ ng xem vÃ  xin nháº­n xÃ©t cá»¥ thá»ƒ.',
        `LÆ°u ${roleLanguage.proofAsset} vÃ o ${roleLanguage.portfolioWord} kÃ¨m ngÃ y táº¡o, link, áº£nh chá»¥p vÃ  ngÆ°á»i xÃ¡c nháº­n.`,
      ],
    },
    {
      focus: 'Cháº¡y thá»­ vá»›i ngÆ°á»i tháº­t Ä‘á»ƒ láº¥y feedback',
      milestone: 'CÃ³ feedback tháº­t tá»« Ã­t nháº¥t 2 ngÆ°á»i vÃ  1 phiÃªn báº£n Ä‘Ã£ sá»­a sau feedback.',
      tasks: [
        isPublicSubjectTeacher
          ? 'Dáº¡y thá»­ hoáº·c nhá» tá»• chuyÃªn mÃ´n/Ä‘á»“ng nghiá»‡p gÃ³p Ã½ 1 pháº§n bÃ i 10-15 phÃºt, ghi láº¡i 2 Ä‘iá»ƒm máº¡nh vÃ  1 Ä‘iá»ƒm cáº§n sá»­a cho tiáº¿t sau.'
          : isTeacher
          ? 'Dáº¡y thá»­/quay thá»­ 1 pháº§n bÃ i há»c 10-15 phÃºt, gá»­i cho 2 há»c viÃªn/ngÆ°á»i Ä‘i lÃ m xem.'
          : isSchoolHealthcare
            ? 'Nho 1 nhan vien y te senior, dieu duong hoac quan ly truong review checklist so cuu, log thuoc/di ung va quy trinh goi phu huynh/chuyen tuyen.'
          : isPerformer
            ? 'Gá»­i showreel vÃ  1 máº«u lá»i dáº«n cho 2 MC/producer/agency quen biáº¿t, xin nháº­n xÃ©t tháº­t vá» giá»ng, nÄƒng lÆ°á»£ng vÃ  Ä‘á»™ chuyÃªn nghiá»‡p.'
            : isChef
            ? 'Nhá» báº¿p trÆ°á»Ÿng/ca trÆ°á»Ÿng hoáº·c 2 Ä‘á»“ng nghiá»‡p náº¿m/soÃ¡t 3 mÃ³n theo checklist plating, vá»‹, nhiá»‡t Ä‘á»™ vÃ  tá»‘c Ä‘á»™ ra mÃ³n.'
            : isAviation
            ? 'Nhá» senior crew/Ä‘á»“ng nghiá»‡p review checklist safety-service, báº£n ghi announcement vÃ  1 tÃ¬nh huá»‘ng service recovery; xin nháº­n xÃ©t tháº­t, khÃ´ng cáº§n sá»‘ liá»‡u ná»™i bá»™.'
            : isDriverDelivery
            ? 'Nhá» Ä‘iá»u phá»‘i/quáº£n lÃ½/Ä‘á»“ng nghiá»‡p review checklist ca tÃ i xáº¿, log chuyáº¿n/Ä‘Æ¡n vÃ  1 case xá»­ lÃ½ phÃ¡t sinh; xin nháº­n xÃ©t tháº­t vá» Ä‘Ãºng giá», an toÃ n vÃ  thÃ¡i Ä‘á»™.'
            : 'Cho 2 ngÆ°á»i dÃ¹ng thá»­ báº±ng chá»©ng nghá» hoáº·c Ã¡p dá»¥ng vÃ o 1 viá»‡c tháº­t trong tuáº§n.',
        'Há»i feedback theo 3 cÃ¢u: dá»… hiá»ƒu khÃ´ng, pháº§n nÃ o há»¯u Ã­ch nháº¥t, pháº§n nÃ o cáº§n sá»­a Ä‘á»ƒ dÃ¹ng tháº­t.',
        'Sá»­a báº±ng chá»©ng nghá» dá»±a trÃªn feedback, ghi rÃµ trÆ°á»›c/sau Ä‘Ã£ thay Ä‘á»•i gÃ¬.',
        'Xin 1 quote ngáº¯n cÃ³ thá»ƒ dÃ¹ng trong CV/LinkedIn hoáº·c buá»•i deal lÆ°Æ¡ng.',
      ],
    },
    {
      focus: 'Äo impact báº±ng KPI',
      milestone: 'CÃ³ Ã­t nháº¥t 1 chá»‰ sá»‘ trÆ°á»›c/sau Ä‘á»§ dÃ¹ng Ä‘á»ƒ nÃ³i chuyá»‡n tÄƒng lÆ°Æ¡ng.',
      tasks: [
        isPerformer
          ? `Chá»n 1 KPI sÃ¡t nghá» MC trong tuáº§n nÃ y. ${kpiGuidance}`
          : isFresh
          ? `Chá»n 1 KPI ráº¥t dá»… Ä‘o cho role má»¥c tiÃªu Ä‘áº§u tiÃªn. ${kpiGuidance}`
          : isHrPivot
          ? `Chá»n 1 KPI kiá»ƒm chá»©ng nhÃ¡nh HR Ä‘ang thá»­. ${kpiGuidance}`
          : isAviation
          ? 'Chá»n 1 tiÃªu chÃ­ dá»… theo dÃµi tuáº§n nÃ y: checklist safety-service hoÃ n thÃ nh, 1 feedback tá»‘t tá»« senior crew, 1 tÃ¬nh huá»‘ng khÃ¡ch khÃ³ xá»­ lÃ½ Ãªm hoáº·c announcement tiáº¿ng Anh luyá»‡n 5 láº§n cÃ³ ghi Ã¢m.'
          : isEnglishTeacher
          ? 'Láº­p báº£ng KPI lá»›p tiáº¿ng Anh tuáº§n nÃ y gá»“m 6 cá»™t: attendance, homework completion, pre-test, post-test/mock test, Speaking/Writing rubric vÃ  feedback/retention.'
          : isSchoolHealthcare
          ? 'Lap bang KPI y te hoc duong gom 6 cot: thoi gian phan ung su co, ho so suc khoe cap nhat, so ca so cuu, so ca chuyen tuyen, theo doi thuoc/di ung va feedback nha truong-phu huynh.'
          : isDriverDelivery
          ? 'Láº­p báº£ng KPI tÃ i xáº¿ tuáº§n nÃ y gá»“m 6 cá»™t: sá»‘ chuyáº¿n/Ä‘Æ¡n, Ä‘Ãºng giá», há»§y/hoÃ n, rating/feedback, sá»± cá»‘ phÃ¡t sinh vÃ  chi phÃ­ nhiÃªn liá»‡u/thá»i gian tuyáº¿n.'
          : `Chá»n 1 KPI sÃ¡t vá»›i ${intake.currentPosition || jobTitle}. ${kpiGuidance}`,
        isAviation
          ? 'Ghi má»‘c ná»n báº±ng báº±ng chá»©ng cÃ¡ nhÃ¢n há»£p lá»‡: checklist tá»± Ä‘Ã¡nh giÃ¡, nháº­n xÃ©t senior crew/Ä‘á»“ng nghiá»‡p, chá»©ng chá»‰ training hoáº·c ghi chÃº tÃ¬nh huá»‘ng Ä‘Ã£ che thÃ´ng tin khÃ¡ch.'
          : isEnglishTeacher
          ? 'Ghi má»‘c ná»n cho 1 lá»›p hoáº·c 3-5 há»c viÃªn: Ä‘iá»ƒm hiá»‡n táº¡i, bÃ i táº­p Ä‘Ã£ ná»™p, sá»‘ buá»•i Ä‘i há»c, lá»—i Speaking/Writing hay gáº·p vÃ  pháº£n há»“i gáº§n nháº¥t.'
          : isDriverDelivery
          ? 'Ghi má»‘c ná»n trong 3-5 ca gáº§n nháº¥t: sá»‘ Ä‘Æ¡n/chuyáº¿n, tá»· lá»‡ Ä‘Ãºng giá», Ä‘Æ¡n hoÃ n/há»§y, rating, phÃ¡t sinh vÃ  chi phÃ­ nhiÃªn liá»‡u/thá»i gian tuyáº¿n.'
          : 'Ghi láº¡i má»‘c hiá»‡n táº¡i trong 3-5 ngÃ y hoáº·c láº¥y sá»‘ liá»‡u gáº§n nháº¥t Ä‘ang cÃ³.',
        isPerformer
          ? 'Ãp dá»¥ng checklist briefing/rehearsal vÃ o 1 show tháº­t hoáº·c buá»•i táº­p, ghi láº¡i Ä‘iá»ƒm nÃ o giÃºp chÆ°Æ¡ng trÃ¬nh mÆ°á»£t hÆ¡n.'
          : isChef
          ? 'Ãp dá»¥ng recipe card vÃ  SOP vÃ o 1 ca tháº­t, ghi láº¡i food cost, waste, thá»i gian ra mÃ³n vÃ  pháº£n há»“i khÃ¡ch/báº¿p trÆ°á»Ÿng.'
          : isAviation
          ? 'Ãp dá»¥ng checklist trong 1 ca/chuyáº¿n bay hoáº·c buá»•i mÃ´ phá»ng; ghi Ä‘iá»ƒm lÃ m tá»‘t, Ä‘iá»ƒm cáº§n sá»­a vÃ  feedback tá»« senior crew/Ä‘á»“ng nghiá»‡p.'
          : isEnglishTeacher
          ? 'Dáº¡y hoáº·c soáº¡n láº¡i 1 buá»•i há»c theo KPI Ä‘Ã£ chá»n; ghi rÃµ hoáº¡t Ä‘á»™ng nÃ o nháº±m tÄƒng Ä‘iá»ƒm post-test, giáº£m lá»—i Speaking/Writing hoáº·c tÄƒng homework completion.'
          : isHrPivot
          ? 'DÃ¹ng mini case Ä‘á»ƒ gá»­i há»i 2 ngÆ°á»i trong nghá» hoáº·c 2 nhÃ  tuyá»ƒn dá»¥ng, ghi láº¡i pháº£n há»“i tháº­t vÃ  Ä‘iá»u cáº§n sá»­a.'
          : isDriverDelivery
          ? 'Ãp dá»¥ng checklist tÃ i xáº¿ trong 1 ca tháº­t, ghi láº¡i chuyáº¿n/Ä‘Æ¡n Ä‘Ãºng giá», phÃ¡t sinh Ä‘Ã£ xá»­ lÃ½, rating/feedback vÃ  Ä‘iá»ƒm cáº§n cáº£i thiá»‡n.'
          : 'Ãp dá»¥ng báº±ng chá»©ng nghá» vÃ o cÃ´ng viá»‡c tháº­t vÃ  ghi káº¿t quáº£ sau khi Ã¡p dá»¥ng.',
        'Viáº¿t 1 dÃ²ng káº¿t luáº­n: tÃ´i táº¡o ra thay Ä‘á»•i gÃ¬, báº±ng sá»‘ nÃ o, trong bao lÃ¢u.',
      ],
    },
    {
      focus: 'ÄÃ³ng gÃ³i thÃ nh case study 1 trang',
      milestone: 'CÃ³ 1 case study ngáº¯n Ä‘á»§ Ä‘á»ƒ gá»­i cho sáº¿p/nhÃ  tuyá»ƒn dá»¥ng/khÃ¡ch hÃ ng.',
      tasks: [
        isPerformer
          ? 'Viáº¿t case theo format: Bá»‘i cáº£nh sá»± kiá»‡n - Rá»§i ro sÃ¢n kháº¥u - CÃ¡ch xá»­ lÃ½ - Feedback khÃ¡ch hÃ ng.'
          : isChef
          ? 'Viáº¿t case theo format: MÃ³n/ca báº¿p - Váº¥n Ä‘á» cost/tá»‘c Ä‘á»™/cháº¥t lÆ°á»£ng - CÃ¡ch xá»­ lÃ½ - Káº¿t quáº£ báº±ng sá»‘.'
          : isAviation
          ? 'Viáº¿t case theo format: Bá»‘i cáº£nh chuyáº¿n bay - TÃ¬nh huá»‘ng khÃ¡ch/cabin - CÃ¡ch xá»­ lÃ½ theo quy trÃ¬nh - Feedback hoáº·c bÃ i há»c rÃºt ra.'
          : isDriverDelivery
          ? 'Viáº¿t case theo format: Bá»‘i cáº£nh chuyáº¿n/Ä‘Æ¡n - Sá»± cá»‘ trong ca - CÃ¡ch xá»­ lÃ½ - Káº¿t quáº£ báº±ng sá»‘ hoáº·c feedback.'
          : isHrPivot
          ? 'Viáº¿t case theo format: NhÃ¡nh HR muá»‘n thá»­ - JD Ä‘Ã£ Ä‘á»c - BÃ i test/mini case Ä‘Ã£ lÃ m - Feedback nháº­n Ä‘Æ°á»£c - Quyáº¿t Ä‘á»‹nh Ä‘i tiáº¿p hay Ä‘á»•i nhÃ¡nh.'
          : 'Viáº¿t case theo format: Váº¥n Ä‘á» - HÃ nh Ä‘á»™ng - Káº¿t quáº£ - Báº±ng chá»©ng.',
        'ThÃªm 2 áº£nh/link minh chá»©ng vÃ o case study, trÃ¡nh viáº¿t cáº£m tÃ­nh.',
        isPerformer
          ? 'Äá»•i káº¿t quáº£ thÃ nh ngÃ´n ngá»¯ khÃ¡ch hÃ ng hiá»ƒu: chÆ°Æ¡ng trÃ¬nh Ä‘Ãºng giá», khÃ¡ch má»i tÆ°Æ¡ng tÃ¡c tá»‘t, brand tone Ä‘Ãºng, sá»± cá»‘ Ä‘Æ°á»£c xá»­ lÃ½ Ãªm.'
          : isChef
          ? 'Äá»•i káº¿t quáº£ thÃ nh ngÃ´n ngá»¯ quáº£n lÃ½ hiá»ƒu: giáº£m waste, giá»¯ cost, ra mÃ³n nhanh hÆ¡n, complaint giáº£m, mÃ³n Ä‘á»“ng Ä‘á»u hÆ¡n.'
          : isAviation
          ? 'Äá»•i káº¿t quáº£ thÃ nh ngÃ´n ngá»¯ hÃ£ng bay hiá»ƒu: an toÃ n Ä‘Ãºng quy trÃ¬nh, khÃ¡ch Ä‘Æ°á»£c tráº¥n an, complaint Ä‘Æ°á»£c xá»­ lÃ½ Ãªm, teamwork tá»‘t vÃ  khÃ´ng lá»™ dá»¯ liá»‡u hÃ nh khÃ¡ch.'
          : isDriverDelivery
          ? 'Äá»•i káº¿t quáº£ thÃ nh ngÃ´n ngá»¯ váº­n hÃ nh hiá»ƒu: Ä‘Ãºng giá» hÆ¡n, Ã­t hoÃ n/há»§y hÆ¡n, route gá»n hÆ¡n, khÃ¡ch hÃ i lÃ²ng hÆ¡n vÃ  Ã­t sá»± cá»‘ hÆ¡n.'
          : isHrPivot
          ? 'Äá»•i káº¿t quáº£ thÃ nh ngÃ´n ngá»¯ tuyá»ƒn dá»¥ng: tÃ´i hiá»ƒu role nÃ o, lÃ m Ä‘Æ°á»£c bÃ i test gÃ¬, nháº­n feedback gÃ¬ vÃ  cÃ²n thiáº¿u skill nÃ o trÆ°á»›c khi apply.'
          : 'Äá»•i káº¿t quáº£ thÃ nh ngÃ´n ngá»¯ kinh doanh: tiáº¿t kiá»‡m giá», giáº£m lá»—i, tÄƒng tá»· lá»‡ hoÃ n thÃ nh hoáº·c tÄƒng doanh thu.',
        'Nhá» 1 ngÆ°á»i Ä‘á»c case trong 2 phÃºt vÃ  nÃ³i láº¡i há» hiá»ƒu báº¡n táº¡o giÃ¡ trá»‹ gÃ¬ khÃ´ng.',
      ],
    },
    {
      focus: 'Sá»­a CV/LinkedIn Ä‘á»ƒ bÃ¡n Ä‘Ãºng giÃ¡ trá»‹',
      milestone: 'CÃ³ CV/LinkedIn má»›i vá»›i Ã­t nháº¥t 3 bullet cÃ³ sá»‘ liá»‡u.',
      tasks: [
        `Viáº¿t láº¡i headline theo role má»¥c tiÃªu: ${rolePath}.`,
        isPerformer
          ? 'Chuyá»ƒn case thÃ nh 3 dÃ²ng há»“ sÆ¡ MC: loáº¡i sá»± kiá»‡n + quy mÃ´ khÃ¡ch/brand + vai trÃ² báº¡n xá»­ lÃ½ + feedback/káº¿t quáº£.'
          : isChef
          ? 'Chuyá»ƒn case thÃ nh 3 dÃ²ng há»“ sÆ¡ báº¿p: mÃ³n/ca phá»¥ trÃ¡ch + sá»‘ suáº¥t/food cost/waste + káº¿t quáº£ cháº¥t lÆ°á»£ng hoáº·c tá»‘c Ä‘á»™.'
          : isAviation
          ? 'Chuyá»ƒn case thÃ nh 3 dÃ²ng há»“ sÆ¡ cabin crew: tÃ¬nh huá»‘ng phá»¥c vá»¥ + quy trÃ¬nh xá»­ lÃ½ + feedback/Ä‘iá»ƒm cáº£i thiá»‡n + chá»©ng chá»‰ hoáº·c checklist liÃªn quan.'
          : isDriverDelivery
          ? 'Chuyá»ƒn case thÃ nh 3 dÃ²ng há»“ sÆ¡ tÃ i xáº¿: tuyáº¿n/ca phá»¥ trÃ¡ch + sá»‘ chuyáº¿n/Ä‘Æ¡n + Ä‘Ãºng giá»/rating/sá»± cá»‘ xá»­ lÃ½ + káº¿t quáº£.'
          : isHrPivot
          ? 'Chuyá»ƒn mini case thÃ nh 3 bullet CV: phÃ¢n tÃ­ch JD/funnel/training/C&B gÃ¬, dÃ¹ng dá»¯ liá»‡u nÃ o, insight rÃºt ra vÃ  quyáº¿t Ä‘á»‹nh nghá» nghiá»‡p tiáº¿p theo.'
          : 'Chuyá»ƒn case study thÃ nh 3 bullet CV theo cÃ´ng thá»©c: lÃ m gÃ¬ + báº±ng cÃ´ng cá»¥/ká»¹ nÄƒng gÃ¬ + káº¿t quáº£ báº±ng sá»‘.',
        isPerformer
          ? 'ÄÄƒng 1 clip ngáº¯n hoáº·c háº­u trÆ°á»ng nghá» MC chia sáº» bÃ i há»c xá»­ lÃ½ sÃ¢n kháº¥u, khÃ´ng cáº§n khoe phÃ­ dáº«n.'
          : isChef
          ? 'LÆ°u áº£nh mÃ³n, recipe card vÃ  sá»‘ liá»‡u ca báº¿p thÃ nh 1 há»“ sÆ¡ nghá» cÃ³ thá»ƒ gá»­i nhÃ  hÃ ng/khÃ¡ch sáº¡n/chuá»—i.'
          : isAviation
          ? 'LÆ°u checklist, feedback vÃ  báº£n ghi announcement thÃ nh 1 há»“ sÆ¡ cabin crew cÃ³ thá»ƒ dÃ¹ng khi review ná»™i bá»™ hoáº·c á»©ng tuyá»ƒn tuyáº¿n/role tá»‘t hÆ¡n.'
          : isDriverDelivery
          ? 'LÆ°u log chuyáº¿n/Ä‘Æ¡n, checklist an toÃ n, rating/feedback vÃ  case phÃ¡t sinh thÃ nh 1 há»“ sÆ¡ tÃ i xáº¿ cÃ³ thá»ƒ gá»­i Ä‘á»™i xe/fleet/nhÃ  tuyá»ƒn dá»¥ng.'
          : isHrPivot
          ? 'Sá»­a CV/LinkedIn theo 1 nhÃ¡nh HR duy nháº¥t; bá» cÃ¢u chung chung â€œmuá»‘n Ä‘á»•i nghá»â€, thay báº±ng mini case vÃ  lÃ½ do chá»n nhÃ¡nh.'
          : 'ÄÄƒng 1 post LinkedIn/Zalo nghá» nghiá»‡p chia sáº» bÃ i há»c hoáº·c before/after, khÃ´ng cáº§n khoe lÆ°Æ¡ng.',
        'LÆ°u link post/CV vÃ o evidence log.',
      ],
    },
    {
      focus: 'Táº¡o danh sÃ¡ch cÆ¡ há»™i tráº£ cao hÆ¡n',
      milestone: 'CÃ³ 20 cÆ¡ há»™i/Ä‘áº§u má»‘i vÃ  5 tin nháº¯n/email tiáº¿p cáº­n Ä‘áº§u tiÃªn.',
      tasks: [
        `Lá»c 20 ${roleLanguage.opportunityList} cÃ³ kháº£ nÄƒng tráº£ gáº§n má»©c ${targetLabel}.`,
        'Chia danh sÃ¡ch thÃ nh 3 nhÃ³m: dá»… vÃ o, vá»«a sá»©c, stretch role.',
        isPerformer
          ? 'Viáº¿t 1 tin nháº¯n má»Ÿ Ä‘áº§u 5 dÃ²ng kÃ¨m showreel, rate card vÃ  1 case sá»± kiá»‡n liÃªn quan.'
          : isChef
          ? 'Viáº¿t 1 tin nháº¯n má»Ÿ Ä‘áº§u 5 dÃ²ng kÃ¨m há»“ sÆ¡ báº¿p: 3 mÃ³n chá»§ lá»±c, cost/waste, áº£nh plating vÃ  feedback/quáº£n lÃ½ xÃ¡c nháº­n.'
          : isAviation
          ? 'Viáº¿t 1 tin nháº¯n/há»“ sÆ¡ má»Ÿ Ä‘áº§u 5 dÃ²ng kÃ¨m checklist safety-service, feedback senior crew, chá»©ng chá»‰ training vÃ  1 case service recovery Ä‘Ã£ che thÃ´ng tin khÃ¡ch.'
          : isDriverDelivery
          ? 'Viáº¿t 1 tin nháº¯n má»Ÿ Ä‘áº§u 5 dÃ²ng kÃ¨m log chuyáº¿n/Ä‘Æ¡n, tá»· lá»‡ Ä‘Ãºng giá», rating/feedback vÃ  1 case xá»­ lÃ½ phÃ¡t sinh khi giao hÃ ng.'
          : isHrPivot
          ? 'Viáº¿t 1 tin nháº¯n 5 dÃ²ng gá»­i ngÆ°á»i lÃ m HR/nhÃ  tuyá»ƒn dá»¥ng: giá»›i thiá»‡u ná»n táº£ng hiá»‡n cÃ³, nhÃ¡nh muá»‘n thá»­, mini case Ä‘Ã£ lÃ m vÃ  cÃ¢u há»i xin feedback.'
          : 'Viáº¿t 1 tin nháº¯n má»Ÿ Ä‘áº§u 5 dÃ²ng kÃ¨m case study 1 trang.',
        'Gá»­i thá»­ cho 5 Ä‘áº§u má»‘i Ä‘áº§u tiÃªn vÃ  ghi pháº£n há»“i vÃ o tracker.',
      ],
    },
    {
      focus: 'Táº­p tráº£ lá»i phá»ng váº¥n/deal lÆ°Æ¡ng',
      milestone: 'CÃ³ script tráº£ lá»i lÆ°Æ¡ng vÃ  5 cÃ¢u tráº£ lá»i cho pháº£n biá»‡n khÃ³.',
      tasks: [
        `Soáº¡n cÃ¢u tráº£ lá»i khi bá»‹ há»i má»©c lÆ°Æ¡ng mong muá»‘n, dÃ¹ng má»‘c ${targetLabel} vÃ  báº±ng chá»©ng Ä‘Ã£ táº¡o.`,
        isPerformer
          ? 'Viáº¿t 5 pháº£n biá»‡n thÆ°á»ng gáº·p: ngÃ¢n sÃ¡ch tháº¥p, chá»‰ cáº§n MC Ä‘Æ¡n giáº£n, show ngáº¯n, chÆ°a cÃ³ clip nhiá»u, so vá»›i MC khÃ¡c.'
          : isChef
          ? 'Viáº¿t 5 pháº£n biá»‡n thÆ°á»ng gáº·p: chÆ°a Ä‘á»§ kinh nghiá»‡m, cost mÃ³n cao, ca Ä‘Ã´ng dá»… lá»—i, chÆ°a dáº«n ca, so vá»›i báº¿p khÃ¡c.'
          : isAviation
          ? 'Viáº¿t 5 pháº£n biá»‡n thÆ°á»ng gáº·p: chÆ°a Ä‘á»§ tuyáº¿n khÃ³, tiáº¿ng Anh chÆ°a Ä‘á»§ tá»± tin, chÆ°a cÃ³ feedback senior, chÆ°a cÃ³ case xá»­ lÃ½ khÃ¡ch, so vá»›i cabin crew nhiá»u thÃ¢m niÃªn hÆ¡n.'
          : isDriverDelivery
          ? 'Viáº¿t 5 pháº£n biá»‡n thÆ°á»ng gáº·p: thu nháº­p phá»¥ thuá»™c Ä‘Æ¡n, chÆ°a Ä‘á»§ ca khÃ³, rating chÆ°a Ä‘á»u, hoÃ n/há»§y cÃ²n cao, so vá»›i tÃ i xáº¿ nhiá»u kinh nghiá»‡m hÆ¡n.'
          : 'Viáº¿t 5 pháº£n biá»‡n thÆ°á»ng gáº·p: ngÃ¢n sÃ¡ch tháº¥p, chÆ°a Ä‘á»§ kinh nghiá»‡m, cáº§n thá»­ viá»‡c, so vá»›i máº·t báº±ng cÅ©, chá» review.',
        isPerformer ? 'Táº­p nÃ³i pitch bÃ¡o giÃ¡ thÃ nh tiáº¿ng 3 láº§n, má»—i láº§n dÆ°á»›i 60 giÃ¢y.' : isChef ? 'Táº­p trÃ¬nh bÃ y case food cost/waste/tá»‘c Ä‘á»™ ra mÃ³n trong 60 giÃ¢y cho báº¿p trÆ°á»Ÿng hoáº·c nhÃ  tuyá»ƒn dá»¥ng.' : isAviation ? 'Táº­p trÃ¬nh bÃ y 1 case service recovery trong 60 giÃ¢y: tÃ¬nh huá»‘ng, cÃ¡ch xá»­ lÃ½, quy trÃ¬nh Ä‘Ã£ theo vÃ  feedback nháº­n Ä‘Æ°á»£c.' : isDriverDelivery ? 'Táº­p trÃ¬nh bÃ y 1 case tÃ i xáº¿ trong 60 giÃ¢y: tuyáº¿n/chuyáº¿n/Ä‘Æ¡n, sá»± cá»‘, cÃ¡ch xá»­ lÃ½, káº¿t quáº£ Ä‘Ãºng giá»/rating vÃ  bÃ i há»c.' : 'Táº­p nÃ³i thÃ nh tiáº¿ng 3 láº§n, má»—i láº§n dÆ°á»›i 90 giÃ¢y.',
        'Ghi Ã¢m hoáº·c nhá» báº¡n pháº£n biá»‡n Ä‘á»ƒ chá»‰nh láº¡i cÃ¢u chá»¯ cho tá»± nhiÃªn.',
      ],
    },
    {
      focus: 'Cháº¡y vÃ²ng apply/Ä‘Ã m phÃ¡n Ä‘áº§u tiÃªn',
      milestone: 'CÃ³ Ã­t nháº¥t 5 lÆ°á»£t tiáº¿p cáº­n tháº­t vÃ  1 cuá»™c trao Ä‘á»•i lÆ°Æ¡ng hoáº·c scope cÃ´ng viá»‡c.',
      tasks: [
        'Gá»­i CV/case study tá»›i 5-10 cÆ¡ há»™i trong danh sÃ¡ch Ä‘Ã£ lá»c.',
        'Theo dÃµi pháº£n há»“i trong tracker: Ä‘Ã£ gá»­i, Ä‘Ã£ xem, pháº£n há»“i, bÆ°á»›c tiáº¿p theo.',
        isAviation
          ? `Náº¿u Ä‘ang á»Ÿ hÃ£ng/Ä‘Æ¡n vá»‹ hiá»‡n táº¡i, xin feedback 1-1 tá»« senior crew/purser/trainer vá» tiÃªu chÃ­ lÃªn má»©c ${targetLabel} hoáº·c tuyáº¿n/role khÃ³ hÆ¡n.`
          : isDriverDelivery
          ? `Náº¿u Ä‘ang á»Ÿ Ä‘á»™i xe/ná»n táº£ng hiá»‡n táº¡i, xin feedback 1-1 tá»« Ä‘iá»u phá»‘i/quáº£n lÃ½ vá» tiÃªu chÃ­ lÃªn má»©c ${targetLabel}, nháº­n tuyáº¿n/ca tá»‘t hÆ¡n hoáº·c lÃªn lead tÃ i xáº¿.`
          : `Náº¿u Ä‘ang á»Ÿ cÃ´ng ty hiá»‡n táº¡i, xin 1 buá»•i 1-1 Ä‘á»ƒ há»i tiÃªu chÃ­ lÃªn má»©c ${targetLabel}.`,
        'Cáº­p nháº­t evidence log vá»›i táº¥t cáº£ pháº£n há»“i tháº­t, ká»ƒ cáº£ bá»‹ tá»« chá»‘i.',
      ],
    },
    {
      focus: 'ÄÃ³ng gÃ³i Ä‘á» xuáº¥t tÄƒng lÆ°Æ¡ng',
      milestone: 'CÃ³ 1 gÃ³i Ä‘á» xuáº¥t gá»“m sá»‘ liá»‡u, case study, má»©c lÆ°Æ¡ng Ä‘á» xuáº¥t vÃ  phÆ°Æ¡ng Ã¡n thay tháº¿.',
      tasks: [
        isPerformer
          ? `Viáº¿t 1 trang bÃ¡o giÃ¡: format sá»± kiá»‡n, scope chuáº©n bá»‹, rehearsal, thá»i lÆ°á»£ng dáº«n, má»©c Ä‘á» xuáº¥t ${targetLabel} vÃ  Ä‘iá»u kiá»‡n phÃ¡t sinh.`
          : isChef
          ? `Viáº¿t 1 trang Ä‘á» xuáº¥t tÄƒng lÆ°Æ¡ng/apply: mÃ³n phá»¥ trÃ¡ch, food cost, waste rate, tá»‘c Ä‘á»™ ra mÃ³n, SOP Ä‘Ã£ chuáº©n hÃ³a vÃ  má»©c Ä‘á» xuáº¥t ${targetLabel}.`
          : isAviation
          ? `Viáº¿t 1 trang há»“ sÆ¡ review/apply: chuáº©n safety-service, feedback senior crew, announcement tiáº¿ng Anh, case xá»­ lÃ½ khÃ¡ch vÃ  má»©c má»¥c tiÃªu ${targetLabel}.`
          : `Viáº¿t 1 trang Ä‘á» xuáº¥t: hiá»‡n tráº¡ng, impact Ä‘Ã£ táº¡o, benchmark thá»‹ trÆ°á»ng, má»©c Ä‘á» xuáº¥t ${targetLabel}.`,
        isPerformer
          ? 'ThÃªm phÆ°Æ¡ng Ã¡n B: phÃ­ rehearsal riÃªng, gÃ³i script polish, phÃ­ di chuyá»ƒn, livestream package hoáº·c combo nhiá»u show.'
          : isChef
          ? 'ThÃªm phÆ°Æ¡ng Ã¡n B: nháº­n ca khÃ³ hÆ¡n, training phá»¥ báº¿p, phá»¥ trÃ¡ch cost mÃ³n, phá»¥ cáº¥p ca hoáº·c apply báº¿p chuá»—i/khÃ¡ch sáº¡n.'
          : isAviation
          ? 'ThÃªm phÆ°Æ¡ng Ã¡n B: xin tuyáº¿n/ca khÃ³ hÆ¡n, nháº­n mentor junior, há»c/thi chá»©ng chá»‰ liÃªn quan hoáº·c apply hÃ£ng/Ä‘Æ¡n vá»‹ dá»‹ch vá»¥ hÃ ng khÃ´ng tráº£ tá»‘t hÆ¡n.'
          : 'ThÃªm phÆ°Æ¡ng Ã¡n B: tÄƒng scope, bonus KPI, phá»¥ cáº¥p, lá»™ trÃ¬nh review 60 ngÃ y hoáº·c chuyá»ƒn role.',
        'Chá»n 3 báº±ng chá»©ng máº¡nh nháº¥t, bá» cÃ¡c báº±ng chá»©ng yáº¿u hoáº·c quÃ¡ dÃ i.',
        'Gá»­i cho 1 ngÆ°á»i tin cáº­y Ä‘á»c thá»­ vÃ  há»i: pháº§n nÃ o khiáº¿n há» tin nháº¥t?',
      ],
    },
    {
      focus: 'Review káº¿t quáº£ vÃ  chá»n bÆ°á»›c tiáº¿p theo',
      milestone: 'CÃ³ quyáº¿t Ä‘á»‹nh rÃµ: deal ná»™i bá»™, nháº£y viá»‡c, freelance/side income hoáº·c há»c tiáº¿p 1 skill.',
      tasks: [
        'Tá»•ng káº¿t 12 tuáº§n: task Ä‘Ã£ hoÃ n thÃ nh, KPI Ä‘áº¡t Ä‘Æ°á»£c, pháº£n há»“i nháº­n Ä‘Æ°á»£c, cÆ¡ há»™i má»Ÿ ra.',
        `So sÃ¡nh offer/cÆ¡ há»™i hiá»‡n cÃ³ vá»›i gap ${gapLabel}; chá»n hÆ°á»›ng cÃ³ xÃ¡c suáº¥t cao nháº¥t.`,
        'LÃªn lá»‹ch buá»•i deal lÆ°Æ¡ng hoáº·c vÃ²ng apply tiáº¿p theo trong 7 ngÃ y tá»›i.',
        'Viáº¿t 1 káº¿ hoáº¡ch 30 ngÃ y káº¿ tiáº¿p dá»±a trÃªn káº¿t quáº£ tháº­t, khÃ´ng dÃ¹ng checklist chung ná»¯a.',
      ],
    },
  ];

  return {
    format: 'weekly',
    goal: `TÄƒng lÆ°Æ¡ng tá»« ${(currentSalary / 1e6).toFixed(1)}M lÃªn ${(targetSalary / 1e6).toFixed(1)}M trong ${durationMonths} thÃ¡ng`,
    summary: `Lá»™ trÃ¬nh nÃ y Ä‘i theo chuá»—i: chá»n hÆ°á»›ng tráº£ cao hÆ¡n, há»c Ä‘Ãºng ká»¹ nÄƒng, táº¡o báº±ng chá»©ng tháº­t, Ä‘o KPI, Ä‘Ã³ng gÃ³i CV/LinkedIn vÃ  dÃ¹ng dá»¯ liá»‡u Ä‘á»ƒ deal lÆ°Æ¡ng.${intake.currentPosition ? ` Vá»‹ trÃ­ hiá»‡n táº¡i: ${intake.currentPosition}.` : ''}${intake.mainWeakness ? ` Äiá»ƒm cáº§n xá»­ lÃ½ trÆ°á»›c: ${intake.mainWeakness}.` : ''}${segmentNote}`,
    weeks: Array.from({ length: totalWeeks }, (_, index) => {
      const blueprint = blueprints[index % blueprints.length];
      const cycle = Math.floor(index / blueprints.length);
      return {
        week: index + 1,
        focus: cycle > 0 ? `${blueprint.focus} - vÃ²ng nÃ¢ng level ${cycle + 1}` : blueprint.focus,
        milestone: blueprint.milestone,
        tasks: blueprint.tasks,
      };
    }),
    negotiation_timing: `Tuáº§n ${Math.max(4, Math.round(totalWeeks * 0.75))} lÃ  thá»i Ä‘iá»ƒm tá»‘t nháº¥t Ä‘á»ƒ Ä‘Ã m phÃ¡n: khi báº¡n Ä‘Ã£ cÃ³ case study, KPI trÆ°á»›c/sau vÃ  gÃ³i Ä‘á» xuáº¥t lÆ°Æ¡ng rÃµ rÃ ng.`,
    salary_projection: `Náº¿u hoÃ n thÃ nh 70-80% task, báº¡n cÃ³ case Ä‘Ã m phÃ¡n há»£p lÃ½ cho má»©c ${targetLabel}; khÃ´ng cam káº¿t tÄƒng lÆ°Æ¡ng, nhÆ°ng Ä‘Ã¢y lÃ  má»©c cÃ³ cÆ¡ sá»Ÿ Ä‘á»ƒ yÃªu cáº§u.`,
    intake,
  };
}

function classifyEducationFit(jobTitle: string, intake: RoadmapIntake): string {
  const role = normalizeForRoadmapQuality(`${jobTitle} ${intake.currentPosition || ''}`);
  const education = normalizeForRoadmapQuality(`${intake.educationLevel || ''} ${intake.educationDetail || ''}`);
  const hasHigherCredential = /thac si|mba|tien si/.test(education);
  const hasEnglishCredential = /ngon ngu anh|english|tesol|celta|ielts/.test(education);
  const isLanguageCenter = isLanguageCenterManagerRole(`${jobTitle} ${intake.currentPosition || ''}`);

  if (isLanguageCenter && (hasHigherCredential || hasEnglishCredential)) {
    return 'Over-credentialed nhÆ°ng chÆ°a monetized Ä‘Æ°á»£c báº±ng cáº¥p';
  }
  if (/cu nhan|cao dang|trung cap/.test(education) && /(marketing|sale|kinh doanh|ke toan|finance|nhan su|hr|developer|engineer|teacher|giao vien)/.test(role)) {
    return 'Credential-fit';
  }
  if (!intake.educationLevel || /12\/12/.test(education)) {
    return 'Under-credentialed nhÆ°ng cÃ³ thá»±c chiáº¿n';
  }
  return 'Misaligned credential';
}

function pickSkill(task: string, fallback: string): string {
  const normalized = normalizeForRoadmapQuality(task);
  if (/huong dan vien|hdv|tour guide|tour leader|lich trinh|itinerary|tuyen diem|thuyet minh|diem danh|su co tour|tour log|feedback khach|dieu hanh tour|booking tour|tu van tour/.test(normalized)) {
    return 'Tour log, thuyáº¿t minh vÃ  xá»­ lÃ½ sá»± cá»‘ tour';
  }
  if (/cabin|hang khong|senior crew|purser|announcement|passenger|hanh khach|service recovery|safety|grooming|briefing|debrief/.test(normalized)) {
    return 'Safety-service vÃ  feedback cabin crew';
  }
  if (/housekeeping|buong phong|room attendant|khach san|guest service|amenities|minibar|lost & found|maintenance|room speed/.test(normalized)) {
    return 'Housekeeping checklist vÃ  feedback giÃ¡m sÃ¡t';
  }
  if (/ve sinh|tap vu|cleaning|cleaner|janitor|hoa chat|dung cu|audit cleanliness/.test(normalized)) {
    return 'Checklist vá»‡ sinh vÃ  nghiá»‡m thu khu vá»±c';
  }
  if (/kpi|dashboard|so lieu|chi so/.test(normalized)) return 'Äo KPI vÃ  Ä‘á»c sá»‘ liá»‡u';
  if (/cv|linkedin|headline|bullet/.test(normalized)) return 'ÄÃ³ng gÃ³i há»“ sÆ¡ nghá» nghiá»‡p';
  if (/feedback|review|quote/.test(normalized)) return 'Láº¥y feedback vÃ  cáº£i tiáº¿n';
  if (/case study|evidence|bang chung|artifact|portfolio/.test(normalized)) return 'Viáº¿t case study/portfolio';
  if (/deal|dam phan|luong|de xuat/.test(normalized)) return 'Viáº¿t proposal vÃ  trÃ¬nh bÃ y káº¿t quáº£';
  if (/tin nhan|email|co hoi|apply|cong ty/.test(normalized)) return 'Lá»c JD vÃ  gá»­i há»“ sÆ¡ á»©ng tuyá»ƒn';
  return fallback;
}

function simpleActionTask(
  title: string,
  skill: string,
  output: string,
  kpi: string,
  week: WeekPlan
): RoadmapActionTask {
  return {
    title,
    skill,
    output,
    kpi,
    doneDefinition: `Tick khi cÃ³ Ä‘Ãºng output nÃ y vÃ  dÃ¹ng Ä‘Æ°á»£c cho checkpoint: ${week.milestone}`,
  };
}

function pickWeekVariant<T>(week: WeekPlan, variants: T[]): T {
  return variants[Math.max(0, week.week - 1) % variants.length];
}

function buildTourismTask(task: string, week: WeekPlan, profile = getTourismRoleProfile('')): RoadmapActionTask {
  const normalized = normalizeForRoadmapQuality(task);
  const isDirtyHospitalityLeak = /housekeeping|buong phong|room attendant|room speed|amenities|minibar|lost found|pms|front desk|front office|check\s?in|check\s?out|upsell phong|food cost|table service|pos\/order|khach san|can ho dich vu|resort/.test(normalized);
  const kind = profile?.kind || 'tour_guide';

  if (kind === 'tour_ops_lead') {
    if (/role|tra cao|luong muc tieu|muc luong|jd|tuyen dung|band/.test(normalized) || isDirtyHospitalityLeak) {
      return simpleActionTask(
        'Chon 3 track tra cao hon: truong nhom dieu hanh tour, Tour Operations Manager, Travel Product/Ops Manager; moi track ghi 3 yeu cau lap lai.',
        'Doc JD dieu hanh tour dung nghe',
        '1 bang gom 3 track, muc luong muc tieu, yeu cau chinh, bang chung da co va bang chung con thieu.',
        'Moi track co keyword dung nghe: roster HDV/xe, vendor SLA, cost/margin, risk log, escalation hoac dashboard tour.',
        week
      );
    }
    if (/kpi|dashboard|so lieu|chi so|impact|cost|margin|vendor|sla/.test(normalized)) {
      return simpleActionTask(
        'Lap dashboard 10 tour gan nhat: timeline, HDV/xe, vendor, chi phi, margin, su co, feedback khach va bai hoc.',
        'Dashboard van hanh tour va vendor SLA',
        '1 bang 10 dong da an thong tin khach, moi dong co 1 su co/rui ro hoac diem can cai thien.',
        'Co it nhat 4 chi so: dung timeline, loi vendor, cost variance, feedback khach, incident/escalation hoac margin.',
        week
      );
    }
  }

  if (kind === 'travel_booking') {
    return simpleActionTask(
      /kpi|dashboard|so lieu|chi so|impact|conversion|crm|follow/.test(normalized)
        ? 'Láº­p tracker 20 yÃªu cáº§u booking: nguá»“n lead, nhu cáº§u, bÃ¡o giÃ¡, tráº¡ng thÃ¡i follow-up, lÃ½ do chá»‘t/rá»›t vÃ  bÆ°á»›c tiáº¿p theo.'
        : 'Táº¡o checklist booking 8 bÆ°á»›c: nháº­n nhu cáº§u, xÃ¡c nháº­n ngÃ y/sá»‘ khÃ¡ch, bÃ¡o giÃ¡, giá»¯ chá»—, thanh toÃ¡n, voucher, nháº¯c lá»‹ch, chÄƒm sÃ³c sau tour.',
      'Booking tour, CRM follow-up vÃ  tá»‰ lá»‡ chá»‘t',
      '1 tracker/checklist cÃ³ Ä‘á»§ lead, tráº¡ng thÃ¡i, deadline vÃ  ghi chÃº lÃ½ do khÃ¡ch chá»‘t hoáº·c chÆ°a chá»‘t.',
      'CÃ³ Ã­t nháº¥t 20 lead/yÃªu cáº§u hoáº·c 8 bÆ°á»›c booking rÃµ rÃ ng; chá»‰ bÃ¡m vÃ o booking tour vÃ  CRM follow-up.',
      week
    );
  }

  if (kind === 'travel_sales_group' || kind === 'travel_sales_fit') {
    return simpleActionTask(
      /kpi|dashboard|so lieu|chi so|impact|conversion|doanh so|sales/.test(normalized)
        ? 'Láº­p báº£ng 20 khÃ¡ch/tour inquiry: nhu cáº§u, ngÃ¢n sÃ¡ch, tuyáº¿n Ä‘iá»ƒm, objection, follow-up, tráº¡ng thÃ¡i chá»‘t vÃ  doanh thu dá»± kiáº¿n.'
        : 'Viáº¿t 3 script tÆ° váº¥n tour theo Ä‘Ãºng nhÃ³m khÃ¡ch: gia Ä‘Ã¬nh, cÃ´ng ty/Ä‘oÃ n, khÃ¡ch láº»; má»—i script cÃ³ cÃ¢u há»i nhu cáº§u vÃ  cÃ¡ch xá»­ lÃ½ objection.',
      'TÆ° váº¥n tour, objection handling vÃ  conversion',
      '1 tracker/script cÃ³ nhÃ³m khÃ¡ch, nhu cáº§u, tuyáº¿n Ä‘iá»ƒm, ngÃ¢n sÃ¡ch, objection vÃ  bÆ°á»›c follow-up tiáº¿p theo.',
      'CÃ³ sá»‘ lead, tá»‰ lá»‡ pháº£n há»“i/chá»‘t, lÃ½ do rá»›t vÃ  1 hÃ nh Ä‘á»™ng follow-up cá»¥ thá»ƒ; chá»‰ bÃ¡m vÃ o tÆ° váº¥n tour.',
      week
    );
  }

  if (/role|tra cao|luong muc tieu|muc luong|jd|tuyen dung|band/.test(normalized) || isDirtyHospitalityLeak) {
    return simpleActionTask(
      'Má»Ÿ 3 tin HDV/tour leader tráº£ cao hÆ¡n, chÃ©p ra 3 yÃªu cáº§u láº·p láº¡i: tuyáº¿n Ä‘iá»ƒm, ngoáº¡i ngá»¯, xá»­ lÃ½ sá»± cá»‘, feedback khÃ¡ch hoáº·c kinh nghiá»‡m dáº«n Ä‘oÃ n.',
      'Äá»c JD hÆ°á»›ng dáº«n viÃªn vÃ  chá»n track Ä‘Ãºng nghá»',
      '1 báº£ng gá»“m 3 JD/link/áº£nh, má»©c lÆ°Æ¡ng náº¿u cÃ³, yÃªu cáº§u chÃ­nh, báº±ng chá»©ng Ä‘Ã£ cÃ³ vÃ  báº±ng chá»©ng cÃ²n thiáº¿u.',
      'Má»—i JD cÃ³ keyword Ä‘Ãºng nghá» du lá»‹ch: lá»‹ch trÃ¬nh, thuyáº¿t minh, Ä‘iá»ƒm danh, an toÃ n Ä‘oÃ n, sá»± cá»‘ tour, feedback khÃ¡ch hoáº·c bÃ¡o cÃ¡o sau tour.',
      week
    );
  }
  if (/kpi|dashboard|so lieu|chi so|impact|do impact|feedback|review/.test(normalized)) {
    return simpleActionTask(
      'Láº­p tour log 5 tour gáº§n nháº¥t: tuyáº¿n, sá»‘ khÃ¡ch, Ä‘Ãºng timeline, sá»± cá»‘, cÃ¡ch xá»­ lÃ½, feedback khÃ¡ch vÃ  xÃ¡c nháº­n Ä‘iá»u hÃ nh.',
      'Äo KPI hÆ°á»›ng dáº«n viÃªn báº±ng tour log',
      '1 báº£ng 5 dÃ²ng Ä‘Ã£ áº©n thÃ´ng tin khÃ¡ch, má»—i dÃ²ng cÃ³ timeline, sá»± cá»‘/feedback vÃ  bÃ i há»c rÃºt ra.',
      'CÃ³ Ã­t nháº¥t 3 chá»‰ sá»‘: Ä‘Ãºng giá», Ä‘iá»ƒm danh Ä‘á»§, feedback khÃ¡ch, sá»± cá»‘ xá»­ lÃ½ Ãªm, Ä‘Ã¡nh giÃ¡ Ä‘iá»u hÃ nh hoáº·c tá»· lá»‡ tour láº·p láº¡i.',
      week
    );
  }
  if (/lich trinh|itinerary|tuyen|diem|story|thuyet minh|script|noi dung/.test(normalized)) {
    return simpleActionTask(
      'Viáº¿t 1 script thuyáº¿t minh 7 phÃºt cho 1 tuyáº¿n Ä‘iá»ƒm: má»Ÿ Ä‘áº§u, 3 Ã½ chÃ­nh, cÃ¢u chuyá»‡n Ä‘á»‹a phÆ°Æ¡ng, cÃ¢u há»i tÆ°Æ¡ng tÃ¡c vÃ  cÃ¡ch káº¿t.',
      'Thuyáº¿t minh tuyáº¿n Ä‘iá»ƒm vÃ  storytelling',
      '1 script ngáº¯n cÃ³ thá»ƒ Ä‘á»c thá»­, kÃ¨m 3 fact Ä‘Ã£ kiá»ƒm tra vÃ  1 cÃ¢u há»i tÆ°Æ¡ng tÃ¡c cho khÃ¡ch.',
      'Script khÃ´ng quÃ¡ 1 trang, Ä‘á»c thÃ nh tiáº¿ng dÆ°á»›i 7 phÃºt vÃ  cÃ³ 3 Ä‘iá»ƒm khÃ¡ch dá»… nhá»›.',
      week
    );
  }
  if (/su co|risk|an toan|complaint|khach|delay|tre|mat|benh|mua|thoi tiet/.test(normalized)) {
    return simpleActionTask(
      'Viáº¿t 3 case sá»± cá»‘ tour: khÃ¡ch trá»…, thá»i tiáº¿t xáº¥u, khÃ¡ch phÃ n nÃ n; má»—i case ghi 3 bÆ°á»›c xá»­ lÃ½ vÃ  ai cáº§n bÃ¡o ngay.',
      'Xá»­ lÃ½ sá»± cá»‘ tour vÃ  an toÃ n Ä‘oÃ n',
      '1 ghi chÃº 3 case, má»—i case cÃ³ tÃ¬nh huá»‘ng - hÃ nh Ä‘á»™ng - káº¿t quáº£ - ngÆ°á»i xÃ¡c nháº­n.',
      'Má»—i case dÆ°á»›i 5 dÃ²ng, khÃ´ng lá»™ thÃ´ng tin khÃ¡ch vÃ  cÃ³ bÆ°á»›c escalation rÃµ.',
      week
    );
  }
  if (/cv|linkedin|headline|bullet|ho so|portfolio|evidence|bang chung|case study/.test(normalized)) {
    return simpleActionTask(
      'ÄÃ³ng gÃ³i 3 tour Ä‘Ã£ dáº«n thÃ nh evidence log: lá»‹ch trÃ¬nh, Ä‘iá»ƒm thuyáº¿t minh, sá»± cá»‘ Ä‘Ã£ xá»­ lÃ½, feedback khÃ¡ch vÃ  xÃ¡c nháº­n Ä‘iá»u hÃ nh.',
      'Há»“ sÆ¡ báº±ng chá»©ng hÆ°á»›ng dáº«n viÃªn du lá»‹ch',
      '1 folder/ghi chÃº cÃ³ 3 tour, má»—i tour cÃ³ 5 má»¥c báº±ng chá»©ng Ä‘Ã£ áº©n thÃ´ng tin khÃ¡ch.',
      'NgÆ°á»i quáº£n lÃ½/nhÃ  tuyá»ƒn dá»¥ng Ä‘á»c vÃ o tháº¥y rÃµ báº¡n Ä‘Ã£ dáº«n tour nÃ o, lÃ m gÃ¬, káº¿t quáº£ ra sao vÃ  ai xÃ¡c nháº­n.',
      week
    );
  }
  if (/co hoi|apply|tin nhan|email|danh sach|cong ty|tour|travel/.test(normalized)) {
    return simpleActionTask(
      'Lá»c 10 cÃ´ng ty tour/inbound/outbound phÃ¹ há»£p, ghi tuyáº¿n máº¡nh, yÃªu cáº§u HDV, má»©c lÆ°Æ¡ng/fee náº¿u cÃ³ vÃ  ngÆ°á»i liÃªn há»‡.',
      'TÃ¬m cÆ¡ há»™i HDV/tour leader tráº£ tá»‘t hÆ¡n',
      '1 danh sÃ¡ch 10 cÃ´ng ty/tin tuyá»ƒn dá»¥ng cÃ³ link/áº£nh vÃ  bÆ°á»›c tiáº¿p theo cho tá»«ng nÆ¡i.',
      'Ãt nháº¥t 5 nÆ¡i cÃ³ tuyáº¿n Ä‘iá»ƒm/nhÃ³m khÃ¡ch phÃ¹ há»£p vá»›i kinh nghiá»‡m hiá»‡n táº¡i cá»§a báº¡n.',
      week
    );
  }
  if (/deal|dam phan|de xuat|luong|fee/.test(normalized)) {
    return simpleActionTask(
      'Viáº¿t script 90 giÃ¢y xin review fee/lÆ°Æ¡ng dá»±a trÃªn 3 tour Ä‘Ã£ dáº«n, feedback khÃ¡ch, sá»± cá»‘ Ä‘Ã£ xá»­ lÃ½ vÃ  track tour khÃ³ hÆ¡n.',
      'Äá» xuáº¥t tÄƒng fee/lÆ°Æ¡ng báº±ng báº±ng chá»©ng dáº«n tour',
      '1 script ngáº¯n cÃ³ 3 pháº§n: báº±ng chá»©ng tour, chá»‰ sá»‘/feedback, Ä‘á» xuáº¥t má»©c hoáº·c lá»‹ch review.',
      'Script Ä‘á»c thÃ nh tiáº¿ng dÆ°á»›i 90 giÃ¢y vÃ  khÃ´ng há»©a quÃ¡ má»©c; chá»‰ Ä‘Æ°a báº±ng chá»©ng vÃ  má»©c Ä‘á» xuáº¥t.',
      week
    );
  }
  return simpleActionTask(
    'LÃ m 1 output tour guide nhá» trong tuáº§n: tour log, script thuyáº¿t minh, case sá»± cá»‘ hoáº·c feedback khÃ¡ch Ä‘Ã£ áº©n thÃ´ng tin.',
    'Thá»±c thi báº±ng chá»©ng du lá»‹ch Ä‘Ãºng nghá»',
    '1 output gáº¯n vá»›i HDV/tour: link/áº£nh/ghi chÃº cÃ³ ngÃ y, tuyáº¿n, káº¿t quáº£ vÃ  ngÆ°á»i xÃ¡c nháº­n náº¿u cÃ³.',
    'Output Ä‘á»§ cá»¥ thá»ƒ Ä‘á»ƒ Ä‘Æ°a vÃ o evidence log vÃ  chá»‰ bÃ¡m vÃ o cÃ´ng viá»‡c tour/du lá»‹ch thá»±c Ä‘á»‹a.',
    week
  );
}

function buildHospitalityTask(task: string, week: WeekPlan): RoadmapActionTask {
  const normalized = normalizeForRoadmapQuality(task);
  if (/role|tra cao|luong muc tieu|muc luong|jd|tuyen dung|tin tuyen dung|band/.test(normalized)) {
    const variant = pickWeekVariant(week, [
      {
        title: 'Má»Ÿ 3 tin tuyá»ƒn dá»¥ng buá»“ng phÃ²ng/supervisor, chÃ©p ra 3 yÃªu cáº§u láº·p láº¡i nhiá»u nháº¥t.',
        output: '1 ghi chÃº cÃ³ 3 link/áº£nh JD vÃ  3 yÃªu cáº§u láº·p láº¡i, vÃ­ dá»¥: tá»‘c Ä‘á»™ phÃ²ng, checklist lá»—i, feedback giÃ¡m sÃ¡t.',
        kpi: 'Äá»§ 3 JD tháº­t, má»—i JD ghi 1 má»©c lÆ°Æ¡ng hoáº·c yÃªu cáº§u chÃ­nh; lÃ m trong 30 phÃºt lÃ  Ä‘áº¡t.',
      },
      {
        title: 'Chá»n 1 role má»¥c tiÃªu cao hÆ¡n: Room Attendant senior hoáº·c Housekeeping Supervisor, rá»“i ghi 3 báº±ng chá»©ng cÃ²n thiáº¿u.',
        output: '1 ghi chÃº gá»“m role má»¥c tiÃªu, má»©c lÆ°Æ¡ng mong muá»‘n vÃ  3 báº±ng chá»©ng cáº§n bá»• sung.',
        kpi: 'CÃ³ Ä‘Ãºng 1 role cá»¥ thá»ƒ; má»—i báº±ng chá»©ng cÃ²n thiáº¿u pháº£i lÃ m Ä‘Æ°á»£c trong 1-2 tuáº§n.',
      },
      {
        title: 'So sÃ¡nh 2 tin buá»“ng phÃ²ng tráº£ tá»‘t hÆ¡n, khoanh 3 yÃªu cáº§u báº¡n Ä‘Ã£ cÃ³ vÃ  2 yÃªu cáº§u chÆ°a cÃ³.',
        output: '1 báº£ng 2 cá»™t cho 2 tin tuyá»ƒn dá»¥ng, cÃ³ má»¥c Ä‘Ã£ cÃ³/chÆ°a cÃ³.',
        kpi: 'Má»—i tin cÃ³ link/áº£nh; tá»•ng cá»™ng cÃ³ 3 Ä‘iá»ƒm máº¡nh vÃ  2 Ä‘iá»ƒm cáº§n bá»• sung.',
      },
      {
        title: 'Viáº¿t 1 checklist â€œem Ä‘Ã£ sáºµn sÃ ng lÃªn senior chÆ°aâ€ gá»“m 5 tiÃªu chÃ­: tá»‘c Ä‘á»™, lá»—i, bÃ n giao, feedback, há»— trá»£ ngÆ°á»i má»›i.',
        output: '1 checklist 5 tiÃªu chÃ­, má»—i tiÃªu chÃ­ tá»± cháº¥m Ä‘áº¡t/chÆ°a Ä‘áº¡t.',
        kpi: 'CÃ³ Ã­t nháº¥t 2 tiÃªu chÃ­ Ä‘áº¡t vÃ  1 tiÃªu chÃ­ cáº§n cáº£i thiá»‡n rÃµ rÃ ng.',
      },
    ]);
    return simpleActionTask(variant.title, 'Äá»c JD khÃ¡ch sáº¡n vÃ  chá»n track tÄƒng lÆ°Æ¡ng', variant.output, variant.kpi, week);
  }
  if (/tinh huong|checkout|amenities|minibar|lost|maintenance|complaint|request|yeu cau/.test(normalized)) {
    return simpleActionTask(
      'Viáº¿t 3 tÃ¬nh huá»‘ng hay gáº·p trong ca: phÃ²ng checkout gáº¥p, thiáº¿u amenities, khÃ¡ch bÃ¡o phÃ²ng chÆ°a sáº¡ch.',
      'Xá»­ lÃ½ tÃ¬nh huá»‘ng housekeeping',
      '1 ghi chÃº 3 dÃ²ng: tÃ¬nh huá»‘ng - báº¡n lÃ m gÃ¬ - bÃ¡o ai/xÃ¡c nháº­n tháº¿ nÃ o.',
      'Má»—i tÃ¬nh huá»‘ng cÃ³ cÃ¡ch xá»­ lÃ½ dÆ°á»›i 3 bÆ°á»›c vÃ  khÃ´ng lá»™ thÃ´ng tin khÃ¡ch.',
      week
    );
  }
  if (/kpi|dashboard|so lieu|chi so|impact|do impact/.test(normalized)) {
    const variant = pickWeekVariant(week, [
      {
        title: 'Káº» báº£ng 5 dÃ²ng theo dÃµi ca: ngÃ y, sá»‘ phÃ²ng, phÃºt/phÃ²ng, lá»—i, ai xÃ¡c nháº­n.',
        output: '1 áº£nh/link báº£ng 5 dÃ²ng; cÃ³ thá»ƒ lÃ m báº±ng giáº¥y, Notes hoáº·c Google Sheet.',
        kpi: 'CÃ³ Ã­t nháº¥t 5 dÃ²ng tháº­t hoáº·c mÃ´ phá»ng tá»« ca gáº§n nháº¥t; má»—i dÃ²ng cÃ³ sá»‘ phÃ²ng vÃ  lá»—i náº¿u cÃ³.',
      },
      {
        title: 'Chá»n 1 lá»—i phÃ²ng hay gáº·p nháº¥t tuáº§n nÃ y, ghi sá»‘ láº§n gáº·p vÃ  cÃ¡ch sá»­a láº§n sau.',
        output: '1 ghi chÃº 3 dÃ²ng: lá»—i gÃ¬, gáº·p máº¥y láº§n, láº§n sau kiá»ƒm á»Ÿ bÆ°á»›c nÃ o cá»§a checklist.',
        kpi: 'CÃ³ Ä‘Ãºng 1 lá»—i cá»¥ thá»ƒ vÃ  1 cÃ¡ch phÃ²ng trÃ¡nh; lÃ m trong 10 phÃºt lÃ  Ä‘áº¡t.',
      },
      {
        title: 'Báº¥m giá» 3 phÃ²ng hoáº·c 3 khu vá»±c, ghi phÃºt hoÃ n thÃ nh vÃ  lÃ½ do phÃ²ng nÃ o lÃ¢u nháº¥t.',
        output: '1 báº£ng nhá» cÃ³ 3 dÃ²ng: phÃ²ng/khu vá»±c, sá»‘ phÃºt, lÃ½ do nhanh/cháº­m.',
        kpi: 'CÃ³ Ä‘á»§ 3 má»‘c thá»i gian; khÃ´ng cáº§n nhanh ngay, chá»‰ cáº§n biáº¿t chá»— ngháº½n.',
      },
    ]);
    return simpleActionTask(variant.title, 'Äo KPI housekeeping ráº¥t Ä‘Æ¡n giáº£n', variant.output, variant.kpi, week);
  }
  if (/feedback|review|quote|nhá»|nho|xin/.test(normalized)) {
    const variant = pickWeekVariant(week, [
      {
        title: 'Há»i giÃ¡m sÃ¡t 1 cÃ¢u: â€œCa nÃ y em cáº§n sá»­a Ä‘iá»ƒm nÃ o Ä‘á»ƒ phÃ²ng Ä‘áº¡t nhanh hÆ¡n?â€ rá»“i ghi láº¡i cÃ¢u tráº£ lá»i.',
        output: '1 áº£nh/ghi chÃº feedback gá»“m ngÆ°á»i gÃ³p Ã½, ngÃ y, 1 Ä‘iá»ƒm tá»‘t vÃ  1 Ä‘iá»ƒm cáº§n sá»­a.',
        kpi: 'CÃ³ Ä‘Ãºng 1 feedback tháº­t; khÃ´ng cáº§n dÃ i, 2-3 cÃ¢u lÃ  Ä‘á»§.',
      },
      {
        title: 'Há»i giÃ¡m sÃ¡t: â€œTrong phÃ²ng em vá»«a lÃ m, lá»—i nÃ o dá»… bá»‹ khÃ¡ch hoáº·c QC nháº¯c nháº¥t?â€ rá»“i ghi 1 lá»—i.',
        output: '1 ghi chÃº gá»“m lá»—i Ä‘Æ°á»£c nháº¯c, phÃ²ng/khu vá»±c Ä‘Ã£ che thÃ´ng tin vÃ  cÃ¡ch kiá»ƒm láº¡i láº§n sau.',
        kpi: 'CÃ³ 1 lá»—i cá»¥ thá»ƒ vÃ  1 bÆ°á»›c sá»­a; khÃ´ng cáº§n xin nháº­n xÃ©t dÃ i.',
      },
      {
        title: 'Nhá» Ä‘á»“ng nghiá»‡p kiá»ƒm chÃ©o 1 phÃ²ng/khu vá»±c, ghi láº¡i 1 Ä‘iá»ƒm Ä‘áº¡t vÃ  1 Ä‘iá»ƒm cáº§n sá»­a.',
        output: '1 ghi chÃº 2 dÃ²ng: Ä‘iá»ƒm Ä‘áº¡t, Ä‘iá»ƒm cáº§n sá»­a, ngÆ°á»i kiá»ƒm chÃ©o.',
        kpi: 'CÃ³ ngÆ°á»i kiá»ƒm chÃ©o tháº­t vÃ  1 hÃ nh Ä‘á»™ng sá»­a ngay trong ca sau.',
      },
      {
        title: 'Há»i giÃ¡m sÃ¡t: â€œTrÆ°á»›c khi bÃ n giao phÃ²ng, em nÃªn kiá»ƒm ká»¹ nháº¥t má»¥c nÃ o?â€ rá»“i thÃªm má»¥c Ä‘Ã³ vÃ o checklist.',
        output: '1 checklist Ä‘Ã£ thÃªm Ä‘Ãºng 1 má»¥c tá»« feedback cá»§a giÃ¡m sÃ¡t.',
        kpi: 'Checklist cÃ³ má»¥c má»›i vÃ  báº¡n biáº¿t kiá»ƒm má»¥c Ä‘Ã³ trÆ°á»›c khi rá»i phÃ²ng.',
      },
    ]);
    return simpleActionTask(variant.title, 'Xin feedback ngáº¯n tá»« giÃ¡m sÃ¡t', variant.output, variant.kpi, week);
  }
  if (/checklist|sop|ca housekeeping|chuyen thanh checklist|room area|room\/area|dau viec/.test(normalized)) {
    const variant = pickWeekVariant(week, [
      {
        title: 'Viáº¿t checklist 8 Ã´ cho 1 phÃ²ng: giÆ°á»ng, toilet, sÃ n, thÃ¹ng rÃ¡c, khÄƒn, amenities, minibar, bÃ¡o lá»—i.',
        output: '1 áº£nh checklist 8 Ã´ Ä‘Ã£ tick thá»­ cho 1 phÃ²ng/area; che sá»‘ phÃ²ng hoáº·c thÃ´ng tin khÃ¡ch náº¿u cÃ³.',
        kpi: 'Checklist cÃ³ Ä‘á»§ 8 Ã´ vÃ  cÃ³ Ã­t nháº¥t 1 Ã´ ghi lá»—i hoáº·c â€œÄ‘áº¡tâ€.',
      },
      {
        title: 'TÃ¡ch checklist phÃ²ng thÃ nh 3 bÆ°á»›c: vÃ o phÃ²ng kiá»ƒm gÃ¬, Ä‘ang dá»n kiá»ƒm gÃ¬, trÆ°á»›c khi rá»i phÃ²ng kiá»ƒm gÃ¬.',
        output: '1 ghi chÃº 3 má»¥c, má»—i má»¥c cÃ³ 2-3 Ã´ tick dá»… nhá»›.',
        kpi: 'Äá»§ 3 bÆ°á»›c, tá»•ng khÃ´ng quÃ¡ 9 Ã´ tick Ä‘á»ƒ ngÆ°á»i má»›i nhÃ¬n lÃ  lÃ m Ä‘Æ°á»£c.',
      },
      {
        title: 'LÃ m 1 checklist â€œquÃªn lÃ  máº¥t Ä‘iá»ƒmâ€: khÄƒn, amenities, rÃ¡c, tÃ³c/sÃ n, mÃ¹i, Ä‘á»“ khÃ¡ch bá» quÃªn.',
        output: '1 checklist 6 Ã´ cho cÃ¡c lá»—i dá»… bá»‹ nháº¯c nháº¥t.',
        kpi: 'Má»—i Ã´ cÃ³ tráº¡ng thÃ¡i Ä‘áº¡t/chÆ°a Ä‘áº¡t; Æ°u tiÃªn lá»—i tháº­t tá»«ng gáº·p.',
      },
    ]);
    return simpleActionTask(variant.title, 'Checklist dá»n phÃ²ng dÃ¹ng ngay trong ca', variant.output, variant.kpi, week);
  }
  if (/cv|linkedin|headline|bullet/.test(normalized)) {
    return simpleActionTask(
      'Viáº¿t 3 dÃ²ng CV buá»“ng phÃ²ng theo máº«u: dá»n bao nhiÃªu phÃ²ng/ca, giáº£m lá»—i gÃ¬, ai xÃ¡c nháº­n.',
      'ÄÃ³ng gÃ³i kinh nghiá»‡m housekeeping vÃ o CV',
      '3 bullet CV ngáº¯n, má»—i bullet cÃ³ sá»‘ hoáº·c báº±ng chá»©ng: phÃ²ng/ca, phÃºt/phÃ²ng, lá»—i giáº£m, feedback.',
      'Äá»§ 3 bullet, má»—i bullet dÆ°á»›i 25 tá»« vÃ  cÃ³ 1 con sá»‘ hoáº·c ngÆ°á»i xÃ¡c nháº­n.',
      week
    );
  }
  if (/co hoi|apply|tin nhan|email|danh sach|cong ty|khach san/.test(normalized)) {
    return simpleActionTask(
      'Lá»c 5 khÃ¡ch sáº¡n/cÄƒn há»™ dá»‹ch vá»¥ Ä‘ang tuyá»ƒn buá»“ng phÃ²ng hoáº·c supervisor.',
      'TÃ¬m cÆ¡ há»™i housekeeping tráº£ tá»‘t hÆ¡n',
      '1 danh sÃ¡ch 5 nÆ¡i gá»“m tÃªn nÆ¡i, role, lÆ°Æ¡ng náº¿u cÃ³, link/áº£nh tin vÃ  bÆ°á»›c tiáº¿p theo.',
      'Äá»§ 5 nÆ¡i tháº­t; Ã­t nháº¥t 2 nÆ¡i cÃ³ lÆ°Æ¡ng hoáº·c ca lÃ m rÃµ.',
      week
    );
  }
  if (/deal|dam phan|de xuat|luong/.test(normalized)) {
    return simpleActionTask(
      'Viáº¿t script 5 cÃ¢u xin review lÆ°Æ¡ng dá»±a trÃªn sá»‘ phÃ²ng/ca, lá»—i giáº£m vÃ  feedback giÃ¡m sÃ¡t.',
      'NÃ³i chuyá»‡n tÄƒng lÆ°Æ¡ng báº±ng báº±ng chá»©ng',
      '1 Ä‘oáº¡n script dÆ°á»›i 90 giÃ¢y, Ä‘á»c thÃ nh tiáº¿ng Ä‘Æ°á»£c.',
      'Script cÃ³ 3 pháº§n: viá»‡c Ä‘Ã£ lÃ m, sá»‘/báº±ng chá»©ng, Ä‘á» xuáº¥t má»©c hoáº·c lá»‹ch review.',
      week
    );
  }
  if (/case study|evidence|bang chung|artifact|portfolio|ho so|before-after/.test(normalized)) {
    const variant = pickWeekVariant(week, [
      {
        title: 'Gom 3 báº±ng chá»©ng nhá» vÃ o 1 ghi chÃº: checklist Ä‘Ã£ tick, áº£nh trÆ°á»›c-sau, 1 feedback hoáº·c sá»‘ phÃ²ng/ca.',
        output: '1 ghi chÃº hoáº·c folder cÃ³ Ä‘Ãºng 3 má»¥c; má»—i má»¥c cÃ³ ngÃ y vÃ  mÃ´ táº£ 1 dÃ²ng.',
        kpi: 'Äá»§ 3 má»¥c nhá», khÃ´ng yÃªu cáº§u file Ä‘áº¹p; chá»‰ cáº§n quáº£n lÃ½ nhÃ¬n hiá»ƒu báº¡n Ä‘Ã£ lÃ m gÃ¬.',
      },
      {
        title: 'Chá»¥p 1 áº£nh trÆ°á»›c-sau cá»§a khu vá»±c Ä‘Æ°á»£c phÃ©p chá»¥p, rá»“i che sá»‘ phÃ²ng/thÃ´ng tin khÃ¡ch.',
        output: '1 cáº·p áº£nh hoáº·c 1 ghi chÃº mÃ´ táº£ trÆ°á»›c-sau; khÃ´ng Ä‘á»ƒ lá»™ thÃ´ng tin khÃ¡ch.',
        kpi: 'CÃ³ Ä‘Ãºng 1 báº±ng chá»©ng trá»±c quan vÃ  Ä‘Ã£ che thÃ´ng tin nháº¡y cáº£m trÆ°á»›c khi lÆ°u.',
      },
      {
        title: 'Viáº¿t mini case 5 dÃ²ng: phÃ²ng/khu vá»±c ban Ä‘áº§u tháº¿ nÃ o, báº¡n lÃ m gÃ¬, káº¿t quáº£ ra sao, ai xÃ¡c nháº­n, bÃ i há»c.',
        output: '1 Ä‘oáº¡n 5 dÃ²ng, má»—i dÃ²ng tráº£ lá»i Ä‘Ãºng 1 Ã½.',
        kpi: 'CÃ³ ngÆ°á»i/xÃ¡c nháº­n hoáº·c dáº¥u hiá»‡u káº¿t quáº£; khÃ´ng cáº§n vÄƒn hay, chá»‰ cáº§n rÃµ viá»‡c.',
      },
      {
        title: 'Chá»n 1 ca lÃ m tá»‘t nháº¥t tuáº§n, lÆ°u 2 báº±ng chá»©ng: checklist hoÃ n táº¥t vÃ  1 cÃ¢u feedback/sá»‘ phÃ²ng.',
        output: '1 ghi chÃº cÃ³ ngÃ y ca lÃ m, checklist, feedback hoáº·c sá»‘ phÃ²ng/ca.',
        kpi: 'Äá»§ 2 báº±ng chá»©ng nhá», dÃ¹ng Ä‘Æ°á»£c Ä‘á»ƒ ká»ƒ khi xin review lÆ°Æ¡ng.',
      },
    ]);
    return simpleActionTask(variant.title, 'Gom báº±ng chá»©ng housekeeping khÃ´ng rÆ°á»m rÃ ', variant.output, variant.kpi, week);
  }
  return simpleActionTask(
    'Chá»n 1 phÃ²ng/area trong ca gáº§n nháº¥t, ghi 3 viá»‡c Ä‘Ã£ lÃ m tá»‘t vÃ  1 lá»—i cáº§n trÃ¡nh ca sau.',
    'Tá»± review ca housekeeping',
    '1 ghi chÃº 4 dÃ²ng: 3 viá»‡c tá»‘t, 1 lá»—i cáº§n trÃ¡nh, ngÃ y ca lÃ m.',
    'Ghi xong trong 10 phÃºt sau ca hoáº·c ngay khi nhá»› láº¡i ca gáº§n nháº¥t.',
    week
  );
}

function buildCleaningTask(task: string, week: WeekPlan): RoadmapActionTask {
  const normalized = normalizeForRoadmapQuality(task);
  if (/role|tra cao|luong muc tieu|muc luong|jd|tuyen dung|tin tuyen dung|band/.test(normalized)) {
    const variant = pickWeekVariant(week, [
      {
        title: 'Má»Ÿ 3 tin tuyá»ƒn dá»¥ng vá»‡ sinh/team leader/site supervisor, chÃ©p ra 3 yÃªu cáº§u láº·p láº¡i nhiá»u nháº¥t.',
        output: '1 ghi chÃº cÃ³ 3 link/áº£nh JD vÃ  3 yÃªu cáº§u láº·p láº¡i, vÃ­ dá»¥: checklist khu vá»±c, hÃ³a cháº¥t, bÃ n giao ca.',
        kpi: 'Äá»§ 3 JD tháº­t, má»—i JD ghi 1 yÃªu cáº§u chÃ­nh vÃ  má»©c lÆ°Æ¡ng náº¿u cÃ³.',
      },
      {
        title: 'Chá»n 1 role má»¥c tiÃªu cao hÆ¡n: tá»• trÆ°á»Ÿng vá»‡ sinh, team leader hoáº·c site supervisor, rá»“i ghi 3 báº±ng chá»©ng cÃ²n thiáº¿u.',
        output: '1 ghi chÃº gá»“m role má»¥c tiÃªu, má»©c lÆ°Æ¡ng mong muá»‘n vÃ  3 báº±ng chá»©ng cáº§n bá»• sung.',
        kpi: 'CÃ³ Ä‘Ãºng 1 role cá»¥ thá»ƒ; má»—i báº±ng chá»©ng cÃ²n thiáº¿u pháº£i lÃ m Ä‘Æ°á»£c trong 1-2 tuáº§n.',
      },
      {
        title: 'So sÃ¡nh 2 tin vá»‡ sinh tráº£ tá»‘t hÆ¡n, khoanh 3 yÃªu cáº§u báº¡n Ä‘Ã£ cÃ³ vÃ  2 yÃªu cáº§u chÆ°a cÃ³.',
        output: '1 báº£ng 2 cá»™t cho 2 tin tuyá»ƒn dá»¥ng, cÃ³ má»¥c Ä‘Ã£ cÃ³/chÆ°a cÃ³.',
        kpi: 'Má»—i tin cÃ³ link/áº£nh; tá»•ng cá»™ng cÃ³ 3 Ä‘iá»ƒm máº¡nh vÃ  2 Ä‘iá»ƒm cáº§n bá»• sung.',
      },
      {
        title: 'Viáº¿t 1 checklist â€œem Ä‘Ã£ sáºµn sÃ ng lÃªn tá»• trÆ°á»Ÿng chÆ°aâ€ gá»“m 5 tiÃªu chÃ­: checklist, an toÃ n, lá»—i, bÃ n giao, há»— trá»£ ngÆ°á»i má»›i.',
        output: '1 checklist 5 tiÃªu chÃ­, má»—i tiÃªu chÃ­ tá»± cháº¥m Ä‘áº¡t/chÆ°a Ä‘áº¡t.',
        kpi: 'CÃ³ Ã­t nháº¥t 2 tiÃªu chÃ­ Ä‘áº¡t vÃ  1 tiÃªu chÃ­ cáº§n cáº£i thiá»‡n rÃµ rÃ ng.',
      },
    ]);
    return simpleActionTask(variant.title, 'Äá»c JD vá»‡ sinh/facility vÃ  chá»n track tÄƒng lÆ°Æ¡ng', variant.output, variant.kpi, week);
  }
  if (/kpi|dashboard|so lieu|chi so|impact|do impact/.test(normalized)) {
    const variant = pickWeekVariant(week, [
      {
        title: 'Káº» báº£ng 5 dÃ²ng theo dÃµi ca: khu vá»±c, giá» xong, lá»—i/rework, dá»¥ng cá»¥, ai xÃ¡c nháº­n.',
        output: '1 áº£nh/link báº£ng 5 dÃ²ng; cÃ³ thá»ƒ lÃ m báº±ng giáº¥y, Notes hoáº·c Google Sheet.',
        kpi: 'CÃ³ Ã­t nháº¥t 5 dÃ²ng tháº­t hoáº·c mÃ´ phá»ng tá»« ca gáº§n nháº¥t; má»—i dÃ²ng cÃ³ khu vá»±c vÃ  tráº¡ng thÃ¡i Ä‘áº¡t/chÆ°a Ä‘áº¡t.',
      },
      {
        title: 'Chá»n 1 khu vá»±c hay bá»‹ nháº¯c nháº¥t, ghi lá»—i láº·p láº¡i vÃ  cÃ¡ch kiá»ƒm trÆ°á»›c khi bÃ n giao.',
        output: '1 ghi chÃº 3 dÃ²ng: khu vá»±c, lá»—i hay gáº·p, bÆ°á»›c kiá»ƒm láº¡i.',
        kpi: 'CÃ³ Ä‘Ãºng 1 khu vá»±c cá»¥ thá»ƒ vÃ  1 bÆ°á»›c kiá»ƒm láº¡i dá»… lÃ m.',
      },
      {
        title: 'Báº¥m giá» 3 khu vá»±c nhá», ghi phÃºt hoÃ n thÃ nh vÃ  khu vá»±c nÃ o máº¥t thá»i gian nháº¥t.',
        output: '1 báº£ng 3 dÃ²ng: khu vá»±c, sá»‘ phÃºt, lÃ½ do nhanh/cháº­m.',
        kpi: 'CÃ³ Ä‘á»§ 3 má»‘c thá»i gian; biáº¿t Ä‘Æ°á»£c 1 chá»— ngháº½n Ä‘á»ƒ sá»­a tuáº§n sau.',
      },
    ]);
    return simpleActionTask(variant.title, 'Äo KPI vá»‡ sinh ráº¥t Ä‘Æ¡n giáº£n', variant.output, variant.kpi, week);
  }
  if (/hoa chat|dung cu|ppe|safety|an toÃ n|an toan/.test(normalized)) {
    return simpleActionTask(
      'Ghi 5 dá»¥ng cá»¥/hÃ³a cháº¥t hay dÃ¹ng vÃ  má»—i mÃ³n dÃ¹ng cho khu vá»±c nÃ o.',
      'DÃ¹ng dá»¥ng cá»¥/hÃ³a cháº¥t Ä‘Ãºng chuáº©n',
      '1 áº£nh/ghi chÃº 5 dÃ²ng: tÃªn dá»¥ng cá»¥/hÃ³a cháº¥t - dÃ¹ng á»Ÿ Ä‘Ã¢u - lÆ°u Ã½ an toÃ n.',
      'Äá»§ 5 dÃ²ng, khÃ´ng ghi cÃ´ng thá»©c pha náº¿u ná»™i bá»™ khÃ´ng cho phÃ©p chia sáº».',
      week
    );
  }
  if (/feedback|review|quote|nhá»|nho|xin/.test(normalized)) {
    const variant = pickWeekVariant(week, [
      {
        title: 'Há»i giÃ¡m sÃ¡t 1 cÃ¢u: â€œKhu vá»±c nÃ y cÃ²n Ä‘iá»ƒm nÃ o chÆ°a sáº¡ch/thiáº¿u an toÃ n?â€ rá»“i ghi láº¡i cÃ¢u tráº£ lá»i.',
        output: '1 áº£nh/ghi chÃº feedback gá»“m khu vá»±c, ngÃ y, 1 Ä‘iá»ƒm Ä‘áº¡t vÃ  1 Ä‘iá»ƒm cáº§n sá»­a.',
        kpi: 'CÃ³ Ä‘Ãºng 1 feedback tháº­t; 2-3 cÃ¢u lÃ  Ä‘á»§.',
      },
      {
        title: 'Há»i giÃ¡m sÃ¡t: â€œKhu vá»±c em vá»«a lÃ m thÆ°á»ng bá»‹ nháº¯c lá»—i gÃ¬ nháº¥t?â€ rá»“i ghi 1 lá»—i.',
        output: '1 ghi chÃº gá»“m khu vá»±c, lá»—i hay bá»‹ nháº¯c vÃ  cÃ¡ch kiá»ƒm láº¡i trÆ°á»›c bÃ n giao.',
        kpi: 'CÃ³ 1 lá»—i cá»¥ thá»ƒ vÃ  1 bÆ°á»›c kiá»ƒm láº¡i dá»… lÃ m trong ca sau.',
      },
      {
        title: 'Nhá» Ä‘á»“ng nghiá»‡p kiá»ƒm chÃ©o 1 khu vá»±c, ghi láº¡i 1 Ä‘iá»ƒm Ä‘áº¡t vÃ  1 Ä‘iá»ƒm cáº§n sá»­a.',
        output: '1 ghi chÃº 2 dÃ²ng: Ä‘iá»ƒm Ä‘áº¡t, Ä‘iá»ƒm cáº§n sá»­a, ngÆ°á»i kiá»ƒm chÃ©o.',
        kpi: 'CÃ³ ngÆ°á»i kiá»ƒm chÃ©o tháº­t vÃ  1 hÃ nh Ä‘á»™ng sá»­a ngay trong ca sau.',
      },
      {
        title: 'Há»i giÃ¡m sÃ¡t: â€œTrÆ°á»›c khi bÃ n giao khu vá»±c, em nÃªn kiá»ƒm ká»¹ nháº¥t má»¥c nÃ o?â€ rá»“i thÃªm má»¥c Ä‘Ã³ vÃ o checklist.',
        output: '1 checklist Ä‘Ã£ thÃªm Ä‘Ãºng 1 má»¥c tá»« feedback cá»§a giÃ¡m sÃ¡t.',
        kpi: 'Checklist cÃ³ má»¥c má»›i vÃ  báº¡n biáº¿t kiá»ƒm má»¥c Ä‘Ã³ trÆ°á»›c khi bÃ n giao.',
      },
    ]);
    return simpleActionTask(variant.title, 'Xin feedback ngáº¯n tá»« giÃ¡m sÃ¡t', variant.output, variant.kpi, week);
  }
  if (/checklist|sop|ca ve sinh|chuyen thanh checklist|khu vuc|dau viec/.test(normalized)) {
    const variant = pickWeekVariant(week, [
      {
        title: 'Viáº¿t checklist 7 Ã´ cho 1 khu vá»±c: rÃ¡c, bá»¥i, sÃ n, kÃ­nh/bá» máº·t, mÃ¹i, dá»¥ng cá»¥, bÃ n giao.',
        output: '1 áº£nh checklist 7 Ã´ Ä‘Ã£ tick thá»­ cho 1 khu vá»±c.',
        kpi: 'Checklist cÃ³ Ä‘á»§ 7 Ã´ vÃ  cÃ³ tráº¡ng thÃ¡i Ä‘áº¡t/chÆ°a Ä‘áº¡t cho tá»«ng Ã´.',
      },
      {
        title: 'TÃ¡ch viá»‡c vá»‡ sinh 1 khu vá»±c thÃ nh 3 bÆ°á»›c: chuáº©n bá»‹ dá»¥ng cá»¥, lÃ m sáº¡ch, kiá»ƒm trÆ°á»›c bÃ n giao.',
        output: '1 ghi chÃº 3 má»¥c, má»—i má»¥c cÃ³ 2 Ã´ tick dá»… lÃ m.',
        kpi: 'Äá»§ 3 bÆ°á»›c, tá»•ng khÃ´ng quÃ¡ 6 Ã´ tick Ä‘á»ƒ ngÆ°á»i má»›i nhÃ¬n lÃ  lÃ m Ä‘Æ°á»£c.',
      },
      {
        title: 'LÃ m checklist â€œdá»… bá»‹ nháº¯câ€: rÃ¡c sÃ³t, bá»¥i gÃ³c, vá»‡t nÆ°á»›c, mÃ¹i, thiáº¿u dá»¥ng cá»¥, chÆ°a bÃ n giao.',
        output: '1 checklist 6 Ã´ cho lá»—i dá»… gáº·p nháº¥t á»Ÿ khu vá»±c báº¡n phá»¥ trÃ¡ch.',
        kpi: 'Má»—i Ã´ cÃ³ Ä‘áº¡t/chÆ°a Ä‘áº¡t; Æ°u tiÃªn lá»—i tháº­t tá»«ng gáº·p.',
      },
    ]);
    return simpleActionTask(variant.title, 'Checklist vá»‡ sinh dÃ¹ng ngay trong ca', variant.output, variant.kpi, week);
  }
  if (/cv|linkedin|headline|bullet/.test(normalized)) {
    return simpleActionTask(
      'Viáº¿t 3 dÃ²ng CV vá»‡ sinh theo máº«u: phá»¥ trÃ¡ch khu vá»±c nÃ o, giáº£m lá»—i gÃ¬, ai xÃ¡c nháº­n.',
      'ÄÃ³ng gÃ³i kinh nghiá»‡m vá»‡ sinh vÃ o CV',
      '3 bullet CV ngáº¯n, má»—i bullet cÃ³ khu vá»±c, káº¿t quáº£ hoáº·c feedback.',
      'Äá»§ 3 bullet, má»—i bullet dÆ°á»›i 25 tá»« vÃ  cÃ³ báº±ng chá»©ng.',
      week
    );
  }
  if (/co hoi|apply|tin nhan|email|danh sach|cong ty|facility/.test(normalized)) {
    return simpleActionTask(
      'Lá»c 5 nÆ¡i Ä‘ang tuyá»ƒn vá»‡ sinh/team leader/facility support.',
      'TÃ¬m cÆ¡ há»™i vá»‡ sinh tráº£ tá»‘t hÆ¡n',
      '1 danh sÃ¡ch 5 nÆ¡i gá»“m tÃªn nÆ¡i, role, lÆ°Æ¡ng náº¿u cÃ³, link/áº£nh tin vÃ  bÆ°á»›c tiáº¿p theo.',
      'Äá»§ 5 nÆ¡i tháº­t; Ã­t nháº¥t 2 nÆ¡i cÃ³ lÆ°Æ¡ng hoáº·c ca lÃ m rÃµ.',
      week
    );
  }
  if (/deal|dam phan|de xuat|luong/.test(normalized)) {
    return simpleActionTask(
      'Viáº¿t script 5 cÃ¢u xin review lÆ°Æ¡ng dá»±a trÃªn khu vá»±c phá»¥ trÃ¡ch, lá»—i giáº£m vÃ  feedback giÃ¡m sÃ¡t.',
      'NÃ³i chuyá»‡n tÄƒng lÆ°Æ¡ng báº±ng báº±ng chá»©ng',
      '1 Ä‘oáº¡n script dÆ°á»›i 90 giÃ¢y, Ä‘á»c thÃ nh tiáº¿ng Ä‘Æ°á»£c.',
      'Script cÃ³ 3 pháº§n: viá»‡c Ä‘Ã£ lÃ m, sá»‘/báº±ng chá»©ng, Ä‘á» xuáº¥t má»©c hoáº·c lá»‹ch review.',
      week
    );
  }
  if (/case study|evidence|bang chung|artifact|portfolio|ho so|before-after/.test(normalized)) {
    const variant = pickWeekVariant(week, [
      {
        title: 'Gom 3 báº±ng chá»©ng nhá» vÃ o 1 ghi chÃº: checklist Ä‘Ã£ tick, áº£nh trÆ°á»›c-sau, 1 feedback hoáº·c log lá»—i.',
        output: '1 ghi chÃº hoáº·c folder cÃ³ Ä‘Ãºng 3 má»¥c; má»—i má»¥c cÃ³ ngÃ y vÃ  mÃ´ táº£ 1 dÃ²ng.',
        kpi: 'Äá»§ 3 má»¥c nhá», khÃ´ng yÃªu cáº§u file Ä‘áº¹p; chá»‰ cáº§n quáº£n lÃ½ nhÃ¬n hiá»ƒu báº¡n Ä‘Ã£ lÃ m gÃ¬.',
      },
      {
        title: 'Chá»¥p 1 áº£nh trÆ°á»›c-sau cá»§a khu vá»±c Ä‘Æ°á»£c phÃ©p chá»¥p, rá»“i che thÃ´ng tin ná»™i bá»™ náº¿u cÃ³.',
        output: '1 cáº·p áº£nh hoáº·c ghi chÃº mÃ´ táº£ trÆ°á»›c-sau cá»§a Ä‘Ãºng 1 khu vá»±c.',
        kpi: 'CÃ³ Ä‘Ãºng 1 báº±ng chá»©ng trá»±c quan, khÃ´ng lá»™ thÃ´ng tin khÃ¡ch/há»£p Ä‘á»“ng/ná»™i bá»™.',
      },
      {
        title: 'Viáº¿t mini case 5 dÃ²ng: khu vá»±c ban Ä‘áº§u tháº¿ nÃ o, báº¡n lÃ m gÃ¬, káº¿t quáº£ ra sao, ai xÃ¡c nháº­n, bÃ i há»c.',
        output: '1 Ä‘oáº¡n 5 dÃ²ng, má»—i dÃ²ng tráº£ lá»i Ä‘Ãºng 1 Ã½.',
        kpi: 'CÃ³ ngÆ°á»i/xÃ¡c nháº­n hoáº·c dáº¥u hiá»‡u káº¿t quáº£; khÃ´ng cáº§n vÄƒn hay, chá»‰ cáº§n rÃµ viá»‡c.',
      },
      {
        title: 'Chá»n 1 ca lÃ m tá»‘t nháº¥t tuáº§n, lÆ°u 2 báº±ng chá»©ng: checklist hoÃ n táº¥t vÃ  1 feedback/log bÃ n giao.',
        output: '1 ghi chÃº cÃ³ ngÃ y ca lÃ m, checklist, feedback hoáº·c log bÃ n giao.',
        kpi: 'Äá»§ 2 báº±ng chá»©ng nhá», dÃ¹ng Ä‘Æ°á»£c Ä‘á»ƒ ká»ƒ khi xin review lÆ°Æ¡ng.',
      },
    ]);
    return simpleActionTask(variant.title, 'Gom báº±ng chá»©ng vá»‡ sinh khÃ´ng rÆ°á»m rÃ ', variant.output, variant.kpi, week);
  }
  return simpleActionTask(
    'Chá»n 1 khu vá»±c trong ca gáº§n nháº¥t, ghi 3 viá»‡c Ä‘Ã£ lÃ m tá»‘t vÃ  1 lá»—i cáº§n trÃ¡nh ca sau.',
    'Tá»± review ca vá»‡ sinh',
    '1 ghi chÃº 4 dÃ²ng: 3 viá»‡c tá»‘t, 1 lá»—i cáº§n trÃ¡nh, ngÃ y ca lÃ m.',
    'Ghi xong trong 10 phÃºt sau ca hoáº·c ngay khi nhá»› láº¡i ca gáº§n nháº¥t.',
    week
  );
}

function buildMarketingManagerTask(task: string, week: WeekPlan): RoadmapActionTask {
  const normalized = normalizeForRoadmapQuality(task);
  if (/role|tra cao|luong muc tieu|muc luong|jd|tuyen dung|band/.test(normalized)) {
    return simpleActionTask(
      'Mo 5 JD Brand Manager/Marketing Manager tra cao hon, chep ra 5 yeu cau cap quan ly lap lai: brand strategy, P&L, budget, media mix, agency va brand health.',
      'Doc JD cap Brand Manager va chon track dung level',
      '1 bang gom 5 JD, muc luong neu co, 5 yeu cau lap lai, bang chung ban da co va bang chung con thieu.',
      'Khong ghi skill execution nhu Canva/Photoshop/edit video; moi JD phai co it nhat 1 keyword cap manager: budget, P&L, GTM, brand health, agency hoac market share.',
      week
    );
  }
  if (/kpi|dashboard|so lieu|chi so|impact|do impact/.test(normalized)) {
    return simpleActionTask(
      'Lap dashboard 1 trang cho Brand Manager: awareness, consideration, market share/penetration, revenue uplift, CAC/ROAS neu co, campaign budget va learning sau campaign.',
      'Brand dashboard cap quan ly',
      '1 dashboard 6-8 chi so, co cot baseline, ket qua hien tai, muc tieu va hanh dong tiep theo.',
      'Dashboard phai noi duoc tac dong business/brand; khong chi dung reach/like/CTR rieng le.',
      week
    );
  }
  if (/brief|agency|creative|media|campaign|launch|go-to-market|gtm|thuong hieu|brand/.test(normalized)) {
    return simpleActionTask(
      'Viet 1 brand/campaign brief cap manager: business problem, target segment, insight, positioning, key message, budget guardrail, KPI va tieu chi duyet creative.',
      'Brand strategy va agency briefing',
      '1 brief 1-2 trang co du insight, positioning, KPI, budget va checklist duyet creative/media.',
      'Nguoi doc phai thay ro ban dang quan tri huong di thuong hieu, khong phai tu tay lam tung post/video.',
      week
    );
  }
  if (/case study|evidence|bang chung|artifact|portfolio|ho so|before-after/.test(normalized)) {
    return simpleActionTask(
      'Dong goi 1 campaign case study cap manager theo format: business objective - insight - strategy - execution governance - budget - result - learning - next bet.',
      'Case study tang truong thuong hieu co so lieu',
      '1 case study 1-2 trang co so lieu ve brand/business va vai tro owner cua ban trong quyet dinh.',
      'Case phai co it nhat 3 so do: brand health/awareness/consideration, revenue/market share/penetration, budget efficiency hoac campaign ROI.',
      week
    );
  }
  if (/feedback|review|quote|stakeholder|sep|ban giam doc|management/.test(normalized)) {
    return simpleActionTask(
      'Xin 1 feedback tu sep/sales/trade/agency ve 1 quyet dinh brand cua ban: insight co dung khong, brief co ro khong, KPI co giup ra quyet dinh khong.',
      'Stakeholder management cap brand manager',
      '1 note feedback gom nguoi gop y, quyet dinh duoc review, diem manh, diem can sua va hanh dong tiep theo.',
      'Feedback phai lien quan den quyet dinh cap quan ly, khong chi nhan xet file thiet ke/noi dung.',
      week
    );
  }
  if (/deal|dam phan|de xuat|luong/.test(normalized)) {
    return simpleActionTask(
      'Viet proposal review luong cap Brand Manager: scope dang owner, budget/campaign da quan ly, KPI brand/business da doi, va 2 scope cao hon co the nhan tiep.',
      'De xuat tang luong bang business impact',
      '1 script 90 giay va 1 memo ngan gui sep gom 3 ket qua, 2 bang chung, 1 de xuat muc/lich review.',
      'Script phai noi bang ngon ngu business: revenue, market share, brand health, budget efficiency, stakeholder ownership.',
      week
    );
  }
  return simpleActionTask(
    'Chon 1 campaign/brand problem dang co va viet decision memo 1 trang: van de, insight, 3 option, option chon, rui ro, KPI va nguoi can dong thuan.',
    'Decision memo cap Brand Manager',
    '1 decision memo 1 trang co the dua cho sep doc trong 5 phut.',
    'Co ro quyet dinh can ra, so lieu nen xem, rui ro va next action; khong phai checklist lam content.',
    week
  );
}

function buildRestaurantManagerTask(task: string, week: WeekPlan): RoadmapActionTask {
  const normalized = normalizeForRoadmapQuality(task);
  if (/role|tra cao|luong muc tieu|muc luong|jd|tuyen dung|band/.test(normalized)) {
    return simpleActionTask(
      'Má»Ÿ 5 JD Restaurant Manager/F&B Ops tráº£ cao hÆ¡n, chÃ©p ra yÃªu cáº§u láº·p láº¡i: roster, labor cost, food cost, service quality, complaint recovery vÃ  P&L.',
      'Äá»c JD quáº£n lÃ½ nhÃ  hÃ ng Ä‘Ãºng level',
      '1 báº£ng 5 JD gá»“m má»©c lÆ°Æ¡ng, KPI váº­n hÃ nh, báº±ng chá»©ng Ä‘Ã£ cÃ³ vÃ  báº±ng chá»©ng cÃ²n thiáº¿u.',
      'Má»—i JD pháº£i cÃ³ keyword cáº¥p quáº£n lÃ½; khÃ´ng láº¥y recipe/plating/HACCP lÃ m skill chÃ­nh náº¿u role khÃ´ng pháº£i báº¿p.',
      week
    );
  }
  if (/kpi|dashboard|so lieu|chi so|impact|do impact/.test(normalized)) {
    return simpleActionTask(
      'Láº­p dashboard ca/thÃ¡ng gá»“m doanh thu, table turn, labor cost, food cost/waste, complaint recovery, review score vÃ  training completion.',
      'Restaurant operations dashboard',
      '1 dashboard 6-8 chá»‰ sá»‘ cÃ³ baseline, hiá»‡n táº¡i, má»¥c tiÃªu vÃ  hÃ nh Ä‘á»™ng tiáº¿p theo.',
      'Dashboard pháº£i giÃºp owner/GM ra quyáº¿t Ä‘á»‹nh vá» ca, chi phÃ­ hoáº·c cháº¥t lÆ°á»£ng dá»‹ch vá»¥.',
      week
    );
  }
  if (/sop|ca|roster|staff|nhan su|training|dao tao|floor|service|complaint/.test(normalized)) {
    return simpleActionTask(
      'Chá»n 1 ca gáº§n nháº¥t, ghi 3 Ä‘iá»ƒm ngháº½n: thiáº¿u ngÆ°á»i, bill/order lá»—i, complaint hoáº·c tá»‘c Ä‘á»™ phá»¥c vá»¥; viáº¿t cÃ¡ch sá»­a cho ca sau.',
      'Floor control vÃ  service recovery',
      '1 incident/action log cÃ³ ngÃ y ca, váº¥n Ä‘á», ngÆ°á»i phá»¥ trÃ¡ch, háº¡n sá»­a vÃ  káº¿t quáº£ mong Ä‘á»£i.',
      'Má»—i váº¥n Ä‘á» cÃ³ 1 hÃ nh Ä‘á»™ng cá»¥ thá»ƒ trong 7 ngÃ y vÃ  1 ngÆ°á»i xÃ¡c nháº­n.',
      week
    );
  }
  if (/deal|dam phan|de xuat|luong/.test(normalized)) {
    return simpleActionTask(
      'Viáº¿t memo xin review lÆ°Æ¡ng: scope quáº£n lÃ½, 3 KPI ca Ä‘Ã£ cáº£i thiá»‡n, 2 báº±ng chá»©ng, 1 má»©c/lá»‹ch review Ä‘á» xuáº¥t.',
      'Äá» xuáº¥t tÄƒng lÆ°Æ¡ng báº±ng KPI váº­n hÃ nh nhÃ  hÃ ng',
      '1 memo ngáº¯n vÃ  script 90 giÃ¢y cÃ³ sá»‘ liá»‡u ca/thÃ¡ng.',
      'Script pháº£i nÃ³i báº±ng ngÃ´n ngá»¯ operations: revenue, chi phÃ­, service quality, complaint recovery vÃ  team stability.',
      week
    );
  }
  return simpleActionTask(
    'Kiá»ƒm tra 1 ca lÃ m: roster, doanh thu, complaint, order/bill lá»—i, food/labor cost; chá»n 1 Ä‘iá»ƒm cáº§n sá»­a trÆ°á»›c tuáº§n sau.',
    'Quáº£n lÃ½ ca nhÃ  hÃ ng báº±ng KPI Ä‘Æ¡n giáº£n',
    '1 note 5 dÃ²ng cÃ³ sá»‘ liá»‡u hoáº·c báº±ng chá»©ng Ä‘Æ°á»£c phÃ©p chia sáº».',
    'CÃ³ 1 hÃ nh Ä‘á»™ng sá»­a ca sau vÃ  1 ngÆ°á»i xÃ¡c nháº­n.',
    week
  );
}

function buildRestaurantFrontlineTask(task: string, week: WeekPlan): RoadmapActionTask {
  const normalized = normalizeForRoadmapQuality(task);
  if (/role|tra cao|luong muc tieu|muc luong|jd|tuyen dung|band/.test(normalized)) {
    return simpleActionTask(
      'Mo 5 JD phuc vu/thu ngan nha hang tra tot hon, chep ra yeu cau lap lai: POS, order dung, upsell, handover, service SOP va complaint.',
      'Doc JD frontline nha hang dung nghe',
      '1 bang 5 JD gom muc luong, 5 yeu cau lap lai, bang chung da co va bang chung con thieu.',
      'Khong bien thanh task P&L/manager; moi bang chung phai lam duoc trong 1-2 ca.',
      week
    );
  }
  if (/kpi|dashboard|so lieu|chi so|impact|do impact/.test(normalized)) {
    return simpleActionTask(
      'Lap log 10 bill/ban: order dung/sai, bill loi, upsell neu co, complaint/request va ai xac nhan.',
      'Do KPI POS va service tai ban',
      '1 bang hoac ghi chu 10 dong tu ca gan nhat, an thong tin khach.',
      'Co it nhat 3 chi so: order accuracy, bill error, upsell/request/complaint va feedback quan ly ca.',
      week
    );
  }
  if (/complaint|khach|ban|pos|bill|order|handover|upsell|sop/.test(normalized)) {
    return simpleActionTask(
      'Viet checklist 6 buoc cho 1 ca: nhan ban/order, nhap POS, confirm mon, theo doi request, bill, ban giao loi/request.',
      'Table service/POS SOP',
      '1 checklist 6 buoc da tick thu trong 1 ca.',
      'Checklist ngan de nguoi moi nhin vao lam duoc; co 1 loi can tranh ca sau.',
      week
    );
  }
  return simpleActionTask(
    'Chon 1 ca gan nhat, ghi 3 viec lam tot va 1 loi can tranh: order, bill, upsell, complaint hoac handover.',
    'Tu review ca phuc vu/thu ngan',
    '1 ghi chu 4 dong co ngay ca va feedback neu co.',
    'Lam trong 10 phut sau ca hoac khi nho lai ca gan nhat.',
    week
  );
}

function buildHotelManagerTask(task: string, week: WeekPlan): RoadmapActionTask {
  const normalized = normalizeForRoadmapQuality(task);
  if (/role|tra cao|luong muc tieu|muc luong|jd|tuyen dung|band/.test(normalized)) {
    return simpleActionTask(
      'Mo 5 JD Hotel Manager/Operations Manager tra cao hon, chep yeu cau lap lai: occupancy, ADR, RevPAR, staffing, review score, complaint SLA va P&L.',
      'Doc JD quan ly khach san dung level',
      '1 bang 5 JD gom muc luong, KPI van hanh, bang chung da co va bang chung con thieu.',
      'Moi JD phai co keyword hotel operations; khong ha xuong task le tan ca nhan.',
      week
    );
  }
  if (/kpi|dashboard|so lieu|chi so|impact|do impact/.test(normalized)) {
    return simpleActionTask(
      'Lap operating dashboard 1 trang: occupancy, ADR, RevPAR, review score, request SLA, complaint recovery, staffing va budget/cost note.',
      'Hotel operations dashboard',
      '1 dashboard co baseline, hien tai, muc tieu va action log 30 ngay.',
      'Dashboard phai giup owner/GM nhin ra 3 viec can toi uu thang nay.',
      week
    );
  }
  if (/sop|staff|nhan su|complaint|review|ota|revenue|booking|service/.test(normalized)) {
    return simpleActionTask(
      'Chon 1 van de van hanh khach san: review xau, complaint qua SLA, phong trong, staffing lech; viet root cause va 3 hanh dong sua.',
      'SOP audit va service recovery cap quan ly',
      '1 action log co van de, nguyen nhan, nguoi owner, deadline va KPI theo doi.',
      'Co 1 KPI truoc/sau hoac feedback xac nhan sau khi sua.',
      week
    );
  }
  return simpleActionTask(
    'Tong hop 7 ngay van hanh: occupancy, review/complaint, staffing, request SLA va 1 de xuat toi uu doanh thu/dich vu.',
    'Quan ly khach san bang operating review',
    '1 note 1 trang co 5 chi so va 3 action tiep theo.',
    'Co so lieu duoc phep chia se va khong lo thong tin khach.',
    week
  );
}

function buildHotelFrontlineTask(task: string, week: WeekPlan): RoadmapActionTask {
  const normalized = normalizeForRoadmapQuality(task);
  if (/role|tra cao|luong muc tieu|muc luong|jd|tuyen dung|band/.test(normalized)) {
    return simpleActionTask(
      'Mo 5 JD le tan/front desk tra tot hon, chep yeu cau lap lai: PMS, check-in/out, guest request SLA, upsell, complaint recovery va handover.',
      'Doc JD front desk dung nghe',
      '1 bang 5 JD gom muc luong, yeu cau lap lai, bang chung da co va bang chung con thieu.',
      'Khong bien thanh KPI GM nhu P&L/RevPAR lam task ca nhan.',
      week
    );
  }
  if (/kpi|dashboard|so lieu|chi so|impact|do impact/.test(normalized)) {
    return simpleActionTask(
      'Lap log 10 check-in/request: booking dung tren PMS, thoi gian xu ly, upsell neu co, complaint va handover.',
      'Do KPI le tan/front desk',
      '1 bang 10 dong da an thong tin khach.',
      'Co it nhat 3 chi so: PMS accuracy, request SLA, complaint recovery, upsell/review feedback.',
      week
    );
  }
  if (/check|pms|booking|guest|request|complaint|handover|upsell/.test(normalized)) {
    return simpleActionTask(
      'Viet checklist 7 buoc cho 1 ca front desk: xem booking, check-in, request, upsell, complaint, note PMS va handover.',
      'Check-in/check-out SOP va PMS accuracy',
      '1 checklist 7 buoc da tick thu trong 1 ca.',
      'Checklist ngan, co 1 loi de tranh va 1 muc can ban giao ca sau.',
      week
    );
  }
  return simpleActionTask(
    'Chon 1 ca gan nhat, ghi 3 viec lam tot va 1 loi can tranh: booking, check-in, request, complaint hoac handover.',
    'Tu review ca le tan/front desk',
    '1 ghi chu 4 dong co ngay ca va feedback neu co.',
    'Lam trong 10 phut sau ca hoac khi nho lai ca gan nhat.',
    week
  );
}

function buildDentalTask(task: string, week: WeekPlan): RoadmapActionTask {
  const normalized = normalizeForRoadmapQuality(task);
  if (/role|tra cao|luong muc tieu|muc luong|jd|tuyen dung|band/.test(normalized)) {
    return simpleActionTask(
      'Mo 5 JD nha si/clinic premium, chep ra yeu cau lap lai: chan doan, treatment plan, vo khuan, case lam sang, X-quang/CBCT, giao tiep benh nhan va tai kham.',
      'Doc JD nha si dung nghe',
      '1 bang 5 JD gom muc luong, yeu cau clinical, bang chung da co va bang chung con thieu.',
      'Khong dung skill van phong generic nhu Excel/Canva/CV; moi bang chung phai lien quan den ca dieu tri nha khoa.',
      week
    );
  }
  if (/kpi|dashboard|so lieu|chi so|impact|do impact/.test(normalized)) {
    return simpleActionTask(
      'Lap log 10 ca nha khoa da an danh: chan doan, treatment plan, chair time, tai kham, bien chung/rework neu co va feedback benh nhan/bac si phu trach.',
      'Do KPI clinical nha khoa',
      '1 bang/log 10 dong da an thong tin benh nhan.',
      'Co it nhat 4 chi so: treatment plan accepted, follow-up adherence, complication/rework, patient satisfaction va infection-control checklist.',
      week
    );
  }
  if (/case|benh an|x-quang|x quang|cbct|photo|chan doan|treatment|dieu tri|tai kham|vo khuan|infection/.test(normalized)) {
    return simpleActionTask(
      'Dong goi 1 case nha khoa an danh: trieu chung, chan doan, phim/anh duoc phep, ke hoach dieu tri, buoc vo khuan, tai kham va bai hoc.',
      'Case lam sang nha khoa an danh',
      '1 case note 1 trang, khong lo ten/SDT/hinh nhan dien benh nhan.',
      'Nguoi doc thay ro clinical reasoning, quy trinh an toan va ket qua follow-up.',
      week
    );
  }
  if (/feedback|review|benh nhan|giao tiep|tu van/.test(normalized)) {
    return simpleActionTask(
      'Viet script tu van 1 ca dieu tri: van de rang-mieng, lua chon dieu tri, rui ro, chi phi/thoi gian, cham soc sau dieu tri va lich tai kham.',
      'Tu van benh nhan nha khoa',
      '1 script 6 buoc co ngon ngu de hieu cho benh nhan.',
      'Script khong hua chac ket qua; co muc rui ro, cham soc sau dieu tri va tai kham.',
      week
    );
  }
  return simpleActionTask(
    'Chon 1 ca nha khoa gan nhat va ghi 5 dong: chan doan, treatment plan, buoc vo khuan, follow-up, feedback/bai hoc.',
    'Tu review ca nha khoa',
    '1 ghi chu 5 dong da an thong tin benh nhan.',
    'Co 1 diem can cai thien cho ca tiep theo va bang chung duoc phep luu.',
    week
  );
}

function buildDentalAssistantTask(task: string, week: WeekPlan): RoadmapActionTask {
  const normalized = normalizeForRoadmapQuality(task);
  if (/role|tra cao|luong muc tieu|muc luong|jd|tuyen dung|band/.test(normalized)) {
    return simpleActionTask(
      'Mo 5 JD tro ly nha khoa/senior dental assistant, chep yeu cau lap lai: chuan bi ghe, vo khuan, suction/chuyen dung cu, huong dan benh nhan, lich tai kham va ton kho vat tu.',
      'Doc JD tro ly nha khoa dung nghe',
      '1 bang 5 JD gom muc luong, yeu cau ca lam, bang chung da co va bang chung con thieu.',
      'Moi bang chung phai lam duoc trong 1-2 ca nha khoa, khong dung skill van phong generic.',
      week
    );
  }
  if (/kpi|dashboard|so lieu|chi so|impact|do impact/.test(normalized)) {
    return simpleActionTask(
      'Lap log 10 ca ho tro: thoi gian chuan bi ghe, dung cu/vo khuan, suction/chuyen dung cu, huong dan sau dieu tri, tai kham va feedback bac si.',
      'Do KPI tro ly nha khoa',
      '1 bang/log 10 dong da an thong tin benh nhan.',
      'Co it nhat 4 chi so: setup time, vo khuan khong loi, ho tro dung nhip, tai kham dung va feedback bac si.',
      week
    );
  }
  return simpleActionTask(
    'Lam checklist 8 buoc cho 1 ca nha khoa: chuan bi ghe, dung cu, vo khuan, don benh nhan, suction/chuyen dung cu, don dep, huong dan, hen tai kham.',
    'Chairside assisting va infection control',
    '1 checklist 8 buoc da tick thu trong 1 ca.',
    'Checklist ngan, dung quy trinh phong kham va co feedback bac si/phu trach ca.',
    week
  );
}

function buildInsuranceTask(task: string, week: WeekPlan): RoadmapActionTask {
  const normalized = normalizeForRoadmapQuality(task);
  if (/role|tra cao|luong muc tieu|muc luong|jd|tuyen dung|band/.test(normalized)) {
    return simpleActionTask(
      'Mo 5 JD bao hiem phi nhan tho tra cao hon, chep yeu cau lap lai: underwriting risk, policy wording, claims/boi thuong, renewal, broker/account va loss ratio.',
      'Doc JD bao hiem phi nhan tho dung track',
      '1 bang 5 JD gom role muc tieu, muc luong neu co, KPI chinh, bang chung da co va bang chung con thieu.',
      'Moi JD phai co keyword bao hiem phi nhan tho; khong dung FP&A, finance analyst, ke toan, controller, CFA/ACCA lam track chinh.',
      week
    );
  }
  if (/kpi|dashboard|so lieu|chi so|impact|do impact|loss ratio|renewal|sla|premium/.test(normalized)) {
    return simpleActionTask(
      'Lap dashboard bao hiem phi nhan tho gom quote/underwriting SLA, renewal ratio, loss ratio, claim cycle time, claim accuracy, premium written va broker/client retention.',
      'KPI underwriting/claims/renewal',
      '1 bang 6-8 chi so co baseline, muc tieu 30 ngay, nguon du lieu duoc phep dung va action tiep theo.',
      'Co it nhat 4 chi so dung nghe: underwriting SLA, renewal, loss ratio, claim cycle time, premium written hoac broker retention.',
      week
    );
  }
  if (/claim|claims|boi thuong|giam dinh|ton that|chung tu/.test(normalized)) {
    return simpleActionTask(
      'Dong goi 1 case claims/boi thuong an thong tin: loai ton that, chung tu can co, coverage/loai tru lien quan, buoc xu ly, SLA va ket qua.',
      'Claims/boi thuong va giam dinh ton that',
      '1 case note 1 trang khong lo thong tin khach/hop dong noi bo.',
      'Nguoi doc thay ro quy trinh claim, coverage decision, SLA va cach giam loi ho so.',
      week
    );
  }
  if (/underwriting|quote|risk|rui ro|policy|wording|coverage|loai tru|premium/.test(normalized)) {
    return simpleActionTask(
      'Viet 1 underwriting case an thong tin: doi tuong bao hiem, rui ro chinh, coverage/loai tru, premium logic, thong tin can xin them va quyet dinh de xuat.',
      'Underwriting risk va policy wording',
      '1 case note co checklist rui ro, dieu khoan coverage/loai tru va ly do de xuat.',
      'Case khong bien thanh financial modeling; phai noi duoc rui ro bao hiem va dieu khoan hop dong.',
      week
    );
  }
  if (/broker|client|renewal|khach hang|account|feedback/.test(normalized)) {
    return simpleActionTask(
      'Lap renewal/account note cho 1 khach da an thong tin: nhu cau, lich su claim, premium, risk change, objection, next step va feedback broker/khach hang.',
      'Broker/client account va renewal',
      '1 note renewal/account 1 trang co next step va nguoi xac nhan neu co.',
      'Co lien ket ro toi renewal ratio, retention, premium hoac chat luong tu van coverage.',
      week
    );
  }
  return simpleActionTask(
    'Chon 1 ho so bao hiem phi nhan tho gan nhat va ghi 5 dong: rui ro, coverage/loai tru, premium/claim/renewal, SLA va bai hoc.',
    'Tu review case bao hiem phi nhan tho',
    '1 ghi chu 5 dong da an thong tin khach va hop dong.',
    'Co 1 diem can cai thien cho ho so tiep theo va bang chung duoc phep luu.',
    week
  );
}

function buildTaskFromText(task: string, week: WeekPlan, jobTitle: string, compass: ReturnType<typeof getCareerCompassContext>): RoadmapActionTask {
  const isPilot = isPilotRole(jobTitle);
  const isAviation = isAviationRole(jobTitle);
  const isPerformer = isMcRole(jobTitle);
  const isFresh = isFreshOrUndirectedRole(jobTitle);
  const tourismProfile = getTourismRoleProfile(jobTitle);
  const isTourism = Boolean(tourismProfile);
  const isHospitality = isHospitalityRole(jobTitle) && !isTourism;
  const isCleaning = isCleaningRole(jobTitle);
  const isEnglishTeacher = isEnglishTeacherRole(jobTitle);
  const isPublicSubjectTeacher = isPublicSubjectTeacherRole(jobTitle);
  const isSchoolHealthcare = isSchoolHealthcareRole(jobTitle);
  const isLanguageCenterManager = isLanguageCenterManagerRole(jobTitle);
  const isInsurance = isInsuranceRole(jobTitle);
  const normalizedTask = normalizeForRoadmapQuality(task);
  if (isLanguageCenterManager && /kpi|dashboard|so lieu|chi so|impact|trial|enrollment|class fill|teacher utilization|retention|renewal|complaint|revenue/.test(normalizedTask)) {
    return simpleActionTask(
      'Lap dashboard quan ly trung tam ngoai ngu gom lead-to-enrollment, trial-to-paid, active students, class fill rate, teacher utilization, retention/renewal, dropout/refund, parent complaint SLA va revenue per class.',
      'Dashboard van hanh trung tam ngoai ngu',
      '1 dashboard 8-10 chi so co moc nen, nguon du lieu va action 30 ngay cho tung chi so yeu.',
      'Co it nhat 4 chi so quan ly cap trung tam: lead-to-enrollment, class fill, teacher utilization, retention/renewal, complaint SLA hoac revenue per class.',
      week
    );
  }
  if (isLanguageCenterManager && /role|tra cao|luong muc tieu|muc luong|jd|tuyen dung|band/.test(normalizedTask)) {
    return simpleActionTask(
      'Chon 3 track dung cap quan ly trung tam: Language Center Manager, Academic Operations Manager, Campus Operations Manager hoac Education Growth Lead; moi track ghi KPI va scope phu trach.',
      'Doc JD quan ly trung tam va chon track dung cap bac',
      '1 bang gom 3 track, muc luong muc tieu, scope, KPI, bang chung da co va bang chung con thieu.',
      'Moi track co keyword cap quan ly: enrollment funnel, class fill, teacher utilization, retention, complaint SLA, revenue per class hoac multi-center operations.',
      week
    );
  }
  if (isLanguageCenterManager) {
    return simpleActionTask(
      'Chon 1 van de van hanh trung tam trong 30 ngay: lop thieu hoc vien, giao vien bi trong gio, trial khong chuyen phi, dropout/refund tang hoac complaint qua SLA; viet root cause va 3 action quan ly.',
      'Van hanh lop, roster giao vien va retention',
      '1 action log co owner, deadline, chi so truoc-sau va nguoi xac nhan trong trung tam.',
      'Sau 7-14 ngay co thay doi do duoc ve class fill, teacher utilization, trial-to-paid, retention/renewal, complaint SLA hoac revenue per class.',
      week
    );
  }
  if (isDentalRoadmapRole(jobTitle)) return buildDentalTask(task, week);
  if (isDentalAssistantRoadmapRole(jobTitle)) return buildDentalAssistantTask(task, week);
  if (isInsurance) return buildInsuranceTask(task, week);
  if (isMarketingManagerRoadmapRole(jobTitle)) return buildMarketingManagerTask(task, week);
  if (isRestaurantManagerRoadmapRole(jobTitle)) return buildRestaurantManagerTask(task, week);
  if (isRestaurantFrontlineRoadmapRole(jobTitle)) return buildRestaurantFrontlineTask(task, week);
  if (isHotelManagerRoadmapRole(jobTitle)) return buildHotelManagerTask(task, week);
  if (isHotelFrontlineRoadmapRole(jobTitle)) return buildHotelFrontlineTask(task, week);
  if (isTourism) return buildTourismTask(task, week, tourismProfile);
  if (isHospitality) return buildHospitalityTask(task, week);
  if (isCleaning) return buildCleaningTask(task, week);
  if (isPilot && /role|tra cao|luong muc tieu|muc luong|jd|tuyen dung|band/.test(normalizedTask)) {
    return simpleActionTask(
      'Chon 3 track tra cao hon cho pilot: First Officer type-rated, Captain upgrade, Training Captain/Check Pilot; moi track ghi bang chung con thieu.',
      'Doc JD pilot va chon track flight deck dung nghe',
      '1 bang gom 3 track, muc luong muc tieu, yeu cau chinh, bang chung da co va bang chung con thieu.',
      'Moi track co 3 keyword dung nghe: flight hours, type rating/recurrent, simulator check, SOP safety, CRM/ATC hoac route-aircraft qualification.',
      week
    );
  }
  if (isPilot && /kpi|dashboard|so lieu|chi so|impact|do impact/.test(normalizedTask)) {
    return simpleActionTask(
      'Lap bang KPI pilot gom: flight hours, recurrent check, simulator score, SOP compliance, safety/incident-free record, CRM/ATC feedback va route-aircraft qualification.',
      'Do KPI flight deck',
      '1 bang 6-7 cot, chi ghi thong tin duoc phep chia se va an thong tin nhay cam theo quy dinh hang bay.',
      'Co it nhat 3 chi so co bang chung: logbook/flight hours, recurrent/simulator check, feedback instructor/check pilot hoac route-aircraft readiness.',
      week
    );
  }
  if (isPilot && /sop|simulator|recurrent|type rating|flight hours|logbook|crm|atc|route|aircraft|checklist|debrief|safety/.test(normalizedTask)) {
    return simpleActionTask(
      'Viet 1 flight deck case 5 dong: boi canh, SOP ap dung, CRM/ATC diem chinh, ket qua an toan, debrief/bai hoc.',
      'SOP flight deck, CRM/ATC va simulator evidence',
      '1 case note da an thong tin nhay cam kem bang chung duoc phep: logbook summary, simulator/recurrent note hoac feedback.',
      'Nguoi doc thay ro quy trinh an toan, quyet dinh cockpit va bang chung duoc phep chia se; khong co ngon ngu cabin crew.',
      week
    );
  }
  if (isSchoolHealthcare && /kpi|dashboard|so lieu|chi so|impact/.test(normalizedTask)) {
    return simpleActionTask(
      'Láº­p báº£ng KPI y táº¿ há»c Ä‘Æ°á»ng: thá»i gian pháº£n á»©ng, há»“ sÆ¡ sá»©c khá»e, sá»‘ ca sÆ¡ cá»©u/chuyá»ƒn tuyáº¿n, thuá»‘c/dá»‹ á»©ng vÃ  feedback nhÃ  trÆ°á»ng-phá»¥ huynh.',
      'Äo KPI y táº¿ há»c Ä‘Æ°á»ng',
      '1 báº£ng 6 cá»™t cÃ³ 5-10 dÃ²ng ca tháº­t hoáº·c mÃ´ phá»ng Ä‘Ã£ áº©n thÃ´ng tin há»c sinh.',
      'CÃ³ Ã­t nháº¥t 3 chá»‰ sá»‘ theo dÃµi Ä‘Æ°á»£c vÃ  1 viá»‡c cáº§n sá»­a trong tuáº§n sau.',
      week
    );
  }
  if (isSchoolHealthcare && /role|tra cao|luong muc tieu|muc luong|jd|tuyen dung/.test(normalizedTask)) {
    return simpleActionTask(
      'Chá»n 3 hÆ°á»›ng tráº£ cao hÆ¡n cho y táº¿ há»c Ä‘Æ°á»ng: school nurse senior, Ä‘iá»u phá»‘i an toÃ n sá»©c khá»e há»c Ä‘Æ°á»ng hoáº·c phÃ²ng khÃ¡m nhi há»£p tÃ¡c trÆ°á»ng há»c.',
      'Äá»c JD y táº¿ há»c Ä‘Æ°á»ng vÃ  chá»n track Ä‘Ãºng nghá»',
      '1 báº£ng gá»“m 3 role, má»©c lÆ°Æ¡ng má»¥c tiÃªu, yÃªu cáº§u chÃ­nh, báº±ng chá»©ng Ä‘Ã£ cÃ³ vÃ  báº±ng chá»©ng cÃ²n thiáº¿u.',
      'Má»—i role cÃ³ 1 JD/link/áº£nh tin tuyá»ƒn dá»¥ng vÃ  3 keyword nÄƒng lá»±c Ä‘Ãºng nghá» y táº¿ há»c Ä‘Æ°á»ng.',
      week
    );
  }
  if (isSchoolHealthcare && /so cuu|thuoc|di ung|tiem chung|benh truyen nhiem|chuyen tuyen|checklist|protocol|su co|ho so/.test(normalizedTask)) {
    return simpleActionTask(
      'LÃ m 1 checklist y táº¿ há»c Ä‘Æ°á»ng cho 1 tÃ¬nh huá»‘ng cá»¥ thá»ƒ: tiáº¿p nháº­n, sÆ¡ cá»©u, gá»i phá»¥ huynh, chuyá»ƒn tuyáº¿n, ghi log vÃ  bÃ n giao.',
      'SÆ¡ cá»©u há»c Ä‘Æ°á»ng vÃ  protocol sá»± cá»‘',
      '1 checklist 6 bÆ°á»›c vÃ  1 log máº«u Ä‘Ã£ áº©n thÃ´ng tin há»c sinh.',
      'NgÆ°á»i má»›i Ä‘á»c vÃ o biáº¿t bÆ°á»›c tiáº¿p theo lÃ  gÃ¬; khÃ´ng bá» sÃ³t má»¥c gá»i phá»¥ huynh/chuyá»ƒn tuyáº¿n/ghi log.',
      week
    );
  }
  if (isPublicSubjectTeacher && /kpi|dashboard|so lieu|chi so|impact|do impact|diem|tien bo/.test(normalizedTask)) {
    return simpleActionTask(
      'Láº­p báº£ng tiáº¿n bá»™ há»c sinh cho 1 lá»›p/nhÃ³m: Ä‘iá»ƒm trÆ°á»›c-sau, tá»· lá»‡ hoÃ n thÃ nh bÃ i, lá»—i thÆ°á»ng gáº·p, nhÃ³m cáº§n phá»¥ Ä‘áº¡o vÃ  báº±ng chá»©ng bÃ i lÃ m Ä‘Ã£ áº©n danh.',
      'Äo tiáº¿n bá»™ Ä‘iá»ƒm sá»‘ há»c sinh',
      '1 báº£ng 6 cá»™t cÃ³ Ã­t nháº¥t 10 dÃ²ng há»c sinh áº©n danh hoáº·c 1 nhÃ³m bÃ i kiá»ƒm tra.',
      'CÃ³ sá»‘ trÆ°á»›c-sau, nháº­n xÃ©t ngáº¯n vÃ  1 viá»‡c cáº§n can thiá»‡p trong tuáº§n sau.',
      week
    );
  }
  if (isPublicSubjectTeacher && /role|tra cao|luong muc tieu|muc luong|jd|tuyen dung|band/.test(normalizedTask)) {
    return simpleActionTask(
      'Chá»n 3 hÆ°á»›ng Ä‘Ãºng nghá» cho giÃ¡o viÃªn bá»™ mÃ´n: giÃ¡o viÃªn nÃ²ng cá»‘t, tá»• phÃ³/tá»• trÆ°á»Ÿng chuyÃªn mÃ´n, subject lead Ä‘Ãºng bá»™ mÃ´n á»Ÿ trÆ°á»ng tÆ°/quá»‘c táº¿.',
      'Äá»c JD/giao nhiá»‡m vá»¥ Ä‘Ãºng track giÃ¡o viÃªn bá»™ mÃ´n',
      '1 báº£ng gá»“m 3 hÆ°á»›ng, má»©c lÆ°Æ¡ng/phá»¥ cáº¥p má»¥c tiÃªu, yÃªu cáº§u chÃ­nh, báº±ng chá»©ng Ä‘Ã£ cÃ³ vÃ  báº±ng chá»©ng cÃ²n thiáº¿u.',
      'Má»—i hÆ°á»›ng cÃ³ keyword Ä‘Ãºng nghá»: giÃ¡o Ã¡n bá»™ mÃ´n, ma tráº­n Ä‘á», rubric, dá»± giá», chuyÃªn Ä‘á» tá»•, phá»¥ Ä‘áº¡o/bá»“i dÆ°á»¡ng hoáº·c há»“ sÆ¡ thi Ä‘ua.',
      week
    );
  }
  if (isPublicSubjectTeacher && /giao an|ma tran|rubric|de kiem tra|chuyen de|du gio|phu dao|boi duong|ho so/.test(normalizedTask)) {
    return simpleActionTask(
      'ÄÃ³ng gÃ³i 1 chÆ°Æ¡ng/bÃ i Ä‘ang dáº¡y thÃ nh bá»™ há»“ sÆ¡: giÃ¡o Ã¡n bá»™ mÃ´n, ma tráº­n Ä‘á», rubric cháº¥m bÃ i, bÃ i há»c sinh Ä‘Ã£ áº©n danh vÃ  nháº­n xÃ©t sau tiáº¿t.',
      'GiÃ¡o Ã¡n bá»™ mÃ´n vÃ  há»“ sÆ¡ chuyÃªn mÃ´n',
      '1 thÆ° má»¥c/link gá»“m giÃ¡o Ã¡n, ma tráº­n Ä‘á», rubric, 3 bÃ i máº«u Ä‘Ã£ áº©n danh vÃ  1 nháº­n xÃ©t dá»± giá»/gÃ³p Ã½ náº¿u cÃ³.',
      'NgÆ°á»i trong tá»• chuyÃªn mÃ´n Ä‘á»c vÃ o tháº¥y Ä‘Ãºng chuáº©n bá»™ mÃ´n, cÃ³ tiÃªu chÃ­ cháº¥m vÃ  cÃ³ báº±ng chá»©ng tiáº¿n bá»™ há»c sinh.',
      week
    );
  }
  if (isEnglishTeacher && /kpi|dashboard|so lieu|chi so|impact/.test(normalizedTask)) {
    return {
      title: 'Láº­p báº£ng KPI lá»›p tiáº¿ng Anh: attendance, homework, pre-test/post-test, Speaking/Writing rubric vÃ  feedback/retention.',
      skill: 'Äo tiáº¿n bá»™ há»c viÃªn tiáº¿ng Anh',
      output: '1 link/áº£nh Google Sheet cÃ³ Ã­t nháº¥t 1 lá»›p hoáº·c 3-5 há»c viÃªn; má»—i dÃ²ng cÃ³ Ä‘iá»ƒm ná»n, má»¥c tiÃªu, káº¿t quáº£ sau buá»•i/tuáº§n vÃ  báº±ng chá»©ng feedback.',
      kpi: 'Äo tá»‘i thiá»ƒu 3 chá»‰ sá»‘: attendance >=85%, homework completion >=80%, post-test/mock test tÄƒng hoáº·c lá»—i Speaking/Writing giáº£m; thÃªm retention/renewal náº¿u cÃ³.',
      doneDefinition: `Tick khi cÃ³ sheet/link/áº£nh KPI vÃ  nÃ³ phá»¥c vá»¥ checkpoint: ${week.milestone}`,
    };
  }
  if (isEnglishTeacher && /role|tra cao|luong muc tieu|muc luong|jd|tuyen dung/.test(normalizedTask)) {
    return {
      title: 'Chá»n 3 role tráº£ cao hÆ¡n cho giÃ¡o viÃªn tiáº¿ng Anh: IELTS/Cambridge Teacher, Academic Lead, Curriculum Lead hoáº·c Education Growth.',
      skill: 'Äá»c JD giÃ¡o dá»¥c tiáº¿ng Anh vÃ  chá»n Ä‘Ãºng track',
      output: '1 báº£ng gá»“m 3 role, target salary, yÃªu cáº§u chÃ­nh, báº±ng chá»©ng báº¡n Ä‘Ã£ cÃ³ vÃ  báº±ng chá»©ng cÃ²n thiáº¿u cho tá»«ng role.',
      kpi: 'Má»—i role cÃ³ Ã­t nháº¥t 1 JD tháº­t hoáº·c tin tuyá»ƒn dá»¥ng, 3 keyword nÄƒng lá»±c vÃ  1 lÃ½ do vÃ¬ sao báº¡n cÃ³ thá»ƒ cháº¡m Ä‘Æ°á»£c role Ä‘Ã³.',
      doneDefinition: `Tick khi báº£ng role Ä‘á»§ rÃµ Ä‘á»ƒ Ä‘em há»i mentor/nhÃ  tuyá»ƒn dá»¥ng hoáº·c dÃ¹ng cho checkpoint: ${week.milestone}`,
    };
  }
  if (isEnglishTeacher && /lesson|giao an|tesol|celta|demo|module|rubric|curriculum/.test(normalizedTask)) {
    return {
      title: 'Soáº¡n 1 lesson plan TESOL/CELTA-style kÃ¨m demo class 10-15 phÃºt vÃ  rubric cháº¥m Speaking/Writing.',
      skill: 'Thiáº¿t káº¿ bÃ i dáº¡y tiáº¿ng Anh cÃ³ tiÃªu chÃ­ Ä‘o Ä‘Æ°á»£c',
      output: '1 lesson plan, 1 slide/worksheet, 1 rubric Speaking/Writing vÃ  link video/ghi chÃº demo class 10-15 phÃºt.',
      kpi: 'Lesson plan cÃ³ má»¥c tiÃªu há»c, activity, timing, assessment; rubric cÃ³ tiÃªu chÃ­ rÃµ vÃ  dÃ¹ng Ä‘Æ°á»£c Ä‘á»ƒ cháº¥m trÆ°á»›c/sau.',
      doneDefinition: `Tick khi cÃ³ Ä‘á»§ lesson plan + rubric + demo hoáº·c ghi chÃº demo phá»¥c vá»¥ checkpoint: ${week.milestone}`,
    };
  }
  if (isEnglishTeacher && /feedback|review|quote/.test(normalizedTask)) {
    return {
      title: 'Xin feedback tháº­t cho demo class hoáº·c lesson plan tá»« há»c viÃªn, phá»¥ huynh, quáº£n lÃ½ há»c thuáº­t hoáº·c giÃ¡o viÃªn senior.',
      skill: 'Láº¥y feedback vÃ  cáº£i thiá»‡n bÃ i dáº¡y tiáº¿ng Anh',
      output: '2 feedback ngáº¯n kÃ¨m báº£n sá»­a sau feedback; che thÃ´ng tin riÃªng tÆ° náº¿u cáº§n.',
      kpi: 'CÃ³ Ã­t nháº¥t 2 nháº­n xÃ©t cá»¥ thá»ƒ vá» Ä‘á»™ dá»… hiá»ƒu, tÆ°Æ¡ng tÃ¡c lá»›p, hoáº¡t Ä‘á»™ng luyá»‡n Speaking/Writing hoáº·c káº¿t quáº£ bÃ i táº­p.',
      doneDefinition: `Tick khi feedback Ä‘Ã£ Ä‘Æ°á»£c lÆ°u vÃ  cÃ³ 1 Ä‘iá»ƒm sá»­a cá»¥ thá»ƒ phá»¥c vá»¥ checkpoint: ${week.milestone}`,
    };
  }
  const skill = isSchoolHealthcare
    ? 'So cuu hoc duong va ho so suc khoe hoc sinh'
    : isPilot
    ? 'Flight deck SOP, simulator/recurrent va CRM/ATC'
    : isAviation
    ? 'Safety-service vÃ  feedback cabin crew'
    : isHospitality
    ? 'Housekeeping checklist vÃ  feedback giÃ¡m sÃ¡t'
    : isCleaning
    ? 'Checklist vá»‡ sinh vÃ  nghiá»‡m thu khu vá»±c'
    : pickSkill(task, compass.topSkillGap);
  return {
    title: task,
    skill,
    output: isPerformer
      ? '1 link/áº£nh/video/ghi chÃº chá»©ng minh nÄƒng lá»±c MC: showreel, lá»i dáº«n, feedback, rate card hoáº·c case xá»­ lÃ½ sÃ¢n kháº¥u'
      : isFresh
      ? '1 bÃ i lÃ m nhá» hoáº·c ghi chÃº rÃµ rÃ ng: role Ä‘Ã£ chá»n, checklist tá»«ng bÆ°á»›c, feedback nháº­n Ä‘Æ°á»£c vÃ  báº£n sá»­a sau feedback'
      : isAviation
      ? '1 feedback/checklist/ghi chÃº tÃ¬nh huá»‘ng Ä‘Ã£ che thÃ´ng tin khÃ¡ch hoáº·c chá»©ng chá»‰ training lÆ°u trong evidence log'
      : isSchoolHealthcare
      ? '1 checklist/log y táº¿ há»c Ä‘Æ°á»ng Ä‘Ã£ áº©n thÃ´ng tin há»c sinh lÆ°u trong evidence log'
      : isHospitality
      ? '1 checklist phÃ²ng/area, áº£nh before-after Ä‘Ã£ che thÃ´ng tin khÃ¡ch, log tá»‘c Ä‘á»™/lá»—i vÃ  feedback giÃ¡m sÃ¡t lÆ°u trong evidence log'
      : isCleaning
      ? '1 checklist khu vá»±c, áº£nh before-after, log dá»¥ng cá»¥/hÃ³a cháº¥t, lá»—i/rework vÃ  feedback giÃ¡m sÃ¡t lÆ°u trong evidence log'
      : /evidence|báº±ng chá»©ng|artifact|case|portfolio|dashboard|CV|LinkedIn/i.test(task)
      ? '1 file/link/áº£nh chá»¥p lÆ°u trong evidence log'
      : `1 output gáº¯n trá»±c tiáº¿p vá»›i ${jobTitle}`,
    kpi: isPerformer
      ? 'Äo báº±ng sá»‘ clip/show hoÃ n thÃ nh, feedback khÃ¡ch/agency, Ä‘Ãºng timeline, sá»‘ lead booking, tá»· lá»‡ chá»‘t show hoáº·c má»©c phÃ­ trung bÃ¬nh/show'
      : isFresh
      ? 'Äo báº±ng sá»‘ JD Ä‘Ã£ Ä‘á»c, bÃ i test/mini project Ä‘Ã£ ná»™p, feedback mentor, CV gá»­i Ä‘Ãºng role hoáº·c sá»‘ pháº£n há»“i nháº­n Ä‘Æ°á»£c'
      : isAviation
      ? 'CÃ³ feedback, checklist Ä‘áº¡t/chÆ°a Ä‘áº¡t, sá»‘ láº§n luyá»‡n announcement hoáº·c tÃ¬nh huá»‘ng xá»­ lÃ½ Ä‘Æ°á»£c xÃ¡c nháº­n'
      : isSchoolHealthcare
      ? 'CÃ³ thá»i gian pháº£n á»©ng, há»“ sÆ¡ cáº­p nháº­t, sá»‘ ca sÆ¡ cá»©u/chuyá»ƒn tuyáº¿n, thuá»‘c/dá»‹ á»©ng hoáº·c feedback nhÃ  trÆ°á»ng-phá»¥ huynh Ä‘Æ°á»£c ghi láº¡i'
      : isHospitality
      ? 'CÃ³ sá»‘ phÃ²ng/ca hoáº·c phÃºt/phÃ²ng, lá»—i/rework, complaint hoáº·c feedback giÃ¡m sÃ¡t Ä‘Æ°á»£c ghi láº¡i'
      : isCleaning
      ? 'CÃ³ checklist Ä‘áº¡t/chÆ°a Ä‘áº¡t, lá»—i/rework, complaint, thá»i gian xá»­ lÃ½ hoáº·c Ä‘iá»ƒm nghiá»‡m thu Ä‘Æ°á»£c ghi láº¡i'
      : /kpi|chá»‰ sá»‘|sá»‘ liá»‡u|lÆ°Æ¡ng|doanh thu|lá»—i|thá»i gian/i.test(task)
      ? 'CÃ³ sá»‘ trÆ°á»›c/sau hoáº·c má»‘c hoÃ n thÃ nh Ä‘o Ä‘Æ°á»£c'
      : 'CÃ³ ngÆ°á»i xÃ¡c nháº­n hoáº·c cÃ³ tiÃªu chÃ­ Ä‘áº¡t/chÆ°a Ä‘áº¡t',
    doneDefinition: isFresh
      ? `Tick khi ngÆ°á»i má»›i Ä‘á»c láº¡i váº«n hiá»ƒu bÆ°á»›c tiáº¿p theo lÃ  gÃ¬ vÃ  cÃ³ báº±ng chá»©ng nhá» phá»¥c vá»¥ checkpoint: ${week.milestone}`
      : `Tick khi Ä‘Ã£ cÃ³ output vÃ  nÃ³ phá»¥c vá»¥ checkpoint: ${week.milestone}`,
  };
}

function buildActionTasksForWeek(
  week: WeekPlan,
  roleText: string,
  compass: ReturnType<typeof getCareerCompassContext>,
  taskLimit: number,
  usedTitles: Set<string>
): RoadmapActionTask[] {
  const builtTasks = (week.tasks.length ? week.tasks : [week.focus]).map(task => buildTaskFromText(task, week, roleText, compass));
  const selected: RoadmapActionTask[] = [];
  const weekTitles = new Set<string>();

  for (const task of builtTasks) {
    const key = normalizeForRoadmapQuality(task.title);
    if (!key || weekTitles.has(key) || usedTitles.has(key)) continue;
    selected.push(task);
    weekTitles.add(key);
    usedTitles.add(key);
    if (selected.length >= taskLimit) return selected;
  }

  for (const task of builtTasks) {
    const key = normalizeForRoadmapQuality(task.title);
    if (!key || weekTitles.has(key)) continue;
    selected.push(task);
    weekTitles.add(key);
    usedTitles.add(key);
    if (selected.length >= taskLimit) return selected;
  }

  return selected.slice(0, taskLimit);
}

function buildMilestoneTitle(
  milestoneIndex: number,
  month: number,
  roleText: string,
  roleLanguage: ReturnType<typeof getRoleLanguage>
) {
  const roleName = repairMojibakeText(roleText).trim().slice(0, 42) || 'nghá» hiá»‡n táº¡i';
  const proofName = roleLanguage.productWord || 'báº±ng chá»©ng nghá» nghiá»‡p';
  const titles = [
    `Chá»‘t má»‘c lÆ°Æ¡ng vÃ  báº±ng chá»©ng cho ${roleName}`,
    `LÃ m thá»­ 1 báº±ng chá»©ng: ${proofName}`,
    `ÄÃ³ng gÃ³i case Ä‘á»ƒ xin feedback tháº­t`,
    `Cáº£i thiá»‡n KPI báº±ng má»™t viá»‡c Ä‘ang lÃ m`,
    `Táº¡o há»“ sÆ¡ deal lÆ°Æ¡ng cÃ³ sá»‘ trÆ°á»›c-sau`,
    `Xin review lÆ°Æ¡ng hoáº·c lá»c role tráº£ cao hÆ¡n`,
    `Má»Ÿ rá»™ng báº±ng chá»©ng sang cÆ¡ há»™i tráº£ cao hÆ¡n`,
    `Táº­p dÆ°á»£t phá»ng váº¥n/review báº±ng case tháº­t`,
    `Chá»‘t há»“ sÆ¡ 9 thÃ¡ng vÃ  káº¿ hoáº¡ch deal tiáº¿p theo`,
  ];
  return titles[milestoneIndex] || `ThÃ¡ng ${month}: thÃªm báº±ng chá»©ng ${proofName}`;
}

function buildActionPlan(
  weekly: RoadmapData,
  jobTitle: string,
  durationMonths: number,
  compass: ReturnType<typeof getCareerCompassContext>,
  intake: RoadmapIntake = {}
): RoadmapActionPlan {
  const expectedWeeks = getCompactPlanWeeks(durationMonths);
  const sourceWeeks = weekly.weeks.length >= expectedWeeks ? weekly.weeks : Array.from({ length: expectedWeeks }, (_, index) => {
    const base = weekly.weeks[index % Math.max(weekly.weeks.length, 1)] || {
      week: index + 1,
      focus: `HoÃ n thÃ nh sáº£n pháº©m nghá» nghiá»‡p tuáº§n ${index + 1}`,
      tasks: [`HoÃ n thÃ nh 1 output Ä‘o Ä‘Æ°á»£c cho ${jobTitle}.`],
      milestone: 'CÃ³ 1 sáº£n pháº©m/case study Ä‘á»§ Ä‘Æ°a vÃ o portfolio hoáº·c buá»•i review.',
    };
    return { ...base, week: index + 1 };
  });
  const planWeeks = sourceWeeks.slice(0, expectedWeeks);
  const milestoneMonths = getRoadmapMilestoneMonths(durationMonths).slice(0, planWeeks.length);
  const baseWeeksPerMonth = Math.floor(planWeeks.length / milestoneMonths.length);
  const extraWeeks = planWeeks.length % milestoneMonths.length;
  const milestones: RoadmapMilestone[] = [];
  const roleText = repairMojibakeText(getRoleIdentityText(jobTitle, intake));
  const isPilotPlan = isPilotRole(roleText);
  const isAviationPlan = isAviationRole(roleText);
  const isPerformerPlan = isMcRole(roleText);
  const isLanguageCenterManagerPlan = isLanguageCenterManagerRole(roleText);
  const isEnglishTeacherPlan = isEnglishTeacherRole(roleText);
  const isPublicSubjectTeacherPlan = isPublicSubjectTeacherRole(roleText);
  const tourismProfile = getTourismRoleProfile(roleText);
  const isTourismPlan = Boolean(tourismProfile);
  const isHospitalityPlan = isHospitalityRole(roleText) && !isTourismPlan;
  const isCleaningPlan = isCleaningRole(roleText);
  const isSchoolHealthcarePlan = isSchoolHealthcareRole(roleText);
  const isMarketingManagerPlan = isMarketingManagerRoadmapRole(roleText);
  const isRestaurantManagerPlan = isRestaurantManagerRoadmapRole(roleText);
  const isRestaurantFrontlinePlan = isRestaurantFrontlineRoadmapRole(roleText);
  const isHotelManagerPlan = isHotelManagerRoadmapRole(roleText);
  const isHotelFrontlinePlan = isHotelFrontlineRoadmapRole(roleText);
  const isDentalPlan = isDentalRoadmapRole(roleText);
  const isDentalAssistantPlan = isDentalAssistantRoadmapRole(roleText);
  const isInsurancePlan = isInsuranceRole(roleText);
  const roleLanguage = getRoleLanguage(roleText, compass);
  const taxonomySkillLine = getRoadmapTaxonomySkillLine(roleText);
  const taskLimit = getWeeklyTaskLimit(intake.weeklyTime);
  const usedTaskTitles = new Set<string>();

  let weekCursor = 0;
  for (let milestoneIndex = 0; milestoneIndex < milestoneMonths.length; milestoneIndex++) {
    const weeksInMonth = baseWeeksPerMonth + (milestoneIndex < extraWeeks ? 1 : 0);
    const chunk = planWeeks.slice(weekCursor, weekCursor + weeksInMonth);
    weekCursor += weeksInMonth;
    const month = milestoneMonths[milestoneIndex] ?? milestoneIndex + 1;
    const skills = Array.from(new Set(chunk.flatMap(week =>
      week.tasks.slice(0, taskLimit).map(task => (
        isPilotPlan ? 'Flight deck SOP, simulator/recurrent va CRM/ATC' :
        isAviationPlan ? 'Safety-service vÃ  feedback cabin crew' :
        isPerformerPlan ? 'Showreel, feedback vÃ  rate card MC' :
        isSchoolHealthcarePlan ? 'SÆ¡ cá»©u há»c Ä‘Æ°á»ng, há»“ sÆ¡ sá»©c khá»e vÃ  protocol sá»± cá»‘' :
        isTourismPlan ? (taxonomySkillLine || 'Tour log, thuyáº¿t minh tuyáº¿n Ä‘iá»ƒm vÃ  xá»­ lÃ½ sá»± cá»‘ tour') :
        isRestaurantManagerPlan ? 'Shift operations, labor cost, food cost vÃ  service quality' :
        isRestaurantFrontlinePlan ? 'POS/order accuracy, service SOP va shift handover' :
        isHotelManagerPlan ? 'Occupancy, ADR/RevPAR, staffing SLA va guest experience' :
        isHotelFrontlinePlan ? 'PMS accuracy, check-in SOP va guest request SLA' :
        isDentalPlan ? 'Chan doan, treatment plan, vo khuan va case nha khoa an danh' :
        isDentalAssistantPlan ? 'Chair setup, vo khuan, suction/chuyen dung cu va follow-up' :
        isInsurancePlan ? 'Underwriting, claims/boi thuong, policy wording va renewal/loss ratio' :
        isHospitalityPlan ? 'Housekeeping checklist, room speed vÃ  guest feedback' :
        isCleaningPlan ? 'Cleaning checklist, rework rate vÃ  supervisor audit' :
        isPublicSubjectTeacherPlan ? 'GiÃ¡o Ã¡n bá»™ mÃ´n, ma tráº­n Ä‘á», rubric vÃ  tiáº¿n bá»™ há»c sinh' :
        isLanguageCenterManagerPlan ? 'Enrollment funnel, class fill, teacher utilization va retention/renewal' :
        isEnglishTeacherPlan ? 'KPI lá»›p tiáº¿ng Anh vÃ  lesson plan Ä‘o Ä‘Æ°á»£c' :
        isMarketingManagerPlan ? 'Brand strategy, P&L, budget va brand health' :
        taxonomySkillLine || pickSkill(task, compass.topSkillGap)
      ))
    ))).slice(0, 4);

    milestones.push({
      month,
      title: buildMilestoneTitle(milestoneIndex, month, roleText, roleLanguage),
      objective: chunk[chunk.length - 1]?.milestone || `CÃ³ Ã­t nháº¥t 1 ${roleLanguage.productWord} nhÃ¬n tháº¥y Ä‘Æ°á»£c, cÃ³ sá»‘ trÆ°á»›c-sau vÃ  cÃ³ ngÆ°á»i xÃ¡c nháº­n.`,
      skills,
      weeks: chunk.map(week => ({
        week: week.week,
        focus: week.focus,
        checkpoint: week.milestone,
        tasks: buildActionTasksForWeek(week, roleText, compass, taskLimit, usedTaskTitles),
      })),
    });
  }

  const standardWeeks = planWeeks.length;
  return {
    standardWeeks,
    flexibleWeeks: Math.ceil(standardWeeks * 1.5),
    weeklyHours: intake.weeklyTime || '3-5 giá»/tuáº§n',
    completionRule: 'HoÃ n thÃ nh 70% viá»‡c lÃµi lÃ  Ä‘á»§; má»—i giai Ä‘oáº¡n chá»‰ cáº§n 1 output rÃµ, 1 báº±ng chá»©ng lÆ°u láº¡i vÃ  1 feedback tá»« ngÆ°á»i tháº­t.',
    levelName: 'Evidence Level',
    milestones,
  };
}

function buildExpertFallbackRoadmap(
  weekly: RoadmapData,
  jobTitle: string,
  currentSalary: number,
  targetSalary: number,
  durationMonths: number,
  compass: ReturnType<typeof getCareerCompassContext>,
  intake: RoadmapIntake = {}
): RoadmapData {
  const durationLabel = formatRoadmapDuration(durationMonths);
  const negotiationWindow =
    durationMonths <= 3 ? 'thÃ¡ng 2-3' :
    durationMonths <= 6 ? 'thÃ¡ng 4-6' :
    'thÃ¡ng 6-12';
  const role = intake.currentPosition || jobTitle;
  const needsDiagnosis = !intake.mainWeakness || !intake.bottleneck;
  const inferredGap = compass.topSkillGap;
  const weakness = intake.mainWeakness || (needsDiagnosis ? `chÆ°a rÃµ - cáº§n cháº©n Ä‘oÃ¡n tá»« dá»¯ liá»‡u Ä‘áº§u vÃ o, Æ°u tiÃªn kiá»ƒm tra ${inferredGap}` : inferredGap);
  const goal = intake.twoYearGoal || `${targetSalary.toLocaleString('vi-VN')} VNÄ/thÃ¡ng hoáº·c lÃªn role tá»‘t hÆ¡n`;
  const educationLevel = intake.educationLevel || 'ChÆ°a cung cáº¥p';
  const educationDetail = sanitizeEducationDetailForRole(`${jobTitle} ${role}`, intake.educationDetail) || 'ChÆ°a cung cáº¥p';
  const classification = classifyEducationFit(jobTitle, intake);
  const actionPlan = buildActionPlan(weekly, jobTitle, durationMonths, compass, intake);
  const knownStrengths = intake.strongSkills || 'ChÆ°a cung cáº¥p';
  const existingProof = intake.proofAssets || 'ChÆ°a cung cáº¥p';
  const bottleneck = intake.bottleneck || (needsDiagnosis ? 'chÆ°a xÃ¡c Ä‘á»‹nh - tuáº§n Ä‘áº§u pháº£i Ä‘o ná»n KPI, báº±ng chá»©ng, scope, visibility, skill gap vÃ  ká»‹ch báº£n deal' : weakness);
  const preferredPath = describePreferredPath(intake.preferredPath, `${jobTitle} ${intake.currentPosition || ''}`);
  const normalizedRole = normalizeForRoadmapQuality(`${jobTitle} ${role}`);
  const normalizedEducation = normalizeForRoadmapQuality(`${educationLevel} ${educationDetail}`);
  const isLanguageCenterManager = isLanguageCenterManagerRole(`${jobTitle} ${role}`);
  const isLanguageCenter = isLanguageCenterManager;
  const isPerformer = isMcRole(normalizedRole);
  const isChef = isChefRole(normalizedRole);
  const isPilot = isPilotRole(normalizedRole);
  const isAviation = isAviationRole(normalizedRole);
  const isSchoolEducation = isSchoolEducationRole(normalizedRole);
  const isPrincipal = isSchoolPrincipalRole(normalizedRole);
  const hasAcademicAdvantage = /thac si|mba|ngon ngu anh|english/.test(normalizedEducation);
  const focusProtocol = needsDiagnosis && isPerformer
    ? [
        '- Tuáº§n 1 khÃ´ng báº¯t báº¡n Ä‘oÃ¡n mÃ¬nh yáº¿u gÃ¬. Cháº©n Ä‘oÃ¡n báº±ng 5 nhÃ³m Ä‘Ãºng nghá» MC: showreel, giá»ng/nhá»‹p sÃ¢n kháº¥u, ká»‹ch báº£n lá»i dáº«n, xá»­ lÃ½ sá»± cá»‘ live, feedback khÃ¡ch/agency vÃ  kháº£ nÄƒng chá»‘t booking.',
        '- Má»—i nhÃ³m cÃ³ 1 viá»‡c nhá»: chá»n 1 clip cÅ©, tá»± cháº¥m 5 tiÃªu chÃ­, viáº¿t láº¡i 1 Ä‘oáº¡n má»Ÿ mÃ n, mÃ´ phá»ng 1 tÃ¬nh huá»‘ng trá»… timeline, xin 1 feedback tá»« producer/MC/khÃ¡ch quen.',
        '- Sau 7 ngÃ y, chá»n 1 hÆ°á»›ng Ä‘á»•i nghá» liá»n ká» Ä‘á»ƒ thá»­: Event Coordinator/Producer, Brand Activation, Livestream Host, Content Presenter, Voice-over/Trainer hoáº·c Sales/CS cáº§n thuyáº¿t trÃ¬nh.',
        '- Tuyá»‡t Ä‘á»‘i khÃ´ng kÃ©o sang 5S, QC, an toÃ n lao Ä‘á»™ng, sáº£n lÆ°á»£ng line hoáº·c ká»¹ nÄƒng nhÃ  mÃ¡y vÃ¬ Ä‘Ã³ khÃ´ng pháº£i Ä‘Ã²n báº©y cá»§a ngÆ°á»i Ä‘ang lÃ m MC.',
      ].join('\n')
    : needsDiagnosis && isFreshOrUndirectedRole(normalizedRole)
    ? [
        '- Tuáº§n 1 khÃ´ng yÃªu cáº§u báº¡n biáº¿t mÃ¬nh há»£p nghá» nÃ o. Báº¯t Ä‘áº§u báº±ng 3 role máº«u: má»™t role giao tiáº¿p, má»™t role phÃ¢n tÃ­ch/vÄƒn phÃ²ng, má»™t role sÃ¡ng táº¡o/ná»™i dung.',
        '- Vá»›i má»—i role, Ä‘á»c 3 JD tháº­t vÃ  ghi láº¡i: viá»‡c háº±ng ngÃ y, skill cáº§n cÃ³, bÃ i test thÆ°á»ng gáº·p, má»©c lÆ°Æ¡ng entry vÃ  Ä‘iá»u mÃ¬nh thÃ­ch/khÃ´ng thÃ­ch.',
        '- LÃ m 1 mini project 2-3 giá» cho role cÃ³ Ä‘iá»ƒm cao nháº¥t, rá»“i xin 1 feedback tá»« anh/chá»‹ Ä‘i lÃ m hoáº·c ngÆ°á»i hÆ°á»›ng dáº«n.',
        '- Sau 7 ngÃ y má»›i chá»n hÆ°á»›ng chÃ­nh. KhÃ´ng dÃ¹ng checklist chung kiá»ƒu â€œcáº£i thiá»‡n báº£n thÃ¢nâ€; pháº£i cÃ³ bÃ i lÃ m cá»¥ thá»ƒ Ä‘á»ƒ biáº¿t há»£p hay khÃ´ng.',
      ].join('\n')
    : needsDiagnosis && isPilot
    ? [
        '- Tuan 1 khong bat user doan diem yeu. Chan doan bang 5 nhom pilot: flight hours/logbook, SOP compliance, recurrent/simulator check, cockpit CRM/ATC va route-aircraft qualification.',
        '- Moi nhom co 1 viec nho: tom tat logbook, chon 1 SOP can sieu ro, ghi 1 debrief simulator, xin/ghi 1 feedback CRM-ATC, va cap nhat evidence duoc phep chia se.',
        '- Khong dung ngon ngu cabin crew: purser, grooming, announcement cabin, service recovery, passenger complaint hay senior crew feedback.',
        '- Sau 7 ngay, chon nut that that: thieu flight hours, thieu recurrent/simulator evidence, thieu CRM/ATC feedback, thieu route-aircraft readiness hoac thieu ho so de xin captain/FO scope tot hon.',
      ].join('\n')
    : needsDiagnosis && isAviation
    ? [
        '- Tuáº§n 1 khÃ´ng báº¯t user Ä‘oÃ¡n Ä‘iá»ƒm yáº¿u. Cháº©n Ä‘oÃ¡n báº±ng 5 nhÃ³m: safety-service checklist, feedback senior crew, announcement tiáº¿ng Anh, service recovery, grooming/teamwork.',
        '- Má»—i nhÃ³m cÃ³ 1 viá»‡c nhá»: tá»± cháº¥m checklist, xin 1 feedback, ghi Ã¢m 1 announcement, viáº¿t 1 tÃ¬nh huá»‘ng khÃ¡ch khÃ³ vÃ  ghi 1 Ä‘iá»ƒm cáº§n sá»­a sau ca/chuyáº¿n.',
        '- KhÃ´ng dÃ¹ng dá»¯ liá»‡u doanh thu ná»™i bá»™, khÃ´ng ghi thÃ´ng tin riÃªng tÆ° hÃ nh khÃ¡ch. Chá»‰ dÃ¹ng báº±ng chá»©ng cÃ¡ nhÃ¢n há»£p lá»‡: checklist, feedback, chá»©ng chá»‰ training, ghi chÃº tÃ¬nh huá»‘ng Ä‘Ã£ che thÃ´ng tin.',
        '- Sau 7 ngÃ y, chá»n nÃºt tháº¯t tháº­t: thiáº¿u feedback, thiáº¿u tiáº¿ng Anh tÃ¬nh huá»‘ng, thiáº¿u service recovery, thiáº¿u chuáº©n grooming/teamwork hoáº·c thiáº¿u báº±ng chá»©ng Ä‘á»ƒ xin tuyáº¿n/role khÃ³ hÆ¡n.',
      ].join('\n')
    : needsDiagnosis
    ? [
        '- Tuáº§n 1 khÃ´ng vá»™i káº¿t luáº­n Ä‘iá»ƒm yáº¿u. Báº¯t Ä‘áº§u báº±ng cháº©n Ä‘oÃ¡n 5 nhÃ³m: KPI Ä‘o Ä‘Æ°á»£c, báº±ng chá»©ng Ä‘Ã£ cÃ³, scope/quyá»n quyáº¿t Ä‘á»‹nh, visibility vá»›i ngÆ°á»i tráº£ lÆ°Æ¡ng vÃ  skill gap thá»‹ trÆ°á»ng.',
        '- Má»—i nhÃ³m pháº£i cÃ³ 1 cÃ¢u há»i kiá»ƒm tra, 1 hÃ nh Ä‘á»™ng nhá», 1 output há»¯u hÃ¬nh vÃ  1 sá»‘ Ä‘o trÆ°á»›c/sau.',
        '- Náº¿u phÃ¡t hiá»‡n thiáº¿u KPI: dá»±ng dashboard ná»n. Náº¿u thiáº¿u báº±ng chá»©ng: táº¡o case study. Náº¿u thiáº¿u scope: xin nháº­n má»™t Ä‘áº§u viá»‡c cÃ³ owner rÃµ. Náº¿u thiáº¿u visibility: Ä‘Ã³ng gÃ³i bÃ¡o cÃ¡o gá»­i ngÆ°á»i ra quyáº¿t Ä‘á»‹nh. Náº¿u thiáº¿u skill: há»c Ä‘Ãºng skill táº¡o KPI trong cÃ´ng viá»‡c.',
        '- Sau 7 ngÃ y, chá»n nÃºt tháº¯t tháº­t dá»±a trÃªn dá»¯ liá»‡u, khÃ´ng dá»±a trÃªn cáº£m giÃ¡c.',
      ].join('\n')
    : isAviation && normalizeForRoadmapQuality(weakness).includes('khong tap trung chi tiet')
    ? [
        '- Checklist trÆ°á»›c ca/chuyáº¿n: grooming, briefing, safety-service flow, 1 tÃ¬nh huá»‘ng khÃ¡ch khÃ³ cÃ³ thá»ƒ gáº·p vÃ  cÃ¢u nÃ³i nÃªn dÃ¹ng.',
        '- 2 block luyá»‡n ngáº¯n: 15 phÃºt announcement tiáº¿ng Anh vÃ  15 phÃºt viáº¿t láº¡i má»™t tÃ¬nh huá»‘ng service recovery theo format: tÃ¬nh huá»‘ng - pháº£n há»“i - quy trÃ¬nh - feedback.',
        '- Sá»• lá»—i cabin cÃ¡ nhÃ¢n: ghi lá»—i/Ä‘iá»ƒm cáº§n sá»­a, tÃ¬nh huá»‘ng, cÃ¡ch phÃ²ng láº¡i, khÃ´ng ghi thÃ´ng tin riÃªng tÆ° hÃ nh khÃ¡ch.',
        '- Review cuá»‘i ca/chuyáº¿n: xin 1 feedback ngáº¯n tá»« senior crew/Ä‘á»“ng nghiá»‡p hoáº·c tá»± cháº¥m checklist Ä‘áº¡t/chÆ°a Ä‘áº¡t.',
        '- 5 tiÃªu chÃ­ theo dÃµi: checklist hoÃ n thÃ nh, feedback nháº­n Ä‘Æ°á»£c, sá»‘ láº§n luyá»‡n announcement, tÃ¬nh huá»‘ng service recovery Ä‘Ã£ ghi, Ä‘iá»ƒm grooming/teamwork cáº§n cáº£i thiá»‡n.',
        '- Quy táº¯c váº­n hÃ nh: chÆ°a lÆ°u Ä‘Æ°á»£c má»™t báº±ng chá»©ng nhá» thÃ¬ chÆ°a má»Ÿ thÃªm má»¥c tiÃªu má»›i.',
      ].join('\n')
    : normalizeForRoadmapQuality(weakness).includes('khong tap trung chi tiet')
    ? [
        '- Checklist Ä‘áº§u ngÃ y: viáº¿t 3 output báº¯t buá»™c, 5 lá»—i cáº§n nÃ©, 1 task pháº£i Ä‘Ã³ng trÆ°á»›c 11h.',
        '- 2 block táº­p trung: má»—i block 45-60 phÃºt, chá»‰ xá»­ lÃ½ 1 sáº£n pháº©m/báº±ng chá»©ng nghá», táº¯t thÃ´ng bÃ¡o vÃ  ghi káº¿t quáº£ cuá»‘i block.',
        '- Sá»• lá»—i chi tiáº¿t: ghi lá»—i, nguyÃªn nhÃ¢n, chi phÃ­, cÃ¡ch cháº·n lá»—i tÃ¡i diá»…n.',
        '- Review cuá»‘i ngÃ y: Ä‘á»‘i chiáº¿u output vá»›i checklist, chá»‘t 1 cáº£i tiáº¿n cho ngÃ y mai.',
        '- Dashboard 5 chá»‰ sá»‘: task Ä‘Ã³ng, lá»—i láº·p láº¡i, SLA trá»…, thá»i gian deep work, output Ä‘Æ°á»£c quáº£n lÃ½/khÃ¡ch hÃ ng xÃ¡c nháº­n.',
        '- Quy táº¯c váº­n hÃ nh: khÃ´ng má»Ÿ task má»›i khi task cÅ© chÆ°a cÃ³ output há»¯u hÃ¬nh.',
      ].join('\n')
    : `- Biáº¿n Ä‘iá»ƒm ngháº½n "${bottleneck}" thÃ nh checklist háº±ng ngÃ y: viá»‡c lÃ m cá»¥ thá»ƒ, output há»¯u hÃ¬nh, KPI Ä‘o vÃ  tiÃªu chuáº©n hoÃ n thÃ nh. KhÃ´ng máº·c Ä‘á»‹nh báº¡n thiáº¿u ká»¹ nÄƒng Ä‘Ã£ khai bÃ¡o; dÃ¹ng Ä‘iá»ƒm máº¡nh hiá»‡n cÃ³ Ä‘á»ƒ táº¡o báº±ng chá»©ng cao hÆ¡n.`;
  const languageCenterNote = isLanguageCenter && hasAcademicAdvantage
    ? `\n\nVá»›i quáº£n lÃ½ trung tÃ¢m ngoáº¡i ngá»¯, báº±ng cáº¥p cá»§a báº¡n lÃ  lá»£i tháº¿ há»c thuáº­t. NhÆ°ng náº¿u chá»‰ lÃ m váº­n hÃ nh thÆ°á»ng ngÃ y, báº±ng Ä‘ang bá»‹ under-monetized. Muá»‘n tÄƒng lÆ°Æ¡ng, hÃ£y biáº¿n báº±ng cáº¥p thÃ nh quyá»n phá»¥ trÃ¡ch Ä‘Ã o táº¡o giÃ¡o viÃªn, chuáº©n hÃ³a curriculum, tÄƒng retention, giáº£m complaint, cáº£i thiá»‡n trial-to-paid vÃ  má»Ÿ lá»›p/chÆ°Æ¡ng trÃ¬nh má»›i. KPI ngÃ nh pháº£i theo dÃµi: há»c viÃªn active, retention/churn, trial-to-paid, lead-to-enrollment, class fill rate, teacher utilization, parent complaint SLA, renewal rate, revenue per class, dropout/refund reasons.`
    : '';
  const schoolEducationNote = isSchoolEducation
    ? `\n\nVá»›i giÃ¡o dá»¥c trÆ°á»ng há»c, pháº£i tÃ¡ch rÃµ cÃ´ng láº­p/biÃªn cháº¿ vÃ  tÆ° thá»¥c/quá»‘c táº¿. Náº¿u cÃ´ng láº­p/biÃªn cháº¿, tÄƒng lÆ°Æ¡ng khÃ´ng thá»ƒ tÆ° váº¥n nhÆ° deal thá»‹ trÆ°á»ng tá»± do: ngáº¡ch-báº­c, phá»¥ cáº¥p, thi Ä‘ua, bá»• nhiá»‡m vÃ  phÃ¢n cÃ´ng cá»§a Sá»Ÿ/PhÃ²ng GD quyáº¿t Ä‘á»‹nh ráº¥t nhiá»u. Náº¿u tÆ° thá»¥c/quá»‘c táº¿, cÃ³ thá»ƒ dÃ¹ng learning outcome, pháº£n há»“i phá»¥ huynh, retention há»c sinh, curriculum, cháº¥t lÆ°á»£ng giÃ¡o viÃªn vÃ  váº­n hÃ nh chÆ°Æ¡ng trÃ¬nh Ä‘á»ƒ deal lÆ°Æ¡ng hoáº·c chuyá»ƒn trÆ°á»ng. ${isPrincipal ? 'Vá»›i hiá»‡u trÆ°á»Ÿng/hiá»‡u phÃ³, khÃ´ng viáº¿t nhÆ° thá»ƒ cÃ²n má»™t náº¥c chá»©c vá»¥ phá»• thÃ´ng Ä‘á»ƒ â€œlÃªnâ€; hÆ°á»›ng Ä‘Ãºng lÃ  tá»‘i Æ°u quyá»n háº¡n/phá»¥ cáº¥p trong cÃ´ng láº­p hoáº·c má»Ÿ rá»™ng quy mÃ´/cá»¥m trÆ°á»ng/há»‡ thá»‘ng á»Ÿ tÆ° thá»¥c.' : ''}`
    : '';
  const performerNote = isPerformer
    ? `\n\nVá»›i MC/ngÆ°á»i dáº«n chÆ°Æ¡ng trÃ¬nh, lá»™ trÃ¬nh nÃ y khÃ´ng Ä‘Æ°á»£c há»c lan man ká»¹ thuáº­t. Má»¥c tiÃªu lÃ  tÄƒng phÃ­ dáº«n báº±ng 5 nhÃ³m báº±ng chá»©ng: showreel 60-90 giÃ¢y, ká»‹ch báº£n máº«u, xá»­ lÃ½ tÃ¬nh huá»‘ng live, feedback khÃ¡ch/agency vÃ  rate card theo format sá»± kiá»‡n. KPI nghá» MC gá»“m: sá»‘ show cháº¥t lÆ°á»£ng, tá»· lá»‡ khÃ¡ch quay láº¡i/giá»›i thiá»‡u, sá»‘ feedback tháº­t, Ä‘á»™ Ä‘Ãºng timeline, má»©c phÃ­ trung bÃ¬nh/show, sá»‘ lead booking vÃ  tá»· lá»‡ chá»‘t show.`
    : '';
  const chefNote = isChef
    ? `\n\nVá»›i Ä‘áº§u báº¿p/F&B, lá»™ trÃ¬nh nÃ y khÃ´ng Ä‘Æ°á»£c há»c lan man ká»¹ thuáº­t vÄƒn phÃ²ng. Má»¥c tiÃªu lÃ  tÄƒng lÆ°Æ¡ng báº±ng 5 nhÃ³m báº±ng chá»©ng nghá» báº¿p: recipe card cÃ³ Ä‘á»‹nh lÆ°á»£ng/cost, food cost, waste rate, tá»‘c Ä‘á»™ ra mÃ³n, chuáº©n plating/SOP vÃ  kháº£ nÄƒng training phá»¥ báº¿p. KPI nghá» báº¿p gá»“m: cost mÃ³n, hao há»¥t nguyÃªn liá»‡u, sá»‘ suáº¥t/ca, thá»i gian ra mÃ³n, rating/complaint, sá»‘ lá»—i mÃ³n vÃ  sá»‘ ngÆ°á»i trong báº¿p báº¡n hÆ°á»›ng dáº«n Ä‘Æ°á»£c.`
    : '';
  const pilotNote = isPilot
    ? `\n\nVoi phi cong/pilot/flight deck, lo trinh nay tuyet doi khong duoc dung ngon ngu cabin crew. Muc tieu la tang gia tri bang flight safety, SOP compliance, type rating/recurrent training, simulator check, cockpit CRM/ATC, flight hours/logbook, route-aircraft qualification va safety/incident-free record. Khong dung purser, grooming, announcement cabin, service recovery, passenger complaint hay senior crew feedback.`
    : '';
  const aviationNote = isAviation
    ? `\n\nVá»›i tiáº¿p viÃªn hÃ ng khÃ´ng/cabin crew, lá»™ trÃ¬nh nÃ y khÃ´ng Ä‘Æ°á»£c dÃ¹ng ká»¹ nÄƒng vÄƒn phÃ²ng/IT. Má»¥c tiÃªu lÃ  tÄƒng giÃ¡ trá»‹ báº±ng 5 nhÃ³m báº±ng chá»©ng Ä‘Ãºng nghá»: checklist safety-service, service recovery, announcement tiáº¿ng Anh, grooming/teamwork, feedback senior crew/Ä‘á»“ng nghiá»‡p vÃ  chá»©ng chá»‰ training. KhÃ´ng yÃªu cáº§u dá»¯ liá»‡u doanh thu ná»™i bá»™ hoáº·c thÃ´ng tin riÃªng tÆ° hÃ nh khÃ¡ch. KPI nghá» cabin crew nÃªn lÃ : checklist hoÃ n thÃ nh, feedback senior crew, tÃ¬nh huá»‘ng khÃ¡ch khÃ³ xá»­ lÃ½ Ãªm, announcement luyá»‡n cÃ³ ghi Ã¢m, Ä‘Ãºng quy trÃ¬nh safety vÃ  má»©c sáºµn sÃ ng cho tuyáº¿n/role khÃ³ hÆ¡n.`
    : '';
  const monthSections = actionPlan.milestones.map(milestone => {
    const firstWeek = milestone.weeks[0];
    const firstTask = firstWeek?.tasks[0];
    return `### ThÃ¡ng ${milestone.month}: ${milestone.title}
- Má»¥c tiÃªu: ${milestone.objective}
- Skill cáº§n nÃ¢ng: ${milestone.skills.join(', ')}
- Viá»‡c lÃ m cá»¥ thá»ƒ tuáº§n Ä‘áº§u: ${firstTask?.title || 'Táº¡o báº±ng chá»©ng cÃ³ sá»‘ liá»‡u cho cÃ´ng viá»‡c quan trá»ng nháº¥t.'}
- Output há»¯u hÃ¬nh: ${firstTask?.output || '1 artifact lÆ°u Ä‘Æ°á»£c trong evidence log, cÃ³ áº£nh/link/file vÃ  ngÆ°á»i xÃ¡c nháº­n.'}
- KPI Ä‘o: ${firstTask?.kpi || 'trÆ°á»›c/sau vá» thá»i gian xá»­ lÃ½, lá»—i giáº£m, doanh thu, retention, SLA hoáº·c cháº¥t lÆ°á»£ng bÃ n giao.'}
- TiÃªu chuáº©n hoÃ n thÃ nh: ${firstTask?.doneDefinition || 'quáº£n lÃ½/khÃ¡ch hÃ ng/Ä‘á»“ng nghiá»‡p cÃ³ thá»ƒ nhÃ¬n vÃ o artifact vÃ  hiá»ƒu báº¡n táº¡o ra giÃ¡ trá»‹ gÃ¬.'}`;
  }).join('\n\n');
  const educationAction30Days = isPerformer
    ? '- Trong 30 ngÃ y: chá»n 1 hÆ°á»›ng liá»n ká» vá»›i MC, táº¡o showreel/clip 60-90 giÃ¢y, viáº¿t 1 ká»‹ch báº£n máº«u, xin 1 feedback tá»« producer/khÃ¡ch quen vÃ  gá»­i thá»­ 5 Ä‘áº§u má»‘i phÃ¹ há»£p.'
    : isFreshOrUndirectedRole(normalizedRole)
    ? '- Trong 30 ngÃ y: chá»n 3 role máº«u, Ä‘á»c 9 JD, lÃ m 1 mini project, xin 1 feedback vÃ  sá»­a CV theo role Ä‘Ã£ chá»n.'
    : isAviation
    ? '- Trong 30 ngÃ y: táº¡o checklist safety-service cÃ¡ nhÃ¢n, luyá»‡n 1 announcement tiáº¿ng Anh, xin 1 feedback tá»« senior crew/Ä‘á»“ng nghiá»‡p vÃ  ghi 1 tÃ¬nh huá»‘ng service recovery Ä‘Ã£ che thÃ´ng tin khÃ¡ch.'
    : '- Trong 30 ngÃ y: chá»n 1 nÄƒng lá»±c há»c thuáº­t Ã¡p vÃ o viá»‡c tháº­t; táº¡o 1 quy trÃ¬nh/dashboard/case study; xin 1 xÃ¡c nháº­n tá»« quáº£n lÃ½ hoáº·c khÃ¡ch hÃ ng ná»™i bá»™.';

  const markdown = `# Lá»™ trÃ¬nh thá»±c thi tÄƒng lÆ°Æ¡ng theo thÃ¡ng

## Cháº©n Ä‘oÃ¡n nhanh
Báº¡n Ä‘ang á»Ÿ vai trÃ² "${role}", lÆ°Æ¡ng hiá»‡n táº¡i ${(currentSalary / 1_000_000).toFixed(1)}M/thÃ¡ng vÃ  má»¥c tiÃªu lÃ  "${goal}". Khoáº£ng tÄƒng cáº§n chá»©ng minh lÃ  ${(targetSalary - currentSalary).toLocaleString('vi-VN')} VNÄ/thÃ¡ng, nÃªn roadmap pháº£i Æ°u tiÃªn ${isAviation ? 'báº±ng chá»©ng nghá» Ä‘Ã£ Ä‘Æ°á»£c senior crew/Ä‘á»“ng nghiá»‡p xÃ¡c nháº­n' : 'báº±ng chá»©ng kinh doanh'} thay vÃ¬ danh sÃ¡ch viá»‡c lÃ m chung chung.

Cam káº¿t thá»±c hiá»‡n: nhá»‹p chuáº©n ${actionPlan.standardWeeks} tuáº§n, nhá»‹p báº­n ${actionPlan.flexibleWeeks} tuáº§n, má»—i tuáº§n ${actionPlan.weeklyHours}. Äiá»u kiá»‡n Ä‘Æ°á»£c xem lÃ  hoÃ n thÃ nh: ${actionPlan.completionRule}

## Kháº£o sÃ¡t Ä‘áº§u vÃ o
- Ká»¹ nÄƒng/Ä‘Ã²n báº©y Ä‘Ã£ máº¡nh: ${knownStrengths}.
- Báº±ng chá»©ng/thÃ nh tÃ­ch Ä‘Ã£ cÃ³: ${existingProof}.
- NÃºt tháº¯t cáº§n xá»­ lÃ½ trÆ°á»›c: ${bottleneck}.
- HÆ°á»›ng Æ°u tiÃªn: ${preferredPath}.

## Äá»™ khá»›p há»c váº¥n vá»›i lÆ°Æ¡ng
- PhÃ¢n loáº¡i: ${classification}.
- Há»c váº¥n: ${educationLevel}.
- LiÃªn quan: ${educationDetail}.
- Báº±ng cáº¥p Ä‘ang giÃºp báº¡n cÃ³ tÃ­n hiá»‡u ná»n táº£ng, nhÆ°ng thá»‹ trÆ°á»ng chá»‰ tráº£ thÃªm khi tÃ­n hiá»‡u Ä‘Ã³ biáº¿n thÃ nh KPI, scope lá»›n hÆ¡n hoáº·c quyá»n ra quyáº¿t Ä‘á»‹nh rÃµ hÆ¡n.
${educationAction30Days}${languageCenterNote}${schoolEducationNote}

## Giao thá»©c xá»­ lÃ½ Ä‘iá»ƒm yáº¿u lá»›n nháº¥t
${focusProtocol}${performerNote}${chefNote}${pilotNote}${aviationNote}

## Chiáº¿n lÆ°á»£c ${durationLabel}
${monthSections}

## Báº£n Ä‘á»“ báº±ng chá»©ng tÄƒng lÆ°Æ¡ng
- Evidence log: viá»‡c Ä‘Ã£ lÃ m, output, KPI trÆ°á»›c/sau, áº£nh/link/file, ngÆ°á»i xÃ¡c nháº­n.
- Case study 1 trang: váº¥n Ä‘á», hÃ nh Ä‘á»™ng, káº¿t quáº£, báº±ng chá»©ng, bÃ i há»c cÃ³ thá»ƒ láº·p láº¡i.
- ${isPerformer ? 'Há»“ sÆ¡ MC/Ä‘á»•i hÆ°á»›ng: showreel, 3 máº«u lá»i dáº«n, rate card, feedback khÃ¡ch/agency, danh sÃ¡ch 20 Ä‘áº§u má»‘i event/brand/livestream vÃ  1 case xá»­ lÃ½ sÃ¢n kháº¥u.' : isFreshOrUndirectedRole(normalizedRole) ? 'Há»“ sÆ¡ ngÆ°á»i má»›i: báº£ng chá»n role, 1 mini project, feedback mentor, CV theo role vÃ  tracker 10 nÆ¡i Ä‘Ã£ gá»­i thá»­.' : isAviation ? 'Há»“ sÆ¡ cabin crew: checklist safety-service, feedback senior crew, ghi Ã¢m announcement, chá»©ng chá»‰ training vÃ  tÃ¬nh huá»‘ng service recovery Ä‘Ã£ che thÃ´ng tin khÃ¡ch.' : 'Dashboard lÆ°Æ¡ng: 5 chá»‰ sá»‘ sÃ¡t vai trÃ² hiá»‡n táº¡i vÃ  role má»¥c tiÃªu.'}

## Ká»‹ch báº£n deal lÆ°Æ¡ng 90 giÃ¢y
"Trong ${durationMonths} thÃ¡ng qua, em táº­p trung xá»­ lÃ½ ${weakness}. Káº¿t quáº£ lÃ  em cÃ³ cÃ¡c báº±ng chá»©ng sau: ${isPerformer ? 'showreel, feedback khÃ¡ch/agency, rate card vÃ  case xá»­ lÃ½ sÃ¢n kháº¥u' : isChef ? 'recipe card cÃ³ cost, waste log, tá»‘c Ä‘á»™ ra mÃ³n, checklist SOP báº¿p vÃ  feedback xÃ¡c nháº­n' : isAviation ? 'checklist safety-service, feedback senior crew, announcement tiáº¿ng Anh vÃ  case service recovery Ä‘Ã£ che thÃ´ng tin khÃ¡ch' : 'case study, KPI vÃ  output Ä‘Ã£ Ä‘Æ°á»£c xÃ¡c nháº­n'}. Vá»›i má»©c Ä‘Ã³ng gÃ³p nÃ y vÃ  máº·t báº±ng role má»¥c tiÃªu, em muá»‘n trao Ä‘á»•i vá» má»©c ${(targetSalary / 1_000_000).toFixed(1)}M/thÃ¡ng hoáº·c má»™t scope má»›i cÃ³ KPI rÃµ Ä‘á»ƒ Ä‘áº¡t má»©c Ä‘Ã³."

## Cáº£nh bÃ¡o Ä‘iá»ƒm ngháº½n
- KhÃ´ng xin tÄƒng lÆ°Æ¡ng báº±ng ná»— lá»±c; chá»‰ dÃ¹ng output vÃ  KPI.
- KhÃ´ng Ä‘á»£i hoÃ n háº£o; má»—i tuáº§n pháº£i cÃ³ 1 báº±ng chá»©ng nhá».
- KhÃ´ng há»c lan man; ká»¹ nÄƒng nÃ o khÃ´ng táº¡o KPI trong cÃ´ng viá»‡c thÃ¬ Ä‘á»ƒ sau.

## Viá»‡c cáº§n lÃ m trong 7 ngÃ y tá»›i
1. ${isPerformer ? `Chá»n 3 hÆ°á»›ng Ä‘á»•i nghá» liá»n ká» vá»›i MC vÃ  1 KPI kiá»ƒm chá»©ng cho tá»«ng hÆ°á»›ng. ${getPracticalKpiGuidance(normalizedRole)}` : isFreshOrUndirectedRole(normalizedRole) ? `Chá»n 3 role máº«u, Ä‘á»c má»—i role 3 JD vÃ  cháº¥m Ä‘iá»ƒm há»£p/khÃ´ng há»£p. ${getPracticalKpiGuidance(normalizedRole)}` : isAviation ? `Chá»n 3 tiÃªu chÃ­ cabin crew dá»… theo dÃµi cho "${role}": feedback senior crew, announcement tiáº¿ng Anh, checklist safety-service hoáº·c tÃ¬nh huá»‘ng service recovery.` : `Chá»‘t 5 KPI sÃ¡t role "${role}".`}
2. Táº¡o evidence log vÃ  nháº­p sá»‘ liá»‡u ná»n.
3. ÄÃ³ng gÃ³i 1 output nhá» cÃ³ thá»ƒ gá»­i quáº£n lÃ½ xem.
4. Xin feedback cá»¥ thá»ƒ vÃ  ghi láº¡i thÃ nh báº±ng chá»©ng.
5. LÃªn lá»‹ch review cuá»‘i tuáº§n Ä‘á»ƒ chá»n hÃ nh Ä‘á»™ng tiáº¿p theo.`;

  return {
    format: 'expert_v2',
    version: 2,
    goal: `Lá»™ trÃ¬nh thá»±c thi tÄƒng lÆ°Æ¡ng cho ${role}`,
    summary: `Checklist AI cÃ¡ nhÃ¢n hÃ³a theo ngÃ nh ${jobTitle}, lÆ°Æ¡ng hiá»‡n táº¡i ${(currentSalary / 1_000_000).toFixed(1)}M/thÃ¡ng, Ä‘iá»ƒm yáº¿u "${weakness}", há»c váº¥n "${educationLevel}" vÃ  má»¥c tiÃªu "${goal}". Lá»™ trÃ¬nh nÃ y dá»±a trÃªn dá»¯ liá»‡u báº¡n nháº­p vÃ  bá»™ quy táº¯c nghá» nghiá»‡p Top LÆ°Æ¡ng, khÃ´ng pháº£i tÆ° váº¥n 1-1 bá»Ÿi chuyÃªn gia ngÆ°á»i tháº­t.`,
    weeks: [],
    negotiation_timing: `Má»‘c ${negotiationWindow} lÃ  thá»i Ä‘iá»ƒm Ä‘Ã m phÃ¡n máº¡nh nháº¥t náº¿u Ä‘Ã£ cÃ³ Ä‘á»§ KPI, case study vÃ  báº±ng chá»©ng thá»‹ trÆ°á»ng.`,
    salary_projection: `Náº¿u hoÃ n thÃ nh 70-80% hÃ nh Ä‘á»™ng trong roadmap, báº¡n cÃ³ cÆ¡ sá»Ÿ Ä‘Ã m phÃ¡n quanh má»©c ${(targetSalary / 1_000_000).toFixed(1)} triá»‡u/thÃ¡ng hoáº·c role tÆ°Æ¡ng Ä‘Æ°Æ¡ng. KhÃ´ng pháº£i cam káº¿t tÄƒng lÆ°Æ¡ng.`,
    markdown,
    intake,
    actionPlan,
  };
}

async function generateRoadmap(
  jobTitle: string,
  currentSalary: number,
  targetSalary: number,
  durationMonths: number,
  intake: RoadmapIntake = {},
  roleProfileOverride?: RoleProfile | null
): Promise<RoadmapData> {
  intake = sanitizeRoadmapIntakeForJob(jobTitle, intake);
  const weeks = getCompactPlanWeeks(durationMonths);
  const durationLabel = formatRoadmapDuration(durationMonths);
  const milestoneLabels = getRoadmapMilestoneLabels(durationMonths);
  const negotiationWindow =
    durationMonths <= 3 ? 'thÃ¡ng 2-3' :
    durationMonths <= 6 ? 'thÃ¡ng 4-6' :
    'thÃ¡ng 6-12';
  const salaryGap = targetSalary - currentSalary;
  const baseLockedRole = roleProfileOverride
    ? buildRoadmapRoleSkillsFromProfile(roleProfileOverride)
    : buildRoadmapRoleSkills(jobTitle);
  const outputJobTitle = roleProfileOverride?.title || baseLockedRole.manual?.canonicalTitle || jobTitle;
  const roleText = repairMojibakeText(getRoleIdentityText(outputJobTitle, {
    ...intake,
    currentPosition: normalizeForRoadmapQuality(intake.currentPosition || '') === normalizeForRoadmapQuality(jobTitle) ? outputJobTitle : intake.currentPosition,
  }));
  const compass = getCareerCompassContext(roleText || outputJobTitle, currentSalary, 50);
  const segment = detectRoadmapSegment(roleText || outputJobTitle);
  const roleLanguage = getRoleLanguage(roleText || outputJobTitle, compass);
  const taxonomySkillLabels = getRoadmapTaxonomySkillLabels(roleText || outputJobTitle).slice(0, 4);
  const taxonomySegment = detectRoleSegment(roleText || outputJobTitle);
  const isManagerOrExecutive = isManagerOrExecutiveRoadmapRole(roleText || outputJobTitle);
  const isPilot = isPilotRole(roleText || outputJobTitle);
  const isAviation = isAviationRole(roleText || outputJobTitle);
  const tourismProfile = getTourismRoleProfile(roleText || outputJobTitle);
  const isTourism = Boolean(tourismProfile);
  const isHospitality = isHospitalityRole(roleText || outputJobTitle) && !isTourism;
  const isCleaning = isCleaningRole(roleText || outputJobTitle);
  const isRestaurantManager = isRestaurantManagerRoadmapRole(roleText || outputJobTitle);
  const isRestaurantFrontline = isRestaurantFrontlineRoadmapRole(roleText || outputJobTitle);
  const isHotelManager = isHotelManagerRoadmapRole(roleText || outputJobTitle);
  const isHotelFrontline = isHotelFrontlineRoadmapRole(roleText || outputJobTitle);
  const isVeterinary = isVeterinaryRole(roleText || outputJobTitle);
  const isNutrition = isNutritionRole(roleText || outputJobTitle);
  const isInsurance = isInsuranceRole(roleText || outputJobTitle);
  const isDental = isDentalRoadmapRole(roleText || outputJobTitle);
  const isDentalAssistant = isDentalAssistantRoadmapRole(roleText || outputJobTitle);
  const isSchoolHealthcare = isSchoolHealthcareRole(roleText || outputJobTitle);
  const isEducationAdmissions = taxonomySegment === 'education_admissions' || isEducationAdmissionsRole(roleText || outputJobTitle);
  const isStudyAbroadAdmissions = isStudyAbroadAdmissionsRole(roleText || outputJobTitle);
  const isPublicSubjectTeacher = isPublicSubjectTeacherRole(roleText || outputJobTitle);
  const isLanguageCenterOps = isLanguageCenterManagerRole(roleText || outputJobTitle);
  const isMarketingManager = isMarketingManagerRoadmapRole(roleText || outputJobTitle);
  const kpiGuidance = getPracticalKpiGuidance(roleText || outputJobTitle);
  const lockedRole = roleProfileOverride
    ? buildRoadmapRoleSkillsFromProfile(roleProfileOverride, [
      ...taxonomySkillLabels,
      roleLanguage.mainSkill,
      roleLanguage.proofAsset,
      kpiGuidance,
    ])
    : buildRoadmapRoleSkills(outputJobTitle, [
      ...taxonomySkillLabels,
      roleLanguage.mainSkill,
      roleLanguage.proofAsset,
      kpiGuidance,
    ]);
  const roleSkillsForPrompt = lockedRole.skills;
  const maxCoreTasks = getCompactPlanWeeks(durationMonths) * 2;
  const needsDiagnosis = !intake.mainWeakness || !intake.bottleneck;
  const weaknessForPrompt = intake.mainWeakness || 'ChÆ°a rÃµ - AI pháº£i cháº©n Ä‘oÃ¡n tá»« vá»‹ trÃ­, lÆ°Æ¡ng, ká»¹ nÄƒng máº¡nh, báº±ng chá»©ng hiá»‡n cÃ³ vÃ  benchmark thá»‹ trÆ°á»ng';
  const bottleneckForPrompt = intake.bottleneck || 'ChÆ°a rÃµ - AI pháº£i xÃ¡c Ä‘á»‹nh giáº£ thuyáº¿t nÃºt tháº¯t, thiáº¿t káº¿ tuáº§n 1 Ä‘á»ƒ Ä‘o ná»n vÃ  xÃ¡c nháº­n/loáº¡i trá»«';

  const FALLBACK_WEEKLY = buildFallbackRoadmap(outputJobTitle, currentSalary, targetSalary, durationMonths, compass, segment, intake);
  const FALLBACK = repairRoadmapRoleLanguage(buildExpertFallbackRoadmap(
    FALLBACK_WEEKLY,
    outputJobTitle,
    currentSalary,
    targetSalary,
    durationMonths,
    compass,
    intake
  ));

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    const fallbackValidation = validateRoadmapRoleLock(outputJobTitle, FALLBACK);
    if (fallbackValidation.passed) return FALLBACK;
    console.error('[roadmap-role-lock] fallback failed without API key', { jobTitle, wrongItems: fallbackValidation.wrongItems });
    throw new RoadmapRoleLockError();
  }

  const roleLockSystemPrompt = buildRoadmapRoleLockPrompt({
    jobTitle: outputJobTitle,
    experience: intake.currentPosition || jobTitle,
    currentSalary,
    targetSalary,
    timeline: durationMonths,
    roleSkills: roleSkillsForPrompt,
  });

  const systemPrompt = `${roleLockSystemPrompt}

Báº¡n lÃ  Senior Headhunter & Career Strategist táº¡i Viá»‡t Nam, tá»«ng tÆ° váº¥n tuyá»ƒn dá»¥ng cáº¥p quáº£n lÃ½ vÃ  Ä‘Ã m phÃ¡n lÆ°Æ¡ng cho á»©ng viÃªn.

Nhiá»‡m vá»¥: táº¡o má»™t "Lá»™ trÃ¬nh thá»±c thi tÄƒng lÆ°Æ¡ng theo thÃ¡ng" thá»±c táº¿, tháº³ng tháº¯n, cÃ³ thá»ƒ hÃ nh Ä‘á»™ng ngay.

Quy táº¯c báº¯t buá»™c:
- Tráº£ lá»i báº±ng Markdown thuáº§n, khÃ´ng bá»c trong code fence.
- Viáº¿t tiáº¿ng Viá»‡t tá»± nhiÃªn, sáº¯c, cÃ³ cáº£m giÃ¡c Ä‘Æ°á»£c cÃ¡ nhÃ¢n hÃ³a cho Ä‘Ãºng ngÆ°á»i.
- Pháº£i cÃ³ cÃ¡c má»‘c phÃ¹ há»£p thá»i háº¡n ${durationLabel}: ${milestoneLabels.join(', ')}.
- Má»—i má»‘c pháº£i cÃ³: má»¥c tiÃªu, skill cá»¥ thá»ƒ cáº§n nÃ¢ng, hÃ nh Ä‘á»™ng chÃ­nh theo tuáº§n, báº±ng chá»©ng cáº§n táº¡o, KPI Ä‘o Ä‘Æ°á»£c, checklist hoÃ n thÃ nh vÃ  lá»—i cáº§n trÃ¡nh.
- ToÃ n bá»™ roadmap chá»‰ Ä‘Æ°á»£c cÃ³ khoáº£ng ${maxCoreTasks} viá»‡c lÃµi Ä‘á»ƒ tick. KhÃ´ng Ä‘Æ°á»£c táº¡o 96 viá»‡c, khÃ´ng chia má»—i tuáº§n 4 task dÃ y Ä‘áº·c.
- Pháº£i ghi rÃµ cam káº¿t thá»±c hiá»‡n: nhá»‹p chuáº©n bao nhiÃªu tuáº§n, nhá»‹p báº­n bao nhiÃªu tuáº§n, má»—i tuáº§n cáº§n bao nhiÃªu giá».
- CÃ³ pháº§n "Báº£n Ä‘á»“ báº±ng chá»©ng tÄƒng lÆ°Æ¡ng", "Ká»‹ch báº£n deal lÆ°Æ¡ng 90 giÃ¢y", vÃ  "Cáº£nh bÃ¡o Ä‘iá»ƒm ngháº½n".
- KhÃ´ng há»©a cháº¯c tÄƒng lÆ°Æ¡ng. LuÃ´n dÃ¹ng ngÃ´n ngá»¯ cÃ³ Ä‘iá»u kiá»‡n: náº¿u hoÃ n thÃ nh, cÃ³ cÆ¡ sá»Ÿ, tÄƒng xÃ¡c suáº¥t.
- KhÃ´ng Ä‘Æ°a lá»i khuyÃªn chung chung kiá»ƒu "há»c thÃªm ká»¹ nÄƒng" náº¿u khÃ´ng nÃªu ká»¹ nÄƒng, output vÃ  tiÃªu chÃ­ Ä‘o.
- Ranh giá»›i nghá» báº¯t buá»™c: chá»‰ phÃ¢n loáº¡i ngÃ nh/nghá» tá»« "NgÃ nh nghá»/chá»©c danh há»‡ thá»‘ng" vÃ  "Vá»‹ trÃ­ hiá»‡n táº¡i". Há»c váº¥n, chá»©ng chá»‰, ká»¹ nÄƒng máº¡nh, báº±ng chá»©ng cÅ© vÃ  má»¥c tiÃªu dÃ i háº¡n KHÃ”NG Ä‘Æ°á»£c Ä‘á»•i domain nghá».
- Neu nghe khong phai giao vien tieng Anh, tuyet doi khong dua TESOL, CELTA, IELTS/Cambridge nhu chung chi ca nhan, demo class, lesson plan, rubric Speaking/Writing hoac homework completion vao roadmap. Neu nghe la quan ly trung tam ngoai ngu, chi duoc dung KPI quan ly: enrollment, class fill, teacher utilization, retention, complaint SLA, revenue per class; khong duoc bien thanh giao vien.
- Náº¿u nghá» lÃ  giÃ¡o viÃªn bá»™ mÃ´n cÃ´ng láº­p/trÆ°á»ng há»c nhÆ° ToÃ¡n, LÃ½, HÃ³a, Sá»­, Äá»‹a, Ngá»¯ vÄƒn, Tin há»c, Sinh, GDCD, CÃ´ng nghá»‡, Ãƒâ€šm nháº¡c, Má»¹ thuáº­t hoáº·c Thá»ƒ dá»¥c: roadmap pháº£i xoay quanh giÃ¡o Ã¡n bá»™ mÃ´n, ma tráº­n Ä‘á», rubric cháº¥m bÃ i, tiáº¿n bá»™ Ä‘iá»ƒm sá»‘ há»c sinh, há»“ sÆ¡ chuyÃªn mÃ´n, dá»± giá», chuyÃªn Ä‘á» tá»•, phá»¥ Ä‘áº¡o/bá»“i dÆ°á»¡ng, thi Ä‘ua/phá»¥ cáº¥p/bá»• nhiá»‡m hoáº·c chuyá»ƒn sang subject lead Ä‘Ãºng bá»™ mÃ´n á»Ÿ trÆ°á»ng tÆ°/quá»‘c táº¿. KhÃ´ng Ä‘Æ°á»£c biáº¿n thÃ nh giÃ¡o viÃªn tiáº¿ng Anh, Center Manager, Academic Operations, tuyá»ƒn sinh trung tÃ¢m hoáº·c quáº£n lÃ½ trung tÃ¢m ngoáº¡i ngá»¯.
- Náº¿u nghá» lÃ  nhÃ¢n viÃªn y táº¿ trÆ°á»ng há»c/y táº¿ há»c Ä‘Æ°á»ng/school nurse, tuyá»‡t Ä‘á»‘i khÃ´ng dÃ¹ng TESOL, CELTA, IELTS, lesson plan, demo class, há»c viÃªn, curriculum, rubric Speaking/Writing hoáº·c homework completion. Pháº£i dÃ¹ng sÆ¡ cá»©u há»c Ä‘Æ°á»ng, há»“ sÆ¡ sá»©c khá»e há»c sinh, thuá»‘c/dá»‹ á»©ng, tiÃªm chá»§ng, bá»‡nh truyá»n nhiá»…m, chuyá»ƒn tuyáº¿n, protocol sá»± cá»‘ vÃ  phá»‘i há»£p phá»¥ huynh-giÃ¡o viÃªn-nhÃ  trÆ°á»ng.
- Náº¿u nghá» lÃ  nhÃ¢n viÃªn/chuyÃªn viÃªn thá»‘ng kÃª generic, roadmap pháº£i xoay quanh Excel/Sheets, Power Query, lÃ m sáº¡ch dá»¯ liá»‡u, data dictionary, pivot/dashboard, Ä‘á»‘i soÃ¡t sai lá»‡ch, bÃ¡o cÃ¡o Ä‘á»‹nh ká»³ vÃ  insight note; tuyá»‡t Ä‘á»‘i khÃ´ng Ä‘Æ°a OEE, RCA, Lean, Six Sigma, PLC, line sáº£n xuáº¥t, defect rate, downtime hoáº·c safety incidents trá»« khi chá»©c danh ghi rÃµ thá»‘ng kÃª sáº£n xuáº¥t.
- Náº¿u nghá» lÃ  tÆ° váº¥n du há»c/admissions quá»‘c táº¿, roadmap pháº£i xoay quanh tÆ° váº¥n chá»n trÆ°á»ng-ngÃ nh, kiá»ƒm Ä‘iá»u kiá»‡n Ä‘áº§u vÃ o, checklist há»“ sÆ¡/visa, deadline giáº¥y tá», CRM follow-up, consultation booked, há»“ sÆ¡ ná»™p, offer rate, visa pass rate, enrollment conversion vÃ  feedback khÃ¡ch.
- Náº¿u nghá» lÃ  tÆ° váº¥n tuyá»ƒn sinh/enrollment cho trung tÃ¢m ngoáº¡i ngá»¯, trÆ°á»ng tÆ° hoáº·c Ä‘áº¡i há»c tÆ° thá»¥c, roadmap pháº£i xoay quanh lead qualification, tÆ° váº¥n chÆ°Æ¡ng trÃ¬nh/lá»›p/ngÃ nh phÃ¹ há»£p, há»c phÃ­/ngÃ¢n sÃ¡ch, lá»‹ch tÆ° váº¥n hoáº·c placement test, CRM follow-up, Ä‘Äƒng kÃ½/ghi danh, Ä‘Ã³ng phÃ­, nháº­p há»c, no-show vÃ  feedback khÃ¡ch. KhÃ´ng tá»± biáº¿n thÃ nh giÃ¡o viÃªn, Center Manager hoáº·c váº­n hÃ nh há»c thuáº­t.
- Náº¿u nghá» lÃ  nha sÄ©/dentist/bÃ¡c sÄ© nha khoa, roadmap pháº£i xoay quanh khÃ¡m cháº©n Ä‘oÃ¡n, treatment plan, há»“ sÆ¡ bá»‡nh Ã¡n nha khoa áº©n danh, X-quang/CBCT/áº£nh trong miá»‡ng náº¿u Ä‘Æ°á»£c phÃ©p, protocol vÃ´ khuáº©n-an toÃ n thá»§ thuáº­t, tÆ° váº¥n bá»‡nh nhÃ¢n, tÃ¡i khÃ¡m, theo dÃµi biáº¿n chá»©ng/rework vÃ  feedback bá»‡nh nhÃ¢n/bÃ¡c sÄ© phá»¥ trÃ¡ch. Tuyá»‡t Ä‘á»‘i khÃ´ng dÃ¹ng Excel/Canva/CV/portfolio cÃ¡ nhÃ¢n/Tiáº¿ng Anh B2 nhÆ° skill chÃ­nh.
- Náº¿u nghá» lÃ  trá»£ lÃ½/phá»¥ tÃ¡ nha khoa, roadmap pháº£i xoay quanh chuáº©n bá»‹ gháº¿, dá»¥ng cá»¥, vÃ´ khuáº©n, suction/chuyá»ƒn dá»¥ng cá»¥, hÆ°á»›ng dáº«n bá»‡nh nhÃ¢n sau Ä‘iá»u trá»‹, lá»‹ch tÃ¡i khÃ¡m, tá»“n kho váº­t tÆ° vÃ  feedback bÃ¡c sÄ©; khÃ´ng viáº¿t nhÆ° nha sÄ© cháº©n Ä‘oÃ¡n.
- Náº¿u nghá» lÃ  hospitality/cleaning/housekeeping/buá»“ng phÃ²ng, roadmap pháº£i xoay quanh checklist phÃ²ng/khu vá»±c, tá»‘c Ä‘á»™ ca, tiÃªu chuáº©n sáº¡ch, amenities, maintenance/lost & found, rework/lá»—i, complaint khÃ¡ch, bÃ n giao vÃ  feedback giÃ¡m sÃ¡t.
- Náº¿u nghá» lÃ  tÃ i xáº¿/taxi/shipper/giao hÃ ng/giao nháº­n/driver/delivery, roadmap pháº£i xoay quanh Ä‘Ãºng giá», tá»· lá»‡ hoÃ n thÃ nh Ä‘Æ¡n/chuyáº¿n, tá»‘i Æ°u tuyáº¿n, an toÃ n giao thÃ´ng, giáº¥y tá»/báº±ng lÃ¡i, rating/feedback khÃ¡ch, xá»­ lÃ½ phÃ¡t sinh giao hÃ ng, chi phÃ­ nhiÃªn liá»‡u/thá»i gian tuyáº¿n vÃ  xÃ¡c nháº­n Ä‘iá»u phá»‘i/quáº£n lÃ½. Tuyá»‡t Ä‘á»‘i khÃ´ng Ä‘Æ°a SOP nhÃ  mÃ¡y, 5S, QC checklist, váº­n hÃ nh mÃ¡y, sáº£n lÆ°á»£ng line, tá»• phÃ³/tá»• trÆ°á»Ÿng sáº£n xuáº¥t, TESOL/CELTA/IELTS, Power BI, Python hoáº·c tÃ i chÃ­nh.`;

  const userPrompt = `Dá»¯ liá»‡u á»©ng viÃªn:
- NgÃ nh nghá»/chá»©c danh há»‡ thá»‘ng: ${jobTitle}
- TÃªn nghá» chuáº©n Ä‘á»ƒ hiá»ƒn thá»‹ trong output: ${outputJobTitle}
- Vá»‹ trÃ­ hiá»‡n táº¡i do user nháº­p: ${intake.currentPosition || jobTitle}
- LÆ°Æ¡ng hiá»‡n táº¡i: ${currentSalary.toLocaleString('vi-VN')} VNÄ/thÃ¡ng
- LÆ°Æ¡ng má»¥c tiÃªu há»‡ thá»‘ng Ä‘á» xuáº¥t: ${targetSalary.toLocaleString('vi-VN')} VNÄ/thÃ¡ng
- Má»¥c tiÃªu user trong ${durationLabel} tá»›i: ${intake.twoYearGoal || `${targetSalary.toLocaleString('vi-VN')} VNÄ/thÃ¡ng hoáº·c lÃªn role tá»‘t hÆ¡n`}
- Äiá»ƒm yáº¿u chuyÃªn mÃ´n lá»›n nháº¥t: ${weaknessForPrompt}
- TrÃ¬nh Ä‘á»™ há»c váº¥n cao nháº¥t: ${intake.educationLevel || 'ChÆ°a cung cáº¥p'}
- NgÃ nh há»c/chá»©ng chá»‰ liÃªn quan: ${sanitizeEducationDetailForRole(roleText || outputJobTitle, intake.educationDetail) || 'ChÆ°a cung cáº¥p'}
- Ká»¹ nÄƒng/Ä‘Ã²n báº©y user nÃ³i Ä‘Ã£ khÃ¡ máº¡nh: ${intake.strongSkills || 'ChÆ°a cung cáº¥p'}
- Báº±ng chá»©ng/thÃ nh tÃ­ch user Ä‘Ã£ cÃ³: ${intake.proofAssets || 'ChÆ°a cung cáº¥p'}
- NÃºt tháº¯t lá»›n nháº¥t Ä‘ang cáº£n tÄƒng lÆ°Æ¡ng: ${bottleneckForPrompt}
- Tráº¡ng thÃ¡i cháº©n Ä‘oÃ¡n: ${needsDiagnosis ? 'User chÆ°a cháº¯c Ä‘iá»ƒm yáº¿u/nÃºt tháº¯t. KhÃ´ng Ä‘Æ°á»£c Ä‘oÃ¡n bá»«a; pháº£i tá»± cháº©n Ä‘oÃ¡n báº±ng dá»¯ liá»‡u, táº¡o tuáº§n Ä‘o ná»n vÃ  xá»­ lÃ½ toÃ n bá»™ nhÃ³m Ä‘iá»ƒm yáº¿u cÃ³ kháº£ nÄƒng cáº£n tÄƒng lÆ°Æ¡ng.' : 'User Ä‘Ã£ khai bÃ¡o Ä‘iá»ƒm yáº¿u/nÃºt tháº¯t, nhÆ°ng váº«n pháº£i kiá»ƒm tra láº¡i báº±ng dá»¯ liá»‡u vÃ  báº±ng chá»©ng.'}
- HÆ°á»›ng Æ°u tiÃªn user chá»n: ${describePreferredPath(intake.preferredPath, `${jobTitle} ${intake.currentPosition || ''}`)}
- Thá»i gian cÃ³ thá»ƒ thá»±c thi má»—i tuáº§n: ${intake.weeklyTime || '3-5 giá»/tuáº§n'}
- Thá»i gian roadmap gá»‘c: ${durationMonths} thÃ¡ng (${weeks} tuáº§n)
- Khoáº£ng tÄƒng cáº§n cÃ³: ${salaryGap.toLocaleString('vi-VN')} VNÄ/thÃ¡ng
- NhÃ³m nghá»: ${compass.jobGroup}
- Má»‘c lÆ°Æ¡ng hiá»‡n táº¡i: ${(currentSalary / 1_000_000).toFixed(1)} triá»‡u/thÃ¡ng; má»¥c tiÃªu há»‡ thá»‘ng: ${(targetSalary / 1_000_000).toFixed(1)} triá»‡u/thÃ¡ng. KhÃ´ng dÃ¹ng dáº£i lÆ°Æ¡ng generic náº¿u nÃ³ tháº¥p hÆ¡n hoáº·c lá»‡ch vá»›i má»©c lÆ°Æ¡ng user Ä‘Ã£ khai.
- Skill gap thá»‹ trÆ°á»ng: ${compass.topSkillGap}
- Milestone Ä‘á»ƒ lÃªn band: ${compass.nextMilestone}
- Insight thá»‹ trÆ°á»ng: ${compass.marketInsight}
- Nháº­n diá»‡n domain chá»‰ tá»« chá»©c danh/vá»‹ trÃ­: ${roleText || outputJobTitle} (segment taxonomy: ${taxonomySegment})
- Track nghá» Ä‘Æ°á»£c phÃ©p dÃ¹ng: ${roleLanguage.rolePath}
- Ká»¹ nÄƒng chÃ­nh Ä‘Æ°á»£c phÃ©p Æ°u tiÃªn: ${roleLanguage.mainSkill}
- Skill bank bat buoc cho stimulate/roadmap/certificate: ${taxonomySkillLabels.join(' | ') || roleLanguage.mainSkill}
- Exact role profile báº¯t buá»™c: ${lockedRole.profile.title} (${lockedRole.profile.industry || 'khÃ´ng rÃµ ngÃ nh'}). Náº¿u dá»¯ liá»‡u há»‡ thá»‘ng cÃ³ lá»—i kÃ½ tá»±, output váº«n pháº£i dÃ¹ng tÃªn nghá» chuáº©n "${outputJobTitle}".
- Bá»™ ká»¹ nÄƒng chuyÃªn ngÃ nh báº¯t buá»™c dÃ¹ng trong task/báº±ng chá»©ng:
${formatRoleSkillsForPrompt(roleSkillsForPrompt)}
- Báº±ng chá»©ng nghá» phÃ¹ há»£p: ${roleLanguage.proofAsset}
- KPI nÃªn dÃ¹ng cho case nÃ y: ${kpiGuidance}
${segment ? `- Segment Ä‘áº·c biá»‡t: ${segment.label}
- Æ¯u tiÃªn roadmap: ${segment.priority}
- Loáº¡i báº±ng chá»©ng pháº£i thu tháº­p: ${segment.proof}` : ''}

Cáº¥u trÃºc Markdown mong muá»‘n:
# Lá»™ trÃ¬nh thá»±c thi tÄƒng lÆ°Æ¡ng theo thÃ¡ng
## Cháº©n Ä‘oÃ¡n nhanh
## Äá»™ khá»›p há»c váº¥n vá»›i lÆ°Æ¡ng
## Giao thá»©c xá»­ lÃ½ Ä‘iá»ƒm yáº¿u lá»›n nháº¥t
## Chiáº¿n lÆ°á»£c ${durationLabel}
${milestoneLabels.map(label => `### ${label}`).join('\n')}
## Báº£n Ä‘á»“ báº±ng chá»©ng tÄƒng lÆ°Æ¡ng
## Ká»‹ch báº£n deal lÆ°Æ¡ng 90 giÃ¢y
## Cáº£nh bÃ¡o Ä‘iá»ƒm ngháº½n
## Viá»‡c cáº§n lÃ m trong 7 ngÃ y tá»›i

Quy táº¯c cÃ¡ nhÃ¢n hÃ³a báº¯t buá»™c:
- KhÃ´ng Ä‘Æ°á»£c dÃ¹ng cÃ¡c chá»¯: AI, DeepSeek, ChatGPT, Claude trong ná»™i dung tráº£ vá».
- Náº¿u user Ä‘Ã£ khai bÃ¡o ká»¹ nÄƒng/Ä‘Ã²n báº©y máº¡nh, khÃ´ng Ä‘Æ°á»£c viáº¿t nhÆ° thá»ƒ há» chÆ°a biáº¿t ká»¹ nÄƒng Ä‘Ã³. HÃ£y dÃ¹ng chÃºng lÃ m lá»£i tháº¿ vÃ  nÃ¢ng lÃªn báº±ng chá»©ng/KPI/scope cao hÆ¡n.
- Náº¿u dá»¯ liá»‡u thiáº¿u hoáº·c user khÃ´ng cháº¯c, khÃ´ng Ä‘Æ°á»£c láº·p nguyÃªn chá»¯ "khÃ´ng biáº¿t"; hÃ£y viáº¿t "chÆ°a Ä‘á»§ dá»¯ liá»‡u" vÃ  thiáº¿t káº¿ bÆ°á»›c kháº£o sÃ¡t/Ä‘o ná»n trong tuáº§n Ä‘áº§u.
- Náº¿u user chÆ°a rÃµ Ä‘iá»ƒm yáº¿u hoáº·c nÃºt tháº¯t, pháº§n "Cháº©n Ä‘oÃ¡n nhanh" pháº£i nÃªu 3-5 giáº£ thuyáº¿t nÃºt tháº¯t cÃ³ kháº£ nÄƒng nháº¥t vÃ  tuáº§n 1 pháº£i cÃ³ checklist xÃ¡c minh tá»«ng giáº£ thuyáº¿t. Roadmap pháº£i bao phá»§ Ä‘á»§ cÃ¡c nhÃ³m yáº¿u Ä‘iá»ƒm thÆ°á»ng gáº·p: thiáº¿u KPI, thiáº¿u báº±ng chá»©ng, thiáº¿u scope/quyá»n quyáº¿t Ä‘á»‹nh, thiáº¿u visibility vá»›i ngÆ°á»i tráº£ lÆ°Æ¡ng, thiáº¿u skill táº¡o chÃªnh lá»‡ch, vÃ  thiáº¿u ká»‹ch báº£n deal/apply.
- Náº¿u user má»›i tá»‘t nghiá»‡p hoáº·c chÆ°a rÃµ Ä‘á»‹nh hÆ°á»›ng, khÃ´ng Ä‘Æ°á»£c nÃ³i "biáº¿n 1 cÃ´ng viá»‡c hiá»‡n táº¡i" vÃ¬ há» cÃ³ thá»ƒ chÆ°a cÃ³ viá»‡c. HÃ£y cáº§m tay chá»‰ viá»‡c: chá»n 3 role máº«u, Ä‘á»c JD, lÃ m 1 mini project, xin feedback, sá»­a CV vÃ  gá»­i thá»­.
- Náº¿u user muá»‘n Ä‘á»•i hÆ°á»›ng nghá» nghiá»‡p, pháº£i Ä‘Æ°a 3-5 hÆ°á»›ng nghá» cá»¥ thá»ƒ liá»n ká» vá»›i ká»¹ nÄƒng hiá»‡n cÃ³, nÃ³i vÃ¬ sao há»£p, rá»§i ro gÃ¬, bÃ i test Ä‘áº§u tiÃªn lÃ  gÃ¬ vÃ  KPI kiá»ƒm chá»©ng trong 14 ngÃ y.
- Pháº§n "Äá»™ khá»›p há»c váº¥n vá»›i lÆ°Æ¡ng" pháº£i phÃ¢n loáº¡i vÃ o 1 nhÃ³m: Under-credentialed nhÆ°ng cÃ³ thá»±c chiáº¿n, Credential-fit, Over-credentialed nhÆ°ng chÆ°a monetized Ä‘Æ°á»£c báº±ng cáº¥p, hoáº·c Misaligned credential.
- Pháº§n há»c váº¥n pháº£i nÃ³i rÃµ báº±ng cáº¥p Ä‘ang giÃºp gÃ¬, Ä‘ang bá»‹ thá»‹ trÆ°á»ng bá» phÃ­ á»Ÿ Ä‘Ã¢u, vÃ  3 hÃ nh Ä‘á»™ng trong 30 ngÃ y Ä‘á»ƒ biáº¿n há»c váº¥n/kinh nghiá»‡m thÃ nh báº±ng chá»©ng lÆ°Æ¡ng.
- Vá»›i case quáº£n lÃ½ trung tÃ¢m ngoáº¡i ngá»¯, náº¿u há»c váº¥n lÃ  Tháº¡c sÄ©/MBA hoáº·c NgÃ´n ngá»¯ Anh, pháº£i nÃ³i rÃµ: cÃ³ lá»£i tháº¿ há»c thuáº­t; náº¿u chá»‰ lÃ m váº­n hÃ nh thÆ°á»ng ngÃ y thÃ¬ báº±ng Ä‘ang bá»‹ under-monetized; muá»‘n tÄƒng lÆ°Æ¡ng pháº£i biáº¿n báº±ng cáº¥p thÃ nh quyá»n phá»¥ trÃ¡ch Ä‘Ã o táº¡o giÃ¡o viÃªn, chuáº©n hÃ³a curriculum, tÄƒng retention, giáº£m complaint, cáº£i thiá»‡n trial-to-paid vÃ  má»Ÿ lá»›p/chÆ°Æ¡ng trÃ¬nh má»›i.
- Vá»›i giÃ¡o viÃªn tiá»ƒu há»c/THCS/THPT, hiá»‡u phÃ³, hiá»‡u trÆ°á»Ÿng hoáº·c trÆ°á»ng há»c: báº¯t buá»™c tÃ¡ch cÃ´ng láº­p/biÃªn cháº¿ vÃ  tÆ° thá»¥c/quá»‘c táº¿. CÃ´ng láº­p/biÃªn cháº¿ phá»¥ thuá»™c ngáº¡ch-báº­c, phá»¥ cáº¥p, thi Ä‘ua, bá»• nhiá»‡m vÃ  phÃ¢n cÃ´ng cá»§a Sá»Ÿ/PhÃ²ng GD; khÃ´ng Ä‘Æ°á»£c khuyÃªn deal lÆ°Æ¡ng/nháº£y ngÃ nh nhÆ° tÆ° nhÃ¢n. TÆ° thá»¥c/quá»‘c táº¿ má»›i dÃ¹ng learning outcome, phá»¥ huynh, retention, curriculum vÃ  cháº¥t lÆ°á»£ng giÃ¡o viÃªn Ä‘á»ƒ deal hoáº·c chuyá»ƒn trÆ°á»ng.
- Vá»›i hiá»‡u trÆ°á»Ÿng/hiá»‡u phÃ³: khÃ´ng viáº¿t nhÆ° thá»ƒ cÃ²n má»™t náº¥c chá»©c vá»¥ phá»• thÃ´ng Ä‘á»ƒ â€œlÃªnâ€. Hiá»‡u trÆ°á»Ÿng Ä‘Ã£ lÃ  vá»‹ trÃ­ cao nháº¥t trong má»™t trÆ°á»ng; hÆ°á»›ng há»£p lÃ½ lÃ  tá»‘i Æ°u quyá»n háº¡n/phá»¥ cáº¥p/cháº¥t lÆ°á»£ng trong cÃ´ng láº­p hoáº·c má»Ÿ rá»™ng quy mÃ´/cá»¥m trÆ°á»ng/há»‡ thá»‘ng á»Ÿ tÆ° thá»¥c.
${isPilot ? '- Neu diem yeu la "khong tap trung chi tiet" hoac tuong tu voi phi cong/pilot, phai tao giao thuc flight deck: pre-flight SOP checklist, radio/ATC phraseology practice, simulator/recurrent debrief note, logbook/evidence update va safety/incident-free review; tuyet doi khong dung cabin crew/grooming/service recovery.' : isAviation ? '- Náº¿u Ä‘iá»ƒm yáº¿u lÃ  "khÃ´ng táº­p trung chi tiáº¿t" hoáº·c tÆ°Æ¡ng tá»± vá»›i tiáº¿p viÃªn/cabin crew, pháº£i táº¡o giao thá»©c theo ca/chuyáº¿n: checklist safety-service, luyá»‡n announcement, sá»• lá»—i cabin cÃ¡ nhÃ¢n, feedback senior crew/Ä‘á»“ng nghiá»‡p vÃ  tuyá»‡t Ä‘á»‘i khÃ´ng dÃ¹ng dashboard vÄƒn phÃ²ng.' : '- Náº¿u Ä‘iá»ƒm yáº¿u lÃ  "khÃ´ng táº­p trung chi tiáº¿t" hoáº·c tÆ°Æ¡ng tá»±, pháº£i táº¡o giao thá»©c háº±ng ngÃ y gá»“m checklist Ä‘áº§u ngÃ y, 2 block táº­p trung, sá»• lá»—i chi tiáº¿t, review cuá»‘i ngÃ y, dashboard 5 chá»‰ sá»‘ vÃ  quy táº¯c khÃ´ng má»Ÿ task má»›i khi task cÅ© chÆ°a cÃ³ output.'}
${isSchoolHealthcare ? '- Vá»›i nhÃ¢n viÃªn y táº¿ trÆ°á»ng há»c/y táº¿ há»c Ä‘Æ°á»ng/school nurse, tuyá»‡t Ä‘á»‘i khÃ´ng Ä‘Æ°a TESOL/CELTA/IELTS/lesson plan/demo class/há»c viÃªn/curriculum/rubric Speaking-Writing. Pháº£i dÃ¹ng ká»¹ nÄƒng Ä‘Ãºng nghá»: sÆ¡ cá»©u há»c Ä‘Æ°á»ng, há»“ sÆ¡ sá»©c khá»e há»c sinh, thuá»‘c/dá»‹ á»©ng, tiÃªm chá»§ng, bá»‡nh truyá»n nhiá»…m, chuyá»ƒn tuyáº¿n, incident log, gá»i phá»¥ huynh, phá»‘i há»£p giÃ¡o viÃªn/ban giÃ¡m hiá»‡u vÃ  báº£o máº­t thÃ´ng tin há»c sinh.' : ''}
${isPublicSubjectTeacher ? '- Vá»›i giÃ¡o viÃªn bá»™ mÃ´n cÃ´ng láº­p/trÆ°á»ng há»c, tuyá»‡t Ä‘á»‘i khÃ´ng dÃ¹ng Center Manager, Academic Operations, teacher utilization, trial-to-paid, class fill rate, TESOL/CELTA/IELTS/Cambridge, demo class hoáº·c skill trung tÃ¢m ngoáº¡i ngá»¯. Pháº£i dÃ¹ng task Ä‘Ãºng nghá»: giÃ¡o Ã¡n bá»™ mÃ´n, ma tráº­n Ä‘á», rubric cháº¥m bÃ i, tiáº¿n bá»™ Ä‘iá»ƒm sá»‘ há»c sinh, há»“ sÆ¡ chuyÃªn mÃ´n, dá»± giá»/gÃ³p Ã½, chuyÃªn Ä‘á» tá»•, phá»¥ Ä‘áº¡o/bá»“i dÆ°á»¡ng, thi Ä‘ua/phá»¥ cáº¥p/bá»• nhiá»‡m hoáº·c subject lead Ä‘Ãºng bá»™ mÃ´n náº¿u á»Ÿ trÆ°á»ng tÆ°/quá»‘c táº¿.' : ''}
${isEducationAdmissions ? (isStudyAbroadAdmissions ? '- Vá»›i tÆ° váº¥n du há»c/admissions quá»‘c táº¿, tuyá»‡t Ä‘á»‘i khÃ´ng dÃ¹ng Center Manager, Teacher utilization, lesson plan, TESOL/CELTA nhÆ° skill giáº£ng dáº¡y hoáº·c curriculum. Pháº£i dÃ¹ng ká»¹ nÄƒng Ä‘Ãºng nghá»: qualification nhu cáº§u-ngÃ¢n sÃ¡ch, shortlist trÆ°á»ng/ngÃ nh, checklist há»“ sÆ¡/visa, CRM follow-up, consultation booked, offer/visa outcome, enrollment conversion, SLA follow-up vÃ  feedback khÃ¡ch.' : '- Vá»›i tÆ° váº¥n tuyá»ƒn sinh/enrollment cho trung tÃ¢m ngoáº¡i ngá»¯, trÆ°á»ng tÆ° hoáº·c Ä‘áº¡i há»c tÆ° thá»¥c, tuyá»‡t Ä‘á»‘i khÃ´ng dÃ¹ng Center Manager, Teacher utilization, lesson plan, TESOL/CELTA nhÆ° skill giáº£ng dáº¡y hoáº·c curriculum. Pháº£i dÃ¹ng ká»¹ nÄƒng Ä‘Ãºng nghá»: lead qualification, tÆ° váº¥n chÆ°Æ¡ng trÃ¬nh/lá»›p/ngÃ nh, há»c phÃ­/ngÃ¢n sÃ¡ch, lá»‹ch tÆ° váº¥n hoáº·c placement test, CRM follow-up, Ä‘Äƒng kÃ½/ghi danh, Ä‘Ã³ng phÃ­, nháº­p há»c, SLA follow-up, no-show vÃ  feedback khÃ¡ch.') : ''}
${isLanguageCenterOps ? '- Vá»›i quáº£n lÃ½ trung tÃ¢m ngoáº¡i ngá»¯, pháº£i dÃ¹ng KPI cáº¥p quáº£n lÃ½: active students, retention/churn, trial-to-paid, lead-to-enrollment, class fill rate, teacher utilization, parent complaint SLA, renewal rate, revenue per class, dropout/refund reasons. KhÃ´ng Ä‘Æ°á»£c háº¡ xuá»‘ng task giÃ¡o viÃªn nhÆ° TESOL/CELTA, demo class, lesson plan, Speaking/Writing rubric hoáº·c homework completion.' : ''}
${isMarketingManager ? '- Vá»›i Brand Manager/Marketing Manager/Marketing Lead, tuyá»‡t Ä‘á»‘i khÃ´ng háº¡ xuá»‘ng skill nhÃ¢n viÃªn execution nhÆ° Edit video, Photoshop, Canva, láº­p content calendar, viáº¿t post Ä‘Æ¡n láº» hoáº·c portfolio campaign cÆ¡ báº£n. Pháº£i dÃ¹ng task cáº¥p quáº£n lÃ½: brand positioning, consumer insight, brand health, awareness/consideration, market share/penetration, campaign P&L, budget/media mix, agency briefing, go-to-market launch plan, stakeholder alignment, executive dashboard vÃ  business impact case study.' : ''}
${isManagerOrExecutive ? `- Vá»›i vai trÃ² quáº£n lÃ½/lÃ£nh Ä‘áº¡o, tuyá»‡t Ä‘á»‘i khÃ´ng háº¡ roadmap xuá»‘ng task nhÃ¢n viÃªn cÆ¡ báº£n hoáº·c checklist há»c skill chung chung. Pháº£i dÃ¹ng task Ä‘Ãºng cáº¥p quáº£n lÃ½: KPI dashboard, ownership pháº¡m vi cÃ´ng viá»‡c, káº¿ hoáº¡ch team/vendor/stakeholder, ngÃ¢n sÃ¡ch/chi phÃ­ hoáº·c SLA, coaching/review cadence, risk log vÃ  báº±ng chá»©ng business impact. Skill Ä‘Æ°á»£c phÃ©p bÃ¡m theo: ${taxonomySkillLabels.join(' | ') || roleLanguage.mainSkill}.` : ''}
${isRestaurantManager ? '- Vá»›i quáº£n lÃ½ nhÃ  hÃ ng/Restaurant Manager/F&B Manager, pháº£i dÃ¹ng task cáº¥p quáº£n lÃ½ váº­n hÃ nh: shift operations, floor control, roster, labor cost, food cost, inventory/waste, service quality, table turn, complaint recovery, training team, P&L cÆ¡ báº£n vÃ  dashboard owner/GM. KhÃ´ng Ä‘Æ°á»£c biáº¿n thÃ nh Ä‘áº§u báº¿p: recipe card, plating, kitchen SOP, phá»¥ báº¿p hoáº·c HACCP khÃ´ng pháº£i core náº¿u role khÃ´ng ghi báº¿p/chef.' : ''}
${isRestaurantFrontline ? '- Vá»›i nhÃ¢n viÃªn phá»¥c vá»¥ bÃ n/thu ngÃ¢n nhÃ  hÃ ng/waiter/cashier restaurant, pháº£i dÃ¹ng task frontline Ä‘Æ¡n giáº£n: POS/order accuracy, bill log, table service SOP, upsell táº¡i bÃ n, complaint táº¡i bÃ n, shift handover, vá»‡ sinh khu vá»±c vÃ  feedback quáº£n lÃ½ ca. KhÃ´ng báº¯t user lÃ m P&L, budget, executive dashboard hoáº·c KPI director/manager lÃ m task chÃ­nh.' : ''}
${isHotelManager ? '- Voi quan ly khach san/Hotel Manager/Front Office Manager/Revenue Manager khach san, phai dung task cap quan ly: occupancy, ADR, RevPAR, OTA/revenue coordination, staffing SLA, SOP audit, review score, complaint escalation, P&L/budget va operating dashboard. Khong viet nhu le tan ca nhan.' : ''}
${isHotelFrontline ? '- Voi le tan khach san/front desk/guest service/reservation, phai dung task frontline: check-in/check-out SOP, PMS/booking accuracy, guest request SLA, upsell phong/dich vu, complaint recovery, shift handover, review feedback. Khong bat user lam P&L, RevPAR/ADR strategy, budget khach san hoac dashboard GM nhu task ca nhan.' : ''}
${isVeterinary ? '- Voi bac si thu y/veterinarian, tuyet doi khong viet nhu bac si dieu tri nguoi, nha si hoac phong kham nguoi. Khong dung patient outcome, patient communication, benh nhan/nguoi nha, hospital/healthtech nhu skill chinh. Phai dung animal triage, diagnosis theo loai vat nuoi, vaccination/deworming, surgery/anesthesia safety, parasite control, owner communication, follow-up va case thu y da an thong tin.' : ''}
${isNutrition ? '- Voi chuyen vien dinh duong/nutritionist/dietitian, tuyet doi khong viet nhu bac si lam sang chung. Khong dung clinical protocol, patient communication, benh an, healthtech, surgery/anesthesia, nha khoa hoac thu y. Phai dung nutrition assessment, khau phan hien tai, meal plan/che do an, diet counseling, behavior change, adherence, follow-up va chi so truoc-sau nhu can nang/BMI/vong eo/duong huyet-lipid neu co.' : ''}
${isInsurance ? '- Voi chuyen vien bao hiem phi nhan tho/non-life insurance, tuyet doi khong viet nhu FP&A, Finance Analyst, ke toan, controller, chief accountant, CFA/ACCA hay financial modeling noi bo. Phai dung underwriting risk, claims/boi thuong, giam dinh ton that, policy wording, coverage/loai tru, quote SLA, renewal ratio, loss ratio, premium written va broker/client retention.' : ''}
${isDental ? '- Voi nha si/dentist/bac si nha khoa, tuyet doi khong dung skill generic nhu Excel/Google Sheets dashboard, Canva/PowerPoint, Viet CV/LinkedIn, Tieng Anh B2, portfolio ca nhan. Phai dung skill clinical nha khoa: chan doan, treatment plan, vo khuan/infection control, X-quang/CBCT/photo intraoral, case lam sang an danh, follow-up tai kham, complication/rework log, patient communication va feedback benh nhan/bac si phu trach.' : ''}
${isDentalAssistant ? '- Voi tro ly/phu ta nha khoa, tuyet doi khong viet nhu nha si chan doan dieu tri. Phai dung skill ho tro phong thu thuat: chair setup, dung cu, vo khuan, suction/chuyen dung cu, huong dan sau dieu tri, lich tai kham, ton kho vat tu va feedback bac si.' : ''}
${isPilot ? '- Voi phi cong/pilot/flight deck, tuyet doi khong dung cabin crew, purser, grooming, service recovery, passenger complaint, announcement cabin, senior crew feedback hoac checklist cabin. Phai dung flight safety, SOP compliance, type rating/recurrent training, simulator check, flight hours/logbook, cockpit CRM, ATC communication, checkride, route-aircraft qualification va safety/incident-free record.' : ''}
${isTourism ? `- Voi vai tro du lich/tour nay (${tourismProfile?.kind}), tuyet doi khong map chung sang nha hang/khach san/front office. Khong dua room cleaning, PMS/check-in khach san, upsell phong, table service, POS/order, food cost hoac SOP nha hang-khach san. Phai bam dung skill: ${taxonomySkillLabels.join(' | ') || roleLanguage.mainSkill}. Bang chung phai la: ${roleLanguage.proofAsset}.` : ''}
- Vá»›i MC/ngÆ°á»i dáº«n chÆ°Æ¡ng trÃ¬nh/host sá»± kiá»‡n, tuyá»‡t Ä‘á»‘i khÃ´ng Ä‘Æ°á»£c Ä‘Æ°a ká»¹ nÄƒng ká»¹ thuáº­t vÄƒn phÃ²ng nhÆ° GitHub, TypeScript, JavaScript, API, system design, SQL, debugging. Pháº£i dÃ¹ng ká»¹ nÄƒng Ä‘Ãºng nghá»: showreel, giá»ng nÃ³i, nhá»‹p sÃ¢n kháº¥u, tÆ°Æ¡ng tÃ¡c khÃ¡n giáº£, xá»­ lÃ½ sá»± cá»‘ live, ká»‹ch báº£n lá»i dáº«n, rehearsal, briefing khÃ¡ch hÃ ng, rate card, portfolio sá»± kiá»‡n, feedback khÃ¡ch/agency, booking lead vÃ  tá»· lá»‡ chá»‘t show.
- Vá»›i MC/ngÆ°á»i dáº«n chÆ°Æ¡ng trÃ¬nh muá»‘n chuyá»ƒn hÆ°á»›ng, gá»£i Ã½ hÆ°á»›ng liá»n ká» nhÆ° Event Producer/Coordinator, Brand Activation Executive, Livestream Host/Commerce Host, Content Presenter/Video Script, Voice-over/Trainer nÃ³i trÆ°á»›c Ä‘Ã¡m Ä‘Ã´ng hoáº·c Sales/Customer Success cáº§n ká»¹ nÄƒng thuyáº¿t trÃ¬nh. Tuyá»‡t Ä‘á»‘i khÃ´ng gá»£i Ã½ SOP nhÃ  mÃ¡y, 5S, QC checklist, an toÃ n lao Ä‘á»™ng, sáº£n lÆ°á»£ng line.
- Vá»›i Ä‘áº§u báº¿p/Chef/F&B, tuyá»‡t Ä‘á»‘i khÃ´ng Ä‘Æ°á»£c Ä‘Æ°a ká»¹ nÄƒng ká»¹ thuáº­t vÄƒn phÃ²ng nhÆ° GitHub, TypeScript, JavaScript, API, system design, SQL, debugging. KhÃ´ng viáº¿t "Ä‘ang á»Ÿ cÃ´ng ty" náº¿u nghá» lÃ  báº¿p. Pháº£i dÃ¹ng ká»¹ nÄƒng Ä‘Ãºng nghá»: food cost, waste rate, recipe card, Ä‘á»‹nh lÆ°á»£ng nguyÃªn liá»‡u, tá»‘c Ä‘á»™ ra mÃ³n, chuáº©n plating, an toÃ n vá»‡ sinh, HACCP náº¿u phÃ¹ há»£p, kiá»ƒm ca, training phá»¥ báº¿p, feedback khÃ¡ch, complaint mÃ³n, kitchen SOP, báº¿p chuá»—i/khÃ¡ch sáº¡n/catering/báº¿p trung tÃ¢m.
${isAviation ? '- Vá»›i tiáº¿p viÃªn hÃ ng khÃ´ng/cabin crew/hÃ ng khÃ´ng, tuyá»‡t Ä‘á»‘i khÃ´ng Ä‘Æ°á»£c Ä‘Æ°a ká»¹ nÄƒng ká»¹ thuáº­t vÄƒn phÃ²ng nhÆ° GitHub, TypeScript, JavaScript, API, system design, SQL, debugging. KhÃ´ng yÃªu cáº§u dashboard, doanh thu ná»™i bá»™, há»c viÃªn, food cost hoáº·c showreel. Pháº£i dÃ¹ng ká»¹ nÄƒng Ä‘Ãºng nghá»: safety procedure, checklist cabin, service recovery, passenger communication, announcement tiáº¿ng Anh, grooming, teamwork, senior crew feedback, chá»©ng chá»‰ training, route readiness, briefing/debrief vÃ  xá»­ lÃ½ complaint. Báº±ng chá»©ng khÃ´ng Ä‘Æ°á»£c chá»©a thÃ´ng tin riÃªng tÆ° hÃ nh khÃ¡ch.' : ''}
${isHospitality ? '- Vá»›i hospitality/housekeeping/nhÃ¢n viÃªn buá»“ng phÃ²ng, tuyá»‡t Ä‘á»‘i khÃ´ng Ä‘Æ°á»£c Ä‘Æ°a TESOL/CELTA/lesson plan/há»c viÃªn/phá»¥ huynh. Pháº£i dÃ¹ng ká»¹ nÄƒng Ä‘Ãºng nghá»: room cleaning SOP, room inspection checklist, amenities/minibar/laundry handover, lost & found, maintenance report, guest request, rework/error log, room speed, supervisor feedback vÃ  guest complaint recovery.' : ''}
${isCleaning ? '- Vá»›i cleaning/vá»‡ sinh/táº¡p vá»¥, tuyá»‡t Ä‘á»‘i khÃ´ng Ä‘Æ°á»£c Ä‘Æ°a TESOL/CELTA/lesson plan/há»c viÃªn/phá»¥ huynh. Pháº£i dÃ¹ng ká»¹ nÄƒng Ä‘Ãºng nghá»: area cleaning checklist, tool/chemical log, safety/PPE, before-after proof, rework/complaint log, audit cleanliness, handover vÃ  supervisor feedback.' : ''}
${isDriverDeliveryRole(roleText || outputJobTitle) ? '- Vá»›i tÃ i xáº¿/taxi/shipper/giao hÃ ng/giao nháº­n, tuyá»‡t Ä‘á»‘i khÃ´ng Ä‘Æ°a SOP nhÃ  mÃ¡y, 5S, QC checklist, váº­n hÃ nh mÃ¡y, sáº£n lÆ°á»£ng line, tá»• phÃ³/tá»• trÆ°á»Ÿng sáº£n xuáº¥t, TESOL/CELTA/IELTS, Power BI, Python hoáº·c tÃ i chÃ­nh. Pháº£i dÃ¹ng ká»¹ nÄƒng Ä‘Ãºng nghá»: Ä‘Ãºng giá», completion rate, tá»‘i Æ°u tuyáº¿n, an toÃ n giao thÃ´ng, kiá»ƒm xe/giáº¥y tá»/báº±ng lÃ¡i, rating khÃ¡ch, xá»­ lÃ½ phÃ¡t sinh giao hÃ ng, giáº£m hoÃ n/há»§y, chi phÃ­ nhiÃªn liá»‡u/thá»i gian tuyáº¿n, feedback Ä‘iá»u phá»‘i/quáº£n lÃ½ vÃ  log chuyáº¿n/Ä‘Æ¡n.' : ''}
- Má»—i hÃ nh Ä‘á»™ng pháº£i cÃ³ viá»‡c lÃ m cá»¥ thá»ƒ, output há»¯u hÃ¬nh, KPI Ä‘o vÃ  tiÃªu chuáº©n hoÃ n thÃ nh.
- KhÃ´ng chá»‰ viáº¿t thÃ¡ng chung chung. Má»—i thÃ¡ng pháº£i cÃ³ tuáº§n 1/2/3/4 hoáº·c checklist tuáº§n rÃµ rÃ ng Ä‘á»ƒ user tick tiáº¿n Ä‘á»™.

HÃ£y viáº¿t cá»¥ thá»ƒ theo ngÃ nh ${outputJobTitle}, vá»‹ trÃ­ "${intake.currentPosition || outputJobTitle}", Ä‘iá»ƒm ngháº½n "${intake.bottleneck || intake.mainWeakness || 'chÆ°a rÃµ - cáº§n AI cháº©n Ä‘oÃ¡n báº±ng tuáº§n Ä‘o ná»n'}", ká»¹ nÄƒng máº¡nh "${intake.strongSkills || 'chÆ°a cung cáº¥p'}", báº±ng chá»©ng Ä‘Ã£ cÃ³ "${intake.proofAssets || 'chÆ°a cung cáº¥p'}", há»c váº¥n "${intake.educationLevel || 'chÆ°a cung cáº¥p'} - ${sanitizeEducationDetailForRole(roleText || outputJobTitle, intake.educationDetail) || 'chÆ°a cung cáº¥p'}" vÃ  má»¥c tiÃªu "${intake.twoYearGoal || targetSalary}".`;

  try {
    const client = new OpenAI({
      baseURL: 'https://api.deepseek.com',
      apiKey,
    });
    const buildCandidate = (markdown: string): RoadmapData => ({
      format: 'expert_v2',
      version: 2,
      goal: `Lá»™ trÃ¬nh thá»±c thi tÄƒng lÆ°Æ¡ng cho ${intake.currentPosition || outputJobTitle}`,
      summary: `Checklist AI cÃ¡ nhÃ¢n hÃ³a theo ngÃ nh ${outputJobTitle}, lÆ°Æ¡ng hiá»‡n táº¡i ${(currentSalary / 1_000_000).toFixed(1)}M/thÃ¡ng, Ä‘iá»ƒm yáº¿u "${intake.mainWeakness || 'cáº§n cháº©n Ä‘oÃ¡n trong tuáº§n Ä‘áº§u'}", há»c váº¥n "${intake.educationLevel || 'chÆ°a cung cáº¥p'}" vÃ  má»¥c tiÃªu "${intake.twoYearGoal || `${(targetSalary / 1_000_000).toFixed(1)}M/thÃ¡ng`}". Lá»™ trÃ¬nh nÃ y dá»±a trÃªn dá»¯ liá»‡u báº¡n nháº­p vÃ  bá»™ quy táº¯c nghá» nghiá»‡p Top LÆ°Æ¡ng, khÃ´ng pháº£i tÆ° váº¥n 1-1 bá»Ÿi chuyÃªn gia ngÆ°á»i tháº­t.`,
      weeks: [],
      negotiation_timing: `Má»‘c ${negotiationWindow} lÃ  thá»i Ä‘iá»ƒm Ä‘Ã m phÃ¡n máº¡nh nháº¥t náº¿u Ä‘Ã£ cÃ³ Ä‘á»§ KPI, case study vÃ  báº±ng chá»©ng thá»‹ trÆ°á»ng.`,
      salary_projection: `Náº¿u hoÃ n thÃ nh 70-80% hÃ nh Ä‘á»™ng trong roadmap, báº¡n cÃ³ cÆ¡ sá»Ÿ Ä‘Ã m phÃ¡n quanh má»©c ${(targetSalary / 1_000_000).toFixed(1)} triá»‡u/thÃ¡ng hoáº·c role tÆ°Æ¡ng Ä‘Æ°Æ¡ng. KhÃ´ng pháº£i cam káº¿t tÄƒng lÆ°Æ¡ng.`,
      markdown,
      intake,
      actionPlan: FALLBACK.actionPlan,
    });

    const callDeepSeekRoadmap = async (retryNote = '') => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 45_000);
      try {
        const completion = await client.chat.completions.create(
          {
            model: 'deepseek-v4-pro',
            messages: [
              { role: 'system', content: repairMojibakeText(systemPrompt) },
              { role: 'user', content: repairMojibakeText(`${userPrompt}${retryNote ? `\n\nNOTE VALIDATION: ${retryNote}` : ''}`) },
            ],
            max_tokens: 3800,
            temperature: retryNote ? 0.35 : 0.45,
          },
          { signal: controller.signal }
        );
        const markdown = repairRoadmapRoleLanguage(repairMojibakeText(completion.choices[0]?.message?.content?.trim() ?? ''));
        const candidate = repairRoadmapRoleLanguage(buildCandidate(markdown));
        const wrongItems: string[] = [];
        if (markdown.length < 700) wrongItems.push('Markdown quÃ¡ ngáº¯n hoáº·c rá»—ng');
        if (hasBlockedCustomerTerm(markdown)) wrongItems.push('CÃ³ thuáº­t ngá»¯ AI/provider khÃ´ng Ä‘Æ°á»£c hiá»‡n cho khÃ¡ch');
        if (hasWrongDomainLeak(roleText || outputJobTitle, markdown)) wrongItems.push('Markdown cÃ³ leak sai domain');
        if (!/Ä‘á»™ khá»›p há»c váº¥n vá»›i lÆ°Æ¡ng|Ä‘á»™ khá»›p há»c váº¥n vá»›i lÆ°Æ¡ng/i.test(markdown)) wrongItems.push('Thiáº¿u section Ä‘á»™ khá»›p há»c váº¥n vá»›i lÆ°Æ¡ng');

        const roleGuard = validateGeneratedRoadmapRoleGuard({
          jobTitle: outputJobTitle,
          roleProfile: lockedRole.profile,
          generatedRoadmapText: JSON.stringify(candidate),
        });
        if (!roleGuard.passed) {
          const guardMessage = `ROADMAP_ROLE_GUARD_FAILED: ${roleGuard.reason}; forbidden=${roleGuard.forbiddenHits.join(', ') || 'none'}; missing=${roleGuard.missingRequiredTerms.join(', ') || 'none'}`;
          wrongItems.push(guardMessage);
          console.error('ROADMAP_ROLE_GUARD_FAILED', {
            jobTitle: outputJobTitle,
            roleId: lockedRole.profile?.key,
            reason: roleGuard.reason,
            forbiddenHits: roleGuard.forbiddenHits,
            missingRequiredTerms: roleGuard.missingRequiredTerms,
            retry: Boolean(retryNote),
          });
        }

        const validationController = new AbortController();
        const validationTimeout = setTimeout(() => validationController.abort(), 20_000);
        const validation = await validateRoadmapRoleLockWithAi(client, outputJobTitle, candidate, validationController.signal);
        clearTimeout(validationTimeout);
        const allWrongItems = [...wrongItems, ...validation.wrongItems];
        return {
          candidate,
          validation: {
            passed: allWrongItems.length === 0 && validation.passed,
            wrongItems: allWrongItems,
            severity: allWrongItems.length ? 'high' : validation.severity,
          },
        };
      } finally {
        clearTimeout(timeout);
      }
    };

    const first = await callDeepSeekRoadmap();
    if (first.validation.passed) return first.candidate;

    const retryNote = `Láº§n trÆ°á»›c bá»‹ sai á»Ÿ: ${first.validation.wrongItems.join('; ')}. Láº§n nÃ y pháº£i fix, bÃ¡m 100% nghá» "${outputJobTitle}", viáº¿t tiáº¿ng Viá»‡t Ä‘áº§y Ä‘á»§ dáº¥u vÃ  chá»‰ dÃ¹ng bá»™ ká»¹ nÄƒng: ${roleSkillsForPrompt.join(' | ')}.`;
    const second = await callDeepSeekRoadmap(retryNote);
    if (second.validation.passed) return second.candidate;

    console.error('[roadmap-role-lock] generation failed after retry', {
      jobTitle,
      firstWrongItems: first.validation.wrongItems,
      secondWrongItems: second.validation.wrongItems,
    });
    throw new RoadmapRoleLockError();

  } catch (error) {
    if (error instanceof RoadmapRoleLockError) throw error;
    const fallbackValidation = validateRoadmapRoleLock(outputJobTitle, FALLBACK);
    if (fallbackValidation.passed) return FALLBACK;
    console.error('[roadmap-role-lock] fallback failed after generation error', {
      jobTitle,
      error: error instanceof Error ? error.message : error,
      wrongItems: fallbackValidation.wrongItems,
    });
    throw new RoadmapRoleLockError();
  }
}

// POST â€” generate lá»™ trÃ¬nh sau khi thanh toÃ¡n
export async function POST(req: NextRequest) {
  try {
    const originError = enforceOrigin(req);
    if (originError) return originError;
    const limitError = rateLimit(req, 'roadmap-generate-post', 8);
    if (limitError) return limitError;

    const {
      vspiId,
      accessCode,
      currentPosition,
      mainWeakness,
      twoYearGoal,
      educationLevel,
      educationDetail,
      strongSkills,
      proofAssets,
      bottleneck,
      preferredPath,
      weeklyTime,
    } = await req.json();
    if (!vspiId) return NextResponse.json({ error: 'Missing vspiId' }, { status: 400 });
    if (!roadmapAccessCodeMatches(vspiId, accessCode)) {
      return NextResponse.json({ error: 'Access code required' }, { status: 401 });
    }
    const intake: RoadmapIntake = {
      currentPosition: cleanIntakeValue(currentPosition),
      mainWeakness: cleanIntakeValue(mainWeakness),
      twoYearGoal: cleanIntakeValue(twoYearGoal),
      educationLevel: cleanIntakeValue(educationLevel),
      educationDetail: cleanIntakeValue(educationDetail),
      strongSkills: cleanIntakeValue(strongSkills),
      proofAssets: cleanIntakeValue(proofAssets),
      bottleneck: cleanIntakeValue(bottleneck),
      preferredPath: cleanIntakeValue(preferredPath),
      weeklyTime: cleanIntakeValue(weeklyTime),
    };

    // Verify Ä‘Ã£ paid
    const { data: roadmap, error } = await supabaseServer
      .from('roadmaps')
      .select('*')
      .eq('vspi_id', vspiId)
      .eq('status', 'paid')
      .maybeSingle();

    if (error) throw error;
    if (!roadmap) return NextResponse.json({ error: 'Not found or not paid' }, { status: 404 });

    const roadmapRoleId = typeof roadmap.role_id === 'string' ? roadmap.role_id.trim() : '';
    const roadmapRoleProfile = roadmapRoleId ? getRoadmapRoleProfileByIdOrThrow(roadmapRoleId) : null;
    if (!roadmapRoleId) {
      console.warn('ROADMAP_LEGACY_JOB_TITLE_RESOLUTION', { vspiId, jobTitle: roadmap.job_title });
    }
    const authoritativeJobTitle = roadmapRoleProfile?.title || roadmap.job_title;
    const sanitizedIntake = sanitizeRoadmapIntakeForJob(authoritativeJobTitle, intake);

    // Náº¿u Ä‘Ã£ cÃ³ roadmap tá»‘t rá»“i thÃ¬ tráº£ vá» luÃ´n. Roadmap cÅ© bá»‹ láº·p tuáº§n sáº½ Ä‘Æ°á»£c táº¡o láº¡i.
    if (roadmap.roadmap_json) {
      const cleanExisting = repairRoadmapRoleLanguage(repairMojibakeDeep<RoadmapData>(roadmap.roadmap_json));
      if (!isLowQualityRoadmap(cleanExisting, authoritativeJobTitle) && intakeMatches(cleanExisting, sanitizedIntake)) {
        if (hasMojibakeText(roadmap.roadmap_json)) {
          await supabaseServer
            .from('roadmaps')
            .update({ roadmap_json: cleanExisting })
            .eq('vspi_id', vspiId);
        }
        return NextResponse.json({ roadmap: cleanExisting, progress: roadmap.task_progress, accessCode: issueRoadmapAccessCode(vspiId) }, { headers: NO_CACHE_HEADERS });
      }
    }

    // Generate má»›i
    const generated = repairRoadmapRoleLanguage(repairMojibakeDeep(await generateRoadmap(
      authoritativeJobTitle,
      roadmap.current_salary,
      roadmap.target_salary,
      roadmap.duration_months,
      sanitizedIntake,
      roadmapRoleProfile
    )));

    // LÆ°u vÃ o DB
    await supabaseServer
      .from('roadmaps')
      .update({ roadmap_json: generated, task_progress: {} })
      .eq('vspi_id', vspiId);

    return NextResponse.json({ roadmap: generated, progress: {}, accessCode: issueRoadmapAccessCode(vspiId) }, { headers: NO_CACHE_HEADERS });

  } catch (err: unknown) {
    console.error('[roadmap/generate]', err instanceof Error ? err.message : err);
    if (err instanceof RoadmapRoleLockError) {
      return NextResponse.json({ error: err.message }, { status: 503, headers: NO_CACHE_HEADERS });
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

// GET â€” láº¥y roadmap + progress (by vspiId hoáº·c phone)
export async function GET(req: NextRequest) {
  const originError = enforceOrigin(req);
  if (originError) return originError;
  const limitError = rateLimit(req, 'roadmap-generate-get', 20);
  if (limitError) return limitError;

  const { searchParams } = new URL(req.url);
  const vspiId = searchParams.get('id');
  const phone  = searchParams.get('phone');
  const accessCode = searchParams.get('accessCode') || searchParams.get('code');

  // Lookup báº±ng SÄT + mÃ£ truy cáº­p â€” tráº£ vá» roadmap paid má»›i nháº¥t
  if (phone && !vspiId) {
    if (!accessCode) return NextResponse.json({ error: 'Access code required' }, { status: 401 });
    const clean = phone.replace(/\D/g, '');
    const { data: rows, error } = await supabaseServer
      .from('roadmaps')
      .select('vspi_id, roadmap_json, task_progress, status, goal_label, job_title, role_id, current_salary, target_salary, duration_months, paid_at, created_at')
      .eq('phone', clean)
      .eq('status', 'paid')
      .order('paid_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(10);

    const matched = rows?.find(row => roadmapAccessCodeMatches(row.vspi_id, accessCode));
    if (error || !matched) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    const data = matched;
    const cleanRoadmapJson = data.roadmap_json ? repairRoadmapRoleLanguage(repairMojibakeDeep<RoadmapData>(data.roadmap_json)) : data.roadmap_json;
    if (cleanRoadmapJson && hasMojibakeText(data.roadmap_json)) {
      await supabaseServer
        .from('roadmaps')
        .update({ roadmap_json: cleanRoadmapJson })
        .eq('vspi_id', data.vspi_id);
    }
    return NextResponse.json({ ...data, roadmap_json: cleanRoadmapJson, accessCode: issueRoadmapAccessCode(data.vspi_id) }, { headers: NO_CACHE_HEADERS });
  }

  if (!vspiId) return NextResponse.json({ error: 'Missing id or phone' }, { status: 400 });
  if (!roadmapAccessCodeMatches(vspiId, accessCode)) {
    return NextResponse.json({ error: 'Access code required' }, { status: 401 });
  }

  const { data, error } = await supabaseServer
    .from('roadmaps')
    .select('vspi_id, roadmap_json, task_progress, status, goal_label, job_title, role_id, current_salary, target_salary, duration_months')
    .eq('vspi_id', vspiId)
    .maybeSingle();

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const restoreRoleId = typeof data.role_id === 'string' ? data.role_id.trim() : '';
  const restoreRoleProfile = restoreRoleId ? getRoadmapRoleProfileByIdOrThrow(restoreRoleId) : null;
  if (!restoreRoleId) {
    console.warn('ROADMAP_LEGACY_JOB_TITLE_RESOLUTION', { vspiId, jobTitle: data.job_title });
  }
  const restoreJobTitle = restoreRoleProfile?.title || data.job_title;
  const cleanRoadmapJson = data.roadmap_json ? repairRoadmapRoleLanguage(repairMojibakeDeep<RoadmapData>(data.roadmap_json)) : data.roadmap_json;
  const restoreValidation = cleanRoadmapJson ? validateRoadmapRoleLock(restoreJobTitle, cleanRoadmapJson) : { passed: false };
  if (cleanRoadmapJson && restoreValidation.passed && hasActionPlan(cleanRoadmapJson) && hasGoodMarkdownRoadmap(cleanRoadmapJson)) {
    if (hasMojibakeText(data.roadmap_json) || JSON.stringify(cleanRoadmapJson) !== JSON.stringify(data.roadmap_json)) {
      await supabaseServer
        .from('roadmaps')
        .update({ roadmap_json: cleanRoadmapJson })
        .eq('vspi_id', data.vspi_id);
    }
    return NextResponse.json({ ...data, roadmap_json: cleanRoadmapJson, accessCode: issueRoadmapAccessCode(data.vspi_id) }, { headers: NO_CACHE_HEADERS });
  }
  if (cleanRoadmapJson && isLowQualityRoadmap(cleanRoadmapJson, restoreJobTitle)) {
    const savedIntake = sanitizeRoadmapIntakeForJob(restoreJobTitle, getSavedIntake(cleanRoadmapJson));
    let generated: RoadmapData;
    try {
      generated = await generateRoadmap(
        restoreJobTitle,
        data.current_salary,
        data.target_salary,
        data.duration_months,
        savedIntake,
        restoreRoleProfile
      );
    } catch (err) {
      if (err instanceof RoadmapRoleLockError) {
        return NextResponse.json({ error: err.message }, { status: 503, headers: NO_CACHE_HEADERS });
      }
      throw err;
    }
    const cleanGenerated = repairRoadmapRoleLanguage(repairMojibakeDeep(generated));
    await supabaseServer
      .from('roadmaps')
      .update({ roadmap_json: cleanGenerated, task_progress: {} })
      .eq('vspi_id', data.vspi_id);
    return NextResponse.json({ ...data, roadmap_json: cleanGenerated, task_progress: {}, accessCode: issueRoadmapAccessCode(data.vspi_id) }, { headers: NO_CACHE_HEADERS });
  }
  if (cleanRoadmapJson && hasMojibakeText(data.roadmap_json)) {
    await supabaseServer
      .from('roadmaps')
      .update({ roadmap_json: cleanRoadmapJson })
      .eq('vspi_id', data.vspi_id);
  }
  return NextResponse.json({ ...data, roadmap_json: cleanRoadmapJson, accessCode: issueRoadmapAccessCode(data.vspi_id) }, { headers: NO_CACHE_HEADERS });
}
