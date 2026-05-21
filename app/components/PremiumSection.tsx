"use client";

/**
 * PremiumSection — lazy-loaded chỉ khi isPremiumUnlocked === true.
 * Tách ra để giảm bundle size cho user dùng bản miễn phí.
 * Import bằng React.lazy() trong TopPercentScanner.tsx.
 */

import React, { useState } from 'react';
import QRCode from 'react-qr-code';
import { getCareerCompassContext, type CareerCompassContext } from '@/lib/careerCompassEngine';

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
}

const TODAY = new Date().toLocaleDateString('vi-VN', {
  day: '2-digit', month: '2-digit', year: 'numeric',
});

const SKILLS = [
  { id: 'english', label: 'Tiếng Anh chuyên ngành B2+', boost: 0.12, pctBoost: 12 },
  { id: 'ai',      label: 'Ứng dụng AI vào quy trình',  boost: 0.20, pctBoost: 22 },
  { id: 'lead',    label: 'Quản lý nhóm / Team Lead',   boost: 0.22, pctBoost: 18 },
  { id: 'cert',    label: 'Chứng chỉ chuyên ngành quốc tế', boost: 0.10, pctBoost: 8 },
];

const TIERS = [
  { name: 'Startup / SME',               mul: 1.00, color: '#94a3b8', badge: '🏠' },
  { name: 'Công ty nội địa lớn',          mul: 1.28, color: '#60a5fa', badge: '🏢' },
  { name: 'FDI / Doanh nghiệp nước ngoài', mul: 1.60, color: '#34d399', badge: '🌏' },
  { name: 'MNC / Tập đoàn đa quốc gia',   mul: 2.05, color: '#fbbf24', badge: '🏆' },
];

const RADIUS = 60;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const fmtM = (n: number | null | undefined) => n ? `${(n / 1_000_000).toFixed(1)}M` : '?M';
const getRingColor = (p: number) =>
  p <= 5 ? '#FFD700' : p <= 10 ? '#00E676' : p <= 20 ? '#40C4FF' : p <= 50 ? '#FF9100' : '#FF5252';

// ── AI Insight Box ────────────────────────────────────────────────────────────
function AiInsightBox({ text }: { text: string }) {
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
          🤖
        </div>
        <div>
          <p className="text-[11px] font-mono font-black text-[#e8b84b] uppercase tracking-widest leading-none">
            AI Insight Độc Bản
          </p>
          <p className="text-[10px] text-[#f0ede8]/40 mt-0.5">Dành riêng cho bạn · Powered by Gemini</p>
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
      <p className="text-sm text-[#f0ede8]/85 leading-relaxed font-sans">{text}</p>

      {/* Footer note */}
      <p className="text-[9px] font-mono text-[#f0ede8]/25 mt-4">
        Phân tích được sinh tự động · Không lưu trữ · Chỉ hiển thị 1 lần
      </p>
    </div>
  );
}

// ── Salary Simulator ──────────────────────────────────────────────────────────
function SalarySimulator({ currentPercent, dbData }: { currentPercent: number; dbData: SalaryData | null }) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const base = dbData?.top_50 ?? 15_000_000;
  const toggle = (id: string) => setChecked(p => ({ ...p, [id]: !p[id] }));
  const selected = SKILLS.filter(s => checked[s.id]);
  const salaryBoost = selected.reduce((a, s) => a + s.boost, 0);
  const pctBoost    = selected.reduce((a, s) => a + s.pctBoost, 0);
  const simSalary   = Math.round(base * (1 + salaryBoost));
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

// ── Company Tier Card ─────────────────────────────────────────────────────────
function CompanyTierCard({ job, dbData }: { job: string; dbData: SalaryData | null }) {
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
                {i === 3 && <><strong className="text-blue-700">Nhóm trả cao nhất thị trường.</strong> Yêu cầu: tiếng Anh C1+, chứng chỉ quốc tế, tư duy hệ thống.</>}
              </div>
            )}
          </button>
        );
      })}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
        <p className="text-[11px] text-amber-800 leading-relaxed">
          ⚡ <strong>Tát thức tỉnh:</strong> Nếu bạn đang là "Top 10% ở SME" — mức lương đó chỉ xếp <strong>đáy Top 80%</strong> ở nhóm MNC. Nhảy tier công ty có thể tăng thu nhập <strong>2x</strong> mà không cần thêm năm kinh nghiệm.
        </p>
      </div>
    </div>
  );
}

// ── Main PremiumSection export ────────────────────────────────────────────────
export default function PremiumSection({
  fullName, job, percent, lostMoney, dbData, vspiId, salary, aiAnalysis,
}: PremiumSectionProps) {
  const [tab, setTab] = useState('sim');
  const tabs = [
    { id: 'sim',   icon: '🎮', label: 'Simulator' },
    { id: 'tier',  icon: '🏢', label: 'Tier Cty'  },
    { id: 'cert',  icon: '📜', label: 'VSPI Cert'  },
  ];
  const isOwner = /chủ|kinh doanh|tự do|founder|owner/i.test(job);
  const compass: CareerCompassContext = getCareerCompassContext(job, salary, percent);
  const verifyUrl = `https://top-percent-scanner.vercel.app/verify?id=${vspiId}&job=${encodeURIComponent(job)}&pct=${percent}&date=${encodeURIComponent(TODAY)}`;

  return (
    <div className="space-y-6">

      {/* ── AI Insight Box — đầu trang, nổi bật nhất ── */}
      {aiAnalysis && <AiInsightBox text={aiAnalysis} />}

      {/* ── Interactive Tools ── */}
      <div className="bg-[#0f1219] rounded-[2rem] overflow-hidden shadow-2xl border border-white/10">
        <div className="bg-[#161b26] p-5 text-[#f0ede8] border-b border-[#e8b84b]/20">
          <span className="text-[10px] bg-[#e8b84b]/10 border border-[#e8b84b]/30 text-[#e8b84b] font-mono font-black px-2 py-0.5 rounded-full">✓ VSPI PREMIUM</span>
          <h3 className="text-base font-serif font-black mt-2 text-[#e8b84b]">Công cụ phân tích & Hành động</h3>
          <p className="text-[#f0ede8]/45 font-sans text-[10px]">{fullName} · {job} · Top {percent}%</p>
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
          {tab === 'sim'  && <SalarySimulator currentPercent={percent} dbData={dbData} />}
          {tab === 'tier' && <CompanyTierCard job={job} dbData={dbData} />}
          {tab === 'cert' && (
            <div id="vspi-certificate" className="bg-[#0f1219] border border-[#e8b84b]/30 rounded-3xl p-6 text-[#f0ede8] relative overflow-hidden">
              <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'repeating-linear-gradient(45deg,#fff 0,#fff 1px,transparent 0,transparent 50%)', backgroundSize: '12px 12px' }} />
              <div className="text-center relative z-10">
                <p className="text-[8px] font-mono font-black text-[#e8b84b] uppercase tracking-[0.4em] mb-0.5">Vietnam Salary Percentile Index</p>
                <p className="text-[8px] font-mono text-[#f0ede8]/45 uppercase tracking-widest mb-4">Chứng nhận vị trí thu nhập 2026</p>
                <div className="text-5xl mb-2">🏅</div>
                <p className="text-3xl font-serif font-black text-[#e8b84b]">TOP {percent}%</p>
                <p className="text-base font-mono font-bold text-[#e8b84b] mt-1">{fullName} · {job}</p>
                <p className="text-[10px] font-sans text-[#f0ede8]/45 mt-0.5">Thị trường Việt Nam · Q1/2026</p>
                <div className="border-t border-white/10 mt-5 pt-4 flex items-end justify-between">
                  <div className="text-left">
                    <p className="text-[8px] font-sans text-[#f0ede8]/45 mb-1">Mã xác thực (VSPI ID)</p>
                    <p className="text-[11px] font-mono font-black text-[#e8b84b] tracking-wider">{vspiId}</p>
                    <p className="text-[8px] font-sans text-[#f0ede8]/45 mt-1">Cấp ngày: {TODAY}</p>
                  </div>
                  <div className="bg-[#161b26] border border-white/10 p-1.5 rounded-xl">
                    <div className="bg-white p-1 rounded-lg">
                      <QRCode value={verifyUrl} size={64} />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Báo cáo La Bàn Nghề Nghiệp ── */}
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

        {/* Chương 1 */}
        <div>
          <h2 className="text-xl md:text-2xl font-serif font-semibold text-[#e8b84b] mb-6 border-l-4 border-[#e8b84b] pl-4 tracking-normal text-left">Chương 1: Xác thực vị trí thu nhập hiện tại</h2>
          <div className="bg-[#161b26] p-5 rounded-2xl border border-white/10 mb-6">
            <h3 className="font-sans font-semibold text-[#f0ede8] mb-3 tracking-normal">Hồ sơ xác thực năng lực (VSPI Certificate)</h3>
            <ul className="list-disc pl-5 space-y-2 text-[#f0ede8]/70 text-sm">
              <li><strong>Mã xác thực:</strong> <span className="text-[#e8b84b] font-mono">{vspiId}</span></li>
              <li><strong>Vị trí:</strong> Top <span className="text-[#e8b84b] font-mono">{percent}%</span> {compass.jobGroup} tại Việt Nam</li>
              <li><strong>Band lương:</strong> <span className="text-[#e8b84b]">{compass.bandLabel}</span></li>
              <li><strong>Thu nhập hiện tại:</strong> <span className="text-[#e8b84b] font-mono">{compass.salaryFmt}/tháng</span> · Dải chuẩn: <span className="text-[#e8b84b]">{compass.currentBandRange}/tháng</span></li>
              <li><strong>Ngày cấp:</strong> <span className="text-[#e8b84b] font-mono">{TODAY}</span></li>
            </ul>
          </div>
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 mb-4">
            <p className="text-red-300 font-bold text-sm mb-2">⚠️ Nỗi đau đặc thù của band này:</p>
            <p className="text-[#f0ede8]/80 text-sm leading-relaxed">{compass.painPoint}</p>
          </div>
          <p className="text-[#f0ede8]/70">
            Để lên band tiếp theo (<strong className="text-[#e8b84b]">từ {compass.nextBandMinFmt}/tháng</strong>), bạn cần thêm <strong className="text-[#e8b84b]">{compass.salaryGapFmt}/tháng</strong>. Con số này hoàn toàn có thể đạt được trong 12–18 tháng với đúng chiến lược.
          </p>
        </div>

        {/* Chương 2 */}
        <div className="pt-10 mt-10 border-t border-white/10">
          <h2 className="text-xl md:text-2xl font-serif font-semibold text-[#e8b84b] mb-6 border-l-4 border-[#e8b84b] pl-4 tracking-normal text-left">
            {isOwner ? 'Chương 2: Định hướng tối ưu hóa mô hình kinh doanh' : 'Chương 2: Phân tích khoảng trống kỹ năng & lộ trình 12 tháng'}
          </h2>
          <div className="bg-[#161b26] border border-[#e8b84b]/20 rounded-2xl p-4 mb-6">
            <p className="text-[10px] font-mono font-bold text-[#e8b84b] uppercase tracking-widest mb-2">💡 Insight thị trường ngành {compass.jobGroup}</p>
            <p className="text-sm text-[#f0ede8]/80 leading-relaxed">{compass.marketInsight}</p>
          </div>
          <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4 mb-6">
            <p className="text-[10px] font-mono font-bold text-green-400 uppercase tracking-widest mb-2">🚀 Cơ hội đang mở ra</p>
            <p className="text-sm text-[#f0ede8]/80 leading-relaxed">{compass.opportunity}</p>
          </div>
          <div className="bg-[#e8b84b]/10 border border-[#e8b84b]/30 rounded-2xl p-5">
            <p className="text-[11px] font-mono font-bold text-[#e8b84b] uppercase tracking-widest mb-2">🎯 Bước tiếp theo cụ thể cho bạn</p>
            <p className="text-sm text-[#f0ede8]/80 leading-relaxed">{compass.nextMilestone}</p>
          </div>
        </div>

        {/* Chương 3 — Đàm phán lương */}
        {!isOwner && (
          <div className="pt-10 mt-10 border-t border-white/10">
            <h2 className="text-xl md:text-2xl font-serif font-semibold text-[#e8b84b] mb-6 border-l-4 border-[#e8b84b] pl-4 tracking-normal text-left">Chương 3: Kịch bản đàm phán lương</h2>
            <div className="space-y-6">
              <div>
                <p className="font-bold text-[#f0ede8] mb-2">Kịch bản 1: Phỏng vấn tại công ty mới</p>
                <blockquote className="bg-[#161b26] border-l-2 border-[#e8b84b] p-5 rounded-r-2xl italic text-[#f0ede8]/70 text-sm leading-relaxed">
                  "Dựa trên Báo cáo VSPI 2026, mức lương chuẩn cho vị trí <strong className="not-italic text-[#f0ede8]">{job}</strong> ở band <strong className="not-italic text-[#f0ede8]">{compass.bandLabel}</strong> đang dao động <strong className="not-italic text-[#e8b84b]">{compass.currentBandRange}/tháng</strong>. Em kỳ vọng mức <strong className="not-italic text-[#e8b84b]">{compass.nextBandMinFmt}/tháng</strong> — tương ứng band tiếp theo."
                </blockquote>
              </div>
              <div>
                <p className="font-bold text-[#f0ede8] mb-2">Kịch bản 2: Xin tăng lương với Sếp hiện tại</p>
                <blockquote className="bg-[#161b26] border-l-2 border-[#e8b84b] p-5 rounded-r-2xl italic text-[#f0ede8]/70 text-sm leading-relaxed">
                  "Theo VSPI 2026, dải lương chuẩn vị trí {job} là <strong className="not-italic text-[#e8b84b]">{compass.currentBandRange}/tháng</strong>. Thu nhập hiện tại của em là <strong className="not-italic text-[#e8b84b]">{compass.salaryFmt}/tháng</strong>. Em đề xuất điều chỉnh lên <strong className="not-italic text-[#e8b84b]">{compass.nextBandMinFmt}/tháng</strong> — phù hợp với giá trị em đang tạo ra."
                </blockquote>
              </div>
            </div>
          </div>
        )}

        {/* Chương 4 — Cộng đồng */}
        <div className="pt-10 mt-10 border-t border-white/10">
          <h2 className="text-xl md:text-2xl font-serif font-semibold text-[#e8b84b] mb-6 border-l-4 border-[#e8b84b] pl-4 tracking-normal text-left">Chương 4: Kết nối cộng đồng & Mentorship</h2>
          <div className="border border-[#e8b84b]/40 p-8 rounded-3xl text-center bg-[#161b26] mx-auto max-w-lg mb-8">
            <h3 className="text-lg font-mono font-black text-[#e8b84b] mb-4 uppercase tracking-widest">Tham gia VSPI Community VIP</h3>
            <div className="bg-[#0f1219] p-4 rounded-2xl inline-block mb-4 border border-white/10">
              <div className="bg-white p-2 rounded-xl">
                <QRCode value="https://zalo.me/g/kdiqgls4dcpsonhkrnyn" size={140} />
              </div>
            </div>
            <p className="text-sm font-sans text-[#f0ede8]/70">Hotline/Zalo: <strong className="text-[#e8b84b] text-lg">0915.662.876</strong></p>
          </div>
          <div className="text-right pb-6 border-t border-white/10 pt-8">
            <p className="text-sm italic text-[#f0ede8]/45 mb-2">Ký tên,</p>
            <p className="text-2xl font-black text-[#f0ede8] mb-1" style={{ fontFamily: 'Georgia, serif' }}>Nguyễn Trọng Văn</p>
            <p className="text-sm font-mono text-[#e8b84b]">Founder · VSPI Vietnam</p>
          </div>
        </div>
      </div>
    </div>
  );
}
