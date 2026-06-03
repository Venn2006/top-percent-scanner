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
import { cleanRoadmapAccessCode, getRoadmapAccessCode } from '@/lib/roadmapAccess';
import { inferRoleLevelBand, isExecutiveLevel } from '@/lib/roleSeniority';
import { computeAlignedRoadmapTarget } from '@/lib/salaryTargetConsistency';
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

function calcTargetSalary(currentSalary: number, job: string, months: number, compassTargetSalary = 0, compassTargetLabel = '') {
  const ctx = getCareerCompassContext(job, currentSalary, 50);
  const normalizedJob = job
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[Ä‘Ä]/g, 'd')
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
    ? `${months} thÃ¡ng lÃ  má»‘c ${progressPct}% Ä‘Æ°á»ng tá»›i ${compassTargetLabel || 'Ä‘Ã­ch La BÃ n'} ${(compassTarget / 1_000_000).toFixed(1)} triá»‡u/thÃ¡ng. ÄÃ¢y lÃ  má»‘c cáº§n táº¡o báº±ng chá»©ng, khÃ´ng pháº£i lá»i há»©a tÄƒng lÆ°Æ¡ng tá»± Ä‘á»™ng.`
    : '';
  return {
    target,
    compassTarget,
    compassTargetLabel: compassTargetLabel || 'Ä‘Ã­ch La BÃ n',
    progressPct,
    compassRationale,
    label: `+${(inc / 1_000_000).toFixed(1)} triá»‡u/thÃ¡ng (+${pct}%)`,
    rationale: months === 3
      ? `Má»¥c tiÃªu +${pct}% trong 3 thÃ¡ng â€” cÃ³ cÆ¡ sá»Ÿ Ä‘á»ƒ yÃªu cáº§u náº¿u hoÃ n thÃ nh viá»‡c thá»±c thi vÃ  cÃ³ thÃ nh tÃ­ch Ä‘o Ä‘Æ°á»£c`
      : months === 6
      ? `Má»¥c tiÃªu +${pct}% trong 6 thÃ¡ng â€” Ä‘á»§ thá»i gian nÃ¢ng ká»¹ nÄƒng, chá»©ng minh giÃ¡ trá»‹ vÃ  Ä‘Ã m phÃ¡n`
      : months === 9
      ? `Má»¥c tiÃªu +${pct}% trong 9 thÃ¡ng â€” Ä‘á»§ dÃ i Ä‘á»ƒ thá»­ hÆ°á»›ng má»›i, táº¡o báº±ng chá»©ng vÃ  Ä‘i vÃ²ng apply/review Ä‘áº§u tiÃªn`
      : `Má»¥c tiÃªu +${pct}% trong 1 nÄƒm â€” lá»™ trÃ¬nh bá»n vá»¯ng qua thÄƒng tiáº¿n ná»™i bá»™ hoáº·c Ä‘á»•i vai trÃ²`,
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
  if (rounded >= 100) return 'DÆ°á»›i Top 80%';
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
  let label = `DÆ°á»›i ${visibleRows[0].label}`;
  for (const row of visibleRows) {
    if (salary >= Number(row.salary)) label = row.label;
  }
  return label;
};

const getBenchmarkDisplayLabel = (percent: number, salary: number, rows: RoadmapBenchmarkRow[]) => {
  const rounded = normalizeTopPercent(percent);
  if (rounded >= 100) return getCompassLabelForSalary(salary, rows) || 'DÆ°á»›i Top 80%';
  return formatTopPercentLabel(rounded) || getCompassLabelForSalary(salary, rows);
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
const formatDurationLabel = (months: number) => months === 12 ? '1 nÄƒm' : `${months} thÃ¡ng`;
const formatSalaryShort = (value: number) => `${(Math.max(0, value) / 1_000_000).toFixed(1)}M`;
const humanizeWorkCopy = (value: string) =>
  repairMojibakeText(value)
    .replace(/\bKham chan doan va treatment plan\b/gi, 'KhÃ¡m cháº©n Ä‘oÃ¡n vÃ  treatment plan')
    .replace(/\bHo so benh an nha khoa an danh\b/gi, 'Há»“ sÆ¡ bá»‡nh Ã¡n nha khoa áº©n danh')
    .replace(/\bVo khuan va an toan thu thuat\b/gi, 'VÃ´ khuáº©n vÃ  an toÃ n thá»§ thuáº­t')
    .replace(/\bTu van ca dieu tri cho benh nhan\b/gi, 'TÆ° váº¥n ca Ä‘iá»u trá»‹ cho bá»‡nh nhÃ¢n')
    .replace(/\bX-quang\/CBCT va photo intraoral\b/gi, 'X-quang/CBCT vÃ  photo intraoral')
    .replace(/\bTheo doi dau, bien chung va tai kham\b/gi, 'Theo dÃµi Ä‘au, biáº¿n chá»©ng vÃ  tÃ¡i khÃ¡m')
    .replace(/\bFeedback benh nhan va bac si phu trach\b/gi, 'Feedback bá»‡nh nhÃ¢n vÃ  bÃ¡c sÄ© phá»¥ trÃ¡ch')
    .replace(/Lá»™ trÃ¬nh thÄƒng tiáº¿n Äá»™c Báº£n/gi, 'Báº£n giáº£i thÃ­ch: vÃ¬ sao cÃ¡c viá»‡c nÃ y giÃºp tÄƒng lÆ°Æ¡ng')
    .replace(/lá»™ trÃ¬nh thÄƒng tiáº¿n Ä‘á»™c báº£n/gi, 'báº£n giáº£i thÃ­ch vÃ¬ sao cÃ¡c viá»‡c nÃ y giÃºp tÄƒng lÆ°Æ¡ng')
    .replace(/\bTasks\b/g, 'Viá»‡c')
    .replace(/\btasks\b/g, 'viá»‡c')
    .replace(/\bTask\b/g, 'Viá»‡c')
    .replace(/\btask\b/g, 'viá»‡c')
    .replace(/\bdeliverable\b/gi, 'sáº£n pháº©m/báº±ng chá»©ng')
    .replace(/\bartifact\b/gi, 'báº±ng chá»©ng')
    .replace(/\bOutput\b/g, 'Báº±ng chá»©ng')
    .replace(/\boutput\b/g, 'báº±ng chá»©ng')
    .replace(/\bSkill\b/g, 'Ká»¹ nÄƒng')
    .replace(/\bskill\b/g, 'ká»¹ nÄƒng')
    .replace(/Game Ä‘á»i tháº­t/gi, 'Lá»™ trÃ¬nh thÄƒng tiáº¿n')
    .replace(/\bquest\b/gi, 'cháº·ng thá»±c thi')
    .replace(/\bXP\b/g, 'Äiá»ƒm tiáº¿n Ä‘á»™')
    .replace(/Max Level/gi, 'há»“ sÆ¡ hoÃ n chá»‰nh')
    .replace(/\bLevel\b/g, 'Giai Ä‘oáº¡n')
    .replace(/TÄƒng level thÃ¡ng\s*(\d+)/gi, 'HoÃ n thiá»‡n báº±ng chá»©ng thÃ¡ng $1')
    .replace(/NÃ¢ng skill táº¡o chÃªnh lá»‡ch/gi, 'LÃ m má»™t viá»‡c cÃ³ sá»‘ trÆ°á»›c-sau')
    .replace(/Ná»n mÃ³ng báº±ng chá»©ng/gi, 'Chá»‘t má»‘c lÆ°Æ¡ng vÃ  báº±ng chá»©ng cáº§n cÃ³')
    .replace(/ÄÃ³ng gÃ³i case tÄƒng lÆ°Æ¡ng/gi, 'ÄÃ³ng gÃ³i case Ä‘á»ƒ xin feedback');
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
      { value: 'deal_internal', label: 'TÄƒng scope / mandate hiá»‡n táº¡i', hint: 'ÄÃ³ng gÃ³i P&L/revenue impact, operating authority, decision log vÃ  board/owner update.' },
      { value: 'jump_job', label: 'Sang tá»• chá»©c quy mÃ´ lá»›n hÆ¡n', hint: 'Nháº¯m scope doanh thu, team, ngÃ¢n sÃ¡ch, thá»‹ trÆ°á»ng hoáº·c business unit lá»›n hÆ¡n.' },
      { value: 'leadership', label: 'ÄÃ m phÃ¡n bonus/equity/profit-sharing', hint: 'Neo compensation package theo mandate, strategic outcome vÃ  upside tháº­t.' },
      { value: 'expert', label: 'Board/advisory/fractional mandate', hint: 'ÄÃ³ng gÃ³i track record Ä‘á»ƒ nháº­n retainer, advisory, board hoáº·c fractional scope.' },
    ];
  }

  if (isChefRoadmapRole(roleText)) {
    return [
      { value: 'deal_internal', label: 'TÄƒng lÆ°Æ¡ng táº¡i báº¿p', hint: 'DÃ¹ng food cost, waste, tá»‘c Ä‘á»™ ra mÃ³n vÃ  feedback Ä‘á»ƒ xin review.' },
      { value: 'jump_job', label: 'Äá»•i sang báº¿p tráº£ cao hÆ¡n', hint: 'Nháº¯m chuá»—i, khÃ¡ch sáº¡n, catering hoáº·c báº¿p trung tÃ¢m cÃ³ KPI rÃµ.' },
      { value: 'leadership', label: 'Quáº£n lÃ½ báº¿p/nhÃ  hÃ ng', hint: 'LÃªn Ca trÆ°á»Ÿng, Sous Chef, Báº¿p trÆ°á»Ÿng, Kitchen Manager hoáº·c quáº£n lÃ½ váº­n hÃ nh nhÃ  hÃ ng.' },
      { value: 'expert', label: 'Menu/F&B chuyÃªn sÃ¢u', hint: 'Äi sÃ¢u recipe, costing, SOP, training báº¿p hoáº·c tÆ° váº¥n concept/menu.' },
    ];
  }

  if (isAviationRoadmapRole(roleText)) {
    return [
      { value: 'deal_internal', label: 'Xin review hÃ£ng hiá»‡n táº¡i', hint: 'Dá»±a trÃªn safety-service, feedback senior crew vÃ  route readiness.' },
      { value: 'jump_job', label: 'Chuyá»ƒn hÃ£ng/tuyáº¿n tá»‘t hÆ¡n', hint: 'Nháº¯m tuyáº¿n quá»‘c táº¿, hÃ£ng tráº£ tá»‘t hÆ¡n hoáº·c role dá»‹ch vá»¥ hÃ ng khÃ´ng cao hÆ¡n.' },
      { value: 'leadership', label: 'LÃªn Purser/Cabin Lead', hint: 'Chá»©ng minh briefing, debrief, há»— trá»£ junior vÃ  xá»­ lÃ½ escalation.' },
      { value: 'expert', label: 'Trainer/service expert', hint: 'ÄÃ³ng gÃ³i kinh nghiá»‡m thÃ nh checklist, training vÃ  chuáº©n phá»¥c vá»¥.' },
    ];
  }

  if (isMcRoadmapRole(roleText)) {
    return [
      { value: 'deal_internal', label: 'TÄƒng fee khÃ¡ch quen', hint: 'DÃ¹ng showreel, feedback vÃ  rate card Ä‘á»ƒ nÃ¢ng giÃ¡.' },
      { value: 'jump_job', label: 'Nháº­n format tráº£ cao hÆ¡n', hint: 'Chuyá»ƒn sang corporate, activation, livestream hoáº·c brand event.' },
      { value: 'leadership', label: 'Lead sá»± kiá»‡n/team MC', hint: 'Dáº«n format lá»›n hÆ¡n, training MC má»›i hoáº·c phá»‘i há»£p agency.' },
      { value: 'expert', label: 'Host chuyÃªn sÃ¢u', hint: 'Äi sÃ¢u ká»‹ch báº£n, rehearsal, xá»­ lÃ½ live vÃ  thÆ°Æ¡ng hiá»‡u cÃ¡ nhÃ¢n.' },
    ];
  }

  return [
    { value: 'deal_internal', label: 'á»ž láº¡i & tÄƒng lÆ°Æ¡ng', hint: 'DÃ¹ng KPI, scope vÃ  báº±ng chá»©ng Ä‘á»ƒ xin review á»Ÿ nÆ¡i hiá»‡n táº¡i.' },
    { value: 'jump_job', label: 'Äá»•i sang role tráº£ cao hÆ¡n', hint: 'TÃ¬m mÃ´i trÆ°á»ng hoáº·c vá»‹ trÃ­ cÃ³ dáº£i lÆ°Æ¡ng, scope vÃ  KPI tá»‘t hÆ¡n.' },
    { value: 'leadership', label: 'LÃªn quáº£n lÃ½/lead', hint: 'Chá»©ng minh quáº£n ngÆ°á»i, quáº£n scope, chá»‹u KPI hoáº·c owner má»™t máº£ng.' },
    { value: 'expert', label: 'Äi sÃ¢u chuyÃªn mÃ´n', hint: 'ÄÃ o sÃ¢u nÄƒng lá»±c hiáº¿m, chá»©ng chá»‰, case study vÃ  portfolio nghá».' },
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
  selectedRoleId?: string;
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
}

interface RoleSuggestion {
  role_id: string;
  title: string;
  industry?: string | null;
}

// BÆ°á»›c: setup â†’ qr â†’ checking â†’ intake â†’ roadmap | restore (nháº­p SÄT Ä‘á»ƒ láº¥y láº¡i)
type PageStep = 'setup' | 'restore' | 'qr' | 'checking' | 'intake' | 'roadmap';

const STORAGE_KEY = 'vspi-roadmap-v2';
const DRAFT_KEY = 'vspi-roadmap-draft-v1';
const PREMIUM_SESSION_KEY = 'vspi-premium-session';
const SHARED_PHONE_KEY = 'vspi-shared-phone';
const SHARED_PHONE_EVENT = 'vspi-shared-phone-updated';
const SHARED_FULL_NAME_KEY = 'vspi-shared-full-name';
const SHARED_FULL_NAME_EVENT = 'vspi-shared-full-name-updated';
const EVIDENCE_STORAGE_PREFIX = 'vspi-roadmap-evidence-v1:';
const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const SAFE_ROADMAP_GENERATION_ERROR = 'KhÃ´ng táº¡o Ä‘Æ°á»£c lá»™ trÃ¬nh lÃºc nÃ y. Vui lÃ²ng kiá»ƒm tra láº¡i nghá»/lÆ°Æ¡ng hoáº·c thá»­ láº¡i sau 1 phÃºt.';
const ROLE_CONFIRMATION_ERROR = 'Nghá» báº¡n nháº­p hÆ¡i dÃ i hoáº·c chÆ°a khá»›p cháº¯c vá»›i dá»¯ liá»‡u. Vui lÃ²ng chá»n nghá» gáº§n nháº¥t trÆ°á»›c khi táº¡o lá»™ trÃ¬nh.';
const MISSING_ACCESS_ERROR = 'Báº¡n cáº§n má»Ÿ khÃ³a lá»™ trÃ¬nh 79K hoáº·c nháº­p Ä‘Ãºng mÃ£ truy cáº­p Ä‘á»ƒ táº¡o checklist.';
const MISSING_ROLE_ERROR = 'Há»‡ thá»‘ng chÆ°a cÃ³ bá»™ ká»¹ nÄƒng Ä‘á»§ cháº¯c cho nghá» nÃ y. Vui lÃ²ng chá»n nghá» gáº§n nháº¥t trong danh sÃ¡ch.';

const getRoadmapStorageKey = (id: string | null | undefined, accessCode?: string | null) => {
  const cleanId = String(id || '').trim();
  const cleanAccess = cleanRoadmapAccessCode(accessCode || '');
  return cleanId ? `${STORAGE_KEY}:${cleanId}${cleanAccess ? `:${cleanAccess}` : ''}` : STORAGE_KEY;
};

const safeRoadmapErrorMessage = (payload: { error?: unknown; code?: unknown } | null | undefined) => {
  const code = typeof payload?.code === 'string' ? payload.code : '';
  const rawError = typeof payload?.error === 'string' ? repairMojibakeText(payload.error) : '';
  if (code === 'ROLE_CONFIRMATION_REQUIRED') return ROLE_CONFIRMATION_ERROR;
  if (code === 'MISSING_ROLE_ID') return MISSING_ROLE_ERROR;
  if (code === 'MISSING_ACCESS') return MISSING_ACCESS_ERROR;
  if (code === 'INVALID_SALARY') return 'Nháº­p lÆ°Æ¡ng hiá»‡n táº¡i há»£p lá»‡ trÆ°á»›c khi táº¡o lá»™ trÃ¬nh.';
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
    title: 'Má»›i tá»‘t nghiá»‡p',
    note: 'ChÆ°a rÃµ nÃªn Ä‘i hÆ°á»›ng nÃ o: chá»n role Ä‘áº§u Ä‘á»i, há»“ sÆ¡ sáº£n pháº©m vÃ  ká»‹ch báº£n qua thá»­ viá»‡c.',
    job: 'Sinh viÃªn má»›i tá»‘t nghiá»‡p chÆ°a rÃµ Ä‘á»‹nh hÆ°á»›ng',
    salary: '10000000',
    duration: 6 as const,
  },
  {
    id: 'stuck-mid-career',
    title: '3+ nÄƒm dáº­m chÃ¢n',
    note: 'LÆ°Æ¡ng Ä‘á»©ng yÃªn dÃ¹ Ä‘Ã£ lÃ m lÃ¢u: tÃ¬m nÃºt tháº¯t, KPI vÃ  lá»™ trÃ¬nh lÃªn band.',
    job: 'NhÃ¢n sá»± Ä‘i lÃ m trÃªn 3 nÄƒm nhÆ°ng lÆ°Æ¡ng dáº­m chÃ¢n táº¡i chá»—',
    salary: '16000000',
    duration: 6 as const,
  },
  {
    id: 'career-pivot',
    title: 'Muá»‘n Ä‘á»•i hÆ°á»›ng',
    note: 'CÃ³ kinh nghiá»‡m nhÆ°ng khÃ´ng cháº¯c nghá» hiá»‡n táº¡i cÃ²n Ä‘Ã¡ng theo: chuyá»ƒn ká»¹ nÄƒng sang role má»›i.',
    job: 'NhÃ¢n sá»± muá»‘n Ä‘á»•i hÆ°á»›ng nghá» nghiá»‡p',
    salary: '18000000',
    duration: 6 as const,
  },
];

const EDUCATION_LEVELS = [
  '12/12',
  'Trung cáº¥p / Cao Ä‘áº³ng',
  'Cá»­ nhÃ¢n',
  'Tháº¡c sÄ© / MBA',
  'Tiáº¿n sÄ©',
  'KhÃ¡c',
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
  const levelNames = ['TÃ¢n binh', 'CÃ³ ná»n', 'CÃ³ báº±ng chá»©ng', 'Sáºµn sÃ ng deal', 'á»¨ng viÃªn top'];
  const remaining = Math.max(0, total - done);
  const encouragement = pct >= 100
    ? 'Há»“ sÆ¡ hoÃ n chá»‰nh rá»“i. BÃ¢y giá» khÃ´ng chá»‰ lÃ  há»c ná»¯a, Ä‘Ã¢y lÃ  bá»™ báº±ng chá»©ng Ä‘á»ƒ nÃ³i chuyá»‡n lÆ°Æ¡ng hoáº·c tÃ¬m nÆ¡i tráº£ Ä‘Ãºng giÃ¡.'
    : pct >= 80
      ? `Gáº§n Ä‘á»§ há»“ sÆ¡ thÄƒng tiáº¿n. CÃ²n ${remaining} viá»‡c ná»¯a lÃ  Ä‘á»§ bá»™ báº±ng chá»©ng deal lÆ°Æ¡ng cá»±c sáº¯c.`
      : pct >= 50
        ? `ÄÃ£ qua ná»­a Ä‘Æ°á»ng. Tiáº¿p tá»¥c Ä‘Ã³ng gÃ³i báº±ng chá»©ng, Ä‘á»«ng Ä‘á»ƒ káº¿t quáº£ náº±m ráº£i rÃ¡c trong Ä‘áº§u.`
        : pct >= 20
          ? `Äang lÃªn giai Ä‘oáº¡n. Má»—i viá»‡c tick xong lÃ  thÃªm má»™t máº£nh báº±ng chá»©ng Ä‘á»ƒ tÄƒng xÃ¡c suáº¥t deal.`
          : `Báº¯t Ä‘áº§u báº±ng viá»‡c dá»… nháº¥t hÃ´m nay. KhÃ´ng cáº§n hoÃ n háº£o, chá»‰ cáº§n cÃ³ báº±ng chá»©ng Ä‘áº§u tiÃªn.`;
  return (
    <div className="rounded-2xl border border-[#e8b84b]/25 bg-[#0f1219] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-mono font-black uppercase tracking-normal text-[#e8b84b]">
            {humanizeWorkCopy(plan?.levelName || 'Cáº¥p Ä‘á»™ báº±ng chá»©ng')}
          </p>
          <h2 className="mt-1 text-lg font-black leading-tight text-[#f0ede8]">
            Giai Ä‘oáº¡n {level} - {levelNames[level - 1]}
          </h2>
        </div>
        <div className="shrink-0 rounded-xl border border-white/10 bg-[#161b26] px-3 py-2 text-center">
          <p className="text-[9px] uppercase text-[#f0ede8]/35">Äiá»ƒm</p>
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
          <p className="text-[9px] uppercase text-[#f0ede8]/35">HoÃ n thÃ nh</p>
          <p className="text-xs font-black text-[#f0ede8]">{done}/{total} viá»‡c</p>
        </div>
        <div className="rounded-xl border border-white/8 bg-[#161b26] px-3 py-2">
          <p className="text-[9px] uppercase text-[#f0ede8]/35">Tiáº¿n Ä‘á»™</p>
          <p className="text-xs font-black text-green-300">{pct}%</p>
        </div>
      </div>
      {plan && (
        <p className="mt-3 text-[11px] leading-relaxed text-[#f0ede8]/55">
          Cam káº¿t chuáº©n {plan.standardWeeks} tuáº§n, nhá»‹p báº­n {plan.flexibleWeeks} tuáº§n, má»—i tuáº§n {plan.weeklyHours}. {humanizeWorkCopy(plan.completionRule)}
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
      'Chá»n nhÃ¡nh HR má»¥c tiÃªu',
      'BÃ³c JD vÃ  viá»‡c háº±ng ngÃ y',
      'Mini case tuyá»ƒn dá»¥ng/L&D/C&B',
      'Coffee chat há»i nghá»',
      'CV theo nhÃ¡nh Ä‘Ã£ chá»n',
      'Tracker pháº£n há»“i á»©ng tuyá»ƒn',
      'KPI nhÃ¢n sá»± cÆ¡ báº£n',
      'Portfolio chuyá»ƒn hÆ°á»›ng HR',
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
      'Checklist an toÃ n bay',
      'Service recovery',
      'Announcement tiáº¿ng Anh',
      'Xá»­ lÃ½ complaint hÃ nh khÃ¡ch',
      'Grooming vÃ  tÃ¡c phong cabin',
      'Teamwork vá»›i crew',
      'Briefing/debrief sau chuyáº¿n',
      'Feedback tá»« senior crew',
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
      'Checklist phÃ²ng/area',
      'Tá»‘c Ä‘á»™ dá»n phÃ²ng/check-out room',
      'Set amenities/minibar/laundry handover',
      'BÃ¡o maintenance/lost & found',
      'Giáº£m lá»—i/rework phÃ²ng',
      'Xá»­ lÃ½ request/complaint khÃ¡ch',
      'Feedback giÃ¡m sÃ¡t ca',
      'Há»“ sÆ¡ housekeeping cÃ³ áº£nh before-after',
    ];
  }

  if (isCleaningRoadmapRole(roleText)) {
    return [
      'Checklist khu vá»±c vá»‡ sinh',
      'Chuáº©n dá»¥ng cá»¥/hÃ³a cháº¥t',
      'áº¢nh before-after',
      'Giáº£m lá»—i/rework',
      'Complaint log',
      'Audit cleanliness',
      'BÃ n giao cuá»‘i ca',
      'Feedback giÃ¡m sÃ¡t',
    ];
  }

  if (/giao vien (toan|ly|vat ly|hoa|su|lich su|dia|ngu van|van|tin hoc|sinh|cong nghe|gdcd|tieu hoc|thcs|thpt|bo mon)|teacher math|math teacher|public subject teacher/.test(roleText)) {
    return [
      'GiÃ¡o Ã¡n bá»™ mÃ´n',
      'Ma tráº­n Ä‘á» vÃ  rubric',
      'Báº£ng tiáº¿n bá»™ há»c sinh',
      'Phá»¥ Ä‘áº¡o/bá»“i dÆ°á»¡ng Ä‘Ãºng nhÃ³m',
      'Há»“ sÆ¡ dá»± giá»/gÃ³p Ã½',
      'ChuyÃªn Ä‘á» tá»• chuyÃªn mÃ´n',
      'BÃ i há»c sinh Ä‘Ã£ áº©n danh',
      'Há»“ sÆ¡ thi Ä‘ua/phá»¥ cáº¥p',
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
      'Demo class 10-15 phÃºt',
      'Rubric Speaking/Writing',
      'Pre-test/post-test tracker',
      'Homework completion',
      'Attendance/retention lá»›p',
      'Feedback há»c viÃªn/phá»¥ huynh',
      'Case study tiáº¿n bá»™ há»c viÃªn',
    ];
  }

  if (/dao tao|l&d|learning|teacher|giao vien|giang day|tesol|ngon ngu anh/.test(roleText)) {
    return [
      'Instructional Design',
      'Thiáº¿t káº¿ slide Canva/PowerPoint',
      'Quay vÃ  edit video bÃ i giáº£ng',
      'Photoshop/Canva xá»­ lÃ½ hÃ¬nh áº£nh',
      'Thiáº¿t káº¿ quiz/LMS/e-learning',
      'Tiáº¿ng Anh B2+ cho cÃ´ng viá»‡c',
      'Viáº¿t CV/LinkedIn dáº¡ng case study',
      'PhÃ¢n tÃ­ch feedback há»c viÃªn',
    ];
  }

  if (/\bmc\b|nguoi dan|dan chuong trinh|host|su kien|event host|livestream host|presenter|moderator|voice over|wedding mc/.test(roleText)) {
    return [
      'Dáº«n sÃ¢n kháº¥u vÃ  giá»¯ nhá»‹p chÆ°Æ¡ng trÃ¬nh',
      'Viáº¿t lá»i dáº«n theo brand voice',
      'Xá»­ lÃ½ tÃ¬nh huá»‘ng live',
      'TÆ°Æ¡ng tÃ¡c khÃ¡n giáº£/khÃ¡ch má»i',
      'LÃ m showreel 60-90 giÃ¢y',
      'Briefing vÃ  rehearsal trÆ°á»›c show',
      'LÃ m rate card theo format sá»± kiá»‡n',
      'Thu tháº­p feedback khÃ¡ch/agency',
    ];
  }

  if (/doi huong|chuyen huong|pivot|muon doi huong|chua ro dinh huong|moi tot nghiep|moi ra truong|sinh vien/.test(roleText)) {
    return [
      'Chá»n 3 role má»¥c tiÃªu',
      'Äá»c JD vÃ  bÃ³c viá»‡c háº±ng ngÃ y',
      'LÃ m mini project 2-3 giá»',
      'Xin feedback tá»« ngÆ°á»i Ä‘i lÃ m',
      'Sá»­a CV theo role Ä‘Ã£ chá»n',
      'Gá»­i thá»­ 10 há»“ sÆ¡ Ä‘Ãºng hÆ°á»›ng',
      'Coffee chat há»i nghá»',
      'Tracker pháº£n há»“i tuyá»ƒn dá»¥ng',
    ];
  }

  if (/dau bep|chef|bep truong|bep pho|sous chef|cook|phu bep|barista|bartender|pha che|kitchen/.test(roleText)) {
    return [
      'Kiá»ƒm soÃ¡t food cost',
      'Giáº£m waste nguyÃªn liá»‡u',
      'Recipe card cÃ³ Ä‘á»‹nh lÆ°á»£ng',
      'Chuáº©n plating giá» cao Ä‘iá»ƒm',
      'Tá»‘c Ä‘á»™ ra mÃ³n',
      'Kitchen SOP',
      'An toÃ n vá»‡ sinh/HACCP',
      'Training phá»¥ báº¿p',
    ];
  }

  const taxonomyBank = taxonomyRoadmapSkillBank(roleText);
  if (taxonomyBank.length) return taxonomyBank;

  if (/marketing|content|social|media|brand|designer|thiet ke/.test(roleAndContextText)) {
    return [
      'Edit video short-form',
      'Thiáº¿t káº¿ Canva',
      'Photoshop cÆ¡ báº£n',
      'Copywriting chuyá»ƒn Ä‘á»•i',
      'Láº­p content calendar',
      'Äá»c chá»‰ sá»‘ reach/CTR/CVR',
      'Viáº¿t portfolio campaign',
      'Viáº¿t CV/LinkedIn dáº¡ng case study',
    ];
  }

  if (/\b(developer|engineer|backend|frontend|data analyst|data engineer|data scientist|software|devops|tester|qa|it\b)\b/.test(roleText)) {
    return [
      'Git/GitHub workflow',
      'TypeScript/JavaScript thá»±c chiáº¿n',
      'SQL vÃ  Ä‘á»c dá»¯ liá»‡u',
      'API integration',
      'Debugging cÃ³ log',
      'Viáº¿t tÃ i liá»‡u ká»¹ thuáº­t',
      'System design cÆ¡ báº£n',
      'Viáº¿t CV ká»¹ thuáº­t theo project',
    ];
  }

  if (/cong nhan|van hanh may|san xuat|factory|operator|line|kho|qc/.test(roleText)) {
    return [
      'Váº­n hÃ nh mÃ¡y Ä‘Ãºng SOP',
      '5S vÃ  an toÃ n lao Ä‘á»™ng',
      'Ghi chÃ©p lá»—i sáº£n xuáº¥t',
      'Excel/Sheets theo dÃµi sáº£n lÆ°á»£ng',
      'QC checklist',
      'Giáº£m lá»—i line',
      'ÄÃ o táº¡o ngÆ°á»i má»›i',
      'Há»“ sÆ¡ lÃªn tá»• phÃ³/tá»• trÆ°á»Ÿng',
    ];
  }

  if (/sales|kinh doanh|account|tu van|ban hang/.test(roleAndContextText)) {
    return [
      'CRM pipeline',
      'Cold message/email',
      'Viáº¿t proposal',
      'Follow-up khÃ¡ch hÃ ng',
      'Äá»c conversion rate',
      'Chá»‘t lá»‹ch demo/tÆ° váº¥n',
      'PhÃ¢n tÃ­ch lÃ½ do máº¥t deal',
      'Viáº¿t CV sales báº±ng sá»‘',
    ];
  }

  return [
    'Excel/Google Sheets dashboard',
    'Canva/PowerPoint trÃ¬nh bÃ y',
    'Viáº¿t CV/LinkedIn dáº¡ng case study',
    'Tiáº¿ng Anh B2+ cho cÃ´ng viá»‡c',
    'Viáº¿t bÃ¡o cÃ¡o KPI',
    'Quáº£n lÃ½ viá»‡c báº±ng checklist',
    'Giao tiáº¿p vá»›i quáº£n lÃ½/khÃ¡ch hÃ ng',
    'ÄÃ³ng gÃ³i portfolio cÃ¡ nhÃ¢n',
  ];
}

function uniqueRoadmapSkills(plan: RoadmapActionPlan | undefined, profile: RoadmapProfile | null) {
  const blocked = /Ä‘Ã m phÃ¡n lÆ°Æ¡ng|táº¡o báº±ng chá»©ng tÄƒng lÆ°Æ¡ng|evidence log|tÃ¬m cÆ¡ há»™i tráº£ cao hÆ¡n|Ä‘Ã³ng gÃ³i output/i;
  const roleText = getSafeRoadmapRoleText(profile);
  const isAviation = /tiep vien hang khong|cabin crew|flight attendant|stewardess|steward|hang khong|airline|hang bay/.test(roleText);
  const wrongForAviation = /git|github|typescript|javascript|sql|api|debugging|system design|code|developer|dashboard ká»¹ thuáº­t|pull request/i;
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
  const targetLabel = profile?.twoYearGoal || `má»¥c tiÃªu ${duration} thÃ¡ng`;
  const encouragement =
    stats.pct >= 100
      ? 'Báº¡n Ä‘Ã£ Ä‘á»§ bá»™ báº±ng chá»©ng Ä‘á»ƒ deal full má»¥c tiÃªu hoáº·c dÃ¹ng há»“ sÆ¡ nÃ y apply sang band cao hÆ¡n.'
      : halfwayReached
        ? `Báº¡n Ä‘Ã£ Ä‘i qua 50% cháº·ng Ä‘Æ°á»ng. ÄÃ¢y lÃ  lÃºc xin review thá»­: Ä‘á» xuáº¥t 50% má»©c tÄƒng má»¥c tiÃªu, kÃ¨m báº±ng chá»©ng vÃ  KPI Ä‘Ã£ hoÃ n thÃ nh.`
        : completedMonths > 0
          ? `Báº¡n Ä‘Ã£ xong ${completedMonths} cháº·ng. Tiáº¿p tá»¥c má»Ÿ ká»¹ nÄƒng má»›i, Ä‘á»«ng Ä‘á»ƒ báº±ng chá»©ng náº±m rá»i ráº¡c trong checklist.`
          : 'Má»¥c tiÃªu Ä‘áº§u tiÃªn khÃ´ng pháº£i tÄƒng lÆ°Æ¡ng ngay. Má»¥c tiÃªu lÃ  má»Ÿ ká»¹ nÄƒng ná»n vÃ  táº¡o báº±ng chá»©ng Ä‘áº§u tiÃªn Ä‘á»§ rÃµ Ä‘á»ƒ ngÆ°á»i khÃ¡c kiá»ƒm chá»©ng.';

  return (
    <div className="w-full max-w-full space-y-4 overflow-hidden rounded-2xl border border-[#8b5cf6]/30 bg-[#0f1219] p-4 shadow-[0_0_30px_rgba(139,92,246,0.10)]">
      <div>
        <p className="text-[10px] font-mono font-black uppercase tracking-normal text-[#c4b5fd]">Lá»™ trÃ¬nh thÄƒng tiáº¿n 79K</p>
        <h2 className="mt-1 text-lg font-black leading-tight text-[#f0ede8]">Báº£n Ä‘á»“ thÄƒng tiáº¿n báº±ng há»“ sÆ¡ báº±ng chá»©ng</h2>
        <p className="mt-2 text-[11px] leading-relaxed text-[#f0ede8]/55">
          La BÃ n 29K cho biáº¿t pháº£i Ä‘i Ä‘Ã¢u. Báº£n 79K biáº¿n má»¥c tiÃªu Ä‘Ã³ thÃ nh lá»™ trÃ¬nh {duration} thÃ¡ng: má»—i cháº·ng cÃ³ sáº£n pháº©m cáº§n ná»™p, báº±ng chá»©ng cáº§n lÆ°u vÃ  thá»i Ä‘iá»ƒm nÃªn xin review lÆ°Æ¡ng.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          ['XP', `${stats.done * 50 + evidenceCount * 25}`],
          ['Báº±ng chá»©ng', `${evidenceCount}/${stats.total}`],
          ['Level', stats.pct >= 80 ? 'Chá»‘t deal' : stats.pct >= 50 ? 'Xin review' : 'XÃ¢y ná»n'],
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
              <p className="text-[10px] font-mono font-black uppercase tracking-normal text-green-300">Nhiá»‡m vá»¥ hÃ´m nay</p>
              <h3 className="mt-1 text-sm font-black leading-tight text-[#f0ede8]">{humanizeWorkCopy(nextQuest.task.title)}</h3>
              <p className="mt-2 text-[11px] leading-relaxed text-[#f0ede8]/58">
                Ná»™p: {humanizeWorkCopy(nextQuest.task.output)}
              </p>
            </div>
            <div className="shrink-0 rounded-xl border border-green-300/25 bg-[#0a0c10] px-3 py-2 text-center">
              <p className="text-[9px] uppercase text-[#f0ede8]/35">ThÆ°á»Ÿng</p>
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
                  {done ? 'âœ“' : index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[12px] font-black leading-tight text-[#f0ede8]">ThÃ¡ng {item.milestone.month}: {humanizeWorkCopy(item.milestone.title)}</p>
                    <span className="shrink-0 text-[10px] font-black text-[#e8b84b]">{item.pct}%</span>
                  </div>
                  <p className="mt-1 text-[10px] leading-relaxed text-[#f0ede8]/50">
                    Cáº§n lÃ m: {item.total} viá»‡c. Xong cháº·ng nÃ y pháº£i cÃ³ báº±ng chá»©ng Ä‘á»§ rÃµ Ä‘á»ƒ ngÆ°á»i khÃ¡c kiá»ƒm tra.
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
        <p className="text-[10px] font-mono font-black uppercase tracking-normal text-[#e8b84b]">Checkpoint deal lÆ°Æ¡ng</p>
        <p className="mt-1 text-[12px] font-bold leading-relaxed text-[#f0ede8]">{encouragement}</p>
        <p className="mt-2 text-[10px] leading-relaxed text-[#f0ede8]/50">Má»¥c tiÃªu Ä‘ang theo: {targetLabel}</p>
      </div>

      <div>
        <p className="text-[10px] font-mono font-black uppercase tracking-normal text-[#e8b84b]">Báº±ng chá»©ng/ká»¹ nÄƒng Ä‘ang ghi nháº­n</p>
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
                  {unlocked ? 'âœ“ ÄÃ£ ghi nháº­n' : 'â–¡ ChÆ°a ghi nháº­n'}
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
      `HoÃ n thÃ nh ${stats.done}/${stats.total} viá»‡c theo checklist cabin crew cÃ³ báº±ng chá»©ng vÃ  ngÆ°á»i xÃ¡c nháº­n.`,
      'CÃ³ checklist safety-service cÃ¡ nhÃ¢n cho trÆ°á»›c chuyáº¿n, boarding, phá»¥c vá»¥, complaint vÃ  debrief.',
      'CÃ³ Ã­t nháº¥t 1 báº£n ghi announcement tiáº¿ng Anh hoáº·c script tÃ¬nh huá»‘ng Ä‘Ã£ luyá»‡n.',
      'CÃ³ feedback tá»« senior crew/Ä‘á»“ng nghiá»‡p vá» grooming, teamwork hoáº·c xá»­ lÃ½ khÃ¡ch.',
      'CÃ³ 1 case service recovery Ä‘Ã£ che toÃ n bá»™ thÃ´ng tin riÃªng tÆ° hÃ nh khÃ¡ch.',
      'CÃ³ há»“ sÆ¡ cabin crew dÃ¹ng Ä‘Æ°á»£c khi review ná»™i bá»™ hoáº·c á»©ng tuyá»ƒn tuyáº¿n/role tá»‘t hÆ¡n.',
    ];
  }

  if (isRestaurantManager || isHotelManager) {
    return [
      `HoÃ n thÃ nh ${stats.done}/${stats.total} viá»‡c theo checklist quáº£n lÃ½ váº­n hÃ nh cÃ³ KPI vÃ  báº±ng chá»©ng.`,
      'CÃ³ dashboard ca/thÃ¡ng vá» doanh thu, cháº¥t lÆ°á»£ng dá»‹ch vá»¥, chi phÃ­ chÃ­nh vÃ  complaint recovery.',
      'CÃ³ báº±ng chá»©ng roster/SOP/training vÃ  feedback tá»« owner/GM hoáº·c quáº£n lÃ½ trá»±c tiáº¿p.',
      'CÃ³ 1 case xá»­ lÃ½ váº¥n Ä‘á» váº­n hÃ nh: thiáº¿u ngÆ°á»i, complaint lá»›n, review xáº¥u hoáº·c chi phÃ­ vÆ°á»£t ngÆ°á»¡ng.',
      'CÃ³ há»“ sÆ¡ dÃ¹ng Ä‘Æ°á»£c Ä‘á»ƒ xin review lÆ°Æ¡ng hoáº·c á»©ng tuyá»ƒn role manager cao hÆ¡n.',
    ];
  }

  if (isRestaurantFrontline || isHotelFrontline) {
    return [
      `HoÃ n thÃ nh ${stats.done}/${stats.total} viá»‡c theo checklist frontline dá»‹ch vá»¥ cÃ³ báº±ng chá»©ng.`,
      'CÃ³ log ca vá» order/booking/request, lá»—i Ä‘Ã£ sá»­a, handover vÃ  feedback quáº£n lÃ½ ca.',
      'CÃ³ báº±ng chá»©ng xá»­ lÃ½ khÃ¡ch: complaint, request, upsell hoáº·c review mention Ä‘Ã£ che thÃ´ng tin riÃªng tÆ°.',
      'CÃ³ 3 bullet CV báº±ng sá»‘: sá»‘ ca, sá»‘ bill/check-in/request, tá»· lá»‡ lá»—i giáº£m hoáº·c feedback.',
      'CÃ³ há»“ sÆ¡ dÃ¹ng Ä‘Æ°á»£c Ä‘á»ƒ xin review lÆ°Æ¡ng hoáº·c lÃªn senior/shift lead.',
    ];
  }

  if (isChef) {
    return [
      `HoÃ n thÃ nh ${stats.done}/${stats.total} viá»‡c theo checklist nghá» báº¿p cÃ³ báº±ng chá»©ng vÃ  ngÆ°á»i xÃ¡c nháº­n.`,
      'CÃ³ recipe card/Ä‘á»‹nh lÆ°á»£ng cho mÃ³n chá»§ lá»±c, kÃ¨m chuáº©n plating hoáº·c checklist ra mÃ³n.',
      'CÃ³ ghi chÃº food cost, waste, tá»‘c Ä‘á»™ ra mÃ³n hoáº·c lá»—i mÃ³n giáº£m trong ca tháº­t.',
      'CÃ³ feedback tá»« báº¿p trÆ°á»Ÿng/ca trÆ°á»Ÿng/Ä‘á»“ng nghiá»‡p vá» cháº¥t lÆ°á»£ng vÃ  tá»‘c Ä‘á»™.',
      'CÃ³ SOP ca báº¿p hoáº·c checklist mise en place dÃ¹ng Ä‘Æ°á»£c trong giá» cao Ä‘iá»ƒm.',
      'CÃ³ há»“ sÆ¡ báº¿p dÃ¹ng Ä‘Æ°á»£c khi xin review, apply chuá»—i nhÃ  hÃ ng/khÃ¡ch sáº¡n hoáº·c lÃªn ca trÆ°á»Ÿng.',
    ];
  }

  if (isPerformer) {
    return [
      `HoÃ n thÃ nh ${stats.done}/${stats.total} viá»‡c theo checklist MC/host cÃ³ báº±ng chá»©ng vÃ  feedback.`,
      'CÃ³ showreel hoáº·c clip 60-90 giÃ¢y thá»ƒ hiá»‡n má»Ÿ mÃ n, chuyá»ƒn Ä‘oáº¡n vÃ  xá»­ lÃ½ tÃ¬nh huá»‘ng.',
      'CÃ³ 3 máº«u lá»i dáº«n theo format sá»± kiá»‡n hoáº·c brand voice khÃ¡c nhau.',
      'CÃ³ rate card hoáº·c gÃ³i dá»‹ch vá»¥ kÃ¨m pháº¡m vi rehearsal/script/di chuyá»ƒn.',
      'CÃ³ feedback tá»« khÃ¡ch/agency/producer vá» giá»ng, nhá»‹p sÃ¢n kháº¥u vÃ  Ä‘á»™ chuyÃªn nghiá»‡p.',
      'CÃ³ há»“ sÆ¡ MC dÃ¹ng Ä‘Æ°á»£c Ä‘á»ƒ bÃ¡o giÃ¡, xin show tá»‘t hÆ¡n hoáº·c deal fee cao hÆ¡n.',
    ];
  }

  if (isHospitality) {
    return [
      `HoÃ n thÃ nh ${stats.done}/${stats.total} viá»‡c theo checklist housekeeping/hospitality cÃ³ báº±ng chá»©ng vÃ  ngÆ°á»i xÃ¡c nháº­n.`,
      'CÃ³ checklist phÃ²ng/area dÃ¹ng Ä‘Æ°á»£c cho ca tháº­t, gá»“m nháº­n phÃ²ng, vá»‡ sinh, amenities, maintenance vÃ  bÃ n giao.',
      'CÃ³ log tá»‘c Ä‘á»™ dá»n phÃ²ng hoáº·c sá»‘ phÃ²ng/ca, kÃ¨m lá»—i/rework Ä‘Ã£ giáº£m hoáº·c Ä‘Æ°á»£c xá»­ lÃ½.',
      'CÃ³ áº£nh before-after Ä‘Ã£ che thÃ´ng tin khÃ¡ch vÃ  khÃ´ng lá»™ dá»¯ liá»‡u riÃªng tÆ°.',
      'CÃ³ feedback tá»« giÃ¡m sÃ¡t/Ä‘á»“ng nghiá»‡p vá» cháº¥t lÆ°á»£ng phÃ²ng, tÃ¡c phong vÃ  bÃ n giao.',
      'CÃ³ há»“ sÆ¡ housekeeping dÃ¹ng Ä‘Æ°á»£c khi review ná»™i bá»™ hoáº·c á»©ng tuyá»ƒn role senior/supervisor.',
    ];
  }

  if (isCleaning) {
    return [
      `HoÃ n thÃ nh ${stats.done}/${stats.total} viá»‡c theo checklist vá»‡ sinh cÃ³ báº±ng chá»©ng vÃ  ngÆ°á»i xÃ¡c nháº­n.`,
      'CÃ³ checklist khu vá»±c vá»‡ sinh vá»›i tiÃªu chuáº©n sáº¡ch, dá»¥ng cá»¥/hÃ³a cháº¥t, PPE vÃ  Ä‘iá»ƒm nghiá»‡m thu.',
      'CÃ³ áº£nh before-after hoáº·c audit cleanliness cho Ã­t nháº¥t 1 khu vá»±c/ca tháº­t.',
      'CÃ³ log lá»—i/rework/complaint vÃ  hÃ nh Ä‘á»™ng sá»­a trong ca.',
      'CÃ³ feedback tá»« giÃ¡m sÃ¡t/Ä‘á»“ng nghiá»‡p vá» cháº¥t lÆ°á»£ng, an toÃ n vÃ  bÃ n giao.',
      'CÃ³ há»“ sÆ¡ vá»‡ sinh dÃ¹ng Ä‘Æ°á»£c khi review ná»™i bá»™ hoáº·c á»©ng tuyá»ƒn ca/role tá»‘t hÆ¡n.',
    ];
  }

  if (isDriverDelivery) {
    return driverDeliveryAchievements(stats.done, stats.total);
  }

  if (isPublicSubjectTeacher) {
    return [
      `HoÃ n thÃ nh ${stats.done}/${stats.total} viá»‡c theo checklist giÃ¡o viÃªn bá»™ mÃ´n cÃ³ báº±ng chá»©ng vÃ  KPI.`,
      'CÃ³ giÃ¡o Ã¡n/ma tráº­n Ä‘á»/rubric gáº¯n vá»›i Ä‘Ãºng mÃ´n Ä‘ang dáº¡y, khÃ´ng dÃ¹ng checklist trung tÃ¢m ngoáº¡i ngá»¯.',
      'CÃ³ báº£ng tiáº¿n bá»™ há»c sinh Ä‘Ã£ áº©n danh: Ä‘iá»ƒm trÆ°á»›c-sau, lá»—i thÆ°á»ng gáº·p vÃ  nhÃ³m cáº§n phá»¥ Ä‘áº¡o/bá»“i dÆ°á»¡ng.',
      'CÃ³ nháº­n xÃ©t dá»± giá»/gÃ³p Ã½ tá»« tá»• chuyÃªn mÃ´n hoáº·c Ä‘á»“ng nghiá»‡p Ä‘á»ƒ chá»©ng minh cáº£i thiá»‡n tiáº¿t dáº¡y.',
      'CÃ³ há»“ sÆ¡ chuyÃªn mÃ´n dÃ¹ng Ä‘Æ°á»£c cho thi Ä‘ua, phá»¥ cáº¥p, giÃ¡o viÃªn nÃ²ng cá»‘t hoáº·c subject lead Ä‘Ãºng bá»™ mÃ´n.',
      'CÃ³ case 1 trang theo format: váº¥n Ä‘á» lá»›p há»c - hÃ nh Ä‘á»™ng - káº¿t quáº£ - báº±ng chá»©ng.',
    ];
  }

  if (/dao tao|l&d|learning|teacher|giao vien|giang day|trung tam ngoai ngu/.test(text)) {
    return [
      `HoÃ n thÃ nh ${stats.done}/${stats.total} viá»‡c theo checklist cÃ³ báº±ng chá»©ng vÃ  KPI.`,
      'Táº¡o Ä‘Æ°á»£c 1 bá»™ slide/lesson outline cÃ³ má»¥c tiÃªu há»c, bÃ i táº­p vÃ  tiÃªu chÃ­ Ä‘Ã¡nh giÃ¡.',
      'CÃ³ Ã­t nháº¥t 1 video hoáº·c demo bÃ i giáº£ng ngáº¯n Ä‘á»ƒ Ä‘Æ°a vÃ o portfolio.',
      'Thu tháº­p feedback tháº­t vÃ  cÃ³ phiÃªn báº£n Ä‘Ã£ sá»­a sau feedback.',
      'Biáº¿t quy Ä‘á»•i káº¿t quáº£ Ä‘Ã o táº¡o thÃ nh chá»‰ sá»‘: completion, feedback score, retention hoáº·c complaint.',
      'CÃ³ CV/LinkedIn bullet theo format: ká»¹ nÄƒng + sáº£n pháº©m + káº¿t quáº£ Ä‘o Ä‘Æ°á»£c.',
    ];
  }

  const outputs = Array.from(new Set((plan?.milestones
    .flatMap(milestone => milestone.weeks.flatMap(week => week.tasks.map(task => task.output)))
    .map(output => output.trim())
    .filter(output => output.length > 6 && !/evidence log|output gáº¯n trá»±c tiáº¿p/i.test(output)) ?? []))).slice(0, 3);

  return [
    `HoÃ n thÃ nh ${stats.done}/${stats.total} viá»‡c theo checklist cÃ³ báº±ng chá»©ng vÃ  KPI.`,
    `CÃ³ portfolio/case study cho role ${profile?.job || 'á»©ng viÃªn'} Ä‘á»ƒ gá»­i cho sáº¿p hoáº·c HR.`,
    'CÃ³ CV/LinkedIn bullet theo format: ká»¹ nÄƒng + sáº£n pháº©m + káº¿t quáº£ Ä‘o Ä‘Æ°á»£c.',
    'CÃ³ báº£ng theo dÃµi káº¿t quáº£ trÆ°á»›c/sau phÃ¹ há»£p vá»›i nghá» cá»§a báº¡n.',
    ...outputs.map(output => `HoÃ n thÃ nh sáº£n pháº©m: ${output}`),
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
  const recipientName = cleanSharedName(profile?.fullName || readSharedName()) || 'á»¨ng viÃªn Top LÆ°Æ¡ng';
  const verifiedRole = profile?.job || profile?.currentPosition || 'Há»“ sÆ¡ Top LÆ°Æ¡ng';
  const verifyUrl = `https://www.topluong.com/verify?id=${encodeURIComponent(profile?.vspiId || '')}`;
  const evidenceUrl = `${verifyUrl}#evidence`;
  const displayVerifyUrl = verifyUrl.replace(/^https?:\/\//, '');
  const displayEvidenceUrl = evidenceUrl.replace(/^https?:\/\//, '');

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
    canvas.width = 1200;
    canvas.height = 1800;
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

    roundRect(70, 70, 1060, 1660, 32, '#0f1219', 'rgba(232,184,75,0.58)');
    roundRect(865, 105, 180, 180, 90, '#1d1a12', 'rgba(232,184,75,0.72)');
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e8b84b';
    ctx.font = '900 24px Arial';
    ctx.fillText('TOP LÆ¯Æ NG', 955, 185);
    ctx.font = '900 20px Arial';
    ctx.fillText('VERIFIED', 955, 220);
    ctx.textAlign = 'left';

    ctx.fillStyle = '#e8b84b';
    ctx.font = '900 24px Arial';
    ctx.fillText('TOP LÆ¯Æ NG Â· VSPI VERIFIED', 120, 145);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '900 48px Arial';
    wrapText(isComplete ? 'Chá»©ng nháº­n hoÃ n thÃ nh lá»™ trÃ¬nh' : 'Chá»©ng nháº­n nÄƒng lá»±c tÄƒng lÆ°Æ¡ng', 120, 220, 720, 56, 2);
    ctx.fillStyle = '#86efac';
    ctx.font = '900 28px Arial';
    ctx.fillText(`${stats.done}/${stats.total} viá»‡c Â· ${achievedSkillCount}/${skills.length} ká»¹ nÄƒng Â· ${evidenceCount} báº±ng chá»©ng`, 120, 350);

    roundRect(120, 405, 960, 155, 24, '#151b26', 'rgba(232,184,75,0.22)');
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '700 20px Arial';
    ctx.fillText('Trao cho', 155, 455);
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 34px Arial';
    wrapText(recipientName, 155, 505, 860, 42, 2);
    ctx.fillStyle = '#d1d5db';
    ctx.font = '600 20px Arial';
    wrapText(`${verifiedRole} Â· VSPI ID ${profile?.vspiId || 'VSPI'} Â· Cáº¥p ngÃ y ${issuedAt}`, 155, 545, 860, 26, 2);

    const statCards: Array<[string, string]> = [
      ['Tiáº¿n Ä‘á»™', `${stats.pct}%`],
      ['Viá»‡c xong', `${stats.done}/${stats.total}`],
      ['Báº±ng chá»©ng', `${evidenceCount}`],
    ];
    statCards.forEach(([label, value], index) => {
      const x = 120 + index * 325;
      roundRect(x, 600, 300, 110, 20, '#151b26', 'rgba(232,184,75,0.22)');
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '700 18px Arial';
      ctx.fillText(label, x + 28, 642);
      ctx.fillStyle = '#e8b84b';
      ctx.font = '900 36px Arial';
      ctx.fillText(value, x + 28, 688);
    });

    let y = 785;
    ctx.fillStyle = '#e8b84b';
    ctx.font = '900 22px Arial';
    ctx.fillText('Ká»¹ nÄƒng cá»¥ thá»ƒ Ä‘Ã£ Ä‘áº¡t', 120, y);
    y += 34;
    ctx.font = '700 20px Arial';
    for (const skill of skills.slice(0, 10)) {
      const text = achievedSkills.includes(skill) ? `âœ“ ${skill}` : `â€¢ ${skill}`;
      ctx.fillStyle = achievedSkills.includes(skill) ? '#bbf7d0' : '#cbd5e1';
      y = wrapText(text, 135, y, 910, 28, 2) + 4;
    }

    y += 18;
    ctx.fillStyle = '#e8b84b';
    ctx.font = '900 22px Arial';
    ctx.fillText('Báº±ng chá»©ng cÃ³ thá»ƒ gá»­i sáº¿p/HR', 120, y);
    y += 42;
    ctx.font = '700 21px Arial';
    ctx.fillStyle = '#f8fafc';
    for (const item of achievements.slice(0, 5)) {
      roundRect(120, y - 28, 960, 82, 18, '#151b26', 'rgba(255,255,255,0.16)');
      y = wrapText(`âœ“ ${item}`, 145, y, 900, 28, 2) + 40;
    }

    roundRect(120, 1565, 570, 115, 24, '#211d13', 'rgba(232,184,75,0.35)');
    ctx.fillStyle = '#e8b84b';
    ctx.font = '900 20px Arial';
    ctx.fillText('NEXT MOVE TRONG 7 NGÃ€Y', 150, 1610);
    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 20px Arial';
    wrapText('Gá»­i portfolio/case study vÃ  chá»©ng nháº­n nÃ y Ä‘á»ƒ xin review lÆ°Æ¡ng hoáº·c apply nÆ¡i cÃ³ band cao hÆ¡n.', 150, 1645, 500, 28, 2);
    roundRect(720, 1565, 360, 115, 24, '#090d14', 'rgba(232,184,75,0.35)');
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '700 16px Arial';
    ctx.fillText('HR kiá»ƒm chá»©ng', 750, 1610);
    ctx.fillStyle = '#e8b84b';
    ctx.font = '900 18px Arial';
    wrapText(displayVerifyUrl, 750, 1640, 295, 24, 2);

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
      setDownloadError('ChÆ°a táº£i Ä‘Æ°á»£c áº£nh. Vui lÃ²ng thá»­ láº¡i hoáº·c chá»¥p mÃ n hÃ¬nh chá»©ng nháº­n.');
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
        {isComplete ? 'Há»“ sÆ¡ thÄƒng tiáº¿n Ä‘Ã£ Ä‘á»§' : 'Chá»©ng nháº­n nÄƒng lá»±c Ä‘ang Ä‘áº¡t'}
      </p>
      <h3 className="mt-1 text-lg font-black leading-tight text-[#f0ede8]">
        {isComplete ? 'Báº¡n Ä‘Ã£ hoÃ n thÃ nh toÃ n bá»™ lá»™ trÃ¬nh' : `ÄÃ£ ghi nháº­n ${achievedSkillCount}/${skills.length} nÄƒng lá»±c cáº§n cho tÄƒng lÆ°Æ¡ng`}
      </h3>
      <p className="mt-2 text-[11px] leading-relaxed text-[#f0ede8]/65">
        {isComplete
          ? 'ÄÃ¢y lÃ  lÃºc chuyá»ƒn tá»« â€œlÃ m viá»‡c rá»i ráº¡câ€ sang â€œÄ‘Ã²i giÃ¡ trá»‹â€: Ä‘áº·t lá»‹ch review lÆ°Æ¡ng trong 7 ngÃ y, gá»­i portfolio/case study cho sáº¿p, hoáº·c apply 10 nÆ¡i cÃ³ band cao hÆ¡n náº¿u cÃ´ng ty hiá»‡n táº¡i khÃ´ng cÃ³ ngÃ¢n sÃ¡ch.'
          : `CÃ²n ${left} viá»‡c ná»¯a Ä‘á»ƒ Ä‘á»§ há»“ sÆ¡ hoÃ n chá»‰nh. Hiá»‡n táº¡i báº¡n váº«n cÃ³ thá»ƒ táº£i chá»©ng nháº­n nÄƒng lá»±c Ä‘Ã£ Ä‘áº¡t, kÃ¨m sá»‘ viá»‡c, ká»¹ nÄƒng vÃ  báº±ng chá»©ng Ä‘Ã£ ná»™p.`}
      </p>

      <button
        type="button"
        onClick={onShowCertificate}
        className={`mt-4 w-full rounded-xl px-4 py-3 text-sm font-black text-[#0a0c10] transition-all hover:-translate-y-0.5 ${
          isComplete ? 'bg-green-300' : 'bg-[#e8b84b]'
        }`}
      >
        {showCertificate ? 'áº¨n chá»©ng nháº­n' : isComplete ? 'Táº£i chá»©ng nháº­n hoÃ n thÃ nh' : 'Má»Ÿ chá»©ng nháº­n nÄƒng lá»±c Ä‘Ã£ Ä‘áº¡t'}
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
              <p className="text-[10px] font-mono font-black uppercase tracking-[0.12em] text-[#e8b84b]">Top LÆ°Æ¡ng Verified Â· VSPI ID</p>
              <h4 className="mt-2 text-2xl font-black leading-tight text-white">
                {isComplete ? 'Chá»©ng nháº­n hoÃ n thÃ nh lá»™ trÃ¬nh' : 'Chá»©ng nháº­n nÄƒng lá»±c tÄƒng lÆ°Æ¡ng'}
              </h4>
              <p className="mt-1 text-sm font-black text-green-300">
                {stats.done}/{stats.total} viá»‡c Â· {achievedSkillCount}/{skills.length} ká»¹ nÄƒng Â· {evidenceCount} báº±ng chá»©ng
              </p>
            </div>

            <div className="relative z-10 mt-5 rounded-2xl border border-[#e8b84b]/25 bg-[#151b26] p-4">
              <p className="text-[9px] font-bold uppercase text-[#cbd5e1]">Trao cho</p>
              <p className="mt-1 text-2xl font-black leading-tight text-white">{recipientName}</p>
              <p className="mt-1 text-sm font-bold leading-relaxed text-green-200">{verifiedRole}</p>
              <p className="mt-1 text-[11px] font-semibold leading-relaxed text-[#d1d5db]">
                Cáº¥p ngÃ y {issuedAt} Â· Gáº¯n vá»›i SÄT {profile?.phone || 'Ä‘Ã£ xÃ¡c thá»±c'}
              </p>
              <div className="mt-3 rounded-xl border border-[#e8b84b]/30 bg-[#211d13] px-3 py-2">
                <p className="text-[8px] font-mono font-black uppercase text-[#cbd5e1]">VSPI ID</p>
                <p className="mt-0.5 break-all font-mono text-base font-black leading-tight text-[#e8b84b]">{profile?.vspiId || 'VSPI'}</p>
                <p className="mt-1 break-all text-[9px] font-bold leading-relaxed text-[#f8fafc]">HR verify: {displayVerifyUrl}</p>
              </div>
            </div>

            <div className="relative z-10 mt-4 grid grid-cols-3 gap-2">
              {[
                ['Tiáº¿n Ä‘á»™', `${stats.pct}%`],
                ['Viá»‡c xong', `${stats.done}/${stats.total}`],
                ['Báº±ng chá»©ng', `${evidenceCount}`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-[#e8b84b]/25 bg-[#151b26] px-2 py-2 text-center">
                  <p className="text-[8px] font-mono font-bold uppercase text-[#cbd5e1]">{label}</p>
                  <p className="mt-0.5 text-sm font-black text-[#e8b84b]">{value}</p>
                </div>
              ))}
            </div>

            <div className="relative z-10 mt-4">
              <p className="text-[10px] font-mono font-black uppercase tracking-normal text-[#e8b84b]">Ká»¹ nÄƒng cá»¥ thá»ƒ Ä‘Ã£ Ä‘áº¡t</p>
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
              <p className="text-[10px] font-mono font-black uppercase tracking-normal text-[#e8b84b]">Báº±ng chá»©ng cÃ³ thá»ƒ gá»­i sáº¿p/HR</p>
              <div className="mt-2 space-y-2">
                {achievements.map(item => (
                  <div key={item} className="rounded-xl border border-white/15 bg-[#151b26] px-3 py-2">
                    <p className="text-[11px] font-bold leading-relaxed text-[#f8fafc]">âœ“ {item}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative z-10 mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_16rem] lg:items-start">
              <div className="rounded-2xl border border-[#e8b84b]/30 bg-[#211d13] p-3">
                <p className="text-[10px] font-black uppercase text-[#e8b84b]">Next move trong 7 ngÃ y</p>
                <p className="mt-1 text-[11px] font-bold leading-relaxed text-[#f8fafc]">
                  Gá»­i portfolio/case study + chá»©ng nháº­n nÃ y Ä‘á»ƒ xin review lÆ°Æ¡ng. Náº¿u khÃ´ng cÃ³ ngÃ¢n sÃ¡ch, dÃ¹ng cÃ¹ng bá»™ ká»¹ nÄƒng Ä‘á»ƒ apply 10 nÆ¡i cÃ³ band cao hÆ¡n.
                </p>
              </div>
              <div className="min-w-0 self-start rounded-2xl border border-[#e8b84b]/30 bg-[#090d14] p-3">
                <p className="text-[8px] font-mono font-black uppercase text-[#cbd5e1]">Evidence log</p>
                <p className="mt-1 break-all text-[10px] font-mono font-black leading-relaxed text-[#e8b84b]">{profile?.vspiId || 'VSPI'}</p>
                <p className="mt-1 break-all text-[9px] font-bold leading-relaxed text-[#f8fafc]">{displayEvidenceUrl}</p>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={downloadCertificate}
            disabled={certDownloading}
            className="w-full rounded-xl bg-[#e8b84b] px-4 py-3 text-sm font-black leading-tight text-[#0a0c10] transition-all hover:-translate-y-0.5 disabled:opacity-60"
          >
            {certDownloading ? 'Äang táº¡o áº£nh...' : 'Táº£i chá»©ng nháº­n PNG'}
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
          <p className="text-[10px] font-mono font-black uppercase tracking-normal text-green-300">Kho báº±ng chá»©ng</p>
          <h2 className="mt-1 text-lg font-black leading-tight text-[#f0ede8]">Kho báº±ng chá»©ng tÄƒng lÆ°Æ¡ng</h2>
          <p className="mt-2 text-[11px] leading-relaxed text-[#f0ede8]/55">
            NguyÃªn táº¯c: má»—i viá»‡c chá»‰ tháº­t sá»± cÃ³ giÃ¡ trá»‹ khi báº¡n ná»™p link, áº£nh, file hoáº·c ghi chÃº chá»©ng minh Ä‘Ã£ lÃ m. ÄÃ¢y lÃ  thá»© Ä‘em Ä‘i review lÆ°Æ¡ng.
          </p>
        </div>
        <div className="shrink-0 rounded-2xl border border-green-300/25 bg-green-300/10 px-3 py-2 text-center">
          <p className="text-[9px] uppercase text-green-200/70">ÄÃ£ ná»™p</p>
          <p className="text-base font-black text-green-300">{evidenceCount}</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          ['Viá»‡c', `${stats.done}/${stats.total}`],
          ['Báº±ng chá»©ng', `${evidenceCount}`],
          ['Deal lÆ°Æ¡ng', readyToDeal ? 'Sáºµn sÃ ng' : 'ChÆ°a Ä‘á»§'],
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
          {hasEvidence ? 'Báº±ng chá»©ng Ä‘Ã£ ná»™p' : 'Ná»™p báº±ng chá»©ng Ä‘á»ƒ tick'}
        </p>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black ${checked ? 'bg-green-300 text-[#0a0c10]' : 'bg-white/8 text-[#f0ede8]/50'}`}>
          {checked ? 'XONG' : '+Äiá»ƒm'}
        </span>
      </div>
      {hasEvidence && (
        <div className="mt-2 rounded-lg border border-green-300/15 bg-[#0a0c10]/60 px-3 py-2 text-[10px] leading-relaxed text-green-100/75">
          {evidence?.fileName && <p className="break-words">File: {evidence.fileName}</p>}
          {evidence?.note && <p className="break-words">Ghi chÃº/link: {evidence.note}</p>}
        </div>
      )}
      <textarea
        value={note}
        onChange={event => setNote(event.target.value)}
        placeholder="DÃ¡n link Drive/áº£nh/file bÃ i lÃ m hoáº·c ghi chÃº chá»©ng minh báº¡n Ä‘Ã£ lÃ m..."
        rows={2}
        className="mt-2 w-full min-w-0 resize-none rounded-lg border border-white/10 bg-[#0f1219] px-3 py-2 text-[11px] leading-relaxed text-[#f0ede8] outline-none placeholder:text-[#f0ede8]/25 focus:border-[#e8b84b]"
      />
      <div className="mt-2 grid grid-cols-[minmax(0,1fr)_6.75rem] gap-2">
        <label className="min-w-0 cursor-pointer rounded-lg border border-white/10 bg-[#0f1219] px-3 py-2 text-[10px] font-bold leading-tight text-[#f0ede8]/55">
          <span className="block truncate">{fileName || 'Chá»n file/áº£nh'}</span>
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
          Ná»™p + tick
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
                  <p className="text-[10px] font-mono font-black uppercase tracking-normal text-[#e8b84b]">ThÃ¡ng {milestone.month}</p>
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
                              {checked ? 'âœ“' : taskIndex + 1}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className={`break-words text-[12px] font-black leading-relaxed ${checked ? 'text-green-300' : 'text-[#f0ede8]'}`}>
                                {humanizeWorkCopy(task.title)}
                              </p>
                              <div className="mt-2 rounded-lg border border-[#e8b84b]/15 bg-[#e8b84b]/8 px-2.5 py-2 text-[10px] leading-relaxed text-[#f0ede8]/70">
                                <span className="font-black text-[#e8b84b]">Ná»™p gÃ¬:</span> {humanizeWorkCopy(task.output)}
                              </div>
                              <details className="mt-2 rounded-lg border border-white/8 bg-[#161b26]/70 px-2.5 py-2">
                                <summary className="cursor-pointer text-[10px] font-black text-[#f0ede8]/60">
                                  Xem cÃ¡ch lÃ m + tiÃªu chÃ­ tháº¯ng
                                </summary>
                                <div className="mt-2 grid gap-1.5 text-[10px] leading-relaxed text-[#f0ede8]/55">
                                  <p className="break-words"><span className="font-black text-[#e8b84b]">VÃ¬ sao lÃ m:</span> {humanizeWorkCopy(task.skill)}</p>
                                  <p className="break-words"><span className="font-black text-[#e8b84b]">Äiá»ƒm tháº¯ng:</span> {humanizeWorkCopy(task.kpi)}</p>
                                  <p className="break-words"><span className="font-black text-[#e8b84b]">HoÃ n thÃ nh khi:</span> {humanizeWorkCopy(task.doneDefinition)}</p>
                                </div>
                              </details>
                              {checked && !evidenceLog[key] && (
                                <button
                                  type="button"
                                  onClick={() => onToggle(key)}
                                  className="mt-3 rounded-lg border border-white/10 px-3 py-2 text-[10px] font-bold text-[#f0ede8]/55"
                                >
                                  Bá» tick táº¡m
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
              <p className="text-sm font-black text-[#f0ede8]">AI Ä‘ang phÃ¢n tÃ­ch há»“ sÆ¡</p>
              <p className="text-[10px] text-[#f0ede8]/40">Äang dá»±ng lá»™ trÃ¬nh báº±ng AI cÃ¡ nhÃ¢n hÃ³a theo vá»‹ trÃ­, Ä‘iá»ƒm yáº¿u vÃ  má»¥c tiÃªu {durationLabel}</p>
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
          <p className="mt-4 text-center text-[10px] text-[#f0ede8]/35">Ã‚m thanh thinking Ä‘ang báº­t náº¿u mÃ¡y khÃ´ng mute</p>
        </div>
      </div>
    </div>
  );
}

export default function RoadmapPage() {
  const [step, setStep]           = useState<PageStep>('setup');
  const [job, setJob]             = useState('');
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
  const [error, setError]         = useState('');
  const [roleSuggestions, setRoleSuggestions] = useState<RoleSuggestion[]>([]);
  const [creating, setCreating]   = useState(false);
  const [targetBenchmark, setTargetBenchmark] = useState<RoadmapTargetBenchmark | null>(null);
  const [targetBenchmarkLoading, setTargetBenchmarkLoading] = useState(false);

  const cur        = parseInt(currentSalary.replace(/,/g, ''), 10) || 0;
  const targetCalc = job && cur > 0 ? calcTargetSalary(cur, job, duration, compassTargetSalary, compassTargetLabel) : null;
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
  const [weeklyTime, setWeeklyTime] = useState('3-5 giá»/tuáº§n');
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
    setSelectedRoleId('');
    setJob(preset.job);
    setCurrentSalary(formatMoneyInput(preset.salary));
    setDuration(preset.duration);
    setCompassTargetSalary(0);
    setCompassTargetLabel('');
    setError('');
  };

  useEffect(() => {
    const cleanJob = job.trim();
    const targetSalary = targetCalc?.target || 0;
    if (!cleanJob || cur < 500_000 || targetSalary < 500_000) {
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
  }, [job, cur, targetCalc?.target, currentPercent, benchmarkExperience, benchmarkMarketLocation, benchmarkWorkProvince]);

  const applyDraftProfile = (draft: Partial<RoadmapProfile>) => {
    const draftDuration = draft.duration === 3 || draft.duration === 6 || draft.duration === 9 || draft.duration === 12 ? draft.duration : duration;
    const draftName = cleanSharedName(draft.fullName || readSharedName());
    if (draftName) setName(draftName);
    if (draft.job) {
      setJob(String(draft.job));
      setCurrentPosition(String(draft.job));
    }
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
        ? `Cháº¡m ${draft.compassTargetLabel || 'Ä‘Ã­ch La BÃ n'} khoáº£ng ${formatSalaryShort(draftCompassTarget)}/thÃ¡ng; ${formatDurationLabel(draftDuration)} tá»›i lÃ  má»‘c trung gian cÃ³ báº±ng chá»©ng.`
        : `LÃªn má»‘c lÆ°Æ¡ng/level cao hÆ¡n cho ${draft.job} trong ${formatDurationLabel(draftDuration)} tá»›i`
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
    setSelectedRoleId('');
    setPollCount(0);
    setGenerating(false);
    setShowCertificate(false);
    setError('');
    setRoleSuggestions([]);
  };

  const persistRoadmapProfile = (nextProfile: RoadmapProfile) => {
    try {
      const payload = JSON.stringify(nextProfile);
      localStorage.setItem(getRoadmapStorageKey(nextProfile.vspiId, nextProfile.accessCode), payload);
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

  // â”€â”€ Thinking pulse while roadmap is being generated â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  useEffect(() => {
    if (generating) {
      startThinkingPulse();
      return () => stopThinkingPulse();
    }
    stopThinkingPulse();
  }, [generating]);


  // â”€â”€ Auto-restore khi load trang â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    const premiumDraft = readPremiumRoadmapProfile();
    if (wantsNew || queryJob || querySalary > 0) {
      try {
        const savedProfile = repairMojibakeDeep<RoadmapProfile>(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'));
        const savedRecent = !savedProfile.savedAt || Date.now() - savedProfile.savedAt < DRAFT_MAX_AGE_MS;
        const sameJob = !queryJob || normalizeText(savedProfile.job || '') === normalizeText(queryJob);
        const sameSalary = !querySalary || Math.abs(Number(savedProfile.salary || 0) - querySalary) < 1000;
        const sameDuration = !queryDuration || Number(savedProfile.duration || 0) === (queryDuration === 12 ? 9 : queryDuration);
        if (!wantsNew && savedProfile.vspiId && savedRecent && sameJob && sameSalary && sameDuration) {
          if (!savedProfile.accessCode) savedProfile.accessCode = getRoadmapAccessCode(savedProfile.vspiId);
          setProfile(savedProfile);
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
          setWeeklyTime(savedProfile.weeklyTime || '3-5 giá»/tuáº§n');
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
      setWeeklyTime('3-5 giá»/tuáº§n');
      setPrivacyConsent(false);
      const draftFromQuery: Partial<RoadmapProfile> = {};
      if (queryName) draftFromQuery.fullName = queryName;
      if (queryJob) draftFromQuery.job = queryJob;
      if (queryRoleId) draftFromQuery.selectedRoleId = queryRoleId;
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
      if (!p.vspiId) return;
      if (!p.accessCode) p.accessCode = getRoadmapAccessCode(p.vspiId);
      if (p.fullName) setName(p.fullName);
      setProfile(p);
      setSelectedRoleId(p.selectedRoleId || '');
      setVspiId(p.vspiId);
      if (wantsRestore) {
        setGenerating(true);
        // Thá»­ load báº±ng vspiId trÆ°á»›c
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
                  setWeeklyTime(cleanRoadmapJson.intake.weeklyTime || p.weeklyTime || '3-5 giá»/tuáº§n');
                }
                setGenerating(false);
                setStep('roadmap');
              } else {
                setGenerating(false);
                setStep('intake');
              }
            }
            // pending â†’ á»Ÿ setup, user tháº¥y form Ä‘Ã£ Ä‘iá»n sáºµn
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
      setWeeklyTime(p.weeklyTime || '3-5 giá»/tuáº§n');
    } catch { /* ignore */ }
    // Restore should run only on first load; these helpers intentionally read initial browser storage/query state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // â”€â”€ Táº¡o Ä‘Æ¡n hÃ ng â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleSetup = async () => {
    if (!name.trim()) { setError('Nháº­p há» tÃªn cá»§a báº¡n'); return; }
    const cleanPhone = cleanSharedPhone(phone);
    if (!isValidSharedPhone(cleanPhone)) {
      setError('Nháº­p SÄT há»£p lá»‡ (VD: 0901234567)'); return;
    }
    if (!job.trim()) { setError('Nháº­p nghá» nghiá»‡p'); return; }
    if (!cur || cur < 1_000_000) { setError('Nháº­p lÆ°Æ¡ng hiá»‡n táº¡i há»£p lá»‡'); return; }
    if (!privacyConsent) { setError('Vui lÃ²ng Ä‘á»“ng Ã½ xá»­ lÃ½ dá»¯ liá»‡u Ä‘á»ƒ táº¡o lá»™ trÃ¬nh vÃ  há»— trá»£ sau mua'); return; }
    if (!targetCalc) return;

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
        ? `Má»‘c ${duration} thÃ¡ng: ${formatSalaryShort(targetCalc.target)}/thÃ¡ng trÃªn Ä‘Æ°á»ng tá»›i ${targetCalc.compassTargetLabel} ${formatSalaryShort(targetCalc.compassTarget)}/thÃ¡ng`
        : `TÄƒng ${((targetCalc.target - cur) / 1_000_000).toFixed(1)} triá»‡u trong ${duration} thÃ¡ng`;
      const res = await fetch('/api/roadmap/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...getAttributionPayload(),
          phone: cleanPhone,
          job_title: job.trim(),
          selectedRoleId: selectedRoleId || undefined,
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
        job: job.trim(), selectedRoleId: data?.role_id || selectedRoleId || undefined, salary: cur, duration,
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
      setCurrentPosition(job.trim());
      setMainWeakness('');
      setTwoYearGoal(targetCalc.compassTarget > 0
        ? `Cháº¡m ${targetCalc.compassTargetLabel} khoáº£ng ${formatSalaryShort(targetCalc.compassTarget)}/thÃ¡ng; ${durationLabel} tá»›i lÃ  má»‘c ${formatSalaryShort(targetCalc.target)}/thÃ¡ng cÃ³ báº±ng chá»©ng.`
        : `${(targetCalc.target / 1_000_000).toFixed(1)} triá»‡u/thÃ¡ng trong ${durationLabel} tá»›i`);
      persistRoadmapProfile(newProfile);
      setStep('qr');
    } catch { setError('Lá»—i káº¿t ná»‘i'); }
    finally { setCreating(false); }
  };

  // â”€â”€ Restore báº±ng SÄT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleRestoreByPhone = async () => {
    const clean = restorePhone.replace(/\D/g, '');
    const code = cleanRoadmapAccessCode(restoreAccessCode);
    if (!clean || clean.length < 9) { setError('Nháº­p SÄT há»£p lá»‡'); return; }
    if (code.length < 4) { setError('Nháº­p mÃ£ truy cáº­p Ä‘Æ°á»£c cáº¥p sau thanh toÃ¡n'); return; }
    setError(''); setRestoreLoading(true);
    try {
      const res = await fetch(`/api/roadmap/generate?phone=${clean}&accessCode=${encodeURIComponent(code)}&t=${Date.now()}`);
      if (!res.ok) { setError('KhÃ´ng tÃ¬m tháº¥y lá»™ trÃ¬nh hoáº·c mÃ£ truy cáº­p chÆ°a Ä‘Ãºng'); return; }
      const data = await res.json();
      if (data.status !== 'paid') { setError('Lá»™ trÃ¬nh chÆ°a Ä‘Æ°á»£c thanh toÃ¡n'); return; }
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
      setWeeklyTime(cleanRoadmapJson?.intake?.weeklyTime || '3-5 giá»/tuáº§n');

      if (cleanRoadmapJson) {
        setRoadmap(cleanRoadmapJson);
        applyProgressPayload(data.task_progress || {});
        setStep('roadmap');
      } else {
        setStep('intake');
      }
    } catch { setError('Lá»—i káº¿t ná»‘i'); }
    finally { setRestoreLoading(false); }
  };

  // â”€â”€ Polling sau khi CK â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        setError('ChÆ°a nháº­n Ä‘Æ°á»£c xÃ¡c nháº­n. LiÃªn há»‡ Zalo: 0915 662 876');
      }
    }, 8000);
  };

  const loadRoadmap = async () => {
    if (!currentPosition.trim()) { setError('Nháº­p vá»‹ trÃ­ hiá»‡n táº¡i cá»§a báº¡n'); return; }
    if (!twoYearGoal.trim() || isLowInfoSurveyValue(twoYearGoal)) { setError(`Nháº­p má»¥c tiÃªu cá»¥ thá»ƒ trong ${durationLabel}: má»©c lÆ°Æ¡ng, chá»©c vá»¥ hoáº·c band muá»‘n cháº¡m`); return; }
    if (!educationLevel.trim()) { setError('Chá»n trÃ¬nh Ä‘á»™ há»c váº¥n cao nháº¥t'); return; }
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

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // RENDER â€” Loading restore
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  if (generating && step !== 'checking') return (
    <RoadmapGeneratingSkeleton duration={duration} />
  );

  // â”€â”€ STEP: SETUP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (step === 'setup') return (
    <div className="min-h-screen w-full max-w-[100svw] overflow-x-clip bg-[#0a0c10] px-3 pb-4 pt-[max(1rem,env(safe-area-inset-top))] font-sans text-[#f0ede8] sm:px-4">
      <div className="mx-auto w-full max-w-[min(100%,22.5rem)] pt-8 space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 bg-[#e8b84b]/10 border border-[#e8b84b]/30 rounded-full px-4 py-1.5 mb-4">
            <span className="text-[#e8b84b] text-xs font-black">VSPI ROADMAP</span>
            <span className="bg-red-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">79K</span>
          </div>
          <h1 className="text-2xl font-black text-[#f0ede8] mb-2 leading-tight">
            Lá»™ trÃ¬nh tÄƒng lÆ°Æ¡ng<br />
            <span className="text-[#e8b84b]">AI cÃ¡ nhÃ¢n hÃ³a Ä‘á»ƒ nÃ¢ng cáº¥p phiÃªn báº£n nghá» nghiá»‡p cá»§a báº¡n</span>
          </h1>
          <p className="text-sm text-[#f0ede8]/55 leading-relaxed">
            29K cho báº¡n biáº¿t Ä‘ang á»Ÿ Ä‘Ã¢u vÃ  nÃªn neo má»‘c lÆ°Æ¡ng nÃ o. 79K biáº¿n má»‘c Ä‘Ã³ thÃ nh danh sÃ¡ch viá»‡c tá»«ng tuáº§n: viá»‡c cáº§n lÃ m, báº±ng chá»©ng cáº§n lÆ°u, KPI cáº§n chá»©ng minh vÃ  cÃ¢u nÃªn nÃ³i khi review lÆ°Æ¡ng.
          </p>
          <p className="mt-2 text-[10px] leading-relaxed text-[#f0ede8]/38">
            Lá»™ trÃ¬nh Ä‘Æ°á»£c táº¡o báº±ng AI trÃªn bá»™ quy táº¯c nghá» nghiá»‡p cá»§a Top LÆ°Æ¡ng, khÃ´ng pháº£i tÆ° váº¥n 1-1 bá»Ÿi chuyÃªn gia ngÆ°á»i tháº­t.
          </p>
        </div>

        <div className="bg-[#0f1219] border border-[#e8b84b]/20 rounded-2xl p-4 grid grid-cols-2 gap-2">
          {[
            'Danh sÃ¡ch viá»‡c tá»«ng tuáº§n',
            'Sá»• báº±ng chá»©ng Ä‘á»ƒ lÆ°u káº¿t quáº£',
            'KPI trÆ°á»›c/sau cáº§n chá»©ng minh',
            'CÃ¢u review lÆ°Æ¡ng nÃªn nÃ³i',
            'Báº£n Ä‘á»“ ká»¹ nÄƒng Ä‘Ãºng nghá»',
            'Chá»©ng nháº­n + link xÃ¡c thá»±c',
          ].map(item => (
            <div key={item} className="bg-[#161b26] border border-white/8 rounded-xl px-3 py-2">
              <p className="text-[10px] text-[#f0ede8]/70 font-bold">âœ“ {item}</p>
            </div>
          ))}
          <p className="col-span-2 text-[10px] text-[#f0ede8]/35 leading-relaxed mt-1">
            79k khÃ´ng bÃ¡n lá»i há»©a tÄƒng lÆ°Æ¡ng. NÃ³ bÃ¡n má»™t há»‡ thá»‘ng giÃºp báº¡n nÃ¢ng cáº¥p lÃªn phiÃªn báº£n lÃ m viá»‡c cÃ³ báº±ng chá»©ng hÆ¡n: biáº¿t pháº£i lÃ m gÃ¬ má»—i tuáº§n, lÆ°u gÃ¬ vÃ o há»“ sÆ¡, vÃ  khi nÃ o Ä‘á»§ cÆ¡ sá»Ÿ Ä‘á»ƒ nÃ³i chuyá»‡n vá»›i sáº¿p hoáº·c HR.
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
                  DÃ¹ng máº«u
                </span>
              </div>
            </button>
          ))}
        </div>

        <div className="w-full overflow-hidden bg-[#0f1219] border border-white/10 rounded-2xl p-4 space-y-4 sm:p-6">
          {/* Há» tÃªn */}
          <div>
            <label className="text-[10px] font-mono font-bold text-[#f0ede8]/60 uppercase block mb-1.5">Há» vÃ  tÃªn <span className="text-red-400">*</span></label>
            <input type="text" placeholder="VD: Nguyá»…n VÄƒn A"
              className="w-full bg-[#161b26] border border-white/10 rounded-xl px-4 py-3 text-sm text-[#f0ede8] outline-none focus:border-[#e8b84b] placeholder:text-[#f0ede8]/20"
              value={name} onChange={e => setName(e.target.value)} onBlur={e => saveSharedName(e.target.value)} />
          </div>

          {/* SÄT â€” báº¯t buá»™c, dÃ¹ng Ä‘á»ƒ khÃ´i phá»¥c */}
          <div>
            <label className="text-[10px] font-mono font-bold text-[#f0ede8]/60 uppercase block mb-1.5">
              SÄT / Zalo <span className="text-red-400">*</span>
              <span className="text-[#e8b84b] ml-1 normal-case font-normal">(dÃ¹ng Ä‘á»ƒ xem láº¡i lá»™ trÃ¬nh)</span>
            </label>
            <input type="tel" placeholder="0901234567"
              className="w-full bg-[#161b26] border border-white/10 rounded-xl px-4 py-3 text-sm text-[#f0ede8] outline-none focus:border-[#e8b84b] placeholder:text-[#f0ede8]/20"
              value={phone} onChange={e => {
                const nextPhone = cleanSharedPhone(e.target.value);
                setPhone(nextPhone);
                saveSharedPhone(nextPhone);
              }} />
            <p className="text-[9px] text-[#f0ede8]/30 mt-1 pl-1">Sau thanh toÃ¡n báº¡n sáº½ nháº­n thÃªm mÃ£ truy cáº­p riÃªng Ä‘á»ƒ báº£o máº­t lá»™ trÃ¬nh</p>
          </div>

          {/* Nghá» nghiá»‡p */}
          <div>
            <label className="text-[10px] font-mono font-bold text-[#f0ede8]/60 uppercase block mb-1.5">Nghá» nghiá»‡p <span className="text-red-400">*</span></label>
            <input type="text" placeholder="VD: Backend Developer, Káº¿ toÃ¡n..."
              className="w-full bg-[#161b26] border border-white/10 rounded-xl px-4 py-3 text-sm text-[#f0ede8] outline-none focus:border-[#e8b84b] placeholder:text-[#f0ede8]/20"
              value={job} onChange={e => { setSelectedRoleId(''); setJob(e.target.value); }} />
          </div>

          {/* LÆ°Æ¡ng hiá»‡n táº¡i */}
          <div>
            <label className="text-[10px] font-mono font-bold text-[#f0ede8]/60 uppercase block mb-1.5">LÆ°Æ¡ng hiá»‡n táº¡i (VNÄ/thÃ¡ng) <span className="text-red-400">*</span></label>
            <input type="text" inputMode="numeric" placeholder="VD: 13,000,000"
              className="w-full bg-[#161b26] border border-white/10 rounded-xl px-4 py-3 text-sm text-[#f0ede8] outline-none focus:border-[#e8b84b] placeholder:text-[#f0ede8]/20"
              value={currentSalary} onChange={e => setCurrentSalary(formatMoneyInput(e.target.value))} />
            {cur > 0 && <p className="text-[10px] text-[#f0ede8]/35 mt-1 pl-1">â‰ˆ {(cur/1_000_000).toFixed(1)} triá»‡u/thÃ¡ng</p>}
          </div>

          {/* Thá»i gian */}
          <div>
            <label className="text-[10px] font-mono font-bold text-[#f0ede8]/60 uppercase block mb-2">Má»¥c tiÃªu trong bao lÃ¢u?</label>
            <div className="grid min-w-0 grid-cols-3 gap-1.5 sm:gap-2">
              {([3, 6, 9] as const).map(d => (
                <button key={d} onClick={() => setDuration(d)}
                  className={`min-w-0 rounded-xl border-2 px-1 py-3 text-[12px] font-bold leading-none transition-all sm:text-sm ${duration === d ? 'border-[#e8b84b] bg-[#e8b84b]/10 text-[#e8b84b]' : 'border-white/10 bg-[#161b26] text-[#f0ede8]/50'}`}>
                  {`${d} thÃ¡ng`}
                </button>
              ))}
            </div>
          </div>

          {/* Preview má»¥c tiÃªu */}
          {targetCalc && cur > 0 && !targetCalc.compassTarget && (
            <div className="bg-[#161b26] border border-[#e8b84b]/20 rounded-xl p-4 space-y-2">
              <p className="text-[10px] font-mono text-[#e8b84b] uppercase tracking-wider">ðŸŽ¯ Má»¥c tiÃªu há»‡ thá»‘ng Ä‘á» xuáº¥t</p>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-black leading-tight text-[#f0ede8]">{(targetCalc.target/1_000_000).toFixed(1)} triá»‡u/thÃ¡ng</p>
                  <p className="text-[11px] text-green-400 font-bold">{targetCalc.label}</p>
                  <p className="mt-1 text-[10px] font-bold text-[#e8b84b]">
                    {targetBenchmark?.targetLabel
                      ? `La BÃ n: má»‘c ${targetBenchmark.targetLabel}`
                      : targetBenchmarkLoading
                        ? 'La BÃ n Ä‘ang tÃ­nh má»‘c Top...'
                        : 'La BÃ n sáº½ hiá»‡n má»‘c Top theo benchmark nghá»'}
                  </p>
                </div>
                <p className="shrink-0 text-right text-[9px] text-[#f0ede8]/35">trong {duration} thÃ¡ng</p>
              </div>
              <p className="text-[10px] text-[#f0ede8]/45 leading-relaxed">{targetCalc.rationale}</p>
            </div>
          )}

          {targetCalc && cur > 0 && (
            <div className="overflow-hidden rounded-2xl border border-[#e8b84b]/25 bg-[#161b26]">
              <div className="border-b border-white/10 bg-[#0f1219] px-4 py-3">
                <p className="text-[10px] font-mono font-black uppercase tracking-[0.18em] text-[#e8b84b]">La BÃ n má»¥c tiÃªu</p>
                <p className="mt-1 text-[10px] leading-relaxed text-[#f0ede8]/45">
                  Báº¥m 3/6/9 thÃ¡ng Ä‘á»ƒ xem má»‘c báº¡n Ä‘ang Ä‘i tá»›i. {targetCalc.compassTarget > 0 ? `ÄÃ­ch thá»‹ trÆ°á»ng váº«n lÃ  ${formatSalaryShort(targetCalc.compassTarget)}/thÃ¡ng.` : 'Há»‡ thá»‘ng Ä‘á» xuáº¥t má»‘c tÄƒng há»£p lÃ½ theo thá»i háº¡n.'}
                </p>
              </div>

              <div className="space-y-4 p-4">
                <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                  <div className="rounded-xl border border-white/10 bg-[#0a0c10] px-3 py-2">
                    <p className="text-[9px] font-mono uppercase text-[#f0ede8]/35">Hiá»‡n táº¡i</p>
                    <p className="mt-0.5 text-sm font-black text-[#f0ede8]">{formatSalaryShort(cur)}/thÃ¡ng</p>
                    {(targetBenchmark?.currentLabel || targetBenchmarkLoading) && (
                      <p className="mt-1 text-[9px] font-bold text-[#f0ede8]/45">
                        {targetBenchmark?.currentLabel || 'Äang tÃ­nh Top...'}
                      </p>
                    )}
                  </div>
                  <div className="text-[#e8b84b]">â†’</div>
                  <div className="rounded-xl border border-[#e8b84b]/35 bg-[#e8b84b]/10 px-3 py-2 text-right">
                    <p className="text-[9px] font-mono uppercase text-[#e8b84b]/75">Má»‘c {duration} thÃ¡ng</p>
                    <p className="mt-0.5 text-sm font-black text-[#e8b84b]">{formatSalaryShort(targetCalc.target)}/thÃ¡ng</p>
                    {(targetBenchmark?.targetLabel || targetBenchmarkLoading) && (
                      <p className="mt-1 text-[9px] font-black text-[#e8b84b]">
                        {sameTargetBucket && targetCalc.compassTarget > 0
                          ? `Má»‘c phá»¥c há»“i ${targetCalc.progressPct || 0}% gap`
                          : targetBenchmark?.targetLabel || 'Äang tÃ­nh Top...'}
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
                      <span className="text-center text-[#e8b84b]">{targetCalc.progressPct}% cháº·ng Ä‘Æ°á»ng</span>
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
                          ? `${formatSalaryShort(targetCalc.target)}/thÃ¡ng váº«n trong ${targetBenchmark.targetLabel}, nhÆ°ng Ä‘Ã£ rÃºt ${formatSalaryShort(recoveryGapClosed)}/thÃ¡ng khoáº£ng cÃ¡ch tá»›i ${targetCalc.compassTargetLabel}.`
                          : `${formatSalaryShort(targetCalc.target)}/thÃ¡ng tÆ°Æ¡ng á»©ng ${targetBenchmark.targetLabel}${targetBenchmark.currentLabel ? `; hiá»‡n táº¡i Ä‘ang ${targetBenchmark.currentLabel}.` : '.'}`
                        : 'Äang Ä‘á»‘i chiáº¿u má»‘c Top theo dá»¯ liá»‡u lÆ°Æ¡ng nghá» nÃ y...'}
                    </p>
                  )}
                  <p className="mt-1 text-[10px] leading-relaxed text-[#f0ede8]/50">
                    {targetCalc.compassRationale || targetCalc.rationale}
                  </p>
                  {sameTargetBucket && targetCalc.compassTarget > 0 && (
                    <p className="mt-2 rounded-lg border border-[#e8b84b]/20 bg-[#e8b84b]/8 px-3 py-2 text-[10px] font-bold leading-relaxed text-[#f0ede8]/70">
                      Case nÃ y Ä‘ang underpaid náº·ng: {duration} thÃ¡ng lÃ  má»‘c láº¥y láº¡i giÃ¡ trá»‹ bá»‹ bá» lá»¡, chÆ°a nÃªn há»©a Ä‘á»•i báº­c Top. CÃ²n {formatSalaryShort(recoveryGapLeft)}/thÃ¡ng ná»¯a Ä‘á»ƒ cháº¡m {targetCalc.compassTargetLabel}; náº¿u muá»‘n thay Ä‘á»•i percentile rÃµ hÆ¡n, nÃªn chá»n 6 hoáº·c 9 thÃ¡ng.
                    </p>
                  )}
                  {targetBenchmark?.confidenceLabel && (
                    <p className="mt-2 text-[9px] leading-relaxed text-[#f0ede8]/35">
                      Äá»™ tin cáº­y benchmark: {targetBenchmark.confidenceLabel}{targetBenchmark.matchedJobTitle ? ` Â· khá»›p vá»›i ${targetBenchmark.matchedJobTitle}` : ''}
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
              TÃ´i Ä‘á»“ng Ã½ Top LÆ°Æ¡ng lÆ°u vÃ  xá»­ lÃ½ há» tÃªn, SÄT, nghá» nghiá»‡p, lÆ°Æ¡ng hiá»‡n táº¡i Ä‘á»ƒ táº¡o lá»™ trÃ¬nh, xÃ¡c nháº­n thanh toÃ¡n vÃ  há»— trá»£ sau mua. Xem <Link href="/terms" target="_blank" className="text-[#e8b84b] underline underline-offset-2">Äiá»u khoáº£n</Link> vÃ  <Link href="/privacy" target="_blank" className="text-[#e8b84b] underline underline-offset-2">ChÃ­nh sÃ¡ch riÃªng tÆ°</Link>.
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

          <button onClick={() => { playTap(); handleSetup(); }} disabled={creating}
            className="w-full bg-[#e8b84b] text-[#0a0c10] font-black py-4 rounded-xl text-base disabled:opacity-50 hover:-translate-y-0.5 transition-all">
            {creating ? 'Äang táº¡o...' : 'Táº¡o checklist tÄƒng lÆ°Æ¡ng AI - 79.000Ä‘'}
          </button>

          <p className="text-[9px] text-[#f0ede8]/25 text-center">
            AI cÃ¡ nhÃ¢n hÃ³a má»™t láº§n theo dá»¯ liá»‡u báº¡n nháº­p Â· Xem láº¡i báº±ng SÄT + mÃ£ truy cáº­p Â· Tick viá»‡c, lÆ°u báº±ng chá»©ng vÃ  láº¥y chá»©ng nháº­n tiáº¿n Ä‘á»™
          </p>
        </div>

        {/* ÄÃ£ mua rá»“i â†’ xem láº¡i */}
        <button onClick={() => { setError(''); setStep('restore'); }}
          className="w-full text-center text-[11px] text-[#e8b84b]/60 hover:text-[#e8b84b] py-2">
          ÄÃ£ mua rá»“i? Nháº­p SÄT + mÃ£ truy cáº­p Ä‘á»ƒ xem láº¡i â†’
        </button>

        <Link href="/" className="block text-center text-[10px] text-[#f0ede8]/30 hover:text-[#f0ede8]/60">
          â† Quay láº¡i trang chá»§
        </Link>
      </div>
    </div>
  );

  // â”€â”€ STEP: RESTORE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (step === 'restore') return (
    <div className="min-h-screen w-full max-w-[100svw] overflow-x-clip bg-[#0a0c10] px-3 pb-8 pt-[max(1rem,env(safe-area-inset-top))] font-sans text-[#f0ede8] sm:px-4">
      <div className="mx-auto w-full max-w-[min(100%,22.5rem)] pt-16 space-y-6">
        <div className="text-center">
          <p className="text-3xl mb-3">ðŸ”‘</p>
          <h2 className="text-xl font-black text-[#f0ede8] mb-1">Xem láº¡i lá»™ trÃ¬nh cá»§a báº¡n</h2>
          <p className="text-sm text-[#f0ede8]/50">Nháº­p SÄT vÃ  mÃ£ truy cáº­p Ä‘á»ƒ khÃ´i phá»¥c lá»™ trÃ¬nh</p>
        </div>

        <div className="bg-[#0f1219] border border-white/10 rounded-2xl p-6 space-y-4">
          <div>
            <label className="text-[10px] font-mono font-bold text-[#f0ede8]/60 uppercase block mb-1.5">SÄT / Zalo Ä‘Ã£ Ä‘Äƒng kÃ½</label>
            <input type="tel" placeholder="0901234567"
              className="w-full bg-[#161b26] border border-white/10 rounded-xl px-4 py-3 text-sm text-[#f0ede8] outline-none focus:border-[#e8b84b] placeholder:text-[#f0ede8]/20"
              value={restorePhone} onChange={e => setRestorePhone(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleRestoreByPhone()} />
          </div>

          <div>
            <label className="text-[10px] font-mono font-bold text-[#f0ede8]/60 uppercase block mb-1.5">MÃ£ truy cáº­p</label>
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
              MÃ£ truy cáº­p 12 kÃ½ tá»± Ä‘Æ°á»£c hiá»ƒn thá»‹ sau thanh toÃ¡n. MÃ£ legacy 4 kÃ½ tá»± cÅ© váº«n Ä‘Æ°á»£c kiá»ƒm tra náº¿u há»‡ thá»‘ng báº­t fallback.
            </p>
          </div>

          {error && <p className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2">{error}</p>}

          <button onClick={() => { playTap(); handleRestoreByPhone(); }} disabled={restoreLoading}
            className="w-full bg-[#e8b84b] text-[#0a0c10] font-black py-4 rounded-xl text-base disabled:opacity-50">
            {restoreLoading ? 'Äang tÃ¬m...' : 'TÃ¬m lá»™ trÃ¬nh cá»§a tÃ´i'}
          </button>
        </div>

        <button onClick={() => { setError(''); setStep('setup'); }}
          className="w-full text-center text-[10px] font-mono text-[#f0ede8]/30 hover:text-[#f0ede8]/60 py-2">
          â† Quay láº¡i
        </button>
      </div>
    </div>
  );

  // â”€â”€ STEP: QR â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (step === 'qr') return (
    <div className="min-h-screen w-full max-w-[100svw] overflow-x-clip bg-[#0a0c10] px-3 pb-8 pt-[max(1rem,env(safe-area-inset-top))] font-sans text-[#f0ede8] sm:px-4">
      <div className="mx-auto w-full max-w-[min(100%,22.5rem)] pt-8 space-y-5">
        {/* Profile Ä‘Ã£ cam káº¿t */}
        <div className="bg-[#0f1219] border border-[#e8b84b]/20 rounded-2xl p-4">
          <p className="text-[10px] font-mono text-[#e8b84b] uppercase tracking-wider mb-2">ðŸ“‹ Há»“ sÆ¡ cá»§a báº¡n</p>
          <div className="space-y-1">
            <p className="text-sm font-bold text-[#f0ede8]">{name} Â· {phone}</p>
            <p className="text-[11px] text-[#f0ede8]/50">{job} Â· {(cur/1_000_000).toFixed(1)}M/thÃ¡ng Â· {duration} thÃ¡ng</p>
            {targetCalc && <p className="text-[11px] text-green-400 font-bold">Má»¥c tiÃªu: {(targetCalc.target/1_000_000).toFixed(1)}M/thÃ¡ng {targetCalc.label}</p>}
          </div>
        </div>

        <div className="text-center">
          <h2 className="text-[1.15rem] font-black leading-tight text-[#f0ede8] sm:text-xl">QuÃ©t QR Ä‘á»ƒ má»Ÿ khÃ³a lá»™ trÃ¬nh</h2>
          <p className="mx-auto mt-1 max-w-[20rem] text-[12px] leading-relaxed text-[#f0ede8]/52 sm:text-sm">Thanh toÃ¡n xong â†’ AI táº¡o checklist riÃªng theo nghá», má»©c lÆ°Æ¡ng, má»¥c tiÃªu vÃ  cÃ¢u tráº£ lá»i cá»§a báº¡n</p>
          <p className="mt-2 text-[10px] leading-relaxed text-[#f0ede8]/35">
            ÄÃ¢y lÃ  sáº£n pháº©m cÃ³ AI há»— trá»£, khÃ´ng pháº£i buá»•i tÆ° váº¥n 1-1 vá»›i chuyÃªn gia ngÆ°á»i tháº­t. GiÃ¡ trá»‹ náº±m á»Ÿ káº¿ hoáº¡ch hÃ nh Ä‘á»™ng, báº±ng chá»©ng cáº§n lÆ°u vÃ  ká»· luáº­t thá»±c thi.
          </p>
        </div>

        <div className="bg-[#0f1219] border border-[#e8b84b]/30 rounded-2xl overflow-hidden">
          <div className="flex items-start justify-between gap-3 border-b border-white/10 bg-[#161b26] px-4 py-3 sm:px-5">
            <div className="min-w-0">
              <p className="text-sm font-black text-[#f0ede8]">VSPI Roadmap</p>
              <p className="mt-0.5 truncate text-[10px] text-[#f0ede8]/45">{job} Â· {duration} thÃ¡ng</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-lg font-black leading-none text-[#e8b84b] sm:text-xl">79.000Ä‘</p>
              <p className="text-[9px] text-[#f0ede8]/35 line-through">149.000Ä‘</p>
            </div>
          </div>

          <div className="border-b border-white/10 bg-[#0b111b] px-4 py-3 sm:px-5">
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#e8b84b]">ÄÃ³ng 79K báº¡n nháº­n ngay</p>
            <div className="mt-2 grid gap-1.5 text-[11px] font-semibold leading-4 text-[#f0ede8]/72">
              <p><span className="text-[#e8b84b]">âœ“</span> Checklist tÄƒng lÆ°Æ¡ng riÃªng theo nghá», lÆ°Æ¡ng hiá»‡n táº¡i vÃ  má»¥c tiÃªu {duration} thÃ¡ng.</p>
              <p><span className="text-[#e8b84b]">âœ“</span> Viá»‡c cáº§n lÃ m tá»«ng tuáº§n, báº±ng chá»©ng cáº§n lÆ°u vÃ  KPI cáº§n chá»©ng minh.</p>
              <p><span className="text-[#e8b84b]">âœ“</span> CÃ¢u review lÆ°Æ¡ng/apply role tá»‘t hÆ¡n, khÃ´ng pháº£i lá»i khuyÃªn chung chung.</p>
              <p><span className="text-[#e8b84b]">âœ“</span> MÃ£ truy cáº­p Ä‘á»ƒ xem láº¡i lá»™ trÃ¬nh trÃªn mÃ¡y khÃ¡c sau khi thanh toÃ¡n.</p>
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
              <p className="break-words text-[10px] font-mono leading-relaxed text-[#f0ede8]/50 sm:text-[11px]">MSB Â· <strong className="text-[#f0ede8]">96886693012762</strong> Â· NGUYEN TRONG VAN</p>
            </div>
            <div className="w-full rounded-xl border border-[#e8b84b]/25 bg-[#0a0c10] px-3 py-2 text-center">
              <p className="break-words text-[10px] font-mono leading-relaxed text-[#f0ede8]/50">
                Ná»™i dung CK: <span className="font-black tracking-wide text-[#e8b84b]">{cleanVspi}</span>
              </p>
            </div>
            <p className="mt-2 text-center text-[9.5px] leading-relaxed text-[#f0ede8]/38">
              Thanh toÃ¡n Ä‘á»“ng nghÄ©a báº¡n Ä‘á»“ng Ã½ <Link href="/terms" target="_blank" className="text-[#e8b84b] underline underline-offset-2">Äiá»u khoáº£n</Link>,{' '}
              <Link href="/privacy" target="_blank" className="text-[#e8b84b] underline underline-offset-2">ChÃ­nh sÃ¡ch riÃªng tÆ°</Link> vÃ  chÃ­nh sÃ¡ch há»— trá»£/hoÃ n tiá»n khi lá»—i ká»¹ thuáº­t.
            </p>
            <div className="mt-2 grid w-full grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_8.5rem]">
              <div className="rounded-xl border border-white/10 bg-[#161b26] px-3 py-2">
                <p className="text-[9px] font-mono uppercase text-[#f0ede8]/35">Báº£o máº­t xem láº¡i</p>
                <p className="mt-0.5 text-[10px] leading-relaxed text-[#f0ede8]/55">LÆ°u SÄT + mÃ£ nÃ y. KhÃ´ng cÃ³ mÃ£ thÃ¬ ngÆ°á»i khÃ¡c khÃ´ng xem Ä‘Æ°á»£c lá»™ trÃ¬nh.</p>
              </div>
              <div className="min-w-0 rounded-xl border border-[#e8b84b]/30 bg-[#e8b84b]/10 px-3 py-2 text-center">
                <p className="text-[9px] font-mono uppercase text-[#f0ede8]/35">MÃ£ truy cáº­p</p>
                <p className="mt-1 break-words text-lg font-black tracking-[0.08em] text-[#e8b84b] sm:text-base">{activeAccessCode}</p>
              </div>
            </div>
          </div>

          <div className="space-y-3 px-4 pb-5 sm:px-5">
            {error && <p className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2">{error}</p>}
            {profile?.vspiId && (
              <p className="rounded-xl border border-green-400/25 bg-green-400/10 px-4 py-2 text-[11px] font-bold leading-relaxed text-green-300">
                ÄÆ¡n 79K Ä‘Ã£ Ä‘Æ°á»£c lÆ°u trÃªn mÃ¡y nÃ y. Náº¿u báº¡n vá»«a báº¥m Back/quay láº¡i, giá»¯ nguyÃªn mÃ£ CK vÃ  báº¥m kiá»ƒm tra tiáº¿p, khÃ´ng chuyá»ƒn khoáº£n láº¡i.
              </p>
            )}
            <button onClick={() => { playTap(); startPolling(); }}
              className="w-full rounded-xl bg-[#e8b84b] px-3 py-4 text-sm font-black leading-tight text-[#0a0c10] transition-all hover:-translate-y-0.5 sm:text-base">
              âœ… Tiáº¿p tá»¥c kiá»ƒm tra thanh toÃ¡n 79K
            </button>
            <button onClick={() => setStep('setup')}
              className="w-full text-center text-[10px] font-mono text-[#f0ede8]/30 hover:text-[#f0ede8]/60 py-1">
              â† Quay láº¡i
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // â”€â”€ STEP: INTAKE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (step === 'intake') return (
    <div className="min-h-screen w-full max-w-[100svw] overflow-x-clip bg-[#0a0c10] px-3 pb-8 pt-[max(1rem,env(safe-area-inset-top))] font-sans text-[#f0ede8] sm:px-4">
      <div className="mx-auto w-full max-w-[min(100%,22.5rem)] pt-8 space-y-5">
        <div className="rounded-2xl border border-[#e8b84b]/25 bg-[#0f1219] p-5">
          <div className="mb-4 flex items-center justify-between gap-3 border-b border-white/8 pb-4">
            <div>
              <p className="text-[10px] font-mono font-black uppercase tracking-wider text-[#e8b84b]">ÄÃ£ xÃ¡c nháº­n 79K</p>
              <h2 className="mt-1 text-xl font-black leading-tight text-[#f0ede8]">Lá»™ trÃ¬nh thá»±c thi theo thÃ¡ng</h2>
            </div>
            <span className="rounded-full border border-green-400/30 bg-green-400/10 px-2 py-1 text-[9px] font-black text-green-300">PAID</span>
          </div>

          <div className="space-y-1 rounded-xl border border-white/8 bg-[#161b26] p-3">
            <p className="text-xs font-black text-[#f0ede8]">{profile?.job || job || 'Há»“ sÆ¡ cá»§a báº¡n'}</p>
            <p className="text-[10px] text-[#f0ede8]/45">
              {(profile?.salary || cur) ? `${((profile?.salary || cur) / 1_000_000).toFixed(1)}M/thÃ¡ng` : 'LÆ°Æ¡ng Ä‘Ã£ ghi nháº­n'} Â· {profile?.duration || duration} thÃ¡ng Â· {profile?.phone || phone}
            </p>
          </div>
        </div>

        <div className="w-full rounded-2xl border border-white/10 bg-[#0f1219] p-4 space-y-4 sm:p-5">
          <div>
            <label className="mb-1.5 block text-[10px] font-mono font-bold uppercase text-[#f0ede8]/60">Vá»‹ trÃ­ hiá»‡n táº¡i</label>
            <input
              type="text"
              value={currentPosition}
              onChange={e => setCurrentPosition(e.target.value)}
              placeholder="VD: Backend Developer level Mid, Káº¿ toÃ¡n tá»•ng há»£p..."
              className="w-full min-w-0 rounded-xl border border-white/10 bg-[#161b26] px-4 py-3 text-sm text-[#f0ede8] outline-none placeholder:text-[#f0ede8]/20 focus:border-[#e8b84b]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-mono font-bold uppercase text-[#f0ede8]/60">Äiá»ƒm ngháº½n chuyÃªn mÃ´n lá»›n nháº¥t</label>
            <textarea
              value={mainWeakness}
              onChange={e => setMainWeakness(e.target.value)}
              placeholder="VD: thiáº¿u KPI Ä‘o Ä‘Æ°á»£c, chÆ°a cÃ³ case study, yáº¿u stakeholder, chÆ°a chá»©ng minh scope lá»›n..."
              rows={3}
              className="w-full min-w-0 resize-none rounded-xl border border-white/10 bg-[#161b26] px-4 py-3 text-sm text-[#f0ede8] outline-none placeholder:text-[#f0ede8]/20 focus:border-[#e8b84b]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-mono font-bold uppercase text-[#f0ede8]/60">Má»¥c tiÃªu chá»©c vá»¥/lÆ°Æ¡ng trong {durationLabel} tá»›i</label>
            <textarea
              value={twoYearGoal}
              onChange={e => setTwoYearGoal(e.target.value)}
              placeholder="VD: Senior Backend 45M, Lead team 5 ngÆ°á»i, lÃªn Finance Manager..."
              rows={3}
              className="w-full min-w-0 resize-none rounded-xl border border-white/10 bg-[#161b26] px-4 py-3 text-sm text-[#f0ede8] outline-none placeholder:text-[#f0ede8]/20 focus:border-[#e8b84b]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-mono font-bold uppercase text-[#f0ede8]/60">
              TrÃ¬nh Ä‘á»™ há»c váº¥n cao nháº¥t
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
              AI sáº½ Ä‘á»‘i chiáº¿u báº±ng cáº¥p vá»›i dá»¯ liá»‡u nghá» Ä‘á»ƒ xem báº±ng cáº¥p Ä‘ang Ä‘Æ°á»£c thá»‹ trÆ°á»ng tráº£ tiá»n, bá»‹ bá» phÃ­, hay cáº§n bÃ¹ báº±ng KPI thá»±c chiáº¿n.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-mono font-bold uppercase text-[#f0ede8]/60">NgÃ nh há»c / chá»©ng chá»‰ liÃªn quan</label>
            <input
              type="text"
              value={educationDetail}
              onChange={e => setEducationDetail(e.target.value)}
              placeholder="VD: NgÃ´n ngá»¯ Anh, Quáº£n trá»‹ kinh doanh, TESOL, CELTA, IELTS, MBA..."
              className="w-full min-w-0 rounded-xl border border-white/10 bg-[#161b26] px-4 py-3 text-sm text-[#f0ede8] outline-none placeholder:text-[#f0ede8]/20 focus:border-[#e8b84b]"
            />
          </div>

          <div className="rounded-2xl border border-[#e8b84b]/20 bg-[#e8b84b]/8 p-3">
            <p className="text-[10px] font-mono font-black uppercase tracking-normal text-[#e8b84b]">Kháº£o sÃ¡t Ä‘á»ƒ AI cÃ¡ nhÃ¢n hÃ³a Ä‘Ãºng lá»™ trÃ¬nh</p>
            <p className="mt-1 text-[10px] leading-relaxed text-[#f0ede8]/45">
              Pháº§n nÃ y giÃºp lá»™ trÃ¬nh khÃ´ng Ä‘oÃ¡n mÃ² ká»¹ nÄƒng báº¡n Ä‘Ã£ biáº¿t, nháº¥t lÃ  khi lÆ°Æ¡ng hiá»‡n táº¡i Ä‘Ã£ cao.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-mono font-bold uppercase text-[#f0ede8]/60">Ká»¹ nÄƒng/Ä‘Ã²n báº©y báº¡n Ä‘Ã£ khÃ¡ máº¡nh</label>
            <textarea
              value={strongSkills}
              onChange={e => setStrongSkills(e.target.value)}
              placeholder="VD: ká»¹ nÄƒng nghá» báº¡n Ä‘Ã£ cháº¯c tay, cÃ´ng cá»¥/quy trÃ¬nh báº¡n dÃ¹ng tá»‘t, nhÃ³m viá»‡c báº¡n xá»­ lÃ½ á»•n..."
              rows={3}
              className="w-full min-w-0 resize-none rounded-xl border border-white/10 bg-[#161b26] px-4 py-3 text-sm text-[#f0ede8] outline-none placeholder:text-[#f0ede8]/20 focus:border-[#e8b84b]"
            />
            <button
              type="button"
              onClick={() => setStrongSkills('ChÆ°a rÃµ - AI cháº©n Ä‘oÃ¡n giÃºp')}
              className="mt-2 rounded-full border border-[#e8b84b]/25 bg-[#e8b84b]/8 px-3 py-1.5 text-[10px] font-bold text-[#e8b84b]"
            >
              ChÆ°a rÃµ - AI cháº©n Ä‘oÃ¡n giÃºp
            </button>
            <p className="mt-1.5 text-[9px] leading-relaxed text-[#f0ede8]/35">
              KhÃ´ng biáº¿t Ä‘iá»ƒm yáº¿u cÅ©ng khÃ´ng sao. AI sáº½ Ä‘á»c vá»‹ trÃ­, lÆ°Æ¡ng, ká»¹ nÄƒng máº¡nh vÃ  báº±ng chá»©ng hiá»‡n cÃ³ Ä‘á»ƒ tÃ¬m Ä‘iá»ƒm ngháº½n tháº­t.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-mono font-bold uppercase text-[#f0ede8]/60">Báº±ng chá»©ng/thÃ nh tÃ­ch Ä‘Ã£ cÃ³</label>
            <textarea
              value={proofAssets}
              onChange={e => setProofAssets(e.target.value)}
              placeholder="VD: áº£nh/link/file, feedback tháº­t, sá»‘ liá»‡u trÆ°á»›c-sau, thÃ nh tÃ­ch Ä‘Ã£ cÃ³ hoáº·c sáº£n pháº©m nghá» cÃ³ ngÆ°á»i xÃ¡c nháº­n..."
              rows={3}
              className="w-full min-w-0 resize-none rounded-xl border border-white/10 bg-[#161b26] px-4 py-3 text-sm text-[#f0ede8] outline-none placeholder:text-[#f0ede8]/20 focus:border-[#e8b84b]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-mono font-bold uppercase text-[#f0ede8]/60">NÃºt tháº¯t lá»›n nháº¥t Ä‘ang cáº£n tÄƒng lÆ°Æ¡ng</label>
            <textarea
              value={bottleneck}
              onChange={e => setBottleneck(e.target.value)}
              placeholder="VD: lÃ m nhiá»u nhÆ°ng chÆ°a cÃ³ sá»‘, chÆ°a Ä‘Ã³ng gÃ³i Ä‘Æ°á»£c case, thiáº¿u quyá»n quyáº¿t Ä‘á»‹nh, chÆ°a cÃ³ ká»‹ch báº£n deal ná»™i bá»™..."
              rows={3}
              className="w-full min-w-0 resize-none rounded-xl border border-white/10 bg-[#161b26] px-4 py-3 text-sm text-[#f0ede8] outline-none placeholder:text-[#f0ede8]/20 focus:border-[#e8b84b]"
            />
            <button
              type="button"
              onClick={() => setBottleneck('ChÆ°a rÃµ - AI cháº©n Ä‘oÃ¡n giÃºp')}
              className="mt-2 rounded-full border border-[#e8b84b]/25 bg-[#e8b84b]/8 px-3 py-1.5 text-[10px] font-bold text-[#e8b84b]"
            >
              TÃ´i chÆ°a rÃµ nÃºt tháº¯t cá»§a mÃ¬nh
            </button>
            <p className="mt-1.5 text-[9px] leading-relaxed text-[#f0ede8]/35">
              Náº¿u chÆ°a rÃµ, lá»™ trÃ¬nh sáº½ báº¯t Ä‘áº§u báº±ng tuáº§n Ä‘o ná»n Ä‘á»ƒ tÃ¬m nÃºt tháº¯t: KPI, báº±ng chá»©ng, scope, visibility, ká»¹ nÄƒng hoáº·c ká»‹ch báº£n deal.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-mono font-bold uppercase text-[#f0ede8]/60">HÆ°á»›ng muá»‘n Æ°u tiÃªn</label>
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
            <label className="mb-1.5 block text-[10px] font-mono font-bold uppercase text-[#f0ede8]/60">Thá»i gian thá»±c thi má»—i tuáº§n</label>
            <div className="grid grid-cols-3 gap-2">
              {['1-2 giá»/tuáº§n', '3-5 giá»/tuáº§n', '6-8 giá»/tuáº§n'].map(value => (
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
                  {value.replace('/tuáº§n', '')}
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
            Táº¡o checklist thá»±c thi báº±ng AI cÃ¡ nhÃ¢n hÃ³a
          </button>

          <p className="text-center text-[9px] leading-relaxed text-[#f0ede8]/30">
            AI dÃ¹ng cÃ¢u tráº£ lá»i cá»§a báº¡n Ä‘á»ƒ táº¡o má»™t lá»™ trÃ¬nh tham kháº£o cÃ³ checklist, evidence log vÃ  thá»i Ä‘iá»ƒm review. KhÃ´ng pháº£i cam káº¿t tÄƒng lÆ°Æ¡ng tá»± Ä‘á»™ng.
          </p>
        </div>
      </div>
    </div>
  );

  // â”€â”€ STEP: CHECKING â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (step === 'checking' || generating) return (
    <div className="min-h-screen w-full max-w-[100svw] overflow-x-clip bg-[#0a0c10] flex items-center justify-center px-3 py-8 font-sans text-[#f0ede8] sm:px-4">
      <div className="text-center space-y-4">
        <div className="relative w-16 h-16 mx-auto">
          <div className="absolute inset-0 border-4 border-white/10 rounded-full" />
          <div className="absolute inset-0 border-4 border-t-[#e8b84b] rounded-full animate-spin" />
        </div>
        <p className="text-lg font-bold text-[#f0ede8]">
          {generating ? 'âœ¨ AI Ä‘ang cÃ¡ nhÃ¢n hÃ³a lá»™ trÃ¬nh cho báº¡n...' : 'Äang xÃ¡c nháº­n thanh toÃ¡n...'}
        </p>
        <p className="text-sm text-[#f0ede8]/45">
          {generating ? 'Máº¥t khoáº£ng 10-15 giÃ¢y' : `Thá»­ láº§n ${pollCount}/15 Â· Tá»± Ä‘á»™ng unlock sau khi xÃ¡c nháº­n`}
        </p>
        {!generating && (
          <button onClick={() => { if (pollRef.current) clearInterval(pollRef.current); setStep('qr'); }}
            className="text-[10px] font-mono text-[#f0ede8]/30 hover:text-[#f0ede8]/60">
            â† Quay láº¡i
          </button>
        )}
      </div>
    </div>
  );

  // â”€â”€ STEP: ROADMAP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
              <p className="text-sm font-black text-[#f0ede8] truncate">{profile?.job || 'Lá»™ trÃ¬nh cá»§a báº¡n'}</p>
              <p className="text-[10px] text-[#f0ede8]/40">{profile?.phone} Â· {profile?.duration} thÃ¡ng</p>
            </div>
            <span className="text-[9px] bg-[#e8b84b]/10 border border-[#e8b84b]/30 text-[#e8b84b] font-mono font-black px-2 py-0.5 rounded-full shrink-0">âœ“ PAID</span>
          </div>

          <h1 className="text-base font-black text-[#f0ede8] mb-2 leading-tight">{humanizeWorkCopy(roadmap.goal)}</h1>
          <p className="text-[11px] text-[#f0ede8]/60 leading-relaxed mb-4">{humanizeWorkCopy(roadmap.summary)}</p>

          {isExpertRoadmap ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-[#e8b84b]/20 bg-[#161b26] px-3 py-2">
                <p className="text-[9px] font-mono uppercase text-[#f0ede8]/35">Nguá»“n phÃ¢n tÃ­ch</p>
                <p className="text-xs font-black text-[#e8b84b]">AI + quy táº¯c Top LÆ°Æ¡ng</p>
              </div>
              <div className="rounded-xl border border-green-400/20 bg-green-400/10 px-3 py-2">
                <p className="text-[9px] font-mono uppercase text-[#f0ede8]/35">Tráº¡ng thÃ¡i</p>
                <p className="text-xs font-black text-green-300">Checklist riÃªng theo input</p>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex justify-between text-[10px]">
                <span className="text-[#f0ede8]/50">Tiáº¿n Ä‘á»™ tá»•ng</span>
                <span className="font-black text-[#e8b84b]">{stats.done}/{stats.total} viá»‡c Â· {stats.pct}%</span>
              </div>
              <div className="h-3 bg-[#161b26] rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-[#e8b84b] to-green-400 transition-all duration-500"
                  style={{ width: `${stats.pct}%` }} />
              </div>
              <p className="text-[9px] text-[#f0ede8]/30 text-center">
                {stats.pct === 0 ? 'ðŸ’ª Báº¯t Ä‘áº§u tick viá»‡c Ä‘áº§u tiÃªn!' :
                 stats.pct < 50 ? 'ðŸ”¥ Äang trÃªn Ä‘Æ°á»ng â€” tiáº¿p tá»¥c!' :
                 stats.pct < 80 ? 'âš¡ HÆ¡n ná»­a rá»“i â€” gáº§n Ä‘áº¿n lÃºc deal lÆ°Æ¡ng!' :
                 'ðŸ† Sáº¯p xong â€” chuáº©n bá»‹ Ä‘Ã m phÃ¡n!'}
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
                  Äá»™ khá»›p há»c váº¥n vá»›i lÆ°Æ¡ng
                </p>
                <h2 className="text-base font-black leading-tight text-[#f0ede8]">
                  Báº±ng cáº¥p cÃ³ Ä‘ang Ä‘Æ°á»£c thá»‹ trÆ°á»ng tráº£ tiá»n chÆ°a?
                </h2>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-white/8 bg-[#161b26] px-3 py-2">
                    <p className="text-[9px] uppercase text-[#f0ede8]/35">Há»c váº¥n</p>
                    <p className="text-xs font-black text-[#f0ede8]">{roadmap.intake.educationLevel || 'ChÆ°a cung cáº¥p'}</p>
                  </div>
                  <div className="rounded-xl border border-white/8 bg-[#161b26] px-3 py-2">
                    <p className="text-[9px] uppercase text-[#f0ede8]/35">LiÃªn quan</p>
                    <p className="text-xs font-black text-[#f0ede8]">{roadmap.intake.educationDetail || 'Cáº§n chá»©ng minh báº±ng KPI'}</p>
                  </div>
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-[#f0ede8]/55">
                  Pháº§n phÃ¢n tÃ­ch bÃªn dÆ°á»›i sáº½ chá»‰ ra báº±ng cáº¥p Ä‘ang lÃ  lá»£i tháº¿, Ä‘iá»ƒm bá»‹ Ä‘á»‹nh giÃ¡ tháº¥p, hay pháº§n cáº§n bÃ¹ báº±ng báº±ng chá»©ng váº­n hÃ nh.
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
                  Äá»c thÃªm: há»‡ thá»‘ng giáº£i thÃ­ch vÃ¬ sao lÃ m cÃ¡c viá»‡c trÃªn
                </summary>
                <p className="mt-3 rounded-xl border border-[#e8b84b]/20 bg-[#e8b84b]/8 px-3 py-2 text-[11px] leading-relaxed text-[#f0ede8]/60">
                  KhÃ´ng cáº§n Ä‘á»c háº¿t pháº§n nÃ y trÆ°á»›c. Cá»© lÃ m checklist vÃ  báº£n Ä‘á»“ tiáº¿n Ä‘á»™ phÃ­a trÃªn; pháº§n dÆ°á»›i giáº£i thÃ­ch logic nghá» nghiá»‡p Ä‘á»©ng sau tá»«ng viá»‡c.
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
                        {isComplete ? 'âœ“' : `W${week.week}`}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold ${isComplete ? 'text-green-400' : 'text-[#f0ede8]'}`}>{humanizeWorkCopy(week.focus)}</p>
                        <p className="text-[9px] text-[#f0ede8]/35 mt-0.5">ðŸŽ¯ {humanizeWorkCopy(week.milestone)}</p>
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
                              {checked && <span className="text-white text-[10px] font-black">âœ“</span>}
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
              <p className="text-[10px] font-mono text-[#e8b84b] uppercase tracking-wider mb-1.5">âš¡ Thá»i Ä‘iá»ƒm deal lÆ°Æ¡ng</p>
              <p className="text-sm text-[#f0ede8]/80 leading-relaxed">{humanizeWorkCopy(roadmap.negotiation_timing)}</p>
              <p className="text-[10px] text-[#f0ede8]/40 mt-2">
                Tip: Äá»«ng chá» hoÃ n háº£o 100%. Khi tick xong 70% viá»‡c â€” báº¡n Ä‘Ã£ cÃ³ Ä‘á»§ báº±ng chá»©ng Ä‘á»ƒ Ä‘Ã m phÃ¡n.
              </p>
            </div>
          </>
        )}

        <div className="rounded-xl border border-[#e8b84b]/20 bg-[#e8b84b]/8 p-3 text-center">
          <p className="text-[11px] leading-relaxed text-[#f0ede8]/65">
            Má»™t láº§n mua má»Ÿ khÃ³a má»™t lá»™ trÃ¬nh gáº¯n vá»›i SÄT nÃ y. Cá»© tick viá»‡c á»Ÿ Ä‘Ã¢y Ä‘á»ƒ giá»¯ tiáº¿n Ä‘á»™; khi Ä‘áº¡t 80% hÃ£y quÃ©t láº¡i má»©c lÆ°Æ¡ng Ä‘á»ƒ chuáº©n bá»‹ deal.
          </p>
        </div>

        <Link href="/"
          className="block w-full bg-[#e8b84b] text-[#0a0c10] font-black py-4 rounded-xl text-base text-center hover:-translate-y-0.5 transition-all">
          âš¡ QuÃ©t láº¡i â€” Xem lÆ°Æ¡ng Ä‘Ã£ tÄƒng chÆ°a
        </Link>

        {/* KhÃ³a xem láº¡i */}
        <div className="bg-[#0f1219] border border-white/8 rounded-xl p-4 text-center space-y-1">
          <p className="text-[10px] font-mono text-[#f0ede8]/30 uppercase tracking-wider">KhÃ³a xem láº¡i lá»™ trÃ¬nh</p>
          <p className="text-sm font-black text-[#e8b84b]">{profile?.phone} Â· {activeAccessCode}</p>
          <p className="text-[9px] text-[#f0ede8]/25">
            DÃ¹ng SÄT vÃ  mÃ£ truy cáº­p nÃ y Ä‘á»ƒ xem láº¡i trÃªn thiáº¿t bá»‹ khÃ¡c. KhÃ´ng chia sáº» mÃ£ náº¿u khÃ´ng muá»‘n ngÆ°á»i khÃ¡c má»Ÿ lá»™ trÃ¬nh.
          </p>
        </div>

      </div>
    </div>
  );
}
