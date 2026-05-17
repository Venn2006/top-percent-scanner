"use client";

import React, { useState, useEffect, useRef } from 'react';
import QRCode from 'react-qr-code';


interface SalaryData { industry?: string; job_title?: string; top_50: number; top_20: number | null; top_10: number | null; top_5: number | null; }
interface GapData { currentPays: string; topPays: string; roadmap: { month: string; action: string }[]; currentSkill: string; missingSkill: string; }
interface TeaserProps { job: string; percent: number; lostMoney: number; dbData: SalaryData | null; }
interface ComponentProps { job: string; percent: number; dbData: SalaryData | null; }
interface SimulatorProps { currentPercent: number; dbData: SalaryData | null; }
interface PaywallProps { vspiId: string; selectedJob: string; resultPercent: number; lostMoney: number; onUnlock: (fullData: SalaryData) => void; }
interface CertificateProps { job: string; percent: number; vspiId: string; }
interface EliteProps { job: string; percent: number; }
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
function TeaserZone({ job, percent, lostMoney, dbData }: TeaserProps) {
  const top50 = dbData?.top_50 ?? null; const top20 = dbData?.top_20 ?? null;
  const top10 = dbData?.top_10 ?? null; const top5 = dbData?.top_5 ?? null;
  const recentUsers = [{ city: 'TP.HCM', ago: '3 phút trước' }, { city: 'Hà Nội', ago: '11 phút trước' }, { city: 'Đà Nẵng', ago: '28 phút trước' }, { city: 'Cần Thơ', ago: '1 giờ trước' }];
  const insightLines = percent === 5 ? ['Bạn đang Elite — nhưng Top 1% đang kéo xa bạn thêm mỗi quý.', 'Có 1 kỹ năng mà 94% Top 1% có, còn Top 5% chưa nắm.'] : percent === 10 ? [`Khoảng cách từ Top 10% lên Top 5% ngành ${job} chỉ là ${fmtM((top5 ?? 0) - (top10 ?? 0))}/tháng.`, '80% người vượt mốc này làm được trong 6 tháng với đúng chiến lược.'] : percent === 20 ? [`Top 10% ngành ${job} đang nhận thêm ${fmtM((top10 ?? 0) - (top20 ?? 0))}/tháng so với bạn.`, 'Khoảng cách này không đến từ kinh nghiệm — nó đến từ 1 kỹ năng cụ thể.'] : percent === 50 ? [`Median ngành ${job} là ${fmtM(top50)} — bạn đang đứng đúng ranh giới.`, 'Nhóm dưới median mất trung bình 2.3 năm để vượt qua nếu không có chiến lược.'] : [`Median ngành ${job} cao hơn lương bạn ${fmtM(top50)}/tháng.`, '72% người dưới median không biết mình bị undervalue cho đến khi thấy dữ liệu thị trường.'];
  return (
    <div className="space-y-3">
      {/* Partial benchmark */}
      <div className="bg-white rounded-3xl overflow-hidden shadow-sm border border-slate-100">
        <div className="px-5 pt-5 pb-1">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-black text-slate-700 uppercase tracking-wider">📊 Phân phối lương — {job}</p>
            <span className="text-[9px] bg-blue-50 text-blue-600 font-bold px-2 py-0.5 rounded-full">Q1/2026</span>
          </div>
          {[{ label: 'Median (Top 50%)', val: top50, color: '#FF9100', w: '50%' }, { label: 'Top 20%', val: top20, color: '#40C4FF', w: '70%' }].map((r: any, i: number) => (
            <div key={i} className="flex items-center gap-3 py-2.5 border-b border-slate-50">
              <div className="w-28 shrink-0"><p className="text-[10px] font-bold text-slate-500">{r.label}</p></div>
              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: r.w, backgroundColor: r.color }} /></div>
              <p className="text-sm font-black text-slate-800 w-14 text-right">{fmtM(r.val)}</p>
            </div>
          ))}
          <div className="relative">
            {[{ label: 'Top 10%', val: top10, color: '#00E676', w: '85%' }, { label: 'Top 5% 🏆', val: top5, color: '#FFD700', w: '100%' }].map((r: any, i: number) => (
              <div key={i} className="flex items-center gap-3 py-2.5 border-b border-slate-50 blur-[5px] select-none pointer-events-none">
                <div className="w-28 shrink-0"><p className="text-[10px] font-bold text-slate-500">{r.label}</p></div>
                <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: r.w, backgroundColor: r.color }} /></div>
                <p className="text-sm font-black text-slate-800 w-14 text-right">{fmtM(r.val)}</p>
              </div>
            ))}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="bg-white/90 backdrop-blur-sm border border-slate-200 rounded-xl px-4 py-2 flex items-center gap-2 shadow-sm">
                <span>🔒</span><p className="text-[11px] font-bold text-slate-600">Mở khóa để xem Top 10% & 5%</p>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-slate-50 border-t border-slate-100 px-5 py-3 flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getRingColor(percent) }} />
          <p className="text-[11px] text-slate-600">
            Vị trí của bạn: <strong className="text-slate-800">Top {percent}%</strong>
            {percent >= 50 ? <span className="text-red-500"> · thấp hơn median {fmtM(lostMoney / 12)}/tháng</span> : <span className="text-green-600"> · đã vượt median ✓</span>}
          </p>
        </div>
      </div>

      {/* Market trend */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
        <p className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3">📈 Tín hiệu thị trường 2026</p>
        {[
          { arrow: '↑', color: 'text-green-600', t: `Nhu cầu tuyển ngành ${job} đang tăng`, d: '45% doanh nghiệp mở rộng tuyển dụng 5–10% (Navigos 2026)' },
          { arrow: '↑', color: 'text-blue-600', t: 'Mặt bằng lương tăng 8–10% so với 2025', d: 'Đặc biệt mạnh ở mid–senior (NIC Global Salary Guide 2026)' },
          { arrow: '⚡', color: 'text-orange-500', t: '80% nhà tuyển dụng đang tranh nhau ứng viên giỏi', d: 'Đây là thời điểm tốt nhất trong 3 năm để đàm phán lương' },
        ].map((s: any, i: number) => (
          <div key={i} className="flex items-start gap-3 mb-3 last:mb-0">
            <span className={`text-lg leading-none mt-0.5 font-black ${s.color}`}>{s.arrow}</span>
            <div><p className="text-sm font-bold text-slate-800">{s.t}</p><p className="text-[11px] text-slate-500">{s.d}</p></div>
          </div>
        ))}
      </div>

      {/* Insight tease */}
      <div className="bg-[#1e1b4b] rounded-3xl p-5 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />
        <p className="text-[10px] font-black text-blue-300 uppercase tracking-widest mb-3">💡 Insight chuyên sâu từ báo cáo</p>
        <div className="space-y-3">
          {insightLines.map((line, i) => (
            <div key={i} className="flex gap-2.5 items-start">
              <span className="text-yellow-400 text-xs mt-0.5 shrink-0">▸</span>
              <p className="text-sm text-blue-100 leading-relaxed">{line}</p>
            </div>
          ))}
          <div className="relative">
            <div className="flex gap-2.5 items-start blur-[6px] select-none pointer-events-none">
              <span className="text-yellow-400 text-xs mt-0.5 shrink-0">▸</span>
              <p className="text-sm text-blue-100 leading-relaxed">Người ở Top {Math.max(percent - 30, 5)}% ngành {job} tại TP.HCM thường có thêm 1 yếu tố X mà 90% người bỏ qua — không phải kinh nghiệm, không phải bằng cấp.</p>
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="bg-white/10 backdrop-blur-sm text-white text-[10px] font-bold px-3 py-1.5 rounded-full border border-white/20">🔒 Mở khóa để đọc</span>
            </div>
          </div>
        </div>
      </div>

      {/* Social proof */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          <p className="text-xs font-black text-slate-700 uppercase tracking-wider">Vừa mở khóa trong 60 phút qua</p>
        </div>
        {recentUsers.map((u: any, i: number) => (
          <div key={i} className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-[10px] font-black">{['N', 'T', 'L', 'M'][i]}</div>
              <p className="text-[11px] text-slate-600">Người dùng tại <strong>{u.city}</strong> — cùng ngành {job}</p>
            </div>
            <p className="text-[10px] text-slate-400 shrink-0">{u.ago}</p>
          </div>
        ))}
        <div className="mt-3 bg-green-50 border border-green-100 rounded-xl p-3">
          <p className="text-[11px] text-green-700 leading-relaxed">
            <strong>💬</strong> "Email mẫu trong báo cáo giúp mình xin tăng được <strong>3.5M/tháng</strong> sau 1 tuần gửi sếp. Có số liệu thị trường là khác hẳn." — Người dùng tại Hà Nội, Kế toán.
          </p>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3 flex items-center gap-3">
        <span className="text-xl shrink-0">⏳</span>
        <div>
          <p className="text-[11px] font-black text-amber-800">Giá 49k chỉ còn đến 30/06/2026</p>
          <p className="text-[10px] text-amber-600">Sau đó quay về 250,000đ · 287 người mở khóa tuần này</p>
        </div>
      </div>
    </div>
  );
}

/* ═══ SALARY SIMULATOR ══════════════════════════════════════════════════════ */
function SalarySimulator({ currentPercent, dbData }: SimulatorProps) {
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
function CompanyTierCard({ job, dbData }: Omit<ComponentProps, 'percent'>) {
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
function AIRoleplay({ job, percent, dbData }: ComponentProps) {
  const [messages, setMessages] = useState<{role: string, content: string}[]>([
    { role: 'assistant', content: `[Sếp ngẩng đầu nhìn bạn qua kính] "Ừ, vào đi. Nghe bảo anh/chị muốn nói chuyện gì đó về... lương phải không?"` }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const systemPrompt = `Bạn đóng vai Giám đốc/Trưởng bộ phận người Việt, 15 năm kinh nghiệm ngành ${job}, khó tính nhưng công bằng.

Nhân viên đang vào xin tăng lương. Hành vi:
- BAN ĐẦU: Hoài nghi, hỏi bằng chứng, không tin lời suông
- KHI CÓ SỐ LIỆU THỊ TRƯỜNG (Adecco/ITviec/VSPI/VietnamWorks): Bắt đầu mềm dần, hỏi thêm  
- KHI CÓ THÀNH TÍCH CỤ THỂ: Xem xét nghiêm túc
- KHI CHỈ CÓ CẢM TÍNH: Bác bỏ ngay

Phong cách: 2-3 câu, tiếng Việt tự nhiên, đôi lúc xen tiếng Anh. Thỉnh thoảng hỏi ngược lại. Realistic, không impossible.`;

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim(); setInput('');
    const newMsgs = [...messages, { role: 'user', content: userMsg }];
    setMessages(newMsgs); setLoading(true);
    try {
      const res = await fetch('/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514', max_tokens: 300, system: systemPrompt,
          messages: newMsgs.map(m => ({ role: m.role, content: m.content }))
        })
      });
      const data = await res.json();
      const reply = data.content?.[0]?.text ?? 'Hmm... anh/chị nói lại đi.';
      setMessages(p => [...p, { role: 'assistant', content: reply }]);
    } catch { setMessages(p => [...p, { role: 'assistant', content: '[Lỗi kết nối — thử lại]' }]); }
    setLoading(false);
  };

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  return (
    <div className="space-y-3">
      <div className="text-center">
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">🤖 Luyện tập đàm phán với AI Boss</p>
        <p className="text-[11px] text-slate-500">Giả lập buổi xin tăng lương thật — sếp AI phản ứng như người thật</p>
      </div>
      <div className="bg-amber-50 border border-amber-100 rounded-2xl p-3">
        <p className="text-[10px] font-bold text-amber-700 mb-1">💡 Mẹo để thuyết phục</p>
        <p className="text-[10px] text-amber-600">Thử: <em>"Theo báo cáo VSPI 2026, median ngành mình là {fmtM(dbData?.top_50)} — em đang ở Top {percent}%"</em></p>
      </div>
      <div className="bg-slate-50 rounded-2xl border border-slate-100 overflow-hidden">
        <div className="p-1 bg-slate-100 flex items-center gap-2 px-3">
          <div className="w-2 h-2 rounded-full bg-red-400" /><div className="w-2 h-2 rounded-full bg-yellow-400" /><div className="w-2 h-2 rounded-full bg-green-400" />
          <p className="text-[9px] text-slate-400 ml-1 font-mono">boss_simulation.exe</p>
        </div>
        <div className="p-3 max-h-64 overflow-y-auto space-y-2">
          {messages.map((m: any, i: number) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-[12px] leading-relaxed ${m.role === 'user' ? 'bg-blue-600 text-white rounded-br-md' : 'bg-white text-slate-700 border border-slate-200 rounded-bl-md'}`}>
                {m.role === 'assistant' && <span className="text-[9px] font-bold text-slate-400 block mb-0.5">👔 Sếp</span>}
                {m.content}
              </div>
            </div>
          ))}
          {loading && <div className="flex justify-start"><div className="bg-white border border-slate-200 rounded-2xl rounded-bl-md px-4 py-2"><div className="flex gap-1">{[0, 1, 2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}</div></div></div>}
          <div ref={bottomRef} />
        </div>
        <div className="p-3 border-t border-slate-100 flex gap-2">
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()}
            placeholder="Xin sếp cho em trao đổi về lương..."
            className="flex-1 text-[12px] bg-white border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-blue-400" />
          <button onClick={send} disabled={loading} className="bg-blue-600 text-white text-[11px] font-bold px-3 py-2 rounded-xl disabled:opacity-50 hover:bg-blue-700 transition-all">Gửi</button>
        </div>
      </div>
      <button onClick={() => setMessages([{ role: 'assistant', content: `[Sếp ngẩng đầu nhìn bạn qua kính] "Ừ, vào đi. Nghe bảo anh/chị muốn nói chuyện gì đó về... lương phải không?"` }])}
        className="w-full text-center text-[10px] text-slate-400 hover:text-red-500 transition-colors py-1">🔄 Reset — thử lại từ đầu</button>
    </div>
  );
}

/* ═══ EVIDENCE BRIEF ════════════════════════════════════════════════════════ */
function EvidenceBrief({ job, percent, dbData }: ComponentProps) {
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
function VSPICertificate({ job, percent, vspiId }: CertificateProps) {
  const verifyUrl = `https://YOUR-DOMAIN.vercel.app/verify?id=${vspiId}&job=${encodeURIComponent(job)}&pct=${percent}&date=${encodeURIComponent(TODAY)}`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=100x100&data=${encodeURIComponent(verifyUrl)}&bgcolor=1e1b4b&color=FFFFFF&qzone=1`;
  return (
    <div className="space-y-4">
      <div className="bg-gradient-to-br from-[#1e1b4b] via-[#2d2a6e] to-[#1e1b4b] rounded-3xl p-6 text-white relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.04]" style={{ backgroundImage: 'repeating-linear-gradient(45deg,#fff 0,#fff 1px,transparent 0,transparent 50%)', backgroundSize: '12px 12px' }} />
        <div className="absolute top-3 left-3 w-6 h-6 border-l-2 border-t-2 border-yellow-400/40 rounded-tl-lg" />
        <div className="absolute top-3 right-3 w-6 h-6 border-r-2 border-t-2 border-yellow-400/40 rounded-tr-lg" />
        <div className="absolute bottom-3 left-3 w-6 h-6 border-l-2 border-b-2 border-yellow-400/40 rounded-bl-lg" />
        <div className="absolute bottom-3 right-3 w-6 h-6 border-r-2 border-b-2 border-yellow-400/40 rounded-br-lg" />
        <div className="text-center relative z-10">
          <p className="text-[8px] font-black text-yellow-400 uppercase tracking-[0.4em] mb-0.5">Vietnam Salary Percentile Index</p>
          <p className="text-[8px] text-blue-300 uppercase tracking-widest mb-4">Chứng nhận vị trí thu nhập 2026</p>
          <div className="text-5xl mb-2">🏅</div>
          <p className="text-3xl font-black text-yellow-400">TOP {percent}%</p>
          <p className="text-base font-bold text-blue-200 mt-1">{job}</p>
          <p className="text-[10px] text-blue-400 mt-0.5">Thị trường Việt Nam · Q1/2026</p>
          <div className="border-t border-white/10 mt-5 pt-4 flex items-end justify-between">
            <div className="text-left">
              <p className="text-[8px] text-blue-400 mb-1">Mã xác thực (VSPI ID)</p>
              <p className="text-[11px] font-mono font-black text-yellow-400 tracking-wider">{vspiId}</p>
              <p className="text-[8px] text-blue-400 mt-1">Cấp ngày: {TODAY}</p>
            </div>
            <div className="bg-white/10 p-1.5 rounded-xl">
              <img src={qrUrl} alt="Verification QR" className="w-16 h-16 rounded-lg opacity-90" />
            </div>
          </div>
        </div>
      </div>
      <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 flex items-start gap-3">
        <span className="text-lg shrink-0">🔐</span>
        <div>
          <p className="text-[11px] font-bold text-slate-700 mb-1">Xác thực bằng QR — HR có thể kiểm tra ngay</p>
          <p className="text-[10px] text-slate-500 leading-relaxed">Quét QR trỏ đến trang xác thực: ID · Ngành · Top% · Ngày cấp. Biến ảnh thành văn bằng số được xác thực — uy tín x1000.</p>
        </div>
      </div>
      <div className="bg-white border border-slate-100 rounded-2xl p-4">
        <p className="text-xs font-bold text-slate-600 mb-3">📌 Cách dùng chứng nhận này</p>
        {['Đính kèm email xin tăng lương + Evidence Brief (tab 📋) để tăng độ tin cậy', 'Khi HR hỏi "Số liệu lấy từ đâu?" — đưa VSPI ID để họ tự verify', 'Dùng khi negotiate với công ty mới để anchor mức lương kỳ vọng', 'Lưu lại — quét lại sau 3–6 tháng để track tiến độ của bạn'].map((s: any, i: number) => (
          <div key={i} className="flex gap-2 mb-2 last:mb-0"><span className="text-green-500 text-xs mt-0.5 shrink-0">✓</span><p className="text-[11px] text-slate-600 leading-relaxed">{s}</p></div>
        ))}
      </div>
    </div>
  );
}

/* ═══ ELITE LETTER ══════════════════════════════════════════════════════════ */
function EliteLetter({ job, percent }: EliteProps) {
  if (percent > 10) return null;
  return (
    <div className="bg-gradient-to-br from-yellow-50 to-amber-50 border-2 border-yellow-300 rounded-3xl p-6 relative overflow-hidden">
      <div className="absolute top-0 right-0 text-6xl opacity-10 pointer-events-none">🏆</div>
      <div className="flex items-center gap-2 mb-3"><span className="text-2xl">🎖️</span><p className="text-xs font-black text-yellow-700 uppercase tracking-widest">Thư chúc mừng từ Founder</p></div>
      <p className="text-sm text-slate-700 leading-relaxed mb-3">Bạn vừa được xác nhận thuộc <strong>Top {percent}%</strong> ngành <strong>{job}</strong> tại Việt Nam.</p>
      <p className="text-sm text-slate-600 leading-relaxed mb-3">Chỉ <strong>{percent === 5 ? '1 trong 20' : '1 trong 10'}</strong> người cùng ngành đạt được cột mốc này. Bạn đang thuộc nhóm <strong>nhân sự tinh hoa định hình lại thị trường 2026.</strong></p>
      <p className="text-sm text-slate-600 leading-relaxed mb-5">Cộng đồng <strong>VSPI Elite</strong> — group kín Zalo/Telegram chỉ dành cho Top 20% trở lên — đang chờ bạn. Networking, chia sẻ cơ hội, tăng tốc cùng nhau.</p>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-[#1e1b4b] flex items-center justify-center text-white font-black text-sm">V</div>
        <div><p className="text-[11px] font-black text-slate-800">Nguyễn Trọng Văn</p><p className="text-[9px] text-slate-500">Founder · VSPI Vietnam</p></div>
        <div className="ml-auto text-right"><div className="text-[10px] text-slate-400 font-mono italic">Ký tên điện tử</div><div className="text-base font-black text-[#1e1b4b] italic" style={{ fontFamily: 'Georgia,serif' }}>NTV</div></div>
      </div>
      <div className="bg-yellow-100 border border-yellow-200 rounded-2xl p-3 flex items-center gap-3">
        <span className="text-xl">💬</span>
        <div><p className="text-[10px] font-black text-yellow-800">Tham gia VSPI Elite Community</p><p className="text-[10px] text-yellow-700">Nhắn VSPI ELITE + VSPI ID vào Zalo: <strong>0909.xxx.xxx</strong></p></div>
      </div>
    </div>
  );
}

/* ═══ PREMIUM REPORT ════════════════════════════════════════════════════════ */
function PremiumReport({ job, percent, lostMoney, dbData, vspiId }: PremiumProps) {
  const [tab, setTab] = useState('sim');
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const pdfRef = useRef<HTMLDivElement>(null);
  const tabs = [{ id: 'sim', icon: '🎮', label: 'Simulator' }, { id: 'tier', icon: '🏢', label: 'Tier Cty' }, { id: 'gap', icon: '🔍', label: 'Gap 90 ngày' }, { id: 'boss', icon: '🤖', label: 'AI Roleplay' }, { id: 'brief', icon: '📋', label: 'Evidence' }, { id: 'cert', icon: '📜', label: 'VSPI Cert' }];

  const downloadPDF = async () => {
    const el = pdfRef.current;
    if (!el) return;
    setIsGeneratingPDF(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');
      
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, logging: false });
      const imgData = canvas.toDataURL('image/jpeg', 1.0);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      
      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight);
      pdf.save('Bao_Cao_VSPI_Premium.pdf');
    } catch (err) {
      console.error('Lỗi tạo PDF:', err);
      alert('Có lỗi khi tạo PDF. Vui lòng thử lại.');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  return (
    <div className="relative">
      <div className="bg-white rounded-[2rem] overflow-hidden shadow-2xl border border-slate-100">
        <div className="bg-gradient-to-br from-[#1e1b4b] to-[#312e81] p-5 text-white flex justify-between items-start">
          <div>
            <span className="text-[10px] bg-yellow-400 text-yellow-900 font-black px-2 py-0.5 rounded-full">✓ VSPI PREMIUM MỞ KHÓA</span>
            <h3 className="text-base font-black mt-2">Báo cáo cá nhân hóa</h3>
            <p className="text-blue-200 text-[10px]">{job} · Top {percent}% · {vspiId}</p>
          </div>
          <button 
            onClick={downloadPDF} 
            disabled={isGeneratingPDF}
            className="bg-gradient-to-r from-red-500 to-orange-500 text-white text-[11px] font-black px-4 py-2 rounded-xl hover:scale-105 transition-transform disabled:opacity-50 shadow-lg"
          >
            {isGeneratingPDF ? '⏳ ĐANG TẠO PDF...' : '📥 TẢI BÁO CÁO LA BÀN NGHỀ NGHIỆP VIP (PDF)'}
          </button>
        </div>
        <div className="flex border-b border-slate-100 overflow-x-auto">
          {tabs.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex-1 min-w-0 py-2.5 px-1 text-[9px] font-bold flex flex-col items-center gap-0.5 transition-all border-b-2 ${tab === t.id ? 'border-blue-600 text-blue-600 bg-blue-50' : 'border-transparent text-slate-400'}`}>
              <span className="text-sm">{t.icon}</span>
              <span className="truncate w-full text-center leading-tight">{t.label}</span>
            </button>
          ))}
        </div>
        <div className="p-5">
          {tab === 'sim' && <SalarySimulator currentPercent={percent} dbData={dbData} />}
          {tab === 'tier' && <CompanyTierCard job={job} dbData={dbData} />}
          {tab === 'gap' && <GapAnalysisTab job={job} percent={percent} dbData={dbData} />}
          {tab === 'boss' && <AIRoleplay job={job} percent={percent} dbData={dbData} />}
          {tab === 'brief' && <EvidenceBrief job={job} percent={percent} dbData={dbData} />}
          {tab === 'cert' && <VSPICertificate job={job} percent={percent} vspiId={vspiId} />}
        </div>
      </div>

      {/* KHU VỰC ẨN ĐỂ RENDER PDF (LA BÀN NGHỀ NGHIỆP) */}
      <div className="absolute top-[-9999px] left-[-9999px] w-[800px] z-[-1]">
        <div ref={pdfRef} className="bg-white p-12 space-y-8 text-slate-800 text-justify" style={{ fontFamily: 'Georgia, serif', lineHeight: '1.7' }}>
          
          {/* HEADER CHÍNH */}
          <div className="text-center pb-6 border-b-4 border-[#1e1b4b]">
            <h1 className="text-4xl font-black text-[#1e1b4b] mb-3 uppercase tracking-widest">La Bàn Nghề Nghiệp</h1>
            <p className="text-lg text-slate-600 italic">Chiến Lược Bứt Phá Thu Nhập 2026</p>
            <div className="mt-4 flex justify-center gap-4">
              <span className="text-sm font-bold bg-slate-100 px-3 py-1 rounded-full text-[#1e1b4b]">Mã: {vspiId}</span>
              <span className="text-sm font-bold bg-slate-100 px-3 py-1 rounded-full text-[#1e1b4b]">Ngày: {TODAY}</span>
              <span className="text-sm font-bold bg-slate-100 px-3 py-1 rounded-full text-[#1e1b4b]">Ngành: {job}</span>
            </div>
          </div>

          {/* CHƯƠNG 1 */}
          <div className="break-inside-avoid">
            <h2 className="text-2xl font-black text-[#1e1b4b] mb-4 border-l-8 border-yellow-400 pl-4 uppercase">CHƯƠNG 1: XÁC THỰC VỊ TRÍ THU NHẬP HIỆN TẠI VÀ BỨC TRANH THỰC TẾ</h2>
            <p className="mb-4">Chào bạn,</p>
            <p className="mb-4">
              Trước tiên, tôi muốn gửi lời chúc mừng chân thành nhất vì bạn đã đưa ra một quyết định xuất sắc: Đầu tư để thấu hiểu giá trị thực sự của bản thân trên thị trường lao động. Rất nhiều người đi làm 5 năm, 10 năm vẫn mù mờ về giá trị của mình, dẫn đến việc bị ép giá và đánh mất hàng trăm triệu đồng tiền lương mỗi năm. Bằng việc cầm trên tay bản báo cáo này, bạn đã chính thức bước ra khỏi vùng tối đó.
            </p>
            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 shadow-sm mb-4">
              <h3 className="font-bold text-[#1e1b4b] mb-2">HỒ SƠ XÁC THỰC NĂNG LỰC (VSPI CERTIFICATE)</h3>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong>Mã xác thực điện tử:</strong> {vspiId}</li>
                <li><strong>Vị trí hiện tại trong phân phối thu nhập:</strong> Top {percent}% thị trường lao động.</li>
                <li><strong>Ngày cấp chứng nhận:</strong> {TODAY}</li>
              </ul>
            </div>
            <p className="mb-4"><strong>Giải mã con số "Top {percent}%": Bức tranh kinh tế và Áp lực sinh tồn</strong></p>
            <p className="mb-4">
              Thuộc nhóm Top {percent}% phản ánh rõ nét rằng bạn đang đứng ở vạch xuất phát của nấc thang sự nghiệp — giai đoạn Junior hoặc Fresh Graduate. 
            </p>
            <p className="mb-4">
              Dưới góc nhìn của một Giám đốc Nhân sự, mức lương ở phân khúc này thường dao động trong khoảng 8.000.000đ đến 10.000.000đ/tháng. Đặt vào bối cảnh kinh tế năm 2026, khi lạm phát duy trì ở mức cao, giá thuê một căn phòng trọ tiêu chuẩn tại Hà Nội hay TP.HCM đã ngốn mất 30% - 40% quỹ lương, cộng thêm chi phí ăn uống, đi lại và giao tế, những nhân sự ở Top {percent}% đang phải đối mặt với trạng thái "rỗng túi" vào cuối tháng. 
            </p>
            <p>
              Ở vị trí này, bạn không có dư địa để tiết kiệm phòng cơ nhỡ, càng không có ngân sách để tái đầu tư vào việc học các kỹ năng cao cấp. Nếu bạn chấp nhận đứng yên ở Top {percent}% quá 2 năm, bạn sẽ vĩnh viễn mắc kẹt trong "bẫy thu nhập trung bình thấp". Sự nghiệp của bạn cần một cú hích. Và cú hích đó bắt đầu từ Chương 2.
            </p>
          </div>

          {/* CHƯƠNG 2 */}
          <div style={{ pageBreakBefore: 'always' }}>
            <h2 className="text-2xl font-black text-[#1e1b4b] mb-4 border-l-8 border-blue-600 pl-4 uppercase">CHƯƠNG 2: PHÂN TÍCH KHOẢNG TRỐNG KỸ NĂNG & MỤC TIÊU 12 THÁNG TỚI</h2>
            <p className="mb-4"><strong>Mục tiêu Tài chính: Cuộc viễn chinh lên Top 50% (Median P50)</strong></p>
            <p className="mb-4">
              Nhiệm vụ tối thượng của bạn trong 12 tháng tới không phải là những thứ phù phiếm, mà là nâng mức thu nhập hiện tại lên tiệm cận mức trung vị (Median) của thị trường: <strong>Tối thiểu {fmtM(dbData?.top_50 || 0)}/tháng.</strong> Về mặt toán học, bạn cần tạo ra sức bật tăng trưởng khoảng <strong>66.6%</strong> trong vòng 1 năm. Đây là một con số bất khả thi nếu bạn chỉ trông chờ vào đợt xét duyệt tăng lương định kỳ 5-10% của công ty hiện tại. Bạn bắt buộc phải nâng cấp bản thân và thực hiện một bước nhảy vọt.
            </p>
            <p className="mb-2"><strong>Ba Khoảng Trống Năng Lực Lớn Nhất (Skill-Gaps) Đang Giữ Chân Bạn:</strong></p>
            <ol className="list-decimal pl-5 space-y-2 mb-6">
              <li><strong>Tư duy thực thi thuần túy (Task-taker):</strong> Bạn làm chính xác những gì sếp bảo, nhưng chưa biết cách đề xuất giải pháp để làm việc đó nhanh hơn, rẻ hơn hoặc mang lại doanh thu cao hơn.</li>
              <li><strong>Rào cản ngôn ngữ địa phương:</strong> Bạn bị nhốt trong thị trường của các doanh nghiệp vừa và nhỏ (SME) nội địa, nơi quỹ lương vô cùng eo hẹp do biên độ lợi nhuận mỏng.</li>
              <li><strong>Làm việc bằng sức người (Manual Execution):</strong> Bạn dùng 8 tiếng để làm những việc mà một nhân sự biết dùng công nghệ chỉ mất 1 tiếng để hoàn thành.</li>
            </ol>
            
            <p className="mb-4 font-bold">LỘ TRÌNH 3 CHẶNG ĐỘT PHÁ NĂNG LỰC (12 THÁNG)</p>
            
            <div className="space-y-4">
              <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
                <h3 className="font-bold text-slate-800 mb-2">Chặng 1 (Tháng 1 - Tháng 3): Trui rèn Năng lực Chuyên môn Cốt lõi</h3>
                <ul className="list-disc pl-5 space-y-1 text-sm">
                  <li><strong>Cần học gì:</strong> Trở thành người làm việc "ít lỗi nhất". Nắm vững công cụ chuyên ngành, SOP, và kỹ năng phân tích dữ liệu cơ bản.</li>
                  <li><strong>Học bằng cách nào:</strong> Nhận thêm task khó. Đăng ký các khóa học chuyên sâu trên Coursera/Udemy.</li>
                  <li><strong>Tiêu chí nghiệm thu:</strong> Giảm 80% lỗi sai vặt. Có khả năng tự chủ hoàn thành dự án nhỏ từ A đến Z.</li>
                </ul>
              </div>
              <div className="bg-blue-50 p-5 rounded-2xl border border-blue-100">
                <h3 className="font-bold text-blue-900 mb-2 flex items-center gap-2"><span>🌍</span> Chặng 2 (Tháng 4 - Tháng 6): Vũ khí Ngoại ngữ</h3>
                <ul className="list-disc pl-5 space-y-1 text-sm text-blue-900">
                  <li><strong>Cần học gì:</strong> Tiếng Anh thương mại. MNCs có sẵn quỹ lương cao gấp 2-3 lần SME. Tiếng Anh là chiếc chìa khóa duy nhất.</li>
                  <li><strong>Học bằng cách nào:</strong> Tập trung 100% vào Speaking/Listening. Luyện shadowing TED Talk. Target: TOEIC 700+ hoặc IELTS 6.5.</li>
                  <li><strong>Tiêu chí nghiệm thu:</strong> Phỏng vấn trực tiếp bằng Tiếng Anh 30 phút với Hiring Manager mà không bị vấp.</li>
                </ul>
              </div>
              <div className="bg-purple-50 p-5 rounded-2xl border border-purple-100">
                <h3 className="font-bold text-purple-900 mb-2 flex items-center gap-2"><span>🤖</span> Chặng 3 (Tháng 7 - Tháng 12): Đột phá bằng Generative AI</h3>
                <ul className="list-disc pl-5 space-y-1 text-sm text-purple-900">
                  <li><strong>Cần học gì:</strong> Prompt Engineering. AI không cướp việc, người dùng AI sẽ cướp việc của bạn.</li>
                  <li><strong>Học bằng cách nào:</strong> Dùng ChatGPT/Claude để lên outline, tóm tắt tài liệu. Dùng Midjourney/Canva AI làm slide.</li>
                  <li><strong>Tiêu chí nghiệm thu:</strong> Công việc 8 tiếng rút gọn còn 2 tiếng. 6 tiếng còn lại dùng để tư duy chiến lược.</li>
                </ul>
              </div>
            </div>
          </div>

          {/* CHƯƠNG 3 */}
          <div style={{ pageBreakBefore: 'always' }}>
            <h2 className="text-2xl font-black text-[#1e1b4b] mb-4 border-l-8 border-green-500 pl-4 uppercase">CHƯƠNG 3: CHIẾN LƯỢC TỐI ƯU HỒ SƠ & KỊCH BẢN ĐÀM PHÁN LƯƠNG</h2>
            <p className="mb-4"><strong>Tái Cấu Trúc CV: Tư Duy "Kết Quả" Thay Vì "Mô Tả Công Việc"</strong></p>
            <p className="mb-4">HR chỉ có 6 giây để quét một CV. Nếu bạn chỉ liệt kê những việc bạn làm (Responsibilities), bạn là một nhân sự tầm thường. Hãy chuyển sang viết về Kết quả mang lại (Achievements) kèm số liệu chứng minh (Metrics).</p>
            
            <div className="space-y-4 mb-8">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <p className="font-bold text-slate-800 text-sm mb-2">Ví dụ 1: Chuyên viên Marketing</p>
                <p className="text-sm">❌ <em>CV cũ:</em> Viết bài chuẩn SEO cho website, quản lý Fanpage, CSKH.</p>
                <p className="text-sm">✅ <em>CV mới:</em> Xây dựng chiến lược nội dung chuẩn SEO, đưa 15 từ khóa lên Top 3 Google trong 3 tháng. Tăng 250% Organic Traffic, đem về 400 Leads chất lượng, đóng góp 20% doanh thu quý 2.</p>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <p className="font-bold text-slate-800 text-sm mb-2">Ví dụ 2: Lập trình viên</p>
                <p className="text-sm">❌ <em>CV cũ:</em> Tham gia code dự án bằng ReactJS và Node.js. Sửa bug theo yêu cầu.</p>
                <p className="text-sm">✅ <em>CV mới:</em> Refactor hệ thống API core bằng Node.js, giảm 40% latency. Tối ưu bundle size React App, cải thiện TTI từ 4.2s xuống 1.5s, tăng tỷ lệ chuyển đổi 12%.</p>
              </div>
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <p className="font-bold text-slate-800 text-sm mb-2">Ví dụ 3: Nhân viên Kinh doanh</p>
                <p className="text-sm">❌ <em>CV cũ:</em> Gọi điện tìm khách hàng, báo giá, ký hợp đồng.</p>
                <p className="text-sm">✅ <em>CV mới:</em> Quản lý danh mục 50+ khách B2B. Vượt 130% KPIs liên tục 4 quý. Đàm phán thành công hợp đồng 2.5 tỷ VNĐ, mang về tỷ suất lợi nhuận cao nhất phòng Kinh doanh 2025.</p>
              </div>
            </div>

            <p className="mb-4 font-bold">NGUYÊN VĂN KỊCH BẢN ĐÀM PHÁN LƯƠNG TỪ CHUYÊN GIA</p>
            
            <div className="space-y-6">
              <div className="break-inside-avoid">
                <p className="font-bold text-[#1e1b4b] mb-2">Kịch bản 1: Phỏng vấn tại công ty mới</p>
                <p className="text-sm text-slate-500 mb-2 italic">Lưu ý: Không bao giờ nói ra con số cụ thể trước khi biết ngân sách. Hãy neo giá.</p>
                <blockquote className="bg-slate-100 p-5 rounded-2xl border-l-4 border-blue-500 italic text-slate-700 text-sm">
                  "Dạ, em cảm ơn câu hỏi của anh/chị. Dựa trên Báo cáo Dữ liệu lương VSPI mới nhất của năm nay, mức lương trung vị (Median) cho vị trí này với năng lực tương đương đang dao động ở mức 15 đến 18 triệu đồng. Tuy nhiên, trước khi đưa ra một con số chính xác, em rất muốn hiểu thêm về những kỳ vọng cụ thể mà công ty đặt ra cho vị trí này trong 6 tháng đầu thử thách, cũng như quỹ ngân sách mà anh/chị đã duyệt cho vị trí này là bao nhiêu để chúng ta tìm được điểm chạm chung?"
                </blockquote>
              </div>
              <div className="break-inside-avoid">
                <p className="font-bold text-[#1e1b4b] mb-2">Kịch bản 2: Xin tăng lương với Sếp hiện tại</p>
                <p className="text-sm text-slate-500 mb-2 italic">Lưu ý: Mang theo Báo cáo Chứng nhận VSPI, không than nghèo kể khổ, chỉ nói về giá trị tạo ra.</p>
                <blockquote className="bg-slate-100 p-5 rounded-2xl border-l-4 border-green-500 italic text-slate-700 text-sm">
                  "Dạ em chào sếp. Cảm ơn sếp đã dành thời gian review hiệu suất công việc của em. Nhìn lại 6 tháng qua, em rất vui vì đã hoàn thành vượt mục tiêu dự án X, giúp team tiết kiệm được 20% chi phí vận hành. Sắp tới, em đã chủ động lên kế hoạch áp dụng AI vào quy trình Y để đẩy nhanh tiến độ gấp đôi cho team.<br/><br/>
                  Em cũng có tham khảo Báo cáo dữ liệu thị trường từ hệ thống VSPI (chìa bản PDF chứng nhận ra), hiện tại năng lực và trọng trách em đang gánh vác tương đương với phân khúc Top 50% thị trường, với dải lương tiêu chuẩn là 15-16 triệu. Trong khi hiện tại lương của em đang là 10 triệu. Với những giá trị và dự án em chuẩn bị mang lại, em đề xuất công ty xem xét điều chỉnh mức thu nhập của em lên mức 15 triệu để em có thể toàn tâm toàn ý cống hiến dài hạn. Sếp thấy đề xuất này thế nào ạ?"
                </blockquote>
              </div>
            </div>
          </div>

          {/* CHƯƠNG 4 */}
          <div style={{ pageBreakBefore: 'always' }}>
            <h2 className="text-2xl font-black text-[#1e1b4b] mb-4 border-l-8 border-red-500 pl-4 uppercase">CHƯƠNG 4: KHÔNG GIAN KẾT NỐI MENTORSHIP & VIRAL CỘNG ĐỒNG</h2>
            <p className="mb-4">
              Hành trình tiến lên Top 50% rồi vươn tới nhóm tinh hoa Elite (Top 5%) là một chặng đường vô cùng đơn độc nếu bạn phải đi một mình. Bạn không thể thay đổi vị thế nếu xung quanh bạn chỉ toàn những người chấp nhận mức lương 8 triệu. 
            </p>
            <p className="mb-4"><strong>Đặc Quyền Của Bạn: Vé Mời Tham Gia "VSPI Mentorship Hub"</strong></p>
            <p className="mb-4">Là khách hàng Premium, bạn chính thức nhận được đặc quyền tham gia Group Zalo Kín của chúng tôi. Bạn sẽ nhận được 3 vũ khí độc quyền không thể mua bằng tiền:</p>
            <ul className="list-disc pl-5 space-y-2 mb-6 font-bold text-[#1e1b4b]">
              <li>Sửa CV 1-1 Miễn Phí bởi đội ngũ HR Manager.</li>
              <li>Kho Tài Liệu Tối Mật: 500+ Prompts ChatGPT tự động hóa & 50 Mẫu CV MNC.</li>
              <li>Mạng lưới Hidden Jobs từ các Headhunter uy tín.</li>
            </ul>

            <div className="border-4 border-dashed border-[#1e1b4b] p-8 rounded-3xl text-center bg-gradient-to-b from-yellow-50 to-white mx-auto max-w-lg shadow-lg">
              <h3 className="text-xl font-black text-[#1e1b4b] mb-4 uppercase">MÃ QR CODE QUÉT GIA NHẬP CỘNG ĐỒNG ZALO VIP</h3>
              <div className="bg-white p-4 rounded-2xl inline-block shadow-md mb-4 border border-slate-100">
                <QRCode value="https://zalo.me/g/kdiqgls4dcpsonhkrnyn" size={160} />
              </div>
              <p className="text-sm font-bold text-slate-700">Hotline/Zalo hỗ trợ: <span className="text-red-600 text-lg">0915.662.876</span></p>
            </div>

            <p className="mt-8 mb-4"><strong>🤝 Lời Kêu Gọi: Hãy Lan Tỏa Bàn Đạp Sự Nghiệp Này</strong></p>
            <p className="mb-8">
              Mức giá 29.000đ cho bản báo cáo và hệ sinh thái này là một sự nỗ lực phi lợi nhuận từ chúng tôi để kiến tạo một thế hệ người lao động Việt Nam có thu nhập cao hơn. Nếu bạn thấy bản báo cáo này giúp bạn khai sáng con đường sự nghiệp, hãy gửi đường link ứng dụng VSPI Scanner cho 3 người bạn thân nhất của bạn – những người cũng đang chật vật với mức lương thấp. Hãy giúp họ thấu hiểu giá trị bản thân, bởi vì chúng ta vươn lên bằng cách nâng đỡ người khác.
            </p>
            
            <p className="mb-12">Một lần nữa, chúc bạn một năm 2026 bùng nổ, bứt phá mọi giới hạn và sớm chạm tay vào mức thu nhập mơ ước!</p>

            <div className="text-right pb-10">
              <p className="text-sm italic text-slate-500 mb-1">Ký tên,</p>
              <p className="text-2xl font-black text-[#1e1b4b] mb-1" style={{ fontFamily: 'Georgia, serif' }}>Nguyễn Trọng Văn</p>
              <p className="text-sm font-bold text-slate-600">Giám đốc Chiến lược / Founder VSPI Vietnam</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══ PAYWALL BOX ═══════════════════════════════════════════════════════════ */
function PaywallBox({ vspiId, selectedJob, resultPercent, lostMoney, onUnlock }: PaywallProps) {
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
      } catch(err) {}
      
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
    <div className="bg-white rounded-[2rem] p-7 border-2 border-blue-600 shadow-2xl">
      <div className="text-center mb-5">
        <div className="inline-flex items-center gap-1.5 bg-blue-600 text-white text-[10px] font-black px-4 py-1.5 rounded-full mb-3">
          🔥 GIÁ RA MẮT <s className="opacity-60 font-normal">99.000đ</s> → 29.000đ
        </div>
        <h3 className="text-xl font-black text-slate-900 mb-1">Mở khóa VSPI Premium</h3>
        <p className="text-xs text-slate-400"><span className="text-green-600 font-bold">✓ 287 người</span> đã mở khóa tuần này</p>
      </div>

      {/* Benefits list — giữ nguyên 6 items như code cũ */}
      <div className="space-y-3 mb-5">
        {[
          { icon:'🎮', t:'Salary Simulator thời gian thực', d:'Tick kỹ năng — vòng quay thay đổi ngay.' },
          { icon:'🏢', t:'So sánh SME vs FDI vs MNC', d:'Cùng vị trí, lương MNC cao hơn 2x.' },
          { icon:'🔍', t:'Gap Analysis + Lộ trình 90 ngày', d:'Biết thiếu gì và làm gì từng tháng.' },
          { icon:'🤖', t:'AI Roleplay — Luyện đàm phán', d:'Thực chiến trước khi gặp sếp thật.' },
          { icon:'📋', t:'Evidence Brief in được ra giấy', d:'HR nhìn vào gật đầu công nhận.' },
          { icon:'📜', t:`Chứng nhận VSPI QR xác thực`, d:`ID: ${vspiId}` },
        ].map((item, i) => (
          <div key={i} className="flex gap-3 items-start">
            <span className="text-xl shrink-0">{item.icon}</span>
            <div><p className="text-sm font-bold text-slate-800">{item.t}</p><p className="text-[11px] text-slate-500">{item.d}</p></div>
          </div>
        ))}
      </div>

      {/* ROI box */}
      <div className="bg-blue-50 rounded-xl p-3 border border-blue-100 mb-5 text-center">
        <p className="text-[11px] text-blue-700">
          💡 <strong>29k</strong> = 1 ly cà phê · Lấy lại <strong>{lostMoney.toLocaleString('vi-VN')}đ/năm</strong> · ROI = <strong>{Math.round(lostMoney / 29000)}x</strong>
        </p>
      </div>

      {/* Form thu thập thông tin */}
      <div className="bg-slate-50 rounded-2xl p-5 border border-slate-100 space-y-3">
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest text-center">
          Nhập thông tin để nhận báo cáo ngay sau khi thanh toán
        </p>
        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
            SĐT Zalo <span className="text-red-400">*</span>
          </label>
          <input
            type="tel" placeholder="0901234567"
            className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-500 bg-white"
            value={phone} onChange={e => setPhone(e.target.value)}
          />
        </div>
        <div>
          <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">
            Email (backup)
          </label>
          <input
            type="email" placeholder="email@example.com"
            className="w-full border-2 border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-blue-500 bg-white"
            value={email} onChange={e => setEmail(e.target.value)}
          />
        </div>
        {error && <p className="text-[11px] text-red-500 font-medium">{error}</p>}
        <button onClick={handleSubmitInfo}
          className="w-full bg-[#3C3489] text-white font-black py-4 rounded-xl text-sm hover:bg-[#2d2770] transition-all">
          Tiếp tục — Xem QR thanh toán →
        </button>
        <p className="text-[9px] text-center text-slate-400">
          Thông tin chỉ dùng để gửi báo cáo · Không spam · Không bán data
        </p>
      </div>
    </div>
  );

  // STEP QR: Hiện mã QR
  if (payStep === 'qr') return (
    <div className="bg-white rounded-[2rem] p-7 border-2 border-blue-600 shadow-2xl">
      <div className="text-center mb-5">
        <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-2">Bước cuối — Quét QR thanh toán</p>
        <h3 className="text-xl font-black text-slate-900">29.000đ</h3>
        <p className="text-[11px] text-slate-400 mt-1">Báo cáo sẽ được gửi qua Zalo <strong>{phone || email}</strong> trong vài phút</p>
      </div>

      <div className="text-center mb-5">
        <div className="bg-slate-50 p-4 rounded-2xl inline-block border border-slate-100">
          <div className="bg-white p-2 rounded-xl inline-block shadow-sm mb-3">
            <img
              src={`https://img.vietqr.io/image/acb-260997069-compact2.png?amount=29000&addInfo=VSPI%20${vspiId}&accountName=NGUYEN%20TRONG%20VAN`}
              alt="QR 29k" className="w-48 h-48"
            />
          </div>
          <p className="text-[10px] text-slate-500">ACB · <strong className="text-slate-700">260997069</strong> · NGUYEN TRONG VAN</p>
          <div className="mt-2 bg-blue-50 rounded-lg px-3 py-1.5">
            <p className="text-[10px] text-blue-600">Nội dung CK: <span className="font-mono font-black">VSPI {vspiId}</span></p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 rounded-xl p-3 mb-3 text-center">
          <p className="text-[11px] text-red-600">{error}</p>
        </div>
      )}

      <button onClick={startPolling}
        className="w-full bg-green-600 text-white font-black py-4 rounded-xl text-sm hover:bg-green-700 transition-all mb-2">
        ✅ Tôi đã chuyển khoản xong — Kiểm tra ngay
      </button>
      <button onClick={() => setPayStep('info')}
        className="w-full text-center text-[10px] text-slate-400 hover:text-slate-600 py-2">
        ← Quay lại
      </button>
    </div>
  );

  // STEP CHECKING: Đang poll
  if (payStep === 'checking') return (
    <div className="bg-white rounded-[2rem] p-12 border-2 border-green-400 shadow-2xl flex flex-col items-center text-center">
      <div className="relative w-16 h-16 mb-5">
        <div className="absolute inset-0 border-4 border-slate-100 rounded-full"/>
        <div className="absolute inset-0 border-4 border-t-green-500 rounded-full animate-spin"/>
      </div>
      <h3 className="text-lg font-bold text-slate-800 mb-1">Đang xác nhận thanh toán...</h3>
      <p className="text-sm text-slate-400 mb-4">Hệ thống đang kiểm tra giao dịch của bạn</p>
      <div className="bg-green-50 border border-green-100 rounded-2xl px-5 py-3 text-center">
        <p className="text-[11px] text-green-700">
          Nội dung CK: <span className="font-mono font-black">VSPI {vspiId}</span>
        </p>
        <p className="text-[10px] text-green-600 mt-1">Tự động unlock sau khi xác nhận · Thử lần {pollCount}/24</p>
      </div>
      <p className="text-[10px] text-slate-400 mt-4">
        Nếu chờ quá 2 phút, liên hệ Zalo: <strong>0915 662 876</strong>
      </p>
    </div>
  );
}

/* ═══ MAIN ══════════════════════════════════════════════════════════════════ */
export default function TopPercentScanner() {
  const [groupedJobs, setGroupedJobs] = useState<Record<string, string[]>>({});
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

  useEffect(() => {
    async function fetchJobs() {
      setLoadingJobs(true);
      try {
        const res = await fetch('/api/jobs');
        if (!res.ok) throw new Error('API Error');
        const { data, error } = await res.json();
        if (error) throw new Error(error);
        if (!data) return;

        const groups: Record<string, Set<string>> = {};
        data.forEach((item: any) => {
          const ind = item.industry || 'Ngành khác';
          if (!groups[ind]) groups[ind] = new Set();
          groups[ind].add(item.job_title);
        });

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
    if (!selectedJob || !salary) { alert('Vui lòng nhập đủ thông tin!'); return; }
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
    <div className="min-h-screen bg-[#F0F2F8] flex items-start justify-center p-4 pt-6 font-sans text-slate-900">
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
        .fade-up{animation:fadeUp 0.45s ease both}
        @keyframes pulseSoft{0%,100%{opacity:1}50%{opacity:.55}}
        .pulse-soft{animation:pulseSoft 2s ease infinite}
      `}</style>
      <div className="max-w-md w-full space-y-3">

        {/* Trust bar */}
        <div className="bg-white/80 backdrop-blur rounded-2xl px-4 py-3 border border-white shadow-sm">
          <button onClick={() => setShowSources(s => !s)} className="w-full flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Dữ liệu từ</span>
              <div className="flex gap-1.5">{['Adecco', 'ITviec', 'VietnamWorks', 'GSO'].map(s => <span key={s} className="text-[9px] font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{s}</span>)}</div>
            </div>
            <span className="text-slate-400 text-xs">{showSources ? '▲' : '▼'}</span>
          </button>
          {showSources && (
            <div className="mt-3 space-y-2 fade-up">
              {DATA_SOURCES.map(src => (
                <div key={src.name} className="flex gap-2">
                  <span className="text-green-500 text-xs mt-0.5">✓</span>
                  <div><p className="text-[11px] font-bold text-slate-700">{src.label}</p><p className="text-[10px] text-slate-400">{src.detail}</p></div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* STEP 1 */}
        {step === 1 && (
          <div className="bg-white rounded-[2rem] p-8 shadow-2xl shadow-blue-100 border border-white fade-up">
            <div className="flex items-center gap-2 mb-0.5"><span className="text-2xl">🎯</span><h2 className="text-2xl font-black text-[#1e1b4b] tracking-tight">VSPI Scanner</h2></div>
            <p className="text-[10px] font-bold text-blue-600 mb-4">Vietnam Salary Percentile Index 2026</p>
            <div className="grid grid-cols-2 gap-2 mb-6">
              {MARKET_STATS.map((s: any, i: number) => (
                <div key={i} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <p className="text-base font-black text-[#1e1b4b]">{s.value}<span className="text-xs font-normal text-slate-400">{s.unit}</span></p>
                  <p className="text-[9px] text-slate-400 leading-tight mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Nghề nghiệp hiện tại</label>
                {!isCustomMode ? (
                  loadingJobs ? (
                    <div className="w-full border-2 border-slate-100 rounded-2xl p-4 bg-slate-50 text-sm text-slate-400 flex items-center gap-2">
                      <div className="w-3 h-3 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"/>
                      Đang tải danh sách ngành nghề...
                    </div>
                  ) : (
                    <select className="w-full border-2 border-slate-100 rounded-2xl p-4 outline-none focus:border-blue-500 bg-slate-50 text-sm"
                      value={selectedJob} onChange={e => e.target.value === 'OTHER' ? setIsCustomMode(true) : setSelectedJob(e.target.value)}>
                      <option value="">-- Chọn ngành nghề --</option>
                      {Object.entries(groupedJobs).sort(([a], [b]) => a.localeCompare(b)).map(([ind, jobs]) => (
                        <optgroup key={ind} label={ind.toUpperCase()}>{jobs.map((j, i) => <option key={i} value={j}>{j}</option>)}</optgroup>
                      ))}
                      <option value="OTHER">➕ Ngành khác (nhập tay)...</option>
                    </select>
                  )
                ) : (
                  <div className="relative">
                    <input type="text" autoFocus placeholder="VD: Hướng dẫn viên, Chủ shop..."
                      className="w-full border-2 border-blue-500 rounded-2xl p-4 outline-none ring-4 ring-blue-50 bg-white text-sm"
                      value={selectedJob} onChange={e => setSelectedJob(e.target.value)} />
                    <button className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500" onClick={() => { setIsCustomMode(false); setSelectedJob(''); }}>✕</button>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Thu nhập tháng (VNĐ)</label>
                <input type="number" placeholder="VD: 25000000"
                  className="w-full border-2 border-slate-100 rounded-2xl p-4 outline-none focus:border-blue-500 bg-slate-50 text-sm"
                  value={salary} onChange={e => setSalary(e.target.value)} min={0} />
                {salary && <p className="text-xs text-slate-400 mt-1 pl-1">≈ {parseInt(salary).toLocaleString('vi-VN')} đồng/tháng</p>}
              </div>
              <button onClick={handleScan} className="w-full bg-[#3C3489] text-white font-black text-lg py-5 rounded-2xl hover:scale-[1.02] active:scale-95 shadow-xl shadow-blue-200 transition-all">
                ⚡ QUÉT VSPI — MIỄN PHÍ
              </button>
              <p className="text-[10px] text-center text-slate-400">Adecco · ITviec · VietnamWorks · GSO · Talentnet · NIC Global</p>
            </div>
          </div>
        )}

        {/* STEP 2 */}
        {step === 2 && (
          <div className="bg-white rounded-[2rem] p-12 shadow-2xl flex flex-col items-center text-center fade-up">
            <div className="relative w-20 h-20 mb-6">
              <div className="absolute inset-0 border-4 border-slate-100 rounded-full" />
              <div className="absolute inset-0 border-4 border-t-blue-600 rounded-full animate-spin" />
            </div>
            <h3 className="text-xl font-bold text-slate-800 pulse-soft">Đang tra cứu VSPI Index...</h3>
            <p className="text-sm text-slate-400 mt-2">Khớp dữ liệu với 6 nguồn báo cáo lương 2026</p>
            <div className="mt-4 flex flex-wrap gap-1.5 justify-center">
              {['Adecco', 'ITviec', 'VietnamWorks', 'GSO', 'Talentnet', 'NIC'].map(s => <span key={s} className="text-[9px] bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full pulse-soft">{s}</span>)}
            </div>
          </div>
        )}

        {/* STEP 3 */}
        {step === 3 && (
          <div className="fade-up space-y-3">
            {/* Ring */}
            <div className="bg-[#1e1b4b] rounded-[2rem] p-8 text-center text-white shadow-2xl relative overflow-hidden">
              <div className="absolute top-[-20%] left-[-10%] w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
              <p className="text-[10px] font-bold text-blue-300 uppercase tracking-[0.3em] mb-0.5">VSPI · Vietnam Salary Percentile Index</p>
              <p className="text-[9px] text-blue-400 mb-4">6 nguồn báo cáo · Q1/2026</p>
              <div className="relative w-44 h-44 mx-auto mb-5">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 140 140">
                  <circle cx="70" cy="70" r={RADIUS} fill="transparent" stroke="white" strokeOpacity="0.08" strokeWidth="10" />
                  <circle cx="70" cy="70" r={RADIUS} fill="transparent" stroke={ringColor} strokeWidth="10" strokeDasharray={CIRCUMFERENCE} strokeDashoffset={strokeDashoffset} strokeLinecap="round" />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-xs font-bold text-blue-200">Top</span>
                  <span className="text-6xl font-black leading-none">{resultPercent}%</span>
                </div>
              </div>
              <p className="text-xl font-bold text-blue-100">Bạn cao hơn {100 - resultPercent}%</p>
              <p className="text-sm opacity-50 mb-1">người lao động ngành {selectedJob}</p>
              <p className="text-[9px] text-blue-400 font-mono">VSPI ID: {vspiId}</p>
              {resultPercent <= 10 && <div className="mt-3 inline-block bg-yellow-400/20 border border-yellow-400/40 text-yellow-300 text-xs font-bold px-3 py-1 rounded-full">🏆 Elite — Top {resultPercent}% thị trường</div>}
            </div>

            {/* Pain */}
            <div className="bg-red-50 border-2 border-red-100 rounded-3xl p-5">
              <h4 className="text-red-600 font-bold text-sm mb-2">⚠️ Cảnh báo lãng phí tài năng</h4>
              <p className="text-slate-700 text-sm leading-relaxed">{painMsg()}</p>
              <div className="mt-3 bg-white rounded-xl p-3 border border-red-100 text-center">
                <p className="text-[10px] text-slate-400 mb-0.5">Bạn đang bỏ lỡ mỗi tháng</p>
                <p className="text-2xl font-black text-red-500">{Math.round(lostMoney / 12).toLocaleString('vi-VN')}đ</p>
              </div>
            </div>

            {!isPremiumUnlocked && <TeaserZone job={selectedJob} percent={resultPercent} lostMoney={lostMoney} dbData={dbData} />}

            {!isPremiumUnlocked ? (
              <PaywallBox vspiId={vspiId} selectedJob={selectedJob} resultPercent={resultPercent} lostMoney={lostMoney} onUnlock={(fullData: SalaryData) => { setDbData(fullData); setIsPremiumUnlocked(true); }} />
            ) : (
              <>
                <EliteLetter job={selectedJob} percent={resultPercent} />
                <PremiumReport job={selectedJob} percent={resultPercent} lostMoney={lostMoney} dbData={dbData} vspiId={vspiId} />
              </>
            )}

            <button onClick={() => { setStep(1); setAnimatedFill(0); setIsPremiumUnlocked(false); }}
              className="w-full text-center py-5 text-xs text-slate-400 font-medium hover:text-blue-600 transition-colors">
              ← Quét lại với mức lương khác
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
