"use client";

import { useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { getCareerCompassContext } from '@/lib/careerCompassEngine';
import { detectRoleSegment, getSimulatorSkillsForRole, type SimulatorSkillBase } from '@/lib/roleTaxonomy';
import { getAttributionPayload } from '@/lib/attribution';
import { trackFunnelEvent } from '@/lib/analytics';
import { playSuccess, playTap, startThinkingPulse, stopThinkingPulse, vibrate } from '@/lib/sound';
import { repairMojibakeDeep, repairMojibakeText } from '@/lib/mojibake';
import {
  cleanRoadmapAccessCode,
  detectRoadmapIntentPhrase,
  getRoadmapAccessCode,
  ROADMAP_INTENT_CONTEXT,
  type RoadmapIntent,
} from '@/lib/roadmapAccess';
import { inferRoleLevelBand, isExecutiveLevel } from '@/lib/roleSeniority';
import { computeAlignedRoadmapTarget } from '@/lib/salaryTargetConsistency';
import { findClosestRoleProfiles, getRoleProfileById, resolveRoadmapRoleFromJobTitle } from '@/lib/roleProfiles';
import {
  driverDeliveryAchievements,
  driverDeliverySkillBank,
  dentalAssistantSkillBank,
  dentalSkillBank,
  hasFactorySkillLeakForRoadmapRole,
  hasGenericSkillLeakForDentalRole,
  hasJuniorMarketingSkillLeakForManagerRole,
  hasKitchenSkillLeakForRestaurantNonChefRole,
  hasManagerSkillLeakForFrontlineServiceRole,
  isDentalAssistantRoadmapRole,
  isDentalRoadmapRole,
  hotelFrontlineSkillBank,
  hotelManagerSkillBank,
  isDriverDeliveryRoadmapRole,
  isHotelFrontlineRoadmapRole,
  isHotelManagerRoadmapRole,
  isMarketingManagerRoadmapRole,
  isRestaurantFrontlineRoadmapRole,
  isRestaurantManagerRoadmapRole,
  marketingManagerSkillBank,
  normalizeRoadmapText,
  restaurantFrontlineSkillBank,
  restaurantManagerSkillBank,
} from '@/lib/roadmapPresentation';

const CERT_EXPORT_WIDTH = 1080;
const CERT_EXPORT_HEIGHT = 1350;

function calcTargetSalary(currentSalary: number, job: string, months: number, compassTargetSalary = 0, compassTargetLabel = '') {
  const ctx = getCareerCompassContext(job, currentSalary, 50);
  const normalizedJob = job
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase();
  const isLanguageCenterManager = /quan ly.*trung tam.*(ngoai ngu|tieng anh)|giam doc.*trung tam.*(ngoai ngu|tieng anh)|pho giam doc.*trung tam.*(ngoai ngu|tieng anh)|center manager.*(english|language)|language center manager|english center manager/.test(normalizedJob);
  const isEnglishTeacher = !isLanguageCenterManager && /giao vien tieng anh|english teacher|ielts teacher|toeic teacher|cambridge teacher|ielts|toeic|cambridge|tesol|celta|ngon ngu anh/.test(normalizedJob);
  // Floor = max(multiplier, absolute increase). nextBandMin acts as upward lift for 12-month only.
  const floors: Record<number, { mult: number; abs: number }> = {
    3:  { mult: 1.12, abs: 1_500_000 },
    6:  { mult: 1.25, abs: 3_000_000 },
    9:  { mult: 1.32, abs: 4_000_000 },
    12: { mult: 1.40, abs: 5_000_000 },
  };
  const f = floors[months] ?? floors[6];
  let target = Math.max(currentSalary * f.mult, currentSalary + f.abs);
  const englishTeacherFloors: Record<number, number> = {
    3: 18_000_000,
    6: 22_000_000,
    9: 25_000_000,
    12: 30_000_000,
  };
  if (isEnglishTeacher) {
    target = Math.max(target, englishTeacherFloors[months] ?? englishTeacherFloors[6]);
  }

  // 12-month: if user's next career band sits higher, lift toward it (capped at +15%).
  if (months === 12 && ctx.nextBandMin > target) {
    const lift = Math.min(ctx.nextBandMin - target, target * 0.15);
    target += lift;
  }

  // Sanity cap: most roles stay within 2x; English-teacher credential tracks need a higher ceiling
  // because IELTS/CELTA/TESOL can legitimately move a teacher out of a 5-8M assistant band.
  const rawCompassTarget = Number.isFinite(compassTargetSalary) ? compassTargetSalary : 0;
  const hasCompassTarget = rawCompassTarget > currentSalary + Math.max(1_000_000, currentSalary * 0.08);
  const compassTarget = hasCompassTarget ? rawCompassTarget : 0;

  if (hasCompassTarget) {
    target = computeAlignedRoadmapTarget({
      currentSalary,
      strategicTargetSalary: compassTarget,
      fallbackTargetSalary: target,
      durationMonths: months,
    }).targetSalary;
  } else {
    target = Math.min(target, isEnglishTeacher ? Math.max(currentSalary * 3.5, target) : currentSalary * 2);
  }
  target = Math.round(target / 500_000) * 500_000;

  const inc = target - currentSalary;
  const pct = Math.round((inc / currentSalary) * 100);
  const compassGap = Math.max(0, compassTarget - currentSalary);
  const progressPct = hasCompassTarget && compassGap > 0 ? Math.min(100, Math.round(((target - currentSalary) / compassGap) * 100)) : null;
  const compassRationale = hasCompassTarget
    ? `${months} tháng là mốc ${progressPct}% đường tới ${compassTargetLabel || 'đích La Bàn'} ${(compassTarget / 1_000_000).toFixed(1)} triệu/tháng. Đây là mốc cần tạo bằng chứng, không phải lời hứa tăng lương tự động.`
    : '';
  return {
    target,
    compassTarget,
    compassTargetLabel: compassTargetLabel || 'đích La Bàn',
    progressPct,
    compassRationale,
    label: `+${(inc / 1_000_000).toFixed(1)} triệu/tháng (+${pct}%)`,
    rationale: months === 3
      ? `Mục tiêu +${pct}% trong 3 tháng — có cơ sở để yêu cầu nếu hoàn thành việc thực thi và có thành tích đo được`
      : months === 6
      ? `Mục tiêu +${pct}% trong 6 tháng — đủ thời gian nâng kỹ năng, chứng minh giá trị và đàm phán`
      : months === 9
      ? `Mục tiêu +${pct}% trong 9 tháng — đủ dài để thử hướng mới, tạo bằng chứng và đi vòng apply/review đầu tiên`
      : `Mục tiêu +${pct}% trong 1 năm — lộ trình bền vững qua thăng tiến nội bộ hoặc đổi vai trò`,
  };
}

interface RoadmapBenchmarkRow {
  label: string;
  salary: number | null;
  locked?: boolean;
  active?: boolean;
}

interface RoadmapTargetBenchmark {
  percent: number;
  label: string;
  currentLabel: string;
  targetLabel: string;
  confidenceLabel?: string;
  matchedJobTitle?: string;
  thresholdPreview: RoadmapBenchmarkRow[];
}

const normalizeTopPercent = (value: unknown) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(1, Math.min(100, Math.round(n)));
};

const formatTopPercentLabel = (percent: number | null | undefined) => {
  const rounded = normalizeTopPercent(percent);
  if (!rounded) return '';
  if (rounded >= 100) return 'Dưới Top 80%';
  if (rounded <= 1) return 'Top 1%';
  return `Top ${rounded}%`;
};

function isSameTopBucket(currentLabel?: string, targetLabel?: string) {
  return Boolean(currentLabel && targetLabel && currentLabel === targetLabel);
}

const getCompassLabelForSalary = (salary: number, rows: RoadmapBenchmarkRow[]) => {
  const visibleRows = rows
    .filter(row => Number(row.salary) > 0)
    .sort((a, b) => Number(a.salary) - Number(b.salary));
  if (!visibleRows.length) return '';
  let label = `Dưới ${visibleRows[0].label}`;
  for (const row of visibleRows) {
    if (salary >= Number(row.salary)) label = row.label;
  }
  return label;
};

const getBenchmarkDisplayLabel = (percent: number, salary: number, rows: RoadmapBenchmarkRow[]) => {
  const salaryLabel = getCompassLabelForSalary(salary, rows);
  if (salaryLabel) return salaryLabel;
  const rounded = normalizeTopPercent(percent);
  if (rounded >= 100) return 'Dưới Top 80%';
  return formatTopPercentLabel(rounded);
};

interface WeekPlan { week: number; focus: string; tasks: string[]; milestone: string; }
interface RoadmapData {
  format?: 'weekly' | 'markdown' | 'expert_v2';
  version?: number;
  goal: string;
  summary: string;
  weeks: WeekPlan[];
  negotiation_timing: string;
  salary_projection: string;
  markdown?: string;
  intake?: RoadmapIntake;
  actionPlan?: RoadmapActionPlan;
}

const cleanRoadmapData = (value: RoadmapData | null | undefined) =>
  value ? repairMojibakeDeep<RoadmapData>(value) : value;

const cleanMoneyInput = (value: string) => value.replace(/\D/g, '').slice(0, 12);
const formatMoneyInput = (value: string) => {
  const digits = cleanMoneyInput(value);
  return digits ? Number(digits).toLocaleString('en-US') : '';
};
const formatDurationLabel = (months: number) => months === 12 ? '1 năm' : `${months} tháng`;
const formatSalaryShort = (value: number) => `${(Math.max(0, value) / 1_000_000).toFixed(1)}M`;
const humanizeWorkCopy = (value: string) =>
  repairMojibakeText(value)
    .replace(/\bKham chan doan va treatment plan\b/gi, 'Khám chẩn đoán và treatment plan')
    .replace(/\bHo so benh an nha khoa an danh\b/gi, 'Hồ sơ bệnh án nha khoa ẩn danh')
    .replace(/\bVo khuan va an toan thu thuat\b/gi, 'Vô khuẩn và an toàn thủ thuật')
    .replace(/\bTu van ca dieu tri cho benh nhan\b/gi, 'Tư vấn ca điều trị cho bệnh nhân')
    .replace(/\bX-quang\/CBCT va photo intraoral\b/gi, 'X-quang/CBCT và photo intraoral')
    .replace(/\bTheo doi dau, bien chung va tai kham\b/gi, 'Theo dõi đau, biến chứng và tái khám')
    .replace(/\bFeedback benh nhan va bac si phu trach\b/gi, 'Feedback bệnh nhân và bác sĩ phụ trách')
    .replace(/Lộ trình thăng tiến Độc Bản/gi, 'Bản giải thích: vì sao các việc này giúp tăng lương')
    .replace(/lộ trình thăng tiến độc bản/gi, 'bản giải thích vì sao các việc này giúp tăng lương')
    .replace(/\bTasks\b/g, 'Việc')
    .replace(/\btasks\b/g, 'việc')
    .replace(/\bTask\b/g, 'Việc')
    .replace(/\btask\b/g, 'việc')
    .replace(/\bdeliverable\b/gi, 'sản phẩm/bằng chứng')
    .replace(/\bartifact\b/gi, 'bằng chứng')
    .replace(/\bOutput\b/g, 'Bằng chứng')
    .replace(/\boutput\b/g, 'bằng chứng')
    .replace(/\bSkill\b/g, 'Kỹ năng')
    .replace(/\bskill\b/g, 'kỹ năng')
    .replace(/Game đời thật/gi, 'Lộ trình thăng tiến')
    .replace(/\bquest\b/gi, 'chặng thực thi')
    .replace(/\bXP\b/g, 'Điểm tiến độ')
    .replace(/Max Level/gi, 'hồ sơ hoàn chỉnh')
    .replace(/\bLevel\b/g, 'Giai đoạn')
    .replace(/Tăng level tháng\s*(\d+)/gi, 'Hoàn thiện bằng chứng tháng $1')
    .replace(/Nâng skill tạo chênh lệch/gi, 'Làm một việc có số trước-sau')
    .replace(/Nền móng bằng chứng/gi, 'Chốt mốc lương và bằng chứng cần có')
    .replace(/Đóng gói case tăng lương/gi, 'Đóng gói case để xin feedback')
    .replace(/\s*\/\s*/g, ' / ')
    .replace(/\s{2,}/g, ' ');
const normalizeSurveyText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const isLowInfoSurveyValue = (value: string) => {
  const normalized = normalizeSurveyText(value);
  if (!normalized) return true;
  return /^(khong biet|chua biet|khong ro|chua ro|khong chac|chua chac|khong co|chua co|none|null|na|n a)$/i.test(normalized) ||
    normalized.includes('khong biet nen') ||
    normalized.includes('khong biet minh') ||
    normalized.includes('chua biet nen');
};

interface PreferredPathOption {
  value: string;
  label: string;
  hint: string;
}

const isChefRoadmapRole = (value: string) => {
  const normalized = normalizeSurveyText(value);
  if (isRestaurantManagerRoadmapRole(normalized) || isRestaurantFrontlineRoadmapRole(normalized)) return false;
  return /dau bep|chef|bep truong|bep pho|sous chef|cook|phu bep|barista|bartender|pha che|kitchen/.test(normalized);
};

const isAviationRoadmapRole = (value: string) => {
  const normalized = normalizeSurveyText(value);
  return /tiep vien hang khong|cabin crew|flight attendant|stewardess|steward|hang khong|airline|hang bay/.test(normalized);
};

const isMcRoadmapRole = (value: string) => {
  const normalized = normalizeSurveyText(value);
  return /\bmc\b|nguoi dan|dan chuong trinh|host|su kien|event host|livestream host|presenter|moderator|wedding mc/.test(normalized);
};

const isHumanResourcesRoadmapRole = (value: string) => {
  const normalized = normalizeSurveyText(value);
  return /nhan su|human resources|\bhr\b|recruit|tuyen dung|talent acquisition|\bta\b|c b|compensation|benefit|l d|learning|dao tao|hrbp|people operations|people ops|hr ops/.test(normalized);
};

const isCareerPivotRoadmapRole = (value: string) => {
  const normalized = normalizeSurveyText(value);
  return /doi huong|chuyen huong|pivot|muon doi huong|muon chuyen/.test(normalized);
};

function getPreferredPathOptions(job: string, currentPosition = ''): PreferredPathOption[] {
  const roleText = `${job} ${currentPosition}`;
  const levelBand = inferRoleLevelBand({ jobTitle: roleText });

  if (isExecutiveLevel(levelBand)) {
    return [
      { value: 'deal_internal', label: 'Tăng scope / mandate hiện tại', hint: 'Đóng gói P&L/revenue impact, operating authority, decision log và board/owner update.' },
      { value: 'jump_job', label: 'Sang tổ chức quy mô lớn hơn', hint: 'Nhắm scope doanh thu, team, ngân sách, thị trường hoặc business unit lớn hơn.' },
      { value: 'leadership', label: 'Đàm phán bonus/equity/profit-sharing', hint: 'Neo compensation package theo mandate, strategic outcome và upside thật.' },
      { value: 'expert', label: 'Board/advisory/fractional mandate', hint: 'Đóng gói track record để nhận retainer, advisory, board hoặc fractional scope.' },
    ];
  }

  if (isChefRoadmapRole(roleText)) {
    return [
      { value: 'deal_internal', label: 'Tăng lương tại bếp', hint: 'Dùng food cost, waste, tốc độ ra món và feedback để xin review.' },
      { value: 'jump_job', label: 'Đổi sang bếp trả cao hơn', hint: 'Nhắm chuỗi, khách sạn, catering hoặc bếp trung tâm có KPI rõ.' },
      { value: 'leadership', label: 'Quản lý bếp/nhà hàng', hint: 'Lên Ca trưởng, Sous Chef, Bếp trưởng, Kitchen Manager hoặc quản lý vận hành nhà hàng.' },
      { value: 'expert', label: 'Menu/F&B chuyên sâu', hint: 'Đi sâu recipe, costing, SOP, training bếp hoặc tư vấn concept/menu.' },
    ];
  }

  if (isAviationRoadmapRole(roleText)) {
    return [
      { value: 'deal_internal', label: 'Xin review hãng hiện tại', hint: 'Dựa trên safety-service, feedback senior crew và route readiness.' },
      { value: 'jump_job', label: 'Chuyển hãng/tuyến tốt hơn', hint: 'Nhắm tuyến quốc tế, hãng trả tốt hơn hoặc role dịch vụ hàng không cao hơn.' },
      { value: 'leadership', label: 'Lên Purser/Cabin Lead', hint: 'Chứng minh briefing, debrief, hỗ trợ junior và xử lý escalation.' },
      { value: 'expert', label: 'Trainer/service expert', hint: 'Đóng gói kinh nghiệm thành checklist, training và chuẩn phục vụ.' },
    ];
  }

  if (isMcRoadmapRole(roleText)) {
    return [
      { value: 'deal_internal', label: 'Tăng fee khách quen', hint: 'Dùng showreel, feedback và rate card để nâng giá.' },
      { value: 'jump_job', label: 'Nhận format trả cao hơn', hint: 'Chuyển sang corporate, activation, livestream hoặc brand event.' },
      { value: 'leadership', label: 'Lead sự kiện/team MC', hint: 'Dẫn format lớn hơn, training MC mới hoặc phối hợp agency.' },
      { value: 'expert', label: 'Host chuyên sâu', hint: 'Đi sâu kịch bản, rehearsal, xử lý live và thương hiệu cá nhân.' },
    ];
  }

  return [
    { value: 'deal_internal', label: 'Ở lại & tăng lương', hint: 'Dùng KPI, scope và bằng chứng để xin review ở nơi hiện tại.' },
    { value: 'jump_job', label: 'Đổi sang role trả cao hơn', hint: 'Tìm môi trường hoặc vị trí có dải lương, scope và KPI tốt hơn.' },
    { value: 'leadership', label: 'Lên quản lý/lead', hint: 'Chứng minh quản người, quản scope, chịu KPI hoặc owner một mảng.' },
    { value: 'expert', label: 'Đi sâu chuyên môn', hint: 'Đào sâu năng lực hiếm, chứng chỉ, case study và portfolio nghề.' },
  ];
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
interface RoadmapEvidence {
  note?: string;
  fileName?: string;
  submittedAt?: string;
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
  checkpoint: string;
  tasks: RoadmapActionTask[];
}
interface RoadmapActionTask {
  title: string;
  skill: string;
  output: string;
  kpi: string;
  doneDefinition: string;
}
interface RoadmapProfile extends RoadmapIntake {
  vspiId: string;
  accessCode?: string;
  fullName?: string;
  phone: string;
  job: string;
  roadmapIntent?: RoadmapIntent;
  currentJobTitle?: string;
  selectedRoleId?: string;
  benchmarkMatchedRole?: string;
  salary: number;
  duration: number;
  percent?: number;
  experience?: string;
  marketLocation?: string;
  workProvince?: string;
  market_location?: string;
  work_province?: string;
  compassTargetSalary?: number;
  compassTargetLabel?: string;
  savedAt?: number;
  cacheVersion?: string;
}

interface RoleSuggestion {
  role_id: string;
  title: string;
  industry?: string | null;
}

// Bước: setup → qr → checking → intake → roadmap | restore (nhập SĐT để lấy lại)
type PageStep = 'setup' | 'restore' | 'qr' | 'checking' | 'intake' | 'roadmap';

const STORAGE_KEY = 'vspi-roadmap-v2';
const DRAFT_KEY = 'vspi-roadmap-draft-v1';
const PREMIUM_SESSION_KEY = 'vspi-premium-session';
const CLIENT_REPORT_CACHE_VERSION = '2026-06-role-guard-v3';
const SHARED_PHONE_KEY = 'vspi-shared-phone';
const SHARED_PHONE_EVENT = 'vspi-shared-phone-updated';
const SHARED_FULL_NAME_KEY = 'vspi-shared-full-name';
const SHARED_FULL_NAME_EVENT = 'vspi-shared-full-name-updated';
const EVIDENCE_STORAGE_PREFIX = 'vspi-roadmap-evidence-v1:';
const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SAFE_ROADMAP_GENERATION_ERROR = 'Không tạo được lộ trình lúc này. Vui lòng kiểm tra lại nghề/lương hoặc thử lại sau 1 phút.';
const ROLE_CONFIRMATION_ERROR = 'Nghề bạn nhập hơi dài hoặc chưa khớp chắc với dữ liệu. Vui lòng chọn nghề gần nhất trước khi tạo lộ trình.';
const ROLE_SELECTION_REQUIRED_ERROR = 'Chọn nghề cụ thể trước khi tạo lộ trình. Các mẫu định hướng như Mới tốt nghiệp, 3+ năm dậm chân hoặc Muốn đổi hướng không phải nghề để benchmark.';
const MISSING_ACCESS_ERROR = 'Bạn cần mở khóa lộ trình 79K hoặc nhập đúng mã truy cập để tạo checklist.';
const MISSING_ROLE_ERROR = 'Hệ thống chưa có bộ kỹ năng đủ chắc cho nghề này. Vui lòng chọn nghề gần nhất trong danh sách.';

const getRoadmapStorageKey = (id: string | null | undefined, accessCode?: string | null) => {
  const cleanId = String(id || '').trim();
  const cleanAccess = cleanRoadmapAccessCode(accessCode || '');
  return cleanId ? `${STORAGE_KEY}:${cleanId}${cleanAccess ? `:${cleanAccess}` : ''}` : STORAGE_KEY;
};

const hasCurrentClientCacheVersion = (payload: unknown) => {
  const data = payload && typeof payload === 'object' ? payload as { cacheVersion?: unknown } : null;
  return data?.cacheVersion === CLIENT_REPORT_CACHE_VERSION;
};

const safeRoadmapErrorMessage = (payload: { error?: unknown; code?: unknown } | null | undefined) => {
  const code = typeof payload?.code === 'string' ? payload.code : '';
  const rawError = typeof payload?.error === 'string' ? repairMojibakeText(payload.error) : '';
  if (code === 'ROLE_SELECTION_REQUIRED') return ROLE_SELECTION_REQUIRED_ERROR;
  if (code === 'ROLE_CONFIRMATION_REQUIRED') return ROLE_CONFIRMATION_ERROR;
  if (code === 'MISSING_ROLE_ID') return MISSING_ROLE_ERROR;
  if (code === 'MISSING_ACCESS') return MISSING_ACCESS_ERROR;
  if (code === 'INVALID_SALARY') return 'Nhập lương hiện tại hợp lệ trước khi tạo lộ trình.';
  if (code === 'ROADMAP_ROLE_GUARD_FAILED') return rawError || SAFE_ROADMAP_GENERATION_ERROR;
  if (code === 'ROADMAP_GENERATION_FAILED') return SAFE_ROADMAP_GENERATION_ERROR;
  if (!rawError || /internal error/i.test(rawError)) return SAFE_ROADMAP_GENERATION_ERROR;
  return rawError;
};

const cleanSharedPhone = (value: string) => value.replace(/\D/g, '').slice(0, 10);
const isValidSharedPhone = (value: string) => /^0[0-9]{9}$/.test(cleanSharedPhone(value));
const cleanSharedName = (value: string) => value.replace(/\s+/g, ' ').trim().slice(0, 80);
const readSharedPhone = () => {
  if (typeof window === 'undefined') return '';
  try {
    const phone = cleanSharedPhone(localStorage.getItem(SHARED_PHONE_KEY) || '');
    return isValidSharedPhone(phone) ? phone : '';
  } catch {
    return '';
  }
};
const readSharedName = () => {
  if (typeof window === 'undefined') return '';
  try {
    return cleanSharedName(localStorage.getItem(SHARED_FULL_NAME_KEY) || '');
  } catch {
    return '';
  }
};

const readPremiumRoadmapProfile = (): Partial<RoadmapProfile> => {
  if (typeof window === 'undefined') return {};
  try {
    const session = repairMojibakeDeep<Record<string, unknown>>(JSON.parse(localStorage.getItem(PREMIUM_SESSION_KEY) || '{}'));
    if (!hasCurrentClientCacheVersion(session)) {
      localStorage.removeItem(PREMIUM_SESSION_KEY);
      return {};
    }
    const savedAt = Number(session.savedAt || 0);
    if (!savedAt || Date.now() - savedAt > DRAFT_MAX_AGE_MS) return {};
    const job = typeof session.selectedJob === 'string' ? repairMojibakeText(session.selectedJob) : '';
    const salary = Number(session.salary || 0);
    if (!job && !salary) return {};
    return {
      fullName: typeof session.fullName === 'string' ? cleanSharedName(repairMojibakeText(session.fullName)) : readSharedName(),
      phone: readSharedPhone(),
      job,
      selectedRoleId: typeof session.selectedRoleId === 'string' ? session.selectedRoleId : undefined,
      salary: Number.isFinite(salary) && salary > 0 ? salary : undefined,
      duration: 6,
      percent: normalizeTopPercent(session.resultPercent),
      experience: typeof session.experience === 'string' ? session.experience : undefined,
      marketLocation: typeof session.marketLocation === 'string' ? session.marketLocation : undefined,
      workProvince: typeof session.workProvince === 'string' ? session.workProvince : undefined,
      compassTargetSalary: Number(session.compassTargetSalary || 0) || Number((session.benchmarkMeta as { strategicTargetSalary?: number } | undefined)?.strategicTargetSalary || 0) || undefined,
      compassTargetLabel: typeof session.compassTargetLabel === 'string'
        ? session.compassTargetLabel
        : typeof (session.benchmarkMeta as { strategicTargetLabel?: string } | undefined)?.strategicTargetLabel === 'string'
          ? (session.benchmarkMeta as { strategicTargetLabel?: string }).strategicTargetLabel
          : undefined,
      savedAt,
    };
  } catch {
    return {};
  }
};
const saveSharedPhone = (value: string) => {
  const phone = cleanSharedPhone(value);
  if (!isValidSharedPhone(phone) || typeof window === 'undefined') return phone;
  try {
    localStorage.setItem(SHARED_PHONE_KEY, phone);
    window.dispatchEvent(new CustomEvent(SHARED_PHONE_EVENT, { detail: phone }));
  } catch { /* ignore storage errors */ }
  return phone;
};
const saveSharedName = (value: string) => {
  const name = cleanSharedName(value);
  if (!name || typeof window === 'undefined') return name;
  try {
    localStorage.setItem(SHARED_FULL_NAME_KEY, name);
    window.dispatchEvent(new CustomEvent(SHARED_FULL_NAME_EVENT, { detail: name }));
  } catch { /* ignore storage errors */ }
  return name;
};

const isTaskKey = (key: string) => /^w\d{1,2}_t\d{1,2}$/.test(key);
const getEvidenceStorageKey = (vspiId: string) => `${EVIDENCE_STORAGE_PREFIX}${vspiId}`;
const extractEvidenceLog = (payload: unknown): Record<string, RoadmapEvidence> => {
  const raw = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const source = raw._evidence && typeof raw._evidence === 'object' && !Array.isArray(raw._evidence)
    ? raw._evidence as Record<string, unknown>
    : {};
  return Object.fromEntries(Object.entries(source).filter(([key, value]) => isTaskKey(key) && value && typeof value === 'object')) as Record<string, RoadmapEvidence>;
};
const extractProgressBooleans = (payload: unknown): Record<string, boolean> => {
  const raw = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  return Object.fromEntries(Object.entries(raw).filter(([key]) => isTaskKey(key)).map(([key, value]) => [key, Boolean(value)]));
};

const ROADMAP_PRESETS = [
  {
    id: 'fresh-graduate',
    title: 'Mới tốt nghiệp',
    note: 'Chưa rõ nên đi hướng nào: chọn role đầu đời, hồ sơ sản phẩm và kịch bản qua thử việc.',
    intent: 'new_graduate' as RoadmapIntent,
    context: 'Chưa rõ nghề phù hợp, cần chọn hướng đầu tiên',
    placeholder: 'Chọn nghề bạn muốn bắt đầu',
    duration: 6 as const,
  },
  {
    id: 'stuck-mid-career',
    title: '3+ năm dậm chân',
    note: 'Lương đứng yên dù đã làm lâu: tìm nút thắt, KPI và lộ trình lên band.',
    intent: 'stuck_3_years' as RoadmapIntent,
    context: 'Giữ nghề hiện tại, chọn đúng role để benchmark trước khi tạo lộ trình',
    placeholder: 'Chọn nghề hiện tại chính xác',
    duration: 6 as const,
  },
  {
    id: 'career-pivot',
    title: 'Muốn đổi hướng',
    note: 'Có kinh nghiệm nhưng không chắc nghề hiện tại còn đáng theo: chuyển kỹ năng sang role mới.',
    intent: 'career_switch' as RoadmapIntent,
    context: 'Bạn muốn chuyển sang hướng nào?',
    placeholder: 'Nhập nghề mục tiêu bạn muốn chuyển sang',
    duration: 6 as const,
  },
];

const EDUCATION_LEVELS = [
  '12/12',
  'Trung cấp / Cao đẳng',
  'Cử nhân',
  'Thạc sĩ / MBA',
  'Tiến sĩ',
  'Khác',
];

function renderInlineMarkdown(text: string): ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={index} className="font-black text-[#f0ede8]">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

function MarkdownRoadmap({ markdown }: { markdown: string }) {
  const lines = humanizeWorkCopy(markdown).split(/\r?\n/);
  return (
    <div className="space-y-3 break-words">
      {lines.map((raw, index) => {
        const line = raw.trim();
        if (!line) return <div key={index} className="h-1" />;
        if (line.startsWith('# ')) {
          return <h1 key={index} className="text-xl font-black leading-tight text-[#f0ede8] sm:text-2xl">{renderInlineMarkdown(line.slice(2))}</h1>;
        }
        if (line.startsWith('## ')) {
          return (
            <h2 key={index} className="mt-5 border-t border-white/10 pt-4 text-sm font-black uppercase tracking-[0.08em] text-[#e8b84b]">
              {renderInlineMarkdown(line.slice(3))}
            </h2>
          );
        }
        if (line.startsWith('### ')) {
          return (
            <h3 key={index} className="mt-4 rounded-xl border border-[#e8b84b]/20 bg-[#e8b84b]/8 px-3 py-2 text-sm font-black leading-tight text-[#f0ede8]">
              {renderInlineMarkdown(line.slice(4))}
            </h3>
          );
        }
        if (/^[-*]\s+/.test(line)) {
          return (
            <div key={index} className="flex gap-3 rounded-xl border border-white/6 bg-[#161b26] px-3 py-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-[#e8b84b]" />
              <p className="min-w-0 text-[12px] leading-relaxed text-[#f0ede8]/78">{renderInlineMarkdown(line.replace(/^[-*]\s+/, ''))}</p>
            </div>
          );
        }
        if (/^\d+\.\s+/.test(line)) {
          const number = line.match(/^\d+/)?.[0] || String(index + 1);
          return (
            <div key={index} className="flex gap-3 rounded-xl border border-white/6 bg-[#161b26] px-3 py-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#e8b84b]/15 text-[10px] font-black text-[#e8b84b]">{number}</span>
              <p className="min-w-0 text-[12px] leading-relaxed text-[#f0ede8]/78">{renderInlineMarkdown(line.replace(/^\d+\.\s+/, ''))}</p>
            </div>
          );
        }
        return <p key={index} className="text-[12px] leading-relaxed text-[#f0ede8]/70">{renderInlineMarkdown(line)}</p>;
      })}
    </div>
  );
}

function flattenActionTasks(plan?: RoadmapActionPlan) {
  if (!plan) return [];
  return plan.milestones.flatMap(milestone =>
    milestone.weeks.flatMap(week =>
      week.tasks.map((task, taskIndex) => ({
        key: `w${week.week}_t${taskIndex}`,
        milestone,
        week,
        task,
      }))
    )
  );
}

function RoadmapLevelCard({
  plan,
  done,
  total,
  pct,
}: {
  plan?: RoadmapActionPlan;
  done: number;
  total: number;
  pct: number;
}) {
  const level = total > 0 ? Math.min(5, Math.floor(pct / 20) + 1) : 1;
  const levelNames = ['Tân binh', 'Có nền', 'Có bằng chứng', 'Sẵn sàng deal', 'Ứng viên top'];
  const remaining = Math.max(0, total - done);
  const encouragement = pct >= 100
    ? 'Hồ sơ hoàn chỉnh rồi. Bây giờ không chỉ là học nữa, đây là bộ bằng chứng để nói chuyện lương hoặc tìm nơi trả đúng giá.'
    : pct >= 80
      ? `Gần đủ hồ sơ thăng tiến. Còn ${remaining} việc nữa là đủ bộ bằng chứng deal lương cực sắc.`
      : pct >= 50
        ? `Đã qua nửa đường. Tiếp tục đóng gói bằng chứng, đừng để kết quả nằm rải rác trong đầu.`
        : pct >= 20
          ? `Đang lên giai đoạn. Mỗi việc tick xong là thêm một mảnh bằng chứng để tăng xác suất deal.`
          : `Bắt đầu bằng việc dễ nhất hôm nay. Không cần hoàn hảo, chỉ cần có bằng chứng đầu tiên.`;
  return (
    <div className="rounded-2xl border border-[#e8b84b]/25 bg-[#0f1219] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-mono font-black uppercase tracking-normal text-[#e8b84b]">
            {humanizeWorkCopy(plan?.levelName || 'Cấp độ bằng chứng')}
          </p>
          <h2 className="mt-1 text-lg font-black leading-tight text-[#f0ede8]">
            Giai đoạn {level} - {levelNames[level - 1]}
          </h2>
        </div>
        <div className="shrink-0 rounded-xl border border-white/10 bg-[#161b26] px-3 py-2 text-center">
          <p className="text-[9px] uppercase text-[#f0ede8]/35">Điểm</p>
          <p className="text-sm font-black text-[#e8b84b]">{done * 50}</p>
        </div>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-[#161b26]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#e8b84b] via-green-300 to-green-400 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-white/8 bg-[#161b26] px-3 py-2">
          <p className="text-[9px] uppercase text-[#f0ede8]/35">Hoàn thành</p>
          <p className="text-xs font-black text-[#f0ede8]">{done}/{total} việc</p>
        </div>
        <div className="rounded-xl border border-white/8 bg-[#161b26] px-3 py-2">
          <p className="text-[9px] uppercase text-[#f0ede8]/35">Tiến độ</p>
          <p className="text-xs font-black text-green-300">{pct}%</p>
        </div>
      </div>
      {plan && (
        <p className="mt-3 text-[11px] leading-relaxed text-[#f0ede8]/55">
          Cam kết chuẩn {plan.standardWeeks} tuần, nhịp bận {plan.flexibleWeeks} tuần, mỗi tuần {plan.weeklyHours}. {humanizeWorkCopy(plan.completionRule)}
        </p>
      )}
      <p className="mt-3 rounded-xl border border-[#e8b84b]/20 bg-[#e8b84b]/8 px-3 py-2 text-[11px] font-bold leading-relaxed text-[#f0ede8]/75">
        {encouragement}
      </p>
    </div>
  );
}

function normalizeText(value: string) {
  return normalizeRoadmapText(value);
}

const staleHrRoadmapProfilePattern = /nhan su di lam|recruiting funnel|time-to-fill|offer acceptance|onboarding checklist|training feedback|c&b benchmark|hr dashboard|people dashboard|employee feedback|retention\/churn|hr data|hrbp|talent acquisition|workforce plan/i;

function isLooseProfileSegment(segment: ReturnType<typeof detectRoleSegment>) {
  return segment === 'general' || segment === 'fresh';
}

function isCrossSegmentProfileValue(job: string, value?: string) {
  const cleanJob = job.trim();
  const cleanValue = (value || '').trim();
  if (!cleanJob || !cleanValue) return false;
  const jobSegment = detectRoleSegment(cleanJob);
  const valueSegment = detectRoleSegment(cleanValue);
  if (isLooseProfileSegment(jobSegment) || isLooseProfileSegment(valueSegment)) return false;
  return jobSegment !== valueSegment;
}

function sanitizeRoadmapCurrentPosition(job: string, currentPosition?: string) {
  const cleanJob = repairMojibakeText(job || '').trim();
  const cleanPosition = repairMojibakeText(currentPosition || '').trim();
  if (!cleanPosition) return cleanJob;
  if (cleanJob && isCrossSegmentProfileValue(cleanJob, cleanPosition)) return cleanJob;
  if (cleanJob && detectRoleSegment(cleanJob) !== 'hr' && staleHrRoadmapProfilePattern.test(normalizeText(cleanPosition))) return cleanJob;
  return cleanPosition;
}

function getSafeRoadmapRoleText(profile: RoadmapProfile | null) {
  const job = repairMojibakeText(profile?.job || '').trim();
  const currentPosition = sanitizeRoadmapCurrentPosition(job, profile?.currentPosition);
  return normalizeText([job, currentPosition && currentPosition !== job ? currentPosition : ''].filter(Boolean).join(' '));
}

const ROADMAP_UI_SKILL_BASES: SimulatorSkillBase[] = [1, 2, 3, 4].map(index => ({
  id: `roadmap-ui-${index}`,
  label: `ROADMAP_UI_${index}`,
  boost: 0.12 + index * 0.02,
  pctBoost: 8 + index * 2,
}));

function taxonomyRoadmapSkillBank(roleText: string) {
  return getSimulatorSkillsForRole(roleText, ROADMAP_UI_SKILL_BASES)
    .map(skill => skill.label.trim())
    .filter(label => label.length > 2 && !/^ROADMAP_UI_/i.test(label));
}

function isHospitalityRoadmapRole(value: string) {
  return /khach san|hospitality|housekeeping|buong phong|room attendant|floor supervisor|guest service|front office|le tan khach san/.test(value);
}

function isCleaningRoadmapRole(value: string) {
  return /ve sinh|tap vu|cleaner|cleaning|janitor|housekeeper|thu gom rac/.test(value);
}

function practicalSkillBank(profile: RoadmapProfile | null, plan?: RoadmapActionPlan) {
  const roleText = getSafeRoadmapRoleText(profile);
  const contextText = normalizeText([
    profile?.strongSkills,
    profile?.proofAssets,
  ].filter(Boolean).join(' '));
  const roleAndContextText = `${roleText} ${contextText}`.trim();
  void plan;

  if (isHumanResourcesRoadmapRole(roleText) && isCareerPivotRoadmapRole(roleText)) {
    return [
      'Chọn nhánh HR mục tiêu',
      'Bóc JD và việc hằng ngày',
      'Mini case tuyển dụng/L&D/C&B',
      'Coffee chat hỏi nghề',
      'CV theo nhánh đã chọn',
      'Tracker phản hồi ứng tuyển',
      'KPI nhân sự cơ bản',
      'Portfolio chuyển hướng HR',
    ];
  }

  if (isHumanResourcesRoadmapRole(roleText)) {
    return [
      'JD analysis',
      'Recruitment funnel',
      'Onboarding checklist',
      'Training feedback',
      'C&B benchmark',
      'HR data/KPI',
      'Stakeholder communication',
      'HR case study',
    ];
  }

  if (/tiep vien hang khong|cabin crew|flight attendant|stewardess|steward|hang khong|airline|hang bay/.test(roleText)) {
    return [
      'Checklist an toàn bay',
      'Service recovery',
      'Announcement tiếng Anh',
      'Xử lý complaint hành khách',
      'Grooming và tác phong cabin',
      'Teamwork với crew',
      'Briefing/debrief sau chuyến',
      'Feedback từ senior crew',
    ];
  }

  if (!/bartender|mixologist|bar captain|bar supervisor|bar lead/.test(roleText) && /barista|pha che ca phe|coffee bar|ca phe/.test(roleText)) {
    return [
      'Dial-in espresso',
      'Cỡ xay/thời gian chiết xuất/yield',
      'Taste note và recipe calibration',
      'Latte art ổn định',
      'Speed of service giờ cao điểm',
      'Wastage log sữa/cà phê/syrup',
      'AOV upsell combo/size/topping',
      'POS/order accuracy và complaint log',
    ];
  }

  if (isDriverDeliveryRoadmapRole(roleText)) {
    return driverDeliverySkillBank();
  }

  if (isMarketingManagerRoadmapRole(roleAndContextText)) {
    return marketingManagerSkillBank();
  }

  if (isRestaurantManagerRoadmapRole(roleText)) {
    return restaurantManagerSkillBank();
  }

  if (isRestaurantFrontlineRoadmapRole(roleText)) {
    return restaurantFrontlineSkillBank();
  }

  if (isHotelManagerRoadmapRole(roleText)) {
    return hotelManagerSkillBank();
  }

  if (isHotelFrontlineRoadmapRole(roleText)) {
    return hotelFrontlineSkillBank();
  }

  if (isDentalRoadmapRole(roleText)) {
    return dentalSkillBank();
  }

  if (isDentalAssistantRoadmapRole(roleText)) {
    return dentalAssistantSkillBank();
  }

  if (isHospitalityRoadmapRole(roleText)) {
    return [
      'Checklist phòng/area',
      'Tốc độ dọn phòng/check-out room',
      'Set amenities/minibar/laundry handover',
      'Báo maintenance/lost & found',
      'Giảm lỗi/rework phòng',
      'Xử lý request/complaint khách',
      'Feedback giám sát ca',
      'Hồ sơ housekeeping có ảnh before-after',
    ];
  }

  if (isCleaningRoadmapRole(roleText)) {
    return [
      'Checklist khu vực vệ sinh',
      'Chuẩn dụng cụ/hóa chất',
      'Ảnh before-after',
      'Giảm lỗi/rework',
      'Complaint log',
      'Audit cleanliness',
      'Bàn giao cuối ca',
      'Feedback giám sát',
    ];
  }

  if (/giao vien (toan|ly|vat ly|hoa|su|lich su|dia|ngu van|van|tin hoc|sinh|cong nghe|gdcd|tieu hoc|thcs|thpt|bo mon)|teacher math|math teacher|public subject teacher/.test(roleText)) {
    return [
      'Giáo án bộ môn',
      'Ma trận đề và rubric',
      'Bảng tiến bộ học sinh',
      'Phụ đạo/bồi dưỡng đúng nhóm',
      'Hồ sơ dự giờ/góp ý',
      'Chuyên đề tổ chuyên môn',
      'Bài học sinh đã ẩn danh',
      'Hồ sơ thi đua/phụ cấp',
    ];
  }

  if (/quan ly.*trung tam.*(ngoai ngu|tieng anh)|giam doc.*trung tam.*(ngoai ngu|tieng anh)|pho giam doc.*trung tam.*(ngoai ngu|tieng anh)|center manager.*(english|language)|language center manager|english center manager/.test(roleText)) {
    return [
      'Enrollment funnel va trial-to-paid',
      'Class fill rate va lich lop',
      'Teacher utilization va roster giao vien',
      'Retention/renewal hoc vien',
      'Dropout/refund reasons',
      'Parent complaint SLA',
      'Revenue per class',
      'Operating dashboard trung tam',
    ];
  }

  if (/giao vien tieng anh|english teacher|ielts teacher|toeic teacher|cambridge teacher|ielts|toeic|cambridge|tesol|celta|ngon ngu anh/.test(roleText)) {
    return [
      'Lesson plan TESOL/CELTA-style',
      'Demo class 10-15 phút',
      'Rubric Speaking/Writing',
      'Pre-test/post-test tracker',
      'Homework completion',
      'Attendance/retention lớp',
      'Feedback học viên/phụ huynh',
      'Case study tiến bộ học viên',
    ];
  }

  if (/dao tao|l&d|learning|teacher|giao vien|giang day|tesol|ngon ngu anh/.test(roleText)) {
    return [
      'Instructional Design',
      'Thiết kế slide Canva/PowerPoint',
      'Quay và edit video bài giảng',
      'Photoshop/Canva xử lý hình ảnh',
      'Thiết kế quiz/LMS/e-learning',
      'Tiếng Anh B2+ cho công việc',
      'Viết CV/LinkedIn dạng case study',
      'Phân tích feedback học viên',
    ];
  }

  if (/\bmc\b|nguoi dan|dan chuong trinh|host|su kien|event host|livestream host|presenter|moderator|voice over|wedding mc/.test(roleText)) {
    return [
      'Dẫn sân khấu và giữ nhịp chương trình',
      'Viết lời dẫn theo brand voice',
      'Xử lý tình huống live',
      'Tương tác khán giả/khách mời',
      'Làm showreel 60-90 giây',
      'Briefing và rehearsal trước show',
      'Làm rate card theo format sự kiện',
      'Thu thập feedback khách/agency',
    ];
  }

  if (/doi huong|chuyen huong|pivot|muon doi huong|chua ro dinh huong|moi tot nghiep|moi ra truong|sinh vien/.test(roleText)) {
    return [
      'Chọn 3 role mục tiêu',
      'Đọc JD và bóc việc hằng ngày',
      'Làm mini project 2-3 giờ',
      'Xin feedback từ người đi làm',
      'Sửa CV theo role đã chọn',
      'Gửi thử 10 hồ sơ đúng hướng',
      'Coffee chat hỏi nghề',
      'Tracker phản hồi tuyển dụng',
    ];
  }

  if (/dau bep|chef|bep truong|bep pho|sous chef|cook|phu bep|barista|bartender|pha che|kitchen/.test(roleText)) {
    return [
      'Kiểm soát food cost',
      'Giảm waste nguyên liệu',
      'Recipe card có định lượng',
      'Chuẩn plating giờ cao điểm',
      'Tốc độ ra món',
      'Kitchen SOP',
      'An toàn vệ sinh/HACCP',
      'Training phụ bếp',
    ];
  }

  const taxonomyBank = taxonomyRoadmapSkillBank(roleText);
  if (taxonomyBank.length) return taxonomyBank;

  if (/marketing|content|social|media|brand|designer|thiet ke/.test(roleAndContextText)) {
    return [
      'Edit video short-form',
      'Thiết kế Canva',
      'Photoshop cơ bản',
      'Copywriting chuyển đổi',
      'Lập content calendar',
      'Đọc chỉ số reach/CTR/CVR',
      'Viết portfolio campaign',
      'Viết CV/LinkedIn dạng case study',
    ];
  }

  if (/\b(developer|engineer|backend|frontend|data analyst|data engineer|data scientist|software|devops|tester|qa|it\b)\b/.test(roleText)) {
    return [
      'Git/GitHub workflow',
      'TypeScript/JavaScript thực chiến',
      'SQL và đọc dữ liệu',
      'API integration',
      'Debugging có log',
      'Viết tài liệu kỹ thuật',
      'System design cơ bản',
      'Viết CV kỹ thuật theo project',
    ];
  }

  if (/cong nhan|van hanh may|san xuat|factory|operator|line|kho|qc/.test(roleText)) {
    return [
      'Vận hành máy đúng SOP',
      '5S và an toàn lao động',
      'Ghi chép lỗi sản xuất',
      'Excel/Sheets theo dõi sản lượng',
      'QC checklist',
      'Giảm lỗi line',
      'Đào tạo người mới',
      'Hồ sơ lên tổ phó/tổ trưởng',
    ];
  }

  if (/sales|kinh doanh|account|tu van|ban hang/.test(roleAndContextText)) {
    return [
      'CRM pipeline',
      'Cold message/email',
      'Viết proposal',
      'Follow-up khách hàng',
      'Đọc conversion rate',
      'Chốt lịch demo/tư vấn',
      'Phân tích lý do mất deal',
      'Viết CV sales bằng số',
    ];
  }

  return [
    'Excel/Google Sheets dashboard',
    'Canva/PowerPoint trình bày',
    'Viết CV/LinkedIn dạng case study',
    'Tiếng Anh B2+ cho công việc',
    'Viết báo cáo KPI',
    'Quản lý việc bằng checklist',
    'Giao tiếp với quản lý/khách hàng',
    'Đóng gói portfolio cá nhân',
  ];
}

function uniqueRoadmapSkills(plan: RoadmapActionPlan | undefined, profile: RoadmapProfile | null) {
  const blocked = /đàm phán lương|tạo bằng chứng tăng lương|evidence log|tìm cơ hội trả cao hơn|đóng gói output/i;
  const roleText = getSafeRoadmapRoleText(profile);
  const isAviation = /tiep vien hang khong|cabin crew|flight attendant|stewardess|steward|hang khong|airline|hang bay/.test(roleText);
  const wrongForAviation = /git|github|typescript|javascript|sql|api|debugging|system design|code|developer|dashboard kỹ thuật|pull request/i;
  const isDriverDelivery = isDriverDeliveryRoadmapRole(roleText);
  const wrongForDriverDelivery = /tesol|celta|ielts|cambridge|lesson plan|demo class|rubric|homework|hoc vien|phu huynh|power bi|python|financial|tai chinh|ke toan|audit|cfa|acca|ho so len to pho|ho so len to truong|to pho san xuat|to truong san xuat/i;
  const isFactory = /cong nhan|factory|production|san xuat|van hanh may|machine operator|operator line|line worker|kho|warehouse|qc line|qa line|to pho|to truong/.test(roleText);
  const bank = practicalSkillBank(profile, plan);
  const fromPlan = plan?.milestones.flatMap(milestone => [
    ...milestone.skills,
    ...milestone.weeks.flatMap(week => week.tasks.map(task => task.skill)),
  ]) ?? [];
  const clean = fromPlan
    .map(skill => skill.trim())
    .filter(skill => skill.length > 2 && skill.length <= 48 && !blocked.test(skill) && !/^n\/a$/i.test(skill))
    .filter(skill => !isAviation || !wrongForAviation.test(skill))
    .filter(skill => !isDriverDelivery || !wrongForDriverDelivery.test(normalizeText(skill)))
    .filter(skill => isFactory || !hasFactorySkillLeakForRoadmapRole(roleText, skill))
    .filter(skill => !hasJuniorMarketingSkillLeakForManagerRole(roleText, skill))
    .filter(skill => !hasKitchenSkillLeakForRestaurantNonChefRole(roleText, skill))
    .filter(skill => !hasManagerSkillLeakForFrontlineServiceRole(roleText, skill))
    .filter(skill => !hasGenericSkillLeakForDentalRole(roleText, skill));

  return Array.from(new Set([...bank, ...clean])).slice(0, 8);
}

function RoadmapCompassGame({
  plan,
  progress,
  evidenceLog,
  profile,
  stats,
  onEvidenceSubmit,
}: {
  plan?: RoadmapActionPlan;
  progress: Record<string, boolean>;
  evidenceLog: Record<string, RoadmapEvidence>;
  profile: RoadmapProfile | null;
  stats: { done: number; total: number; pct: number };
  onEvidenceSubmit: (key: string, evidence: RoadmapEvidence) => void;
}) {
  if (!plan) return null;

  const duration = profile?.duration || plan.milestones.length || 6;
  const skills = uniqueRoadmapSkills(plan, profile);
  const unlockedSkillCount = Math.min(skills.length, Math.max(0, Math.ceil((stats.pct / 100) * skills.length)));
  const monthStats = plan.milestones.map(milestone => {
    const keys = milestone.weeks.flatMap(week => week.tasks.map((_, taskIndex) => `w${week.week}_t${taskIndex}`));
    const done = keys.filter(key => progress[key]).length;
    const pct = keys.length ? Math.round((done / keys.length) * 100) : 0;
    return { milestone, done, total: keys.length, pct };
  });
  const completedMonths = monthStats.filter(item => item.pct >= 100).length;
  const activeMonth = monthStats.find(item => item.pct < 100) || monthStats[monthStats.length - 1];
  const evidenceCount = Object.keys(evidenceLog).length;
  const nextQuest = flattenActionTasks(plan).find(item => !progress[item.key]);
  const halfwayReached = stats.pct >= 50;
  const targetLabel = profile?.twoYearGoal || `mục tiêu ${duration} tháng`;
  const encouragement =
    stats.pct >= 100
      ? 'Bạn đã đủ bộ bằng chứng để deal full mục tiêu hoặc dùng hồ sơ này apply sang band cao hơn.'
      : halfwayReached
        ? `Bạn đã đi qua 50% chặng đường. Đây là lúc xin review thử: đề xuất 50% mức tăng mục tiêu, kèm bằng chứng và KPI đã hoàn thành.`
        : completedMonths > 0
          ? `Bạn đã xong ${completedMonths} chặng. Tiếp tục mở kỹ năng mới, đừng để bằng chứng nằm rời rạc trong checklist.`
          : 'Mục tiêu đầu tiên không phải tăng lương ngay. Mục tiêu là mở kỹ năng nền và tạo bằng chứng đầu tiên đủ rõ để người khác kiểm chứng.';

  return (
    <div className="w-full max-w-full space-y-4 overflow-hidden rounded-2xl border border-[#8b5cf6]/30 bg-[#0f1219] p-4 shadow-[0_0_30px_rgba(139,92,246,0.10)]">
      <div>
        <p className="text-[10px] font-mono font-black uppercase tracking-normal text-[#c4b5fd]">Lộ trình thăng tiến 79K</p>
        <h2 className="mt-1 text-lg font-black leading-tight text-[#f0ede8]">Bản đồ thăng tiến bằng hồ sơ bằng chứng</h2>
        <p className="mt-2 text-[11px] leading-relaxed text-[#f0ede8]/55">
          La Bàn 29K cho biết phải đi đâu. Bản 79K biến mục tiêu đó thành lộ trình {duration} tháng: mỗi chặng có sản phẩm cần nộp, bằng chứng cần lưu và thời điểm nên xin review lương.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          ['XP', `${stats.done * 50 + evidenceCount * 25}`],
          ['Bằng chứng', `${evidenceCount}/${stats.total}`],
          ['Level', stats.pct >= 80 ? 'Chốt deal' : stats.pct >= 50 ? 'Xin review' : 'Xây nền'],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-xl border border-white/8 bg-[#161b26] px-2 py-2 text-center">
            <p className="text-[8px] font-mono uppercase text-[#f0ede8]/35">{label}</p>
            <p className="mt-0.5 truncate text-[12px] font-black text-[#e8b84b]">{value}</p>
          </div>
        ))}
      </div>

      {nextQuest && (
        <div className="rounded-2xl border border-green-400/25 bg-green-400/10 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-mono font-black uppercase tracking-normal text-green-300">Nhiệm vụ hôm nay</p>
              <h3 className="mt-1 text-sm font-black leading-tight text-[#f0ede8]">{humanizeWorkCopy(nextQuest.task.title)}</h3>
              <p className="mt-2 text-[11px] leading-relaxed text-[#f0ede8]/58">
                Nộp: {humanizeWorkCopy(nextQuest.task.output)}
              </p>
            </div>
            <div className="shrink-0 rounded-xl border border-green-300/25 bg-[#0a0c10] px-3 py-2 text-center">
              <p className="text-[9px] uppercase text-[#f0ede8]/35">Thưởng</p>
              <p className="text-sm font-black text-green-300">+50 XP</p>
            </div>
          </div>
          <TaskEvidenceBox
            taskKey={nextQuest.key}
            evidence={evidenceLog[nextQuest.key]}
            checked={progress[nextQuest.key] || false}
            onSubmit={onEvidenceSubmit}
          />
        </div>
      )}

      <div className="relative overflow-hidden rounded-2xl border border-white/8 bg-[#0a0f1a] p-3">
        <div
          className="absolute inset-0 opacity-100"
          style={{
            backgroundImage:
              'linear-gradient(rgba(34,197,94,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(34,197,94,0.08) 1px, transparent 1px)',
            backgroundSize: '24px 24px',
          }}
        />
        <div className="relative z-10 space-y-2">
          {monthStats.map((item, index) => {
            const done = item.pct >= 100;
            const active = activeMonth?.milestone.month === item.milestone.month && !done;
            return (
              <div key={item.milestone.month} className={`flex gap-3 rounded-xl border px-3 py-3 ${
                done ? 'border-green-400/25 bg-green-400/10' :
                active ? 'border-[#e8b84b]/35 bg-[#e8b84b]/10' :
                'border-white/8 bg-[#111723]/80'
              }`}>
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-black ${
                  done ? 'border-green-300 bg-green-300 text-[#0a0c10]' :
                  active ? 'border-[#e8b84b] text-[#e8b84b]' :
                  'border-white/15 text-[#f0ede8]/35'
                }`}>
                  {done ? '✓' : index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[12px] font-black leading-tight text-[#f0ede8]">Tháng {item.milestone.month}: {humanizeWorkCopy(item.milestone.title)}</p>
                    <span className="shrink-0 text-[10px] font-black text-[#e8b84b]">{item.pct}%</span>
                  </div>
                  <p className="mt-1 text-[10px] leading-relaxed text-[#f0ede8]/50">
                    Cần làm: {item.total} việc. Xong chặng này phải có bằng chứng đủ rõ để người khác kiểm tra.
                  </p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#0a0c10]">
                    <div className="h-full rounded-full bg-gradient-to-r from-[#e8b84b] to-green-300" style={{ width: `${item.pct}%` }} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl border border-[#e8b84b]/25 bg-[#e8b84b]/10 p-3">
        <p className="text-[10px] font-mono font-black uppercase tracking-normal text-[#e8b84b]">Checkpoint deal lương</p>
        <p className="mt-1 text-[12px] font-bold leading-relaxed text-[#f0ede8]">{encouragement}</p>
        <p className="mt-2 text-[10px] leading-relaxed text-[#f0ede8]/50">Mục tiêu đang theo: {targetLabel}</p>
      </div>

      <div>
        <p className="text-[10px] font-mono font-black uppercase tracking-normal text-[#e8b84b]">Bằng chứng/kỹ năng đang ghi nhận</p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {skills.map((skill, index) => {
            const unlocked = index < unlockedSkillCount;
            return (
              <button
                key={skill}
                type="button"
                onClick={playTap}
                className={`rounded-xl border px-3 py-2 text-left transition-all active:scale-[0.98] ${
                  unlocked ? 'border-green-400/25 bg-green-400/10' : 'border-white/8 bg-[#161b26] opacity-55'
                }`}
              >
                <p className={`text-[10px] font-black leading-tight ${unlocked ? 'text-green-300' : 'text-[#f0ede8]/45'}`}>
                  {unlocked ? '✓ Đã ghi nhận' : '□ Chưa ghi nhận'}
                </p>
                <p className="mt-1 text-[10px] font-bold leading-tight text-[#f0ede8]/75">{humanizeWorkCopy(skill)}</p>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function roadmapAchievements(plan: RoadmapActionPlan | undefined, profile: RoadmapProfile | null, stats: { done: number; total: number }) {
  const text = normalizeText(`${profile?.job || ''} ${profile?.currentPosition || ''}`);
  const isAviation = /tiep vien hang khong|cabin crew|flight attendant|stewardess|steward|hang khong|airline|hang bay/.test(text);
  const isRestaurantManager = isRestaurantManagerRoadmapRole(text);
  const isRestaurantFrontline = isRestaurantFrontlineRoadmapRole(text);
  const isHotelManager = isHotelManagerRoadmapRole(text);
  const isHotelFrontline = isHotelFrontlineRoadmapRole(text);
  const isChef = !isRestaurantManager && !isRestaurantFrontline && /dau bep|chef|bep truong|bep pho|sous chef|cook|phu bep|barista|bartender|pha che|kitchen/.test(text);
  const isPerformer = /\bmc\b|nguoi dan|dan chuong trinh|host|su kien|event host|livestream host|presenter|moderator|wedding mc/.test(text);
  const isHospitality = isHospitalityRoadmapRole(text);
  const isCleaning = isCleaningRoadmapRole(text);
  const isDriverDelivery = isDriverDeliveryRoadmapRole(text);
  const isPublicSubjectTeacher = /giao vien (toan|ly|vat ly|hoa|su|lich su|dia|ngu van|van|tin hoc|sinh|cong nghe|gdcd|tieu hoc|thcs|thpt|bo mon)|teacher math|math teacher|public subject teacher/.test(text);

  if (isAviation) {
    return [
      `Hoàn thành ${stats.done}/${stats.total} việc theo checklist cabin crew có bằng chứng và người xác nhận.`,
      'Có checklist safety-service cá nhân cho trước chuyến, boarding, phục vụ, complaint và debrief.',
      'Có ít nhất 1 bản ghi announcement tiếng Anh hoặc script tình huống đã luyện.',
      'Có feedback từ senior crew/đồng nghiệp về grooming, teamwork hoặc xử lý khách.',
      'Có 1 case service recovery đã che toàn bộ thông tin riêng tư hành khách.',
      'Có hồ sơ cabin crew dùng được khi review nội bộ hoặc ứng tuyển tuyến/role tốt hơn.',
    ];
  }

  if (isRestaurantManager || isHotelManager) {
    return [
      `Hoàn thành ${stats.done}/${stats.total} việc theo checklist quản lý vận hành có KPI và bằng chứng.`,
      'Có dashboard ca/tháng về doanh thu, chất lượng dịch vụ, chi phí chính và complaint recovery.',
      'Có bằng chứng roster/SOP/training và feedback từ owner/GM hoặc quản lý trực tiếp.',
      'Có 1 case xử lý vấn đề vận hành: thiếu người, complaint lớn, review xấu hoặc chi phí vượt ngưỡng.',
      'Có hồ sơ dùng được để xin review lương hoặc ứng tuyển role manager cao hơn.',
    ];
  }

  if (isRestaurantFrontline || isHotelFrontline) {
    return [
      `Hoàn thành ${stats.done}/${stats.total} việc theo checklist frontline dịch vụ có bằng chứng.`,
      'Có log ca về order/booking/request, lỗi đã sửa, handover và feedback quản lý ca.',
      'Có bằng chứng xử lý khách: complaint, request, upsell hoặc review mention đã che thông tin riêng tư.',
      'Có 3 bullet CV bằng số: số ca, số bill/check-in/request, tỷ lệ lỗi giảm hoặc feedback.',
      'Có hồ sơ dùng được để xin review lương hoặc lên senior/shift lead.',
    ];
  }

  if (isChef) {
    return [
      `Hoàn thành ${stats.done}/${stats.total} việc theo checklist nghề bếp có bằng chứng và người xác nhận.`,
      'Có recipe card/định lượng cho món chủ lực, kèm chuẩn plating hoặc checklist ra món.',
      'Có ghi chú food cost, waste, tốc độ ra món hoặc lỗi món giảm trong ca thật.',
      'Có feedback từ bếp trưởng/ca trưởng/đồng nghiệp về chất lượng và tốc độ.',
      'Có SOP ca bếp hoặc checklist mise en place dùng được trong giờ cao điểm.',
      'Có hồ sơ bếp dùng được khi xin review, apply chuỗi nhà hàng/khách sạn hoặc lên ca trưởng.',
    ];
  }

  if (isPerformer) {
    return [
      `Hoàn thành ${stats.done}/${stats.total} việc theo checklist MC/host có bằng chứng và feedback.`,
      'Có showreel hoặc clip 60-90 giây thể hiện mở màn, chuyển đoạn và xử lý tình huống.',
      'Có 3 mẫu lời dẫn theo format sự kiện hoặc brand voice khác nhau.',
      'Có rate card hoặc gói dịch vụ kèm phạm vi rehearsal/script/di chuyển.',
      'Có feedback từ khách/agency/producer về giọng, nhịp sân khấu và độ chuyên nghiệp.',
      'Có hồ sơ MC dùng được để báo giá, xin show tốt hơn hoặc deal fee cao hơn.',
    ];
  }

  if (isHospitality) {
    return [
      `Hoàn thành ${stats.done}/${stats.total} việc theo checklist housekeeping/hospitality có bằng chứng và người xác nhận.`,
      'Có checklist phòng/area dùng được cho ca thật, gồm nhận phòng, vệ sinh, amenities, maintenance và bàn giao.',
      'Có log tốc độ dọn phòng hoặc số phòng/ca, kèm lỗi/rework đã giảm hoặc được xử lý.',
      'Có ảnh before-after đã che thông tin khách và không lộ dữ liệu riêng tư.',
      'Có feedback từ giám sát/đồng nghiệp về chất lượng phòng, tác phong và bàn giao.',
      'Có hồ sơ housekeeping dùng được khi review nội bộ hoặc ứng tuyển role senior/supervisor.',
    ];
  }

  if (isCleaning) {
    return [
      `Hoàn thành ${stats.done}/${stats.total} việc theo checklist vệ sinh có bằng chứng và người xác nhận.`,
      'Có checklist khu vực vệ sinh với tiêu chuẩn sạch, dụng cụ/hóa chất, PPE và điểm nghiệm thu.',
      'Có ảnh before-after hoặc audit cleanliness cho ít nhất 1 khu vực/ca thật.',
      'Có log lỗi/rework/complaint và hành động sửa trong ca.',
      'Có feedback từ giám sát/đồng nghiệp về chất lượng, an toàn và bàn giao.',
      'Có hồ sơ vệ sinh dùng được khi review nội bộ hoặc ứng tuyển ca/role tốt hơn.',
    ];
  }

  if (isDriverDelivery) {
    return driverDeliveryAchievements(stats.done, stats.total);
  }

  if (isPublicSubjectTeacher) {
    return [
      `Hoàn thành ${stats.done}/${stats.total} việc theo checklist giáo viên bộ môn có bằng chứng và KPI.`,
      'Có giáo án/ma trận đề/rubric gắn với đúng môn đang dạy, không dùng checklist trung tâm ngoại ngữ.',
      'Có bảng tiến bộ học sinh đã ẩn danh: điểm trước-sau, lỗi thường gặp và nhóm cần phụ đạo/bồi dưỡng.',
      'Có nhận xét dự giờ/góp ý từ tổ chuyên môn hoặc đồng nghiệp để chứng minh cải thiện tiết dạy.',
      'Có hồ sơ chuyên môn dùng được cho thi đua, phụ cấp, giáo viên nòng cốt hoặc subject lead đúng bộ môn.',
      'Có case 1 trang theo format: vấn đề lớp học - hành động - kết quả - bằng chứng.',
    ];
  }

  if (/dao tao|l&d|learning|teacher|giao vien|giang day|trung tam ngoai ngu/.test(text)) {
    return [
      `Hoàn thành ${stats.done}/${stats.total} việc theo checklist có bằng chứng và KPI.`,
      'Tạo được 1 bộ slide/lesson outline có mục tiêu học, bài tập và tiêu chí đánh giá.',
      'Có ít nhất 1 video hoặc demo bài giảng ngắn để đưa vào portfolio.',
      'Thu thập feedback thật và có phiên bản đã sửa sau feedback.',
      'Biết quy đổi kết quả đào tạo thành chỉ số: completion, feedback score, retention hoặc complaint.',
      'Có CV/LinkedIn bullet theo format: kỹ năng + sản phẩm + kết quả đo được.',
    ];
  }

  const outputs = Array.from(new Set((plan?.milestones
    .flatMap(milestone => milestone.weeks.flatMap(week => week.tasks.map(task => task.output)))
    .map(output => output.trim())
    .filter(output => output.length > 6 && !/evidence log|output gắn trực tiếp/i.test(output)) ?? []))).slice(0, 3);

  return [
    `Hoàn thành ${stats.done}/${stats.total} việc theo checklist có bằng chứng và KPI.`,
    `Có portfolio/case study cho role ${profile?.job || 'ứng viên'} để gửi cho sếp hoặc HR.`,
    'Có CV/LinkedIn bullet theo format: kỹ năng + sản phẩm + kết quả đo được.',
    'Có bảng theo dõi kết quả trước/sau phù hợp với nghề của bạn.',
    ...outputs.map(output => `Hoàn thành sản phẩm: ${output}`),
  ].slice(0, 6);
}

function RoadmapCompletionReward({
  profile,
  plan,
  stats,
  evidenceLog,
  showCertificate,
  onShowCertificate,
}: {
  profile: RoadmapProfile | null;
  plan?: RoadmapActionPlan;
  stats: { done: number; total: number; pct: number };
  evidenceLog: Record<string, RoadmapEvidence>;
  showCertificate: boolean;
  onShowCertificate: () => void;
}) {
  const [certDownloading, setCertDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const skills = uniqueRoadmapSkills(plan, profile);
  const achievedSkillCount = Math.min(skills.length, Math.max(0, Math.ceil((stats.pct / 100) * skills.length)));
  const achievedSkills = skills.slice(0, achievedSkillCount);
  const achievements = roadmapAchievements(plan, profile, stats);
  const evidenceCount = Object.keys(evidenceLog).length;
  const isComplete = stats.done >= stats.total;
  const issuedAt = new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const recipientName = cleanSharedName(profile?.fullName || readSharedName()) || 'Ứng viên Top Lương';
  const verifiedRole = profile?.job || profile?.currentPosition || 'Hồ sơ Top Lương';
  const verifyUrl = `https://www.topluong.com/verify?id=${encodeURIComponent(profile?.vspiId || '')}`;
  const evidenceUrl = `${verifyUrl}#evidence`;
  const displayVerifyUrl = verifyUrl.replace(/^https?:\/\//, '');
  const displayEvidenceUrl = evidenceUrl.replace(/^https?:\/\//, '');
  const submittedEvidenceItems = Object.values(evidenceLog)
    .map(item => [item.note, item.fileName].filter(Boolean).join(' - ').trim())
    .filter(Boolean)
    .map(item => humanizeWorkCopy(item))
    .slice(0, 4);
  const certificateEvidenceItems = submittedEvidenceItems.length
    ? submittedEvidenceItems
    : ['Chưa có bằng chứng đã nộp. Khi bạn thêm ghi chú, link hoặc file ở từng task, mục này sẽ hiển thị nội dung đó.'];

  const triggerCanvasDownload = (canvas: HTMLCanvasElement) => {
    const link = document.createElement('a');
    link.download = `Top-Luong-Chung-Nhan-Nang-Luc-${(profile?.phone || profile?.vspiId || 'roadmap').replace(/\D/g, '') || 'certificate'}.png`;
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const drawFallbackCertificate = () => {
    const canvas = document.createElement('canvas');
    canvas.width = CERT_EXPORT_WIDTH;
    canvas.height = CERT_EXPORT_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas is not available');

    const roundRect = (x: number, y: number, w: number, h: number, r: number, fill: string, stroke?: string) => {
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, r);
      ctx.fillStyle = fill;
      ctx.fill();
      if (stroke) {
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    };
    const wrapText = (text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines = 3) => {
      const words = text.split(/\s+/).filter(Boolean);
      let line = '';
      let lines = 0;
      for (let index = 0; index < words.length; index++) {
        const testLine = line ? `${line} ${words[index]}` : words[index];
        if (ctx.measureText(testLine).width > maxWidth && line) {
          ctx.fillText(line, x, y);
          y += lineHeight;
          lines++;
          line = words[index];
          if (lines >= maxLines - 1) {
            const rest = [line, ...words.slice(index + 1)].join(' ');
            let clipped = rest;
            while (ctx.measureText(`${clipped}...`).width > maxWidth && clipped.length > 8) clipped = clipped.slice(0, -1);
            ctx.fillText(`${clipped}...`, x, y);
            return y + lineHeight;
          }
        } else {
          line = testLine;
        }
      }
      if (line) ctx.fillText(line, x, y);
      return y + lineHeight;
    };

    ctx.fillStyle = '#0a0c10';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let i = -canvas.height; i < canvas.width; i += 48) {
      ctx.strokeStyle = 'rgba(255,255,255,0.055)';
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i + canvas.height, canvas.height);
      ctx.stroke();
    }

    roundRect(50, 50, 980, 1250, 30, '#0f1219', 'rgba(232,184,75,0.58)');
    roundRect(805, 82, 150, 150, 75, '#1d1a12', 'rgba(232,184,75,0.72)');
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8b84b';
    ctx.font = '900 22px Arial, sans-serif';
    ctx.fillText('TOP LƯƠNG', 880, 148);
    ctx.font = '900 17px Arial, sans-serif';
    ctx.fillText('VERIFIED', 880, 180);
    ctx.textAlign = 'left';

    ctx.fillStyle = '#e8b84b';
    ctx.font = '900 22px Arial, sans-serif';
    ctx.fillText('TOP LƯƠNG · VSPI VERIFIED', 90, 120);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '900 44px Arial, sans-serif';
    wrapText(isComplete ? 'Chứng nhận hoàn thành lộ trình' : 'Chứng nhận năng lực tăng lương', 90, 185, 700, 52, 2);
    ctx.fillStyle = '#86efac';
    ctx.font = '900 24px Arial, sans-serif';
    ctx.fillText(`${stats.done}/${stats.total} việc · ${achievedSkillCount}/${skills.length} kỹ năng · ${evidenceCount} bằng chứng`, 90, 300);

    roundRect(90, 340, 890, 132, 22, '#151b26', 'rgba(232,184,75,0.22)');
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '700 18px Arial, sans-serif';
    ctx.fillText('Trao cho', 120, 384);
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 30px Arial, sans-serif';
    wrapText(recipientName, 120, 425, 820, 36, 2);
    ctx.fillStyle = '#d1d5db';
    ctx.font = '600 18px Arial, sans-serif';
    wrapText(`${verifiedRole} · VSPI ID ${profile?.vspiId || 'VSPI'} · Cấp ngày ${issuedAt}`, 120, 458, 820, 24, 2);

    const statCards: Array<[string, string]> = [
      ['Tiến độ', `${stats.pct}%`],
      ['Việc xong', `${stats.done}/${stats.total}`],
      ['Bằng chứng', `${evidenceCount}`],
    ];
    statCards.forEach(([label, value], index) => {
      const x = 90 + index * 300;
      roundRect(x, 510, 280, 90, 18, '#151b26', 'rgba(232,184,75,0.22)');
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '700 16px Arial, sans-serif';
      ctx.fillText(label, x + 24, 544);
      ctx.fillStyle = '#e8b84b';
      ctx.font = '900 30px Arial, sans-serif';
      ctx.fillText(value, x + 24, 586);
    });

    let y = 665;
    ctx.fillStyle = '#e8b84b';
    ctx.font = '900 21px Arial, sans-serif';
    ctx.fillText('Kỹ năng cụ thể đã đạt', 90, y);
    y += 34;
    ctx.font = '700 18px Arial, sans-serif';
    for (const skill of skills.slice(0, 6)) {
      const cleanSkill = humanizeWorkCopy(skill);
      const text = achievedSkills.includes(skill) ? `✓ ${cleanSkill}` : `• ${cleanSkill}`;
      ctx.fillStyle = achievedSkills.includes(skill) ? '#bbf7d0' : '#cbd5e1';
      y = wrapText(text, 105, y, 860, 25, 2) + 2;
    }

    y += 14;
    ctx.fillStyle = '#e8b84b';
    ctx.font = '900 21px Arial, sans-serif';
    ctx.fillText('Evidence log đã nộp', 90, y);
    y += 34;
    ctx.font = '700 18px Arial, sans-serif';
    ctx.fillStyle = '#f8fafc';
    for (const item of certificateEvidenceItems.slice(0, 4)) {
      roundRect(90, y - 24, 890, 64, 16, '#151b26', 'rgba(255,255,255,0.16)');
      y = wrapText(`✓ ${item}`, 112, y, 845, 23, 2) + 28;
    }

    roundRect(90, 1132, 520, 100, 22, '#211d13', 'rgba(232,184,75,0.35)');
    ctx.fillStyle = '#e8b84b';
    ctx.font = '900 18px Arial, sans-serif';
    ctx.fillText('NEXT MOVE TRONG 7 NGÀY', 118, 1170);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 17px Arial, sans-serif';
    wrapText('Gửi portfolio/case study và chứng nhận này để xin review lương hoặc apply nơi có band cao hơn.', 118, 1198, 460, 22, 2);
    roundRect(640, 1132, 340, 100, 22, '#090d14', 'rgba(232,184,75,0.35)');
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '700 15px Arial, sans-serif';
    ctx.fillText('HR kiểm chứng', 668, 1170);
    ctx.fillStyle = '#e8b84b';
    ctx.font = '900 16px Arial, sans-serif';
    wrapText(displayVerifyUrl, 668, 1198, 280, 21, 2);

    return canvas;
  };

  const downloadCertificate = async () => {
    setCertDownloading(true);
    setDownloadError('');
    try {
      await document.fonts.ready;
      triggerCanvasDownload(drawFallbackCertificate());
      playSuccess();
    } catch (err) {
      console.error('Roadmap certificate download error:', err);
      setDownloadError('Chưa tải được ảnh. Vui lòng thử lại hoặc chụp màn hình chứng nhận.');
    } finally {
      setCertDownloading(false);
    }
  };

  if (!stats.total) return null;
  const left = Math.max(0, stats.total - stats.done);

  return (
    <div className={`rounded-2xl border p-4 shadow-[0_0_28px_rgba(74,222,128,0.10)] ${
      isComplete ? 'border-green-400/30 bg-green-400/10' : 'border-[#e8b84b]/25 bg-[#0f1219]'
    }`}>
      <p className={`text-[10px] font-mono font-black uppercase tracking-normal ${isComplete ? 'text-green-300' : 'text-[#e8b84b]'}`}>
        {isComplete ? 'Hồ sơ thăng tiến đã đủ' : 'Chứng nhận năng lực đang đạt'}
      </p>
      <h3 className="mt-1 text-lg font-black leading-tight text-[#f0ede8]">
        {isComplete ? 'Bạn đã hoàn thành toàn bộ lộ trình' : `Đã ghi nhận ${achievedSkillCount}/${skills.length} năng lực cần cho tăng lương`}
      </h3>
      <p className="mt-2 text-[11px] leading-relaxed text-[#f0ede8]/65">
        {isComplete
          ? 'Đây là lúc chuyển từ “làm việc rời rạc” sang “đòi giá trị”: đặt lịch review lương trong 7 ngày, gửi portfolio/case study cho sếp, hoặc apply 10 nơi có band cao hơn nếu công ty hiện tại không có ngân sách.'
          : `Còn ${left} việc nữa để đủ hồ sơ hoàn chỉnh. Hiện tại bạn vẫn có thể tải chứng nhận năng lực đã đạt, kèm số việc, kỹ năng và bằng chứng đã nộp.`}
      </p>

      <button
        type="button"
        onClick={onShowCertificate}
        className={`mt-4 w-full rounded-xl px-4 py-3 text-sm font-black text-[#0a0c10] transition-all hover:-translate-y-0.5 ${
          isComplete ? 'bg-green-300' : 'bg-[#e8b84b]'
        }`}
      >
        {showCertificate ? 'Ẩn chứng nhận' : isComplete ? 'Tải chứng nhận hoàn thành' : 'Mở chứng nhận năng lực đã đạt'}
      </button>

      {showCertificate && (
        <div className="mt-4 space-y-3">
          <div
            id="roadmap-completion-certificate"
            className="relative mx-auto w-full max-w-[680px] overflow-hidden rounded-2xl border border-[#e8b84b]/55 bg-[#0a0c10] p-5 text-left text-[#f8fafc] shadow-2xl shadow-green-400/10"
          >
            <div className="absolute inset-0 opacity-[0.055]" style={{ backgroundImage: 'repeating-linear-gradient(45deg,#fff 0,#fff 1px,transparent 0,transparent 34px)' }} />
            <div className="absolute right-4 top-4 flex h-24 w-24 rotate-[-8deg] items-center justify-center rounded-full border-2 border-[#e8b84b]/70 bg-[#1d1a12] text-center text-[9px] font-black uppercase leading-tight text-[#e8b84b] shadow-[0_0_24px_rgba(232,184,75,0.16)]">
              VSPI<br />Verified<br />79K
            </div>
            <div className="relative z-10 pr-24">
              <p className="text-[10px] font-mono font-black uppercase tracking-[0.12em] text-[#e8b84b]">Top Lương Verified · VSPI ID</p>
              <h4 className="mt-2 text-2xl font-black leading-tight text-white">
                {isComplete ? 'Chứng nhận hoàn thành lộ trình' : 'Chứng nhận năng lực tăng lương'}
              </h4>
              <p className="mt-1 text-sm font-black text-green-300">
                {stats.done}/{stats.total} việc · {achievedSkillCount}/{skills.length} kỹ năng · {evidenceCount} bằng chứng
              </p>
            </div>

            <div className="relative z-10 mt-5 rounded-2xl border border-[#e8b84b]/25 bg-[#151b26] p-4">
              <p className="text-[9px] font-bold uppercase text-[#cbd5e1]">Trao cho</p>
              <p className="mt-1 text-2xl font-black leading-tight text-white">{recipientName}</p>
              <p className="mt-1 text-sm font-bold leading-relaxed text-green-200">{verifiedRole}</p>
              <p className="mt-1 text-[11px] font-semibold leading-relaxed text-[#d1d5db]">
                Cấp ngày {issuedAt} · Gắn với SĐT {profile?.phone || 'đã xác thực'}
              </p>
              <div className="mt-3 rounded-xl border border-[#e8b84b]/30 bg-[#211d13] px-3 py-2">
                <p className="text-[8px] font-mono font-black uppercase text-[#cbd5e1]">VSPI ID</p>
                <p className="mt-0.5 break-words font-mono text-base font-black leading-tight text-[#e8b84b]">{profile?.vspiId || 'VSPI'}</p>
                <p className="mt-1 break-words text-[9px] font-bold leading-relaxed text-[#f8fafc]">HR verify: {displayVerifyUrl}</p>
              </div>
            </div>

            <div className="relative z-10 mt-4 grid grid-cols-3 gap-2">
              {[
                ['Tiến độ', `${stats.pct}%`],
                ['Việc xong', `${stats.done}/${stats.total}`],
                ['Bằng chứng', `${evidenceCount}`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-[#e8b84b]/25 bg-[#151b26] px-2 py-2 text-center">
                  <p className="text-[8px] font-mono font-bold uppercase text-[#cbd5e1]">{label}</p>
                  <p className="mt-0.5 text-sm font-black text-[#e8b84b]">{value}</p>
                </div>
              ))}
            </div>

            <div className="relative z-10 mt-4">
              <p className="text-[10px] font-mono font-black uppercase tracking-normal text-[#e8b84b]">Kỹ năng cụ thể đã đạt</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {skills.map(skill => (
                  <span key={skill} className={`rounded-full border px-2.5 py-1 text-[10px] font-bold leading-tight ${
                    achievedSkills.includes(skill)
                      ? 'border-green-300/30 bg-green-300/12 text-green-100'
                      : 'border-white/15 bg-white/[0.06] text-[#d1d5db]'
                  }`}>
                    {humanizeWorkCopy(skill)}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative z-10 mt-4">
              <p className="text-[10px] font-mono font-black uppercase tracking-normal text-[#e8b84b]">Bằng chứng có thể gửi sếp/HR</p>
              <div className="mt-2 space-y-2">
                {achievements.map(item => (
                  <div key={item} className="rounded-xl border border-white/15 bg-[#151b26] px-3 py-2">
                    <p className="text-[11px] font-bold leading-relaxed text-[#f8fafc]">✓ {item}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative z-10 mt-4 grid gap-3 md:grid-cols-2 md:items-stretch">
              <div className="rounded-2xl border border-[#e8b84b]/30 bg-[#211d13] p-3">
                <p className="text-[10px] font-black uppercase text-[#e8b84b]">Next move trong 7 ngày</p>
                <p className="mt-1 text-[11px] font-bold leading-relaxed text-[#f8fafc]">
                  Gửi portfolio/case study + chứng nhận này để xin review lương. Nếu không có ngân sách, dùng cùng bộ kỹ năng để apply 10 nơi có band cao hơn.
                </p>
              </div>
              <div className="min-w-0 rounded-2xl border border-[#e8b84b]/30 bg-[#090d14] p-3">
                <p className="text-[9px] font-mono font-black uppercase text-[#cbd5e1]">Evidence log</p>
                <p className="mt-1 break-words font-mono text-[10px] font-black leading-relaxed text-[#e8b84b]">{profile?.vspiId || 'VSPI'}</p>
                <div className="mt-2 space-y-1.5">
                  {certificateEvidenceItems.slice(0, 3).map((item, index) => (
                    <p key={`${item}-${index}`} className="whitespace-normal break-words text-[10px] font-bold leading-relaxed text-[#f8fafc]">
                      {item}
                    </p>
                  ))}
                </div>
                <p className="mt-2 break-words text-[9px] font-bold leading-relaxed text-[#f8fafc]/70">{displayEvidenceUrl}</p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={downloadCertificate}
            disabled={certDownloading}
            className="w-full rounded-xl bg-[#e8b84b] px-4 py-3 text-sm font-black leading-tight text-[#0a0c10] transition-all hover:-translate-y-0.5 disabled:opacity-60"
          >
            {certDownloading ? 'Đang tạo ảnh...' : 'Tải chứng nhận PNG'}
          </button>
          {downloadError && <p className="text-center text-[11px] text-red-300">{downloadError}</p>}
        </div>
      )}
    </div>
  );
}

function EvidenceVaultCard({
  stats,
  evidenceLog,
}: {
  stats: { done: number; total: number; pct: number };
  evidenceLog: Record<string, RoadmapEvidence>;
}) {
  const evidenceCount = Object.keys(evidenceLog).length;
  const readyToDeal = stats.pct >= 50 && evidenceCount >= Math.max(1, Math.floor(stats.total * 0.5));

  return (
    <section className="w-full max-w-full overflow-hidden rounded-2xl border border-green-400/25 bg-gradient-to-br from-green-400/12 via-[#0f1219] to-[#0f1219] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-mono font-black uppercase tracking-normal text-green-300">Kho bằng chứng</p>
          <h2 className="mt-1 text-lg font-black leading-tight text-[#f0ede8]">Kho bằng chứng tăng lương</h2>
          <p className="mt-2 text-[11px] leading-relaxed text-[#f0ede8]/55">
            Nguyên tắc: mỗi việc chỉ thật sự có giá trị khi bạn nộp link, ảnh, file hoặc ghi chú chứng minh đã làm. Đây là thứ đem đi review lương.
          </p>
        </div>
        <div className="shrink-0 rounded-2xl border border-green-300/25 bg-green-300/10 px-3 py-2 text-center">
          <p className="text-[9px] uppercase text-green-200/70">Đã nộp</p>
          <p className="text-base font-black text-green-300">{evidenceCount}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          ['Việc', `${stats.done}/${stats.total}`],
          ['Bằng chứng', `${evidenceCount}`],
          ['Deal lương', readyToDeal ? 'Sẵn sàng' : 'Chưa đủ'],
        ].map(([label, value]) => (
          <div key={label} className="min-w-0 rounded-xl border border-white/8 bg-[#0a0c10]/70 px-2 py-2 text-center">
            <p className="text-[8px] font-mono uppercase text-[#f0ede8]/35">{label}</p>
            <p className="mt-0.5 truncate text-[11px] font-black text-[#f0ede8]">{value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function TaskEvidenceBox({
  taskKey,
  evidence,
  checked,
  onSubmit,
}: {
  taskKey: string;
  evidence?: RoadmapEvidence;
  checked: boolean;
  onSubmit: (key: string, evidence: RoadmapEvidence) => void;
}) {
  const [note, setNote] = useState(evidence?.note || '');
  const [fileName, setFileName] = useState(evidence?.fileName || '');
  const hasEvidence = Boolean(evidence?.note || evidence?.fileName);

  useEffect(() => {
    setNote(evidence?.note || '');
    setFileName(evidence?.fileName || '');
  }, [evidence?.note, evidence?.fileName]);

  const submit = () => {
    const cleanNote = note.trim();
    if (!cleanNote && !fileName.trim()) return;
    onSubmit(taskKey, { note: cleanNote, fileName: fileName.trim() });
  };

  return (
    <div className={`mt-3 rounded-xl border p-3 ${hasEvidence ? 'border-green-400/25 bg-green-400/10' : 'border-[#e8b84b]/20 bg-[#e8b84b]/8'}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] font-mono font-black uppercase tracking-normal text-[#e8b84b]">
          {hasEvidence ? 'Bằng chứng đã nộp' : 'Nộp bằng chứng để tick'}
        </p>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black ${checked ? 'bg-green-300 text-[#0a0c10]' : 'bg-white/8 text-[#f0ede8]/50'}`}>
          {checked ? 'XONG' : '+Điểm'}
        </span>
      </div>
      {hasEvidence && (
        <div className="mt-2 rounded-lg border border-green-300/15 bg-[#0a0c10]/60 px-3 py-2 text-[10px] leading-relaxed text-green-100/75">
          {evidence?.fileName && <p className="break-words">File: {evidence.fileName}</p>}
          {evidence?.note && <p className="break-words">Ghi chú/link: {evidence.note}</p>}
        </div>
      )}
      <textarea
        value={note}
        onChange={event => setNote(event.target.value)}
        placeholder="Dán link Drive/ảnh/file bài làm hoặc ghi chú chứng minh bạn đã làm..."
        rows={2}
        className="mt-2 w-full min-w-0 resize-none rounded-lg border border-white/10 bg-[#0f1219] px-3 py-2 text-[11px] leading-relaxed text-[#f0ede8] outline-none placeholder:text-[#f0ede8]/25 focus:border-[#e8b84b]"
      />
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_6.75rem] gap-2">
        <label className="min-w-0 cursor-pointer rounded-lg border border-white/10 bg-[#0f1219] px-3 py-2 text-[10px] font-bold leading-tight text-[#f0ede8]/55">
          <span className="block truncate">{fileName || 'Chọn file/ảnh'}</span>
          <input
            type="file"
            className="hidden"
            onChange={event => setFileName(event.target.files?.[0]?.name || '')}
          />
        </label>
        <button
          type="button"
          onClick={submit}
          disabled={!note.trim() && !fileName.trim()}
          className="rounded-lg bg-[#e8b84b] px-2 py-2 text-[10px] font-black leading-tight text-[#0a0c10] transition-all active:scale-95 disabled:opacity-40"
        >
          Nộp + tick
        </button>
      </div>
    </div>
  );
}

function RoadmapActionPlanView({
  plan,
  progress,
  evidenceLog,
  onToggle,
  onEvidenceSubmit,
}: {
  plan: RoadmapActionPlan;
  progress: Record<string, boolean>;
  evidenceLog: Record<string, RoadmapEvidence>;
  onToggle: (key: string) => void;
  onEvidenceSubmit: (key: string, evidence: RoadmapEvidence) => void;
}) {
  const cleanPlan = repairMojibakeDeep<RoadmapActionPlan>(plan);
  return (
    <div className="space-y-4">
      {cleanPlan.milestones.map(milestone => {
        const milestoneTasks = milestone.weeks.flatMap(week =>
          week.tasks.map((_, taskIndex) => `w${week.week}_t${taskIndex}`)
        );
        const done = milestoneTasks.filter(key => progress[key]).length;
        const pct = milestoneTasks.length ? Math.round((done / milestoneTasks.length) * 100) : 0;
        return (
          <section key={milestone.month} className="w-full max-w-full overflow-hidden rounded-2xl border border-white/8 bg-[#0f1219]">
            <div className="border-b border-white/8 bg-[#111723] px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-mono font-black uppercase tracking-normal text-[#e8b84b]">Tháng {milestone.month}</p>
                  <h3 className="mt-1 text-base font-black leading-tight text-[#f0ede8]">{humanizeWorkCopy(milestone.title)}</h3>
                </div>
                <span className="shrink-0 rounded-full border border-[#e8b84b]/25 bg-[#e8b84b]/10 px-2 py-1 text-[10px] font-black text-[#e8b84b]">
                  {done}/{milestoneTasks.length}
                </span>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-[#f0ede8]/55">{humanizeWorkCopy(milestone.objective)}</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#0a0c10]">
                <div className="h-full rounded-full bg-[#e8b84b]" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {milestone.skills.map(skill => (
                  <span key={skill} className="rounded-full border border-white/8 bg-white/[0.04] px-2 py-1 text-[10px] font-bold text-[#f0ede8]/65">
                    {humanizeWorkCopy(skill)}
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-4 p-4">
              {milestone.weeks.map(week => (
                <div key={week.week} className="w-full max-w-full overflow-hidden rounded-2xl border border-white/8 bg-[#161b26] p-3">
                  <div className="mb-3 flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#e8b84b]/15 text-xs font-black text-[#e8b84b]">
                      W{week.week}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-black leading-tight text-[#f0ede8]">{humanizeWorkCopy(week.focus)}</p>
                      <p className="mt-1 text-[10px] leading-relaxed text-[#f0ede8]/45">Checkpoint: {humanizeWorkCopy(week.checkpoint)}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {week.tasks.map((task, taskIndex) => {
                      const key = `w${week.week}_t${taskIndex}`;
                      const checked = progress[key] || false;
                      return (
                        <div
                          key={key}
                          className={`w-full rounded-xl border p-3 text-left transition-all active:scale-[0.99] ${
                            checked
                              ? 'border-green-400/25 bg-green-400/10'
                              : 'border-white/8 bg-[#0f1219] hover:border-[#e8b84b]/30'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border text-[11px] font-black ${
                              checked ? 'border-green-400 bg-green-400 text-[#0a0c10]' : 'border-white/15 text-[#f0ede8]/35'
                            }`}>
                              {checked ? '✓' : taskIndex + 1}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className={`break-words text-[12px] font-black leading-relaxed ${checked ? 'text-green-300' : 'text-[#f0ede8]'}`}>
                                {humanizeWorkCopy(task.title)}
                              </p>
                              <div className="mt-2 rounded-lg border border-[#e8b84b]/15 bg-[#e8b84b]/8 px-2.5 py-2 text-[10px] leading-relaxed text-[#f0ede8]/70">
                                <span className="font-black text-[#e8b84b]">Nộp gì:</span> {humanizeWorkCopy(task.output)}
                              </div>
                              <details className="mt-2 rounded-lg border border-white/8 bg-[#161b26]/70 px-2.5 py-2">
                                <summary className="cursor-pointer text-[10px] font-black text-[#f0ede8]/60">
                                  Xem cách làm + tiêu chí thắng
                                </summary>
                                <div className="mt-2 grid gap-1.5 text-[10px] leading-relaxed text-[#f0ede8]/55">
                                  <p className="break-words"><span className="font-black text-[#e8b84b]">Vì sao làm:</span> {humanizeWorkCopy(task.skill)}</p>
                                  <p className="break-words"><span className="font-black text-[#e8b84b]">Điểm thắng:</span> {humanizeWorkCopy(task.kpi)}</p>
                                  <p className="break-words"><span className="font-black text-[#e8b84b]">Hoàn thành khi:</span> {humanizeWorkCopy(task.doneDefinition)}</p>
                                </div>
                              </details>
                              {checked && !evidenceLog[key] && (
                                <button
                                  type="button"
                                  onClick={() => onToggle(key)}
                                  className="mt-3 rounded-lg border border-white/10 px-3 py-2 text-[10px] font-bold text-[#f0ede8]/55"
                                >
                                  Bỏ tick tạm
                                </button>
                              )}
                            </div>
                          </div>
                          <TaskEvidenceBox
                            taskKey={key}
                            evidence={evidenceLog[key]}
                            checked={checked}
                            onSubmit={onEvidenceSubmit}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function RoadmapGeneratingSkeleton({ duration }: { duration: number }) {
  const durationLabel = formatDurationLabel(duration);

  return (
    <div className="min-h-screen w-full max-w-[100svw] overflow-x-clip bg-[#0a0c10] px-3 pb-8 pt-[max(1rem,env(safe-area-inset-top))] font-sans text-[#f0ede8] sm:px-4">
      <div className="mx-auto w-full max-w-[min(100%,22.5rem)] pt-16">
        <div className="rounded-2xl border border-[#e8b84b]/20 bg-[#0f1219] p-5 shadow-[0_0_40px_rgba(232,184,75,0.08)]">
          <div className="mb-5 flex items-center gap-3">
            <div className="relative h-12 w-12 rounded-full border border-[#e8b84b]/25 bg-[#161b26]">
              <div className="absolute inset-2 rounded-full border-2 border-t-[#e8b84b] border-white/10 animate-spin" />
            </div>
            <div>
              <p className="text-sm font-black text-[#f0ede8]">AI đang phân tích hồ sơ</p>
              <p className="text-[10px] text-[#f0ede8]/40">Đang dựng lộ trình bằng AI cá nhân hóa theo vị trí, điểm yếu và mục tiêu {durationLabel}</p>
            </div>
          </div>
          <div className="space-y-3">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className="rounded-xl border border-white/6 bg-[#161b26] p-3">
                <div className="mb-3 h-3 w-24 animate-pulse rounded-full bg-[#e8b84b]/20" />
                <div className="space-y-2">
                  <div className="h-2.5 w-full animate-pulse rounded-full bg-white/10" />
                  <div className="h-2.5 w-5/6 animate-pulse rounded-full bg-white/10" />
                  <div className="h-2.5 w-2/3 animate-pulse rounded-full bg-white/10" />
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-center text-[10px] text-[#f0ede8]/35">Âm thanh thinking đang bật nếu máy không mute</p>
        </div>
      </div>
    </div>
  );
}

export default function RoadmapPage() {
  const [step, setStep]           = useState<PageStep>('setup');
  const [job, setJob]             = useState('');
  const [roadmapIntent, setRoadmapIntent] = useState<RoadmapIntent | ''>('');
  const [currentJobTitle, setCurrentJobTitle] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [currentSalary, setCurrentSalary] = useState('');
  const [currentPercent, setCurrentPercent] = useState(0);
  const [benchmarkExperience, setBenchmarkExperience] = useState('');
  const [benchmarkMarketLocation, setBenchmarkMarketLocation] = useState('');
  const [benchmarkWorkProvince, setBenchmarkWorkProvince] = useState('');
  const [duration, setDuration]   = useState<3 | 6 | 9>(6);
  const [compassTargetSalary, setCompassTargetSalary] = useState(0);
  const [compassTargetLabel, setCompassTargetLabel] = useState('');
  const [phone, setPhone]         = useState('');
  const [name, setName]           = useState(() => readSharedName());
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [website, setWebsite]     = useState('');
  const formStartedAtRef = useRef(Date.now());
  const jobInputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError]         = useState('');
  const [roleSuggestions, setRoleSuggestions] = useState<RoleSuggestion[]>([]);
  const [creating, setCreating]   = useState(false);
  const [targetBenchmark, setTargetBenchmark] = useState<RoadmapTargetBenchmark | null>(null);
  const [targetBenchmarkLoading, setTargetBenchmarkLoading] = useState(false);

  const cur        = parseInt(currentSalary.replace(/,/g, ''), 10) || 0;
  const detectedJobIntent = detectRoadmapIntentPhrase(job);
  const activeRoadmapIntent = roadmapIntent || detectedJobIntent || '';
  const selectedRoleProfile = selectedRoleId ? getRoleProfileById(selectedRoleId) : null;
  const resolvedJobRole = resolveRoadmapRoleFromJobTitle(job);
  const effectiveSelectedRoleId = selectedRoleProfile?.key || resolvedJobRole?.role_id || '';
  const effectiveSelectedRoleTitle = selectedRoleProfile?.title || resolvedJobRole?.title || '';
  const intentWithoutSelectedRole = Boolean(activeRoadmapIntent && !effectiveSelectedRoleId);
  const intentRequiresRoleSelection = Boolean(activeRoadmapIntent && !effectiveSelectedRoleId && (!job.trim() || detectedJobIntent));
  const roadmapIntentContext = activeRoadmapIntent ? ROADMAP_INTENT_CONTEXT[activeRoadmapIntent] : null;
  const roadmapJobPlaceholder = activeRoadmapIntent === 'new_graduate'
    ? 'Chọn nghề bạn muốn bắt đầu'
    : activeRoadmapIntent === 'stuck_3_years'
      ? 'Chọn nghề hiện tại chính xác'
      : activeRoadmapIntent === 'career_switch'
        ? 'Bạn muốn chuyển sang hướng nào?'
        : 'VD: Backend Developer, Kế toán...';
  const targetCalc = job && cur > 0 && !intentWithoutSelectedRole ? calcTargetSalary(cur, job, duration, compassTargetSalary, compassTargetLabel) : null;
  const setupDisabledReason = (() => {
    if (creating) return '';
    if (!name.trim()) return 'Nhập họ tên của bạn trước khi tạo lộ trình.';
    if (!isValidSharedPhone(phone)) return 'Nhập SĐT hợp lệ để nhận và xem lại lộ trình.';
    if (!job.trim()) return activeRoadmapIntent ? 'Chọn một nghề cụ thể trước khi tạo lộ trình.' : 'Nhập nghề nghiệp trước khi tạo lộ trình.';
    if (intentRequiresRoleSelection) return `${roadmapIntentContext?.prompt || 'Chọn nghề cụ thể trước khi tạo lộ trình.'} Mẫu định hướng không phải nghề để benchmark.`;
    if (!effectiveSelectedRoleId) return 'Vui lòng chọn đúng nghề trong danh sách trước khi tạo lộ trình.';
    if (!cur || cur < 1_000_000) return 'Nhập lương hiện tại hợp lệ trước khi tạo lộ trình.';
    if (!targetCalc) return 'Chưa đủ dữ liệu để tính mục tiêu lương cho lộ trình.';
    if (!privacyConsent) return 'Vui lòng đồng ý xử lý dữ liệu để tạo lộ trình và hỗ trợ sau mua.';
    return '';
  })();
  const durationLabel = formatDurationLabel(duration);
  const sameTargetBucket = isSameTopBucket(targetBenchmark?.currentLabel, targetBenchmark?.targetLabel);
  const recoveryGapClosed = targetCalc?.compassTarget
    ? Math.max(0, targetCalc.target - cur)
    : 0;
  const recoveryGapLeft = targetCalc?.compassTarget
    ? Math.max(0, targetCalc.compassTarget - targetCalc.target)
    : 0;

  const [vspiId, setVspiId]       = useState('');
  const [profile, setProfile]     = useState<RoadmapProfile | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const [roadmapRaw, setRoadmapRaw] = useState<RoadmapData | null>(null);
  const roadmap = cleanRoadmapData(roadmapRaw);
  const setRoadmap = (value: RoadmapData | null) => setRoadmapRaw(cleanRoadmapData(value) || null);
  const [progress, setProgress]   = useState<Record<string, boolean>>({});
  const [evidenceLog, setEvidenceLog] = useState<Record<string, RoadmapEvidence>>({});
  const [generating, setGenerating] = useState(false);
  const [currentPosition, setCurrentPosition] = useState('');
  const [mainWeakness, setMainWeakness] = useState('');
  const [twoYearGoal, setTwoYearGoal] = useState('');
  const [educationLevel, setEducationLevel] = useState('');
  const [educationDetail, setEducationDetail] = useState('');
  const [strongSkills, setStrongSkills] = useState('');
  const [proofAssets, setProofAssets] = useState('');
  const [bottleneck, setBottleneck] = useState('');
  const [preferredPath, setPreferredPath] = useState('deal_internal');
  const [weeklyTime, setWeeklyTime] = useState('3-5 giờ/tuần');
  const [showCertificate, setShowCertificate] = useState(false);
  const preferredPathOptions = getPreferredPathOptions(job, currentPosition);

  // Restore phone input cho trang restore
  const [restorePhone, setRestorePhone] = useState('');
  const [restoreAccessCode, setRestoreAccessCode] = useState('');
  const [restoreLoading, setRestoreLoading] = useState(false);
  const activeAccessCode = profile?.accessCode || getRoadmapAccessCode(vspiId);

  const applyProgressPayload = (payload: unknown) => {
    const nextProgress = extractProgressBooleans(payload);
    const remoteEvidence = extractEvidenceLog(payload);
    setProgress(nextProgress);
    if (Object.keys(remoteEvidence).length > 0) {
      setEvidenceLog(remoteEvidence);
      const id = vspiId || profile?.vspiId;
      if (id) {
        try {
          localStorage.setItem(getEvidenceStorageKey(id), JSON.stringify(remoteEvidence));
        } catch {
          /* ignore */
        }
      }
    }
  };

  const applyPreset = (preset: typeof ROADMAP_PRESETS[number]) => {
    const currentExactRole = resolveRoadmapRoleFromJobTitle(job);
    setRoadmapIntent(preset.intent);
    if (preset.intent === 'stuck_3_years' && currentExactRole) {
      setSelectedRoleId(currentExactRole.role_id);
      setJob(currentExactRole.title);
    } else {
      setSelectedRoleId('');
    }
    if (preset.intent === 'new_graduate') {
      setJob('');
      setCurrentJobTitle('');
    }
    if (preset.intent === 'career_switch') {
      setCurrentJobTitle(job.trim() || currentJobTitle);
      setJob('');
    }
    setDuration(preset.duration);
    setCompassTargetSalary(0);
    setCompassTargetLabel('');
    setTargetBenchmark(null);
    setRoleSuggestions([]);
    setError('');
    window.setTimeout(() => jobInputRef.current?.focus(), 0);
  };

  const isRoleSelectionError = (value: string) => /chọn nghề|khớp chắc|benchmark|role|danh sách/i.test(value);

  useEffect(() => {
    const cleanJob = job.trim();
    if (!cleanJob || detectedJobIntent) return;
    const exactRole = resolveRoadmapRoleFromJobTitle(cleanJob);
    if (exactRole) {
      if (selectedRoleId !== exactRole.role_id) setSelectedRoleId(exactRole.role_id);
      if (roleSuggestions.length) setRoleSuggestions([]);
      if (error && isRoleSelectionError(error)) setError('');
      return;
    }
    if (!selectedRoleId) {
      setRoleSuggestions(findClosestRoleProfiles(cleanJob, 3).map(profile => ({
        role_id: profile.key,
        title: profile.title,
        industry: profile.industry,
      })));
    }
  }, [job, detectedJobIntent, selectedRoleId, roleSuggestions.length, error]);

  useEffect(() => {
    const cleanJob = job.trim();
    const targetSalary = targetCalc?.target || 0;
    if (!cleanJob || intentWithoutSelectedRole || cur < 500_000 || targetSalary < 500_000) {
      setTargetBenchmark(null);
      setTargetBenchmarkLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setTargetBenchmarkLoading(true);
      try {
        const res = await fetch('/api/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            job_title: cleanJob,
            salary: targetSalary,
            ...(benchmarkExperience ? { experience: benchmarkExperience } : {}),
            ...(benchmarkMarketLocation ? { market_location: benchmarkMarketLocation } : {}),
            ...(benchmarkWorkProvince ? { work_province: benchmarkWorkProvince } : {}),
          }),
        });
        if (!res.ok) throw new Error('benchmark failed');
        const data = await res.json();
        const thresholdPreview = Array.isArray(data.benchmark?.thresholdPreview)
          ? data.benchmark.thresholdPreview as RoadmapBenchmarkRow[]
          : [];
        const targetPercent = normalizeTopPercent(data.percent);
        const sourcePercent = normalizeTopPercent(currentPercent);
        const currentLabel = sourcePercent
          ? getBenchmarkDisplayLabel(sourcePercent, cur, thresholdPreview)
          : getCompassLabelForSalary(cur, thresholdPreview);
        const scannedTargetLabel = targetPercent
          ? getBenchmarkDisplayLabel(targetPercent, targetSalary, thresholdPreview)
          : getCompassLabelForSalary(targetSalary, thresholdPreview);
        const targetLabel = sourcePercent && targetPercent && targetPercent > sourcePercent
          ? currentLabel
          : scannedTargetLabel;
        setTargetBenchmark({
          percent: targetPercent,
          label: targetLabel,
          currentLabel,
          targetLabel,
          confidenceLabel: data.benchmark?.confidenceLabel,
          matchedJobTitle: data.benchmark?.matchedJobTitle,
          thresholdPreview,
        });
      } catch {
        if (!controller.signal.aborted) setTargetBenchmark(null);
      } finally {
        if (!controller.signal.aborted) setTargetBenchmarkLoading(false);
      }
    }, 450);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [job, intentWithoutSelectedRole, cur, targetCalc?.target, currentPercent, benchmarkExperience, benchmarkMarketLocation, benchmarkWorkProvince]);

  const applyDraftProfile = (draft: Partial<RoadmapProfile>) => {
    const draftDuration = draft.duration === 3 || draft.duration === 6 || draft.duration === 9 || draft.duration === 12 ? draft.duration : duration;
    const draftName = cleanSharedName(draft.fullName || readSharedName());
    if (draftName) setName(draftName);
    const draftIntent = draft.roadmapIntent || detectRoadmapIntentPhrase(draft.job || '');
    if (draftIntent) setRoadmapIntent(draftIntent);
    if (draft.job) {
      if (detectRoadmapIntentPhrase(draft.job) && !draft.selectedRoleId) {
        setJob('');
        setCurrentPosition('');
      } else {
        setJob(String(draft.job));
        setCurrentPosition(String(draft.job));
      }
    }
    if (draft.currentJobTitle) setCurrentJobTitle(String(draft.currentJobTitle));
    setSelectedRoleId(typeof draft.selectedRoleId === 'string' ? draft.selectedRoleId : '');
    if (draft.salary) setCurrentSalary(formatMoneyInput(String(draft.salary)));
    const draftPercent = normalizeTopPercent(draft.percent);
    if (draftPercent) setCurrentPercent(draftPercent);
    if (draft.experience) setBenchmarkExperience(String(draft.experience));
    const draftMarketLocation = draft.marketLocation || draft.market_location;
    const draftWorkProvince = draft.workProvince || draft.work_province;
    if (draftMarketLocation) setBenchmarkMarketLocation(String(draftMarketLocation));
    if (draftWorkProvince) setBenchmarkWorkProvince(String(draftWorkProvince));
    if (draft.duration === 3 || draft.duration === 6 || draft.duration === 9 || draft.duration === 12) setDuration(draftDuration === 12 ? 9 : draftDuration);
    if (Number(draft.compassTargetSalary) > 0) setCompassTargetSalary(Number(draft.compassTargetSalary));
    if (draft.compassTargetLabel) setCompassTargetLabel(String(draft.compassTargetLabel));
    try {
      const savedPhone = readSharedPhone();
      if (savedPhone || draft.phone) setPhone(String(savedPhone || draft.phone));
    } catch {
      if (draft.phone) setPhone(String(draft.phone));
    }
    if (draft.accessCode) setRestoreAccessCode(String(draft.accessCode));
    if (draft.educationLevel) setEducationLevel(String(draft.educationLevel));
    if (draft.educationDetail) setEducationDetail(String(draft.educationDetail));
    if (draft.strongSkills) setStrongSkills(String(draft.strongSkills));
    if (draft.proofAssets) setProofAssets(String(draft.proofAssets));
    if (draft.bottleneck) setBottleneck(String(draft.bottleneck));
    if (draft.preferredPath) setPreferredPath(String(draft.preferredPath));
    if (draft.weeklyTime) setWeeklyTime(String(draft.weeklyTime));
    const draftCompassTarget = Number(draft.compassTargetSalary || 0);
    setTwoYearGoal(draft.job
      ? draftCompassTarget > 0
        ? `Chạm ${draft.compassTargetLabel || 'đích La Bàn'} khoảng ${formatSalaryShort(draftCompassTarget)}/tháng; ${formatDurationLabel(draftDuration)} tới là mốc trung gian có bằng chứng.`
        : `Lên mốc lương/level cao hơn cho ${draft.job} trong ${formatDurationLabel(draftDuration)} tới`
      : '');
  };

  const clearRoadmapSession = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    setRoadmap(null);
    setProgress({});
    setEvidenceLog({});
    setVspiId('');
    setProfile(null);
    setRoadmapIntent('');
    setCurrentJobTitle('');
    setSelectedRoleId('');
    setPollCount(0);
    setGenerating(false);
    setShowCertificate(false);
    setError('');
    setRoleSuggestions([]);
  };

  const persistRoadmapProfile = (nextProfile: RoadmapProfile) => {
    try {
      const versionedProfile: RoadmapProfile = {
        ...nextProfile,
        cacheVersion: CLIENT_REPORT_CACHE_VERSION,
        savedAt: nextProfile.savedAt || Date.now(),
      };
      const payload = JSON.stringify(versionedProfile);
      localStorage.setItem(getRoadmapStorageKey(versionedProfile.vspiId, versionedProfile.accessCode), payload);
      localStorage.setItem(STORAGE_KEY, payload);
    } catch {
      /* ignore storage errors */
    }
  };

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  useEffect(() => {
    if (profile || step !== 'setup') return;
    const applyPhone = (value: string) => {
      const clean = cleanSharedPhone(value);
      if (isValidSharedPhone(clean)) setPhone(clean);
    };
    const applyName = (value: string) => {
      const clean = cleanSharedName(value);
      if (clean) setName(clean);
    };
    applyPhone(readSharedPhone());
    applyName(readSharedName());
    const onSharedPhone = (event: Event) => applyPhone((event as CustomEvent<string>).detail || '');
    const onSharedName = (event: Event) => applyName((event as CustomEvent<string>).detail || '');
    window.addEventListener(SHARED_PHONE_EVENT, onSharedPhone);
    window.addEventListener(SHARED_FULL_NAME_EVENT, onSharedName);
    return () => {
      window.removeEventListener(SHARED_PHONE_EVENT, onSharedPhone);
      window.removeEventListener(SHARED_FULL_NAME_EVENT, onSharedName);
    };
  }, [profile, step]);

  useEffect(() => {
    const id = vspiId || profile?.vspiId;
    if (!id) return;
    try {
      const saved = localStorage.getItem(getEvidenceStorageKey(id));
      if (saved) setEvidenceLog(prev => ({ ...JSON.parse(saved), ...prev }));
    } catch {
      /* ignore */
    }
  }, [vspiId, profile?.vspiId]);

  // ── Thinking pulse while roadmap is being generated ────────────────────
  useEffect(() => {
    if (generating) {
      startThinkingPulse();
      return () => stopThinkingPulse();
    }
    stopThinkingPulse();
  }, [generating]);


  // ── Auto-restore khi load trang ──────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const wantsNew = params.get('new') === '1';
    const wantsRestore = params.get('restore') === '1';
    const queryJob = params.get('job')?.trim();
    const querySalary = Number(params.get('salary') || 0);
    const queryDuration = Number(params.get('duration') || 6);
    const queryTargetSalary = Number(params.get('targetSalary') || 0);
    const queryTargetLabel = params.get('targetLabel')?.trim();
    const queryPercent = normalizeTopPercent(params.get('percent'));
    const queryExperience = params.get('experience')?.trim();
    const queryMarketLocation = params.get('marketLocation')?.trim() || params.get('market_location')?.trim();
    const queryWorkProvince = params.get('workProvince')?.trim() || params.get('work_province')?.trim();
    const queryName = params.get('name')?.trim();
    const queryRoleId = params.get('roleId')?.trim() || params.get('selectedRoleId')?.trim() || params.get('selected_role_id')?.trim();
    const queryBenchmarkRole = params.get('benchmarkRole')?.trim() || params.get('benchmarkMatchedRole')?.trim();
    const premiumDraft = readPremiumRoadmapProfile();
    if (wantsNew || queryJob || querySalary > 0) {
      try {
        const savedProfile = repairMojibakeDeep<RoadmapProfile>(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'));
        if (!hasCurrentClientCacheVersion(savedProfile)) {
          localStorage.removeItem(STORAGE_KEY);
          throw new Error('stale_roadmap_cache');
        }
        const savedRecent = !savedProfile.savedAt || Date.now() - savedProfile.savedAt < DRAFT_MAX_AGE_MS;
        const sameJob = !queryJob || normalizeText(savedProfile.job || '') === normalizeText(queryJob);
        const sameSalary = !querySalary || Math.abs(Number(savedProfile.salary || 0) - querySalary) < 1000;
        const sameDuration = !queryDuration || Number(savedProfile.duration || 0) === (queryDuration === 12 ? 9 : queryDuration);
        if (!wantsNew && savedProfile.vspiId && savedRecent && sameJob && sameSalary && sameDuration) {
          if (!savedProfile.accessCode) savedProfile.accessCode = getRoadmapAccessCode(savedProfile.vspiId);
          setProfile(savedProfile);
          setRoadmapIntent(savedProfile.roadmapIntent || '');
          setCurrentJobTitle(savedProfile.currentJobTitle || '');
          setSelectedRoleId(savedProfile.selectedRoleId || '');
          setVspiId(savedProfile.vspiId);
          if (savedProfile.fullName) setName(savedProfile.fullName);
          setJob(savedProfile.job || '');
          setCurrentSalary(formatMoneyInput(String(savedProfile.salary || '')));
          setCurrentPercent(normalizeTopPercent(savedProfile.percent));
          setBenchmarkExperience(savedProfile.experience || '');
          setBenchmarkMarketLocation(savedProfile.marketLocation || savedProfile.market_location || '');
          setBenchmarkWorkProvince(savedProfile.workProvince || savedProfile.work_province || '');
          if (savedProfile.duration) setDuration((savedProfile.duration === 12 ? 9 : savedProfile.duration) as 3 | 6 | 9);
          setCompassTargetSalary(Number(savedProfile.compassTargetSalary || 0));
          setCompassTargetLabel(savedProfile.compassTargetLabel || '');
          setPhone(savedProfile.phone || readSharedPhone());
          setCurrentPosition(savedProfile.currentPosition || savedProfile.job || '');
          setMainWeakness(savedProfile.mainWeakness || '');
          setTwoYearGoal(savedProfile.twoYearGoal || '');
          setEducationLevel(savedProfile.educationLevel || '');
          setEducationDetail(savedProfile.educationDetail || '');
          setStrongSkills(savedProfile.strongSkills || '');
          setProofAssets(savedProfile.proofAssets || '');
          setBottleneck(savedProfile.bottleneck || '');
          setPreferredPath(savedProfile.preferredPath || 'deal_internal');
          setWeeklyTime(savedProfile.weeklyTime || '3-5 giờ/tuần');
          setPrivacyConsent(true);
          setStep('qr');
          setError('');
          return;
        }
      } catch {
        /* ignore stale storage */
      }
      clearRoadmapSession();
      setJob('');
      setRoadmapIntent('');
      setCurrentJobTitle('');
      setCurrentSalary('');
      setSelectedRoleId('');
      setCurrentPercent(0);
      setBenchmarkExperience('');
      setBenchmarkMarketLocation('');
      setBenchmarkWorkProvince('');
      setCurrentPosition('');
      setCompassTargetSalary(0);
      setCompassTargetLabel('');
      setMainWeakness('');
      setTwoYearGoal('');
      setEducationLevel('');
      setEducationDetail('');
      setStrongSkills('');
      setProofAssets('');
      setBottleneck('');
      setPreferredPath('deal_internal');
      setWeeklyTime('3-5 giờ/tuần');
      setPrivacyConsent(false);
      const draftFromQuery: Partial<RoadmapProfile> = {};
      if (queryName) draftFromQuery.fullName = queryName;
      if (queryJob) draftFromQuery.job = queryJob;
      if (queryRoleId) draftFromQuery.selectedRoleId = queryRoleId;
      if (queryBenchmarkRole) draftFromQuery.benchmarkMatchedRole = queryBenchmarkRole;
      if (Number.isFinite(querySalary) && querySalary > 0) draftFromQuery.salary = querySalary;
      if (queryPercent) draftFromQuery.percent = queryPercent;
      if (queryExperience) draftFromQuery.experience = queryExperience;
      if (queryMarketLocation) draftFromQuery.marketLocation = queryMarketLocation;
      if (queryWorkProvince) draftFromQuery.workProvince = queryWorkProvince;
      if (queryDuration === 3 || queryDuration === 6 || queryDuration === 9 || queryDuration === 12) draftFromQuery.duration = queryDuration === 12 ? 9 : queryDuration;
      if (Number.isFinite(queryTargetSalary) && queryTargetSalary > 0) draftFromQuery.compassTargetSalary = queryTargetSalary;
      if (queryTargetLabel) draftFromQuery.compassTargetLabel = queryTargetLabel;

      try {
        const savedDraft = repairMojibakeDeep<Partial<RoadmapProfile> & { savedAt?: number }>(JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'));
        if (!hasCurrentClientCacheVersion(savedDraft)) {
          localStorage.removeItem(DRAFT_KEY);
          throw new Error('stale_roadmap_draft');
        }
        const freshDraft = savedDraft.savedAt && Date.now() - savedDraft.savedAt < DRAFT_MAX_AGE_MS ? savedDraft : {};
        applyDraftProfile({ duration: 6, ...freshDraft, ...premiumDraft, ...draftFromQuery });
      } catch {
        applyDraftProfile({ duration: 6, ...premiumDraft, ...draftFromQuery });
      }

      setStep('setup');
      return;
    }

    const saved = wantsRestore ? localStorage.getItem(STORAGE_KEY) : null;
    if (!saved) {
      try {
        const savedDraft = repairMojibakeDeep<Partial<RoadmapProfile> & { savedAt?: number }>(JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}'));
        if (!hasCurrentClientCacheVersion(savedDraft)) {
          localStorage.removeItem(DRAFT_KEY);
          throw new Error('stale_roadmap_draft');
        }
        if (savedDraft.savedAt && Date.now() - savedDraft.savedAt < DRAFT_MAX_AGE_MS) {
          applyDraftProfile({ ...savedDraft, ...premiumDraft });
        } else if (premiumDraft.job || premiumDraft.salary) {
          applyDraftProfile(premiumDraft);
        }
      } catch {
        if (premiumDraft.job || premiumDraft.salary) applyDraftProfile(premiumDraft);
      }
      return;
    }
    try {
      const p = repairMojibakeDeep<RoadmapProfile>(JSON.parse(saved));
      if (!hasCurrentClientCacheVersion(p)) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }
      if (!p.vspiId) return;
      if (!p.accessCode) p.accessCode = getRoadmapAccessCode(p.vspiId);
      if (p.fullName) setName(p.fullName);
      setProfile(p);
      setRoadmapIntent(p.roadmapIntent || '');
      setCurrentJobTitle(p.currentJobTitle || '');
      setSelectedRoleId(p.selectedRoleId || '');
      setVspiId(p.vspiId);
      if (wantsRestore) {
        setGenerating(true);
        // Thử load bằng vspiId trước
        const savedAccessCode = p.accessCode || getRoadmapAccessCode(p.vspiId);
        fetch(`/api/roadmap/generate?id=${encodeURIComponent(p.vspiId)}&accessCode=${encodeURIComponent(savedAccessCode)}&t=${Date.now()}`)
          .then(r => r.json())
          .then(async data => {
            if (data.status === 'paid') {
              const cleanRoadmapJson = cleanRoadmapData(data.roadmap_json);
              if (cleanRoadmapJson) {
                setRoadmap(cleanRoadmapJson);
                applyProgressPayload(data.task_progress || {});
                if (cleanRoadmapJson.intake) {
                  setCurrentPosition(cleanRoadmapJson.intake.currentPosition || p.currentPosition || p.job || '');
                  setMainWeakness(cleanRoadmapJson.intake.mainWeakness || p.mainWeakness || '');
                  setTwoYearGoal(cleanRoadmapJson.intake.twoYearGoal || p.twoYearGoal || '');
                  setEducationLevel(cleanRoadmapJson.intake.educationLevel || p.educationLevel || '');
                  setEducationDetail(cleanRoadmapJson.intake.educationDetail || p.educationDetail || '');
                  setStrongSkills(cleanRoadmapJson.intake.strongSkills || p.strongSkills || '');
                  setProofAssets(cleanRoadmapJson.intake.proofAssets || p.proofAssets || '');
                  setBottleneck(cleanRoadmapJson.intake.bottleneck || p.bottleneck || '');
                  setPreferredPath(cleanRoadmapJson.intake.preferredPath || p.preferredPath || 'deal_internal');
                  setWeeklyTime(cleanRoadmapJson.intake.weeklyTime || p.weeklyTime || '3-5 giờ/tuần');
                }
                setGenerating(false);
                setStep('roadmap');
              } else {
                setGenerating(false);
                setStep('intake');
              }
            }
            // pending → ở setup, user thấy form đã điền sẵn
          })
          .catch(() => {})
          .finally(() => setGenerating(false));
      }
      // Pre-fill form
      setJob(p.job || '');
      setCurrentSalary(formatMoneyInput(String(p.salary || '')));
      setCurrentPercent(normalizeTopPercent(p.percent));
      setBenchmarkExperience(p.experience || '');
      setBenchmarkMarketLocation(p.marketLocation || p.market_location || '');
      setBenchmarkWorkProvince(p.workProvince || p.work_province || '');
      if (p.duration) setDuration((p.duration === 12 ? 9 : p.duration) as 3 | 6 | 9);
      setCompassTargetSalary(Number(p.compassTargetSalary || 0));
      setCompassTargetLabel(p.compassTargetLabel || '');
      setPhone(p.phone || '');
      if (p.fullName) setName(p.fullName);
      setCurrentPosition(p.currentPosition || p.job || '');
      setMainWeakness(p.mainWeakness || '');
      setTwoYearGoal(p.twoYearGoal || '');
      setEducationLevel(p.educationLevel || '');
      setEducationDetail(p.educationDetail || '');
      setStrongSkills(p.strongSkills || '');
      setProofAssets(p.proofAssets || '');
      setBottleneck(p.bottleneck || '');
      setPreferredPath(p.preferredPath || 'deal_internal');
      setWeeklyTime(p.weeklyTime || '3-5 giờ/tuần');
    } catch { /* ignore */ }
    // Restore should run only on first load; these helpers intentionally read initial browser storage/query state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Tạo đơn hàng ─────────────────────────────────────────────────────────
  const handleSetup = async () => {
    if (setupDisabledReason) {
      if (!effectiveSelectedRoleId && job.trim() && !detectedJobIntent) {
        setRoleSuggestions(findClosestRoleProfiles(job, 3).map(profile => ({
          role_id: profile.key,
          title: profile.title,
          industry: profile.industry,
        })));
      }
      setError(setupDisabledReason);
      return;
    }
    if (!name.trim()) { setError('Nhập họ tên của bạn'); return; }
    const cleanPhone = cleanSharedPhone(phone);
    if (!isValidSharedPhone(cleanPhone)) {
      setError('Nhập SĐT hợp lệ (VD: 0901234567)'); return;
    }
    if (intentRequiresRoleSelection) {
      setRoleSuggestions([]);
      setError(`${roadmapIntentContext?.prompt || 'Chọn nghề cụ thể trước khi tạo lộ trình.'} Mẫu định hướng không phải nghề để benchmark.`);
      return;
    }
    if (!job.trim()) { setError('Nhập nghề nghiệp'); return; }
    if (!cur || cur < 1_000_000) { setError('Nhập lương hiện tại hợp lệ'); return; }
    if (!privacyConsent) { setError('Vui lòng đồng ý xử lý dữ liệu để tạo lộ trình và hỗ trợ sau mua'); return; }
    if (!targetCalc) return;
    if (effectiveSelectedRoleId && selectedRoleId !== effectiveSelectedRoleId) setSelectedRoleId(effectiveSelectedRoleId);

    setError(''); setCreating(true);
    try {
      saveSharedPhone(cleanPhone);
      saveSharedName(name);
    } catch { /* ignore storage errors */ }
    trackFunnelEvent('initiate_checkout', {
      job: job.trim() || 'unknown',
      city: benchmarkWorkProvince || benchmarkMarketLocation || 'unknown',
      percentile: normalizeTopPercent(currentPercent),
      package: '79k',
    });
    try {
      const goalLabel = targetCalc.compassTarget > 0
        ? `Mốc ${duration} tháng: ${formatSalaryShort(targetCalc.target)}/tháng trên đường tới ${targetCalc.compassTargetLabel} ${formatSalaryShort(targetCalc.compassTarget)}/tháng`
        : `Tăng ${((targetCalc.target - cur) / 1_000_000).toFixed(1)} triệu trong ${duration} tháng`;
      const res = await fetch('/api/roadmap/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...getAttributionPayload(),
          phone: cleanPhone,
          job_title: job.trim(),
          roadmapIntent: activeRoadmapIntent || undefined,
          currentJobTitle: currentJobTitle.trim() || undefined,
          selectedRoleId: effectiveSelectedRoleId || undefined,
          current_salary: cur,
          target_salary: targetCalc.target,
          duration_months: duration,
          goal_label: goalLabel,
          experience: benchmarkExperience || undefined,
          market_location: benchmarkMarketLocation || undefined,
          work_province: benchmarkWorkProvince || undefined,
          privacyConsent,
          website,
          formStartedAt: formStartedAtRef.current,
        }),
      });
      const data = await res.json().catch(() => null) as ({ error?: string; code?: string; suggestions?: RoleSuggestion[]; vspiId?: string; accessCode?: string; role_id?: string } | null);
      if (!res.ok) {
        setRoleSuggestions(Array.isArray(data?.suggestions) ? data.suggestions : []);
        setError(safeRoadmapErrorMessage(data));
        return;
      }
      setRoleSuggestions([]);

      const newProfile: RoadmapProfile = {
        vspiId: data?.vspiId || '',
        accessCode: data?.accessCode || getRoadmapAccessCode(data?.vspiId),
        fullName: cleanSharedName(name),
        phone: cleanPhone,
        job: job.trim(), roadmapIntent: activeRoadmapIntent || undefined, currentJobTitle: currentJobTitle.trim() || undefined, selectedRoleId: data?.role_id || effectiveSelectedRoleId || undefined, salary: cur, duration,
        percent: normalizeTopPercent(currentPercent) || undefined,
        experience: benchmarkExperience || undefined,
        marketLocation: benchmarkMarketLocation || undefined,
        workProvince: benchmarkWorkProvince || undefined,
        compassTargetSalary: targetCalc.compassTarget || undefined,
        compassTargetLabel: targetCalc.compassTarget > 0 ? targetCalc.compassTargetLabel : undefined,
        savedAt: Date.now(),
      };
      setVspiId(data?.vspiId || '');
      setProfile(newProfile);
      setCurrentPosition(currentJobTitle.trim() || job.trim());
      setMainWeakness('');
      setTwoYearGoal(targetCalc.compassTarget > 0
        ? `Chạm ${targetCalc.compassTargetLabel} khoảng ${formatSalaryShort(targetCalc.compassTarget)}/tháng; ${durationLabel} tới là mốc ${formatSalaryShort(targetCalc.target)}/tháng có bằng chứng.`
        : `${(targetCalc.target / 1_000_000).toFixed(1)} triệu/tháng trong ${durationLabel} tới`);
      persistRoadmapProfile(newProfile);
      setStep('qr');
    } catch { setError('Lỗi kết nối'); }
    finally { setCreating(false); }
  };

  // ── Restore bằng SĐT ─────────────────────────────────────────────────────
  const handleRestoreByPhone = async () => {
    const clean = restorePhone.replace(/\D/g, '');
    const code = cleanRoadmapAccessCode(restoreAccessCode);
    if (!clean || clean.length < 9) { setError('Nhập SĐT hợp lệ'); return; }
    if (code.length < 4) { setError('Nhập mã truy cập được cấp sau thanh toán'); return; }
    setError(''); setRestoreLoading(true);
    try {
      const res = await fetch(`/api/roadmap/generate?phone=${clean}&accessCode=${encodeURIComponent(code)}&t=${Date.now()}`);
      if (!res.ok) { setError('Không tìm thấy lộ trình hoặc mã truy cập chưa đúng'); return; }
      const data = await res.json();
      if (data.status !== 'paid') { setError('Lộ trình chưa được thanh toán'); return; }
      const cleanRoadmapJson = cleanRoadmapData(data.roadmap_json);

      const newProfile: RoadmapProfile = {
        vspiId: data.vspi_id,
        accessCode: data.accessCode || getRoadmapAccessCode(data.vspi_id),
        fullName: cleanSharedName(name || readSharedName()),
        phone: clean,
        job: data.job_title || '', selectedRoleId: data.role_id || undefined, salary: data.current_salary || 0, duration: data.duration_months || 6,
      };
      setVspiId(data.vspi_id);
      setSelectedRoleId(data.role_id || '');
      setProfile(newProfile);
      persistRoadmapProfile(newProfile);
      setCurrentPosition(cleanRoadmapJson?.intake?.currentPosition || data.job_title || '');
      setMainWeakness(cleanRoadmapJson?.intake?.mainWeakness || '');
      setTwoYearGoal(cleanRoadmapJson?.intake?.twoYearGoal || '');
      setEducationLevel(cleanRoadmapJson?.intake?.educationLevel || '');
      setEducationDetail(cleanRoadmapJson?.intake?.educationDetail || '');
      setStrongSkills(cleanRoadmapJson?.intake?.strongSkills || '');
      setProofAssets(cleanRoadmapJson?.intake?.proofAssets || '');
      setBottleneck(cleanRoadmapJson?.intake?.bottleneck || '');
      setPreferredPath(cleanRoadmapJson?.intake?.preferredPath || 'deal_internal');
      setWeeklyTime(cleanRoadmapJson?.intake?.weeklyTime || '3-5 giờ/tuần');

      if (cleanRoadmapJson) {
        setRoadmap(cleanRoadmapJson);
        applyProgressPayload(data.task_progress || {});
        setStep('roadmap');
      } else {
        setStep('intake');
      }
    } catch { setError('Lỗi kết nối'); }
    finally { setRestoreLoading(false); }
  };

  // ── Polling sau khi CK ───────────────────────────────────────────────────
  const startPolling = () => {
    setStep('checking'); let count = 0;
    pollRef.current = setInterval(async () => {
      count++; setPollCount(count);
      try {
        const res = await fetch(`/api/roadmap/generate?id=${encodeURIComponent(vspiId)}&accessCode=${encodeURIComponent(activeAccessCode)}&t=${Date.now()}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === 'paid') {
          clearInterval(pollRef.current!);
          playSuccess();
          vibrate([20, 40, 25]);
          trackFunnelEvent('purchase_success', {
            job: profile?.job || job.trim() || 'unknown',
            city: 'unknown',
            percentile: 0,
            package: '79k',
          });
          const cleanRoadmapJson = cleanRoadmapData(data.roadmap_json);
          if (cleanRoadmapJson) {
            setRoadmap(cleanRoadmapJson);
            applyProgressPayload(data.task_progress || {});
            setStep('roadmap');
          } else {
            setStep('intake');
          }
        }
      } catch { /* retry */ }
      if (count >= 15) {
        clearInterval(pollRef.current!); setStep('qr');
        setError('Chưa nhận được xác nhận. Liên hệ Zalo: 0915 662 876');
      }
    }, 8000);
  };

  const loadRoadmap = async () => {
    if (!currentPosition.trim()) { setError('Nhập vị trí hiện tại của bạn'); return; }
    if (!twoYearGoal.trim() || isLowInfoSurveyValue(twoYearGoal)) { setError(`Nhập mục tiêu cụ thể trong ${durationLabel}: mức lương, chức vụ hoặc band muốn chạm`); return; }
    if (!educationLevel.trim()) { setError('Chọn trình độ học vấn cao nhất'); return; }
    const cleanMainWeakness = isLowInfoSurveyValue(mainWeakness) ? '' : mainWeakness.trim();
    const cleanEducationDetail = isLowInfoSurveyValue(educationDetail) ? '' : educationDetail.trim();
    const cleanStrongSkills = isLowInfoSurveyValue(strongSkills) ? '' : strongSkills.trim();
    const cleanProofAssets = isLowInfoSurveyValue(proofAssets) ? '' : proofAssets.trim();
    const cleanBottleneck = isLowInfoSurveyValue(bottleneck) ? '' : bottleneck.trim();
    const authoritativeJob = job.trim() || profile?.job || currentPosition.trim();
    const safeCurrentPosition = sanitizeRoadmapCurrentPosition(authoritativeJob, currentPosition.trim());
    setGenerating(true);
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'auto' }), 180);
    vibrate([15, 30, 15]);
    try {
      const res = await fetch('/api/roadmap/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vspiId,
          accessCode: activeAccessCode,
          currentPosition: safeCurrentPosition,
          mainWeakness: cleanMainWeakness,
          twoYearGoal: twoYearGoal.trim(),
          educationLevel: educationLevel.trim(),
          educationDetail: cleanEducationDetail,
          strongSkills: cleanStrongSkills,
          proofAssets: cleanProofAssets,
          bottleneck: cleanBottleneck,
          preferredPath,
          weeklyTime,
        }),
      });
      const data = await res.json().catch(() => null) as ({ roadmap?: RoadmapData; progress?: Record<string, boolean>; error?: string; code?: string; suggestions?: RoleSuggestion[] } | null);
      if (!res.ok) {
        setRoleSuggestions(Array.isArray(data?.suggestions) ? data.suggestions : []);
        setError(safeRoadmapErrorMessage(data));
        return;
      }
      setRoleSuggestions([]);
      const cleanRoadmap = cleanRoadmapData(data?.roadmap);
      if (cleanRoadmap) {
        const baseProfile: RoadmapProfile | null = profile || (vspiId ? {
          vspiId,
          accessCode: activeAccessCode,
          fullName: cleanSharedName(name || readSharedName()),
          phone: phone.replace(/\s/g, ''),
          job: authoritativeJob,
          selectedRoleId: selectedRoleId || undefined,
          salary: cur,
          duration,
          percent: normalizeTopPercent(currentPercent) || undefined,
          experience: benchmarkExperience || undefined,
          marketLocation: benchmarkMarketLocation || undefined,
          workProvince: benchmarkWorkProvince || undefined,
        } : null);
        const updatedProfile: RoadmapProfile | null = baseProfile ? {
          ...baseProfile,
          job: authoritativeJob,
          selectedRoleId: selectedRoleId || baseProfile.selectedRoleId,
          currentPosition: safeCurrentPosition,
          mainWeakness: cleanMainWeakness,
          twoYearGoal: twoYearGoal.trim(),
          educationLevel: educationLevel.trim(),
          educationDetail: cleanEducationDetail,
          strongSkills: cleanStrongSkills,
          proofAssets: cleanProofAssets,
          bottleneck: cleanBottleneck,
          preferredPath,
          weeklyTime,
          percent: normalizeTopPercent(currentPercent) || baseProfile.percent,
          experience: benchmarkExperience || baseProfile.experience,
          marketLocation: benchmarkMarketLocation || baseProfile.marketLocation || baseProfile.market_location,
          workProvince: benchmarkWorkProvince || baseProfile.workProvince || baseProfile.work_province,
          savedAt: Date.now(),
        } : null;
        if (updatedProfile) {
          setProfile(updatedProfile);
          persistRoadmapProfile(updatedProfile);
        }
        setRoadmap(cleanRoadmap);
        applyProgressPayload(data?.progress || {});
        playSuccess();
        setStep('roadmap');
      } else {
        setError(safeRoadmapErrorMessage(data));
      }
    } catch { setError(SAFE_ROADMAP_GENERATION_ERROR); }
    finally { setGenerating(false); }
  };

  const toggleTaskKey = async (key: string) => {
    const newVal = !progress[key];
    setProgress(p => ({ ...p, [key]: newVal }));
    fetch('/api/roadmap/progress', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vspiId, accessCode: activeAccessCode, taskKey: key, done: newVal }),
    }).catch(() => {});
  };

  const toggleTask = async (wi: number, ti: number) => {
    await toggleTaskKey(`w${wi}_t${ti}`);
  };

  const submitTaskEvidence = (key: string, evidence: RoadmapEvidence) => {
    const cleanEvidence: RoadmapEvidence = {
      ...(evidence.note?.trim() ? { note: evidence.note.trim() } : {}),
      ...(evidence.fileName?.trim() ? { fileName: evidence.fileName.trim() } : {}),
      submittedAt: new Date().toISOString(),
    };
    if (!cleanEvidence.note && !cleanEvidence.fileName) return;
    const nextEvidence = { ...evidenceLog, [key]: cleanEvidence };
    setEvidenceLog(nextEvidence);
    setProgress(p => ({ ...p, [key]: true }));
    const id = vspiId || profile?.vspiId;
    if (id) {
      try {
        localStorage.setItem(getEvidenceStorageKey(id), JSON.stringify(nextEvidence));
      } catch {
        /* ignore */
      }
    }
    fetch('/api/roadmap/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vspiId: id, accessCode: activeAccessCode, taskKey: key, done: true, evidence: cleanEvidence }),
    }).catch(() => {});
  };

  const getStats = () => {
    if (!roadmap) return { done: 0, total: 0, pct: 0 };
    const actionTasks = flattenActionTasks(roadmap.actionPlan);
    if (actionTasks.length) {
      const done = actionTasks.filter(item => progress[item.key]).length;
      return { done, total: actionTasks.length, pct: Math.round((done / actionTasks.length) * 100) };
    }
    let total = 0, done = 0;
    (roadmap.weeks || []).forEach((w, wi) => w.tasks.forEach((_, ti) => {
      total++; if (progress[`w${wi}_t${ti}`]) done++;
    }));
    return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  };

  const stats      = getStats();
  const cleanVspi  = vspiId.replace(/-/g, '').toUpperCase();
  const isExpertRoadmap = Boolean(roadmap?.markdown || roadmap?.format === 'expert_v2');

  // ════════════════════════════════════════════════════════════════════════
  // RENDER — Loading restore
  // ════════════════════════════════════════════════════════════════════════
  if (generating && step !== 'checking') return (
    <RoadmapGeneratingSkeleton duration={duration} />
  );

  // ── STEP: SETUP ──────────────────────────────────────────────────────────
  if (step === 'setup') return (
    <div className="min-h-screen w-full max-w-[100svw] overflow-x-clip bg-[#0a0c10] px-3 pb-4 pt-[max(1rem,env(safe-area-inset-top))] font-sans text-[#f0ede8] sm:px-4">
      <div className="mx-auto w-full max-w-[min(100%,22.5rem)] pt-8 space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 bg-[#e8b84b]/10 border border-[#e8b84b]/30 rounded-full px-4 py-1.5 mb-4">
            <span className="text-[#e8b84b] text-xs font-black">VSPI ROADMAP</span>
            <span className="bg-red-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">79K</span>
          </div>
          <h1 className="text-2xl font-black text-[#f0ede8] mb-2 leading-tight">
            Lộ trình tăng lương<br />
            <span className="text-[#e8b84b]">AI cá nhân hóa để nâng cấp phiên bản nghề nghiệp của bạn</span>
          </h1>
          <p className="text-sm text-[#f0ede8]/55 leading-relaxed">
            29K cho bạn biết đang ở đâu và nên neo mốc lương nào. 79K biến mốc đó thành danh sách việc từng tuần: việc cần làm, bằng chứng cần lưu, KPI cần chứng minh và câu nên nói khi review lương.
          </p>
          <p className="mt-2 text-[10px] leading-relaxed text-[#f0ede8]/38">
            Lộ trình được tạo bằng AI trên bộ quy tắc nghề nghiệp của Top Lương, không phải tư vấn 1-1 bởi chuyên gia người thật.
          </p>
        </div>

        <div className="bg-[#0f1219] border border-[#e8b84b]/20 rounded-2xl p-4 grid grid-cols-2 gap-2">
          {[
            'Danh sách việc từng tuần',
            'Sổ bằng chứng để lưu kết quả',
            'KPI trước/sau cần chứng minh',
            'Câu review lương nên nói',
            'Bản đồ kỹ năng đúng nghề',
            'Chứng nhận + link xác thực',
          ].map(item => (
            <div key={item} className="bg-[#161b26] border border-white/8 rounded-xl px-3 py-2">
              <p className="text-[10px] text-[#f0ede8]/70 font-bold">✓ {item}</p>
            </div>
          ))}
          <p className="col-span-2 text-[10px] text-[#f0ede8]/35 leading-relaxed mt-1">
            79k không bán lời hứa tăng lương. Nó bán một hệ thống giúp bạn nâng cấp lên phiên bản làm việc có bằng chứng hơn: biết phải làm gì mỗi tuần, lưu gì vào hồ sơ, và khi nào đủ cơ sở để nói chuyện với sếp hoặc HR.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-2">
          {ROADMAP_PRESETS.map(preset => (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset)}
              className="bg-[#0f1219] border border-white/10 hover:border-[#e8b84b]/50 rounded-2xl p-4 text-left transition-all"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-[#f0ede8]">{preset.title}</p>
                  <p className="text-[11px] text-[#f0ede8]/45 leading-relaxed mt-1">{preset.note}</p>
                </div>
                <span className="text-[9px] font-mono font-black text-[#e8b84b] border border-[#e8b84b]/30 rounded-full px-2 py-1">
                  Dùng mẫu
                </span>
              </div>
            </button>
          ))}
        </div>

        {roadmapIntentContext && (
          <div className="rounded-2xl border border-[#e8b84b]/25 bg-[#e8b84b]/8 p-4">
            <p className="text-[10px] font-mono font-black uppercase tracking-[0.16em] text-[#e8b84b]">
              {roadmapIntentContext.label}
            </p>
            <p className="mt-1 text-[12px] font-bold leading-relaxed text-[#f0ede8]">
              {roadmapIntentContext.prompt}
            </p>
            <div className="mt-3 grid gap-2 text-[11px] font-bold text-[#f0ede8]/70 sm:grid-cols-3">
              <div className="rounded-xl border border-white/10 bg-[#0f1219] px-3 py-2">Chọn nhóm ngành</div>
              <div className="rounded-xl border border-white/10 bg-[#0f1219] px-3 py-2">Chọn nghề gần nhất</div>
              <div className="rounded-xl border border-white/10 bg-[#0f1219] px-3 py-2">Nhập nghề mong muốn</div>
            </div>
            <p className="mt-3 text-[10px] leading-relaxed text-[#f0ede8]/45">
              Hệ thống chỉ tính benchmark và tạo lộ trình sau khi có nghề cụ thể khớp bộ role profile. Các mẫu định hướng không được dùng như job title.
            </p>
          </div>
        )}

        <div className="w-full overflow-hidden bg-[#0f1219] border border-white/10 rounded-2xl p-4 space-y-4 sm:p-6">
          {/* Họ tên */}
          <div>
            <label className="text-[10px] font-mono font-bold text-[#f0ede8]/60 uppercase block mb-1.5">Họ và tên <span className="text-red-400">*</span></label>
            <input type="text" placeholder="VD: Nguyễn Văn A"
              className="w-full bg-[#161b26] border border-white/10 rounded-xl px-4 py-3 text-sm text-[#f0ede8] outline-none focus:border-[#e8b84b] placeholder:text-[#f0ede8]/20"
              value={name} onChange={e => setName(e.target.value)} onBlur={e => saveSharedName(e.target.value)} />
          </div>

          {/* SĐT — bắt buộc, dùng để khôi phục */}
          <div>
            <label className="text-[10px] font-mono font-bold text-[#f0ede8]/60 uppercase block mb-1.5">
              SĐT / Zalo <span className="text-red-400">*</span>
              <span className="text-[#e8b84b] ml-1 normal-case font-normal">(dùng để xem lại lộ trình)</span>
            </label>
            <input type="tel" placeholder="0901234567"
              className="w-full bg-[#161b26] border border-white/10 rounded-xl px-4 py-3 text-sm text-[#f0ede8] outline-none focus:border-[#e8b84b] placeholder:text-[#f0ede8]/20"
              value={phone} onChange={e => {
                const nextPhone = cleanSharedPhone(e.target.value);
                setPhone(nextPhone);
                saveSharedPhone(nextPhone);
              }} />
            <p className="text-[9px] text-[#f0ede8]/30 mt-1 pl-1">Sau thanh toán bạn sẽ nhận thêm mã truy cập riêng để bảo mật lộ trình</p>
          </div>

          {activeRoadmapIntent === 'career_switch' && (
            <div>
              <label className="text-[10px] font-mono font-bold text-[#f0ede8]/60 uppercase block mb-1.5">Nghề hiện tại</label>
              <input type="text" placeholder="VD: Nhân viên hành chính, Sales, Kế toán..."
                className="w-full bg-[#161b26] border border-white/10 rounded-xl px-4 py-3 text-sm text-[#f0ede8] outline-none focus:border-[#e8b84b] placeholder:text-[#f0ede8]/20"
                value={currentJobTitle} onChange={e => setCurrentJobTitle(e.target.value)} />
            </div>
          )}

          {/* Nghề nghiệp */}
          <div>
            <label className="text-[10px] font-mono font-bold text-[#f0ede8]/60 uppercase block mb-1.5">
              {activeRoadmapIntent === 'career_switch' ? 'Nghề mục tiêu' : 'Nghề nghiệp'} <span className="text-red-400">*</span>
            </label>
            <input ref={jobInputRef} type="text" placeholder={roadmapJobPlaceholder}
              className="w-full bg-[#161b26] border border-white/10 rounded-xl px-4 py-3 text-sm text-[#f0ede8] outline-none focus:border-[#e8b84b] placeholder:text-[#f0ede8]/20"
              value={job} onChange={e => {
                const nextJob = e.target.value;
                setSelectedRoleId('');
                setJob(nextJob);
                const detectedIntent = detectRoadmapIntentPhrase(nextJob);
                if (detectedIntent) setRoadmapIntent(detectedIntent);
              }} />
            {effectiveSelectedRoleId ? (
              <p className="mt-1 rounded-lg border border-green-400/25 bg-green-400/10 px-3 py-2 text-[10px] font-bold leading-relaxed text-green-300">
                Đã khớp nghề: {effectiveSelectedRoleTitle || job.trim()}
              </p>
            ) : job.trim() && !detectedJobIntent ? (
              <p className="mt-1 rounded-lg border border-[#e8b84b]/25 bg-[#e8b84b]/8 px-3 py-2 text-[10px] font-bold leading-relaxed text-[#e8b84b]">
                Chưa chọn nghề chuẩn - vui lòng chọn nghề trong danh sách.
              </p>
            ) : null}
            {intentRequiresRoleSelection && (
              <p className="mt-1 text-[10px] leading-relaxed text-[#e8b84b]">
                Chọn hoặc nhập một nghề cụ thể trước. Mẫu định hướng không được gửi đi như job_title.
              </p>
            )}
          </div>

          {/* Lương hiện tại */}
          <div>
            <label className="text-[10px] font-mono font-bold text-[#f0ede8]/60 uppercase block mb-1.5">Lương hiện tại (VNĐ/tháng) <span className="text-red-400">*</span></label>
            <input type="text" inputMode="numeric" placeholder="VD: 13,000,000"
              className="w-full bg-[#161b26] border border-white/10 rounded-xl px-4 py-3 text-sm text-[#f0ede8] outline-none focus:border-[#e8b84b] placeholder:text-[#f0ede8]/20"
              value={currentSalary} onChange={e => setCurrentSalary(formatMoneyInput(e.target.value))} />
            {cur > 0 && <p className="text-[10px] text-[#f0ede8]/35 mt-1 pl-1">≈ {(cur/1_000_000).toFixed(1)} triệu/tháng</p>}
          </div>

          {/* Thời gian */}
          <div>
            <label className="text-[10px] font-mono font-bold text-[#f0ede8]/60 uppercase block mb-2">Mục tiêu trong bao lâu?</label>
            <div className="grid min-w-0 grid-cols-3 gap-1.5 sm:gap-2">
              {([3, 6, 9] as const).map(d => (
                <button key={d} onClick={() => setDuration(d)}
                  className={`min-w-0 rounded-xl border-2 px-1 py-3 text-[12px] font-bold leading-none transition-all sm:text-sm ${duration === d ? 'border-[#e8b84b] bg-[#e8b84b]/10 text-[#e8b84b]' : 'border-white/10 bg-[#161b26] text-[#f0ede8]/50'}`}>
                  {`${d} tháng`}
                </button>
              ))}
            </div>
          </div>

          {/* Preview mục tiêu */}
          {targetCalc && cur > 0 && !targetCalc.compassTarget && (
            <div className="bg-[#161b26] border border-[#e8b84b]/20 rounded-xl p-4 space-y-2">
              <p className="text-[10px] font-mono text-[#e8b84b] uppercase tracking-wider">🎯 Mục tiêu hệ thống đề xuất</p>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-black leading-tight text-[#f0ede8]">{(targetCalc.target/1_000_000).toFixed(1)} triệu/tháng</p>
                  <p className="text-[11px] text-green-400 font-bold">{targetCalc.label}</p>
                  <p className="mt-1 text-[10px] font-bold text-[#e8b84b]">
                    {targetBenchmark?.targetLabel
                      ? `La Bàn: mốc ${targetBenchmark.targetLabel}`
                      : targetBenchmarkLoading
                        ? 'La Bàn đang tính mốc Top...'
                        : 'La Bàn sẽ hiện mốc Top theo benchmark nghề'}
                  </p>
                </div>
                <p className="shrink-0 text-right text-[9px] text-[#f0ede8]/35">trong {duration} tháng</p>
              </div>
              <p className="text-[10px] text-[#f0ede8]/45 leading-relaxed">{targetCalc.rationale}</p>
            </div>
          )}

          {targetCalc && cur > 0 && (
            <div className="overflow-hidden rounded-2xl border border-[#e8b84b]/25 bg-[#161b26]">
              <div className="border-b border-white/10 bg-[#0f1219] px-4 py-3">
                <p className="text-[10px] font-mono font-black uppercase tracking-[0.18em] text-[#e8b84b]">La Bàn mục tiêu</p>
                <p className="mt-1 text-[10px] leading-relaxed text-[#f0ede8]/45">
                  Bấm 3/6/9 tháng để xem mốc bạn đang đi tới. {targetCalc.compassTarget > 0 ? `Đích thị trường vẫn là ${formatSalaryShort(targetCalc.compassTarget)}/tháng.` : 'Hệ thống đề xuất mốc tăng hợp lý theo thời hạn.'}
                </p>
              </div>

              <div className="space-y-4 p-4">
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <div className="rounded-xl border border-white/10 bg-[#0a0c10] px-3 py-2">
                    <p className="text-[9px] font-mono uppercase text-[#f0ede8]/35">Hiện tại</p>
                    <p className="mt-0.5 text-sm font-black text-[#f0ede8]">{formatSalaryShort(cur)}/tháng</p>
                    {(targetBenchmark?.currentLabel || targetBenchmarkLoading) && (
                      <p className="mt-1 text-[9px] font-bold text-[#f0ede8]/45">
                        {targetBenchmark?.currentLabel || 'Đang tính Top...'}
                      </p>
                    )}
                  </div>
                  <div className="text-[#e8b84b]">→</div>
                  <div className="rounded-xl border border-[#e8b84b]/35 bg-[#e8b84b]/10 px-3 py-2 text-right">
                    <p className="text-[9px] font-mono uppercase text-[#e8b84b]/75">Mốc {duration} tháng</p>
                    <p className="mt-0.5 text-sm font-black text-[#e8b84b]">{formatSalaryShort(targetCalc.target)}/tháng</p>
                    {(targetBenchmark?.targetLabel || targetBenchmarkLoading) && (
                      <p className="mt-1 text-[9px] font-black text-[#e8b84b]">
                        {sameTargetBucket && targetCalc.compassTarget > 0
                          ? `Mốc phục hồi ${targetCalc.progressPct || 0}% gap`
                          : targetBenchmark?.targetLabel || 'Đang tính Top...'}
                      </p>
                    )}
                  </div>
                </div>

                {targetCalc.compassTarget > 0 && (
                  <div>
                    <div className="relative h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#e8b84b] to-green-400 transition-all duration-500"
                        style={{ width: `${Math.max(8, targetCalc.progressPct || 0)}%` }}
                      />
                    </div>
                    <div className="mt-2 flex items-start justify-between gap-3 text-[9px] font-mono text-[#f0ede8]/40">
                      <span>{formatSalaryShort(cur)}</span>
                      <span className="text-center text-[#e8b84b]">{targetCalc.progressPct}% chặng đường</span>
                      <span className="text-right">{targetCalc.compassTargetLabel}: {formatSalaryShort(targetCalc.compassTarget)}</span>
                    </div>
                  </div>
                )}

                <div className="rounded-xl border border-white/10 bg-[#0a0c10] px-3 py-3">
                  <p className="text-[11px] font-bold text-green-400">{targetCalc.label}</p>
                  {(targetBenchmark?.targetLabel || targetBenchmarkLoading) && (
                    <p className="mt-1 text-[11px] font-black text-[#e8b84b]">
                      {targetBenchmark?.targetLabel
                        ? sameTargetBucket && targetCalc.compassTarget > 0
                          ? `${formatSalaryShort(targetCalc.target)}/tháng vẫn trong ${targetBenchmark.targetLabel}, nhưng đã rút ${formatSalaryShort(recoveryGapClosed)}/tháng khoảng cách tới ${targetCalc.compassTargetLabel}.`
                          : `${formatSalaryShort(targetCalc.target)}/tháng tương ứng ${targetBenchmark.targetLabel}${targetBenchmark.currentLabel ? `; hiện tại đang ${targetBenchmark.currentLabel}.` : '.'}`
                        : 'Đang đối chiếu mốc Top theo dữ liệu lương nghề này...'}
                    </p>
                  )}
                  <p className="mt-1 text-[10px] leading-relaxed text-[#f0ede8]/50">
                    {targetCalc.compassRationale || targetCalc.rationale}
                  </p>
                  {sameTargetBucket && targetCalc.compassTarget > 0 && (
                    <p className="mt-2 rounded-lg border border-[#e8b84b]/20 bg-[#e8b84b]/8 px-3 py-2 text-[10px] font-bold leading-relaxed text-[#f0ede8]/70">
                      Case này đang underpaid nặng: {duration} tháng là mốc lấy lại giá trị bị bỏ lỡ, chưa nên hứa đổi bậc Top. Còn {formatSalaryShort(recoveryGapLeft)}/tháng nữa để chạm {targetCalc.compassTargetLabel}; nếu muốn thay đổi percentile rõ hơn, nên chọn 6 hoặc 9 tháng.
                    </p>
                  )}
                  {targetBenchmark?.confidenceLabel && (
                    <p className="mt-2 text-[9px] leading-relaxed text-[#f0ede8]/35">
                      Độ tin cậy benchmark: {targetBenchmark.confidenceLabel}{targetBenchmark.matchedJobTitle ? ` · khớp với ${targetBenchmark.matchedJobTitle}` : ''}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          <input
            className="hidden"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={website}
            onChange={e => setWebsite(e.target.value)}
          />
          <label className="flex items-start gap-2 rounded-xl border border-white/10 bg-[#161b26] px-3 py-3">
            <input
              type="checkbox"
              checked={privacyConsent}
              onChange={e => setPrivacyConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-white/20 accent-[#e8b84b]"
            />
            <span className="text-[10px] leading-4 text-[#f0ede8]/55">
              Tôi đồng ý Top Lương lưu và xử lý họ tên, SĐT, nghề nghiệp, lương hiện tại để tạo lộ trình, xác nhận thanh toán và hỗ trợ sau mua. Xem <Link href="/terms" target="_blank" className="text-[#e8b84b] underline underline-offset-2">Điều khoản</Link> và <Link href="/privacy" target="_blank" className="text-[#e8b84b] underline underline-offset-2">Chính sách riêng tư</Link>.
            </span>
          </label>

          {error && <p className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2">{error}</p>}

          {roleSuggestions.length > 0 && (
            <div className="rounded-xl border border-[#e8b84b]/25 bg-[#e8b84b]/8 p-3">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#e8b84b]">Bạn muốn hệ thống benchmark theo nghề nào?</p>
              <div className="mt-2 grid gap-2">
                {roleSuggestions.map(option => (
                  <button
                    key={option.role_id}
                    type="button"
                    onClick={() => {
                      setSelectedRoleId(option.role_id);
                      setJob(option.title);
                      setRoleSuggestions([]);
                      setError('');
                    }}
                    className="rounded-lg border border-white/10 bg-[#161b26] px-3 py-2 text-left text-[11px] text-[#f0ede8] hover:border-[#e8b84b]/60"
                  >
                    <span className="block font-black">{option.title}</span>
                    {option.industry && <span className="mt-0.5 block text-[9px] text-[#f0ede8]/45">{option.industry}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button onClick={() => { playTap(); handleSetup(); }} disabled={creating || Boolean(setupDisabledReason)}
            className="w-full bg-[#e8b84b] text-[#0a0c10] font-black py-4 rounded-xl text-base disabled:opacity-50 hover:-translate-y-0.5 transition-all">
            {creating ? 'Đang tạo...' : 'Tạo checklist tăng lương AI - 79.000đ'}
          </button>

          {setupDisabledReason && !creating && (
            <p className="rounded-xl border border-[#e8b84b]/20 bg-[#e8b84b]/8 px-4 py-2 text-center text-[10px] font-bold leading-relaxed text-[#e8b84b]">
              {setupDisabledReason}
            </p>
          )}

          <p className="text-[9px] text-[#f0ede8]/25 text-center">
            AI cá nhân hóa một lần theo dữ liệu bạn nhập · Xem lại bằng SĐT + mã truy cập · Tick việc, lưu bằng chứng và lấy chứng nhận tiến độ
          </p>
        </div>

        {/* Đã mua rồi → xem lại */}
        <button onClick={() => { setError(''); setStep('restore'); }}
          className="w-full text-center text-[11px] text-[#e8b84b]/60 hover:text-[#e8b84b] py-2">
          Đã mua rồi? Nhập SĐT + mã truy cập để xem lại →
        </button>

        <Link href="/" className="block text-center text-[10px] text-[#f0ede8]/30 hover:text-[#f0ede8]/60">
          ← Quay lại trang chủ
        </Link>
      </div>
    </div>
  );

  // ── STEP: RESTORE ─────────────────────────────────────────────────────────
  if (step === 'restore') return (
    <div className="min-h-screen w-full max-w-[100svw] overflow-x-clip bg-[#0a0c10] px-3 pb-8 pt-[max(1rem,env(safe-area-inset-top))] font-sans text-[#f0ede8] sm:px-4">
      <div className="mx-auto w-full max-w-[min(100%,22.5rem)] pt-16 space-y-6">
        <div className="text-center">
          <p className="text-3xl mb-3">🔑</p>
          <h2 className="text-xl font-black text-[#f0ede8] mb-1">Xem lại lộ trình của bạn</h2>
          <p className="text-sm text-[#f0ede8]/50">Nhập SĐT và mã truy cập để khôi phục lộ trình</p>
        </div>

        <div className="bg-[#0f1219] border border-white/10 rounded-2xl p-6 space-y-4">
          <div>
            <label className="text-[10px] font-mono font-bold text-[#f0ede8]/60 uppercase block mb-1.5">SĐT / Zalo đã đăng ký</label>
            <input type="tel" placeholder="0901234567"
              className="w-full bg-[#161b26] border border-white/10 rounded-xl px-4 py-3 text-sm text-[#f0ede8] outline-none focus:border-[#e8b84b] placeholder:text-[#f0ede8]/20"
              value={restorePhone} onChange={e => setRestorePhone(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleRestoreByPhone()} />
          </div>

          <div>
            <label className="text-[10px] font-mono font-bold text-[#f0ede8]/60 uppercase block mb-1.5">Mã truy cập</label>
            <input
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              placeholder="VD: E7B11S0WLI5I"
              className="w-full bg-[#161b26] border border-white/10 rounded-xl px-4 py-3 text-sm font-black tracking-[0.18em] text-[#f0ede8] outline-none focus:border-[#e8b84b] placeholder:tracking-normal placeholder:text-[#f0ede8]/20"
              value={restoreAccessCode}
              onChange={e => setRestoreAccessCode(cleanRoadmapAccessCode(e.target.value))}
              onKeyDown={e => e.key === 'Enter' && handleRestoreByPhone()}
            />
            <p className="mt-1 text-[9px] leading-relaxed text-[#f0ede8]/35">
              Mã truy cập 12 ký tự được hiển thị sau thanh toán. Mã legacy 4 ký tự cũ vẫn được kiểm tra nếu hệ thống bật fallback.
            </p>
          </div>

          {error && <p className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2">{error}</p>}

          <button onClick={() => { playTap(); handleRestoreByPhone(); }} disabled={restoreLoading}
            className="w-full bg-[#e8b84b] text-[#0a0c10] font-black py-4 rounded-xl text-base disabled:opacity-50">
            {restoreLoading ? 'Đang tìm...' : 'Tìm lộ trình của tôi'}
          </button>
        </div>

        <button onClick={() => { setError(''); setStep('setup'); }}
          className="w-full text-center text-[10px] font-mono text-[#f0ede8]/30 hover:text-[#f0ede8]/60 py-2">
          ← Quay lại
        </button>
      </div>
    </div>
  );

  // ── STEP: QR ──────────────────────────────────────────────────────────────
  if (step === 'qr') return (
    <div className="min-h-screen w-full max-w-[100svw] overflow-x-clip bg-[#0a0c10] px-3 pb-8 pt-[max(1rem,env(safe-area-inset-top))] font-sans text-[#f0ede8] sm:px-4">
      <div className="mx-auto w-full max-w-[min(100%,22.5rem)] pt-8 space-y-5">
        {/* Profile đã cam kết */}
        <div className="bg-[#0f1219] border border-[#e8b84b]/20 rounded-2xl p-4">
          <p className="text-[10px] font-mono text-[#e8b84b] uppercase tracking-wider mb-2">📋 Hồ sơ của bạn</p>
          <div className="space-y-1">
            <p className="text-sm font-bold text-[#f0ede8]">{name} · {phone}</p>
            <p className="text-[11px] text-[#f0ede8]/50">{job} · {(cur/1_000_000).toFixed(1)}M/tháng · {duration} tháng</p>
            {targetCalc && <p className="text-[11px] text-green-400 font-bold">Mục tiêu: {(targetCalc.target/1_000_000).toFixed(1)}M/tháng {targetCalc.label}</p>}
          </div>
        </div>

        <div className="text-center">
          <h2 className="text-[1.15rem] font-black leading-tight text-[#f0ede8] sm:text-xl">Quét QR để mở khóa lộ trình</h2>
          <p className="mx-auto mt-1 max-w-[20rem] text-[12px] leading-relaxed text-[#f0ede8]/52 sm:text-sm">Thanh toán xong → AI tạo checklist riêng theo nghề, mức lương, mục tiêu và câu trả lời của bạn</p>
          <p className="mt-2 text-[10px] leading-relaxed text-[#f0ede8]/35">
            Đây là sản phẩm có AI hỗ trợ, không phải buổi tư vấn 1-1 với chuyên gia người thật. Giá trị nằm ở kế hoạch hành động, bằng chứng cần lưu và kỷ luật thực thi.
          </p>
        </div>

        <div className="bg-[#0f1219] border border-[#e8b84b]/30 rounded-2xl overflow-hidden">
          <div className="flex items-start justify-between gap-3 border-b border-white/10 bg-[#161b26] px-4 py-3 sm:px-5">
            <div className="min-w-0">
              <p className="text-sm font-black text-[#f0ede8]">VSPI Roadmap</p>
              <p className="mt-0.5 truncate text-[10px] text-[#f0ede8]/45">{job} · {duration} tháng</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-lg font-black leading-none text-[#e8b84b] sm:text-xl">79.000đ</p>
              <p className="text-[9px] text-[#f0ede8]/35 line-through">149.000đ</p>
            </div>
          </div>

          <div className="border-b border-white/10 bg-[#0b111b] px-4 py-3 sm:px-5">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#e8b84b]">Đóng 79K bạn nhận ngay</p>
            <div className="mt-2 grid gap-1.5 text-[11px] font-semibold leading-4 text-[#f0ede8]/72">
              <p><span className="text-[#e8b84b]">✓</span> Checklist tăng lương riêng theo nghề, lương hiện tại và mục tiêu {duration} tháng.</p>
              <p><span className="text-[#e8b84b]">✓</span> Việc cần làm từng tuần, bằng chứng cần lưu và KPI cần chứng minh.</p>
              <p><span className="text-[#e8b84b]">✓</span> Câu review lương/apply role tốt hơn, không phải lời khuyên chung chung.</p>
              <p><span className="text-[#e8b84b]">✓</span> Mã truy cập để xem lại lộ trình trên máy khác sau khi thanh toán.</p>
            </div>
          </div>

          <div className="flex flex-col items-center p-4 sm:p-5">
            <div className="bg-white rounded-2xl p-3 shadow-[0_0_32px_rgba(232,184,75,0.2)] mb-3">
              <Image
                src={`https://img.vietqr.io/image/msb-96886693012762-compact2.png?amount=79000&addInfo=${cleanVspi}&accountName=NGUYEN%20TRONG%20VAN`}
                alt="QR 79k"
                width={224}
                height={224}
                unoptimized
                className="block aspect-square w-[min(14rem,calc(100vw-7rem))] rounded-xl"
              />
            </div>
            <div className="mb-1 w-full rounded-xl border border-white/10 bg-[#161b26] px-3 py-2 text-center">
              <p className="break-words text-[10px] font-mono leading-relaxed text-[#f0ede8]/50 sm:text-[11px]">MSB · <strong className="text-[#f0ede8]">96886693012762</strong> · NGUYEN TRONG VAN</p>
            </div>
            <div className="w-full rounded-xl border border-[#e8b84b]/25 bg-[#0a0c10] px-3 py-2 text-center">
              <p className="break-words text-[10px] font-mono leading-relaxed text-[#f0ede8]/50">
                Nội dung CK: <span className="font-black tracking-wide text-[#e8b84b]">{cleanVspi}</span>
              </p>
            </div>
            <p className="mt-2 text-center text-[9.5px] leading-relaxed text-[#f0ede8]/38">
              Thanh toán đồng nghĩa bạn đồng ý <Link href="/terms" target="_blank" className="text-[#e8b84b] underline underline-offset-2">Điều khoản</Link>,{' '}
              <Link href="/privacy" target="_blank" className="text-[#e8b84b] underline underline-offset-2">Chính sách riêng tư</Link> và chính sách hỗ trợ/hoàn tiền khi lỗi kỹ thuật.
            </p>
            <div className="mt-2 grid w-full grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_8.5rem]">
              <div className="rounded-xl border border-white/10 bg-[#161b26] px-3 py-2">
                <p className="text-[9px] font-mono uppercase text-[#f0ede8]/35">Bảo mật xem lại</p>
                <p className="mt-0.5 text-[10px] leading-relaxed text-[#f0ede8]/55">Lưu SĐT + mã này. Không có mã thì người khác không xem được lộ trình.</p>
              </div>
              <div className="min-w-0 rounded-xl border border-[#e8b84b]/30 bg-[#e8b84b]/10 px-3 py-2 text-center">
                <p className="text-[9px] font-mono uppercase text-[#f0ede8]/35">Mã truy cập</p>
                <p className="mt-1 break-words text-lg font-black tracking-[0.08em] text-[#e8b84b] sm:text-base">{activeAccessCode}</p>
              </div>
            </div>
          </div>

          <div className="space-y-3 px-4 pb-5 sm:px-5">
            {error && <p className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2">{error}</p>}
            {profile?.vspiId && (
              <p className="rounded-xl border border-green-400/25 bg-green-400/10 px-4 py-2 text-[11px] font-bold leading-relaxed text-green-300">
                Đơn 79K đã được lưu trên máy này. Nếu bạn vừa bấm Back/quay lại, giữ nguyên mã CK và bấm kiểm tra tiếp, không chuyển khoản lại.
              </p>
            )}
            <button onClick={() => { playTap(); startPolling(); }}
              className="w-full rounded-xl bg-[#e8b84b] px-3 py-4 text-sm font-black leading-tight text-[#0a0c10] transition-all hover:-translate-y-0.5 sm:text-base">
              ✅ Tiếp tục kiểm tra thanh toán 79K
            </button>
            <button onClick={() => setStep('setup')}
              className="w-full text-center text-[10px] font-mono text-[#f0ede8]/30 hover:text-[#f0ede8]/60 py-1">
              ← Quay lại
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // ── STEP: INTAKE ──────────────────────────────────────────────────────────
  if (step === 'intake') return (
    <div className="min-h-screen w-full max-w-[100svw] overflow-x-clip bg-[#0a0c10] px-3 pb-8 pt-[max(1rem,env(safe-area-inset-top))] font-sans text-[#f0ede8] sm:px-4">
      <div className="mx-auto w-full max-w-[min(100%,22.5rem)] pt-8 space-y-5">
        <div className="rounded-2xl border border-[#e8b84b]/25 bg-[#0f1219] p-5">
          <div className="mb-4 flex items-center justify-between gap-3 border-b border-white/8 pb-4">
            <div>
              <p className="text-[10px] font-mono font-black uppercase tracking-wider text-[#e8b84b]">Đã xác nhận 79K</p>
              <h2 className="mt-1 text-xl font-black leading-tight text-[#f0ede8]">Lộ trình thực thi theo tháng</h2>
            </div>
            <span className="rounded-full border border-green-400/30 bg-green-400/10 px-2 py-1 text-[9px] font-black text-green-300">PAID</span>
          </div>

          <div className="space-y-1 rounded-xl border border-white/8 bg-[#161b26] p-3">
            <p className="text-xs font-black text-[#f0ede8]">{profile?.job || job || 'Hồ sơ của bạn'}</p>
            <p className="text-[10px] text-[#f0ede8]/45">
              {(profile?.salary || cur) ? `${((profile?.salary || cur) / 1_000_000).toFixed(1)}M/tháng` : 'Lương đã ghi nhận'} · {profile?.duration || duration} tháng · {profile?.phone || phone}
            </p>
          </div>
        </div>

        <div className="w-full rounded-2xl border border-white/10 bg-[#0f1219] p-4 space-y-4 sm:p-5">
          <div>
            <label className="mb-1.5 block text-[10px] font-mono font-bold uppercase text-[#f0ede8]/60">Vị trí hiện tại</label>
            <input
              type="text"
              value={currentPosition}
              onChange={e => setCurrentPosition(e.target.value)}
              placeholder="VD: Backend Developer level Mid, Kế toán tổng hợp..."
              className="w-full min-w-0 rounded-xl border border-white/10 bg-[#161b26] px-4 py-3 text-sm text-[#f0ede8] outline-none placeholder:text-[#f0ede8]/20 focus:border-[#e8b84b]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-mono font-bold uppercase text-[#f0ede8]/60">Điểm nghẽn chuyên môn lớn nhất</label>
            <textarea
              value={mainWeakness}
              onChange={e => setMainWeakness(e.target.value)}
              placeholder="VD: thiếu KPI đo được, chưa có case study, yếu stakeholder, chưa chứng minh scope lớn..."
              rows={3}
              className="w-full min-w-0 resize-none rounded-xl border border-white/10 bg-[#161b26] px-4 py-3 text-sm text-[#f0ede8] outline-none placeholder:text-[#f0ede8]/20 focus:border-[#e8b84b]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-mono font-bold uppercase text-[#f0ede8]/60">Mục tiêu chức vụ/lương trong {durationLabel} tới</label>
            <textarea
              value={twoYearGoal}
              onChange={e => setTwoYearGoal(e.target.value)}
              placeholder="VD: Senior Backend 45M, Lead team 5 người, lên Finance Manager..."
              rows={3}
              className="w-full min-w-0 resize-none rounded-xl border border-white/10 bg-[#161b26] px-4 py-3 text-sm text-[#f0ede8] outline-none placeholder:text-[#f0ede8]/20 focus:border-[#e8b84b]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-mono font-bold uppercase text-[#f0ede8]/60">
              Trình độ học vấn cao nhất
            </label>
            <div className="grid grid-cols-2 gap-2">
              {EDUCATION_LEVELS.map(level => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setEducationLevel(level)}
                  className={`rounded-xl border px-3 py-2.5 text-center text-[11px] font-bold transition-all ${
                    educationLevel === level
                      ? 'border-[#e8b84b] bg-[#e8b84b]/12 text-[#e8b84b]'
                      : 'border-white/10 bg-[#161b26] text-[#f0ede8]/55'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[9px] leading-relaxed text-[#f0ede8]/35">
              AI sẽ đối chiếu bằng cấp với dữ liệu nghề để xem bằng cấp đang được thị trường trả tiền, bị bỏ phí, hay cần bù bằng KPI thực chiến.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-mono font-bold uppercase text-[#f0ede8]/60">Ngành học / chứng chỉ liên quan</label>
            <input
              type="text"
              value={educationDetail}
              onChange={e => setEducationDetail(e.target.value)}
              placeholder="VD: Ngôn ngữ Anh, Quản trị kinh doanh, TESOL, CELTA, IELTS, MBA..."
              className="w-full min-w-0 rounded-xl border border-white/10 bg-[#161b26] px-4 py-3 text-sm text-[#f0ede8] outline-none placeholder:text-[#f0ede8]/20 focus:border-[#e8b84b]"
            />
          </div>

          <div className="rounded-2xl border border-[#e8b84b]/20 bg-[#e8b84b]/8 p-3">
            <p className="text-[10px] font-mono font-black uppercase tracking-normal text-[#e8b84b]">Khảo sát để AI cá nhân hóa đúng lộ trình</p>
            <p className="mt-1 text-[10px] leading-relaxed text-[#f0ede8]/45">
              Phần này giúp lộ trình không đoán mò kỹ năng bạn đã biết, nhất là khi lương hiện tại đã cao.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-mono font-bold uppercase text-[#f0ede8]/60">Kỹ năng/đòn bẩy bạn đã khá mạnh</label>
            <textarea
              value={strongSkills}
              onChange={e => setStrongSkills(e.target.value)}
              placeholder="VD: kỹ năng nghề bạn đã chắc tay, công cụ/quy trình bạn dùng tốt, nhóm việc bạn xử lý ổn..."
              rows={3}
              className="w-full min-w-0 resize-none rounded-xl border border-white/10 bg-[#161b26] px-4 py-3 text-sm text-[#f0ede8] outline-none placeholder:text-[#f0ede8]/20 focus:border-[#e8b84b]"
            />
            <button
              type="button"
              onClick={() => setStrongSkills('Chưa rõ - AI chẩn đoán giúp')}
              className="mt-2 rounded-full border border-[#e8b84b]/25 bg-[#e8b84b]/8 px-3 py-1.5 text-[10px] font-bold text-[#e8b84b]"
            >
              Chưa rõ - AI chẩn đoán giúp
            </button>
            <p className="mt-1.5 text-[9px] leading-relaxed text-[#f0ede8]/35">
              Không biết điểm yếu cũng không sao. AI sẽ đọc vị trí, lương, kỹ năng mạnh và bằng chứng hiện có để tìm điểm nghẽn thật.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-mono font-bold uppercase text-[#f0ede8]/60">Bằng chứng/thành tích đã có</label>
            <textarea
              value={proofAssets}
              onChange={e => setProofAssets(e.target.value)}
              placeholder="VD: ảnh/link/file, feedback thật, số liệu trước-sau, thành tích đã có hoặc sản phẩm nghề có người xác nhận..."
              rows={3}
              className="w-full min-w-0 resize-none rounded-xl border border-white/10 bg-[#161b26] px-4 py-3 text-sm text-[#f0ede8] outline-none placeholder:text-[#f0ede8]/20 focus:border-[#e8b84b]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-mono font-bold uppercase text-[#f0ede8]/60">Nút thắt lớn nhất đang cản tăng lương</label>
            <textarea
              value={bottleneck}
              onChange={e => setBottleneck(e.target.value)}
              placeholder="VD: làm nhiều nhưng chưa có số, chưa đóng gói được case, thiếu quyền quyết định, chưa có kịch bản deal nội bộ..."
              rows={3}
              className="w-full min-w-0 resize-none rounded-xl border border-white/10 bg-[#161b26] px-4 py-3 text-sm text-[#f0ede8] outline-none placeholder:text-[#f0ede8]/20 focus:border-[#e8b84b]"
            />
            <button
              type="button"
              onClick={() => setBottleneck('Chưa rõ - AI chẩn đoán giúp')}
              className="mt-2 rounded-full border border-[#e8b84b]/25 bg-[#e8b84b]/8 px-3 py-1.5 text-[10px] font-bold text-[#e8b84b]"
            >
              Tôi chưa rõ nút thắt của mình
            </button>
            <p className="mt-1.5 text-[9px] leading-relaxed text-[#f0ede8]/35">
              Nếu chưa rõ, lộ trình sẽ bắt đầu bằng tuần đo nền để tìm nút thắt: KPI, bằng chứng, scope, visibility, kỹ năng hoặc kịch bản deal.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-mono font-bold uppercase text-[#f0ede8]/60">Hướng muốn ưu tiên</label>
            <div className="grid grid-cols-2 gap-2">
              {preferredPathOptions.map(option => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setPreferredPath(option.value)}
                  className={`min-w-0 rounded-xl border px-3 py-2.5 text-left transition-all ${
                    preferredPath === option.value
                      ? 'border-[#e8b84b] bg-[#e8b84b]/12 text-[#e8b84b]'
                      : 'border-white/10 bg-[#161b26] text-[#f0ede8]/55'
                  }`}
                >
                  <span className="block text-[11px] font-black leading-snug">{option.label}</span>
                  <span className="mt-1 block text-[9px] font-normal leading-snug text-[#f0ede8]/38">{option.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-mono font-bold uppercase text-[#f0ede8]/60">Thời gian thực thi mỗi tuần</label>
            <div className="grid grid-cols-3 gap-2">
              {['1-2 giờ/tuần', '3-5 giờ/tuần', '6-8 giờ/tuần'].map(value => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setWeeklyTime(value)}
                  className={`min-w-0 rounded-xl border px-2 py-2.5 text-center text-[10px] font-bold leading-tight transition-all ${
                    weeklyTime === value
                      ? 'border-[#e8b84b] bg-[#e8b84b]/12 text-[#e8b84b]'
                      : 'border-white/10 bg-[#161b26] text-[#f0ede8]/55'
                  }`}
                >
                  {value.replace('/tuần', '')}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2 text-[11px] text-red-400">{error}</p>}

          <button
            onClick={() => { playTap(); loadRoadmap(); }}
            disabled={generating}
            className="w-full rounded-xl bg-[#e8b84b] py-4 text-base font-black text-[#0a0c10] transition-all hover:-translate-y-0.5 disabled:opacity-50"
          >
            Tạo checklist thực thi bằng AI cá nhân hóa
          </button>

          <p className="text-center text-[9px] leading-relaxed text-[#f0ede8]/30">
            AI dùng câu trả lời của bạn để tạo một lộ trình tham khảo có checklist, evidence log và thời điểm review. Không phải cam kết tăng lương tự động.
          </p>
        </div>
      </div>
    </div>
  );

  // ── STEP: CHECKING ────────────────────────────────────────────────────────
  if (step === 'checking' || generating) return (
    <div className="min-h-screen w-full max-w-[100svw] overflow-x-clip bg-[#0a0c10] flex items-center justify-center px-3 py-8 font-sans text-[#f0ede8] sm:px-4">
      <div className="text-center space-y-4">
        <div className="relative w-16 h-16 mx-auto">
          <div className="absolute inset-0 border-4 border-white/10 rounded-full" />
          <div className="absolute inset-0 border-4 border-t-[#e8b84b] rounded-full animate-spin" />
        </div>
        <p className="text-lg font-bold text-[#f0ede8]">
          {generating ? '✨ AI đang cá nhân hóa lộ trình cho bạn...' : 'Đang xác nhận thanh toán...'}
        </p>
        <p className="text-sm text-[#f0ede8]/45">
          {generating ? 'Mất khoảng 10-15 giây' : `Thử lần ${pollCount}/15 · Tự động unlock sau khi xác nhận`}
        </p>
        {!generating && (
          <button onClick={() => { if (pollRef.current) clearInterval(pollRef.current); setStep('qr'); }}
            className="text-[10px] font-mono text-[#f0ede8]/30 hover:text-[#f0ede8]/60">
            ← Quay lại
          </button>
        )}
      </div>
    </div>
  );

  // ── STEP: ROADMAP ─────────────────────────────────────────────────────────
  if (!roadmap) return null;

  return (
    <div className="min-h-screen w-full max-w-[100svw] overflow-x-clip bg-[#0a0c10] px-3 pb-10 pt-[max(1rem,env(safe-area-inset-top))] font-sans text-[#f0ede8] sm:px-4">
      <div className="mx-auto w-full max-w-[min(100%,22.5rem)] pt-6 space-y-5">

        {/* Header + profile */}
        <div className="bg-[#0f1219] border border-[#e8b84b]/25 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3 pb-3 border-b border-white/8">
            <div className="w-10 h-10 bg-[#e8b84b] rounded-full flex items-center justify-center text-[#0a0c10] font-black text-base shrink-0">
              {(profile?.job || 'U')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-[#f0ede8] truncate">{profile?.job || 'Lộ trình của bạn'}</p>
              <p className="text-[10px] text-[#f0ede8]/40">{profile?.phone} · {profile?.duration} tháng</p>
            </div>
            <span className="text-[9px] bg-[#e8b84b]/10 border border-[#e8b84b]/30 text-[#e8b84b] font-mono font-black px-2 py-0.5 rounded-full shrink-0">✓ PAID</span>
          </div>

          <h1 className="text-base font-black text-[#f0ede8] mb-2 leading-tight">{humanizeWorkCopy(roadmap.goal)}</h1>
          <p className="text-[11px] text-[#f0ede8]/60 leading-relaxed mb-4">{humanizeWorkCopy(roadmap.summary)}</p>

          {isExpertRoadmap ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-[#e8b84b]/20 bg-[#161b26] px-3 py-2">
                <p className="text-[9px] font-mono uppercase text-[#f0ede8]/35">Nguồn phân tích</p>
                <p className="text-xs font-black text-[#e8b84b]">AI + quy tắc Top Lương</p>
              </div>
              <div className="rounded-xl border border-green-400/20 bg-green-400/10 px-3 py-2">
                <p className="text-[9px] font-mono uppercase text-[#f0ede8]/35">Trạng thái</p>
                <p className="text-xs font-black text-green-300">Checklist riêng theo input</p>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex justify-between text-[10px]">
                <span className="text-[#f0ede8]/50">Tiến độ tổng</span>
                <span className="font-black text-[#e8b84b]">{stats.done}/{stats.total} việc · {stats.pct}%</span>
              </div>
              <div className="h-3 bg-[#161b26] rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-[#e8b84b] to-green-400 transition-all duration-500"
                  style={{ width: `${stats.pct}%` }} />
              </div>
              <p className="text-[9px] text-[#f0ede8]/30 text-center">
                {stats.pct === 0 ? '💪 Bắt đầu tick việc đầu tiên!' :
                 stats.pct < 50 ? '🔥 Đang trên đường — tiếp tục!' :
                 stats.pct < 80 ? '⚡ Hơn nửa rồi — gần đến lúc deal lương!' :
                 '🏆 Sắp xong — chuẩn bị đàm phán!'}
              </p>
            </div>
          )}
        </div>

        {isExpertRoadmap ? (
          <>
            <RoadmapCompassGame
              plan={roadmap.actionPlan}
              progress={progress}
              evidenceLog={evidenceLog}
              profile={profile}
              stats={stats}
              onEvidenceSubmit={(key, evidence) => {
                playSuccess();
                submitTaskEvidence(key, evidence);
              }}
            />

            <EvidenceVaultCard stats={stats} evidenceLog={evidenceLog} />

            <RoadmapLevelCard plan={roadmap.actionPlan} done={stats.done} total={stats.total} pct={stats.pct} />

            <RoadmapCompletionReward
              profile={profile}
              plan={roadmap.actionPlan}
              stats={stats}
              evidenceLog={evidenceLog}
              showCertificate={showCertificate}
              onShowCertificate={() => {
                playSuccess();
                setShowCertificate(value => !value);
              }}
            />

            {(roadmap.intake?.educationLevel || roadmap.intake?.educationDetail) && (
              <div className="rounded-2xl border border-[#e8b84b]/25 bg-[#0f1219] p-4">
                <p className="mb-1 text-[10px] font-mono font-black uppercase tracking-wider text-[#e8b84b]">
                  Độ khớp học vấn với lương
                </p>
                <h2 className="text-base font-black leading-tight text-[#f0ede8]">
                  Bằng cấp có đang được thị trường trả tiền chưa?
                </h2>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-white/8 bg-[#161b26] px-3 py-2">
                    <p className="text-[9px] uppercase text-[#f0ede8]/35">Học vấn</p>
                    <p className="text-xs font-black text-[#f0ede8]">{roadmap.intake.educationLevel || 'Chưa cung cấp'}</p>
                  </div>
                  <div className="rounded-xl border border-white/8 bg-[#161b26] px-3 py-2">
                    <p className="text-[9px] uppercase text-[#f0ede8]/35">Liên quan</p>
                    <p className="text-xs font-black text-[#f0ede8]">{roadmap.intake.educationDetail || 'Cần chứng minh bằng KPI'}</p>
                  </div>
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-[#f0ede8]/55">
                  Phần phân tích bên dưới sẽ chỉ ra bằng cấp đang là lợi thế, điểm bị định giá thấp, hay phần cần bù bằng bằng chứng vận hành.
                </p>
              </div>
            )}

            {roadmap.actionPlan && (
              <RoadmapActionPlanView
                plan={roadmap.actionPlan}
                progress={progress}
                evidenceLog={evidenceLog}
                onToggle={(key) => { playTap(); toggleTaskKey(key); }}
                onEvidenceSubmit={(key, evidence) => {
                  playSuccess();
                  submitTaskEvidence(key, evidence);
                }}
              />
            )}

            {roadmap.markdown && (
              <details className="rounded-2xl border border-white/8 bg-[#0f1219] p-4 sm:p-5">
                <summary className="cursor-pointer text-sm font-black text-[#e8b84b]">
                  Đọc thêm: hệ thống giải thích vì sao làm các việc trên
                </summary>
                <p className="mt-3 rounded-xl border border-[#e8b84b]/20 bg-[#e8b84b]/8 px-3 py-2 text-[11px] leading-relaxed text-[#f0ede8]/60">
                  Không cần đọc hết phần này trước. Cứ làm checklist và bản đồ tiến độ phía trên; phần dưới giải thích logic nghề nghiệp đứng sau từng việc.
                </p>
                <div className="mt-4">
                  <MarkdownRoadmap markdown={roadmap.markdown} />
                </div>
              </details>
            )}
            <div className="rounded-xl border border-green-500/20 bg-green-500/10 p-3 text-center">
              <p className="text-[11px] leading-relaxed text-green-300">{humanizeWorkCopy(roadmap.salary_projection)}</p>
            </div>
          </>
        ) : (
          <>
            {/* Salary projection */}
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-center">
              <p className="text-[11px] text-green-300 leading-relaxed">{humanizeWorkCopy(roadmap.salary_projection)}</p>
            </div>

            {/* Weekly work items */}
            <div className="space-y-4">
              {roadmap.weeks.map((week, wi) => {
                const weekDone = week.tasks.filter((_, ti) => progress[`w${wi}_t${ti}`]).length;
                const isComplete = weekDone === week.tasks.length;
                return (
                  <div key={wi} className={`bg-[#0f1219] border rounded-2xl overflow-hidden ${isComplete ? 'border-green-500/30' : 'border-white/8'}`}>
                    <div className={`px-4 py-3 flex items-center gap-3 ${isComplete ? 'bg-green-500/5' : ''}`}>
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-black shrink-0
                        ${isComplete ? 'bg-green-500/30 text-green-400' : 'bg-[#161b26] border border-white/10 text-[#f0ede8]/40'}`}>
                        {isComplete ? '✓' : `W${week.week}`}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold ${isComplete ? 'text-green-400' : 'text-[#f0ede8]'}`}>{humanizeWorkCopy(week.focus)}</p>
                        <p className="text-[9px] text-[#f0ede8]/35 mt-0.5">🎯 {humanizeWorkCopy(week.milestone)}</p>
                      </div>
                      <span className={`text-[10px] font-black shrink-0 ${isComplete ? 'text-green-400' : 'text-[#f0ede8]/30'}`}>
                        {weekDone}/{week.tasks.length}
                      </span>
                    </div>
                    <div className="px-4 pb-4 pt-1 space-y-2">
                      {week.tasks.map((task, ti) => {
                        const key = `w${wi}_t${ti}`;
                        const checked = progress[key] || false;
                        return (
                          <button key={ti} onClick={() => toggleTask(wi, ti)}
                            className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all active:scale-[0.98]
                              ${checked ? 'bg-green-500/10 border-green-500/20' : 'bg-[#161b26] border-white/5 hover:border-[#e8b84b]/25'}`}>
                            <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all
                              ${checked ? 'bg-green-500 border-green-500' : 'border-white/20'}`}>
                              {checked && <span className="text-white text-[10px] font-black">✓</span>}
                            </div>
                            <p className={`text-[12px] leading-relaxed ${checked ? 'text-green-400/70 line-through' : 'text-[#f0ede8]/80'}`}>
                              {humanizeWorkCopy(task)}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Negotiation timing */}
            <div className="bg-[#e8b84b]/8 border border-[#e8b84b]/25 rounded-2xl p-4">
              <p className="text-[10px] font-mono text-[#e8b84b] uppercase tracking-wider mb-1.5">⚡ Thời điểm deal lương</p>
              <p className="text-sm text-[#f0ede8]/80 leading-relaxed">{humanizeWorkCopy(roadmap.negotiation_timing)}</p>
              <p className="text-[10px] text-[#f0ede8]/40 mt-2">
                Tip: Đừng chờ hoàn hảo 100%. Khi tick xong 70% việc — bạn đã có đủ bằng chứng để đàm phán.
              </p>
            </div>
          </>
        )}

        <div className="rounded-xl border border-[#e8b84b]/20 bg-[#e8b84b]/8 p-3 text-center">
          <p className="text-[11px] leading-relaxed text-[#f0ede8]/65">
            Một lần mua mở khóa một lộ trình gắn với SĐT này. Cứ tick việc ở đây để giữ tiến độ; khi đạt 80% hãy quét lại mức lương để chuẩn bị deal.
          </p>
        </div>

        <Link href="/"
          className="block w-full bg-[#e8b84b] text-[#0a0c10] font-black py-4 rounded-xl text-base text-center hover:-translate-y-0.5 transition-all">
          ⚡ Quét lại — Xem lương đã tăng chưa
        </Link>

        {/* Khóa xem lại */}
        <div className="bg-[#0f1219] border border-white/8 rounded-xl p-4 text-center space-y-1">
          <p className="text-[10px] font-mono text-[#f0ede8]/30 uppercase tracking-wider">Khóa xem lại lộ trình</p>
          <p className="text-sm font-black text-[#e8b84b]">{profile?.phone} · {activeAccessCode}</p>
          <p className="text-[9px] text-[#f0ede8]/25">
            Dùng SĐT và mã truy cập này để xem lại trên thiết bị khác. Không chia sẻ mã nếu không muốn người khác mở lộ trình.
          </p>
        </div>

      </div>
    </div>
  );
}
