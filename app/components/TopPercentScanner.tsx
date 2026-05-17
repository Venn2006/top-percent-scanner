"use client";

import React, { useState, useEffect, useRef, useMemo } from 'react';
import QRCode from 'react-qr-code';


interface SalaryData { industry?: string; job_title?: string; top_50: number; top_20: number | null; top_10: number | null; top_5: number | null; }
interface GapData { currentPays: string; topPays: string; roadmap: { month: string; action: string }[]; currentSkill: string; missingSkill: string; }
interface TeaserProps { fullName: string; job: string; percent: number; lostMoney: number; dbData: SalaryData | null; }
interface ComponentProps { fullName: string; job: string; percent: number; dbData: SalaryData | null; }
interface SimulatorProps { fullName: string; currentPercent: number; dbData: SalaryData | null; }
interface PaywallProps { vspiId: string; fullName: string; selectedJob: string; resultPercent: number; lostMoney: number; onUnlock: (fullData: SalaryData) => void; }
interface CertificateProps { fullName: string; job: string; percent: number; vspiId: string; }
interface EliteProps { fullName: string; job: string; percent: number; }
interface PremiumProps extends TeaserProps { vspiId: string; }

const RADIUS = 60;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const TODAY = new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });

const DATA_SOURCES = [
  { name: 'Adecco', label: 'Adecco Vietnam 2026', detail: '1,000+ chức danh · 12th Edition' },
  { name: 'ITviec', label: 'ITviec 2025–2026', detail: '1,839 chuyên gia IT khảo sát' },
  { name: 'Navigos', label: 'VietnamWorks / Navigos 2026', detail: '5.4M lượt/tháng · 60,000+ công ty' },
  { name: 'GSO', label: 'Tổng cục Thống kê (GSO)', detail: 'Lực lượng lao động 53.3M người' },
  { name: 'Talentnet', label: 'Talentnet–Mercer 2026', detail: 'Total Remuneration Survey Vietnam' },
  { name: 'NIC', label: 'NIC Global Salary Guide 2026', detail: '15 ngành · 8–10% tăng lương' },
];

const MARKET_STATS = [
  { value: '8.4M', unit: 'VNĐ', label: 'Thu nhập trung bình/tháng (GSO Q3/2025)' },
  { value: '80%', unit: '', label: 'Doanh nghiệp khó tìm ứng viên phù hợp' },
  { value: '+7.2%', unit: '', label: 'Tăng lương tối thiểu (NĐ 293/2025)' },
  { value: '45%', unit: '', label: 'Công ty mở rộng tuyển dụng 5–10%/2026' },
];

const SKILLS = [
  { id: 'english', label: 'Tiếng Anh chuyên ngành B2+', boost: 0.12, pctBoost: 12 },
  { id: 'ai', label: 'Ứng dụng AI vào quy trình', boost: 0.20, pctBoost: 22 },
  { id: 'lead', label: 'Quản lý nhóm / Team Lead', boost: 0.22, pctBoost: 18 },
  { id: 'cert', label: 'Chứng chỉ chuyên ngành quốc tế', boost: 0.10, pctBoost: 8 },
];

const TIERS = [
  { name: 'Startup / SME', mul: 1.00, color: '#94a3b8', badge: '🏠' },
  { name: 'Công ty nội địa lớn', mul: 1.28, color: '#60a5fa', badge: '🏢' },
  { name: 'FDI / Doanh nghiệp nước ngoài', mul: 1.60, color: '#34d399', badge: '🌏' },
  { name: 'MNC / Tập đoàn đa quốc gia', mul: 2.05, color: '#fbbf24', badge: '🏆' },
];

const getRingColor = (p: number) => p <= 5 ? '#FFD700' : p <= 10 ? '#00E676' : p <= 20 ? '#40C4FF' : p <= 50 ? '#FF9100' : '#FF5252';
const fmtM = (n: number | null | undefined) => n ? `${(n / 1_000_000).toFixed(1)}M` : '?M';
const genVSPIId = () => {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = 'VSPI-2026-';
  for (let i = 0; i < 4; i++) s += c[Math.floor(Math.random() * c.length)];
  s += '-';
  for (let i = 0; i < 4; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
};

const getGapData = (job: string, percent: number, dbData: SalaryData | null): GapData => {
  const j = job.toLowerCase();
  const top50 = dbData?.top_50 ?? 15_000_000;
  const top10 = dbData?.top_10 ?? top50 * 1.8;
  const base = {
    currentPays: fmtM(top50), topPays: fmtM(top10),
    roadmap: [
      { month: 'Tháng 1', action: 'Hoàn thành 1 khoá AI Tool thực hành (≤ 20h) — ưu tiên công cụ liên quan trực tiếp ngành.' },
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
    missingSkill: 'Scale content 5x bằng AI + báo cáo ROI chính xác theo số — kỹ năng tách biệt Top 20% vs 80% còn lại.',
    roadmap: [
      { month: 'Tháng 1', action: 'Thiết lập quy trình content với Claude/ChatGPT — tăng output không tăng giờ làm.' },
      { month: 'Tháng 2', action: 'Báo cáo kết quả A/B test + conversion rate theo số cụ thể lên cấp trên.' },
      { month: 'Tháng 3', action: 'Đề xuất tăng lương với dẫn chứng ROI đo được từ chiến dịch AI-assisted.' },
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
      { month: 'Tháng 1', action: 'Quay 5–10 video bài giảng ngắn (15–20 phút), dùng AI tóm tắt + tạo quiz.' },
      { month: 'Tháng 2', action: 'Đăng lên Edumall/Kyna/YouTube — đo lượng người xem và enrollment.' },
      { month: 'Tháng 3', action: 'Pitch với nhà trường: trở thành giáo viên phụ trách digital learning, yêu cầu phụ cấp.' },
    ]
  };
  return {
    ...base,
    currentSkill: 'Thực hiện công việc chuyên môn theo quy trình hiện tại, dựa vào kinh nghiệm tích luỹ.',
    missingSkill: 'Tự động hoá ≥ 1 quy trình thủ công bằng AI — tạo chỉ số "tiết kiệm X giờ/tuần" cụ thể để đàm phán.',
  };
};

/* ═══ TEASER ZONE ═══════════════════════════════════════════════════════════ */
function TeaserZone({ fullName, job, percent, lostMoney, dbData }: TeaserProps) {
  const top50 = dbData?.top_50 ?? null; const top20 = dbData?.top_20 ?? null;
  const top10 = dbData?.top_10 ?? null; const top5 = dbData?.top_5 ?? null;
  const recentUsers = [{ city: 'TP.HCM', ago: '3 phút trước' }, { city: 'Hà Nội', ago: '11 phút trước' }, { city: 'Đà Nẵng', ago: '28 phút trước' }, { city: 'Cần Thơ', ago: '1 giờ trước' }];
  const insightLines = percent === 5 ? ['Bạn đang Elite — nhưng Top 1% đang kéo xa bạn thêm mỗi quý.', 'Có 1 kỹ năng mà 94% Top 1% có, còn Top 5% chưa nắm.'] : percent === 10 ? [`Khoảng cách từ Top 10% lên Top 5% ngành ${job} chỉ là ${fmtM((top5 ?? 0) - (top10 ?? 0))}/tháng.`, '80% người vượt mốc này làm được trong 6 tháng với đúng chiến lược.'] : percent === 20 ? [`Top 10% ngành ${job} đang nhận thêm ${fmtM((top10 ?? 0) - (top20 ?? 0))}/tháng so với bạn.`, 'Khoảng cách này không đến từ kinh nghiệm — nó đến từ 1 kỹ năng cụ thể.'] : percent === 50 ? [`Median ngành ${job} là ${fmtM(top50)} — bạn đang đứng đúng ranh giới.`, 'Nhóm dưới median mất trung bình 2.3 năm để vượt qua nếu không có chiến lược.'] : [`Median ngành ${job} cao hơn lương bạn ${fmtM(top50)}/tháng.`, '72% người dưới median không biết mình bị undervalue cho đến khi thấy dữ liệu thị trường.'];
  return (
    <div className="space-y-3">
      {/* Partial benchmark */}
      <div className="bg-[#0f1219] rounded-3xl overflow-hidden shadow-sm border border-white/10">
        <div className="px-5 pt-5 pb-1">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[11px] font-mono font-bold text-[#f0ede8]/70 uppercase tracking-wider">📊 Phân phối lương — {job}</p>
            <span className="text-[9px] bg-[#161b26] text-[#e8b84b] font-mono font-bold px-2 py-0.5 rounded-full border border-white/10">Q1/2026</span>
          </div>
          {[{ label: 'Median (Top 50%)', val: top50, color: '#FF9100', w: '50%' }, { label: 'Top 20%', val: top20, color: '#40C4FF', w: '70%' }].map((r: any, i: number) => (
            <div key={i} className="flex items-center gap-3 py-2.5 border-b border-white/5">
              <div className="w-28 shrink-0"><p className="text-[10px] font-mono font-bold text-[#f0ede8]/45">{r.label}</p></div>
              <div className="flex-1 h-2 bg-[#161b26] rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: r.w, backgroundColor: r.color }} /></div>
              <p className="text-sm font-serif font-black text-[#f0ede8] w-14 text-right">{fmtM(r.val)}</p>
            </div>
          ))}
          <div className="relative">
            {[{ label: 'Top 10%', val: top10, color: '#00E676', w: '85%' }, { label: 'Top 5% 🏆', val: top5, color: '#FFD700', w: '100%' }].map((r: any, i: number) => (
              <div key={i} className="flex items-center gap-3 py-2.5 border-b border-white/5 blur-[5px] select-none pointer-events-none">
                <div className="w-28 shrink-0"><p className="text-[10px] font-mono font-bold text-[#f0ede8]/45">{r.label}</p></div>
                <div className="flex-1 h-2 bg-[#161b26] rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: r.w, backgroundColor: r.color }} /></div>
                <p className="text-sm font-serif font-black text-[#f0ede8] w-14 text-right">{fmtM(r.val)}</p>
              </div>
            ))}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-[#0f1219]/90 backdrop-blur-sm border border-white/20 rounded-xl px-4 py-2 flex items-center gap-2 shadow-sm">
                <span>🔒</span><p className="text-[11px] font-mono font-bold text-[#e8b84b]">Mở khóa để xem Top 10% & 5%</p>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-[#161b26] border-t border-white/10 px-5 py-3 flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getRingColor(percent) }} />
          <p className="text-[11px] font-sans text-[#f0ede8]/70">
            Vị trí của bạn: <strong className="text-[#f0ede8] font-mono">Top {percent}%</strong>
            {percent >= 50 ? <span className="text-red-400"> · thấp hơn median {fmtM(lostMoney / 12)}/tháng</span> : <span className="text-green-400"> · đã vượt median ✓</span>}
          </p>
        </div>
      </div>

      {/* Market trend */}
      <div className="bg-[#0f1219] rounded-3xl p-5 shadow-sm border border-white/10">
        <p className="text-[11px] font-mono font-bold text-[#f0ede8]/70 uppercase tracking-wider mb-3">📈 Tín hiệu thị trường 2026</p>
        {[
          { arrow: '↑', color: 'text-green-400', t: `Nhu cầu tuyển ngành ${job} đang tăng`, d: '45% doanh nghiệp mở rộng tuyển dụng 5–10% (Navigos 2026)' },
          { arrow: '↑', color: 'text-[#e8b84b]', t: 'Mặt bằng lương tăng 8–10% so với 2025', d: 'Đặc biệt mạnh ở mid–senior (NIC Global Salary Guide 2026)' },
          { arrow: '⚡', color: 'text-orange-400', t: '80% nhà tuyển dụng đang tranh nhau ứng viên giỏi', d: 'Đây là thời điểm tốt nhất trong 3 năm để đàm phán lương' },
        ].map((s: any, i: number) => (
          <div key={i} className="flex items-start gap-3 mb-3 last:mb-0">
            <span className={`text-lg leading-none mt-0.5 font-black ${s.color}`}>{s.arrow}</span>
            <div><p className="text-sm font-sans font-bold text-[#f0ede8]">{s.t}</p><p className="text-[11px] font-sans text-[#f0ede8]/45">{s.d}</p></div>
          </div>
        ))}
      </div>

      {/* Insight tease */}
      <div className="bg-[#161b26] border border-white/10 rounded-3xl p-5 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#e8b84b]/10 rounded-full blur-2xl pointer-events-none" />
        <p className="text-[10px] font-mono font-bold text-[#e8b84b] uppercase tracking-widest mb-3">💡 Insight chuyên sâu từ báo cáo</p>
        <div className="space-y-3">
          {insightLines.map((line, i) => (
            <div key={i} className="flex gap-2.5 items-start">
              <span className="text-[#e8b84b] text-xs mt-0.5 shrink-0">▸</span>
              <p className="text-sm font-sans text-[#f0ede8]/70 leading-relaxed">{line}</p>
            </div>
          ))}
          <div className="relative">
            <div className="flex gap-2.5 items-start blur-[6px] select-none pointer-events-none">
              <span className="text-[#e8b84b] text-xs mt-0.5 shrink-0">▸</span>
              <p className="text-sm font-sans text-[#f0ede8]/70 leading-relaxed">Người ở Top {Math.max(percent - 30, 5)}% ngành {job} tại TP.HCM thường có thêm 1 yếu tố X mà 90% người bỏ qua — không phải kinh nghiệm, không phải bằng cấp.</p>
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="bg-[#0f1219]/80 backdrop-blur-sm text-[#e8b84b] text-[10px] font-mono font-bold px-3 py-1.5 rounded-full border border-[#e8b84b]/30">🔒 Mở khóa để đọc</span>
            </div>
          </div>
        </div>
      </div>

      {/* Social proof */}
      <div className="bg-[#0f1219] rounded-3xl p-5 shadow-sm border border-white/10">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          <p className="text-[11px] font-mono font-bold text-[#f0ede8]/70 uppercase tracking-wider">Vừa mở khóa trong 60 phút qua</p>
        </div>
        {recentUsers.map((u: any, i: number) => (
          <div key={i} className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-[#161b26] border border-white/10 flex items-center justify-center text-[#e8b84b] text-[10px] font-serif font-black">{['N', 'T', 'L', 'M'][i]}</div>
              <p className="text-[11px] font-sans text-[#f0ede8]/70">Người dùng tại <strong className="text-[#f0ede8]">{u.city}</strong> — cùng ngành {job}</p>
            </div>
            <p className="text-[10px] font-mono text-[#f0ede8]/45 shrink-0">{u.ago}</p>
          </div>
        ))}
        <div className="mt-3 bg-[#161b26] border border-[#e8b84b]/20 rounded-xl p-3">
          <p className="text-[11px] font-sans text-[#f0ede8]/70 leading-relaxed italic">
            <strong>💬</strong> "Email mẫu trong báo cáo giúp mình xin tăng được <strong className="text-[#e8b84b]">3.5M/tháng</strong> sau 1 tuần gửi sếp. Có số liệu thị trường là khác hẳn." — Người dùng tại Hà Nội, Kế toán.
          </p>
        </div>
      </div>

      <div className="bg-red-500/10 border border-red-500/30 rounded-2xl px-5 py-3 flex items-center gap-3">
        <span className="text-xl shrink-0">⏳</span>
        <div>
          <p className="text-[11px] font-mono font-bold text-red-400">Giá 49k chỉ còn đến 30/06/2026</p>
          <p className="text-[10px] font-sans text-[#f0ede8]/45">Sau đó quay về 250,000đ · 287 người mở khóa tuần này</p>
        </div>
      </div>
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
          ⚡ <strong>Tát thức tỉnh:</strong> Nếu bạn đang là "Top 10% ở SME" — mức lương đó chỉ xếp <strong>đáy Top 80%</strong> ở nhóm MNC. Nhảy tier công ty có thể tăng thu nhập <strong>2x</strong> mà không cần thêm năm kinh nghiệm.
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
        {gap.roadmap.map((r: any, i: number) => (
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

/* ═══ AI ROLEPLAY ═══════════════════════════════════════════════════════════ */
function AIRoleplay({ fullName, job, percent, dbData }: ComponentProps) {
  const isOwner = /chủ|kinh doanh|tự do|founder|owner/i.test(job);

  const initialMessage = isOwner
    ? `[Chủ nhà nhíu mày nhìn bạn] "Cô/chú nghe nói cháu muốn bàn lại về hợp đồng thuê nhà? Tình hình dạo này buôn bán chậm lắm sao?"`
    : `[Sếp ngẩng đầu nhìn bạn qua kính] "Ừ, vào đi. Nghe bảo anh/chị muốn nói chuyện gì đó về... lương phải không?"`;

  const uiTitle = isOwner ? "🤖 Luyện tập đàm phán với AI Chủ nhà" : "🤖 Luyện tập đàm phán với AI Boss";
  const uiSubtitle = isOwner
    ? "Giả lập buổi thương lượng giảm 20% tiền mặt bằng mùa thấp điểm"
    : "Giả lập buổi xin tăng lương thật — sếp AI phản ứng như người thật";
  const uiHintText = isOwner
    ? `Thử: "Dạ lượng khách giảm 20%. Cháu muốn đề xuất hỗ trợ giảm 10% tiền nhà trong 6 tháng tới..."`
    : `Thử: "Theo báo cáo VSPI 2026, median ngành mình là ${fmtM(dbData?.top_50)} — em đang ở Top ${percent}%"`;
  const uiRoleName = isOwner ? "🏠 Chủ nhà" : "👔 Sếp";

  const [messages, setMessages] = useState<{ role: string, content: string }[]>([
    { role: 'assistant', content: initialMessage }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim(); setInput('');
    const newMsgs = [...messages, { role: 'user', content: userMsg }];
    setMessages(newMsgs); setLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isOwner,
          job,
          messages: newMsgs.map(m => ({ role: m.role, content: m.content }))
        })
      });
      const data = await res.json();

      let reply = '';
      if (data.error) {
        console.error(data.error);
        reply = isOwner ? "[Chủ nhà đang bận, cháu quay lại sau nhé...]" : "[Sếp đang bận họp đột xuất, nói chuyện sau nhé...]";
      } else {
        reply = data.content?.[0]?.text ?? (isOwner ? "Cháu trình bày rõ hơn xem nào, kế hoạch bù đắp rủi ro là gì?" : "Anh/chị nói cụ thể hơn về con số mang lại cho công ty đi?");
      }

      setMessages(p => [...p, { role: 'assistant', content: reply }]);
    } catch { setMessages(p => [...p, { role: 'assistant', content: '[Lỗi kết nối API — vui lòng thử lại]' }]); }
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
          {messages.map((m: any, i: number) => (
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
            className="flex-1 text-[12px] bg-white text-slate-900 border border-slate-300 placeholder-slate-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 rounded-xl px-3 py-2 outline-none transition-all" />
          <button onClick={send} disabled={loading} className="bg-blue-600 text-white text-[11px] font-bold px-3 py-2 rounded-xl disabled:opacity-50 hover:bg-blue-700 transition-all">Gửi</button>
        </div>
      </div>
      <button onClick={() => setMessages([{ role: 'assistant', content: initialMessage }])}
        className="w-full text-center text-[10px] text-slate-400 hover:text-red-500 transition-colors py-1">🔄 Reset — thử lại từ đầu</button>
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
    w.document.write(`<html><head><title>VSPI Evidence Brief</title>
      <style>body{font-family:Georgia,serif;margin:40px;color:#1e293b;line-height:1.7}h1{font-size:22px;font-weight:bold;margin-bottom:4px}table{width:100%;border-collapse:collapse;margin:20px 0}td,th{padding:10px 14px;border:1px solid #e2e8f0;font-size:13px}th{background:#f8fafc;font-weight:bold;text-align:left}.footer{margin-top:40px;font-size:10px;color:#94a3b8;border-top:1px solid #e2e8f0;padding-top:16px}@media print{body{margin:20px}}</style>
      </head><body>${content}</body></html>`);
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
        <p className="text-[11px] text-slate-600 leading-relaxed mb-4">
          Dựa trên tập dữ liệu tổng hợp từ <strong>1,839 mẫu định lượng</strong> của Navigos/VietnamWorks và Adecco Vietnam (2026), kết hợp dữ liệu lực lượng lao động từ Tổng cục Thống kê (n=53.3M), báo cáo này xác định vị trí thu nhập của ứng viên trong phân phối lương ngành <strong>{job}</strong> tại thị trường Việt Nam.
        </p>
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
        <p className="text-[10px] text-slate-500 leading-relaxed border-t border-slate-100 pt-3">
          <strong>Phương pháp:</strong> Dữ liệu được chuẩn hóa theo mô hình Normal Distribution, tổng hợp từ 6 nguồn báo cáo chính thống, cập nhật theo chu kỳ quý. VSPI (Vietnam Salary Percentile Index) là chỉ số phát triển độc lập dựa trên dữ liệu thứ cấp công khai.
        </p>
      </div>
      <button onClick={handlePrint} className="w-full bg-[#1e1b4b] text-white font-bold py-3.5 rounded-2xl text-sm hover:bg-[#312e81] transition-all flex items-center justify-center gap-2">
        🖨️ In PDF — Đặt lên bàn HR ngay
      </button>
    </div>
  );
}

/* ═══ VSPI CERTIFICATE ══════════════════════════════════════════════════════ */
function VSPICertificate({ fullName, job, percent, vspiId }: CertificateProps) {
  const verifyUrl = `https://YOUR-DOMAIN.vercel.app/verify?id=${vspiId}&job=${encodeURIComponent(job)}&pct=${percent}&date=${encodeURIComponent(TODAY)}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(verifyUrl)}&bgcolor=0f1219&color=e8b84b&qzone=1`;
  return (
    <div className="space-y-4">
      <div className="bg-[#0f1219] border border-[#e8b84b]/30 rounded-3xl p-6 text-[#f0ede8] relative overflow-hidden shadow-2xl shadow-[#e8b84b]/5">
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'repeating-linear-gradient(45deg,#fff 0,#fff 1px,transparent 0,transparent 50%)', backgroundSize: '12px 12px' }} />
        <div className="absolute top-3 left-3 w-6 h-6 border-l-2 border-t-2 border-[#e8b84b]/40 rounded-tl-lg" />
        <div className="absolute top-3 right-3 w-6 h-6 border-r-2 border-t-2 border-[#e8b84b]/40 rounded-tr-lg" />
        <div className="absolute bottom-3 left-3 w-6 h-6 border-l-2 border-b-2 border-[#e8b84b]/40 rounded-bl-lg" />
        <div className="absolute bottom-3 right-3 w-6 h-6 border-r-2 border-b-2 border-[#e8b84b]/40 rounded-br-lg" />
        <div className="text-center relative z-10">
          <p className="text-[8px] font-mono font-black text-[#e8b84b] uppercase tracking-[0.4em] mb-0.5">Vietnam Salary Percentile Index</p>
          <p className="text-[8px] font-mono text-[#f0ede8]/45 uppercase tracking-widest mb-4">Chứng nhận vị trí thu nhập 2026</p>
          <div className="text-5xl mb-2">🏅</div>
          <p className="text-3xl font-serif font-black text-[#e8b84b]">TOP {percent}%</p>
          <p className="text-base font-mono font-bold text-[#e8b84b] mt-1">{fullName} - {job} - Top {percent}%</p>
          <p className="text-[10px] font-sans text-[#f0ede8]/45 mt-0.5">Thị trường Việt Nam · Q1/2026</p>
          <div className="border-t border-white/10 mt-5 pt-4 flex items-end justify-between">
            <div className="text-left">
              <p className="text-[8px] font-sans text-[#f0ede8]/45 mb-1">Mã xác thực (VSPI ID)</p>
              <p className="text-[11px] font-mono font-black text-[#e8b84b] tracking-wider">{vspiId}</p>
              <p className="text-[8px] font-sans text-[#f0ede8]/45 mt-1">Cấp ngày: {TODAY}</p>
            </div>
            <div className="bg-[#161b26] border border-white/10 p-1.5 rounded-xl">
              <img src={qrUrl} alt="Verification QR" className="w-16 h-16 rounded-lg opacity-90" />
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
        {['Đính kèm email xin tăng lương + Evidence Brief (tab 📋) để tăng độ tin cậy', 'Khi HR hỏi "Số liệu lấy từ đâu?" — đưa VSPI ID để họ tự verify', 'Dùng khi negotiate với công ty mới để anchor mức lương kỳ vọng', 'Lưu lại — quét lại sau 3–6 tháng để track tiến độ của bạn'].map((s: any, i: number) => (
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
        <div><p className="text-[10px] font-mono font-bold text-[#e8b84b]">Tham gia VSPI Elite Community</p><p className="text-[10px] font-sans text-[#f0ede8]/70">Nhắn VSPI ELITE + VSPI ID vào Zalo: <strong className="text-[#e8b84b]">0909.xxx.xxx</strong></p></div>
      </div>
    </div>
  );
}

/* ═══ PREMIUM REPORT ════════════════════════════════════════════════════════ */
function PremiumReport({ fullName, job, percent, lostMoney, dbData, vspiId }: PremiumProps) {
  const [tab, setTab] = useState('sim');
  const tabs = [{ id: 'sim', icon: '🎮', label: 'Simulator' }, { id: 'tier', icon: '🏢', label: 'Tier Cty' }, { id: 'gap', icon: '🔍', label: 'Gap 90 ngày' }, { id: 'boss', icon: '🤖', label: 'AI Roleplay' }, { id: 'brief', icon: '📋', label: 'Evidence' }, { id: 'cert', icon: '📜', label: 'VSPI Cert' }];

  const isOwner = /chủ|kinh doanh|tự do|founder|owner/i.test(job);

  return (
    <div className="space-y-8">
      {/* KHU VỰC TOOL INTERACTIVE */}
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

      {/* KHU VỰC BÁO CÁO NATIVE DOM */}
      <div className="bg-[#0f1219] rounded-[2rem] p-8 md:p-12 shadow-2xl border border-white/10 text-[#f0ede8]/80 text-justify font-sans leading-relaxed">

        {/* HEADER CHÍNH */}
        <div className="text-center pb-8 border-b border-white/10 mb-8">
          <h1 className="text-3xl md:text-4xl font-serif font-black text-[#e8b84b] mb-3 uppercase tracking-widest">La Bàn Nghề Nghiệp</h1>
          <p className="text-sm md:text-lg text-[#f0ede8]/70 italic">Chiến Lược Bứt Phá Thu Nhập 2026</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <span className="text-[11px] font-mono font-bold bg-[#161b26] border border-white/10 px-3 py-1.5 rounded-full text-[#e8b84b]">Mã: {vspiId}</span>
            <span className="text-[11px] font-mono font-bold bg-[#161b26] border border-white/10 px-3 py-1.5 rounded-full text-[#e8b84b]">Ngày: {TODAY}</span>
            <span className="text-[11px] font-mono font-bold bg-[#161b26] border border-white/10 px-3 py-1.5 rounded-full text-[#e8b84b]">Ngành: {job}</span>
          </div>
        </div>

        {/* CHƯƠNG 1 */}
        <div>
          <h2 className="text-xl md:text-2xl font-serif font-black text-[#e8b84b] mb-6 border-l-4 border-[#e8b84b] pl-4 uppercase">CHƯƠNG 1: XÁC THỰC VỊ TRÍ THU NHẬP HIỆN TẠI VÀ BỨC TRANH THỰC TẾ</h2>
          <p className="mb-4">Chào bạn,</p>
          <p className="mb-6 text-[#f0ede8]/70">
            Trước tiên, tôi muốn gửi lời chúc mừng chân thành nhất vì bạn đã đưa ra một quyết định xuất sắc: Đầu tư để thấu hiểu giá trị thực sự của bản thân trên thị trường lao động. Rất nhiều người đi làm 5 năm, 10 năm vẫn mù mờ về giá trị của mình, dẫn đến việc bị ép giá và đánh mất hàng trăm triệu đồng tiền lương mỗi năm. Bằng việc cầm trên tay bản báo cáo này, bạn đã chính thức bước ra khỏi vùng tối đó.
          </p>
          <div className="bg-[#161b26] p-5 rounded-2xl border border-white/10 mb-6">
            <h3 className="font-sans font-bold text-[#f0ede8] mb-3">HỒ SƠ XÁC THỰC NĂNG LỰC (VSPI CERTIFICATE)</h3>
            <ul className="list-disc pl-5 space-y-2 text-[#f0ede8]/70 text-sm">
              <li><strong>Mã xác thực điện tử:</strong> <span className="text-[#e8b84b] font-mono">{vspiId}</span></li>
              <li><strong>Vị trí hiện tại trong phân phối thu nhập:</strong> Top <span className="text-[#e8b84b] font-mono">{percent}%</span> thị trường lao động.</li>
              <li><strong>Ngày cấp chứng nhận:</strong> <span className="text-[#e8b84b] font-mono">{TODAY}</span></li>
            </ul>
          </div>
          <p className="mb-4 font-bold text-[#f0ede8]">Giải mã con số "Top {percent}%": Bức tranh kinh tế và Áp lực sinh tồn</p>
          <p className="mb-4 text-[#f0ede8]/70">
            Thuộc nhóm Top {percent}% phản ánh rõ nét rằng bạn đang đứng ở vạch xuất phát của nấc thang sự nghiệp — giai đoạn Junior hoặc Fresh Graduate.
          </p>
          <p className="mb-4 text-[#f0ede8]/70">
            Dưới góc nhìn của một Giám đốc Nhân sự, mức lương ở phân khúc này thường dao động trong khoảng 8.000.000đ đến 10.000.000đ/tháng. Đặt vào bối cảnh kinh tế năm 2026, khi lạm phát duy trì ở mức cao, giá thuê một căn phòng trọ tiêu chuẩn tại Hà Nội hay TP.HCM đã ngốn mất 30% - 40% quỹ lương, cộng thêm chi phí ăn uống, đi lại và giao tế, những nhân sự ở Top {percent}% đang phải đối mặt với trạng thái "rỗng túi" vào cuối tháng.
          </p>
          <p className="text-[#f0ede8]/70">
            Ở vị trí này, bạn không có dư địa để tiết kiệm phòng cơ nhỡ, càng không có ngân sách để tái đầu tư vào việc học các kỹ năng cao cấp. Nếu bạn chấp nhận đứng yên ở Top {percent}% quá 2 năm, bạn sẽ vĩnh viễn mắc kẹt trong "bẫy thu nhập trung bình thấp". Sự nghiệp của bạn cần một cú hích. Và cú hích đó bắt đầu từ Chương 2.
          </p>
        </div>

        {/* CHƯƠNG 2 & 3: LOGIC DÀNH CHO OWNER VÀ NHÂN VIÊN */}
        {isOwner ? (
          <>
            {/* CHƯƠNG 2 CHO CHỦ DOANH NGHIỆP/KINH DOANH */}
            <div className="pt-10 mt-10 border-t border-white/10">
              <h2 className="text-xl md:text-2xl font-serif font-black text-[#e8b84b] mb-6 border-l-4 border-[#e8b84b] pl-4 uppercase">CHƯƠNG 2: ĐỊNH HƯỚNG TỐI ƯU HÓA MÔ HÌNH & TĂNG TRƯỞNG LỢI NHUẬN</h2>
              <p className="mb-4 text-[#f0ede8]"><strong>Mục tiêu Kinh doanh: Cuộc viễn chinh lên Top 50% (Median P50)</strong></p>
              <p className="mb-6 text-[#f0ede8]/70">
                Nhiệm vụ tối thượng của bạn trong 12 tháng tới không phải là làm việc chăm chỉ hơn, mà là làm việc thông minh hơn để nâng mức lợi nhuận hiện tại lên tiệm cận mức trung vị (Median) của thị trường: <strong className="text-[#e8b84b]">Tối thiểu {fmtM(dbData?.top_50 || 0)}/tháng.</strong> Để làm được điều này, bạn cần thoát khỏi cái bẫy "khổ chủ" để dịch chuyển từ mô hình kinh doanh đơn lẻ lên chuỗi hệ thống tự vận hành hoặc nhượng quyền thương hiệu.
              </p>
              <p className="mb-3 text-[#f0ede8]"><strong>Ba Nút Thắt Trọng Yếu Đang Ăn Mòn Lợi Nhuận Của Bạn:</strong></p>
              <ol className="list-decimal pl-5 space-y-3 mb-8 text-[#f0ede8]/70 text-sm">
                <li><strong>Làm thuê cho chính mình (Khổ chủ):</strong> Thiếu quy trình đóng gói (SOP), mọi quyết định lớn nhỏ đều phải qua tay bạn. Bạn ngừng làm là dòng tiền ngừng chảy.</li>
                <li><strong>Chi phí cố định (Fixed Cost) quá cao:</strong> Tiền mặt bằng và nhân sự lạm vào biên lợi nhuận ròng, dẫn đến doanh thu cao nhưng tiền mang về không còn bao nhiêu.</li>
                <li><strong>Marketing thủ công, thụ động:</strong> Chỉ chờ khách quen hoặc phụ thuộc vào nền tảng giao hàng thu phí cắt cổ, chưa xây dựng được phễu thu hút khách hàng tự động (Automated Funnel).</li>
              </ol>

              <p className="mb-6 font-bold text-[#e8b84b] tracking-wider text-sm">LỘ TRÌNH 3 CHẶNG ĐỘT PHÁ MÔ HÌNH KINH DOANH (12 THÁNG)</p>

              <div className="space-y-4">
                <div className="bg-[#161b26] p-5 rounded-2xl border border-white/10">
                  <h3 className="font-bold text-[#f0ede8] mb-3">Chặng 1 (Tháng 1 - Tháng 3): Cắt Giảm Chi Phí & Tối Ưu Vận Hành</h3>
                  <ul className="list-disc pl-5 space-y-2 text-sm text-[#f0ede8]/70">
                    <li><strong>Trọng tâm:</strong> Rà soát lại P&L (Báo cáo lời lỗ). Tìm ra 20% nhóm chi phí đang gây lãng phí nhất và cắt giảm.</li>
                    <li><strong>Hành động:</strong> Đàm phán lại giá với nhà cung cấp. Tối ưu hóa ca làm việc của nhân sự part-time để tránh lãng phí giờ công.</li>
                    <li><strong>Tiêu chí nghiệm thu:</strong> Biên lợi nhuận ròng (Net Profit Margin) tăng thêm 5% - 10% trên cùng một mức doanh thu.</li>
                  </ul>
                </div>
                <div className="bg-[#161b26] p-5 rounded-2xl border border-white/10">
                  <h3 className="font-bold text-[#f0ede8] mb-3 flex items-center gap-2"><span>🤖</span> Chặng 2 (Tháng 4 - Tháng 6): Ứng dụng AI vào Marketing & CSKH</h3>
                  <ul className="list-disc pl-5 space-y-2 text-sm text-[#f0ede8]/70">
                    <li><strong>Trọng tâm:</strong> Dùng công nghệ thay thế sức người trong việc tìm kiếm và giữ chân khách hàng.</li>
                    <li><strong>Hành động:</strong> Dùng ChatGPT để lên kịch bản nội dung Social Media hàng tháng. Triển khai AI Chatbot trực Fanpage để chốt đơn 24/7.</li>
                    <li><strong>Tiêu chí nghiệm thu:</strong> Tiết kiệm được chi phí thuê 1 nhân sự Marketing/CSKH nhưng doanh thu từ kênh Online tăng 30%.</li>
                  </ul>
                </div>
                <div className="bg-[#161b26] p-5 rounded-2xl border border-white/10">
                  <h3 className="font-bold text-[#f0ede8] mb-3 flex items-center gap-2"><span>⚙️</span> Chặng 3 (Tháng 7 - Tháng 12): Đóng Gói Quy Trình (SOP) & Nhân Bản</h3>
                  <ul className="list-disc pl-5 space-y-2 text-sm text-[#f0ede8]/70">
                    <li><strong>Trọng tâm:</strong> Chuẩn hóa để thoát khỏi vai trò điều hành trực tiếp.</li>
                    <li><strong>Hành động:</strong> Viết lại toàn bộ quy trình dịch vụ, pha chế, bán hàng thành bộ tài liệu đào tạo tiêu chuẩn. Cất nhắc nhân viên giỏi lên làm Quản lý cửa hàng.</li>
                    <li><strong>Tiêu chí nghiệm thu:</strong> Bạn có thể vắng mặt 1 tuần mà doanh số cửa hàng không sụt giảm. Chuẩn bị sẵn sàng mở cơ sở 2.</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* CHƯƠNG 3 CHO CHỦ DOANH NGHIỆP/KINH DOANH */}
            <div className="pt-10 mt-10 border-t border-white/10">
              <h2 className="text-xl md:text-2xl font-serif font-black text-[#e8b84b] mb-6 border-l-4 border-[#e8b84b] pl-4 uppercase">CHƯƠNG 3: CHIẾN LƯỢC ĐÀM PHÁN GIẢM CHI PHÍ & TĂNG BIÊN LỢI NHUẬN</h2>
              <p className="mb-4 text-[#f0ede8]"><strong>Tư Duy Đàm Phán Kinh Doanh: Win-Win và Dữ Liệu</strong></p>
              <p className="mb-8 text-[#f0ede8]/70">Trong kinh doanh, một đồng chi phí tiết kiệm được chính là một đồng lợi nhuận ròng rơi thẳng vào túi bạn. Bạn không cần làm việc quần quật để tăng doanh thu 20%, đôi khi chỉ cần một cuộc đàm phán xuất sắc với nhà cung cấp hoặc chủ nhà là bạn đã đạt được mức lợi nhuận tương đương.</p>

              <p className="mb-6 font-bold text-[#e8b84b] tracking-wider text-sm">NGUYÊN VĂN KỊCH BẢN ĐÀM PHÁN TỪ CHUYÊN GIA (DÀNH CHO CHỦ QUÁN/FOUNDER)</p>

              <div className="space-y-8">
                <div>
                  <p className="font-bold text-[#f0ede8] mb-2">Kịch bản 1: Đàm phán giảm tiền hoặc giãn tiến độ đóng tiền thuê mặt bằng</p>
                  <p className="text-xs text-[#f0ede8]/45 mb-3 italic">Lưu ý: Nói chuyện dựa trên sự đồng cảm, cam kết hợp tác lâu dài và đưa ra phương án khả thi cho cả hai bên.</p>
                  <blockquote className="bg-[#161b26] border-l-2 border-[#e8b84b] p-5 rounded-r-2xl italic text-[#f0ede8]/70 text-sm leading-relaxed">
                    "Cháu chào cô/chú. Cháu rất cảm ơn cô/chú đã hỗ trợ mặt bằng kinh doanh cho cháu thời gian qua. Hiện tại tình hình kinh tế chung đang chậm lại, lượng khách sụt giảm 20% so với trước. Cháu rất muốn duy trì hợp đồng lâu dài 3-5 năm tới với nhà mình vì vị trí quá tốt. <br /><br />
                    Để hai bên cùng đồng hành vượt qua giai đoạn này, cháu muốn đề xuất cô/chú hỗ trợ giảm 10% tiền nhà trong 6 tháng tới, hoặc cho cháu thanh toán chia nhỏ thành từng tháng thay vì đóng một cục 6 tháng như trước. Sau 6 tháng, cháu sẽ quay lại mức giá cũ. Phương án này sẽ giúp cháu ổn định dòng tiền để tiếp tục kinh doanh và đảm bảo nguồn thu đều đặn cho cô/chú mà không sợ trống mặt bằng. Cô/chú xem xét giúp cháu nhé!"
                  </blockquote>
                </div>
                <div>
                  <p className="font-bold text-[#f0ede8] mb-2">Kịch bản 2: Đàm phán chiết khấu giá vốn với Nhà cung cấp (Suppliers)</p>
                  <p className="text-xs text-[#f0ede8]/45 mb-3 italic">Lưu ý: Dùng mồi nhử là khối lượng đơn hàng tương lai (Volume) và thanh toán đúng hạn.</p>
                  <blockquote className="bg-[#161b26] border-l-2 border-[#e8b84b] p-5 rounded-r-2xl italic text-[#f0ede8]/70 text-sm leading-relaxed">
                    "Chào anh/chị. Cửa hàng bên em đang lên kế hoạch đẩy mạnh Marketing và dự kiến sẽ tăng gấp rưỡi sản lượng nguyên liệu nhập khẩu trong quý tới. Em đã làm việc với bên anh/chị được 1 năm, thanh toán luôn chuẩn chỉ đúng hạn và rất muốn coi bên anh/chị là đối tác chiến lược độc quyền dài hạn.<br /><br />
                    Tuy nhiên, em cũng vừa nhận được báo giá từ một số xưởng khác với mức chiết khấu tốt hơn 15%. Em vẫn ưu tiên chất lượng bên anh/chị, nên muốn hỏi xem bên mình có chính sách nâng mức chiết khấu cho khách VIP (nhập sỉ số lượng lớn cam kết) lên thêm 10% không? Nếu được giá đó, em sẽ chốt luôn hợp đồng bao tiêu sản lượng trong 6 tháng tới thay vì mua lẻ từng chuyến."
                  </blockquote>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            {/* CHƯƠNG 2 CHO NHÂN VIÊN/ĐI LÀM THUÊ */}
            <div className="pt-10 mt-10 border-t border-white/10">
              <h2 className="text-xl md:text-2xl font-serif font-black text-[#e8b84b] mb-6 border-l-4 border-[#e8b84b] pl-4 uppercase">CHƯƠNG 2: PHÂN TÍCH KHOẢNG TRỐNG KỸ NĂNG & MỤC TIÊU 12 THÁNG TỚI</h2>
              <p className="mb-4 text-[#f0ede8]"><strong>Mục tiêu Tài chính: Cuộc viễn chinh lên Top 50% (Median P50)</strong></p>
              <p className="mb-6 text-[#f0ede8]/70">
                Nhiệm vụ tối thượng của bạn trong 12 tháng tới không phải là những thứ phù phiếm, mà là nâng mức thu nhập hiện tại lên tiệm cận mức trung vị (Median) của thị trường: <strong className="text-[#e8b84b]">Tối thiểu {fmtM(dbData?.top_50 || 0)}/tháng.</strong> Về mặt toán học, bạn cần tạo ra sức bật tăng trưởng khoảng <strong className="text-[#e8b84b]">66.6%</strong> trong vòng 1 năm. Đây là một con số bất khả thi nếu bạn chỉ trông chờ vào đợt xét duyệt tăng lương định kỳ 5-10% của công ty hiện tại. Bạn bắt buộc phải nâng cấp bản thân và thực hiện một bước nhảy vọt.
              </p>
              <p className="mb-3 text-[#f0ede8]"><strong>Ba Khoảng Trống Năng Lực Lớn Nhất (Skill-Gaps) Đang Giữ Chân Bạn:</strong></p>
              <ol className="list-decimal pl-5 space-y-3 mb-8 text-[#f0ede8]/70 text-sm">
                <li><strong>Tư duy thực thi thuần túy (Task-taker):</strong> Bạn làm chính xác những gì sếp bảo, nhưng chưa biết cách đề xuất giải pháp để làm việc đó nhanh hơn, rẻ hơn hoặc mang lại doanh thu cao hơn.</li>
                <li><strong>Rào cản ngôn ngữ địa phương:</strong> Bạn bị nhốt trong thị trường của các doanh nghiệp vừa và nhỏ (SME) nội địa, nơi quỹ lương vô cùng eo hẹp do biên độ lợi nhuận mỏng.</li>
                <li><strong>Làm việc bằng sức người (Manual Execution):</strong> Bạn dùng 8 tiếng để làm những việc mà một nhân sự biết dùng công nghệ chỉ mất 1 tiếng để hoàn thành.</li>
              </ol>

              <p className="mb-6 font-bold text-[#e8b84b] tracking-wider text-sm">LỘ TRÌNH 3 CHẶNG ĐỘT PHÁ NĂNG LỰC (12 THÁNG)</p>

              <div className="space-y-4">
                <div className="bg-[#161b26] p-5 rounded-2xl border border-white/10">
                  <h3 className="font-bold text-[#f0ede8] mb-3">Chặng 1 (Tháng 1 - Tháng 3): Trui rèn Năng lực Chuyên môn Cốt lõi</h3>
                  <ul className="list-disc pl-5 space-y-2 text-sm text-[#f0ede8]/70">
                    <li><strong>Cần học gì:</strong> Trở thành người làm việc "ít lỗi nhất". Nắm vững công cụ chuyên ngành, SOP, và kỹ năng phân tích dữ liệu cơ bản.</li>
                    <li><strong>Học bằng cách nào:</strong> Nhận thêm task khó. Đăng ký các khóa học chuyên sâu trên Coursera/Udemy.</li>
                    <li><strong>Tiêu chí nghiệm thu:</strong> Giảm 80% lỗi sai vặt. Có khả năng tự chủ hoàn thành dự án nhỏ từ A đến Z.</li>
                  </ul>
                </div>
                <div className="bg-[#161b26] p-5 rounded-2xl border border-white/10">
                  <h3 className="font-bold text-[#f0ede8] mb-3 flex items-center gap-2"><span>🌍</span> Chặng 2 (Tháng 4 - Tháng 6): Vũ khí Ngoại ngữ</h3>
                  <ul className="list-disc pl-5 space-y-2 text-sm text-[#f0ede8]/70">
                    <li><strong>Cần học gì:</strong> Tiếng Anh thương mại. MNCs có sẵn quỹ lương cao gấp 2-3 lần SME. Tiếng Anh là chiếc chìa khóa duy nhất.</li>
                    <li><strong>Học bằng cách nào:</strong> Tập trung 100% vào Speaking/Listening. Luyện shadowing TED Talk. Target: TOEIC 700+ hoặc IELTS 6.5.</li>
                    <li><strong>Tiêu chí nghiệm thu:</strong> Phỏng vấn trực tiếp bằng Tiếng Anh 30 phút với Hiring Manager mà không bị vấp.</li>
                  </ul>
                </div>
                <div className="bg-[#161b26] p-5 rounded-2xl border border-white/10">
                  <h3 className="font-bold text-[#f0ede8] mb-3 flex items-center gap-2"><span>🤖</span> Chặng 3 (Tháng 7 - Tháng 12): Đột phá bằng Generative AI</h3>
                  <ul className="list-disc pl-5 space-y-2 text-sm text-[#f0ede8]/70">
                    <li><strong>Cần học gì:</strong> Prompt Engineering. AI không cướp việc, người dùng AI sẽ cướp việc của bạn.</li>
                    <li><strong>Học bằng cách nào:</strong> Dùng ChatGPT/Claude để lên outline, tóm tắt tài liệu. Dùng Midjourney/Canva AI làm slide.</li>
                    <li><strong>Tiêu chí nghiệm thu:</strong> Công việc 8 tiếng rút gọn còn 2 tiếng. 6 tiếng còn lại dùng để tư duy chiến lược.</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* CHƯƠNG 3 CHO NHÂN VIÊN/ĐI LÀM THUÊ */}
            <div className="pt-10 mt-10 border-t border-white/10">
              <h2 className="text-xl md:text-2xl font-serif font-black text-[#e8b84b] mb-6 border-l-4 border-[#e8b84b] pl-4 uppercase">CHƯƠNG 3: CHIẾN LƯỢC TỐI ƯU HỒ SƠ & KỊCH BẢN ĐÀM PHÁN LƯƠNG</h2>
              <p className="mb-4 text-[#f0ede8]"><strong>Tái Cấu Trúc CV: Tư Duy "Kết Quả" Thay Vì "Mô Tả Công Việc"</strong></p>
              <p className="mb-8 text-[#f0ede8]/70">HR chỉ có 6 giây để quét một CV. Nếu bạn chỉ liệt kê những việc bạn làm (Responsibilities), bạn là một nhân sự tầm thường. Hãy chuyển sang viết về Kết quả mang lại (Achievements) kèm số liệu chứng minh (Metrics).</p>

              <div className="space-y-4 mb-10">
                <div className="bg-[#161b26] p-5 rounded-2xl border border-white/10">
                  <p className="font-bold text-[#f0ede8] text-sm mb-3">Ví dụ 1: Chuyên viên Marketing</p>
                  <p className="text-sm text-[#f0ede8]/70 mb-2"><span className="text-red-400">❌ CV cũ:</span> Viết bài chuẩn SEO cho website, quản lý Fanpage, CSKH.</p>
                  <p className="text-sm text-[#f0ede8]/70"><span className="text-green-400">✅ CV mới:</span> Xây dựng chiến lược nội dung chuẩn SEO, đưa 15 từ khóa lên Top 3 Google trong 3 tháng. Tăng 250% Organic Traffic, đem về 400 Leads chất lượng, đóng góp 20% doanh thu quý 2.</p>
                </div>
                <div className="bg-[#161b26] p-5 rounded-2xl border border-white/10">
                  <p className="font-bold text-[#f0ede8] text-sm mb-3">Ví dụ 2: Lập trình viên</p>
                  <p className="text-sm text-[#f0ede8]/70 mb-2"><span className="text-red-400">❌ CV cũ:</span> Tham gia code dự án bằng ReactJS và Node.js. Sửa bug theo yêu cầu.</p>
                  <p className="text-sm text-[#f0ede8]/70"><span className="text-green-400">✅ CV mới:</span> Refactor hệ thống API core bằng Node.js, giảm 40% latency. Tối ưu bundle size React App, cải thiện TTI từ 4.2s xuống 1.5s, tăng tỷ lệ chuyển đổi 12%.</p>
                </div>
                <div className="bg-[#161b26] p-5 rounded-2xl border border-white/10">
                  <p className="font-bold text-[#f0ede8] text-sm mb-3">Ví dụ 3: Nhân viên Kinh doanh</p>
                  <p className="text-sm text-[#f0ede8]/70 mb-2"><span className="text-red-400">❌ CV cũ:</span> Gọi điện tìm khách hàng, báo giá, ký hợp đồng.</p>
                  <p className="text-sm text-[#f0ede8]/70"><span className="text-green-400">✅ CV mới:</span> Quản lý danh mục 50+ khách B2B. Vượt 130% KPIs liên tục 4 quý. Đàm phán thành công hợp đồng 2.5 tỷ VNĐ, mang về tỷ suất lợi nhuận cao nhất phòng Kinh doanh 2025.</p>
                </div>
              </div>

              <p className="mb-6 font-bold text-[#e8b84b] tracking-wider text-sm">NGUYÊN VĂN KỊCH BẢN ĐÀM PHÁN LƯƠNG TỪ CHUYÊN GIA</p>

              <div className="space-y-8">
                <div>
                  <p className="font-bold text-[#f0ede8] mb-2">Kịch bản 1: Phỏng vấn tại công ty mới</p>
                  <p className="text-xs text-[#f0ede8]/45 mb-3 italic">Lưu ý: Không bao giờ nói ra con số cụ thể trước khi biết ngân sách. Hãy neo giá.</p>
                  <blockquote className="bg-[#161b26] border-l-2 border-[#e8b84b] p-5 rounded-r-2xl italic text-[#f0ede8]/70 text-sm leading-relaxed">
                    "Dạ, em cảm ơn câu hỏi của anh/chị. Dựa trên Báo cáo Dữ liệu lương VSPI mới nhất của năm nay, mức lương trung vị (Median) cho vị trí này với năng lực tương đương đang dao động ở mức 15 đến 18 triệu đồng. Tuy nhiên, trước khi đưa ra một con số chính xác, em rất muốn hiểu thêm về những kỳ vọng cụ thể mà công ty đặt ra cho vị trí này trong 6 tháng đầu thử thách, cũng như quỹ ngân sách mà anh/chị đã duyệt cho vị trí này là bao nhiêu để chúng ta tìm được điểm chạm chung?"
                  </blockquote>
                </div>
                <div>
                  <p className="font-bold text-[#f0ede8] mb-2">Kịch bản 2: Xin tăng lương với Sếp hiện tại</p>
                  <p className="text-xs text-[#f0ede8]/45 mb-3 italic">Lưu ý: Mang theo Báo cáo Chứng nhận VSPI, không than nghèo kể khổ, chỉ nói về giá trị tạo ra.</p>
                  <blockquote className="bg-[#161b26] border-l-2 border-[#e8b84b] p-5 rounded-r-2xl italic text-[#f0ede8]/70 text-sm leading-relaxed">
                    "Dạ em chào sếp. Cảm ơn sếp đã dành thời gian review hiệu suất công việc của em. Nhìn lại 6 tháng qua, em rất vui vì đã hoàn thành vượt mục tiêu dự án X, giúp team tiết kiệm được 20% chi phí vận hành. Sắp tới, em đã chủ động lên kế hoạch áp dụng AI vào quy trình Y để đẩy nhanh tiến độ gấp đôi cho team.<br /><br />
                    Em cũng có tham khảo Báo cáo dữ liệu thị trường từ hệ thống VSPI (chìa bản PDF chứng nhận ra), hiện tại năng lực và trọng trách em đang gánh vác tương đương với phân khúc Top 50% thị trường, với dải lương tiêu chuẩn là 15-16 triệu. Trong khi hiện tại lương của em đang là 10 triệu. Với những giá trị và dự án em chuẩn bị mang lại, em đề xuất công ty xem xét điều chỉnh mức thu nhập của em lên mức 15 triệu để em có thể toàn tâm toàn ý cống hiến dài hạn. Sếp thấy đề xuất này thế nào ạ?"
                  </blockquote>
                </div>
              </div>
            </div>
          </>
        )}

        {/* CHƯƠNG 4 */}
        <div className="pt-10 mt-10 border-t border-white/10">
          <h2 className="text-xl md:text-2xl font-serif font-black text-[#e8b84b] mb-6 border-l-4 border-[#e8b84b] pl-4 uppercase">CHƯƠNG 4: KHÔNG GIAN KẾT NỐI MENTORSHIP & VIRAL CỘNG ĐỒNG</h2>
          <p className="mb-4 text-[#f0ede8]/70">
            Hành trình tiến lên Top 50% rồi vươn tới nhóm tinh hoa Elite (Top 5%) là một chặng đường vô cùng đơn độc nếu bạn phải đi một mình. Bạn không thể thay đổi vị thế nếu xung quanh bạn chỉ toàn những người chấp nhận mức lương 8 triệu.
          </p>
          <p className="mb-4 text-[#f0ede8]"><strong>Đặc Quyền Của Bạn: Vé Mời Tham Gia "VSPI Mentorship Hub"</strong></p>
          <p className="mb-4 text-[#f0ede8]/70">Là khách hàng Premium, bạn chính thức nhận được đặc quyền tham gia Group Zalo Kín của chúng tôi. Bạn sẽ nhận được 3 vũ khí độc quyền không thể mua bằng tiền:</p>
          <ul className="list-disc pl-5 space-y-3 mb-10 text-[#e8b84b] text-sm">
            <li><strong className="text-[#f0ede8]">Sửa CV 1-1 Miễn Phí</strong> bởi đội ngũ HR Manager.</li>
            <li><strong className="text-[#f0ede8]">Kho Tài Liệu Tối Mật:</strong> 500+ Prompts ChatGPT tự động hóa & 50 Mẫu CV MNC.</li>
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

          <p className="mb-4 font-bold text-[#f0ede8]">🤝 Lời Kêu Gọi: Hãy Lan Tỏa Bàn Đạp Sự Nghiệp Này</p>
          <p className="mb-10 text-[#f0ede8]/70 leading-relaxed">
            Mức giá 29.000đ cho bản báo cáo và hệ sinh thái này là một sự nỗ lực phi lợi nhuận từ chúng tôi để kiến tạo một thế hệ người lao động Việt Nam có thu nhập cao hơn. Nếu bạn thấy bản báo cáo này giúp bạn khai sáng con đường sự nghiệp, hãy gửi đường link ứng dụng VSPI Scanner cho 3 người bạn thân nhất của bạn – những người cũng đang chật vật với mức lương thấp. Hãy giúp họ thấu hiểu giá trị bản thân, bởi vì chúng ta vươn lên bằng cách nâng đỡ người khác.
          </p>

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
function PaywallBox({ vspiId, fullName, selectedJob, resultPercent, lostMoney, onUnlock }: PaywallProps) {
  const [payStep, setPayStep] = useState('info'); // 'info' | 'qr' | 'checking'
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [pollCount, setPollCount] = useState(0);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Lưu purchase record vào Supabase khi user submit thông tin
  const handleSubmitInfo = async () => {
    if (!phone && !email) {
      setError('Vui lòng nhập SĐT hoặc Email để nhận báo cáo');
      return;
    }
    if (phone && !/^0[0-9]{9}$/.test(phone)) {
      setError('SĐT không hợp lệ (VD: 0901234567)');
      return;
    }
    setError('');

    // Gọi API Checkout
    await fetch('/api/premium/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vspiId, phone, email, job_title: selectedJob, percent: resultPercent })
    });

    setPayStep('qr');
  };

  // Polling kiểm tra thanh toán mỗi 5 giây
  const startPolling = () => {
    setPayStep('checking');
    setChecking(true);
    let count = 0;
    pollRef.current = setInterval(async () => {
      count++;
      setPollCount(count);
      try {
        const res = await fetch(`/api/premium/verify?id=${vspiId}`);
        const data = await res.json();

        if (data.status === 'paid' && data.dbData) {
          if (pollRef.current) clearInterval(pollRef.current);
          setChecking(false);
          onUnlock(data.dbData); // Unlock premium với full data
        }
      } catch (err) { }

      if (count >= 24) { // 2 phút timeout
        if (pollRef.current) clearInterval(pollRef.current);
        setChecking(false);
        setPayStep('qr');
        setError('Chưa nhận được xác nhận. Nếu đã chuyển khoản, liên hệ Zalo: 0915 662 876');
      }
    }, 5000);
  };

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // STEP INFO: Thu thập SĐT/Email
  if (payStep === 'info') return (
    <div className="bg-[#0f1219] rounded-[2rem] p-7 border border-[#e8b84b]/40 shadow-2xl shadow-[#e8b84b]/10">
      <div className="text-center mb-5">
        <div className="inline-flex items-center gap-1.5 bg-[#e8b84b] text-[#0a0c10] text-[10px] font-mono font-black px-4 py-1.5 rounded-full mb-3 text-center">
          🔥 GIÁ RA MẮT: <s className="opacity-60 font-sans font-normal">99.000đ</s> ➔ 29.000đ <br className="md:hidden" /><span className="opacity-80 font-sans font-normal text-[9px]">(Áp dụng đến 30/06/2026)</span>
        </div>
        <h3 className="text-xl font-serif font-black text-[#f0ede8] mb-1">Mở khóa VSPI Premium</h3>
        <p className="text-[11px] font-sans text-[#f0ede8]/45"><span className="text-green-400 font-bold">✓ 287 người</span> đã mở khóa tuần này</p>
      </div>

      {/* Benefits list */}
      <div className="space-y-3 mb-5">
        {[
          { icon: '🎮', t: 'Salary Simulator thời gian thực', d: 'Tick kỹ năng — vòng quay thay đổi ngay.' },
          { icon: '🏢', t: 'So sánh SME vs FDI vs MNC', d: 'Cùng vị trí, lương MNC cao hơn 2x.' },
          { icon: '🔍', t: 'Gap Analysis + Lộ trình 90 ngày', d: 'Biết thiếu gì và làm gì từng tháng.' },
          { icon: '🤖', t: 'AI Roleplay — Luyện đàm phán', d: 'Thực chiến trước khi gặp sếp thật.' },
          { icon: '📋', t: 'Evidence Brief để đàm phán', d: 'HR nhìn vào gật đầu công nhận.' },
          { icon: '📜', t: `Chứng nhận VSPI QR xác thực`, d: `ID: ${vspiId}` },
        ].map((item, i) => (
          <div key={i} className="flex gap-3 items-start">
            <span className="text-xl shrink-0">{item.icon}</span>
            <div><p className="text-sm font-sans font-bold text-[#f0ede8]">{item.t}</p><p className="text-[11px] font-sans text-[#f0ede8]/45">{item.d}</p></div>
          </div>
        ))}
      </div>

      {/* ROI box */}
      <div className="bg-[#161b26] rounded-xl p-3 border border-[#e8b84b]/20 mb-5 text-center">
        <p className="text-[11px] font-sans text-[#f0ede8]/70">
          💡 <strong className="text-[#e8b84b]">29k</strong> = 1 ly cà phê · Lấy lại <strong className="text-[#e8b84b]">{lostMoney.toLocaleString('vi-VN')}đ/năm</strong> · ROI = <strong className="text-[#e8b84b]">{Math.round(lostMoney / 29000)}x</strong>
        </p>
      </div>

      {/* Form thu thập thông tin */}
      <div className="bg-[#161b26] rounded-2xl p-5 border border-white/10 space-y-3">
        <p className="text-[10px] font-mono font-black text-[#f0ede8]/45 uppercase tracking-widest text-center">
          Nhập thông tin để nhận báo cáo ngay sau khi thanh toán
        </p>
        <div>
          <label className="text-[10px] font-mono font-bold text-[#f0ede8]/70 uppercase tracking-widest block mb-1">
            SĐT Zalo <span className="text-red-400">*</span>
          </label>
          <input
            type="tel" placeholder="0901234567"
            className="w-full bg-[#0a0c10] border border-white/15 rounded-xl px-3 py-2.5 text-sm text-[#f0ede8] outline-none focus:border-[#e8b84b] transition-colors"
            value={phone} onChange={e => setPhone(e.target.value)}
          />
        </div>
        <div>
          <label className="text-[10px] font-mono font-bold text-[#f0ede8]/70 uppercase tracking-widest block mb-1">
            Email (backup)
          </label>
          <input
            type="email" placeholder="email@example.com"
            className="w-full bg-[#0a0c10] border border-white/15 rounded-xl px-3 py-2.5 text-sm text-[#f0ede8] outline-none focus:border-[#e8b84b] transition-colors"
            value={email} onChange={e => setEmail(e.target.value)}
          />
        </div>
        {error && <p className="text-[11px] text-red-400 font-medium">{error}</p>}
        <button onClick={handleSubmitInfo}
          className="w-full bg-[#e8b84b] text-[#0a0c10] font-black py-4 rounded-xl text-sm hover:-translate-y-0.5 hover:shadow-[0_4px_15px_rgba(232,184,75,0.3)] transition-all">
          Tiếp tục — Xem QR thanh toán →
        </button>
        <p className="text-[9px] font-mono text-center text-[#f0ede8]/45">
          Thông tin chỉ dùng để gửi báo cáo · Không spam · Không bán data
        </p>
      </div>
    </div>
  );

  // STEP QR: Hiện mã QR
  if (payStep === 'qr') return (
    <div className="bg-[#0f1219] rounded-[2rem] p-7 border border-[#e8b84b]/40 shadow-2xl shadow-[#e8b84b]/10">
      <div className="text-center mb-5">
        <p className="text-[11px] font-mono font-black text-[#e8b84b] uppercase tracking-widest mb-2">Bước cuối — Quét QR thanh toán</p>
        <h3 className="text-2xl font-serif font-black text-[#f0ede8]">29.000đ</h3>
        <p className="text-[11px] font-sans text-[#f0ede8]/45 mt-1">Báo cáo sẽ được gửi qua Zalo <strong className="text-[#f0ede8]">{phone || email}</strong> trong vài phút</p>
      </div>

      <div className="text-center mb-5">
        <div className="bg-[#161b26] p-4 rounded-2xl inline-block border border-white/10">
          <div className="bg-white p-2 rounded-xl inline-block shadow-sm mb-3">
            <img
              src={`https://img.vietqr.io/image/acb-260997069-compact2.png?amount=29000&addInfo=VSPI%20${vspiId}&accountName=NGUYEN%20TRONG%20VAN`}
              alt="QR 29k" className="w-48 h-48"
            />
          </div>
          <p className="text-[10px] font-mono text-[#f0ede8]/45">ACB · <strong className="text-[#f0ede8]">260997069</strong> · NGUYEN TRONG VAN</p>
          <div className="mt-2 bg-[#0a0c10] border border-[#e8b84b]/20 rounded-lg px-3 py-1.5">
            <p className="text-[10px] font-mono text-[#e8b84b]">Nội dung CK: <span className="font-mono font-black text-[#f0ede8]">VSPI {vspiId}</span></p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 mb-3 text-center">
          <p className="text-[11px] text-red-400 font-sans">{error}</p>
        </div>
      )}

      <button onClick={startPolling}
        className="w-full bg-green-500/20 text-green-400 border border-green-500/50 font-black py-4 rounded-xl text-sm hover:bg-green-500/30 transition-all mb-2">
        ✅ Tôi đã chuyển khoản xong — Kiểm tra ngay
      </button>
      <button onClick={() => setPayStep('info')}
        className="w-full text-center text-[10px] font-mono text-[#f0ede8]/45 hover:text-[#f0ede8] py-2 transition-colors">
        ← Quay lại
      </button>
    </div>
  );

  // STEP CHECKING: Đang poll
  if (payStep === 'checking') return (
    <div className="bg-[#0f1219] rounded-[2rem] p-12 border border-green-500/50 shadow-2xl flex flex-col items-center text-center">
      <div className="relative w-16 h-16 mb-5">
        <div className="absolute inset-0 border-4 border-white/10 rounded-full" />
        <div className="absolute inset-0 border-4 border-t-green-400 rounded-full animate-spin" />
      </div>
      <h3 className="text-lg font-serif font-bold text-[#f0ede8] mb-1">Đang xác nhận thanh toán...</h3>
      <p className="text-sm font-sans text-[#f0ede8]/45 mb-4">Hệ thống đang kiểm tra giao dịch của bạn</p>
      <div className="bg-[#161b26] border border-green-500/20 rounded-2xl px-5 py-3 text-center">
        <p className="text-[11px] font-mono text-green-400">
          Nội dung CK: <span className="font-mono font-black text-[#f0ede8]">VSPI {vspiId}</span>
        </p>
        <p className="text-[10px] font-sans text-green-400/70 mt-1">Tự động unlock sau khi xác nhận · Thử lần {pollCount}/24</p>
      </div>
      <p className="text-[10px] font-mono text-[#f0ede8]/45 mt-4">
        Nếu chờ quá 2 phút, liên hệ Zalo: <strong className="text-[#e8b84b]">0915 662 876</strong>
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
  const [step, setStep] = useState(1);
  const [resultPercent, setResultPercent] = useState(50);
  const [animatedFill, setAnimatedFill] = useState(0);
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [dbData, setDbData] = useState<SalaryData | null>(null);
  const [lostMoney, setLostMoney] = useState(0);
  const [isAboveMedian, setIsAboveMedian] = useState(false);
  const [isPremiumUnlocked, setIsPremiumUnlocked] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [vspiId] = useState(() => genVSPIId());
  const animRef = useRef<number | null>(null);

  // Combobox State
  const [jobSearchQuery, setJobSearchQuery] = useState('');
  const [showJobDropdown, setShowJobDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: any) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowJobDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredJobs = useMemo(() => {
    let all: { ind: string, title: string }[] = [];
    Object.entries(groupedJobs).forEach(([ind, arr]) => {
      arr.forEach(title => all.push({ ind, title }));
    });
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
        data.forEach((item: any) => {
          if (excludeRegex.test(item.job_title)) return;
          const ind = item.industry || 'Ngành khác';
          if (!groups[ind]) groups[ind] = new Set();
          groups[ind].add(item.job_title);
        });

        // Bổ sung ngành mới
        if (!groups['Dịch vụ/Vận tải hàng không']) groups['Dịch vụ/Vận tải hàng không'] = new Set();
        groups['Dịch vụ/Vận tải hàng không'].add('Tiếp viên hàng không');

        const formatted: Record<string, string[]> = {};
        for (const ind in groups) {
          formatted[ind] = Array.from(groups[ind]).sort();
        }

        setGroupedJobs(formatted);
      } catch (err: any) {
        console.error('Fetch jobs failed:', err);
      } finally {
        setLoadingJobs(false);
      }
    }
    fetchJobs();
  }, []);

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

  const handleScan = async () => {
    if (!fullName.trim() || !selectedJob || !salary) { alert('Vui lòng nhập đủ Họ và Tên, Nghề nghiệp và Thu nhập!'); return; }
    setStep(2);

    try {
      const userSal = parseInt(String(salary).replace(/,/g, ''), 10);

      if (isNaN(userSal) || userSal <= 0) {
        alert('Thu nhập không hợp lệ');
        setStep(1);
        return;
      }

      const res = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_title: selectedJob, salary: userSal })
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);

      setDbData(json.dbData);
      setIsAboveMedian(json.isAboveMedian);
      setLostMoney(json.lostMoney);
      setTimeout(() => { setResultPercent(json.percent); setStep(3); }, 1800);

    } catch (err: any) {
      console.error('Scan error:', err);
      setStep(1);
      alert('Có lỗi xảy ra khi truy vấn dữ liệu. Vui lòng thử lại sau.');
    }
  };

  const strokeDashoffset = CIRCUMFERENCE - (animatedFill / 100) * CIRCUMFERENCE;
  const ringColor = getRingColor(resultPercent);
  const painMsg = () => {
    const f = lostMoney.toLocaleString('vi-VN');
    if (isAboveMedian && resultPercent <= 20) return <><strong className="text-red-700">{f}đ/năm</strong> đang bị bỏ lại so với nhóm Top {resultPercent <= 10 ? '5' : '10'}% — khoảng cách hoàn toàn có thể xóa bỏ.</>;
    return <>Mỗi năm bạn đang <strong className="text-red-700">"bỏ lỡ" {f}đ</strong> — chỉ vì thiếu thông tin thị trường đúng lúc.</>;
  };

  return (
    <div className="min-h-screen bg-[#0a0c10] flex items-start justify-center p-4 pt-6 font-sans text-[#f0ede8]">
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
        .fade-up{animation:fadeUp 0.45s ease both}
        @keyframes pulseSoft{0%,100%{opacity:1}50%{opacity:.55}}
        .pulse-soft{animation:pulseSoft 2s ease infinite}
      `}</style>
      <div className="max-w-md w-full space-y-3">

        {/* Trust bar */}
        <div className="bg-[#0f1219]/80 backdrop-blur rounded-2xl px-4 py-3 border border-white/10 shadow-sm">
          <button onClick={() => setShowSources(s => !s)} className="w-full flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-black text-[#f0ede8]/45 uppercase tracking-widest">Dữ liệu từ</span>
              <div className="flex gap-1.5">{['Adecco', 'ITviec', 'VietnamWorks', 'GSO'].map(s => <span key={s} className="font-mono text-[9px] font-bold bg-[#161b26] text-[#f0ede8]/70 px-2 py-0.5 rounded-full border border-white/10">{s}</span>)}</div>
            </div>
            <span className="text-[#f0ede8]/45 text-xs">{showSources ? '▲' : '▼'}</span>
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

        {/* STEP 1: LANDING PAGE */}
        {step === 1 && (
          <div className="bg-[#0f1219] rounded-[2rem] p-8 shadow-2xl shadow-black/50 border border-white/10 fade-up">
            <div className="text-center mb-8">
              <h1 className="text-4xl md:text-5xl font-black text-[#f0ede8] mb-4 leading-tight">
                Lương bạn đang đứng <br />
                <span className="font-serif italic text-[#e8b84b]">Top mấy %</span> tại Việt Nam?
              </h1>
              <p className="text-[#f0ede8]/70 text-sm md:text-base leading-relaxed">
                Hệ thống đối chiếu thu nhập của bạn với mẫu dữ liệu thực tế từ <strong className="text-[#f0ede8]">53.3 Triệu người lao động</strong> của Tổng cục Thống kê (GSO) và báo cáo Adecco 2026. <br className="hidden md:block" />
                <span className="text-[#e8b84b]">Cam kết số liệu thật 100%.</span>
              </p>
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-[11px] font-mono font-bold text-[#f0ede8]/70 uppercase tracking-widest mb-2">Họ và Tên (Dùng để in chứng nhận VIP) <span className="text-red-400">*</span></label>
                <input type="text" placeholder="VD: Nguyễn Trọng Văn"
                  className="w-full bg-[#161b26] border border-white/10 rounded-xl p-4 text-[#f0ede8] focus:border-[#e8b84b] focus:ring-1 focus:ring-[#e8b84b] outline-none transition-all text-sm placeholder:text-[#f0ede8]/30"
                  value={fullName} onChange={e => setFullName(e.target.value)} />
              </div>
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
                        <input
                          type="text"
                          className="w-full bg-[#161b26] border border-white/10 rounded-xl py-4 pl-10 pr-10 text-[#f0ede8] focus:border-[#e8b84b] focus:ring-1 focus:ring-[#e8b84b] outline-none transition-all text-sm placeholder:text-[#f0ede8]/30"
                          placeholder="Tìm ngành nghề (vd: marketing...)"
                          value={showJobDropdown ? jobSearchQuery : selectedJob}
                          onChange={e => {
                            setJobSearchQuery(e.target.value);
                            setShowJobDropdown(true);
                            if (e.target.value === '') setSelectedJob('');
                          }}
                          onFocus={() => {
                            setShowJobDropdown(true);
                            setJobSearchQuery('');
                          }}
                        />
                        {selectedJob && !showJobDropdown && (
                          <button
                            className="absolute right-4 top-1/2 -translate-y-1/2 text-[#0a0c10] hover:bg-[#e8b84b]/80 w-6 h-6 flex items-center justify-center bg-[#e8b84b] rounded-full text-xs font-bold transition-colors"
                            onClick={(e) => { e.stopPropagation(); setSelectedJob(''); setJobSearchQuery(''); setShowJobDropdown(true); }}
                          >✕</button>
                        )}
                        {(!selectedJob || showJobDropdown) && (
                          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#f0ede8]/45 pointer-events-none text-xs">▼</span>
                        )}
                      </div>

                      {showJobDropdown && (
                        <div className="absolute z-50 w-full mt-2 bg-[#161b26] border border-white/10 rounded-2xl shadow-xl max-h-60 overflow-y-auto">
                          {filteredJobs.length === 0 ? (
                            <div className="p-4 text-center text-sm text-[#f0ede8]/45">
                              <p className="mb-2">Không tìm thấy "{jobSearchQuery}"</p>
                              <button
                                className="text-[#e8b84b] font-bold bg-[#e8b84b]/10 border border-[#e8b84b]/20 px-4 py-2 rounded-xl w-full hover:bg-[#e8b84b]/20 transition-colors"
                                onClick={() => { setIsCustomMode(true); setShowJobDropdown(false); setSelectedJob(jobSearchQuery); }}
                              >
                                ➕ Thêm ngành này
                              </button>
                            </div>
                          ) : (
                            <ul className="py-2">
                              {filteredJobs.map((j, i) => (
                                <li
                                  key={i}
                                  className="px-4 py-2.5 hover:bg-white/5 cursor-pointer flex flex-col transition-colors border-b border-white/5 last:border-0"
                                  onClick={() => {
                                    setSelectedJob(j.title);
                                    setShowJobDropdown(false);
                                  }}
                                >
                                  <span className="text-sm font-bold text-[#f0ede8]">{j.title}</span>
                                  <span className="text-[10px] text-[#f0ede8]/45 uppercase tracking-wider">{j.ind}</span>
                                </li>
                              ))}
                              <li
                                className="px-4 py-3 hover:bg-white/5 cursor-pointer border-t border-white/10 bg-white/5 mt-1"
                                onClick={() => { setIsCustomMode(true); setShowJobDropdown(false); setSelectedJob(jobSearchQuery); }}
                              >
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
                    <button className="absolute right-4 top-1/2 -translate-y-1/2 text-[#f0ede8]/45 hover:text-red-400" onClick={() => { setIsCustomMode(false); setSelectedJob(''); }}>✕</button>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-[11px] font-mono font-bold text-[#f0ede8]/70 uppercase tracking-widest mb-2">Thu nhập tháng (VNĐ)</label>
                <input type="number" placeholder="VD: 25000000"
                  className="w-full bg-[#161b26] border border-white/10 rounded-xl p-4 text-[#f0ede8] focus:border-[#e8b84b] focus:ring-1 focus:ring-[#e8b84b] outline-none transition-all text-sm placeholder:text-[#f0ede8]/30"
                  value={salary} onChange={e => setSalary(e.target.value)} min={0} />
                {salary && <p className="text-[11px] font-mono text-[#e8b84b] mt-2 pl-1">≈ {parseInt(salary).toLocaleString('vi-VN')} đồng/tháng</p>}
              </div>

              <button onClick={handleScan} className="w-full mt-6 p-4 bg-[#e8b84b] text-[#0a0c10] font-black rounded-xl text-lg hover:-translate-y-1 hover:shadow-[0_8px_32px_rgba(232,184,75,0.3)] transition-all">
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

        {/* STEP 2 */}
        {step === 2 && (
          <div className="bg-[#0f1219] rounded-[2rem] p-12 shadow-2xl flex flex-col items-center text-center fade-up border border-white/10">
            <div className="relative w-20 h-20 mb-6">
              <div className="absolute inset-0 border-4 border-white/10 rounded-full" />
              <div className="absolute inset-0 border-4 border-t-[#e8b84b] rounded-full animate-spin" />
            </div>
            <h3 className="text-xl font-serif text-[#f0ede8] pulse-soft">Đang tra cứu VSPI Index...</h3>
            <p className="text-sm font-sans text-[#f0ede8]/45 mt-2">Khớp dữ liệu với 6 nguồn báo cáo lương 2026</p>
            <div className="mt-4 flex flex-wrap gap-1.5 justify-center">
              {['Adecco', 'ITviec', 'VietnamWorks', 'GSO', 'Talentnet', 'NIC'].map(s => <span key={s} className="font-mono text-[9px] bg-[#161b26] text-[#f0ede8]/45 border border-white/10 px-2 py-0.5 rounded-full pulse-soft">{s}</span>)}
            </div>
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <div className="fade-up space-y-3">
            {/* Ring */}
            <div className="bg-[#161b26] rounded-[2rem] p-8 text-center text-[#f0ede8] shadow-2xl relative overflow-hidden border border-[#e8b84b]/20">
              <div className="absolute top-[-20%] left-[-10%] w-64 h-64 bg-[#e8b84b]/10 rounded-full blur-3xl pointer-events-none" />
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
              <p className="text-xl font-serif font-bold text-[#f0ede8]">Bạn cao hơn {100 - resultPercent}%</p>
              <p className="text-sm font-sans opacity-50 mb-1">người lao động ngành {selectedJob}</p>
              <p className="text-[9px] text-[#e8b84b] font-mono">VSPI ID: {vspiId}</p>
              {resultPercent <= 10 && <div className="mt-3 inline-block bg-[#e8b84b]/10 border border-[#e8b84b]/40 text-[#e8b84b] text-xs font-mono font-bold px-3 py-1 rounded-full">🏆 Elite — Top {resultPercent}% thị trường</div>}
            </div>

            {/* Pain */}
            <div className="bg-red-500/10 border border-red-500/30 rounded-3xl p-5">
              <h4 className="text-red-400 font-bold font-sans text-sm mb-2">⚠️ Cảnh báo lãng phí tài năng</h4>
              <p className="text-[#f0ede8] text-sm leading-relaxed">{painMsg()}</p>
              <div className="mt-3 bg-[#161b26] rounded-xl p-3 border border-red-500/20 text-center">
                <p className="text-[10px] font-mono text-[#f0ede8]/45 mb-0.5">Bạn đang bỏ lỡ mỗi tháng</p>
                <p className="text-2xl font-serif text-red-400">{Math.round(lostMoney / 12).toLocaleString('vi-VN')}đ</p>
              </div>
            </div>

            {!isPremiumUnlocked && <TeaserZone fullName={fullName} job={selectedJob} percent={resultPercent} lostMoney={lostMoney} dbData={dbData} />}

            {!isPremiumUnlocked ? (
              <PaywallBox fullName={fullName} vspiId={vspiId} selectedJob={selectedJob} resultPercent={resultPercent} lostMoney={lostMoney} onUnlock={(fullData: SalaryData) => { setDbData(fullData); setIsPremiumUnlocked(true); }} />
            ) : (
              <>
                <EliteLetter fullName={fullName} job={selectedJob} percent={resultPercent} />
                <PremiumReport fullName={fullName} job={selectedJob} percent={resultPercent} lostMoney={lostMoney} dbData={dbData} vspiId={vspiId} />
              </>
            )}

            <button onClick={() => { setStep(1); setAnimatedFill(0); setIsPremiumUnlocked(false); }}
              className="w-full text-center py-5 text-[11px] font-mono text-[#f0ede8]/45 hover:text-[#e8b84b] transition-colors">
              ← QUÉT LẠI VỚI MỨC LƯƠNG KHÁC
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
