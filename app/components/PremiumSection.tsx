"use client";

/**
 * PremiumSection — lazy-loaded chỉ khi isPremiumUnlocked === true.
 * Tách ra để giảm bundle size cho user dùng bản miễn phí.
 * Import bằng React.lazy() trong TopPercentScanner.tsx.
 */

import React, { useState } from 'react';
import QRCode from 'react-qr-code';
import { getCareerCompassContext, type CareerCompassContext } from '@/lib/careerCompassEngine';
import { getRoleAwareNegotiationScript, fillScript } from '@/lib/negotiationScripts';
import { detectJobGroup } from '@/lib/careerCompassEngine';
import { buildJobJumpMap } from '@/lib/jobJumpMap';
import { trackEvent } from '@/lib/analytics';
import { getSimulatedSalary } from '@/lib/salarySimulation';
import { repairMojibakeText } from '@/lib/mojibake';
import { alignCareerLadderToBenchmark, isPastCareerBand, type BenchmarkThresholdLike } from '@/lib/marketPositionDisplay';
import { sanitizePremiumInsightForRender } from '@/lib/reportPremiumInsight';
import { inferRoleLevelBand, isExecutiveLevel } from '@/lib/roleSeniority';
import {
  getSimulatorSkillsForRole,
  getWorkTiersForRole,
} from '@/lib/roleTaxonomy';

const SHARED_PHONE_KEY = 'vspi-shared-phone';
const SHARED_FULL_NAME_KEY = 'vspi-shared-full-name';
const SHARED_FULL_NAME_EVENT = 'vspi-shared-full-name-updated';
const CLIENT_REPORT_CACHE_VERSION = '2026-06-role-guard-v3';

const cleanSharedName = (value: string) => value.replace(/\s+/g, ' ').trim().slice(0, 80);
const saveSharedName = (value: string) => {
  const name = cleanSharedName(value);
  if (!name || typeof window === 'undefined') return name;
  try {
    localStorage.setItem(SHARED_FULL_NAME_KEY, name);
    window.dispatchEvent(new CustomEvent(SHARED_FULL_NAME_EVENT, { detail: name }));
  } catch { /* ignore storage errors */ }
  return name;
};

// ── Re-export types cần thiết ─────────────────────────────────────────────────
export interface SalaryData {
  industry?: string;
  job_title?: string;
  top_50: number;
  top_20: number | null;
  top_10: number | null;
  top_5: number | null;
}

export interface PremiumSectionProps {
  fullName: string;
  job: string;
  percent: number;
  lostMoney: number;
  dbData: SalaryData | null;
  vspiId: string;
  salary: number;
  aiAnalysis?: string; // từ verify API
  benchmark?: BenchmarkThresholdLike;
}

const TODAY = new Date().toLocaleDateString('vi-VN', {
  day: '2-digit', month: '2-digit', year: 'numeric',
});

const DEFAULT_SKILLS = [
  { id: 'english', label: 'Tiếng Anh chuyên ngành B2+', boost: 0.12, pctBoost: 12 },
  { id: 'ai',      label: 'Năng lực dùng công cụ năng suất hiện đại',  boost: 0.20, pctBoost: 22 },
  { id: 'lead',    label: 'Quản lý nhóm / Team Lead',   boost: 0.22, pctBoost: 18 },
  { id: 'cert',    label: 'Chứng chỉ chuyên ngành quốc tế', boost: 0.10, pctBoost: 8 },
];

function getSimulatorSkills(job: string, industry?: string | null) {
  return getSimulatorSkillsForRole(job, DEFAULT_SKILLS, industry);
}

const DEFAULT_TIERS = [
  { name: 'Startup / SME',               mul: 1.00, color: '#94a3b8', badge: '🏠' },
  { name: 'Công ty nội địa lớn',          mul: 1.28, color: '#60a5fa', badge: '🏢' },
  { name: 'FDI / Doanh nghiệp nước ngoài', mul: 1.60, color: '#34d399', badge: '🌏' },
  { name: 'MNC / Tập đoàn đa quốc gia',   mul: 2.05, color: '#fbbf24', badge: '🏆' },
];

function getWorkTiers(job: string, industry?: string | null) {
  return getWorkTiersForRole(job, DEFAULT_TIERS, industry);
}

const RADIUS = 60;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const fmtM = (n: number | null | undefined) => n ? `${(n / 1_000_000).toFixed(1)}M` : '?M';
const formatPercentDisplay = (percent: number) => percent >= 100 ? 'Dưới Top 80%' : `Top ${percent}%`;
const getRingColor = (p: number) =>
  p <= 5 ? '#FFD700' : p <= 10 ? '#00E676' : p <= 20 ? '#40C4FF' : p <= 50 ? '#FF9100' : '#FF5252';

function JobJumpMapPremium({ job, salary, percent, industry }: { job: string; salary: number; percent: number; industry?: string | null }) {
  const map = buildJobJumpMap(job, salary, percent, industry);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-black text-[#e8b84b] uppercase tracking-widest mb-1">Bản đồ role trả cao hơn</p>
        <h3 className="text-lg font-black text-[#f0ede8] leading-tight">{map.headline}</h3>
        <p className="text-[11px] text-[#f0ede8]/50 leading-relaxed mt-2">{map.summary}</p>
      </div>

      <div className="space-y-3">
        {map.targetRoles.map((role, index) => (
          <div key={role.title} className="bg-[#161b26] border border-white/10 rounded-2xl p-4">
            <div className="flex items-start justify-between gap-3 mb-2">
              <div>
                <p className="text-[10px] font-mono text-[#e8b84b]/70 uppercase">Hướng {index + 1}</p>
                <p className="text-sm font-black text-[#f0ede8]">{role.title}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-[9px] text-[#f0ede8]/35 font-mono uppercase">Target</p>
                <p className="text-sm font-black text-green-400">{fmtM(role.targetSalary)}</p>
              </div>
            </div>
            <p className="text-[11px] text-[#f0ede8]/60 leading-relaxed mb-3">{role.why}</p>
            <div className="flex flex-wrap gap-1.5">
              {role.keywords.map(keyword => (
                <span key={keyword} className="text-[9px] font-mono text-[#e8b84b] bg-[#e8b84b]/10 border border-[#e8b84b]/20 rounded-full px-2 py-1">
                  {keyword}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-[#0f1219] border border-white/10 rounded-2xl p-4">
        <p className="text-[10px] font-mono text-[#e8b84b] uppercase tracking-widest mb-3">CV bullets nên sửa ngay</p>
        <div className="space-y-2">
          {map.cvBullets.map((bullet, index) => (
            <div key={index} className="flex gap-2">
              <span className="text-[#e8b84b] text-xs mt-0.5 shrink-0">✓</span>
              <p className="text-[11px] text-[#f0ede8]/70 leading-relaxed">{bullet}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4">
          <p className="text-[10px] font-mono text-green-400 uppercase tracking-widest mb-2">Câu anchor lương khi phỏng vấn</p>
          <p className="text-sm text-[#f0ede8]/85 leading-relaxed italic">“{map.interviewAnchor}”</p>
        </div>
        <div className="bg-[#e8b84b]/10 border border-[#e8b84b]/25 rounded-2xl p-4">
          <p className="text-[10px] font-mono text-[#e8b84b] uppercase tracking-widest mb-2">Nếu chưa nhảy việc ngay</p>
          <p className="text-sm text-[#f0ede8]/85 leading-relaxed">{map.internalRaiseAngle}</p>
        </div>
      </div>
    </div>
  );
}

// ── Expert Insight Box ────────────────────────────────────────────────────────
function AiInsightBox({ text }: { text: string }) {
  const cleanText = repairMojibakeText(text);
  return (
    <div
      className="rounded-3xl p-6 relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #0f1219 0%, #161b26 100%)',
        border: '1px solid rgba(232,184,75,0.5)',
        boxShadow: '0 0 32px rgba(232,184,75,0.15), inset 0 0 32px rgba(232,184,75,0.03)',
      }}
    >
      {/* Glow corner */}
      <div className="absolute top-0 right-0 w-40 h-40 bg-[#e8b84b]/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-lg"
          style={{ background: 'rgba(232,184,75,0.15)', border: '1px solid rgba(232,184,75,0.3)' }}
        >
          ✦
        </div>
        <div>
          <p className="text-[11px] font-mono font-black text-[#e8b84b] uppercase tracking-widest leading-none">
            Insight riêng
          </p>
          <p className="text-[10px] text-[#f0ede8]/40 mt-0.5">Dành riêng cho bạn · Dựa trên benchmark ngành</p>
        </div>
        <span
          className="ml-auto text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider shrink-0"
          style={{ background: 'rgba(232,184,75,0.15)', color: '#e8b84b', border: '1px solid rgba(232,184,75,0.3)' }}
        >
          Độc quyền
        </span>
      </div>

      {/* Divider */}
      <div className="h-px bg-gradient-to-r from-transparent via-[#e8b84b]/30 to-transparent mb-4" />

      {/* Content */}
      <p className="text-sm text-[#f0ede8]/85 leading-relaxed font-sans">{cleanText}</p>

      {/* Footer note */}
      <p className="text-[9px] font-mono text-[#f0ede8]/25 mt-4">
        Phân tích được sinh tự động · Không lưu trữ · Chỉ hiển thị 1 lần
      </p>
    </div>
  );
}

// ── Salary Simulator ──────────────────────────────────────────────────────────
function SalarySimulator({ currentPercent, currentSalary, dbData, job }: { currentPercent: number; currentSalary: number; dbData: SalaryData | null; job: string }) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const skills = getSimulatorSkills(job, dbData?.industry);
  const toggle = (id: string) => setChecked(p => ({ ...p, [id]: !p[id] }));
  const selected = skills.filter(s => checked[s.id]);
  const salaryBoost = selected.reduce((a, s) => a + s.boost, 0);
  const pctBoost    = selected.reduce((a, s) => a + s.pctBoost, 0);
  const simSalary   = getSimulatedSalary(currentSalary, dbData?.top_50, salaryBoost);
  const simPercent  = Math.max(5, currentPercent - pctBoost);
  const ringColor   = getRingColor(simPercent);
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

// ── Company Tier Card ─────────────────────────────────────────────────────────
function CompanyTierCard({ job, dbData }: { job: string; dbData: SalaryData | null }) {
  const base = dbData?.top_50 ?? 15_000_000;
  const [active, setActive] = useState<number | null>(null);
  const tiers = getWorkTiers(job, dbData?.industry);
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

// ── Main PremiumSection export ────────────────────────────────────────────────
export default function PremiumSection({
  fullName, job, percent, lostMoney, dbData, vspiId, salary, aiAnalysis, benchmark,
}: PremiumSectionProps) {
  const [tab, setTab] = useState('sim');
  const tabs = [
    { id: 'sim',   icon: '🎮', label: 'Simulator' },
    { id: 'jump',  icon: '🧭', label: 'Job Map' },
    { id: 'tier',  icon: '🏢', label: 'Môi trường'  },
    { id: 'cert',  icon: '📜', label: 'VSPI Cert'  },
  ];
  const isOwner = /chủ|kinh doanh|tự do|founder|owner/i.test(job);
  const compass: CareerCompassContext = getCareerCompassContext(job, salary, percent, dbData?.industry);
  const isExecutiveRole = isExecutiveLevel(inferRoleLevelBand({ jobTitle: job, industry: dbData?.industry }));
  const benchmarkLadder = alignCareerLadderToBenchmark(compass.careerLadder, { salary, percent, dbData, benchmark });
  const marketPosition = benchmarkLadder.display;
  const reportBandLabel = marketPosition?.currentBandLabel ?? compass.bandLabel;
  const reportBandRange = marketPosition?.currentBandRange ?? compass.currentBandRange;
  const reportCurrentBand = benchmarkLadder.currentBand ?? compass.band;
  const alignedCareerLadder = benchmarkLadder.ladder;
  const roadmapHref = `/roadmap?new=1&job=${encodeURIComponent(job)}&salary=${salary}&duration=6&name=${encodeURIComponent(cleanSharedName(fullName))}`;
  const saveRoadmapDraft = () => {
    try {
      const savedPhone = localStorage.getItem(SHARED_PHONE_KEY);
      const savedName = saveSharedName(fullName);
      localStorage.setItem('vspi-roadmap-draft-v1', JSON.stringify({
        cacheVersion: CLIENT_REPORT_CACHE_VERSION,
        fullName: savedName || undefined,
        phone: savedPhone || undefined,
        job,
        salary,
        duration: 6,
        savedAt: Date.now(),
      }));
    } catch { /* ignore storage errors */ }
  };
  const rawTargetGap = Math.max(0, lostMoney / 12);
  const normalizedJob = job.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
  const isLanguageCenterManagerTrack = /quan ly.*trung tam.*(ngoai ngu|tieng anh)|giam doc.*trung tam.*(ngoai ngu|tieng anh)|pho giam doc.*trung tam.*(ngoai ngu|tieng anh)|center manager.*(english|language)|language center manager|english center manager/.test(normalizedJob);
  const isEnglishTeacherTrack = !isLanguageCenterManagerTrack && /giao vien tieng anh|english teacher|ielts teacher|toeic teacher|cambridge teacher|ielts|toeic|cambridge|tesol|celta|ngon ngu anh/.test(normalizedJob);
  const targetSalary = isEnglishTeacherTrack ? Math.max(salary + rawTargetGap, 18_000_000) : salary + rawTargetGap;
  const targetGap = Math.max(0, targetSalary - salary);
  const benchmarkGap = marketPosition?.strategicGap ?? compass.salaryGap;
  const targetGapFmt = targetGap > 0 ? `${(targetGap / 1_000_000).toFixed(1)} triệu` : (marketPosition?.strategicGapFmt ?? compass.salaryGapFmt);
  const targetSalaryFmt = targetSalary > 0 ? `${(targetSalary / 1_000_000).toFixed(1)} triệu` : (marketPosition?.strategicTargetFmt ?? compass.nextBandMinFmt);
  const isBeyondBandTarget = targetGap > benchmarkGap + 250_000;
  const percentileLabel = formatPercentDisplay(percent);
  const isUnderTop80 = percent >= 100;
  const targetName = isBeyondBandTarget ? 'mốc tăng lương đáng xem' : (marketPosition?.strategicTargetLabel ? `mốc ${marketPosition.strategicTargetLabel}` : 'band tiếp theo');
  const safeAiInsight = sanitizePremiumInsightForRender({
    text: aiAnalysis,
    job,
    salary,
    percent,
    industry: dbData?.industry,
    targetLabel: marketPosition?.strategicTargetLabel ?? reportBandLabel,
    targetSalary: marketPosition?.strategicTargetSalary ?? targetSalary,
  });

  return (
    <div className="space-y-6">

      {/* ── Expert Insight Box — đầu trang, nổi bật nhất ── */}
      {safeAiInsight && <AiInsightBox text={safeAiInsight} />}

      {/* ── Interactive Tools ── */}
      <div className="bg-[#0f1219] rounded-[2rem] overflow-hidden shadow-2xl border border-white/10">
        <div className="bg-[#161b26] p-5 text-[#f0ede8] border-b border-[#e8b84b]/20">
          <span className="text-[10px] bg-[#e8b84b]/10 border border-[#e8b84b]/30 text-[#e8b84b] font-mono font-black px-2 py-0.5 rounded-full">✓ Báo cáo lương 29K</span>
          <h3 className="text-base font-serif font-black mt-2 text-[#e8b84b]">Công cụ phân tích & Hành động</h3>
            <p className="text-[#f0ede8]/45 font-sans text-[10px]">{fullName} · {job} · {percentileLabel}</p>
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
          {tab === 'sim'  && <SalarySimulator currentPercent={percent} currentSalary={salary} dbData={dbData} job={job} />}
          {tab === 'jump' && <JobJumpMapPremium job={job} salary={salary} percent={percent} industry={dbData?.industry} />}
          {tab === 'tier' && <CompanyTierCard job={job} dbData={dbData} />}
          {tab === 'cert' && (
            <div id="vspi-certificate" className="relative rounded-2xl border border-[#d7b56d]/70 bg-[#0b111a] p-4 text-[#f0ede8] shadow-2xl shadow-black/30 sm:p-5">
              <div className="rounded-xl border border-white/12 bg-[#111722] p-4 sm:p-5">
                <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
                  <div className="min-w-0">
                    <p className="text-[11px] font-black text-[#e8b84b]">Top Lương Verified</p>
                    <p className="mt-1 text-[10px] leading-relaxed text-[#f0ede8]/48">Vietnam Salary Percentile Index · Q1/2026</p>
                  </div>
                  <div className="shrink-0 rounded-full border border-[#22c55e]/45 bg-[#0a2a1a] px-3 py-1 text-[10px] font-black text-[#22c55e]">
                    Đã xác thực
                  </div>
                </div>

                <div className="grid min-w-0 gap-5 py-6 xl:grid-cols-[minmax(0,1fr)_14rem] xl:items-end">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-[#f0ede8]/45">Chứng nhận vị trí thu nhập cho</p>
                    <h3 className="mt-2 break-words text-2xl font-black leading-tight text-white sm:text-3xl">{fullName || 'Người dùng VSPI'}</h3>
                    <p className="mt-2 break-words text-sm font-bold leading-snug text-[#e8b84b]">{job}</p>
                    <p className="mt-5 text-[12px] font-bold text-[#f0ede8]/52">Vị trí trong phân phối lương</p>
                    <div className="mt-1 flex min-w-0 flex-nowrap items-end gap-2">
                      {isUnderTop80 ? (
                        <span className="max-w-full break-words text-[2.25rem] font-black leading-none text-[#ff4d57] sm:text-[2.75rem]">{percentileLabel}</span>
                      ) : (
                        <>
                          <span className="text-2xl font-black leading-none text-[#f0ede8]">Top</span>
                          <span className="shrink-0 text-[2.75rem] font-black leading-none text-[#ff4d57] sm:text-[3.5rem]">{percent}%</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="min-w-0 rounded-xl border border-[#e8b84b]/30 bg-[#0b111a] p-4">
                    <p className="text-[10px] font-bold text-[#f0ede8]/45">VSPI ID</p>
                    <p className="mt-2 break-words text-[12px] font-black leading-relaxed text-[#e8b84b]">{vspiId}</p>
                    <p className="mt-4 text-[10px] font-bold text-[#f0ede8]/45">Ngày cấp</p>
                    <p className="mt-1 text-[12px] font-black text-white">{TODAY}</p>
                  </div>
                </div>

                <div className="rounded-xl border border-white/10 bg-[#0b111a] p-4">
                  <p className="text-[11px] leading-relaxed text-[#f0ede8]/62">
                    Vị trí thu nhập được Top Lương đối chiếu theo nhóm nghề, kinh nghiệm và khu vực. Đây là ước tính tham chiếu có VSPI ID để kiểm tra lại tại topluong.com/verify, không phải chứng nhận của cơ quan nhà nước hoặc bên thứ ba.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Báo cáo La Bàn Nghề Nghiệp ── */}
      <div className="bg-[#0f1219] rounded-[2rem] p-7 md:p-10 shadow-2xl border border-white/10 font-sans leading-relaxed">

        {/* Header */}
        <div className="text-center pb-8 border-b border-white/10 mb-8">
          <p className="text-[10px] font-mono text-[#e8b84b]/60 uppercase tracking-[0.3em] mb-2">Báo cáo cá nhân · {TODAY}</p>
          <h1 className="text-2xl md:text-3xl font-black text-[#f0ede8] mb-2 leading-tight">
            Bức tranh thật về<br />
            <span className="text-[#e8b84b]">vị trí của bạn trên thị trường</span>
          </h1>
          <p className="text-sm text-[#f0ede8]/50">{job} · {percentileLabel} · {compass.salaryFmt}/tháng</p>
        </div>

        {/* Chương 1 — Viết lại theo ngôn ngữ cảm xúc */}
        <div className="mb-10">
          <h2 className="text-lg font-bold text-[#f0ede8] mb-5 flex items-center gap-2">
            <span className="text-[#e8b84b]">01</span>
            <span>Bạn đang đứng ở đâu — và tại sao điều đó quan trọng</span>
          </h2>

          {/* Disclaimer nếu nghề tự nhập */}
          {compass.isFallback && (
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl px-4 py-3 mb-4">
              <p className="text-[11px] text-orange-300 leading-relaxed">
                ⚠️ <strong>Lưu ý:</strong> Nghề "<strong>{job}</strong>" chưa có trong cơ sở dữ liệu khảo sát của chúng tôi.
                Các số liệu dưới đây dựa trên <strong>dữ liệu trung bình thị trường chung</strong> — có thể không phản ánh chính xác ngành của bạn.
                Kết quả mang tính tham khảo.
              </p>
            </div>
          )}

          {/* Số liệu cá nhân hóa */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-[#161b26] rounded-2xl p-4 text-center border border-white/5">
              <p className="text-[10px] text-[#f0ede8]/40 mb-1">Vị trí của bạn</p>
              <p className="text-2xl font-black text-[#e8b84b]">{percentileLabel}</p>
              <p className="text-[10px] text-[#f0ede8]/40 mt-1">trong {compass.jobGroup}</p>
            </div>
            <div className="bg-[#161b26] rounded-2xl p-4 text-center border border-white/5">
              <p className="text-[10px] text-[#f0ede8]/40 mb-1">Để chạm {targetName}</p>
              <p className="text-2xl font-black text-green-400">+{targetGapFmt}</p>
              <p className="text-[10px] text-[#f0ede8]/40 mt-1">mỗi tháng</p>
            </div>
          </div>

          <p className="text-[#f0ede8]/80 text-sm leading-relaxed mb-4">
            Với <strong className="text-[#f0ede8]">{compass.salaryFmt}/tháng</strong>, bạn đang ở mốc <strong className="text-[#e8b84b]">{reportBandLabel}</strong>. Nghe có vẻ ổn — nhưng đây chính xác là cái bẫy mà hầu hết mọi người không nhận ra cho đến khi đã mất 3–5 năm.
          </p>

          {/* Pain point — viết như người bạn nói chuyện */}
          <div className="bg-[#161b26] border-l-4 border-red-400 rounded-r-2xl p-5 mb-5">
            <p className="text-red-300 text-xs font-bold uppercase tracking-wider mb-2">Điều không ai nói thẳng với bạn</p>
            <p className="text-[#f0ede8]/85 text-sm leading-relaxed">{compass.painPoint}</p>
          </div>

          <p className="text-[#f0ede8]/65 text-sm leading-relaxed">
            {isBeyondBandTarget ? 'Bạn đã tiệm cận mốc gần nhất, nên báo cáo không dừng ở khoảng cách vài trăm nghìn/tháng.' : 'Khoảng cách đáng nhìn hiện tại'} là <strong className="text-[#e8b84b]">{targetGapFmt}/tháng</strong> — tương đương <strong className="text-[#e8b84b]">{Math.round(targetGap * 12).toLocaleString('vi-VN')}đ/năm</strong>, hướng tới <strong className="text-[#e8b84b]">{targetSalaryFmt}/tháng</strong>. Chương 2 sẽ chỉ ra việc cần làm để tạo bằng chứng cho mốc này.
          </p>
        </div>

        {/* Chương 2 */}
        <div className="mb-10 pt-8 border-t border-white/8">
          <h2 className="text-lg font-bold text-[#f0ede8] mb-5 flex items-center gap-2">
            <span className="text-[#e8b84b]">02</span>
            <span>{isOwner ? 'Tối ưu mô hình — tăng lợi nhuận không cần làm thêm giờ' : 'Khoảng trống kỹ năng — và con đường ngắn nhất để vượt qua'}</span>
          </h2>

          {/* Market insight — ngắn gọn, có số liệu */}
          <div className="bg-[#161b26] rounded-2xl p-4 mb-4 border border-white/5">
            <p className="text-[10px] font-mono text-[#e8b84b]/70 uppercase tracking-wider mb-2">📊 Thị trường đang nói gì</p>
            <p className="text-sm text-[#f0ede8]/80 leading-relaxed">{compass.marketInsight}</p>
          </div>

          {/* Opportunity — viết như cơ hội thật */}
          <div className="bg-[#0a1a0a] border border-green-500/20 rounded-2xl p-4 mb-4">
            <p className="text-[10px] font-mono text-green-400/70 uppercase tracking-wider mb-2">💡 Cửa đang mở — nhưng không mở mãi</p>
            <p className="text-sm text-[#f0ede8]/80 leading-relaxed">{compass.opportunity}</p>
          </div>

          {/* Skill gap — cụ thể */}
          <div className="bg-[#161b26] rounded-2xl p-4 mb-5 border border-white/5">
            <p className="text-[10px] font-mono text-[#f0ede8]/40 uppercase tracking-wider mb-2">🎯 Kỹ năng tạo ra khoảng cách lương lớn nhất ngành bạn</p>
            <p className="text-sm text-[#f0ede8]/80 leading-relaxed">{compass.topSkillGap}</p>
          </div>

          {/* Next milestone — 1 hành động cụ thể */}
          <div className="bg-[#e8b84b]/8 border border-[#e8b84b]/25 rounded-2xl p-5">
            <p className="text-[10px] font-mono text-[#e8b84b] uppercase tracking-wider mb-2">⚡ Việc cần làm ngay trong 30 ngày tới</p>
            <p className="text-sm text-[#f0ede8]/85 leading-relaxed font-medium">{compass.nextMilestone}</p>
          </div>

          {/* ── CAREER LADDER — Lộ trình từng giai đoạn ── */}
          {alignedCareerLadder.length > 0 && (
            <div className="mt-6">
              <p className="text-[10px] font-mono text-[#f0ede8]/40 uppercase tracking-wider mb-4">🗺️ Lộ trình sự nghiệp — từng giai đoạn cụ thể</p>
              <div className="relative">
                {/* Vertical line */}
                <div className="absolute left-[18px] top-0 bottom-0 w-px bg-white/10" />

                <div className="space-y-4">
                  {alignedCareerLadder.map((step, i) => {
                    const isCurrent = step.band === reportCurrentBand;
                    const isPast = isPastCareerBand(step.band, reportCurrentBand);
                    const isFuture = !isCurrent && !isPast;

                    return (
                      <div key={i} className={`relative pl-10 transition-all ${isFuture ? 'opacity-50' : ''}`}>
                        {/* Dot */}
                        <div className={`absolute left-0 top-1 w-9 h-9 rounded-full border-2 flex items-center justify-center text-sm font-black
                          ${isCurrent ? 'bg-[#e8b84b] border-[#e8b84b] text-[#0a0c10]' : isPast ? 'bg-green-500/20 border-green-500/50 text-green-400' : 'bg-[#161b26] border-white/15 text-[#f0ede8]/30'}`}>
                          {isPast ? '✓' : isCurrent ? '→' : `${i + 1}`}
                        </div>

                        {/* Card */}
                        <div className={`rounded-2xl p-4 border ${isCurrent ? 'bg-[#e8b84b]/8 border-[#e8b84b]/30' : isPast ? 'bg-green-500/5 border-green-500/15' : 'bg-[#161b26] border-white/5'}`}>
                          {/* Header */}
                          <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                            <div className="min-w-0 flex-1">
                              <p className={`break-words text-sm font-bold leading-snug ${isCurrent ? 'text-[#e8b84b]' : isPast ? 'text-green-400' : 'text-[#f0ede8]/50'}`}>
                                {step.title}
                              </p>
                              {isCurrent && (
                                <span className="mt-1 inline-flex w-fit whitespace-nowrap rounded-full bg-[#e8b84b] px-2 py-0.5 text-[8px] font-black leading-none text-[#0a0c10]">
                                  BẠN ĐANG Ở ĐÂY
                                </span>
                              )}
                              <p className="text-[10px] text-[#f0ede8]/40 mt-0.5">{step.duration}</p>
                            </div>
                            <span className={`self-start max-w-full text-left text-sm font-black leading-snug break-normal sm:w-36 sm:shrink-0 sm:text-right ${isCurrent ? 'text-[#e8b84b]' : isPast ? 'text-green-400' : 'text-[#f0ede8]/30'}`}>
                              {step.salary}
                            </span>
                          </div>

                          {/* Unlock conditions */}
                          <div className="space-y-1.5 mb-3">
                            {step.unlock.map((u, j) => (
                              <div key={j} className="flex gap-2 items-start">
                                <span className={`text-[10px] mt-0.5 shrink-0 ${isCurrent ? 'text-[#e8b84b]' : isPast ? 'text-green-400' : 'text-[#f0ede8]/25'}`}>
                                  {isPast ? '✓' : '▸'}
                                </span>
                                <p className={`text-[11px] leading-relaxed ${isCurrent ? 'text-[#f0ede8]/80' : isPast ? 'text-[#f0ede8]/50 line-through' : 'text-[#f0ede8]/35'}`}>
                                  {u}
                                </p>
                              </div>
                            ))}
                          </div>

                          {/* Warning */}
                          {step.warning && (isCurrent || (!isPast && i === alignedCareerLadder.findIndex(s => s.band === reportCurrentBand) + 1)) && (
                            <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl px-3 py-2">
                              <p className="text-[10px] text-orange-300 leading-relaxed">⚠️ {step.warning}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Chương 3 — Đàm phán lương — KỊCH BẢN THEO NGÀNH */}
        {!isOwner && (
          <div className="mb-10 pt-8 border-t border-white/8">
            <h2 className="text-lg font-bold text-[#f0ede8] mb-2 flex items-center gap-2">
              <span className="text-[#e8b84b]">03</span>
              <span>Nói gì khi ngồi vào bàn đàm phán</span>
            </h2>
            <p className="text-sm text-[#f0ede8]/50 mb-5">Kịch bản viết riêng cho <strong className="text-[#f0ede8]">{job}</strong> · Copy nguyên văn</p>

            {(() => {
              // Lấy industry key để match đúng script
              const entry = detectJobGroup(job);
              const industryKey = Object.entries(require('@/lib/careerCompassData').CAREER_COMPASS)
                .find(([, v]) => (v as any).jobGroup === entry.jobGroup)?.[0] || 'FALLBACK';
              const script = getRoleAwareNegotiationScript(job, industryKey, reportCurrentBand, dbData?.industry);
              const vars = {
                bandRange: reportBandRange,
                nextBandMin: targetSalaryFmt,
                salary: compass.salaryFmt,
                salaryGap: targetGapFmt,
              };

              return (
                <div className="space-y-5">
                  {/* Kịch bản phỏng vấn */}
                  <div>
                    <p className="text-xs font-bold text-[#f0ede8]/50 uppercase tracking-wider mb-2">🎯 {isExecutiveRole ? 'Khi trao đổi mandate mới' : 'Khi phỏng vấn công ty mới'}</p>
                    <div className="bg-[#161b26] rounded-2xl p-4 text-sm text-[#f0ede8]/80 leading-relaxed italic" style={{ borderLeftWidth: '3px', borderLeftColor: '#e8b84b', borderLeftStyle: 'solid' }}>
                      "{fillScript(script.interview, vars)}"
                    </div>
                  </div>

                  {/* Kịch bản neo package */}
                  <div>
                    <p className="text-xs font-bold text-[#f0ede8]/50 uppercase tracking-wider mb-2">💰 {isExecutiveRole ? 'Câu neo compensation package với owner/board' : 'Khi xin tăng lương với sếp'}</p>
                    <div className="bg-[#161b26] rounded-2xl p-4 text-sm text-[#f0ede8]/80 leading-relaxed italic" style={{ borderLeftWidth: '3px', borderLeftColor: '#e8b84b', borderLeftStyle: 'solid' }}>
                      "{fillScript(script.raise, vars)}"
                    </div>
                  </div>

                  {/* Mẹo đặc thù ngành */}
                  <div className="bg-[#e8b84b]/8 border border-[#e8b84b]/25 rounded-2xl p-4">
                    <p className="text-[10px] font-mono text-[#e8b84b] uppercase tracking-wider mb-1.5">💡 Mẹo đặc thù ngành {compass.jobGroup}</p>
                    <p className="text-sm text-[#f0ede8]/85 leading-relaxed">{script.tip}</p>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* Chương 4 — Cộng đồng */}
        <div className="pt-8 border-t border-white/8">
          <h2 className="text-lg font-bold text-[#f0ede8] mb-5 flex items-center gap-2">
            <span className="text-[#e8b84b]">04</span>
            <span>Sau La Bàn — có checklist AI để thực thi</span>
          </h2>

          <div className="mb-6 rounded-2xl border border-[#8b5cf6]/35 bg-[#8b5cf6]/10 p-4">
            <p className="text-[10px] font-mono font-black uppercase tracking-widest text-[#c4b5fd]">Bạn đã mở báo cáo 29K</p>
            <div className="mt-3 flex items-end justify-between gap-3">
              <div>
                <p className="text-base font-black text-[#f0ede8]">Bước còn lại: hồ sơ hành động 79K</p>
                <p className="mt-1 text-[11px] leading-relaxed text-[#f0ede8]/60">Bạn đã có mốc lương đúng. Phần còn thiếu là bằng chứng để người khác tin bạn xứng đáng với mốc đó.</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[9px] font-mono font-black uppercase tracking-wider text-[#f0ede8]/45">Lộ trình</p>
                <p className="text-2xl font-black text-[#8b5cf6]">79K</p>
              </div>
            </div>
          </div>

          {/* ── CTA Roadmap 79k — nổi bật nhất ── */}
          <div className="bg-gradient-to-br from-[#e8b84b]/15 to-[#0f1219] border-2 border-[#e8b84b]/40 rounded-2xl p-5 mb-6"
            style={{ boxShadow: '0 0 24px rgba(232,184,75,0.12)' }}>
            <div className="mb-4 rounded-2xl border border-[#8b5cf6]/25 bg-[#8b5cf6]/10 p-4">
              <p className="text-[10px] font-mono font-black uppercase tracking-widest text-[#c4b5fd]">29k cho bạn mốc cần tới. 79k biến mốc đó thành việc cần làm từng tuần.</p>
              <h3 className="mt-1 text-base font-black leading-tight text-[#f0ede8]">{isExecutiveRole ? '79k tạo checklist mandate 3-6 tháng: scope cần mở, bằng chứng cần lưu, câu neo package cần nói' : '79k tạo checklist tăng lương 3-6 tháng: việc cần làm, bằng chứng cần lưu, câu deal lương cần nói'}</h3>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {[
                  'Tháng 1-2: dựng bằng chứng',
                  isExecutiveRole ? '50%: board/owner update' : '50%: review thử',
                  isExecutiveRole ? '100%: package/mandate' : '100%: deal/apply',
                ].map(item => (
                  <span key={item} className="rounded-full border border-white/8 bg-[#0f1219] px-2.5 py-1 text-[9px] font-black text-[#e8b84b]">
                    {item}
                  </span>
                ))}
              </div>
            </div>
            <div className="flex items-start justify-between mb-3">
              <div>
                <span className="text-[9px] bg-red-600 text-white font-black px-2 py-0.5 rounded-full uppercase">Mới</span>
                <h3 className="text-base font-black text-[#f0ede8] mt-1.5">🗺️ {isExecutiveRole ? 'Tạo checklist mandate bằng AI cá nhân hóa' : 'Tạo checklist tăng lương bằng AI cá nhân hóa'}</h3>
                <p className="text-[11px] text-[#f0ede8]/55 mt-0.5">{isExecutiveRole ? '29K là chẩn đoán: scope đang được thị trường định giá thế nào. 79K là kế hoạch hành động: tuần này mở mandate gì, lưu bằng chứng gì, nói câu nào với owner/board.' : '29K là chẩn đoán: bạn đang ở đâu và nên neo mốc nào. 79K là kế hoạch điều trị: tuần này làm gì, lưu bằng chứng gì, nói câu nào khi review lương.'}</p>
                <p className="mt-1.5 text-[10px] leading-relaxed text-[#f0ede8]/38">AI tạo checklist trên bộ quy tắc nghề nghiệp Top Lương; không phải tư vấn 1-1 bởi chuyên gia người thật.</p>
              </div>
              <div className="text-right shrink-0 ml-3">
                <p className="text-xl font-black text-[#e8b84b]">79k</p>
                <p className="text-[9px] text-[#f0ede8]/30 line-through">149k</p>
              </div>
            </div>
            <div className="space-y-1.5 mb-4">
              {[
                `Bám đúng La Bàn: từ ${compass.salaryFmt}/tháng tới ${targetSalaryFmt}/tháng`,
                'Việc cần làm từng tuần: task nhỏ, cụ thể, có đầu ra nhìn thấy được',
                'Bằng chứng cần lưu: KPI trước/sau, file/link, feedback, ảnh chụp hoặc log kết quả',
                isExecutiveRole ? 'Câu neo compensation package: nói theo scope, mandate, bonus/equity và strategic outcome' : 'Câu deal/review lương: nói theo dữ liệu thị trường và scope thật, không nói chung chung',
                isExecutiveRole ? 'Checkpoint 50% và 100%: biết lúc nào update owner/board, lúc nào chốt package hoặc mandate lớn hơn' : 'Checkpoint 50% và 100%: biết lúc nào review thử, lúc nào deal full hoặc apply band cao hơn',
              ].map((item, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <span className="text-[#e8b84b] text-xs mt-0.5 shrink-0">✓</span>
                  <p className="text-[11px] text-[#f0ede8]/70">{item}</p>
                </div>
              ))}
            </div>
            <div className="mb-4 rounded-2xl border border-[#22c55e]/25 bg-[#22c55e]/8 p-3.5">
              <p className="text-[10px] font-mono font-black uppercase tracking-widest text-[#22c55e]">Khi hoàn thành, bạn không còn là phiên bản cũ</p>
              <p className="mt-2 text-[11px] leading-relaxed text-[#f0ede8]/72">
                {isExecutiveRole ? 'Không hứa phép màu. Cam kết giúp bạn đóng gói scope điều hành bằng chứng: P&L/revenue result, operating dashboard, decision log, board/owner update và cơ sở neo compensation package.' : 'Không hứa phép màu. Cam kết đưa bạn lên một level có bằng chứng: skill rõ hơn, output thật hơn, KPI sắc hơn, đủ hồ sơ để xin review lương hoặc apply band cao hơn.'}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[
                  'Skill map đã mở',
                  'Evidence log có file/link',
                  isExecutiveRole ? 'Script package/mandate' : 'Script review lương',
                  'Chứng nhận năng lực VSPI',
                ].map(item => (
                  <div key={item} className="rounded-xl border border-white/8 bg-[#0f1219]/80 px-2.5 py-2 text-[10px] font-bold leading-tight text-[#f0ede8]/75">
                    ✓ {item}
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] font-black leading-relaxed text-[#f0c040]">
                {isExecutiveRole ? 'Bạn không tăng package vì title cao. Bạn tăng package khi hồ sơ chứng minh scope, mandate và kết quả chiến lược lớn hơn.' : 'Bạn không tăng lương vì nói mình xứng đáng. Bạn tăng lương khi hồ sơ chứng minh bạn đã ở level cao hơn.'}
              </p>
            </div>
            <a href={roadmapHref}
              onClick={() => { saveRoadmapDraft(); trackEvent('roadmap_cta_clicked'); }}
              className="block w-full bg-[#e8b84b] text-[#0a0c10] font-black py-3.5 rounded-xl text-sm text-center hover:-translate-y-0.5 transition-all">
              Tạo checklist tăng lương 79K →
            </a>
          </div>
          <p className="text-sm text-[#f0ede8]/65 leading-relaxed mb-6">
            Thông tin thị trường chỉ là bước đầu. Những người tăng lương nhanh nhất không phải người giỏi nhất — họ là người có đúng mạng lưới, đúng thông tin, đúng thời điểm.
          </p>
          <div className="border border-[#e8b84b]/30 p-6 rounded-3xl text-center bg-[#161b26] mx-auto max-w-sm mb-8">
            <p className="text-sm font-bold text-[#f0ede8] mb-1">Tham gia VSPI Community</p>
            <p className="text-[11px] text-[#f0ede8]/45 mb-4">Group kín · Chia sẻ cơ hội · Hỗ trợ đàm phán lương</p>
            <div className="bg-[#0f1219] p-3 rounded-2xl inline-block mb-3 border border-white/10">
              <div className="bg-white p-1.5 rounded-xl">
                <QRCode value="https://zalo.me/g/kdiqgls4dcpsonhkrnyn" size={120} />
              </div>
            </div>
            <p className="text-sm text-[#f0ede8]/60">Zalo: <strong className="text-[#e8b84b]">0915.662.876</strong></p>
          </div>
          <div className="text-right pt-6 border-t border-white/8">
            <p className="text-xs italic text-[#f0ede8]/35 mb-1">Ký tên,</p>
            <p className="text-xl font-black text-[#f0ede8] mb-0.5" style={{ fontFamily: 'Georgia, serif' }}>Nguyễn Trọng Văn</p>
            <p className="text-xs font-mono text-[#e8b84b]">Founder · VSPI Vietnam</p>
          </div>
        </div>
      </div>
    </div>
  );
}
