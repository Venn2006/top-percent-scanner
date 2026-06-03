"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from 'react';
import QRCode from 'react-qr-code';
import Link from 'next/link';
import Image from 'next/image';
import { getCareerCompassContext, type CareerCompassContext } from '@/lib/careerCompassEngine';
import { useStats } from '@/lib/useStats';
import { MARKET_LOCATIONS, type MarketLocationKey } from '@/lib/locationBenchmark';
import { buildJobJumpMap } from '@/lib/jobJumpMap';
import { DEFAULT_WORK_PROVINCE, WORK_PROVINCES, getWorkProvince, type WorkProvinceKey } from '@/lib/workProvinces';
import { playTap, playSuccess, playStageTick, vibrateStage, startResearchPulse, stopResearchPulse } from '@/lib/sound';
import { trackEvent, trackFunnelEvent } from '@/lib/analytics';
import { getAttributionPayload } from '@/lib/attribution';
import { getSimulatedSalary } from '@/lib/salarySimulation';
import { repairMojibakeDeep, repairMojibakeText } from '@/lib/mojibake';
import { buildMarketPositionDisplay } from '@/lib/marketPositionDisplay';
import { buildSafePremiumInsight as buildRoleSafePremiumInsight, isDirtyPremiumInsightForJob } from '@/lib/reportPremiumInsight';
import { formatBenchmarkCell, type BenchmarkCellLabel } from '@/lib/reportEntitlementDisplay';
import { inferRoleLevelBand, isExecutiveLevel } from '@/lib/roleSeniority';
import { CERTIFICATE_SOURCE_LINE, RESULT_SOURCE_CHIP_LABELS, TRUSTED_SALARY_SOURCES } from '@/lib/trustedSalarySources';
import {
  detectRoleSegment,
  getPremiumRolePreviewForRole,
  getSimulatorSkillsForRole,
  getWorkTiersForRole,
  isRestaurantFrontlineRole,
  isRestaurantManagerRole,
} from '@/lib/roleTaxonomy';

// ── Lazy load PremiumSection — chỉ tải khi user đã thanh toán ────────────────
const PremiumSection = lazy(() => import('./PremiumSection'));
const SHARED_PHONE_KEY = 'vspi-shared-phone';
const SHARED_PHONE_EVENT = 'vspi-shared-phone-updated';
const SHARED_FULL_NAME_KEY = 'vspi-shared-full-name';
const SHARED_FULL_NAME_EVENT = 'vspi-shared-full-name-updated';
const PREMIUM_SESSION_KEY = 'vspi-premium-session';
const PREMIUM_PENDING_KEY = 'vspi-premium-pending-v1';
const PREMIUM_SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PREMIUM_PENDING_TTL_MS = 24 * 60 * 60 * 1000;

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
const saveSharedName = (value: string) => {
  const name = cleanSharedName(value);
  if (!name || typeof window === 'undefined') return name;
  try {
    localStorage.setItem(SHARED_FULL_NAME_KEY, name);
    window.dispatchEvent(new CustomEvent(SHARED_FULL_NAME_EVENT, { detail: name }));
  } catch { /* ignore storage errors */ }
  return name;
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

interface SalaryData { industry?: string; job_title?: string; top_50: number; top_20: number | null; top_10: number | null; top_5: number | null; }
interface BenchmarkMeta {
  industry?: string;
  confidenceScore: number;
  confidenceLabel: string;
  confidenceDescription: string;
  sourceType: string;
  sources: string[];
  percentileBucket: number;
  rankEstimate: number;
  rankLabel: string;
  ultraRankLabel: string | null;
  nextTargetSalary: number;
  matchedJobTitle?: string;
  matchType?: string;
  marketLocation?: string;
  locationMultiplier?: number;
  strategicTargetSalary?: number;
  strategicTargetLabel?: string;
  currentBandLabel?: string;
  nextBandLabel?: string | null;
  nextBandSalary?: number | null;
  nextBandGap?: number | null;
  bandProgressPct?: number | null;
  bandProgressText?: string | null;
  thresholdPreview?: Array<{ label: string; salary: number | null; locked: boolean; active: boolean }>;
  thresholds?: any;
}
interface GapData { currentPays: string; topPays: string; roadmap: { month: string; action: string }[]; currentSkill: string; missingSkill: string; }
interface TeaserProps { fullName: string; job: string; percent: number; lostMoney: number; salary: number; dbData: SalaryData | null; paidCount: number; dailyViews: number; }
interface ComponentProps { fullName: string; job: string; percent: number; dbData: SalaryData | null; }
interface SimulatorProps { fullName: string; job: string; currentPercent: number; currentSalary: number; dbData: SalaryData | null; }
type PremiumPackage = '29k' | '79k';

interface PaywallProps { vspiId: string; fullName: string; selectedJob: string; selectedRoleId?: string; resultPercent: number; lostMoney: number; salary: number; experience: ExperienceLevel; marketLocation: MarketLocationKey; workProvince: WorkProvinceKey; paidCount: number; dailyViews: number; onShowToast: (msg: string, type: 'error' | 'success' | 'info') => void; onUnlock: (fullData: SalaryData, aiAnalysis: string, benchmark?: BenchmarkMeta | null, unlockedPackage?: PremiumPackage) => void; }
interface CertificateProps { fullName: string; job: string; percent: number; vspiId: string; elementId?: string; }
interface EliteProps { fullName: string; job: string; percent: number; }
interface PremiumProps extends TeaserProps { vspiId: string; salary: number; }

// Scanning step interface
interface ScanStep { label: string; detail: string; }

type ExperienceLevel = 'junior' | 'mid' | 'senior';
type IncomeType = 'gross' | 'net' | 'total' | 'unknown';
type JobOption = { title: string; roleId: string | null };

const EXPERIENCE_META: Record<ExperienceLevel, { label: string; short: string; multiplier: number; tone: string }> = {
  junior: { label: '0-2 năm', short: 'Junior', multiplier: 0.70, tone: 'Cần chứng minh nền tảng' },
  mid: { label: '3-5 năm', short: 'Mid-level', multiplier: 1.00, tone: 'Đã phải có KPI và ownership rõ' },
  senior: { label: 'Trên 5 năm', short: 'Senior / Lead', multiplier: 1.30, tone: 'Kỳ vọng dẫn dắt và tạo kết quả đo được' },
};

const EXPERIENCE_ORDER: ExperienceLevel[] = ['junior', 'mid', 'senior'];

const INCOME_TYPE_META: Record<IncomeType, { label: string; short: string; note: string }> = {
  gross: {
    label: 'Gross cố định',
    short: 'Gross',
    note: 'Benchmark mặc định đọc theo gross/tháng cho công việc full-time.',
  },
  net: {
    label: 'Net thực nhận',
    short: 'Net',
    note: 'Nếu bạn nhập net, vị trí có thể bị đọc thấp hơn 10-25% so với gross tương đương.',
  },
  total: {
    label: 'Tổng thu nhập',
    short: 'Tổng',
    note: 'Dùng khi lương gồm OT, phụ cấp, hoa hồng hoặc doanh số đều đặn mỗi tháng.',
  },
  unknown: {
    label: 'Không chắc',
    short: '?',
    note: 'Kết quả chỉ là khoảng tham chiếu. Nên kiểm lại gross/net trước khi deal lương.',
  },
};

const INCOME_TYPE_OPTIONS: IncomeType[] = ['gross', 'net', 'total', 'unknown'];

const isIncomeType = (value: unknown): value is IncomeType =>
  value === 'gross' || value === 'net' || value === 'total' || value === 'unknown';

interface AudiencePreset {
  id: 'fresh-graduate' | 'stuck-mid-career' | 'career-pivot';
  title: string;
  shortLabel: string;
  subLabel: string;
  badge: string;
  description: string;
  salary?: string;
  experience: ExperienceLevel;
  marketLocation: MarketLocationKey;
  workProvince: WorkProvinceKey;
  jobTitle?: string;
  prompt: string;
}

const RADIUS = 60;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const TODAY = new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
const MIN_MONTHLY_SALARY = 500_000;
const MAX_MONTHLY_SALARY = 500_000_000;

const cleanMoneyInput = (value: string) => value.replace(/\D/g, '').slice(0, 15);
const formatMoneyInput = (value: string) => {
  const digits = cleanMoneyInput(value);
  return digits ? Number(digits).toLocaleString('en-US') : '';
};
const parseMoneyInput = (value: string) => parseInt(cleanMoneyInput(value), 10) || 0;
const getSalaryValidationError = (displayValue: string, rawValue = displayValue) => {
  const raw = rawValue.trim();
  if (!raw) return '';
  if (/[\u2212-]/.test(raw)) return 'Thu nhập không hợp lệ: không nhập số âm.';
  const amount = parseMoneyInput(displayValue);
  if (!amount) return 'Thu nhập không hợp lệ. Vui lòng nhập số tiền theo tháng.';
  if (amount < MIN_MONTHLY_SALARY) return 'Thu nhập tối thiểu là 500.000đ/tháng.';
  if (amount > MAX_MONTHLY_SALARY) return 'Thu nhập tối đa hệ thống nhận là 500.000.000đ/tháng.';
  return '';
};

const DATA_SOURCES = TRUSTED_SALARY_SOURCES;

const RESULT_SOURCE_CHIPS = RESULT_SOURCE_CHIP_LABELS;

const DEFAULT_SIMULATOR_SKILLS = [
  { id: 'english', label: 'Tiếng Anh chuyên ngành B2+', boost: 0.12, pctBoost: 12 },
  { id: 'ai', label: 'Năng lực dùng công cụ năng suất hiện đại', boost: 0.20, pctBoost: 22 },
  { id: 'lead', label: 'Quản lý nhóm / Team Lead', boost: 0.22, pctBoost: 18 },
  { id: 'cert', label: 'Chứng chỉ chuyên ngành quốc tế', boost: 0.10, pctBoost: 8 },
];

const AVIATION_ROLE_REGEX = /tiep vien hang khong|cabin crew|flight attendant|stewardess|steward|hang khong|airline|hang bay/;

function getSimulatorSkillsForJob(job: string) {
  return getSimulatorSkillsForRole(job, DEFAULT_SIMULATOR_SKILLS);
}

const DEFAULT_TIERS = [
  { name: 'Startup / SME', mul: 1.00, color: '#94a3b8', badge: '🏠' },
  { name: 'Công ty nội địa lớn', mul: 1.28, color: '#60a5fa', badge: '🏢' },
  { name: 'FDI / Doanh nghiệp nước ngoài', mul: 1.60, color: '#34d399', badge: '🌏' },
  { name: 'MNC / Tập đoàn đa quốc gia', mul: 2.05, color: '#fbbf24', badge: '🏆' },
];

// Scanning steps for the loading animation
const SCAN_STEPS: ScanStep[] = [
  { label: 'Đang tìm nghề gần nhất...', detail: 'So với hơn 1,000 chức danh đang có dữ liệu lương' },
  { label: 'Đang so với thị trường Việt Nam...', detail: 'Đối chiếu GSO · Adecco · ITviec · VietnamWorks' },
  { label: 'Đang tính bạn thuộc nhóm Top mấy %...', detail: 'So lương của bạn với các mốc thu nhập cùng ngành' },
  { label: 'Xong! Đang mở kết quả...', detail: 'Chuẩn bị báo cáo dễ hiểu cho bạn' },
];

const AUDIENCE_PRESETS: AudiencePreset[] = [
  {
    id: 'fresh-graduate',
    title: 'Mới tốt nghiệp',
    shortLabel: 'Mới tốt nghiệp',
    subLabel: 'Chưa rõ hướng',
    badge: 'Định hướng',
    description: 'Dành cho người mới ra trường còn phân vân chọn nghề, offer đầu đời và hướng phát triển.',
    salary: '10000000',
    experience: 'junior',
    marketLocation: 'hcm',
    workProvince: 'hcm',
    jobTitle: 'Sinh viên mới tốt nghiệp chưa rõ định hướng',
    prompt: 'Đã set nhóm mới tốt nghiệp. Bạn có thể sửa nghề cụ thể nếu đã có offer.',
  },
  {
    id: 'stuck-mid-career',
    title: '3+ năm dậm chân',
    shortLabel: '3+ năm',
    subLabel: 'Lương đứng yên',
    badge: 'Tắc lương',
    description: 'Dành cho người đã làm trên 3 năm nhưng lương, chức danh hoặc scope không nhúc nhích.',
    salary: '16000000',
    experience: 'mid',
    marketLocation: 'hcm',
    workProvince: 'hcm',
    jobTitle: 'Nhân sự đi làm trên 3 năm nhưng lương dậm chân tại chỗ',
    prompt: 'Đã set nhóm 3+ năm dậm chân. Sửa nghề cụ thể để benchmark sát hơn.',
  },
  {
    id: 'career-pivot',
    title: 'Muốn đổi hướng',
    shortLabel: 'Đổi hướng',
    subLabel: 'Map lại nghề',
    badge: 'Pivot',
    description: 'Dành cho người có kinh nghiệm nhưng không chắc nghề hiện tại còn đáng theo, cần chuyển kỹ năng sang role mới.',
    salary: '18000000',
    experience: 'mid',
    marketLocation: 'hcm',
    workProvince: 'hcm',
    jobTitle: 'Nhân sự muốn đổi hướng nghề nghiệp',
    prompt: 'Đã set nhóm muốn đổi hướng. Hệ thống sẽ gợi ý bằng chứng và role mới từ skill đang có.',
  },
];

const getRingColor = (p: number) => p <= 5 ? '#FFD700' : p <= 10 ? '#00E676' : p <= 20 ? '#40C4FF' : p <= 50 ? '#FF9100' : '#FF5252';
const fmtM = (n: number | null | undefined) => n === null || n === undefined ? '?M' : `${(n / 1_000_000).toFixed(1)}M`;
const fmtSalaryCardValue = (n: number | null | undefined) => {
  if (n === null || n === undefined) return '?';
  const value = n / 1_000_000;
  return `${value.toFixed(value >= 10 && Number.isInteger(value) ? 0 : 1).replace('.', ',')} triệu`;
};
const benchmarkLabelKey = (label: string): BenchmarkCellLabel => {
  if (/top\s*20/i.test(label)) return 'top20';
  if (/top\s*10/i.test(label)) return 'top10';
  if (/top\s*5/i.test(label)) return 'top5';
  if (/top\s*1/i.test(label)) return 'top1';
  return 'median';
};
const getTopPercentNumber = (label: string) => Number(label.match(/\d+/)?.[0] ?? 0);
const formatTopPercentLabel = (label: string) => {
  const n = getTopPercentNumber(label);
  if (n >= 100) return 'Dưới Top 80%';
  return n ? `Top ${n}%` : label;
};
const formatPercentDisplay = (percent: number) => percent >= 100 ? 'Dưới Top 80%' : `Top ${percent}%`;
const isLooseRoleSegment = (segment: ReturnType<typeof detectRoleSegment>) => segment === 'general' || segment === 'fresh';
const isSameRoleSegment = (job: string, matchedJob?: string | null, industry?: string | null) => {
  if (!job.trim() || !matchedJob?.trim()) return true;
  const requested = detectRoleSegment(job);
  if (isLooseRoleSegment(requested)) return true;
  return detectRoleSegment(matchedJob, industry) === requested;
};
const sanitizeBenchmarkForJob = (benchmark: BenchmarkMeta | null, job: string, dbData?: SalaryData | null): BenchmarkMeta | null => {
  if (!benchmark) return null;
  if (isSameRoleSegment(job, benchmark.matchedJobTitle, benchmark.industry ?? dbData?.industry)) return benchmark;
  return null;
};
const sanitizeSalaryDataForJob = (data: SalaryData | null, job: string) => {
  if (!data) return null;
  if (!data.job_title || isSameRoleSegment(job, data.job_title, data.industry)) return data;
  return null;
};
const isDirtyInsightForJob = (text: string, job: string) => {
  return isDirtyPremiumInsightForJob(text, job);
};
const buildSafePremiumInsight = (job: string, salary: number, percent: number, targetLabel?: string, targetSalary?: number) => {
  return buildRoleSafePremiumInsight(job, salary, percent, targetLabel, targetSalary);
};
const getThreshold = (benchmark: BenchmarkMeta | null, label: string) =>
  benchmark?.thresholdPreview?.find(row => row.label === label)?.salary ?? null;
const MIN_STRATEGIC_GAP_VND = 2_000_000;
const getMeaningfulStrategicGap = (salary: number) => Math.max(MIN_STRATEGIC_GAP_VND, salary * 0.08);
const getStickyHourlyLoss = (monthlyGap: number, salary: number) => {
  const persuasiveMonthlyGap = Math.max(monthlyGap, salary * 0.35, 5_000_000);
  return Math.max(45_000, persuasiveMonthlyGap / 88);
};
const getStrategicCandidateLabels = (percent: number) => {
  if (percent >= 100) return ['Top 80%', 'Top 70%', 'Top 60%', 'Top 50%', 'Top 40%', 'Top 30%', 'Top 20%', 'Top 10%', 'Top 5%', 'Top 1%'];
  if (percent >= 80) return ['Top 70%', 'Top 60%', 'Top 50%', 'Top 40%', 'Top 30%', 'Top 20%', 'Top 10%', 'Top 5%', 'Top 1%'];
  if (percent >= 70) return ['Top 60%', 'Top 50%', 'Top 40%', 'Top 30%', 'Top 20%', 'Top 10%', 'Top 5%', 'Top 1%'];
  if (percent >= 60) return ['Top 50%', 'Top 40%', 'Top 30%', 'Top 20%', 'Top 10%', 'Top 5%', 'Top 1%'];
  if (percent >= 50) return ['Top 40%', 'Top 30%', 'Top 20%', 'Top 10%', 'Top 5%', 'Top 1%'];
  if (percent >= 40) return ['Top 30%', 'Top 20%', 'Top 10%', 'Top 5%', 'Top 1%'];
  if (percent >= 30) return ['Top 20%', 'Top 10%', 'Top 5%', 'Top 1%'];
  if (percent >= 20) return ['Top 10%', 'Top 5%', 'Top 1%'];
  if (percent >= 10) return ['Top 5%', 'Top 1%'];
  return ['Top 1%'];
};
const inferStrategicTargetLabel = (percent: number) =>
  percent >= 100 ? 'Top 80%' :
  percent >= 80 ? 'Top 70%' :
  percent >= 70 ? 'Top 60%' :
  percent >= 60 ? 'Top 50%' :
  percent >= 50 ? 'Top 40%' :
  percent >= 40 ? 'Top 30%' :
  percent >= 30 ? 'Top 20%' :
  percent >= 20 ? 'Top 10%' :
  percent >= 10 ? 'Top 5%' :
  'Top 1%';
const getStrategicOpportunity = (benchmark: BenchmarkMeta | null, salary: number, percent: number) => {
  const minGap = getMeaningfulStrategicGap(salary);
  const candidates = getStrategicCandidateLabels(percent)
    .map(label => ({ label, salary: getThreshold(benchmark, label) || 0 }))
    .filter(target => target.salary > salary);
  const meaningful = candidates.find(target => target.salary - salary >= minGap);
  const chosen = meaningful || candidates[candidates.length - 1];
  const label = chosen?.label || benchmark?.strategicTargetLabel || inferStrategicTargetLabel(percent);
  const salaryFromPreview = chosen?.salary || getThreshold(benchmark, label);
  const targetSalary = salaryFromPreview || benchmark?.strategicTargetSalary || benchmark?.nextTargetSalary || 0;
  const gapMonthly = Math.max(0, targetSalary - salary);
  return { label, targetSalary, gapMonthly };
};
const PERCENTILE_LADDER = [80, 70, 60, 50, 40, 30, 20, 10, 5, 1] as const;
const ELITE_ZONE_RUNGS = [10, 5, 1] as const;
const getUnlockedAndLockedPercentileTargets = (userTopPercent: number) => {
  const ladder: number[] = [...PERCENTILE_LADDER];
  // Snap user to ladder rung (smaller = better). Default = worst rung if percent > 80.
  let userRung: number = ladder[0];
  for (const rung of ladder) {
    if (userTopPercent <= rung) userRung = rung;
    else break;
  }
  const userIdx = ladder.indexOf(userRung);
  const isTopTier = userRung === 1;
  const isEliteZone = (ELITE_ZONE_RUNGS as readonly number[]).includes(userRung);
  // Top 10/5/1: no "next visible" tier shown for free — elite numbers are paywalled.
  const nextVisibleTarget: number | null =
    !isEliteZone && userIdx >= 0 && userIdx < ladder.length - 1
      ? ladder[userIdx + 1]
      : null;
  const unlocked = nextVisibleTarget !== null ? [userRung, nextVisibleTarget] : [userRung];
  const highestUnlocked = Math.min(...unlocked);
  const locked = ladder.filter(r => r < highestUnlocked);
  return { userRung, nextVisibleTarget, unlocked, locked, isTopTier, isEliteZone };
};
const getSalaryBand = (salary: number) => {
  if (salary < 10_000_000) return '<10m';
  if (salary < 20_000_000) return '10-20m';
  if (salary < 30_000_000) return '20-30m';
  if (salary < 50_000_000) return '30-50m';
  if (salary < 80_000_000) return '50-80m';
  return '80m+';
};
const genVSPIId = () => {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = new Uint32Array(8);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 2 ** 32);
  }
  let s = 'VSPI-2026-';
  for (let i = 0; i < 4; i++) s += c[bytes[i] % c.length];
  s += '-';
  for (let i = 4; i < 8; i++) s += c[bytes[i] % c.length];
  return s;
};

const normalizeRoleText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

function getWorkTiersForJob(job: string) {
  return getWorkTiersForRole(job, DEFAULT_TIERS);
  const normalized = normalizeRoleText(job);
  if (/dau bep|chef|bep truong|bep pho|sous chef|cook|nha hang|restaurant|f&b|fnb|kitchen/.test(normalized)) {
    return [
      { name: 'Quán/nhà hàng nhỏ', mul: 1.00, color: '#94a3b8', badge: '🍳' },
      { name: 'Chuỗi nhà hàng có KPI', mul: 1.25, color: '#60a5fa', badge: '🍽️' },
      { name: 'Khách sạn / resort / catering', mul: 1.55, color: '#34d399', badge: '🏨' },
      { name: 'Bếp trưởng / bếp trung tâm', mul: 1.95, color: '#fbbf24', badge: '🏆' },
    ];
  }
  if (/\bmc\b|nguoi dan|dan chuong trinh|host|su kien|event host|livestream host|presenter|moderator|wedding mc/.test(normalized)) {
    return [
      { name: 'Show nhỏ / local event', mul: 1.00, color: '#94a3b8', badge: '🎤' },
      { name: 'Wedding / activation', mul: 1.25, color: '#60a5fa', badge: '🎪' },
      { name: 'Corporate / livestream', mul: 1.55, color: '#34d399', badge: '🎬' },
      { name: 'Premium host có rate card', mul: 1.95, color: '#fbbf24', badge: '🏆' },
    ];
  }
  if (AVIATION_ROLE_REGEX.test(normalized)) {
    return [
      { name: 'Hãng nội địa / cabin crew mới', mul: 1.00, color: '#94a3b8', badge: '✈️' },
      { name: 'Tuyến ổn định / service chuẩn', mul: 1.22, color: '#60a5fa', badge: '🧳' },
      { name: 'Tuyến quốc tế / senior crew', mul: 1.55, color: '#34d399', badge: '🌏' },
      { name: 'Purser / Cabin leader', mul: 1.95, color: '#fbbf24', badge: '🏆' },
    ];
  }
  return DEFAULT_TIERS;
}

function getPremiumRolePreview(job: string) {
  return getPremiumRolePreviewForRole(job);
  const normalized = normalizeRoleText(job);
  if (/dau bep|chef|bep truong|bep pho|sous chef|cook|nha hang|restaurant|f&b|fnb|kitchen/.test(normalized)) {
    return {
      roleLabel: job.trim() || 'đầu bếp',
      coreSkill: 'food cost + tốc độ ra món + chất lượng giờ cao điểm',
      path: 'Đầu bếp → Ca trưởng/Sous Chef → Bếp trưởng/Kitchen Manager hoặc Quản lý nhà hàng',
      firstAction: 'đóng gói số food cost, waste rate, tốc độ ra món, rating khách và checklist SOP bếp',
      skills: ['Food cost', 'Waste rate', 'Kitchen SOP', 'Training phụ bếp'],
      cvBullet: 'Chứng minh food cost, waste, tốc độ ra món, chất lượng món và khả năng giữ chuẩn ca đông thay vì chỉ ghi “nấu tốt”.',
    };
  }
  if (/\bmc\b|nguoi dan|dan chuong trinh|host|su kien|event host|livestream host|presenter|moderator|wedding mc/.test(normalized)) {
    return {
      roleLabel: job.trim() || 'MC / người dẫn chương trình',
      coreSkill: 'showreel + kịch bản sân khấu + xử lý tình huống live',
      path: 'MC phổ thông → MC corporate/activation/livestream có showreel và rate card',
      firstAction: 'tạo showreel 60-90 giây, 3 mẫu lời dẫn, feedback khách/agency và rate card theo format sự kiện',
      skills: ['Showreel', 'Lời dẫn theo brief', 'Xử lý live', 'Rate card'],
      cvBullet: 'Chứng minh số show, format sự kiện, feedback khách/agency và khả năng giữ timeline thay vì chỉ ghi “dẫn chương trình”.',
    };
  }
  if (AVIATION_ROLE_REGEX.test(normalized)) {
    return {
      roleLabel: job.trim() || 'tiếp viên hàng không',
      coreSkill: 'an toàn bay + service recovery + giao tiếp tiếng Anh + feedback senior crew',
      path: 'Tiếp viên hàng không → Senior Cabin Crew / Purser / tuyến quốc tế',
      firstAction: 'lưu 3 tình huống phục vụ thật, 1 checklist safety-service, 2 feedback từ senior crew/đồng nghiệp và chứng chỉ training liên quan',
      skills: ['Cabin safety', 'Service recovery', 'English announcement', 'Grooming/teamwork'],
      cvBullet: 'Chứng minh chuẩn an toàn, xử lý tình huống khách, feedback senior crew và khả năng phục vụ tuyến khó thay vì chỉ ghi “tiếp viên hàng không”.',
    };
  }
  if (/quan ly.*trung tam.*ngoai ngu|trung tam ngoai ngu|english center|language center/.test(normalized)) {
    return {
      roleLabel: job.trim() || 'quản lý trung tâm ngoại ngữ',
      coreSkill: 'vận hành trung tâm + tuyển sinh + retention học viên',
      path: 'Quản lý vận hành trung tâm → Center Manager / Academic Operations Lead / Growth Manager giáo dục',
      firstAction: 'đóng gói số liệu học viên active, trial-to-paid, retention, class fill rate và complaint SLA',
      skills: ['Center operations', 'Enrollment funnel', 'Retention/churn', 'Teacher utilization'],
      cvBullet: 'Chứng minh tăng enrollment/retention, giảm complaint và tối ưu lịch giáo viên thay vì chỉ ghi “quản lý trung tâm”.',
    };
  }
  if (/dao tao|l&d|learning|teacher|giao vien|giang day|tesol|ngon ngu anh|trung tam ngoai ngu/.test(normalized)) {
    return {
      roleLabel: 'đào tạo/L&D',
      coreSkill: 'Instructional Design + e-learning + KPI đào tạo',
      path: 'Trainer thường → L&D Specialist / E-learning Producer / Training Lead',
      firstAction: 'biến 1 buổi đào tạo thành slide, video demo, quiz và KPI hoàn thành học viên',
      skills: ['Instructional Design', 'Canva/PowerPoint', 'Edit video bài giảng', 'LMS/e-learning'],
      cvBullet: 'Thiết kế 1 module đào tạo có quiz và đo completion/feedback score thay vì chỉ ghi “đứng lớp tốt”.',
    };
  }
  if (/marketing|content|seo|social|media|brand|designer|thiet ke/.test(normalized)) {
    return {
      roleLabel: 'marketing/content/design',
      coreSkill: 'content system + short-form video + đo conversion',
      path: 'Content executor → Growth/Performance Content / Creative Strategist',
      firstAction: 'đóng gói 1 campaign thành before/after, chỉ số reach, CTR, CVR hoặc lead',
      skills: ['Edit video short-form', 'Canva/Photoshop', 'Content calendar', 'Đọc CTR/CVR'],
      cvBullet: 'Tạo 1 campaign có số trước/sau, không chỉ liệt kê “viết content, chạy social”.',
    };
  }
  if (/developer|engineer|backend|frontend|data|it|software|devops|tester|qa/.test(normalized)) {
    return {
      roleLabel: 'công nghệ',
      coreSkill: 'project ownership + system/debugging + impact bằng số',
      path: 'Người triển khai → Owner của feature/module có số đo',
      firstAction: 'biến 1 feature/fix thành case study: vấn đề, giải pháp, latency/lỗi/thời gian giảm',
      skills: ['Git/GitHub', 'API integration', 'SQL/log debugging', 'System design cơ bản'],
      cvBullet: 'Viết lại project theo impact: giảm lỗi, tăng tốc, tiết kiệm thời gian hoặc tăng conversion.',
    };
  }
  if (/sales|kinh doanh|account|tu van|ban hang/.test(normalized)) {
    return {
      roleLabel: 'sales/kinh doanh',
      coreSkill: 'pipeline + proposal + conversion rate',
      path: 'Sales chạy quota → Account owner / Key Account / Sales Lead',
      firstAction: 'lập tracker lead-to-meeting-to-close và viết lại 1 proposal có lý do mua rõ ràng',
      skills: ['CRM pipeline', 'Cold message', 'Proposal', 'Conversion rate'],
      cvBullet: 'Đưa số conversion, doanh thu, ticket size, số deal thắng vào CV thay vì ghi “tư vấn khách hàng”.',
    };
  }
  if (/cong nhan|van hanh may|san xuat|factory|operator|line|kho|qc/.test(normalized)) {
    return {
      roleLabel: 'sản xuất/vận hành',
      coreSkill: 'SOP + QC checklist + năng suất line',
      path: 'Công nhân vận hành → Tổ phó / QC / Line leader',
      firstAction: 'ghi lại sản lượng, lỗi, chuyên cần và 1 đề xuất cải tiến nhỏ có số liệu',
      skills: ['SOP vận hành', 'QC checklist', '5S/an toàn', 'Excel theo dõi sản lượng'],
      cvBullet: 'Chứng minh giảm lỗi/tăng sản lượng/chuyên cần thay vì chỉ ghi “vận hành máy”.',
    };
  }
  return {
    roleLabel: 'ngành của bạn',
    coreSkill: '1 kỹ năng nghề có output đo được',
    path: 'Làm theo mô tả công việc → người có portfolio, KPI và case study',
    firstAction: 'biến 1 việc đang làm thành sản phẩm nhìn thấy được: file, dashboard, quy trình, video hoặc case study',
    skills: ['Excel/Sheets dashboard', 'Canva/PowerPoint', 'CV/LinkedIn case study', 'Tiếng Anh B2+'],
    cvBullet: 'Viết lại kinh nghiệm theo format: kỹ năng + sản phẩm + kết quả đo được.',
  };
}

function HourlyLossCounter({ hourlyLoss }: { hourlyLoss: number }) {
  const safeBase = Math.max(0, Math.floor(hourlyLoss));
  const maxBaseRef = useRef(safeBase);
  const [value, setValue] = useState(safeBase);
  useEffect(() => {
    if (safeBase <= 0) {
      setValue(0);
      return;
    }
    maxBaseRef.current = Math.max(maxBaseRef.current, safeBase);
    const lockedBase = maxBaseRef.current;
    setValue(prev => Math.max(prev, lockedBase));
    const startedAt = Date.now();
    const perSecond = lockedBase / 3600;
    const id = window.setInterval(() => {
      const elapsedSec = (Date.now() - startedAt) / 1000;
      setValue(prev => Math.max(prev, lockedBase + Math.floor(perSecond * elapsedSec)));
    }, 1000);
    return () => window.clearInterval(id);
  }, [safeBase]);
  if (safeBase <= 0) return null;
  return (
    <div className="max-w-full overflow-hidden leading-tight">
      <p className="break-words text-[11px] font-black text-red-400 min-[380px]:text-[13px]">
        Mỗi giờ bạn ngồi yên = mất{' '}
        <span className="tabular-nums">{value.toLocaleString('vi-VN')}đ</span>
      </p>
      <p className="mt-1 text-[9px] text-[#f0ede8]/40 min-[380px]:text-[10px]">
        so với người cùng ngành đang negotiate đúng cách
      </p>
    </div>
  );
}

function PremiumDecisionPreview({
  job,
  salary,
  resultPercent,
  gapMonthly,
  targetLabel,
  benchmark,
  experience,
  workProvinceLabel,
}: {
  job: string;
  salary: number;
  resultPercent: number;
  gapMonthly: number;
  targetLabel: string;
  benchmark: BenchmarkMeta | null;
  experience: ExperienceLevel;
  workProvinceLabel: string;
}) {
  const preview = getPremiumRolePreview(job);
  const jobLabel = job.trim() || preview.roleLabel;
  const lockInfo = getUnlockedAndLockedPercentileTargets(resultPercent);
  const nextRungLabel = lockInfo.nextVisibleTarget ? `Top ${lockInfo.nextVisibleTarget}%` : null;
  const nextRungSalary = nextRungLabel ? getThreshold(benchmark, nextRungLabel) : null;
  const targetSalary = getThreshold(benchmark, targetLabel) || (gapMonthly > 0 ? salary + gapMonthly : 0) || nextRungSalary || getThreshold(benchmark, 'Top 50%');
  const yearsLabel = EXPERIENCE_META[experience].label.replace(/\s*năm\s*$/i, '');
  const currentSalaryText = salary > 0 ? fmtM(salary) : 'mức hiện tại';
  const targetSalaryText = targetSalary ? fmtM(targetSalary) : 'mốc benchmark';
  const isExecutiveRole = isExecutiveLevel(inferRoleLevelBand({ jobTitle: job, industry: benchmark?.industry }));
  const benefitText = isExecutiveRole ? 'bonus/equity/profit-sharing theo mandate' : 'bonus quý theo KPI hoặc ESOP';
  const handleUnlockScroll = () => {
    if (typeof window === 'undefined') return;
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  };

  return (
    <div className="overflow-hidden rounded-3xl border border-[#e8b84b]/35 bg-[#0f1219] shadow-2xl shadow-[#e8b84b]/5">
      <div className="border-b border-white/10 bg-[#161b26] px-5 py-4">
        <p className="text-[11px] font-mono font-black uppercase tracking-[0.18em] text-[#e8b84b]">
          📌 {isExecutiveRole ? 'Câu neo compensation package với owner/board' : 'Câu trả lời khi HR hỏi lương mong muốn'}
        </p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-[#f0ede8]/55">
          Calibrate theo <span className="font-semibold text-[#f0ede8]/80">{jobLabel}</span>
          {' · '}<span className="font-semibold text-[#f0ede8]/80">{yearsLabel} năm</span>
          {' · '}<span className="font-semibold text-[#f0ede8]/80">{workProvinceLabel}</span>
        </p>
      </div>

      <div className="space-y-3 p-5">
        <p className="text-[13px] leading-relaxed text-[#f0ede8]/85">
          Dựa trên benchmark thị trường hiện tại,{' '}
          <span className="font-semibold text-[#f0ede8]">{jobLabel}</span> tại{' '}
          <span className="font-semibold text-[#f0ede8]">{workProvinceLabel}</span> với{' '}
          <span className="font-semibold text-[#f0ede8]">{yearsLabel} năm</span> kinh nghiệm đang ở mức
        </p>

        <div className="relative">
          <p
            aria-hidden
            className="select-none text-[13px] leading-relaxed text-[#f0ede8]/85"
            style={{ filter: 'blur(6px)', WebkitUserSelect: 'none', userSelect: 'none' }}
          >
            <span className="font-black text-[#e8b84b]">{currentSalaryText}</span>. Với kinh nghiệm về{' '}
            <span className="font-semibold">{preview.coreSkill}</span> của tôi, mức tôi expect là{' '}
            <span className="font-black text-green-400">{targetSalaryText}</span> — {isExecutiveRole ? 'cần gắn với scope, authority và package bao gồm' : 'có thể thương lượng nếu package bao gồm'}{' '}
            <span className="font-semibold">{benefitText}</span>.
          </p>
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <button
              type="button"
              onClick={handleUnlockScroll}
              className="pointer-events-auto inline-flex items-center gap-2 rounded-full bg-[#e8b84b] px-5 py-2.5 text-[12px] font-black text-[#0a0c10] shadow-[0_8px_24px_rgba(232,184,75,0.35)] transition-all hover:-translate-y-0.5 hover:bg-[#f0c84b] active:scale-95"
            >
              <span aria-hidden>🔒</span>
              <span>Đọc câu đầy đủ · 29k</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function HrReadySalaryCard({
  fullName,
  job,
  salary,
  percent,
  benchmark,
  targetLabel,
  targetSalary,
  gapMonthly,
  experience,
  workProvinceLabel,
}: {
  fullName: string;
  job: string;
  salary: number;
  percent: number;
  benchmark: BenchmarkMeta | null;
  targetLabel: string;
  targetSalary: number;
  gapMonthly: number;
  experience: ExperienceLevel;
  workProvinceLabel: string;
}) {
  const preview = getPremiumRolePreview(job);
  const safeJob = repairMojibakeText(job.trim() || preview.roleLabel);
  const safeName = cleanSharedName(fullName) || 'Ứng viên';
  const experienceLabel = EXPERIENCE_META[experience].label;
  const currentTopLabel = formatPercentDisplay(percent);
  const targetTopLabel = formatTopPercentLabel(targetLabel);
  const safeTargetSalary = targetSalary > salary ? targetSalary : benchmark?.strategicTargetSalary || benchmark?.nextTargetSalary || salary;
  const safeGapMonthly = Math.max(0, gapMonthly || safeTargetSalary - salary);
  const confidenceScore = Math.max(0, Math.min(100, Math.round(benchmark?.confidenceScore ?? 72)));
  const confidenceText = benchmark?.confidenceLabel || 'Benchmark gần ngành';
  const targetText = safeTargetSalary > salary ? `${fmtM(safeTargetSalary)}/tháng` : 'mốc kế tiếp theo benchmark';
  const isExecutiveRole = isExecutiveLevel(inferRoleLevelBand({ jobTitle: job, industry: benchmark?.industry }));
  const proofItems = [
    isExecutiveRole ? 'Chuẩn bị operating dashboard: P&L/revenue impact, KPI vận hành, risk log và decision log.' : preview.firstAction,
    isExecutiveRole ? 'Viết board/owner update: scope đang chịu, mandate cần mở, bonus/equity/profit-sharing đề xuất.' : preview.cvBullet,
    isExecutiveRole ? 'Gắn bằng chứng với scope, operating authority và strategic outcome; ưu tiên số trước/sau và người xác nhận cấp owner/board.' : `Gắn bằng chứng với ${preview.coreSkill}; ưu tiên số trước/sau, file/link và phản hồi thật.`,
  ].filter(Boolean).slice(0, 3);
  const hrLine = isExecutiveRole
    ? `Dựa trên benchmark thị trường cho ${safeJob} tại ${workProvinceLabel}, mức hiện tại của tôi là ${fmtM(salary)}/tháng. Với scope, operating authority và strategic outcome tôi đang chịu trách nhiệm, tôi muốn trao đổi compensation package quanh ${targetText}, gồm base + bonus/equity/profit-sharing hoặc mandate lớn hơn.`
    : `Dựa trên benchmark thị trường cho ${safeJob} tại ${workProvinceLabel}, mức hiện tại của tôi là ${fmtM(salary)}/tháng. Với scope và bằng chứng tôi có thể chuẩn bị, tôi muốn trao đổi quanh ${targetText} và linh hoạt theo KPI/bonus.`;

  return (
    <section className="overflow-hidden rounded-3xl border border-[#e8b84b]/35 bg-[#0f1219] shadow-2xl shadow-[#e8b84b]/10">
      <div className="border-b border-[#e8b84b]/20 bg-[#161b26] px-5 py-4">
        <p className="text-[10px] font-mono font-black uppercase tracking-[0.18em] text-[#e8b84b]">{isExecutiveRole ? 'Executive Package Card' : 'HR-ready Salary Card'}</p>
        <h3 className="mt-1 text-lg font-black leading-tight text-[#f0ede8]">{isExecutiveRole ? 'Tóm tắt package 29k để trao đổi với owner/board' : 'Tóm tắt lương 29k để chụp gửi HR hoặc dùng khi deal'}</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-[#f0ede8]/55">
          Đây là ảnh tóm tắt: lương hiện tại, mốc kế tiếp, khoảng cách còn thiếu và độ tin cậy benchmark cho {safeJob}.
        </p>
      </div>

      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3 rounded-2xl border border-white/10 bg-[#0a0c10] p-4">
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-[#f0ede8]">{safeName}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-[#f0ede8]/55">
              {safeJob} · {experienceLabel} · {workProvinceLabel}
            </p>
          </div>
          <div className="shrink-0 rounded-2xl border border-[#e8b84b]/25 bg-[#e8b84b]/10 px-3 py-2 text-right">
            <p className="text-[9px] font-mono font-black uppercase tracking-wider text-[#f0ede8]/45">Hiện tại</p>
            <p className="text-lg font-black text-[#e8b84b]">{currentTopLabel}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Lương hiện tại', value: fmtSalaryCardValue(salary), unit: '/tháng', tone: 'text-[#f0ede8]' },
            { label: `Mốc ${targetTopLabel}`, value: safeTargetSalary > salary ? fmtSalaryCardValue(safeTargetSalary) : 'Mốc kế tiếp', unit: safeTargetSalary > salary ? '/tháng' : '', tone: 'text-[#e8b84b]' },
            { label: 'Khoảng cách', value: safeGapMonthly > 0 ? `+${fmtSalaryCardValue(safeGapMonthly)}` : 'Giữ lợi thế', unit: safeGapMonthly > 0 ? '/tháng' : '', tone: 'text-green-300' },
            { label: 'Độ tin cậy', value: `${confidenceScore}%`, unit: '', tone: 'text-[#f0ede8]' },
          ].map(item => (
            <div key={item.label} className="min-w-0 rounded-2xl border border-white/10 bg-[#161b26] p-3 text-left">
              <p className="text-[10px] font-bold leading-tight text-[#f0ede8]/42">{item.label}</p>
              <p className={`mt-1 break-words text-[17px] font-black leading-tight tabular-nums sm:text-[18px] ${item.tone}`}>{item.value}</p>
              {item.unit && <p className="mt-0.5 text-[9px] font-semibold leading-none text-[#f0ede8]/38">{item.unit}</p>}
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-[#e8b84b]/20 bg-[#e8b84b]/8 p-4">
          <p className="text-[10px] font-mono font-black uppercase tracking-widest text-[#e8b84b]">3 bằng chứng nên chuẩn bị</p>
          <div className="mt-3 space-y-2">
            {proofItems.map((item, index) => (
              <div key={`${index}-${item}`} className="flex items-start gap-2">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-green-400/15 text-[10px] font-black text-green-300">{index + 1}</span>
                <p className="text-[12px] leading-relaxed text-[#f0ede8]/82">{item}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#161b26] p-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[10px] font-mono font-black uppercase tracking-widest text-[#f0ede8]/45">{isExecutiveRole ? 'Câu neo owner/board' : 'Câu trả lời HR'}</p>
            <span className="rounded-full border border-[#e8b84b]/25 bg-[#e8b84b]/10 px-2 py-1 text-[9px] font-black text-[#e8b84b]">{confidenceText}</span>
          </div>
          <p className="text-[13px] font-semibold leading-relaxed text-[#f0ede8]/88">“{hrLine}”</p>
          <p className="mt-3 text-[10px] leading-relaxed text-[#f0ede8]/42">
            {isExecutiveRole ? 'Đây là thẻ tham chiếu, không phải cam kết package. Khi dùng thật, hãy thay bằng P&L, mandate và bằng chứng operating cụ thể.' : 'Đây là thẻ tham chiếu, không phải cam kết offer. Khi dùng thật, hãy thay bằng KPI và bằng chứng cụ thể của bạn.'}
          </p>
        </div>
      </div>
    </section>
  );
}

function ZaloSalaryAlertBox({
  job,
  city,
  percentile,
  salary,
  experience,
  marketLocation,
  workProvince,
}: {
  job: string;
  city: string;
  percentile: number;
  salary: number;
  experience: string;
  marketLocation: string;
  workProvince: string;
}) {
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const formStartedAt = useRef(Date.now());

  useEffect(() => {
    const applyPhone = (value: string) => {
      const clean = cleanSharedPhone(value);
      if (isValidSharedPhone(clean)) setPhone(clean);
    };
    applyPhone(readSharedPhone());
    const onSharedPhone = (event: Event) => applyPhone((event as CustomEvent<string>).detail || '');
    window.addEventListener(SHARED_PHONE_EVENT, onSharedPhone);
    return () => window.removeEventListener(SHARED_PHONE_EVENT, onSharedPhone);
  }, []);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleanPhone = cleanSharedPhone(phone);
    if (!isValidSharedPhone(cleanPhone)) {
      setStatus('error');
      return;
    }

    setStatus('submitting');
    try {
      const res = await fetch('/api/zalo-subscribers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: cleanPhone,
          job,
          city,
          percentile,
          salary,
          experience,
          market_location: marketLocation,
          work_province: workProvince,
          website,
          formStartedAt: formStartedAt.current,
        }),
      });
      if (!res.ok) throw new Error('subscribe_failed');
      setPhone(cleanPhone);
      saveSharedPhone(cleanPhone);
      setStatus('success');
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className="rounded-xl border border-[#ea580c] bg-[#7c2d00] p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 text-lg leading-none" aria-hidden="true">⚠️</span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-black text-white">Lương ngành bạn đang biến động</p>
          <p className="mt-1 text-[12px] leading-relaxed text-orange-100/80">
            Nhập Zalo để nhận cảnh báo sớm nhất khi dữ liệu Q2/2026 cập nhật — trước khi đồng nghiệp biết
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="mt-4 flex flex-col gap-2 sm:flex-row">
        <input
          className="hidden"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden="true"
          value={website}
          onChange={e => setWebsite(e.target.value)}
        />
        <input
          type="tel"
          inputMode="tel"
          value={phone}
          onChange={e => {
            const nextPhone = cleanSharedPhone(e.target.value);
            setPhone(nextPhone);
            saveSharedPhone(nextPhone);
          }}
          placeholder="Số điện thoại / Zalo"
          className="min-w-0 flex-1 rounded-xl border border-orange-300/25 bg-[#0a0c10]/55 px-4 py-3 text-base font-bold text-white outline-none transition-colors placeholder:text-orange-100/35 focus:border-orange-300"
        />
        <button
          type="submit"
          disabled={status === 'submitting'}
          className="rounded-xl bg-[#ea580c] px-4 py-3 text-sm font-black text-white transition-all hover:bg-[#f97316] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60 sm:whitespace-nowrap"
        >
          {status === 'submitting' ? 'Đang lưu...' : 'Nhận cảnh báo'}
        </button>
      </form>

      {status === 'success' && (
        <p className="mt-2 text-[11px] font-bold text-orange-100">Đã lưu Zalo. VSPI sẽ báo khi dữ liệu mới cập nhật.</p>
      )}
      {status === 'error' && (
        <p className="mt-2 text-[11px] font-bold text-orange-100">Chưa lưu được. Kiểm tra lại số Zalo hoặc thử lại sau.</p>
      )}
      <p className="mt-3 text-[10px] font-mono font-black uppercase tracking-wider text-orange-100/65">
        Cảnh báo sẽ được gửi khi benchmark nghề hoặc khu vực của bạn có cập nhật đáng chú ý
      </p>
    </div>
  );
}

const getGapData = (job: string, percent: number, dbData: SalaryData | null): GapData => {
  const j = job.toLowerCase();
  const top50 = dbData?.top_50 ?? 15_000_000;
  const top10 = dbData?.top_10 ?? top50 * 1.8;
  const base = {
    currentPays: fmtM(top50), topPays: fmtM(top10),
    roadmap: [
      { month: 'Tháng 1', action: 'Hoàn thành 1 khoá công cụ năng suất hiện đại thực hành (≤ 20h) — ưu tiên công cụ liên quan trực tiếp ngành.' },
      { month: 'Tháng 2', action: 'Áp dụng vào 1 quy trình thực tế, đo lường thời gian/chi phí tiết kiệm bằng số liệu cụ thể.' },
      { month: 'Tháng 3', action: 'Đưa kết quả đo được vào bản đánh giá năng lực cuối kỳ — dẫn nguồn VSPI khi đàm phán.' },
    ]
  };
  if (j.includes('kế toán') || j.includes('tài chính')) return {
    ...base,
    currentSkill: 'Duy trì sổ sách, đối soát thủ công, lập báo cáo định kỳ.',
    missingSkill: 'Tự động hoá báo cáo bằng Excel Copilot/Python — giảm 60% thời gian xử lý số liệu.',
    roadmap: [
      { month: 'Tháng 1', action: 'Hoàn thành khoá Excel Copilot + Power Query cơ bản (8–10h trực tuyến).' },
      { month: 'Tháng 2', action: 'Xây dashboard tự động 1 báo cáo đang làm thủ công, đo thời gian tiết kiệm.' },
      { month: 'Tháng 3', action: 'Trình bày với trưởng phòng — đề xuất tăng lương kèm số liệu tiết kiệm chi phí.' },
    ]
  };
  if (j.includes('marketing') || j.includes('content') || j.includes('seo')) return {
    ...base,
    currentSkill: 'Sản xuất nội dung thủ công, báo cáo kết quả theo cảm tính.',
    missingSkill: 'Scale content 5x bằng công cụ năng suất hiện đại + báo cáo ROI chính xác theo số — kỹ năng tách biệt Top 20% vs 80% còn lại.',
    roadmap: [
      { month: 'Tháng 1', action: 'Thiết lập quy trình content với công cụ năng suất hiện đại — tăng output không tăng giờ làm.' },
      { month: 'Tháng 2', action: 'Báo cáo kết quả A/B test + conversion rate theo số cụ thể lên cấp trên.' },
      { month: 'Tháng 3', action: 'Đề xuất tăng lương với dẫn chứng ROI đo được từ chiến dịch có hỗ trợ công cụ năng suất.' },
    ]
  };
  if (j.includes('nhân sự') || j.includes('hr') || j.includes('tuyển dụng')) return {
    ...base,
    currentSkill: 'Quản lý hành chính nhân sự, tuyển dụng theo quy trình thủ công.',
    missingSkill: 'People Analytics — dùng data để tư vấn chiến lược nhân sự cho C-level. Nhảy từ HR Ops lên HRBP.',
    roadmap: [
      { month: 'Tháng 1', action: 'Học Power BI cơ bản + xây dashboard headcount/turnover tự động.' },
      { month: 'Tháng 2', action: 'Trình bày 1 insight từ data nhân sự lên Ban Giám đốc — bước đầu positioning HRBP.' },
      { month: 'Tháng 3', action: 'Benchmark lương toàn công ty vs thị trường — xuất trình đề xuất điều chỉnh có data.' },
    ]
  };
  if (j.includes('giáo viên') || j.includes('giảng')) return {
    ...base,
    currentSkill: 'Dạy theo giáo án chuẩn, chấm bài thủ công, tư vấn học sinh theo kinh nghiệm.',
    missingSkill: 'Thiết kế và vận hành khoá học online — tạo thu nhập thụ động 5–15M/tháng song song lương chính.',
    roadmap: [
      { month: 'Tháng 1', action: 'Quay 5–10 video bài giảng ngắn (15–20 phút), dùng công cụ năng suất tóm tắt + tạo quiz.' },
      { month: 'Tháng 2', action: 'Đăng lên Edumall/Kyna/YouTube — đo lượng người xem và enrollment.' },
      { month: 'Tháng 3', action: 'Pitch với nhà trường: trở thành giáo viên phụ trách digital learning, yêu cầu phụ cấp.' },
    ]
  };
  return {
    ...base,
    currentSkill: 'Thực hiện công việc chuyên môn theo quy trình hiện tại, dựa vào kinh nghiệm tích luỹ.',
    missingSkill: 'Tự động hoá ≥ 1 quy trình thủ công bằng công cụ năng suất hiện đại — tạo chỉ số "tiết kiệm X giờ/tuần" cụ thể để đàm phán.',
  };
};

/* ═══ DATA SOURCE MODAL ═════════════════════════════════════════════════════ */
function DataSourceModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#0f1219] border border-white/20 rounded-3xl p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-mono font-black text-[#e8b84b] uppercase tracking-widest">Phương pháp tính</h3>
          <button onClick={onClose} className="text-[#f0ede8]/45 hover:text-[#f0ede8] text-lg leading-none">✕</button>
        </div>
        <div className="space-y-3 text-[11px] text-[#f0ede8]/70 leading-relaxed">
          <p><strong className="text-[#f0ede8]">Nguồn dữ liệu chính:</strong></p>
          <ul className="list-disc pl-4 space-y-1.5">
            <li><strong className="text-[#f0ede8]">NSO/GSO Q3/2025:</strong> Bối cảnh lực lượng lao động 53.3 triệu người và thu nhập bình quân 8.4 triệu đồng/tháng.</li>
            <li><strong className="text-[#f0ede8]">Adecco Vietnam Salary Guide 2026:</strong> 13th edition, 1,000+ job titles tại Hà Nội và TP.HCM.</li>
            <li><strong className="text-[#f0ede8]">ManpowerGroup, Reeracoen, PERSOLKELLY, Michael Page, Robert Walters:</strong> Salary guide theo ngành, cấp bậc và khu vực.</li>
            <li><strong className="text-[#f0ede8]">VietnamWorks/Navigos, TopCV, CareerViet, ITviec:</strong> Tín hiệu tuyển dụng, survey ứng viên/nhà tuyển dụng và benchmark theo vai trò.</li>
            <li><strong className="text-[#f0ede8]">Talentnet–Mercer:</strong> Tham chiếu total remuneration ở nhóm doanh nghiệp lớn, quản lý và executive.</li>
          </ul>
          <p className="border-t border-white/10 pt-3"><strong className="text-[#f0ede8]">Phương pháp tính percentile:</strong> VSPI ưu tiên benchmark trực tiếp theo nghề/khu vực/cấp kinh nghiệm. Khi dữ liệu trực tiếp chưa đủ, hệ thống dùng benchmark gần ngành, nội suy phân vị và confidence score để báo rõ mức độ tin cậy. Kết quả là ước tính tham chiếu, không phải xếp hạng tuyệt đối trong toàn bộ lực lượng lao động.</p>
        </div>
        <button onClick={onClose} className="mt-4 w-full bg-[#161b26] border border-white/10 text-[#f0ede8]/70 text-[11px] font-mono py-2.5 rounded-xl hover:border-[#e8b84b]/30 transition-colors">Đóng</button>
      </div>
    </div>
  );
}

/* ═══ SHARE CARD ════════════════════════════════════════════════════════════ */
function PercentileLadderCard({ benchmark, percent, salary, unlocked = false }: { benchmark: BenchmarkMeta | null; percent: number; salary: number; unlocked?: boolean }) {
  const lockInfo = getUnlockedAndLockedPercentileTargets(percent);
  const opportunity = getStrategicOpportunity(benchmark, salary, percent);
  const strategicTopNumber = getTopPercentNumber(opportunity.label);
  const fallback = [
    'Top 100%', 'Top 80%', 'Top 70%', 'Top 60%', 'Top 50%',
    'Top 40%', 'Top 30%', 'Top 20%', 'Top 10%', 'Top 5%', 'Top 1%',
  ].map(label => {
    const topNumber = getTopPercentNumber(label);
    return { label, salary: null, locked: lockInfo.locked.includes(topNumber), active: topNumber === lockInfo.userRung };
  });
  const baseRows = benchmark?.thresholdPreview?.length ? benchmark.thresholdPreview : fallback;
  // Re-derive locked/active from the user's actual tier — backend values may use stale rules.
  const rows = baseRows.map(row => {
    const topNumber = getTopPercentNumber(row.label);
    const isStrategicTarget = topNumber > 0 && topNumber === strategicTopNumber;
    return {
      ...row,
      salary: row.salary || (isStrategicTarget ? opportunity.targetSalary : null),
      locked: unlocked ? false : isStrategicTarget ? false : lockInfo.locked.includes(topNumber),
      active: topNumber === lockInfo.userRung,
      strategic: isStrategicTarget,
    };
  });
  const nextTarget = !lockInfo.isEliteZone && benchmark?.nextTargetSalary ? fmtM(benchmark.nextTargetSalary) : null;
  const hasBandProgress = Boolean(
    benchmark?.nextBandLabel &&
    benchmark.nextBandSalary &&
    benchmark.nextBandGap !== null &&
    benchmark.nextBandGap !== undefined &&
    benchmark.bandProgressPct !== null &&
    benchmark.bandProgressPct !== undefined
  );

  return (
    <div className="bg-[#0f1219] border border-white/10 rounded-3xl p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-[10px] font-mono font-black text-[#e8b84b] uppercase tracking-widest">Thang Top % thu nhập</p>
          <p className="text-[11px] text-[#f0ede8]/45 mt-1">Top % là vị trí trong nhóm nghề, kinh nghiệm và khu vực đã chọn. Số càng nhỏ càng cao: Top 20% cao hơn Top 50%, Top 80% là vùng thấp hơn median chứ không phải nhóm dẫn đầu.</p>
        </div>
        {nextTarget && (
          <div className="text-right shrink-0">
            <p className="text-[9px] text-[#f0ede8]/35 uppercase font-mono">Mốc kế tiếp</p>
            <p className="text-sm font-black text-green-400">{nextTarget}/tháng</p>
          </div>
        )}
      </div>
      {hasBandProgress && (
        <div className="mb-4 rounded-2xl border border-[#e8b84b]/20 bg-[#e8b84b]/8 px-3 py-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-[10px] font-mono font-black uppercase tracking-wider text-[#e8b84b]">
              {benchmark?.currentBandLabel} → {benchmark?.nextBandLabel}
            </p>
            <p className="text-[10px] font-mono font-black text-[#f0ede8]/70">{benchmark?.bandProgressPct}%</p>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#0a0c10]">
            <div className="h-full rounded-full bg-[#e8b84b]" style={{ width: `${Math.max(5, benchmark?.bandProgressPct ?? 0)}%` }} />
          </div>
          <p className="mt-2 text-[10.5px] leading-4 text-[#f0ede8]/62">
            {benchmark?.bandProgressText} Còn thiếu <strong className="text-[#e8b84b]">{fmtM(benchmark?.nextBandGap)}/tháng</strong> để chạm mốc <strong className="text-[#f0ede8]">{benchmark?.nextBandLabel}</strong> ({fmtM(benchmark?.nextBandSalary)}/tháng).
          </p>
        </div>
      )}
      <div className="space-y-2">
        {rows.map((row) => {
          const topNumber = getTopPercentNumber(row.label);
          const label = formatTopPercentLabel(row.label);
          const cell = formatBenchmarkCell({
            accessLevel: unlocked ? 'paid29' : 'free',
            value: row.salary,
            label: benchmarkLabelKey(row.label),
          });
          if (row.locked) {
            return (
              <div key={row.label} className="flex items-center gap-3 rounded-xl px-3 py-2 border bg-[#161b26] border-white/8">
                <div className="flex items-center gap-3 flex-1 min-w-0 opacity-20">
                  <div className="w-2.5 h-2.5 rounded-full shrink-0 bg-[#f0ede8]/55" />
                  <p className="text-xs font-mono font-black w-20 text-[#f0ede8]">{label}</p>
                </div>
                <div className="flex flex-col items-end min-w-[64px]">
                  <p aria-hidden className="text-[11px] font-mono font-black text-[#f0ede8]/40" style={{ filter: 'blur(3px)' }}>██.█M</p>
                  <p className="text-[9px] font-mono uppercase tracking-wider text-[#e8b84b]/85 mt-0.5">Premium</p>
                </div>
              </div>
            );
          }
          return (
          <div key={row.label} className={`flex items-center gap-3 rounded-xl px-3 py-2 border transition-colors ${
            row.active ? 'bg-[#e8b84b]/12 border-[#e8b84b]/45' :
            row.strategic ? 'bg-green-400/10 border-green-400/35' :
            'bg-[#161b26] border-white/8'
          }`}>
            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${row.active ? 'bg-[#e8b84b]' : 'bg-[#f0ede8]/18'}`} />
            <p className={`text-xs font-mono font-black w-20 ${row.active ? 'text-[#e8b84b]' : row.strategic ? 'text-green-300' : 'text-[#f0ede8]/55'}`}>{label}</p>
            <div className="flex-1 h-1.5 bg-[#0a0c10] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${row.active ? 'bg-[#e8b84b]' : row.strategic ? 'bg-green-400' : 'bg-[#f0ede8]/14'}`}
                style={{ width: `${Math.max(12, 100 - topNumber)}%` }}
              />
            </div>
            <p className={`text-[11px] font-mono min-w-[64px] text-right text-[#f0ede8]/55`}>
              {cell.state === 'missing' ? (
                <span className="block min-w-[128px] max-w-[150px] whitespace-normal text-[9px] font-sans font-bold leading-tight text-[#e8b84b]/78">
                  {cell.text}
                </span>
              ) : cell.text}
            </p>
          </div>
        );
        })}
      </div>
      <p className="text-[10px] text-[#f0ede8]/35 leading-relaxed mt-3">
        {unlocked ? 'Báo cáo lương 29K đã mở: toàn bộ mốc lương dùng được để đối chiếu khi deal lương hoặc apply.' : 'Dấu % rất quan trọng: Top 80% nghĩa là bạn đang ở vùng thấp của nhóm nghề/khu vực/kinh nghiệm này. Mục tiêu gần nhất là lên Top 70%, Top 60% hoặc Top 50%, không phải bạn thuộc nhóm thu nhập cao nhất.'}
      </p>
    </div>
  );
}

function ExperienceSalaryBandsCard({
  benchmark,
  currentExperience,
  salary,
  percent,
  unlocked = false,
}: {
  benchmark: BenchmarkMeta | null;
  currentExperience: ExperienceLevel;
  salary: number;
  percent: number;
  unlocked?: boolean;
}) {
  const top50 = getThreshold(benchmark, 'Top 50%');
  if (!benchmark || !top50) return null;

  const currentMultiplier = EXPERIENCE_META[currentExperience].multiplier;
  const scaleFromCurrent = (value: number, exp: ExperienceLevel) =>
    Math.round((value / currentMultiplier) * EXPERIENCE_META[exp].multiplier / 500_000) * 500_000;
  const opportunity = getStrategicOpportunity(benchmark, salary, percent);
  const lockInfo = getUnlockedAndLockedPercentileTargets(percent);
  const ladder = [...PERCENTILE_LADDER];
  const currentLabel = `Top ${lockInfo.userRung}%`;
  const opportunityTop = getTopPercentNumber(opportunity.label);
  const nextHigherLabel = ladder
    .filter(rung => rung < (opportunityTop || lockInfo.userRung))
    .map(rung => `Top ${rung}%`)[0];
  const tierLabels = [currentLabel, opportunity.label, nextHigherLabel]
    .filter((label): label is string => Boolean(label))
    .filter((label, index, arr) => arr.indexOf(label) === index)
    .slice(0, 3);
  const tierFallbackSalary = (label: string) => {
    const top = getTopPercentNumber(label);
    if (top === opportunityTop && opportunity.targetSalary > 0) return opportunity.targetSalary;
    const lowerAnchor = getThreshold(benchmark, 'Top 20%') ?? top50 * 1.45;
    if (top === 10) return Math.max(lowerAnchor * 1.25, salary * 1.12);
    if (top === 5) return Math.max(lowerAnchor * 1.45, salary * 1.2);
    if (top === 1) return Math.max(lowerAnchor * 1.8, salary * 1.35);
    if (top === 30) return getThreshold(benchmark, 'Top 30%') ?? top50 * 1.2;
    if (top === 20) return lowerAnchor;
    if (top === 40) return getThreshold(benchmark, 'Top 40%') ?? top50 * 1.1;
    return top50;
  };

  return (
    <div className="bg-[#0f1219] border border-[#e8b84b]/18 rounded-3xl p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-mono font-black uppercase tracking-widest text-[#e8b84b]">Band lương theo kinh nghiệm</p>
          <p className="mt-1 text-[11px] leading-4 text-[#f0ede8]/45">
            Bạn đang so theo mốc <strong className="text-[#f0ede8]">{EXPERIENCE_META[currentExperience].label}</strong>, không phải mặt bằng chung mọi cấp.
          </p>
        </div>
        <div className="shrink-0 rounded-xl border border-green-400/20 bg-green-400/10 px-2.5 py-2 text-right">
          <p className="text-[9px] font-mono uppercase text-[#f0ede8]/35">Mục tiêu</p>
          <p className="text-xs font-black text-green-300">{opportunity.label}</p>
        </div>
      </div>

      <div className="space-y-2">
        {(unlocked ? EXPERIENCE_ORDER : EXPERIENCE_ORDER.filter(exp => exp === currentExperience)).map(exp => {
          const meta = EXPERIENCE_META[exp];
          const tiers: [string, number][] = tierLabels.map(label => {
            const rawValue = getThreshold(benchmark, label) || tierFallbackSalary(label);
            return [label, scaleFromCurrent(rawValue, exp)];
          });
          return (
            <div
              key={exp}
              className="rounded-2xl border border-[#e8b84b]/45 bg-[#e8b84b]/10 px-3 py-3"
            >
              <div className="mb-2 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-[#e8b84b]">{meta.label}</p>
                  <p className="text-[9px] text-[#f0ede8]/35">{meta.short} · {meta.tone}</p>
                </div>
                <span className="rounded-full border border-[#e8b84b]/30 px-2 py-1 text-[9px] font-black text-[#e8b84b]">Bạn chọn</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {tiers.map(([label, value]) => {
                  const topNumber = getTopPercentNumber(label);
                  const isStrategicTarget = topNumber > 0 && topNumber === opportunityTop;
                  const isTierLocked = !unlocked && !isStrategicTarget && lockInfo.locked.includes(topNumber);
                  return (
                    <div key={label} className={`rounded-xl border px-2 py-2 ${
                      isStrategicTarget ? 'border-green-400/30 bg-green-400/10' :
                      isTierLocked ? 'border-[#e8b84b]/15 bg-[#0a0c10]/65' :
                      'border-white/6 bg-[#0a0c10]/45'
                    }`}>
                      <p className={`text-[9px] font-mono ${isStrategicTarget ? 'text-green-300' : 'text-[#f0ede8]/35'}`}>{label}</p>
                      {isTierLocked ? (
                        <p aria-hidden className="text-[11px] font-black text-[#f0ede8]/55" style={{ filter: 'blur(3.5px)' }}>██.█M</p>
                      ) : (
                        <p className={`text-[11px] font-black ${isStrategicTarget ? 'text-green-300' : 'text-[#f0ede8]'}`}>{fmtM(Number(value))}</p>
                      )}
                      {isTierLocked && (
                        <p className="mt-0.5 text-[8.5px] font-mono uppercase tracking-wider text-[#e8b84b]/85">Premium</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {!unlocked ? (
        <p className="mt-3 rounded-xl border border-white/8 bg-[#0a0c10]/55 px-3 py-2 text-[10.5px] leading-4 text-[#f0ede8]/55">
          🔒 Các band lương cho cấp khác ({EXPERIENCE_ORDER.filter(e => e !== currentExperience).map(e => EXPERIENCE_META[e].label).join(' / ')}) chỉ hiện khi mở khóa báo cáo lương 29K.
        </p>
      ) : (
        <p className="mt-3 rounded-xl border border-green-400/15 bg-green-400/8 px-3 py-2 text-[10.5px] leading-4 text-green-100/80">
          ✓ Báo cáo lương 29K đã mở: hiển thị đủ cả 0-2 năm, 3-5 năm và trên 5 năm để bạn so vị trí hiện tại với nấc kế tiếp.
        </p>
      )}

      <p className="mt-3 rounded-xl border border-cyan-400/15 bg-cyan-400/8 px-3 py-2 text-[11px] leading-4 text-cyan-100">
        Với mức hiện tại {fmtM(salary)}, headline đúng phải là khoảng cách tới <strong>{opportunity.label}</strong>
        {opportunity.targetSalary ? <> khoảng <strong>{fmtM(opportunity.targetSalary)}/tháng</strong></> : null}
        {opportunity.gapMonthly > 0 ? <>: còn thiếu <strong>{fmtM(opportunity.gapMonthly)}/tháng</strong>.</> : '.'}
      </p>
    </div>
  );
}

function IncomeBasisNotice({ incomeType }: { incomeType: IncomeType }) {
  const meta = INCOME_TYPE_META[incomeType];
  const strongWarning = incomeType !== 'gross';

  return (
    <div className={`rounded-xl border px-3 py-2 text-left ${strongWarning ? 'border-[#e8b84b]/25 bg-[#e8b84b]/8' : 'border-white/8 bg-[#0a0c10]/45'}`}>
      <p className="text-[9px] font-mono uppercase tracking-wider text-[#f0ede8]/35">Cách đọc lương</p>
      <p className={`mt-0.5 text-[10px] leading-4 ${strongWarning ? 'text-[#f5d78a]/85' : 'text-[#f0ede8]/52'}`}>
        <strong className="text-[#f0ede8]">{meta.short}:</strong> {meta.note}
      </p>
    </div>
  );
}

function RealDataPanel({ paidCount, dailyViews }: { paidCount: number; dailyViews: number }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-[#0f1219] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black text-[#e8b84b]">Số liệu từ hệ thống</p>
          <h3 className="mt-1 text-base font-black text-[#f0ede8]">Benchmark và lượt dùng được cập nhật liên tục.</h3>
        </div>
        <span className="rounded-full border border-[#e8b84b]/30 bg-[#e8b84b]/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-[#e8b84b]">
          Live
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-[#f0ede8]/62">
        VSPI chỉ hiển thị phản hồi khi người dùng cho phép trích dẫn. Các con số bên dưới lấy trực tiếp
        100% lấy từ dữ liệu thật trong hệ thống: lượt mở khóa, lượt quét hôm nay và phản hồi hỗ trợ khách hàng.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-white/10 bg-[#161b26] px-3 py-3">
          <p className="text-[10px] font-bold text-[#f0ede8]/35">Đã mở khóa</p>
          <p className="mt-1 text-lg font-black text-[#e8b84b]">{paidCount.toLocaleString('vi-VN')}</p>
          <p className="text-[10px] text-[#f0ede8]/42">theo dữ liệu thật</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#161b26] px-3 py-3">
          <p className="text-[10px] font-bold text-[#f0ede8]/35">Scan hôm nay</p>
          <p className="mt-1 text-lg font-black text-[#f0ede8]">{dailyViews.toLocaleString('vi-VN')}</p>
          <p className="text-[10px] text-[#f0ede8]/42">theo dữ liệu thật</p>
        </div>
      </div>
    </div>
  );
}

function JobJumpMapTeaser({ job, salary, percent, unlocked, industry }: { job: string; salary: number; percent: number; unlocked: boolean; industry?: string | null }) {
  if (!job || salary <= 0) return null;
  const map = repairMojibakeDeep(buildJobJumpMap(job, salary, percent, industry)) as ReturnType<typeof buildJobJumpMap>;
  const firstRole = map.targetRoles[0];
  const extraRoles = map.targetRoles.slice(1);

  return (
    <div className="bg-[#0f1219] border border-[#e8b84b]/25 rounded-3xl p-5 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-[#e8b84b]/8 rounded-full blur-3xl pointer-events-none" />
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-[10px] font-mono font-black text-[#e8b84b] uppercase tracking-widest">Bản đồ role trả cao hơn</p>
            <h3 className="text-base font-black text-[#f0ede8] mt-1 leading-tight">{map.headline}</h3>
          </div>
          <span className="shrink-0 text-[9px] font-mono font-black text-[#0a0c10] bg-[#e8b84b] px-2 py-1 rounded-full">
            {unlocked ? 'Đã mở khóa' : 'Premium'}
          </span>
        </div>

        <div className="bg-[#161b26] border border-white/10 rounded-2xl p-4 mb-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-black text-[#f0ede8]">{firstRole.title}</p>
              <p className="text-[11px] text-[#f0ede8]/50 leading-relaxed mt-1">{firstRole.why}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-[9px] text-[#f0ede8]/35 font-mono uppercase">Target</p>
              <p className="text-sm font-black text-green-400">{fmtM(firstRole.targetSalary)}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-3">
            {firstRole.keywords.slice(0, 4).map(keyword => (
              <span key={keyword} className="text-[9px] font-mono text-[#e8b84b] bg-[#e8b84b]/10 border border-[#e8b84b]/20 rounded-full px-2 py-1">
                {keyword}
              </span>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          {extraRoles.map(role => (
            <div key={role.title} className="relative bg-[#161b26] border border-white/8 rounded-2xl px-4 py-3 overflow-hidden">
              {unlocked ? (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-bold text-[#f0ede8]/70">{role.title}</p>
                      <p className="text-[10px] text-[#f0ede8]/40 mt-1">{role.why}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-[8px] text-[#f0ede8]/30 font-mono uppercase">Target</p>
                      <p className="text-xs font-black text-green-400">{fmtM(role.targetSalary)}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {role.keywords.slice(0, 4).map(keyword => (
                      <span key={keyword} className="text-[9px] font-mono text-[#e8b84b] bg-[#e8b84b]/10 border border-[#e8b84b]/20 rounded-full px-2 py-1">
                        {keyword}
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <div className="select-none pointer-events-none opacity-25">
                  <p className="text-sm font-bold text-[#f0ede8]/70">Hướng tăng lương tiếp theo</p>
                  <p className="text-[10px] text-[#f0ede8]/40 mt-1">
                    Mở khóa để xem thêm job nên chuyển sang, từ khóa cần học và mức lương mục tiêu.
                  </p>
                </div>
              )}
              {!unlocked && (
                <div className="absolute inset-0 flex items-center justify-center bg-[#161b26]/35">
                  <span className="text-[10px] font-mono font-black text-[#e8b84b] bg-[#0f1219]/90 border border-[#e8b84b]/25 rounded-full px-3 py-1.5">
                    Mở khóa 29k để xem đủ hướng
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>

        <p className="text-[10px] text-[#f0ede8]/35 leading-relaxed mt-3">
          {unlocked
            ? 'Bạn đã mở đủ các hướng đổi role/xin tăng lương. Bước đồng hành 79K biến các hướng này thành việc thực thi từng tuần.'
            : 'Premium mở thêm từ khóa nên tìm khi apply, bullet CV và câu trả lời mức lương mong muốn. Sau khi mở 29K mới hiện bước đồng hành tiếp theo.'}
        </p>
      </div>
    </div>
  );
}

function ShareButton({ percent, job, benchmark }: { percent: number; job: string; benchmark: BenchmarkMeta | null }) {
  const [sharing, setSharing] = useState(false);
  const shareJobLabel = job.slice(0, 42);

  const generateAndShare = useCallback(async () => {
    setSharing(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1200;
      canvas.height = 630;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Background
      ctx.fillStyle = '#0a0c10';
      ctx.fillRect(0, 0, 1200, 630);

      // Gold accent bar top
      ctx.fillStyle = '#e8b84b';
      ctx.fillRect(0, 0, 1200, 6);

      // Logo text
      ctx.fillStyle = '#e8b84b';
      ctx.font = 'bold 28px monospace';
      ctx.fillText('VSPI SCANNER', 80, 80);

      ctx.fillStyle = 'rgba(240,237,232,0.45)';
      ctx.font = '18px monospace';
      ctx.fillText('Vietnam Salary Percentile Index 2026', 80, 112);

      // Big percent
      ctx.fillStyle = getRingColor(percent);
      ctx.font = 'bold 180px serif';
      ctx.textAlign = 'center';
      ctx.fillText(`Top ${percent}%`, 600, 360);

      // Subtitle
      ctx.fillStyle = 'rgba(240,237,232,0.8)';
      ctx.font = '36px sans-serif';
      ctx.fillText('thu nhập tại Việt Nam', 600, 420);

      // Name & job
      if (job) {
        ctx.fillStyle = '#e8b84b';
        ctx.font = 'bold 28px sans-serif';
        ctx.fillText(shareJobLabel, 600, 480);
      }

      ctx.fillStyle = '#e8b84b';
      ctx.font = 'bold 24px sans-serif';
      ctx.fillText(`Confidence ${benchmark?.confidenceScore ?? '?'}${benchmark ? '/100' : ''}`, 600, 505);

      ctx.fillStyle = 'rgba(240,237,232,0.45)';
      ctx.font = '18px sans-serif';
      ctx.fillText('No personal salary shown', 600, 535);

      // Footer
      ctx.fillStyle = 'rgba(240,237,232,0.3)';
      ctx.font = '20px monospace';
      ctx.fillText('topluong.com', 600, 580);

      // Border
      ctx.strokeStyle = 'rgba(232,184,75,0.3)';
      ctx.lineWidth = 3;
      ctx.strokeRect(20, 20, 1160, 590);

      canvas.toBlob(async (blob) => {
        if (!blob) return;
        trackEvent('share_clicked', {
          percent,
          confidence_score: benchmark?.confidenceScore,
          match_type: benchmark?.matchType,
        });
        const shareUrl = buildResultShareUrl('share', percent, job, benchmark);
        const shareText = `Tôi đang ở Top ${percent}% thu nhập tại Việt Nam. Ảnh chia sẻ này không hiển thị lương cá nhân.`;

        if (navigator.share && navigator.canShare({ files: [new File([blob], 'vspi-result.png', { type: 'image/png' })] })) {
          await navigator.share({ title: 'Kết quả Top Lương', text: shareText, url: shareUrl, files: [new File([blob], 'vspi-result.png', { type: 'image/png' })] });
        } else {
          const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}&quote=${encodeURIComponent(shareText)}`;
          window.open(fbUrl, '_blank', 'width=600,height=400');
        }
        setSharing(false);
      }, 'image/png');
    } catch {
      setSharing(false);
    }
  }, [percent, job, benchmark, shareJobLabel]);

  return (
    <button
      onClick={generateAndShare}
      disabled={sharing}
      className="w-full flex items-center justify-center gap-2 bg-[#161b26] border border-white/15 text-[#f0ede8] font-bold py-3.5 rounded-xl text-sm hover:border-[#e8b84b]/40 hover:bg-[#1a2030] transition-all disabled:opacity-60"
    >
      {sharing ? (
        <><div className="w-4 h-4 border-2 border-[#e8b84b] border-t-transparent rounded-full animate-spin" /> Đang tạo ảnh...</>
      ) : (
        <><span>📤</span> Chia sẻ kết quả</>
      )}
    </button>
  );
}

type ResultSharePlatform = 'facebook' | 'zalo' | 'messenger' | 'x' | 'threads' | 'instagram';

const RESULT_SHARE_PLATFORMS: Array<{ id: ResultSharePlatform; label: string }> = [
  { id: 'facebook', label: 'Facebook' },
  { id: 'zalo', label: 'Zalo' },
  { id: 'messenger', label: 'Messenger' },
  { id: 'x', label: 'X' },
  { id: 'threads', label: 'Threads' },
  { id: 'instagram', label: 'Instagram' },
];

const RESULT_SHARE_BASE_URL = 'https://topluong.com';

function buildResultShareUrl(
  platform: string,
  percent: number,
  job: string,
  benchmark?: BenchmarkMeta | null,
  vspiId?: string
) {
  const params = new URLSearchParams({
    utm_source: platform,
    utm_medium: 'result_share',
    pct: String(percent),
    job,
    confidence: String(benchmark?.confidenceScore ?? 78),
    v: 'card-v4',
  });

  if (benchmark?.rankEstimate) {
    params.set('rank', `#${benchmark.rankEstimate.toLocaleString('vi-VN')}`);
  }
  if (vspiId) {
    params.set('vspi', vspiId);
  }

  return `${RESULT_SHARE_BASE_URL}/share?${params.toString()}`;
}

function ResultShareIcon({ platform }: { platform: ResultSharePlatform }) {
  const iconClass = "h-5 w-5 text-white";
  if (platform === 'facebook') {
    return (
      <svg viewBox="0 0 24 24" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M14.2 8.1h2.1V4.6c-.4-.1-1.6-.2-3-.2-3 0-5 1.8-5 5.1v2.9H5v3.9h3.3v7.3h4.1v-7.3h3.2l.5-3.9h-3.7V9.9c0-1.1.3-1.8 1.8-1.8Z" />
      </svg>
    );
  }
  if (platform === 'zalo') {
    return <span className="text-[11px] font-black leading-none text-white">Zalo</span>;
  }
  if (platform === 'messenger') {
    return (
      <svg viewBox="0 0 24 24" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M12 2.4c-5.6 0-9.9 4-9.9 9.4 0 3 1.3 5.6 3.5 7.3v3.5l3.2-1.8c1 .3 2 .5 3.2.5 5.6 0 9.9-4 9.9-9.4S17.6 2.4 12 2.4Zm1 12.6-2.5-2.7-5 2.7 5.5-5.9 2.6 2.7 4.9-2.7L13 15Z" />
      </svg>
    );
  }
  if (platform === 'x') {
    return (
      <svg viewBox="0 0 24 24" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M13.9 10.5 21.2 2h-1.7l-6.3 7.3L8.1 2H2.3l7.7 11-7.7 9h1.7l6.8-7.9 5.4 7.9H22l-8.1-11.5Zm-2.4 2.8-.8-1.1L4.5 3.3h2.8l5 7.2.8 1.1 6.5 9.2h-2.8l-5.3-7.5Z" />
      </svg>
    );
  }
  if (platform === 'threads') {
    return (
      <svg viewBox="0 0 24 24" className={iconClass} aria-hidden="true">
        <path fill="currentColor" d="M12.2 2C6.2 2 3 5.8 3 12.1 3 18.3 6.2 22 12.1 22c5.1 0 8.2-2.8 8.2-7 0-3.1-1.7-5.1-4.9-5.9-.8-2.2-2.5-3.5-5-3.5-2.3 0-4 1.1-5 3.1l2.2 1.1c.6-1.2 1.5-1.8 2.8-1.8 1.2 0 2 .5 2.5 1.6h-.6c-3.5 0-5.5 1.5-5.5 4.1 0 2.4 1.8 4 4.5 4 3 0 4.7-1.7 4.8-4.7 1.2.6 1.8 1.6 1.8 3 0 2.6-2.2 4.3-5.7 4.3-4.6 0-6.8-2.8-6.8-8.1 0-5.4 2.2-8.2 6.8-8.2 3.3 0 5.3 1.4 6.2 4.2l2.3-.6C19.5 3.8 16.6 2 12.2 2Zm-.8 13.4c-1.3 0-2.1-.6-2.1-1.7 0-1.2 1-1.9 3-1.9.5 0 1 0 1.4.1v.9c0 1.7-.8 2.6-2.3 2.6Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={iconClass} aria-hidden="true">
      <path fill="none" stroke="currentColor" strokeWidth="2" d="M7.5 2.8h9A4.7 4.7 0 0 1 21.2 7.5v9a4.7 4.7 0 0 1-4.7 4.7h-9a4.7 4.7 0 0 1-4.7-4.7v-9a4.7 4.7 0 0 1 4.7-4.7Z" />
      <path fill="none" stroke="currentColor" strokeWidth="2" d="M8.4 12a3.6 3.6 0 1 0 7.2 0 3.6 3.6 0 0 0-7.2 0Z" />
      <circle cx="17.4" cy="6.6" r="1.2" fill="currentColor" />
    </svg>
  );
}

function buildResultShareText(percent: number, job: string) {
  const jobLabel = job.trim() || 'của tôi';
  return `Tôi vừa scan lương — đang ở Top ${percent}%
thu nhập Việt Nam ngành ${jobLabel}.
Bạn đang ở Top mấy %? → topluong.com`;
}

async function copyShareText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

function ResultSocialShare({
  percent,
  job,
  benchmark,
  vspiId,
  onShowToast,
}: {
  percent: number;
  job: string;
  benchmark?: BenchmarkMeta | null;
  vspiId?: string;
  onShowToast: (msg: string, type: 'error' | 'success' | 'info') => void;
}) {
  const handleShare = useCallback(async (platform: ResultSharePlatform) => {
    const shareText = buildResultShareText(percent, job);
    const shareUrl = buildResultShareUrl(platform, percent, job, benchmark, vspiId);
    const encodedText = encodeURIComponent(shareText);
    const encodedUrl = encodeURIComponent(shareUrl);

    trackEvent('result_social_share_clicked', {
      platform,
      percent,
      job,
    });

    try {
      if (platform === 'instagram') {
        await copyShareText(shareText);
        window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer');
        onShowToast('Đã copy nội dung share. Dán vào Instagram để đăng.', 'success');
        return;
      }

      if (platform === 'zalo' || platform === 'messenger') {
        if (navigator.share) {
          await navigator.share({ title: 'Kết quả Top Lương', text: shareText, url: shareUrl });
          return;
        }
        await copyShareText(`${shareText}\n${shareUrl}`);
        onShowToast(`Đã copy nội dung share. Dán vào ${platform === 'zalo' ? 'Zalo' : 'Messenger'} để gửi.`, 'success');
        return;
      }

      const platformUrls: Record<Exclude<ResultSharePlatform, 'instagram' | 'zalo' | 'messenger'>, string> = {
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`,
        x: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
        threads: `https://www.threads.com/intent/post?text=${encodeURIComponent(`${shareText}\n${shareUrl}`)}`,
      };

      window.open(platformUrls[platform], '_blank', 'noopener,noreferrer,width=640,height=640');
    } catch {
      try {
        if (navigator.share) {
          await navigator.share({ title: 'Kết quả Top Lương', text: shareText, url: shareUrl });
        } else {
          await copyShareText(`${shareText}\n${shareUrl}`);
          onShowToast('Đã copy nội dung share.', 'success');
        }
      } catch {
        onShowToast('Chưa share được. Thử lại sau nhé.', 'error');
      }
    }
  }, [benchmark, job, onShowToast, percent, vspiId]);

  return (
    <div className="mt-1 mb-5">
      <p className="mb-2 text-center text-[11px] text-[#f0ede8]/45">Chia sẻ kết quả của bạn</p>
      <div className="flex items-center justify-center gap-2">
        {RESULT_SHARE_PLATFORMS.map(platform => (
          <button
            key={platform.id}
            type="button"
            onClick={() => handleShare(platform.id)}
            aria-label={`Chia sẻ qua ${platform.label}`}
            title={platform.label}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0f1219] text-white ring-1 ring-white/10 transition-all hover:-translate-y-0.5 hover:bg-[#161b26] hover:ring-white/25 active:scale-95"
          >
            <ResultShareIcon platform={platform.id} />
          </button>
        ))}
      </div>
    </div>
  );
}

function CareerCompassNode({
  x,
  y,
  color,
  title,
  detail,
  active = false,
  icon,
}: {
  x: number;
  y: number;
  color: string;
  title: string;
  detail?: string;
  active?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${x}%`, top: `${y}%` }}
    >
      {active && (
        <span
          className="absolute left-1/2 top-1/2 h-9 w-9 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full opacity-25"
          style={{ backgroundColor: color }}
        />
      )}
      <div
        className="relative flex h-9 w-9 items-center justify-center rounded-full border-2 bg-[#0a0f1a] text-[13px] font-black shadow-[0_0_18px_rgba(240,192,64,0.18)]"
        style={{ borderColor: color, color }}
      >
        {icon ?? <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />}
      </div>
      <div className="mt-1 w-[88px] text-center">
        <p className="text-[8px] font-black leading-tight text-[#f0f6fc]">{title}</p>
        {detail && <p className="mt-0.5 text-[7px] leading-tight text-gray-500">{detail}</p>}
      </div>
    </div>
  );
}

function CareerCompassMilestone({
  state,
  icon,
  title,
  desc,
  badge,
  badgeClassName,
}: {
  state: 'done' | 'active' | 'locked';
  icon: React.ReactNode;
  title: string;
  desc: string;
  badge: string;
  badgeClassName: string;
}) {
  return (
    <div className={`flex items-start gap-3 rounded-xl border border-[#21262d] bg-[#0a0f1a]/70 px-3 py-3 ${state === 'locked' ? 'opacity-45' : 'opacity-100'}`}>
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0d1117]">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[12px] font-bold leading-tight text-[#f0f6fc]">{title}</p>
          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-black ${badgeClassName}`}>
            {badge}
          </span>
        </div>
        <p className="mt-1 text-[10px] leading-relaxed text-gray-400">{desc}</p>
      </div>
    </div>
  );
}

function CareerCompassGamification({
  job,
  selectedRoleId,
  currentSalary,
  medianSalary,
  targetSalary,
  benchmark,
  resultPercent,
  isUnlocked29k,
  onUnlockClick,
}: {
  job: string;
  selectedRoleId?: string;
  currentSalary: number;
  medianSalary: number;
  targetSalary: number;
  benchmark: BenchmarkMeta | null;
  resultPercent: number;
  isUnlocked29k: boolean;
  onUnlockClick: () => void;
}) {
  const safeMedian = Math.max(1, medianSalary || currentSalary || 1);
  const currentTopRank = Math.max(1, Math.round(resultPercent || 100));
  const candidateLabels = getStrategicCandidateLabels(resultPercent)
    .filter(label => {
      const top = getTopPercentNumber(label);
      return top > 0 && top < currentTopRank;
    });
  const compassCandidateLabels = PERCENTILE_LADDER
    .filter(rung => rung < currentTopRank)
    .map(rung => `Top ${rung}%`);
  const safeCandidateLabels = candidateLabels.length ? candidateLabels : ['Top 1%'];
  const targetCandidates = candidateLabels.map(label => ({
    label,
    salary: getThreshold(benchmark, label) || 0,
  }));
  const pricedTargets = targetCandidates.filter(target => {
    const top = getTopPercentNumber(target.label);
    return top > 0 && top < currentTopRank && target.salary > currentSalary;
  });
  const meaningfulTarget =
    pricedTargets.find(target => target.salary - currentSalary >= getMeaningfulStrategicGap(currentSalary)) ||
    pricedTargets[0];
  const fallbackLabel = safeCandidateLabels[0] || formatTopPercentLabel(benchmark?.strategicTargetLabel || inferStrategicTargetLabel(resultPercent));
  const nextTargetLabel = meaningfulTarget?.label || fallbackLabel;
  const fallbackTargetSalary =
    targetSalary > currentSalary ? targetSalary :
    benchmark?.strategicTargetSalary && benchmark.strategicTargetSalary > currentSalary ? benchmark.strategicTargetSalary :
    benchmark?.nextTargetSalary && benchmark.nextTargetSalary > currentSalary ? benchmark.nextTargetSalary :
    safeMedian > currentSalary ? safeMedian :
    currentSalary * 1.15;
  const safeTargetSalary = Math.max(
    currentSalary * 1.08,
    meaningfulTarget?.salary || fallbackTargetSalary
  );
  const compassTargetCandidates = compassCandidateLabels.map(label => ({
    label,
    salary: getThreshold(benchmark, label) || 0,
  })).filter(target => {
    const top = getTopPercentNumber(target.label);
    return top > 0 && top < currentTopRank && target.salary > currentSalary;
  });
  const nodeTargets = (compassTargetCandidates.length ? compassTargetCandidates : (pricedTargets.length ? pricedTargets : safeCandidateLabels.map(label => ({
    label,
    salary: getThreshold(benchmark, label) || 0,
  }))))
    .filter((target, index, arr) => target.label && arr.findIndex(item => item.label === target.label) === index)
    .slice(0, resultPercent <= 10 ? 2 : 3);
  const compassPoints =
    nodeTargets.length <= 1
      ? [{ x: 18, y: 70 }, { x: 82, y: 24 }]
      : nodeTargets.length === 2
        ? [{ x: 16, y: 72 }, { x: 50, y: 48 }, { x: 84, y: 22 }]
        : [{ x: 14, y: 72 }, { x: 38, y: 55 }, { x: 62, y: 38 }, { x: 86, y: 20 }];
  const pathColors = [
    ['#f0c040', '#22c55e'],
    ['#22c55e', '#378add'],
    ['#378add', '#8b5cf6'],
  ];
  const targetTitles = ['Mốc kế tiếp', 'Vùng tăng tốc', 'Đích hoàng kim'];
  const rawProgress = (currentSalary / safeTargetSalary) * 100;
  const progressPct = Math.max(0, Math.min(100, rawProgress));
  const fitScore = Math.max(35, Math.min(95, Math.round(progressPct * 0.75 + (resultPercent <= 50 ? 20 : 5))));
  const isLowestSalaryGroup = resultPercent >= 80 || currentSalary < safeMedian * 0.8;
  const targetTopNumber = getTopPercentNumber(nextTargetLabel);
  const targetMillion = Math.max(1, Math.round(safeTargetSalary / 1_000_000));
  const currentSalaryM = currentSalary > 0 ? fmtM(currentSalary) : 'mức hiện tại';
  const targetSalaryM = safeTargetSalary > 0 ? fmtM(safeTargetSalary) : 'mốc thị trường';
  const difficultyLabel =
    targetTopNumber >= 60 ? 'Bước dễ: dựng bằng chứng nền' :
    targetTopNumber >= 40 ? 'Bước vừa: chứng minh KPI rõ' :
    targetTopNumber >= 20 ? 'Bước khó: tạo impact vượt scope' :
    'Bước rất khó: đóng gói lợi thế top-tier';
  const isPublicSubjectTeacherForCompass = /giáo viên\s+(toán|vật lý|lý|hóa|hóa học|lịch sử|sử|địa lý|địa|ngữ văn|văn|tin học|sinh học|sinh|gdcd|công nghệ|mỹ thuật|âm nhạc|thể dục)|giao vien\s+(toan|vat ly|ly|hoa|hoa hoc|lich su|su|dia ly|dia|ngu van|van|tin hoc|sinh hoc|sinh|gdcd|cong nghe|my thuat|am nhac|the duc)/i.test(job);
  const isRestaurantManagerForCompass = isRestaurantManagerRole(job);
  const isRestaurantFrontlineForCompass = isRestaurantFrontlineRole(job);
  const isChefRoleForCompass = /đầu bếp|dau bep|chef|bếp|bep|cook|kitchen|bếp trưởng|bep truong|bếp phó|bep pho|sous chef/i.test(job) && !isRestaurantManagerForCompass && !isRestaurantFrontlineForCompass;
  const proofFocus =
    isPublicSubjectTeacherForCompass
      ? 'giáo án bộ môn, ma trận đề, rubric, tiến bộ điểm số học sinh và hồ sơ chuyên môn'
      : isRestaurantManagerForCompass
      ? 'KPI ca, roster, labor cost, food cost, table turn, service quality, complaint recovery và dashboard cho owner/GM'
      : isRestaurantFrontlineForCompass
      ? 'POS/order accuracy, bill log, table service SOP, upsell tại bàn, complaint tại bàn và handover ca'
      : /trung tam ngoai ngu|ngoại ngữ|ngoai ngu|education|giáo dục|giao duc/i.test(job)
      ? 'enrollment, retention, trial-to-paid, class fill rate và teacher utilization'
      : /\bmc\b|người dẫn|nguoi dan|dẫn chương trình|dan chuong trinh|host|sự kiện|su kien|presenter|moderator/i.test(job)
        ? 'showreel, feedback khách/agency, số show chất lượng, rate card và khả năng xử lý sân khấu live'
        : isChefRoleForCompass
          ? 'food cost, waste rate, tốc độ ra món, rating khách và chuẩn SOP bếp'
          : 'KPI đầu ra, case study trước/sau, scope ownership và bằng chứng tiết kiệm/tăng trưởng';
  const isLanguageCenterRole = /trung tam ngoai ngu|ngoại ngữ|ngoai ngu|english center|language center/i.test(job);
  const isMcRoleForCompass = /\bmc\b|người dẫn|nguoi dan|dẫn chương trình|dan chuong trinh|host|sự kiện|su kien|presenter|moderator/i.test(job);
  const growthProof = isPublicSubjectTeacherForCompass
    ? '1 hồ sơ chuyên môn gồm giáo án bộ môn, ma trận đề, rubric, điểm trước-sau và xác nhận dự giờ'
    : isRestaurantManagerForCompass
    ? '1 dashboard ca/tháng gồm doanh thu, table turn, labor cost, food cost/waste, complaint recovery và feedback owner/GM'
    : isRestaurantFrontlineForCompass
    ? '1 log 10 bill/bàn gồm order đúng, bill không lỗi, upsell/request, complaint và feedback quản lý ca'
    : isLanguageCenterRole
    ? '1 dashboard học viên active, trial-to-paid, retention, class fill rate và complaint SLA'
    : isMcRoleForCompass
    ? '1 showreel 60-90 giây, 3 mẫu lời dẫn, feedback khách/agency và rate card rõ ràng'
    : isChefRoleForCompass
    ? '1 bảng food cost/waste rate, tốc độ ra món và checklist SOP cho ca đông khách'
    : '1 case study trước/sau có KPI, người xác nhận và tác động kinh doanh';
  const scaleProof = isPublicSubjectTeacherForCompass
    ? 'biến chuyên môn bộ môn thành chuyên đề tổ, phụ đạo/bồi dưỡng và hồ sơ thi đua/phụ cấp'
    : isRestaurantManagerForCompass
    ? 'biến quản lý ca thành hệ thống vận hành có KPI: roster, chi phí, service quality, complaint recovery và training team'
    : isRestaurantFrontlineForCompass
    ? 'biến công việc phục vụ/thu ngân thành log ca có số liệu, ít lỗi bill/order hơn và feedback quản lý xác nhận'
    : isLanguageCenterRole
    ? 'biến quản lý vận hành thành tăng trưởng tuyển sinh, giữ chân học viên và tối ưu lịch giáo viên'
    : isMcRoleForCompass
    ? 'biến kỹ năng dẫn thành hồ sơ booking có video, phản hồi thật và mức phí theo format sự kiện'
    : isChefRoleForCompass
    ? 'biến tay nghề nấu thành năng lực vận hành bếp: chuẩn món, kiểm cost, training người và giữ chất lượng'
    : 'biến phần việc hiện tại thành ownership lớn hơn, có số liệu và scope rõ hơn';
  const laterTargetLabel = nodeTargets[1]?.label || nodeTargets[0]?.label || nextTargetLabel;
  const stageVision = [
    {
      label: 'Chặng 1',
      title: `Định vị hiện tại: ${currentSalaryM}/tháng`,
      body: `Bạn không thiếu chức danh. Thị trường đang thiếu bằng chứng để trả bạn cao hơn cho vai trò ${job}.`,
    },
    {
      label: 'Chặng 2',
      title: `Thoát vùng thấp: lọt ${nextTargetLabel}`,
      body: `Việc đầu tiên là tạo ${growthProof}. Đây là bằng chứng nền để mức lương không còn bị neo ở hiện tại.`,
    },
    {
      label: 'Chặng 3',
      title: `Tăng tốc: hướng tới ${laterTargetLabel}`,
      body: `Khi có số, bạn bắt đầu ${scaleProof}. Lúc này câu chuyện lương chuyển từ “xin tăng” sang “định giá lại giá trị”.`,
    },
    {
      label: 'Chặng 4',
      title: `Đích mơ ước: ${targetMillion}M+/tháng`,
      body: 'Muốn tới đây cần lịch hành động theo tuần, tiêu chuẩn nghiệm thu và bằng chứng lưu lại từng bước. Checklist AI 79K sẽ hiện sau khi mở 29K.',
    },
  ];

  return (
    <section className="overflow-hidden rounded-2xl border border-[#21262d] bg-[#0d1117] p-4 text-[#f0f6fc] sm:p-5">
      <div className="mb-4">
        <h3 className="text-sm font-bold tracking-wide text-[#f0c040]">🧭 LA BÀN NGHỀ NGHIỆP</h3>
        <p className="mt-1 text-sm text-gray-400">Bạn đang ở đâu · Đi đâu · Mất bao lâu để thoát đáy?</p>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-[#f0c040] text-[11px] font-black leading-none text-[#f0c040]">
          {fitScore}/100
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">Độ phù hợp nghề nghiệp</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-gray-400">
            {isLowestSalaryGroup
              ? 'Level Tân Binh: Năng lực có thừa, nhưng bạn đang mặc một chiếc áo quá chật.'
              : 'Kẻ Thách Thức: Tọa độ hiện tại tạm ổn, nhưng bạn đang bỏ lỡ 15-20% biên độ tăng trưởng.'}
          </p>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-[#21262d] bg-[#0a0f1a] p-3">
        <p className="text-[11px] font-black uppercase tracking-wide text-[#f0c040]">Bản đọc nhanh của La Bàn</p>
        <p className="mt-2 text-[12px] leading-relaxed text-gray-300">
          Với vị trí <span className="font-bold text-white">{job}</span>, mức hiện tại khoảng{' '}
          <span className="font-black text-[#f0c040]">{currentSalaryM}/tháng</span>. Để tiến tới{' '}
          <span className="font-black text-[#22c55e]">{nextTargetLabel}</span>, bạn cần chứng minh giá trị bằng{' '}
          <span className="font-bold text-white">{proofFocus}</span>, không chỉ bằng số năm kinh nghiệm.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-lg border border-white/8 bg-[#0d1117] px-3 py-2">
            <p className="text-[9px] uppercase tracking-wide text-gray-500">Mốc cần vượt</p>
            <p className="mt-1 text-[12px] font-black text-[#22c55e]">{targetSalaryM}/tháng</p>
          </div>
          <div className="rounded-lg border border-white/8 bg-[#0d1117] px-3 py-2">
            <p className="text-[9px] uppercase tracking-wide text-gray-500">Nấc tiếp theo</p>
            <p className="mt-1 text-[12px] font-black text-[#378add]">{difficultyLabel}</p>
          </div>
        </div>
      </div>

      <div className="relative h-[200px] overflow-hidden rounded-xl bg-[#0a0f1a]">
        <div
          className="absolute inset-0 opacity-100"
          style={{
            backgroundImage:
              'linear-gradient(rgba(34,197,94,0.10) 1px, transparent 1px), linear-gradient(90deg, rgba(34,197,94,0.10) 1px, transparent 1px)',
            backgroundSize: '28px 28px',
          }}
        />
        <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            {compassPoints.slice(1).map((point, index) => (
              <linearGradient key={`career-path-${index}`} id={`career-path-${index}`} x1={compassPoints[index].x} y1={compassPoints[index].y} x2={point.x} y2={point.y} gradientUnits="userSpaceOnUse">
                <stop stopColor={pathColors[index]?.[0] || '#f0c040'} />
                <stop offset="1" stopColor={pathColors[index]?.[1] || '#8b5cf6'} />
              </linearGradient>
            ))}
          </defs>
          {compassPoints.slice(1).map((point, index) => {
            const start = compassPoints[index];
            const midX = (start.x + point.x) / 2;
            const midY = (start.y + point.y) / 2 - 4;
            return (
              <path
                key={`path-${index}`}
                d={`M${start.x} ${start.y} C ${midX - 5} ${midY}, ${midX + 5} ${midY}, ${point.x} ${point.y}`}
                fill="none"
                stroke={`url(#career-path-${index})`}
                strokeWidth="1.7"
                strokeDasharray="5,5"
                strokeLinecap="round"
              />
            );
          })}
        </svg>
        <CareerCompassNode x={compassPoints[0].x} y={compassPoints[0].y} color="#f0c040" title="Bạn hiện tại" detail={`Top ${resultPercent}%`} active />
        {nodeTargets.map((target, index) => {
          const point = compassPoints[index + 1];
          const color = ['#22c55e', '#378add', '#8b5cf6'][index] || '#8b5cf6';
          return (
            <CareerCompassNode
              key={target.label}
              x={point.x}
              y={point.y}
              color={color}
              title={targetTitles[index] || 'Mốc cao hơn'}
              detail={target.label}
              icon={index === nodeTargets.length - 1 ? <span className="text-[15px] text-white">★</span> : undefined}
            />
          );
        })}

        {!isUnlocked29k && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
            <button
              type="button"
              onClick={onUnlockClick}
              className="rounded-xl bg-[#f0c040] px-4 py-3 text-center text-xs font-black text-black shadow-[0_0_24px_rgba(240,192,64,0.28)] transition-all hover:bg-[#ffd35a] active:scale-95"
            >
              Mở khóa báo cáo lương 29K
            </button>
          </div>
        )}
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between gap-3">
          <p className="text-xs text-gray-400">Tiến trình đột phá tới mốc {nextTargetLabel}</p>
          <span className="text-[10px] font-black text-[#f0c040]">{Math.round(progressPct)}%</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[#1a1a2e]">
          <div className="h-full rounded-full bg-[#f0c040]" style={{ width: `${progressPct}%` }} />
        </div>
      </div>

      {isUnlocked29k && (
        <div className="mt-4 rounded-xl border border-[#f0c040]/25 bg-[#0a0f1a] p-3">
          <p className="text-[11px] font-black uppercase tracking-wide text-[#f0c040]">4 chặng La Bàn vẽ ra cho bạn</p>
          <div className="mt-3 space-y-2.5">
            {stageVision.map((stage, index) => (
              <div key={stage.label} className="flex gap-3 rounded-lg border border-white/8 bg-[#0d1117] px-3 py-3">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#f0c040]/40 bg-[#f0c040]/10 text-[10px] font-black text-[#f0c040]">
                  {index + 1}
                </div>
                <div className="min-w-0">
                  <p className="text-[12px] font-black text-white">{stage.title}</p>
                  <p className="mt-1 text-[10px] leading-relaxed text-gray-400">{stage.body}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 rounded-lg border border-[#8b5cf6]/25 bg-[#8b5cf6]/10 px-3 py-2 text-[10px] leading-relaxed text-[#d8ccff]">
            La Bàn cho bạn thấy bức tranh tương lai. Bước đồng hành tiếp theo biến bức tranh đó thành việc cần làm theo tuần để chạm mục tiêu.
          </p>
        </div>
      )}

      <div className="mt-4 space-y-2.5">
        <CareerCompassMilestone
          state="done"
          icon={<span className="text-sm font-black text-[#22c55e]">✓</span>}
          title="Định vị vị trí thị trường"
          desc="Đã làm sạch dữ liệu, nhận diện vùng trũng thu nhập"
          badge="Xong"
          badgeClassName="bg-[#22c55e]/15 text-[#22c55e]"
        />
        <CareerCompassMilestone
          state="active"
          icon={<span className="text-sm text-[#f0c040]">★</span>}
          title="La Bàn đã chỉ hướng: biết tiền nằm ở đâu"
          desc={`Mục tiêu trước mắt: lọt ${nextTargetLabel}; cần biến việc đang làm thành bằng chứng lương đo được`}
          badge="29k"
          badgeClassName="bg-[#f0c040]/15 text-[#f0c040]"
        />
        {isUnlocked29k && (
          <>
            <CareerCompassMilestone
              state="locked"
              icon={<span className="text-sm text-gray-400">🔒</span>}
              title="Tạo checklist hành động bằng AI cá nhân hóa"
              desc={`AI dùng La Bàn, nghề ${job}, điểm yếu hiện tại và mục tiêu ${nextTargetLabel} để dựng việc cần làm từng tuần, bằng chứng cần lưu và câu review lương`}
              badge="79k"
              badgeClassName="text-[#8b5cf6]"
            />
            <CareerCompassMilestone
              state="locked"
              icon={<span className="text-sm text-gray-400">🏆</span>}
              title={`Chạm mốc ${nextTargetLabel} · Đạt mục tiêu ${targetMillion}M`}
              desc="Mỗi chặng khó dần: kỹ năng rõ hơn, bằng chứng mạnh hơn, mức pay cao hơn"
              badge="Đích"
              badgeClassName="text-gray-300"
            />
          </>
        )}
      </div>

      {!isUnlocked29k ? (
        <button
          type="button"
          onClick={onUnlockClick}
          className="mt-4 w-full rounded-xl bg-[#f0c040] px-4 py-3.5 text-sm font-black text-black transition-all hover:bg-[#ffd35a] active:scale-[0.99]"
        >
          MỞ BÁO CÁO LƯƠNG 29K →
        </button>
      ) : (
        <Link
          href={`/roadmap?new=1&job=${encodeURIComponent(job)}&salary=${currentSalary}&duration=6&targetSalary=${Math.round(safeTargetSalary)}&targetLabel=${encodeURIComponent(nextTargetLabel)}&percent=${Math.round(resultPercent)}&name=${encodeURIComponent(readSharedName())}${selectedRoleId ? `&roleId=${encodeURIComponent(selectedRoleId)}` : ''}`}
          className="mt-4 flex w-full items-center justify-center rounded-xl border border-[#8b5cf6] bg-transparent px-4 py-3 text-sm font-bold text-[#8b5cf6] transition-all hover:bg-[#8b5cf6]/10 active:scale-[0.99]"
        >
          Tạo checklist AI · 79K →
        </Link>
      )}
    </section>
  );
}

/* ═══ GROUP COMPARE — So sánh ẩn danh với nhóm bạn ═════════════════════════ */
function GroupCompareCard({
  job,
  percent,
  salary,
  experience,
  marketLocation,
  workProvince,
  industry,
}: {
  job: string;
  percent: number;
  salary: number;
  experience: string;
  marketLocation: string;
  workProvince: string;
  industry?: string;
}) {
  const [groupState, setGroupState] = useState<'idle' | 'creating' | 'created' | 'joining' | 'joined'>('idle');
  const [groupData, setGroupData] = useState<{ groupId: string; members: { rank: number; job_title: string; percent: number }[]; yourRank: number; totalMembers: number } | null>(null);
  const [shareUrl, setShareUrl] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');

  const handleCreate = async () => {
    setGroupState('creating');
    setError('');
    try {
      const res = await fetch('/api/group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          job_title: job,
          salary,
          percent,
          experience,
          market_location: marketLocation,
          work_province: workProvince,
          industry,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Lỗi tạo nhóm'); setGroupState('idle'); return; }
      setGroupData({ groupId: data.groupId, members: data.members.map((m: any, i: number) => ({ ...m, rank: i + 1 })), yourRank: data.yourRank, totalMembers: data.totalMembers });
      setShareUrl(data.shareUrl);
      setGroupState('created');
    } catch { setError('Lỗi kết nối'); setGroupState('idle'); }
  };

  const handleJoinWithCode = useCallback(async (id: string) => {
    if (!id || id.length !== 6) { setError('Mã nhóm 6 ký tự'); return; }
    setGroupState('joining');
    setError('');
    try {
      const res = await fetch('/api/group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'join',
          groupId: id,
          job_title: job,
          salary,
          percent,
          experience,
          market_location: marketLocation,
          work_province: workProvince,
          industry,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Nhóm không tồn tại'); setGroupState('idle'); return; }
      setGroupData({ groupId: data.groupId, members: data.members.map((m: any, i: number) => ({ ...m, rank: i + 1 })), yourRank: data.yourRank, totalMembers: data.totalMembers });
      setGroupState('joined');
    } catch { setError('Lỗi kết nối'); setGroupState('idle'); }
  }, [experience, industry, job, marketLocation, percent, salary, workProvince]);

  const handleJoin = useCallback(async (code?: string) => {
    await handleJoinWithCode(code || joinCode);
  }, [handleJoinWithCode, joinCode]);

  // Check URL param ?group=XXXXXX on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const g = params.get('group');
    if (g && g.length === 6) {
      const groupId = g.toUpperCase();
      setJoinCode(groupId);
      handleJoinWithCode(groupId);
    }
  }, [handleJoinWithCode]);

  const handleShare = () => {
    const text = `Tôi đang Top ${percent}% thu nhập — bạn đang ở đâu? So sánh ẩn danh 👇`;
    if (navigator.share) {
      navigator.share({ title: 'VSPI So sánh ẩn danh', text, url: shareUrl });
    } else {
      navigator.clipboard.writeText(shareUrl);
    }
  };

  // ── IDLE: chưa tạo/join group ──
  if (groupState === 'idle') return (
    <div className="bg-[#0f1219] border border-blue-500/20 rounded-3xl p-5">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="text-xl">👥</span>
        <div>
          <p className="text-sm font-bold text-[#f0ede8]">So sánh ẩn danh với nhóm bạn</p>
          <p className="text-[10px] text-[#f0ede8]/45">Ai đang ở nhóm Top % tốt hơn? Không lộ tên, không lộ lương.</p>
        </div>
      </div>
      <div className="flex gap-2 mb-2">
        <button onClick={handleCreate}
          className="flex-1 bg-blue-600 text-white font-bold py-2.5 rounded-xl text-xs hover:bg-blue-700 transition-colors">
          Tạo nhóm mới
        </button>
        <div className="flex-1 flex gap-1.5">
          <input
            type="text" maxLength={6} placeholder="Mã nhóm"
            className="flex-1 bg-[#161b26] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-[#f0ede8] uppercase text-center font-mono tracking-widest outline-none focus:border-blue-500 placeholder:text-[#f0ede8]/25"
            value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
          />
          <button onClick={() => handleJoin()}
            className="bg-[#161b26] border border-white/15 text-[#f0ede8]/60 font-bold px-3 py-2.5 rounded-xl text-xs hover:border-blue-500/50 transition-colors">
            Join
          </button>
        </div>
      </div>
      {error && <p className="text-[10px] text-red-400 mt-1">{error}</p>}
    </div>
  );

  // ── CREATING/JOINING: loading ──
  if (groupState === 'creating' || groupState === 'joining') return (
    <div className="bg-[#0f1219] border border-blue-500/20 rounded-3xl p-5 flex items-center justify-center gap-3">
      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-[#f0ede8]/60">{groupState === 'creating' ? 'Đang tạo nhóm...' : 'Đang tham gia...'}</p>
    </div>
  );

  // ── CREATED/JOINED: hiện leaderboard ──
  if (!groupData) return null;
  return (
    <div className="bg-[#0f1219] border border-blue-500/30 rounded-3xl overflow-hidden">
      {/* Header */}
      <div className="bg-blue-600/10 border-b border-blue-500/20 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">👥</span>
          <div>
            <p className="text-xs font-bold text-[#f0ede8]">Nhóm so sánh ẩn danh</p>
            <p className="text-[9px] font-mono text-blue-400">Mã: {groupData.groupId} · {groupData.totalMembers}/10 người</p>
          </div>
        </div>
        {groupState === 'created' && (
          <button onClick={handleShare}
            className="bg-blue-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors">
            📤 Mời bạn bè
          </button>
        )}
      </div>

      {/* Leaderboard */}
      <div className="px-5 py-3 space-y-2">
        {groupData.members.map((m, i) => {
          const isYou = m.rank === groupData.yourRank && m.percent === percent;
          return (
            <div key={i} className={`flex items-center gap-3 py-2 px-3 rounded-xl ${isYou ? 'bg-[#e8b84b]/10 border border-[#e8b84b]/30' : 'bg-[#161b26] border border-white/5'}`}>
              <span className={`text-lg font-black ${i === 0 ? 'text-[#e8b84b]' : i === 1 ? 'text-slate-300' : i === 2 ? 'text-orange-400' : 'text-[#f0ede8]/30'}`}>
                {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`}
              </span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-bold truncate ${isYou ? 'text-[#e8b84b]' : 'text-[#f0ede8]'}`}>
                  {isYou ? '← Bạn' : `Người ${i + 1}`}
                </p>
                <p className="text-[10px] text-[#f0ede8]/45 truncate">{m.job_title}</p>
              </div>
              <div className={`text-right ${isYou ? 'text-[#e8b84b]' : 'text-[#f0ede8]'}`}>
                <p className="text-sm font-black">Top {m.percent}%</p>
              </div>
            </div>
          );
        })}
        {groupData.totalMembers === 1 && (
          <div className="text-center py-3">
            <p className="text-[11px] text-[#f0ede8]/40 italic">Đang chờ bạn bè tham gia...</p>
            <button onClick={handleShare}
              className="mt-2 bg-blue-600/20 border border-blue-500/40 text-blue-300 text-[11px] font-bold px-4 py-2 rounded-xl hover:bg-blue-600/30 transition-colors">
              📤 Gửi link cho 3 đồng nghiệp
            </button>
          </div>
        )}
      </div>

      {/* Footer: share CTA */}
      {groupData.totalMembers > 1 && (
        <div className="bg-[#161b26] border-t border-white/5 px-5 py-3 text-center">
          <p className="text-[10px] text-[#f0ede8]/40">
            {groupData.yourRank === 1
              ? '🏆 Bạn đang dẫn đầu nhóm!'
              : `Bạn đang xếp thứ ${groupData.yourRank}/${groupData.totalMembers} — mời thêm bạn để so sánh`}
          </p>
        </div>
      )}
    </div>
  );
}

/* ═══ INDUSTRY SWITCH CALCULATOR ════════════════════════════════════════════ */
function IndustrySwitchCard({ currentJob, currentPercent, salary }: { currentJob: string; currentPercent: number; salary: number }) {
  const [showSwitch, setShowSwitch] = useState(false);
  const industries = [
    { name: 'Công nghệ thông tin', medianMul: 1.6, icon: '💻' },
    { name: 'Tài chính / Ngân hàng', medianMul: 1.3, icon: '🏦' },
    { name: 'Marketing', medianMul: 1.0, icon: '📱' },
    { name: 'Kinh doanh / Bán hàng', medianMul: 1.2, icon: '🤝' },
    { name: 'Y tế', medianMul: 1.1, icon: '⚕️' },
    { name: 'Giáo dục', medianMul: 0.7, icon: '📚' },
    { name: 'Sản xuất / Kỹ thuật', medianMul: 1.1, icon: '🔧' },
    { name: 'Thiết kế / Sáng tạo', medianMul: 1.15, icon: '🎨' },
  ];

  // Tính percentile ước tính ở ngành khác
  const calculateSwitch = (mul: number) => {
    // Lương giữ nguyên, nhưng median ngành mới khác → vị trí % thay đổi
    const adjustedPercent = Math.min(80, Math.max(5, Math.round(currentPercent * (1 / mul))));
    const salaryGain = Math.round(salary * (mul - 1));
    return { percent: adjustedPercent, gain: salaryGain };
  };

  if (!showSwitch) return (
    <button onClick={() => setShowSwitch(true)}
      className="w-full bg-[#0f1219] border border-purple-500/20 rounded-3xl p-5 text-left hover:border-purple-500/40 transition-colors group">
      <div className="flex items-center gap-3">
        <span className="text-2xl group-hover:scale-110 transition-transform">🔀</span>
        <div>
          <p className="text-sm font-bold text-[#f0ede8]">Nếu nhảy ngành — Top mấy %?</p>
          <p className="text-[10px] text-[#f0ede8]/45">Cùng mức lương, ở ngành khác bạn đứng ở đâu?</p>
        </div>
        <span className="ml-auto text-[#f0ede8]/30 text-xs">Xem →</span>
      </div>
    </button>
  );

  return (
    <div className="bg-[#0f1219] border border-purple-500/25 rounded-3xl overflow-hidden">
      <div className="px-5 pt-5 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">🔀</span>
          <p className="text-sm font-bold text-[#f0ede8]">Nếu nhảy ngành?</p>
        </div>
        <button onClick={() => setShowSwitch(false)} className="text-[#f0ede8]/30 text-xs hover:text-[#f0ede8]/60">Thu gọn</button>
      </div>
      <div className="px-5 pb-5 space-y-2">
        {industries
          .filter(ind => !currentJob.toLowerCase().includes(ind.name.toLowerCase().split('/')[0].trim().split(' ')[0]))
          .slice(0, 5)
          .map((ind, i) => {
            const result = calculateSwitch(ind.medianMul);
            const better = result.percent < currentPercent;
            return (
              <div key={i} className="flex items-center gap-3 bg-[#161b26] rounded-xl p-3 border border-white/5">
                <span className="text-lg shrink-0">{ind.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-[#f0ede8] truncate">{ind.name}</p>
                  <p className="text-[10px] text-[#f0ede8]/45">
                    {better ? '↑ Vị trí tốt hơn' : '↓ Cạnh tranh hơn'}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-black ${better ? 'text-green-400' : 'text-orange-400'}`}>
                    Top {result.percent}%
                  </p>
                  {result.gain > 0 && (
                    <p className="text-[9px] text-green-400/70">+{(result.gain / 1_000_000).toFixed(1)}M tiềm năng</p>
                  )}
                </div>
              </div>
            );
          })}
        <p className="text-[9px] text-[#f0ede8]/30 text-center pt-1">
          Ước tính dựa trên dải lương trung vị ngành · Chỉ mang tính tham khảo
        </p>
      </div>
    </div>
  );
}

/* ═══ SALARY TIMELINE — Mốc hành động 3/6/9 tháng ═══════════════════════════ */
function SalaryTimelineCard({ salary, percent, job, benchmark, experience }: { salary: number; percent: number; job: string; benchmark: BenchmarkMeta | null; experience: ExperienceLevel }) {
  const months = [0, 3, 6, 9];
  const isLowBand = percent >= 80;
  const experienceLabel = EXPERIENCE_META[experience].label;
  const opportunity = getStrategicOpportunity(benchmark, salary, percent);
  const targetForMonths = (m: 3 | 6 | 9) => {
    const floors: Record<3 | 6 | 9, { mult: number; abs: number; progress: number }> = {
      3: { mult: 1.12, abs: 1_500_000, progress: 0.35 },
      6: { mult: 1.25, abs: 3_000_000, progress: 0.6 },
      9: { mult: 1.32, abs: 4_000_000, progress: 1 },
    };
    const floor = floors[m];
    let target = Math.max(salary * floor.mult, salary + floor.abs);
    if (opportunity.targetSalary > salary + Math.max(1_000_000, salary * 0.08)) {
      const milestone = salary + (opportunity.targetSalary - salary) * floor.progress;
      target = Math.min(Math.max(opportunity.targetSalary, target), Math.max(target, milestone));
    } else {
      target = Math.min(target, salary * 2);
    }
    return roundToHalfMillion(target);
  };
  const targets = [
    { salary: targetForMonths(3), label: `Mốc 3 tháng: tiến tới ${opportunity.label}` },
    { salary: targetForMonths(6), label: 'Mốc 6 tháng: có bằng chứng đủ dày để review' },
    { salary: targetForMonths(9), label: 'Mốc 9 tháng: deal lương hoặc apply role trả cao hơn' },
  ];
  const optimalPath = [salary, targets[0].salary, targets[1].salary, targets[2].salary];
  const maxSal = Math.max(...optimalPath);
  const gapAfter9Months = Math.max(0, optimalPath[3] - salary);

  // Simple bar chart
  return (
    <div className="bg-[#0f1219] border border-cyan-500/20 rounded-3xl p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <span className="text-xl">📈</span>
        <div>
          <p className="text-sm font-bold text-[#f0ede8]">Mục tiêu lương theo kinh nghiệm {experienceLabel}</p>
          <p className="text-[10px] text-[#f0ede8]/45">
            {isLowBand ? `Thoát vùng thấp trước, mốc cần nhìn là ${opportunity.label}` : `Nếu chỉ tăng đều vs. tiến về ${opportunity.label}`}
          </p>
        </div>
      </div>

      {isLowBand && (
        <div className="mb-4 rounded-2xl border border-cyan-400/20 bg-cyan-400/8 px-4 py-3">
          <p className="text-xs font-bold leading-5 text-cyan-200">
            Bạn đã chọn kinh nghiệm {experienceLabel}. Với mức hiện tại trong ngành {job}, tăng nhẹ 1-2 triệu/tháng là chưa đủ.
            Mốc hợp lý đầu tiên là {opportunity.label}{opportunity.targetSalary ? ` khoảng ${fmtM(opportunity.targetSalary)}/tháng` : ''},
            rồi mới tính tiếp Top 30%, Top 20% hoặc Top 5%.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {months.map((month, i) => {
          const optW = (optimalPath[i] / maxSal) * 100;
          const target = targets[i - 1];
          return (
            <div key={i} className="space-y-1">
              <div className="flex justify-between text-[10px]">
                <span className="text-[#f0ede8]/45 font-mono">{month === 0 ? 'Hiện tại' : `+${month} tháng`}</span>
                <span className="text-[#f0ede8]/60 font-mono">{(optimalPath[i] / 1_000_000).toFixed(1)}M</span>
              </div>
              <div className="h-2.5 bg-[#161b26] rounded-full overflow-hidden relative">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cyan-500 to-[#e8b84b] transition-all duration-700"
                  style={{ width: `${optW}%` }}
                />
              </div>
              {i > 0 && (
                <div className="flex justify-between text-[9px]">
                  <span className="text-[#f0ede8]/25">{target?.label}</span>
                  <span className="text-green-400/70">
                    +{Math.max(0, (optimalPath[i] - salary) / 1_000_000).toFixed(1)}M nếu hành động
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Summary */}
      <div className="mt-4 bg-[#161b26] rounded-xl p-3 border border-cyan-500/10 text-center">
        <p className="text-[11px] text-[#f0ede8]/60">
          Nếu biến La Bàn thành <strong className="text-[#e8b84b]">lộ trình có checkpoint</strong>, mốc 9 tháng có thể nhắm thêm khoảng
        </p>
        <p className="text-xl font-black text-cyan-400">
          {(gapAfter9Months / 1_000_000).toFixed(1)} triệu/tháng
        </p>
        <p className="text-[9px] text-[#f0ede8]/30 mt-0.5">
          so với mức hiện tại (~{Math.max(1, Math.round(gapAfter9Months * 12 / 1_000_000))} triệu/năm nếu giữ được)
        </p>
        <p className="text-[9px] text-[#f0ede8]/35 mt-2 leading-4">
          Đây không phải lời hứa tăng lương tự động. Cách đúng là chia mục tiêu thành sprint 3/6/9 tháng, mỗi sprint phải có bằng chứng, KPI và kết quả để deal từng phần.
        </p>
      </div>
    </div>
  );
}

function roundToHalfMillion(value: number) {
  return Math.max(500_000, Math.round(value / 500_000) * 500_000);
}

/* ═══ NEGOTIATION POWER SCORE ═══════════════════════════════════════════════ */
function NegotiationScoreCard({ job, percent, experience }: { job: string; percent: number; experience: string }) {
  // Tính điểm leverage 1–10 dựa trên 4 yếu tố
  const factors = [
    {
      name: 'Vị trí thị trường',
      score: percent <= 10 ? 9 : percent <= 20 ? 7 : percent <= 50 ? 5 : 3,
      detail: percent <= 20 ? 'Top performer — công ty khó thay thế' : 'Dễ bị thay thế nếu không nâng giá trị',
    },
    {
      name: 'Nhu cầu tuyển dụng ngành',
      score: /it|developer|data|ai|cloud|software/i.test(job) ? 9
        : /marketing|sales|kinh doanh/i.test(job) ? 7
        : /giáo viên|y tá|điều dưỡng/i.test(job) ? 5 : 6,
      detail: /it|developer/i.test(job) ? 'Thiếu hụt nhân lực nghiêm trọng — bạn có quyền chọn' : 'Nhu cầu tuyển ổn định',
    },
    {
      name: 'Kinh nghiệm',
      score: experience === 'senior' ? 8 : experience === 'mid' ? 6 : 4,
      detail: experience === 'senior' ? 'Kinh nghiệm dày — khó thay thế' : 'Cần thêm track record để negotiate mạnh',
    },
    {
      name: 'Thời điểm thị trường',
      score: 7, // 2026 là năm tốt để đàm phán (NIC Guide)
      detail: 'Q1-Q2/2026: thị trường nóng, 80% DN tăng tuyển',
    },
  ];

  const totalScore = Math.round(factors.reduce((sum, f) => sum + f.score, 0) / factors.length);
  const scoreColor = totalScore >= 8 ? 'text-green-400' : totalScore >= 6 ? 'text-[#e8b84b]' : 'text-orange-400';
  const scoreLabel = totalScore >= 8 ? 'Rất mạnh — nên đàm phán NGAY' : totalScore >= 6 ? 'Khá tốt — chuẩn bị số liệu rồi đàm phán' : 'Cần nâng giá trị trước — đàm phán sau 3 tháng';

  return (
    <div className="bg-[#0f1219] border border-[#e8b84b]/15 rounded-3xl p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <span className="text-xl">⚡</span>
        <div>
          <p className="text-sm font-bold text-[#f0ede8]">Negotiation Power Score</p>
          <p className="text-[10px] text-[#f0ede8]/45">Bạn có đủ leverage để đàm phán lương bây giờ?</p>
        </div>
      </div>

      {/* Big score */}
      <div className="text-center mb-5">
        <p className={`text-5xl font-black ${scoreColor}`}>{totalScore}<span className="text-lg font-normal text-[#f0ede8]/30">/10</span></p>
        <p className="text-xs font-bold text-[#f0ede8]/70 mt-1">{scoreLabel}</p>
      </div>

      {/* Factor breakdown */}
      <div className="space-y-2.5">
        {factors.map((f, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex justify-between mb-1">
                <span className="text-[10px] font-bold text-[#f0ede8]/60">{f.name}</span>
                <span className="text-[10px] font-mono text-[#f0ede8]/40">{f.score}/10</span>
              </div>
              <div className="h-1.5 bg-[#161b26] rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${f.score * 10}%`,
                    background: f.score >= 8 ? '#4ade80' : f.score >= 6 ? '#e8b84b' : '#fb923c',
                  }}
                />
              </div>
              <p className="text-[9px] text-[#f0ede8]/30 mt-0.5">{f.detail}</p>
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div className="mt-4 bg-[#161b26] rounded-xl p-3 border border-white/5 text-center">
        <p className="text-[10px] text-[#f0ede8]/50">
          {totalScore >= 7
            ? '💡 Mở khóa báo cáo Premium để nhận kịch bản đàm phán lương nguyên văn'
            : '💡 Mở khóa Báo cáo lương 29K để xem lộ trình nâng score lên 8+'}
        </p>
      </div>
    </div>
  );
}

/* ═══ TEASER ZONE ═══════════════════════════════════════════════════════════ */
function TeaserZone({ job, percent, lostMoney, salary, dbData, paidCount, dailyViews, unlocked = false }: TeaserProps & { unlocked?: boolean }) {
  const top50 = dbData?.top_50 ?? null; const top20 = dbData?.top_20 ?? null;
  const top10 = dbData?.top_10 ?? null; const top5 = dbData?.top_5 ?? null;
  const [showDataModal, setShowDataModal] = useState(false);

  // ── Realtime toast: hiện khi có giao dịch mới ────────────────────────────
  const [realtimeToast, setRealtimeToast] = useState<string | null>(null);
  useEffect(() => {
    let channel: ReturnType<typeof import('@supabase/supabase-js').createClient> extends { channel: (...a: any[]) => infer C } ? C : any;
    let timer: NodeJS.Timeout;
    try {
      const { supabaseClient } = require('@/lib/supabase') as { supabaseClient: import('@supabase/supabase-js').SupabaseClient };
      channel = supabaseClient
        .channel('purchases-realtime-social')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'purchases' },
          (payload: { new: { status: string; job_title?: string } }) => {
            if (payload.new?.status === 'paid') {
              const jobLabel = payload.new.job_title ?? 'một ngành';
              setRealtimeToast(`Một người dùng ẩn danh ngành ${jobLabel} vừa mở khóa báo cáo`);
              timer = setTimeout(() => setRealtimeToast(null), 5000);
            }
          })
        .subscribe();
    } catch { /* Realtime không khả dụng — bỏ qua */ }
    return () => {
      clearTimeout(timer);
      channel?.unsubscribe?.();
    };
  }, []);

  const medianGap = Math.max(0, (top50 || 0) - salary);
  const isNearMedian = percent >= 50 && medianGap > 0 && medianGap < getMeaningfulStrategicGap(salary);
  const teaserProofFocus = /giáo viên\s+(toán|vật lý|lý|hóa|hóa học|lịch sử|sử|địa lý|địa|ngữ văn|văn|tin học|sinh học|sinh|gdcd|công nghệ|mỹ thuật|âm nhạc|thể dục)|giao vien\s+(toan|vat ly|ly|hoa|hoa hoc|lich su|su|dia ly|dia|ngu van|van|tin hoc|sinh hoc|sinh|gdcd|cong nghe|my thuat|am nhac|the duc)/i.test(job)
    ? 'giáo án bộ môn, ma trận đề, rubric, tiến bộ điểm số học sinh và hồ sơ chuyên môn'
    : 'KPI đầu ra, case study trước/sau, scope ownership và bằng chứng tăng trưởng';
  const insightLines = percent === 5 ? ['Bạn đang Elite — nhưng Top 1% đang kéo xa bạn thêm mỗi quý.', 'Có 1 kỹ năng mà 94% Top 1% có, còn Top 5% chưa nắm.'] : percent === 10 ? [`Khoảng cách từ Top 10% lên Top 5% ngành ${job} chỉ là ${fmtM((top5 ?? 0) - (top10 ?? 0))}/tháng.`, '80% người vượt mốc này làm được trong 6 tháng với đúng chiến lược.'] : percent === 20 ? [`Top 10% ngành ${job} đang nhận thêm ${fmtM((top10 ?? 0) - (top20 ?? 0))}/tháng so với bạn.`, 'Khoảng cách này không đến từ kinh nghiệm — nó đến từ 1 kỹ năng cụ thể.'] : percent === 50 || isNearMedian ? [`Bạn đang tiệm cận median ngành ${job}; Top 50% không còn là mốc đủ kích thích.`, 'Mốc đáng xem tiếp theo là Top 40% / Top 30% — nơi mức deal bắt đầu khác hẳn.'] : [`Median ngành ${job} cao hơn lương bạn ${fmtM(medianGap || lostMoney / 12)}/tháng.`, '72% người dưới median không biết mình bị undervalue cho đến khi thấy dữ liệu thị trường.'];
  const negotiateAnchor = Math.round(Math.max(salary * 1.12, top50 || 0, percent <= 50 ? top20 || 0 : 0) / 500_000) * 500_000;
  const offerAverage = Math.round(Math.max(salary, negotiateAnchor * 0.92) / 500_000) * 500_000;
  const negotiationRows = [
    { label: 'Đang được offer trung bình', value: `${fmtM(offerAverage)}/tháng`, placeholder: '••,• triệu/tháng' },
    { label: 'Con số nên nói khi được hỏi lương mong muốn', value: `${fmtM(negotiateAnchor)}/tháng`, placeholder: '•• triệu' },
    { label: 'Câu dùng để justify mức lương đó', value: `Em đang neo quanh ${fmtM(negotiateAnchor)}/tháng vì benchmark ${job} cùng level/khu vực cho thấy mốc này hợp lý với scope và KPI em có thể chứng minh.`, placeholder: '"••••••••••••••••••"' },
  ];
  const gapDrivers = [
    'Gói KPI thành câu nói 20 giây: việc đã làm, số trước/sau, tác động tiền hoặc thời gian.',
    `Neo mức mong muốn quanh ${fmtM(negotiateAnchor)}/tháng trước khi HR kéo bạn về mức hiện tại.`,
    `Sửa 1 dòng CV thành output đo được của ${job}, kèm số và phạm vi chịu trách nhiệm.`,
  ];
  return (
    <div className="space-y-3">
      {showDataModal && <DataSourceModal onClose={() => setShowDataModal(false)} />}

      {/* Realtime toast — hiện khi có giao dịch mới */}
      {realtimeToast && (
        <div className="flex items-center gap-2.5 bg-green-500/15 border border-green-500/30 rounded-2xl px-4 py-3 animate-[fadeUp_0.3s_ease_both]">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse shrink-0" />
          <p className="text-[11px] font-sans text-green-300 leading-snug">🔔 {realtimeToast}</p>
        </div>
      )}
      {/* Partial benchmark */}
      <div className="bg-[#0f1219] rounded-3xl overflow-hidden shadow-sm border border-white/10">
        <div className="px-5 pt-5 pb-1">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-black text-[#f0ede8]/70">📊 Phân phối lương — {job}</p>
            <span className="text-[9px] bg-[#161b26] text-[#e8b84b] font-mono font-bold px-2 py-0.5 rounded-full border border-white/10">Q1/2026</span>
          </div>
          {[{ label: 'Median (Top 50%)', val: top50, color: '#FF9100', w: '50%' }, { label: 'Top 20%', val: top20, color: '#40C4FF', w: '70%' }].map((r, i) => (
            <div key={i} className="flex items-center gap-3 py-2.5 border-b border-white/5">
              <div className="w-28 shrink-0"><p className="text-[10px] font-mono font-bold text-[#f0ede8]/45">{r.label}</p></div>
              <div className="flex-1 h-2 bg-[#161b26] rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: r.w, backgroundColor: r.color }} /></div>
              <p className="text-sm font-serif font-black text-[#f0ede8] w-14 text-right">{fmtM(r.val)}</p>
            </div>
          ))}
          {/* ── Rows Top 10% & Top 5%: thông tin tham khảo, KHÔNG còn là object lock chính ── */}
          {/* Object lock chính đã chuyển sang block "Con số bạn chưa biết" bên dưới. */}
          <div className="relative">
            {percent <= 10 ? (
              /* ELITE: hiện rõ Top 10% & 5% — không khóa overlay vì user đã ở nhóm này */
              <>
                {[
                  { label: 'Top 10%', val: top10, color: '#00E676', w: '85%' },
                  { label: 'Top 5% 🏆', val: top5, color: '#FFD700', w: '100%' },
                ].map((r, i) => (
                  <div key={i} className="flex items-center gap-3 py-2.5 border-b border-white/5">
                    <div className="w-28 shrink-0">
                      <p className="text-[10px] font-mono font-bold text-[#f0ede8]/45">{r.label}</p>
                    </div>
                    <div className="flex-1 h-2 bg-[#161b26] rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: r.w, backgroundColor: r.color }} />
                    </div>
                    <p className={`text-sm font-serif font-black w-20 text-right ${unlocked && !r.val ? 'text-[9px] leading-tight text-[#e8b84b]/80' : 'text-[#f0ede8]'}`}>
                      {unlocked
                        ? formatBenchmarkCell({ accessLevel: 'paid29', value: r.val, label: benchmarkLabelKey(r.label) }).text
                        : fmtM(r.val)}
                    </p>
                  </div>
                ))}
              </>
            ) : (
              /* THƯỜNG: render Top 10/5 mờ nhưng KHÔNG có overlay riêng — paywall chính nằm ở block negotiate phía dưới */
              <>
                {[
                  { label: 'Top 10%', w: '85%' },
                  { label: 'Top 5% 🏆', w: '100%' },
                ].map((r, i) => (
                  <div key={i} className="flex items-center gap-3 py-2.5 border-b border-white/5 opacity-40 select-none pointer-events-none">
                    <div className="w-28 shrink-0">
                      <p className="text-[10px] font-mono font-bold text-[#f0ede8]/45">{r.label}</p>
                    </div>
                    <div className="flex-1 h-2 bg-[#161b26] rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-white/20" style={{ width: r.w }} />
                    </div>
                    <p className="text-sm font-serif font-black text-[#f0ede8] w-14 text-right">?</p>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
        <div className="bg-[#161b26] border-t border-white/10 px-5 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getRingColor(percent) }} />
            <p className="text-[11px] font-sans text-[#f0ede8]/70">
              Vị trí của bạn: <strong className="text-[#f0ede8] font-mono">{formatPercentDisplay(percent)}</strong>
              {percent >= 50
                ? isNearMedian
                  ? <span className="text-[#e8b84b]"> · tiệm cận median, nên nhắm Top 40/30</span>
                  : <span className="text-red-400"> · thấp hơn median {fmtM(medianGap || lostMoney / 12)}/tháng</span>
                : <span className="text-green-400"> · đã vượt median ✓</span>}
            </p>
          </div>
          <button onClick={() => setShowDataModal(true)} className="text-[9px] font-mono text-[#f0ede8]/40 hover:text-[#e8b84b] transition-colors whitespace-nowrap shrink-0 underline underline-offset-2">
            Xem phương pháp tính →
          </button>
        </div>
      </div>

      {/* ── PAYWALL CHÍNH: Benchmark negotiate ẩn danh của người cùng profile ── */}
      <div className="bg-[#0f1219] rounded-3xl overflow-hidden shadow-sm border border-[#e8b84b]/30 relative">
        <div className="absolute top-0 right-0 w-40 h-40 bg-[#e8b84b]/10 rounded-full blur-3xl pointer-events-none" />
        <div className="px-5 pt-5 pb-4 relative">
          <div className="flex items-start gap-2 mb-1">
            <span className="text-base leading-none mt-0.5">{unlocked ? '✅' : '🔒'}</span>
            <h3 className="text-sm font-serif font-black text-[#f0ede8] leading-snug">
              Con số bạn chưa biết — nhưng nhà tuyển dụng đã biết từ lâu
            </h3>
          </div>
          <p className="text-[11px] font-sans text-[#f0ede8]/55 leading-snug pl-6 mb-4">
            Benchmark ẩn danh: <strong className="text-[#e8b84b]">Người cùng ngành · cùng tỉnh · cùng số năm kinh nghiệm</strong> với bạn
          </p>

          {/* 3 locked rows */}
          <div className="space-y-2.5">
            {negotiationRows.map((row, i) => {
              const isJustifyRow = row.label.startsWith('Câu dùng để justify');
              return (
              <div key={i} className={`bg-[#161b26] border border-white/8 rounded-xl px-3 py-2.5 ${isJustifyRow ? 'flex flex-col items-start gap-2' : 'flex items-center justify-between gap-3'}`}>
                <p className="text-[11px] font-sans text-[#f0ede8]/70 leading-snug flex-1 min-w-0">
                  {row.label}
                </p>
                <span className={`text-[12px] font-mono font-black ${isJustifyRow ? 'w-full whitespace-normal break-words leading-relaxed' : 'shrink-0 max-w-[58%] truncate'} ${unlocked ? 'text-green-300' : 'text-[#f0ede8]/40 select-none'}`} style={unlocked ? undefined : { filter: 'blur(3px)' }}>
                  {unlocked ? row.value : row.placeholder}
                </span>
              </div>
            )})}
          </div>

          {/* CTA inline trong block */}
          {!unlocked && (
            <button
              onClick={() => {
                playTap();
                const el = document.getElementById('paywall-anchor');
                el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className="mt-4 w-full bg-[#e8b84b] text-[#0a0c10] font-black py-3 rounded-xl text-sm
                         hover:bg-[#f0c84b] hover:-translate-y-0.5 active:scale-[0.98] transition-all
                         shadow-[0_0_16px_rgba(232,184,75,0.25)]"
            >
              Mở khóa 29k để xem benchmark negotiate
            </button>
          )}
          <p className="mt-2 text-center text-[10px] font-mono text-[#f0ede8]/40">
            {unlocked ? 'Đã mở khóa bằng báo cáo lương 29K' : 'Benchmark được tổng hợp ẩn danh từ các profile tương tự bạn'}
          </p>
        </div>
      </div>

      {/* ── PAIN BLOCK #2: Khoảng cách thật — 3 yếu tố cụ thể (safe copy, không fake uplift) ── */}
      <div className="bg-[#0f1219] rounded-3xl p-5 shadow-sm border border-white/10 relative overflow-hidden">
        <p className="mb-1 text-xs font-black text-[#f0ede8]/80 leading-snug">
          Khoảng cách thật giữa bạn và người cùng level đang kiếm nhiều hơn
        </p>
        <p className="mb-4 text-[11px] font-sans text-[#f0ede8]/55 leading-snug">
          Không chỉ nằm ở skill — mà nằm ở <strong className="text-[#e8b84b]">3 thứ này</strong>:
        </p>
        <div className="space-y-2">
          {(unlocked ? gapDrivers : [
            'Cách gói KPI thành câu nói trong vòng phỏng vấn cuối',
            'Mức lương mong muốn nói ra trước khi HR đưa số đầu tiên',
            'Một dòng trong CV làm họ phải gọi lại — thay vì lọc bạn ra',
          ]).map((item, i) => (
            <div key={i} className="bg-[#161b26] border border-white/8 rounded-xl px-3 py-2.5 flex items-center gap-2.5 opacity-90">
              <span className="text-[10px] font-mono font-black text-[#e8b84b] shrink-0 w-4">0{i + 1}</span>
              <p className={`text-[12px] font-sans leading-snug flex-1 min-w-0 ${unlocked ? 'text-[#f0ede8]/80' : 'text-[#f0ede8]/70 truncate'}`} style={unlocked ? undefined : { filter: 'blur(2.5px)' }}>
                {item}
              </p>
              <span className="text-[11px] shrink-0">{unlocked ? '✓' : '🔒'}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[11px] font-sans text-[#f0ede8]/55 leading-relaxed italic">
          Đây là phần nhiều người chỉ nhận ra sau vài vòng phỏng vấn hoặc một lần bị offer thấp.
        </p>
      </div>

      {/* Market trend */}
      <div className="bg-[#0f1219] rounded-3xl p-5 shadow-sm border border-white/10">
        <p className="mb-3 text-xs font-black text-[#f0ede8]/70">📈 Tín hiệu thị trường 2026</p>
        {[
          { arrow: '↑', color: 'text-green-400', t: `Nhu cầu tuyển ngành ${job} cần đọc theo từng role`, d: 'VSPI dùng salary guide và job-market reports như tín hiệu tham chiếu, không coi một headline tuyển dụng là kết luận cho mọi nghề.' },
          { arrow: '↑', color: 'text-[#e8b84b]', t: 'Một số salary guide dự báo lương tăng trong năm 2026', d: 'Mức tăng thực tế phụ thuộc ngành, khu vực, cấp bậc, bonus/commission và quy mô công ty.' },
          { arrow: '⚡', color: 'text-orange-400', t: 'Deal lương nên dựa trên bằng chứng đúng nghề', d: 'Báo cáo ưu tiên KPI, evidence asset và confidence score thay vì claim thị trường chung chung.' },
        ].map((s, i) => (
          <div key={i} className="flex items-start gap-3 mb-3 last:mb-0">
            <span className={`text-lg leading-none mt-0.5 font-black ${s.color}`}>{s.arrow}</span>
            <div><p className="text-sm font-sans font-bold text-[#f0ede8]">{s.t}</p><p className="text-[11px] font-sans text-[#f0ede8]/45">{s.d}</p></div>
          </div>
        ))}
      </div>

      {/* Insight tease */}
      <div className="bg-[#161b26] border border-white/10 rounded-3xl p-5 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#e8b84b]/10 rounded-full blur-2xl pointer-events-none" />
        <p className="mb-3 text-xs font-black text-[#e8b84b]">💡 Insight chuyên sâu từ báo cáo</p>
        <div className="space-y-3">
          {insightLines.map((line, i) => (
            <div key={i} className="flex gap-2.5 items-start">
              <span className="text-[#e8b84b] text-xs mt-0.5 shrink-0">▸</span>
              <p className="text-sm font-sans text-[#f0ede8]/70 leading-relaxed">{line}</p>
            </div>
          ))}
          <div className="relative">
            <div className={`flex gap-2.5 items-start ${unlocked ? '' : 'opacity-25 select-none pointer-events-none'}`}>
              <span className="text-[#e8b84b] text-xs mt-0.5 shrink-0">▸</span>
              <p className="text-sm font-sans text-[#f0ede8]/70 leading-relaxed">
                {unlocked
                  ? `Đòn bẩy quan trọng nhất là biến ${teaserProofFocus} thành bằng chứng có người xác nhận, rồi dùng nó để xin review hoặc lọc role trả cao hơn.`
                  : 'Mở khóa để xem yếu tố cụ thể giúp kéo lương lên nhóm cao hơn trong ngành của bạn.'}
              </p>
            </div>
            {!unlocked && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="bg-[#0f1219]/80 backdrop-blur-sm text-[#e8b84b] text-[10px] font-mono font-bold px-3 py-1.5 rounded-full border border-[#e8b84b]/30">🔒 Mở khóa để đọc</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Social proof — số liệu thực từ DB */}
      <div className="bg-[#0f1219] rounded-3xl p-5 shadow-sm border border-white/10">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          <p className="text-[11px] font-mono font-bold text-[#f0ede8]/70 uppercase tracking-wider">Số liệu thực tế từ hệ thống</p>
        </div>
        {/* 2 stat cards */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-[#161b26] rounded-2xl p-3 text-center border border-white/5">
            <p className="text-2xl font-black text-[#e8b84b] leading-none">{paidCount.toLocaleString('vi-VN')}</p>
            <p className="text-[10px] font-mono text-[#f0ede8]/45 mt-1">người đã mở khóa báo cáo</p>
          </div>
          <div className="bg-[#161b26] rounded-2xl p-3 text-center border border-white/5">
            <p className="text-2xl font-black text-green-400 leading-none">{dailyViews.toLocaleString('vi-VN')}</p>
            <p className="text-[10px] font-mono text-[#f0ede8]/45 mt-1">lượt quét trong 24h qua</p>
          </div>
        </div>
        <div className="bg-[#161b26] border border-[#e8b84b]/20 rounded-xl p-3">
          <p className="text-[11px] font-sans text-[#f0ede8]/70 leading-relaxed">
            <strong>Gợi ý sử dụng:</strong> lấy mốc offer, câu justify và VSPI ID để chuẩn bị buổi review/apply. Kết quả là dữ liệu tham chiếu, không phải cam kết tăng lương.
          </p>
        </div>
      </div>
      {/* Banner cảnh báo hết hạn — chỉ giữ 1 dòng nhỏ */}
      <p className="text-center text-[11px] font-mono text-orange-400/80">
        Giai đoạn beta: giữ giá 29K để thu thập phản hồi và kiểm chứng dữ liệu lương thực tế
      </p>
    </div>
  );
}

/* ═══ SALARY SIMULATOR ══════════════════════════════════════════════════════ */
function SalarySimulator({ job, currentPercent, currentSalary, dbData }: SimulatorProps) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const skills = getSimulatorSkillsForJob(job);
  const toggle = (id: string) => setChecked(p => ({ ...p, [id]: !p[id] }));
  const selected = skills.filter(s => checked[s.id]);
  const salaryBoost = selected.reduce((a, s) => a + (s.boost as number), 0);
  const pctBoost = selected.reduce((a, s) => a + (s.pctBoost as number), 0);
  const simSalary = getSimulatedSalary(currentSalary, dbData?.top_50, salaryBoost);
  const simPercent = Math.max(5, currentPercent - pctBoost);
  const ringColor = getRingColor(simPercent);
  const arc = CIRCUMFERENCE - (((100 - simPercent) / 100) * CIRCUMFERENCE);
  return (
    <div className="space-y-4">
      <div className="text-center">
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">🎮 Giả lập tương lai</p>
        <p className="text-[11px] text-slate-500">Tick thêm kỹ năng — vòng quay thay đổi thời gian thực</p>
      </div>
      <div className="flex justify-center">
        <div className="relative w-32 h-32">
          <svg className="w-full h-full -rotate-90" viewBox="0 0 140 140">
            <circle cx="70" cy="70" r={RADIUS} fill="transparent" stroke="#e2e8f0" strokeWidth="10" />
            <circle cx="70" cy="70" r={RADIUS} fill="transparent" stroke={ringColor}
              strokeWidth="10" strokeDasharray={CIRCUMFERENCE} strokeDashoffset={arc}
              strokeLinecap="round" style={{ transition: 'stroke-dashoffset 0.6s ease,stroke 0.4s' }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[9px] font-bold text-slate-400">Top</span>
            <span className="text-3xl font-black leading-none text-slate-800">{simPercent}%</span>
          </div>
        </div>
      </div>
      {selected.length > 0 && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-3 text-center">
          <p className="text-[10px] text-green-600 mb-0.5">Lương ước tính nếu có đủ kỹ năng</p>
          <p className="text-xl font-black text-green-700">{simSalary.toLocaleString('vi-VN')}đ/tháng</p>
          <p className="text-[10px] text-green-500">+{(salaryBoost * 100).toFixed(0)}% từ lương hiện tại · tăng {pctBoost} bậc percentile</p>
        </div>
      )}
      <div className="space-y-2">
        {skills.map(s => (
          <button key={s.id} onClick={() => toggle(s.id)}
            className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 transition-all text-left ${checked[s.id] ? 'border-blue-500 bg-blue-50' : 'border-slate-100 bg-white hover:border-slate-200'}`}>
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${checked[s.id] ? 'border-blue-500 bg-blue-500' : 'border-slate-300'}`}>
              {checked[s.id] && <span className="text-white text-[10px] font-black">✓</span>}
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-slate-800">{s.label}</p>
              <p className="text-[10px] text-green-600 font-semibold">+{(s.boost * 100).toFixed(0)}% lương · tăng ~{s.pctBoost} bậc percentile</p>
            </div>
          </button>
        ))}
      </div>
      {selected.length === 0 && <p className="text-center text-[11px] text-slate-400 italic">☝️ Tick kỹ năng để xem tác động thời gian thực</p>}
    </div>
  );
}

/* ═══ COMPANY TIER ══════════════════════════════════════════════════════════ */
function CompanyTierCard({ job, dbData }: Omit<ComponentProps, 'percent'>) {
  const base = dbData?.top_50 ?? 15_000_000;
  const [active, setActive] = useState<number | null>(null);
  const tiers = getWorkTiersForJob(job);
  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">🏢 So sánh theo môi trường làm việc</p>
        <p className="text-[11px] text-slate-500">Cùng vị trí {job} — thu nhập khác nhau tùy nơi trả tiền và cách đo giá trị</p>
      </div>
      {tiers.map((tier, i) => {
        const sal = Math.round(base * tier.mul);
        const isUser = i === 0;
        return (
          <button key={i} onClick={() => setActive(active === i ? null : i)}
            className={`w-full text-left rounded-2xl border-2 p-4 transition-all ${active === i ? 'border-blue-500 bg-blue-50' : isUser ? 'border-orange-200 bg-orange-50' : 'border-slate-100 bg-white'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">{tier.badge}</span>
                <div>
                  <p className="text-sm font-bold text-slate-800">{tier.name}</p>
                  {isUser && <p className="text-[9px] text-orange-600 font-bold">← VỊ TRÍ ƯỚC TÍNH CỦA BẠN</p>}
                </div>
              </div>
              <div className="text-right">
                <p className="text-base font-black" style={{ color: tier.color }}>{fmtM(sal)}</p>
                <p className="text-[9px] text-slate-400">median/tháng</p>
              </div>
            </div>
            {active === i && (
              <div className="mt-3 pt-3 border-t border-slate-200 text-[11px] text-slate-600 leading-relaxed">
                {i === 0 && 'Môi trường cơ bản, thường trả theo kinh nghiệm và cảm nhận nhiều hơn số đo.'}
                {i === 1 && 'Có quy trình và KPI rõ hơn, dễ chứng minh giá trị để tăng thu nhập.'}
                {i === 2 && 'Yêu cầu tiêu chuẩn cao hơn, nhưng đổi lại band trả thường rõ và tốt hơn.'}
                {i === 3 && <><strong className="text-blue-700">Nhóm trả cao nhất thị trường.</strong> Cần hồ sơ bằng chứng mạnh, số đo rõ và khả năng gánh scope lớn hơn.</>}
              </div>
            )}
          </button>
        );
      })}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
        <p className="text-[11px] text-amber-800 leading-relaxed">
          ⚡ <strong>Nói thẳng:</strong> Nếu bạn đang là "Top 10% ở SME" — mức lương đó có thể chỉ tương đương <strong>Top 80%</strong> ở nhóm MNC. Đổi tier công ty có thể tăng thu nhập <strong>2x</strong> mà không cần thêm năm kinh nghiệm.
        </p>
      </div>
    </div>
  );
}

/* ═══ GAP ANALYSIS ══════════════════════════════════════════════════════════ */
function GapAnalysisTab({ job, percent, dbData }: ComponentProps) {
  const gap = getGapData(job, percent, dbData);
  return (
    <div className="space-y-4">
      <p className="text-xs font-black text-slate-400 uppercase tracking-widest">🔍 Bóc tách khoảng trống năng lực</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
          <p className="text-[9px] font-black text-red-400 uppercase tracking-wider mb-2">Thị trường trả {gap.currentPays} cho</p>
          <p className="text-sm text-slate-700 leading-relaxed">{gap.currentSkill}</p>
        </div>
        <div className="bg-green-50 border border-green-100 rounded-2xl p-4">
          <p className="text-[9px] font-black text-green-500 uppercase tracking-wider mb-2">Thị trường trả {gap.topPays} cho</p>
          <p className="text-sm text-slate-700 leading-relaxed font-medium">{gap.missingSkill}</p>
        </div>
      </div>
      <div className="bg-[#1e1b4b] rounded-2xl p-5 text-white">
        <p className="text-[10px] font-black text-blue-300 uppercase tracking-widest mb-3">📅 Lộ trình bù đắp 90 ngày</p>
        {gap.roadmap.map((r, i) => (
          <div key={i} className="flex gap-3 mb-4 last:mb-0">
            <div className="shrink-0 w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-xs font-black">{i + 1}</div>
            <div>
              <p className="text-xs font-bold text-yellow-400 mb-0.5">{r.month}</p>
              <p className="text-[12px] text-blue-100 leading-relaxed">{r.action}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 text-[11px] text-slate-500 leading-relaxed">
        <strong className="text-slate-700">💡 Tại sao 90 ngày?</strong> Đây là chu kỳ review lương ngắn nhất có thể negotiate ở hầu hết doanh nghiệp Việt Nam. Mục tiêu: có số liệu đo được trước buổi review tiếp theo.
      </div>
    </div>
  );
}

/* ═══ EXPERT ROLEPLAY ══════════════════════════════════════════════════════ */
function AIRoleplay({ job, percent, dbData }: ComponentProps) {
  const isOwner = /chủ|kinh doanh|tự do|founder|owner/i.test(job);
  const initialMessage = isOwner
    ? `[Chủ nhà nhíu mày nhìn bạn] "Cô/chú nghe nói cháu muốn bàn lại về hợp đồng thuê nhà? Tình hình dạo này buôn bán chậm lắm sao?"`
    : `[Sếp ngẩng đầu nhìn bạn qua kính] "Ừ, vào đi. Nghe bảo anh/chị muốn nói chuyện gì đó về... lương phải không?"`;
  const uiTitle = isOwner ? "🎯 Mô phỏng đàm phán với Chủ nhà" : "🎯 Mô phỏng đàm phán với Sếp";
  const uiSubtitle = isOwner ? "AI dựng buổi thương lượng giảm 20% tiền mặt bằng mùa thấp điểm" : "AI dựng buổi xin tăng lương thật — phản biện như sếp đang ngồi trước mặt";
  const uiHintText = isOwner ? `Thử: "Dạ lượng khách giảm 20%. Cháu muốn đề xuất hỗ trợ giảm 10% tiền nhà trong 6 tháng tới..."` : `Thử: "Theo báo cáo VSPI 2026, median ngành mình là ${fmtM(dbData?.top_50)} — em đang ở Top ${percent}%"`;
  const uiRoleName = isOwner ? "🏠 Chủ nhà" : "👔 Sếp";
  const [messages, setMessages] = useState<{ role: string, content: string }[]>([{ role: 'assistant', content: initialMessage }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim(); setInput('');
    const newMsgs = [...messages, { role: 'user', content: userMsg }];
    setMessages(newMsgs); setLoading(true);
    try {
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isOwner, job, messages: newMsgs.map(m => ({ role: m.role, content: m.content })) }) });
      const data = await res.json();
      let reply = '';
      if (data.error) { reply = isOwner ? "[Chủ nhà đang bận, cháu quay lại sau nhé...]" : "[Sếp đang bận họp đột xuất, nói chuyện sau nhé...]"; }
      else { reply = data.content?.[0]?.text ?? (isOwner ? "Cháu trình bày rõ hơn xem nào, kế hoạch bù đắp rủi ro là gì?" : "Anh/chị nói cụ thể hơn về con số mang lại cho công ty đi?"); }
      setMessages(p => [...p, { role: 'assistant', content: reply }]);
    } catch { setMessages(p => [...p, { role: 'assistant', content: '[Lỗi kết nối — vui lòng thử lại]' }]); }
    setLoading(false);
  };
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);
  return (
    <div className="space-y-3">
      <div className="text-center">
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">{uiTitle}</p>
        <p className="text-[11px] text-slate-500">{uiSubtitle}</p>
      </div>
      <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3">
        <p className="text-[10px] font-bold text-amber-700 mb-1">💡 Mẹo để thuyết phục</p>
        <p className="text-[10px] text-amber-600"><em>{uiHintText}</em></p>
      </div>
      <div className="bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden">
        <div className="p-1 bg-slate-100 flex items-center gap-2 px-3">
          <div className="w-2 h-2 rounded-full bg-red-400" /><div className="w-2 h-2 rounded-full bg-yellow-400" /><div className="w-2 h-2 rounded-full bg-green-400" />
          <p className="text-[9px] text-slate-400 ml-1 font-mono">simulation_bot.exe</p>
        </div>
        <div className="p-3 max-h-64 overflow-y-auto space-y-2">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-[12px] leading-relaxed ${m.role === 'user' ? 'bg-blue-600 text-white rounded-br-md' : 'bg-white text-slate-700 border border-slate-200 rounded-bl-md'}`}>
                {m.role === 'assistant' && <span className="text-[9px] font-bold text-slate-400 block mb-0.5">{uiRoleName}</span>}
                {m.content}
              </div>
            </div>
          ))}
          {loading && <div className="flex justify-start"><div className="bg-white border border-slate-200 rounded-2xl rounded-bl-md px-4 py-2"><div className="flex gap-1">{[0, 1, 2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div></div></div>}
          <div ref={bottomRef} />
        </div>
        <div className="p-3 border-t border-slate-100 flex gap-2">
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()}
            placeholder={isOwner ? "Trình bày vấn đề với cô/chú chủ nhà..." : "Xin sếp cho em trao đổi về lương..."}
            className="flex-1 bg-white text-gray-900 font-medium placeholder-gray-500 border border-gray-300 rounded-full px-5 py-3 focus:outline-none focus:ring-2 focus:ring-[#e8b84b] shadow-inner" />
          <button onClick={send} disabled={loading} className="bg-blue-600 text-white text-[11px] font-bold px-3 py-2 rounded-xl disabled:opacity-50 hover:bg-blue-700 transition-all">Gửi</button>
        </div>
      </div>
      <button onClick={() => setMessages([{ role: 'assistant', content: initialMessage }])} className="w-full text-center text-[10px] text-slate-400 hover:text-red-500 transition-colors py-1">🔄 Reset — thử lại từ đầu</button>
    </div>
  );
}

/* ═══ EVIDENCE BRIEF ════════════════════════════════════════════════════════ */
function EvidenceBrief({ fullName, job, percent, dbData }: ComponentProps) {
  const printRef = useRef<HTMLDivElement | null>(null);
  const handlePrint = () => {
    const content = printRef.current?.innerHTML; if (!content) return;
    const w = window.open('', '', 'width=800,height=900');
    if (!w) return;
    w.document.write(`<html><head><title>VSPI Evidence Brief</title><style>body{font-family:Georgia,serif;margin:40px;color:#1e293b;line-height:1.7}h1{font-size:22px;font-weight:bold;margin-bottom:4px}table{width:100%;border-collapse:collapse;margin:20px 0}td,th{padding:10px 14px;border:1px solid #e2e8f0;font-size:13px}th{background:#f8fafc;font-weight:bold;text-align:left}.footer{margin-top:40px;font-size:10px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:16px}@media print{body{margin:20px}}</style></head><body>${content}</body></html>`);
    w.document.close(); w.focus(); setTimeout(() => { w.print(); w.close(); }, 300);
  };
  return (
    <div className="space-y-4">
      <p className="text-xs font-black text-slate-400 uppercase tracking-widest">📋 Hồ sơ bằng chứng thị trường</p>
      <p className="text-[11px] text-slate-500">Thiết kế để in ra đặt lên bàn HR. Ngôn ngữ học thuật, số liệu trích dẫn chuẩn.</p>
      <div ref={printRef} className="bg-white border border-slate-200 rounded-2xl p-6 text-slate-800">
        <div className="border-b-2 border-slate-800 pb-4 mb-4">
          <h1 className="text-lg font-black text-slate-900">VSPI Executive Summary</h1>
          <p className="text-[10px] uppercase tracking-widest text-slate-400 mt-0.5">Vietnam Salary Percentile Index · Báo cáo Cá nhân 2026</p>
          <div className="mt-2 flex gap-2 flex-wrap">
            <span className="text-[10px] bg-[#1e1b4b] text-white px-2 py-0.5 rounded-full font-bold">Họ và tên: {fullName}</span>
            <span className="text-[10px] bg-[#1e1b4b] text-white px-2 py-0.5 rounded-full font-bold">Vị trí: {job}</span>
            <span className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded-full font-bold">{formatPercentDisplay(percent)} thị trường</span>
            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">Cấp ngày: {TODAY}</span>
          </div>
        </div>
        <p className="text-[11px] text-slate-600 leading-relaxed mb-4">Báo cáo này dùng benchmark lương theo nghề, salary guide công khai, dữ liệu tuyển dụng và bối cảnh lực lượng lao động Việt Nam từ NSO/GSO để ước tính vị trí thu nhập của ứng viên trong ngành <strong>{job}</strong>. Kết quả là khoảng tham chiếu có confidence score, không phải xếp hạng tuyệt đối trên toàn bộ 53.3M lao động.</p>
        <table className="w-full text-[11px] border-collapse mb-4">
          <thead><tr className="bg-slate-50"><th className="text-left p-2 border border-slate-200">Chỉ số</th><th className="text-left p-2 border border-slate-200">Giá trị</th><th className="text-left p-2 border border-slate-200">Nguồn</th></tr></thead>
          <tbody>
            {[
              ['Lương trung vị ngành (Median P50)', fmtM(dbData?.top_50), 'Benchmark trực tiếp / salary guide gần nhất'],
              ['Lương nhóm khá (P80 — Top 20%)', fmtM(dbData?.top_20), 'VSPI percentile interpolation'],
              ['Lương nhóm xuất sắc (P90 — Top 10%)', formatBenchmarkCell({ accessLevel: 'paid29', value: dbData?.top_10, label: 'top10' }).text, 'Salary guide + job-market cross-check'],
              ['Lương nhóm Elite (P95 — Top 5%)', formatBenchmarkCell({ accessLevel: 'paid29', value: dbData?.top_5, label: 'top5' }).text, 'VSPI estimate; executive/bonus cần đọc theo confidence'],
              ['Vị trí ứng viên trong phân phối', `Top ${percent}%`, 'VSPI Calculation Engine'],
              ['Lương tối thiểu vùng 2026 (NĐ 293/2025)', '+7.2% bình quân', 'Chính phủ Việt Nam 2025'],
              ['Thu nhập bình quân lao động Q3/2025', '8.4M VNĐ/tháng', 'NSO/GSO Q3/2025'],
            ].map(([k, v, src], i) => (
              <tr key={i}><td className="p-2 border border-slate-200">{k}</td><td className="p-2 border border-slate-200 font-bold text-blue-700">{v}</td><td className="p-2 border border-slate-200 text-slate-500 text-[10px]">{src}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="text-[10px] text-slate-500 leading-relaxed border-t border-slate-100 pt-3"><strong>Phương pháp:</strong> Dữ liệu được chuẩn hóa theo mô hình Normal Distribution, tổng hợp từ 6 nguồn báo cáo chính thống, cập nhật theo chu kỳ quý. VSPI (Vietnam Salary Percentile Index) là chỉ số phát triển độc lập dựa trên dữ liệu thứ cấp công khai.</p>
      </div>
      <button onClick={handlePrint} className="w-full bg-[#1e1b4b] text-white font-bold py-3.5 rounded-2xl text-sm hover:bg-[#312e81] transition-all flex items-center justify-center gap-2">🖨️ In PDF — Đặt lên bàn HR ngay</button>
    </div>
  );
}

/* ═══ VSPI CERTIFICATE ══════════════════════════════════════════════════════ */
function VSPICertificate({ fullName, job, percent, vspiId, elementId = 'vspi-certificate' }: CertificateProps) {
  const percentileLabel = formatPercentDisplay(percent);
  const isUnderTop80 = percent >= 100;
  return (
    <div className="space-y-4">
      <div id={elementId} className="relative overflow-hidden rounded-2xl border border-[#d7b56d]/70 bg-[#0b111a] p-5 text-[#f0ede8] shadow-2xl shadow-black/30">
        <div className="rounded-xl border border-white/12 bg-[#111722] p-5">
          <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
            <div className="min-w-0">
              <p className="text-[11px] font-black text-[#e8b84b]">Top Lương Verified</p>
              <p className="mt-1 text-[10px] leading-relaxed text-[#f0ede8]/48">Vietnam Salary Percentile Index · Q1/2026</p>
            </div>
            <div className="shrink-0 rounded-full border border-[#22c55e]/45 bg-[#0a2a1a] px-3 py-1 text-[10px] font-black text-[#22c55e]">
              Đã xác thực
            </div>
          </div>

          <div className="grid min-w-0 gap-5 py-6 md:grid-cols-[minmax(0,1fr)_11rem] md:items-end">
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-[#f0ede8]/45">Chứng nhận vị trí thu nhập cho</p>
              <h3 className="mt-2 break-words text-2xl font-black leading-tight text-white sm:text-3xl">{fullName}</h3>
              <p className="mt-2 break-words text-sm font-bold leading-snug text-[#e8b84b]">{job}</p>
              <p className="mt-5 text-[12px] font-bold text-[#f0ede8]/52">Vị trí trong phân phối lương</p>
              <div className="mt-1 flex flex-wrap items-end gap-2">
                {isUnderTop80 ? (
                  <span className="max-w-full break-words text-[2.25rem] font-black leading-none text-[#ff4d57] sm:text-[2.75rem]">{percentileLabel}</span>
                ) : (
                  <>
                    <span className="text-2xl font-black leading-none text-[#f0ede8]">Top</span>
                    <span className="text-[4rem] font-black leading-none text-[#ff4d57] sm:text-[4.25rem]">{percent}%</span>
                  </>
                )}
              </div>
            </div>
            <div className="rounded-xl border border-[#e8b84b]/30 bg-[#0b111a] p-4">
              <p className="text-[10px] font-bold text-[#f0ede8]/45">VSPI ID</p>
              <p className="mt-2 break-all text-[12px] font-black leading-relaxed text-[#e8b84b]">{vspiId}</p>
              <p className="mt-4 text-[10px] font-bold text-[#f0ede8]/45">Ngày cấp</p>
              <p className="mt-1 text-[12px] font-black text-white">{TODAY}</p>
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-[#0b111a] p-4">
            <p className="text-[11px] leading-relaxed text-[#f0ede8]/62">
              Vị trí thu nhập được Top Lương đối chiếu theo nhóm nghề, kinh nghiệm và khu vực. Đây là ước tính tham chiếu có VSPI ID để kiểm tra lại tại topluong.com/verify, không phải chứng nhận của cơ quan nhà nước hoặc bên thứ ba.
            </p>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <div className="rounded-xl border border-white/8 bg-[#0b111a] px-3 py-2">
              <p className="text-[10px] text-[#f0ede8]/40">Chỉ số</p>
              <p className="mt-1 text-[11px] font-black text-white">VSPI</p>
            </div>
            <div className="rounded-xl border border-white/8 bg-[#0b111a] px-3 py-2">
              <p className="text-[10px] text-[#f0ede8]/40">Nguồn dữ liệu</p>
              <p className="mt-1 text-[11px] font-black text-white">{CERTIFICATE_SOURCE_LINE}</p>
            </div>
            <div className="rounded-xl border border-white/8 bg-[#0b111a] px-3 py-2">
              <p className="text-[10px] text-[#f0ede8]/40">Xác thực</p>
              <p className="mt-1 text-[11px] font-black text-white">topluong.com/verify</p>
            </div>
          </div>
        </div>
      </div>
      <div className="bg-[#161b26] border border-white/10 rounded-2xl p-4 flex items-start gap-3">
        <span className="text-lg shrink-0">🔐</span>
        <div>
          <p className="text-[11px] font-sans font-bold text-[#f0ede8] mb-1">Xác thực bằng VSPI ID</p>
          <p className="text-[10px] font-sans text-[#f0ede8]/45 leading-relaxed">Vào topluong.com/verify và nhập VSPI ID để kiểm tra: ID · Ngành · Top% · Ngày cấp.</p>
        </div>
      </div>
      <div className="bg-[#0f1219] border border-white/10 rounded-2xl p-4">
        <p className="text-[11px] font-mono font-bold text-[#e8b84b] uppercase tracking-widest mb-3">📌 Cách dùng chứng nhận này</p>
        {['Đính kèm email xin tăng lương + Evidence Brief để tăng độ tin cậy', 'Khi HR hỏi "Số liệu lấy từ đâu?" — đưa VSPI ID để họ tự verify', 'Dùng khi negotiate với công ty mới để anchor mức lương kỳ vọng', 'Lưu lại — quét lại sau 3–6 tháng để track tiến độ của bạn'].map((s, i) => (
          <div key={i} className="flex gap-2 mb-2 last:mb-0"><span className="text-[#e8b84b] text-xs mt-0.5 shrink-0">✓</span><p className="text-[11px] font-sans text-[#f0ede8]/70 leading-relaxed">{s}</p></div>
        ))}
      </div>
    </div>
  );
}

/* ═══ ELITE LETTER ══════════════════════════════════════════════════════════ */
function EliteLetter({ fullName, job, percent }: EliteProps) {
  if (percent > 10) return null;
  const percentileLabel = formatPercentDisplay(percent);
  return (
    <div className="bg-[#161b26] border border-[#e8b84b]/40 rounded-3xl p-6 relative overflow-hidden shadow-lg shadow-[#e8b84b]/5">
      <div className="absolute top-0 right-0 text-6xl opacity-5 pointer-events-none">🏆</div>
      <div className="flex items-center gap-2 mb-3"><span className="text-2xl">🎖️</span><p className="text-[11px] font-mono font-black text-[#e8b84b] uppercase tracking-widest">Thư chúc mừng từ Founder</p></div>
      <p className="text-sm font-sans text-[#f0ede8] leading-relaxed mb-3">Chào <strong className="text-[#e8b84b]">{fullName}</strong>, bạn vừa được xác nhận thuộc <strong className="text-[#e8b84b]">{percentileLabel}</strong> ngành <strong className="text-[#e8b84b]">{job}</strong> tại Việt Nam.</p>
      <p className="text-sm font-sans text-[#f0ede8]/70 leading-relaxed mb-3">Chỉ <strong>{percent === 5 ? '1 trong 20' : '1 trong 10'}</strong> người cùng ngành đạt được cột mốc này. Bạn đang thuộc nhóm <strong>nhân sự tinh hoa định hình lại thị trường 2026.</strong></p>
      <p className="text-sm font-sans text-[#f0ede8]/70 leading-relaxed mb-5">Cộng đồng <strong className="text-[#e8b84b]">VSPI Elite</strong> — group kín chỉ dành cho Top 20% trở lên — đang chờ bạn. Networking, chia sẻ cơ hội, tăng tốc cùng nhau.</p>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-[#e8b84b] flex items-center justify-center text-[#0a0c10] font-black text-sm">V</div>
        <div><p className="text-[11px] font-sans font-black text-[#f0ede8]">Nguyễn Trọng Văn</p><p className="text-[9px] font-sans text-[#f0ede8]/45">Founder · VSPI Vietnam</p></div>
        <div className="ml-auto text-right"><div className="text-[10px] text-[#f0ede8]/45 font-mono italic">Ký tên điện tử</div><div className="text-base font-black text-[#e8b84b] italic" style={{ fontFamily: 'Georgia,serif' }}>NTV</div></div>
      </div>
      <div className="bg-[#0a0c10] border border-[#e8b84b]/20 rounded-2xl p-3 flex items-center gap-3">
        <span className="text-xl">💬</span>
        <div><p className="text-[10px] font-mono font-bold text-[#e8b84b]">Tham gia VSPI Elite Community</p><p className="text-[10px] font-sans text-[#f0ede8]/70">Nhắn VSPI ELITE + VSPI ID vào Zalo: <strong className="text-[#e8b84b]">0915.662.876</strong></p></div>
      </div>
    </div>
  );
}

/* ═══ PREMIUM REPORT ════════════════════════════════════════════════════════ */
export function PremiumReport({ fullName, job, percent, dbData, vspiId, salary }: PremiumProps) {
  const [tab, setTab] = useState('sim');
  const tabs = [{ id: 'sim', icon: '🎮', label: 'Simulator' }, { id: 'tier', icon: '🏢', label: 'Môi trường' }, { id: 'gap', icon: '🔍', label: 'Gap 90 ngày' }, { id: 'boss', icon: '🎯', label: 'Mô phỏng deal lương' }, { id: 'brief', icon: '📋', label: 'Evidence' }, { id: 'cert', icon: '📜', label: 'Verified' }];
  const isOwner = /chủ|kinh doanh|tự do|founder|owner/i.test(job);
  // Career Compass context — drives all dynamic content in the report
  const compass: CareerCompassContext = getCareerCompassContext(job, salary, percent, dbData?.industry);
  const marketPosition = buildMarketPositionDisplay({ salary, percent, dbData });
  const reportBandLabel = marketPosition?.currentBandLabel ?? compass.bandLabel;
  const reportBandRange = marketPosition?.currentBandRange ?? compass.currentBandRange;
  const reportTargetSalary = marketPosition?.strategicTargetSalary ?? Math.max(compass.nextBandMin, dbData?.top_50 || 0);
  const reportGap = Math.max(0, reportTargetSalary - salary);
  const formatReportMillion = (value: number) => value > 0 ? `${(value / 1_000_000).toFixed(1)} triệu` : '0 triệu';
  const reportTargetFmt = formatReportMillion(reportTargetSalary);
  const reportGapFmt = formatReportMillion(reportGap);
  const reportTargetName = marketPosition?.strategicTargetLabel ? `mốc ${marketPosition.strategicTargetLabel}` : 'band tiếp theo';
  return (
    <div className="space-y-8">
      <div className="bg-[#0f1219] rounded-[2rem] overflow-hidden shadow-2xl border border-white/10 shadow-[#e8b84b]/5">
        <div className="bg-[#161b26] p-5 text-[#f0ede8] flex justify-between items-start border-b border-[#e8b84b]/20">
          <div>
            <span className="text-[10px] bg-[#e8b84b]/10 border border-[#e8b84b]/30 text-[#e8b84b] font-mono font-black px-2 py-0.5 rounded-full">✓ Báo cáo lương 29K</span>
            <h3 className="text-base font-serif font-black mt-2 text-[#e8b84b]">Công cụ phân tích & Hành động</h3>
            <p className="text-[#f0ede8]/45 font-sans text-[10px]">{fullName} · {job} · {formatPercentDisplay(percent)}</p>
          </div>
        </div>
        <div className="flex border-b border-white/10 overflow-x-auto bg-[#0a0c10]">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 min-w-0 py-2.5 px-1 text-[9px] font-mono font-bold flex flex-col items-center gap-0.5 transition-all border-b-2 ${tab === t.id ? 'border-[#e8b84b] text-[#e8b84b] bg-[#161b26]' : 'border-transparent text-[#f0ede8]/45 hover:text-[#f0ede8]/70 hover:bg-[#161b26]/50'}`}>
              <span className="text-sm">{t.icon}</span>
              <span className="truncate w-full text-center leading-tight">{t.label}</span>
            </button>
          ))}
        </div>
        <div className="p-5">
          {tab === 'sim' && <SalarySimulator fullName={fullName} job={job} currentPercent={percent} currentSalary={salary} dbData={dbData} />}
          {tab === 'tier' && <CompanyTierCard fullName={fullName} job={job} dbData={dbData} />}
          {tab === 'gap' && <GapAnalysisTab fullName={fullName} job={job} percent={percent} dbData={dbData} />}
          {tab === 'boss' && <AIRoleplay fullName={fullName} job={job} percent={percent} dbData={dbData} />}
          {tab === 'brief' && <EvidenceBrief fullName={fullName} job={job} percent={percent} dbData={dbData} />}
          {tab === 'cert' && <VSPICertificate fullName={fullName} job={job} percent={percent} vspiId={vspiId} elementId="vspi-certificate-toolkit" />}
        </div>
      </div>

      {/* Báo cáo native DOM */}
      <div className="bg-[#0f1219] rounded-[2rem] p-8 md:p-12 shadow-2xl border border-white/10 text-[#f0ede8]/80 text-justify font-sans leading-relaxed">
        <div className="text-center pb-8 border-b border-white/10 mb-8">
          <h1 className="text-3xl md:text-4xl font-serif font-black text-[#e8b84b] mb-3 uppercase tracking-widest">Báo cáo lương 29K</h1>
          <p className="text-sm md:text-lg text-[#f0ede8]/70 italic">Benchmark lương, mốc neo và hướng hành động 2026</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <span className="text-[11px] font-mono font-bold bg-[#161b26] border border-white/10 px-3 py-1.5 rounded-full text-[#e8b84b]">Mã: {vspiId}</span>
            <span className="text-[11px] font-mono font-bold bg-[#161b26] border border-white/10 px-3 py-1.5 rounded-full text-[#e8b84b]">Ngày: {TODAY}</span>
            <span className="text-[11px] font-mono font-bold bg-[#161b26] border border-white/10 px-3 py-1.5 rounded-full text-[#e8b84b]">Ngành: {job}</span>
          </div>
        </div>

        <div>
          <h2 className="text-xl md:text-2xl font-serif font-semibold text-[#e8b84b] mb-6 border-l-4 border-[#e8b84b] pl-4 tracking-normal text-left">Chương 1: Xác thực vị trí thu nhập hiện tại và bức tranh thực tế</h2>
          <p className="mb-4">Chào bạn,</p>
          <p className="mb-6 text-[#f0ede8]/70">Trước tiên, tôi muốn gửi lời chúc mừng chân thành nhất vì bạn đã đưa ra một quyết định xuất sắc: Đầu tư để thấu hiểu giá trị thực sự của bản thân trên thị trường lao động. Rất nhiều người đi làm 5 năm, 10 năm vẫn mù mờ về giá trị của mình, dẫn đến việc bị ép giá và đánh mất hàng trăm triệu đồng tiền lương mỗi năm. Bằng việc cầm trên tay bản báo cáo này, bạn đã chính thức bước ra khỏi vùng tối đó.</p>
          <div className="bg-[#161b26] p-5 rounded-2xl border border-white/10 mb-6">
            <h3 className="font-sans font-semibold text-[#f0ede8] mb-3 tracking-normal">Hồ sơ đối chiếu thu nhập (Top Lương Verified)</h3>
            <ul className="list-disc pl-5 space-y-2 text-[#f0ede8]/70 text-sm">
              <li><strong>Mã xác thực điện tử:</strong> <span className="text-[#e8b84b] font-mono">{vspiId}</span></li>
              <li><strong>Vị trí hiện tại trong phân phối thu nhập:</strong> Top <span className="text-[#e8b84b] font-mono">{percent}%</span> {compass.jobGroup} tại Việt Nam.</li>
              <li><strong>Nhóm nghề xác định:</strong> <span className="text-[#e8b84b]">{compass.jobGroup}</span> — Band lương: <span className="text-[#e8b84b]">{reportBandLabel}</span></li>
              <li><strong>Thu nhập hiện tại:</strong> <span className="text-[#e8b84b] font-mono">{compass.salaryFmt}/tháng</span> · Dải benchmark thực: <span className="text-[#e8b84b]">{reportBandRange}/tháng</span></li>
              <li><strong>Ngày cấp chứng nhận:</strong> <span className="text-[#e8b84b] font-mono">{TODAY}</span></li>
            </ul>
          </div>
          <p className="mb-4 font-bold text-[#f0ede8]">Giải mã vị trí "{formatPercentDisplay(percent)}": Bức tranh thực tế ngành {compass.jobGroup}</p>
          <p className="mb-4 text-[#f0ede8]/70">
            Với thu nhập <strong className="text-[#e8b84b]">{compass.salaryFmt}/tháng</strong>, bạn đang ở mốc <strong className="text-[#e8b84b]">{reportBandLabel}</strong> trong ngành {compass.jobGroup}. {percent >= 100 ? 'Điểm cần làm ngay là vượt mốc Top 80% để thoát vùng lương thấp của ngành.' : <>Top {percent}% nghĩa là bạn đang cao hơn khoảng {100 - percent}% người cùng nhóm nghề/khu vực/kinh nghiệm; số Top càng nhỏ thì vị trí càng cao.</>}
          </p>
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 mb-4">
            <p className="text-red-300 font-bold text-sm mb-2">⚠️ Nỗi đau đặc thù của band này:</p>
            <p className="text-[#f0ede8]/80 text-sm leading-relaxed">{compass.painPoint}</p>
          </div>
          <p className="text-[#f0ede8]/70">
            Để chạm {reportTargetName} (<strong className="text-[#e8b84b]">{reportTargetFmt}/tháng</strong>), bạn cần thêm <strong className="text-[#e8b84b]">{reportGapFmt}/tháng</strong> — tương đương <strong className="text-[#e8b84b]">{(reportGap * 12).toLocaleString('vi-VN')}đ/năm</strong>. Đây là cùng một khoảng cách với cảnh báo phía trên, không phải một con số khác. Chương 2 sẽ chỉ ra con đường cụ thể.
          </p>
        </div>

        {isOwner ? (
          <>
            <div className="pt-10 mt-10 border-t border-white/10">
              <h2 className="text-xl md:text-2xl font-serif font-semibold text-[#e8b84b] mb-6 border-l-4 border-[#e8b84b] pl-4 tracking-normal text-left">Chương 2: Định hướng tối ưu hóa mô hình & tăng trưởng lợi nhuận</h2>
              <p className="mb-4 text-[#f0ede8]"><strong>Mục tiêu Kinh doanh: Tối ưu hóa lợi nhuận ròng</strong></p>
              <p className="mb-4 text-[#f0ede8]/70">
                Thu nhập hiện tại của bạn là <strong className="text-[#e8b84b]">{compass.salaryFmt}/tháng</strong>. Để chạm {reportTargetName} (<strong className="text-[#e8b84b]">{reportTargetFmt}/tháng</strong>), bạn cần tăng thêm <strong className="text-[#e8b84b]">{reportGapFmt}/tháng</strong> — không phải bằng cách làm việc nhiều hơn, mà bằng cách tối ưu hóa mô hình kinh doanh.
              </p>
              <div className="bg-[#161b26] border border-[#e8b84b]/20 rounded-2xl p-4 mb-6">
                <p className="text-[10px] font-mono font-bold text-[#e8b84b] uppercase tracking-widest mb-2">💡 Cơ hội đang mở ra</p>
                <p className="text-sm text-[#f0ede8]/80 leading-relaxed">{compass.opportunity}</p>
              </div>
              <p className="mb-3 text-[#f0ede8]"><strong>Ba Nút Thắt Trọng Yếu Đang Ăn Mòn Lợi Nhuận Của Bạn:</strong></p>
              <ol className="list-decimal pl-5 space-y-3 mb-8 text-[#f0ede8]/70 text-sm">
                <li><strong>Làm thuê cho chính mình (Khổ chủ):</strong> Thiếu quy trình đóng gói (SOP), mọi quyết định lớn nhỏ đều phải qua tay bạn.</li>
                <li><strong>Chi phí cố định (Fixed Cost) quá cao:</strong> Tiền mặt bằng và nhân sự lạm vào biên lợi nhuận ròng.</li>
                <li><strong>Marketing thủ công, thụ động:</strong> Chỉ chờ khách quen hoặc phụ thuộc vào nền tảng giao hàng thu phí cắt cổ.</li>
              </ol>
              <div className="space-y-4">
                {[
                  { title: 'Chặng 1 (Tháng 1 - Tháng 3): Cắt Giảm Chi Phí & Tối Ưu Vận Hành', items: ['Trọng tâm: Rà soát lại P&L. Tìm ra 20% nhóm chi phí đang gây lãng phí nhất và cắt giảm.', 'Hành động: Đàm phán lại giá với nhà cung cấp. Tối ưu hóa ca làm việc của nhân sự part-time.', 'Tiêu chí nghiệm thu: Biên lợi nhuận ròng tăng thêm 5% - 10% trên cùng một mức doanh thu.'] },
                  { title: '⚙️ Chặng 2 (Tháng 4 - Tháng 6): Tăng năng suất Marketing & CSKH', items: ['Trọng tâm: Dùng quy trình và mẫu kịch bản để giảm việc lặp lại trong tìm kiếm và giữ chân khách hàng.', 'Hành động: Lên lịch nội dung Social Media, chuẩn hóa kịch bản trả lời khách và phân loại lead theo khả năng mua.', 'Tiêu chí nghiệm thu: Tiết kiệm chi phí 1 nhân sự Marketing nhưng doanh thu Online tăng 30%.'] },
                  { title: '⚙️ Chặng 3 (Tháng 7 - Tháng 12): Đóng Gói Quy Trình (SOP) & Nhân Bản', items: ['Trọng tâm: Chuẩn hóa để thoát khỏi vai trò điều hành trực tiếp.', 'Hành động: Viết lại toàn bộ quy trình dịch vụ thành bộ tài liệu đào tạo tiêu chuẩn.', 'Tiêu chí nghiệm thu: Bạn có thể vắng mặt 1 tuần mà doanh số không sụt giảm.'] },
                ].map((c, i) => (
                  <div key={i} className="bg-[#161b26] p-5 rounded-2xl border border-white/10">
                    <h3 className="font-semibold text-[#f0ede8] mb-3 tracking-normal">{c.title}</h3>
                    <ul className="list-disc pl-5 space-y-2 text-sm text-[#f0ede8]/70">{c.items.map((item, j) => <li key={j}>{item}</li>)}</ul>
                  </div>
                ))}
              </div>
            </div>
            <div className="pt-10 mt-10 border-t border-white/10">
              <h2 className="text-xl md:text-2xl font-serif font-semibold text-[#e8b84b] mb-6 border-l-4 border-[#e8b84b] pl-4 tracking-normal text-left">Chương 3: Chiến lược đàm phán giảm chi phí & tăng biên lợi nhuận</h2>
              <p className="mb-8 text-[#f0ede8]/70">Trong kinh doanh, một đồng chi phí tiết kiệm được chính là một đồng lợi nhuận ròng rơi thẳng vào túi bạn.</p>
              <div className="space-y-8">
                <div>
                  <p className="font-bold text-[#f0ede8] mb-2">Kịch bản 1: Đàm phán giảm tiền thuê mặt bằng</p>
                  <blockquote className="bg-[#161b26] border-l-2 border-[#e8b84b] p-5 rounded-r-2xl italic text-[#f0ede8]/70 text-sm leading-relaxed">"Cháu chào cô/chú. Hiện tại tình hình kinh tế chung đang chậm lại, lượng khách sụt giảm 20% so với trước. Cháu rất muốn duy trì hợp đồng lâu dài 3-5 năm tới với nhà mình vì vị trí quá tốt. Để hai bên cùng đồng hành vượt qua giai đoạn này, cháu muốn đề xuất cô/chú hỗ trợ giảm 10% tiền nhà trong 6 tháng tới. Sau 6 tháng, cháu sẽ quay lại mức giá cũ. Cô/chú xem xét giúp cháu nhé!"</blockquote>
                </div>
                <div>
                  <p className="font-bold text-[#f0ede8] mb-2">Kịch bản 2: Đàm phán chiết khấu với Nhà cung cấp</p>
                  <blockquote className="bg-[#161b26] border-l-2 border-[#e8b84b] p-5 rounded-r-2xl italic text-[#f0ede8]/70 text-sm leading-relaxed">"Chào anh/chị. Cửa hàng bên em đang lên kế hoạch tăng gấp rưỡi sản lượng nguyên liệu nhập khẩu trong quý tới. Em đã làm việc với bên anh/chị được 1 năm, thanh toán luôn chuẩn chỉ đúng hạn. Tuy nhiên, em cũng vừa nhận được báo giá từ một số xưởng khác với mức chiết khấu tốt hơn 15%. Em muốn hỏi xem bên mình có chính sách nâng mức chiết khấu cho khách VIP lên thêm 10% không?"</blockquote>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="pt-10 mt-10 border-t border-white/10">
              <h2 className="text-xl md:text-2xl font-serif font-semibold text-[#e8b84b] mb-6 border-l-4 border-[#e8b84b] pl-4 tracking-normal text-left">Chương 2: Phân tích khoảng trống kỹ năng & mục tiêu 12 tháng tới</h2>
              <p className="mb-3 text-[#f0ede8]"><strong>Mục tiêu tài chính: Từ mức hiện tại → {reportTargetName}</strong></p>
              <p className="mb-4 text-[#f0ede8]/70">
                Với {compass.salaryFmt}/tháng hiện tại, bạn cần thêm <strong className="text-[#e8b84b]">{reportGapFmt}/tháng</strong> để chạm <strong className="text-[#e8b84b]">{reportTargetFmt}/tháng</strong>. Đây là con số cụ thể, đồng nhất với cảnh báo khoảng cách phía trên.
              </p>
              {/* Market insight đặc thù ngành */}
              <div className="bg-[#161b26] border border-[#e8b84b]/20 rounded-2xl p-4 mb-6">
                <p className="text-[10px] font-mono font-bold text-[#e8b84b] uppercase tracking-widest mb-2">💡 Insight thị trường ngành {compass.jobGroup}</p>
                <p className="text-sm text-[#f0ede8]/80 leading-relaxed">{compass.marketInsight}</p>
              </div>
              <p className="mb-3 text-[#f0ede8]"><strong>Khoảng trống kỹ năng lớn nhất ngành {compass.jobGroup}:</strong></p>
              <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 mb-6">
                <p className="text-sm text-[#f0ede8]/80 leading-relaxed">{compass.topSkillGap}</p>
              </div>
              <p className="mb-3 text-[#f0ede8]"><strong>Cơ hội đang mở ra cho band của bạn:</strong></p>
              <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4 mb-6">
                <p className="text-sm text-[#f0ede8]/80 leading-relaxed">{compass.opportunity}</p>
              </div>
              <p className="mb-3 text-[#f0ede8]"><strong>Lộ trình 3 chặng bứt phá (12 tháng):</strong></p>
              <div className="space-y-4">
                {[
                  { title: 'Chặng 1 (Tháng 1 - Tháng 3): Trui rèn Năng lực Chuyên môn Cốt lõi', items: ['Cần học gì: Trở thành người làm việc "ít lỗi nhất". Nắm vững công cụ chuyên ngành, SOP, và kỹ năng phân tích dữ liệu cơ bản.', 'Học bằng cách nào: Nhận thêm việc khó có tiêu chí đo. Đăng ký các khóa học chuyên sâu trên Coursera/Udemy.', 'Tiêu chí nghiệm thu: Giảm 80% lỗi sai vặt. Có khả năng tự chủ hoàn thành dự án nhỏ từ A đến Z.'] },
                  { title: '🌍 Chặng 2 (Tháng 4 - Tháng 6): Vũ khí Ngoại ngữ', items: ['Cần học gì: Tiếng Anh thương mại. MNCs có sẵn quỹ lương cao gấp 2-3 lần SME.', 'Học bằng cách nào: Tập trung 100% vào Speaking/Listening. Luyện shadowing TED Talk. Target: TOEIC 700+.', 'Tiêu chí nghiệm thu: Phỏng vấn trực tiếp bằng Tiếng Anh 30 phút với Hiring Manager mà không bị vấp.'] },
                  { title: '⚙️ Chặng 3 (Tháng 7 - Tháng 12): Đột phá bằng hệ thống làm việc', items: ['Cần học gì: chuẩn hóa checklist, dashboard, tài liệu bàn giao và cách đo hiệu suất theo tuần.', 'Học bằng cách nào: biến việc lặp lại thành mẫu biểu, quy trình, thư viện ví dụ và checklist kiểm tra chất lượng.', 'Tiêu chí nghiệm thu: Công việc 8 tiếng rút gọn còn 2 tiếng. 6 tiếng còn lại dùng để tư duy chiến lược.'] },
                ].map((c, i) => (
                  <div key={i} className="bg-[#161b26] p-5 rounded-2xl border border-white/10">
                    <h3 className="font-semibold text-[#f0ede8] mb-3 tracking-normal">{c.title}</h3>
                    <ul className="list-disc pl-5 space-y-2 text-sm text-[#f0ede8]/70">{c.items.map((item, j) => <li key={j}>{item}</li>)}</ul>
                  </div>
                ))}
              </div>
              {/* Next milestone cụ thể theo band */}
              <div className="mt-6 bg-[#e8b84b]/10 border border-[#e8b84b]/30 rounded-2xl p-5">
                <p className="text-[11px] font-mono font-bold text-[#e8b84b] uppercase tracking-widest mb-2">🎯 Bước tiếp theo cụ thể cho bạn</p>
                <p className="text-sm text-[#f0ede8]/80 leading-relaxed">{compass.nextMilestone}</p>
              </div>
            </div>
            <div className="pt-10 mt-10 border-t border-white/10">
              <h2 className="text-xl md:text-2xl font-serif font-semibold text-[#e8b84b] mb-6 border-l-4 border-[#e8b84b] pl-4 tracking-normal text-left">Chương 3: Chiến lược tối ưu hồ sơ & kịch bản đàm phán lương</h2>
              <p className="mb-8 text-[#f0ede8]/70">HR chỉ có 6 giây để quét một CV. Hãy chuyển sang viết về Kết quả mang lại (Achievements) kèm số liệu chứng minh (Metrics).</p>
              <div className="space-y-8">
                <div>
                  <p className="font-bold text-[#f0ede8] mb-2">Kịch bản 1: Phỏng vấn tại công ty mới</p>
                  <blockquote className="bg-[#161b26] border-l-2 border-[#e8b84b] p-5 rounded-r-2xl italic text-[#f0ede8]/70 text-sm leading-relaxed">
                    "Dạ, em cảm ơn câu hỏi của anh/chị. Dựa trên Báo cáo Dữ liệu lương VSPI 2026, mức lương chuẩn cho vị trí <strong className="not-italic text-[#f0ede8]">{job}</strong> ở mốc <strong className="not-italic text-[#f0ede8]">{reportBandLabel}</strong> đang dao động trong khoảng <strong className="not-italic text-[#e8b84b]">{reportBandRange}/tháng</strong>. Với kinh nghiệm và bằng chứng em đang xây, em muốn neo quanh <strong className="not-italic text-[#e8b84b]">{reportTargetFmt}/tháng</strong> — tương ứng {reportTargetName}. Trước khi chốt con số chính xác, em muốn hiểu thêm kỳ vọng và ngân sách để tìm điểm chạm chung."
                  </blockquote>
                </div>
                <div>
                  <p className="font-bold text-[#f0ede8] mb-2">Kịch bản 2: Xin tăng lương với Sếp hiện tại</p>
                  <blockquote className="bg-[#161b26] border-l-2 border-[#e8b84b] p-5 rounded-r-2xl italic text-[#f0ede8]/70 text-sm leading-relaxed">
                    "Dạ em chào sếp. Nhìn lại 6 tháng qua, em đã hoàn thành vượt mục tiêu và đóng góp cụ thể cho team. Em cũng có tham khảo Báo cáo VSPI 2026 — hiện tại với vị trí <strong className="not-italic text-[#f0ede8]">{job}</strong>, thu nhập của em là <strong className="not-italic text-[#e8b84b]">{compass.salaryFmt}/tháng</strong>, còn {reportTargetName} đang ở khoảng <strong className="not-italic text-[#e8b84b]">{reportTargetFmt}/tháng</strong>. Khoảng cách cần chứng minh là <strong className="not-italic text-[#e8b84b]">{reportGapFmt}/tháng</strong>. Em muốn đề xuất một scope/KPI rõ để công ty xem xét điều chỉnh theo mức giá trị đó. Sếp thấy hướng này thế nào ạ?"
                  </blockquote>
                </div>
              </div>
            </div>
          </>
        )}

        <div className="pt-10 mt-10 border-t border-white/10">
          <h2 className="text-xl md:text-2xl font-serif font-semibold text-[#e8b84b] mb-6 border-l-4 border-[#e8b84b] pl-4 tracking-normal text-left">Chương 4: Không gian kết nối mentorship & cộng đồng</h2>
          <p className="mb-4 text-[#f0ede8]/70">Hành trình tiến lên Top 50% rồi vươn tới nhóm tinh hoa Elite (Top 5%) là một chặng đường vô cùng đơn độc nếu bạn phải đi một mình.</p>
          <p className="mb-4 text-[#f0ede8]"><strong>Đặc Quyền Của Bạn: Vé Mời Tham Gia "VSPI Mentorship Hub"</strong></p>
          <ul className="list-disc pl-5 space-y-3 mb-10 text-[#e8b84b] text-sm">
            <li><strong className="text-[#f0ede8]">Sửa CV 1-1 Miễn Phí</strong> bởi đội ngũ HR Manager.</li>
            <li><strong className="text-[#f0ede8]">Kho Tài Liệu Tối Mật:</strong> 500+ mẫu prompt cho công cụ năng suất tự động hóa & 50 Mẫu CV MNC.</li>
            <li><strong className="text-[#f0ede8]">Mạng lưới Hidden Jobs</strong> từ các Headhunter uy tín.</li>
          </ul>
          <div className="border border-[#e8b84b]/40 p-8 rounded-3xl text-center bg-[#161b26] shadow-[#e8b84b]/5 shadow-xl mx-auto max-w-lg mb-10">
            <h3 className="text-lg font-mono font-black text-[#e8b84b] mb-4 uppercase tracking-widest">MÃ QR CODE QUÉT GIA NHẬP CỘNG ĐỒNG VIP</h3>
            <div className="bg-[#0f1219] p-4 rounded-2xl inline-block shadow-md mb-4 border border-white/10">
              <div className="bg-white p-2 rounded-xl">
                <QRCode value="https://zalo.me/g/kdiqgls4dcpsonhkrnyn" size={160} />
              </div>
            </div>
            <p className="text-sm font-sans text-[#f0ede8]/70">Hotline/Zalo hỗ trợ: <strong className="text-[#e8b84b] text-lg">0915.662.876</strong></p>
          </div>
          <p className="mb-10 text-[#f0ede8]/70 leading-relaxed">Mức giá 29.000đ cho bản báo cáo và hệ sinh thái này là giá beta để thu thập phản hồi, kiểm chứng dữ liệu và giúp nhiều người lao động Việt Nam có điểm tham chiếu tốt hơn khi deal lương. Nếu bạn thấy bản báo cáo hữu ích, hãy gửi đường link Top Lương cho người đang cần kiểm tra lương trước khi review hoặc apply.</p>
          <p className="mb-16 font-sans text-lg text-[#e8b84b] italic text-center">Một lần nữa, chúc bạn một năm 2026 bùng nổ, bứt phá mọi giới hạn và sớm chạm tay vào mức thu nhập mơ ước!</p>
          <div className="text-right pb-10 border-t border-white/10 pt-10">
            <p className="text-sm italic text-[#f0ede8]/45 mb-2">Ký tên,</p>
            <p className="text-2xl font-black text-[#f0ede8] mb-1" style={{ fontFamily: 'Georgia, serif' }}>Nguyễn Trọng Văn</p>
            <p className="text-sm font-mono text-[#e8b84b]">Giám đốc Chiến lược / Founder VSPI Vietnam</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══ PAYWALL BOX ═══════════════════════════════════════════════════════════ */
function PaywallBox({ vspiId, selectedJob, selectedRoleId = '', resultPercent, lostMoney, salary, experience, marketLocation, workProvince, dailyViews, onShowToast, onUnlock }: PaywallProps) {
  // Mặc định mở thẳng QR để giảm một click trong flow 29k.
  const [payStep, setPayStep] = useState<'preview' | 'qr' | 'creating' | 'checking'>('qr');
  const [phone, setPhone] = useState('');
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const [pendingPaymentStarted, setPendingPaymentStarted] = useState(false);
  const selectedPackage: PremiumPackage = '29k';
  const formStartedAtRef = useRef(Date.now());
  const [error, setError] = useState('');
  const [pollCount, setPollCount] = useState(0);
  const rolePreview = getPremiumRolePreview(selectedJob);
  const displayJob = selectedJob.trim() || rolePreview.roleLabel;
  const packageDetails: Record<PremiumPackage, {
    label: string;
    eyebrow: string;
    oldPrice: string;
    price: string;
    amount: number;
    accent: string;
    title: string;
    short: string;
    detailTitle: string;
    benefits: string[];
    cta: string;
    helper: string;
  }> = {
    '29k': {
      label: 'Gói 29k',
      eyebrow: 'Báo cáo',
      oldPrice: '59.000đ',
      price: '29.000đ',
      amount: 29_000,
      accent: '#e8b84b',
      title: 'Báo cáo lương 29K',
      short: 'Biết mình đang thấp/cao hơn thị trường và nên nói số nào khi deal.',
      detailTitle: '29K mở khóa báo cáo lương và mốc deal',
      benefits: [
        `Benchmark offer cùng profile nghề ${displayJob}`,
        'Con số nên nói khi HR hỏi lương mong muốn',
        `Câu justify mức lương theo đúng nghề ${displayJob}`,
        'Bản đồ mốc lương + bullet CV impact để HR gọi lại',
      ],
      cta: 'Mở khóa báo cáo · 29k',
      helper: 'Phù hợp nếu bạn cần biết ngay thị trường đang trả bao nhiêu và cách nói khi deal.',
    },
    '79k': {
      label: 'Gói 79k',
      eyebrow: 'Lộ trình',
      oldPrice: '149.000đ',
      price: '79.000đ',
      amount: 79_000,
      accent: '#8b5cf6',
      title: 'Checklist hành động',
      short: 'Biến mục tiêu tăng lương thành việc cần làm theo tuần, KPI và bằng chứng.',
      detailTitle: '79k tạo checklist tăng lương có bằng chứng',
      benefits: [
        'Skill map theo đúng nghề và mức lương mục tiêu',
        'Checklist hành động theo tuần trong 6 tháng',
        'Evidence log: phải nộp bằng chứng gì để xin review',
        'Script review/apply band cao hơn khi đã có đủ chứng cứ',
      ],
      cta: 'Tạo checklist 79k',
      helper: 'Phù hợp nếu bạn đã biết mốc cần tới và muốn biến nó thành kế hoạch thực thi có bằng chứng. AI cá nhân hóa theo dữ liệu bạn nhập, không phải tư vấn 1-1 bởi chuyên gia người thật.',
    },
  };
  const selectedPackageInfo = packageDetails[selectedPackage];
  const checkoutPackage: PremiumPackage = '29k';
  const premiumBenefitTiles = [
    `Sai một mức lương có thể mất ${Math.max(6_000_000, Math.round(lostMoney / 2 / 1_000_000) * 1_000_000).toLocaleString('vi-VN')}đ/năm`,
    'Biết mình đang bị neo thấp hay đã có quyền đòi thêm',
    'Nhìn thấy mốc thị trường trước khi HR hỏi kỳ vọng',
    'Có lý do mở báo cáo ngay, không đoán bằng cảm giác',
  ];
  // Fallback polling ref — chỉ dùng nếu Realtime không khả dụng
  const pollRef    = useRef<NodeJS.Timeout | null>(null);
  const checkoutSubmittingRef = useRef(false);
  // Supabase Realtime channel ref — cleanup khi unmount
  const channelRef = useRef<ReturnType<typeof import('@supabase/supabase-js').createClient> extends { channel: (...a: any[]) => infer C } ? C : any>(null);

  // Cleanup cả Realtime channel lẫn polling interval khi unmount
  useEffect(() => () => {
    if (pollRef.current)    clearInterval(pollRef.current);
    if (channelRef.current) channelRef.current.unsubscribe?.();
  }, []);

  useEffect(() => {
    try {
      const applyPhone = (value: string) => {
        const clean = cleanSharedPhone(value);
        if (isValidSharedPhone(clean)) setPhone(clean);
      };
      applyPhone(readSharedPhone());
      const onSharedPhone = (event: Event) => applyPhone((event as CustomEvent<string>).detail || '');
      window.addEventListener(SHARED_PHONE_EVENT, onSharedPhone);
      return () => window.removeEventListener(SHARED_PHONE_EVENT, onSharedPhone);
    } catch { /* ignore storage errors */ }
  }, []);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(PREMIUM_PENDING_KEY) || '{}') as {
        vspiId?: string;
        payStep?: 'qr' | 'creating' | 'checking';
        phone?: string;
        privacyConsent?: boolean;
        pendingPayment?: boolean;
        savedAt?: number;
      };
      if (!saved.vspiId || saved.vspiId !== vspiId) return;
      if (!saved.savedAt || Date.now() - saved.savedAt > PREMIUM_PENDING_TTL_MS) {
        localStorage.removeItem(PREMIUM_PENDING_KEY);
        return;
      }
      if (saved.phone) setPhone(cleanSharedPhone(saved.phone));
      if (saved.privacyConsent) setPrivacyConsent(true);
      if (saved.pendingPayment) setPendingPaymentStarted(true);
      if (saved.payStep === 'checking' || saved.payStep === 'creating') {
        setPayStep('checking');
        window.setTimeout(() => startVerification(), 0);
      } else if (saved.payStep === 'qr') {
        setPayStep('qr');
      }
    } catch { /* ignore storage errors */ }
    // Restore runs once per VSPI ID; startVerification is stable enough for this local checkout component.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vspiId]);

  useEffect(() => {
    if (payStep === 'preview') return;
    try {
      const pendingPayment = pendingPaymentStarted || payStep === 'creating' || payStep === 'checking';
      const savedAt = Date.now();
      localStorage.setItem(PREMIUM_PENDING_KEY, JSON.stringify({
        vspiId,
        payStep,
        phone: cleanSharedPhone(phone) || undefined,
        privacyConsent,
        pendingPayment,
        savedAt,
      }));
      const existingSession = JSON.parse(localStorage.getItem(PREMIUM_SESSION_KEY) || '{}');
      localStorage.setItem(PREMIUM_SESSION_KEY, JSON.stringify({
        ...existingSession,
        isPremiumUnlocked: false,
        paywallOpen: true,
        pendingPayment,
        vspiId,
        selectedJob: repairMojibakeText(selectedJob),
        selectedRoleId: selectedRoleId || undefined,
        salary,
        resultPercent,
        lostMoney,
        experience,
        marketLocation,
        workProvince,
        savedAt,
      }));
    } catch { /* ignore storage errors */ }
  }, [payStep, pendingPaymentStarted, phone, privacyConsent, vspiId, selectedJob, selectedRoleId, salary, resultPercent, lostMoney, experience, marketLocation, workProvince]);

  useEffect(() => {
    if (payStep !== 'qr') return;
    checkoutSubmittingRef.current = false;
    trackEvent('checkout_qr_displayed', {
      product: 'premium',
      percent: resultPercent,
      salary_band: getSalaryBand(salary),
      experience,
      market_location: marketLocation,
      work_province: workProvince,
    });
  }, [payStep, resultPercent, salary, experience, marketLocation, workProvince]);

  // Lưu đơn hàng vào DB TRƯỚC, chỉ khi thành công mới chuyển sang verify
  const handleConfirmPayment = async () => {
    if (checkoutSubmittingRef.current) return;
    const cleanCheckoutPhone = cleanSharedPhone(phone);
    if (cleanCheckoutPhone && !isValidSharedPhone(cleanCheckoutPhone)) {
      setError('SĐT không hợp lệ (VD: 0901234567)');
      return;
    }
    if (!privacyConsent) {
      setError('Vui lòng đồng ý xử lý SĐT/lương để tạo đơn và mở khóa báo cáo.');
      return;
    }
    setError('');
    if (cleanCheckoutPhone) {
      try {
        saveSharedPhone(cleanCheckoutPhone);
        localStorage.setItem('vspi-roadmap-draft-v1', JSON.stringify({
          phone: cleanCheckoutPhone,
          job: displayJob,
          selectedRoleId: selectedRoleId || undefined,
          salary,
          duration: 6,
          percent: resultPercent,
          experience,
          marketLocation,
          workProvince,
          savedAt: Date.now(),
        }));
      } catch { /* ignore storage errors */ }
    }

    // Hiện loading trên nút trong lúc chờ API
    checkoutSubmittingRef.current = true;
    setPendingPaymentStarted(true);
    setPayStep('creating');
    trackEvent('checkout_started', {
      product: 'premium',
      percent: resultPercent,
      salary_band: getSalaryBand(salary),
      experience,
      market_location: marketLocation,
      work_province: workProvince,
    });
    trackFunnelEvent('initiate_checkout', {
      job: selectedJob || 'unknown',
      city: getWorkProvince(workProvince).label,
      percentile: resultPercent,
      package: checkoutPackage,
      product: 'premium',
      percent: resultPercent,
      salary_band: getSalaryBand(salary),
      experience,
      market_location: marketLocation,
      work_province: workProvince,
    });

    try {
      // BẮT BUỘC await — không được fire-and-forget
      const res = await fetch('/api/premium/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...getAttributionPayload(),
          vspiId,
          phone: cleanCheckoutPhone || null,
          email: null,
          job_title: selectedJob,
          percent: resultPercent,
          experience,
          salary,
          market_location: marketLocation,
          work_province: workProvince,
          package: checkoutPackage,
          privacyConsent,
          website,
          formStartedAt: formStartedAtRef.current,
        }),
      });

      // Guard: chỉ tiếp tục khi DB ghi thành công
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const errMsg  = errData.error || `HTTP ${res.status}`;
        console.error('[checkout] API error:', res.status, errData);
        onShowToast(`Không thể tạo đơn hàng. Lỗi: ${errMsg}`, 'error');
        setError(`Lỗi tạo đơn hàng: ${errMsg}`);
        checkoutSubmittingRef.current = false;
        setPayStep('qr');
        return;
      }

      // DB đã có bản ghi → bắt đầu verify
      trackEvent('checkout_order_created', {
          product: 'premium',
          package: checkoutPackage,
          percent: resultPercent,
          market_location: marketLocation,
        work_province: workProvince,
      });
      startVerification();

    } catch (err) {
      console.error('[checkout] Network error:', err);
      onShowToast('Lỗi kết nối. Vui lòng thử lại!', 'error');
      setError('Lỗi kết nối. Vui lòng thử lại!');
      checkoutSubmittingRef.current = false;
      setPayStep('qr');
    }
  };

  const unlockPaidPurchase = (fullData: SalaryData, aiAnalysis: string, benchmark?: BenchmarkMeta | null) => {
    try { localStorage.removeItem(PREMIUM_PENDING_KEY); } catch { /* ignore storage errors */ }
    onUnlock(fullData, aiAnalysis, benchmark, checkoutPackage);
  };

  /**
   * Chiến lược xác nhận thanh toán — 2 lớp:
   *
   * Lớp 1 (thử trước): Supabase Realtime subscription.
   *   - Server push ngay khi webhook update status='paid'.
   *   - 0 polling request, latency ~200ms sau khi DB update.
   *   - Lưu ý: RLS DENY ALL anon trên bảng purchases → Realtime sẽ thất bại
   *     một cách thầm lặng. Timeout 3 giây sẽ tự động bật fallback.
   *
   * Lớp 2 (nguồn truth chính): setInterval polling mỗi 8 giây.
   *   - Hoạt động hoàn toàn độc lập với Realtime.
   *   - Mỗi request thêm ?t=timestamp để phá browser cache.
   *   - Ngay khi API trả { status: 'paid' } → clearInterval + unlock ngay.
   *   - Giới hạn 15 lần (2 phút) trước khi timeout.
   */
  function startVerification() {
    setPayStep('checking');

    // Bật fallback polling ngay lập tức — không chờ Realtime
    // Realtime chỉ là "bonus" nếu hoạt động, polling mới là đảm bảo
    startFallbackPolling();

    // Thử Realtime song song — nếu thành công sẽ cancel polling
    try {
      const { supabaseClient } = require('@/lib/supabase') as { supabaseClient: import('@supabase/supabase-js').SupabaseClient };

      const channel = supabaseClient
        .channel(`purchase-status-${vspiId}`)
        .on(
          'postgres_changes',
          {
            event:  'UPDATE',
            schema: 'public',
            table:  'purchases',
            filter: `vspi_id=eq.${vspiId}`,
          },
          async (payload: { new: { status: string } }) => {
            if (payload.new?.status === 'paid') {
              // Realtime thành công — cancel polling để tránh double-call
              if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
              channel.unsubscribe();
              // Fetch full dbData + aiAnalysis qua API (Realtime payload không có salary_data)
              try {
                const res  = await fetch('/api/premium/verify', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id: vspiId, job_title: selectedJob, salary, experience, market_location: marketLocation, work_province: workProvince }),
                });
                const data = await res.json();
                if (data.status === 'paid' && data.dbData) unlockPaidPurchase(data.dbData, data.aiAnalysis ?? '', data.benchmark ?? null);
              } catch { /* polling đang chạy song song sẽ xử lý */ }
            }
          }
        )
        .subscribe();

      channelRef.current = channel;
    } catch {
      // Realtime không khả dụng — polling đã chạy rồi, không cần làm gì thêm
    }
  }

  // ── Lớp 2: Polling — nguồn truth chính, hoạt động độc lập với Realtime ──
  function startFallbackPolling() {
    // Tránh tạo nhiều interval nếu được gọi nhiều lần
    if (pollRef.current) return;

    let count = 0;
    pollRef.current = setInterval(async () => {
      count++;
      setPollCount(count);
      try {
        // POST không bị Vercel CDN cache — luôn nhận data mới nhất
        const res  = await fetch('/api/premium/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: vspiId, job_title: selectedJob, salary, experience, market_location: marketLocation, work_province: workProvince }),
        });
        if (!res.ok) {
          console.error('Lỗi gọi API Verify:', res.status);
          return; // bỏ qua lần này, retry ở interval tiếp theo
        }
        const data = await res.json();
        if (data.status === 'paid' && data.dbData) {
          // Unlock ngay lập tức
          clearInterval(pollRef.current!);
          pollRef.current = null;
          if (channelRef.current) channelRef.current.unsubscribe?.();
          unlockPaidPurchase(data.dbData, data.aiAnalysis ?? '', data.benchmark ?? null);
        }
      } catch { /* ignore network errors — sẽ retry ở lần sau */ }

      if (count >= 15) { // 15 × 8s = 2 phút timeout
        clearInterval(pollRef.current!);
        pollRef.current = null;
        setPayStep('qr');
        setError('Chưa nhận được xác nhận. Nếu đã chuyển khoản, liên hệ Zalo: 0915 662 876');
      }
    }, 8000);
  }

  // ── STEP PREVIEW: hiện value props + CTA, QR vẫn ẨN cho đến khi user bấm CTA ─
  if (payStep === 'preview') return (
    <div className="bg-[#0f1219] rounded-[2rem] overflow-hidden border border-[#e8b84b]/40 shadow-2xl shadow-[#e8b84b]/10">
      <div className="bg-[#161b26] px-6 pt-6 pb-4 border-b border-white/10">
        <div className="flex items-start justify-between mb-1">
          <div>
            <h3 className="text-lg font-serif font-black text-[#f0ede8] leading-snug">
              Xem con số người cùng profile đang negotiate
            </h3>
            <p className="text-[11px] text-[#f0ede8]/55 mt-1 leading-snug">
              Và câu họ nói để đòi được mức đó
            </p>
            <p className="text-[11px] text-[#f0ede8]/45 mt-1.5">
              {dailyViews > 0 ? (
                <><span className="text-green-400 font-bold">✓ {dailyViews} người</span> đã mở khóa hôm nay</>
              ) : (
                <span className="text-[#e8b84b] font-bold">Đang mở cho nhóm người dùng đầu tiên</span>
              )}
            </p>
          </div>
          <span className="bg-red-600 text-white text-[9px] font-black px-2 py-1 rounded-full uppercase tracking-wider shrink-0 ml-2">
            Ra mắt đặc biệt
          </span>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <span className="text-[#f0ede8]/35 line-through text-sm">{selectedPackageInfo.oldPrice}</span>
          <span className="text-2xl font-black" style={{ color: selectedPackageInfo.accent }}>{selectedPackageInfo.price}</span>
          <span className="bg-red-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full">
            -51%
          </span>
          <span className="text-[10px] text-orange-400 font-mono ml-auto">⏰ Cuối tuần này</span>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-4">
          {premiumBenefitTiles.map(item => (
            <div key={item} className="bg-[#0f1219] border border-white/8 rounded-xl px-3 py-2">
              <p className="text-[10px] text-[#f0ede8]/65 font-bold">✓ {item}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="px-6 pt-6 pb-4">
        <div className="mb-5 rounded-2xl border-2 border-[#e8b84b]/45 bg-[#e8b84b]/10 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-mono font-black uppercase tracking-widest text-[#e8b84b]">Điểm nghẽn deal lương</p>
              <h4 className="mt-1 text-base font-black text-[#f0ede8]">Bạn không thiếu cố gắng, bạn thiếu con số để nói với HR</h4>
              <p className="mt-1 text-[12px] font-bold leading-relaxed text-[#f0ede8]/65">
                29k mở đúng phần khách cần quyết định ngay: thị trường đang trả bao nhiêu, bạn nên nói mức nào, và câu nào giúp không bị ép về mức cũ.
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-[10px] text-[#f0ede8]/35 line-through">59.000đ</p>
              <p className="text-2xl font-black text-[#e8b84b]">29.000đ</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#e8b84b]/25 bg-[#e8b84b]/8 p-4 mb-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-[10px] font-mono font-black uppercase tracking-[0.22em] text-[#e8b84b]">
              {selectedPackageInfo.detailTitle}
            </p>
            <span className="rounded-full bg-[#e8b84b] px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-[#0a0c10]">
              hiểu trong 3 giây
            </span>
          </div>
          <p className="mb-3 text-[12px] font-bold leading-relaxed text-[#f0ede8]/70">{selectedPackageInfo.short}</p>
          <div className="space-y-2">
            {selectedPackageInfo.benefits.map(item => (
              <div key={item} className="flex items-start gap-2">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-green-400/15 text-[11px] font-black text-green-300">
                  ✓
                </span>
                <p className="text-[12px] font-bold leading-relaxed text-[#f0ede8]">{item}</p>
              </div>
            ))}
          </div>
        </div>

        {/* QR ẩn — placeholder gợi mở, không lộ QR thật */}
        <div className="relative mx-auto mb-5 w-56 h-56 rounded-2xl border-2 border-dashed border-[#e8b84b]/35 bg-[#0a0c10]/60 flex flex-col items-center justify-center gap-2 px-4 text-center">
          <span className="text-3xl" aria-hidden="true">🔒</span>
          <p className="text-[11px] font-mono font-black uppercase tracking-widest text-[#e8b84b]">
            QR thanh toán
          </p>
          <p className="text-[10px] leading-4 text-[#f0ede8]/55">
            Bấm nút bên dưới để hiện mã QR · MSB · {selectedPackageInfo.price}
          </p>
        </div>

        <button
          type="button"
          onClick={() => { playTap(); setPayStep('qr'); }}
          className="w-full bg-[#e8b84b] text-[#0a0c10] font-black py-4 rounded-xl text-base
                     hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(232,184,75,0.35)]
                     active:scale-[0.98] transition-all"
        >
          {selectedPackageInfo.cta}
        </button>

        <div className="mt-3 bg-[#161b26] rounded-xl p-3 border border-[#e8b84b]/15 text-center">
          {resultPercent <= 10 ? (
            <p className="text-[11px] font-sans text-[#f0ede8]/60">
              💡 <strong className="text-[#e8b84b]">{selectedPackage}</strong> — {selectedPackageInfo.helper}{' '}
              <strong className="text-[#e8b84b]">Top 1%</strong>
            </p>
          ) : (
            <p className="text-[11px] font-sans text-[#f0ede8]/60">
              💡 <strong className="text-[#e8b84b]">{selectedPackage}</strong> — {selectedPackageInfo.helper}
            </p>
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-green-400/20 bg-green-400/10 px-3 py-2 text-center">
            <p className="text-[9px] font-mono font-black uppercase text-green-300">{selectedPackage.toUpperCase()} đang chọn</p>
            <p className="mt-1 text-[11px] font-bold leading-tight text-[#f0ede8]/75">{selectedPackageInfo.title}</p>
          </div>
          <div className="rounded-xl border border-[#e8b84b]/20 bg-[#e8b84b]/10 px-3 py-2 text-center">
            <p className="text-[9px] font-mono font-black uppercase text-[#e8b84b]">Không cần đăng nhập</p>
            <p className="mt-1 text-[11px] font-bold leading-tight text-[#f0ede8]/75">
              Quét QR đúng số tiền · nhập SĐT · tự mở khóa
            </p>
          </div>
        </div>

        <p className="mt-3 text-[9px] font-mono text-center text-[#f0ede8]/30">
          SĐT chỉ dùng để gửi báo cáo · Không spam · Không bán data · Hỗ trợ Zalo nếu chưa tự mở khóa
        </p>
      </div>
    </div>
  );

  // ── STEP QR: hiện QR to ngay, form nhỏ bên dưới ─────────────────────────
  if (payStep === 'qr') return (
    <div className="bg-[#0f1219] rounded-[2rem] overflow-hidden border border-[#e8b84b]/40 shadow-2xl shadow-[#e8b84b]/10">

      {/* Header */}
      <div className="bg-[#161b26] px-6 pt-6 pb-4 border-b border-white/10">
        <div className="flex items-start justify-between mb-1">
          <div>
            <h3 className="text-lg font-serif font-black text-[#f0ede8] leading-snug">
              Xem con số người cùng profile đang negotiate
            </h3>
            <p className="text-[11px] text-[#f0ede8]/55 mt-1 leading-snug">
              Và câu họ nói để đòi được mức đó
            </p>
            <p className="text-[11px] text-[#f0ede8]/45 mt-1.5">
              {dailyViews > 0 ? (
                <><span className="text-green-400 font-bold">✓ {dailyViews} người</span> đã mở khóa hôm nay</>
              ) : (
                <span className="text-[#e8b84b] font-bold">Đang mở cho nhóm người dùng đầu tiên</span>
              )}
            </p>
          </div>
          <span className="bg-red-600 text-white text-[9px] font-black px-2 py-1 rounded-full uppercase tracking-wider shrink-0 ml-2">
            Ra mắt đặc biệt
          </span>
        </div>
        {/* Price */}
        <div className="flex items-center gap-2 mt-3">
          <span className="text-[#f0ede8]/35 line-through text-sm">{selectedPackageInfo.oldPrice}</span>
          <span className="text-2xl font-black" style={{ color: selectedPackageInfo.accent }}>{selectedPackageInfo.price}</span>
          <span className="bg-red-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full">
            -51%
          </span>
          <span className="text-[10px] text-orange-400 font-mono ml-auto">⏰ Cuối tuần này</span>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-4">
          {premiumBenefitTiles.map(item => (
            <div key={item} className="bg-[#0f1219] border border-white/8 rounded-xl px-3 py-2">
              <p className="text-[10px] text-[#f0ede8]/65 font-bold">✓ {item}</p>
            </div>
          ))}
        </div>
      </div>

      {/* QR — to, trung tâm, hấp dẫn */}
      <div className="px-6 pt-6 pb-4 flex flex-col items-center">
        <div className="w-full mb-5 rounded-2xl border border-[#e8b84b]/25 bg-[#e8b84b]/8 p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-[10px] font-mono font-black uppercase tracking-[0.22em] text-[#e8b84b]">
              {selectedPackageInfo.detailTitle}
            </p>
            <span className="rounded-full bg-[#e8b84b] px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-[#0a0c10]">
              hiểu trong 3 giây
            </span>
          </div>
          <div className="space-y-2">
            {selectedPackageInfo.benefits.map(item => (
              <div key={item} className="flex items-start gap-2">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-green-400/15 text-[11px] font-black text-green-300">
                  ✓
                </span>
                <p className="text-[12px] font-bold leading-relaxed text-[#f0ede8]">{item}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[11px] font-mono font-bold text-[#e8b84b] uppercase tracking-widest mb-4">
          Quét QR thanh toán {selectedPackageInfo.price}
        </p>
        <button
          type="button"
          onClick={() => { playTap(); setPayStep('preview'); }}
          className="mb-4 text-[10px] font-mono font-bold uppercase tracking-wider text-[#f0ede8]/45 underline-offset-4 hover:text-[#e8b84b] hover:underline"
        >
          ← Xem lại gói 29k
        </button>

        {/* QR card */}
        <div className="bg-white rounded-2xl p-3 shadow-[0_0_32px_rgba(232,184,75,0.2)] mb-3">
          {(() => {
            // Xóa dấu gạch ngang để ngân hàng không tự ý biến đổi nội dung
            const cleanVspiId = vspiId.replace(/-/g, '').toUpperCase();
            return (
              <Image
                src={`https://img.vietqr.io/image/msb-96886693012762-compact2.png?amount=${selectedPackageInfo.amount}&addInfo=${cleanVspiId}&accountName=NGUYEN%20TRONG%20VAN`}
                alt={`QR thanh toán ${selectedPackageInfo.price}`}
                width={224}
                height={224}
                unoptimized
                className="w-56 h-56 rounded-xl block"
              />
            );
          })()}
        </div>

        {/* Bank info */}
        <div className="bg-[#161b26] border border-white/10 rounded-xl px-4 py-2.5 text-center w-full mb-1">
          <p className="text-[11px] font-mono text-[#f0ede8]/50">
            MSB · <strong className="text-[#f0ede8]">96886693012762</strong> · NGUYEN TRONG VAN
          </p>
        </div>
        <div className="bg-[#0a0c10] border border-[#e8b84b]/25 rounded-xl px-4 py-2 text-center w-full">
          <p className="text-[10px] font-mono text-[#f0ede8]/50">
            Nội dung CK:{' '}
            <span className="font-black text-[#e8b84b] tracking-wider">{vspiId.replace(/-/g, '').toUpperCase()}</span>
          </p>
        </div>
        <p className="mt-2 text-center text-[9.5px] leading-relaxed text-[#f0ede8]/38">
          Thanh toán đồng nghĩa bạn đồng ý <Link href="/terms" target="_blank" className="text-[#e8b84b] underline underline-offset-2">Điều khoản</Link>,{' '}
          <Link href="/privacy" target="_blank" className="text-[#e8b84b] underline underline-offset-2">Chính sách riêng tư</Link> và chính sách hỗ trợ/hoàn tiền khi lỗi kỹ thuật.
        </p>
      </div>

      {/* Form nhỏ + CTA — phía dưới QR */}
      <div className="px-6 pb-6 space-y-3">
        {/* 1 input duy nhất */}
        <div>
          <label className="text-[10px] font-mono font-bold text-[#f0ede8]/60 uppercase tracking-widest block mb-1.5">
            SĐT / Zalo nhận báo cáo
          </label>
          <input
            className="hidden"
            tabIndex={-1}
            autoComplete="off"
            aria-hidden="true"
            value={website}
            onChange={e => setWebsite(e.target.value)}
          />
          <input
            type="tel"
            inputMode="numeric"
            placeholder="0901234567"
            className="w-full bg-[#0a0c10] border border-white/15 rounded-xl px-4 py-3 text-base text-[#f0ede8]
                       outline-none focus:border-[#e8b84b] focus:ring-1 focus:ring-[#e8b84b]/30
                       transition-colors placeholder:text-[#f0ede8]/25"
            value={phone}
            onChange={e => {
              const nextPhone = cleanSharedPhone(e.target.value);
              setPhone(nextPhone);
              saveSharedPhone(nextPhone);
            }}
            onKeyDown={e => e.key === 'Enter' && handleConfirmPayment()}
          />
        </div>

        <label className="flex items-start gap-2 rounded-xl border border-white/10 bg-[#0a0c10] px-3 py-3">
          <input
            type="checkbox"
            checked={privacyConsent}
            onChange={e => setPrivacyConsent(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-white/20 accent-[#e8b84b]"
          />
          <span className="text-[10px] leading-4 text-[#f0ede8]/55">
            Tôi đồng ý Top Lương lưu và xử lý SĐT, nghề nghiệp, mức lương để xác nhận thanh toán, mở khóa báo cáo và hỗ trợ sau mua. Có thể yêu cầu xóa dữ liệu tại trang <Link href="/privacy" target="_blank" className="text-[#e8b84b] underline underline-offset-2">Bảo mật</Link>.
          </span>
        </label>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5">
            <p className="text-[11px] text-red-400">{error}</p>
          </div>
        )}

        {pendingPaymentStarted && (
          <div className="rounded-xl border border-green-400/25 bg-green-400/10 px-4 py-2.5">
            <p className="text-[11px] font-bold leading-relaxed text-green-300">
              Đã lưu đơn 29K đang chờ xác nhận. Nếu bạn vừa quay lại trang này, giữ nguyên mã CK bên trên và bấm tiếp tục kiểm tra, không chuyển khoản lại.
            </p>
          </div>
        )}

        {/* CTA chính */}
        <button
          onClick={() => { playTap(); handleConfirmPayment(); }}
          className="w-full bg-[#e8b84b] text-[#0a0c10] font-black py-4 rounded-xl text-base
                     hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(232,184,75,0.35)]
                     active:scale-[0.98] transition-all"
        >
          {pendingPaymentStarted ? '✅ Tiếp tục kiểm tra thanh toán 29K' : `✅ Đã chuyển ${selectedPackageInfo.price} — Mở khóa ngay`}
        </button>

        {/* ROI / Elite copy */}
        <div className="bg-[#161b26] rounded-xl p-3 border border-[#e8b84b]/15 text-center">
          {resultPercent <= 10 ? (
            <p className="text-[11px] font-sans text-[#f0ede8]/60">
              💡 <strong className="text-[#e8b84b]">{checkoutPackage}</strong> — {selectedPackageInfo.helper}{' '}
              <strong className="text-[#e8b84b]">Top 1%</strong>
            </p>
          ) : (
            <p className="text-[11px] font-sans text-[#f0ede8]/60">
              💡 <strong className="text-[#e8b84b]">{checkoutPackage}</strong> — {selectedPackageInfo.helper}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-green-400/20 bg-green-400/10 px-3 py-2 text-center">
            <p className="text-[9px] font-mono font-black uppercase text-green-300">{checkoutPackage.toUpperCase()} đang chọn</p>
            <p className="mt-1 text-[11px] font-bold leading-tight text-[#f0ede8]/75">{selectedPackageInfo.title}</p>
          </div>
          <div className="rounded-xl border border-[#e8b84b]/20 bg-[#e8b84b]/10 px-3 py-2 text-center">
            <p className="text-[9px] font-mono font-black uppercase text-[#e8b84b]">Không cần đăng nhập</p>
            <p className="mt-1 text-[11px] font-bold leading-tight text-[#f0ede8]/75">Quét QR đúng số tiền · nhập SĐT · tự mở khóa</p>
          </div>
        </div>

        <p className="text-[9px] font-mono text-center text-[#f0ede8]/30">
          SĐT chỉ dùng để gửi báo cáo · Không spam · Không bán data · Hỗ trợ Zalo nếu chưa tự mở khóa
        </p>
      </div>
    </div>
  );

  // ── STEP CREATING: đang tạo đơn hàng trong DB ───────────────────────────
  if (payStep === 'creating') return (
    <div className="bg-[#0f1219] rounded-[2rem] p-12 border border-[#e8b84b]/30 shadow-2xl flex flex-col items-center text-center">
      <div className="relative w-16 h-16 mb-5">
        <div className="absolute inset-0 border-4 border-white/10 rounded-full" />
        <div className="absolute inset-0 border-4 border-t-[#e8b84b] rounded-full animate-spin" />
      </div>
      <h3 className="text-lg font-serif font-bold text-[#f0ede8] mb-1">Đang tạo đơn hàng...</h3>
      <p className="text-sm font-sans text-[#f0ede8]/45">Vui lòng chờ trong giây lát</p>
    </div>
  );

  // ── STEP CHECKING: đang poll ─────────────────────────────────────────────
  return (
    <div className="bg-[#0f1219] rounded-[2rem] p-12 border border-green-500/50 shadow-2xl flex flex-col items-center text-center">
      <div className="relative w-16 h-16 mb-5">
        <div className="absolute inset-0 border-4 border-white/10 rounded-full" />
        <div className="absolute inset-0 border-4 border-t-green-400 rounded-full animate-spin" />
      </div>
      <h3 className="text-lg font-serif font-bold text-[#f0ede8] mb-1">Đang xác nhận thanh toán...</h3>
      <p className="text-sm font-sans text-[#f0ede8]/45 mb-4">Hệ thống đang kiểm tra giao dịch của bạn</p>
      <div className="bg-[#161b26] border border-green-500/20 rounded-2xl px-5 py-3 text-center mb-4">
        <p className="text-[11px] font-mono text-green-400">
          Nội dung CK: <span className="font-black text-[#f0ede8]">{vspiId.replace(/-/g, '').toUpperCase()}</span>
        </p>
        <p className="text-[10px] font-sans text-green-400/70 mt-1">
          Tự động unlock sau khi xác nhận · Thử lần {pollCount}/24
        </p>
      </div>
      <button
        onClick={() => {
          if (pollRef.current)    { clearInterval(pollRef.current); pollRef.current = null; }
          if (channelRef.current) { channelRef.current.unsubscribe?.(); channelRef.current = null; }
          setPayStep('qr');
        }}
        className="text-[10px] font-mono text-[#f0ede8]/40 hover:text-[#f0ede8] transition-colors"
      >
        ← Quay lại
      </button>
      <p className="text-[10px] font-mono text-[#f0ede8]/45 mt-3">
        Nếu chờ quá 2 phút, liên hệ Zalo:{' '}
        <strong className="text-[#e8b84b]">0915 662 876</strong>
        {' '}hoặc mở <Link href="/support/payment" className="text-[#e8b84b] underline">trang hỗ trợ</Link>.
      </p>
    </div>
  );
}

/* ═══ MAIN ══════════════════════════════════════════════════════════════════ */
export default function TopPercentScanner() {
  const [groupedJobs, setGroupedJobs] = useState<Record<string, JobOption[]>>({});
  const [fullName, setFullName] = useState(() => readSharedName());
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [selectedJob, setSelectedJob] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [salary, setSalary] = useState('');
  const [salaryError, setSalaryError] = useState('');
  const [incomeType, setIncomeType] = useState<IncomeType>('gross');
  const [experience, setExperience] = useState<ExperienceLevel>('mid');
  const [marketLocation, setMarketLocation] = useState<MarketLocationKey>('hcm');
  const [workProvince, setWorkProvince] = useState<WorkProvinceKey>(DEFAULT_WORK_PROVINCE);
  // step: 1=form, 2=scanning-animation, 3=result
  const [step, setStep] = useState(1);
  const [isScanSubmitting, setIsScanSubmitting] = useState(false);
  const scanSubmittingRef = useRef(false);
  const [resultPercent, setResultPercent] = useState(50);
  const [animatedFill, setAnimatedFill] = useState(0);
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [dbData, setDbData] = useState<SalaryData | null>(null);
  const [benchmarkMeta, setBenchmarkMeta] = useState<BenchmarkMeta | null>(null);
  const [lostMoney, setLostMoney] = useState(0);
  const [isAboveMedian, setIsAboveMedian] = useState(false);
  const [isPremiumUnlocked, setIsPremiumUnlocked] = useState(false);
  const [showPaywallBox, setShowPaywallBox] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [showSources, setShowSources] = useState(false);
  const [showAudiencePresets, setShowAudiencePresets] = useState(false);

  // ── Restore Premium session từ localStorage (xem lại sau khi thoát) ─────
  useEffect(() => {
    try {
      const saved = localStorage.getItem(PREMIUM_SESSION_KEY);
      if (!saved) return;
      const session = JSON.parse(saved);
      // Session hết hạn sau 7 ngày
      if (!session.savedAt || Date.now() - session.savedAt > PREMIUM_SESSION_TTL_MS) {
        localStorage.removeItem(PREMIUM_SESSION_KEY);
        return;
      }
      const sessionJob = session.selectedJob ? repairMojibakeText(String(session.selectedJob)) : '';
      const sessionDbData = session.dbData ? sanitizeSalaryDataForJob(repairMojibakeDeep(session.dbData) as SalaryData, sessionJob) : null;
      const sessionBenchmark = session.benchmarkMeta ? repairMojibakeDeep(session.benchmarkMeta) as BenchmarkMeta : null;
      const cleanedBenchmark = sanitizeBenchmarkForJob(sessionBenchmark, sessionJob, sessionDbData);
      const sessionAiAnalysis = session.aiAnalysis ? repairMojibakeText(String(session.aiAnalysis)) : '';
      const cleanedAiAnalysis = isDirtyInsightForJob(sessionAiAnalysis, sessionJob) ? '' : sessionAiAnalysis;
      // Restore state
      if (session.fullName) {
        const restoredName = saveSharedName(repairMojibakeText(String(session.fullName)));
        setFullName(restoredName);
        setCertName(restoredName);
      }
      if (session.vspiId) setVspiId(session.vspiId);
      if (sessionJob) setSelectedJob(sessionJob);
      if (typeof session.selectedRoleId === 'string') setSelectedRoleId(session.selectedRoleId);
      if (session.salary) {
        const restoredSalary = formatMoneyInput(String(session.salary));
        setSalary(restoredSalary);
        setSalaryError(getSalaryValidationError(restoredSalary));
      }
      if (session.resultPercent) setResultPercent(session.resultPercent);
      if (session.lostMoney !== undefined) setLostMoney(session.lostMoney);
      if (sessionDbData) setDbData(sessionDbData);
      if (cleanedBenchmark) setBenchmarkMeta(cleanedBenchmark);
      if (cleanedAiAnalysis) setAiAnalysis(cleanedAiAnalysis);
      if (session.experience) setExperience(session.experience);
      if (isIncomeType(session.incomeType)) setIncomeType(session.incomeType);
      if (session.workProvince) {
        const province = getWorkProvince(session.workProvince);
        setWorkProvince(province.key as WorkProvinceKey);
        setMarketLocation(province.marketLocation);
      } else if (session.marketLocation) {
        setMarketLocation(session.marketLocation);
      }
      if (session.isPremiumUnlocked) {
        setIsPremiumUnlocked(true);
        setStep(3);
        showToast('✅ Đã khôi phục báo cáo Premium của bạn', 'success');
      } else if (session.resultPercent && sessionJob) {
        setIsPremiumUnlocked(false);
        setStep(3);
        if (session.paywallOpen || session.pendingPayment) setShowPaywallBox(true);
        if (session.pendingPayment) showToast('Đã khôi phục đơn 29K đang chờ xác nhận. Không cần chuyển khoản lại.', 'info');
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const applyName = (value: string) => {
      const nextName = cleanSharedName(value);
      if (!nextName) return;
      setFullName(nextName);
      setCertName(current => cleanSharedName(current) || nextName);
    };
    applyName(readSharedName());
    const onSharedName = (event: Event) => applyName((event as CustomEvent<string>).detail || '');
    window.addEventListener(SHARED_FULL_NAME_EVENT, onSharedName);
    return () => window.removeEventListener(SHARED_FULL_NAME_EVENT, onSharedName);
  }, []);

  // ── Success chime when result revealed ─────────────────────────────────
  const prevStepRef = useRef(step);
  useEffect(() => {
    if (prevStepRef.current === 2 && step === 3) playSuccess();
    prevStepRef.current = step;
  }, [step]);

  useEffect(() => {
    if (step !== 2) return;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const settle = window.setTimeout(() => window.scrollTo({ top: 0, behavior: 'auto' }), 160);
    return () => window.clearTimeout(settle);
  }, [step]);

  useEffect(() => {
    if (step === 2) return;
    scanSubmittingRef.current = false;
    setIsScanSubmitting(false);
  }, [step]);

  // ── Inline toast (thay thế window.alert) ─────────────────────────────────
  const [toast, setToast] = useState<{ msg: string; type: 'error' | 'success' | 'info' } | null>(null);
  const toastTimer = useRef<NodeJS.Timeout | null>(null);
  const showToast = useCallback((msg: string, type: 'error' | 'success' | 'info' = 'info') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Sticky CTA: chỉ hiện khi QR đã scroll ra khỏi viewport ──────────────
  const [qrOutOfView, setQrOutOfView] = useState(false);
  const paywallRef = useRef<HTMLDivElement | null>(null);
  const paywallSeenRef = useRef(false);
  const benchmarkRepairRef = useRef('');
  const landingTrackedRef = useRef(false);

  useEffect(() => {
    if (!selectedJob || isCustomMode) setSelectedRoleId('');
  }, [isCustomMode, selectedJob]);

  useEffect(() => {
    if (step !== 3 || isPremiumUnlocked) return;
    const el = paywallRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setQrOutOfView(!entry.isIntersecting),
      { threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [step, isPremiumUnlocked]);

  useEffect(() => {
    if (step !== 3 || isPremiumUnlocked || paywallSeenRef.current) return;
    paywallSeenRef.current = true;
    const numericSalary = parseMoneyInput(salary);
    trackEvent('paywall_seen', {
      percent: resultPercent,
      salary_band: numericSalary ? getSalaryBand(numericSalary) : undefined,
      income_type: incomeType,
      experience,
      market_location: marketLocation,
      work_province: workProvince,
      confidence_score: benchmarkMeta?.confidenceScore,
      match_type: benchmarkMeta?.matchType,
    });
    trackFunnelEvent('view_paywall', {
      job: selectedJob || 'unknown',
      city: getWorkProvince(workProvince).label,
      percentile: resultPercent,
      package: '29k',
      percent: resultPercent,
      salary_band: numericSalary ? getSalaryBand(numericSalary) : undefined,
      income_type: incomeType,
      experience,
      market_location: marketLocation,
      work_province: workProvince,
      confidence_score: benchmarkMeta?.confidenceScore,
      match_type: benchmarkMeta?.matchType,
    });
  }, [step, isPremiumUnlocked, salary, resultPercent, incomeType, experience, marketLocation, workProvince, benchmarkMeta, selectedJob]);

  const [vspiId, setVspiId] = useState(() => genVSPIId());
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      const actionable = target?.closest('button, a, select, input[type="checkbox"], [role="button"]');
      if (!actionable || actionable.getAttribute('aria-disabled') === 'true') return;
      if (actionable instanceof HTMLButtonElement && actionable.disabled) return;
      playTap();
    };
    document.addEventListener('pointerdown', handlePointerDown, { capture: true });
    return () => document.removeEventListener('pointerdown', handlePointerDown, { capture: true });
  }, []);

  // Scanning animation state
  const [scanStep, setScanStep] = useState(0);
  const [scanProgress, setScanProgress] = useState(0);
  // Stable ref so the research pulse loop always reads the latest scanStep
  // without re-binding (avoids stacking multiple loops on every stage tick).
  const scanStepRef = useRef(0);
  useEffect(() => {
    scanStepRef.current = scanStep;
  }, [scanStep]);

  // ── Research pulse during scanning (step === 2) ────────────────────────
  // Single loop that adapts cadence to the current scanStep. Stops on
  // step change (result/fail), unmount, or mute (mute is enforced inside
  // lib/sound — stopping is automatic via setMuted(true)).
  useEffect(() => {
    if (step !== 2) {
      stopResearchPulse();
      return;
    }
    startResearchPulse(() => scanStepRef.current);
    return () => stopResearchPulse();
  }, [step]);

  // ── Per-stage tick + vibration on each stage transition ────────────────
  useEffect(() => {
    if (step !== 2) return;
    playStageTick(scanStep);
    vibrateStage(scanStep);
  }, [scanStep, step]);
  // Pending result from API (stored while animation plays)
  const pendingResult = useRef<{ percent: number; dbData: SalaryData | null; isAboveMedian: boolean; lostMoney: number; benchmark: BenchmarkMeta | null } | null>(null);

  // Consent checkbox
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // Certificate name input (shown after result)
  const [certName, setCertName] = useState(() => readSharedName());
  const [certDownloading, setCertDownloading] = useState(false);

  const handleDownloadCertificate = async (name: string) => {
    const el = document.getElementById('vspi-certificate');
    const certificatePercentLabel = formatPercentDisplay(resultPercent);
    setCertDownloading(true);

    // Canvas API fallback — portrait certificate, close to the in-app card on mobile.
    const drawFallbackCert = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 900; canvas.height = 1400;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      const drawBox = (x: number, y: number, w: number, h: number, fill: string, stroke = 'rgba(255,255,255,0.12)') => {
        ctx.fillStyle = fill;
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);
      };
      const wrapText = (text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines = 2) => {
        const words = text.split(/\s+/).filter(Boolean);
        let line = '';
        let lineCount = 0;
        for (const word of words) {
          const testLine = line ? `${line} ${word}` : word;
          if (ctx.measureText(testLine).width > maxWidth && line) {
            ctx.fillText(line, x, y);
            line = word;
            y += lineHeight;
            lineCount += 1;
            if (lineCount >= maxLines - 1) break;
          } else {
            line = testLine;
          }
        }
        if (line && lineCount < maxLines) ctx.fillText(line, x, y);
      };
      const fitText = (text: string, x: number, y: number, maxWidth: number, basePx: number, minPx: number, family = 'Arial, sans-serif') => {
        let size = basePx;
        do {
          ctx.font = `bold ${size}px ${family}`;
          if (ctx.measureText(text).width <= maxWidth || size <= minPx) break;
          size -= 2;
        } while (size >= minPx);
        ctx.fillText(text, x, y);
      };
      const bg = ctx.createLinearGradient(0, 0, 900, 1400);
      bg.addColorStop(0, '#070b12');
      bg.addColorStop(0.55, '#111827');
      bg.addColorStop(1, '#08150f');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 900, 1400);

      ctx.strokeStyle = 'rgba(232,184,75,0.85)';
      ctx.lineWidth = 6;
      ctx.strokeRect(42, 42, 816, 1316);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 2;
      ctx.strokeRect(70, 70, 760, 1260);

      ctx.fillStyle = 'rgba(232,184,75,0.025)';
      for (let x = 90; x < 820; x += 58) {
        ctx.fillRect(x, 100, 1, 1200);
      }
      for (let y = 100; y < 1300; y += 58) {
        ctx.fillRect(90, y, 720, 1);
      }

      ctx.textAlign = 'left';
      ctx.fillStyle = '#e8b84b';
      ctx.font = 'bold 30px Arial, sans-serif';
      ctx.fillText('Top Luong Verified', 120, 150);
      ctx.fillStyle = 'rgba(240,237,232,0.52)';
      ctx.font = '22px Arial, sans-serif';
      ctx.fillText('Vietnam Salary Percentile Index · Q1/2026', 120, 188);

      drawBox(600, 115, 190, 70, '#0a2a1a', 'rgba(34,197,94,0.75)');
      ctx.fillStyle = '#22c55e';
      ctx.font = 'bold 24px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Đã xác thực', 695, 158);

      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(240,237,232,0.42)';
      ctx.font = 'bold 24px Arial, sans-serif';
      ctx.fillText('Chứng nhận vị trí thu nhập', 120, 300);

      ctx.fillStyle = getRingColor(resultPercent);
      fitText(certificatePercentLabel, 120, 450, 660, resultPercent >= 100 ? 78 : 112, 54, 'Arial, sans-serif');
      ctx.fillStyle = '#ffffff';
      fitText(name || 'VSPI Member', 120, 550, 620, 38, 28);
      ctx.fillStyle = '#e8b84b';
      fitText(selectedJob, 120, 605, 620, 32, 24);
      ctx.fillStyle = 'rgba(240,237,232,0.58)';
      ctx.font = '24px Arial, sans-serif';
      wrapText('Được đối chiếu theo nhóm nghề, kinh nghiệm và dữ liệu lương thị trường Việt Nam.', 120, 690, 660, 32, 2);

      drawBox(120, 750, 660, 195, 'rgba(9,13,20,0.86)', 'rgba(232,184,75,0.35)');
      ctx.fillStyle = 'rgba(240,237,232,0.42)';
      ctx.font = 'bold 18px Arial, sans-serif';
      ctx.fillText('Xác thực', 150, 795);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 30px Arial, sans-serif';
      ctx.fillText('Kiểm tra bằng VSPI ID', 150, 838);
      ctx.fillStyle = 'rgba(240,237,232,0.58)';
      ctx.font = '22px Arial, sans-serif';
      wrapText('Truy cập topluong.com/verify và nhập mã VSPI ID bên dưới để đối chiếu chứng nhận.', 150, 880, 580, 30, 3);

      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(120, 1040);
      ctx.lineTo(780, 1040);
      ctx.stroke();

      drawBox(120, 1075, 660, 110, 'rgba(9,13,20,0.86)', 'rgba(232,184,75,0.28)');
      drawBox(120, 1215, 300, 88, 'rgba(9,13,20,0.86)');
      drawBox(450, 1215, 330, 88, 'rgba(9,13,20,0.86)');
      ctx.textAlign = 'left';
      ctx.font = 'bold 17px Arial, sans-serif';
      ctx.fillStyle = 'rgba(240,237,232,0.42)';
      ctx.fillText('VSPI ID', 150, 1117);
      ctx.fillText('Ngày cấp', 150, 1250);
      ctx.fillText('Nguồn dữ liệu', 480, 1250);
      ctx.font = 'bold 25px Arial, sans-serif';
      ctx.fillStyle = '#e8b84b';
      fitText(vspiId, 150, 1154, 590, 25, 20, 'Arial, sans-serif');
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 25px Arial, sans-serif';
      ctx.fillText(TODAY, 150, 1283);
      fitText(CERTIFICATE_SOURCE_LINE, 480, 1283, 260, 25, 20);

      ctx.fillStyle = 'rgba(240,237,232,0.42)';
      ctx.font = '18px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('topluong.com/verify · VSPI ID secured', 450, 1338);
      return canvas;
    };

    try {
      let canvas: HTMLCanvasElement | null = null;

      if (el) {
        try {
          // Đợi font load xong trước khi capture
          await document.fonts.ready;
          const html2canvas = (await import('html2canvas')).default;
          canvas = await html2canvas(el, {
            backgroundColor: '#0f1219',
            scale: 2,
            useCORS: true,
            allowTaint: false,
            logging: false,
          });
        } catch (h2cErr) {
          console.error('html2canvas failed, using fallback:', h2cErr);
          canvas = drawFallbackCert();
        }
      } else {
        // Element chưa render (user chưa mở tab cert) — dùng fallback
        canvas = drawFallbackCert();
      }

      if (!canvas) throw new Error('Canvas creation failed');
      const link = document.createElement('a');
      link.download = `VSPI-Certificate-${name.replace(/\s+/g, '-')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      showToast('Đã tải chứng nhận!', 'success');
    } catch (err) {
      console.error('Certificate download error:', err);
      showToast('Có lỗi khi tạo ảnh. Vui lòng thử lại.', 'error');
    } finally {
      setCertDownloading(false);
    }
  };

  // Combobox State
  const [jobSearchQuery, setJobSearchQuery] = useState('');
  const [showJobDropdown, setShowJobDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setShowJobDropdown(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredJobs = useMemo(() => {
    const all: { ind: string, title: string, roleId: string | null }[] = [];
    Object.entries(groupedJobs).forEach(([ind, arr]) => arr.forEach(job => all.push({ ind, title: job.title, roleId: job.roleId })));
    if (!jobSearchQuery.trim()) return all;
    const q = jobSearchQuery.toLowerCase();
    return all.filter(j => j.title.toLowerCase().includes(q) || j.ind.toLowerCase().includes(q));
  }, [groupedJobs, jobSearchQuery]);

  useEffect(() => {
    async function fetchJobs() {
      setLoadingJobs(true);
      try {
        const res = await fetch('/api/jobs');
        if (!res.ok) throw new Error('API Error');
        const { data, error } = await res.json();
        if (error) throw new Error(error);
        if (!data) return;
        const excludeRegex = /chủ|kinh doanh tự do|founder|owner/i;
        const groups: Record<string, Map<string, JobOption> | Set<string>> = {};
        const seenTitles = new Set<string>();
        data.forEach((item: { industry?: string; job_title: string; role_id?: string | null }) => {
          if (excludeRegex.test(item.job_title)) return;
          const titleKey = normalizeRoleText(item.job_title);
          if (seenTitles.has(titleKey)) return;
          seenTitles.add(titleKey);
          const ind = AVIATION_ROLE_REGEX.test(titleKey)
            ? 'Dịch vụ/Vận tải hàng không'
            : item.industry || 'Ngành khác';
          if (!groups[ind]) groups[ind] = new Map<string, JobOption>();
          (groups[ind] as Map<string, JobOption>).set(titleKey, { title: item.job_title, roleId: item.role_id || null });
        });
        if (!groups['Dịch vụ/Vận tải hàng không']) groups['Dịch vụ/Vận tải hàng không'] = new Set();
        if (!seenTitles.has('tiep vien hang khong')) {
          (groups['Dịch vụ/Vận tải hàng không'] as Set<string>).add('Tiếp viên hàng không');
        }
        const formatted: Record<string, JobOption[]> = {};
        for (const ind in groups) {
          const values: Array<JobOption | string> = groups[ind] instanceof Map
            ? Array.from(groups[ind].values())
            : Array.from(groups[ind].values());
          formatted[ind] = values
            .map(value => typeof value === 'string'
              ? {
                  title: value,
                  roleId: normalizeRoleText(value) === 'tiep vien hang khong' ? 'tiep vien hang khong__van tai - logistics' : null,
                }
              : value)
            .sort((a, b) => a.title.localeCompare(b.title));
        }
        setGroupedJobs(formatted);
      } catch (err) { console.error('Fetch jobs failed:', err); }
      finally { setLoadingJobs(false); }
    }
    fetchJobs();
  }, []);

  // Ring animation when step=3
  useEffect(() => {
    if (step !== 3) return;
    const target = 100 - resultPercent; const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / 1500, 1);
      setAnimatedFill((1 - Math.pow(1 - p, 3)) * target);
      if (p < 1) animRef.current = requestAnimationFrame(tick);
    };
    setAnimatedFill(0); animRef.current = requestAnimationFrame(tick);
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [step, resultPercent]);

  // Scanning animation logic (step=2)
  useEffect(() => {
    if (step !== 2) return;
    setScanStep(0); setScanProgress(0);
    const durations = [900, 1100, 1000, 800];
    const progressTargets = [25, 60, 80, 100];
    const runStep = (idx: number) => {
      setScanStep(idx);
      const targetPct = progressTargets[idx];
      const prevPct = idx === 0 ? 0 : progressTargets[idx - 1];
      const duration = durations[idx];
      const startTime = performance.now();

      const animProgress = (now: number) => {
        const elapsed = now - startTime;
        const p = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - p, 2);
        setScanProgress(prevPct + (targetPct - prevPct) * eased);
        if (p < 1) { requestAnimationFrame(animProgress); }
        else {
          setScanProgress(targetPct);
          if (idx < SCAN_STEPS.length - 1) {
            setTimeout(() => runStep(idx + 1), 150);
          } else {
            // All steps done — show result
            setTimeout(() => {
              if (pendingResult.current) {
                const { percent, dbData: db, isAboveMedian: iam, lostMoney: lm, benchmark } = pendingResult.current;
                setResultPercent(percent);
                setDbData(db);
                setBenchmarkMeta(benchmark);
                setIsAboveMedian(iam);
                setLostMoney(lm);
                setStep(3);
              }
            }, 400);
          }
        }
      };
      requestAnimationFrame(animProgress);
    };

    runStep(0);
  }, [step]);

  const applyAudiencePreset = useCallback((preset: AudiencePreset) => {
    const province = getWorkProvince(preset.workProvince);
    if (preset.salary) {
      const presetSalary = formatMoneyInput(preset.salary);
      setSalary(presetSalary);
      setSalaryError(getSalaryValidationError(presetSalary));
    }
    setExperience(preset.experience);
    setWorkProvince(province.key as WorkProvinceKey);
    setMarketLocation(province.marketLocation);
    setIsCustomMode(false);
    setJobSearchQuery('');
    setSelectedRoleId('');

    if (preset.jobTitle) {
      setSelectedJob(preset.jobTitle);
      setShowJobDropdown(false);
    } else {
      setSelectedJob('');
      setShowJobDropdown(true);
    }

    setShowAudiencePresets(false);
    showToast(preset.prompt, 'info');
  }, [showToast]);

  const handleScan = async () => {
    if (scanSubmittingRef.current) return;
    if (!selectedJob || !salary) { showToast('Vui lòng nhập đủ Nghề nghiệp và Thu nhập!', 'error'); return; }
    if (!agreedToTerms) { showToast('Vui lòng đồng ý với Chính sách bảo mật và Điều khoản sử dụng!', 'error'); return; }

    const userSal = parseMoneyInput(salary);
    const currentSalaryError = getSalaryValidationError(salary);
    if (currentSalaryError) {
      setSalaryError(currentSalaryError);
      showToast(currentSalaryError, 'error');
      return;
    }

    // Start scanning animation immediately
    const scanVspiId = genVSPIId();
    scanSubmittingRef.current = true;
    setIsScanSubmitting(true);
    setVspiId(scanVspiId);
    setIsPremiumUnlocked(false);
    setShowPaywallBox(false);
    setAiAnalysis('');
    paywallSeenRef.current = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try {
      localStorage.removeItem(PREMIUM_SESSION_KEY);
      localStorage.removeItem(PREMIUM_PENDING_KEY);
      localStorage.removeItem('vspi-roadmap-v2');
    } catch {
      // ignore storage errors
    }
    setStep(2);

    try {
      if (isNaN(userSal) || userSal <= 0) { showToast('Thu nhập không hợp lệ', 'error'); setStep(1); return; }

      trackEvent('scan_started', {
        salary_band: getSalaryBand(userSal),
        income_type: incomeType,
        experience,
        market_location: marketLocation,
        work_province: workProvince,
        custom_job: isCustomMode,
      });

      const res = await fetch('/api/scan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_title: selectedJob, salary: userSal, income_type: incomeType, experience, market_location: marketLocation, work_province: workProvince })
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      trackEvent('scan_completed', {
        percent: json.percent,
        salary_band: getSalaryBand(userSal),
        income_type: json.incomeType ?? incomeType,
        experience: json.experience ?? experience,
        market_location: json.marketLocation ?? marketLocation,
        work_province: json.workProvince ?? workProvince,
        confidence_score: json.benchmark?.confidenceScore,
        match_type: json.benchmark?.matchType,
      });

      // Store result — animation will pick it up when done
      pendingResult.current = { percent: json.percent, dbData: json.dbData, isAboveMedian: json.isAboveMedian, lostMoney: json.lostMoney, benchmark: json.benchmark ?? null };

      try {
        const savedPhone = localStorage.getItem(SHARED_PHONE_KEY);
        const savedName = saveSharedName(certName || fullName || readSharedName());
        const scanOpportunity = getStrategicOpportunity(json.benchmark ?? null, userSal, json.percent);
        localStorage.removeItem('vspi-roadmap-v2');
        localStorage.setItem('vspi-roadmap-draft-v1', JSON.stringify({
          fullName: savedName || undefined,
          job: selectedJob,
          selectedRoleId: selectedRoleId || undefined,
          salary: userSal,
          incomeType,
          duration: 6,
          percent: json.percent,
          experience: json.experience ?? experience,
          marketLocation,
          workProvince: json.workProvince ?? workProvince,
          compassTargetSalary: scanOpportunity.targetSalary || undefined,
          compassTargetLabel: scanOpportunity.label,
          phone: savedPhone || undefined,
          savedAt: Date.now(),
        }));
        localStorage.setItem(PREMIUM_SESSION_KEY, JSON.stringify({
          isPremiumUnlocked: false,
          vspiId: scanVspiId,
          selectedJob: repairMojibakeText(selectedJob),
          selectedRoleId: selectedRoleId || undefined,
          salary: userSal,
          incomeType,
          resultPercent: json.percent,
          lostMoney: json.lostMoney,
          dbData: json.dbData,
          benchmarkMeta: json.benchmark ?? null,
          aiAnalysis: '',
          experience: json.experience ?? experience,
          marketLocation,
          workProvince: json.workProvince ?? workProvince,
          savedAt: Date.now(),
        }));
      } catch {
        // ignore storage errors
      }

      // Lưu scan history (fire-and-forget — không block UX)
      const estimatedSkills = getSimulatorSkillsForJob(selectedJob).map(skill => skill.label);
      fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...getAttributionPayload(),
          phone: null, // sẽ gán SĐT khi user mua premium
          job_title: selectedJob,
          salary: userSal,
          income_type: incomeType,
          percent: json.percent,
          experience,
          market_location: marketLocation,
          work_province: workProvince,
          is_custom_job: isCustomMode,
          match_type: json.matchType ?? json.benchmark?.matchType,
          has_direct_data: json.hasDirectData ?? false,
          estimated_industry: json.dbData?.industry ?? json.benchmark?.industry,
          estimated_top_50: json.dbData?.top_50,
          estimated_top_20: json.dbData?.top_20,
          estimated_top_10: json.benchmark?.thresholdPreview?.find((row: { label: string }) => row.label === 'Top 10%')?.salary,
          estimated_top_5: json.benchmark?.thresholdPreview?.find((row: { label: string }) => row.label === 'Top 5%')?.salary,
          estimated_skills: estimatedSkills,
        }),
      }).catch(() => {});
    } catch (err) {
      console.error('Scan error:', err);
      scanSubmittingRef.current = false;
      setIsScanSubmitting(false);
      trackEvent('scan_failed', {
        experience,
        income_type: incomeType,
        market_location: marketLocation,
        work_province: workProvince,
      });
      setStep(1);
      showToast('Có lỗi xảy ra khi truy vấn dữ liệu. Vui lòng thử lại sau.', 'error');
    }
  };

  const strokeDashoffset = CIRCUMFERENCE - (animatedFill / 100) * CIRCUMFERENCE;
  const ringColor = getRingColor(resultPercent);
  const stats = useStats();
  const selectedWorkProvince = getWorkProvince(workProvince);
  const selectedBenchmarkMarket = MARKET_LOCATIONS.find(item => item.key === marketLocation) ?? MARKET_LOCATIONS[0];
  const isBenchmarkMarketOverride = marketLocation !== selectedWorkProvince.marketLocation;
  const currentSalaryNumber = parseMoneyInput(salary);
  const safeDbData = sanitizeSalaryDataForJob(dbData, selectedJob);
  const safeBenchmarkMeta = sanitizeBenchmarkForJob(benchmarkMeta, selectedJob, safeDbData);
  const safeAiAnalysis = isDirtyInsightForJob(aiAnalysis, selectedJob)
    ? buildSafePremiumInsight(selectedJob, currentSalaryNumber, resultPercent, safeBenchmarkMeta?.strategicTargetLabel, safeBenchmarkMeta?.strategicTargetSalary)
    : repairMojibakeText(aiAnalysis);
  const opportunityGap = getStrategicOpportunity(safeBenchmarkMeta, currentSalaryNumber, resultPercent);
  const strategicLostMoney = Math.max(lostMoney, opportunityGap.gapMonthly * 12);
  const resultTrustScore = Math.max(0, Math.min(100, Math.round(safeBenchmarkMeta?.confidenceScore ?? 78)));
  const resultTrustLabel = resultTrustScore >= 85 ? 'Rất cao' : resultTrustScore >= 70 ? 'Khá cao' : resultTrustScore >= 55 ? 'Tham chiếu gần' : 'Cần kiểm chứng';
  const trustedSourceLabelMap = new Map(
    TRUSTED_SALARY_SOURCES.flatMap(source => [
      [source.name, source.shortLabel],
      [source.label, source.shortLabel],
      [source.shortLabel, source.shortLabel],
    ] as Array<[string, string]>)
  );
  const normalizeResultSourceChip = (source: string) => {
    const cleaned = source.replace(/VSPI\s+Legacy\s+Salary\s+Data/i, 'VSPI Salary Data').trim();
    if (!cleaned || /VSPI\s+Salary\s+Data/i.test(cleaned)) return '';
    if (/minimum wage|lương tối thiểu|luong toi thieu/i.test(cleaned)) return '';
    return trustedSourceLabelMap.get(cleaned) || cleaned;
  };
  const resultSources = Array.from(new Set(
    [...(safeBenchmarkMeta?.sources || []), ...RESULT_SOURCE_CHIPS]
      .map(normalizeResultSourceChip)
      .filter(Boolean)
  )).slice(0, 12);
  const resultMatchLabel = safeBenchmarkMeta?.matchedJobTitle && isSameRoleSegment(selectedJob, safeBenchmarkMeta.matchedJobTitle, safeBenchmarkMeta.industry)
    ? safeBenchmarkMeta.matchedJobTitle
    : selectedJob;

  useEffect(() => {
    const needsRepair = (benchmarkMeta && !safeBenchmarkMeta) || (dbData && !safeDbData) || isDirtyInsightForJob(aiAnalysis, selectedJob);
    if (step !== 3 || !selectedJob.trim() || !currentSalaryNumber || !needsRepair) return;
    const repairKey = `${selectedJob}|${currentSalaryNumber}|${experience}|${marketLocation}|${workProvince}`;
    if (benchmarkRepairRef.current === repairKey) return;
    benchmarkRepairRef.current = repairKey;

    const controller = new AbortController();
    fetch('/api/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        job_title: selectedJob,
        salary: currentSalaryNumber,
        experience,
        market_location: marketLocation,
        work_province: workProvince,
        income_type: incomeType,
      }),
    })
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (!data) return;
        const repairedDbData = sanitizeSalaryDataForJob(repairMojibakeDeep(data.dbData) as SalaryData, selectedJob);
        const repairedBenchmark = sanitizeBenchmarkForJob(repairMojibakeDeep(data.benchmark) as BenchmarkMeta, selectedJob, repairedDbData);
        if (Number.isFinite(Number(data.percent))) setResultPercent(Number(data.percent));
        if (Number.isFinite(Number(data.lostMoney))) setLostMoney(Number(data.lostMoney));
        if (repairedDbData) setDbData(repairedDbData);
        if (repairedBenchmark) setBenchmarkMeta(repairedBenchmark);
        if (isDirtyInsightForJob(aiAnalysis, selectedJob)) {
          setAiAnalysis(buildSafePremiumInsight(
            selectedJob,
            currentSalaryNumber,
            Number.isFinite(Number(data.percent)) ? Number(data.percent) : resultPercent,
            repairedBenchmark?.strategicTargetLabel,
            repairedBenchmark?.strategicTargetSalary
          ));
        }
      })
      .catch(() => {});

    return () => controller.abort();
  }, [aiAnalysis, benchmarkMeta, currentSalaryNumber, dbData, experience, incomeType, marketLocation, resultPercent, safeBenchmarkMeta, safeDbData, selectedJob, step, workProvince]);

  useEffect(() => {
    if (landingTrackedRef.current) return;
    landingTrackedRef.current = true;
    trackFunnelEvent('view_landing', {
      job: selectedJob || 'unknown',
      city: selectedWorkProvince.label,
      percentile: resultPercent,
      package: '29k',
    });
  }, [selectedJob, selectedWorkProvince.label, resultPercent]);

  const painMsg = () => {
    const f = strategicLostMoney.toLocaleString('vi-VN');
    if (isAboveMedian && resultPercent <= 20) return <><strong className="text-red-700">{f}đ/năm</strong> đang bị bỏ lại so với nhóm Top {resultPercent <= 10 ? '5' : '10'}% — khoảng cách hoàn toàn có thể xóa bỏ.</>;
    if (opportunityGap.targetSalary && opportunityGap.gapMonthly > 0) {
      const top50Salary = getThreshold(safeBenchmarkMeta, 'Top 50%') || 0;
      const top50Gap = Math.max(0, top50Salary - currentSalaryNumber);
      if (top50Salary > 0 && top50Gap > 0 && top50Gap < getMeaningfulStrategicGap(currentSalaryNumber) && opportunityGap.label !== 'Top 50%') {
        return <>
          Bạn đang <strong className="text-red-700">tiệm cận Top 50%</strong>; khoảng cách {fmtM(top50Gap)}/tháng quá nhỏ để dừng lại. Mốc đáng xem là{' '}
          <strong className="text-red-700">{opportunityGap.label}</strong> khoảng <strong className="text-red-700">{fmtM(opportunityGap.targetSalary)}/tháng</strong>.
        </>;
      }
      return <>
        Bạn chọn mốc kinh nghiệm <strong className="text-red-700">{EXPERIENCE_META[experience].label}</strong>. Khoảng cách đáng nhìn không phải +1M, mà là tới{' '}
        <strong className="text-red-700">{opportunityGap.label}</strong> khoảng <strong className="text-red-700">{fmtM(opportunityGap.targetSalary)}/tháng</strong>.
      </>;
    }
    return <>Mỗi năm bạn đang <strong className="text-red-700">"bỏ lỡ" {f}đ</strong> — so với mốc thị trường cao hơn của cùng nhóm kinh nghiệm.</>;
  };

  const openPaywallFromCta = (source: string) => {
    setShowPaywallBox(true);
    trackEvent('paywall_intent', {
      source,
      product: 'premium',
      package: '29k',
      percent: resultPercent,
      salary_band: getSalaryBand(currentSalaryNumber),
      experience,
      market_location: marketLocation,
      work_province: workProvince,
    });
    requestAnimationFrame(() => {
      document.getElementById('paywall-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  // Effective display name: certName if entered, else fullName
  const displayName = certName.trim() || fullName.trim() || 'Bạn';

  return (
    <div className="min-h-screen w-full max-w-[100svw] overflow-x-hidden bg-[#0a0c10] flex items-start justify-center px-3 pb-4 pt-6 font-sans text-[#f0ede8] sm:px-4">
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
        .fade-up{animation:fadeUp 0.45s ease both}
        @keyframes pulseSoft{0%,100%{opacity:1}50%{opacity:.55}}
        .pulse-soft{animation:pulseSoft 2s ease infinite}
        @keyframes scanLine{0%{transform:translateY(-100%)}100%{transform:translateY(400%)}}
        .scan-line{animation:scanLine 1.5s ease-in-out infinite}
        @keyframes scanDown{0%{top:-5%}50%{top:105%}100%{top:-5%}}
        @keyframes salaryScan{0%{top:8%;opacity:0}12%{opacity:.75}50%{opacity:.55}88%{opacity:.75}100%{top:92%;opacity:0}}
        @keyframes gridPulse{0%,100%{opacity:.14}50%{opacity:.28}}
        .salary-scan-grid{background-image:linear-gradient(rgba(232,184,75,.07) 1px,transparent 1px),linear-gradient(90deg,rgba(232,184,75,.05) 1px,transparent 1px);background-size:34px 34px;animation:gridPulse 4s ease-in-out infinite}
        .salary-scan-beam{animation:salaryScan 4.2s ease-in-out infinite}
      `}</style>
      <div className="w-full max-w-[min(100%,28rem)] min-w-0 space-y-3 overflow-x-hidden break-words">

        {/* Trust bar */}
        <div className="overflow-hidden bg-[#0f1219]/80 backdrop-blur rounded-2xl px-3 py-3 border border-white/10 shadow-sm sm:px-4">
          <button onClick={() => setShowSources(s => !s)} className="flex w-full min-w-0 items-center justify-between gap-2 text-left">
            <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
              <span className="shrink-0 text-[10px] font-mono font-black text-[#f0ede8]/45 uppercase tracking-widest">Dữ liệu từ</span>
              <div className="flex min-w-0 max-w-full flex-wrap gap-1.5">
                {RESULT_SOURCE_CHIPS.filter(s => s !== 'VSPI Salary Data').slice(0, 8).map(s => (
                  <span key={s} className="max-w-full truncate font-mono text-[9px] font-bold bg-[#161b26] text-[#f0ede8]/70 px-2 py-0.5 rounded-full border border-white/10">
                    {s}
                  </span>
                ))}
              </div>
            </div>
            <span className="shrink-0 text-[#f0ede8]/45 text-xs">{showSources ? '▲' : '▼'}</span>
          </button>
          {showSources && (
            <div className="mt-3 space-y-2 fade-up">
              {DATA_SOURCES.map(src => (
                <div key={src.name} className="flex gap-2">
                  <span className="text-[#e8b84b] text-xs mt-0.5">✓</span>
                  <div><p className="font-sans text-[11px] font-bold text-[#f0ede8]">{src.label}</p><p className="font-sans text-[10px] text-[#f0ede8]/45">{src.detail}</p></div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── STEP 1: FORM ── */}
        {step === 1 && (
          <div className="relative w-full max-w-full overflow-hidden bg-[#0f1219] rounded-[1.5rem] p-5 shadow-2xl shadow-black/50 border border-white/10 fade-up sm:rounded-[2rem] sm:p-8">
            <div className="salary-scan-grid absolute inset-0 pointer-events-none" />
            <div className="salary-scan-beam absolute left-5 right-5 h-px pointer-events-none"
              style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(232,184,75,0.15) 10%, rgba(232,184,75,0.9) 50%, rgba(232,184,75,0.15) 90%, transparent 100%)', boxShadow: '0 0 18px rgba(232,184,75,0.45), 0 0 42px rgba(232,184,75,0.18)' }} />
            <div className="absolute left-5 top-5 w-8 h-8 border-l border-t border-[#e8b84b]/30 rounded-tl-xl pointer-events-none" />
            <div className="absolute right-5 bottom-5 w-8 h-8 border-r border-b border-[#e8b84b]/30 rounded-br-xl pointer-events-none" />
            <div className="relative z-10 text-center mb-8">
              <h1 className="font-black text-[#f0ede8] mb-4" style={{ fontSize: 'clamp(1.9rem, 8vw, 3.2rem)', lineHeight: 1.12 }}>
                Lương bạn đang đứng <br />
                <span className="font-serif italic text-[#e8b84b]">Top mấy %</span> tại Việt Nam?
              </h1>
              <p className="text-[#f0ede8]/70 text-sm md:text-base leading-relaxed">
                Hệ thống ước tính vị trí thu nhập của bạn từ dữ liệu GSO, salary guide và các nền tảng tuyển dụng lớn. <span className="text-[#e8b84b]">Có nguồn, có độ tin cậy, có mốc Top % rõ ràng.</span>
              </p>
            </div>

            <div className="relative z-10 space-y-5">
              {/* Nghề nghiệp */}
              <div>
                <label className="block text-[11px] font-mono font-bold text-[#f0ede8]/70 uppercase tracking-widest mb-2">Nghề nghiệp hiện tại</label>
                {!isCustomMode ? (
                  loadingJobs ? (
                    <div className="w-full bg-[#161b26] border border-white/10 rounded-xl p-4 text-[#f0ede8]/70 flex items-center gap-2 text-sm">
                      <div className="w-3 h-3 border-2 border-[#e8b84b] border-t-transparent rounded-full animate-spin" />
                      Đang tải danh sách ngành nghề...
                    </div>
                  ) : (
                    <div className="relative" ref={dropdownRef}>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#f0ede8]/45">🔍</span>
                        <input type="text"
                          className="w-full bg-[#161b26] border border-white/10 rounded-xl py-4 pl-10 pr-10 text-[#f0ede8] focus:border-[#e8b84b] focus:ring-1 focus:ring-[#e8b84b] outline-none transition-all text-base placeholder:text-[#f0ede8]/30"
                          placeholder="Tìm ngành nghề (vd: marketing...)"
                          value={showJobDropdown ? jobSearchQuery : selectedJob}
                          onChange={e => { setJobSearchQuery(e.target.value); setShowJobDropdown(true); if (e.target.value === '') { setSelectedJob(''); setSelectedRoleId(''); } }}
                          onFocus={() => { setShowJobDropdown(true); setJobSearchQuery(''); }}
                        />
                        {selectedJob && !showJobDropdown && (
                          <button className="absolute right-4 top-1/2 -translate-y-1/2 text-[#0a0c10] hover:bg-[#e8b84b]/80 w-6 h-6 flex items-center justify-center bg-[#e8b84b] rounded-full text-xs font-bold transition-colors"
                            onClick={e => { e.stopPropagation(); setSelectedJob(''); setJobSearchQuery(''); setShowJobDropdown(true); }}>✕</button>
                        )}
                        {(!selectedJob || showJobDropdown) && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#f0ede8]/45 pointer-events-none text-xs">▼</span>}
                      </div>
                      {showJobDropdown && (
                        <div className="absolute z-50 w-full mt-2 bg-[#161b26] border border-white/10 rounded-2xl shadow-xl max-h-60 overflow-y-auto">
                          {filteredJobs.length === 0 ? (
                            <div className="p-4 text-center text-sm text-[#f0ede8]/45">
                              <p className="mb-2">Không tìm thấy "{jobSearchQuery}"</p>
                              <button className="text-[#e8b84b] font-bold bg-[#e8b84b]/10 border border-[#e8b84b]/20 px-4 py-2 rounded-xl w-full hover:bg-[#e8b84b]/20 transition-colors"
                                onClick={() => { setIsCustomMode(true); setShowJobDropdown(false); setSelectedJob(jobSearchQuery); }}>➕ Thêm ngành này</button>
                            </div>
                          ) : (
                            <ul className="py-2">
                              {filteredJobs.map((j, i) => (
                                <li key={i} className="px-4 py-2.5 hover:bg-white/5 cursor-pointer flex flex-col transition-colors border-b border-white/5 last:border-0"
                                  onClick={() => { setSelectedJob(j.title); setSelectedRoleId(j.roleId || ''); setShowJobDropdown(false); }}>
                                  <span className="text-sm font-bold text-[#f0ede8]">{j.title}</span>
                                  <span className="text-[10px] text-[#f0ede8]/45 uppercase tracking-wider">{j.ind}</span>
                                </li>
                              ))}
                              <li className="px-4 py-3 hover:bg-white/5 cursor-pointer border-t border-white/10 bg-white/5 mt-1"
                                onClick={() => { setIsCustomMode(true); setShowJobDropdown(false); setSelectedJob(jobSearchQuery); }}>
                                <span className="text-sm text-[#e8b84b] font-black">➕ Ngành khác (nhập tay)...</span>
                              </li>
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                  )
                ) : (
                  <div className="relative">
                    <input type="text" autoFocus placeholder="VD: Hướng dẫn viên, Chủ shop..."
                      className="w-full bg-[#161b26] border border-[#e8b84b] rounded-xl p-4 text-[#f0ede8] ring-4 ring-[#e8b84b]/20 outline-none text-sm"
                      value={selectedJob} onChange={e => { setSelectedRoleId(''); setSelectedJob(e.target.value); }} />
                    <button className="absolute right-4 top-1/2 -translate-y-1/2 text-[#f0ede8]/45 hover:text-red-400"
                      onClick={() => { setIsCustomMode(false); setSelectedJob(''); }}>✕</button>
                  </div>
                )}
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => setShowAudiencePresets(v => !v)}
                    className="w-full flex items-center justify-between rounded-xl border border-white/8 bg-[#161b26]/45 px-3 py-2.5 text-left hover:border-[#e8b84b]/30 transition-colors"
                  >
                    <span className="text-[11px] text-[#f0ede8]/55">
                      Bạn thuộc nhóm đặc biệt? <span className="text-[#e8b84b]/80 font-bold">Chọn mẫu nhanh</span>
                    </span>
                    <span className="text-[10px] text-[#f0ede8]/35">{showAudiencePresets ? '▲' : '▼'}</span>
                  </button>
                  {showAudiencePresets && (
                    <div className="mt-2 bg-[#161b26]/70 border border-white/8 rounded-2xl p-3 fade-up">
                      <div className="grid grid-cols-3 gap-2">
                        {AUDIENCE_PRESETS.map(preset => (
                          <button
                            key={preset.id}
                            type="button"
                            onClick={() => applyAudiencePreset(preset)}
                            title={preset.description}
                            className={`min-h-[58px] rounded-xl border px-2 py-2 text-left transition-all
                              ${preset.id === 'fresh-graduate'
                                ? 'bg-[#e8b84b]/10 border-[#e8b84b]/30 hover:bg-[#e8b84b]/15'
                                : 'bg-[#0f1219] border-white/10 hover:border-[#e8b84b]/40'}`}
                          >
                            <span className={`block text-[11px] font-black leading-tight ${preset.id === 'fresh-graduate' ? 'text-[#e8b84b]' : 'text-[#f0ede8]'}`}>
                              {preset.shortLabel}
                            </span>
                            <span className="block text-[9px] text-[#f0ede8]/40 mt-1 leading-tight">{preset.subLabel}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Thu nhập */}
              <div>
                <label className="block text-[11px] font-mono font-bold text-[#f0ede8]/70 uppercase tracking-widest mb-2">Thu nhập tháng (VNĐ)</label>
                <input type="text" inputMode="numeric" placeholder="VD: 13,000,000"
                  aria-invalid={!!salaryError}
                  className={`w-full bg-[#161b26] border rounded-xl p-4 text-[#f0ede8] focus:ring-1 outline-none transition-all text-base placeholder:text-[#f0ede8]/30 ${salaryError ? 'border-red-400 focus:border-red-400 focus:ring-red-400' : 'border-white/10 focus:border-[#e8b84b] focus:ring-[#e8b84b]'}`}
                  value={salary} onChange={e => {
                    const formatted = formatMoneyInput(e.target.value);
                    setSalary(formatted);
                    setSalaryError(getSalaryValidationError(formatted, e.target.value));
                  }} />
                {salaryError
                  ? <p className="text-[11px] font-mono text-red-300 mt-2 pl-1">{salaryError}</p>
                  : parseMoneyInput(salary) > 0 && <p className="text-[11px] font-mono text-[#e8b84b] mt-2 pl-1">≈ {parseMoneyInput(salary).toLocaleString('vi-VN')} đồng/tháng</p>}
              </div>

              <div>
                <label className="block text-[11px] font-mono font-bold text-[#f0ede8]/70 uppercase tracking-widest mb-2">
                  Bạn đang nhập loại thu nhập nào?
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {INCOME_TYPE_OPTIONS.map(type => {
                    const meta = INCOME_TYPE_META[type];
                    const active = incomeType === type;
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setIncomeType(type)}
                        className={`min-h-[54px] rounded-xl border px-3 py-2 text-left transition-all ${active ? 'border-[#e8b84b] bg-[#e8b84b]/10 shadow-[0_0_12px_rgba(232,184,75,0.16)]' : 'border-white/10 bg-[#161b26] hover:border-white/25'}`}
                      >
                        <span className={`block text-[12px] font-black leading-tight ${active ? 'text-[#e8b84b]' : 'text-[#f0ede8]'}`}>{meta.short}</span>
                        <span className="mt-0.5 block text-[9px] leading-tight text-[#f0ede8]/45">{meta.label}</span>
                      </button>
                    );
                  })}
                </div>
                <p className="mt-2 rounded-xl border border-white/8 bg-[#0f1219] px-3 py-2 text-[10.5px] leading-4 text-[#f0ede8]/55">
                  {INCOME_TYPE_META[incomeType].note}
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-mono font-bold text-[#f0ede8]/70 uppercase tracking-widest mb-2">
                  Bạn đang làm việc ở đâu? <span className="text-red-400">*</span>
                </label>
                <select
                  value={workProvince}
                  onChange={e => {
                    const province = getWorkProvince(e.target.value);
                    setWorkProvince(province.key as WorkProvinceKey);
                    setMarketLocation(province.marketLocation);
                  }}
                  className="w-full bg-[#161b26] border border-white/10 rounded-xl p-4 text-[#f0ede8] focus:border-[#e8b84b] focus:ring-1 focus:ring-[#e8b84b] outline-none transition-all text-sm"
                >
                  {WORK_PROVINCES.map(item => (
                    <option key={item.key} value={item.key}>{item.label}</option>
                  ))}
                </select>
                <p className="text-[10px] text-[#f0ede8]/35 mt-2 pl-1">
                  Chọn nơi bạn đang làm việc hoặc nơi công ty dùng để trả lương, không phải quê quán. Nếu làm remote cho công ty HCM/Hà Nội/Đà Nẵng, hãy chọn thị trường lương của công ty ở bước bên dưới. VSPI đang đọc gần theo vùng lương: <span className="text-[#e8b84b]/80">{MARKET_LOCATIONS.find(item => item.key === selectedWorkProvince.marketLocation)?.label}</span>.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-mono font-bold text-[#f0ede8]/70 uppercase tracking-widest mb-2">
                  Lương của bạn do thị trường nào quyết định? <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {([
                    { key: selectedWorkProvince.marketLocation, label: `Theo ${selectedWorkProvince.label}`, sub: 'Công ty trả theo mặt bằng địa phương' },
                    { key: 'hcm', label: 'Công ty TP.HCM', sub: 'Remote/HQ trả theo HCM' },
                    { key: 'hanoi', label: 'Công ty Hà Nội', sub: 'Remote/HQ trả theo HN' },
                    { key: 'industrial', label: 'KCN / FDI', sub: 'Nhà máy, sản xuất, logistics' },
                  ] as const).filter((opt, index, options) => index === options.findIndex(item => item.key === opt.key)).map(opt => {
                    const active = marketLocation === opt.key;
                    return (
                      <button
                        key={`${opt.key}-${opt.label}`}
                        type="button"
                        onClick={() => setMarketLocation(opt.key)}
                        className={`min-h-[56px] rounded-xl border px-3 py-2 text-left transition-all ${active ? 'border-[#e8b84b] bg-[#e8b84b]/10 shadow-[0_0_12px_rgba(232,184,75,0.16)]' : 'border-white/10 bg-[#161b26] hover:border-white/25'}`}
                      >
                        <span className={`block text-[11px] font-black leading-tight ${active ? 'text-[#e8b84b]' : 'text-[#f0ede8]'}`}>{opt.label}</span>
                        <span className="mt-0.5 block text-[9px] leading-tight text-[#f0ede8]/45">{opt.sub}</span>
                      </button>
                    );
                  })}
                </div>
                <p className={`mt-2 rounded-xl border px-3 py-2 text-[10.5px] leading-4 ${isBenchmarkMarketOverride ? 'border-orange-400/25 bg-orange-400/8 text-orange-100/85' : 'border-white/8 bg-[#0f1219] text-[#f0ede8]/55'}`}>
                  {isBenchmarkMarketOverride
                    ? <>Bạn ở <strong className="text-[#f0ede8]">{selectedWorkProvince.label}</strong>, nhưng lương đang được so theo <strong className="text-[#e8b84b]">{selectedBenchmarkMarket.label}</strong>. Chọn cách này nếu công ty/offer trả theo HCM, Hà Nội hoặc cụm FDI.</>
                    : <>Đang so theo mặt bằng của <strong className="text-[#f0ede8]">{selectedWorkProvince.label}</strong>. Nếu bạn làm remote cho công ty HCM/Hà Nội, đổi sang thị trường của công ty để benchmark không bị thấp sai.</>}
                </p>
                {(marketLocation === 'province' || marketLocation === 'province_zone3') && (
                  <p className="mt-2 rounded-xl border border-cyan-400/15 bg-cyan-400/8 px-3 py-2 text-[10px] leading-4 text-cyan-100/75">
                    Tỉnh nhỏ đang dùng benchmark gần vùng theo nhóm thị trường, không phải khảo sát riêng từng huyện. Kết quả nên đọc cùng confidence score.
                  </p>
                )}
              </div>

              {/* Kinh nghiệm thực tế */}
              <div>
                <label className="block text-[11px] font-mono font-bold text-[#f0ede8]/70 uppercase tracking-widest mb-2">
                  Kinh nghiệm thực tế <span className="text-red-400">*</span>
                </label>
                <div className="grid min-w-0 grid-cols-3 gap-1.5 sm:gap-2">
                  {([
                    { value: 'junior', label: '0–2 năm', sub: 'Junior' },
                    { value: 'mid',    label: '3–5 năm', sub: 'Mid-level' },
                    { value: 'senior', label: 'Trên 5 năm', sub: 'Senior / Lead' },
                  ] as const).map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setExperience(opt.value)}
                      className={`min-w-0 flex flex-col items-center py-3 px-1.5 rounded-xl border-2 transition-all text-center sm:px-2
                        ${experience === opt.value
                          ? 'border-[#e8b84b] bg-[#e8b84b]/10 shadow-[0_0_12px_rgba(232,184,75,0.2)]'
                          : 'border-white/10 bg-[#161b26] hover:border-white/25'}`}
                    >
                      <span className={`text-[12px] font-black leading-tight sm:text-sm ${experience === opt.value ? 'text-[#e8b84b]' : 'text-[#f0ede8]'}`}>
                        {opt.label}
                      </span>
                      <span className="text-[8px] font-mono mt-0.5 leading-tight text-[#f0ede8]/45 sm:text-[9px]">{opt.sub}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Checkbox đồng ý */}
              <div className="flex items-start gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setAgreedToTerms(v => !v)}
                  className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${agreedToTerms ? 'bg-[#e8b84b] border-[#e8b84b]' : 'border-white/30 bg-transparent hover:border-[#e8b84b]/60'}`}
                  aria-label="Đồng ý điều khoản"
                >
                  {agreedToTerms && <span className="text-[#0a0c10] text-[11px] font-black leading-none">✓</span>}
                </button>
                <p className="text-[11px] text-[#f0ede8]/60 leading-relaxed">
                  Tôi đồng ý với{' '}
                  <Link href="/privacy" target="_blank" className="text-[#e8b84b] underline underline-offset-2 hover:text-[#f0ede8] transition-colors">Chính sách bảo mật</Link>
                  {' '}và{' '}
                  <Link href="/terms" target="_blank" className="text-[#e8b84b] underline underline-offset-2 hover:text-[#f0ede8] transition-colors">Điều khoản sử dụng</Link>
                </p>
              </div>

              <button
                onClick={() => { playTap(); handleScan(); }}
                disabled={!agreedToTerms || isScanSubmitting}
                className="w-full mt-6 p-4 bg-[#e8b84b] text-[#0a0c10] font-black rounded-xl text-base leading-tight hover:-translate-y-1 hover:shadow-[0_8px_32px_rgba(232,184,75,0.3)] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none sm:text-lg"
              >
                {isScanSubmitting ? 'Đang quét...' : '⚡ XEM NGAY TÔI ĐỨNG TOP MẤY %'}
              </button>

              <div className="pt-4 border-t border-white/10 mt-6 text-center">
                <p className="text-[10px] text-[#f0ede8]/45 mb-2 font-mono uppercase tracking-widest">Nguồn dữ liệu uy tín từ:</p>
                <div className="flex flex-wrap justify-center gap-2">
                  {RESULT_SOURCE_CHIPS.filter(s => s !== 'VSPI Salary Data').slice(0, 5).map(s => (
                    <span key={s} className="text-[10px] bg-white/5 border border-white/10 px-3 py-1 rounded-full text-[#f0ede8]/70">{s}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 2: SCANNING ANIMATION ── */}
        {step === 2 && (
          <div className="w-full max-w-full overflow-hidden bg-[#0f1219] rounded-[1.5rem] p-6 shadow-2xl flex flex-col items-center text-center fade-up border border-white/10 sm:rounded-[2rem] sm:p-10">
            {/* Animated scanner visual */}
            <div className="relative w-24 h-24 mb-6 overflow-hidden rounded-2xl border border-[#e8b84b]/20 bg-[#161b26]">
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-4xl">🔍</span>
              </div>
              <div className="scan-line absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-[#e8b84b] to-transparent opacity-80" />
            </div>

            <h3 className="text-xl font-serif text-[#f0ede8] mb-1 pulse-soft">
              {SCAN_STEPS[scanStep]?.label}
            </h3>
            <p className="text-sm font-sans text-[#f0ede8]/45 mb-6">
              {SCAN_STEPS[scanStep]?.detail}
            </p>

            {/* Progress bar */}
            <div className="w-full bg-[#161b26] rounded-full h-2 mb-3 overflow-hidden">
              <div
                className="h-full rounded-full bg-[#e8b84b] transition-all duration-300"
                style={{ width: `${scanProgress}%` }}
              />
            </div>
            <p className="text-[11px] font-mono text-[#e8b84b] mb-6">{Math.round(scanProgress)}%</p>

            {/* Step indicators */}
            <div className="flex gap-2 justify-center">
              {SCAN_STEPS.map((s, i) => (
                <div key={i} className={`flex items-center gap-1.5 ${i <= scanStep ? 'opacity-100' : 'opacity-30'}`}>
                  <div className={`w-2 h-2 rounded-full transition-all ${i < scanStep ? 'bg-green-400' : i === scanStep ? 'bg-[#e8b84b] animate-pulse' : 'bg-white/20'}`} />
                  {i < SCAN_STEPS.length - 1 && <div className={`w-4 h-px ${i < scanStep ? 'bg-green-400' : 'bg-white/10'}`} />}
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-wrap gap-1.5 justify-center">
              {RESULT_SOURCE_CHIPS.filter(s => s !== 'VSPI Salary Data').slice(0, 7).map(s => (
                <span key={s} className="font-mono text-[9px] bg-[#161b26] text-[#f0ede8]/45 border border-white/10 px-2 py-0.5 rounded-full pulse-soft">{s}</span>
              ))}
            </div>
          </div>
        )}

        {/* ── STEP 3: RESULT ── */}
        {step === 3 && (
          <div className="fade-up space-y-3 pb-32">
            {/* Ring */}
            <div className="relative overflow-hidden rounded-[2rem] border border-[#e8b84b]/30 bg-[#111722] p-5 text-center text-[#f0ede8] shadow-2xl shadow-black/30 sm:p-8">
              {/* Glow background */}
              <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#e8b84b]/14 to-transparent" />
              <div className="pointer-events-none absolute -left-20 top-4 h-44 w-44 rounded-full bg-[#e8b84b]/10 blur-3xl" />
              <div className="pointer-events-none absolute -right-16 bottom-10 h-40 w-40 rounded-full bg-[#22c55e]/8 blur-3xl" />

              <div className="relative z-10 mx-auto mb-4 flex max-w-sm items-center justify-between gap-3 border-b border-white/10 pb-4 text-left">
                <div className="min-w-0">
                  <p className="text-[10px] font-mono font-black uppercase tracking-[0.28em] text-[#e8b84b]">Top Lương Verified</p>
                  <p className="mt-1 text-[10px] leading-relaxed text-[#f0ede8]/50">Vietnam Salary Percentile Index · Q1/2026</p>
                </div>
                <div className="shrink-0 rounded-full border border-green-400/35 bg-green-400/10 px-3 py-1 text-[9px] font-black text-green-300">
                  VSPI ID
                </div>
              </div>
              <div className="relative mx-auto mb-4 h-44 w-44">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 140 140">
                  <circle cx="70" cy="70" r={RADIUS} fill="transparent" stroke="white" strokeOpacity="0.05" strokeWidth="10" />
                  <circle cx="70" cy="70" r={RADIUS} fill="transparent" stroke={ringColor} strokeWidth="10" strokeDasharray={CIRCUMFERENCE} strokeDashoffset={strokeDashoffset} strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xs font-mono font-bold text-[#f0ede8]/70">Top</span>
                  <span className="text-6xl font-serif font-black leading-none">{resultPercent}%</span>
                </div>
              </div>
              <p className="text-xl font-serif font-bold text-[#f0ede8]">
                {resultPercent >= 100 ? 'Bạn đang dưới mốc Top 80%' : `Bạn cao hơn khoảng ${100 - resultPercent}%`}
              </p>
              <p className="text-sm font-sans opacity-50 mb-1">
                {resultPercent >= 100 ? `cần bật khỏi vùng lương thấp của ngành ${selectedJob}` : `người cùng nghề, khu vực và kinh nghiệm`}
              </p>
              <p className="mx-auto mt-2 w-fit rounded-full border border-[#e8b84b]/25 bg-[#0a0c10]/55 px-3 py-1 text-[9px] font-mono font-black tracking-wide text-[#e8b84b]">VSPI ID: {vspiId}</p>
              <div className="mt-3 inline-flex max-w-full items-center gap-1.5 rounded-xl border border-[#22c55e] bg-[#0a2a1a] px-3 py-1.5">
                <span className="text-xs font-black leading-none text-[#22c55e]">✓</span>
                <span className="text-[11px] font-black text-[#f0ede8]">Đã đối chiếu benchmark nghề - khu vực</span>
              </div>
              <div className="mx-auto mt-3 flex max-w-sm flex-wrap justify-center gap-1.5">
                {resultSources.map(source => (
                  <span key={source} className="rounded-full border border-white/10 bg-[#0a0c10]/55 px-2.5 py-1 text-[9px] font-mono font-black text-[#f0ede8]/62">
                    {source}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-[8px] leading-relaxed text-[#f0ede8]/38">
                Top % là ước tính tham chiếu theo nghề, kinh nghiệm và khu vực. Số Top càng nhỏ càng cao; Top 80% là vùng thấp hơn median, không phải nhóm dẫn đầu. Có thể kiểm tra bằng VSPI ID.
              </p>
              {safeBenchmarkMeta?.matchedJobTitle && safeBenchmarkMeta.matchedJobTitle.toLowerCase() !== selectedJob.toLowerCase() && isSameRoleSegment(selectedJob, safeBenchmarkMeta.matchedJobTitle, safeBenchmarkMeta.industry) && (
                <p className="mt-2 text-[10px] text-[#f0ede8]/45">
                  Benchmark gần nhất: <span className="text-[#f0ede8]/70">{safeBenchmarkMeta.matchedJobTitle}</span>
                </p>
              )}
              {safeBenchmarkMeta?.marketLocation && (
                <p className="mt-1 text-[10px] text-[#f0ede8]/45">
                  Khu vực đã chọn: <span className="font-bold text-[#f0ede8]/80">{selectedWorkProvince.label}</span>
                  {safeBenchmarkMeta.marketLocation && safeBenchmarkMeta.marketLocation !== selectedWorkProvince.label
                    ? <span> · nhóm quy đổi: <span className="text-[#f0ede8]/70">{safeBenchmarkMeta.marketLocation}</span></span>
                    : null}
                  {safeBenchmarkMeta.locationMultiplier && safeBenchmarkMeta.locationMultiplier !== 1
                    ? <span> · hệ số {safeBenchmarkMeta.locationMultiplier.toFixed(2)}x</span>
                    : null}
                </p>
              )}
              <div className="mx-auto mt-4 grid max-w-sm grid-cols-2 gap-2 text-left">
                <div className="min-w-0 rounded-2xl border border-white/10 bg-[#0a0c10]/55 p-3">
                  <p className="text-[9px] font-mono uppercase tracking-wider text-[#f0ede8]/35">Mức tin cậy</p>
                  <p className="mt-1 text-lg font-black leading-none text-[#e8b84b]">{resultTrustScore}/100</p>
                  <p className="mt-1 text-[9px] font-bold text-[#f0ede8]/48">{resultTrustLabel}</p>
                </div>
                <div className="min-w-0 rounded-2xl border border-white/10 bg-[#0a0c10]/55 p-3">
                  <p className="text-[9px] font-mono uppercase tracking-wider text-[#f0ede8]/35">Khu vực</p>
                  <p className="mt-1 truncate text-sm font-black text-[#f0ede8]">{selectedWorkProvince.label}</p>
                  <p className="mt-1 text-[9px] font-bold text-[#f0ede8]/48">{EXPERIENCE_META[experience].label}</p>
                </div>
                <div className="min-w-0 rounded-2xl border border-white/10 bg-[#0a0c10]/55 p-3 col-span-2">
                  <p className="text-[9px] font-mono uppercase tracking-wider text-[#f0ede8]/35">Benchmark nghề</p>
                  <p className="mt-1 truncate text-sm font-black text-[#f0ede8]">{resultMatchLabel}</p>
                  <p className="mt-1 text-[9px] leading-relaxed text-[#f0ede8]/45">Đã điều chỉnh theo kinh nghiệm, khu vực và cách đọc thu nhập {INCOME_TYPE_META[incomeType].short}.</p>
                </div>
              </div>
              <div className="mx-auto mt-3 max-w-sm">
                <IncomeBasisNotice incomeType={incomeType} />
              </div>
              <div className="mt-4 border-t border-white/10 pt-4">
                <ResultSocialShare
                  percent={resultPercent}
                  job={selectedJob}
                  benchmark={safeBenchmarkMeta}
                  vspiId={vspiId}
                  onShowToast={showToast}
                />
              </div>
              {safeBenchmarkMeta?.ultraRankLabel && (
                <div className="mt-2 inline-block bg-[#e8b84b]/15 border border-[#e8b84b]/50 text-[#e8b84b] text-xs font-mono font-black px-3 py-1.5 rounded-full">
                  {safeBenchmarkMeta.ultraRankLabel}
                </div>
              )}
              {resultPercent <= 10 && <div className="mt-2 inline-block bg-[#e8b84b]/10 border border-[#e8b84b]/40 text-[#e8b84b] text-xs font-mono font-bold px-3 py-1 rounded-full">🏆 Elite — Top {resultPercent}% thị trường</div>}
            </div>

            {/* Pain / Elite box — conditional rendering theo resultPercent */}
            {resultPercent <= 10 ? (
              /* ── ELITE: viền vàng, không hiện số 0đ ── */
              <div className="bg-[#161b26] border border-[#e8b84b]/50 rounded-3xl p-5"
                style={{ boxShadow: '0 0 24px rgba(232,184,75,0.12)' }}>
                <h4 className="text-[#e8b84b] font-bold font-sans text-sm mb-3">🏆 Vị thế Tinh hoa — Nhóm dẫn đầu thị trường</h4>
                <p className="text-[#f0ede8]/80 text-sm leading-relaxed mb-3">
                  Bạn đã vượt qua <strong className="text-[#e8b84b]">{100 - resultPercent}%</strong> nhân sự cùng ngành.
                  Ở đẳng cấp này, cuộc chơi không còn là tăng lương cơ bản — mà là đàm phán{' '}
                  <strong className="text-[#e8b84b]">Cổ phần (ESOP)</strong>,{' '}
                  <strong className="text-[#e8b84b]">Thưởng KPI vượt khung (Out-of-band)</strong> và{' '}
                  <strong className="text-[#e8b84b]">Bảo vệ vị trí trước làn sóng tự động hóa</strong>.
                </p>
                <div className="bg-[#0f1219] rounded-xl p-3 border border-[#e8b84b]/20 text-center">
                  <p className="text-[10px] font-mono text-[#f0ede8]/45 mb-0.5">Bạn đang ở nhóm</p>
                  <p className="text-2xl font-serif text-[#e8b84b]">Top {resultPercent}% Elite 🏅</p>
                </div>
              </div>
            ) : (
              /* ── THƯỜNG: viền đỏ cảnh báo ── */
              <div className="bg-red-500/10 border border-red-500/30 rounded-3xl p-5">
                <h4 className="text-red-400 font-bold font-sans text-sm mb-2">⚠️ Cảnh báo lãng phí tài năng</h4>
                <p className="text-[#f0ede8] text-sm leading-relaxed">{painMsg()}</p>
                <div className="mt-3 bg-[#161b26] rounded-xl p-3 border border-red-500/20 text-center">
                  <p className="text-[10px] font-mono text-[#f0ede8]/45 mb-0.5">Khoảng cách tới {opportunityGap.label}</p>
                  <p className="text-2xl font-serif text-red-400">
                    {Math.round((opportunityGap.gapMonthly || lostMoney / 12)).toLocaleString('vi-VN')}đ/tháng
                  </p>
                  {opportunityGap.targetSalary > 0 && (
                    <p className="mt-1 text-[9px] text-[#f0ede8]/35">
                      Mốc tham chiếu: {fmtM(opportunityGap.targetSalary)}/tháng
                    </p>
                  )}
                </div>
                <p className="mt-3 text-[10px] leading-relaxed text-red-100/55">
                  Đây là khoảng cách chiến lược, không phải bảo bạn đòi tăng một phát ngay hôm nay. La Bàn chỉ ra mốc cần tới; checklist AI 79K sẽ chia mốc đó thành từng sprint có bằng chứng, KPI và kết quả để deal lương từng phần.
                </p>
              </div>
            )}

            {!isPremiumUnlocked && (
              <div className="overflow-hidden rounded-3xl border-2 border-[#e8b84b]/55 bg-[#0f1219] shadow-2xl shadow-[#e8b84b]/15">
                <div className="bg-[#e8b84b] px-5 py-2 text-center">
                  <p className="text-[10px] font-mono font-black uppercase tracking-[0.22em] text-[#0a0c10]">
                    Mở khóa nếu bạn muốn biết con số nên nói với HR
                  </p>
                </div>
                <div className="space-y-4 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-mono font-black uppercase tracking-[0.18em] text-[#e8b84b]">Báo cáo lương 29K</p>
                      <h3 className="mt-1 text-xl font-black leading-tight text-[#f0ede8]">
                        Biết mốc offer nên neo, câu nên nói, và bằng chứng cần chuẩn bị trước khi deal lương
                      </h3>
                    </div>
                    <div className="shrink-0 rounded-2xl border border-[#e8b84b]/35 bg-[#e8b84b]/10 px-3 py-2 text-right">
                      <p className="text-[10px] text-[#f0ede8]/35 line-through">59.000đ</p>
                      <p className="text-2xl font-black text-[#e8b84b]">29.000đ</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-3">
                    <div className="rounded-2xl border border-white/10 bg-[#161b26] p-3">
                      <p className="text-[10px] font-mono text-[#f0ede8]/40">Bạn nhập</p>
                      <p className="mt-0.5 truncate text-[12px] font-black text-[#f0ede8]">{fmtM(currentSalaryNumber)}/tháng</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-[#161b26] p-3">
                      <p className="text-[10px] font-mono text-[#f0ede8]/40">Mốc cần nhìn</p>
                      <p className="mt-0.5 truncate text-[12px] font-black text-[#e8b84b]">{opportunityGap.label}</p>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-[#161b26] p-3">
                      <p className="text-[10px] font-mono text-[#f0ede8]/40">Khu vực</p>
                      <p className="mt-0.5 truncate text-[12px] font-black text-[#f0ede8]">{selectedWorkProvince.label}</p>
                    </div>
                  </div>

                  <div className="space-y-2 rounded-2xl border border-[#e8b84b]/20 bg-[#e8b84b]/8 p-4">
                    {[
                      'Benchmark offer cùng profile nghề, level và khu vực trả lương của bạn',
                      'Con số nên neo khi HR hỏi mức lương mong muốn',
                      'Câu justify + bằng chứng cần chuẩn bị để HR tin mốc đó có cơ sở',
                    ].map(item => (
                      <div key={item} className="flex items-start gap-2">
                        <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-green-400/15 text-[11px] font-black text-green-300">✓</span>
                        <p className="text-[12px] font-bold leading-relaxed text-[#f0ede8]/85">{item}</p>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      playTap();
                      openPaywallFromCta('early_result_cta');
                    }}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#e8b84b] px-5 py-4 text-base font-black text-[#0a0c10] shadow-[0_12px_30px_rgba(232,184,75,0.38)] transition-all hover:-translate-y-0.5 hover:bg-[#f0c84b] active:scale-95"
                  >
                    <span>Mở QR thanh toán 29k</span>
                    <span aria-hidden>→</span>
                  </button>
                  <p className="text-center text-[10px] font-mono text-[#f0ede8]/45">
                    Không cần đăng nhập - chuyển khoản đúng mã VSPI - tự mở khóa sau khi xác nhận
                  </p>
                </div>
              </div>
            )}

            <CareerCompassGamification
              job={selectedJob}
              selectedRoleId={selectedRoleId}
              currentSalary={currentSalaryNumber}
              medianSalary={getThreshold(safeBenchmarkMeta, 'Top 50%') || safeDbData?.top_50 || currentSalaryNumber}
              targetSalary={opportunityGap.targetSalary || getThreshold(safeBenchmarkMeta, 'Top 20%') || safeDbData?.top_20 || currentSalaryNumber}
              benchmark={safeBenchmarkMeta}
              resultPercent={resultPercent}
              isUnlocked29k={isPremiumUnlocked}
              onUnlockClick={() => {
                playTap();
                trackEvent('career_compass_unlock_click', {
                  product: 'premium',
                  percent: resultPercent,
                });
                openPaywallFromCta('career_compass');
              }}
            />

            {!isPremiumUnlocked && (
              <PremiumDecisionPreview
                job={selectedJob}
                salary={currentSalaryNumber}
                resultPercent={resultPercent}
                gapMonthly={Math.round(opportunityGap.gapMonthly || lostMoney / 12)}
                targetLabel={opportunityGap.label}
                benchmark={safeBenchmarkMeta}
                experience={experience}
                workProvinceLabel={selectedWorkProvince.label}
              />
            )}

            {!isPremiumUnlocked && (
              <ZaloSalaryAlertBox
                job={selectedJob}
                city={selectedWorkProvince.label}
                percentile={resultPercent}
                salary={currentSalaryNumber}
                experience={experience}
                marketLocation={marketLocation}
                workProvince={workProvince}
              />
            )}

            {!isPremiumUnlocked ? (
              <>
                {/* Teaser Preview — cho user đọc trước khi thấy QR */}
                <div className="bg-[#0f1219] rounded-3xl overflow-hidden border border-white/10">
                  <div className="px-5 pt-5 pb-3">
                    <p className="mb-4 text-xs font-black text-[#e8b84b]">📋 Xem trước nội dung báo cáo</p>

                    {/* Preview đoạn 1 — hiện rõ */}
                    <div className="mb-3">
                      <p className="mb-1.5 text-xs font-black text-[#f0ede8]/50">Điều không ai nói thẳng với bạn</p>
                      <p className="text-sm text-[#f0ede8]/75 leading-relaxed">
                        {resultPercent >= 100
                          ? `Mức hiện tại đang thấp hơn mốc Top 80% của ngành ${selectedJob}. Báo cáo này chỉ ra việc cần làm để thoát vùng lương thấp nhanh nhất.`
                          : `Hầu hết người ở vị trí Top ${resultPercent}% không biết mình đang bị undervalue — và mất trung bình 3–5 năm mới nhận ra. Báo cáo này chỉ ra đúng 1 kỹ năng tạo ra khoảng cách lương lớn nhất trong ngành ${selectedJob}.`}
                      </p>
                    </div>

                    {/* Preview đoạn 2 — khóa thật sự, không render nội dung premium trên Android */}
                    <div className="relative">
                      <div className="select-none pointer-events-none opacity-30">
                        <p className="mb-1.5 text-xs font-black text-[#f0ede8]/50">Việc cần làm ngay trong 30 ngày tới</p>
                        <p className="text-sm text-[#f0ede8]/75 leading-relaxed">
                          Mở khóa để xem checklist cụ thể theo nghề, mức lương hiện tại và mục tiêu tăng thu nhập của bạn.
                        </p>
                      </div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="bg-[#0f1219]/85 backdrop-blur-sm text-[#e8b84b] text-[10px] font-mono font-bold px-3 py-1.5 rounded-full border border-[#e8b84b]/30">
                          🔒 Mở khóa để đọc đầy đủ
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* CTA bridge */}
                  <div className="bg-[#161b26] border-t border-white/8 px-5 py-3 flex items-center justify-between">
                    <p className="text-[11px] text-[#f0ede8]/45">+ Benchmark offer · Số neo HR · HR-ready card · Câu justify · Bản đồ mốc lương</p>
                    <span className="text-[#e8b84b] text-xs font-black">29k ↓</span>
                  </div>
                </div>

                {/* 1. PaywallBox — 2-step: value prop → QR */}
                <div id="paywall-anchor" ref={paywallRef}>
                  {!showPaywallBox ? (
                    <div className="overflow-hidden rounded-3xl border border-[#e8b84b]/40 bg-[#0f1219] shadow-2xl shadow-[#e8b84b]/10">
                      <div className="border-b border-white/10 bg-[#161b26] px-5 py-4">
                        <p className="text-[11px] font-mono font-black uppercase tracking-[0.18em] text-[#e8b84b]">
                          💎 29K mở bộ deal lương dùng được ngay
                        </p>
                      </div>
                      <div className="space-y-3 p-5">
                        <div className="flex items-start gap-3">
                          <span aria-hidden className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#e8b84b]/15 text-[13px] font-black text-[#e8b84b]">✓</span>
                          <p className="text-[13px] leading-relaxed text-[#f0ede8]/85">
                            <span className="font-black text-[#f0ede8]">Benchmark offer cùng profile</span>{' '}
                            <span className="text-[#f0ede8]/65">— xem người cùng nghề, cùng level, cùng khu vực đang được offer quanh mốc nào</span>
                          </p>
                        </div>
                        <div className="flex items-start gap-3">
                          <span aria-hidden className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#e8b84b]/15 text-[13px] font-black text-[#e8b84b]">✓</span>
                          <p className="text-[13px] leading-relaxed text-[#f0ede8]/85">
                            <span className="font-black text-[#f0ede8]">Con số deal lương nên nói</span>{' '}
                            <span className="text-[#f0ede8]/65">— biết nên neo ở mốc nào khi HR hỏi lương mong muốn</span>
                          </p>
                        </div>
                        <div className="flex items-start gap-3">
                          <span aria-hidden className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#e8b84b]/15 text-[13px] font-black text-[#e8b84b]">✓</span>
                          <p className="text-[13px] leading-relaxed text-[#f0ede8]/85">
                            <span className="font-black text-[#f0ede8]">HR-ready Salary Card</span>{' '}
                            <span className="text-[#f0ede8]/65">— một thẻ tóm tắt mức neo, khoảng cách, độ tin cậy và bằng chứng để chụp/gửi khi cần</span>
                          </p>
                        </div>
                        <div className="flex items-start gap-3">
                          <span aria-hidden className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#e8b84b]/15 text-[13px] font-black text-[#e8b84b]">✓</span>
                          <p className="text-[13px] leading-relaxed text-[#f0ede8]/85">
                            <span className="font-black text-[#f0ede8]">Câu justify + bullet CV impact</span>{' '}
                            <span className="text-[#f0ede8]/65">— biết nên nói gì, viết gì và chuẩn bị bằng chứng nào để mốc lương nghe có cơ sở</span>
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            playTap();
                            openPaywallFromCta('paywall_value_card');
                          }}
                          className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#e8b84b] px-5 py-4 text-[15px] font-black text-[#0a0c10] shadow-[0_10px_28px_rgba(232,184,75,0.35)] transition-all hover:-translate-y-0.5 hover:bg-[#f0c84b] active:scale-95"
                        >
                          <span>Mở khóa ngay · 29k</span>
                          <span aria-hidden>→</span>
                        </button>
                        <p className="text-center text-[10px] font-mono text-[#f0ede8]/40">
                          Chuyển khoản ngân hàng · không cần đăng nhập · nhận ngay sau 30 giây
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="animate-[fadeUp_0.35s_ease_both]">
                      <PaywallBox
                        fullName={displayName}
                        vspiId={vspiId}
                        selectedJob={selectedJob}
                        selectedRoleId={selectedRoleId}
                        resultPercent={resultPercent}
                        lostMoney={strategicLostMoney}
                        salary={parseMoneyInput(salary)}
                        experience={experience}
                        marketLocation={marketLocation}
                        workProvince={workProvince}
                        paidCount={stats.paidCount}
                        dailyViews={stats.dailyViews}
                        onShowToast={showToast}
                        onUnlock={(fullData: SalaryData, ai: string, benchmark?: BenchmarkMeta | null, unlockedPackage: PremiumPackage = '29k') => {
                          const cleanedDbData = sanitizeSalaryDataForJob(fullData, selectedJob) ?? safeDbData;
                          const cleanedBenchmark = sanitizeBenchmarkForJob(benchmark ?? null, selectedJob, cleanedDbData) ?? safeBenchmarkMeta;
                          const cleanedAi = isDirtyInsightForJob(ai, selectedJob)
                            ? buildSafePremiumInsight(selectedJob, parseMoneyInput(salary), resultPercent, cleanedBenchmark?.strategicTargetLabel, cleanedBenchmark?.strategicTargetSalary)
                            : repairMojibakeText(ai);
                          setDbData(cleanedDbData);
                          setAiAnalysis(cleanedAi);
                          if (cleanedBenchmark) setBenchmarkMeta(cleanedBenchmark);
                          trackEvent('premium_unlocked', {
                            product: 'premium',
                            percent: resultPercent,
                            salary_band: getSalaryBand(parseMoneyInput(salary)),
                            income_type: incomeType,
                            confidence_score: cleanedBenchmark?.confidenceScore ?? safeBenchmarkMeta?.confidenceScore,
                            match_type: cleanedBenchmark?.matchType ?? safeBenchmarkMeta?.matchType,
                          });
                          trackFunnelEvent('purchase_success', {
                            job: selectedJob || 'unknown',
                            city: selectedWorkProvince.label,
                            percentile: resultPercent,
                            package: unlockedPackage,
                            product: 'premium',
                            percent: resultPercent,
                            salary_band: getSalaryBand(parseMoneyInput(salary)),
                            income_type: incomeType,
                            confidence_score: cleanedBenchmark?.confidenceScore ?? safeBenchmarkMeta?.confidenceScore,
                            match_type: cleanedBenchmark?.matchType ?? safeBenchmarkMeta?.matchType,
                          });
                          setIsPremiumUnlocked(true);
                          // Lưu vào localStorage để xem lại sau khi thoát
                          try {
                            localStorage.removeItem(PREMIUM_PENDING_KEY);
                            localStorage.setItem(PREMIUM_SESSION_KEY, JSON.stringify({
                              isPremiumUnlocked: true,
                              vspiId,
                              fullName: cleanSharedName(certName || fullName || readSharedName()) || undefined,
                              selectedJob: repairMojibakeText(selectedJob),
                              selectedRoleId: selectedRoleId || undefined,
                              salary: parseMoneyInput(salary),
                              incomeType,
                              resultPercent,
                              lostMoney: strategicLostMoney,
                              compassTargetSalary: opportunityGap.targetSalary || undefined,
                              compassTargetLabel: opportunityGap.label,
                              dbData: cleanedDbData,
                              benchmarkMeta: cleanedBenchmark ?? safeBenchmarkMeta,
                              aiAnalysis: cleanedAi,
                              experience,
                              marketLocation,
                              workProvince,
                              package: unlockedPackage,
                              savedAt: Date.now(),
                            }));
                          } catch { /* ignore storage errors */ }
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-3 pt-2">
                  <p className="px-1 text-[10px] font-mono font-black uppercase tracking-wider text-[#e8b84b]">
                    Còn phân vân? Xem thêm các lát cắt miễn phí trước khi mở khóa
                  </p>
                  <PercentileLadderCard benchmark={safeBenchmarkMeta} percent={resultPercent} salary={currentSalaryNumber} />

                  <ExperienceSalaryBandsCard
                    benchmark={safeBenchmarkMeta}
                    currentExperience={experience}
                    salary={parseMoneyInput(salary)}
                    percent={resultPercent}
                  />

                  <GroupCompareCard
                    job={selectedJob}
                    percent={resultPercent}
                    salary={parseMoneyInput(salary)}
                    experience={experience}
                    marketLocation={marketLocation}
                    workProvince={workProvince}
                    industry={dbData?.industry ?? undefined}
                  />

                  <IndustrySwitchCard currentJob={selectedJob} currentPercent={resultPercent} salary={parseMoneyInput(salary)} />

                  <SalaryTimelineCard
                    salary={parseMoneyInput(salary)}
                    percent={resultPercent}
                    job={selectedJob}
                    benchmark={safeBenchmarkMeta}
                    experience={experience}
                  />

                  <NegotiationScoreCard job={selectedJob} percent={resultPercent} experience={experience} />

                  <JobJumpMapTeaser
                    job={selectedJob}
                    salary={parseMoneyInput(salary)}
                    percent={resultPercent}
                    unlocked={isPremiumUnlocked}
                    industry={safeDbData?.industry}
                  />
                </div>

                {/* 2. TeaserZone — sau QR, dùng để reinforce value */}
                <TeaserZone
                  fullName={displayName}
                  job={selectedJob}
                  percent={resultPercent}
                  lostMoney={strategicLostMoney}
                  salary={currentSalaryNumber}
                  dbData={safeDbData}
                  paidCount={stats.paidCount}
                  dailyViews={stats.dailyViews}
                />

                {/* 3. Secondary: Share + Social proof + Cert — cuối trang */}
                <RealDataPanel paidCount={stats.paidCount} dailyViews={stats.dailyViews} />

                <div className="space-y-3 pt-2 border-t border-white/5">
                  <ShareButton percent={resultPercent} job={selectedJob} benchmark={safeBenchmarkMeta} />

                  <div className="text-center py-1">
                    <p className="text-[11px] font-mono text-[#f0ede8]/35">
                      {stats.dailyViews > 0 ? `🔥 ${stats.dailyViews.toLocaleString('vi-VN')} lượt quét hôm nay` : 'Số lượt quét và mở khóa chỉ hiển thị theo dữ liệu thật'}
                    </p>
                  </div>

                  {/* Certificate input — cuối cùng */}
                  <div className="bg-[#0f1219] border border-white/10 rounded-2xl p-4">
                    <p className="mb-2 text-xs font-black text-[#f0ede8]/50">🏅 Tải chứng nhận sau khi mở khóa</p>
                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        type="text"
                        placeholder="Nhập tên để in trên chứng nhận..."
                        className="min-w-0 flex-1 bg-[#161b26] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-[#f0ede8] focus:border-[#e8b84b] outline-none transition-colors placeholder:text-[#f0ede8]/25"
                        value={certName}
                        onChange={e => setCertName(e.target.value)}
                        onBlur={e => {
                          const savedName = saveSharedName(e.target.value);
                          if (savedName) setFullName(savedName);
                        }}
                      />
                      <button
                        onClick={() => {
                          if (!certName.trim()) { showToast('Vui lòng nhập họ tên!', 'error'); return; }
                          const savedName = saveSharedName(certName);
                          setFullName(savedName || certName.trim());
                          showToast('Đã lưu tên! Mở khóa báo cáo lương 29K để tải bản xác thực đầy đủ.', 'info');
                        }}
                        className="w-full bg-[#161b26] border border-white/15 text-[#f0ede8]/60 font-bold px-3 py-2.5 rounded-xl text-xs hover:border-[#e8b84b]/30 transition-colors sm:w-auto"
                      >
                        Lưu tên
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="space-y-3 rounded-3xl border border-green-400/20 bg-green-400/5 p-3">
                  <p className="px-1 text-[10px] font-mono font-black uppercase tracking-wider text-green-300">
                    ✓ Báo cáo lương 29K đã mở — toàn bộ phần từng bị khóa ở trên
                  </p>
                  <HrReadySalaryCard
                    fullName={displayName}
                    job={selectedJob}
                    salary={currentSalaryNumber}
                    percent={resultPercent}
                    benchmark={safeBenchmarkMeta}
                    targetLabel={opportunityGap.label}
                    targetSalary={opportunityGap.targetSalary}
                    gapMonthly={opportunityGap.gapMonthly}
                    experience={experience}
                    workProvinceLabel={selectedWorkProvince.label}
                  />
                  <PercentileLadderCard benchmark={safeBenchmarkMeta} percent={resultPercent} salary={currentSalaryNumber} unlocked />
                  <ExperienceSalaryBandsCard
                    benchmark={safeBenchmarkMeta}
                    currentExperience={experience}
                    salary={parseMoneyInput(salary)}
                    percent={resultPercent}
                    unlocked
                  />
                  <TeaserZone
                    fullName={displayName}
                    job={selectedJob}
                    percent={resultPercent}
                    lostMoney={strategicLostMoney}
                    salary={currentSalaryNumber}
                    dbData={safeDbData}
                    paidCount={stats.paidCount}
                    dailyViews={stats.dailyViews}
                    unlocked
                  />
                  <JobJumpMapTeaser
                    job={selectedJob}
                    salary={parseMoneyInput(salary)}
                    percent={resultPercent}
                    unlocked
                    industry={safeDbData?.industry}
                  />
                </div>

                <EliteLetter fullName={displayName} job={selectedJob} percent={resultPercent} />

                <div className="fixed -left-[9999px] top-0 w-[560px] pointer-events-none opacity-100" aria-hidden="true">
                  <VSPICertificate
                    fullName={certName.trim() || displayName}
                    job={selectedJob}
                    percent={resultPercent}
                    vspiId={vspiId}
                  />
                </div>

                {/* Certificate input — sau khi đã mua */}
                <div className="bg-[#0f1219] border border-[#e8b84b]/20 rounded-3xl p-5">
                  <p className="text-[11px] font-mono font-bold text-[#e8b84b] uppercase tracking-widest mb-1">🏅 Tải chứng nhận của bạn</p>
                  <p className="text-[11px] text-[#f0ede8]/50 mb-3">Nhập tên để in trên chứng nhận VSPI cá nhân hóa</p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <input
                      type="text"
                      placeholder="Họ và tên của bạn..."
                      className="min-w-0 flex-1 bg-[#161b26] border border-white/10 rounded-xl px-4 py-3 text-sm text-[#f0ede8] focus:border-[#e8b84b] outline-none transition-colors placeholder:text-[#f0ede8]/30"
                      value={certName}
                      onChange={e => setCertName(e.target.value)}
                      onBlur={e => {
                        const savedName = saveSharedName(e.target.value);
                        if (savedName) setFullName(savedName);
                      }}
                    />
                    <button
                      onClick={() => {
                        if (!certName.trim()) { showToast('Vui lòng nhập họ tên!', 'error'); return; }
                        const savedName = saveSharedName(certName);
                        setFullName(savedName || certName.trim());
                        handleDownloadCertificate(savedName || certName.trim());
                      }}
                      disabled={certDownloading}
                      className="w-full bg-[#e8b84b] text-[#0a0c10] font-black px-4 py-3 rounded-xl text-sm leading-tight hover:bg-[#f0c84b] transition-colors disabled:opacity-60 disabled:cursor-not-allowed sm:w-auto sm:whitespace-nowrap"
                    >
                      {certDownloading ? 'Đang tạo...' : 'Tải chứng nhận'}
                    </button>
                  </div>
                </div>

                <ShareButton percent={resultPercent} job={selectedJob} benchmark={safeBenchmarkMeta} />

                {/* Lazy-loaded — chỉ tải bundle khi isPremiumUnlocked === true */}
                <Suspense fallback={
                  <div className="bg-[#0f1219] rounded-[2rem] p-12 flex flex-col items-center gap-4 border border-white/10">
                    <div className="w-10 h-10 border-4 border-[#e8b84b]/30 border-t-[#e8b84b] rounded-full animate-spin" />
                    <p className="text-[11px] font-mono text-[#f0ede8]/45">Đang tải báo cáo lương 29K...</p>
                  </div>
                }>
                  <PremiumSection
                    fullName={displayName}
                    job={selectedJob}
                    percent={resultPercent}
                    lostMoney={strategicLostMoney}
                    dbData={safeDbData}
                    vspiId={vspiId}
                    salary={parseMoneyInput(salary)}
                    aiAnalysis={safeAiAnalysis}
                    benchmark={safeBenchmarkMeta}
                  />
                </Suspense>
              </>
            )}

            <div className="mt-24 flex justify-center pb-32">
              <button onClick={() => {
                setStep(1);
                setAnimatedFill(0);
                setIsPremiumUnlocked(false);
                setAiAnalysis('');
                setCertName('');
                setExperience('mid');
                setMarketLocation('hcm');
                setWorkProvince(DEFAULT_WORK_PROVINCE);
                setBenchmarkMeta(null);
                pendingResult.current = null;
                setVspiId(genVSPIId());
                localStorage.removeItem(PREMIUM_SESSION_KEY);
                localStorage.removeItem(PREMIUM_PENDING_KEY);
                localStorage.removeItem('vspi-roadmap-v2');
                localStorage.removeItem('vspi-roadmap-draft-v1');
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
                className="inline-flex max-w-[82vw] items-center justify-center rounded-full border border-white/10 bg-[#0f1219] px-5 py-3 text-center text-[10px] font-mono text-[#f0ede8]/40 transition-colors hover:border-[#e8b84b]/30 hover:text-[#e8b84b]">
                ← QUÉT LẠI VỚI MỨC LƯƠNG KHÁC
              </button>
            </div>
          </div>
        )}

        {/* ── STICKY CTA BAR — chỉ hiện khi QR đã scroll ra khỏi viewport ── */}
        {step === 3 && !isPremiumUnlocked && qrOutOfView && (
          <div className="fixed bottom-0 left-0 right-0 z-50 max-w-[100svw] overflow-hidden pointer-events-none">
            {/* Gradient fade phía trên */}
            <div className="h-6 bg-gradient-to-t from-[#0a0c10] to-transparent" />
            <div className="bg-[#0a0c10]/95 backdrop-blur-md border-t border-[#e8b84b]/25 px-2 py-3 pointer-events-auto sm:px-3">
              <div className="mx-auto flex min-h-[86px] w-full max-w-[min(100svw,28rem)] items-start gap-2 overflow-hidden">
                {/* Text bên trái */}
                <div className="min-w-0 flex-1 pr-1">
                  {(() => {
                    const monthlyGapVnd = opportunityGap.gapMonthly || (lostMoney / 12);
                    const hourlyLoss = getStickyHourlyLoss(monthlyGapVnd, currentSalaryNumber);
                    const stickyLock = getUnlockedAndLockedPercentileTargets(resultPercent);
                    if (hourlyLoss > 0) {
                      return <HourlyLossCounter hourlyLoss={hourlyLoss} />;
                    }
                    if (stickyLock.isEliteZone) {
                      return (
                        <p className="text-[11px] font-mono text-[#f0ede8]/60 leading-tight truncate">
                          Benchmark deal lương · lộ trình giữ lợi thế
                        </p>
                      );
                    }
                    return (
                      <p className="text-[11px] font-mono text-[#f0ede8]/60 leading-tight truncate">
                        Xem nấc lương tiếp theo của bạn
                      </p>
                    );
                  })()}
                </div>
                {/* CTA button */}
                <button
                  onClick={() => {
                    playTap();
                    openPaywallFromCta('sticky_cta');
                  }}
                  className="mt-auto w-[8rem] max-w-[40vw] shrink-0 rounded-xl bg-[#e8b84b] px-2 py-3 text-[11px] font-black text-[#0a0c10] min-[380px]:w-[8.75rem] min-[380px]:text-[12px]
                             hover:bg-[#f0c84b] active:scale-95 transition-all
                             shadow-[0_0_16px_rgba(232,184,75,0.35)]"
                >
                  MỞ KHÓA · 29K
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 3 && isPremiumUnlocked && (
          <div className="fixed bottom-0 left-0 right-0 z-50 max-w-[100svw] overflow-hidden pointer-events-none">
            <div className="h-6 bg-gradient-to-t from-[#0a0c10] to-transparent" />
            <div className="bg-[#0a0c10]/95 backdrop-blur-md border-t border-[#8b5cf6]/35 px-2 py-3 pointer-events-auto sm:px-3">
              <div className="mx-auto flex w-full max-w-[min(100svw,28rem)] items-center gap-2 overflow-hidden">
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-black leading-tight text-[#f0c040]">Đã có mốc lương · tạo checklist bằng chứng</p>
                  <p className="mt-1 line-clamp-2 text-[9px] leading-tight text-[#f0ede8]/45">79k biến mốc {opportunityGap.label} thành việc cần làm từng tuần</p>
                </div>
                <Link
                  href={`/roadmap?new=1&job=${encodeURIComponent(selectedJob)}&salary=${currentSalaryNumber}&duration=6&targetSalary=${Math.round(opportunityGap.targetSalary || 0)}&targetLabel=${encodeURIComponent(opportunityGap.label)}&percent=${Math.round(resultPercent)}&experience=${encodeURIComponent(experience)}&marketLocation=${encodeURIComponent(marketLocation)}&workProvince=${encodeURIComponent(workProvince)}&incomeType=${encodeURIComponent(incomeType)}&name=${encodeURIComponent(cleanSharedName(certName || fullName || readSharedName()))}${selectedRoleId ? `&roleId=${encodeURIComponent(selectedRoleId)}` : ''}`}
                  onClick={() => {
                    try {
                      const savedPhone = localStorage.getItem(SHARED_PHONE_KEY);
                      const savedName = saveSharedName(certName || fullName || readSharedName());
                      localStorage.removeItem('vspi-roadmap-v2');
                      localStorage.setItem('vspi-roadmap-draft-v1', JSON.stringify({
                        fullName: savedName || undefined,
                        job: selectedJob,
                        selectedRoleId: selectedRoleId || undefined,
                        salary: currentSalaryNumber,
                        incomeType,
                        duration: 6,
                        percent: resultPercent,
                        experience,
                        marketLocation,
                        workProvince,
                        compassTargetSalary: opportunityGap.targetSalary || undefined,
                        compassTargetLabel: opportunityGap.label,
                        phone: savedPhone || undefined,
                        savedAt: Date.now(),
                      }));
                    } catch { /* ignore storage errors */ }
                  }}
                  className="w-[8rem] max-w-[40vw] shrink-0 rounded-xl bg-[#8b5cf6] px-2 py-3 text-center text-[10px] font-black text-white shadow-[0_0_18px_rgba(139,92,246,0.35)] transition-all active:scale-95 min-[380px]:w-[8.75rem] min-[380px]:text-[11px]"
                >
                  TẠO CHECKLIST 79K →
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── TOAST NOTIFICATION — thay thế window.alert ── */}
      {toast && (
        <div
          className={`fixed top-4 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-2xl shadow-2xl
            flex items-center gap-2.5 text-sm font-sans font-medium
            max-w-[calc(100vw-2rem)] animate-[fadeUp_0.25s_ease_both]
            ${toast.type === 'error'   ? 'bg-red-500 text-white'                                    : ''}
            ${toast.type === 'success' ? 'bg-green-500 text-white'                                  : ''}
            ${toast.type === 'info'    ? 'bg-[#161b26] border border-[#e8b84b]/40 text-[#f0ede8]'  : ''}`}
          style={{ backdropFilter: 'blur(12px)' }}
        >
          <span className="shrink-0">
            {toast.type === 'error'   && '⚠️'}
            {toast.type === 'success' && '✅'}
            {toast.type === 'info'    && '💡'}
          </span>
          <span className="leading-snug">{toast.msg}</span>
          <button
            onClick={() => setToast(null)}
            className="ml-1 opacity-60 hover:opacity-100 transition-opacity text-base leading-none shrink-0"
          >✕</button>
        </div>
      )}
    </div>
  );
}

