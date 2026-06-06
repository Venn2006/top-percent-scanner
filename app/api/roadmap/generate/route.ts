import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { supabaseServer } from '@/lib/supabaseServer';
import { getCareerCompassContext } from '@/lib/careerCompassEngine';
import { rateLimit } from '@/lib/apiProtection';
import { hasMojibakeText, repairMojibakeDeep, repairMojibakeText } from '@/lib/mojibake';
import { issueRoadmapAccessCode, roadmapAccessCodeMatches } from '@/lib/roadmapAccessServer';
import { buildDeterministicRoadmapFallback } from '@/lib/buildDeterministicRoadmapFallback';
import { validateFinalRoadmapBeforePersist } from '@/lib/roadmapFinalRoleGuard';
import { buildCanonicalRoadmapUserPrompt, buildRoadmapGenerationContext } from '@/lib/roadmapPromptCanonical';
import { validateGeneratedRoadmapRoleGuard } from '@/lib/validateGeneratedRoadmapRoleGuard';
import { validateRoadmapQualityGate } from '@/lib/roadmapQualityGate';
import { normalizeRoadmapDuration } from '@/lib/serverSalaryGuard';
import {
  getApprovedPregeneratedRoadmap,
  normalizeRoadmapSeniorityLevel,
  roadmapSeniorityFromExperience,
  ROADMAP_NOT_READY_MESSAGE,
} from '@/lib/pregeneratedRoadmaps';
import {
  buildCustomRoadmapRoleSkills,
  buildRoadmapRoleLockPrompt,
  buildRoadmapRoleSkills,
  buildRoadmapRoleSkillsFromProfile,
  formatRoleSkillsForPrompt,
  repairRoadmapRoleLanguage,
  validateRoadmapRoleLock,
  validateRoadmapRoleLockWithAi,
} from '@/lib/roadmapRoleLock';
import { findClosestRoleProfiles, getRoleProfileById, type RoleProfile } from '@/lib/roleProfiles';
import { enforceUpstashRateLimit } from '@/lib/rateLimit';
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
  hasHousekeepingSkillLeakForSpaRole,
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
  focus: string;       // "Tuần 1: Xây portfolio"
  tasks: string[];     // 3-4 tasks cụ thể
  milestone: string;   // Kết quả đo được cuối tuần
}

interface RoadmapData {
  format?: 'weekly' | 'markdown' | 'expert_v2';
  version?: number;
  goal: string;
  summary: string;
  weeks: WeekPlan[];
  negotiation_timing: string;  // "Tuần X là thời điểm tốt nhất để đàm phán"
  salary_projection: string;   // "Nếu hoàn thành 80% tasks, lương kỳ vọng: X triệu"
  custom_role_notice?: string;
  markdown?: string;
  intake?: RoadmapIntake;
  actionPlan?: RoadmapActionPlan;
}

interface RoadmapIntake {
  currentPosition?: string;
  futureGoalText?: string;
  currentJobTitle?: string;
  currentRoleId?: string;
  targetJobTitle?: string;
  targetRoleId?: string;
  targetSalary?: number;
  targetSalaryAssessment?: string;
  customTargetRole?: boolean;
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

function roadmapJsonError(error: string, code: string, status: number, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ error, code, ...extra }, { status, headers: NO_CACHE_HEADERS });
}

function pregeneratedNotReadyResponse() {
  return roadmapJsonError(ROADMAP_NOT_READY_MESSAGE, 'ROADMAP_PREGENERATED_NOT_READY', 503, {
    message: ROADMAP_NOT_READY_MESSAGE,
  });
}

function withRuntimeIntake(roadmap: RoadmapData, intake: RoadmapIntake | Record<string, unknown>): RoadmapData {
  return repairRoadmapRoleLanguage(repairMojibakeDeep({
    ...roadmap,
    intake: {
      ...(roadmap.intake || {}),
      ...intake,
    },
  } as RoadmapData));
}

async function loadApprovedPregeneratedRoadmap(input: {
  roleId: string | null | undefined;
  seniorityLevel: unknown;
  intake?: RoadmapIntake | Record<string, unknown>;
}) {
  const pregenerated = await getApprovedPregeneratedRoadmap<RoadmapData>(supabaseServer, {
    roleId: input.roleId,
    seniorityLevel: input.seniorityLevel,
  });
  if (!pregenerated) return null;
  return withRuntimeIntake(pregenerated.roadmapContent, input.intake || {});
}

async function readJsonBody(req: NextRequest) {
  try {
    return await req.json();
  } catch {
    return null;
  }
}

function roleSuggestions(jobTitle: string) {
  return findClosestRoleProfiles(jobTitle, 3).map(profile => ({
    role_id: profile.key,
    title: profile.title,
    industry: profile.industry,
  }));
}

function getRequiredRoadmapRoleProfile(roleId: unknown, jobTitle: string) {
  const cleanRoleId = typeof roleId === 'string' ? roleId.trim() : '';
  if (!cleanRoleId) {
    return { roleId: null, profile: null } as const;
  }
  const profile = getRoleProfileById(cleanRoleId);
  if (!profile) {
    return {
      error: roadmapJsonError('Hệ thống chưa có bộ kỹ năng đủ chắc cho nghề này. Vui lòng chọn nghề gần nhất trong danh sách.', 'MISSING_ROLE_ID', 400, {
        suggestions: roleSuggestions(jobTitle),
      }),
    } as const;
  }
  return { roleId: cleanRoleId, profile } as const;
}

function buildValidatedDeterministicFallback(input: {
  jobTitle: string;
  roleId?: string | null;
  roleProfile: RoleProfile | null;
  userInputs: RoadmapIntake | Record<string, unknown>;
  context: string;
}): { roadmap: RoadmapData; source: 'fallback' } | null {
  try {
    const fallback = repairRoadmapRoleLanguage(repairMojibakeDeep(buildDeterministicRoadmapFallback({
      roleProfile: input.roleProfile,
      canonicalRoleTitle: input.roleProfile?.title || input.jobTitle,
      canonicalRoleId: input.roleId || input.roleProfile?.key || null,
      userInputs: input.userInputs as Record<string, unknown>,
    }) as RoadmapData));

    const guard = validateFinalRoadmapBeforePersist({
      jobTitle: input.roleProfile?.title || input.jobTitle,
      roleId: input.roleId || input.roleProfile?.key || null,
      roleProfile: input.roleProfile,
      finalRoadmap: fallback,
    });

    const qualityGate = validateRoadmapQualityGate({
      roadmap: fallback,
      jobTitle: input.roleProfile?.title || input.jobTitle,
      roleId: input.roleId || input.roleProfile?.key || null,
      roleProfile: input.roleProfile,
      expectedDurationMonths: Number((input.userInputs as Record<string, unknown>).durationMonths || (input.userInputs as Record<string, unknown>).duration_months || (input.userInputs as Record<string, unknown>).duration || 0) || null,
    });

    if (guard.passed && qualityGate.passed) return { roadmap: fallback, source: 'fallback' };

    console.error('ROADMAP_DETERMINISTIC_FALLBACK_GUARD_FAILED', {
      context: input.context,
      jobTitle: input.jobTitle,
      roleId: input.roleId || input.roleProfile?.key || null,
      reason: guard.reason,
      forbiddenHits: guard.forbiddenHits,
      missingRequiredTerms: guard.missingRequiredTerms,
      qualityReasons: qualityGate.reasons,
      qualityMetrics: qualityGate.metrics,
    });
    return null;
  } catch (error) {
    console.error('ROADMAP_DETERMINISTIC_FALLBACK_THROW', {
      context: input.context,
      jobTitle: input.jobTitle,
      roleId: input.roleId || input.roleProfile?.key || null,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function formatRoadmapDuration(months: number) {
  return months === 12 ? '1 năm' : `${months} tháng`;
}

function getRoadmapMilestoneLabels(months: number) {
  const monthCount = Math.max(1, Math.min(12, Math.round(months) || 1));
  return Array.from({ length: monthCount }, (_, index) => `Tháng ${index + 1}`);
}

function getRoadmapMilestoneMonths(months: number) {
  const monthCount = Math.max(1, Math.min(12, Math.round(months) || 1));
  return Array.from({ length: monthCount }, (_, index) => index + 1);
}

function getCompactPlanWeeks(months: number) {
  const normalized = months === 9 ? 9 : months === 6 ? 6 : 3;
  return normalized * 4;
}

function getWeeklyTaskLimit(weeklyTime?: string) {
  const normalized = normalizeForRoadmapQuality(weeklyTime || '');
  if (/1\s*[-–]\s*2|1\s*2|duoi\s*2|it\s*gio/.test(normalized)) return 1;
  if (/6\s*[-–]\s*8|6\s*8|8\s*gio|nhieu\s*gio/.test(normalized)) return 3;
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
    return 'Chứng chỉ/ngành học đã khai báo chưa phải đòn bẩy trực tiếp cho track nghề này; chỉ dùng như tín hiệu kỷ luật học tập khi cần.';
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
    return 'KPI sát nghề MC: số show/clip đạt chuẩn, feedback khách/agency, chương trình đúng timeline, số lead booking, tỷ lệ chốt show, mức phí trung bình/show.';
  }
  if (isFreshOrUndirectedRole(role)) {
    return 'KPI cho người mới: số JD đã phân tích, số bài test/mini project hoàn thành, số feedback mentor nhận được, số CV gửi đúng role và tỷ lệ được phản hồi.';
  }
  if (isCareerPivotRole(role)) {
    if (isHumanResourcesRole(role)) {
      return 'KPI đổi hướng cho nhân sự: số role HR đã test, số JD bóc tách, số cuộc coffee chat, số mini case HR hoàn thành, số CV gửi đúng hướng và số phản hồi nhận được.';
    }
    return 'KPI đổi hướng: số role mục tiêu đã lọc, số skill chuyển đổi chứng minh được, số portfolio mini hoàn thành, số cuộc coffee chat/feedback và số hồ sơ gửi thử.';
  }
  if (isHumanResourcesRole(role)) {
    return 'KPI nhân sự: time-to-fill, tỉ lệ pass CV/phỏng vấn, offer acceptance, chất lượng onboarding, training completion, retention/churn, SLA xử lý yêu cầu nhân sự hoặc độ hài lòng nội bộ.';
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
    return 'KPI y tế học đường: thời gian phản ứng sự cố, hồ sơ sức khỏe học sinh cập nhật đúng hạn, số ca sơ cứu/chuyển tuyến, theo dõi thuốc/dị ứng không lỗi, tiêm chủng/bệnh truyền nhiễm và feedback nhà trường-phụ huynh.';
  }
  if (isLanguageCenterManagerRole(role)) {
    return 'KPI quản lý trung tâm ngoại ngữ: lead-to-enrollment, trial-to-paid, active students, class fill rate, teacher utilization, retention/renewal, dropout/refund rate, parent complaint SLA, revenue per class và margin lớp.';
  }
  if (isEnglishTeacherRole(role)) {
    return 'KPI giáo viên tiếng Anh: pre-test/post-test, mock test IELTS/TOEIC, homework completion, attendance, Speaking/Writing rubric, số lỗi ngữ pháp/phát âm giảm, feedback học viên/phụ huynh và retention/renewal.';
  }
  if (isEducationAdmissionsRole(role)) {
    return isStudyAbroadAdmissionsRole(role)
      ? 'KPI tư vấn du học: lead qualified, lịch tư vấn đã đặt, hồ sơ nộp đúng hạn, offer rate, visa pass rate, enrollment conversion, SLA follow-up, tỷ lệ thiếu giấy tờ và feedback khách.'
      : 'KPI tư vấn tuyển sinh: lead qualified, lịch tư vấn đã đặt, placement test booked, đăng ký/ghi danh, tỷ lệ đóng phí-nhập học, SLA follow-up, tỷ lệ no-show, tỷ lệ thiếu thông tin và feedback khách.';
  }
  if (isHousekeepingRole(role)) {
    return 'KPI buồng phòng: số phòng/ca, phút/phòng, lỗi QC/rework, checklist đạt chuẩn, amenities/minibar đúng, maintenance/lost & found báo đúng, feedback giám sát và complaint khách giảm.';
  }
  if (isStatisticsDataRole(role)) {
    return 'KPI thống kê dữ liệu: độ chính xác báo cáo, thời gian chốt báo cáo, data error rate, số dashboard được dùng, deadline báo cáo, số insight được quản lý áp dụng và số giờ xử lý thủ công giảm.';
  }
  if (isSchoolEducationRole(role)) {
    return 'KPI giáo dục trường học: tiến bộ điểm số/năng lực học sinh, tỷ lệ nộp bài, phản hồi phụ huynh, chất lượng giáo án/rubric, dự giờ/coaching giáo viên. Nếu công lập/biên chế, gắn với hồ sơ chuyên môn, thi đua, phụ cấp và bổ nhiệm; nếu tư thục/quốc tế, gắn với retention, phụ huynh và deal lương theo thị trường.';
  }
  if (isChefRole(role)) {
    return 'KPI nghề bếp: food cost, waste rate, thời gian ra món, complaint/rating món, số suất/ca và số người được hướng dẫn.';
  }
  if (isPilotRole(role)) {
    return 'KPI pilot: flight hours, safety/incident-free record, recurrent check pass, simulator performance, SOP compliance, route/aircraft qualification, cockpit CRM and ATC communication feedback.';
  }
  if (isAviationRole(role)) {
    return 'KPI cabin crew: checklist safety-service hoàn thành, feedback senior crew, announcement luyện có ghi âm, tình huống service recovery và route readiness.';
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
      label: 'sinh viên mới tốt nghiệp',
      priority: 'offer đầu đời, thử việc, portfolio, CV bullet, LinkedIn proof và script deal sau 60-90 ngày',
      proof: 'portfolio mini, feedback của mentor/quản lý, checklist học việc, KPI hoàn thành task đúng hạn',
    };
  }

  if (/cong nhan|binh duong|factory worker|machine operator|production operator|van hanh may/.test(normalized)) {
    return {
      label: 'công nhân sản xuất tại cụm Bình Dương/FDI',
      priority: 'năng suất, chuyên cần, an toàn lao động, kỹ năng vận hành máy, đề xuất lên tổ phó/tổ trưởng',
      proof: 'sản lượng/giờ, tỷ lệ lỗi, số ngày chuyên cần, số lần hỗ trợ line, chứng nhận an toàn hoặc vận hành máy',
    };
  }

  if (isMcRole(normalized)) {
    return {
      label: 'MC / người dẫn chương trình / host sự kiện',
      priority: 'showreel bán hàng, kịch bản sân khấu, xử lý tình huống live, rate card theo format sự kiện và feedback khách/agency',
      proof: 'video highlight 60-90 giây, 3 mẫu lời dẫn, feedback khách hàng, checklist briefing/rehearsal, case xử lý sự cố sân khấu',
    };
  }

  if (isChefRole(normalized)) {
    return {
      label: 'Đầu bếp / bếp nhà hàng / F&B',
      priority: 'food cost, waste rate, tốc độ ra món, chuẩn món giờ cao điểm, an toàn bếp và năng lực dẫn ca',
      proof: 'recipe card có định lượng/cost, bảng waste, log tốc độ ra món, feedback khách, checklist SOP bếp và bằng chứng training phụ bếp',
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
      label: 'Tiếp viên hàng không / cabin crew / dịch vụ hàng không',
      priority: 'an toàn bay, service recovery, giao tiếp tiếng Anh, grooming, teamwork, feedback senior crew và sẵn sàng tuyến/role khó hơn',
      proof: 'checklist safety-service, ghi âm announcement tiếng Anh, feedback senior crew/đồng nghiệp, chứng chỉ training, ghi chú tình huống xử lý khách đã che thông tin riêng tư',
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
      deal_internal: 'Tăng lương tại nhà hàng hiện tại bằng KPI ca, roster, labor cost, food cost, service quality và complaint recovery.',
      jump_job: 'Chuyển sang chuỗi nhà hàng/F&B ops trả tốt hơn bằng dashboard vận hành và bằng chứng quản lý ca.',
      leadership: 'Lên F&B Ops/Area Manager bằng năng lực quản nhiều ca, training đội ngũ và kiểm soát P&L cơ bản.',
      expert: 'Đi sâu restaurant operations: SOP, floor control, food/labor cost, review score và dashboard owner/GM.',
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
      deal_internal: 'Tăng lương tại bếp hiện tại bằng food cost, waste rate, tốc độ ra món, chuẩn món và feedback xác nhận.',
      jump_job: 'Đổi sang bếp/đơn vị trả cao hơn: chuỗi nhà hàng, khách sạn, catering hoặc bếp trung tâm có KPI vận hành rõ.',
      leadership: 'Lên quản lý bếp hoặc quản lý nhà hàng: Ca trưởng, Sous Chef, Bếp trưởng, Kitchen Manager hoặc vận hành nhà hàng.',
      expert: 'Đi sâu menu/F&B chuyên sâu: recipe, costing, SOP, training bếp, concept menu hoặc tư vấn vận hành.',
    };
    return labels[value] || labels.deal_internal;
  }

  if (isAviationRole(role)) {
    const labels: Record<string, string> = {
      deal_internal: 'Xin review ở hãng hiện tại bằng safety-service, service recovery, feedback senior crew và route readiness.',
      jump_job: 'Chuyển sang hãng/tuyến/role dịch vụ hàng không trả tốt hơn, có tiêu chuẩn và phụ cấp tốt hơn.',
      leadership: 'Lên Purser/Cabin Leader bằng briefing, debrief, hỗ trợ junior và xử lý escalation trong cabin.',
      expert: 'Đi sâu trainer/service expert: checklist, training, chuẩn phục vụ và tình huống mẫu đã che thông tin riêng tư.',
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
      deal_internal: 'Tăng lương tại khách sạn hiện tại bằng tốc độ phòng, checklist đạt chuẩn, giảm rework/lỗi và feedback giám sát.',
      jump_job: 'Đổi sang khách sạn/căn hộ dịch vụ/resort trả tốt hơn hoặc role Room Attendant senior có tiêu chuẩn rõ.',
      leadership: 'Lên Housekeeping Senior/Supervisor bằng bàn giao ca, kiểm phòng, hỗ trợ người mới và xử lý complaint/lost & found.',
      expert: 'Đi sâu housekeeping chuẩn cao: SOP phòng, room inspection, amenities/minibar, maintenance report và evidence log sạch.',
    };
    return labels[value] || labels.deal_internal;
  }

  if (isDriverDeliveryRole(role)) {
    const labels: Record<string, string> = {
      deal_internal: 'Tăng lương/thu nhập tại đội xe hoặc nền tảng hiện tại bằng đúng giờ, tỷ lệ hoàn thành đơn, an toàn, rating và log xử lý phát sinh.',
      jump_job: 'Đổi sang fleet/nền tảng/đội xe trả tốt hơn hoặc tuyến/ca có chuyến/đơn ổn định hơn, có KPI vận tải rõ.',
      leadership: 'Lên lead tài xế/tổ trưởng đội xe/điều phối vận tải bằng năng lực hỗ trợ tuyến, xử lý phát sinh và kèm người mới.',
      expert: 'Đi sâu vận hành tài xế: tối ưu tuyến, an toàn, giảm hủy/hoàn, tiết kiệm chi phí và bằng chứng rating/chuyến/đơn.',
    };
    return labels[value] || labels.deal_internal;
  }

  if (isMcRole(role)) {
    const labels: Record<string, string> = {
      deal_internal: 'Tăng fee với khách/agency hiện tại bằng showreel, feedback, rate card và case xử lý sân khấu.',
      jump_job: 'Chuyển sang format trả cao hơn: corporate, activation, livestream, talkshow hoặc brand event.',
      leadership: 'Lead sự kiện hoặc team MC: nhận format lớn hơn, training MC mới và phối hợp agency.',
      expert: 'Đi sâu host chuyên nghiệp: kịch bản, rehearsal, xử lý live, thương hiệu cá nhân và rate card premium.',
    };
    return labels[value] || labels.deal_internal;
  }

  const labels: Record<string, string> = {
    deal_internal: 'Ở lại và tăng lương bằng KPI, scope, bằng chứng và lịch review rõ.',
    jump_job: 'Đổi sang role/môi trường trả cao hơn, có dải lương, scope và KPI tốt hơn vị trí hiện tại.',
    leadership: 'Lên quản lý/lead bằng bằng chứng quản người, quản scope, chịu KPI hoặc owner một mảng.',
    expert: 'Đi sâu chuyên môn bằng năng lực hiếm, chứng chỉ/case study và portfolio nghề.',
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
  if (hasHousekeepingSkillLeakForSpaRole(jobTitle, value)) return true;
  if (isDriverDeliveryRole(jobTitle) && /tesol|celta|ielts|cambridge|lesson plan|demo class|hoc vien|phu huynh|power bi|python|financial|tai chinh|ke toan|cfa|acca|audit|5s|qc checklist|van hanh may|san luong|line leader|ho so len to pho|ho so len to truong|to truong san xuat|to pho san xuat/.test(text)) return true;
  if (!isNonTechPersonalRole) return false;
  const techLeak = /github|typescript|javascript|api integration|system design|debugging|technical doc|code review|developer workflow|sql\b|codebase|pull request|frontend|backend/i.test(value);
  if (techLeak) return true;
  if (isHospitalityRole(jobTitle) || isCleaningRole(jobTitle)) {
    return /tesol|celta|lesson plan|demo class|speaking\/writing|hoc vien|phu huynh|teacher|curriculum|rubric/i.test(value);
  }
  if (isAviationRole(jobTitle)) {
    return /dashboard|doanh thu|revenue|học viên|hoc vien|student|trial-to-paid|teacher utilization|food cost|recipe card|kitchen sop|showreel|rate card/i.test(value);
  }
  if (isChefRole(jobTitle)) {
    return /đang ở công ty|dang o cong ty|tại công ty|tai cong ty|công ty trả|cong ty tra/i.test(value);
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
      rolePath: 'MC chuyên nghiệp / host sự kiện có showreel, rate card và case xử lý sân khấu',
      mainSkill: 'showreel bán hàng + kịch bản sân khấu + xử lý tình huống live + rate card theo format sự kiện',
      proofAsset: 'video highlight, mẫu lời dẫn, feedback khách hàng, ảnh/link show và checklist briefing/rehearsal',
      opportunityList: 'agency sự kiện, wedding planner, brand activation, livestream commerce, talkshow, corporate event',
      portfolioWord: 'hồ sơ MC',
      productWord: 'bằng chứng nghề',
    };
  }
  if (isChefRole(normalized)) {
    return {
      rolePath: 'Ca trưởng bếp / Sous Chef / bếp chuỗi có KPI vận hành',
      mainSkill: 'food cost + waste rate + tốc độ ra món + chuẩn SOP bếp giờ cao điểm',
      proofAsset: 'recipe card có định lượng/cost, bảng waste, log tốc độ ra món, feedback khách và checklist training phụ bếp',
      opportunityList: 'chuỗi nhà hàng, khách sạn, catering, bếp trung tâm hoặc bếp có KPI vận hành rõ',
      portfolioWord: 'hồ sơ bếp',
      productWord: 'bằng chứng nghề bếp',
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
      rolePath: 'Senior Cabin Crew / Purser / tuyến quốc tế',
      mainSkill: 'an toàn bay + service recovery + announcement tiếng Anh + feedback senior crew',
      proofAsset: 'checklist safety-service, feedback senior crew/đồng nghiệp, ghi âm announcement, chứng chỉ training và ghi chú tình huống xử lý khách đã che thông tin riêng tư',
      opportunityList: 'hãng bay, tuyến quốc tế, senior cabin crew, purser track, cabin service trainer hoặc đơn vị dịch vụ hàng không trả tốt hơn',
      portfolioWord: 'hồ sơ cabin crew',
      productWord: 'bằng chứng dịch vụ bay',
    };
  }
  if (isHousekeepingRole(normalized)) {
    return {
      rolePath: 'Room Attendant senior / Housekeeping Supervisor / khách sạn-căn hộ dịch vụ chuẩn cao',
      mainSkill: 'room cleaning checklist + tốc độ phòng + giảm lỗi/rework + amenities/minibar + feedback giám sát',
      proofAsset: 'checklist phòng đã tick, ảnh trước-sau đã che thông tin khách, bảng phút/phòng, log lỗi/rework, feedback giám sát và case xử lý request/complaint nhỏ',
      opportunityList: 'khách sạn, resort, căn hộ dịch vụ, housekeeping senior, housekeeping supervisor hoặc facility-hospitality trả tốt hơn',
      portfolioWord: 'hồ sơ buồng phòng',
      productWord: 'bằng chứng housekeeping',
    };
  }
  if (isHumanResourcesRole(normalized) && isCareerPivotRole(normalized)) {
    return {
      rolePath: 'chọn 1 nhánh HR mới: Talent Acquisition, L&D, C&B, HR Operations, HRBP junior hoặc People Analytics nhẹ',
      mainSkill: 'bóc JD HR, phỏng vấn định hướng, viết mini case nhân sự, đọc KPI HR và chuyển kinh nghiệm hiện có thành portfolio',
      proofAsset: 'bảng so sánh 5 nhánh HR, 1 mini case tuyển dụng/đào tạo/C&B, 3 cuộc coffee chat, CV theo nhánh đã chọn và tracker phản hồi',
      opportunityList: 'role TA/L&D/C&B/HR Ops/HRBP junior, agency tuyển dụng, công ty có team People rõ hoặc startup cần HR generalist',
      portfolioWord: 'hồ sơ chuyển hướng HR',
      productWord: 'bằng chứng chuyển hướng nghề',
    };
  }
  if (isHumanResourcesRole(normalized)) {
    return {
      rolePath: 'HRBP junior / Talent Acquisition / L&D / C&B / HR Operations có KPI rõ',
      mainSkill: 'KPI nhân sự + case tuyển dụng/đào tạo/onboarding + báo cáo insight cho quản lý',
      proofAsset: 'JD analysis, funnel tuyển dụng, training feedback, onboarding checklist, C&B benchmark hoặc dashboard HR đơn giản',
      opportunityList: 'team HR có KPI rõ, agency tuyển dụng, công ty tăng trưởng nhanh, trung tâm đào tạo nội bộ hoặc role People Operations',
      portfolioWord: 'hồ sơ nhân sự',
      productWord: 'bằng chứng HR',
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
      rolePath: 'IELTS/Cambridge Teacher → Academic Lead / Curriculum Lead môn tiếng Anh',
      mainSkill: 'lesson plan TESOL/CELTA-style + rubric Speaking/Writing + đo tiến bộ học viên + retention lớp tiếng Anh',
      proofAsset: 'demo class 10-15 phút, lesson plan, pre-test/post-test sheet, Speaking/Writing rubric, feedback học viên/phụ huynh và attendance/homework tracker',
      opportunityList: 'trung tâm IELTS/Cambridge, trường quốc tế, chương trình tiếng Anh học thuật, academic team hoặc curriculum team',
      portfolioWord: 'hồ sơ giáo viên tiếng Anh',
      productWord: 'bằng chứng lớp tiếng Anh',
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
    proofAsset: 'file/link/ảnh chụp chứng minh kết quả, số liệu trước/sau và người xác nhận',
    opportunityList: 'công ty/trường/trung tâm/nhà máy/role có khả năng trả cao hơn',
    portfolioWord: 'portfolio',
    productWord: 'sản phẩm/bằng chứng',
  };
}

function normalizeSurveyText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
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

function cleanIntakeSalary(value: unknown): number | undefined {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 500_000 || numeric > 500_000_000) return undefined;
  return Math.round(numeric);
}

function cleanIntakeBoolean(value: unknown): boolean | undefined {
  return value === true ? true : undefined;
}

function sameOptionalValue(a?: string, b?: string): boolean {
  return (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase();
}

function intakeMatches(existing: unknown, incoming: RoadmapIntake): boolean {
  const saved = (existing as RoadmapData | null)?.intake;
  if (!saved) return false;
  return (
    sameOptionalValue(saved.currentPosition, incoming.currentPosition) &&
    sameOptionalValue(saved.futureGoalText, incoming.futureGoalText) &&
    sameOptionalValue(saved.currentJobTitle, incoming.currentJobTitle) &&
    sameOptionalValue(saved.currentRoleId, incoming.currentRoleId) &&
    sameOptionalValue(saved.targetJobTitle, incoming.targetJobTitle) &&
    sameOptionalValue(saved.targetRoleId, incoming.targetRoleId) &&
    Number(saved.targetSalary || 0) === Number(incoming.targetSalary || 0) &&
    sameOptionalValue(saved.targetSalaryAssessment, incoming.targetSalaryAssessment) &&
    Boolean(saved.customTargetRole) === Boolean(incoming.customTargetRole) &&
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
    futureGoalText: cleanIntakeValue(saved?.futureGoalText),
    currentJobTitle: cleanIntakeValue(saved?.currentJobTitle),
    currentRoleId: cleanIntakeValue(saved?.currentRoleId),
    targetJobTitle: cleanIntakeValue(saved?.targetJobTitle),
    targetRoleId: cleanIntakeValue(saved?.targetRoleId),
    targetSalary: cleanIntakeSalary(saved?.targetSalary),
    targetSalaryAssessment: cleanIntakeValue(saved?.targetSalaryAssessment),
    customTargetRole: cleanIntakeBoolean(saved?.customTargetRole),
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
  return markdown.length >= 700 && /tháng\s*(1|3|6|12)/i.test(markdown);
}

function hasEducationFitSection(value: unknown): boolean {
  const roadmap = value as RoadmapData | null;
  const markdown = typeof roadmap?.markdown === 'string' ? roadmap.markdown : '';
  return /độ khớp học vấn với lương|độ khớp học vấn với lương/i.test(markdown);
}

function hasActionPlan(value: unknown): boolean {
  const plan = (value as RoadmapData | null)?.actionPlan;
  const milestones = Array.isArray(plan?.milestones) ? plan.milestones : [];
  const taskCount = milestones.reduce((total, milestone) => (
    total + (milestone.weeks || []).reduce((weekTotal, week) => weekTotal + (week.tasks || []).length, 0)
  ), 0);
  return Boolean(plan?.standardWeeks && plan?.flexibleWeeks && taskCount >= 6);
}

function ensureRoadmapActionPlan(input: {
  roadmap: RoadmapData;
  jobTitle: string;
  roleProfile?: RoleProfile | null;
  currentSalary: unknown;
  targetSalary: unknown;
  durationMonths: unknown;
  intake?: RoadmapIntake;
}): RoadmapData {
  if (hasActionPlan(input.roadmap)) return input.roadmap;

  const currentSalary = Number(input.currentSalary || 0) || 8_000_000;
  const targetSalary = Number(input.targetSalary || 0) || Math.round(currentSalary * 1.25);
  const durationMonths = normalizeRoadmapDuration(input.durationMonths);
  const jobTitle = input.roleProfile?.title || input.jobTitle;
  const intake = sanitizeRoadmapIntakeForJob(jobTitle, input.intake || input.roadmap.intake || {});
  const compass = getCareerCompassContext(jobTitle, currentSalary, 50, input.roleProfile?.industry);
  const segment = detectRoadmapSegment(jobTitle);
  const weekly = buildFallbackRoadmap(jobTitle, currentSalary, targetSalary, durationMonths, compass, segment, intake);
  const fallback = buildExpertFallbackRoadmap(weekly, jobTitle, currentSalary, targetSalary, durationMonths, compass, intake);

  return repairRoadmapRoleLanguage(repairMojibakeDeep({
    ...input.roadmap,
    weeks: Array.isArray(input.roadmap.weeks) && input.roadmap.weeks.length ? input.roadmap.weeks : weekly.weeks,
    actionPlan: fallback.actionPlan,
    intake: {
      ...(input.roadmap.intake || {}),
      ...intake,
    },
  } as RoadmapData));
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
  return /không biết|không biết|khong biet|chưa biết|chưa biết|chua biet/i.test(value);
}

function hasGenericRoadmapCopy(value: string): boolean {
  const normalized = normalizeForRoadmapQuality(value);
  return /tang level thang|nang skill tao chenh lech|nen mong bang chung|dong goi case tang luong|chon # kpi sat voi|portfolio chung|case study chung|hoan thanh # output do duoc/.test(normalized);
}


function hasFallbackLoopCopy(value: unknown): boolean {
  const raw = typeof value === 'string' ? value : JSON.stringify(value || '');
  const normalized = normalizeForRoadmapQuality(raw);
  const repeatedStageCopy = [
    'dua bang chung vao ca viec that va do truoc sau',
    'dua output vao ca viec that va do truoc sau',
    'dua output vao ca viec that',
    'ap dung vao ca viec that do loi toc do chat luong truoc sau',
    'ap dung vao ca viec that',
    'tao checklist cong viec that xoay quanh',
    'checkpoint co kpi truoc sau tu tinh huong that khong chi checklist nhap',
  ].some((phrase) => normalized.split(phrase).length - 1 >= 2);
  return /cap nhat bang chung vong|vong nang cap|c p nh t b ng ch ng v ng|v ng n ng c p/.test(normalized) || repeatedStageCopy;
}

function hasBrokenMilestoneSequence(roadmap: RoadmapData | null): boolean {
  const milestones = Array.isArray(roadmap?.actionPlan?.milestones) ? roadmap.actionPlan.milestones : [];
  if (milestones.length === 0) return true;
  const months = milestones.map(milestone => Number(milestone.month));
  if (months[0] !== 1 || months.some(month => !Number.isFinite(month) || month < 1)) return true;
  return months.some((month, index) => index > 0 && month !== months[index - 1] + 1);
}

function hasDurationMismatch(roadmap: RoadmapData | null, expectedDurationMonths?: number): boolean {
  if (!expectedDurationMonths) return false;
  const normalizedDuration = expectedDurationMonths === 9 ? 9 : expectedDurationMonths === 6 ? 6 : 3;
  const expectedWeeks = getCompactPlanWeeks(normalizedDuration);
  const milestones = Array.isArray(roadmap?.actionPlan?.milestones) ? roadmap.actionPlan.milestones : [];
  const actionWeeks = milestones.flatMap(milestone => Array.isArray(milestone.weeks) ? milestone.weeks : []);
  if (milestones.length !== normalizedDuration) return true;
  if (actionWeeks.length < expectedWeeks) return true;
  const months = milestones.map(milestone => Number(milestone.month));
  return months.some((month, index) => month !== index + 1);
}

function isLowQualityRoadmap(value: unknown, jobTitle = '', expectedDurationMonths?: number, roleId?: string | null, roleProfile?: RoleProfile | null): value is RoadmapData {
  const roadmap = value as RoadmapData | null;
  const roleText = repairMojibakeText(getRoleIdentityText(jobTitle, roadmap?.intake || {}));
  const roadmapContent = { ...roadmap, intake: undefined };
  const serialized = JSON.stringify(roadmapContent);
  const roleLockValidation = jobTitle ? validateRoadmapRoleLock(jobTitle, roadmapContent) : { passed: true };
  const qualityGate = validateRoadmapQualityGate({
    roadmap: roadmapContent,
    jobTitle,
    roleId,
    roleProfile,
    expectedDurationMonths,
  });
  const milestones = Array.isArray(roadmap?.actionPlan?.milestones) ? roadmap.actionPlan.milestones : [];
  const taskCount = milestones.reduce((total, milestone) => (
    total + (milestone.weeks || []).reduce((weekTotal, week) => weekTotal + (week.tasks || []).length, 0)
  ), 0);
  if (roadmap?.format === 'expert_v2') {
    const markdown = typeof roadmap.markdown === 'string' ? roadmap.markdown : '';
    return (
      roadmap.version !== 2 ||
      taskCount > 144 ||
      !hasGoodMarkdownRoadmap(roadmap) ||
      !hasEducationFitSection(roadmap) ||
      !hasActionPlan(roadmap) ||
      hasBrokenMilestoneSequence(roadmap) ||
      hasDurationMismatch(roadmap, expectedDurationMonths) ||
      hasRepeatedActionTasks(roadmap) ||
      hasBlockedCustomerTerm(markdown) ||
      hasUnknownSurveyLeak(markdown) ||
      hasGenericRoadmapCopy(serialized) ||
      hasFallbackLoopCopy(serialized) ||
      !qualityGate.passed ||
      !roleLockValidation.passed ||
      (isEnglishTeacherRole(roleText) && /Chọn 1 KPI sát với|Chon 1 KPI sat voi|Photoshop\/Canva|Instructional Design|Thiết kế slide Canva|Thiet ke slide Canva/i.test(serialized)) ||
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
  const targetLabel = `${(targetSalary / 1_000_000).toFixed(1)} triệu/tháng`;
  const gapLabel = `${Math.max(0, targetSalary - currentSalary).toLocaleString('vi-VN')}đ/tháng`;
  const segmentNote = segment ? ` Ưu tiên riêng cho nhóm này: ${segment.priority}.` : '';
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
      ? 'tổ phó/tổ trưởng hoặc line vận hành tốt hơn'
      : isFresh
        ? 'chọn 1 role đầu đời phù hợp và có offer tốt hơn sau thử việc'
      : isHrPivot
        ? roleLanguage.rolePath
        : isPivot
        ? roleLanguage.rolePath
        : compass.nextMilestone;

  const blueprints = [
    {
      focus: `Chốt hướng tăng lương: ${rolePath}`,
      milestone: `Có 1 trang mục tiêu gồm mức hiện tại, mức đích ${targetLabel}, 3 năng lực thiếu và 10 nơi/role đáng nhắm tới.`,
      tasks: [
        `Viết rõ 3 role có thể trả cao hơn cho ${jobTitle}; ghi mức lương mục tiêu, yêu cầu chính và lý do bạn phù hợp.`,
        'Chụp lại hoặc lưu 5 tin tuyển dụng/band lương liên quan để làm bằng chứng thị trường.',
        isFresh
          ? 'Tạo bảng chọn hướng gồm 3 role đầu đời: việc hằng ngày là gì, cần skill nào, bài test thường gặp, mức lương entry và vì sao mình hợp/không hợp.'
          : isHrPivot
          ? 'Tạo bảng so sánh 5 nhánh HR có thể chuyển: Talent Acquisition, L&D, C&B, HR Operations, HRBP junior; mỗi nhánh ghi việc hằng ngày, KPI, lương tham khảo, điểm hợp và điểm không hợp.'
          : isPerformer
          ? 'Tạo kho bằng chứng MC gồm: video showreel, ảnh sân khấu, feedback khách/agency, format sự kiện, mức phí đã nhận và người xác nhận.'
          : isChef
          ? 'Tạo kho bằng chứng nghề bếp gồm: recipe card, định lượng/cost món, waste log, tốc độ ra món, ảnh plating, feedback khách và người xác nhận.'
          : isPilot
          ? 'Tạo kho bằng chứng pilot gồm: logbook/flight hours summary, type rating/recurrent certificates, simulator check record, safety/incident-free record, route-aircraft qualification và instructor/check feedback nếu được phép chia sẻ.'
          : isAviation
          ? 'Tạo kho bằng chứng cabin crew gồm: checklist safety-service, ghi âm announcement tiếng Anh, feedback senior crew/đồng nghiệp, chứng chỉ training và 3 tình huống xử lý khách đã che thông tin riêng tư.'
          : isStatistics
          ? 'Tạo kho bằng chứng thống kê gồm: 1 file dữ liệu đã làm sạch, data dictionary 10 cột chính, pivot/dashboard, log đối soát sai lệch và 1 ghi chú insight 1 trang cho quản lý.'
          : isSchoolHealthcare
          ? 'Tạo kho bằng chứng y tế học đường gồm: sổ hồ sơ sức khỏe học sinh đã ẩn thông tin, checklist sơ cứu, log thuốc/dị ứng, log sự cố/chuyển tuyến và kế hoạch tiêm chủng/bệnh truyền nhiễm.'
          : isEducationAdmissions
          ? isStudyAbroadAdmissions
            ? 'Tạo kho bằng chứng tư vấn du học gồm: tracker 20 lead đã ẩn thông tin, nhu cầu-ngân sách, shortlist trường/ngành, checklist giấy tờ, deadline, offer/visa outcome, next step và feedback khách.'
            : 'Tạo kho bằng chứng tư vấn tuyển sinh gồm: tracker 20 lead đã ẩn thông tin, nguồn lead, nhu cầu học, học phí/ngân sách, chương trình phù hợp, lịch tư vấn/placement test, trạng thái đăng ký-đóng phí-nhập học, next step và feedback khách.'
          : isPublicSubjectTeacher
          ? 'Tạo kho bằng chứng giáo viên bộ môn gồm: giáo án bộ môn, ma trận đề, rubric chấm bài, điểm trước-sau, bài học sinh đã ẩn danh, chuyên đề tổ, phụ đạo/bồi dưỡng và xác nhận dự giờ/góp ý.'
          : isRestaurantManager
          ? 'Chọn 3 tình huống quản lý nhà hàng hay gặp: thiếu người trong ca, complaint lớn, food/labor cost vượt ngưỡng hoặc order/bill lỗi; ghi cách xử lý và KPI theo dõi.'
          : isRestaurantFrontline
          ? 'Chon 3 tinh huong phuc vu/thu ngan hay gap: order sai, bill loi, khach complaint hoac request gap; ghi cach xu ly trong 3 buoc va ai xac nhan.'
          : isHotelManager
          ? 'Chon 3 tinh huong quan ly khach san: occupancy thap, review xau, complaint qua SLA hoac staffing lech; ghi root cause va 3 action 30 ngay.'
          : isHotelFrontline
          ? 'Chon 3 tinh huong le tan/front desk: booking sai, check-in tre, guest request qua SLA hoac complaint; ghi cach xu ly va handover.'
          : isRestaurantManager
          ? 'Lập dashboard ca/tháng cho nhà hàng: doanh thu, table turn, labor cost, food cost/waste, complaint recovery và training team.'
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
          ? 'Tạo kho bằng chứng housekeeping/hospitality gồm: checklist phòng, ảnh before-after đã che thông tin khách, log thời gian dọn phòng, lỗi/rework, feedback giám sát và case xử lý yêu cầu khách.'
          : isCleaning
          ? 'Tạo kho bằng chứng vệ sinh gồm: checklist khu vực, ảnh before-after, log hóa chất/dụng cụ, rework/complaint và feedback giám sát.'
          : isDriverDelivery
          ? 'Tạo kho bằng chứng tài xế gồm: log chuyến/đơn, tỷ lệ đúng giờ, số chuyến/đơn hoàn thành, rating/feedback khách, checklist an toàn xe/giấy tờ và 3 case xử lý phát sinh trong ca.'
          : isEnglishTeacher
          ? 'Tạo kho bằng chứng giáo viên tiếng Anh gồm: demo class 10-15 phút, lesson plan TESOL/CELTA-style, pre-test/post-test sheet, rubric Speaking/Writing, feedback học viên/phụ huynh và tracker attendance/homework.'
          : isInsurance
          ? 'Tao kho bang chung bao hiem phi nhan tho gom: case underwriting/claims/renewal da an thong tin, dieu khoan coverage/loai tru, premium logic, loss ratio neu co, feedback broker/khach hang va SLA xu ly.'
          : 'Tạo file evidence log gồm: việc đã làm, số liệu trước/sau, ảnh/link chứng minh, người xác nhận.',
        `Chọn 1 năng lực trọng tâm tuần sau: ${roleLanguage.mainSkill}.`,
      ],
    },
    {
      focus: `Học đúng 1 kỹ năng tạo chênh lệch lương`,
      milestone: `Có checklist kỹ năng và 1 bài thực hành chứng minh bạn đã dùng được ${roleLanguage.mainSkill}.`,
      tasks: [
        isFresh
          ? 'Chọn 1 role mục tiêu đầu tiên, xem 3 JD thật và ghi lại 5 việc người mới phải làm trong tháng đầu.'
          : isPerformer
          ? 'Xem lại 3 video MC/host cùng phân khúc, ghi ra cách họ mở màn, chuyển đoạn, cứu nhịp và xử lý khách mời khó.'
          : isChef
          ? 'Chọn 3 món đang bán/chế biến nhiều nhất, ghi rõ định lượng, thời gian chuẩn bị, food cost ước tính và lỗi thường gặp khi ra món.'
          : isPilot
          ? 'Chon 3 tinh huong flight deck can chung minh: SOP abnormal, CRM coordination, ATC communication hoac simulator check; ghi boi canh, quy trinh ap dung, bang chung co the luu va thong tin nao phai an.'
          : isAviation
          ? 'Chọn 3 tình huống cabin crew hay gặp: khách lo lắng, complaint dịch vụ, yêu cầu đặc biệt hoặc trễ nối chuyến; ghi cách xử lý đúng quy trình và câu nói nên dùng.'
          : isSchoolHealthcare
          ? 'Chọn 3 tình huống y tế học đường hay gặp: học sinh sốt/đau bụng, va chạm té ngã, quên thuốc/dị ứng; ghi cách tiếp nhận, sơ cứu, gọi phụ huynh và chuyển tuyến.'
          : isEducationAdmissions
          ? isStudyAbroadAdmissions
            ? 'Chọn 3 tình huống tư vấn hay gặp: hồ sơ thiếu giấy tờ, chọn ngành chưa rõ, ngân sách lệch với trường mục tiêu hoặc rủi ro visa; ghi cách hỏi nhu cầu, kiểm điều kiện, đề xuất phương án và next step.'
            : 'Chọn 3 tình huống tuyển sinh hay gặp: lead chưa rõ nhu cầu, phụ huynh/học viên lăn tăn học phí, lịch học không phù hợp hoặc no-show tư vấn; ghi cách hỏi nhu cầu, đề xuất chương trình và next step.'
          : isRestaurantManager
          ? 'Biến 1 ca nhà hàng thành checklist quản lý: roster, floor control, POS/order issue, complaint, food/labor cost note và handover.'
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
          ? 'Chọn 3 tình huống housekeeping/hospitality hay gặp: phòng checkout gấp, khách yêu cầu thêm amenities, lỗi phòng hoặc complaint vệ sinh; ghi cách xử lý đúng SOP và câu nói nên dùng.'
          : isCleaning
          ? 'Chọn 3 khu vực vệ sinh hay phát sinh lỗi: sảnh/toilet/khu làm việc/kho; ghi tiêu chuẩn sạch, dụng cụ hóa chất, lỗi thường gặp và cách nghiệm thu.'
          : isDriverDelivery
          ? 'Chọn 3 tình huống tài xế hay gặp: sai điểm đón/giao, khách không nghe máy, trễ giờ, hủy chuyến/hoàn đơn hoặc sự cố trong ca; ghi cách xử lý, thời gian phản hồi và bằng chứng cần lưu.'
          : isInsurance
          ? 'Chon 3 tinh huong bao hiem phi nhan tho hay gap: quote/underwriting can them thong tin, claim/boi thuong thieu chung tu, renewal co nguy co mat khach hoac dieu khoan coverage bi hieu sai; ghi cach xu ly dung quy trinh.'
          : `Học 3 tài liệu/video ngắn về ${roleLanguage.mainSkill}; ghi lại 10 ý có thể áp dụng ngay vào công việc.`,
        isFresh
          ? 'Biến 1 bài test tuyển dụng/mini project mẫu thành checklist từng bước: đọc đề, hỏi lại yêu cầu, làm bản nháp, tự kiểm lỗi, nộp bản cuối.'
          : isHrPivot
          ? 'Chọn 1 nhánh HR muốn thử trước và làm checklist 14 ngày: đọc 5 JD, hỏi 2 người trong nghề, làm 1 mini case, sửa CV theo nhánh đó và gửi thử 5 nơi.'
          : isPerformer
          ? 'Biến 1 format sự kiện quen thuộc thành checklist: brief khách, key message, timeline, điểm chuyển đoạn, phương án xử lý trễ giờ.'
          : isChef
          ? 'Biến 1 ca bếp đông khách thành checklist: chuẩn bị mise en place, thứ tự ra món, điểm kiểm chất lượng, an toàn và bàn giao cuối ca.'
          : isPilot
          ? 'Bien 1 duty/simulator session thanh checklist ca nhan: pre-flight brief, SOP callout, ATC phraseology, CRM handoff, abnormal item, debrief va logbook/evidence update.'
          : isAviation
          ? 'Biến 1 ca/chuyến bay thành checklist cá nhân: grooming, briefing, safety demo, service flow, xử lý complaint, teamwork và debrief sau chuyến.'
          : isSchoolHealthcare
          ? 'Bien 1 ca truc y te thanh checklist ca nhan: tiep nhan hoc sinh, do dau hieu, so cuu, ghi so, bao giao vien/phu huynh, chuyen tuyen va ban giao.'
          : isEducationAdmissions
          ? isStudyAbroadAdmissions
            ? 'Biến 1 ca tư vấn thành checklist cá nhân: xác nhận nhu cầu, ngân sách, quốc gia/ngành, điểm học tập/ngoại ngữ, shortlist trường, giấy tờ còn thiếu, deadline và lịch follow-up.'
            : 'Biến 1 ca tuyển sinh thành checklist cá nhân: xác nhận nguồn lead, nhu cầu học, mục tiêu, lịch rảnh, học phí/ngân sách, chương trình/lớp/ngành phù hợp, placement test nếu có và lịch follow-up.'
          : isHospitality
          ? 'Biến 1 ca housekeeping thành checklist cá nhân: nhận phòng, kiểm minibar/amenities, dọn giường, vệ sinh toilet, báo maintenance/lost & found, bàn giao và debrief.'
          : isCleaning
          ? 'Biến 1 ca vệ sinh thành checklist cá nhân: chuẩn bị dụng cụ, khoanh vùng, vệ sinh từng khu, kiểm mùi/vết bẩn, thu gom rác, nghiệm thu và bàn giao.'
          : isDriverDelivery
          ? 'Biến 1 ca tài xế thành checklist cá nhân: kiểm xe/giấy tờ, nhận chuyến/đơn, tối ưu tuyến, liên hệ khách, hoàn thành chuyến/đơn, xử lý phát sinh, cập nhật app và bàn giao cuối ca.'
          : 'Chọn 1 đầu việc thật hoặc bài test mẫu của role mục tiêu, rồi viết checklist: bước 1 làm gì, bước 2 kiểm gì, lỗi nào cần tránh, khi nào được xem là đạt.',
        `Làm 1 bài thực hành nhỏ liên quan trực tiếp tới ${jobTitle}, không học lan man.`,
        'Nhờ 1 người có kinh nghiệm review checklist và ghi lại 3 điểm cần sửa.',
      ],
    },
    {
      focus: isPerformer ? 'Tạo showreel và bộ hồ sơ MC có thể gửi khách' : isChef ? 'Tạo hồ sơ bếp có recipe card, cost và SOP' : isPilot ? 'Tạo hồ sơ pilot có logbook, recurrent/simulator check, SOP safety record và CRM/ATC feedback' : isAviation ? 'Tạo hồ sơ cabin crew có feedback và tình huống phục vụ thật' : isSchoolHealthcare ? 'Tạo hồ sơ y tế học đường có checklist sơ cứu, log sự cố và hồ sơ sức khỏe' : isEducationAdmissions ? (isStudyAbroadAdmissions ? 'Tạo hồ sơ tư vấn du học có funnel, checklist hồ sơ và outcome' : 'Tạo hồ sơ tư vấn tuyển sinh có funnel, follow-up và conversion nhập học') : isRestaurantManager ? 'Tạo hồ sơ quản lý nhà hàng có KPI ca, chi phí, service và complaint recovery' : isRestaurantFrontline ? 'Tạo hồ sơ phục vụ/thu ngân nhà hàng có log ca, POS/order accuracy và feedback' : isHotelManager ? 'Tạo hồ sơ quản lý khách sạn có operating dashboard, review score và SLA' : isHotelFrontline ? 'Tạo hồ sơ lễ tân/front desk có PMS accuracy, request SLA và complaint recovery' : isDental ? 'Tạo hồ sơ nha sĩ có case điều trị ẩn danh, treatment plan và feedback bệnh nhân' : isDentalAssistant ? 'Tạo hồ sơ trợ lý nha khoa có checklist ghế, vô khuẩn và feedback bác sĩ' : isHospitality ? 'Tạo hồ sơ housekeeping có checklist phòng, tốc độ, rework và feedback' : isCleaning ? 'Tạo hồ sơ vệ sinh có checklist khu vực, ảnh before-after, rework và feedback' : isDriverDelivery ? 'Tạo hồ sơ tài xế/giao nhận có log chuyến, rating, an toàn và case phát sinh' : isInsurance ? 'Tao ho so bao hiem phi nhan tho co underwriting, claims/boi thuong, renewal va policy wording' : isHrPivot ? 'Tạo mini portfolio chuyển hướng HR' : 'Tạo sản phẩm mẫu có thể đưa vào portfolio',
      milestone: isPerformer ? 'Có 1 showreel 60-90 giây, 3 mẫu lời dẫn và 1 rate card theo format sự kiện.' : isChef ? 'Có 3 recipe card có cost, 1 waste log, 1 checklist SOP bếp và ảnh plating trước/sau.' : isPilot ? 'Có 1 logbook/flight hours summary, 1 recurrent/simulator check record nếu được phép, 1 SOP safety note, 1 CRM/ATC feedback và 1 route-aircraft readiness note.' : isAviation ? 'Có checklist safety-service, 2 feedback senior crew/đồng nghiệp, 1 bản ghi announcement và 3 tình huống service recovery đã che thông tin khách.' : isSchoolHealthcare ? 'Có 1 checklist sơ cứu, 1 log sự cố/chuyển tuyến, 1 bảng theo dõi thuốc/dị ứng và 1 feedback từ nhà trường hoặc phụ huynh.' : isEducationAdmissions ? (isStudyAbroadAdmissions ? 'Có 1 tracker 20 lead/hồ sơ, 1 checklist giấy tờ/visa, 1 mẫu follow-up CRM, 1 case tư vấn khó và bảng KPI offer/visa/enrollment.' : 'Có 1 tracker 20 lead, 1 checklist tư vấn chương trình học, 1 mẫu follow-up CRM, 1 case xử lý objection và bảng KPI lịch tư vấn/đăng ký/đóng phí/nhập học.') : isRestaurantManager ? 'Có 1 dashboard ca/tháng về doanh thu, labor/food cost, table turn, complaint recovery và feedback owner/GM.' : isRestaurantFrontline ? 'Có 1 log 10 bill/bàn về order đúng, bill lỗi, upsell/request, complaint và feedback quản lý ca.' : isHotelManager ? 'Có 1 operating dashboard về occupancy, ADR/RevPAR, review score, staffing, complaint SLA và action log.' : isHotelFrontline ? 'Có 1 log 10 check-in/request về PMS accuracy, request SLA, upsell, complaint và handover.' : isDental ? 'Có 3 case nha khoa ẩn danh gồm chẩn đoán, treatment plan, vô khuẩn, tái khám và feedback.' : isDentalAssistant ? 'Có 1 checklist 10 ca trợ lý nha khoa gồm ghế/dụng cụ, vô khuẩn, suction/chuyển dụng cụ, hướng dẫn và feedback bác sĩ.' : isHospitality ? 'Có 1 checklist phòng/area, ảnh before-after đã che thông tin khách, log thời gian dọn phòng, lỗi/rework và feedback giám sát.' : isCleaning ? 'Có 1 checklist khu vực, ảnh before-after, log hóa chất/dụng cụ, lỗi/rework hoặc complaint và feedback giám sát.' : isDriverDelivery ? 'Có 1 checklist ca tài xế, log 20 chuyến/đơn, tỷ lệ đúng giờ, rating/feedback, checklist an toàn xe/giấy tờ và 3 case xử lý phát sinh.' : isInsurance ? 'Co 3 case bao hiem phi nhan tho an thong tin gom underwriting risk, policy wording/coverage, claims/boi thuong hoac renewal outcome va KPI SLA/loss ratio neu co.' : isHrPivot ? 'Có 1 mini case HR, 1 bảng chọn nhánh nghề, 1 CV sửa theo nhánh đã chọn và 3 insight từ người trong nghề.' : 'Có 1 bằng chứng nhìn thấy được: tài liệu, video, dashboard, quy trình, bài mẫu hoặc case study.',
      tasks: [
        isFresh
          ? 'Làm 1 mini project 2-3 giờ theo role mục tiêu: ví dụ 1 bài content, 1 file Excel phân tích, 1 kịch bản tư vấn khách hoặc 1 checklist vận hành văn phòng.'
          : isHrPivot
          ? 'Làm 1 mini case HR trong 2-3 giờ: phân tích 1 JD tuyển dụng, thiết kế 5 câu hỏi phỏng vấn, hoặc làm 1 outline onboarding/training cho nhân viên mới.'
          : isPerformer
          ? 'Cắt 1 video showreel 60-90 giây gồm: mở màn, chuyển đoạn, tương tác khán giả và xử lý tình huống.'
          : isChef
          ? 'Làm 3 recipe card cho món chủ lực: định lượng, cost nguyên liệu, thời gian chuẩn bị, tiêu chuẩn plating và lỗi cần tránh.'
          : isPilot
          ? 'Lam 1 flight deck evidence note: logbook/flight hours, type rating/recurrent status, simulator check, SOP safety record, route-aircraft qualification va feedback can xin them.'
          : isAviation
          ? 'Làm 1 checklist safety-service cho ca bay: trước chuyến, lúc boarding, phục vụ, xử lý yêu cầu đặc biệt, complaint và debrief.'
          : isSchoolHealthcare
          ? 'Làm 1 checklist trực phòng y tế học đường: tiếp nhận ca, sơ cứu ban đầu, gọi phụ huynh, chuyển tuyến, ghi log và bàn giao cho giáo viên/ban giám hiệu.'
          : isEducationAdmissions
          ? isStudyAbroadAdmissions
            ? 'Làm 1 checklist hồ sơ du học: thông tin ứng viên, điều kiện đầu vào, ngân sách, shortlist trường-ngành, giấy tờ cần có, deadline, rủi ro visa và next step.'
            : 'Làm 1 checklist tư vấn tuyển sinh: nguồn lead, nhu cầu học, chương trình/lớp/ngành phù hợp, học phí, ưu đãi nếu có, lịch tư vấn/placement test, trạng thái đăng ký-đóng phí-nhập học và next step.'
          : isHospitality
          ? 'Làm 1 room/area SOP cho ca housekeeping: nhận phòng, dọn phòng, kiểm amenities, báo maintenance, xử lý lost & found, bàn giao và tiêu chí đạt.'
          : isCleaning
          ? 'Làm 1 checklist vệ sinh khu vực: chuẩn sạch, dụng cụ/hóa chất, thứ tự thao tác, điểm kiểm tra cuối ca, lỗi cần tránh và tiêu chí nghiệm thu.'
          : isDriverDelivery
          ? 'Làm 1 checklist ca tài xế: kiểm xe/giấy tờ, nhận chuyến/đơn, tối ưu tuyến, liên hệ khách, cập nhật app, xử lý phát sinh và bàn giao cuối ca.'
          : isPublicSubjectTeacher
          ? 'Thiết kế 1 giáo án/bài kiểm tra ngắn đúng bộ môn đang dạy, có mục tiêu bài học, ma trận câu hỏi, rubric chấm và cách phân nhóm học sinh cần phụ đạo.'
          : isInsurance
          ? 'Dong goi 1 case bao hiem phi nhan tho an thong tin: loai nghiep vu, rui ro, dieu khoan coverage/loai tru, premium/claim/renewal outcome, SLA va bai hoc.'
          : isTeacher
          ? 'Thiết kế outline 1 buổi học/mini course 30-45 phút cho người đi làm, có mục tiêu học, bài tập và tiêu chí đánh giá.'
          : `Tạo 1 bằng chứng nghề gắn với ${rolePath}: tài liệu, bài mẫu, bảng theo dõi, kịch bản xử lý tình huống hoặc demo nhỏ.`,
        isPerformer
          ? 'Viết 3 mẫu lời dẫn: khai mạc, chuyển tiết mục/khách mời và cứu timeline khi chương trình bị trễ.'
          : isHrPivot
          ? 'Viết 1 trang “vì sao tôi hợp nhánh này”: kỹ năng cũ chuyển sang được gì, còn thiếu gì, 14 ngày tới kiểm chứng bằng bài test nào.'
          : isChef
          ? 'Ghi waste log trong 3 ca: nguyên liệu hao hụt, lý do hỏng/thiếu, cách giảm hao hụt ca sau.'
          : isAviation
          ? 'Ghi 3 tình huống phục vụ đã gặp hoặc mô phỏng: chuyện xảy ra, cách bạn phản hồi, quy trình đã theo và điều cần cải thiện.'
          : isDriverDelivery
          ? 'Ghi 3 tình huống giao hàng đã gặp hoặc mô phỏng: sai địa chỉ, khách không nghe máy, giao trễ, hàng lỗi/hoàn; ghi cách xử lý và kết quả.'
          : 'Ghi lại phiên bản trước/sau để chứng minh bằng chứng này giúp tiết kiệm thời gian, giảm lỗi hoặc tăng chất lượng.',
        isPerformer
          ? 'Làm rate card theo 3 tầng: event nhỏ, corporate/wedding premium, livestream/activation; ghi rõ bao gồm rehearsal hay không.'
          : isHrPivot
          ? 'Xin 1 feedback từ người làm HR về mini case, hỏi thẳng: nếu tuyển entry/junior nhánh này thì bài này thiếu gì.'
          : isChef
          ? 'Tạo checklist SOP cho 1 ca đông khách: prep, line setup, ra món, kiểm plating, vệ sinh và bàn giao.'
          : isAviation
          ? 'Xin 2 feedback ngắn từ senior crew/đồng nghiệp về: grooming, teamwork, xử lý khách và mức sẵn sàng cho tuyến/role khó hơn.'
          : isDriverDelivery
          ? 'Xin 1 feedback ngắn từ điều phối/quản lý hoặc khách quen về đúng giờ, thái độ phục vụ, xử lý phát sinh và mức độ tin cậy.'
          : 'Đưa bằng chứng nghề cho 1 quản lý/đồng nghiệp/khách hàng xem và xin nhận xét cụ thể.',
        `Lưu ${roleLanguage.proofAsset} vào ${roleLanguage.portfolioWord} kèm ngày tạo, link, ảnh chụp và người xác nhận.`,
      ],
    },
    {
      focus: 'Chạy thử với người thật để lấy feedback',
      milestone: 'Có feedback thật từ ít nhất 2 người và 1 phiên bản đã sửa sau feedback.',
      tasks: [
        isPublicSubjectTeacher
          ? 'Dạy thử hoặc nhờ tổ chuyên môn/đồng nghiệp góp ý 1 phần bài 10-15 phút, ghi lại 2 điểm mạnh và 1 điểm cần sửa cho tiết sau.'
          : isTeacher
          ? 'Dạy thử/quay thử 1 phần bài học 10-15 phút, gửi cho 2 học viên/người đi làm xem.'
          : isSchoolHealthcare
            ? 'Nho 1 nhan vien y te senior, dieu duong hoac quan ly truong review checklist so cuu, log thuoc/di ung va quy trinh goi phu huynh/chuyen tuyen.'
          : isPerformer
            ? 'Gửi showreel và 1 mẫu lời dẫn cho 2 MC/producer/agency quen biết, xin nhận xét thật về giọng, năng lượng và độ chuyên nghiệp.'
            : isChef
            ? 'Nhờ bếp trưởng/ca trưởng hoặc 2 đồng nghiệp nếm/soát 3 món theo checklist plating, vị, nhiệt độ và tốc độ ra món.'
            : isAviation
            ? 'Nhờ senior crew/đồng nghiệp review checklist safety-service, bản ghi announcement và 1 tình huống service recovery; xin nhận xét thật, không cần số liệu nội bộ.'
            : isDriverDelivery
            ? 'Nhờ điều phối/quản lý/đồng nghiệp review checklist ca tài xế, log chuyến/đơn và 1 case xử lý phát sinh; xin nhận xét thật về đúng giờ, an toàn và thái độ.'
            : 'Cho 2 người dùng thử bằng chứng nghề hoặc áp dụng vào 1 việc thật trong tuần.',
        'Hỏi feedback theo 3 câu: dễ hiểu không, phần nào hữu ích nhất, phần nào cần sửa để dùng thật.',
        'Sửa bằng chứng nghề dựa trên feedback, ghi rõ trước/sau đã thay đổi gì.',
        'Xin 1 quote ngắn có thể dùng trong CV/LinkedIn hoặc buổi deal lương.',
      ],
    },
    {
      focus: 'Đo impact bằng KPI',
      milestone: 'Có ít nhất 1 chỉ số trước/sau đủ dùng để nói chuyện tăng lương.',
      tasks: [
        isPerformer
          ? `Chọn 1 KPI sát nghề MC trong tuần này. ${kpiGuidance}`
          : isFresh
          ? `Chọn 1 KPI rất dễ đo cho role mục tiêu đầu tiên. ${kpiGuidance}`
          : isHrPivot
          ? `Chọn 1 KPI kiểm chứng nhánh HR đang thử. ${kpiGuidance}`
          : isAviation
          ? 'Chọn 1 tiêu chí dễ theo dõi tuần này: checklist safety-service hoàn thành, 1 feedback tốt từ senior crew, 1 tình huống khách khó xử lý êm hoặc announcement tiếng Anh luyện 5 lần có ghi âm.'
          : isEnglishTeacher
          ? 'Lập bảng KPI lớp tiếng Anh tuần này gồm 6 cột: attendance, homework completion, pre-test, post-test/mock test, Speaking/Writing rubric và feedback/retention.'
          : isSchoolHealthcare
          ? 'Lap bang KPI y te hoc duong gom 6 cot: thoi gian phan ung su co, ho so suc khoe cap nhat, so ca so cuu, so ca chuyen tuyen, theo doi thuoc/di ung va feedback nha truong-phu huynh.'
          : isDriverDelivery
          ? 'Lập bảng KPI tài xế tuần này gồm 6 cột: số chuyến/đơn, đúng giờ, hủy/hoàn, rating/feedback, sự cố phát sinh và chi phí nhiên liệu/thời gian tuyến.'
          : `Chọn 1 KPI sát với ${intake.currentPosition || jobTitle}. ${kpiGuidance}`,
        isAviation
          ? 'Ghi mốc nền bằng bằng chứng cá nhân hợp lệ: checklist tự đánh giá, nhận xét senior crew/đồng nghiệp, chứng chỉ training hoặc ghi chú tình huống đã che thông tin khách.'
          : isEnglishTeacher
          ? 'Ghi mốc nền cho 1 lớp hoặc 3-5 học viên: điểm hiện tại, bài tập đã nộp, số buổi đi học, lỗi Speaking/Writing hay gặp và phản hồi gần nhất.'
          : isDriverDelivery
          ? 'Ghi mốc nền trong 3-5 ca gần nhất: số đơn/chuyến, tỷ lệ đúng giờ, đơn hoàn/hủy, rating, phát sinh và chi phí nhiên liệu/thời gian tuyến.'
          : 'Ghi lại mốc hiện tại trong 3-5 ngày hoặc lấy số liệu gần nhất đang có.',
        isPerformer
          ? 'Áp dụng checklist briefing/rehearsal vào 1 show thật hoặc buổi tập, ghi lại điểm nào giúp chương trình mượt hơn.'
          : isChef
          ? 'Áp dụng recipe card và SOP vào 1 ca thật, ghi lại food cost, waste, thời gian ra món và phản hồi khách/bếp trưởng.'
          : isAviation
          ? 'Áp dụng checklist trong 1 ca/chuyến bay hoặc buổi mô phỏng; ghi điểm làm tốt, điểm cần sửa và feedback từ senior crew/đồng nghiệp.'
          : isEnglishTeacher
          ? 'Dạy hoặc soạn lại 1 buổi học theo KPI đã chọn; ghi rõ hoạt động nào nhằm tăng điểm post-test, giảm lỗi Speaking/Writing hoặc tăng homework completion.'
          : isHrPivot
          ? 'Dùng mini case để gửi hỏi 2 người trong nghề hoặc 2 nhà tuyển dụng, ghi lại phản hồi thật và điều cần sửa.'
          : isDriverDelivery
          ? 'Áp dụng checklist tài xế trong 1 ca thật, ghi lại chuyến/đơn đúng giờ, phát sinh đã xử lý, rating/feedback và điểm cần cải thiện.'
          : 'Áp dụng bằng chứng nghề vào công việc thật và ghi kết quả sau khi áp dụng.',
        'Viết 1 dòng kết luận: tôi tạo ra thay đổi gì, bằng số nào, trong bao lâu.',
      ],
    },
    {
      focus: 'Đóng gói thành case study 1 trang',
      milestone: 'Có 1 case study ngắn đủ để gửi cho sếp/nhà tuyển dụng/khách hàng.',
      tasks: [
        isPerformer
          ? 'Viết case theo format: Bối cảnh sự kiện - Rủi ro sân khấu - Cách xử lý - Feedback khách hàng.'
          : isChef
          ? 'Viết case theo format: Món/ca bếp - Vấn đề cost/tốc độ/chất lượng - Cách xử lý - Kết quả bằng số.'
          : isAviation
          ? 'Viết case theo format: Bối cảnh chuyến bay - Tình huống khách/cabin - Cách xử lý theo quy trình - Feedback hoặc bài học rút ra.'
          : isDriverDelivery
          ? 'Viết case theo format: Bối cảnh chuyến/đơn - Sự cố trong ca - Cách xử lý - Kết quả bằng số hoặc feedback.'
          : isHrPivot
          ? 'Viết case theo format: Nhánh HR muốn thử - JD đã đọc - Bài test/mini case đã làm - Feedback nhận được - Quyết định đi tiếp hay đổi nhánh.'
          : 'Viết case theo format: Vấn đề - Hành động - Kết quả - Bằng chứng.',
        'Thêm 2 ảnh/link minh chứng vào case study, tránh viết cảm tính.',
        isPerformer
          ? 'Đổi kết quả thành ngôn ngữ khách hàng hiểu: chương trình đúng giờ, khách mời tương tác tốt, brand tone đúng, sự cố được xử lý êm.'
          : isChef
          ? 'Đổi kết quả thành ngôn ngữ quản lý hiểu: giảm waste, giữ cost, ra món nhanh hơn, complaint giảm, món đồng đều hơn.'
          : isAviation
          ? 'Đổi kết quả thành ngôn ngữ hãng bay hiểu: an toàn đúng quy trình, khách được trấn an, complaint được xử lý êm, teamwork tốt và không lộ dữ liệu hành khách.'
          : isDriverDelivery
          ? 'Đổi kết quả thành ngôn ngữ vận hành hiểu: đúng giờ hơn, ít hoàn/hủy hơn, route gọn hơn, khách hài lòng hơn và ít sự cố hơn.'
          : isHrPivot
          ? 'Đổi kết quả thành ngôn ngữ tuyển dụng: tôi hiểu role nào, làm được bài test gì, nhận feedback gì và còn thiếu skill nào trước khi apply.'
          : 'Đổi kết quả thành ngôn ngữ kinh doanh: tiết kiệm giờ, giảm lỗi, tăng tỷ lệ hoàn thành hoặc tăng doanh thu.',
        'Nhờ 1 người đọc case trong 2 phút và nói lại họ hiểu bạn tạo giá trị gì không.',
      ],
    },
    {
      focus: 'Sửa CV/LinkedIn để bán đúng giá trị',
      milestone: 'Có CV/LinkedIn mới với ít nhất 3 bullet có số liệu.',
      tasks: [
        `Viết lại headline theo role mục tiêu: ${rolePath}.`,
        isPerformer
          ? 'Chuyển case thành 3 dòng hồ sơ MC: loại sự kiện + quy mô khách/brand + vai trò bạn xử lý + feedback/kết quả.'
          : isChef
          ? 'Chuyển case thành 3 dòng hồ sơ bếp: món/ca phụ trách + số suất/food cost/waste + kết quả chất lượng hoặc tốc độ.'
          : isAviation
          ? 'Chuyển case thành 3 dòng hồ sơ cabin crew: tình huống phục vụ + quy trình xử lý + feedback/điểm cải thiện + chứng chỉ hoặc checklist liên quan.'
          : isDriverDelivery
          ? 'Chuyển case thành 3 dòng hồ sơ tài xế: tuyến/ca phụ trách + số chuyến/đơn + đúng giờ/rating/sự cố xử lý + kết quả.'
          : isHrPivot
          ? 'Chuyển mini case thành 3 bullet CV: phân tích JD/funnel/training/C&B gì, dùng dữ liệu nào, insight rút ra và quyết định nghề nghiệp tiếp theo.'
          : 'Chuyển case study thành 3 bullet CV theo công thức: làm gì + bằng công cụ/kỹ năng gì + kết quả bằng số.',
        isPerformer
          ? 'Đăng 1 clip ngắn hoặc hậu trường nghề MC chia sẻ bài học xử lý sân khấu, không cần khoe phí dẫn.'
          : isChef
          ? 'Lưu ảnh món, recipe card và số liệu ca bếp thành 1 hồ sơ nghề có thể gửi nhà hàng/khách sạn/chuỗi.'
          : isAviation
          ? 'Lưu checklist, feedback và bản ghi announcement thành 1 hồ sơ cabin crew có thể dùng khi review nội bộ hoặc ứng tuyển tuyến/role tốt hơn.'
          : isDriverDelivery
          ? 'Lưu log chuyến/đơn, checklist an toàn, rating/feedback và case phát sinh thành 1 hồ sơ tài xế có thể gửi đội xe/fleet/nhà tuyển dụng.'
          : isHrPivot
          ? 'Sửa CV/LinkedIn theo 1 nhánh HR duy nhất; bỏ câu chung chung “muốn đổi nghề”, thay bằng mini case và lý do chọn nhánh.'
          : 'Đăng 1 post LinkedIn/Zalo nghề nghiệp chia sẻ bài học hoặc before/after, không cần khoe lương.',
        'Lưu link post/CV vào evidence log.',
      ],
    },
    {
      focus: 'Tạo danh sách cơ hội trả cao hơn',
      milestone: 'Có 20 cơ hội/đầu mối và 5 tin nhắn/email tiếp cận đầu tiên.',
      tasks: [
        `Lọc 20 ${roleLanguage.opportunityList} có khả năng trả gần mức ${targetLabel}.`,
        'Chia danh sách thành 3 nhóm: dễ vào, vừa sức, stretch role.',
        isPerformer
          ? 'Viết 1 tin nhắn mở đầu 5 dòng kèm showreel, rate card và 1 case sự kiện liên quan.'
          : isChef
          ? 'Viết 1 tin nhắn mở đầu 5 dòng kèm hồ sơ bếp: 3 món chủ lực, cost/waste, ảnh plating và feedback/quản lý xác nhận.'
          : isAviation
          ? 'Viết 1 tin nhắn/hồ sơ mở đầu 5 dòng kèm checklist safety-service, feedback senior crew, chứng chỉ training và 1 case service recovery đã che thông tin khách.'
          : isDriverDelivery
          ? 'Viết 1 tin nhắn mở đầu 5 dòng kèm log chuyến/đơn, tỷ lệ đúng giờ, rating/feedback và 1 case xử lý phát sinh khi giao hàng.'
          : isHrPivot
          ? 'Viết 1 tin nhắn 5 dòng gửi người làm HR/nhà tuyển dụng: giới thiệu nền tảng hiện có, nhánh muốn thử, mini case đã làm và câu hỏi xin feedback.'
          : 'Viết 1 tin nhắn mở đầu 5 dòng kèm case study 1 trang.',
        'Gửi thử cho 5 đầu mối đầu tiên và ghi phản hồi vào tracker.',
      ],
    },
    {
      focus: 'Tập trả lời phỏng vấn/deal lương',
      milestone: 'Có script trả lời lương và 5 câu trả lời cho phản biện khó.',
      tasks: [
        `Soạn câu trả lời khi bị hỏi mức lương mong muốn, dùng mốc ${targetLabel} và bằng chứng đã tạo.`,
        isPerformer
          ? 'Viết 5 phản biện thường gặp: ngân sách thấp, chỉ cần MC đơn giản, show ngắn, chưa có clip nhiều, so với MC khác.'
          : isChef
          ? 'Viết 5 phản biện thường gặp: chưa đủ kinh nghiệm, cost món cao, ca đông dễ lỗi, chưa dẫn ca, so với bếp khác.'
          : isAviation
          ? 'Viết 5 phản biện thường gặp: chưa đủ tuyến khó, tiếng Anh chưa đủ tự tin, chưa có feedback senior, chưa có case xử lý khách, so với cabin crew nhiều thâm niên hơn.'
          : isDriverDelivery
          ? 'Viết 5 phản biện thường gặp: thu nhập phụ thuộc đơn, chưa đủ ca khó, rating chưa đều, hoàn/hủy còn cao, so với tài xế nhiều kinh nghiệm hơn.'
          : 'Viết 5 phản biện thường gặp: ngân sách thấp, chưa đủ kinh nghiệm, cần thử việc, so với mặt bằng cũ, chờ review.',
        isPerformer ? 'Tập nói pitch báo giá thành tiếng 3 lần, mỗi lần dưới 60 giây.' : isChef ? 'Tập trình bày case food cost/waste/tốc độ ra món trong 60 giây cho bếp trưởng hoặc nhà tuyển dụng.' : isAviation ? 'Tập trình bày 1 case service recovery trong 60 giây: tình huống, cách xử lý, quy trình đã theo và feedback nhận được.' : isDriverDelivery ? 'Tập trình bày 1 case tài xế trong 60 giây: tuyến/chuyến/đơn, sự cố, cách xử lý, kết quả đúng giờ/rating và bài học.' : 'Tập nói thành tiếng 3 lần, mỗi lần dưới 90 giây.',
        'Ghi âm hoặc nhờ bạn phản biện để chỉnh lại câu chữ cho tự nhiên.',
      ],
    },
    {
      focus: 'Chạy vòng apply/đàm phán đầu tiên',
      milestone: 'Có ít nhất 5 lượt tiếp cận thật và 1 cuộc trao đổi lương hoặc scope công việc.',
      tasks: [
        'Gửi CV/case study tới 5-10 cơ hội trong danh sách đã lọc.',
        'Theo dõi phản hồi trong tracker: đã gửi, đã xem, phản hồi, bước tiếp theo.',
        isAviation
          ? `Nếu đang ở hãng/đơn vị hiện tại, xin feedback 1-1 từ senior crew/purser/trainer về tiêu chí lên mức ${targetLabel} hoặc tuyến/role khó hơn.`
          : isDriverDelivery
          ? `Nếu đang ở đội xe/nền tảng hiện tại, xin feedback 1-1 từ điều phối/quản lý về tiêu chí lên mức ${targetLabel}, nhận tuyến/ca tốt hơn hoặc lên lead tài xế.`
          : `Nếu đang ở công ty hiện tại, xin 1 buổi 1-1 để hỏi tiêu chí lên mức ${targetLabel}.`,
        'Cập nhật evidence log với tất cả phản hồi thật, kể cả bị từ chối.',
      ],
    },
    {
      focus: 'Đóng gói đề xuất tăng lương',
      milestone: 'Có 1 gói đề xuất gồm số liệu, case study, mức lương đề xuất và phương án thay thế.',
      tasks: [
        isPerformer
          ? `Viết 1 trang báo giá: format sự kiện, scope chuẩn bị, rehearsal, thời lượng dẫn, mức đề xuất ${targetLabel} và điều kiện phát sinh.`
          : isChef
          ? `Viết 1 trang đề xuất tăng lương/apply: món phụ trách, food cost, waste rate, tốc độ ra món, SOP đã chuẩn hóa và mức đề xuất ${targetLabel}.`
          : isAviation
          ? `Viết 1 trang hồ sơ review/apply: chuẩn safety-service, feedback senior crew, announcement tiếng Anh, case xử lý khách và mức mục tiêu ${targetLabel}.`
          : `Viết 1 trang đề xuất: hiện trạng, impact đã tạo, benchmark thị trường, mức đề xuất ${targetLabel}.`,
        isPerformer
          ? 'Thêm phương án B: phí rehearsal riêng, gói script polish, phí di chuyển, livestream package hoặc combo nhiều show.'
          : isChef
          ? 'Thêm phương án B: nhận ca khó hơn, training phụ bếp, phụ trách cost món, phụ cấp ca hoặc apply bếp chuỗi/khách sạn.'
          : isAviation
          ? 'Thêm phương án B: xin tuyến/ca khó hơn, nhận mentor junior, học/thi chứng chỉ liên quan hoặc apply hãng/đơn vị dịch vụ hàng không trả tốt hơn.'
          : 'Thêm phương án B: tăng scope, bonus KPI, phụ cấp, lộ trình review 60 ngày hoặc chuyển role.',
        'Chọn 3 bằng chứng mạnh nhất, bỏ các bằng chứng yếu hoặc quá dài.',
        'Gửi cho 1 người tin cậy đọc thử và hỏi: phần nào khiến họ tin nhất?',
      ],
    },
    {
      focus: 'Review kết quả và chọn bước tiếp theo',
      milestone: 'Có quyết định rõ: deal nội bộ, nhảy việc, freelance/side income hoặc học tiếp 1 skill.',
      tasks: [
        'Tổng kết 12 tuần: task đã hoàn thành, KPI đạt được, phản hồi nhận được, cơ hội mở ra.',
        `So sánh offer/cơ hội hiện có với gap ${gapLabel}; chọn hướng có xác suất cao nhất.`,
        'Lên lịch buổi deal lương hoặc vòng apply tiếp theo trong 7 ngày tới.',
        'Viết 1 kế hoạch 30 ngày kế tiếp dựa trên kết quả thật, không dùng checklist chung nữa.',
      ],
    },
  ];

  return {
    format: 'weekly',
    goal: `Tăng lương từ ${(currentSalary / 1e6).toFixed(1)}M lên ${(targetSalary / 1e6).toFixed(1)}M trong ${durationMonths} tháng`,
    summary: `Lộ trình này đi theo chuỗi: chọn hướng trả cao hơn, học đúng kỹ năng, tạo bằng chứng thật, đo KPI, đóng gói CV/LinkedIn và dùng dữ liệu để deal lương.${intake.currentPosition ? ` Vị trí hiện tại: ${intake.currentPosition}.` : ''}${intake.mainWeakness ? ` Điểm cần xử lý trước: ${intake.mainWeakness}.` : ''}${segmentNote}`,
    weeks: Array.from({ length: totalWeeks }, (_, index) => {
      const blueprint = blueprints[index % blueprints.length];
      const cycle = Math.floor(index / blueprints.length);
      return {
        week: index + 1,
        focus: cycle > 0 ? `${blueprint.focus} - vòng nâng level ${cycle + 1}` : blueprint.focus,
        milestone: blueprint.milestone,
        tasks: blueprint.tasks,
      };
    }),
    negotiation_timing: `Tuần ${Math.max(4, Math.round(totalWeeks * 0.75))} là thời điểm tốt nhất để đàm phán: khi bạn đã có case study, KPI trước/sau và gói đề xuất lương rõ ràng.`,
    salary_projection: `Nếu hoàn thành 70-80% task, bạn có case đàm phán hợp lý cho mức ${targetLabel}; đây không phải bảo đảm kết quả lương, nhưng là mức có cơ sở để yêu cầu.`,
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
    return 'Over-credentialed nhưng chưa monetized được bằng cấp';
  }
  if (/cu nhan|cao dang|trung cap/.test(education) && /(marketing|sale|kinh doanh|ke toan|finance|nhan su|hr|developer|engineer|teacher|giao vien)/.test(role)) {
    return 'Credential-fit';
  }
  if (!intake.educationLevel || /12\/12/.test(education)) {
    return 'Under-credentialed nhưng có thực chiến';
  }
  return 'Misaligned credential';
}

function pickSkill(task: string, fallback: string): string {
  const normalized = normalizeForRoadmapQuality(task);
  if (/huong dan vien|hdv|tour guide|tour leader|lich trinh|itinerary|tuyen diem|thuyet minh|diem danh|su co tour|tour log|feedback khach|dieu hanh tour|booking tour|tu van tour/.test(normalized)) {
    return 'Tour log, thuyết minh và xử lý sự cố tour';
  }
  if (/cabin|hang khong|senior crew|purser|announcement|passenger|hanh khach|service recovery|safety|grooming|briefing|debrief/.test(normalized)) {
    return 'Safety-service và feedback cabin crew';
  }
  if (/housekeeping|buong phong|room attendant|khach san|guest service|amenities|minibar|lost & found|maintenance|room speed/.test(normalized)) {
    return 'Housekeeping checklist và feedback giám sát';
  }
  if (/ve sinh|tap vu|cleaning|cleaner|janitor|hoa chat|dung cu|audit cleanliness/.test(normalized)) {
    return 'Checklist vệ sinh và nghiệm thu khu vực';
  }
  if (/kpi|dashboard|so lieu|chi so/.test(normalized)) return 'Đo KPI và đọc số liệu';
  if (/cv|linkedin|headline|bullet/.test(normalized)) return 'Đóng gói hồ sơ nghề nghiệp';
  if (/feedback|review|quote/.test(normalized)) return 'Lấy feedback và cải tiến';
  if (/case study|evidence|bang chung|artifact|portfolio/.test(normalized)) return 'Viết case study/portfolio';
  if (/deal|dam phan|luong|de xuat/.test(normalized)) return 'Viết proposal và trình bày kết quả';
  if (/tin nhan|email|co hoi|apply|cong ty/.test(normalized)) return 'Lọc JD và gửi hồ sơ ứng tuyển';
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
    doneDefinition: `Tick khi có đúng output này và dùng được cho checkpoint: ${week.milestone}`,
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
        ? 'Lập tracker 20 yêu cầu booking: nguồn lead, nhu cầu, báo giá, trạng thái follow-up, lý do chốt/rớt và bước tiếp theo.'
        : 'Tạo checklist booking 8 bước: nhận nhu cầu, xác nhận ngày/số khách, báo giá, giữ chỗ, thanh toán, voucher, nhắc lịch, chăm sóc sau tour.',
      'Booking tour, CRM follow-up và tỉ lệ chốt',
      '1 tracker/checklist có đủ lead, trạng thái, deadline và ghi chú lý do khách chốt hoặc chưa chốt.',
      'Có ít nhất 20 lead/yêu cầu hoặc 8 bước booking rõ ràng; chỉ bám vào booking tour và CRM follow-up.',
      week
    );
  }

  if (kind === 'travel_sales_group' || kind === 'travel_sales_fit') {
    return simpleActionTask(
      /kpi|dashboard|so lieu|chi so|impact|conversion|doanh so|sales/.test(normalized)
        ? 'Lập bảng 20 khách/tour inquiry: nhu cầu, ngân sách, tuyến điểm, objection, follow-up, trạng thái chốt và doanh thu dự kiến.'
        : 'Viết 3 script tư vấn tour theo đúng nhóm khách: gia đình, công ty/đoàn, khách lẻ; mỗi script có câu hỏi nhu cầu và cách xử lý objection.',
      'Tư vấn tour, objection handling và conversion',
      '1 tracker/script có nhóm khách, nhu cầu, tuyến điểm, ngân sách, objection và bước follow-up tiếp theo.',
      'Có số lead, tỉ lệ phản hồi/chốt, lý do rớt và 1 hành động follow-up cụ thể; chỉ bám vào tư vấn tour.',
      week
    );
  }

  if (/role|tra cao|luong muc tieu|muc luong|jd|tuyen dung|band/.test(normalized) || isDirtyHospitalityLeak) {
    return simpleActionTask(
      'Mở 3 tin HDV/tour leader trả cao hơn, chép ra 3 yêu cầu lặp lại: tuyến điểm, ngoại ngữ, xử lý sự cố, feedback khách hoặc kinh nghiệm dẫn đoàn.',
      'Đọc JD hướng dẫn viên và chọn track đúng nghề',
      '1 bảng gồm 3 JD/link/ảnh, mức lương nếu có, yêu cầu chính, bằng chứng đã có và bằng chứng còn thiếu.',
      'Mỗi JD có keyword đúng nghề du lịch: lịch trình, thuyết minh, điểm danh, an toàn đoàn, sự cố tour, feedback khách hoặc báo cáo sau tour.',
      week
    );
  }
  if (/kpi|dashboard|so lieu|chi so|impact|do impact|feedback|review/.test(normalized)) {
    return simpleActionTask(
      'Lập tour log 5 tour gần nhất: tuyến, số khách, đúng timeline, sự cố, cách xử lý, feedback khách và xác nhận điều hành.',
      'Đo KPI hướng dẫn viên bằng tour log',
      '1 bảng 5 dòng đã ẩn thông tin khách, mỗi dòng có timeline, sự cố/feedback và bài học rút ra.',
      'Có ít nhất 3 chỉ số: đúng giờ, điểm danh đủ, feedback khách, sự cố xử lý êm, đánh giá điều hành hoặc tỷ lệ tour lặp lại.',
      week
    );
  }
  if (/lich trinh|itinerary|tuyen|diem|story|thuyet minh|script|noi dung/.test(normalized)) {
    return simpleActionTask(
      'Viết 1 script thuyết minh 7 phút cho 1 tuyến điểm: mở đầu, 3 ý chính, câu chuyện địa phương, câu hỏi tương tác và cách kết.',
      'Thuyết minh tuyến điểm và storytelling',
      '1 script ngắn có thể đọc thử, kèm 3 fact đã kiểm tra và 1 câu hỏi tương tác cho khách.',
      'Script không quá 1 trang, đọc thành tiếng dưới 7 phút và có 3 điểm khách dễ nhớ.',
      week
    );
  }
  if (/su co|risk|an toan|complaint|khach|delay|tre|mat|benh|mua|thoi tiet/.test(normalized)) {
    return simpleActionTask(
      'Viết 3 case sự cố tour: khách trễ, thời tiết xấu, khách phàn nàn; mỗi case ghi 3 bước xử lý và ai cần báo ngay.',
      'Xử lý sự cố tour và an toàn đoàn',
      '1 ghi chú 3 case, mỗi case có tình huống - hành động - kết quả - người xác nhận.',
      'Mỗi case dưới 5 dòng, không lộ thông tin khách và có bước escalation rõ.',
      week
    );
  }
  if (/cv|linkedin|headline|bullet|ho so|portfolio|evidence|bang chung|case study/.test(normalized)) {
    return simpleActionTask(
      'Đóng gói 3 tour đã dẫn thành evidence log: lịch trình, điểm thuyết minh, sự cố đã xử lý, feedback khách và xác nhận điều hành.',
      'Hồ sơ bằng chứng hướng dẫn viên du lịch',
      '1 folder/ghi chú có 3 tour, mỗi tour có 5 mục bằng chứng đã ẩn thông tin khách.',
      'Người quản lý/nhà tuyển dụng đọc vào thấy rõ bạn đã dẫn tour nào, làm gì, kết quả ra sao và ai xác nhận.',
      week
    );
  }
  if (/co hoi|apply|tin nhan|email|danh sach|cong ty|tour|travel/.test(normalized)) {
    return simpleActionTask(
      'Lọc 10 công ty tour/inbound/outbound phù hợp, ghi tuyến mạnh, yêu cầu HDV, mức lương/fee nếu có và người liên hệ.',
      'Tìm cơ hội HDV/tour leader trả tốt hơn',
      '1 danh sách 10 công ty/tin tuyển dụng có link/ảnh và bước tiếp theo cho từng nơi.',
      'Ít nhất 5 nơi có tuyến điểm/nhóm khách phù hợp với kinh nghiệm hiện tại của bạn.',
      week
    );
  }
  if (/deal|dam phan|de xuat|luong|fee/.test(normalized)) {
    return simpleActionTask(
      'Viết script 90 giây xin review fee/lương dựa trên 3 tour đã dẫn, feedback khách, sự cố đã xử lý và track tour khó hơn.',
      'Đề xuất tăng fee/lương bằng bằng chứng dẫn tour',
      '1 script ngắn có 3 phần: bằng chứng tour, chỉ số/feedback, đề xuất mức hoặc lịch review.',
      'Script đọc thành tiếng dưới 90 giây và không hứa quá mức; chỉ đưa bằng chứng và mức đề xuất.',
      week
    );
  }
  return simpleActionTask(
    'Làm 1 output tour guide nhỏ trong tuần: tour log, script thuyết minh, case sự cố hoặc feedback khách đã ẩn thông tin.',
    'Thực thi bằng chứng du lịch đúng nghề',
    '1 output gắn với HDV/tour: link/ảnh/ghi chú có ngày, tuyến, kết quả và người xác nhận nếu có.',
    'Output đủ cụ thể để đưa vào evidence log và chỉ bám vào công việc tour/du lịch thực địa.',
    week
  );
}

function buildHospitalityTask(task: string, week: WeekPlan): RoadmapActionTask {
  const normalized = normalizeForRoadmapQuality(task);
  if (/role|tra cao|luong muc tieu|muc luong|jd|tuyen dung|tin tuyen dung|band/.test(normalized)) {
    const variant = pickWeekVariant(week, [
      {
        title: 'Mở 3 tin tuyển dụng buồng phòng/supervisor, chép ra 3 yêu cầu lặp lại nhiều nhất.',
        output: '1 ghi chú có 3 link/ảnh JD và 3 yêu cầu lặp lại, ví dụ: tốc độ phòng, checklist lỗi, feedback giám sát.',
        kpi: 'Đủ 3 JD thật, mỗi JD ghi 1 mức lương hoặc yêu cầu chính; làm trong 30 phút là đạt.',
      },
      {
        title: 'Chọn 1 role mục tiêu cao hơn: Room Attendant senior hoặc Housekeeping Supervisor, rồi ghi 3 bằng chứng còn thiếu.',
        output: '1 ghi chú gồm role mục tiêu, mức lương mong muốn và 3 bằng chứng cần bổ sung.',
        kpi: 'Có đúng 1 role cụ thể; mỗi bằng chứng còn thiếu phải làm được trong 1-2 tuần.',
      },
      {
        title: 'So sánh 2 tin buồng phòng trả tốt hơn, khoanh 3 yêu cầu bạn đã có và 2 yêu cầu chưa có.',
        output: '1 bảng 2 cột cho 2 tin tuyển dụng, có mục đã có/chưa có.',
        kpi: 'Mỗi tin có link/ảnh; tổng cộng có 3 điểm mạnh và 2 điểm cần bổ sung.',
      },
      {
        title: 'Viết 1 checklist “em đã sẵn sàng lên senior chưa” gồm 5 tiêu chí: tốc độ, lỗi, bàn giao, feedback, hỗ trợ người mới.',
        output: '1 checklist 5 tiêu chí, mỗi tiêu chí tự chấm đạt/chưa đạt.',
        kpi: 'Có ít nhất 2 tiêu chí đạt và 1 tiêu chí cần cải thiện rõ ràng.',
      },
    ]);
    return simpleActionTask(variant.title, 'Đọc JD khách sạn và chọn track tăng lương', variant.output, variant.kpi, week);
  }
  if (/tinh huong|checkout|amenities|minibar|lost|maintenance|complaint|request|yeu cau/.test(normalized)) {
    return simpleActionTask(
      'Viết 3 tình huống hay gặp trong ca: phòng checkout gấp, thiếu amenities, khách báo phòng chưa sạch.',
      'Xử lý tình huống housekeeping',
      '1 ghi chú 3 dòng: tình huống - bạn làm gì - báo ai/xác nhận thế nào.',
      'Mỗi tình huống có cách xử lý dưới 3 bước và không lộ thông tin khách.',
      week
    );
  }
  if (/kpi|dashboard|so lieu|chi so|impact|do impact/.test(normalized)) {
    const variant = pickWeekVariant(week, [
      {
        title: 'Kẻ bảng 5 dòng theo dõi ca: ngày, số phòng, phút/phòng, lỗi, ai xác nhận.',
        output: '1 ảnh/link bảng 5 dòng; có thể làm bằng giấy, Notes hoặc Google Sheet.',
        kpi: 'Có ít nhất 5 dòng thật hoặc mô phỏng từ ca gần nhất; mỗi dòng có số phòng và lỗi nếu có.',
      },
      {
        title: 'Chọn 1 lỗi phòng hay gặp nhất tuần này, ghi số lần gặp và cách sửa lần sau.',
        output: '1 ghi chú 3 dòng: lỗi gì, gặp mấy lần, lần sau kiểm ở bước nào của checklist.',
        kpi: 'Có đúng 1 lỗi cụ thể và 1 cách phòng tránh; làm trong 10 phút là đạt.',
      },
      {
        title: 'Bấm giờ 3 phòng hoặc 3 khu vực, ghi phút hoàn thành và lý do phòng nào lâu nhất.',
        output: '1 bảng nhỏ có 3 dòng: phòng/khu vực, số phút, lý do nhanh/chậm.',
        kpi: 'Có đủ 3 mốc thời gian; không cần nhanh ngay, chỉ cần biết chỗ nghẽn.',
      },
    ]);
    return simpleActionTask(variant.title, 'Đo KPI housekeeping rất đơn giản', variant.output, variant.kpi, week);
  }
  if (/feedback|review|quote|nhờ|nho|xin/.test(normalized)) {
    const variant = pickWeekVariant(week, [
      {
        title: 'Hỏi giám sát 1 câu: “Ca này em cần sửa điểm nào để phòng đạt nhanh hơn?” rồi ghi lại câu trả lời.',
        output: '1 ảnh/ghi chú feedback gồm người góp ý, ngày, 1 điểm tốt và 1 điểm cần sửa.',
        kpi: 'Có đúng 1 feedback thật; không cần dài, 2-3 câu là đủ.',
      },
      {
        title: 'Hỏi giám sát: “Trong phòng em vừa làm, lỗi nào dễ bị khách hoặc QC nhắc nhất?” rồi ghi 1 lỗi.',
        output: '1 ghi chú gồm lỗi được nhắc, phòng/khu vực đã che thông tin và cách kiểm lại lần sau.',
        kpi: 'Có 1 lỗi cụ thể và 1 bước sửa; không cần xin nhận xét dài.',
      },
      {
        title: 'Nhờ đồng nghiệp kiểm chéo 1 phòng/khu vực, ghi lại 1 điểm đạt và 1 điểm cần sửa.',
        output: '1 ghi chú 2 dòng: điểm đạt, điểm cần sửa, người kiểm chéo.',
        kpi: 'Có người kiểm chéo thật và 1 hành động sửa ngay trong ca sau.',
      },
      {
        title: 'Hỏi giám sát: “Trước khi bàn giao phòng, em nên kiểm kỹ nhất mục nào?” rồi thêm mục đó vào checklist.',
        output: '1 checklist đã thêm đúng 1 mục từ feedback của giám sát.',
        kpi: 'Checklist có mục mới và bạn biết kiểm mục đó trước khi rời phòng.',
      },
    ]);
    return simpleActionTask(variant.title, 'Xin feedback ngắn từ giám sát', variant.output, variant.kpi, week);
  }
  if (/checklist|sop|ca housekeeping|chuyen thanh checklist|room area|room\/area|dau viec/.test(normalized)) {
    const variant = pickWeekVariant(week, [
      {
        title: 'Viết checklist 8 ô cho 1 phòng: giường, toilet, sàn, thùng rác, khăn, amenities, minibar, báo lỗi.',
        output: '1 ảnh checklist 8 ô đã tick thử cho 1 phòng/area; che số phòng hoặc thông tin khách nếu có.',
        kpi: 'Checklist có đủ 8 ô và có ít nhất 1 ô ghi lỗi hoặc “đạt”.',
      },
      {
        title: 'Tách checklist phòng thành 3 bước: vào phòng kiểm gì, đang dọn kiểm gì, trước khi rời phòng kiểm gì.',
        output: '1 ghi chú 3 mục, mỗi mục có 2-3 ô tick dễ nhớ.',
        kpi: 'Đủ 3 bước, tổng không quá 9 ô tick để người mới nhìn là làm được.',
      },
      {
        title: 'Làm 1 checklist “quên là mất điểm”: khăn, amenities, rác, tóc/sàn, mùi, đồ khách bỏ quên.',
        output: '1 checklist 6 ô cho các lỗi dễ bị nhắc nhất.',
        kpi: 'Mỗi ô có trạng thái đạt/chưa đạt; ưu tiên lỗi thật từng gặp.',
      },
    ]);
    return simpleActionTask(variant.title, 'Checklist dọn phòng dùng ngay trong ca', variant.output, variant.kpi, week);
  }
  if (/cv|linkedin|headline|bullet/.test(normalized)) {
    return simpleActionTask(
      'Viết 3 dòng CV buồng phòng theo mẫu: dọn bao nhiêu phòng/ca, giảm lỗi gì, ai xác nhận.',
      'Đóng gói kinh nghiệm housekeeping vào CV',
      '3 bullet CV ngắn, mỗi bullet có số hoặc bằng chứng: phòng/ca, phút/phòng, lỗi giảm, feedback.',
      'Đủ 3 bullet, mỗi bullet dưới 25 từ và có 1 con số hoặc người xác nhận.',
      week
    );
  }
  if (/co hoi|apply|tin nhan|email|danh sach|cong ty|khach san/.test(normalized)) {
    return simpleActionTask(
      'Lọc 5 khách sạn/căn hộ dịch vụ đang tuyển buồng phòng hoặc supervisor.',
      'Tìm cơ hội housekeeping trả tốt hơn',
      '1 danh sách 5 nơi gồm tên nơi, role, lương nếu có, link/ảnh tin và bước tiếp theo.',
      'Đủ 5 nơi thật; ít nhất 2 nơi có lương hoặc ca làm rõ.',
      week
    );
  }
  if (/deal|dam phan|de xuat|luong/.test(normalized)) {
    return simpleActionTask(
      'Viết script 5 câu xin review lương dựa trên số phòng/ca, lỗi giảm và feedback giám sát.',
      'Nói chuyện tăng lương bằng bằng chứng',
      '1 đoạn script dưới 90 giây, đọc thành tiếng được.',
      'Script có 3 phần: việc đã làm, số/bằng chứng, đề xuất mức hoặc lịch review.',
      week
    );
  }
  if (/case study|evidence|bang chung|artifact|portfolio|ho so|before-after/.test(normalized)) {
    const variant = pickWeekVariant(week, [
      {
        title: 'Gom 3 bằng chứng nhỏ vào 1 ghi chú: checklist đã tick, ảnh trước-sau, 1 feedback hoặc số phòng/ca.',
        output: '1 ghi chú hoặc folder có đúng 3 mục; mỗi mục có ngày và mô tả 1 dòng.',
        kpi: 'Đủ 3 mục nhỏ, không yêu cầu file đẹp; chỉ cần quản lý nhìn hiểu bạn đã làm gì.',
      },
      {
        title: 'Chụp 1 ảnh trước-sau của khu vực được phép chụp, rồi che số phòng/thông tin khách.',
        output: '1 cặp ảnh hoặc 1 ghi chú mô tả trước-sau; không để lộ thông tin khách.',
        kpi: 'Có đúng 1 bằng chứng trực quan và đã che thông tin nhạy cảm trước khi lưu.',
      },
      {
        title: 'Viết mini case 5 dòng: phòng/khu vực ban đầu thế nào, bạn làm gì, kết quả ra sao, ai xác nhận, bài học.',
        output: '1 đoạn 5 dòng, mỗi dòng trả lời đúng 1 ý.',
        kpi: 'Có người/xác nhận hoặc dấu hiệu kết quả; không cần văn hay, chỉ cần rõ việc.',
      },
      {
        title: 'Chọn 1 ca làm tốt nhất tuần, lưu 2 bằng chứng: checklist hoàn tất và 1 câu feedback/số phòng.',
        output: '1 ghi chú có ngày ca làm, checklist, feedback hoặc số phòng/ca.',
        kpi: 'Đủ 2 bằng chứng nhỏ, dùng được để kể khi xin review lương.',
      },
    ]);
    return simpleActionTask(variant.title, 'Gom bằng chứng housekeeping không rườm rà', variant.output, variant.kpi, week);
  }
  return simpleActionTask(
    'Chọn 1 phòng/area trong ca gần nhất, ghi 3 việc đã làm tốt và 1 lỗi cần tránh ca sau.',
    'Tự review ca housekeeping',
    '1 ghi chú 4 dòng: 3 việc tốt, 1 lỗi cần tránh, ngày ca làm.',
    'Ghi xong trong 10 phút sau ca hoặc ngay khi nhớ lại ca gần nhất.',
    week
  );
}

function buildCleaningTask(task: string, week: WeekPlan): RoadmapActionTask {
  const normalized = normalizeForRoadmapQuality(task);
  if (/role|tra cao|luong muc tieu|muc luong|jd|tuyen dung|tin tuyen dung|band/.test(normalized)) {
    const variant = pickWeekVariant(week, [
      {
        title: 'Mở 3 tin tuyển dụng vệ sinh/team leader/site supervisor, chép ra 3 yêu cầu lặp lại nhiều nhất.',
        output: '1 ghi chú có 3 link/ảnh JD và 3 yêu cầu lặp lại, ví dụ: checklist khu vực, hóa chất, bàn giao ca.',
        kpi: 'Đủ 3 JD thật, mỗi JD ghi 1 yêu cầu chính và mức lương nếu có.',
      },
      {
        title: 'Chọn 1 role mục tiêu cao hơn: tổ trưởng vệ sinh, team leader hoặc site supervisor, rồi ghi 3 bằng chứng còn thiếu.',
        output: '1 ghi chú gồm role mục tiêu, mức lương mong muốn và 3 bằng chứng cần bổ sung.',
        kpi: 'Có đúng 1 role cụ thể; mỗi bằng chứng còn thiếu phải làm được trong 1-2 tuần.',
      },
      {
        title: 'So sánh 2 tin vệ sinh trả tốt hơn, khoanh 3 yêu cầu bạn đã có và 2 yêu cầu chưa có.',
        output: '1 bảng 2 cột cho 2 tin tuyển dụng, có mục đã có/chưa có.',
        kpi: 'Mỗi tin có link/ảnh; tổng cộng có 3 điểm mạnh và 2 điểm cần bổ sung.',
      },
      {
        title: 'Viết 1 checklist “em đã sẵn sàng lên tổ trưởng chưa” gồm 5 tiêu chí: checklist, an toàn, lỗi, bàn giao, hỗ trợ người mới.',
        output: '1 checklist 5 tiêu chí, mỗi tiêu chí tự chấm đạt/chưa đạt.',
        kpi: 'Có ít nhất 2 tiêu chí đạt và 1 tiêu chí cần cải thiện rõ ràng.',
      },
    ]);
    return simpleActionTask(variant.title, 'Đọc JD vệ sinh/facility và chọn track tăng lương', variant.output, variant.kpi, week);
  }
  if (/kpi|dashboard|so lieu|chi so|impact|do impact/.test(normalized)) {
    const variant = pickWeekVariant(week, [
      {
        title: 'Kẻ bảng 5 dòng theo dõi ca: khu vực, giờ xong, lỗi/rework, dụng cụ, ai xác nhận.',
        output: '1 ảnh/link bảng 5 dòng; có thể làm bằng giấy, Notes hoặc Google Sheet.',
        kpi: 'Có ít nhất 5 dòng thật hoặc mô phỏng từ ca gần nhất; mỗi dòng có khu vực và trạng thái đạt/chưa đạt.',
      },
      {
        title: 'Chọn 1 khu vực hay bị nhắc nhất, ghi lỗi lặp lại và cách kiểm trước khi bàn giao.',
        output: '1 ghi chú 3 dòng: khu vực, lỗi hay gặp, bước kiểm lại.',
        kpi: 'Có đúng 1 khu vực cụ thể và 1 bước kiểm lại dễ làm.',
      },
      {
        title: 'Bấm giờ 3 khu vực nhỏ, ghi phút hoàn thành và khu vực nào mất thời gian nhất.',
        output: '1 bảng 3 dòng: khu vực, số phút, lý do nhanh/chậm.',
        kpi: 'Có đủ 3 mốc thời gian; biết được 1 chỗ nghẽn để sửa tuần sau.',
      },
    ]);
    return simpleActionTask(variant.title, 'Đo KPI vệ sinh rất đơn giản', variant.output, variant.kpi, week);
  }
  if (/hoa chat|dung cu|ppe|safety|an toàn|an toan/.test(normalized)) {
    return simpleActionTask(
      'Ghi 5 dụng cụ/hóa chất hay dùng và mỗi món dùng cho khu vực nào.',
      'Dùng dụng cụ/hóa chất đúng chuẩn',
      '1 ảnh/ghi chú 5 dòng: tên dụng cụ/hóa chất - dùng ở đâu - lưu ý an toàn.',
      'Đủ 5 dòng, không ghi công thức pha nếu nội bộ không cho phép chia sẻ.',
      week
    );
  }
  if (/feedback|review|quote|nhờ|nho|xin/.test(normalized)) {
    const variant = pickWeekVariant(week, [
      {
        title: 'Hỏi giám sát 1 câu: “Khu vực này còn điểm nào chưa sạch/thiếu an toàn?” rồi ghi lại câu trả lời.',
        output: '1 ảnh/ghi chú feedback gồm khu vực, ngày, 1 điểm đạt và 1 điểm cần sửa.',
        kpi: 'Có đúng 1 feedback thật; 2-3 câu là đủ.',
      },
      {
        title: 'Hỏi giám sát: “Khu vực em vừa làm thường bị nhắc lỗi gì nhất?” rồi ghi 1 lỗi.',
        output: '1 ghi chú gồm khu vực, lỗi hay bị nhắc và cách kiểm lại trước bàn giao.',
        kpi: 'Có 1 lỗi cụ thể và 1 bước kiểm lại dễ làm trong ca sau.',
      },
      {
        title: 'Nhờ đồng nghiệp kiểm chéo 1 khu vực, ghi lại 1 điểm đạt và 1 điểm cần sửa.',
        output: '1 ghi chú 2 dòng: điểm đạt, điểm cần sửa, người kiểm chéo.',
        kpi: 'Có người kiểm chéo thật và 1 hành động sửa ngay trong ca sau.',
      },
      {
        title: 'Hỏi giám sát: “Trước khi bàn giao khu vực, em nên kiểm kỹ nhất mục nào?” rồi thêm mục đó vào checklist.',
        output: '1 checklist đã thêm đúng 1 mục từ feedback của giám sát.',
        kpi: 'Checklist có mục mới và bạn biết kiểm mục đó trước khi bàn giao.',
      },
    ]);
    return simpleActionTask(variant.title, 'Xin feedback ngắn từ giám sát', variant.output, variant.kpi, week);
  }
  if (/checklist|sop|ca ve sinh|chuyen thanh checklist|khu vuc|dau viec/.test(normalized)) {
    const variant = pickWeekVariant(week, [
      {
        title: 'Viết checklist 7 ô cho 1 khu vực: rác, bụi, sàn, kính/bề mặt, mùi, dụng cụ, bàn giao.',
        output: '1 ảnh checklist 7 ô đã tick thử cho 1 khu vực.',
        kpi: 'Checklist có đủ 7 ô và có trạng thái đạt/chưa đạt cho từng ô.',
      },
      {
        title: 'Tách việc vệ sinh 1 khu vực thành 3 bước: chuẩn bị dụng cụ, làm sạch, kiểm trước bàn giao.',
        output: '1 ghi chú 3 mục, mỗi mục có 2 ô tick dễ làm.',
        kpi: 'Đủ 3 bước, tổng không quá 6 ô tick để người mới nhìn là làm được.',
      },
      {
        title: 'Làm checklist “dễ bị nhắc”: rác sót, bụi góc, vệt nước, mùi, thiếu dụng cụ, chưa bàn giao.',
        output: '1 checklist 6 ô cho lỗi dễ gặp nhất ở khu vực bạn phụ trách.',
        kpi: 'Mỗi ô có đạt/chưa đạt; ưu tiên lỗi thật từng gặp.',
      },
    ]);
    return simpleActionTask(variant.title, 'Checklist vệ sinh dùng ngay trong ca', variant.output, variant.kpi, week);
  }
  if (/cv|linkedin|headline|bullet/.test(normalized)) {
    return simpleActionTask(
      'Viết 3 dòng CV vệ sinh theo mẫu: phụ trách khu vực nào, giảm lỗi gì, ai xác nhận.',
      'Đóng gói kinh nghiệm vệ sinh vào CV',
      '3 bullet CV ngắn, mỗi bullet có khu vực, kết quả hoặc feedback.',
      'Đủ 3 bullet, mỗi bullet dưới 25 từ và có bằng chứng.',
      week
    );
  }
  if (/co hoi|apply|tin nhan|email|danh sach|cong ty|facility/.test(normalized)) {
    return simpleActionTask(
      'Lọc 5 nơi đang tuyển vệ sinh/team leader/facility support.',
      'Tìm cơ hội vệ sinh trả tốt hơn',
      '1 danh sách 5 nơi gồm tên nơi, role, lương nếu có, link/ảnh tin và bước tiếp theo.',
      'Đủ 5 nơi thật; ít nhất 2 nơi có lương hoặc ca làm rõ.',
      week
    );
  }
  if (/deal|dam phan|de xuat|luong/.test(normalized)) {
    return simpleActionTask(
      'Viết script 5 câu xin review lương dựa trên khu vực phụ trách, lỗi giảm và feedback giám sát.',
      'Nói chuyện tăng lương bằng bằng chứng',
      '1 đoạn script dưới 90 giây, đọc thành tiếng được.',
      'Script có 3 phần: việc đã làm, số/bằng chứng, đề xuất mức hoặc lịch review.',
      week
    );
  }
  if (/case study|evidence|bang chung|artifact|portfolio|ho so|before-after/.test(normalized)) {
    const variant = pickWeekVariant(week, [
      {
        title: 'Gom 3 bằng chứng nhỏ vào 1 ghi chú: checklist đã tick, ảnh trước-sau, 1 feedback hoặc log lỗi.',
        output: '1 ghi chú hoặc folder có đúng 3 mục; mỗi mục có ngày và mô tả 1 dòng.',
        kpi: 'Đủ 3 mục nhỏ, không yêu cầu file đẹp; chỉ cần quản lý nhìn hiểu bạn đã làm gì.',
      },
      {
        title: 'Chụp 1 ảnh trước-sau của khu vực được phép chụp, rồi che thông tin nội bộ nếu có.',
        output: '1 cặp ảnh hoặc ghi chú mô tả trước-sau của đúng 1 khu vực.',
        kpi: 'Có đúng 1 bằng chứng trực quan, không lộ thông tin khách/hợp đồng/nội bộ.',
      },
      {
        title: 'Viết mini case 5 dòng: khu vực ban đầu thế nào, bạn làm gì, kết quả ra sao, ai xác nhận, bài học.',
        output: '1 đoạn 5 dòng, mỗi dòng trả lời đúng 1 ý.',
        kpi: 'Có người/xác nhận hoặc dấu hiệu kết quả; không cần văn hay, chỉ cần rõ việc.',
      },
      {
        title: 'Chọn 1 ca làm tốt nhất tuần, lưu 2 bằng chứng: checklist hoàn tất và 1 feedback/log bàn giao.',
        output: '1 ghi chú có ngày ca làm, checklist, feedback hoặc log bàn giao.',
        kpi: 'Đủ 2 bằng chứng nhỏ, dùng được để kể khi xin review lương.',
      },
    ]);
    return simpleActionTask(variant.title, 'Gom bằng chứng vệ sinh không rườm rà', variant.output, variant.kpi, week);
  }
  return simpleActionTask(
    'Chọn 1 khu vực trong ca gần nhất, ghi 3 việc đã làm tốt và 1 lỗi cần tránh ca sau.',
    'Tự review ca vệ sinh',
    '1 ghi chú 4 dòng: 3 việc tốt, 1 lỗi cần tránh, ngày ca làm.',
    'Ghi xong trong 10 phút sau ca hoặc ngay khi nhớ lại ca gần nhất.',
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
      'Mở 5 JD Restaurant Manager/F&B Ops trả cao hơn, chép ra yêu cầu lặp lại: roster, labor cost, food cost, service quality, complaint recovery và P&L.',
      'Đọc JD quản lý nhà hàng đúng level',
      '1 bảng 5 JD gồm mức lương, KPI vận hành, bằng chứng đã có và bằng chứng còn thiếu.',
      'Mỗi JD phải có keyword cấp quản lý; không lấy recipe/plating/HACCP làm skill chính nếu role không phải bếp.',
      week
    );
  }
  if (/kpi|dashboard|so lieu|chi so|impact|do impact/.test(normalized)) {
    return simpleActionTask(
      'Lập dashboard ca/tháng gồm doanh thu, table turn, labor cost, food cost/waste, complaint recovery, review score và training completion.',
      'Restaurant operations dashboard',
      '1 dashboard 6-8 chỉ số có baseline, hiện tại, mục tiêu và hành động tiếp theo.',
      'Dashboard phải giúp owner/GM ra quyết định về ca, chi phí hoặc chất lượng dịch vụ.',
      week
    );
  }
  if (/sop|ca|roster|staff|nhan su|training|dao tao|floor|service|complaint/.test(normalized)) {
    return simpleActionTask(
      'Chọn 1 ca gần nhất, ghi 3 điểm nghẽn: thiếu người, bill/order lỗi, complaint hoặc tốc độ phục vụ; viết cách sửa cho ca sau.',
      'Floor control và service recovery',
      '1 incident/action log có ngày ca, vấn đề, người phụ trách, hạn sửa và kết quả mong đợi.',
      'Mỗi vấn đề có 1 hành động cụ thể trong 7 ngày và 1 người xác nhận.',
      week
    );
  }
  if (/deal|dam phan|de xuat|luong/.test(normalized)) {
    return simpleActionTask(
      'Viết memo xin review lương: scope quản lý, 3 KPI ca đã cải thiện, 2 bằng chứng, 1 mức/lịch review đề xuất.',
      'Đề xuất tăng lương bằng KPI vận hành nhà hàng',
      '1 memo ngắn và script 90 giây có số liệu ca/tháng.',
      'Script phải nói bằng ngôn ngữ operations: revenue, chi phí, service quality, complaint recovery và team stability.',
      week
    );
  }
  return simpleActionTask(
    'Kiểm tra 1 ca làm: roster, doanh thu, complaint, order/bill lỗi, food/labor cost; chọn 1 điểm cần sửa trước tuần sau.',
    'Quản lý ca nhà hàng bằng KPI đơn giản',
    '1 note 5 dòng có số liệu hoặc bằng chứng được phép chia sẻ.',
    'Có 1 hành động sửa ca sau và 1 người xác nhận.',
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
      'Lập bảng KPI y tế học đường: thời gian phản ứng, hồ sơ sức khỏe, số ca sơ cứu/chuyển tuyến, thuốc/dị ứng và feedback nhà trường-phụ huynh.',
      'Đo KPI y tế học đường',
      '1 bảng 6 cột có 5-10 dòng ca thật hoặc mô phỏng đã ẩn thông tin học sinh.',
      'Có ít nhất 3 chỉ số theo dõi được và 1 việc cần sửa trong tuần sau.',
      week
    );
  }
  if (isSchoolHealthcare && /role|tra cao|luong muc tieu|muc luong|jd|tuyen dung/.test(normalizedTask)) {
    return simpleActionTask(
      'Chọn 3 hướng trả cao hơn cho y tế học đường: school nurse senior, điều phối an toàn sức khỏe học đường hoặc phòng khám nhi hợp tác trường học.',
      'Đọc JD y tế học đường và chọn track đúng nghề',
      '1 bảng gồm 3 role, mức lương mục tiêu, yêu cầu chính, bằng chứng đã có và bằng chứng còn thiếu.',
      'Mỗi role có 1 JD/link/ảnh tin tuyển dụng và 3 keyword năng lực đúng nghề y tế học đường.',
      week
    );
  }
  if (isSchoolHealthcare && /so cuu|thuoc|di ung|tiem chung|benh truyen nhiem|chuyen tuyen|checklist|protocol|su co|ho so/.test(normalizedTask)) {
    return simpleActionTask(
      'Làm 1 checklist y tế học đường cho 1 tình huống cụ thể: tiếp nhận, sơ cứu, gọi phụ huynh, chuyển tuyến, ghi log và bàn giao.',
      'Sơ cứu học đường và protocol sự cố',
      '1 checklist 6 bước và 1 log mẫu đã ẩn thông tin học sinh.',
      'Người mới đọc vào biết bước tiếp theo là gì; không bỏ sót mục gọi phụ huynh/chuyển tuyến/ghi log.',
      week
    );
  }
  if (isPublicSubjectTeacher && /kpi|dashboard|so lieu|chi so|impact|do impact|diem|tien bo/.test(normalizedTask)) {
    return simpleActionTask(
      'Lập bảng tiến bộ học sinh cho 1 lớp/nhóm: điểm trước-sau, tỷ lệ hoàn thành bài, lỗi thường gặp, nhóm cần phụ đạo và bằng chứng bài làm đã ẩn danh.',
      'Đo tiến bộ điểm số học sinh',
      '1 bảng 6 cột có ít nhất 10 dòng học sinh ẩn danh hoặc 1 nhóm bài kiểm tra.',
      'Có số trước-sau, nhận xét ngắn và 1 việc cần can thiệp trong tuần sau.',
      week
    );
  }
  if (isPublicSubjectTeacher && /role|tra cao|luong muc tieu|muc luong|jd|tuyen dung|band/.test(normalizedTask)) {
    return simpleActionTask(
      'Chọn 3 hướng đúng nghề cho giáo viên bộ môn: giáo viên nòng cốt, tổ phó/tổ trưởng chuyên môn, subject lead đúng bộ môn ở trường tư/quốc tế.',
      'Đọc JD/giao nhiệm vụ đúng track giáo viên bộ môn',
      '1 bảng gồm 3 hướng, mức lương/phụ cấp mục tiêu, yêu cầu chính, bằng chứng đã có và bằng chứng còn thiếu.',
      'Mỗi hướng có keyword đúng nghề: giáo án bộ môn, ma trận đề, rubric, dự giờ, chuyên đề tổ, phụ đạo/bồi dưỡng hoặc hồ sơ thi đua.',
      week
    );
  }
  if (isPublicSubjectTeacher && /giao an|ma tran|rubric|de kiem tra|chuyen de|du gio|phu dao|boi duong|ho so/.test(normalizedTask)) {
    return simpleActionTask(
      'Đóng gói 1 chương/bài đang dạy thành bộ hồ sơ: giáo án bộ môn, ma trận đề, rubric chấm bài, bài học sinh đã ẩn danh và nhận xét sau tiết.',
      'Giáo án bộ môn và hồ sơ chuyên môn',
      '1 thư mục/link gồm giáo án, ma trận đề, rubric, 3 bài mẫu đã ẩn danh và 1 nhận xét dự giờ/góp ý nếu có.',
      'Người trong tổ chuyên môn đọc vào thấy đúng chuẩn bộ môn, có tiêu chí chấm và có bằng chứng tiến bộ học sinh.',
      week
    );
  }
  if (isEnglishTeacher && /kpi|dashboard|so lieu|chi so|impact/.test(normalizedTask)) {
    return {
      title: 'Lập bảng KPI lớp tiếng Anh: attendance, homework, pre-test/post-test, Speaking/Writing rubric và feedback/retention.',
      skill: 'Đo tiến bộ học viên tiếng Anh',
      output: '1 link/ảnh Google Sheet có ít nhất 1 lớp hoặc 3-5 học viên; mỗi dòng có điểm nền, mục tiêu, kết quả sau buổi/tuần và bằng chứng feedback.',
      kpi: 'Đo tối thiểu 3 chỉ số: attendance >=85%, homework completion >=80%, post-test/mock test tăng hoặc lỗi Speaking/Writing giảm; thêm retention/renewal nếu có.',
      doneDefinition: `Tick khi có sheet/link/ảnh KPI và nó phục vụ checkpoint: ${week.milestone}`,
    };
  }
  if (isEnglishTeacher && /role|tra cao|luong muc tieu|muc luong|jd|tuyen dung/.test(normalizedTask)) {
    return {
      title: 'Chọn 3 role trả cao hơn cho giáo viên tiếng Anh: IELTS/Cambridge Teacher, Academic Lead, Curriculum Lead hoặc Education Growth.',
      skill: 'Đọc JD giáo dục tiếng Anh và chọn đúng track',
      output: '1 bảng gồm 3 role, target salary, yêu cầu chính, bằng chứng bạn đã có và bằng chứng còn thiếu cho từng role.',
      kpi: 'Mỗi role có ít nhất 1 JD thật hoặc tin tuyển dụng, 3 keyword năng lực và 1 lý do vì sao bạn có thể chạm được role đó.',
      doneDefinition: `Tick khi bảng role đủ rõ để đem hỏi mentor/nhà tuyển dụng hoặc dùng cho checkpoint: ${week.milestone}`,
    };
  }
  if (isEnglishTeacher && /lesson|giao an|tesol|celta|demo|module|rubric|curriculum/.test(normalizedTask)) {
    return {
      title: 'Soạn 1 lesson plan TESOL/CELTA-style kèm demo class 10-15 phút và rubric chấm Speaking/Writing.',
      skill: 'Thiết kế bài dạy tiếng Anh có tiêu chí đo được',
      output: '1 lesson plan, 1 slide/worksheet, 1 rubric Speaking/Writing và link video/ghi chú demo class 10-15 phút.',
      kpi: 'Lesson plan có mục tiêu học, activity, timing, assessment; rubric có tiêu chí rõ và dùng được để chấm trước/sau.',
      doneDefinition: `Tick khi có đủ lesson plan + rubric + demo hoặc ghi chú demo phục vụ checkpoint: ${week.milestone}`,
    };
  }
  if (isEnglishTeacher && /feedback|review|quote/.test(normalizedTask)) {
    return {
      title: 'Xin feedback thật cho demo class hoặc lesson plan từ học viên, phụ huynh, quản lý học thuật hoặc giáo viên senior.',
      skill: 'Lấy feedback và cải thiện bài dạy tiếng Anh',
      output: '2 feedback ngắn kèm bản sửa sau feedback; che thông tin riêng tư nếu cần.',
      kpi: 'Có ít nhất 2 nhận xét cụ thể về độ dễ hiểu, tương tác lớp, hoạt động luyện Speaking/Writing hoặc kết quả bài tập.',
      doneDefinition: `Tick khi feedback đã được lưu và có 1 điểm sửa cụ thể phục vụ checkpoint: ${week.milestone}`,
    };
  }
  const skill = isSchoolHealthcare
    ? 'So cuu hoc duong va ho so suc khoe hoc sinh'
    : isPilot
    ? 'Flight deck SOP, simulator/recurrent va CRM/ATC'
    : isAviation
    ? 'Safety-service và feedback cabin crew'
    : isHospitality
    ? 'Housekeeping checklist và feedback giám sát'
    : isCleaning
    ? 'Checklist vệ sinh và nghiệm thu khu vực'
    : pickSkill(task, compass.topSkillGap);
  return {
    title: task,
    skill,
    output: isPerformer
      ? '1 link/ảnh/video/ghi chú chứng minh năng lực MC: showreel, lời dẫn, feedback, rate card hoặc case xử lý sân khấu'
      : isFresh
      ? '1 bài làm nhỏ hoặc ghi chú rõ ràng: role đã chọn, checklist từng bước, feedback nhận được và bản sửa sau feedback'
      : isAviation
      ? '1 feedback/checklist/ghi chú tình huống đã che thông tin khách hoặc chứng chỉ training lưu trong evidence log'
      : isSchoolHealthcare
      ? '1 checklist/log y tế học đường đã ẩn thông tin học sinh lưu trong evidence log'
      : isHospitality
      ? '1 checklist phòng/area, ảnh before-after đã che thông tin khách, log tốc độ/lỗi và feedback giám sát lưu trong evidence log'
      : isCleaning
      ? '1 checklist khu vực, ảnh before-after, log dụng cụ/hóa chất, lỗi/rework và feedback giám sát lưu trong evidence log'
      : /evidence|bằng chứng|artifact|case|portfolio|dashboard|CV|LinkedIn/i.test(task)
      ? '1 file/link/ảnh chụp lưu trong evidence log'
      : `1 output gắn trực tiếp với ${jobTitle}`,
    kpi: isPerformer
      ? 'Đo bằng số clip/show hoàn thành, feedback khách/agency, đúng timeline, số lead booking, tỷ lệ chốt show hoặc mức phí trung bình/show'
      : isFresh
      ? 'Đo bằng số JD đã đọc, bài test/mini project đã nộp, feedback mentor, CV gửi đúng role hoặc số phản hồi nhận được'
      : isAviation
      ? 'Có feedback, checklist đạt/chưa đạt, số lần luyện announcement hoặc tình huống xử lý được xác nhận'
      : isSchoolHealthcare
      ? 'Có thời gian phản ứng, hồ sơ cập nhật, số ca sơ cứu/chuyển tuyến, thuốc/dị ứng hoặc feedback nhà trường-phụ huynh được ghi lại'
      : isHospitality
      ? 'Có số phòng/ca hoặc phút/phòng, lỗi/rework, complaint hoặc feedback giám sát được ghi lại'
      : isCleaning
      ? 'Có checklist đạt/chưa đạt, lỗi/rework, complaint, thời gian xử lý hoặc điểm nghiệm thu được ghi lại'
      : /kpi|chỉ số|số liệu|lương|doanh thu|lỗi|thời gian/i.test(task)
      ? 'Có số trước/sau hoặc mốc hoàn thành đo được'
      : 'Có người xác nhận hoặc có tiêu chí đạt/chưa đạt',
    doneDefinition: isFresh
      ? `Tick khi người mới đọc lại vẫn hiểu bước tiếp theo là gì và có bằng chứng nhỏ phục vụ checkpoint: ${week.milestone}`
      : `Tick khi đã có output và nó phục vụ checkpoint: ${week.milestone}`,
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
  const roleName = repairMojibakeText(roleText).trim().slice(0, 42) || 'nghề hiện tại';
  const proofName = roleLanguage.productWord || 'bằng chứng nghề nghiệp';
  const titles = [
    `Chốt mốc lương và bằng chứng cho ${roleName}`,
    `Làm thử 1 bằng chứng: ${proofName}`,
    `Đóng gói case để xin feedback thật`,
    `Cải thiện KPI bằng một việc đang làm`,
    `Tạo hồ sơ deal lương có số trước-sau`,
    `Xin review lương hoặc lọc role trả cao hơn`,
    `Mở rộng bằng chứng sang cơ hội trả cao hơn`,
    `Tập dượt phỏng vấn/review bằng case thật`,
    `Chốt hồ sơ 9 tháng và kế hoạch deal tiếp theo`,
  ];
  return titles[milestoneIndex] || `Tháng ${month}: thêm bằng chứng ${proofName}`;
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
      focus: `Hoàn thành sản phẩm nghề nghiệp tuần ${index + 1}`,
      tasks: [`Hoàn thành 1 output đo được cho ${jobTitle}.`],
      milestone: 'Có 1 sản phẩm/case study đủ đưa vào portfolio hoặc buổi review.',
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
        isAviationPlan ? 'Safety-service và feedback cabin crew' :
        isPerformerPlan ? 'Showreel, feedback và rate card MC' :
        isSchoolHealthcarePlan ? 'Sơ cứu học đường, hồ sơ sức khỏe và protocol sự cố' :
        isTourismPlan ? (taxonomySkillLine || 'Tour log, thuyết minh tuyến điểm và xử lý sự cố tour') :
        isRestaurantManagerPlan ? 'Shift operations, labor cost, food cost và service quality' :
        isRestaurantFrontlinePlan ? 'POS/order accuracy, service SOP va shift handover' :
        isHotelManagerPlan ? 'Occupancy, ADR/RevPAR, staffing SLA va guest experience' :
        isHotelFrontlinePlan ? 'PMS accuracy, check-in SOP va guest request SLA' :
        isDentalPlan ? 'Chan doan, treatment plan, vo khuan va case nha khoa an danh' :
        isDentalAssistantPlan ? 'Chair setup, vo khuan, suction/chuyen dung cu va follow-up' :
        isInsurancePlan ? 'Underwriting, claims/boi thuong, policy wording va renewal/loss ratio' :
        isHospitalityPlan ? 'Housekeeping checklist, room speed và guest feedback' :
        isCleaningPlan ? 'Cleaning checklist, rework rate và supervisor audit' :
        isPublicSubjectTeacherPlan ? 'Giáo án bộ môn, ma trận đề, rubric và tiến bộ học sinh' :
        isLanguageCenterManagerPlan ? 'Enrollment funnel, class fill, teacher utilization va retention/renewal' :
        isEnglishTeacherPlan ? 'KPI lớp tiếng Anh và lesson plan đo được' :
        isMarketingManagerPlan ? 'Brand strategy, P&L, budget va brand health' :
        taxonomySkillLine || pickSkill(task, compass.topSkillGap)
      ))
    ))).slice(0, 4);

    milestones.push({
      month,
      title: buildMilestoneTitle(milestoneIndex, month, roleText, roleLanguage),
      objective: chunk[chunk.length - 1]?.milestone || `Có ít nhất 1 ${roleLanguage.productWord} nhìn thấy được, có số trước-sau và có người xác nhận.`,
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
    weeklyHours: intake.weeklyTime || '3-5 giờ/tuần',
    completionRule: 'Hoàn thành 70% việc lõi là đủ; mỗi giai đoạn chỉ cần 1 output rõ, 1 bằng chứng lưu lại và 1 feedback từ người thật.',
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
    durationMonths <= 3 ? 'tháng 2-3' :
    durationMonths <= 6 ? 'tháng 4-6' :
    'tháng 6-12';
  const role = intake.currentPosition || jobTitle;
  const needsDiagnosis = !intake.mainWeakness || !intake.bottleneck;
  const inferredGap = compass.topSkillGap;
  const weakness = intake.mainWeakness || (needsDiagnosis ? `chưa rõ - cần chẩn đoán từ dữ liệu đầu vào, ưu tiên kiểm tra ${inferredGap}` : inferredGap);
  const goal = intake.twoYearGoal || `${targetSalary.toLocaleString('vi-VN')} VNĐ/tháng hoặc lên role tốt hơn`;
  const educationLevel = intake.educationLevel || 'Chưa cung cấp';
  const educationDetail = sanitizeEducationDetailForRole(`${jobTitle} ${role}`, intake.educationDetail) || 'Chưa cung cấp';
  const classification = classifyEducationFit(jobTitle, intake);
  const actionPlan = buildActionPlan(weekly, jobTitle, durationMonths, compass, intake);
  const knownStrengths = intake.strongSkills || 'Chưa cung cấp';
  const existingProof = intake.proofAssets || 'Chưa cung cấp';
  const bottleneck = intake.bottleneck || (needsDiagnosis ? 'chưa xác định - tuần đầu phải đo nền KPI, bằng chứng, scope, visibility, skill gap và kịch bản deal' : weakness);
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
        '- Tuần 1 không bắt bạn đoán mình yếu gì. Chẩn đoán bằng 5 nhóm đúng nghề MC: showreel, giọng/nhịp sân khấu, kịch bản lời dẫn, xử lý sự cố live, feedback khách/agency và khả năng chốt booking.',
        '- Mỗi nhóm có 1 việc nhỏ: chọn 1 clip cũ, tự chấm 5 tiêu chí, viết lại 1 đoạn mở màn, mô phỏng 1 tình huống trễ timeline, xin 1 feedback từ producer/MC/khách quen.',
        '- Sau 7 ngày, chọn 1 hướng đổi nghề liền kề để thử: Event Coordinator/Producer, Brand Activation, Livestream Host, Content Presenter, Voice-over/Trainer hoặc Sales/CS cần thuyết trình.',
        '- Tuyệt đối không kéo sang 5S, QC, an toàn lao động, sản lượng line hoặc kỹ năng nhà máy vì đó không phải đòn bẩy của người đang làm MC.',
      ].join('\n')
    : needsDiagnosis && isFreshOrUndirectedRole(normalizedRole)
    ? [
        '- Tuần 1 không yêu cầu bạn biết mình hợp nghề nào. Bắt đầu bằng 3 role mẫu: một role giao tiếp, một role phân tích/văn phòng, một role sáng tạo/nội dung.',
        '- Với mỗi role, đọc 3 JD thật và ghi lại: việc hằng ngày, skill cần có, bài test thường gặp, mức lương entry và điều mình thích/không thích.',
        '- Làm 1 mini project 2-3 giờ cho role có điểm cao nhất, rồi xin 1 feedback từ anh/chị đi làm hoặc người hướng dẫn.',
        '- Sau 7 ngày mới chọn hướng chính. Không dùng checklist chung kiểu “cải thiện bản thân”; phải có bài làm cụ thể để biết hợp hay không.',
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
        '- Tuần 1 không bắt user đoán điểm yếu. Chẩn đoán bằng 5 nhóm: safety-service checklist, feedback senior crew, announcement tiếng Anh, service recovery, grooming/teamwork.',
        '- Mỗi nhóm có 1 việc nhỏ: tự chấm checklist, xin 1 feedback, ghi âm 1 announcement, viết 1 tình huống khách khó và ghi 1 điểm cần sửa sau ca/chuyến.',
        '- Không dùng dữ liệu doanh thu nội bộ, không ghi thông tin riêng tư hành khách. Chỉ dùng bằng chứng cá nhân hợp lệ: checklist, feedback, chứng chỉ training, ghi chú tình huống đã che thông tin.',
        '- Sau 7 ngày, chọn nút thắt thật: thiếu feedback, thiếu tiếng Anh tình huống, thiếu service recovery, thiếu chuẩn grooming/teamwork hoặc thiếu bằng chứng để xin tuyến/role khó hơn.',
      ].join('\n')
    : needsDiagnosis
    ? [
        '- Tuần 1 không vội kết luận điểm yếu. Bắt đầu bằng chẩn đoán 5 nhóm: KPI đo được, bằng chứng đã có, scope/quyền quyết định, visibility với người trả lương và skill gap thị trường.',
        '- Mỗi nhóm phải có 1 câu hỏi kiểm tra, 1 hành động nhỏ, 1 output hữu hình và 1 số đo trước/sau.',
        '- Nếu phát hiện thiếu KPI: dựng dashboard nền. Nếu thiếu bằng chứng: tạo case study. Nếu thiếu scope: xin nhận một đầu việc có owner rõ. Nếu thiếu visibility: đóng gói báo cáo gửi người ra quyết định. Nếu thiếu skill: học đúng skill tạo KPI trong công việc.',
        '- Sau 7 ngày, chọn nút thắt thật dựa trên dữ liệu, không dựa trên cảm giác.',
      ].join('\n')
    : isAviation && normalizeForRoadmapQuality(weakness).includes('khong tap trung chi tiet')
    ? [
        '- Checklist trước ca/chuyến: grooming, briefing, safety-service flow, 1 tình huống khách khó có thể gặp và câu nói nên dùng.',
        '- 2 block luyện ngắn: 15 phút announcement tiếng Anh và 15 phút viết lại một tình huống service recovery theo format: tình huống - phản hồi - quy trình - feedback.',
        '- Sổ lỗi cabin cá nhân: ghi lỗi/điểm cần sửa, tình huống, cách phòng lại, không ghi thông tin riêng tư hành khách.',
        '- Review cuối ca/chuyến: xin 1 feedback ngắn từ senior crew/đồng nghiệp hoặc tự chấm checklist đạt/chưa đạt.',
        '- 5 tiêu chí theo dõi: checklist hoàn thành, feedback nhận được, số lần luyện announcement, tình huống service recovery đã ghi, điểm grooming/teamwork cần cải thiện.',
        '- Quy tắc vận hành: chưa lưu được một bằng chứng nhỏ thì chưa mở thêm mục tiêu mới.',
      ].join('\n')
    : normalizeForRoadmapQuality(weakness).includes('khong tap trung chi tiet')
    ? [
        '- Checklist đầu ngày: viết 3 output bắt buộc, 5 lỗi cần né, 1 task phải đóng trước 11h.',
        '- 2 block tập trung: mỗi block 45-60 phút, chỉ xử lý 1 sản phẩm/bằng chứng nghề, tắt thông báo và ghi kết quả cuối block.',
        '- Sổ lỗi chi tiết: ghi lỗi, nguyên nhân, chi phí, cách chặn lỗi tái diễn.',
        '- Review cuối ngày: đối chiếu output với checklist, chốt 1 cải tiến cho ngày mai.',
        '- Dashboard 5 chỉ số: task đóng, lỗi lặp lại, SLA trễ, thời gian deep work, output được quản lý/khách hàng xác nhận.',
        '- Quy tắc vận hành: không mở task mới khi task cũ chưa có output hữu hình.',
      ].join('\n')
    : `- Biến điểm nghẽn "${bottleneck}" thành checklist hằng ngày: việc làm cụ thể, output hữu hình, KPI đo và tiêu chuẩn hoàn thành. Không mặc định bạn thiếu kỹ năng đã khai báo; dùng điểm mạnh hiện có để tạo bằng chứng cao hơn.`;
  const languageCenterNote = isLanguageCenter && hasAcademicAdvantage
    ? `\n\nVới quản lý trung tâm ngoại ngữ, bằng cấp của bạn là lợi thế học thuật. Nhưng nếu chỉ làm vận hành thường ngày, bằng đang bị under-monetized. Muốn tăng lương, hãy biến bằng cấp thành quyền phụ trách đào tạo giáo viên, chuẩn hóa curriculum, tăng retention, giảm complaint, cải thiện trial-to-paid và mở lớp/chương trình mới. KPI ngành phải theo dõi: học viên active, retention/churn, trial-to-paid, lead-to-enrollment, class fill rate, teacher utilization, parent complaint SLA, renewal rate, revenue per class, dropout/refund reasons.`
    : '';
  const schoolEducationNote = isSchoolEducation
    ? `\n\nVới giáo dục trường học, phải tách rõ công lập/biên chế và tư thục/quốc tế. Nếu công lập/biên chế, tăng lương không thể tư vấn như deal thị trường tự do: ngạch-bậc, phụ cấp, thi đua, bổ nhiệm và phân công của Sở/Phòng GD quyết định rất nhiều. Nếu tư thục/quốc tế, có thể dùng learning outcome, phản hồi phụ huynh, retention học sinh, curriculum, chất lượng giáo viên và vận hành chương trình để deal lương hoặc chuyển trường. ${isPrincipal ? 'Với hiệu trưởng/hiệu phó, không viết như thể còn một nấc chức vụ phổ thông để “lên”; hướng đúng là tối ưu quyền hạn/phụ cấp trong công lập hoặc mở rộng quy mô/cụm trường/hệ thống ở tư thục.' : ''}`
    : '';
  const performerNote = isPerformer
    ? `\n\nVới MC/người dẫn chương trình, lộ trình này không được học lan man kỹ thuật. Mục tiêu là tăng phí dẫn bằng 5 nhóm bằng chứng: showreel 60-90 giây, kịch bản mẫu, xử lý tình huống live, feedback khách/agency và rate card theo format sự kiện. KPI nghề MC gồm: số show chất lượng, tỷ lệ khách quay lại/giới thiệu, số feedback thật, độ đúng timeline, mức phí trung bình/show, số lead booking và tỷ lệ chốt show.`
    : '';
  const chefNote = isChef
    ? `\n\nVới đầu bếp/F&B, lộ trình này không được học lan man kỹ thuật văn phòng. Mục tiêu là tăng lương bằng 5 nhóm bằng chứng nghề bếp: recipe card có định lượng/cost, food cost, waste rate, tốc độ ra món, chuẩn plating/SOP và khả năng training phụ bếp. KPI nghề bếp gồm: cost món, hao hụt nguyên liệu, số suất/ca, thời gian ra món, rating/complaint, số lỗi món và số người trong bếp bạn hướng dẫn được.`
    : '';
  const pilotNote = isPilot
    ? `\n\nVoi phi cong/pilot/flight deck, lo trinh nay tuyet doi khong duoc dung ngon ngu cabin crew. Muc tieu la tang gia tri bang flight safety, SOP compliance, type rating/recurrent training, simulator check, cockpit CRM/ATC, flight hours/logbook, route-aircraft qualification va safety/incident-free record. Khong dung purser, grooming, announcement cabin, service recovery, passenger complaint hay senior crew feedback.`
    : '';
  const aviationNote = isAviation
    ? `\n\nVới tiếp viên hàng không/cabin crew, lộ trình này không được dùng kỹ năng văn phòng/IT. Mục tiêu là tăng giá trị bằng 5 nhóm bằng chứng đúng nghề: checklist safety-service, service recovery, announcement tiếng Anh, grooming/teamwork, feedback senior crew/đồng nghiệp và chứng chỉ training. Không yêu cầu dữ liệu doanh thu nội bộ hoặc thông tin riêng tư hành khách. KPI nghề cabin crew nên là: checklist hoàn thành, feedback senior crew, tình huống khách khó xử lý êm, announcement luyện có ghi âm, đúng quy trình safety và mức sẵn sàng cho tuyến/role khó hơn.`
    : '';
  const monthSections = actionPlan.milestones.map(milestone => {
    const firstWeek = milestone.weeks[0];
    const firstTask = firstWeek?.tasks[0];
    return `### Tháng ${milestone.month}: ${milestone.title}
- Mục tiêu: ${milestone.objective}
- Skill cần nâng: ${milestone.skills.join(', ')}
- Việc làm cụ thể tuần đầu: ${firstTask?.title || 'Tạo bằng chứng có số liệu cho công việc quan trọng nhất.'}
- Output hữu hình: ${firstTask?.output || '1 artifact lưu được trong evidence log, có ảnh/link/file và người xác nhận.'}
- KPI đo: ${firstTask?.kpi || 'trước/sau về thời gian xử lý, lỗi giảm, doanh thu, retention, SLA hoặc chất lượng bàn giao.'}
- Tiêu chuẩn hoàn thành: ${firstTask?.doneDefinition || 'quản lý/khách hàng/đồng nghiệp có thể nhìn vào artifact và hiểu bạn tạo ra giá trị gì.'}`;
  }).join('\n\n');
  const educationAction30Days = isPerformer
    ? '- Trong 30 ngày: chọn 1 hướng liền kề với MC, tạo showreel/clip 60-90 giây, viết 1 kịch bản mẫu, xin 1 feedback từ producer/khách quen và gửi thử 5 đầu mối phù hợp.'
    : isFreshOrUndirectedRole(normalizedRole)
    ? '- Trong 30 ngày: chọn 3 role mẫu, đọc 9 JD, làm 1 mini project, xin 1 feedback và sửa CV theo role đã chọn.'
    : isAviation
    ? '- Trong 30 ngày: tạo checklist safety-service cá nhân, luyện 1 announcement tiếng Anh, xin 1 feedback từ senior crew/đồng nghiệp và ghi 1 tình huống service recovery đã che thông tin khách.'
    : '- Trong 30 ngày: chọn 1 năng lực học thuật áp vào việc thật; tạo 1 quy trình/dashboard/case study; xin 1 xác nhận từ quản lý hoặc khách hàng nội bộ.';

  const markdown = `# Lộ trình thực thi tăng lương theo tháng

## Chẩn đoán nhanh
Bạn đang ở vai trò "${role}", lương hiện tại ${(currentSalary / 1_000_000).toFixed(1)}M/tháng và mục tiêu là "${goal}". Khoảng tăng cần chứng minh là ${(targetSalary - currentSalary).toLocaleString('vi-VN')} VNĐ/tháng, nên roadmap phải ưu tiên ${isAviation ? 'bằng chứng nghề đã được senior crew/đồng nghiệp xác nhận' : 'bằng chứng kinh doanh'} thay vì danh sách việc làm chung chung.

Cam kết thực hiện: nhịp chuẩn ${actionPlan.standardWeeks} tuần, nhịp bận ${actionPlan.flexibleWeeks} tuần, mỗi tuần ${actionPlan.weeklyHours}. Điều kiện được xem là hoàn thành: ${actionPlan.completionRule}

## Khảo sát đầu vào
- Kỹ năng/đòn bẩy đã mạnh: ${knownStrengths}.
- Bằng chứng/thành tích đã có: ${existingProof}.
- Nút thắt cần xử lý trước: ${bottleneck}.
- Hướng ưu tiên: ${preferredPath}.

## Độ khớp học vấn với lương
- Phân loại: ${classification}.
- Học vấn: ${educationLevel}.
- Liên quan: ${educationDetail}.
- Bằng cấp đang giúp bạn có tín hiệu nền tảng, nhưng thị trường chỉ trả thêm khi tín hiệu đó biến thành KPI, scope lớn hơn hoặc quyền ra quyết định rõ hơn.
${educationAction30Days}${languageCenterNote}${schoolEducationNote}

## Giao thức xử lý điểm yếu lớn nhất
${focusProtocol}${performerNote}${chefNote}${pilotNote}${aviationNote}

## Chiến lược ${durationLabel}
${monthSections}

## Bản đồ bằng chứng tăng lương
- Evidence log: việc đã làm, output, KPI trước/sau, ảnh/link/file, người xác nhận.
- Case study 1 trang: vấn đề, hành động, kết quả, bằng chứng, bài học có thể lặp lại.
- ${isPerformer ? 'Hồ sơ MC/đổi hướng: showreel, 3 mẫu lời dẫn, rate card, feedback khách/agency, danh sách 20 đầu mối event/brand/livestream và 1 case xử lý sân khấu.' : isFreshOrUndirectedRole(normalizedRole) ? 'Hồ sơ người mới: bảng chọn role, 1 mini project, feedback mentor, CV theo role và tracker 10 nơi đã gửi thử.' : isAviation ? 'Hồ sơ cabin crew: checklist safety-service, feedback senior crew, ghi âm announcement, chứng chỉ training và tình huống service recovery đã che thông tin khách.' : 'Dashboard lương: 5 chỉ số sát vai trò hiện tại và role mục tiêu.'}

## Kịch bản deal lương 90 giây
"Trong ${durationMonths} tháng qua, em tập trung xử lý ${weakness}. Kết quả là em có các bằng chứng sau: ${isPerformer ? 'showreel, feedback khách/agency, rate card và case xử lý sân khấu' : isChef ? 'recipe card có cost, waste log, tốc độ ra món, checklist SOP bếp và feedback xác nhận' : isAviation ? 'checklist safety-service, feedback senior crew, announcement tiếng Anh và case service recovery đã che thông tin khách' : 'case study, KPI và output đã được xác nhận'}. Với mức đóng góp này và mặt bằng role mục tiêu, em muốn trao đổi về mức ${(targetSalary / 1_000_000).toFixed(1)}M/tháng hoặc một scope mới có KPI rõ để đạt mức đó."

## Cảnh báo điểm nghẽn
- Không xin tăng lương bằng nỗ lực; chỉ dùng output và KPI.
- Không đợi hoàn hảo; mỗi tuần phải có 1 bằng chứng nhỏ.
- Không học lan man; kỹ năng nào không tạo KPI trong công việc thì để sau.

## Việc cần làm trong 7 ngày tới
1. ${isPerformer ? `Chọn 3 hướng đổi nghề liền kề với MC và 1 KPI kiểm chứng cho từng hướng. ${getPracticalKpiGuidance(normalizedRole)}` : isFreshOrUndirectedRole(normalizedRole) ? `Chọn 3 role mẫu, đọc mỗi role 3 JD và chấm điểm hợp/không hợp. ${getPracticalKpiGuidance(normalizedRole)}` : isAviation ? `Chọn 3 tiêu chí cabin crew dễ theo dõi cho "${role}": feedback senior crew, announcement tiếng Anh, checklist safety-service hoặc tình huống service recovery.` : `Chốt 5 KPI sát role "${role}".`}
2. Tạo evidence log và nhập số liệu nền.
3. Đóng gói 1 output nhỏ có thể gửi quản lý xem.
4. Xin feedback cụ thể và ghi lại thành bằng chứng.
5. Lên lịch review cuối tuần để chọn hành động tiếp theo.`;

  return {
    format: 'expert_v2',
    version: 2,
    goal: `Lộ trình thực thi tăng lương cho ${role}`,
    summary: `Checklist AI cá nhân hóa theo ngành ${jobTitle}, lương hiện tại ${(currentSalary / 1_000_000).toFixed(1)}M/tháng, điểm yếu "${weakness}", học vấn "${educationLevel}" và mục tiêu "${goal}". Lộ trình này dựa trên dữ liệu bạn nhập và bộ quy tắc nghề nghiệp Top Lương, không phải tư vấn 1-1 bởi chuyên gia người thật.`,
    weeks: [],
    negotiation_timing: `Mốc ${negotiationWindow} là thời điểm đàm phán mạnh nhất nếu đã có đủ KPI, case study và bằng chứng thị trường.`,
    salary_projection: `Nếu hoàn thành 70-80% hành động trong roadmap, bạn có cơ sở đàm phán quanh mức ${(targetSalary / 1_000_000).toFixed(1)} triệu/tháng hoặc role tương đương. Không phải lời hứa về kết quả lương.`,
    markdown,
    intake,
    actionPlan,
  };
}

// Legacy live generator kept out of the runtime path during the pregenerated-roadmap migration.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function generateRoadmap(
  jobTitle: string,
  currentSalary: number,
  targetSalary: number,
  durationMonths: number,
  intake: RoadmapIntake = {},
  roleProfileOverride?: RoleProfile | null,
  originalJobTitleFromCheckout?: string | null
): Promise<RoadmapData> {
  intake = sanitizeRoadmapIntakeForJob(jobTitle, intake);
  const canonicalContext = buildRoadmapGenerationContext({
    jobTitle,
    originalJobTitle: originalJobTitleFromCheckout,
    roleProfile: roleProfileOverride,
  });
  const weeks = getCompactPlanWeeks(durationMonths);
  const durationLabel = formatRoadmapDuration(durationMonths);
  const milestoneLabels = getRoadmapMilestoneLabels(durationMonths);
  const negotiationWindow =
    durationMonths <= 3 ? 'tháng 2-3' :
    durationMonths <= 6 ? 'tháng 4-6' :
    'tháng 6-12';
  const salaryGap = targetSalary - currentSalary;
  const isCustomRoadmapRole = Boolean(intake.customTargetRole && !roleProfileOverride);
  const baseLockedRole = roleProfileOverride
    ? buildRoadmapRoleSkillsFromProfile(roleProfileOverride)
    : isCustomRoadmapRole
      ? buildCustomRoadmapRoleSkills(jobTitle)
    : buildRoadmapRoleSkills(jobTitle);
  const outputJobTitle = canonicalContext.canonicalRoleTitle || baseLockedRole.manual?.canonicalTitle || jobTitle;
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
    : isCustomRoadmapRole
      ? buildCustomRoadmapRoleSkills(outputJobTitle, [
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
  const weaknessForPrompt = intake.mainWeakness || 'Chưa rõ - AI phải chẩn đoán từ vị trí, lương, kỹ năng mạnh, bằng chứng hiện có và benchmark thị trường';
  const bottleneckForPrompt = intake.bottleneck || 'Chưa rõ - AI phải xác định giả thuyết nút thắt, thiết kế tuần 1 để đo nền và xác nhận/loại trừ';

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
    const deterministic = buildValidatedDeterministicFallback({
      jobTitle: outputJobTitle,
      roleId: canonicalContext.canonicalRoleId || lockedRole.profile?.key || roleProfileOverride?.key || null,
      roleProfile: lockedRole.profile || roleProfileOverride || null,
      userInputs: { ...intake, durationMonths },
      context: 'missing-api-key',
    });
    if (deterministic) return deterministic.roadmap;
    console.error('[roadmap-role-lock] fallback failed without API key', { jobTitle, wrongItems: fallbackValidation.wrongItems });
    throw new RoadmapRoleLockError();
  }

  const roleLockSystemPrompt = buildRoadmapRoleLockPrompt({
    jobTitle: outputJobTitle,
    experience: intake.currentPosition || outputJobTitle,
    currentSalary,
    targetSalary,
    timeline: durationMonths,
    roleSkills: roleSkillsForPrompt,
  });

  const systemPrompt = `${roleLockSystemPrompt}

${canonicalContext.promptHeader}
${canonicalContext.roleBoundaryPrompt ? `\n${canonicalContext.roleBoundaryPrompt}` : ''}

Bạn là Senior Headhunter & Career Strategist tại Việt Nam, từng tư vấn tuyển dụng cấp quản lý và đàm phán lương cho ứng viên.

Nhiệm vụ: tạo một "Lộ trình thực thi tăng lương theo tháng" thực tế, thẳng thắn, có thể hành động ngay.

Quy tắc bắt buộc:
- Trả lời bằng Markdown thuần, không bọc trong code fence.
- Viết tiếng Việt tự nhiên, sắc, có cảm giác được cá nhân hóa cho đúng người.
- Phải có các mốc phù hợp thời hạn ${durationLabel}: ${milestoneLabels.join(', ')}.
- Mỗi mốc phải có: mục tiêu, skill cụ thể cần nâng, hành động chính theo tuần, bằng chứng cần tạo, KPI đo được, checklist hoàn thành và lỗi cần tránh.
- Toàn bộ roadmap chỉ được có khoảng ${maxCoreTasks} việc lõi để tick. Không được tạo 96 việc, không chia mỗi tuần 4 task dày đặc.
- Phải ghi rõ cam kết thực hiện: nhịp chuẩn bao nhiêu tuần, nhịp bận bao nhiêu tuần, mỗi tuần cần bao nhiêu giờ.
- Có phần "Bản đồ bằng chứng tăng lương", "Kịch bản deal lương 90 giây", và "Cảnh báo điểm nghẽn".
- Không hứa chắc tăng lương. Luôn dùng ngôn ngữ có điều kiện: nếu hoàn thành, có cơ sở, tăng xác suất.
- TIMELINE THỰC TẾ: tăng lương 20-30% cần tối thiểu 6-12 tháng; tăng 50% cần tối thiểu 12-18 tháng; tăng 100%/x2 cần tối thiểu 24-36 tháng. Không được ghi timeline ngắn hơn các mốc này. Nếu user muốn tăng 100% trong 9 tháng, phải ghi rõ: "Mục tiêu này cần 24-36 tháng thực tế. Lộ trình dưới đây tối ưu cho giai đoạn đầu."
- Không đưa lời khuyên chung chung kiểu "học thêm kỹ năng" nếu không nêu kỹ năng, output và tiêu chí đo.
- Ranh giới nghề bắt buộc: chỉ phân loại ngành/nghề từ "Ngành nghề/chức danh hệ thống", "Target role / destination" và "Vị trí hiện tại". Future goal, học vấn, chứng chỉ, kỹ năng mạnh, bằng chứng cũ và mục tiêu dài hạn KHÔNG được đổi domain nghề.
- Neu nghe khong phai giao vien tieng Anh, tuyet doi khong dua TESOL, CELTA, IELTS/Cambridge nhu chung chi ca nhan, demo class, lesson plan, rubric Speaking/Writing hoac homework completion vao roadmap. Neu nghe la quan ly trung tam ngoai ngu, chi duoc dung KPI quan ly: enrollment, class fill, teacher utilization, retention, complaint SLA, revenue per class; khong duoc bien thanh giao vien.
- Nếu nghề là giáo viên bộ môn công lập/trường học như Toán, Lý, Hóa, Sử, Địa, Ngữ văn, Tin học, Sinh, GDCD, Công nghệ, Âm nhạc, Mỹ thuật hoặc Thể dục: roadmap phải xoay quanh giáo án bộ môn, ma trận đề, rubric chấm bài, tiến bộ điểm số học sinh, hồ sơ chuyên môn, dự giờ, chuyên đề tổ, phụ đạo/bồi dưỡng, thi đua/phụ cấp/bổ nhiệm hoặc chuyển sang subject lead đúng bộ môn ở trường tư/quốc tế. Không được biến thành giáo viên tiếng Anh, Center Manager, Academic Operations, tuyển sinh trung tâm hoặc quản lý trung tâm ngoại ngữ.
- Nếu nghề là nhân viên y tế trường học/y tế học đường/school nurse, tuyệt đối không dùng TESOL, CELTA, IELTS, lesson plan, demo class, học viên, curriculum, rubric Speaking/Writing hoặc homework completion. Phải dùng sơ cứu học đường, hồ sơ sức khỏe học sinh, thuốc/dị ứng, tiêm chủng, bệnh truyền nhiễm, chuyển tuyến, protocol sự cố và phối hợp phụ huynh-giáo viên-nhà trường.
- Nếu nghề là nhân viên/chuyên viên thống kê generic, roadmap phải xoay quanh Excel/Sheets, Power Query, làm sạch dữ liệu, data dictionary, pivot/dashboard, đối soát sai lệch, báo cáo định kỳ và insight note; tuyệt đối không đưa OEE, RCA, Lean, Six Sigma, PLC, line sản xuất, defect rate, downtime hoặc safety incidents trừ khi chức danh ghi rõ thống kê sản xuất.
- Nếu nghề là tư vấn du học/admissions quốc tế, roadmap phải xoay quanh tư vấn chọn trường-ngành, kiểm điều kiện đầu vào, checklist hồ sơ/visa, deadline giấy tờ, CRM follow-up, consultation booked, hồ sơ nộp, offer rate, visa pass rate, enrollment conversion và feedback khách.
- Nếu nghề là tư vấn tuyển sinh/enrollment cho trung tâm ngoại ngữ, trường tư hoặc đại học tư thục, roadmap phải xoay quanh lead qualification, tư vấn chương trình/lớp/ngành phù hợp, học phí/ngân sách, lịch tư vấn hoặc placement test, CRM follow-up, đăng ký/ghi danh, đóng phí, nhập học, no-show và feedback khách. Không tự biến thành giáo viên, Center Manager hoặc vận hành học thuật.
- Nếu nghề là nha sĩ/dentist/bác sĩ nha khoa, roadmap phải xoay quanh khám chẩn đoán, treatment plan, hồ sơ bệnh án nha khoa ẩn danh, X-quang/CBCT/ảnh trong miệng nếu được phép, protocol vô khuẩn-an toàn thủ thuật, tư vấn bệnh nhân, tái khám, theo dõi biến chứng/rework và feedback bệnh nhân/bác sĩ phụ trách. Tuyệt đối không dùng Excel/Canva/CV/portfolio cá nhân/Tiếng Anh B2 như skill chính.
- Nếu nghề là trợ lý/phụ tá nha khoa, roadmap phải xoay quanh chuẩn bị ghế, dụng cụ, vô khuẩn, suction/chuyển dụng cụ, hướng dẫn bệnh nhân sau điều trị, lịch tái khám, tồn kho vật tư và feedback bác sĩ; không viết như nha sĩ chẩn đoán.
- Nếu nghề là hospitality/cleaning/housekeeping/buồng phòng, roadmap phải xoay quanh checklist phòng/khu vực, tốc độ ca, tiêu chuẩn sạch, amenities, maintenance/lost & found, rework/lỗi, complaint khách, bàn giao và feedback giám sát.
- Nếu nghề là tài xế/taxi/shipper/giao hàng/giao nhận/driver/delivery, roadmap phải xoay quanh đúng giờ, tỷ lệ hoàn thành đơn/chuyến, tối ưu tuyến, an toàn giao thông, giấy tờ/bằng lái, rating/feedback khách, xử lý phát sinh giao hàng, chi phí nhiên liệu/thời gian tuyến và xác nhận điều phối/quản lý. Tuyệt đối không đưa SOP nhà máy, 5S, QC checklist, vận hành máy, sản lượng line, tổ phó/tổ trưởng sản xuất, TESOL/CELTA/IELTS, Power BI, Python hoặc tài chính.`;

  const userPrompt = `Dữ liệu ứng viên:
- Ngành nghề/chức danh hệ thống: ${jobTitle}
- Tên nghề chuẩn để hiển thị trong output: ${outputJobTitle}
- Current role / where user is now: ${intake.currentJobTitle || intake.currentPosition || jobTitle}${intake.currentRoleId ? ` (role_id: ${intake.currentRoleId})` : ''}
- Target role / destination for roadmap: ${intake.targetJobTitle || outputJobTitle}${intake.targetRoleId ? ` (role_id: ${intake.targetRoleId})` : canonicalContext.canonicalRoleId ? ` (role_id: ${canonicalContext.canonicalRoleId})` : ' (custom role, no benchmark-safe role_id)'}
- Future goal in user's own words: ${intake.futureGoalText || intake.twoYearGoal || 'Chưa cung cấp'}
- Target salary desired by user: ${(intake.targetSalary || targetSalary).toLocaleString('vi-VN')} VNĐ/tháng (${intake.targetSalaryAssessment || 'system_checked'})
- Rule: current role is context only; target role is the destination. Free-text future goal must not become canonical role. Do not guarantee salary increase.
- Vị trí hiện tại do user nhập: ${intake.currentPosition || jobTitle}
- Lương hiện tại: ${currentSalary.toLocaleString('vi-VN')} VNĐ/tháng
- Lương mục tiêu hệ thống đề xuất: ${targetSalary.toLocaleString('vi-VN')} VNĐ/tháng
- Mục tiêu user trong ${durationLabel} tới: ${intake.twoYearGoal || `${targetSalary.toLocaleString('vi-VN')} VNĐ/tháng hoặc lên role tốt hơn`}
- Điểm yếu chuyên môn lớn nhất: ${weaknessForPrompt}
- Trình độ học vấn cao nhất: ${intake.educationLevel || 'Chưa cung cấp'}
- Ngành học/chứng chỉ liên quan: ${sanitizeEducationDetailForRole(roleText || outputJobTitle, intake.educationDetail) || 'Chưa cung cấp'}
- Kỹ năng/đòn bẩy user nói đã khá mạnh: ${intake.strongSkills || 'Chưa cung cấp'}
- Bằng chứng/thành tích user đã có: ${intake.proofAssets || 'Chưa cung cấp'}
- Nút thắt lớn nhất đang cản tăng lương: ${bottleneckForPrompt}
- Trạng thái chẩn đoán: ${needsDiagnosis ? 'User chưa chắc điểm yếu/nút thắt. Không được đoán bừa; phải tự chẩn đoán bằng dữ liệu, tạo tuần đo nền và xử lý toàn bộ nhóm điểm yếu có khả năng cản tăng lương.' : 'User đã khai báo điểm yếu/nút thắt, nhưng vẫn phải kiểm tra lại bằng dữ liệu và bằng chứng.'}
- Hướng ưu tiên user chọn: ${describePreferredPath(intake.preferredPath, `${jobTitle} ${intake.currentPosition || ''}`)}
- Thời gian có thể thực thi mỗi tuần: ${intake.weeklyTime || '3-5 giờ/tuần'}
- Thời gian roadmap gốc: ${durationMonths} tháng (${weeks} tuần)
- Khoảng tăng cần có: ${salaryGap.toLocaleString('vi-VN')} VNĐ/tháng
- Nhóm nghề: ${compass.jobGroup}
- Mốc lương hiện tại: ${(currentSalary / 1_000_000).toFixed(1)} triệu/tháng; mục tiêu hệ thống: ${(targetSalary / 1_000_000).toFixed(1)} triệu/tháng. Không dùng dải lương generic nếu nó thấp hơn hoặc lệch với mức lương user đã khai.
- Skill gap thị trường: ${compass.topSkillGap}
- Milestone để lên band: ${compass.nextMilestone}
- Insight thị trường: ${compass.marketInsight}
- Nhận diện domain chỉ từ chức danh/vị trí: ${roleText || outputJobTitle} (segment taxonomy: ${taxonomySegment})
- Track nghề được phép dùng: ${roleLanguage.rolePath}
- Kỹ năng chính được phép ưu tiên: ${roleLanguage.mainSkill}
- Skill bank bat buoc cho stimulate/roadmap/certificate: ${taxonomySkillLabels.join(' | ') || roleLanguage.mainSkill}
- Exact role profile bắt buộc: ${lockedRole.profile?.title || 'Custom role - chưa có benchmark chuẩn'} (${lockedRole.profile?.industry || 'không rõ ngành'}). Nếu dữ liệu hệ thống có lỗi ký tự, output vẫn phải dùng tên nghề chuẩn "${outputJobTitle}".
- Bộ kỹ năng chuyên ngành bắt buộc dùng trong task/bằng chứng:
${formatRoleSkillsForPrompt(roleSkillsForPrompt)}
- Bằng chứng nghề phù hợp: ${roleLanguage.proofAsset}
- KPI nên dùng cho case này: ${kpiGuidance}
${segment ? `- Segment đặc biệt: ${segment.label}
- Ưu tiên roadmap: ${segment.priority}
- Loại bằng chứng phải thu thập: ${segment.proof}` : ''}

Cấu trúc Markdown mong muốn:
# Lộ trình thực thi tăng lương theo tháng
## Chẩn đoán nhanh
## Độ khớp học vấn với lương
## Giao thức xử lý điểm yếu lớn nhất
## Chiến lược ${durationLabel}
${milestoneLabels.map(label => `### ${label}`).join('\n')}
## Bản đồ bằng chứng tăng lương
## Kịch bản deal lương 90 giây
## Cảnh báo điểm nghẽn
## Việc cần làm trong 7 ngày tới

Quy tắc cá nhân hóa bắt buộc:
- Không được dùng các chữ: AI, DeepSeek, ChatGPT, Claude trong nội dung trả về.
- Nếu user đã khai báo kỹ năng/đòn bẩy mạnh, không được viết như thể họ chưa biết kỹ năng đó. Hãy dùng chúng làm lợi thế và nâng lên bằng chứng/KPI/scope cao hơn.
- Nếu dữ liệu thiếu hoặc user không chắc, không được lặp nguyên chữ "không biết"; hãy viết "chưa đủ dữ liệu" và thiết kế bước khảo sát/đo nền trong tuần đầu.
- Nếu user chưa rõ điểm yếu hoặc nút thắt, phần "Chẩn đoán nhanh" phải nêu 3-5 giả thuyết nút thắt có khả năng nhất và tuần 1 phải có checklist xác minh từng giả thuyết. Roadmap phải bao phủ đủ các nhóm yếu điểm thường gặp: thiếu KPI, thiếu bằng chứng, thiếu scope/quyền quyết định, thiếu visibility với người trả lương, thiếu skill tạo chênh lệch, và thiếu kịch bản deal/apply.
- Nếu user mới tốt nghiệp hoặc chưa rõ định hướng, không được nói "biến 1 công việc hiện tại" vì họ có thể chưa có việc. Hãy cầm tay chỉ việc: chọn 3 role mẫu, đọc JD, làm 1 mini project, xin feedback, sửa CV và gửi thử.
- Nếu user muốn đổi hướng nghề nghiệp, phải đưa 3-5 hướng nghề cụ thể liền kề với kỹ năng hiện có, nói vì sao hợp, rủi ro gì, bài test đầu tiên là gì và KPI kiểm chứng trong 14 ngày.
- Phần "Độ khớp học vấn với lương" phải phân loại vào 1 nhóm: Under-credentialed nhưng có thực chiến, Credential-fit, Over-credentialed nhưng chưa monetized được bằng cấp, hoặc Misaligned credential.
- Phần học vấn phải nói rõ bằng cấp đang giúp gì, đang bị thị trường bỏ phí ở đâu, và 3 hành động trong 30 ngày để biến học vấn/kinh nghiệm thành bằng chứng lương.
- Với case quản lý trung tâm ngoại ngữ, nếu học vấn là Thạc sĩ/MBA hoặc Ngôn ngữ Anh, phải nói rõ: có lợi thế học thuật; nếu chỉ làm vận hành thường ngày thì bằng đang bị under-monetized; muốn tăng lương phải biến bằng cấp thành quyền phụ trách đào tạo giáo viên, chuẩn hóa curriculum, tăng retention, giảm complaint, cải thiện trial-to-paid và mở lớp/chương trình mới.
- Với giáo viên tiểu học/THCS/THPT, hiệu phó, hiệu trưởng hoặc trường học: bắt buộc tách công lập/biên chế và tư thục/quốc tế. Công lập/biên chế phụ thuộc ngạch-bậc, phụ cấp, thi đua, bổ nhiệm và phân công của Sở/Phòng GD; không được khuyên deal lương/nhảy ngành như tư nhân. Tư thục/quốc tế mới dùng learning outcome, phụ huynh, retention, curriculum và chất lượng giáo viên để deal hoặc chuyển trường.
- Với hiệu trưởng/hiệu phó: không viết như thể còn một nấc chức vụ phổ thông để “lên”. Hiệu trưởng đã là vị trí cao nhất trong một trường; hướng hợp lý là tối ưu quyền hạn/phụ cấp/chất lượng trong công lập hoặc mở rộng quy mô/cụm trường/hệ thống ở tư thục.
${isPilot ? '- Neu diem yeu la "khong tap trung chi tiet" hoac tuong tu voi phi cong/pilot, phai tao giao thuc flight deck: pre-flight SOP checklist, radio/ATC phraseology practice, simulator/recurrent debrief note, logbook/evidence update va safety/incident-free review; tuyet doi khong dung cabin crew/grooming/service recovery.' : isAviation ? '- Nếu điểm yếu là "không tập trung chi tiết" hoặc tương tự với tiếp viên/cabin crew, phải tạo giao thức theo ca/chuyến: checklist safety-service, luyện announcement, sổ lỗi cabin cá nhân, feedback senior crew/đồng nghiệp và tuyệt đối không dùng dashboard văn phòng.' : '- Nếu điểm yếu là "không tập trung chi tiết" hoặc tương tự, phải tạo giao thức hằng ngày gồm checklist đầu ngày, 2 block tập trung, sổ lỗi chi tiết, review cuối ngày, dashboard 5 chỉ số và quy tắc không mở task mới khi task cũ chưa có output.'}
${isSchoolHealthcare ? '- Với nhân viên y tế trường học/y tế học đường/school nurse, tuyệt đối không đưa TESOL/CELTA/IELTS/lesson plan/demo class/học viên/curriculum/rubric Speaking-Writing. Phải dùng kỹ năng đúng nghề: sơ cứu học đường, hồ sơ sức khỏe học sinh, thuốc/dị ứng, tiêm chủng, bệnh truyền nhiễm, chuyển tuyến, incident log, gọi phụ huynh, phối hợp giáo viên/ban giám hiệu và bảo mật thông tin học sinh.' : ''}
${isPublicSubjectTeacher ? '- Với giáo viên bộ môn công lập/trường học, tuyệt đối không dùng Center Manager, Academic Operations, teacher utilization, trial-to-paid, class fill rate, TESOL/CELTA/IELTS/Cambridge, demo class hoặc skill trung tâm ngoại ngữ. Phải dùng task đúng nghề: giáo án bộ môn, ma trận đề, rubric chấm bài, tiến bộ điểm số học sinh, hồ sơ chuyên môn, dự giờ/góp ý, chuyên đề tổ, phụ đạo/bồi dưỡng, thi đua/phụ cấp/bổ nhiệm hoặc subject lead đúng bộ môn nếu ở trường tư/quốc tế.' : ''}
${isEducationAdmissions ? (isStudyAbroadAdmissions ? '- Với tư vấn du học/admissions quốc tế, tuyệt đối không dùng Center Manager, Teacher utilization, lesson plan, TESOL/CELTA như skill giảng dạy hoặc curriculum. Phải dùng kỹ năng đúng nghề: qualification nhu cầu-ngân sách, shortlist trường/ngành, checklist hồ sơ/visa, CRM follow-up, consultation booked, offer/visa outcome, enrollment conversion, SLA follow-up và feedback khách.' : '- Với tư vấn tuyển sinh/enrollment cho trung tâm ngoại ngữ, trường tư hoặc đại học tư thục, tuyệt đối không dùng Center Manager, Teacher utilization, lesson plan, TESOL/CELTA như skill giảng dạy hoặc curriculum. Phải dùng kỹ năng đúng nghề: lead qualification, tư vấn chương trình/lớp/ngành, học phí/ngân sách, lịch tư vấn hoặc placement test, CRM follow-up, đăng ký/ghi danh, đóng phí, nhập học, SLA follow-up, no-show và feedback khách.') : ''}
${isLanguageCenterOps ? '- Với quản lý trung tâm ngoại ngữ, phải dùng KPI cấp quản lý: active students, retention/churn, trial-to-paid, lead-to-enrollment, class fill rate, teacher utilization, parent complaint SLA, renewal rate, revenue per class, dropout/refund reasons. Không được hạ xuống task giáo viên như TESOL/CELTA, demo class, lesson plan, Speaking/Writing rubric hoặc homework completion.' : ''}
${isMarketingManager ? '- Với Brand Manager/Marketing Manager/Marketing Lead, tuyệt đối không hạ xuống skill nhân viên execution như Edit video, Photoshop, Canva, lập content calendar, viết post đơn lẻ hoặc portfolio campaign cơ bản. Phải dùng task cấp quản lý: brand positioning, consumer insight, brand health, awareness/consideration, market share/penetration, campaign P&L, budget/media mix, agency briefing, go-to-market launch plan, stakeholder alignment, executive dashboard và business impact case study.' : ''}
${isManagerOrExecutive ? `- Với vai trò quản lý/lãnh đạo, tuyệt đối không hạ roadmap xuống task nhân viên cơ bản hoặc checklist học skill chung chung. Phải dùng task đúng cấp quản lý: KPI dashboard, ownership phạm vi công việc, kế hoạch team/vendor/stakeholder, ngân sách/chi phí hoặc SLA, coaching/review cadence, risk log và bằng chứng business impact. Skill được phép bám theo: ${taxonomySkillLabels.join(' | ') || roleLanguage.mainSkill}.` : ''}
${isRestaurantManager ? '- Với quản lý nhà hàng/Restaurant Manager/F&B Manager, phải dùng task cấp quản lý vận hành: shift operations, floor control, roster, labor cost, food cost, inventory/waste, service quality, table turn, complaint recovery, training team, P&L cơ bản và dashboard owner/GM. Không được biến thành đầu bếp: recipe card, plating, kitchen SOP, phụ bếp hoặc HACCP không phải core nếu role không ghi bếp/chef.' : ''}
${isRestaurantFrontline ? '- Với nhân viên phục vụ bàn/thu ngân nhà hàng/waiter/cashier restaurant, phải dùng task frontline đơn giản: POS/order accuracy, bill log, table service SOP, upsell tại bàn, complaint tại bàn, shift handover, vệ sinh khu vực và feedback quản lý ca. Không bắt user làm P&L, budget, executive dashboard hoặc KPI director/manager làm task chính.' : ''}
${isHotelManager ? '- Voi quan ly khach san/Hotel Manager/Front Office Manager/Revenue Manager khach san, phai dung task cap quan ly: occupancy, ADR, RevPAR, OTA/revenue coordination, staffing SLA, SOP audit, review score, complaint escalation, P&L/budget va operating dashboard. Khong viet nhu le tan ca nhan.' : ''}
${isHotelFrontline ? '- Voi le tan khach san/front desk/guest service/reservation, phai dung task frontline: check-in/check-out SOP, PMS/booking accuracy, guest request SLA, upsell phong/dich vu, complaint recovery, shift handover, review feedback. Khong bat user lam P&L, RevPAR/ADR strategy, budget khach san hoac dashboard GM nhu task ca nhan.' : ''}
${isVeterinary ? '- Voi bac si thu y/veterinarian, tuyet doi khong viet nhu bac si dieu tri nguoi, nha si hoac phong kham nguoi. Khong dung patient outcome, patient communication, benh nhan/nguoi nha, hospital/healthtech nhu skill chinh. Phai dung animal triage, diagnosis theo loai vat nuoi, vaccination/deworming, surgery/anesthesia safety, parasite control, owner communication, follow-up va case thu y da an thong tin.' : ''}
${isNutrition ? '- Voi chuyen vien dinh duong/nutritionist/dietitian, tuyet doi khong viet nhu bac si lam sang chung. Khong dung clinical protocol, patient communication, benh an, healthtech, surgery/anesthesia, nha khoa hoac thu y. Phai dung nutrition assessment, khau phan hien tai, meal plan/che do an, diet counseling, behavior change, adherence, follow-up va chi so truoc-sau nhu can nang/BMI/vong eo/duong huyet-lipid neu co.' : ''}
${isInsurance ? '- Voi chuyen vien bao hiem phi nhan tho/non-life insurance, tuyet doi khong viet nhu FP&A, Finance Analyst, ke toan, controller, chief accountant, CFA/ACCA hay financial modeling noi bo. Phai dung underwriting risk, claims/boi thuong, giam dinh ton that, policy wording, coverage/loai tru, quote SLA, renewal ratio, loss ratio, premium written va broker/client retention.' : ''}
${isDental ? '- Voi nha si/dentist/bac si nha khoa, tuyet doi khong dung skill generic nhu Excel/Google Sheets dashboard, Canva/PowerPoint, Viet CV/LinkedIn, Tieng Anh B2, portfolio ca nhan. Phai dung skill clinical nha khoa: chan doan, treatment plan, vo khuan/infection control, X-quang/CBCT/photo intraoral, case lam sang an danh, follow-up tai kham, complication/rework log, patient communication va feedback benh nhan/bac si phu trach.' : ''}
${isDentalAssistant ? '- Voi tro ly/phu ta nha khoa, tuyet doi khong viet nhu nha si chan doan dieu tri. Phai dung skill ho tro phong thu thuat: chair setup, dung cu, vo khuan, suction/chuyen dung cu, huong dan sau dieu tri, lich tai kham, ton kho vat tu va feedback bac si.' : ''}
${isPilot ? '- Voi phi cong/pilot/flight deck, tuyet doi khong dung cabin crew, purser, grooming, service recovery, passenger complaint, announcement cabin, senior crew feedback hoac checklist cabin. Phai dung flight safety, SOP compliance, type rating/recurrent training, simulator check, flight hours/logbook, cockpit CRM, ATC communication, checkride, route-aircraft qualification va safety/incident-free record.' : ''}
${isTourism ? `- Voi vai tro du lich/tour nay (${tourismProfile?.kind}), tuyet doi khong map chung sang nha hang/khach san/front office. Khong dua room cleaning, PMS/check-in khach san, upsell phong, table service, POS/order, food cost hoac SOP nha hang-khach san. Phai bam dung skill: ${taxonomySkillLabels.join(' | ') || roleLanguage.mainSkill}. Bang chung phai la: ${roleLanguage.proofAsset}.` : ''}
- Với MC/người dẫn chương trình/host sự kiện, tuyệt đối không được đưa kỹ năng kỹ thuật văn phòng như GitHub, TypeScript, JavaScript, API, system design, SQL, debugging. Phải dùng kỹ năng đúng nghề: showreel, giọng nói, nhịp sân khấu, tương tác khán giả, xử lý sự cố live, kịch bản lời dẫn, rehearsal, briefing khách hàng, rate card, portfolio sự kiện, feedback khách/agency, booking lead và tỷ lệ chốt show.
- Với MC/người dẫn chương trình muốn chuyển hướng, gợi ý hướng liền kề như Event Producer/Coordinator, Brand Activation Executive, Livestream Host/Commerce Host, Content Presenter/Video Script, Voice-over/Trainer nói trước đám đông hoặc Sales/Customer Success cần kỹ năng thuyết trình. Tuyệt đối không gợi ý SOP nhà máy, 5S, QC checklist, an toàn lao động, sản lượng line.
- Với đầu bếp/Chef/F&B, tuyệt đối không được đưa kỹ năng kỹ thuật văn phòng như GitHub, TypeScript, JavaScript, API, system design, SQL, debugging. Không viết "đang ở công ty" nếu nghề là bếp. Phải dùng kỹ năng đúng nghề: food cost, waste rate, recipe card, định lượng nguyên liệu, tốc độ ra món, chuẩn plating, an toàn vệ sinh, HACCP nếu phù hợp, kiểm ca, training phụ bếp, feedback khách, complaint món, kitchen SOP, bếp chuỗi/khách sạn/catering/bếp trung tâm.
${isAviation ? '- Với tiếp viên hàng không/cabin crew/hàng không, tuyệt đối không được đưa kỹ năng kỹ thuật văn phòng như GitHub, TypeScript, JavaScript, API, system design, SQL, debugging. Không yêu cầu dashboard, doanh thu nội bộ, học viên, food cost hoặc showreel. Phải dùng kỹ năng đúng nghề: safety procedure, checklist cabin, service recovery, passenger communication, announcement tiếng Anh, grooming, teamwork, senior crew feedback, chứng chỉ training, route readiness, briefing/debrief và xử lý complaint. Bằng chứng không được chứa thông tin riêng tư hành khách.' : ''}
${isHospitality ? '- Với hospitality/housekeeping/nhân viên buồng phòng, tuyệt đối không được đưa TESOL/CELTA/lesson plan/học viên/phụ huynh. Phải dùng kỹ năng đúng nghề: room cleaning SOP, room inspection checklist, amenities/minibar/laundry handover, lost & found, maintenance report, guest request, rework/error log, room speed, supervisor feedback và guest complaint recovery.' : ''}
${isCleaning ? '- Với cleaning/vệ sinh/tạp vụ, tuyệt đối không được đưa TESOL/CELTA/lesson plan/học viên/phụ huynh. Phải dùng kỹ năng đúng nghề: area cleaning checklist, tool/chemical log, safety/PPE, before-after proof, rework/complaint log, audit cleanliness, handover và supervisor feedback.' : ''}
${isDriverDeliveryRole(roleText || outputJobTitle) ? '- Với tài xế/taxi/shipper/giao hàng/giao nhận, tuyệt đối không đưa SOP nhà máy, 5S, QC checklist, vận hành máy, sản lượng line, tổ phó/tổ trưởng sản xuất, TESOL/CELTA/IELTS, Power BI, Python hoặc tài chính. Phải dùng kỹ năng đúng nghề: đúng giờ, completion rate, tối ưu tuyến, an toàn giao thông, kiểm xe/giấy tờ/bằng lái, rating khách, xử lý phát sinh giao hàng, giảm hoàn/hủy, chi phí nhiên liệu/thời gian tuyến, feedback điều phối/quản lý và log chuyến/đơn.' : ''}
- Mỗi hành động phải có việc làm cụ thể, output hữu hình, KPI đo và tiêu chuẩn hoàn thành.
- Không chỉ viết tháng chung chung. Mỗi tháng phải có tuần 1/2/3/4 hoặc checklist tuần rõ ràng để user tick tiến độ.

Hãy viết cụ thể theo ngành ${outputJobTitle}, vị trí "${intake.currentPosition || outputJobTitle}", điểm nghẽn "${intake.bottleneck || intake.mainWeakness || 'chưa rõ - cần AI chẩn đoán bằng tuần đo nền'}", kỹ năng mạnh "${intake.strongSkills || 'chưa cung cấp'}", bằng chứng đã có "${intake.proofAssets || 'chưa cung cấp'}", học vấn "${intake.educationLevel || 'chưa cung cấp'} - ${sanitizeEducationDetailForRole(roleText || outputJobTitle, intake.educationDetail) || 'chưa cung cấp'}" và mục tiêu "${intake.twoYearGoal || targetSalary}".`;

  const preferredPathForCanonicalRole = describePreferredPath(intake.preferredPath, `${outputJobTitle} ${intake.currentPosition || ''}`);
  const canonicalUserPrompt = buildCanonicalRoadmapUserPrompt({
    context: canonicalContext,
    baseUserPrompt: userPrompt,
    jobTitle,
    outputJobTitle,
    preferredPathForCanonicalRole,
  });

  try {
    const client = new OpenAI({
      baseURL: 'https://api.deepseek.com',
      apiKey,
    });
    const buildCandidate = (markdown: string): RoadmapData => ({
      format: 'expert_v2',
      version: 2,
      goal: `Lộ trình thực thi tăng lương cho ${intake.currentPosition || outputJobTitle}`,
      summary: `Checklist AI cá nhân hóa theo ngành ${outputJobTitle}, lương hiện tại ${(currentSalary / 1_000_000).toFixed(1)}M/tháng, điểm yếu "${intake.mainWeakness || 'cần chẩn đoán trong tuần đầu'}", học vấn "${intake.educationLevel || 'chưa cung cấp'}" và mục tiêu "${intake.twoYearGoal || `${(targetSalary / 1_000_000).toFixed(1)}M/tháng`}". Lộ trình này dựa trên dữ liệu bạn nhập và bộ quy tắc nghề nghiệp Top Lương, không phải tư vấn 1-1 bởi chuyên gia người thật.`,
      weeks: [],
      negotiation_timing: `Mốc ${negotiationWindow} là thời điểm đàm phán mạnh nhất nếu đã có đủ KPI, case study và bằng chứng thị trường.`,
      salary_projection: `Nếu hoàn thành 70-80% hành động trong roadmap, bạn có cơ sở đàm phán quanh mức ${(targetSalary / 1_000_000).toFixed(1)} triệu/tháng hoặc role tương đương. Không phải lời hứa về kết quả lương.`,
      custom_role_notice: isCustomRoadmapRole
        ? 'Custom role without benchmark-safe role_id; benchmark/percentile precision is limited, so this roadmap uses user description, transferable skills, measurable evidence and KPI.'
        : undefined,
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
              { role: 'user', content: repairMojibakeText(`${canonicalUserPrompt}${retryNote ? `\n\nNOTE VALIDATION: ${retryNote}` : ''}`) },
            ],
            max_tokens: 3800,
            temperature: retryNote ? 0.35 : 0.45,
          },
          { signal: controller.signal }
        );
        const markdown = repairRoadmapRoleLanguage(repairMojibakeText(completion.choices[0]?.message?.content?.trim() ?? ''));
        const candidate = repairRoadmapRoleLanguage(buildCandidate(markdown));
        const wrongItems: string[] = [];
        if (markdown.length < 700) wrongItems.push('Markdown quá ngắn hoặc rỗng');
        if (hasBlockedCustomerTerm(markdown)) wrongItems.push('Có thuật ngữ AI/provider không được hiện cho khách');
        if (hasWrongDomainLeak(roleText || outputJobTitle, markdown)) wrongItems.push('Markdown có leak sai domain');
        if (!/độ khớp học vấn với lương|độ khớp học vấn với lương/i.test(markdown)) wrongItems.push('Thiếu section độ khớp học vấn với lương');

        const roleGuard = validateGeneratedRoadmapRoleGuard({
          jobTitle: outputJobTitle,
          roleId: canonicalContext.canonicalRoleId || lockedRole.profile?.key || null,
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

        const qualityGate = validateRoadmapQualityGate({
          roadmap: candidate,
          jobTitle: outputJobTitle,
          roleId: canonicalContext.canonicalRoleId || lockedRole.profile?.key || null,
          roleProfile: lockedRole.profile,
          expectedDurationMonths: durationMonths,
        });
        if (!qualityGate.passed) {
          wrongItems.push(`ROADMAP_QUALITY_GATE_FAILED: ${qualityGate.reasons.join(', ')}`);
          console.error('ROADMAP_QUALITY_GATE_FAILED', {
            jobTitle: outputJobTitle,
            roleId: lockedRole.profile?.key,
            reasons: qualityGate.reasons,
            metrics: qualityGate.metrics,
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

    const retryNote = `Lần trước bị sai ở: ${first.validation.wrongItems.join('; ')}. Lần này phải fix, bám 100% nghề "${outputJobTitle}", viết tiếng Việt đầy đủ dấu và chỉ dùng bộ kỹ năng: ${roleSkillsForPrompt.join(' | ')}.`;
    const second = await callDeepSeekRoadmap(retryNote);
    if (second.validation.passed) return second.candidate;

    console.error('[roadmap-role-lock] generation failed after retry', {
      jobTitle,
      firstWrongItems: first.validation.wrongItems,
      secondWrongItems: second.validation.wrongItems,
    });
    throw new RoadmapRoleLockError();

  } catch (error) {
    const deterministic = buildValidatedDeterministicFallback({
      jobTitle: outputJobTitle,
      roleId: canonicalContext.canonicalRoleId || lockedRole.profile?.key || roleProfileOverride?.key || null,
      roleProfile: lockedRole.profile || roleProfileOverride || null,
      userInputs: { ...intake, durationMonths },
      context: 'generation-error',
    });
    if (deterministic) return deterministic.roadmap;
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

// POST — generate lộ trình sau khi thanh toán
export async function POST(req: NextRequest) {
  const upstashLimitError = await enforceUpstashRateLimit(req, { namespace: 'api:roadmap:generate', requests: 5 });
  if (upstashLimitError) return upstashLimitError;

  try {
    const limitError = rateLimit(req, 'roadmap-generate-post', 8);
    if (limitError) return limitError;

    const body = await readJsonBody(req);
    if (!body || typeof body !== 'object') {
      return roadmapJsonError('Payload không hợp lệ. Vui lòng thử lại.', 'INVALID_JSON', 400);
    }

    const {
      vspiId,
      accessCode,
      currentPosition,
      futureGoalText,
      currentJobTitle,
      currentRoleId,
      targetJobTitle,
      targetRoleId,
      targetSalary,
      targetSalaryAssessment,
      customTargetRole,
      mainWeakness,
      twoYearGoal,
      educationLevel,
      educationDetail,
      strongSkills,
      proofAssets,
      bottleneck,
      preferredPath,
      weeklyTime,
      experience,
      seniorityLevel,
    } = body as Record<string, unknown>;
    const cleanVspiId = typeof vspiId === 'string' ? vspiId.trim() : '';
    if (!cleanVspiId) return roadmapJsonError('Bạn cần mở khóa lộ trình 79K hoặc nhập đúng mã truy cập để tạo checklist.', 'MISSING_ACCESS', 400);
    if (!roadmapAccessCodeMatches(cleanVspiId, accessCode)) {
      return roadmapJsonError('Bạn cần mở khóa lộ trình 79K hoặc nhập đúng mã truy cập để tạo checklist.', 'MISSING_ACCESS', 401);
    }
    const intake: RoadmapIntake = {
      currentPosition: cleanIntakeValue(currentPosition),
      futureGoalText: cleanIntakeValue(futureGoalText),
      currentJobTitle: cleanIntakeValue(currentJobTitle),
      currentRoleId: cleanIntakeValue(currentRoleId),
      targetJobTitle: cleanIntakeValue(targetJobTitle),
      targetRoleId: cleanIntakeValue(targetRoleId),
      targetSalary: cleanIntakeSalary(targetSalary),
      targetSalaryAssessment: cleanIntakeValue(targetSalaryAssessment),
      customTargetRole: cleanIntakeBoolean(customTargetRole),
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

    // Verify đã paid
    const { data: roadmap, error } = await supabaseServer
      .from('roadmaps')
      .select('*')
      .eq('vspi_id', cleanVspiId)
      .eq('status', 'paid')
      .maybeSingle();

    if (error) throw error;
    if (!roadmap) return roadmapJsonError('Bạn cần mở khóa lộ trình 79K hoặc nhập đúng mã truy cập để tạo checklist.', 'MISSING_ACCESS', 404);

    const requiredRole = getRequiredRoadmapRoleProfile(roadmap.role_id, roadmap.job_title || '');
    if ('error' in requiredRole) return requiredRole.error;
    const roadmapRoleId = requiredRole.roleId;
    const roadmapRoleProfile = requiredRole.profile;
    const authoritativeJobTitle = roadmapRoleProfile?.title || roadmap.job_title;
    const sanitizedIntake = sanitizeRoadmapIntakeForJob(authoritativeJobTitle, intake);
    const requestedSeniority = normalizeRoadmapSeniorityLevel(seniorityLevel || roadmap.seniority_level || roadmapSeniorityFromExperience(experience));

    // Nếu đã có roadmap tốt rồi thì trả về luôn. Roadmap cũ bị lặp tuần sẽ được tạo lại.
    if (roadmap.roadmap_json) {
      const cleanExisting = repairRoadmapRoleLanguage(repairMojibakeDeep<RoadmapData>(roadmap.roadmap_json));
      if (!isLowQualityRoadmap(cleanExisting, authoritativeJobTitle, roadmap.duration_months, roadmapRoleId, roadmapRoleProfile) && intakeMatches(cleanExisting, sanitizedIntake)) {
        if (hasMojibakeText(roadmap.roadmap_json)) {
          await supabaseServer
            .from('roadmaps')
            .update({ roadmap_json: cleanExisting, task_progress: roadmap.task_progress || {} })
            .eq('vspi_id', cleanVspiId);
        }
        return NextResponse.json({ roadmap: cleanExisting, progress: roadmap.task_progress || {}, accessCode: issueRoadmapAccessCode(cleanVspiId) }, { headers: NO_CACHE_HEADERS });
      }
    }

    // Generate mới
    const pregeneratedRaw = await loadApprovedPregeneratedRoadmap({
      roleId: roadmapRoleId,
      seniorityLevel: requestedSeniority,
      intake: sanitizedIntake,
    });
    if (!pregeneratedRaw) return pregeneratedNotReadyResponse();
    const pregenerated = ensureRoadmapActionPlan({
      roadmap: pregeneratedRaw,
      jobTitle: authoritativeJobTitle,
      roleProfile: roadmapRoleProfile,
      currentSalary: roadmap.current_salary,
      targetSalary: roadmap.target_salary,
      durationMonths: roadmap.duration_months,
      intake: sanitizedIntake,
    });

    // Lưu vào DB
    const updateResult = await supabaseServer
      .from('roadmaps')
      .update({ roadmap_json: pregenerated, task_progress: {}, seniority_level: requestedSeniority })
      .eq('vspi_id', cleanVspiId);
    if (updateResult.error) throw updateResult.error;

    return NextResponse.json({ roadmap: pregenerated, progress: {}, accessCode: issueRoadmapAccessCode(cleanVspiId) }, { headers: NO_CACHE_HEADERS });

  } catch (err: unknown) {
    console.error('[roadmap/generate]', err instanceof Error ? err.message : err);
    if (err instanceof RoadmapRoleLockError) {
      return roadmapJsonError(err.message, 'ROADMAP_ROLE_GUARD_FAILED', 503);
    }
    return roadmapJsonError('Không tạo được lộ trình lúc này. Vui lòng thử lại sau 1 phút.', 'ROADMAP_GENERATION_FAILED', 503);
  }
}

// GET — lấy roadmap + progress (by vspiId hoặc phone)
export async function GET(req: NextRequest) {
  const upstashLimitError = await enforceUpstashRateLimit(req, { namespace: 'api:roadmap:generate', requests: 5 });
  if (upstashLimitError) return upstashLimitError;

  const limitError = rateLimit(req, 'roadmap-generate-get', 20);
  if (limitError) return limitError;

  const { searchParams } = new URL(req.url);
  const vspiId = searchParams.get('id');
  const phone  = searchParams.get('phone');
  const accessCode = searchParams.get('accessCode') || searchParams.get('code');

  // Lookup bằng SĐT + mã truy cập — trả về roadmap paid mới nhất
  if (phone && !vspiId) {
    if (!accessCode) return roadmapJsonError('Bạn cần mở khóa lộ trình 79K hoặc nhập đúng mã truy cập để tạo checklist.', 'MISSING_ACCESS', 401);
    const clean = phone.replace(/\D/g, '');
    const { data: rows, error } = await supabaseServer
      .from('roadmaps')
      .select('vspi_id, roadmap_json, task_progress, status, goal_label, job_title, role_id, seniority_level, current_salary, target_salary, duration_months, paid_at, created_at')
      .eq('phone', clean)
      .eq('status', 'paid')
      .order('paid_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(10);

    const matched = rows?.find(row => roadmapAccessCodeMatches(row.vspi_id, accessCode));
    if (error || !matched) return roadmapJsonError('Không tìm thấy lộ trình hoặc mã truy cập chưa đúng.', 'MISSING_ACCESS', 404);
    const data = matched;
    const cleanRoadmapJson = data.roadmap_json ? repairRoadmapRoleLanguage(repairMojibakeDeep<RoadmapData>(data.roadmap_json)) : data.roadmap_json;
    const phoneRole = getRequiredRoadmapRoleProfile(data.role_id, data.job_title || '');
    if ('error' in phoneRole) return phoneRole.error;
    const phoneRoleId = phoneRole.roleId;
    const phoneRoleProfile = phoneRole.profile;
    const phoneJobTitle = phoneRoleProfile?.title || data.job_title;
    if (cleanRoadmapJson && hasFallbackLoopCopy(cleanRoadmapJson)) {
      const pregenerated = await loadApprovedPregeneratedRoadmap({
        roleId: phoneRoleId,
        seniorityLevel: data.seniority_level,
        intake: sanitizeRoadmapIntakeForJob(phoneJobTitle, getSavedIntake(cleanRoadmapJson)),
      });
      if (pregenerated) {
        const hydratedPregenerated = ensureRoadmapActionPlan({
          roadmap: pregenerated,
          jobTitle: phoneJobTitle,
          roleProfile: phoneRoleProfile,
          currentSalary: data.current_salary,
          targetSalary: data.target_salary,
          durationMonths: data.duration_months,
          intake: getSavedIntake(cleanRoadmapJson),
        });
        await supabaseServer
          .from('roadmaps')
          .update({ roadmap_json: hydratedPregenerated, task_progress: {} })
          .eq('vspi_id', data.vspi_id);
        console.info('[roadmap/restore]', {
          mode: 'lookup_access',
          status: 'generated_from_pregenerated_loop_copy',
          vspiId: data.vspi_id,
        });
        return NextResponse.json({
          ...data,
          status: 'generated',
          roadmap_json: hydratedPregenerated,
          task_progress: {},
          accessCode: issueRoadmapAccessCode(data.vspi_id),
        }, { headers: NO_CACHE_HEADERS });
      }
      console.info('[roadmap/restore]', { mode: 'lookup_access', status: 'pregenerated_not_ready_loop_copy', vspiId: data.vspi_id });
      return NextResponse.json({ ...data, status: 'paid', roadmap_json: null, message: ROADMAP_NOT_READY_MESSAGE, accessCode: issueRoadmapAccessCode(data.vspi_id) }, { headers: NO_CACHE_HEADERS });
    }
    if (cleanRoadmapJson) {
      const hydratedRoadmapJson = ensureRoadmapActionPlan({
        roadmap: cleanRoadmapJson,
        jobTitle: phoneJobTitle,
        roleProfile: phoneRoleProfile,
        currentSalary: data.current_salary,
        targetSalary: data.target_salary,
        durationMonths: data.duration_months,
        intake: getSavedIntake(cleanRoadmapJson),
      });
      if (!hasActionPlan(cleanRoadmapJson) && hasActionPlan(hydratedRoadmapJson)) {
        await supabaseServer
          .from('roadmaps')
          .update({ roadmap_json: hydratedRoadmapJson, task_progress: data.task_progress || {} })
          .eq('vspi_id', data.vspi_id);
      }
      console.info('[roadmap/restore]', {
        mode: 'lookup_access',
        status: 'generated',
        vspiId: data.vspi_id,
        hasProgress: Boolean(data.task_progress && Object.keys(data.task_progress as Record<string, unknown>).length),
      });
      return NextResponse.json({
        ...data,
        status: 'generated',
        roadmap_json: hydratedRoadmapJson,
        task_progress: data.task_progress || {},
        accessCode: issueRoadmapAccessCode(data.vspi_id),
      }, { headers: NO_CACHE_HEADERS });
    }
    if (cleanRoadmapJson && hasMojibakeText(data.roadmap_json)) {
      await supabaseServer
        .from('roadmaps')
        .update({ roadmap_json: cleanRoadmapJson })
        .eq('vspi_id', data.vspi_id);
    }
    const pregenerated = await loadApprovedPregeneratedRoadmap({
      roleId: phoneRoleId,
      seniorityLevel: data.seniority_level,
      intake: {},
    });
    if (pregenerated) {
      const hydratedPregenerated = ensureRoadmapActionPlan({
        roadmap: pregenerated,
        jobTitle: phoneJobTitle,
        roleProfile: phoneRoleProfile,
        currentSalary: data.current_salary,
        targetSalary: data.target_salary,
        durationMonths: data.duration_months,
        intake: {},
      });
      await supabaseServer
        .from('roadmaps')
        .update({ roadmap_json: hydratedPregenerated, task_progress: data.task_progress || {} })
        .eq('vspi_id', data.vspi_id);
      console.info('[roadmap/restore]', { mode: 'lookup_access', status: 'generated_from_pregenerated', vspiId: data.vspi_id });
      return NextResponse.json({ ...data, status: 'generated', roadmap_json: hydratedPregenerated, task_progress: data.task_progress || {}, accessCode: issueRoadmapAccessCode(data.vspi_id) }, { headers: NO_CACHE_HEADERS });
    }
    console.info('[roadmap/restore]', { mode: 'lookup_access', status: 'pregenerated_not_ready', vspiId: data.vspi_id });
    return NextResponse.json({ ...data, status: 'paid', roadmap_json: null, message: ROADMAP_NOT_READY_MESSAGE, accessCode: issueRoadmapAccessCode(data.vspi_id) }, { headers: NO_CACHE_HEADERS });
  }

  if (!vspiId) return roadmapJsonError('Bạn cần mở khóa lộ trình 79K hoặc nhập đúng mã truy cập để tạo checklist.', 'MISSING_ACCESS', 400);
  if (!roadmapAccessCodeMatches(vspiId, accessCode)) {
    return roadmapJsonError('Bạn cần mở khóa lộ trình 79K hoặc nhập đúng mã truy cập để tạo checklist.', 'MISSING_ACCESS', 401);
  }

  const { data, error } = await supabaseServer
    .from('roadmaps')
    .select('vspi_id, roadmap_json, task_progress, status, goal_label, job_title, role_id, seniority_level, current_salary, target_salary, duration_months')
    .eq('vspi_id', vspiId)
    .maybeSingle();

  if (error || !data) return roadmapJsonError('Không tìm thấy lộ trình hoặc mã truy cập chưa đúng.', 'MISSING_ACCESS', 404);
  const restorePaymentStatus = String(data.status || '').toLowerCase();
  if (!['paid', 'generated', 'ready'].includes(restorePaymentStatus)) {
    console.info('[roadmap/restore]', { mode: 'vspi_access', status: restorePaymentStatus || 'pending', vspiId: data.vspi_id });
    return NextResponse.json({
      ...data,
      status: restorePaymentStatus || 'pending',
      code: 'PAYMENT_PENDING',
      error: 'Thanh toán 79K chưa được xác nhận. Vui lòng chuyển khoản đúng nội dung và kiểm tra lại sau.',
      roadmap_json: null,
      task_progress: {},
      accessCode: issueRoadmapAccessCode(data.vspi_id),
    }, { headers: NO_CACHE_HEADERS });
  }
  const restoreRole = getRequiredRoadmapRoleProfile(data.role_id, data.job_title || '');
  if ('error' in restoreRole) return restoreRole.error;
  const restoreRoleId = restoreRole.roleId;
  const restoreRoleProfile = restoreRole.profile;
  if (!restoreRoleId) {
    console.warn('ROADMAP_LEGACY_JOB_TITLE_RESOLUTION', { vspiId, jobTitle: data.job_title });
  }
  const restoreJobTitle = restoreRoleProfile?.title || data.job_title;
  const cleanRoadmapJson = data.roadmap_json ? repairRoadmapRoleLanguage(repairMojibakeDeep<RoadmapData>(data.roadmap_json)) : data.roadmap_json;
  if (cleanRoadmapJson && hasFallbackLoopCopy(cleanRoadmapJson)) {
    const pregenerated = await loadApprovedPregeneratedRoadmap({
      roleId: restoreRoleId,
      seniorityLevel: data.seniority_level,
      intake: sanitizeRoadmapIntakeForJob(restoreJobTitle, getSavedIntake(cleanRoadmapJson)),
    });
    if (pregenerated) {
      const hydratedPregenerated = ensureRoadmapActionPlan({
        roadmap: pregenerated,
        jobTitle: restoreJobTitle,
        roleProfile: restoreRoleProfile,
        currentSalary: data.current_salary,
        targetSalary: data.target_salary,
        durationMonths: data.duration_months,
        intake: getSavedIntake(cleanRoadmapJson),
      });
      await supabaseServer
        .from('roadmaps')
        .update({ roadmap_json: hydratedPregenerated, task_progress: {} })
        .eq('vspi_id', data.vspi_id);
      console.info('[roadmap/restore]', {
        mode: 'vspi_access',
        status: 'generated_from_pregenerated_loop_copy',
        vspiId: data.vspi_id,
      });
      return NextResponse.json({
        ...data,
        status: 'generated',
        roadmap_json: hydratedPregenerated,
        task_progress: {},
        accessCode: issueRoadmapAccessCode(data.vspi_id),
      }, { headers: NO_CACHE_HEADERS });
    }
    console.info('[roadmap/restore]', { mode: 'vspi_access', status: 'pregenerated_not_ready_loop_copy', vspiId: data.vspi_id });
    return NextResponse.json({ ...data, status: 'paid', roadmap_json: null, message: ROADMAP_NOT_READY_MESSAGE, accessCode: issueRoadmapAccessCode(data.vspi_id) }, { headers: NO_CACHE_HEADERS });
  }
  if (cleanRoadmapJson) {
    const hydratedRoadmapJson = ensureRoadmapActionPlan({
      roadmap: cleanRoadmapJson,
      jobTitle: restoreJobTitle,
      roleProfile: restoreRoleProfile,
      currentSalary: data.current_salary,
      targetSalary: data.target_salary,
      durationMonths: data.duration_months,
      intake: getSavedIntake(cleanRoadmapJson),
    });
    if (!hasActionPlan(cleanRoadmapJson) && hasActionPlan(hydratedRoadmapJson)) {
      await supabaseServer
        .from('roadmaps')
        .update({ roadmap_json: hydratedRoadmapJson, task_progress: data.task_progress || {} })
        .eq('vspi_id', data.vspi_id);
    }
    console.info('[roadmap/restore]', {
      mode: 'vspi_access',
      status: 'generated',
      vspiId: data.vspi_id,
      hasProgress: Boolean(data.task_progress && Object.keys(data.task_progress as Record<string, unknown>).length),
    });
    return NextResponse.json({
      ...data,
      status: 'generated',
      roadmap_json: hydratedRoadmapJson,
      task_progress: data.task_progress || {},
      accessCode: issueRoadmapAccessCode(data.vspi_id),
    }, { headers: NO_CACHE_HEADERS });
  }
  if (cleanRoadmapJson && isLowQualityRoadmap(cleanRoadmapJson, restoreJobTitle, data.duration_months, restoreRoleId, restoreRoleProfile)) {
    const savedIntake = sanitizeRoadmapIntakeForJob(restoreJobTitle, getSavedIntake(cleanRoadmapJson));
    const pregenerated = await loadApprovedPregeneratedRoadmap({
      roleId: restoreRoleId,
      seniorityLevel: data.seniority_level,
      intake: savedIntake,
    });
    if (!pregenerated) return pregeneratedNotReadyResponse();
    const hydratedPregenerated = ensureRoadmapActionPlan({
      roadmap: pregenerated,
      jobTitle: restoreJobTitle,
      roleProfile: restoreRoleProfile,
      currentSalary: data.current_salary,
      targetSalary: data.target_salary,
      durationMonths: data.duration_months,
      intake: savedIntake,
    });
    await supabaseServer
      .from('roadmaps')
      .update({ roadmap_json: hydratedPregenerated, task_progress: {} })
      .eq('vspi_id', data.vspi_id);
    return NextResponse.json({ ...data, roadmap_json: hydratedPregenerated, task_progress: {}, accessCode: issueRoadmapAccessCode(data.vspi_id) }, { headers: NO_CACHE_HEADERS });
  }
  const pregenerated = await loadApprovedPregeneratedRoadmap({
    roleId: restoreRoleId,
    seniorityLevel: data.seniority_level,
    intake: {},
  });
  if (pregenerated) {
    const hydratedPregenerated = ensureRoadmapActionPlan({
      roadmap: pregenerated,
      jobTitle: restoreJobTitle,
      roleProfile: restoreRoleProfile,
      currentSalary: data.current_salary,
      targetSalary: data.target_salary,
      durationMonths: data.duration_months,
      intake: {},
    });
    await supabaseServer
      .from('roadmaps')
      .update({ roadmap_json: hydratedPregenerated, task_progress: data.task_progress || {} })
      .eq('vspi_id', data.vspi_id);
    console.info('[roadmap/restore]', { mode: 'vspi_access', status: 'generated_from_pregenerated', vspiId: data.vspi_id });
    return NextResponse.json({ ...data, status: 'generated', roadmap_json: hydratedPregenerated, task_progress: data.task_progress || {}, accessCode: issueRoadmapAccessCode(data.vspi_id) }, { headers: NO_CACHE_HEADERS });
  }
  console.info('[roadmap/restore]', { mode: 'vspi_access', status: 'pregenerated_not_ready', vspiId: data.vspi_id });
  return NextResponse.json({ ...data, status: 'paid', roadmap_json: null, message: ROADMAP_NOT_READY_MESSAGE, accessCode: issueRoadmapAccessCode(data.vspi_id) }, { headers: NO_CACHE_HEADERS });
}
