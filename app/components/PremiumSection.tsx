"use client";

/**
 * PremiumSection — lazy-loaded chỉ khi isPremiumUnlocked === true.
 * Tách ra để giảm bundle size cho user dùng bản miễn phí.
 * Import bằng React.lazy() trong TopPercentScanner.tsx.
 */

import React, { useState } from 'react';
import QRCode from 'react-qr-code';
import { getCareerCompassContext, type CareerCompassContext } from '@/lib/careerCompassEngine';
import { getNegotiationScript, fillScript } from '@/lib/negotiationScripts';
import { detectJobGroup } from '@/lib/careerCompassEngine';
import { buildJobJumpMap } from '@/lib/jobJumpMap';

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
  { id: 'ai',      label: 'Năng lực dùng công cụ năng suất hiện đại',  boost: 0.20, pctBoost: 22 },
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

function JobJumpMapPremium({ job, salary, percent }: { job: string; salary: number; percent: number }) {
  const map = buildJobJumpMap(job, salary, percent);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-black text-[#e8b84b] uppercase tracking-widest mb-1">Hướng nhảy việc tăng lương</p>
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
            Insight Độc Bản
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
          ⚡ <strong>Nói thẳng:</strong> Nếu bạn đang là "Top 10% ở SME" — mức lương đó có thể chỉ tương đương <strong>Top 80%</strong> ở nhóm MNC. Đổi tier công ty có thể tăng thu nhập <strong>2x</strong> mà không cần thêm năm kinh nghiệm.
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
    { id: 'jump',  icon: '🧭', label: 'Job Map' },
    { id: 'tier',  icon: '🏢', label: 'Tier Cty'  },
    { id: 'cert',  icon: '📜', label: 'VSPI Cert'  },
  ];
  const isOwner = /chủ|kinh doanh|tự do|founder|owner/i.test(job);
  const compass: CareerCompassContext = getCareerCompassContext(job, salary, percent);
  const verifyUrl = `https://topluong.com/verify?id=${vspiId}&job=${encodeURIComponent(job)}&pct=${percent}&date=${encodeURIComponent(TODAY)}`;
  const roadmapHref = `/roadmap?new=1&job=${encodeURIComponent(job)}&salary=${salary}&duration=6`;

  return (
    <div className="space-y-6">

      {/* ── Expert Insight Box — đầu trang, nổi bật nhất ── */}
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
          {tab === 'jump' && <JobJumpMapPremium job={job} salary={salary} percent={percent} />}
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
      <div className="bg-[#0f1219] rounded-[2rem] p-7 md:p-10 shadow-2xl border border-white/10 font-sans leading-relaxed">

        {/* Header */}
        <div className="text-center pb-8 border-b border-white/10 mb-8">
          <p className="text-[10px] font-mono text-[#e8b84b]/60 uppercase tracking-[0.3em] mb-2">Báo cáo cá nhân · {TODAY}</p>
          <h1 className="text-2xl md:text-3xl font-black text-[#f0ede8] mb-2 leading-tight">
            Bức tranh thật về<br />
            <span className="text-[#e8b84b]">vị trí của bạn trên thị trường</span>
          </h1>
          <p className="text-sm text-[#f0ede8]/50">{job} · Top {percent}% · {compass.salaryFmt}/tháng</p>
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
              <p className="text-2xl font-black text-[#e8b84b]">Top {percent}%</p>
              <p className="text-[10px] text-[#f0ede8]/40 mt-1">trong {compass.jobGroup}</p>
            </div>
            <div className="bg-[#161b26] rounded-2xl p-4 text-center border border-white/5">
              <p className="text-[10px] text-[#f0ede8]/40 mb-1">Để lên band tiếp theo</p>
              <p className="text-2xl font-black text-green-400">+{compass.salaryGapFmt}</p>
              <p className="text-[10px] text-[#f0ede8]/40 mt-1">mỗi tháng</p>
            </div>
          </div>

          <p className="text-[#f0ede8]/80 text-sm leading-relaxed mb-4">
            Với <strong className="text-[#f0ede8]">{compass.salaryFmt}/tháng</strong>, bạn đang ở nhóm <strong className="text-[#e8b84b]">{compass.bandLabel}</strong>. Nghe có vẻ ổn — nhưng đây chính xác là cái bẫy mà hầu hết mọi người không nhận ra cho đến khi đã mất 3–5 năm.
          </p>

          {/* Pain point — viết như người bạn nói chuyện */}
          <div className="bg-[#161b26] border-l-4 border-red-400 rounded-r-2xl p-5 mb-5">
            <p className="text-red-300 text-xs font-bold uppercase tracking-wider mb-2">Điều không ai nói thẳng với bạn</p>
            <p className="text-[#f0ede8]/85 text-sm leading-relaxed">{compass.painPoint}</p>
          </div>

          <p className="text-[#f0ede8]/65 text-sm leading-relaxed">
            Khoảng cách từ chỗ bạn đang đứng đến band tiếp theo là <strong className="text-[#e8b84b]">{compass.salaryGapFmt}/tháng</strong> — tương đương <strong className="text-[#e8b84b]">{(compass.salaryGap * 12).toLocaleString('vi-VN')}đ/năm</strong>. Không phải con số trên trời. Chương 2 sẽ chỉ ra đúng 1 việc bạn cần làm.
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
          {compass.careerLadder.length > 0 && (
            <div className="mt-6">
              <p className="text-[10px] font-mono text-[#f0ede8]/40 uppercase tracking-wider mb-4">🗺️ Lộ trình sự nghiệp — từng giai đoạn cụ thể</p>
              <div className="relative">
                {/* Vertical line */}
                <div className="absolute left-[18px] top-0 bottom-0 w-px bg-white/10" />

                <div className="space-y-4">
                  {compass.careerLadder.map((step, i) => {
                    const isCurrent = step.band === compass.band;
                    const isPast = ['entry','mid','senior','lead','executive'].indexOf(step.band) < ['entry','mid','senior','lead','executive'].indexOf(compass.band);
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
                          <div className="mb-3 flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className={`text-sm font-bold leading-snug ${isCurrent ? 'text-[#e8b84b]' : isPast ? 'text-green-400' : 'text-[#f0ede8]/50'}`}>
                                {step.title}
                              </p>
                              {isCurrent && (
                                <span className="mt-1 inline-flex w-fit whitespace-nowrap rounded-full bg-[#e8b84b] px-2 py-0.5 text-[8px] font-black leading-none text-[#0a0c10]">
                                  BẠN ĐANG Ở ĐÂY
                                </span>
                              )}
                              <p className="text-[10px] text-[#f0ede8]/40 mt-0.5">{step.duration}</p>
                            </div>
                            <span className={`shrink-0 whitespace-nowrap text-right text-sm font-black leading-snug ${isCurrent ? 'text-[#e8b84b]' : isPast ? 'text-green-400' : 'text-[#f0ede8]/30'}`}>
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
                          {step.warning && (isCurrent || (!isPast && i === compass.careerLadder.findIndex(s => s.band === compass.band) + 1)) && (
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
            <p className="text-sm text-[#f0ede8]/50 mb-5">Kịch bản viết riêng cho ngành <strong className="text-[#f0ede8]">{compass.jobGroup}</strong> · Copy nguyên văn</p>

            {(() => {
              // Lấy industry key để match đúng script
              const entry = detectJobGroup(job);
              const industryKey = Object.entries(require('@/lib/careerCompassData').CAREER_COMPASS)
                .find(([, v]) => (v as any).jobGroup === entry.jobGroup)?.[0] || 'FALLBACK';
              const script = getNegotiationScript(industryKey, compass.band);
              const vars = {
                bandRange: compass.currentBandRange,
                nextBandMin: compass.nextBandMinFmt,
                salary: compass.salaryFmt,
                salaryGap: compass.salaryGapFmt,
              };

              return (
                <div className="space-y-5">
                  {/* Kịch bản phỏng vấn */}
                  <div>
                    <p className="text-xs font-bold text-[#f0ede8]/50 uppercase tracking-wider mb-2">🎯 Khi phỏng vấn công ty mới</p>
                    <div className="bg-[#161b26] rounded-2xl p-4 text-sm text-[#f0ede8]/80 leading-relaxed italic" style={{ borderLeftWidth: '3px', borderLeftColor: '#e8b84b', borderLeftStyle: 'solid' }}>
                      "{fillScript(script.interview, vars)}"
                    </div>
                  </div>

                  {/* Kịch bản xin tăng lương */}
                  <div>
                    <p className="text-xs font-bold text-[#f0ede8]/50 uppercase tracking-wider mb-2">💰 Khi xin tăng lương với sếp</p>
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
            <span>Bước tiếp theo — không đi một mình</span>
          </h2>

          {/* ── CTA Roadmap 79k — nổi bật nhất ── */}
          <div className="bg-gradient-to-br from-[#e8b84b]/15 to-[#0f1219] border-2 border-[#e8b84b]/40 rounded-2xl p-5 mb-6"
            style={{ boxShadow: '0 0 24px rgba(232,184,75,0.12)' }}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <span className="text-[9px] bg-red-600 text-white font-black px-2 py-0.5 rounded-full uppercase">Mới</span>
                <h3 className="text-base font-black text-[#f0ede8] mt-1.5">🗺️ Lộ trình tăng lương cá nhân</h3>
                <p className="text-[11px] text-[#f0ede8]/55 mt-0.5">Chuyên gia thiết kế riêng · Tick task từng tuần · Đồng hành đến khi lên lương</p>
              </div>
              <div className="text-right shrink-0 ml-3">
                <p className="text-xl font-black text-[#e8b84b]">79k</p>
                <p className="text-[9px] text-[#f0ede8]/30 line-through">149k</p>
              </div>
            </div>
            <div className="space-y-1.5 mb-4">
              {['Lộ trình 3-6 tháng theo đúng ngành của bạn', 'Chia nhỏ từng task cụ thể mỗi tuần', 'Tick task → tracking tiến độ → biết khi nào deal lương'].map((item, i) => (
                <div key={i} className="flex gap-2 items-start">
                  <span className="text-[#e8b84b] text-xs mt-0.5 shrink-0">✓</span>
                  <p className="text-[11px] text-[#f0ede8]/70">{item}</p>
                </div>
              ))}
            </div>
            <a href={roadmapHref}
              className="block w-full bg-[#e8b84b] text-[#0a0c10] font-black py-3.5 rounded-xl text-sm text-center hover:-translate-y-0.5 transition-all">
              Tạo lộ trình của tôi →
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
