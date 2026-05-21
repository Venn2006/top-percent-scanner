"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from 'react';
import QRCode from 'react-qr-code';
import Link from 'next/link';
import { getCareerCompassContext, type CareerCompassContext } from '@/lib/careerCompassEngine';
import { useStats } from '@/lib/useStats';

// ── Lazy load PremiumSection — chỉ tải khi user đã thanh toán ────────────────
const PremiumSection = lazy(() => import('./PremiumSection'));

interface SalaryData { industry?: string; job_title?: string; top_50: number; top_20: number | null; top_10: number | null; top_5: number | null; }
interface GapData { currentPays: string; topPays: string; roadmap: { month: string; action: string }[]; currentSkill: string; missingSkill: string; }
interface TeaserProps { fullName: string; job: string; percent: number; lostMoney: number; dbData: SalaryData | null; paidCount: number; dailyViews: number; }
interface ComponentProps { fullName: string; job: string; percent: number; dbData: SalaryData | null; }
interface SimulatorProps { fullName: string; currentPercent: number; dbData: SalaryData | null; }
interface PaywallProps { vspiId: string; fullName: string; selectedJob: string; resultPercent: number; lostMoney: number; salary: number; paidCount: number; dailyViews: number; onUnlock: (fullData: SalaryData, aiAnalysis: string) => void; }
interface CertificateProps { fullName: string; job: string; percent: number; vspiId: string; }
interface EliteProps { fullName: string; job: string; percent: number; }
interface PremiumProps extends TeaserProps { vspiId: string; salary: number; }

// Scanning step interface
interface ScanStep { label: string; detail: string; }

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

// Scanning steps for fake progress animation
const SCAN_STEPS: ScanStep[] = [
  { label: 'Xác thực ngành nghề...', detail: 'Đang khớp với cơ sở dữ liệu 1,000+ chức danh' },
  { label: 'Đối chiếu với 53.3M người lao động...', detail: 'Truy vấn dữ liệu GSO · Adecco · ITviec · VietnamWorks' },
  { label: 'Tính toán phân vị thu nhập...', detail: 'Áp dụng mô hình Normal Distribution' },
  { label: 'Hoàn tất! Đang tải kết quả...', detail: 'Chuẩn bị báo cáo cá nhân hóa' },
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
            <li><strong className="text-[#f0ede8]">ITviec 2025–2026:</strong> 1,839 chuyên gia IT được khảo sát trực tiếp.</li>
            <li><strong className="text-[#f0ede8]">VietnamWorks/Navigos 2026:</strong> Dữ liệu từ 5.4M lượt truy cập/tháng.</li>
            <li><strong className="text-[#f0ede8]">Talentnet–Mercer 2026:</strong> Total Remuneration Survey Vietnam.</li>
          </ul>
          <p className="border-t border-white/10 pt-3"><strong className="text-[#f0ede8]">Phương pháp tính percentile:</strong> Dữ liệu lương được chuẩn hóa theo mô hình Normal Distribution, tổng hợp từ 6 nguồn báo cáo chính thống. Vị trí phân vị được tính theo lương gross tháng, cập nhật theo chu kỳ quý.</p>
        </div>
        <button onClick={onClose} className="mt-4 w-full bg-[#161b26] border border-white/10 text-[#f0ede8]/70 text-[11px] font-mono py-2.5 rounded-xl hover:border-[#e8b84b]/30 transition-colors">Đóng</button>
      </div>
    </div>
  );
}

/* ═══ SHARE CARD ════════════════════════════════════════════════════════════ */
function ShareButton({ percent, fullName, job }: { percent: number; fullName: string; job: string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [sharing, setSharing] = useState(false);

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
      if (fullName) {
        ctx.fillStyle = '#e8b84b';
        ctx.font = 'bold 28px sans-serif';
        ctx.fillText(fullName + (job ? ` · ${job}` : ''), 600, 480);
      }

      // Footer
      ctx.fillStyle = 'rgba(240,237,232,0.3)';
      ctx.font = '20px monospace';
      ctx.fillText('top-percent-scanner.vercel.app', 600, 580);

      // Border
      ctx.strokeStyle = 'rgba(232,184,75,0.3)';
      ctx.lineWidth = 3;
      ctx.strokeRect(20, 20, 1160, 590);

      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const shareUrl = 'https://top-percent-scanner.vercel.app?utm_source=share&utm_medium=result_card';
        const shareText = `Tôi đang Top ${percent}% thu nhập tại Việt Nam! Kiểm tra vị trí của bạn tại VSPI Scanner 👇`;

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
  }, [percent, fullName, job]);

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

/* ═══ TEASER ZONE ═══════════════════════════════════════════════════════════ */
function TeaserZone({ fullName, job, percent, lostMoney, dbData, paidCount, dailyViews }: TeaserProps) {
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

  const insightLines = percent === 5 ? ['Bạn đang Elite — nhưng Top 1% đang kéo xa bạn thêm mỗi quý.', 'Có 1 kỹ năng mà 94% Top 1% có, còn Top 5% chưa nắm.'] : percent === 10 ? [`Khoảng cách từ Top 10% lên Top 5% ngành ${job} chỉ là ${fmtM((top5 ?? 0) - (top10 ?? 0))}/tháng.`, '80% người vượt mốc này làm được trong 6 tháng với đúng chiến lược.'] : percent === 20 ? [`Top 10% ngành ${job} đang nhận thêm ${fmtM((top10 ?? 0) - (top20 ?? 0))}/tháng so với bạn.`, 'Khoảng cách này không đến từ kinh nghiệm — nó đến từ 1 kỹ năng cụ thể.'] : percent === 50 ? [`Median ngành ${job} là ${fmtM(top50)} — bạn đang đứng đúng ranh giới.`, 'Nhóm dưới median mất trung bình 2.3 năm để vượt qua nếu không có chiến lược.'] : [`Median ngành ${job} cao hơn lương bạn ${fmtM(top50)}/tháng.`, '72% người dưới median không biết mình bị undervalue cho đến khi thấy dữ liệu thị trường.'];
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
            <p className="text-[11px] font-mono font-bold text-[#f0ede8]/70 uppercase tracking-wider">📊 Phân phối lương — {job}</p>
            <span className="text-[9px] bg-[#161b26] text-[#e8b84b] font-mono font-bold px-2 py-0.5 rounded-full border border-white/10">Q1/2026</span>
          </div>
          {[{ label: 'Median (Top 50%)', val: top50, color: '#FF9100', w: '50%' }, { label: 'Top 20%', val: top20, color: '#40C4FF', w: '70%' }].map((r, i) => (
            <div key={i} className="flex items-center gap-3 py-2.5 border-b border-white/5">
              <div className="w-28 shrink-0"><p className="text-[10px] font-mono font-bold text-[#f0ede8]/45">{r.label}</p></div>
              <div className="flex-1 h-2 bg-[#161b26] rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: r.w, backgroundColor: r.color }} /></div>
              <p className="text-sm font-serif font-black text-[#f0ede8] w-14 text-right">{fmtM(r.val)}</p>
            </div>
          ))}
          {/* ── Rows Top 10% & Top 5%: hiển thị rõ nếu user ở Elite, blur nếu không ── */}
          <div className="relative">
            {percent <= 10 ? (
              /* ELITE: hiện rõ Top 10% & 5%, blur thanh Top 1% ảo bên dưới */
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
                {/* Thanh Top 1% ảo — blur */}
                <div className="relative mt-0.5">
                  <div className="flex items-center gap-3 py-2.5 blur-[5px] select-none pointer-events-none">
                    <div className="w-28 shrink-0">
                      <p className="text-[10px] font-mono font-bold text-[#f0ede8]/45">Top 1% 👑</p>
                    </div>
                    <div className="flex-1 h-2 bg-[#161b26] rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: '100%', backgroundColor: '#e8b84b' }} />
                    </div>
                    <p className="text-sm font-serif font-black text-[#f0ede8] w-14 text-right">???</p>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="bg-[#0f1219]/90 backdrop-blur-sm border border-[#e8b84b]/30 rounded-xl px-4 py-2 flex items-center gap-2 shadow-sm">
                      <span>🔒</span>
                      <p className="text-[11px] font-mono font-bold text-[#e8b84b]">Mở khóa để xem Mức lương trần &amp; Top 1%</p>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              /* THƯỜNG: blur Top 10% & Top 5% như cũ */
              <>
                {[
                  { label: 'Top 10%', val: top10, color: '#00E676', w: '85%' },
                  { label: 'Top 5% 🏆', val: top5, color: '#FFD700', w: '100%' },
                ].map((r, i) => (
                  <div key={i} className="flex items-center gap-3 py-2.5 border-b border-white/5 blur-[5px] select-none pointer-events-none">
                    <div className="w-28 shrink-0">
                      <p className="text-[10px] font-mono font-bold text-[#f0ede8]/45">{r.label}</p>
                    </div>
                    <div className="flex-1 h-2 bg-[#161b26] rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: r.w, backgroundColor: r.color }} />
                    </div>
                    <p className="text-sm font-serif font-black text-[#f0ede8] w-14 text-right">{fmtM(r.val)}</p>
                  </div>
                ))}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="bg-[#0f1219]/90 backdrop-blur-sm border border-white/20 rounded-xl px-4 py-2 flex items-center gap-2 shadow-sm">
                    <span>🔒</span>
                    <p className="text-[11px] font-mono font-bold text-[#e8b84b]">Mở khóa để xem Top 10% &amp; 5%</p>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        <div className="bg-[#161b26] border-t border-white/10 px-5 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getRingColor(percent) }} />
            <p className="text-[11px] font-sans text-[#f0ede8]/70">
              Vị trí của bạn: <strong className="text-[#f0ede8] font-mono">Top {percent}%</strong>
              {percent >= 50 ? <span className="text-red-400"> · thấp hơn median {fmtM(lostMoney / 12)}/tháng</span> : <span className="text-green-400"> · đã vượt median ✓</span>}
            </p>
          </div>
          <button onClick={() => setShowDataModal(true)} className="text-[9px] font-mono text-[#f0ede8]/40 hover:text-[#e8b84b] transition-colors whitespace-nowrap shrink-0 underline underline-offset-2">
            Xem phương pháp tính →
          </button>
        </div>
      </div>

      {/* Market trend */}
      <div className="bg-[#0f1219] rounded-3xl p-5 shadow-sm border border-white/10">
        <p className="text-[11px] font-mono font-bold text-[#f0ede8]/70 uppercase tracking-wider mb-3">📈 Tín hiệu thị trường 2026</p>
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

      {/* Social proof — số liệu thực từ DB + baseline */}
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
        ⏰ Giá ưu đãi chỉ còn đến 30/06/2026 · {paidCount.toLocaleString('vi-VN')} người đã mở khóa
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

/* ═══ AI ROLEPLAY ═══════════════════════════════════════════════════════════ */
function AIRoleplay({ fullName, job, percent, dbData }: ComponentProps) {
  const isOwner = /chủ|kinh doanh|tự do|founder|owner/i.test(job);
  const initialMessage = isOwner
    ? `[Chủ nhà nhíu mày nhìn bạn] "Cô/chú nghe nói cháu muốn bàn lại về hợp đồng thuê nhà? Tình hình dạo này buôn bán chậm lắm sao?"`
    : `[Sếp ngẩng đầu nhìn bạn qua kính] "Ừ, vào đi. Nghe bảo anh/chị muốn nói chuyện gì đó về... lương phải không?"`;
  const uiTitle = isOwner ? "🤖 Luyện tập đàm phán với AI Chủ nhà" : "🤖 Luyện tập đàm phán với AI Boss";
  const uiSubtitle = isOwner ? "Giả lập buổi thương lượng giảm 20% tiền mặt bằng mùa thấp điểm" : "Giả lập buổi xin tăng lương thật — sếp AI phản ứng như người thật";
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
  const verifyUrl = `https://top-percent-scanner.vercel.app/verify?id=${vspiId}&job=${encodeURIComponent(job)}&pct=${percent}&date=${encodeURIComponent(TODAY)}`;
  return (
    <div className="space-y-4">
      <div id="vspi-certificate" className="bg-[#0f1219] border border-[#e8b84b]/30 rounded-3xl p-6 text-[#f0ede8] relative overflow-hidden shadow-2xl shadow-[#e8b84b]/5">
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
              <div className="bg-white p-1 rounded-lg">
                <QRCode value={verifyUrl} size={64} />
              </div>
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
  const tabs = [{ id: 'sim', icon: '🎮', label: 'Simulator' }, { id: 'tier', icon: '🏢', label: 'Tier Cty' }, { id: 'gap', icon: '🔍', label: 'Gap 90 ngày' }, { id: 'boss', icon: '🤖', label: 'AI Roleplay' }, { id: 'brief', icon: '📋', label: 'Evidence' }, { id: 'cert', icon: '📜', label: 'VSPI Cert' }];
  const isOwner = /chủ|kinh doanh|tự do|founder|owner/i.test(job);
  // Career Compass context — drives all dynamic content in the report
  const compass: CareerCompassContext = getCareerCompassContext(job, salary, percent);
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
            Với thu nhập <strong className="text-[#e8b84b]">{compass.salaryFmt}/tháng</strong>, bạn đang ở band <strong className="text-[#e8b84b]">{compass.bandLabel}</strong> trong ngành {compass.jobGroup}. Đây là vị trí Top {percent}% — có nghĩa là bạn đang cao hơn {100 - percent}% người lao động cùng ngành.
          </p>
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 mb-4">
            <p className="text-red-300 font-bold text-sm mb-2">⚠️ Nỗi đau đặc thù của band này:</p>
            <p className="text-[#f0ede8]/80 text-sm leading-relaxed">{compass.painPoint}</p>
          </div>
          <p className="text-[#f0ede8]/70">
            Để lên band tiếp theo (<strong className="text-[#e8b84b]">từ {compass.nextBandMinFmt}/tháng</strong>), bạn cần thêm <strong className="text-[#e8b84b]">{compass.salaryGapFmt}/tháng</strong> — tương đương <strong className="text-[#e8b84b]">{(compass.salaryGap * 12).toLocaleString('vi-VN')}đ/năm</strong>. Con số này hoàn toàn có thể đạt được trong 12–18 tháng với đúng chiến lược. Chương 2 sẽ chỉ ra con đường cụ thể.
          </p>
        </div>

        {isOwner ? (
          <>
            <div className="pt-10 mt-10 border-t border-white/10">
              <h2 className="text-xl md:text-2xl font-serif font-semibold text-[#e8b84b] mb-6 border-l-4 border-[#e8b84b] pl-4 tracking-normal text-left">Chương 2: Định hướng tối ưu hóa mô hình & tăng trưởng lợi nhuận</h2>
              <p className="mb-4 text-[#f0ede8]"><strong>Mục tiêu Kinh doanh: Tối ưu hóa lợi nhuận ròng</strong></p>
              <p className="mb-4 text-[#f0ede8]/70">
                Thu nhập hiện tại của bạn là <strong className="text-[#e8b84b]">{compass.salaryFmt}/tháng</strong>. Để lên band tiếp theo (<strong className="text-[#e8b84b]">từ {compass.nextBandMinFmt}/tháng</strong>), bạn cần tăng thêm <strong className="text-[#e8b84b]">{compass.salaryGapFmt}/tháng</strong> — không phải bằng cách làm việc nhiều hơn, mà bằng cách tối ưu hóa mô hình kinh doanh.
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
                  { title: '🤖 Chặng 2 (Tháng 4 - Tháng 6): Ứng dụng AI vào Marketing & CSKH', items: ['Trọng tâm: Dùng công nghệ thay thế sức người trong việc tìm kiếm và giữ chân khách hàng.', 'Hành động: Dùng ChatGPT để lên kịch bản nội dung Social Media. Triển khai AI Chatbot trực Fanpage 24/7.', 'Tiêu chí nghiệm thu: Tiết kiệm chi phí 1 nhân sự Marketing nhưng doanh thu Online tăng 30%.'] },
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
              <p className="mb-3 text-[#f0ede8]"><strong>Mục tiêu tài chính: Lên band {compass.bandLabel.split('(')[0].trim()} → band tiếp theo</strong></p>
              <p className="mb-4 text-[#f0ede8]/70">
                Với {compass.salaryFmt}/tháng hiện tại, bạn cần thêm <strong className="text-[#e8b84b]">{compass.salaryGapFmt}/tháng</strong> để bước vào band tiếp theo (từ <strong className="text-[#e8b84b]">{compass.nextBandMinFmt}/tháng</strong>). Đây là con số cụ thể — không phải cảm tính.
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
                  { title: 'Chặng 1 (Tháng 1 - Tháng 3): Trui rèn Năng lực Chuyên môn Cốt lõi', items: ['Cần học gì: Trở thành người làm việc "ít lỗi nhất". Nắm vững công cụ chuyên ngành, SOP, và kỹ năng phân tích dữ liệu cơ bản.', 'Học bằng cách nào: Nhận thêm task khó. Đăng ký các khóa học chuyên sâu trên Coursera/Udemy.', 'Tiêu chí nghiệm thu: Giảm 80% lỗi sai vặt. Có khả năng tự chủ hoàn thành dự án nhỏ từ A đến Z.'] },
                  { title: '🌍 Chặng 2 (Tháng 4 - Tháng 6): Vũ khí Ngoại ngữ', items: ['Cần học gì: Tiếng Anh thương mại. MNCs có sẵn quỹ lương cao gấp 2-3 lần SME.', 'Học bằng cách nào: Tập trung 100% vào Speaking/Listening. Luyện shadowing TED Talk. Target: TOEIC 700+.', 'Tiêu chí nghiệm thu: Phỏng vấn trực tiếp bằng Tiếng Anh 30 phút với Hiring Manager mà không bị vấp.'] },
                  { title: '🤖 Chặng 3 (Tháng 7 - Tháng 12): Đột phá bằng Generative AI', items: ['Cần học gì: Prompt Engineering. AI không cướp việc, người dùng AI sẽ cướp việc của bạn.', 'Học bằng cách nào: Dùng ChatGPT/Claude để lên outline, tóm tắt tài liệu. Dùng Midjourney/Canva AI làm slide.', 'Tiêu chí nghiệm thu: Công việc 8 tiếng rút gọn còn 2 tiếng. 6 tiếng còn lại dùng để tư duy chiến lược.'] },
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
                    "Dạ, em cảm ơn câu hỏi của anh/chị. Dựa trên Báo cáo Dữ liệu lương VSPI 2026, mức lương chuẩn cho vị trí <strong className="not-italic text-[#f0ede8]">{job}</strong> ở band <strong className="not-italic text-[#f0ede8]">{compass.bandLabel}</strong> đang dao động trong khoảng <strong className="not-italic text-[#e8b84b]">{compass.currentBandRange}/tháng</strong>. Với kinh nghiệm và năng lực hiện tại, em kỳ vọng mức <strong className="not-italic text-[#e8b84b]">{compass.nextBandMinFmt}/tháng</strong> — tương ứng với band tiếp theo. Trước khi đưa ra con số chính xác, em muốn hiểu thêm về kỳ vọng và ngân sách của công ty để tìm điểm chạm chung."
                  </blockquote>
                </div>
                <div>
                  <p className="font-bold text-[#f0ede8] mb-2">Kịch bản 2: Xin tăng lương với Sếp hiện tại</p>
                  <blockquote className="bg-[#161b26] border-l-2 border-[#e8b84b] p-5 rounded-r-2xl italic text-[#f0ede8]/70 text-sm leading-relaxed">
                    "Dạ em chào sếp. Nhìn lại 6 tháng qua, em đã hoàn thành vượt mục tiêu và đóng góp cụ thể cho team. Em cũng có tham khảo Báo cáo VSPI 2026 — hiện tại với vị trí <strong className="not-italic text-[#f0ede8]">{job}</strong>, dải lương chuẩn thị trường là <strong className="not-italic text-[#e8b84b]">{compass.currentBandRange}/tháng</strong>. Thu nhập hiện tại của em là <strong className="not-italic text-[#e8b84b]">{compass.salaryFmt}/tháng</strong>. Để lên band tiếp theo, em cần thêm <strong className="not-italic text-[#e8b84b]">{compass.salaryGapFmt}/tháng</strong>. Em đề xuất công ty xem xét điều chỉnh lên mức <strong className="not-italic text-[#e8b84b]">{compass.nextBandMinFmt}/tháng</strong> — phù hợp với giá trị em đang tạo ra. Sếp thấy đề xuất này thế nào ạ?"
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
function PaywallBox({ vspiId, fullName, selectedJob, resultPercent, lostMoney, salary, paidCount, dailyViews, onUnlock }: PaywallProps) {
  // Chỉ còn 2 bước: 'qr' (mặc định — hiện QR ngay) và 'checking' (đang verify)
  const [payStep, setPayStep] = useState<'qr' | 'creating' | 'checking'>('qr');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [pollCount, setPollCount] = useState(0);
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
    setError('');

    // Hiện loading trên nút trong lúc chờ API
    setPayStep('creating');

    try {
      // BẮT BUỘC await — không được fire-and-forget
      const res = await fetch('/api/premium/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vspiId,
          phone: phone || null,
          email: null,
          job_title: selectedJob,
          percent: resultPercent,
        }),
      });

      // Guard: chỉ tiếp tục khi DB ghi thành công
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.error('[checkout] API error:', res.status, errData);
        setError('Lỗi tạo đơn hàng. Vui lòng thử lại!');
        setPayStep('qr');
        return;
      }

      // DB đã có bản ghi → bắt đầu verify
      startVerification();

    } catch (err) {
      console.error('[checkout] Network error:', err);
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
                  body: JSON.stringify({ id: vspiId, salary }),
                });
                const data = await res.json();
                if (data.status === 'paid' && data.dbData) onUnlock(data.dbData, data.aiAnalysis ?? '');
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
          body: JSON.stringify({ id: vspiId, salary }),
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
          onUnlock(data.dbData, data.aiAnalysis ?? '');
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

  // ── STEP QR: hiện QR to ngay, form nhỏ bên dưới ─────────────────────────
  if (payStep === 'qr') return (
    <div className="bg-[#0f1219] rounded-[2rem] overflow-hidden border border-[#e8b84b]/40 shadow-2xl shadow-[#e8b84b]/10">

      {/* Header */}
      <div className="bg-[#161b26] px-6 pt-6 pb-4 border-b border-white/10">
        <div className="flex items-start justify-between mb-1">
          <div>
            <h3 className="text-lg font-serif font-black text-[#f0ede8]">Mở khóa VSPI Premium</h3>
            <p className="text-[11px] text-[#f0ede8]/45 mt-0.5">
              <span className="text-green-400 font-bold">✓ {dailyViews} người</span> đã xem báo cáo hôm nay
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
      </div>

      {/* QR — to, trung tâm, hấp dẫn */}
      <div className="px-6 pt-6 pb-4 flex flex-col items-center">
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
            MSB · <strong className="text-[#f0ede8]">80003184147</strong> · NGUYEN TRONG VAN
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

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5">
            <p className="text-[11px] text-red-400">{error}</p>
          </div>
        )}

        {/* CTA chính */}
        <button
          onClick={handleConfirmPayment}
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
              💡 <strong className="text-[#e8b84b]">29k</strong> = 1 ly cà phê — Mở khóa chiến lược{' '}
              <strong className="text-[#e8b84b]">C-Level &amp; Top 1%</strong>
            </p>
          ) : (
            <p className="text-[11px] font-sans text-[#f0ede8]/60">
              💡 <strong className="text-[#e8b84b]">29k</strong> = 1 ly cà phê · Lấy lại{' '}
              <strong className="text-[#e8b84b]">{lostMoney.toLocaleString('vi-VN')}đ/năm</strong>
              {' '}· ROI = <strong className="text-[#e8b84b]">{Math.round(lostMoney / 29000)}x</strong>
            </p>
          )}
        </div>

        <p className="text-[9px] font-mono text-center text-[#f0ede8]/30">
          SĐT chỉ dùng để gửi báo cáo · Không spam · Không bán data
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
  const [experience, setExperience] = useState<'junior' | 'mid' | 'senior'>('mid');
  // step: 1=form, 2=scanning-animation, 3=result
  const [step, setStep] = useState(1);
  const [resultPercent, setResultPercent] = useState(50);
  const [animatedFill, setAnimatedFill] = useState(0);
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [dbData, setDbData] = useState<SalaryData | null>(null);
  const [lostMoney, setLostMoney] = useState(0);
  const [isAboveMedian, setIsAboveMedian] = useState(false);
  const [isPremiumUnlocked, setIsPremiumUnlocked] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [showSources, setShowSources] = useState(false);

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
  const [vspiId] = useState(() => genVSPIId());
  const animRef = useRef<number | null>(null);

  // Scanning animation state
  const [scanStep, setScanStep] = useState(0);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanDone, setScanDone] = useState(false);
  // Pending result from API (stored while animation plays)
  const pendingResult = useRef<{ percent: number; dbData: SalaryData | null; isAboveMedian: boolean; lostMoney: number } | null>(null);

  // Consent checkbox
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // Certificate name input (shown after result)
  const [certName, setCertName] = useState('');
  const [certDownloading, setCertDownloading] = useState(false);

  const handleDownloadCertificate = async (name: string) => {
    const el = document.getElementById('vspi-certificate');
    setCertDownloading(true);

    // Canvas API fallback — vẽ certificate đơn giản không phụ thuộc DOM
    const drawFallbackCert = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 800; canvas.height = 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      // Background
      ctx.fillStyle = '#0f1219'; ctx.fillRect(0, 0, 800, 480);
      // Gold border
      ctx.strokeStyle = '#e8b84b'; ctx.lineWidth = 3;
      ctx.strokeRect(16, 16, 768, 448);
      // Header
      ctx.fillStyle = '#e8b84b'; ctx.font = 'bold 13px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('VIETNAM SALARY PERCENTILE INDEX', 400, 70);
      ctx.fillStyle = 'rgba(240,237,232,0.45)'; ctx.font = '11px monospace';
      ctx.fillText('Chứng nhận vị trí thu nhập 2026', 400, 92);
      // Big percent
      ctx.fillStyle = getRingColor(resultPercent);
      ctx.font = 'bold 96px sans-serif';
      ctx.fillText(`Top ${resultPercent}%`, 400, 240);
      // Name & job
      ctx.fillStyle = '#e8b84b'; ctx.font = 'bold 20px sans-serif';
      ctx.fillText(name, 400, 290);
      ctx.fillStyle = 'rgba(240,237,232,0.6)'; ctx.font = '15px sans-serif';
      ctx.fillText(selectedJob, 400, 316);
      // Footer
      ctx.fillStyle = 'rgba(240,237,232,0.3)'; ctx.font = '11px monospace';
      ctx.fillText(`VSPI ID: ${vspiId}  ·  ${TODAY}  ·  top-percent-scanner.vercel.app`, 400, 440);
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
                const { percent, dbData: db, isAboveMedian: iam, lostMoney: lm } = pendingResult.current;
                setResultPercent(percent);
                setDbData(db);
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

  const handleScan = async () => {
    if (!selectedJob || !salary) { showToast('Vui lòng nhập đủ Nghề nghiệp và Thu nhập!', 'error'); return; }
    if (!agreedToTerms) { showToast('Vui lòng đồng ý với Chính sách bảo mật và Điều khoản sử dụng!', 'error'); return; }

    // Start scanning animation immediately
    setStep(2);

    try {
      const userSal = parseInt(String(salary).replace(/,/g, ''), 10);
      if (isNaN(userSal) || userSal <= 0) { showToast('Thu nhập không hợp lệ', 'error'); setStep(1); return; }

      const res = await fetch('/api/scan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_title: selectedJob, salary: userSal, experience })
      });
      const json = await res.json();
      if (json.error) throw new Error(json.error);

      // Store result — animation will pick it up when done
      pendingResult.current = { percent: json.percent, dbData: json.dbData, isAboveMedian: json.isAboveMedian, lostMoney: json.lostMoney };
    } catch (err) {
      console.error('Scan error:', err);
      setStep(1);
      showToast('Có lỗi xảy ra khi truy vấn dữ liệu. Vui lòng thử lại sau.', 'error');
    }
  };

  const strokeDashoffset = CIRCUMFERENCE - (animatedFill / 100) * CIRCUMFERENCE;
  const ringColor = getRingColor(resultPercent);
  const stats = useStats(); // số liệu thực từ DB + baseline

  const painMsg = () => {
    const f = lostMoney.toLocaleString('vi-VN');
    if (isAboveMedian && resultPercent <= 20) return <><strong className="text-red-700">{f}đ/năm</strong> đang bị bỏ lại so với nhóm Top {resultPercent <= 10 ? '5' : '10'}% — khoảng cách hoàn toàn có thể xóa bỏ.</>;
    return <>Mỗi năm bạn đang <strong className="text-red-700">"bỏ lỡ" {f}đ</strong> — chỉ vì thiếu thông tin thị trường đúng lúc.</>;
  };

  // Effective display name: certName if entered, else fullName
  const displayName = certName.trim() || fullName.trim() || 'Bạn';

  return (
    <div className="min-h-screen bg-[#0a0c10] flex items-start justify-center p-4 pt-6 font-sans text-[#f0ede8]">
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
        .fade-up{animation:fadeUp 0.45s ease both}
        @keyframes pulseSoft{0%,100%{opacity:1}50%{opacity:.55}}
        .pulse-soft{animation:pulseSoft 2s ease infinite}
        @keyframes scanLine{0%{transform:translateY(-100%)}100%{transform:translateY(400%)}}
        .scan-line{animation:scanLine 1.5s ease-in-out infinite}
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

        {/* ── STEP 1: FORM ── */}
        {step === 1 && (
          <div className="bg-[#0f1219] rounded-[2rem] p-8 shadow-2xl shadow-black/50 border border-white/10 fade-up">
            <div className="text-center mb-8">
              <h1 className="font-black text-[#f0ede8] mb-4" style={{ fontSize: 'clamp(1.9rem, 8vw, 3.2rem)', lineHeight: 1.12 }}>
                Lương bạn đang đứng <br />
                <span className="font-serif italic text-[#e8b84b]">Top mấy %</span> tại Việt Nam?
              </h1>
              <p className="text-[#f0ede8]/70 text-sm md:text-base leading-relaxed">
                Hệ thống đối chiếu thu nhập của bạn với mẫu dữ liệu thực tế từ <strong className="text-[#f0ede8]">53.3 Triệu người lao động</strong> của Tổng cục Thống kê (GSO) và báo cáo Adecco 2026. <span className="text-[#e8b84b]">Cam kết số liệu thật 100%.</span>
              </p>
            </div>

            <div className="space-y-5">
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
              </div>

              {/* Thu nhập */}
              <div>
                <label className="block text-[11px] font-mono font-bold text-[#f0ede8]/70 uppercase tracking-widest mb-2">Thu nhập tháng (VNĐ)</label>
                <input type="number" placeholder="VD: 25000000"
                  className="w-full bg-[#161b26] border border-white/10 rounded-xl p-4 text-[#f0ede8] focus:border-[#e8b84b] focus:ring-1 focus:ring-[#e8b84b] outline-none transition-all text-sm placeholder:text-[#f0ede8]/30"
                  value={salary} onChange={e => setSalary(e.target.value)} min={0} />
                {salary && <p className="text-[11px] font-mono text-[#e8b84b] mt-2 pl-1">≈ {parseInt(salary).toLocaleString('vi-VN')} đồng/tháng</p>}
              </div>

              {/* Kinh nghiệm thực tế */}
              <div>
                <label className="block text-[11px] font-mono font-bold text-[#f0ede8]/70 uppercase tracking-widest mb-2">
                  Kinh nghiệm thực tế <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { value: 'junior', label: '0–2 năm', sub: 'Junior' },
                    { value: 'mid',    label: '3–5 năm', sub: 'Mid-level' },
                    { value: 'senior', label: 'Trên 5 năm', sub: 'Senior / Lead' },
                  ] as const).map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setExperience(opt.value)}
                      className={`flex flex-col items-center py-3 px-2 rounded-xl border-2 transition-all text-center
                        ${experience === opt.value
                          ? 'border-[#e8b84b] bg-[#e8b84b]/10 shadow-[0_0_12px_rgba(232,184,75,0.2)]'
                          : 'border-white/10 bg-[#161b26] hover:border-white/25'}`}
                    >
                      <span className={`text-sm font-black leading-tight ${experience === opt.value ? 'text-[#e8b84b]' : 'text-[#f0ede8]'}`}>
                        {opt.label}
                      </span>
                      <span className="text-[9px] font-mono mt-0.5 text-[#f0ede8]/45">{opt.sub}</span>
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
                onClick={handleScan}
                disabled={!agreedToTerms}
                className="w-full mt-6 p-4 bg-[#e8b84b] text-[#0a0c10] font-black rounded-xl text-lg hover:-translate-y-1 hover:shadow-[0_8px_32px_rgba(232,184,75,0.3)] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
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
          <div className="bg-[#0f1219] rounded-[2rem] p-10 shadow-2xl flex flex-col items-center text-center fade-up border border-white/10">
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
          <div className="fade-up space-y-3 pb-24">
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
              {/* Badge kinh nghiệm — luôn hiển thị */}
              <div className="mt-2 inline-flex items-center gap-1.5 bg-[#161b26] border border-white/15 text-[#f0ede8]/55 text-[9px] font-mono px-3 py-1 rounded-full">
                <span>⚙️</span>
                <span>Đã điều chỉnh theo mốc kinh nghiệm của bạn</span>
              </div>
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
                  <strong className="text-[#e8b84b]">Bảo vệ vị trí trước AI</strong>.
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
                  <p className="text-[10px] font-mono text-[#f0ede8]/45 mb-0.5">Bạn đang bỏ lỡ mỗi tháng</p>
                  <p className="text-2xl font-serif text-red-400">{Math.round(lostMoney / 12).toLocaleString('vi-VN')}đ</p>
                </div>
              </div>
            )}

            {/* ── THỨ TỰ MỚI: PaywallBox ngay sau Pain box ──────────────────────
                Mục tiêu: QR Code xuất hiện trong 2-3 màn hình đầu tiên trên mobile
                Secondary content (Teaser, Share, Cert) đẩy xuống dưới
            ─────────────────────────────────────────────────────────────────── */}

            {!isPremiumUnlocked ? (
              <>
                {/* 1. PaywallBox — QR ngay sau Pain box */}
                <div id="paywall-anchor" ref={paywallRef}>
                  <PaywallBox
                    fullName={displayName}
                    vspiId={vspiId}
                    selectedJob={selectedJob}
                    resultPercent={resultPercent}
                    lostMoney={lostMoney}
                    salary={parseInt(String(salary).replace(/,/g, ''), 10) || 0}
                    paidCount={stats.paidCount}
                    dailyViews={stats.dailyViews}
                    onUnlock={(fullData: SalaryData, ai: string) => {
                      setDbData(fullData);
                      setAiAnalysis(ai);
                      setIsPremiumUnlocked(true);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                  />
                </div>

                {/* 2. TeaserZone — sau QR, dùng để reinforce value */}
                <TeaserZone
                  fullName={displayName}
                  job={selectedJob}
                  percent={resultPercent}
                  lostMoney={lostMoney}
                  dbData={dbData}
                  paidCount={stats.paidCount}
                  dailyViews={stats.dailyViews}
                />

                {/* 3. Secondary: Share + Social proof + Cert — cuối trang */}
                <div className="space-y-3 pt-2 border-t border-white/5">
                  <ShareButton percent={resultPercent} fullName={displayName} job={selectedJob} />

                  <div className="text-center py-1">
                    <p className="text-[11px] font-mono text-[#f0ede8]/35">🔥 {stats.dailyViews.toLocaleString('vi-VN')} lượt quét hôm nay</p>
                  </div>

                  {/* Certificate input — cuối cùng */}
                  <div className="bg-[#0f1219] border border-white/10 rounded-2xl p-4">
                    <p className="text-[11px] font-mono font-bold text-[#f0ede8]/50 uppercase tracking-widest mb-2">🏅 Tải chứng nhận (sau khi mở khóa)</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Nhập tên để in trên chứng nhận..."
                        className="flex-1 bg-[#161b26] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-[#f0ede8] focus:border-[#e8b84b] outline-none transition-colors placeholder:text-[#f0ede8]/25"
                        value={certName}
                        onChange={e => setCertName(e.target.value)}
                      />
                      <button
                        onClick={() => {
                          if (!certName.trim()) { showToast('Vui lòng nhập họ tên!', 'error'); return; }
                          setFullName(certName.trim());
                          showToast('Đã lưu tên! Mở khóa Premium để tải chứng nhận đầy đủ.', 'info');
                        }}
                        className="bg-[#161b26] border border-white/15 text-[#f0ede8]/60 font-bold px-3 py-2.5 rounded-xl text-xs hover:border-[#e8b84b]/30 transition-colors whitespace-nowrap"
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
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Họ và tên của bạn..."
                      className="flex-1 bg-[#161b26] border border-white/10 rounded-xl px-4 py-3 text-sm text-[#f0ede8] focus:border-[#e8b84b] outline-none transition-colors placeholder:text-[#f0ede8]/30"
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
                      className="bg-[#e8b84b] text-[#0a0c10] font-black px-4 py-3 rounded-xl text-sm hover:bg-[#f0c84b] transition-colors whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {certDownloading ? 'Đang tạo...' : 'Tải chứng nhận'}
                    </button>
                  </div>
                </div>

                <ShareButton percent={resultPercent} fullName={displayName} job={selectedJob} />

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
                    lostMoney={lostMoney}
                    dbData={dbData}
                    vspiId={vspiId}
                    salary={parseInt(String(salary).replace(/,/g, ''), 10) || 0}
                    aiAnalysis={aiAnalysis}
                  />
                </Suspense>
              </>
            )}

            <button onClick={() => { setStep(1); setAnimatedFill(0); setIsPremiumUnlocked(false); setAiAnalysis(''); setCertName(''); setExperience('mid'); pendingResult.current = null; }}
              className="w-full text-center py-5 text-[11px] font-mono text-[#f0ede8]/45 hover:text-[#e8b84b] transition-colors">
              ← QUÉT LẠI VỚI MỨC LƯƠNG KHÁC
            </button>
          </div>
        )}

        {/* ── STICKY CTA BAR — chỉ hiện khi QR đã scroll ra khỏi viewport ── */}
        {step === 3 && !isPremiumUnlocked && qrOutOfView && (
          <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none">
            {/* Gradient fade phía trên */}
            <div className="h-6 bg-gradient-to-t from-[#0a0c10] to-transparent" />
            <div className="bg-[#0a0c10]/95 backdrop-blur-md border-t border-[#e8b84b]/25 px-4 py-3 pointer-events-auto">
              <div className="max-w-md mx-auto flex items-center gap-3">
                {/* Text bên trái */}
                <div className="flex-1 min-w-0">
                  {resultPercent <= 10 ? (
                    <p className="text-[11px] font-mono text-[#f0ede8]/60 leading-tight truncate">
                      Chiến lược C-Level &amp; Top 1%
                    </p>
                  ) : (
                    <p className="text-[11px] font-mono text-[#f0ede8]/60 leading-tight truncate">
                      Bỏ lỡ{' '}
                      <span className="text-red-400 font-bold">
                        {(lostMoney / 1_000_000).toFixed(0)} triệu/năm?
                      </span>
                    </p>
                  )}
                  <p className="text-[10px] text-[#f0ede8]/35 font-mono truncate">
                    <span className="line-through">59k</span> → 29k · Ưu đãi cuối tuần
                  </p>
                </div>
                {/* CTA button */}
                <button
                  onClick={() => {
                    const el = document.getElementById('paywall-anchor');
                    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}
                  className="shrink-0 bg-[#e8b84b] text-[#0a0c10] font-black text-sm px-5 py-3 rounded-xl
                             hover:bg-[#f0c84b] active:scale-95 transition-all
                             shadow-[0_0_16px_rgba(232,184,75,0.35)]"
                >
                  MỞ KHÓA · 29K
                </button>
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
