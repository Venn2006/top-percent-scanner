"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from 'react';
import QRCode from 'react-qr-code';
import Link from 'next/link';
import { getCareerCompassContext, type CareerCompassContext } from '@/lib/careerCompassEngine';
import { useStats } from '@/lib/useStats';
import { MARKET_LOCATIONS, type MarketLocationKey } from '@/lib/locationBenchmark';
import { buildJobJumpMap } from '@/lib/jobJumpMap';
import { DEFAULT_WORK_PROVINCE, WORK_PROVINCES, getWorkProvince, type WorkProvinceKey } from '@/lib/workProvinces';
import { playTap, playSuccess, playStageTick, vibrateStage, startResearchPulse, stopResearchPulse } from '@/lib/sound';
import { trackEvent } from '@/lib/analytics';
import { getAttributionPayload } from '@/lib/attribution';

// ── Lazy load PremiumSection — chỉ tải khi user đã thanh toán ────────────────
const PremiumSection = lazy(() => import('./PremiumSection'));

interface SalaryData { industry?: string; job_title?: string; top_50: number; top_20: number | null; top_10: number | null; top_5: number | null; }
interface BenchmarkMeta {
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
  thresholdPreview?: Array<{ label: string; salary: number | null; locked: boolean; active: boolean }>;
}
interface GapData { currentPays: string; topPays: string; roadmap: { month: string; action: string }[]; currentSkill: string; missingSkill: string; }
interface TeaserProps { fullName: string; job: string; percent: number; lostMoney: number; salary: number; dbData: SalaryData | null; paidCount: number; dailyViews: number; }
interface ComponentProps { fullName: string; job: string; percent: number; dbData: SalaryData | null; }
interface SimulatorProps { fullName: string; currentPercent: number; dbData: SalaryData | null; }
interface PaywallProps { vspiId: string; fullName: string; selectedJob: string; resultPercent: number; lostMoney: number; salary: number; experience: ExperienceLevel; marketLocation: MarketLocationKey; workProvince: WorkProvinceKey; paidCount: number; dailyViews: number; onShowToast: (msg: string, type: 'error' | 'success' | 'info') => void; onUnlock: (fullData: SalaryData, aiAnalysis: string, benchmark?: BenchmarkMeta | null) => void; }
interface CertificateProps { fullName: string; job: string; percent: number; vspiId: string; }
interface EliteProps { fullName: string; job: string; percent: number; }
interface PremiumProps extends TeaserProps { vspiId: string; salary: number; }

// Scanning step interface
interface ScanStep { label: string; detail: string; }

type ExperienceLevel = 'junior' | 'mid' | 'senior';

const EXPERIENCE_META: Record<ExperienceLevel, { label: string; short: string; multiplier: number; tone: string }> = {
  junior: { label: '0-2 năm', short: 'Junior', multiplier: 0.70, tone: 'Cần chứng minh nền tảng' },
  mid: { label: '3-5 năm', short: 'Mid-level', multiplier: 1.00, tone: 'Đã phải có KPI và ownership rõ' },
  senior: { label: 'Trên 5 năm', short: 'Senior / Lead', multiplier: 1.30, tone: 'Kỳ vọng dẫn dắt và tạo kết quả đo được' },
};

const EXPERIENCE_ORDER: ExperienceLevel[] = ['junior', 'mid', 'senior'];

interface AudiencePreset {
  id: 'office-growth' | 'fresh-graduate' | 'binh-duong-worker';
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
const cleanMoneyInput = (value: string) => value.replace(/\D/g, '').slice(0, 12);
const formatMoneyInput = (value: string) => {
  const digits = cleanMoneyInput(value);
  return digits ? Number(digits).toLocaleString('en-US') : '';
};
const parseMoneyInput = (value: string) => parseInt(cleanMoneyInput(value), 10) || 0;

const DATA_SOURCES = [
  { name: 'Adecco', label: 'Adecco Vietnam 2026', detail: '1,000+ chức danh · 12th Edition' },
  { name: 'ITviec', label: 'ITviec 2025–2026', detail: '1,839 chuyên gia IT khảo sát' },
  { name: 'Navigos', label: 'VietnamWorks / Navigos 2026', detail: '5.4M lượt/tháng · 60,000+ công ty' },
  { name: 'GSO', label: 'Tổng cục Thống kê (GSO)', detail: 'Lực lượng lao động 53.3M người' },
  { name: 'Talentnet', label: 'Talentnet–Mercer 2026', detail: 'Total Remuneration Survey Vietnam' },
  { name: 'NIC', label: 'NIC Global Salary Guide 2026', detail: '15 ngành · 8–10% tăng lương' },
];

const SKILLS = [
  { id: 'english', label: 'Tiếng Anh chuyên ngành B2+', boost: 0.12, pctBoost: 12 },
  { id: 'ai', label: 'Năng lực dùng công cụ năng suất hiện đại', boost: 0.20, pctBoost: 22 },
  { id: 'lead', label: 'Quản lý nhóm / Team Lead', boost: 0.22, pctBoost: 18 },
  { id: 'cert', label: 'Chứng chỉ chuyên ngành quốc tế', boost: 0.10, pctBoost: 8 },
];

const TIERS = [
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
    id: 'office-growth',
    title: 'Dân văn phòng',
    shortLabel: 'Văn phòng',
    subLabel: 'Deal / đổi việc',
    badge: 'Phổ biến',
    description: 'Dành cho marketing, sales, kế toán, HR, IT, admin và các vai trò văn phòng muốn benchmark lương.',
    experience: 'mid',
    marketLocation: 'hcm',
    workProvince: 'hcm',
    prompt: 'Đã set Mid-level tại TP.HCM. Chọn nghề văn phòng của bạn rồi nhập lương.',
  },
  {
    id: 'fresh-graduate',
    title: 'Sinh viên mới tốt nghiệp',
    shortLabel: 'Mới tốt nghiệp',
    subLabel: 'Offer đầu đời',
    badge: 'Offer đầu đời',
    description: 'Nhập offer 8-15 triệu, chọn đúng ngành, biết mình đang bị thấp hay ổn so với thị trường.',
    salary: '10000000',
    experience: 'junior',
    marketLocation: 'hcm',
    workProvince: 'hcm',
    prompt: 'Đã set mức mẫu 10 triệu. Chọn ngành bạn đang apply rồi quét Top %.',
  },
  {
    id: 'binh-duong-worker',
    title: 'Công nhân Bình Dương',
    shortLabel: 'Công nhân',
    subLabel: 'Bình Dương / FDI',
    badge: 'Công nhân / FDI',
    description: 'Map nhanh nhóm vận hành sản xuất, khu công nghiệp, biết mốc nào nên xin tăng lương.',
    salary: '9000000',
    experience: 'mid',
    marketLocation: 'industrial',
    workProvince: 'binh_duong',
    jobTitle: 'Công nhân vận hành máy',
    prompt: 'Đã set Công nhân vận hành máy tại cụm Bình Dương/Đồng Nai/Bắc Ninh.',
  },
];

const getRingColor = (p: number) => p <= 5 ? '#FFD700' : p <= 10 ? '#00E676' : p <= 20 ? '#40C4FF' : p <= 50 ? '#FF9100' : '#FF5252';
const fmtM = (n: number | null | undefined) => n ? `${(n / 1_000_000).toFixed(1)}M` : '?M';
const getTopPercentNumber = (label: string) => Number(label.match(/\d+/)?.[0] ?? 0);
const formatTopPercentLabel = (label: string) => {
  const n = getTopPercentNumber(label);
  return n ? `Top ${n}%` : label;
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
  if (percent >= 60) return ['Top 50%', 'Top 40%', 'Top 30%', 'Top 20%', 'Top 10%', 'Top 5%', 'Top 1%'];
  if (percent >= 50) return ['Top 40%', 'Top 30%', 'Top 20%', 'Top 10%', 'Top 5%', 'Top 1%'];
  if (percent >= 40) return ['Top 30%', 'Top 20%', 'Top 10%', 'Top 5%', 'Top 1%'];
  if (percent >= 30) return ['Top 20%', 'Top 10%', 'Top 5%', 'Top 1%'];
  if (percent >= 20) return ['Top 10%', 'Top 5%', 'Top 1%'];
  if (percent >= 10) return ['Top 5%', 'Top 1%'];
  return ['Top 1%'];
};
const inferStrategicTargetLabel = (percent: number) =>
  percent >= 60 ? 'Top 50%' :
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
  let s = 'VSPI-2026-';
  for (let i = 0; i < 4; i++) s += c[Math.floor(Math.random() * c.length)];
  s += '-';
  for (let i = 0; i < 4; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
};

const normalizeRoleText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

function getPremiumRolePreview(job: string) {
  const normalized = normalizeRoleText(job);
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
  resultPercent,
  gapMonthly,
  targetLabel,
  benchmark,
  experience,
  workProvinceLabel,
}: {
  job: string;
  resultPercent: number;
  gapMonthly: number;
  targetLabel: string;
  benchmark: BenchmarkMeta | null;
  experience: ExperienceLevel;
  workProvinceLabel: string;
}) {
  void gapMonthly;
  void targetLabel;
  const preview = getPremiumRolePreview(job);
  const jobLabel = job.trim() || preview.roleLabel;
  const lockInfo = getUnlockedAndLockedPercentileTargets(resultPercent);
  const nextRungLabel = lockInfo.nextVisibleTarget ? `Top ${lockInfo.nextVisibleTarget}%` : null;
  const nextRungSalary = nextRungLabel ? getThreshold(benchmark, nextRungLabel) : null;
  const top50Salary = getThreshold(benchmark, 'Top 50%');
  const yearsLabel = EXPERIENCE_META[experience].label.replace(/\s*năm\s*$/i, '');
  const currentBandM = top50Salary ? fmtM(top50Salary).replace(/M$/i, '') : '24.5';
  const targetBandM = nextRungSalary ? fmtM(nextRungSalary).replace(/M$/i, '') : '32.0';
  const benefitText = 'bonus quý theo KPI hoặc ESOP';
  const handleUnlockScroll = () => {
    if (typeof window === 'undefined') return;
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  };

  return (
    <div className="overflow-hidden rounded-3xl border border-[#e8b84b]/35 bg-[#0f1219] shadow-2xl shadow-[#e8b84b]/5">
      <div className="border-b border-white/10 bg-[#161b26] px-5 py-4">
        <p className="text-[11px] font-mono font-black uppercase tracking-[0.18em] text-[#e8b84b]">
          📌 Câu trả lời khi HR hỏi lương mong muốn
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
            <span className="font-black text-[#e8b84b]">{currentBandM}M</span>. Với kinh nghiệm về{' '}
            <span className="font-semibold">{preview.coreSkill}</span> của tôi, mức tôi expect là{' '}
            <span className="font-black text-green-400">{targetBandM}M</span> — có thể thương lượng nếu package bao gồm{' '}
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
            <li><strong className="text-[#f0ede8]">GSO 2024:</strong> Dữ liệu lực lượng lao động 53.3 triệu người từ Tổng cục Thống kê Việt Nam.</li>
            <li><strong className="text-[#f0ede8]">Adecco Vietnam 2026:</strong> Khảo sát 1,000+ chức danh, 12th Edition.</li>
            <li><strong className="text-[#f0ede8]">ITviec:</strong> Báo cáo lương IT theo vai trò, tỉnh thành và kinh nghiệm.</li>
            <li><strong className="text-[#f0ede8]">VietnamWorks/Navigos, CareerViet, TopCV:</strong> Dữ liệu từ hệ sinh thái tuyển dụng và salary lookup.</li>
            <li><strong className="text-[#f0ede8]">ManpowerGroup, Reeracoen, PERSOLKELLY:</strong> Salary guide theo ngành và cấp bậc.</li>
            <li><strong className="text-[#f0ede8]">Talentnet–Mercer:</strong> Tham chiếu total remuneration ở nhóm doanh nghiệp lớn.</li>
          </ul>
          <p className="border-t border-white/10 pt-3"><strong className="text-[#f0ede8]">Phương pháp tính percentile:</strong> Dữ liệu lương được chuẩn hóa theo mô hình Normal Distribution, tổng hợp từ 6 nguồn báo cáo chính thống. Vị trí phân vị được tính theo lương gross tháng, cập nhật theo chu kỳ quý.</p>
        </div>
        <button onClick={onClose} className="mt-4 w-full bg-[#161b26] border border-white/10 text-[#f0ede8]/70 text-[11px] font-mono py-2.5 rounded-xl hover:border-[#e8b84b]/30 transition-colors">Đóng</button>
      </div>
    </div>
  );
}

/* ═══ SHARE CARD ════════════════════════════════════════════════════════════ */
function PercentileLadderCard({ benchmark, percent, salary }: { benchmark: BenchmarkMeta | null; percent: number; salary: number }) {
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
      locked: isStrategicTarget ? false : lockInfo.locked.includes(topNumber),
      active: topNumber === lockInfo.userRung,
      strategic: isStrategicTarget,
    };
  });
  const nextTarget = !lockInfo.isEliteZone && benchmark?.nextTargetSalary ? fmtM(benchmark.nextTargetSalary) : null;

  return (
    <div className="bg-[#0f1219] border border-white/10 rounded-3xl p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-[10px] font-mono font-black text-[#e8b84b] uppercase tracking-widest">Thang Top % thu nhập</p>
          <p className="text-[11px] text-[#f0ede8]/45 mt-1">Top 50% là nửa trên thị trường, Top 10% là nhóm 10% thu nhập cao nhất.</p>
        </div>
        {nextTarget && (
          <div className="text-right shrink-0">
            <p className="text-[9px] text-[#f0ede8]/35 uppercase font-mono">Mốc kế tiếp</p>
            <p className="text-sm font-black text-green-400">{nextTarget}/tháng</p>
          </div>
        )}
      </div>
      <div className="space-y-2">
        {rows.map((row) => {
          const topNumber = getTopPercentNumber(row.label);
          const label = formatTopPercentLabel(row.label);
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
              {row.salary ? fmtM(row.salary) : '...'}
            </p>
          </div>
        );
        })}
      </div>
      <p className="text-[10px] text-[#f0ede8]/35 leading-relaxed mt-3">
        Dấu % rất quan trọng: Top 80% không phải 80 người giàu nhất, mà là một nhóm phần trăm trên thang thu nhập. Premium mở khóa các mốc cao hơn vị trí hiện tại của bạn và nguồn benchmark chi tiết.
      </p>
    </div>
  );
}

function ExperienceSalaryBandsCard({
  benchmark,
  currentExperience,
  salary,
  percent,
}: {
  benchmark: BenchmarkMeta | null;
  currentExperience: ExperienceLevel;
  salary: number;
  percent: number;
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
        {EXPERIENCE_ORDER.filter(exp => exp === currentExperience).map(exp => {
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
                  const isTierLocked = !isStrategicTarget && lockInfo.locked.includes(topNumber);
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

      <p className="mt-3 rounded-xl border border-white/8 bg-[#0a0c10]/55 px-3 py-2 text-[10.5px] leading-4 text-[#f0ede8]/55">
        🔒 Các band lương cho cấp khác ({EXPERIENCE_ORDER.filter(e => e !== currentExperience).map(e => EXPERIENCE_META[e].label).join(' / ')}) chỉ hiện khi mở khóa Premium 29k.
      </p>

      <p className="mt-3 rounded-xl border border-cyan-400/15 bg-cyan-400/8 px-3 py-2 text-[11px] leading-4 text-cyan-100">
        Với mức hiện tại {fmtM(salary)}, headline đúng phải là khoảng cách tới <strong>{opportunity.label}</strong>
        {opportunity.targetSalary ? <> khoảng <strong>{fmtM(opportunity.targetSalary)}/tháng</strong></> : null}
        {opportunity.gapMonthly > 0 ? <>: còn thiếu <strong>{fmtM(opportunity.gapMonthly)}/tháng</strong>.</> : '.'}
      </p>
    </div>
  );
}

function ConfidenceExplainer({ benchmark }: { benchmark: BenchmarkMeta | null }) {
  if (!benchmark) return null;

  const tone =
    benchmark.confidenceScore >= 85 ? 'border-green-400/30 bg-green-400/8 text-green-300' :
    benchmark.confidenceScore >= 70 ? 'border-[#e8b84b]/30 bg-[#e8b84b]/8 text-[#e8b84b]' :
    benchmark.confidenceScore >= 55 ? 'border-orange-400/30 bg-orange-400/8 text-orange-300' :
    'border-red-400/30 bg-red-400/8 text-red-300';

  const matchLabel =
    benchmark.matchType === 'exact' ? 'Khớp trực tiếp chức danh' :
    benchmark.matchType === 'alias' ? 'Khớp qua alias nghề nghiệp' :
    benchmark.matchType === 'similar_role' ? 'Benchmark từ vai trò tương đương' :
    benchmark.matchType === 'industry_estimate' ? 'Ước tính theo nhóm ngành' :
    benchmark.matchType === 'legacy_salary_data' ? 'Benchmark từ dữ liệu VSPI cũ' :
    'Ước tính thị trường chung';

  return (
    <div className={`rounded-3xl border p-5 ${tone}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-mono font-black uppercase tracking-widest opacity-80">Độ tin cậy dữ liệu</p>
          <h3 className="mt-1 text-2xl font-black text-[#f0ede8]">{benchmark.confidenceScore}/100</h3>
          <p className="mt-1 text-xs font-bold">{benchmark.confidenceLabel} · {matchLabel}</p>
        </div>
        <Link
          href="/methodology"
          target="_blank"
          className="shrink-0 rounded-xl border border-white/10 bg-[#0a0c10]/45 px-3 py-2 text-[10px] font-black text-[#f0ede8]/70 hover:border-[#e8b84b]/40 hover:text-[#e8b84b]"
        >
          Cách tính
        </Link>
      </div>
      <p className="mt-3 text-xs leading-5 text-[#f0ede8]/68">{benchmark.confidenceDescription}</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {(benchmark.sources?.length ? benchmark.sources : ['VSPI benchmark']).slice(0, 4).map(source => (
          <span key={source} className="rounded-full border border-white/10 bg-[#0a0c10]/45 px-2.5 py-1 text-[9px] font-bold text-[#f0ede8]/58">
            {source}
          </span>
        ))}
      </div>
      {benchmark.confidenceScore < 70 && (
        <p className="mt-3 rounded-xl border border-white/10 bg-[#0a0c10]/35 px-3 py-2 text-[10px] leading-4 text-[#f0ede8]/58">
          Ngành/khu vực này hiện còn ít dữ liệu trực tiếp. Hãy dùng kết quả như điểm tham chiếu khi deal lương, không phải cam kết tuyệt đối.
        </p>
      )}
    </div>
  );
}

function RealDataPanel({ paidCount, dailyViews }: { paidCount: number; dailyViews: number }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-[#0f1219] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black text-[#e8b84b]">Số liệu từ hệ thống</p>
          <h3 className="mt-1 text-base font-black text-[#f0ede8]">Dữ liệu thật, cập nhật theo lượt dùng.</h3>
        </div>
        <span className="rounded-full border border-[#e8b84b]/30 bg-[#e8b84b]/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-[#e8b84b]">
          Thật
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

function JobJumpMapTeaser({ job, salary, percent, unlocked }: { job: string; salary: number; percent: number; unlocked: boolean }) {
  if (!job || salary <= 0) return null;
  const map = buildJobJumpMap(job, salary, percent);
  const firstRole = map.targetRoles[0];
  const extraRoles = map.targetRoles.slice(1);

  return (
    <div className="bg-[#0f1219] border border-[#e8b84b]/25 rounded-3xl p-5 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-[#e8b84b]/8 rounded-full blur-3xl pointer-events-none" />
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-[10px] font-mono font-black text-[#e8b84b] uppercase tracking-widest">Hướng nhảy việc tăng lương</p>
            <h3 className="text-base font-black text-[#f0ede8] mt-1 leading-tight">Không cần tự tìm kiếm, thu thập dữ liệu phức tạp. Hệ thống đã phân tích sẵn và chỉ cho bạn nên chuyển sang job nào để lương tăng.</h3>
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
            ? 'Bạn đã mở đủ các hướng nhảy việc/xin tăng lương. Bước đồng hành 79K biến các hướng này thành việc thực thi từng tuần.'
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
        const shareUrl = `https://topluong.com?utm_source=share&utm_medium=result_card&pct=${percent}&job=${encodeURIComponent(job)}&confidence=${benchmark?.confidenceScore ?? ''}`;
        const shareText = `Toi dang o Top ${percent}% thu nhap tai Viet Nam. Anh chia se nay khong hien thi luong ca nhan.`;

        if (navigator.share && navigator.canShare({ files: [new File([blob], 'vspi-result.png', { type: 'image/png' })] })) {
          await navigator.share({ title: 'Kết quả VSPI Scanner', text: shareText, url: shareUrl, files: [new File([blob], 'vspi-result.png', { type: 'image/png' })] });
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
  onShowToast,
}: {
  percent: number;
  job: string;
  onShowToast: (msg: string, type: 'error' | 'success' | 'info') => void;
}) {
  const handleShare = useCallback(async (platform: ResultSharePlatform) => {
    const shareText = buildResultShareText(percent, job);
    const shareUrl = `${RESULT_SHARE_BASE_URL}?utm_source=${platform}&utm_medium=result_share&pct=${percent}&job=${encodeURIComponent(job)}`;
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

      const platformUrls: Record<Exclude<ResultSharePlatform, 'instagram'>, string> = {
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}&quote=${encodedText}`,
        zalo: `https://zalo.me/share?u=${encodedUrl}&t=${encodedText}`,
        messenger: `fb-messenger://share/?link=${encodedUrl}`,
        x: `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}`,
        threads: `https://www.threads.com/intent/post?text=${encodeURIComponent(`${shareText}\n${shareUrl}`)}`,
      };

      window.open(platformUrls[platform], '_blank', 'noopener,noreferrer,width=640,height=640');
    } catch {
      try {
        if (navigator.share) {
          await navigator.share({ title: 'Kết quả VSPI Scanner', text: shareText, url: shareUrl });
        } else {
          await copyShareText(`${shareText}\n${shareUrl}`);
          onShowToast('Đã copy nội dung share.', 'success');
        }
      } catch {
        onShowToast('Chưa share được. Thử lại sau nhé.', 'error');
      }
    }
  }, [job, onShowToast, percent]);

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
  currentSalary,
  medianSalary,
  targetSalary,
  benchmark,
  resultPercent,
  isUnlocked29k,
  onUnlockClick,
}: {
  job: string;
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
  const nodeTargets = (pricedTargets.length ? pricedTargets : safeCandidateLabels.map(label => ({
    label,
    salary: getThreshold(benchmark, label) || 0,
  })))
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
  const proofFocus =
    /trung tam ngoai ngu|ngoại ngữ|ngoai ngu|education|giáo dục|giao duc/i.test(job)
      ? 'enrollment, retention, trial-to-paid, class fill rate và teacher utilization'
      : 'KPI đầu ra, case study trước/sau, scope ownership và bằng chứng tiết kiệm/tăng trưởng';
  const isLanguageCenterRole = /trung tam ngoai ngu|ngoại ngữ|ngoai ngu|english center|language center/i.test(job);
  const growthProof = isLanguageCenterRole
    ? '1 dashboard học viên active, trial-to-paid, retention, class fill rate và complaint SLA'
    : '1 case study trước/sau có KPI, người xác nhận và tác động kinh doanh';
  const scaleProof = isLanguageCenterRole
    ? 'biến quản lý vận hành thành tăng trưởng tuyển sinh, giữ chân học viên và tối ưu lịch giáo viên'
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
      body: 'Muốn tới đây cần lịch hành động theo tuần, tiêu chuẩn nghiệm thu và bằng chứng lưu lại từng bước. Phần đồng hành chuyên gia sẽ hiện sau khi mở 29K.',
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
              👁️ Mở khóa Tầm Nhìn Hoàng Kim · 29k
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
              title="Đồng hành sát sao cùng chuyên gia"
              desc={`Chuyên gia biến La Bàn thành việc thực thi theo ${job}, điểm yếu hiện tại và mục tiêu ${nextTargetLabel}`}
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
          KÍCH HOẠT LA BÀN + BÁO CÁO PREMIUM · 29K →
        </button>
      ) : (
        <Link
          href={`/roadmap?new=1&job=${encodeURIComponent(job)}&salary=${currentSalary}&duration=6`}
          className="mt-4 flex w-full items-center justify-center rounded-xl border border-[#8b5cf6] bg-transparent px-4 py-3 text-sm font-bold text-[#8b5cf6] transition-all hover:bg-[#8b5cf6]/10 active:scale-[0.99]"
        >
          Đồng hành cùng chuyên gia · 79K →
        </Link>
      )}
    </section>
  );
}

/* ═══ GROUP COMPARE — So sánh ẩn danh với nhóm bạn ═════════════════════════ */
function GroupCompareCard({ job, percent, industry }: { job: string; percent: number; industry?: string }) {
  const [groupState, setGroupState] = useState<'idle' | 'creating' | 'created' | 'joining' | 'joined'>('idle');
  const [groupData, setGroupData] = useState<{ groupId: string; members: { rank: number; job_title: string; percent: number }[]; yourRank: number; totalMembers: number } | null>(null);
  const [shareUrl, setShareUrl] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');

  // Check URL param ?group=XXXXXX on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const g = params.get('group');
    if (g && g.length === 6) {
      setJoinCode(g.toUpperCase());
      handleJoin(g.toUpperCase());
    }
  }, []);

  const handleCreate = async () => {
    setGroupState('creating');
    setError('');
    try {
      const res = await fetch('/api/group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create', job_title: job, percent, industry }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Lỗi tạo nhóm'); setGroupState('idle'); return; }
      setGroupData({ groupId: data.groupId, members: data.members.map((m: any, i: number) => ({ ...m, rank: i + 1 })), yourRank: data.yourRank, totalMembers: data.totalMembers });
      setShareUrl(data.shareUrl);
      setGroupState('created');
    } catch { setError('Lỗi kết nối'); setGroupState('idle'); }
  };

  const handleJoin = async (code?: string) => {
    const id = code || joinCode;
    if (!id || id.length !== 6) { setError('Mã nhóm 6 ký tự'); return; }
    setGroupState('joining');
    setError('');
    try {
      const res = await fetch('/api/group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'join', groupId: id, job_title: job, percent, industry }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Nhóm không tồn tại'); setGroupState('idle'); return; }
      setGroupData({ groupId: data.groupId, members: data.members.map((m: any, i: number) => ({ ...m, rank: i + 1 })), yourRank: data.yourRank, totalMembers: data.totalMembers });
      setGroupState('joined');
    } catch { setError('Lỗi kết nối'); setGroupState('idle'); }
  };

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

/* ═══ SALARY TIMELINE — Đường cong 3 năm ═══════════════════════════════════ */
function SalaryTimelineCard({ salary, percent, job, benchmark, experience }: { salary: number; percent: number; job: string; benchmark: BenchmarkMeta | null; experience: ExperienceLevel }) {
  const stagnantRate = 0.07;
  const years = [0, 1, 2, 3];
  const stagnantPath = years.map(y => roundToHalfMillion(salary * Math.pow(1 + stagnantRate, y)));
  const threshold = (label: string) => benchmark?.thresholdPreview?.find(row => row.label === label)?.salary ?? null;
  const top70 = threshold('Top 70%');
  const top60 = threshold('Top 60%');
  const top50 = threshold('Top 50%');
  const top40 = threshold('Top 40%');
  const top30 = threshold('Top 30%');
  const top20 = threshold('Top 20%');
  const top10 = threshold('Top 10%');
  const top5 = threshold('Top 5%');

  const targets = buildActionTargets({
    salary,
    percent,
    passiveYear3: stagnantPath[3],
    top70,
    top60,
    top50,
    top40,
    top30,
    top20,
    top10,
    top5,
  });
  const optimalPath = [salary, targets[0].salary, targets[1].salary, targets[2].salary];
  const maxSal = Math.max(...optimalPath, ...stagnantPath);
  const rawGap = optimalPath[3] - stagnantPath[3];
  const gapAfter3Years = rawGap >= 1_000_000 ? rawGap : 1_000_000;
  const isLowBand = percent >= 80;
  const experienceLabel = EXPERIENCE_META[experience].label;
  const opportunity = getStrategicOpportunity(benchmark, salary, percent);

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
        {years.map((y, i) => {
          const optW = (optimalPath[i] / maxSal) * 100;
          const stagW = (stagnantPath[i] / maxSal) * 100;
          const target = targets[i - 1];
          return (
            <div key={i} className="space-y-1">
              <div className="flex justify-between text-[10px]">
                <span className="text-[#f0ede8]/45 font-mono">{y === 0 ? 'Hiện tại' : `+${y} năm`}</span>
                <span className="text-[#f0ede8]/60 font-mono">{(optimalPath[i] / 1_000_000).toFixed(1)}M</span>
              </div>
              {/* Optimal path */}
              <div className="h-2.5 bg-[#161b26] rounded-full overflow-hidden relative">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-cyan-500 to-[#e8b84b] transition-all duration-700"
                  style={{ width: `${optW}%` }}
                />
                {/* Stagnant overlay */}
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-white/10"
                  style={{ width: `${stagW}%` }}
                />
              </div>
              {i > 0 && (
                <div className="flex justify-between text-[9px]">
                  <span className="text-[#f0ede8]/25">{target?.label || `Tăng đều: ${(stagnantPath[i] / 1_000_000).toFixed(1)}M`}</span>
                  <span className="text-green-400/70">
                    +{Math.max(0, (optimalPath[i] - stagnantPath[i]) / 1_000_000).toFixed(1)}M nếu hành động
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
          Nếu biến La Bàn thành <strong className="text-[#e8b84b]">lộ trình có checkpoint</strong>, sau 3 năm có thể tạo thêm khoảng
        </p>
        <p className="text-xl font-black text-cyan-400">
          {(gapAfter3Years / 1_000_000).toFixed(1)} triệu/tháng
        </p>
        <p className="text-[9px] text-[#f0ede8]/30 mt-0.5">
          so với chỉ tăng đều (~{Math.max(1, Math.round(gapAfter3Years * 12 / 1_000_000))} triệu/năm chênh lệch)
        </p>
        <p className="text-[9px] text-[#f0ede8]/35 mt-2 leading-4">
          Đây không phải lời hứa tăng lương một phát. Cách đúng là chia mục tiêu này thành sprint 3/6/12 tháng, mỗi sprint phải có bằng chứng, KPI và kết quả để deal từng phần.
        </p>
      </div>
    </div>
  );
}

function buildActionTargets({
  salary,
  percent,
  passiveYear3,
  top70,
  top60,
  top50,
  top40,
  top30,
  top20,
  top10,
  top5,
}: {
  salary: number;
  percent: number;
  passiveYear3: number;
  top70: number | null;
  top60: number | null;
  top50: number | null;
  top40: number | null;
  top30: number | null;
  top20: number | null;
  top10: number | null;
  top5: number | null;
}) {
  const safeSalary = Math.max(500_000, salary);

  // Strict floors — multiplier OR absolute increase, whichever is larger.
  // Year 1: +25% or +3M. Year 2: +45% or +2M over y1. Year 3: +70% or +2M over y2.
  const floorY1 = Math.max(safeSalary * 1.25, safeSalary + 3_000_000);
  const floorY2 = Math.max(safeSalary * 1.45, floorY1 + 2_000_000);
  const floorY3 = Math.max(safeSalary * 1.70, floorY2 + 2_000_000);

  // Aspirational anchors aim two tiers higher than user's current percentile.
  // Only PULL targets UP — never reduce below the floor.
  type Bucket = { anchors: [number | null, number | null, number | null]; labels: [string, string, string] };
  let bucket: Bucket;
  if (percent >= 100) {
    bucket = {
      anchors: [top70, top60, top50],
      labels: ['Mốc 1: vượt Top 70%', 'Mốc 2: tiến về Top 60%', 'Mốc 3: chạm median ngành'],
    };
  } else if (percent >= 80) {
    bucket = {
      anchors: [top60, top50, top40],
      labels: ['Mốc 1: vượt Top 60%', 'Mốc 2: chạm median ngành', 'Mốc 3: tiến lên Top 40%'],
    };
  } else if (percent >= 60) {
    bucket = {
      anchors: [top50, top40, top30],
      labels: ['Mốc 1: chạm median ngành', 'Mốc 2: tiến lên Top 40%', 'Mốc 3: tiến lên Top 30%'],
    };
  } else if (percent >= 50) {
    bucket = {
      anchors: [top40, top30, top20],
      labels: ['Mốc 1: tiến lên Top 40%', 'Mốc 2: tiến lên Top 30%', 'Mốc 3: tiến lên Top 20%'],
    };
  } else if (percent >= 20) {
    // Top 20-50 (includes Top 30 users) — aim Top 20 / Top 10 benchmarks.
    bucket = {
      anchors: [top30, top20, top10],
      labels: ['Mốc 1: tiến lên Top 30%', 'Mốc 2: tiến lên Top 20%', 'Mốc 3: chạm Top 10%'],
    };
  } else if (percent >= 10) {
    bucket = {
      anchors: [top20, top10, top5],
      labels: ['Mốc 1: tiến lên Top 20%', 'Mốc 2: chạm Top 10%', 'Mốc 3: vượt Top 5%'],
    };
  } else {
    bucket = {
      anchors: [top10, top5, null],
      labels: ['Mốc 1: chạm Top 10%', 'Mốc 2: vượt Top 5%', 'Mốc 3: bứt phá vai trò/level mới'],
    };
  }

  const promote = (floorValue: number, anchorValue: number | null) =>
    anchorValue && anchorValue > floorValue ? anchorValue : floorValue;

  let y1 = promote(floorY1, bucket.anchors[0]);
  let y2 = Math.max(promote(floorY2, bucket.anchors[1]), y1 + 2_000_000);
  let y3 = Math.max(promote(floorY3, bucket.anchors[2]), y2 + 2_000_000);

  y1 = roundToHalfMillion(y1);
  y2 = roundToHalfMillion(Math.max(y2, y1 + 500_000));
  y3 = roundToHalfMillion(Math.max(y3, y2 + 500_000));

  // Final guard — diff vs passive year 3 must be ≥ 1M. If not, rebuild from
  // pure floors (which are guaranteed above passive at 7%/yr for safeSalary).
  if (y3 - passiveYear3 < 1_000_000) {
    y1 = roundToHalfMillion(floorY1);
    y2 = roundToHalfMillion(Math.max(floorY2, y1 + 2_000_000));
    y3 = roundToHalfMillion(Math.max(floorY3, y2 + 2_000_000));
    // Last-resort: if floors *still* can't beat passive (extreme high salary
    // where passive compounds dominate), force at least passive + 1.5M.
    if (y3 - passiveYear3 < 1_000_000) {
      y3 = roundToHalfMillion(passiveYear3 + 1_500_000);
      y2 = roundToHalfMillion(Math.max(y2, y3 - 2_000_000));
      y1 = roundToHalfMillion(Math.max(y1, y2 - 2_000_000));
    }
  }

  return [
    { salary: y1, label: bucket.labels[0] },
    { salary: y2, label: bucket.labels[1] },
    { salary: y3, label: bucket.labels[2] },
  ];
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
            : '💡 Mở khóa báo cáo Premium để xem lộ trình nâng score lên 8+'}
        </p>
      </div>
    </div>
  );
}

/* ═══ TEASER ZONE ═══════════════════════════════════════════════════════════ */
function TeaserZone({ fullName, job, percent, lostMoney, salary, dbData, paidCount, dailyViews }: TeaserProps) {
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
  const insightLines = percent === 5 ? ['Bạn đang Elite — nhưng Top 1% đang kéo xa bạn thêm mỗi quý.', 'Có 1 kỹ năng mà 94% Top 1% có, còn Top 5% chưa nắm.'] : percent === 10 ? [`Khoảng cách từ Top 10% lên Top 5% ngành ${job} chỉ là ${fmtM((top5 ?? 0) - (top10 ?? 0))}/tháng.`, '80% người vượt mốc này làm được trong 6 tháng với đúng chiến lược.'] : percent === 20 ? [`Top 10% ngành ${job} đang nhận thêm ${fmtM((top10 ?? 0) - (top20 ?? 0))}/tháng so với bạn.`, 'Khoảng cách này không đến từ kinh nghiệm — nó đến từ 1 kỹ năng cụ thể.'] : percent === 50 || isNearMedian ? [`Bạn đang tiệm cận median ngành ${job}; Top 50% không còn là mốc đủ kích thích.`, 'Mốc đáng xem tiếp theo là Top 40% / Top 30% — nơi mức deal bắt đầu khác hẳn.'] : [`Median ngành ${job} cao hơn lương bạn ${fmtM(medianGap || lostMoney / 12)}/tháng.`, '72% người dưới median không biết mình bị undervalue cho đến khi thấy dữ liệu thị trường.'];
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
                    <p className="text-sm font-serif font-black text-[#f0ede8] w-14 text-right">{fmtM(r.val)}</p>
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
              Vị trí của bạn: <strong className="text-[#f0ede8] font-mono">Top {percent}%</strong>
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
            <span className="text-base leading-none mt-0.5">🔒</span>
            <h3 className="text-sm font-serif font-black text-[#f0ede8] leading-snug">
              Con số bạn chưa biết — nhưng nhà tuyển dụng đã biết từ lâu
            </h3>
          </div>
          <p className="text-[11px] font-sans text-[#f0ede8]/55 leading-snug pl-6 mb-4">
            Benchmark ẩn danh: <strong className="text-[#e8b84b]">Người cùng ngành · cùng tỉnh · cùng số năm kinh nghiệm</strong> với bạn
          </p>

          {/* 3 locked rows */}
          <div className="space-y-2.5">
            {[
              { label: 'Đang được offer trung bình', placeholder: '••,• triệu/tháng' },
              { label: 'Con số nên nói khi được hỏi lương mong muốn', placeholder: '•• triệu' },
              { label: 'Câu dùng để justify mức lương đó', placeholder: '"••••••••••••••••••"' },
            ].map((row, i) => (
              <div key={i} className="bg-[#161b26] border border-white/8 rounded-xl px-3 py-2.5 flex items-center justify-between gap-3">
                <p className="text-[11px] font-sans text-[#f0ede8]/70 leading-snug flex-1 min-w-0">
                  {row.label}
                </p>
                <span className="text-[12px] font-mono font-black text-[#f0ede8]/40 select-none shrink-0 max-w-[55%] truncate" style={{ filter: 'blur(3px)' }}>
                  {row.placeholder}
                </span>
              </div>
            ))}
          </div>

          {/* CTA inline trong block */}
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
          <p className="mt-2 text-center text-[10px] font-mono text-[#f0ede8]/40">
            Benchmark được tổng hợp ẩn danh từ các profile tương tự bạn
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
          {[
            'Cách gói KPI thành câu nói trong vòng phỏng vấn cuối',
            'Mức lương mong muốn nói ra trước khi HR đưa số đầu tiên',
            'Một dòng trong CV làm họ phải gọi lại — thay vì lọc bạn ra',
          ].map((item, i) => (
            <div key={i} className="bg-[#161b26] border border-white/8 rounded-xl px-3 py-2.5 flex items-center gap-2.5 opacity-90">
              <span className="text-[10px] font-mono font-black text-[#e8b84b] shrink-0 w-4">0{i + 1}</span>
              <p className="text-[12px] font-sans text-[#f0ede8]/70 leading-snug flex-1 min-w-0 truncate" style={{ filter: 'blur(2.5px)' }}>
                {item}
              </p>
              <span className="text-[11px] shrink-0">🔒</span>
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
          { arrow: '↑', color: 'text-green-400', t: `Nhu cầu tuyển ngành ${job} đang tăng`, d: '45% doanh nghiệp mở rộng tuyển dụng 5–10% (Navigos 2026)' },
          { arrow: '↑', color: 'text-[#e8b84b]', t: 'Mặt bằng lương tăng 8–10% so với 2025', d: 'Đặc biệt mạnh ở mid–senior (NIC Global Salary Guide 2026)' },
          { arrow: '⚡', color: 'text-orange-400', t: '80% nhà tuyển dụng đang tranh nhau ứng viên giỏi', d: 'Đây là thời điểm tốt nhất trong 3 năm để đàm phán lương' },
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
            <div className="flex gap-2.5 items-start opacity-25 select-none pointer-events-none">
              <span className="text-[#e8b84b] text-xs mt-0.5 shrink-0">▸</span>
              <p className="text-sm font-sans text-[#f0ede8]/70 leading-relaxed">
                Mở khóa để xem yếu tố cụ thể giúp kéo lương lên nhóm cao hơn trong ngành của bạn.
              </p>
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="bg-[#0f1219]/80 backdrop-blur-sm text-[#e8b84b] text-[10px] font-mono font-bold px-3 py-1.5 rounded-full border border-[#e8b84b]/30">🔒 Mở khóa để đọc</span>
            </div>
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
          <p className="text-[11px] font-sans text-[#f0ede8]/70 leading-relaxed italic">
            <strong>💬</strong> "Email mẫu trong báo cáo giúp mình xin tăng được <strong className="text-[#e8b84b]">3.5M/tháng</strong> sau 1 tuần gửi sếp. Có số liệu thị trường là khác hẳn." — Người dùng tại Hà Nội, Kế toán.
          </p>
        </div>
      </div>
      {/* Banner cảnh báo hết hạn — chỉ giữ 1 dòng nhỏ */}
      <p className="text-center text-[11px] font-mono text-orange-400/80">
        {paidCount > 0
          ? <>⏰ Giá ưu đãi chỉ còn đến 30/06/2026 · {paidCount.toLocaleString('vi-VN')} người đã mở khóa</>
          : <>Đang nhận nhóm người dùng đầu tiên để kiểm chứng dữ liệu lương thực tế</>}
      </p>
    </div>
  );
}

/* ═══ SALARY SIMULATOR ══════════════════════════════════════════════════════ */
function SalarySimulator({ fullName, currentPercent, dbData }: SimulatorProps) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const base = dbData?.top_50 ?? 15_000_000;
  const toggle = (id: string) => setChecked(p => ({ ...p, [id]: !p[id] }));
  const selected = SKILLS.filter(s => checked[s.id]);
  const salaryBoost = selected.reduce((a, s) => a + (s.boost as number), 0);
  const pctBoost = selected.reduce((a, s) => a + (s.pctBoost as number), 0);
  const simSalary = Math.round(base * (1 + salaryBoost));
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
          <p className="text-[10px] text-green-500">+{(salaryBoost * 100).toFixed(0)}% so với median · tăng {pctBoost} bậc percentile</p>
        </div>
      )}
      <div className="space-y-2">
        {SKILLS.map(s => (
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
function CompanyTierCard({ fullName, job, dbData }: Omit<ComponentProps, 'percent'>) {
  const base = dbData?.top_50 ?? 15_000_000;
  const [active, setActive] = useState<number | null>(null);
  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">🏢 So sánh theo loại hình công ty</p>
        <p className="text-[11px] text-slate-500">Cùng vị trí {job} — lương khác nhau hoàn toàn tùy tier</p>
      </div>
      {TIERS.map((tier, i) => {
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
                {i === 0 && 'Lương ổn định, ít biến động, phúc lợi cơ bản. Phù hợp tích lũy kinh nghiệm giai đoạn đầu.'}
                {i === 1 && 'Lương cạnh tranh hơn, quy trình rõ ràng, cơ hội thăng tiến nội bộ tốt hơn.'}
                {i === 2 && 'Lương theo chuẩn quốc tế, KPI rõ ràng, phúc lợi đầy đủ (ESOP, bảo hiểm cao cấp).'}
                {i === 3 && <><strong className="text-blue-700">Nhóm trả cao nhất thị trường.</strong> Yêu cầu: tiếng Anh C1+, chứng chỉ quốc tế, tư duy hệ thống. Đây là sân chơi mà lộ trình 90 ngày hướng đến.</>}
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
function GapAnalysisTab({ fullName, job, percent, dbData }: ComponentProps) {
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
function AIRoleplay({ fullName, job, percent, dbData }: ComponentProps) {
  const isOwner = /chủ|kinh doanh|tự do|founder|owner/i.test(job);
  const initialMessage = isOwner
    ? `[Chủ nhà nhíu mày nhìn bạn] "Cô/chú nghe nói cháu muốn bàn lại về hợp đồng thuê nhà? Tình hình dạo này buôn bán chậm lắm sao?"`
    : `[Sếp ngẩng đầu nhìn bạn qua kính] "Ừ, vào đi. Nghe bảo anh/chị muốn nói chuyện gì đó về... lương phải không?"`;
  const uiTitle = isOwner ? "🎯 Mô phỏng đàm phán với Chủ nhà" : "🎯 Mô phỏng đàm phán với Sếp";
  const uiSubtitle = isOwner ? "Chuyên gia dựng buổi thương lượng giảm 20% tiền mặt bằng mùa thấp điểm" : "Chuyên gia dựng buổi xin tăng lương thật — phản biện như sếp đang ngồi trước mặt";
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
            <span className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded-full font-bold">Top {percent}% thị trường</span>
            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">Cấp ngày: {TODAY}</span>
          </div>
        </div>
        <p className="text-[11px] text-slate-600 leading-relaxed mb-4">Dựa trên tập dữ liệu tổng hợp từ <strong>1,839 mẫu định lượng</strong> của Navigos/VietnamWorks và Adecco Vietnam (2026), kết hợp dữ liệu lực lượng lao động từ Tổng cục Thống kê (n=53.3M), báo cáo này xác định vị trí thu nhập của ứng viên trong phân phối lương ngành <strong>{job}</strong> tại thị trường Việt Nam.</p>
        <table className="w-full text-[11px] border-collapse mb-4">
          <thead><tr className="bg-slate-50"><th className="text-left p-2 border border-slate-200">Chỉ số</th><th className="text-left p-2 border border-slate-200">Giá trị</th><th className="text-left p-2 border border-slate-200">Nguồn</th></tr></thead>
          <tbody>
            {[
              ['Lương trung vị ngành (Median P50)', fmtM(dbData?.top_50), 'Adecco VN 2026 + Navigos 2026'],
              ['Lương nhóm khá (P80 — Top 20%)', fmtM(dbData?.top_20), 'VSPI Dataset 2026'],
              ['Lương nhóm xuất sắc (P90 — Top 10%)', fmtM(dbData?.top_10), 'ITviec + Talentnet–Mercer 2026'],
              ['Lương nhóm Elite (P95 — Top 5%)', fmtM(dbData?.top_5), 'Adecco Executive Report 2026'],
              ['Vị trí ứng viên trong phân phối', `Top ${percent}%`, 'VSPI Calculation Engine'],
              ['Tăng lương tối thiểu (NĐ 293/2025)', '+7.2%', 'Chính phủ Việt Nam 2025'],
              ['Thu nhập bình quân lao động (GSO Q3)', '8.4M VNĐ/tháng', 'Tổng cục Thống kê 2025'],
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
function VSPICertificate({ fullName, job, percent, vspiId }: CertificateProps) {
  const verifyUrl = `https://topluong.com/verify?id=${vspiId}&job=${encodeURIComponent(job)}&pct=${percent}&date=${encodeURIComponent(TODAY)}`;
  return (
    <div className="space-y-4">
      <div id="vspi-certificate" className="relative overflow-hidden rounded-[28px] border border-[#e8b84b]/55 bg-[#090d14] p-5 text-[#f0ede8] shadow-2xl shadow-[#e8b84b]/10">
        <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'linear-gradient(90deg,#e8b84b 1px,transparent 1px),linear-gradient(#e8b84b 1px,transparent 1px)', backgroundSize: '36px 36px' }} />
        <div className="absolute -right-24 -top-24 h-56 w-56 rounded-full border border-[#e8b84b]/25 bg-[#e8b84b]/10 blur-sm" />
        <div className="absolute -bottom-24 -left-20 h-52 w-52 rounded-full border border-[#22c55e]/20 bg-[#22c55e]/10 blur-sm" />
        <div className="relative z-10 rounded-[22px] border border-white/10 bg-[#0f1219]/88 p-5">
          <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
            <div>
              <p className="text-[9px] font-mono font-black uppercase tracking-[0.34em] text-[#e8b84b]">VSPI · Vietnam Salary Percentile Index</p>
              <p className="mt-1 text-[10px] text-[#f0ede8]/45">Verified income-position certificate · Q1/2026</p>
            </div>
            <div className="rounded-full border border-[#22c55e]/50 bg-[#0a2a1a] px-3 py-1 text-[9px] font-black uppercase tracking-wide text-[#22c55e]">
              ✓ Certified
            </div>
          </div>

          <div className="grid gap-5 py-6 sm:grid-cols-[1fr_auto] sm:items-center">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-[#f0ede8]/40">Chứng nhận cho</p>
              <h3 className="mt-2 text-2xl font-black leading-tight text-white">{fullName}</h3>
              <p className="mt-1 text-sm font-bold text-[#e8b84b]">{job}</p>
              <div className="mt-5 inline-flex items-end gap-2">
                <span className="text-[13px] font-black text-[#f0ede8]/50">Top</span>
                <span className="text-6xl font-black leading-none text-[#ff4d57]">{percent}%</span>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-[#f0ede8]/55">
                Vị trí thu nhập đã được đối chiếu với dữ liệu thị trường Việt Nam, chuẩn hóa theo ngành, kinh nghiệm và khu vực.
              </p>
            </div>
            <div className="mx-auto w-32 shrink-0 rounded-2xl border border-white/10 bg-white p-2 shadow-lg shadow-black/30">
              <QRCode value={verifyUrl} size={112} />
            </div>
          </div>

          <div className="grid gap-2 border-t border-white/10 pt-4 sm:grid-cols-3">
            <div className="rounded-xl border border-white/8 bg-[#090d14] px-3 py-2">
              <p className="text-[8px] uppercase tracking-wide text-[#f0ede8]/35">VSPI ID</p>
              <p className="mt-1 text-[10px] font-black tracking-wide text-[#e8b84b]">{vspiId}</p>
            </div>
            <div className="rounded-xl border border-white/8 bg-[#090d14] px-3 py-2">
              <p className="text-[8px] uppercase tracking-wide text-[#f0ede8]/35">Ngày cấp</p>
              <p className="mt-1 text-[10px] font-black text-white">{TODAY}</p>
            </div>
            <div className="rounded-xl border border-white/8 bg-[#090d14] px-3 py-2">
              <p className="text-[8px] uppercase tracking-wide text-[#f0ede8]/35">Nguồn dữ liệu</p>
              <p className="mt-1 text-[10px] font-black text-white">Adecco · ITviec · GSO</p>
            </div>
          </div>

          <div className="mt-4 flex items-end justify-between gap-4">
            <div>
              <p className="text-[8px] uppercase tracking-[0.24em] text-[#f0ede8]/35">Verification URL</p>
              <p className="mt-1 text-[9px] font-mono text-[#f0ede8]/45">topluong.com/verify · QR secured</p>
            </div>
            <div className="flex h-16 w-16 items-center justify-center rounded-full border-2 border-[#e8b84b] bg-[#e8b84b]/10 text-center text-[9px] font-black leading-tight text-[#e8b84b]">
              VSPI<br />2026
            </div>
          </div>
        </div>
      </div>
      <div className="bg-[#161b26] border border-white/10 rounded-2xl p-4 flex items-start gap-3">
        <span className="text-lg shrink-0">🔐</span>
        <div>
          <p className="text-[11px] font-sans font-bold text-[#f0ede8] mb-1">Xác thực bằng QR — HR có thể kiểm tra ngay</p>
          <p className="text-[10px] font-sans text-[#f0ede8]/45 leading-relaxed">Quét QR trỏ đến trang xác thực: ID · Ngành · Top% · Ngày cấp. Biến ảnh thành văn bằng số được xác thực — uy tín x1000.</p>
        </div>
      </div>
      <div className="bg-[#0f1219] border border-white/10 rounded-2xl p-4">
        <p className="text-[11px] font-mono font-bold text-[#e8b84b] uppercase tracking-widest mb-3">📌 Cách dùng chứng nhận này</p>
        {['Đính kèm email xin tăng lương + Evidence Brief (tab 📋) để tăng độ tin cậy', 'Khi HR hỏi "Số liệu lấy từ đâu?" — đưa VSPI ID để họ tự verify', 'Dùng khi negotiate với công ty mới để anchor mức lương kỳ vọng', 'Lưu lại — quét lại sau 3–6 tháng để track tiến độ của bạn'].map((s, i) => (
          <div key={i} className="flex gap-2 mb-2 last:mb-0"><span className="text-[#e8b84b] text-xs mt-0.5 shrink-0">✓</span><p className="text-[11px] font-sans text-[#f0ede8]/70 leading-relaxed">{s}</p></div>
        ))}
      </div>
    </div>
  );
}

/* ═══ ELITE LETTER ══════════════════════════════════════════════════════════ */
function EliteLetter({ fullName, job, percent }: EliteProps) {
  if (percent > 10) return null;
  return (
    <div className="bg-[#161b26] border border-[#e8b84b]/40 rounded-3xl p-6 relative overflow-hidden shadow-lg shadow-[#e8b84b]/5">
      <div className="absolute top-0 right-0 text-6xl opacity-5 pointer-events-none">🏆</div>
      <div className="flex items-center gap-2 mb-3"><span className="text-2xl">🎖️</span><p className="text-[11px] font-mono font-black text-[#e8b84b] uppercase tracking-widest">Thư chúc mừng từ Founder</p></div>
      <p className="text-sm font-sans text-[#f0ede8] leading-relaxed mb-3">Chào <strong className="text-[#e8b84b]">{fullName}</strong>, bạn vừa được xác nhận thuộc <strong className="text-[#e8b84b]">Top {percent}%</strong> ngành <strong className="text-[#e8b84b]">{job}</strong> tại Việt Nam.</p>
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
function PremiumReport({ fullName, job, percent, lostMoney, dbData, vspiId, salary }: PremiumProps) {
  const [tab, setTab] = useState('sim');
  const tabs = [{ id: 'sim', icon: '🎮', label: 'Simulator' }, { id: 'tier', icon: '🏢', label: 'Tier Cty' }, { id: 'gap', icon: '🔍', label: 'Gap 90 ngày' }, { id: 'boss', icon: '🎯', label: 'Mô phỏng deal lương' }, { id: 'brief', icon: '📋', label: 'Evidence' }, { id: 'cert', icon: '📜', label: 'VSPI Cert' }];
  const isOwner = /chủ|kinh doanh|tự do|founder|owner/i.test(job);
  // Career Compass context — drives all dynamic content in the report
  const compass: CareerCompassContext = getCareerCompassContext(job, salary, percent);
  const benchmarkTop50 = dbData?.top_50 || 0;
  const reportTargetSalary = Math.max(compass.nextBandMin, benchmarkTop50);
  const reportGap = Math.max(0, reportTargetSalary - salary);
  const formatReportMillion = (value: number) => value > 0 ? `${(value / 1_000_000).toFixed(1)} triệu` : '0 triệu';
  const reportTargetFmt = formatReportMillion(reportTargetSalary);
  const reportGapFmt = formatReportMillion(reportGap);
  const reportTargetName = benchmarkTop50 >= compass.nextBandMin && benchmarkTop50 > salary ? 'mốc Top 50%' : 'band tiếp theo';
  return (
    <div className="space-y-8">
      <div className="bg-[#0f1219] rounded-[2rem] overflow-hidden shadow-2xl border border-white/10 shadow-[#e8b84b]/5">
        <div className="bg-[#161b26] p-5 text-[#f0ede8] flex justify-between items-start border-b border-[#e8b84b]/20">
          <div>
            <span className="text-[10px] bg-[#e8b84b]/10 border border-[#e8b84b]/30 text-[#e8b84b] font-mono font-black px-2 py-0.5 rounded-full">✓ VSPI PREMIUM</span>
            <h3 className="text-base font-serif font-black mt-2 text-[#e8b84b]">Công cụ phân tích & Hành động</h3>
            <p className="text-[#f0ede8]/45 font-sans text-[10px]">{fullName} · {job} · Top {percent}%</p>
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
          {tab === 'sim' && <SalarySimulator fullName={fullName} currentPercent={percent} dbData={dbData} />}
          {tab === 'tier' && <CompanyTierCard fullName={fullName} job={job} dbData={dbData} />}
          {tab === 'gap' && <GapAnalysisTab fullName={fullName} job={job} percent={percent} dbData={dbData} />}
          {tab === 'boss' && <AIRoleplay fullName={fullName} job={job} percent={percent} dbData={dbData} />}
          {tab === 'brief' && <EvidenceBrief fullName={fullName} job={job} percent={percent} dbData={dbData} />}
          {tab === 'cert' && <VSPICertificate fullName={fullName} job={job} percent={percent} vspiId={vspiId} />}
        </div>
      </div>

      {/* Báo cáo native DOM */}
      <div className="bg-[#0f1219] rounded-[2rem] p-8 md:p-12 shadow-2xl border border-white/10 text-[#f0ede8]/80 text-justify font-sans leading-relaxed">
        <div className="text-center pb-8 border-b border-white/10 mb-8">
          <h1 className="text-3xl md:text-4xl font-serif font-black text-[#e8b84b] mb-3 uppercase tracking-widest">La Bàn Nghề Nghiệp</h1>
          <p className="text-sm md:text-lg text-[#f0ede8]/70 italic">Chiến Lược Bứt Phá Thu Nhập 2026</p>
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
            <h3 className="font-sans font-semibold text-[#f0ede8] mb-3 tracking-normal">Hồ sơ xác thực năng lực (VSPI Certificate)</h3>
            <ul className="list-disc pl-5 space-y-2 text-[#f0ede8]/70 text-sm">
              <li><strong>Mã xác thực điện tử:</strong> <span className="text-[#e8b84b] font-mono">{vspiId}</span></li>
              <li><strong>Vị trí hiện tại trong phân phối thu nhập:</strong> Top <span className="text-[#e8b84b] font-mono">{percent}%</span> {compass.jobGroup} tại Việt Nam.</li>
              <li><strong>Nhóm nghề xác định:</strong> <span className="text-[#e8b84b]">{compass.jobGroup}</span> — Band lương: <span className="text-[#e8b84b]">{compass.bandLabel}</span></li>
              <li><strong>Thu nhập hiện tại:</strong> <span className="text-[#e8b84b] font-mono">{compass.salaryFmt}/tháng</span> · Dải chuẩn band này: <span className="text-[#e8b84b]">{compass.currentBandRange}/tháng</span></li>
              <li><strong>Ngày cấp chứng nhận:</strong> <span className="text-[#e8b84b] font-mono">{TODAY}</span></li>
            </ul>
          </div>
          <p className="mb-4 font-bold text-[#f0ede8]">Giải mã con số "Top {percent}%": Bức tranh thực tế ngành {compass.jobGroup}</p>
          <p className="mb-4 text-[#f0ede8]/70">
            Với thu nhập <strong className="text-[#e8b84b]">{compass.salaryFmt}/tháng</strong>, bạn đang ở band <strong className="text-[#e8b84b]">{compass.bandLabel}</strong> trong ngành {compass.jobGroup}. {percent >= 100 ? 'Điểm cần làm ngay là vượt mốc Top 80% để thoát vùng lương thấp của ngành.' : <>Đây là vị trí Top {percent}% — có nghĩa là bạn đang cao hơn {100 - percent}% người lao động cùng ngành.</>}
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
                    "Dạ, em cảm ơn câu hỏi của anh/chị. Dựa trên Báo cáo Dữ liệu lương VSPI 2026, mức lương chuẩn cho vị trí <strong className="not-italic text-[#f0ede8]">{job}</strong> ở band <strong className="not-italic text-[#f0ede8]">{compass.bandLabel}</strong> đang dao động trong khoảng <strong className="not-italic text-[#e8b84b]">{compass.currentBandRange}/tháng</strong>. Với kinh nghiệm và bằng chứng em đang xây, em muốn neo quanh <strong className="not-italic text-[#e8b84b]">{reportTargetFmt}/tháng</strong> — tương ứng {reportTargetName}. Trước khi chốt con số chính xác, em muốn hiểu thêm kỳ vọng và ngân sách để tìm điểm chạm chung."
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
          <p className="mb-10 text-[#f0ede8]/70 leading-relaxed">Mức giá 29.000đ cho bản báo cáo và hệ sinh thái này là một sự nỗ lực phi lợi nhuận từ chúng tôi để kiến tạo một thế hệ người lao động Việt Nam có thu nhập cao hơn. Nếu bạn thấy bản báo cáo này giúp bạn khai sáng con đường sự nghiệp, hãy gửi đường link ứng dụng VSPI Scanner cho 3 người bạn thân nhất của bạn.</p>
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
function PaywallBox({ vspiId, fullName, selectedJob, resultPercent, lostMoney, salary, experience, marketLocation, workProvince, paidCount, dailyViews, onShowToast, onUnlock }: PaywallProps) {
  // 3 bước: 'preview' (mặc định — QR ẨN, chờ user bấm CTA), 'qr' (hiện QR + form), 'checking' (đang verify)
  const [payStep, setPayStep] = useState<'preview' | 'qr' | 'creating' | 'checking'>('preview');
  const [phone, setPhone] = useState('');
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const formStartedAtRef = useRef(Date.now());
  const [error, setError] = useState('');
  const [pollCount, setPollCount] = useState(0);
  const rolePreview = getPremiumRolePreview(selectedJob);
  const displayJob = selectedJob.trim() || rolePreview.roleLabel;
  const displayMonthlyUpside = Math.max(lostMoney / 12, salary * 0.25, 3_000_000);
  const premiumBenefits = [
    `Benchmark offer cùng profile nghề ${displayJob}`,
    'Con số nên nói khi HR hỏi lương mong muốn',
    `Câu justify mức lương theo đúng nghề ${displayJob}`,
    'La Bàn nghề nghiệp + bullet CV impact để HR gọi lại',
  ];
  const premiumBenefitTiles = [
    'Benchmark offer cùng profile',
    'Con số deal lương mong muốn',
    'Câu justify theo đúng nghề',
    'La Bàn + CV bullet impact',
  ];
  // Fallback polling ref — chỉ dùng nếu Realtime không khả dụng
  const pollRef    = useRef<NodeJS.Timeout | null>(null);
  // Supabase Realtime channel ref — cleanup khi unmount
  const channelRef = useRef<ReturnType<typeof import('@supabase/supabase-js').createClient> extends { channel: (...a: any[]) => infer C } ? C : any>(null);

  // Cleanup cả Realtime channel lẫn polling interval khi unmount
  useEffect(() => () => {
    if (pollRef.current)    clearInterval(pollRef.current);
    if (channelRef.current) channelRef.current.unsubscribe?.();
  }, []);

  // Lưu đơn hàng vào DB TRƯỚC, chỉ khi thành công mới chuyển sang verify
  const handleConfirmPayment = async () => {
    if (phone && !/^0[0-9]{9}$/.test(phone)) {
      setError('SĐT không hợp lệ (VD: 0901234567)');
      return;
    }
    if (!privacyConsent) {
      setError('Vui lòng đồng ý xử lý SĐT/lương để tạo đơn và mở khóa báo cáo.');
      return;
    }
    setError('');

    // Hiện loading trên nút trong lúc chờ API
    setPayStep('creating');
    trackEvent('checkout_started', {
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
          phone: phone || null,
          email: null,
          job_title: selectedJob,
          percent: resultPercent,
          experience,
          salary,
          market_location: marketLocation,
          work_province: workProvince,
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
        setPayStep('qr');
        return;
      }

      // DB đã có bản ghi → bắt đầu verify
      trackEvent('checkout_order_created', {
        product: 'premium',
        percent: resultPercent,
        market_location: marketLocation,
        work_province: workProvince,
      });
      startVerification();

    } catch (err) {
      console.error('[checkout] Network error:', err);
      onShowToast('Lỗi kết nối. Vui lòng thử lại!', 'error');
      setError('Lỗi kết nối. Vui lòng thử lại!');
      setPayStep('qr');
    }
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
  const startVerification = () => {
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
                  body: JSON.stringify({ id: vspiId, salary, market_location: marketLocation, work_province: workProvince }),
                });
                const data = await res.json();
                if (data.status === 'paid' && data.dbData) onUnlock(data.dbData, data.aiAnalysis ?? '', data.benchmark ?? null);
              } catch { /* polling đang chạy song song sẽ xử lý */ }
            }
          }
        )
        .subscribe();

      channelRef.current = channel;
    } catch {
      // Realtime không khả dụng — polling đã chạy rồi, không cần làm gì thêm
    }
  };

  // ── Lớp 2: Polling — nguồn truth chính, hoạt động độc lập với Realtime ──
  const startFallbackPolling = () => {
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
          body: JSON.stringify({ id: vspiId, salary, market_location: marketLocation, work_province: workProvince }),
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
          onUnlock(data.dbData, data.aiAnalysis ?? '', data.benchmark ?? null);
        }
      } catch { /* ignore network errors — sẽ retry ở lần sau */ }

      if (count >= 15) { // 15 × 8s = 2 phút timeout
        clearInterval(pollRef.current!);
        pollRef.current = null;
        setPayStep('qr');
        setError('Chưa nhận được xác nhận. Nếu đã chuyển khoản, liên hệ Zalo: 0915 662 876');
      }
    }, 8000);
  };

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
          <span className="text-[#f0ede8]/35 line-through text-sm">59.000đ</span>
          <span className="text-2xl font-black text-[#e8b84b]">29.000đ</span>
          <span className="bg-red-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full">-51%</span>
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
        <div className="rounded-2xl border border-[#e8b84b]/25 bg-[#e8b84b]/8 p-4 mb-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-[10px] font-mono font-black uppercase tracking-[0.22em] text-[#e8b84b]">
              29k mở khóa đủ 4 phần
            </p>
            <span className="rounded-full bg-[#e8b84b] px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-[#0a0c10]">
              hiểu trong 3 giây
            </span>
          </div>
          <div className="space-y-2">
            {premiumBenefits.map(item => (
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
            Bấm nút bên dưới để hiện mã QR · MSB · 29.000đ
          </p>
        </div>

        <button
          type="button"
          onClick={() => { playTap(); setPayStep('qr'); }}
          className="w-full bg-[#e8b84b] text-[#0a0c10] font-black py-4 rounded-xl text-base
                     hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(232,184,75,0.35)]
                     active:scale-[0.98] transition-all"
        >
          Mở khóa · 29k
        </button>

        <div className="mt-3 bg-[#161b26] rounded-xl p-3 border border-[#e8b84b]/15 text-center">
          {resultPercent <= 10 ? (
            <p className="text-[11px] font-sans text-[#f0ede8]/60">
              💡 <strong className="text-[#e8b84b]">29k</strong> = 1 ly cà phê — Mở khóa benchmark deal lương &amp; chiến lược{' '}
              <strong className="text-[#e8b84b]">Top 1%</strong>
            </p>
          ) : (
            <p className="text-[11px] font-sans text-[#f0ede8]/60">
              💡 <strong className="text-[#e8b84b]">29k</strong> để biết người cùng profile đang được offer{' '}
              <strong className="text-[#e8b84b]">{(displayMonthlyUpside / 1_000_000).toFixed(1)} triệu/tháng</strong> cao hơn bạn
            </p>
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-green-400/20 bg-green-400/10 px-3 py-2 text-center">
            <p className="text-[9px] font-mono font-black uppercase text-green-300">29K nhận đúng 4 phần</p>
            <p className="mt-1 text-[11px] font-bold leading-tight text-[#f0ede8]/75">Benchmark · số deal · câu justify · La Bàn + CV bullet</p>
          </div>
          <div className="rounded-xl border border-[#e8b84b]/20 bg-[#e8b84b]/10 px-3 py-2 text-center">
            <p className="text-[9px] font-mono font-black uppercase text-[#e8b84b]">Không cần đăng nhập</p>
            <p className="mt-1 text-[11px] font-bold leading-tight text-[#f0ede8]/75">Quét QR · nhập SĐT · mở báo cáo trong 30 giây</p>
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
          <span className="text-[#f0ede8]/35 line-through text-sm">59.000đ</span>
          <span className="text-2xl font-black text-[#e8b84b]">29.000đ</span>
          <span className="bg-red-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full">-51%</span>
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
              29k mở khóa đủ 4 phần
            </p>
            <span className="rounded-full bg-[#e8b84b] px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-[#0a0c10]">
              hiểu trong 3 giây
            </span>
          </div>
          <div className="space-y-2">
            {premiumBenefits.map(item => (
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
          Quét QR để thanh toán ngay
        </p>

        {/* QR card */}
        <div className="bg-white rounded-2xl p-3 shadow-[0_0_32px_rgba(232,184,75,0.2)] mb-3">
          {(() => {
            // Xóa dấu gạch ngang để ngân hàng không tự ý biến đổi nội dung
            const cleanVspiId = vspiId.replace(/-/g, '').toUpperCase();
            return (
              <img
                src={`https://img.vietqr.io/image/msb-96886693012762-compact2.png?amount=29000&addInfo=${cleanVspiId}&accountName=NGUYEN%20TRONG%20VAN`}
                alt="QR thanh toán 29.000đ"
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
            className="w-full bg-[#0a0c10] border border-white/15 rounded-xl px-4 py-3 text-sm text-[#f0ede8]
                       outline-none focus:border-[#e8b84b] focus:ring-1 focus:ring-[#e8b84b]/30
                       transition-colors placeholder:text-[#f0ede8]/25"
            value={phone}
            onChange={e => setPhone(e.target.value)}
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
            Tôi đồng ý VSPI lưu và xử lý SĐT, nghề nghiệp, mức lương để xác nhận thanh toán, mở khóa báo cáo và hỗ trợ sau mua. Có thể yêu cầu xóa dữ liệu tại trang Bảo mật.
          </span>
        </label>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5">
            <p className="text-[11px] text-red-400">{error}</p>
          </div>
        )}

        {/* CTA chính */}
        <button
          onClick={() => { playTap(); handleConfirmPayment(); }}
          className="w-full bg-[#e8b84b] text-[#0a0c10] font-black py-4 rounded-xl text-base
                     hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(232,184,75,0.35)]
                     active:scale-[0.98] transition-all"
        >
          ✅ Đã Chuyển Khoản — Mở Khóa Ngay
        </button>

        {/* ROI / Elite copy */}
        <div className="bg-[#161b26] rounded-xl p-3 border border-[#e8b84b]/15 text-center">
          {resultPercent <= 10 ? (
            <p className="text-[11px] font-sans text-[#f0ede8]/60">
              💡 <strong className="text-[#e8b84b]">29k</strong> = 1 ly cà phê — Mở khóa benchmark deal lương &amp; chiến lược{' '}
              <strong className="text-[#e8b84b]">Top 1%</strong>
            </p>
          ) : (
            <p className="text-[11px] font-sans text-[#f0ede8]/60">
              💡 <strong className="text-[#e8b84b]">29k</strong> để biết người cùng profile đang được offer{' '}
              <strong className="text-[#e8b84b]">{(displayMonthlyUpside / 1_000_000).toFixed(1)} triệu/tháng</strong> cao hơn bạn
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-green-400/20 bg-green-400/10 px-3 py-2 text-center">
            <p className="text-[9px] font-mono font-black uppercase text-green-300">29K nhận đúng 4 phần</p>
            <p className="mt-1 text-[11px] font-bold leading-tight text-[#f0ede8]/75">Benchmark · số deal · câu justify · La Bàn + CV bullet</p>
          </div>
          <div className="rounded-xl border border-[#e8b84b]/20 bg-[#e8b84b]/10 px-3 py-2 text-center">
            <p className="text-[9px] font-mono font-black uppercase text-[#e8b84b]">Không cần đăng nhập</p>
            <p className="mt-1 text-[11px] font-bold leading-tight text-[#f0ede8]/75">Quét QR · nhập SĐT · mở báo cáo trong 30 giây</p>
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
  const [groupedJobs, setGroupedJobs] = useState<Record<string, string[]>>({});
  const [fullName, setFullName] = useState('');
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [selectedJob, setSelectedJob] = useState('');
  const [salary, setSalary] = useState('');
  const [experience, setExperience] = useState<ExperienceLevel>('mid');
  const [marketLocation, setMarketLocation] = useState<MarketLocationKey>('hcm');
  const [workProvince, setWorkProvince] = useState<WorkProvinceKey>(DEFAULT_WORK_PROVINCE);
  // step: 1=form, 2=scanning-animation, 3=result
  const [step, setStep] = useState(1);
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
      const saved = localStorage.getItem('vspi-premium-session');
      if (!saved) return;
      const session = JSON.parse(saved);
      // Session hết hạn sau 7 ngày
      if (!session.savedAt || Date.now() - session.savedAt > 7 * 24 * 60 * 60 * 1000) {
        localStorage.removeItem('vspi-premium-session');
        return;
      }
      // Restore state
      if (session.selectedJob) setSelectedJob(session.selectedJob);
      if (session.salary) setSalary(formatMoneyInput(String(session.salary)));
      if (session.resultPercent) setResultPercent(session.resultPercent);
      if (session.lostMoney !== undefined) setLostMoney(session.lostMoney);
      if (session.dbData) setDbData(session.dbData);
      if (session.benchmarkMeta) setBenchmarkMeta(session.benchmarkMeta);
      if (session.aiAnalysis) setAiAnalysis(session.aiAnalysis);
      if (session.experience) setExperience(session.experience);
      if (session.workProvince) {
        const province = getWorkProvince(session.workProvince);
        setWorkProvince(province.key as WorkProvinceKey);
        setMarketLocation(province.marketLocation);
      } else if (session.marketLocation) {
        setMarketLocation(session.marketLocation);
      }
      if (session.isPremiumUnlocked || session.dbData) {
        setIsPremiumUnlocked(true);
        setStep(3);
        showToast('✅ Đã khôi phục báo cáo Premium của bạn', 'success');
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
      experience,
      market_location: marketLocation,
      work_province: workProvince,
      confidence_score: benchmarkMeta?.confidenceScore,
      match_type: benchmarkMeta?.matchType,
    });
  }, [step, isPremiumUnlocked, salary, resultPercent, experience, marketLocation, workProvince, benchmarkMeta]);

  const [vspiId] = useState(() => genVSPIId());
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
  const [scanDone, setScanDone] = useState(false);
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
  const [certName, setCertName] = useState('');
  const [certDownloading, setCertDownloading] = useState(false);

  const handleDownloadCertificate = async (name: string) => {
    const el = document.getElementById('vspi-certificate');
    setCertDownloading(true);

    // Canvas API fallback — credential-style certificate không phụ thuộc DOM capture.
    const drawFallbackCert = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 1400; canvas.height = 880;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      const drawBox = (x: number, y: number, w: number, h: number, fill: string, stroke = 'rgba(232,184,75,0.28)') => {
        ctx.fillStyle = fill;
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);
      };
      const drawQr = (x: number, y: number, size: number) => {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, y, size, size);
        const cell = size / 17;
        const seed = vspiId.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), resultPercent);
        ctx.fillStyle = '#0a0c10';
        for (let r = 0; r < 17; r++) {
          for (let c = 0; c < 17; c++) {
            const finder = (r < 5 && c < 5) || (r < 5 && c > 11) || (r > 11 && c < 5);
            const on = finder || ((r * 31 + c * 17 + seed) % 5 < 2);
            if (on) ctx.fillRect(x + c * cell, y + r * cell, cell * 0.82, cell * 0.82);
          }
        }
      };

      const bg = ctx.createLinearGradient(0, 0, 1400, 880);
      bg.addColorStop(0, '#070b12');
      bg.addColorStop(0.55, '#111827');
      bg.addColorStop(1, '#08150f');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, 1400, 880);

      ctx.strokeStyle = 'rgba(232,184,75,0.85)';
      ctx.lineWidth = 6;
      ctx.strokeRect(54, 54, 1292, 772);
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = 2;
      ctx.strokeRect(82, 82, 1236, 716);

      ctx.fillStyle = 'rgba(232,184,75,0.08)';
      for (let x = 100; x < 1300; x += 70) {
        ctx.fillRect(x, 120, 1, 640);
      }
      for (let y = 120; y < 760; y += 70) {
        ctx.fillRect(100, y, 1200, 1);
      }

      ctx.textAlign = 'left';
      ctx.fillStyle = '#e8b84b';
      ctx.font = 'bold 28px monospace';
      ctx.fillText('VSPI · VIETNAM SALARY PERCENTILE INDEX', 120, 150);
      ctx.fillStyle = 'rgba(240,237,232,0.52)';
      ctx.font = '20px sans-serif';
      ctx.fillText('Verified income-position certificate · Q1/2026', 120, 184);

      drawBox(1060, 120, 200, 48, '#0a2a1a', 'rgba(34,197,94,0.75)');
      ctx.fillStyle = '#22c55e';
      ctx.font = 'bold 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('✓ CERTIFIED', 1160, 152);

      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(240,237,232,0.42)';
      ctx.font = 'bold 18px monospace';
      ctx.fillText('CHỨNG NHẬN CHO', 120, 280);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 54px sans-serif';
      ctx.fillText(name || 'VSPI Member', 120, 348);
      ctx.fillStyle = '#e8b84b';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText(selectedJob, 120, 392);

      ctx.fillStyle = getRingColor(resultPercent);
      ctx.font = 'bold 150px sans-serif';
      ctx.fillText(`Top ${resultPercent}%`, 120, 570);
      ctx.fillStyle = 'rgba(240,237,232,0.58)';
      ctx.font = '24px sans-serif';
      ctx.fillText('Vị trí thu nhập đã được chuẩn hóa theo ngành, kinh nghiệm và khu vực.', 120, 620);

      drawBox(120, 680, 350, 78, 'rgba(9,13,20,0.86)', 'rgba(255,255,255,0.16)');
      drawBox(500, 680, 220, 78, 'rgba(9,13,20,0.86)', 'rgba(255,255,255,0.16)');
      drawBox(750, 680, 290, 78, 'rgba(9,13,20,0.86)', 'rgba(255,255,255,0.16)');
      ctx.textAlign = 'left';
      ctx.font = 'bold 15px monospace';
      ctx.fillStyle = 'rgba(240,237,232,0.38)';
      ctx.fillText('VSPI ID', 144, 708);
      ctx.fillText('NGÀY CẤP', 524, 708);
      ctx.fillText('NGUỒN DỮ LIỆU', 774, 708);
      ctx.font = 'bold 20px monospace';
      ctx.fillStyle = '#e8b84b';
      ctx.fillText(vspiId, 144, 738);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(TODAY, 524, 738);
      ctx.fillText('Adecco · ITviec · GSO', 774, 738);

      drawQr(1095, 500, 170);
      ctx.fillStyle = 'rgba(240,237,232,0.42)';
      ctx.font = '15px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('topluong.com/verify', 1180, 700);

      ctx.beginPath();
      ctx.arc(1178, 342, 82, 0, Math.PI * 2);
      ctx.strokeStyle = '#e8b84b';
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.fillStyle = 'rgba(232,184,75,0.10)';
      ctx.fill();
      ctx.fillStyle = '#e8b84b';
      ctx.font = 'bold 23px monospace';
      ctx.fillText('VSPI', 1178, 332);
      ctx.font = 'bold 18px monospace';
      ctx.fillText('2026', 1178, 360);
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
    const all: { ind: string, title: string }[] = [];
    Object.entries(groupedJobs).forEach(([ind, arr]) => arr.forEach(title => all.push({ ind, title })));
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
        const groups: Record<string, Set<string>> = {};
        data.forEach((item: { industry?: string; job_title: string }) => {
          if (excludeRegex.test(item.job_title)) return;
          const ind = item.industry || 'Ngành khác';
          if (!groups[ind]) groups[ind] = new Set();
          groups[ind].add(item.job_title);
        });
        if (!groups['Dịch vụ/Vận tải hàng không']) groups['Dịch vụ/Vận tải hàng không'] = new Set();
        groups['Dịch vụ/Vận tải hàng không'].add('Tiếp viên hàng không');
        const formatted: Record<string, string[]> = {};
        for (const ind in groups) formatted[ind] = Array.from(groups[ind]).sort();
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
    setScanStep(0); setScanProgress(0); setScanDone(false);
    const durations = [900, 1100, 1000, 800];
    const progressTargets = [25, 60, 80, 100];
    let currentStep = 0;

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
              setScanDone(true);
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
    if (preset.salary) setSalary(formatMoneyInput(preset.salary));
    setExperience(preset.experience);
    setWorkProvince(province.key as WorkProvinceKey);
    setMarketLocation(province.marketLocation);
    setIsCustomMode(false);
    setJobSearchQuery('');

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
    if (!selectedJob || !salary) { showToast('Vui lòng nhập đủ Nghề nghiệp và Thu nhập!', 'error'); return; }
    if (!agreedToTerms) { showToast('Vui lòng đồng ý với Chính sách bảo mật và Điều khoản sử dụng!', 'error'); return; }

    // Start scanning animation immediately
    paywallSeenRef.current = false;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try {
      localStorage.removeItem('vspi-roadmap-v2');
    } catch {
      // ignore storage errors
    }
    setStep(2);

    try {
      const userSal = parseMoneyInput(salary);
      if (isNaN(userSal) || userSal <= 0) { showToast('Thu nhập không hợp lệ', 'error'); setStep(1); return; }

      trackEvent('scan_started', {
        salary_band: getSalaryBand(userSal),
        experience,
        market_location: marketLocation,
        work_province: workProvince,
        custom_job: isCustomMode,
      });

      const res = await fetch('/api/scan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_title: selectedJob, salary: userSal, experience, market_location: marketLocation, work_province: workProvince })
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      trackEvent('scan_completed', {
        percent: json.percent,
        salary_band: getSalaryBand(userSal),
        experience: json.experience ?? experience,
        market_location: json.marketLocation ?? marketLocation,
        work_province: json.workProvince ?? workProvince,
        confidence_score: json.benchmark?.confidenceScore,
        match_type: json.benchmark?.matchType,
      });

      // Store result — animation will pick it up when done
      pendingResult.current = { percent: json.percent, dbData: json.dbData, isAboveMedian: json.isAboveMedian, lostMoney: json.lostMoney, benchmark: json.benchmark ?? null };

      try {
        localStorage.removeItem('vspi-roadmap-v2');
        localStorage.setItem('vspi-roadmap-draft-v1', JSON.stringify({
          job: selectedJob,
          salary: userSal,
          duration: 6,
          savedAt: Date.now(),
        }));
      } catch {
        // ignore storage errors
      }

      // Lưu scan history (fire-and-forget — không block UX)
      fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...getAttributionPayload(),
          phone: null, // sẽ gán SĐT khi user mua premium
          job_title: selectedJob,
          salary: userSal,
          percent: json.percent,
          experience,
          market_location: marketLocation,
          work_province: workProvince,
        }),
      }).catch(() => {});
    } catch (err) {
      console.error('Scan error:', err);
      trackEvent('scan_failed', {
        experience,
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
  const currentSalaryNumber = parseMoneyInput(salary);
  const opportunityGap = getStrategicOpportunity(benchmarkMeta, currentSalaryNumber, resultPercent);
  const strategicLostMoney = Math.max(lostMoney, opportunityGap.gapMonthly * 12);

  const painMsg = () => {
    const f = strategicLostMoney.toLocaleString('vi-VN');
    if (isAboveMedian && resultPercent <= 20) return <><strong className="text-red-700">{f}đ/năm</strong> đang bị bỏ lại so với nhóm Top {resultPercent <= 10 ? '5' : '10'}% — khoảng cách hoàn toàn có thể xóa bỏ.</>;
    if (opportunityGap.targetSalary && opportunityGap.gapMonthly > 0) {
      const top50Salary = getThreshold(benchmarkMeta, 'Top 50%') || 0;
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
                {['Adecco', 'ITviec', 'VietnamWorks', 'GSO'].map(s => (
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
                          className="w-full bg-[#161b26] border border-white/10 rounded-xl py-4 pl-10 pr-10 text-[#f0ede8] focus:border-[#e8b84b] focus:ring-1 focus:ring-[#e8b84b] outline-none transition-all text-sm placeholder:text-[#f0ede8]/30"
                          placeholder="Tìm ngành nghề (vd: marketing...)"
                          value={showJobDropdown ? jobSearchQuery : selectedJob}
                          onChange={e => { setJobSearchQuery(e.target.value); setShowJobDropdown(true); if (e.target.value === '') setSelectedJob(''); }}
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
                                  onClick={() => { setSelectedJob(j.title); setShowJobDropdown(false); }}>
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
                      value={selectedJob} onChange={e => setSelectedJob(e.target.value)} />
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
                              ${preset.id === 'office-growth'
                                ? 'bg-[#e8b84b]/10 border-[#e8b84b]/30 hover:bg-[#e8b84b]/15'
                                : 'bg-[#0f1219] border-white/10 hover:border-[#e8b84b]/40'}`}
                          >
                            <span className={`block text-[11px] font-black leading-tight ${preset.id === 'office-growth' ? 'text-[#e8b84b]' : 'text-[#f0ede8]'}`}>
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
                  className="w-full bg-[#161b26] border border-white/10 rounded-xl p-4 text-[#f0ede8] focus:border-[#e8b84b] focus:ring-1 focus:ring-[#e8b84b] outline-none transition-all text-sm placeholder:text-[#f0ede8]/30"
                  value={salary} onChange={e => setSalary(formatMoneyInput(e.target.value))} />
                {parseMoneyInput(salary) > 0 && <p className="text-[11px] font-mono text-[#e8b84b] mt-2 pl-1">≈ {parseMoneyInput(salary).toLocaleString('vi-VN')} đồng/tháng</p>}
              </div>

              <div>
                <label className="block text-[11px] font-mono font-bold text-[#f0ede8]/70 uppercase tracking-widest mb-2">
                  Tỉnh/thành làm việc <span className="text-red-400">*</span>
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
                  Tự quy đổi sang vùng lương: <span className="text-[#e8b84b]/80">{MARKET_LOCATIONS.find(item => item.key === selectedWorkProvince.marketLocation)?.label}</span>. Data này giúp VSPI tạo benchmark tỉnh/thành tốt hơn theo thời gian.
                </p>
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
                disabled={!agreedToTerms}
                className="w-full mt-6 p-4 bg-[#e8b84b] text-[#0a0c10] font-black rounded-xl text-base leading-tight hover:-translate-y-1 hover:shadow-[0_8px_32px_rgba(232,184,75,0.3)] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none sm:text-lg"
              >
                ⚡ XEM NGAY TÔI ĐỨNG TOP MẤY %
              </button>

              <div className="pt-4 border-t border-white/10 mt-6 text-center">
                <p className="text-[10px] text-[#f0ede8]/45 mb-2 font-mono uppercase tracking-widest">Nguồn dữ liệu uy tín từ:</p>
                <div className="flex flex-wrap justify-center gap-2">
                  <span className="text-[10px] bg-white/5 border border-white/10 px-3 py-1 rounded-full text-[#f0ede8]/70">Tổng cục thống kê GSO</span>
                  <span className="text-[10px] bg-white/5 border border-white/10 px-3 py-1 rounded-full text-[#f0ede8]/70">Adecco Report 2026</span>
                  <span className="text-[10px] bg-white/5 border border-white/10 px-3 py-1 rounded-full text-[#f0ede8]/70">VietnamWorks Data</span>
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
              {['Adecco', 'ITviec', 'VietnamWorks', 'GSO', 'Talentnet', 'NIC'].map(s => (
                <span key={s} className="font-mono text-[9px] bg-[#161b26] text-[#f0ede8]/45 border border-white/10 px-2 py-0.5 rounded-full pulse-soft">{s}</span>
              ))}
            </div>
          </div>
        )}

        {/* ── STEP 3: RESULT ── */}
        {step === 3 && (
          <div className="fade-up space-y-3 pb-32">
            {/* Ring */}
            <div className="bg-[#161b26] rounded-[2rem] p-8 text-center text-[#f0ede8] shadow-2xl relative overflow-hidden border border-[#e8b84b]/20">
              {/* Glow background */}
              <div className="absolute top-[-20%] left-[-10%] w-64 h-64 bg-[#e8b84b]/10 rounded-full blur-3xl pointer-events-none" />

              {/* ── SCAN LINE ANIMATION — đường quét từ trên xuống ── */}
              <div className="absolute inset-0 pointer-events-none overflow-hidden">
                <div
                  className="absolute left-0 right-0 h-[2px] opacity-60"
                  style={{
                    background: 'linear-gradient(90deg, transparent 0%, #e8b84b 30%, #e8b84b 70%, transparent 100%)',
                    animation: 'scanDown 3s ease-in-out infinite',
                    boxShadow: '0 0 12px 4px rgba(232,184,75,0.3)',
                  }}
                />
                {/* Glow trail */}
                <div
                  className="absolute left-0 right-0 h-20 opacity-20"
                  style={{
                    background: 'linear-gradient(180deg, rgba(232,184,75,0.4) 0%, transparent 100%)',
                    animation: 'scanDown 3s ease-in-out infinite',
                  }}
                />
              </div>
              <p className="text-[10px] font-bold font-mono text-[#e8b84b] uppercase tracking-[0.3em] mb-0.5">VSPI · Vietnam Salary Percentile Index</p>
              <p className="text-[9px] font-sans text-[#f0ede8]/45 mb-4">6 nguồn báo cáo · Q1/2026</p>
              <div className="relative w-44 h-44 mx-auto mb-5">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 140 140">
                  <circle cx="70" cy="70" r={RADIUS} fill="transparent" stroke="white" strokeOpacity="0.05" strokeWidth="10" />
                  <circle cx="70" cy="70" r={RADIUS} fill="transparent" stroke={ringColor} strokeWidth="10" strokeDasharray={CIRCUMFERENCE} strokeDashoffset={strokeDashoffset} strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xs font-mono font-bold text-[#f0ede8]/70">Top</span>
                  <span className="text-6xl font-serif font-black leading-none">{resultPercent}%</span>
                </div>
              </div>
              <ResultSocialShare percent={resultPercent} job={selectedJob} onShowToast={showToast} />
              <p className="text-xl font-serif font-bold text-[#f0ede8]">
                {resultPercent >= 100 ? 'Bạn đang dưới mốc Top 80%' : `Bạn cao hơn ${100 - resultPercent}%`}
              </p>
              <p className="text-sm font-sans opacity-50 mb-1">
                {resultPercent >= 100 ? `cần bật khỏi vùng lương thấp của ngành ${selectedJob}` : `người lao động ngành ${selectedJob}`}
              </p>
              <p className="text-[9px] text-[#e8b84b] font-mono">VSPI ID: {vspiId}</p>
              <div className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-[#22c55e] bg-[#0a2a1a] px-3 py-1.5">
                <span className="text-xs font-black leading-none text-[#22c55e]">✓</span>
                <span className="text-[11px] font-bold text-[#f0ede8]">Đã xác thực · Dữ liệu thật</span>
              </div>
              <p className="mt-1 text-[8px] text-[#f0ede8]/35">
                Tổng hợp từ Adecco · ITviec · VietnamWorks · GSO 2026 · Cập nhật Q1/2026
              </p>
              {benchmarkMeta?.matchedJobTitle && benchmarkMeta.matchedJobTitle.toLowerCase() !== selectedJob.toLowerCase() && (
                <p className="mt-2 text-[10px] text-[#f0ede8]/45">
                  Benchmark gần nhất: <span className="text-[#f0ede8]/70">{benchmarkMeta.matchedJobTitle}</span>
                </p>
              )}
              {benchmarkMeta?.marketLocation && (
                <p className="mt-1 text-[10px] text-[#f0ede8]/45">
                  Khu vực: <span className="text-[#f0ede8]/70">{benchmarkMeta.marketLocation}</span>
                  {benchmarkMeta.locationMultiplier && benchmarkMeta.locationMultiplier !== 1
                    ? <span> · hệ số {benchmarkMeta.locationMultiplier.toFixed(2)}x</span>
                    : null}
                </p>
              )}
              {/* Badge kinh nghiệm — luôn hiển thị */}
              <div className="mt-2 inline-flex items-center gap-1.5 bg-[#161b26] border border-white/15 text-[#f0ede8]/55 text-[9px] font-mono px-3 py-1 rounded-full">
                <span>⚙️</span>
                <span>Đã điều chỉnh theo mốc kinh nghiệm của bạn</span>
              </div>
              {benchmarkMeta && (
                <div className="mt-3 grid grid-cols-2 gap-2 text-left">
                  <div className="bg-[#0f1219] border border-white/10 rounded-xl px-3 py-2">
                    <p className="text-[9px] font-mono uppercase tracking-wider text-[#f0ede8]/35">Độ tin cậy</p>
                    <p className="text-sm font-black text-[#e8b84b]">{benchmarkMeta.confidenceScore}/100</p>
                    <p className="text-[9px] text-[#f0ede8]/45">{benchmarkMeta.confidenceLabel}</p>
                  </div>
                  <div className="bg-[#0f1219] border border-white/10 rounded-xl px-3 py-2">
                    <p className="text-[9px] font-mono uppercase tracking-wider text-[#f0ede8]/35">Xếp hạng ước tính</p>
                    <p className="text-sm font-black text-[#f0ede8]">
                      {resultPercent >= 100 ? 'Dưới Top 80%' : `#${benchmarkMeta.rankEstimate.toLocaleString('vi-VN')}`}
                    </p>
                    <p className="text-[9px] text-[#f0ede8]/45">
                      {resultPercent >= 100 ? 'mốc cần vượt đầu tiên' : 'trong lực lượng lao động'}
                    </p>
                  </div>
                </div>
              )}
              <div className="mt-3">
                <ConfidenceExplainer benchmark={benchmarkMeta} />
              </div>
              {benchmarkMeta?.ultraRankLabel && (
                <div className="mt-2 inline-block bg-[#e8b84b]/15 border border-[#e8b84b]/50 text-[#e8b84b] text-xs font-mono font-black px-3 py-1.5 rounded-full">
                  {benchmarkMeta.ultraRankLabel}
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
                  Đây là khoảng cách chiến lược, không phải bảo bạn đòi tăng một phát ngay hôm nay. La Bàn chỉ ra mốc cần tới; phần đồng hành chuyên gia sau 29K sẽ chia mốc đó thành từng sprint có bằng chứng, KPI và kết quả để deal lương từng phần.
                </p>
              </div>
            )}

            <CareerCompassGamification
              job={selectedJob}
              currentSalary={currentSalaryNumber}
              medianSalary={getThreshold(benchmarkMeta, 'Top 50%') || dbData?.top_50 || currentSalaryNumber}
              targetSalary={opportunityGap.targetSalary || getThreshold(benchmarkMeta, 'Top 20%') || dbData?.top_20 || currentSalaryNumber}
              benchmark={benchmarkMeta}
              resultPercent={resultPercent}
              isUnlocked29k={isPremiumUnlocked}
              onUnlockClick={() => {
                playTap();
                setShowPaywallBox(true);
                trackEvent('career_compass_unlock_click', {
                  product: 'premium',
                  percent: resultPercent,
                });
                window.setTimeout(() => {
                  document.getElementById('paywall-anchor')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 0);
              }}
            />

            {!isPremiumUnlocked && (
              <PremiumDecisionPreview
                job={selectedJob}
                resultPercent={resultPercent}
                gapMonthly={Math.round(opportunityGap.gapMonthly || lostMoney / 12)}
                targetLabel={opportunityGap.label}
                benchmark={benchmarkMeta}
                experience={experience}
                workProvinceLabel={selectedWorkProvince.label}
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
                    <p className="text-[11px] text-[#f0ede8]/45">+ Benchmark offer · Số deal lương · Câu justify · La Bàn + bullet CV</p>
                    <span className="text-[#e8b84b] text-xs font-black">29k ↓</span>
                  </div>
                </div>

                {/* 1. PaywallBox — 2-step: value prop → QR */}
                <div id="paywall-anchor" ref={paywallRef}>
                  {!showPaywallBox ? (
                    <div className="overflow-hidden rounded-3xl border border-[#e8b84b]/40 bg-[#0f1219] shadow-2xl shadow-[#e8b84b]/10">
                      <div className="border-b border-white/10 bg-[#161b26] px-5 py-4">
                        <p className="text-[11px] font-mono font-black uppercase tracking-[0.18em] text-[#e8b84b]">
                          💎 29K mở 4 phần của báo cáo
                        </p>
                      </div>
                      <div className="space-y-3 p-5">
                        <div className="flex items-start gap-3">
                          <span aria-hidden className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#e8b84b]/15 text-[13px] font-black text-[#e8b84b]">✓</span>
                          <p className="text-[13px] leading-relaxed text-[#f0ede8]/85">
                            <span className="font-black text-[#f0ede8]">Benchmark offer cùng profile</span>{' '}
                            <span className="text-[#f0ede8]/65">— xem người cùng nghề, cùng level đang được offer quanh mốc nào</span>
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
                            <span className="font-black text-[#f0ede8]">Câu justify mức lương theo đúng nghề</span>{' '}
                            <span className="text-[#f0ede8]/65">— có câu trả lời gọn, dựa trên giá trị và số liệu ngành của bạn</span>
                          </p>
                        </div>
                        <div className="flex items-start gap-3">
                          <span aria-hidden className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#e8b84b]/15 text-[13px] font-black text-[#e8b84b]">✓</span>
                          <p className="text-[13px] leading-relaxed text-[#f0ede8]/85">
                            <span className="font-black text-[#f0ede8]">La Bàn nghề nghiệp + bullet CV impact</span>{' '}
                            <span className="text-[#f0ede8]/65">— biết mốc Top tiếp theo và cách viết lại giá trị để HR gọi lại</span>
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            playTap();
                            setShowPaywallBox(true);
                            trackEvent('paywall_intent', {
                              product: 'premium',
                              percent: resultPercent,
                              salary_band: getSalaryBand(parseMoneyInput(salary)),
                            });
                            requestAnimationFrame(() => {
                              paywallRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            });
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
                        resultPercent={resultPercent}
                        lostMoney={strategicLostMoney}
                        salary={parseMoneyInput(salary)}
                        experience={experience}
                        marketLocation={marketLocation}
                        workProvince={workProvince}
                        paidCount={stats.paidCount}
                        dailyViews={stats.dailyViews}
                        onShowToast={showToast}
                        onUnlock={(fullData: SalaryData, ai: string, benchmark?: BenchmarkMeta | null) => {
                          setDbData(fullData);
                          setAiAnalysis(ai);
                          if (benchmark) setBenchmarkMeta(benchmark);
                          trackEvent('premium_unlocked', {
                            product: 'premium',
                            percent: resultPercent,
                            salary_band: getSalaryBand(parseMoneyInput(salary)),
                            confidence_score: benchmark?.confidenceScore ?? benchmarkMeta?.confidenceScore,
                            match_type: benchmark?.matchType ?? benchmarkMeta?.matchType,
                          });
                          setIsPremiumUnlocked(true);
                          // Lưu vào localStorage để xem lại sau khi thoát
                          try {
                            localStorage.setItem('vspi-premium-session', JSON.stringify({
                              vspiId,
                              selectedJob,
                              salary: parseMoneyInput(salary),
                              resultPercent,
                              lostMoney: strategicLostMoney,
                              dbData: fullData,
                              benchmarkMeta: benchmark ?? benchmarkMeta,
                              aiAnalysis: ai,
                              experience,
                              marketLocation,
                              workProvince,
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
                  <PercentileLadderCard benchmark={benchmarkMeta} percent={resultPercent} salary={currentSalaryNumber} />

                  <ExperienceSalaryBandsCard
                    benchmark={benchmarkMeta}
                    currentExperience={experience}
                    salary={parseMoneyInput(salary)}
                    percent={resultPercent}
                  />

                  <GroupCompareCard
                    job={selectedJob}
                    percent={resultPercent}
                    industry={dbData?.industry ?? undefined}
                  />

                  <IndustrySwitchCard currentJob={selectedJob} currentPercent={resultPercent} salary={parseMoneyInput(salary)} />

                  <SalaryTimelineCard
                    salary={parseMoneyInput(salary)}
                    percent={resultPercent}
                    job={selectedJob}
                    benchmark={benchmarkMeta}
                    experience={experience}
                  />

                  <NegotiationScoreCard job={selectedJob} percent={resultPercent} experience={experience} />

                  <JobJumpMapTeaser
                    job={selectedJob}
                    salary={parseMoneyInput(salary)}
                    percent={resultPercent}
                    unlocked={isPremiumUnlocked}
                  />
                </div>

                {/* 2. TeaserZone — sau QR, dùng để reinforce value */}
                <TeaserZone
                  fullName={displayName}
                  job={selectedJob}
                  percent={resultPercent}
                  lostMoney={strategicLostMoney}
                  salary={currentSalaryNumber}
                  dbData={dbData}
                  paidCount={stats.paidCount}
                  dailyViews={stats.dailyViews}
                />

                {/* 3. Secondary: Share + Social proof + Cert — cuối trang */}
                <RealDataPanel paidCount={stats.paidCount} dailyViews={stats.dailyViews} />

                <div className="space-y-3 pt-2 border-t border-white/5">
                  <ShareButton percent={resultPercent} job={selectedJob} benchmark={benchmarkMeta} />

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
                      />
                      <button
                        onClick={() => {
                          if (!certName.trim()) { showToast('Vui lòng nhập họ tên!', 'error'); return; }
                          setFullName(certName.trim());
                          showToast('Đã lưu tên! Mở khóa Premium để tải chứng nhận đầy đủ.', 'info');
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
                <EliteLetter fullName={displayName} job={selectedJob} percent={resultPercent} />

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
                    />
                    <button
                      onClick={() => {
                        if (!certName.trim()) { showToast('Vui lòng nhập họ tên!', 'error'); return; }
                        setFullName(certName.trim());
                        handleDownloadCertificate(certName.trim());
                      }}
                      disabled={certDownloading}
                      className="w-full bg-[#e8b84b] text-[#0a0c10] font-black px-4 py-3 rounded-xl text-sm leading-tight hover:bg-[#f0c84b] transition-colors disabled:opacity-60 disabled:cursor-not-allowed sm:w-auto sm:whitespace-nowrap"
                    >
                      {certDownloading ? 'Đang tạo...' : 'Tải chứng nhận'}
                    </button>
                  </div>
                </div>

                <ShareButton percent={resultPercent} job={selectedJob} benchmark={benchmarkMeta} />

                {/* Lazy-loaded — chỉ tải bundle khi isPremiumUnlocked === true */}
                <Suspense fallback={
                  <div className="bg-[#0f1219] rounded-[2rem] p-12 flex flex-col items-center gap-4 border border-white/10">
                    <div className="w-10 h-10 border-4 border-[#e8b84b]/30 border-t-[#e8b84b] rounded-full animate-spin" />
                    <p className="text-[11px] font-mono text-[#f0ede8]/45">Đang tải báo cáo Premium...</p>
                  </div>
                }>
                  <PremiumSection
                    fullName={displayName}
                    job={selectedJob}
                    percent={resultPercent}
                    lostMoney={strategicLostMoney}
                    dbData={dbData}
                    vspiId={vspiId}
                    salary={parseMoneyInput(salary)}
                    aiAnalysis={aiAnalysis}
                  />
                </Suspense>
              </>
            )}

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
              localStorage.removeItem('vspi-premium-session');
              localStorage.removeItem('vspi-roadmap-v2');
              localStorage.removeItem('vspi-roadmap-draft-v1');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
              className="w-full text-center py-5 text-[11px] font-mono text-[#f0ede8]/45 hover:text-[#e8b84b] transition-colors">
              ← QUÉT LẠI VỚI MỨC LƯƠNG KHÁC
            </button>
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
                    const el = document.getElementById('paywall-anchor');
                    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
                  <p className="text-[12px] font-black leading-tight text-[#f0c040]">La Bàn đã mở · còn thiếu hồ sơ hành động</p>
                  <p className="mt-1 line-clamp-2 text-[9px] leading-tight text-[#f0ede8]/45">Biến mốc {opportunityGap.label} thành skill, evidence và kịch bản deal lương</p>
                </div>
                <Link
                  href={`/roadmap?new=1&job=${encodeURIComponent(selectedJob)}&salary=${currentSalaryNumber}&duration=6`}
                  className="w-[8rem] max-w-[40vw] shrink-0 rounded-xl bg-[#8b5cf6] px-2 py-3 text-center text-[10px] font-black text-white shadow-[0_0_18px_rgba(139,92,246,0.35)] transition-all active:scale-95 min-[380px]:w-[8.75rem] min-[380px]:text-[11px]"
                >
                  TẠO HỒ SƠ 79K →
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
