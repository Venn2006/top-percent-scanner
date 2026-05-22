"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from 'react';
import QRCode from 'react-qr-code';
import Link from 'next/link';
import { getCareerCompassContext, type CareerCompassContext } from '@/lib/careerCompassEngine';
import { useStats } from '@/lib/useStats';
import { MARKET_LOCATIONS, type MarketLocationKey } from '@/lib/locationBenchmark';
import { buildJobJumpMap } from '@/lib/jobJumpMap';
import { DEFAULT_WORK_PROVINCE, WORK_PROVINCES, getWorkProvince, type WorkProvinceKey } from '@/lib/workProvinces';
import { trackEvent } from '@/lib/analytics';

// â”€â”€ Lazy load PremiumSection â€” chá»‰ táº£i khi user Ä‘Ã£ thanh toÃ¡n â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  thresholdPreview?: Array<{ label: string; salary: number | null; locked: boolean; active: boolean }>;
}
interface GapData { currentPays: string; topPays: string; roadmap: { month: string; action: string }[]; currentSkill: string; missingSkill: string; }
interface TeaserProps { fullName: string; job: string; percent: number; lostMoney: number; dbData: SalaryData | null; paidCount: number; dailyViews: number; }
interface ComponentProps { fullName: string; job: string; percent: number; dbData: SalaryData | null; }
interface SimulatorProps { fullName: string; currentPercent: number; dbData: SalaryData | null; }
interface PaywallProps { vspiId: string; fullName: string; selectedJob: string; resultPercent: number; lostMoney: number; salary: number; experience: ExperienceLevel; marketLocation: MarketLocationKey; workProvince: WorkProvinceKey; paidCount: number; dailyViews: number; onShowToast: (msg: string, type: 'error' | 'success' | 'info') => void; onUnlock: (fullData: SalaryData, aiAnalysis: string, benchmark?: BenchmarkMeta | null) => void; }
interface CertificateProps { fullName: string; job: string; percent: number; vspiId: string; }
interface EliteProps { fullName: string; job: string; percent: number; }
interface PremiumProps extends TeaserProps { vspiId: string; salary: number; }

// Scanning step interface
interface ScanStep { label: string; detail: string; }

type ExperienceLevel = 'junior' | 'mid' | 'senior';

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

const DATA_SOURCES = [
  { name: 'Adecco', label: 'Adecco Vietnam 2026', detail: '1,000+ chá»©c danh Â· 12th Edition' },
  { name: 'ITviec', label: 'ITviec 2025â€“2026', detail: '1,839 chuyÃªn gia IT kháº£o sÃ¡t' },
  { name: 'Navigos', label: 'VietnamWorks / Navigos 2026', detail: '5.4M lÆ°á»£t/thÃ¡ng Â· 60,000+ cÃ´ng ty' },
  { name: 'GSO', label: 'Tá»•ng cá»¥c Thá»‘ng kÃª (GSO)', detail: 'Lá»±c lÆ°á»£ng lao Ä‘á»™ng 53.3M ngÆ°á»i' },
  { name: 'Talentnet', label: 'Talentnetâ€“Mercer 2026', detail: 'Total Remuneration Survey Vietnam' },
  { name: 'NIC', label: 'NIC Global Salary Guide 2026', detail: '15 ngÃ nh Â· 8â€“10% tÄƒng lÆ°Æ¡ng' },
];

const SKILLS = [
  { id: 'english', label: 'Tiáº¿ng Anh chuyÃªn ngÃ nh B2+', boost: 0.12, pctBoost: 12 },
  { id: 'ai', label: 'á»¨ng dá»¥ng AI vÃ o quy trÃ¬nh', boost: 0.20, pctBoost: 22 },
  { id: 'lead', label: 'Quáº£n lÃ½ nhÃ³m / Team Lead', boost: 0.22, pctBoost: 18 },
  { id: 'cert', label: 'Chá»©ng chá»‰ chuyÃªn ngÃ nh quá»‘c táº¿', boost: 0.10, pctBoost: 8 },
];

const TIERS = [
  { name: 'Startup / SME', mul: 1.00, color: '#94a3b8', badge: 'ðŸ ' },
  { name: 'CÃ´ng ty ná»™i Ä‘á»‹a lá»›n', mul: 1.28, color: '#60a5fa', badge: 'ðŸ¢' },
  { name: 'FDI / Doanh nghiá»‡p nÆ°á»›c ngoÃ i', mul: 1.60, color: '#34d399', badge: 'ðŸŒ' },
  { name: 'MNC / Táº­p Ä‘oÃ n Ä‘a quá»‘c gia', mul: 2.05, color: '#fbbf24', badge: 'ðŸ†' },
];

// Scanning steps for the loading animation
const SCAN_STEPS: ScanStep[] = [
  { label: 'XÃ¡c thá»±c ngÃ nh nghá»...', detail: 'Äang khá»›p vá»›i cÆ¡ sá»Ÿ dá»¯ liá»‡u 1,000+ chá»©c danh' },
  { label: 'Äá»‘i chiáº¿u vá»›i 53.3M ngÆ°á»i lao Ä‘á»™ng...', detail: 'Truy váº¥n dá»¯ liá»‡u GSO Â· Adecco Â· ITviec Â· VietnamWorks' },
  { label: 'TÃ­nh toÃ¡n phÃ¢n vá»‹ thu nháº­p...', detail: 'Ãp dá»¥ng mÃ´ hÃ¬nh Normal Distribution' },
  { label: 'HoÃ n táº¥t! Äang táº£i káº¿t quáº£...', detail: 'Chuáº©n bá»‹ bÃ¡o cÃ¡o cÃ¡ nhÃ¢n hÃ³a' },
];

const AUDIENCE_PRESETS: AudiencePreset[] = [
  {
    id: 'office-growth',
    title: 'DÃ¢n vÄƒn phÃ²ng',
    shortLabel: 'VÄƒn phÃ²ng',
    subLabel: 'Deal / Ä‘á»•i viá»‡c',
    badge: 'Phá»• biáº¿n',
    description: 'DÃ nh cho marketing, sales, káº¿ toÃ¡n, HR, IT, admin vÃ  cÃ¡c vai trÃ² vÄƒn phÃ²ng muá»‘n benchmark lÆ°Æ¡ng.',
    experience: 'mid',
    marketLocation: 'hcm',
    workProvince: 'hcm',
    prompt: 'ÄÃ£ set Mid-level táº¡i TP.HCM. Chá»n nghá» vÄƒn phÃ²ng cá»§a báº¡n rá»“i nháº­p lÆ°Æ¡ng.',
  },
  {
    id: 'fresh-graduate',
    title: 'Sinh viÃªn má»›i tá»‘t nghiá»‡p',
    shortLabel: 'Má»›i tá»‘t nghiá»‡p',
    subLabel: 'Offer Ä‘áº§u Ä‘á»i',
    badge: 'Offer Ä‘áº§u Ä‘á»i',
    description: 'Nháº­p offer 8-15 triá»‡u, chá»n Ä‘Ãºng ngÃ nh, biáº¿t mÃ¬nh Ä‘ang bá»‹ tháº¥p hay á»•n so vá»›i thá»‹ trÆ°á»ng.',
    salary: '10000000',
    experience: 'junior',
    marketLocation: 'hcm',
    workProvince: 'hcm',
    prompt: 'ÄÃ£ set má»©c máº«u 10 triá»‡u. Chá»n ngÃ nh báº¡n Ä‘ang apply rá»“i quÃ©t Top %.',
  },
  {
    id: 'binh-duong-worker',
    title: 'CÃ´ng nhÃ¢n BÃ¬nh DÆ°Æ¡ng',
    shortLabel: 'CÃ´ng nhÃ¢n',
    subLabel: 'BÃ¬nh DÆ°Æ¡ng / FDI',
    badge: 'CÃ´ng nhÃ¢n / FDI',
    description: 'Map nhanh nhÃ³m váº­n hÃ nh sáº£n xuáº¥t, khu cÃ´ng nghiá»‡p, biáº¿t má»‘c nÃ o nÃªn xin tÄƒng lÆ°Æ¡ng.',
    salary: '9000000',
    experience: 'mid',
    marketLocation: 'industrial',
    workProvince: 'binh_duong',
    jobTitle: 'CÃ´ng nhÃ¢n váº­n hÃ nh mÃ¡y',
    prompt: 'ÄÃ£ set CÃ´ng nhÃ¢n váº­n hÃ nh mÃ¡y táº¡i cá»¥m BÃ¬nh DÆ°Æ¡ng/Äá»“ng Nai/Báº¯c Ninh.',
  },
];

const getRingColor = (p: number) => p <= 5 ? '#FFD700' : p <= 10 ? '#00E676' : p <= 20 ? '#40C4FF' : p <= 50 ? '#FF9100' : '#FF5252';
const fmtM = (n: number | null | undefined) => n ? `${(n / 1_000_000).toFixed(1)}M` : '?M';
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

const getGapData = (job: string, percent: number, dbData: SalaryData | null): GapData => {
  const j = job.toLowerCase();
  const top50 = dbData?.top_50 ?? 15_000_000;
  const top10 = dbData?.top_10 ?? top50 * 1.8;
  const base = {
    currentPays: fmtM(top50), topPays: fmtM(top10),
    roadmap: [
      { month: 'ThÃ¡ng 1', action: 'HoÃ n thÃ nh 1 khoÃ¡ AI Tool thá»±c hÃ nh (â‰¤ 20h) â€” Æ°u tiÃªn cÃ´ng cá»¥ liÃªn quan trá»±c tiáº¿p ngÃ nh.' },
      { month: 'ThÃ¡ng 2', action: 'Ãp dá»¥ng vÃ o 1 quy trÃ¬nh thá»±c táº¿, Ä‘o lÆ°á»ng thá»i gian/chi phÃ­ tiáº¿t kiá»‡m báº±ng sá»‘ liá»‡u cá»¥ thá»ƒ.' },
      { month: 'ThÃ¡ng 3', action: 'ÄÆ°a káº¿t quáº£ Ä‘o Ä‘Æ°á»£c vÃ o báº£n Ä‘Ã¡nh giÃ¡ nÄƒng lá»±c cuá»‘i ká»³ â€” dáº«n nguá»“n VSPI khi Ä‘Ã m phÃ¡n.' },
    ]
  };
  if (j.includes('káº¿ toÃ¡n') || j.includes('tÃ i chÃ­nh')) return {
    ...base,
    currentSkill: 'Duy trÃ¬ sá»• sÃ¡ch, Ä‘á»‘i soÃ¡t thá»§ cÃ´ng, láº­p bÃ¡o cÃ¡o Ä‘á»‹nh ká»³.',
    missingSkill: 'Tá»± Ä‘á»™ng hoÃ¡ bÃ¡o cÃ¡o báº±ng Excel Copilot/Python â€” giáº£m 60% thá»i gian xá»­ lÃ½ sá»‘ liá»‡u.',
    roadmap: [
      { month: 'ThÃ¡ng 1', action: 'HoÃ n thÃ nh khoÃ¡ Excel Copilot + Power Query cÆ¡ báº£n (8â€“10h trá»±c tuyáº¿n).' },
      { month: 'ThÃ¡ng 2', action: 'XÃ¢y dashboard tá»± Ä‘á»™ng 1 bÃ¡o cÃ¡o Ä‘ang lÃ m thá»§ cÃ´ng, Ä‘o thá»i gian tiáº¿t kiá»‡m.' },
      { month: 'ThÃ¡ng 3', action: 'TrÃ¬nh bÃ y vá»›i trÆ°á»Ÿng phÃ²ng â€” Ä‘á» xuáº¥t tÄƒng lÆ°Æ¡ng kÃ¨m sá»‘ liá»‡u tiáº¿t kiá»‡m chi phÃ­.' },
    ]
  };
  if (j.includes('marketing') || j.includes('content') || j.includes('seo')) return {
    ...base,
    currentSkill: 'Sáº£n xuáº¥t ná»™i dung thá»§ cÃ´ng, bÃ¡o cÃ¡o káº¿t quáº£ theo cáº£m tÃ­nh.',
    missingSkill: 'Scale content 5x báº±ng AI + bÃ¡o cÃ¡o ROI chÃ­nh xÃ¡c theo sá»‘ â€” ká»¹ nÄƒng tÃ¡ch biá»‡t Top 20% vs 80% cÃ²n láº¡i.',
    roadmap: [
      { month: 'ThÃ¡ng 1', action: 'Thiáº¿t láº­p quy trÃ¬nh content vá»›i Claude/ChatGPT â€” tÄƒng output khÃ´ng tÄƒng giá» lÃ m.' },
      { month: 'ThÃ¡ng 2', action: 'BÃ¡o cÃ¡o káº¿t quáº£ A/B test + conversion rate theo sá»‘ cá»¥ thá»ƒ lÃªn cáº¥p trÃªn.' },
      { month: 'ThÃ¡ng 3', action: 'Äá» xuáº¥t tÄƒng lÆ°Æ¡ng vá»›i dáº«n chá»©ng ROI Ä‘o Ä‘Æ°á»£c tá»« chiáº¿n dá»‹ch AI-assisted.' },
    ]
  };
  if (j.includes('nhÃ¢n sá»±') || j.includes('hr') || j.includes('tuyá»ƒn dá»¥ng')) return {
    ...base,
    currentSkill: 'Quáº£n lÃ½ hÃ nh chÃ­nh nhÃ¢n sá»±, tuyá»ƒn dá»¥ng theo quy trÃ¬nh thá»§ cÃ´ng.',
    missingSkill: 'People Analytics â€” dÃ¹ng data Ä‘á»ƒ tÆ° váº¥n chiáº¿n lÆ°á»£c nhÃ¢n sá»± cho C-level. Nháº£y tá»« HR Ops lÃªn HRBP.',
    roadmap: [
      { month: 'ThÃ¡ng 1', action: 'Há»c Power BI cÆ¡ báº£n + xÃ¢y dashboard headcount/turnover tá»± Ä‘á»™ng.' },
      { month: 'ThÃ¡ng 2', action: 'TrÃ¬nh bÃ y 1 insight tá»« data nhÃ¢n sá»± lÃªn Ban GiÃ¡m Ä‘á»‘c â€” bÆ°á»›c Ä‘áº§u positioning HRBP.' },
      { month: 'ThÃ¡ng 3', action: 'Benchmark lÆ°Æ¡ng toÃ n cÃ´ng ty vs thá»‹ trÆ°á»ng â€” xuáº¥t trÃ¬nh Ä‘á» xuáº¥t Ä‘iá»u chá»‰nh cÃ³ data.' },
    ]
  };
  if (j.includes('giÃ¡o viÃªn') || j.includes('giáº£ng')) return {
    ...base,
    currentSkill: 'Dáº¡y theo giÃ¡o Ã¡n chuáº©n, cháº¥m bÃ i thá»§ cÃ´ng, tÆ° váº¥n há»c sinh theo kinh nghiá»‡m.',
    missingSkill: 'Thiáº¿t káº¿ vÃ  váº­n hÃ nh khoÃ¡ há»c online â€” táº¡o thu nháº­p thá»¥ Ä‘á»™ng 5â€“15M/thÃ¡ng song song lÆ°Æ¡ng chÃ­nh.',
    roadmap: [
      { month: 'ThÃ¡ng 1', action: 'Quay 5â€“10 video bÃ i giáº£ng ngáº¯n (15â€“20 phÃºt), dÃ¹ng AI tÃ³m táº¯t + táº¡o quiz.' },
      { month: 'ThÃ¡ng 2', action: 'ÄÄƒng lÃªn Edumall/Kyna/YouTube â€” Ä‘o lÆ°á»£ng ngÆ°á»i xem vÃ  enrollment.' },
      { month: 'ThÃ¡ng 3', action: 'Pitch vá»›i nhÃ  trÆ°á»ng: trá»Ÿ thÃ nh giÃ¡o viÃªn phá»¥ trÃ¡ch digital learning, yÃªu cáº§u phá»¥ cáº¥p.' },
    ]
  };
  return {
    ...base,
    currentSkill: 'Thá»±c hiá»‡n cÃ´ng viá»‡c chuyÃªn mÃ´n theo quy trÃ¬nh hiá»‡n táº¡i, dá»±a vÃ o kinh nghiá»‡m tÃ­ch luá»¹.',
    missingSkill: 'Tá»± Ä‘á»™ng hoÃ¡ â‰¥ 1 quy trÃ¬nh thá»§ cÃ´ng báº±ng AI â€” táº¡o chá»‰ sá»‘ "tiáº¿t kiá»‡m X giá»/tuáº§n" cá»¥ thá»ƒ Ä‘á»ƒ Ä‘Ã m phÃ¡n.',
  };
};

/* â•â•â• DATA SOURCE MODAL â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function DataSourceModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#0f1219] border border-white/20 rounded-3xl p-6 max-w-sm w-full shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-mono font-black text-[#e8b84b] uppercase tracking-widest">PhÆ°Æ¡ng phÃ¡p tÃ­nh</h3>
          <button onClick={onClose} className="text-[#f0ede8]/45 hover:text-[#f0ede8] text-lg leading-none">âœ•</button>
        </div>
        <div className="space-y-3 text-[11px] text-[#f0ede8]/70 leading-relaxed">
          <p><strong className="text-[#f0ede8]">Nguá»“n dá»¯ liá»‡u chÃ­nh:</strong></p>
          <ul className="list-disc pl-4 space-y-1.5">
            <li><strong className="text-[#f0ede8]">GSO 2024:</strong> Dá»¯ liá»‡u lá»±c lÆ°á»£ng lao Ä‘á»™ng 53.3 triá»‡u ngÆ°á»i tá»« Tá»•ng cá»¥c Thá»‘ng kÃª Viá»‡t Nam.</li>
            <li><strong className="text-[#f0ede8]">Adecco Vietnam 2026:</strong> Kháº£o sÃ¡t 1,000+ chá»©c danh, 12th Edition.</li>
            <li><strong className="text-[#f0ede8]">ITviec:</strong> BÃ¡o cÃ¡o lÆ°Æ¡ng IT theo vai trÃ², tá»‰nh thÃ nh vÃ  kinh nghiá»‡m.</li>
            <li><strong className="text-[#f0ede8]">VietnamWorks/Navigos, CareerViet, TopCV:</strong> Dá»¯ liá»‡u tá»« há»‡ sinh thÃ¡i tuyá»ƒn dá»¥ng vÃ  salary lookup.</li>
            <li><strong className="text-[#f0ede8]">ManpowerGroup, Reeracoen, PERSOLKELLY:</strong> Salary guide theo ngÃ nh vÃ  cáº¥p báº­c.</li>
            <li><strong className="text-[#f0ede8]">Talentnetâ€“Mercer:</strong> Tham chiáº¿u total remuneration á»Ÿ nhÃ³m doanh nghiá»‡p lá»›n.</li>
          </ul>
          <p className="border-t border-white/10 pt-3"><strong className="text-[#f0ede8]">PhÆ°Æ¡ng phÃ¡p tÃ­nh percentile:</strong> Dá»¯ liá»‡u lÆ°Æ¡ng Ä‘Æ°á»£c chuáº©n hÃ³a theo mÃ´ hÃ¬nh Normal Distribution, tá»•ng há»£p tá»« 6 nguá»“n bÃ¡o cÃ¡o chÃ­nh thá»‘ng. Vá»‹ trÃ­ phÃ¢n vá»‹ Ä‘Æ°á»£c tÃ­nh theo lÆ°Æ¡ng gross thÃ¡ng, cáº­p nháº­t theo chu ká»³ quÃ½.</p>
        </div>
        <button onClick={onClose} className="mt-4 w-full bg-[#161b26] border border-white/10 text-[#f0ede8]/70 text-[11px] font-mono py-2.5 rounded-xl hover:border-[#e8b84b]/30 transition-colors">ÄÃ³ng</button>
      </div>
    </div>
  );
}

/* â•â•â• SHARE CARD â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function PercentileLadderCard({ benchmark, percent }: { benchmark: BenchmarkMeta | null; percent: number }) {
  const fallback = [
    'Top 100', 'Top 80', 'Top 70', 'Top 60', 'Top 50',
    'Top 40', 'Top 30', 'Top 20', 'Top 10', 'Top 5', 'Top 1',
  ].map(label => ({ label, salary: null, locked: Number(label.replace('Top ', '')) <= 10, active: Number(label.replace('Top ', '')) === percent }));
  const rows = benchmark?.thresholdPreview?.length ? benchmark.thresholdPreview : fallback;
  const nextTarget = benchmark?.nextTargetSalary ? fmtM(benchmark.nextTargetSalary) : null;

  return (
    <div className="bg-[#0f1219] border border-white/10 rounded-3xl p-5">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <p className="text-[10px] font-mono font-black text-[#e8b84b] uppercase tracking-widest">Báº£n Ä‘á»“ Top %</p>
          <p className="text-[11px] text-[#f0ede8]/45 mt-1">Báº¡n Ä‘ang á»Ÿ Ä‘Ã¢u trÃªn thang thu nháº­p lao Ä‘á»™ng Viá»‡t Nam</p>
        </div>
        {nextTarget && (
          <div className="text-right shrink-0">
            <p className="text-[9px] text-[#f0ede8]/35 uppercase font-mono">Má»‘c káº¿ tiáº¿p</p>
            <p className="text-sm font-black text-green-400">{nextTarget}/thÃ¡ng</p>
          </div>
        )}
      </div>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.label} className={`flex items-center gap-3 rounded-xl px-3 py-2 border transition-colors ${row.active ? 'bg-[#e8b84b]/12 border-[#e8b84b]/45' : 'bg-[#161b26] border-white/8'}`}>
            <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${row.active ? 'bg-[#e8b84b]' : 'bg-[#f0ede8]/18'}`} />
            <p className={`text-xs font-mono font-black w-16 ${row.active ? 'text-[#e8b84b]' : 'text-[#f0ede8]/55'}`}>{row.label}</p>
            <div className="flex-1 h-1.5 bg-[#0a0c10] rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${row.active ? 'bg-[#e8b84b]' : 'bg-[#f0ede8]/14'}`}
                style={{ width: `${Math.max(12, 100 - Number(row.label.replace('Top ', '')))}%` }}
              />
            </div>
            <p className={`text-[11px] font-mono min-w-[64px] text-right ${row.locked ? 'text-[#e8b84b]' : 'text-[#f0ede8]/55'}`}>
              {row.locked ? 'Premium' : row.salary ? fmtM(row.salary) : '...'}
            </p>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-[#f0ede8]/35 leading-relaxed mt-3">
        Free scan hiá»ƒn thá»‹ vá»‹ trÃ­ vÃ  má»‘c gáº§n nháº¥t. Premium má»Ÿ khÃ³a toÃ n bá»™ má»‘c Top 10, Top 5, Top 1 vÃ  nguá»“n benchmark chi tiáº¿t.
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
    benchmark.matchType === 'exact' ? 'Khá»›p trá»±c tiáº¿p chá»©c danh' :
    benchmark.matchType === 'alias' ? 'Khá»›p qua alias nghá» nghiá»‡p' :
    benchmark.matchType === 'similar_role' ? 'Benchmark tá»« vai trÃ² tÆ°Æ¡ng Ä‘Æ°Æ¡ng' :
    benchmark.matchType === 'industry_estimate' ? 'Æ¯á»›c tÃ­nh theo nhÃ³m ngÃ nh' :
    benchmark.matchType === 'legacy_salary_data' ? 'Benchmark tá»« dá»¯ liá»‡u VSPI cÅ©' :
    'Æ¯á»›c tÃ­nh thá»‹ trÆ°á»ng chung';

  return (
    <div className={`rounded-3xl border p-5 ${tone}`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-mono font-black uppercase tracking-widest opacity-80">Äá»™ tin cáº­y dá»¯ liá»‡u</p>
          <h3 className="mt-1 text-2xl font-black text-[#f0ede8]">{benchmark.confidenceScore}/100</h3>
          <p className="mt-1 text-xs font-bold">{benchmark.confidenceLabel} Â· {matchLabel}</p>
        </div>
        <Link
          href="/methodology"
          target="_blank"
          className="shrink-0 rounded-xl border border-white/10 bg-[#0a0c10]/45 px-3 py-2 text-[10px] font-black text-[#f0ede8]/70 hover:border-[#e8b84b]/40 hover:text-[#e8b84b]"
        >
          CÃ¡ch tÃ­nh
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
          NgÃ nh/khu vá»±c nÃ y Ä‘ang á»Ÿ tráº¡ng thÃ¡i beta dá»¯ liá»‡u. HÃ£y dÃ¹ng káº¿t quáº£ nhÆ° Ä‘iá»ƒm tham chiáº¿u khi deal lÆ°Æ¡ng, khÃ´ng pháº£i cam káº¿t tuyá»‡t Ä‘á»‘i.
        </p>
      )}
    </div>
  );
}

function BetaFeedbackPanel({ paidCount, dailyViews }: { paidCount: number; dailyViews: number }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-[#0f1219] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-mono font-black uppercase tracking-widest text-[#e8b84b]">Beta feedback tháº­t</p>
          <h3 className="mt-1 text-base font-black text-[#f0ede8]">KhÃ´ng dÃ¹ng testimonial áº£o.</h3>
        </div>
        <span className="rounded-full border border-[#e8b84b]/30 bg-[#e8b84b]/10 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-[#e8b84b]">
          Beta
        </span>
      </div>
      <p className="mt-3 text-xs leading-5 text-[#f0ede8]/62">
        VSPI chá»‰ hiá»ƒn thá»‹ pháº£n há»“i khi ngÆ°á»i dÃ¹ng beta cho phÃ©p trÃ­ch dáº«n. Giai Ä‘oáº¡n hiá»‡n táº¡i Æ°u tiÃªn sá»‘ tháº­t:
        lÆ°á»£t mua, lÆ°á»£t scan hÃ´m nay, lá»—i thanh toÃ¡n vÃ  pháº£n há»“i support.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        <div className="rounded-2xl border border-white/10 bg-[#161b26] px-3 py-3">
          <p className="text-[9px] font-mono uppercase tracking-wider text-[#f0ede8]/35">Paid beta</p>
          <p className="mt-1 text-lg font-black text-[#e8b84b]">{paidCount.toLocaleString('vi-VN')}</p>
          <p className="text-[10px] text-[#f0ede8]/42">theo DB tháº­t</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#161b26] px-3 py-3">
          <p className="text-[9px] font-mono uppercase tracking-wider text-[#f0ede8]/35">Scan hÃ´m nay</p>
          <p className="mt-1 text-lg font-black text-[#f0ede8]">{dailyViews.toLocaleString('vi-VN')}</p>
          <p className="text-[10px] text-[#f0ede8]/42">khÃ´ng baseline áº£o</p>
        </div>
      </div>
    </div>
  );
}

function JobJumpMapTeaser({ job, salary, percent }: { job: string; salary: number; percent: number }) {
  if (!job || salary <= 0) return null;
  const map = buildJobJumpMap(job, salary, percent);
  const firstRole = map.targetRoles[0];
  const lockedRoles = map.targetRoles.slice(1);

  return (
    <div className="bg-[#0f1219] border border-[#e8b84b]/25 rounded-3xl p-5 relative overflow-hidden">
      <div className="absolute top-0 right-0 w-32 h-32 bg-[#e8b84b]/8 rounded-full blur-3xl pointer-events-none" />
      <div className="relative z-10">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-[10px] font-mono font-black text-[#e8b84b] uppercase tracking-widest">Job Jump Map</p>
            <h3 className="text-base font-black text-[#f0ede8] mt-1 leading-tight">KhÃ´ng cáº§n crawler. Cáº§n biáº¿t nÃªn nháº£y sang Ä‘Ã¢u Ä‘á»ƒ lÃªn tiá»n.</h3>
          </div>
          <span className="shrink-0 text-[9px] font-mono font-black text-[#0a0c10] bg-[#e8b84b] px-2 py-1 rounded-full">Premium</span>
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
          {lockedRoles.map(role => (
            <div key={role.title} className="relative bg-[#161b26] border border-white/8 rounded-2xl px-4 py-3 overflow-hidden">
              <div className="blur-[3px] select-none pointer-events-none">
                <p className="text-sm font-bold text-[#f0ede8]/70">{role.title}</p>
                <p className="text-[10px] text-[#f0ede8]/40 mt-1">{role.why}</p>
              </div>
              <div className="absolute inset-0 flex items-center justify-center bg-[#161b26]/35">
                <span className="text-[10px] font-mono font-black text-[#e8b84b] bg-[#0f1219]/90 border border-[#e8b84b]/25 rounded-full px-3 py-1.5">
                  Má»Ÿ khÃ³a 29k Ä‘á»ƒ xem Ä‘á»§ hÆ°á»›ng
                </span>
              </div>
            </div>
          ))}
        </div>

        <p className="text-[10px] text-[#f0ede8]/35 leading-relaxed mt-3">
          Premium má»Ÿ thÃªm keyword apply, bullet CV vÃ  cÃ¢u tráº£ lá»i má»©c lÆ°Æ¡ng mong muá»‘n. Roadmap 79k biáº¿n map nÃ y thÃ nh task tá»«ng tuáº§n.
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
      ctx.fillText('thu nháº­p táº¡i Viá»‡t Nam', 600, 420);

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
      ctx.fillText('top-percent-scanner.vercel.app', 600, 580);

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
        const shareUrl = `https://top-percent-scanner.vercel.app?utm_source=share&utm_medium=result_card&pct=${percent}&job=${encodeURIComponent(job)}&confidence=${benchmark?.confidenceScore ?? ''}`;
        const shareText = `Toi dang o Top ${percent}% thu nhap tai Viet Nam. Anh chia se nay khong hien thi luong ca nhan.`;

        if (navigator.share && navigator.canShare({ files: [new File([blob], 'vspi-result.png', { type: 'image/png' })] })) {
          await navigator.share({ title: 'Káº¿t quáº£ VSPI Scanner', text: shareText, url: shareUrl, files: [new File([blob], 'vspi-result.png', { type: 'image/png' })] });
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
        <><div className="w-4 h-4 border-2 border-[#e8b84b] border-t-transparent rounded-full animate-spin" /> Äang táº¡o áº£nh...</>
      ) : (
        <><span>ðŸ“¤</span> Chia sáº» káº¿t quáº£</>
      )}
    </button>
  );
}

/* â•â•â• GROUP COMPARE â€” So sÃ¡nh áº©n danh vá»›i nhÃ³m báº¡n â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
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
      if (!res.ok) { setError(data.error || 'Lá»—i táº¡o nhÃ³m'); setGroupState('idle'); return; }
      setGroupData({ groupId: data.groupId, members: data.members.map((m: any, i: number) => ({ ...m, rank: i + 1 })), yourRank: data.yourRank, totalMembers: data.totalMembers });
      setShareUrl(data.shareUrl);
      setGroupState('created');
    } catch { setError('Lá»—i káº¿t ná»‘i'); setGroupState('idle'); }
  };

  const handleJoin = async (code?: string) => {
    const id = code || joinCode;
    if (!id || id.length !== 6) { setError('MÃ£ nhÃ³m 6 kÃ½ tá»±'); return; }
    setGroupState('joining');
    setError('');
    try {
      const res = await fetch('/api/group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'join', groupId: id, job_title: job, percent, industry }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'NhÃ³m khÃ´ng tá»“n táº¡i'); setGroupState('idle'); return; }
      setGroupData({ groupId: data.groupId, members: data.members.map((m: any, i: number) => ({ ...m, rank: i + 1 })), yourRank: data.yourRank, totalMembers: data.totalMembers });
      setGroupState('joined');
    } catch { setError('Lá»—i káº¿t ná»‘i'); setGroupState('idle'); }
  };

  const handleShare = () => {
    const text = `TÃ´i Ä‘ang Top ${percent}% thu nháº­p â€” báº¡n Ä‘ang á»Ÿ Ä‘Ã¢u? So sÃ¡nh áº©n danh ðŸ‘‡`;
    if (navigator.share) {
      navigator.share({ title: 'VSPI So sÃ¡nh áº©n danh', text, url: shareUrl });
    } else {
      navigator.clipboard.writeText(shareUrl);
    }
  };

  // â”€â”€ IDLE: chÆ°a táº¡o/join group â”€â”€
  if (groupState === 'idle') return (
    <div className="bg-[#0f1219] border border-blue-500/20 rounded-3xl p-5">
      <div className="flex items-center gap-2.5 mb-3">
        <span className="text-xl">ðŸ‘¥</span>
        <div>
          <p className="text-sm font-bold text-[#f0ede8]">So sÃ¡nh áº©n danh vá»›i nhÃ³m báº¡n</p>
          <p className="text-[10px] text-[#f0ede8]/45">Ai Ä‘ang Top cao hÆ¡n? KhÃ´ng lá»™ tÃªn, khÃ´ng lá»™ lÆ°Æ¡ng.</p>
        </div>
      </div>
      <div className="flex gap-2 mb-2">
        <button onClick={handleCreate}
          className="flex-1 bg-blue-600 text-white font-bold py-2.5 rounded-xl text-xs hover:bg-blue-700 transition-colors">
          Táº¡o nhÃ³m má»›i
        </button>
        <div className="flex-1 flex gap-1.5">
          <input
            type="text" maxLength={6} placeholder="MÃ£ nhÃ³m"
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

  // â”€â”€ CREATING/JOINING: loading â”€â”€
  if (groupState === 'creating' || groupState === 'joining') return (
    <div className="bg-[#0f1219] border border-blue-500/20 rounded-3xl p-5 flex items-center justify-center gap-3">
      <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-[#f0ede8]/60">{groupState === 'creating' ? 'Äang táº¡o nhÃ³m...' : 'Äang tham gia...'}</p>
    </div>
  );

  // â”€â”€ CREATED/JOINED: hiá»‡n leaderboard â”€â”€
  if (!groupData) return null;
  return (
    <div className="bg-[#0f1219] border border-blue-500/30 rounded-3xl overflow-hidden">
      {/* Header */}
      <div className="bg-blue-600/10 border-b border-blue-500/20 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg">ðŸ‘¥</span>
          <div>
            <p className="text-xs font-bold text-[#f0ede8]">NhÃ³m so sÃ¡nh áº©n danh</p>
            <p className="text-[9px] font-mono text-blue-400">MÃ£: {groupData.groupId} Â· {groupData.totalMembers}/10 ngÆ°á»i</p>
          </div>
        </div>
        {groupState === 'created' && (
          <button onClick={handleShare}
            className="bg-blue-600 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors">
            ðŸ“¤ Má»i báº¡n bÃ¨
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
                {i === 0 ? 'ðŸ¥‡' : i === 1 ? 'ðŸ¥ˆ' : i === 2 ? 'ðŸ¥‰' : `#${i + 1}`}
              </span>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-bold truncate ${isYou ? 'text-[#e8b84b]' : 'text-[#f0ede8]'}`}>
                  {isYou ? 'â† Báº¡n' : `NgÆ°á»i ${i + 1}`}
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
            <p className="text-[11px] text-[#f0ede8]/40 italic">Äang chá» báº¡n bÃ¨ tham gia...</p>
            <button onClick={handleShare}
              className="mt-2 bg-blue-600/20 border border-blue-500/40 text-blue-300 text-[11px] font-bold px-4 py-2 rounded-xl hover:bg-blue-600/30 transition-colors">
              ðŸ“¤ Gá»­i link cho 3 Ä‘á»“ng nghiá»‡p
            </button>
          </div>
        )}
      </div>

      {/* Footer: share CTA */}
      {groupData.totalMembers > 1 && (
        <div className="bg-[#161b26] border-t border-white/5 px-5 py-3 text-center">
          <p className="text-[10px] text-[#f0ede8]/40">
            {groupData.yourRank === 1
              ? 'ðŸ† Báº¡n Ä‘ang dáº«n Ä‘áº§u nhÃ³m!'
              : `Báº¡n Ä‘ang xáº¿p thá»© ${groupData.yourRank}/${groupData.totalMembers} â€” má»i thÃªm báº¡n Ä‘á»ƒ so sÃ¡nh`}
          </p>
        </div>
      )}
    </div>
  );
}

/* â•â•â• INDUSTRY SWITCH CALCULATOR â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function IndustrySwitchCard({ currentJob, currentPercent, salary }: { currentJob: string; currentPercent: number; salary: number }) {
  const [showSwitch, setShowSwitch] = useState(false);
  const industries = [
    { name: 'CÃ´ng nghá»‡ thÃ´ng tin', medianMul: 1.6, icon: 'ðŸ’»' },
    { name: 'TÃ i chÃ­nh / NgÃ¢n hÃ ng', medianMul: 1.3, icon: 'ðŸ¦' },
    { name: 'Marketing', medianMul: 1.0, icon: 'ðŸ“±' },
    { name: 'Kinh doanh / BÃ¡n hÃ ng', medianMul: 1.2, icon: 'ðŸ¤' },
    { name: 'Y táº¿', medianMul: 1.1, icon: 'âš•ï¸' },
    { name: 'GiÃ¡o dá»¥c', medianMul: 0.7, icon: 'ðŸ“š' },
    { name: 'Sáº£n xuáº¥t / Ká»¹ thuáº­t', medianMul: 1.1, icon: 'ðŸ”§' },
    { name: 'Thiáº¿t káº¿ / SÃ¡ng táº¡o', medianMul: 1.15, icon: 'ðŸŽ¨' },
  ];

  // TÃ­nh percentile Æ°á»›c tÃ­nh á»Ÿ ngÃ nh khÃ¡c
  const calculateSwitch = (mul: number) => {
    // LÆ°Æ¡ng giá»¯ nguyÃªn, nhÆ°ng median ngÃ nh má»›i khÃ¡c â†’ vá»‹ trÃ­ % thay Ä‘á»•i
    const adjustedPercent = Math.min(80, Math.max(5, Math.round(currentPercent * (1 / mul))));
    const salaryGain = Math.round(salary * (mul - 1));
    return { percent: adjustedPercent, gain: salaryGain };
  };

  if (!showSwitch) return (
    <button onClick={() => setShowSwitch(true)}
      className="w-full bg-[#0f1219] border border-purple-500/20 rounded-3xl p-5 text-left hover:border-purple-500/40 transition-colors group">
      <div className="flex items-center gap-3">
        <span className="text-2xl group-hover:scale-110 transition-transform">ðŸ”€</span>
        <div>
          <p className="text-sm font-bold text-[#f0ede8]">Náº¿u nháº£y ngÃ nh â€” Top máº¥y %?</p>
          <p className="text-[10px] text-[#f0ede8]/45">CÃ¹ng má»©c lÆ°Æ¡ng, á»Ÿ ngÃ nh khÃ¡c báº¡n Ä‘á»©ng á»Ÿ Ä‘Ã¢u?</p>
        </div>
        <span className="ml-auto text-[#f0ede8]/30 text-xs">Xem â†’</span>
      </div>
    </button>
  );

  return (
    <div className="bg-[#0f1219] border border-purple-500/25 rounded-3xl overflow-hidden">
      <div className="px-5 pt-5 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xl">ðŸ”€</span>
          <p className="text-sm font-bold text-[#f0ede8]">Náº¿u nháº£y ngÃ nh?</p>
        </div>
        <button onClick={() => setShowSwitch(false)} className="text-[#f0ede8]/30 text-xs hover:text-[#f0ede8]/60">Thu gá»n</button>
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
                    {better ? 'â†‘ Vá»‹ trÃ­ tá»‘t hÆ¡n' : 'â†“ Cáº¡nh tranh hÆ¡n'}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-black ${better ? 'text-green-400' : 'text-orange-400'}`}>
                    Top {result.percent}%
                  </p>
                  {result.gain > 0 && (
                    <p className="text-[9px] text-green-400/70">+{(result.gain / 1_000_000).toFixed(1)}M tiá»m nÄƒng</p>
                  )}
                </div>
              </div>
            );
          })}
        <p className="text-[9px] text-[#f0ede8]/30 text-center pt-1">
          Æ¯á»›c tÃ­nh dá»±a trÃªn dáº£i lÆ°Æ¡ng trung vá»‹ ngÃ nh Â· Chá»‰ mang tÃ­nh tham kháº£o
        </p>
      </div>
    </div>
  );
}

/* â•â•â• SALARY TIMELINE â€” ÄÆ°á»ng cong 3 nÄƒm â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function SalaryTimelineCard({ salary, percent, job }: { salary: number; percent: number; job: string }) {
  // TÃ­nh trajectory dá»±a trÃªn vá»‹ trÃ­ hiá»‡n táº¡i
  const growthRate = percent <= 10 ? 0.12 : percent <= 20 ? 0.10 : percent <= 50 ? 0.08 : 0.06;
  const stagnantRate = 0.03; // náº¿u Ä‘á»©ng yÃªn, chá»‰ tÄƒng theo láº¡m phÃ¡t

  const years = [0, 1, 2, 3];
  const optimalPath = years.map(y => Math.round(salary * Math.pow(1 + growthRate, y)));
  const stagnantPath = years.map(y => Math.round(salary * Math.pow(1 + stagnantRate, y)));
  const maxSal = optimalPath[3];

  // Simple bar chart
  return (
    <div className="bg-[#0f1219] border border-cyan-500/20 rounded-3xl p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <span className="text-xl">ðŸ“ˆ</span>
        <div>
          <p className="text-sm font-bold text-[#f0ede8]">LÆ°Æ¡ng cá»§a báº¡n trong 3 nÄƒm tá»›i</p>
          <p className="text-[10px] text-[#f0ede8]/45">Äi Ä‘Ãºng hÆ°á»›ng vs. Ä‘á»©ng yÃªn</p>
        </div>
      </div>

      <div className="space-y-3">
        {years.map((y, i) => {
          const optW = (optimalPath[i] / maxSal) * 100;
          const stagW = (stagnantPath[i] / maxSal) * 100;
          return (
            <div key={i} className="space-y-1">
              <div className="flex justify-between text-[10px]">
                <span className="text-[#f0ede8]/45 font-mono">{y === 0 ? 'Hiá»‡n táº¡i' : `+${y} nÄƒm`}</span>
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
                  <span className="text-[#f0ede8]/25">Äá»©ng yÃªn: {(stagnantPath[i] / 1_000_000).toFixed(1)}M</span>
                  <span className="text-green-400/70">
                    +{((optimalPath[i] - stagnantPath[i]) / 1_000_000).toFixed(1)}M náº¿u hÃ nh Ä‘á»™ng
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
          Sau 3 nÄƒm, khoáº£ng cÃ¡ch giá»¯a <strong className="text-[#e8b84b]">hÃ nh Ä‘á»™ng</strong> vÃ  <strong className="text-[#f0ede8]/40">Ä‘á»©ng yÃªn</strong> lÃ 
        </p>
        <p className="text-xl font-black text-cyan-400">
          {((optimalPath[3] - stagnantPath[3]) / 1_000_000).toFixed(1)} triá»‡u/thÃ¡ng
        </p>
        <p className="text-[9px] text-[#f0ede8]/30 mt-0.5">
          = {((optimalPath[3] - stagnantPath[3]) * 12 / 1_000_000).toFixed(0)} triá»‡u/nÄƒm báº¡n Ä‘ang bá» lá»¡
        </p>
      </div>
    </div>
  );
}

/* â•â•â• NEGOTIATION POWER SCORE â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function NegotiationScoreCard({ job, percent, experience }: { job: string; percent: number; experience: string }) {
  // TÃ­nh Ä‘iá»ƒm leverage 1â€“10 dá»±a trÃªn 4 yáº¿u tá»‘
  const factors = [
    {
      name: 'Vá»‹ trÃ­ thá»‹ trÆ°á»ng',
      score: percent <= 10 ? 9 : percent <= 20 ? 7 : percent <= 50 ? 5 : 3,
      detail: percent <= 20 ? 'Top performer â€” cÃ´ng ty khÃ³ thay tháº¿' : 'Dá»… bá»‹ thay tháº¿ náº¿u khÃ´ng nÃ¢ng giÃ¡ trá»‹',
    },
    {
      name: 'Nhu cáº§u tuyá»ƒn dá»¥ng ngÃ nh',
      score: /it|developer|data|ai|cloud|software/i.test(job) ? 9
        : /marketing|sales|kinh doanh/i.test(job) ? 7
        : /giÃ¡o viÃªn|y tÃ¡|Ä‘iá»u dÆ°á»¡ng/i.test(job) ? 5 : 6,
      detail: /it|developer/i.test(job) ? 'Thiáº¿u há»¥t nhÃ¢n lá»±c nghiÃªm trá»ng â€” báº¡n cÃ³ quyá»n chá»n' : 'Nhu cáº§u tuyá»ƒn á»•n Ä‘á»‹nh',
    },
    {
      name: 'Kinh nghiá»‡m',
      score: experience === 'senior' ? 8 : experience === 'mid' ? 6 : 4,
      detail: experience === 'senior' ? 'Kinh nghiá»‡m dÃ y â€” khÃ³ thay tháº¿' : 'Cáº§n thÃªm track record Ä‘á»ƒ negotiate máº¡nh',
    },
    {
      name: 'Thá»i Ä‘iá»ƒm thá»‹ trÆ°á»ng',
      score: 7, // 2026 lÃ  nÄƒm tá»‘t Ä‘á»ƒ Ä‘Ã m phÃ¡n (NIC Guide)
      detail: 'Q1-Q2/2026: thá»‹ trÆ°á»ng nÃ³ng, 80% DN tÄƒng tuyá»ƒn',
    },
  ];

  const totalScore = Math.round(factors.reduce((sum, f) => sum + f.score, 0) / factors.length);
  const scoreColor = totalScore >= 8 ? 'text-green-400' : totalScore >= 6 ? 'text-[#e8b84b]' : 'text-orange-400';
  const scoreLabel = totalScore >= 8 ? 'Ráº¥t máº¡nh â€” nÃªn Ä‘Ã m phÃ¡n NGAY' : totalScore >= 6 ? 'KhÃ¡ tá»‘t â€” chuáº©n bá»‹ sá»‘ liá»‡u rá»“i Ä‘Ã m phÃ¡n' : 'Cáº§n nÃ¢ng giÃ¡ trá»‹ trÆ°á»›c â€” Ä‘Ã m phÃ¡n sau 3 thÃ¡ng';

  return (
    <div className="bg-[#0f1219] border border-[#e8b84b]/15 rounded-3xl p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <span className="text-xl">âš¡</span>
        <div>
          <p className="text-sm font-bold text-[#f0ede8]">Negotiation Power Score</p>
          <p className="text-[10px] text-[#f0ede8]/45">Báº¡n cÃ³ Ä‘á»§ leverage Ä‘á»ƒ Ä‘Ã m phÃ¡n lÆ°Æ¡ng bÃ¢y giá»?</p>
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
            ? 'ðŸ’¡ Má»Ÿ khÃ³a bÃ¡o cÃ¡o Premium Ä‘á»ƒ nháº­n ká»‹ch báº£n Ä‘Ã m phÃ¡n lÆ°Æ¡ng nguyÃªn vÄƒn'
            : 'ðŸ’¡ Má»Ÿ khÃ³a bÃ¡o cÃ¡o Premium Ä‘á»ƒ xem lá»™ trÃ¬nh nÃ¢ng score lÃªn 8+'}
        </p>
      </div>
    </div>
  );
}

/* â•â•â• TEASER ZONE â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function TeaserZone({ fullName, job, percent, lostMoney, dbData, paidCount, dailyViews }: TeaserProps) {
  const top50 = dbData?.top_50 ?? null; const top20 = dbData?.top_20 ?? null;
  const top10 = dbData?.top_10 ?? null; const top5 = dbData?.top_5 ?? null;
  const [showDataModal, setShowDataModal] = useState(false);

  // â”€â”€ Realtime toast: hiá»‡n khi cÃ³ giao dá»‹ch má»›i â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
              const jobLabel = payload.new.job_title ?? 'má»™t ngÃ nh';
              setRealtimeToast(`Má»™t ngÆ°á»i dÃ¹ng áº©n danh ngÃ nh ${jobLabel} vá»«a má»Ÿ khÃ³a bÃ¡o cÃ¡o`);
              timer = setTimeout(() => setRealtimeToast(null), 5000);
            }
          })
        .subscribe();
    } catch { /* Realtime khÃ´ng kháº£ dá»¥ng â€” bá» qua */ }
    return () => {
      clearTimeout(timer);
      channel?.unsubscribe?.();
    };
  }, []);

  const insightLines = percent === 5 ? ['Báº¡n Ä‘ang Elite â€” nhÆ°ng Top 1% Ä‘ang kÃ©o xa báº¡n thÃªm má»—i quÃ½.', 'CÃ³ 1 ká»¹ nÄƒng mÃ  94% Top 1% cÃ³, cÃ²n Top 5% chÆ°a náº¯m.'] : percent === 10 ? [`Khoáº£ng cÃ¡ch tá»« Top 10% lÃªn Top 5% ngÃ nh ${job} chá»‰ lÃ  ${fmtM((top5 ?? 0) - (top10 ?? 0))}/thÃ¡ng.`, '80% ngÆ°á»i vÆ°á»£t má»‘c nÃ y lÃ m Ä‘Æ°á»£c trong 6 thÃ¡ng vá»›i Ä‘Ãºng chiáº¿n lÆ°á»£c.'] : percent === 20 ? [`Top 10% ngÃ nh ${job} Ä‘ang nháº­n thÃªm ${fmtM((top10 ?? 0) - (top20 ?? 0))}/thÃ¡ng so vá»›i báº¡n.`, 'Khoáº£ng cÃ¡ch nÃ y khÃ´ng Ä‘áº¿n tá»« kinh nghiá»‡m â€” nÃ³ Ä‘áº¿n tá»« 1 ká»¹ nÄƒng cá»¥ thá»ƒ.'] : percent === 50 ? [`Median ngÃ nh ${job} lÃ  ${fmtM(top50)} â€” báº¡n Ä‘ang Ä‘á»©ng Ä‘Ãºng ranh giá»›i.`, 'NhÃ³m dÆ°á»›i median máº¥t trung bÃ¬nh 2.3 nÄƒm Ä‘á»ƒ vÆ°á»£t qua náº¿u khÃ´ng cÃ³ chiáº¿n lÆ°á»£c.'] : [`Median ngÃ nh ${job} cao hÆ¡n lÆ°Æ¡ng báº¡n ${fmtM(top50)}/thÃ¡ng.`, '72% ngÆ°á»i dÆ°á»›i median khÃ´ng biáº¿t mÃ¬nh bá»‹ undervalue cho Ä‘áº¿n khi tháº¥y dá»¯ liá»‡u thá»‹ trÆ°á»ng.'];
  return (
    <div className="space-y-3">
      {showDataModal && <DataSourceModal onClose={() => setShowDataModal(false)} />}

      {/* Realtime toast â€” hiá»‡n khi cÃ³ giao dá»‹ch má»›i */}
      {realtimeToast && (
        <div className="flex items-center gap-2.5 bg-green-500/15 border border-green-500/30 rounded-2xl px-4 py-3 animate-[fadeUp_0.3s_ease_both]">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse shrink-0" />
          <p className="text-[11px] font-sans text-green-300 leading-snug">ðŸ”” {realtimeToast}</p>
        </div>
      )}
      {/* Partial benchmark */}
      <div className="bg-[#0f1219] rounded-3xl overflow-hidden shadow-sm border border-white/10">
        <div className="px-5 pt-5 pb-1">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[11px] font-mono font-bold text-[#f0ede8]/70 uppercase tracking-wider">ðŸ“Š PhÃ¢n phá»‘i lÆ°Æ¡ng â€” {job}</p>
            <span className="text-[9px] bg-[#161b26] text-[#e8b84b] font-mono font-bold px-2 py-0.5 rounded-full border border-white/10">Q1/2026</span>
          </div>
          {[{ label: 'Median (Top 50%)', val: top50, color: '#FF9100', w: '50%' }, { label: 'Top 20%', val: top20, color: '#40C4FF', w: '70%' }].map((r, i) => (
            <div key={i} className="flex items-center gap-3 py-2.5 border-b border-white/5">
              <div className="w-28 shrink-0"><p className="text-[10px] font-mono font-bold text-[#f0ede8]/45">{r.label}</p></div>
              <div className="flex-1 h-2 bg-[#161b26] rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: r.w, backgroundColor: r.color }} /></div>
              <p className="text-sm font-serif font-black text-[#f0ede8] w-14 text-right">{fmtM(r.val)}</p>
            </div>
          ))}
          {/* â”€â”€ Rows Top 10% & Top 5%: hiá»ƒn thá»‹ rÃµ náº¿u user á»Ÿ Elite, blur náº¿u khÃ´ng â”€â”€ */}
          <div className="relative">
            {percent <= 10 ? (
              /* ELITE: hiá»‡n rÃµ Top 10% & 5%, blur thanh Top 1% áº£o bÃªn dÆ°á»›i */
              <>
                {[
                  { label: 'Top 10%', val: top10, color: '#00E676', w: '85%' },
                  { label: 'Top 5% ðŸ†', val: top5, color: '#FFD700', w: '100%' },
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
                {/* Thanh Top 1% áº£o â€” blur */}
                <div className="relative mt-0.5">
                  <div className="flex items-center gap-3 py-2.5 blur-[5px] select-none pointer-events-none">
                    <div className="w-28 shrink-0">
                      <p className="text-[10px] font-mono font-bold text-[#f0ede8]/45">Top 1% ðŸ‘‘</p>
                    </div>
                    <div className="flex-1 h-2 bg-[#161b26] rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: '100%', backgroundColor: '#e8b84b' }} />
                    </div>
                    <p className="text-sm font-serif font-black text-[#f0ede8] w-14 text-right">???</p>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="bg-[#0f1219]/90 backdrop-blur-sm border border-[#e8b84b]/30 rounded-xl px-4 py-2 flex items-center gap-2 shadow-sm">
                      <span>ðŸ”’</span>
                      <p className="text-[11px] font-mono font-bold text-[#e8b84b]">Má»Ÿ khÃ³a Ä‘á»ƒ xem Má»©c lÆ°Æ¡ng tráº§n &amp; Top 1%</p>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              /* THÆ¯á»œNG: blur Top 10% & Top 5% nhÆ° cÅ© */
              <>
                {[
                  { label: 'Top 10%', val: top10, color: '#00E676', w: '85%' },
                  { label: 'Top 5% ðŸ†', val: top5, color: '#FFD700', w: '100%' },
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
                    <span>ðŸ”’</span>
                    <p className="text-[11px] font-mono font-bold text-[#e8b84b]">Má»Ÿ khÃ³a Ä‘á»ƒ xem Top 10% &amp; 5%</p>
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
              Vá»‹ trÃ­ cá»§a báº¡n: <strong className="text-[#f0ede8] font-mono">Top {percent}%</strong>
              {percent >= 50 ? <span className="text-red-400"> Â· tháº¥p hÆ¡n median {fmtM(lostMoney / 12)}/thÃ¡ng</span> : <span className="text-green-400"> Â· Ä‘Ã£ vÆ°á»£t median âœ“</span>}
            </p>
          </div>
          <button onClick={() => setShowDataModal(true)} className="text-[9px] font-mono text-[#f0ede8]/40 hover:text-[#e8b84b] transition-colors whitespace-nowrap shrink-0 underline underline-offset-2">
            Xem phÆ°Æ¡ng phÃ¡p tÃ­nh â†’
          </button>
        </div>
      </div>

      {/* Market trend */}
      <div className="bg-[#0f1219] rounded-3xl p-5 shadow-sm border border-white/10">
        <p className="text-[11px] font-mono font-bold text-[#f0ede8]/70 uppercase tracking-wider mb-3">ðŸ“ˆ TÃ­n hiá»‡u thá»‹ trÆ°á»ng 2026</p>
        {[
          { arrow: 'â†‘', color: 'text-green-400', t: `Nhu cáº§u tuyá»ƒn ngÃ nh ${job} Ä‘ang tÄƒng`, d: '45% doanh nghiá»‡p má»Ÿ rá»™ng tuyá»ƒn dá»¥ng 5â€“10% (Navigos 2026)' },
          { arrow: 'â†‘', color: 'text-[#e8b84b]', t: 'Máº·t báº±ng lÆ°Æ¡ng tÄƒng 8â€“10% so vá»›i 2025', d: 'Äáº·c biá»‡t máº¡nh á»Ÿ midâ€“senior (NIC Global Salary Guide 2026)' },
          { arrow: 'âš¡', color: 'text-orange-400', t: '80% nhÃ  tuyá»ƒn dá»¥ng Ä‘ang tranh nhau á»©ng viÃªn giá»i', d: 'ÄÃ¢y lÃ  thá»i Ä‘iá»ƒm tá»‘t nháº¥t trong 3 nÄƒm Ä‘á»ƒ Ä‘Ã m phÃ¡n lÆ°Æ¡ng' },
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
        <p className="text-[10px] font-mono font-bold text-[#e8b84b] uppercase tracking-widest mb-3">ðŸ’¡ Insight chuyÃªn sÃ¢u tá»« bÃ¡o cÃ¡o</p>
        <div className="space-y-3">
          {insightLines.map((line, i) => (
            <div key={i} className="flex gap-2.5 items-start">
              <span className="text-[#e8b84b] text-xs mt-0.5 shrink-0">â–¸</span>
              <p className="text-sm font-sans text-[#f0ede8]/70 leading-relaxed">{line}</p>
            </div>
          ))}
          <div className="relative">
            <div className="flex gap-2.5 items-start blur-[6px] select-none pointer-events-none">
              <span className="text-[#e8b84b] text-xs mt-0.5 shrink-0">â–¸</span>
              <p className="text-sm font-sans text-[#f0ede8]/70 leading-relaxed">NgÆ°á»i á»Ÿ Top {Math.max(percent - 30, 5)}% ngÃ nh {job} táº¡i TP.HCM thÆ°á»ng cÃ³ thÃªm 1 yáº¿u tá»‘ X mÃ  90% ngÆ°á»i bá» qua â€” khÃ´ng pháº£i kinh nghiá»‡m, khÃ´ng pháº£i báº±ng cáº¥p.</p>
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="bg-[#0f1219]/80 backdrop-blur-sm text-[#e8b84b] text-[10px] font-mono font-bold px-3 py-1.5 rounded-full border border-[#e8b84b]/30">ðŸ”’ Má»Ÿ khÃ³a Ä‘á»ƒ Ä‘á»c</span>
            </div>
          </div>
        </div>
      </div>

      {/* Social proof â€” sá»‘ liá»‡u thá»±c tá»« DB */}
      <div className="bg-[#0f1219] rounded-3xl p-5 shadow-sm border border-white/10">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          <p className="text-[11px] font-mono font-bold text-[#f0ede8]/70 uppercase tracking-wider">Sá»‘ liá»‡u thá»±c táº¿ tá»« há»‡ thá»‘ng</p>
        </div>
        {/* 2 stat cards */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-[#161b26] rounded-2xl p-3 text-center border border-white/5">
            <p className="text-2xl font-black text-[#e8b84b] leading-none">{paidCount.toLocaleString('vi-VN')}</p>
            <p className="text-[10px] font-mono text-[#f0ede8]/45 mt-1">ngÆ°á»i Ä‘Ã£ má»Ÿ khÃ³a bÃ¡o cÃ¡o</p>
          </div>
          <div className="bg-[#161b26] rounded-2xl p-3 text-center border border-white/5">
            <p className="text-2xl font-black text-green-400 leading-none">{dailyViews.toLocaleString('vi-VN')}</p>
            <p className="text-[10px] font-mono text-[#f0ede8]/45 mt-1">lÆ°á»£t quÃ©t trong 24h qua</p>
          </div>
        </div>
        <div className="bg-[#161b26] border border-[#e8b84b]/20 rounded-xl p-3">
          <p className="text-[11px] font-sans text-[#f0ede8]/70 leading-relaxed italic">
            <strong>ðŸ’¬</strong> "Email máº«u trong bÃ¡o cÃ¡o giÃºp mÃ¬nh xin tÄƒng Ä‘Æ°á»£c <strong className="text-[#e8b84b]">3.5M/thÃ¡ng</strong> sau 1 tuáº§n gá»­i sáº¿p. CÃ³ sá»‘ liá»‡u thá»‹ trÆ°á»ng lÃ  khÃ¡c háº³n." â€” NgÆ°á»i dÃ¹ng táº¡i HÃ  Ná»™i, Káº¿ toÃ¡n.
          </p>
        </div>
      </div>
      {/* Banner cáº£nh bÃ¡o háº¿t háº¡n â€” chá»‰ giá»¯ 1 dÃ²ng nhá» */}
      <p className="text-center text-[11px] font-mono text-orange-400/80">
        {paidCount > 0
          ? <>â° GiÃ¡ Æ°u Ä‘Ã£i chá»‰ cÃ²n Ä‘áº¿n 30/06/2026 Â· {paidCount.toLocaleString('vi-VN')} ngÆ°á»i Ä‘Ã£ má»Ÿ khÃ³a</>
          : <>Beta tráº£ phÃ­: Ä‘ang nháº­n nhÃ³m user Ä‘áº§u tiÃªn Ä‘á»ƒ tinh chá»‰nh benchmark</>}
      </p>
    </div>
  );
}

/* â•â•â• SALARY SIMULATOR â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
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
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">ðŸŽ® Giáº£ láº­p tÆ°Æ¡ng lai</p>
        <p className="text-[11px] text-slate-500">Tick thÃªm ká»¹ nÄƒng â€” vÃ²ng quay thay Ä‘á»•i thá»i gian thá»±c</p>
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
          <p className="text-[10px] text-green-600 mb-0.5">LÆ°Æ¡ng Æ°á»›c tÃ­nh náº¿u cÃ³ Ä‘á»§ ká»¹ nÄƒng</p>
          <p className="text-xl font-black text-green-700">{simSalary.toLocaleString('vi-VN')}Ä‘/thÃ¡ng</p>
          <p className="text-[10px] text-green-500">+{(salaryBoost * 100).toFixed(0)}% so vá»›i median Â· tÄƒng {pctBoost} báº­c percentile</p>
        </div>
      )}
      <div className="space-y-2">
        {SKILLS.map(s => (
          <button key={s.id} onClick={() => toggle(s.id)}
            className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border-2 transition-all text-left ${checked[s.id] ? 'border-blue-500 bg-blue-50' : 'border-slate-100 bg-white hover:border-slate-200'}`}>
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${checked[s.id] ? 'border-blue-500 bg-blue-500' : 'border-slate-300'}`}>
              {checked[s.id] && <span className="text-white text-[10px] font-black">âœ“</span>}
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold text-slate-800">{s.label}</p>
              <p className="text-[10px] text-green-600 font-semibold">+{(s.boost * 100).toFixed(0)}% lÆ°Æ¡ng Â· tÄƒng ~{s.pctBoost} báº­c percentile</p>
            </div>
          </button>
        ))}
      </div>
      {selected.length === 0 && <p className="text-center text-[11px] text-slate-400 italic">â˜ï¸ Tick ká»¹ nÄƒng Ä‘á»ƒ xem tÃ¡c Ä‘á»™ng thá»i gian thá»±c</p>}
    </div>
  );
}

/* â•â•â• COMPANY TIER â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function CompanyTierCard({ fullName, job, dbData }: Omit<ComponentProps, 'percent'>) {
  const base = dbData?.top_50 ?? 15_000_000;
  const [active, setActive] = useState<number | null>(null);
  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1">ðŸ¢ So sÃ¡nh theo loáº¡i hÃ¬nh cÃ´ng ty</p>
        <p className="text-[11px] text-slate-500">CÃ¹ng vá»‹ trÃ­ {job} â€” lÆ°Æ¡ng khÃ¡c nhau hoÃ n toÃ n tÃ¹y tier</p>
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
                  {isUser && <p className="text-[9px] text-orange-600 font-bold">â† Vá»Š TRÃ Æ¯á»šC TÃNH Cá»¦A Báº N</p>}
                </div>
              </div>
              <div className="text-right">
                <p className="text-base font-black" style={{ color: tier.color }}>{fmtM(sal)}</p>
                <p className="text-[9px] text-slate-400">median/thÃ¡ng</p>
              </div>
            </div>
            {active === i && (
              <div className="mt-3 pt-3 border-t border-slate-200 text-[11px] text-slate-600 leading-relaxed">
                {i === 0 && 'LÆ°Æ¡ng á»•n Ä‘á»‹nh, Ã­t biáº¿n Ä‘á»™ng, phÃºc lá»£i cÆ¡ báº£n. PhÃ¹ há»£p tÃ­ch lÅ©y kinh nghiá»‡m giai Ä‘oáº¡n Ä‘áº§u.'}
                {i === 1 && 'LÆ°Æ¡ng cáº¡nh tranh hÆ¡n, quy trÃ¬nh rÃµ rÃ ng, cÆ¡ há»™i thÄƒng tiáº¿n ná»™i bá»™ tá»‘t hÆ¡n.'}
                {i === 2 && 'LÆ°Æ¡ng theo chuáº©n quá»‘c táº¿, KPI rÃµ rÃ ng, phÃºc lá»£i Ä‘áº§y Ä‘á»§ (ESOP, báº£o hiá»ƒm cao cáº¥p).'}
                {i === 3 && <><strong className="text-blue-700">NhÃ³m tráº£ cao nháº¥t thá»‹ trÆ°á»ng.</strong> YÃªu cáº§u: tiáº¿ng Anh C1+, chá»©ng chá»‰ quá»‘c táº¿, tÆ° duy há»‡ thá»‘ng. ÄÃ¢y lÃ  sÃ¢n chÆ¡i mÃ  lá»™ trÃ¬nh 90 ngÃ y hÆ°á»›ng Ä‘áº¿n.</>}
              </div>
            )}
          </button>
        );
      })}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
        <p className="text-[11px] text-amber-800 leading-relaxed">
          âš¡ <strong>TÃ¡t thá»©c tá»‰nh:</strong> Náº¿u báº¡n Ä‘ang lÃ  "Top 10% á»Ÿ SME" â€” má»©c lÆ°Æ¡ng Ä‘Ã³ chá»‰ xáº¿p <strong>Ä‘Ã¡y Top 80%</strong> á»Ÿ nhÃ³m MNC. Nháº£y tier cÃ´ng ty cÃ³ thá»ƒ tÄƒng thu nháº­p <strong>2x</strong> mÃ  khÃ´ng cáº§n thÃªm nÄƒm kinh nghiá»‡m.
        </p>
      </div>
    </div>
  );
}

/* â•â•â• GAP ANALYSIS â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function GapAnalysisTab({ fullName, job, percent, dbData }: ComponentProps) {
  const gap = getGapData(job, percent, dbData);
  return (
    <div className="space-y-4">
      <p className="text-xs font-black text-slate-400 uppercase tracking-widest">ðŸ” BÃ³c tÃ¡ch khoáº£ng trá»‘ng nÄƒng lá»±c</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
          <p className="text-[9px] font-black text-red-400 uppercase tracking-wider mb-2">Thá»‹ trÆ°á»ng tráº£ {gap.currentPays} cho</p>
          <p className="text-sm text-slate-700 leading-relaxed">{gap.currentSkill}</p>
        </div>
        <div className="bg-green-50 border border-green-100 rounded-2xl p-4">
          <p className="text-[9px] font-black text-green-500 uppercase tracking-wider mb-2">Thá»‹ trÆ°á»ng tráº£ {gap.topPays} cho</p>
          <p className="text-sm text-slate-700 leading-relaxed font-medium">{gap.missingSkill}</p>
        </div>
      </div>
      <div className="bg-[#1e1b4b] rounded-2xl p-5 text-white">
        <p className="text-[10px] font-black text-blue-300 uppercase tracking-widest mb-3">ðŸ“… Lá»™ trÃ¬nh bÃ¹ Ä‘áº¯p 90 ngÃ y</p>
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
        <strong className="text-slate-700">ðŸ’¡ Táº¡i sao 90 ngÃ y?</strong> ÄÃ¢y lÃ  chu ká»³ review lÆ°Æ¡ng ngáº¯n nháº¥t cÃ³ thá»ƒ negotiate á»Ÿ háº§u háº¿t doanh nghiá»‡p Viá»‡t Nam. Má»¥c tiÃªu: cÃ³ sá»‘ liá»‡u Ä‘o Ä‘Æ°á»£c trÆ°á»›c buá»•i review tiáº¿p theo.
      </div>
    </div>
  );
}

/* â•â•â• AI ROLEPLAY â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function AIRoleplay({ fullName, job, percent, dbData }: ComponentProps) {
  const isOwner = /chá»§|kinh doanh|tá»± do|founder|owner/i.test(job);
  const initialMessage = isOwner
    ? `[Chá»§ nhÃ  nhÃ­u mÃ y nhÃ¬n báº¡n] "CÃ´/chÃº nghe nÃ³i chÃ¡u muá»‘n bÃ n láº¡i vá» há»£p Ä‘á»“ng thuÃª nhÃ ? TÃ¬nh hÃ¬nh dáº¡o nÃ y buÃ´n bÃ¡n cháº­m láº¯m sao?"`
    : `[Sáº¿p ngáº©ng Ä‘áº§u nhÃ¬n báº¡n qua kÃ­nh] "á»ª, vÃ o Ä‘i. Nghe báº£o anh/chá»‹ muá»‘n nÃ³i chuyá»‡n gÃ¬ Ä‘Ã³ vá»... lÆ°Æ¡ng pháº£i khÃ´ng?"`;
  const uiTitle = isOwner ? "ðŸ¤– Luyá»‡n táº­p Ä‘Ã m phÃ¡n vá»›i AI Chá»§ nhÃ " : "ðŸ¤– Luyá»‡n táº­p Ä‘Ã m phÃ¡n vá»›i AI Boss";
  const uiSubtitle = isOwner ? "Giáº£ láº­p buá»•i thÆ°Æ¡ng lÆ°á»£ng giáº£m 20% tiá»n máº·t báº±ng mÃ¹a tháº¥p Ä‘iá»ƒm" : "Giáº£ láº­p buá»•i xin tÄƒng lÆ°Æ¡ng tháº­t â€” sáº¿p AI pháº£n á»©ng nhÆ° ngÆ°á»i tháº­t";
  const uiHintText = isOwner ? `Thá»­: "Dáº¡ lÆ°á»£ng khÃ¡ch giáº£m 20%. ChÃ¡u muá»‘n Ä‘á» xuáº¥t há»— trá»£ giáº£m 10% tiá»n nhÃ  trong 6 thÃ¡ng tá»›i..."` : `Thá»­: "Theo bÃ¡o cÃ¡o VSPI 2026, median ngÃ nh mÃ¬nh lÃ  ${fmtM(dbData?.top_50)} â€” em Ä‘ang á»Ÿ Top ${percent}%"`;
  const uiRoleName = isOwner ? "ðŸ  Chá»§ nhÃ " : "ðŸ‘” Sáº¿p";
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
      if (data.error) { reply = isOwner ? "[Chá»§ nhÃ  Ä‘ang báº­n, chÃ¡u quay láº¡i sau nhÃ©...]" : "[Sáº¿p Ä‘ang báº­n há»p Ä‘á»™t xuáº¥t, nÃ³i chuyá»‡n sau nhÃ©...]"; }
      else { reply = data.content?.[0]?.text ?? (isOwner ? "ChÃ¡u trÃ¬nh bÃ y rÃµ hÆ¡n xem nÃ o, káº¿ hoáº¡ch bÃ¹ Ä‘áº¯p rá»§i ro lÃ  gÃ¬?" : "Anh/chá»‹ nÃ³i cá»¥ thá»ƒ hÆ¡n vá» con sá»‘ mang láº¡i cho cÃ´ng ty Ä‘i?"); }
      setMessages(p => [...p, { role: 'assistant', content: reply }]);
    } catch { setMessages(p => [...p, { role: 'assistant', content: '[Lá»—i káº¿t ná»‘i API â€” vui lÃ²ng thá»­ láº¡i]' }]); }
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
        <p className="text-[10px] font-bold text-amber-700 mb-1">ðŸ’¡ Máº¹o Ä‘á»ƒ thuyáº¿t phá»¥c</p>
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
            placeholder={isOwner ? "TrÃ¬nh bÃ y váº¥n Ä‘á» vá»›i cÃ´/chÃº chá»§ nhÃ ..." : "Xin sáº¿p cho em trao Ä‘á»•i vá» lÆ°Æ¡ng..."}
            className="flex-1 bg-white text-gray-900 font-medium placeholder-gray-500 border border-gray-300 rounded-full px-5 py-3 focus:outline-none focus:ring-2 focus:ring-[#e8b84b] shadow-inner" />
          <button onClick={send} disabled={loading} className="bg-blue-600 text-white text-[11px] font-bold px-3 py-2 rounded-xl disabled:opacity-50 hover:bg-blue-700 transition-all">Gá»­i</button>
        </div>
      </div>
      <button onClick={() => setMessages([{ role: 'assistant', content: initialMessage }])} className="w-full text-center text-[10px] text-slate-400 hover:text-red-500 transition-colors py-1">ðŸ”„ Reset â€” thá»­ láº¡i tá»« Ä‘áº§u</button>
    </div>
  );
}

/* â•â•â• EVIDENCE BRIEF â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
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
      <p className="text-xs font-black text-slate-400 uppercase tracking-widest">ðŸ“‹ Há»“ sÆ¡ báº±ng chá»©ng thá»‹ trÆ°á»ng</p>
      <p className="text-[11px] text-slate-500">Thiáº¿t káº¿ Ä‘á»ƒ in ra Ä‘áº·t lÃªn bÃ n HR. NgÃ´n ngá»¯ há»c thuáº­t, sá»‘ liá»‡u trÃ­ch dáº«n chuáº©n.</p>
      <div ref={printRef} className="bg-white border border-slate-200 rounded-2xl p-6 text-slate-800">
        <div className="border-b-2 border-slate-800 pb-4 mb-4">
          <h1 className="text-lg font-black text-slate-900">VSPI Executive Summary</h1>
          <p className="text-[10px] uppercase tracking-widest text-slate-400 mt-0.5">Vietnam Salary Percentile Index Â· BÃ¡o cÃ¡o CÃ¡ nhÃ¢n 2026</p>
          <div className="mt-2 flex gap-2 flex-wrap">
            <span className="text-[10px] bg-[#1e1b4b] text-white px-2 py-0.5 rounded-full font-bold">Há» vÃ  tÃªn: {fullName}</span>
            <span className="text-[10px] bg-[#1e1b4b] text-white px-2 py-0.5 rounded-full font-bold">Vá»‹ trÃ­: {job}</span>
            <span className="text-[10px] bg-blue-600 text-white px-2 py-0.5 rounded-full font-bold">Top {percent}% thá»‹ trÆ°á»ng</span>
            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">Cáº¥p ngÃ y: {TODAY}</span>
          </div>
        </div>
        <p className="text-[11px] text-slate-600 leading-relaxed mb-4">Dá»±a trÃªn táº­p dá»¯ liá»‡u tá»•ng há»£p tá»« <strong>1,839 máº«u Ä‘á»‹nh lÆ°á»£ng</strong> cá»§a Navigos/VietnamWorks vÃ  Adecco Vietnam (2026), káº¿t há»£p dá»¯ liá»‡u lá»±c lÆ°á»£ng lao Ä‘á»™ng tá»« Tá»•ng cá»¥c Thá»‘ng kÃª (n=53.3M), bÃ¡o cÃ¡o nÃ y xÃ¡c Ä‘á»‹nh vá»‹ trÃ­ thu nháº­p cá»§a á»©ng viÃªn trong phÃ¢n phá»‘i lÆ°Æ¡ng ngÃ nh <strong>{job}</strong> táº¡i thá»‹ trÆ°á»ng Viá»‡t Nam.</p>
        <table className="w-full text-[11px] border-collapse mb-4">
          <thead><tr className="bg-slate-50"><th className="text-left p-2 border border-slate-200">Chá»‰ sá»‘</th><th className="text-left p-2 border border-slate-200">GiÃ¡ trá»‹</th><th className="text-left p-2 border border-slate-200">Nguá»“n</th></tr></thead>
          <tbody>
            {[
              ['LÆ°Æ¡ng trung vá»‹ ngÃ nh (Median P50)', fmtM(dbData?.top_50), 'Adecco VN 2026 + Navigos 2026'],
              ['LÆ°Æ¡ng nhÃ³m khÃ¡ (P80 â€” Top 20%)', fmtM(dbData?.top_20), 'VSPI Dataset 2026'],
              ['LÆ°Æ¡ng nhÃ³m xuáº¥t sáº¯c (P90 â€” Top 10%)', fmtM(dbData?.top_10), 'ITviec + Talentnetâ€“Mercer 2026'],
              ['LÆ°Æ¡ng nhÃ³m Elite (P95 â€” Top 5%)', fmtM(dbData?.top_5), 'Adecco Executive Report 2026'],
              ['Vá»‹ trÃ­ á»©ng viÃªn trong phÃ¢n phá»‘i', `Top ${percent}%`, 'VSPI Calculation Engine'],
              ['TÄƒng lÆ°Æ¡ng tá»‘i thiá»ƒu (NÄ 293/2025)', '+7.2%', 'ChÃ­nh phá»§ Viá»‡t Nam 2025'],
              ['Thu nháº­p bÃ¬nh quÃ¢n lao Ä‘á»™ng (GSO Q3)', '8.4M VNÄ/thÃ¡ng', 'Tá»•ng cá»¥c Thá»‘ng kÃª 2025'],
            ].map(([k, v, src], i) => (
              <tr key={i}><td className="p-2 border border-slate-200">{k}</td><td className="p-2 border border-slate-200 font-bold text-blue-700">{v}</td><td className="p-2 border border-slate-200 text-slate-500 text-[10px]">{src}</td></tr>
            ))}
          </tbody>
        </table>
        <p className="text-[10px] text-slate-500 leading-relaxed border-t border-slate-100 pt-3"><strong>PhÆ°Æ¡ng phÃ¡p:</strong> Dá»¯ liá»‡u Ä‘Æ°á»£c chuáº©n hÃ³a theo mÃ´ hÃ¬nh Normal Distribution, tá»•ng há»£p tá»« 6 nguá»“n bÃ¡o cÃ¡o chÃ­nh thá»‘ng, cáº­p nháº­t theo chu ká»³ quÃ½. VSPI (Vietnam Salary Percentile Index) lÃ  chá»‰ sá»‘ phÃ¡t triá»ƒn Ä‘á»™c láº­p dá»±a trÃªn dá»¯ liá»‡u thá»© cáº¥p cÃ´ng khai.</p>
      </div>
      <button onClick={handlePrint} className="w-full bg-[#1e1b4b] text-white font-bold py-3.5 rounded-2xl text-sm hover:bg-[#312e81] transition-all flex items-center justify-center gap-2">ðŸ–¨ï¸ In PDF â€” Äáº·t lÃªn bÃ n HR ngay</button>
    </div>
  );
}

/* â•â•â• VSPI CERTIFICATE â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
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
          <p className="text-[8px] font-mono text-[#f0ede8]/45 uppercase tracking-widest mb-4">Chá»©ng nháº­n vá»‹ trÃ­ thu nháº­p 2026</p>
          <div className="text-5xl mb-2">ðŸ…</div>
          <p className="text-3xl font-serif font-black text-[#e8b84b]">TOP {percent}%</p>
          <p className="text-base font-mono font-bold text-[#e8b84b] mt-1">{fullName} - {job} - Top {percent}%</p>
          <p className="text-[10px] font-sans text-[#f0ede8]/45 mt-0.5">Thá»‹ trÆ°á»ng Viá»‡t Nam Â· Q1/2026</p>
          <div className="border-t border-white/10 mt-5 pt-4 flex items-end justify-between">
            <div className="text-left">
              <p className="text-[8px] font-sans text-[#f0ede8]/45 mb-1">MÃ£ xÃ¡c thá»±c (VSPI ID)</p>
              <p className="text-[11px] font-mono font-black text-[#e8b84b] tracking-wider">{vspiId}</p>
              <p className="text-[8px] font-sans text-[#f0ede8]/45 mt-1">Cáº¥p ngÃ y: {TODAY}</p>
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
        <span className="text-lg shrink-0">ðŸ”</span>
        <div>
          <p className="text-[11px] font-sans font-bold text-[#f0ede8] mb-1">XÃ¡c thá»±c báº±ng QR â€” HR cÃ³ thá»ƒ kiá»ƒm tra ngay</p>
          <p className="text-[10px] font-sans text-[#f0ede8]/45 leading-relaxed">QuÃ©t QR trá» Ä‘áº¿n trang xÃ¡c thá»±c: ID Â· NgÃ nh Â· Top% Â· NgÃ y cáº¥p. Biáº¿n áº£nh thÃ nh vÄƒn báº±ng sá»‘ Ä‘Æ°á»£c xÃ¡c thá»±c â€” uy tÃ­n x1000.</p>
        </div>
      </div>
      <div className="bg-[#0f1219] border border-white/10 rounded-2xl p-4">
        <p className="text-[11px] font-mono font-bold text-[#e8b84b] uppercase tracking-widest mb-3">ðŸ“Œ CÃ¡ch dÃ¹ng chá»©ng nháº­n nÃ y</p>
        {['ÄÃ­nh kÃ¨m email xin tÄƒng lÆ°Æ¡ng + Evidence Brief (tab ðŸ“‹) Ä‘á»ƒ tÄƒng Ä‘á»™ tin cáº­y', 'Khi HR há»i "Sá»‘ liá»‡u láº¥y tá»« Ä‘Ã¢u?" â€” Ä‘Æ°a VSPI ID Ä‘á»ƒ há» tá»± verify', 'DÃ¹ng khi negotiate vá»›i cÃ´ng ty má»›i Ä‘á»ƒ anchor má»©c lÆ°Æ¡ng ká»³ vá»ng', 'LÆ°u láº¡i â€” quÃ©t láº¡i sau 3â€“6 thÃ¡ng Ä‘á»ƒ track tiáº¿n Ä‘á»™ cá»§a báº¡n'].map((s, i) => (
          <div key={i} className="flex gap-2 mb-2 last:mb-0"><span className="text-[#e8b84b] text-xs mt-0.5 shrink-0">âœ“</span><p className="text-[11px] font-sans text-[#f0ede8]/70 leading-relaxed">{s}</p></div>
        ))}
      </div>
    </div>
  );
}

/* â•â•â• ELITE LETTER â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function EliteLetter({ fullName, job, percent }: EliteProps) {
  if (percent > 10) return null;
  return (
    <div className="bg-[#161b26] border border-[#e8b84b]/40 rounded-3xl p-6 relative overflow-hidden shadow-lg shadow-[#e8b84b]/5">
      <div className="absolute top-0 right-0 text-6xl opacity-5 pointer-events-none">ðŸ†</div>
      <div className="flex items-center gap-2 mb-3"><span className="text-2xl">ðŸŽ–ï¸</span><p className="text-[11px] font-mono font-black text-[#e8b84b] uppercase tracking-widest">ThÆ° chÃºc má»«ng tá»« Founder</p></div>
      <p className="text-sm font-sans text-[#f0ede8] leading-relaxed mb-3">ChÃ o <strong className="text-[#e8b84b]">{fullName}</strong>, báº¡n vá»«a Ä‘Æ°á»£c xÃ¡c nháº­n thuá»™c <strong className="text-[#e8b84b]">Top {percent}%</strong> ngÃ nh <strong className="text-[#e8b84b]">{job}</strong> táº¡i Viá»‡t Nam.</p>
      <p className="text-sm font-sans text-[#f0ede8]/70 leading-relaxed mb-3">Chá»‰ <strong>{percent === 5 ? '1 trong 20' : '1 trong 10'}</strong> ngÆ°á»i cÃ¹ng ngÃ nh Ä‘áº¡t Ä‘Æ°á»£c cá»™t má»‘c nÃ y. Báº¡n Ä‘ang thuá»™c nhÃ³m <strong>nhÃ¢n sá»± tinh hoa Ä‘á»‹nh hÃ¬nh láº¡i thá»‹ trÆ°á»ng 2026.</strong></p>
      <p className="text-sm font-sans text-[#f0ede8]/70 leading-relaxed mb-5">Cá»™ng Ä‘á»“ng <strong className="text-[#e8b84b]">VSPI Elite</strong> â€” group kÃ­n chá»‰ dÃ nh cho Top 20% trá»Ÿ lÃªn â€” Ä‘ang chá» báº¡n. Networking, chia sáº» cÆ¡ há»™i, tÄƒng tá»‘c cÃ¹ng nhau.</p>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-[#e8b84b] flex items-center justify-center text-[#0a0c10] font-black text-sm">V</div>
        <div><p className="text-[11px] font-sans font-black text-[#f0ede8]">Nguyá»…n Trá»ng VÄƒn</p><p className="text-[9px] font-sans text-[#f0ede8]/45">Founder Â· VSPI Vietnam</p></div>
        <div className="ml-auto text-right"><div className="text-[10px] text-[#f0ede8]/45 font-mono italic">KÃ½ tÃªn Ä‘iá»‡n tá»­</div><div className="text-base font-black text-[#e8b84b] italic" style={{ fontFamily: 'Georgia,serif' }}>NTV</div></div>
      </div>
      <div className="bg-[#0a0c10] border border-[#e8b84b]/20 rounded-2xl p-3 flex items-center gap-3">
        <span className="text-xl">ðŸ’¬</span>
        <div><p className="text-[10px] font-mono font-bold text-[#e8b84b]">Tham gia VSPI Elite Community</p><p className="text-[10px] font-sans text-[#f0ede8]/70">Nháº¯n VSPI ELITE + VSPI ID vÃ o Zalo: <strong className="text-[#e8b84b]">0915.662.876</strong></p></div>
      </div>
    </div>
  );
}

/* â•â•â• PREMIUM REPORT â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function PremiumReport({ fullName, job, percent, lostMoney, dbData, vspiId, salary }: PremiumProps) {
  const [tab, setTab] = useState('sim');
  const tabs = [{ id: 'sim', icon: 'ðŸŽ®', label: 'Simulator' }, { id: 'tier', icon: 'ðŸ¢', label: 'Tier Cty' }, { id: 'gap', icon: 'ðŸ”', label: 'Gap 90 ngÃ y' }, { id: 'boss', icon: 'ðŸ¤–', label: 'AI Roleplay' }, { id: 'brief', icon: 'ðŸ“‹', label: 'Evidence' }, { id: 'cert', icon: 'ðŸ“œ', label: 'VSPI Cert' }];
  const isOwner = /chá»§|kinh doanh|tá»± do|founder|owner/i.test(job);
  // Career Compass context â€” drives all dynamic content in the report
  const compass: CareerCompassContext = getCareerCompassContext(job, salary, percent);
  return (
    <div className="space-y-8">
      <div className="bg-[#0f1219] rounded-[2rem] overflow-hidden shadow-2xl border border-white/10 shadow-[#e8b84b]/5">
        <div className="bg-[#161b26] p-5 text-[#f0ede8] flex justify-between items-start border-b border-[#e8b84b]/20">
          <div>
            <span className="text-[10px] bg-[#e8b84b]/10 border border-[#e8b84b]/30 text-[#e8b84b] font-mono font-black px-2 py-0.5 rounded-full">âœ“ VSPI PREMIUM</span>
            <h3 className="text-base font-serif font-black mt-2 text-[#e8b84b]">CÃ´ng cá»¥ phÃ¢n tÃ­ch & HÃ nh Ä‘á»™ng</h3>
            <p className="text-[#f0ede8]/45 font-sans text-[10px]">{fullName} Â· {job} Â· Top {percent}%</p>
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

      {/* BÃ¡o cÃ¡o native DOM */}
      <div className="bg-[#0f1219] rounded-[2rem] p-8 md:p-12 shadow-2xl border border-white/10 text-[#f0ede8]/80 text-justify font-sans leading-relaxed">
        <div className="text-center pb-8 border-b border-white/10 mb-8">
          <h1 className="text-3xl md:text-4xl font-serif font-black text-[#e8b84b] mb-3 uppercase tracking-widest">La BÃ n Nghá» Nghiá»‡p</h1>
          <p className="text-sm md:text-lg text-[#f0ede8]/70 italic">Chiáº¿n LÆ°á»£c Bá»©t PhÃ¡ Thu Nháº­p 2026</p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <span className="text-[11px] font-mono font-bold bg-[#161b26] border border-white/10 px-3 py-1.5 rounded-full text-[#e8b84b]">MÃ£: {vspiId}</span>
            <span className="text-[11px] font-mono font-bold bg-[#161b26] border border-white/10 px-3 py-1.5 rounded-full text-[#e8b84b]">NgÃ y: {TODAY}</span>
            <span className="text-[11px] font-mono font-bold bg-[#161b26] border border-white/10 px-3 py-1.5 rounded-full text-[#e8b84b]">NgÃ nh: {job}</span>
          </div>
        </div>

        <div>
          <h2 className="text-xl md:text-2xl font-serif font-semibold text-[#e8b84b] mb-6 border-l-4 border-[#e8b84b] pl-4 tracking-normal text-left">ChÆ°Æ¡ng 1: XÃ¡c thá»±c vá»‹ trÃ­ thu nháº­p hiá»‡n táº¡i vÃ  bá»©c tranh thá»±c táº¿</h2>
          <p className="mb-4">ChÃ o báº¡n,</p>
          <p className="mb-6 text-[#f0ede8]/70">TrÆ°á»›c tiÃªn, tÃ´i muá»‘n gá»­i lá»i chÃºc má»«ng chÃ¢n thÃ nh nháº¥t vÃ¬ báº¡n Ä‘Ã£ Ä‘Æ°a ra má»™t quyáº¿t Ä‘á»‹nh xuáº¥t sáº¯c: Äáº§u tÆ° Ä‘á»ƒ tháº¥u hiá»ƒu giÃ¡ trá»‹ thá»±c sá»± cá»§a báº£n thÃ¢n trÃªn thá»‹ trÆ°á»ng lao Ä‘á»™ng. Ráº¥t nhiá»u ngÆ°á»i Ä‘i lÃ m 5 nÄƒm, 10 nÄƒm váº«n mÃ¹ má» vá» giÃ¡ trá»‹ cá»§a mÃ¬nh, dáº«n Ä‘áº¿n viá»‡c bá»‹ Ã©p giÃ¡ vÃ  Ä‘Ã¡nh máº¥t hÃ ng trÄƒm triá»‡u Ä‘á»“ng tiá»n lÆ°Æ¡ng má»—i nÄƒm. Báº±ng viá»‡c cáº§m trÃªn tay báº£n bÃ¡o cÃ¡o nÃ y, báº¡n Ä‘Ã£ chÃ­nh thá»©c bÆ°á»›c ra khá»i vÃ¹ng tá»‘i Ä‘Ã³.</p>
          <div className="bg-[#161b26] p-5 rounded-2xl border border-white/10 mb-6">
            <h3 className="font-sans font-semibold text-[#f0ede8] mb-3 tracking-normal">Há»“ sÆ¡ xÃ¡c thá»±c nÄƒng lá»±c (VSPI Certificate)</h3>
            <ul className="list-disc pl-5 space-y-2 text-[#f0ede8]/70 text-sm">
              <li><strong>MÃ£ xÃ¡c thá»±c Ä‘iá»‡n tá»­:</strong> <span className="text-[#e8b84b] font-mono">{vspiId}</span></li>
              <li><strong>Vá»‹ trÃ­ hiá»‡n táº¡i trong phÃ¢n phá»‘i thu nháº­p:</strong> Top <span className="text-[#e8b84b] font-mono">{percent}%</span> {compass.jobGroup} táº¡i Viá»‡t Nam.</li>
              <li><strong>NhÃ³m nghá» xÃ¡c Ä‘á»‹nh:</strong> <span className="text-[#e8b84b]">{compass.jobGroup}</span> â€” Band lÆ°Æ¡ng: <span className="text-[#e8b84b]">{compass.bandLabel}</span></li>
              <li><strong>Thu nháº­p hiá»‡n táº¡i:</strong> <span className="text-[#e8b84b] font-mono">{compass.salaryFmt}/thÃ¡ng</span> Â· Dáº£i chuáº©n band nÃ y: <span className="text-[#e8b84b]">{compass.currentBandRange}/thÃ¡ng</span></li>
              <li><strong>NgÃ y cáº¥p chá»©ng nháº­n:</strong> <span className="text-[#e8b84b] font-mono">{TODAY}</span></li>
            </ul>
          </div>
          <p className="mb-4 font-bold text-[#f0ede8]">Giáº£i mÃ£ con sá»‘ "Top {percent}%": Bá»©c tranh thá»±c táº¿ ngÃ nh {compass.jobGroup}</p>
          <p className="mb-4 text-[#f0ede8]/70">
            Vá»›i thu nháº­p <strong className="text-[#e8b84b]">{compass.salaryFmt}/thÃ¡ng</strong>, báº¡n Ä‘ang á»Ÿ band <strong className="text-[#e8b84b]">{compass.bandLabel}</strong> trong ngÃ nh {compass.jobGroup}. ÄÃ¢y lÃ  vá»‹ trÃ­ Top {percent}% â€” cÃ³ nghÄ©a lÃ  báº¡n Ä‘ang cao hÆ¡n {100 - percent}% ngÆ°á»i lao Ä‘á»™ng cÃ¹ng ngÃ nh.
          </p>
          <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 mb-4">
            <p className="text-red-300 font-bold text-sm mb-2">âš ï¸ Ná»—i Ä‘au Ä‘áº·c thÃ¹ cá»§a band nÃ y:</p>
            <p className="text-[#f0ede8]/80 text-sm leading-relaxed">{compass.painPoint}</p>
          </div>
          <p className="text-[#f0ede8]/70">
            Äá»ƒ lÃªn band tiáº¿p theo (<strong className="text-[#e8b84b]">tá»« {compass.nextBandMinFmt}/thÃ¡ng</strong>), báº¡n cáº§n thÃªm <strong className="text-[#e8b84b]">{compass.salaryGapFmt}/thÃ¡ng</strong> â€” tÆ°Æ¡ng Ä‘Æ°Æ¡ng <strong className="text-[#e8b84b]">{(compass.salaryGap * 12).toLocaleString('vi-VN')}Ä‘/nÄƒm</strong>. Con sá»‘ nÃ y hoÃ n toÃ n cÃ³ thá»ƒ Ä‘áº¡t Ä‘Æ°á»£c trong 12â€“18 thÃ¡ng vá»›i Ä‘Ãºng chiáº¿n lÆ°á»£c. ChÆ°Æ¡ng 2 sáº½ chá»‰ ra con Ä‘Æ°á»ng cá»¥ thá»ƒ.
          </p>
        </div>

        {isOwner ? (
          <>
            <div className="pt-10 mt-10 border-t border-white/10">
              <h2 className="text-xl md:text-2xl font-serif font-semibold text-[#e8b84b] mb-6 border-l-4 border-[#e8b84b] pl-4 tracking-normal text-left">ChÆ°Æ¡ng 2: Äá»‹nh hÆ°á»›ng tá»‘i Æ°u hÃ³a mÃ´ hÃ¬nh & tÄƒng trÆ°á»Ÿng lá»£i nhuáº­n</h2>
              <p className="mb-4 text-[#f0ede8]"><strong>Má»¥c tiÃªu Kinh doanh: Tá»‘i Æ°u hÃ³a lá»£i nhuáº­n rÃ²ng</strong></p>
              <p className="mb-4 text-[#f0ede8]/70">
                Thu nháº­p hiá»‡n táº¡i cá»§a báº¡n lÃ  <strong className="text-[#e8b84b]">{compass.salaryFmt}/thÃ¡ng</strong>. Äá»ƒ lÃªn band tiáº¿p theo (<strong className="text-[#e8b84b]">tá»« {compass.nextBandMinFmt}/thÃ¡ng</strong>), báº¡n cáº§n tÄƒng thÃªm <strong className="text-[#e8b84b]">{compass.salaryGapFmt}/thÃ¡ng</strong> â€” khÃ´ng pháº£i báº±ng cÃ¡ch lÃ m viá»‡c nhiá»u hÆ¡n, mÃ  báº±ng cÃ¡ch tá»‘i Æ°u hÃ³a mÃ´ hÃ¬nh kinh doanh.
              </p>
              <div className="bg-[#161b26] border border-[#e8b84b]/20 rounded-2xl p-4 mb-6">
                <p className="text-[10px] font-mono font-bold text-[#e8b84b] uppercase tracking-widest mb-2">ðŸ’¡ CÆ¡ há»™i Ä‘ang má»Ÿ ra</p>
                <p className="text-sm text-[#f0ede8]/80 leading-relaxed">{compass.opportunity}</p>
              </div>
              <p className="mb-3 text-[#f0ede8]"><strong>Ba NÃºt Tháº¯t Trá»ng Yáº¿u Äang Ä‚n MÃ²n Lá»£i Nhuáº­n Cá»§a Báº¡n:</strong></p>
              <ol className="list-decimal pl-5 space-y-3 mb-8 text-[#f0ede8]/70 text-sm">
                <li><strong>LÃ m thuÃª cho chÃ­nh mÃ¬nh (Khá»• chá»§):</strong> Thiáº¿u quy trÃ¬nh Ä‘Ã³ng gÃ³i (SOP), má»i quyáº¿t Ä‘á»‹nh lá»›n nhá» Ä‘á»u pháº£i qua tay báº¡n.</li>
                <li><strong>Chi phÃ­ cá»‘ Ä‘á»‹nh (Fixed Cost) quÃ¡ cao:</strong> Tiá»n máº·t báº±ng vÃ  nhÃ¢n sá»± láº¡m vÃ o biÃªn lá»£i nhuáº­n rÃ²ng.</li>
                <li><strong>Marketing thá»§ cÃ´ng, thá»¥ Ä‘á»™ng:</strong> Chá»‰ chá» khÃ¡ch quen hoáº·c phá»¥ thuá»™c vÃ o ná»n táº£ng giao hÃ ng thu phÃ­ cáº¯t cá»•.</li>
              </ol>
              <div className="space-y-4">
                {[
                  { title: 'Cháº·ng 1 (ThÃ¡ng 1 - ThÃ¡ng 3): Cáº¯t Giáº£m Chi PhÃ­ & Tá»‘i Æ¯u Váº­n HÃ nh', items: ['Trá»ng tÃ¢m: RÃ  soÃ¡t láº¡i P&L. TÃ¬m ra 20% nhÃ³m chi phÃ­ Ä‘ang gÃ¢y lÃ£ng phÃ­ nháº¥t vÃ  cáº¯t giáº£m.', 'HÃ nh Ä‘á»™ng: ÄÃ m phÃ¡n láº¡i giÃ¡ vá»›i nhÃ  cung cáº¥p. Tá»‘i Æ°u hÃ³a ca lÃ m viá»‡c cá»§a nhÃ¢n sá»± part-time.', 'TiÃªu chÃ­ nghiá»‡m thu: BiÃªn lá»£i nhuáº­n rÃ²ng tÄƒng thÃªm 5% - 10% trÃªn cÃ¹ng má»™t má»©c doanh thu.'] },
                  { title: 'ðŸ¤– Cháº·ng 2 (ThÃ¡ng 4 - ThÃ¡ng 6): á»¨ng dá»¥ng AI vÃ o Marketing & CSKH', items: ['Trá»ng tÃ¢m: DÃ¹ng cÃ´ng nghá»‡ thay tháº¿ sá»©c ngÆ°á»i trong viá»‡c tÃ¬m kiáº¿m vÃ  giá»¯ chÃ¢n khÃ¡ch hÃ ng.', 'HÃ nh Ä‘á»™ng: DÃ¹ng ChatGPT Ä‘á»ƒ lÃªn ká»‹ch báº£n ná»™i dung Social Media. Triá»ƒn khai AI Chatbot trá»±c Fanpage 24/7.', 'TiÃªu chÃ­ nghiá»‡m thu: Tiáº¿t kiá»‡m chi phÃ­ 1 nhÃ¢n sá»± Marketing nhÆ°ng doanh thu Online tÄƒng 30%.'] },
                  { title: 'âš™ï¸ Cháº·ng 3 (ThÃ¡ng 7 - ThÃ¡ng 12): ÄÃ³ng GÃ³i Quy TrÃ¬nh (SOP) & NhÃ¢n Báº£n', items: ['Trá»ng tÃ¢m: Chuáº©n hÃ³a Ä‘á»ƒ thoÃ¡t khá»i vai trÃ² Ä‘iá»u hÃ nh trá»±c tiáº¿p.', 'HÃ nh Ä‘á»™ng: Viáº¿t láº¡i toÃ n bá»™ quy trÃ¬nh dá»‹ch vá»¥ thÃ nh bá»™ tÃ i liá»‡u Ä‘Ã o táº¡o tiÃªu chuáº©n.', 'TiÃªu chÃ­ nghiá»‡m thu: Báº¡n cÃ³ thá»ƒ váº¯ng máº·t 1 tuáº§n mÃ  doanh sá»‘ khÃ´ng sá»¥t giáº£m.'] },
                ].map((c, i) => (
                  <div key={i} className="bg-[#161b26] p-5 rounded-2xl border border-white/10">
                    <h3 className="font-semibold text-[#f0ede8] mb-3 tracking-normal">{c.title}</h3>
                    <ul className="list-disc pl-5 space-y-2 text-sm text-[#f0ede8]/70">{c.items.map((item, j) => <li key={j}>{item}</li>)}</ul>
                  </div>
                ))}
              </div>
            </div>
            <div className="pt-10 mt-10 border-t border-white/10">
              <h2 className="text-xl md:text-2xl font-serif font-semibold text-[#e8b84b] mb-6 border-l-4 border-[#e8b84b] pl-4 tracking-normal text-left">ChÆ°Æ¡ng 3: Chiáº¿n lÆ°á»£c Ä‘Ã m phÃ¡n giáº£m chi phÃ­ & tÄƒng biÃªn lá»£i nhuáº­n</h2>
              <p className="mb-8 text-[#f0ede8]/70">Trong kinh doanh, má»™t Ä‘á»“ng chi phÃ­ tiáº¿t kiá»‡m Ä‘Æ°á»£c chÃ­nh lÃ  má»™t Ä‘á»“ng lá»£i nhuáº­n rÃ²ng rÆ¡i tháº³ng vÃ o tÃºi báº¡n.</p>
              <div className="space-y-8">
                <div>
                  <p className="font-bold text-[#f0ede8] mb-2">Ká»‹ch báº£n 1: ÄÃ m phÃ¡n giáº£m tiá»n thuÃª máº·t báº±ng</p>
                  <blockquote className="bg-[#161b26] border-l-2 border-[#e8b84b] p-5 rounded-r-2xl italic text-[#f0ede8]/70 text-sm leading-relaxed">"ChÃ¡u chÃ o cÃ´/chÃº. Hiá»‡n táº¡i tÃ¬nh hÃ¬nh kinh táº¿ chung Ä‘ang cháº­m láº¡i, lÆ°á»£ng khÃ¡ch sá»¥t giáº£m 20% so vá»›i trÆ°á»›c. ChÃ¡u ráº¥t muá»‘n duy trÃ¬ há»£p Ä‘á»“ng lÃ¢u dÃ i 3-5 nÄƒm tá»›i vá»›i nhÃ  mÃ¬nh vÃ¬ vá»‹ trÃ­ quÃ¡ tá»‘t. Äá»ƒ hai bÃªn cÃ¹ng Ä‘á»“ng hÃ nh vÆ°á»£t qua giai Ä‘oáº¡n nÃ y, chÃ¡u muá»‘n Ä‘á» xuáº¥t cÃ´/chÃº há»— trá»£ giáº£m 10% tiá»n nhÃ  trong 6 thÃ¡ng tá»›i. Sau 6 thÃ¡ng, chÃ¡u sáº½ quay láº¡i má»©c giÃ¡ cÅ©. CÃ´/chÃº xem xÃ©t giÃºp chÃ¡u nhÃ©!"</blockquote>
                </div>
                <div>
                  <p className="font-bold text-[#f0ede8] mb-2">Ká»‹ch báº£n 2: ÄÃ m phÃ¡n chiáº¿t kháº¥u vá»›i NhÃ  cung cáº¥p</p>
                  <blockquote className="bg-[#161b26] border-l-2 border-[#e8b84b] p-5 rounded-r-2xl italic text-[#f0ede8]/70 text-sm leading-relaxed">"ChÃ o anh/chá»‹. Cá»­a hÃ ng bÃªn em Ä‘ang lÃªn káº¿ hoáº¡ch tÄƒng gáº¥p rÆ°á»¡i sáº£n lÆ°á»£ng nguyÃªn liá»‡u nháº­p kháº©u trong quÃ½ tá»›i. Em Ä‘Ã£ lÃ m viá»‡c vá»›i bÃªn anh/chá»‹ Ä‘Æ°á»£c 1 nÄƒm, thanh toÃ¡n luÃ´n chuáº©n chá»‰ Ä‘Ãºng háº¡n. Tuy nhiÃªn, em cÅ©ng vá»«a nháº­n Ä‘Æ°á»£c bÃ¡o giÃ¡ tá»« má»™t sá»‘ xÆ°á»Ÿng khÃ¡c vá»›i má»©c chiáº¿t kháº¥u tá»‘t hÆ¡n 15%. Em muá»‘n há»i xem bÃªn mÃ¬nh cÃ³ chÃ­nh sÃ¡ch nÃ¢ng má»©c chiáº¿t kháº¥u cho khÃ¡ch VIP lÃªn thÃªm 10% khÃ´ng?"</blockquote>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="pt-10 mt-10 border-t border-white/10">
              <h2 className="text-xl md:text-2xl font-serif font-semibold text-[#e8b84b] mb-6 border-l-4 border-[#e8b84b] pl-4 tracking-normal text-left">ChÆ°Æ¡ng 2: PhÃ¢n tÃ­ch khoáº£ng trá»‘ng ká»¹ nÄƒng & má»¥c tiÃªu 12 thÃ¡ng tá»›i</h2>
              <p className="mb-3 text-[#f0ede8]"><strong>Má»¥c tiÃªu tÃ i chÃ­nh: LÃªn band {compass.bandLabel.split('(')[0].trim()} â†’ band tiáº¿p theo</strong></p>
              <p className="mb-4 text-[#f0ede8]/70">
                Vá»›i {compass.salaryFmt}/thÃ¡ng hiá»‡n táº¡i, báº¡n cáº§n thÃªm <strong className="text-[#e8b84b]">{compass.salaryGapFmt}/thÃ¡ng</strong> Ä‘á»ƒ bÆ°á»›c vÃ o band tiáº¿p theo (tá»« <strong className="text-[#e8b84b]">{compass.nextBandMinFmt}/thÃ¡ng</strong>). ÄÃ¢y lÃ  con sá»‘ cá»¥ thá»ƒ â€” khÃ´ng pháº£i cáº£m tÃ­nh.
              </p>
              {/* Market insight Ä‘áº·c thÃ¹ ngÃ nh */}
              <div className="bg-[#161b26] border border-[#e8b84b]/20 rounded-2xl p-4 mb-6">
                <p className="text-[10px] font-mono font-bold text-[#e8b84b] uppercase tracking-widest mb-2">ðŸ’¡ Insight thá»‹ trÆ°á»ng ngÃ nh {compass.jobGroup}</p>
                <p className="text-sm text-[#f0ede8]/80 leading-relaxed">{compass.marketInsight}</p>
              </div>
              <p className="mb-3 text-[#f0ede8]"><strong>Khoáº£ng trá»‘ng ká»¹ nÄƒng lá»›n nháº¥t ngÃ nh {compass.jobGroup}:</strong></p>
              <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4 mb-6">
                <p className="text-sm text-[#f0ede8]/80 leading-relaxed">{compass.topSkillGap}</p>
              </div>
              <p className="mb-3 text-[#f0ede8]"><strong>CÆ¡ há»™i Ä‘ang má»Ÿ ra cho band cá»§a báº¡n:</strong></p>
              <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4 mb-6">
                <p className="text-sm text-[#f0ede8]/80 leading-relaxed">{compass.opportunity}</p>
              </div>
              <p className="mb-3 text-[#f0ede8]"><strong>Lá»™ trÃ¬nh 3 cháº·ng bá»©t phÃ¡ (12 thÃ¡ng):</strong></p>
              <div className="space-y-4">
                {[
                  { title: 'Cháº·ng 1 (ThÃ¡ng 1 - ThÃ¡ng 3): Trui rÃ¨n NÄƒng lá»±c ChuyÃªn mÃ´n Cá»‘t lÃµi', items: ['Cáº§n há»c gÃ¬: Trá»Ÿ thÃ nh ngÆ°á»i lÃ m viá»‡c "Ã­t lá»—i nháº¥t". Náº¯m vá»¯ng cÃ´ng cá»¥ chuyÃªn ngÃ nh, SOP, vÃ  ká»¹ nÄƒng phÃ¢n tÃ­ch dá»¯ liá»‡u cÆ¡ báº£n.', 'Há»c báº±ng cÃ¡ch nÃ o: Nháº­n thÃªm task khÃ³. ÄÄƒng kÃ½ cÃ¡c khÃ³a há»c chuyÃªn sÃ¢u trÃªn Coursera/Udemy.', 'TiÃªu chÃ­ nghiá»‡m thu: Giáº£m 80% lá»—i sai váº·t. CÃ³ kháº£ nÄƒng tá»± chá»§ hoÃ n thÃ nh dá»± Ã¡n nhá» tá»« A Ä‘áº¿n Z.'] },
                  { title: 'ðŸŒ Cháº·ng 2 (ThÃ¡ng 4 - ThÃ¡ng 6): VÅ© khÃ­ Ngoáº¡i ngá»¯', items: ['Cáº§n há»c gÃ¬: Tiáº¿ng Anh thÆ°Æ¡ng máº¡i. MNCs cÃ³ sáºµn quá»¹ lÆ°Æ¡ng cao gáº¥p 2-3 láº§n SME.', 'Há»c báº±ng cÃ¡ch nÃ o: Táº­p trung 100% vÃ o Speaking/Listening. Luyá»‡n shadowing TED Talk. Target: TOEIC 700+.', 'TiÃªu chÃ­ nghiá»‡m thu: Phá»ng váº¥n trá»±c tiáº¿p báº±ng Tiáº¿ng Anh 30 phÃºt vá»›i Hiring Manager mÃ  khÃ´ng bá»‹ váº¥p.'] },
                  { title: 'ðŸ¤– Cháº·ng 3 (ThÃ¡ng 7 - ThÃ¡ng 12): Äá»™t phÃ¡ báº±ng Generative AI', items: ['Cáº§n há»c gÃ¬: Prompt Engineering. AI khÃ´ng cÆ°á»›p viá»‡c, ngÆ°á»i dÃ¹ng AI sáº½ cÆ°á»›p viá»‡c cá»§a báº¡n.', 'Há»c báº±ng cÃ¡ch nÃ o: DÃ¹ng ChatGPT/Claude Ä‘á»ƒ lÃªn outline, tÃ³m táº¯t tÃ i liá»‡u. DÃ¹ng Midjourney/Canva AI lÃ m slide.', 'TiÃªu chÃ­ nghiá»‡m thu: CÃ´ng viá»‡c 8 tiáº¿ng rÃºt gá»n cÃ²n 2 tiáº¿ng. 6 tiáº¿ng cÃ²n láº¡i dÃ¹ng Ä‘á»ƒ tÆ° duy chiáº¿n lÆ°á»£c.'] },
                ].map((c, i) => (
                  <div key={i} className="bg-[#161b26] p-5 rounded-2xl border border-white/10">
                    <h3 className="font-semibold text-[#f0ede8] mb-3 tracking-normal">{c.title}</h3>
                    <ul className="list-disc pl-5 space-y-2 text-sm text-[#f0ede8]/70">{c.items.map((item, j) => <li key={j}>{item}</li>)}</ul>
                  </div>
                ))}
              </div>
              {/* Next milestone cá»¥ thá»ƒ theo band */}
              <div className="mt-6 bg-[#e8b84b]/10 border border-[#e8b84b]/30 rounded-2xl p-5">
                <p className="text-[11px] font-mono font-bold text-[#e8b84b] uppercase tracking-widest mb-2">ðŸŽ¯ BÆ°á»›c tiáº¿p theo cá»¥ thá»ƒ cho báº¡n</p>
                <p className="text-sm text-[#f0ede8]/80 leading-relaxed">{compass.nextMilestone}</p>
              </div>
            </div>
            <div className="pt-10 mt-10 border-t border-white/10">
              <h2 className="text-xl md:text-2xl font-serif font-semibold text-[#e8b84b] mb-6 border-l-4 border-[#e8b84b] pl-4 tracking-normal text-left">ChÆ°Æ¡ng 3: Chiáº¿n lÆ°á»£c tá»‘i Æ°u há»“ sÆ¡ & ká»‹ch báº£n Ä‘Ã m phÃ¡n lÆ°Æ¡ng</h2>
              <p className="mb-8 text-[#f0ede8]/70">HR chá»‰ cÃ³ 6 giÃ¢y Ä‘á»ƒ quÃ©t má»™t CV. HÃ£y chuyá»ƒn sang viáº¿t vá» Káº¿t quáº£ mang láº¡i (Achievements) kÃ¨m sá»‘ liá»‡u chá»©ng minh (Metrics).</p>
              <div className="space-y-8">
                <div>
                  <p className="font-bold text-[#f0ede8] mb-2">Ká»‹ch báº£n 1: Phá»ng váº¥n táº¡i cÃ´ng ty má»›i</p>
                  <blockquote className="bg-[#161b26] border-l-2 border-[#e8b84b] p-5 rounded-r-2xl italic text-[#f0ede8]/70 text-sm leading-relaxed">
                    "Dáº¡, em cáº£m Æ¡n cÃ¢u há»i cá»§a anh/chá»‹. Dá»±a trÃªn BÃ¡o cÃ¡o Dá»¯ liá»‡u lÆ°Æ¡ng VSPI 2026, má»©c lÆ°Æ¡ng chuáº©n cho vá»‹ trÃ­ <strong className="not-italic text-[#f0ede8]">{job}</strong> á»Ÿ band <strong className="not-italic text-[#f0ede8]">{compass.bandLabel}</strong> Ä‘ang dao Ä‘á»™ng trong khoáº£ng <strong className="not-italic text-[#e8b84b]">{compass.currentBandRange}/thÃ¡ng</strong>. Vá»›i kinh nghiá»‡m vÃ  nÄƒng lá»±c hiá»‡n táº¡i, em ká»³ vá»ng má»©c <strong className="not-italic text-[#e8b84b]">{compass.nextBandMinFmt}/thÃ¡ng</strong> â€” tÆ°Æ¡ng á»©ng vá»›i band tiáº¿p theo. TrÆ°á»›c khi Ä‘Æ°a ra con sá»‘ chÃ­nh xÃ¡c, em muá»‘n hiá»ƒu thÃªm vá» ká»³ vá»ng vÃ  ngÃ¢n sÃ¡ch cá»§a cÃ´ng ty Ä‘á»ƒ tÃ¬m Ä‘iá»ƒm cháº¡m chung."
                  </blockquote>
                </div>
                <div>
                  <p className="font-bold text-[#f0ede8] mb-2">Ká»‹ch báº£n 2: Xin tÄƒng lÆ°Æ¡ng vá»›i Sáº¿p hiá»‡n táº¡i</p>
                  <blockquote className="bg-[#161b26] border-l-2 border-[#e8b84b] p-5 rounded-r-2xl italic text-[#f0ede8]/70 text-sm leading-relaxed">
                    "Dáº¡ em chÃ o sáº¿p. NhÃ¬n láº¡i 6 thÃ¡ng qua, em Ä‘Ã£ hoÃ n thÃ nh vÆ°á»£t má»¥c tiÃªu vÃ  Ä‘Ã³ng gÃ³p cá»¥ thá»ƒ cho team. Em cÅ©ng cÃ³ tham kháº£o BÃ¡o cÃ¡o VSPI 2026 â€” hiá»‡n táº¡i vá»›i vá»‹ trÃ­ <strong className="not-italic text-[#f0ede8]">{job}</strong>, dáº£i lÆ°Æ¡ng chuáº©n thá»‹ trÆ°á»ng lÃ  <strong className="not-italic text-[#e8b84b]">{compass.currentBandRange}/thÃ¡ng</strong>. Thu nháº­p hiá»‡n táº¡i cá»§a em lÃ  <strong className="not-italic text-[#e8b84b]">{compass.salaryFmt}/thÃ¡ng</strong>. Äá»ƒ lÃªn band tiáº¿p theo, em cáº§n thÃªm <strong className="not-italic text-[#e8b84b]">{compass.salaryGapFmt}/thÃ¡ng</strong>. Em Ä‘á» xuáº¥t cÃ´ng ty xem xÃ©t Ä‘iá»u chá»‰nh lÃªn má»©c <strong className="not-italic text-[#e8b84b]">{compass.nextBandMinFmt}/thÃ¡ng</strong> â€” phÃ¹ há»£p vá»›i giÃ¡ trá»‹ em Ä‘ang táº¡o ra. Sáº¿p tháº¥y Ä‘á» xuáº¥t nÃ y tháº¿ nÃ o áº¡?"
                  </blockquote>
                </div>
              </div>
            </div>
          </>
        )}

        <div className="pt-10 mt-10 border-t border-white/10">
          <h2 className="text-xl md:text-2xl font-serif font-semibold text-[#e8b84b] mb-6 border-l-4 border-[#e8b84b] pl-4 tracking-normal text-left">ChÆ°Æ¡ng 4: KhÃ´ng gian káº¿t ná»‘i mentorship & cá»™ng Ä‘á»“ng</h2>
          <p className="mb-4 text-[#f0ede8]/70">HÃ nh trÃ¬nh tiáº¿n lÃªn Top 50% rá»“i vÆ°Æ¡n tá»›i nhÃ³m tinh hoa Elite (Top 5%) lÃ  má»™t cháº·ng Ä‘Æ°á»ng vÃ´ cÃ¹ng Ä‘Æ¡n Ä‘á»™c náº¿u báº¡n pháº£i Ä‘i má»™t mÃ¬nh.</p>
          <p className="mb-4 text-[#f0ede8]"><strong>Äáº·c Quyá»n Cá»§a Báº¡n: VÃ© Má»i Tham Gia "VSPI Mentorship Hub"</strong></p>
          <ul className="list-disc pl-5 space-y-3 mb-10 text-[#e8b84b] text-sm">
            <li><strong className="text-[#f0ede8]">Sá»­a CV 1-1 Miá»…n PhÃ­</strong> bá»Ÿi Ä‘á»™i ngÅ© HR Manager.</li>
            <li><strong className="text-[#f0ede8]">Kho TÃ i Liá»‡u Tá»‘i Máº­t:</strong> 500+ Prompts ChatGPT tá»± Ä‘á»™ng hÃ³a & 50 Máº«u CV MNC.</li>
            <li><strong className="text-[#f0ede8]">Máº¡ng lÆ°á»›i Hidden Jobs</strong> tá»« cÃ¡c Headhunter uy tÃ­n.</li>
          </ul>
          <div className="border border-[#e8b84b]/40 p-8 rounded-3xl text-center bg-[#161b26] shadow-[#e8b84b]/5 shadow-xl mx-auto max-w-lg mb-10">
            <h3 className="text-lg font-mono font-black text-[#e8b84b] mb-4 uppercase tracking-widest">MÃƒ QR CODE QUÃ‰T GIA NHáº¬P Cá»˜NG Äá»’NG VIP</h3>
            <div className="bg-[#0f1219] p-4 rounded-2xl inline-block shadow-md mb-4 border border-white/10">
              <div className="bg-white p-2 rounded-xl">
                <QRCode value="https://zalo.me/g/kdiqgls4dcpsonhkrnyn" size={160} />
              </div>
            </div>
            <p className="text-sm font-sans text-[#f0ede8]/70">Hotline/Zalo há»— trá»£: <strong className="text-[#e8b84b] text-lg">0915.662.876</strong></p>
          </div>
          <p className="mb-10 text-[#f0ede8]/70 leading-relaxed">Má»©c giÃ¡ 29.000Ä‘ cho báº£n bÃ¡o cÃ¡o vÃ  há»‡ sinh thÃ¡i nÃ y lÃ  má»™t sá»± ná»— lá»±c phi lá»£i nhuáº­n tá»« chÃºng tÃ´i Ä‘á»ƒ kiáº¿n táº¡o má»™t tháº¿ há»‡ ngÆ°á»i lao Ä‘á»™ng Viá»‡t Nam cÃ³ thu nháº­p cao hÆ¡n. Náº¿u báº¡n tháº¥y báº£n bÃ¡o cÃ¡o nÃ y giÃºp báº¡n khai sÃ¡ng con Ä‘Æ°á»ng sá»± nghiá»‡p, hÃ£y gá»­i Ä‘Æ°á»ng link á»©ng dá»¥ng VSPI Scanner cho 3 ngÆ°á»i báº¡n thÃ¢n nháº¥t cá»§a báº¡n.</p>
          <p className="mb-16 font-sans text-lg text-[#e8b84b] italic text-center">Má»™t láº§n ná»¯a, chÃºc báº¡n má»™t nÄƒm 2026 bÃ¹ng ná»•, bá»©t phÃ¡ má»i giá»›i háº¡n vÃ  sá»›m cháº¡m tay vÃ o má»©c thu nháº­p mÆ¡ Æ°á»›c!</p>
          <div className="text-right pb-10 border-t border-white/10 pt-10">
            <p className="text-sm italic text-[#f0ede8]/45 mb-2">KÃ½ tÃªn,</p>
            <p className="text-2xl font-black text-[#f0ede8] mb-1" style={{ fontFamily: 'Georgia, serif' }}>Nguyá»…n Trá»ng VÄƒn</p>
            <p className="text-sm font-mono text-[#e8b84b]">GiÃ¡m Ä‘á»‘c Chiáº¿n lÆ°á»£c / Founder VSPI Vietnam</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* â•â•â• PAYWALL BOX â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
function PaywallBox({ vspiId, fullName, selectedJob, resultPercent, lostMoney, salary, experience, marketLocation, workProvince, paidCount, dailyViews, onShowToast, onUnlock }: PaywallProps) {
  // Chá»‰ cÃ²n 2 bÆ°á»›c: 'qr' (máº·c Ä‘á»‹nh â€” hiá»‡n QR ngay) vÃ  'checking' (Ä‘ang verify)
  const [payStep, setPayStep] = useState<'qr' | 'creating' | 'checking'>('qr');
  const [phone, setPhone] = useState('');
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [website, setWebsite] = useState('');
  const formStartedAtRef = useRef(Date.now());
  const [error, setError] = useState('');
  const [pollCount, setPollCount] = useState(0);
  // Fallback polling ref â€” chá»‰ dÃ¹ng náº¿u Realtime khÃ´ng kháº£ dá»¥ng
  const pollRef    = useRef<NodeJS.Timeout | null>(null);
  // Supabase Realtime channel ref â€” cleanup khi unmount
  const channelRef = useRef<ReturnType<typeof import('@supabase/supabase-js').createClient> extends { channel: (...a: any[]) => infer C } ? C : any>(null);

  // Cleanup cáº£ Realtime channel láº«n polling interval khi unmount
  useEffect(() => () => {
    if (pollRef.current)    clearInterval(pollRef.current);
    if (channelRef.current) channelRef.current.unsubscribe?.();
  }, []);

  // LÆ°u Ä‘Æ¡n hÃ ng vÃ o DB TRÆ¯á»šC, chá»‰ khi thÃ nh cÃ´ng má»›i chuyá»ƒn sang verify
  const handleConfirmPayment = async () => {
    if (phone && !/^0[0-9]{9}$/.test(phone)) {
      setError('SÄT khÃ´ng há»£p lá»‡ (VD: 0901234567)');
      return;
    }
    if (!privacyConsent) {
      setError('Vui lÃ²ng Ä‘á»“ng Ã½ xá»­ lÃ½ SÄT/lÆ°Æ¡ng Ä‘á»ƒ táº¡o Ä‘Æ¡n vÃ  má»Ÿ khÃ³a bÃ¡o cÃ¡o.');
      return;
    }
    setError('');

    // Hiá»‡n loading trÃªn nÃºt trong lÃºc chá» API
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
      // Báº®T BUá»˜C await â€” khÃ´ng Ä‘Æ°á»£c fire-and-forget
      const res = await fetch('/api/premium/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
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

      // Guard: chá»‰ tiáº¿p tá»¥c khi DB ghi thÃ nh cÃ´ng
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const errMsg  = errData.error || `HTTP ${res.status}`;
        console.error('[checkout] API error:', res.status, errData);
        onShowToast(`KhÃ´ng thá»ƒ táº¡o Ä‘Æ¡n hÃ ng. Lá»—i: ${errMsg}`, 'error');
        setError(`Lá»—i táº¡o Ä‘Æ¡n hÃ ng: ${errMsg}`);
        setPayStep('qr');
        return;
      }

      // DB Ä‘Ã£ cÃ³ báº£n ghi â†’ báº¯t Ä‘áº§u verify
      trackEvent('checkout_order_created', {
        product: 'premium',
        percent: resultPercent,
        market_location: marketLocation,
        work_province: workProvince,
      });
      startVerification();

    } catch (err) {
      console.error('[checkout] Network error:', err);
      onShowToast('Lá»—i káº¿t ná»‘i. Vui lÃ²ng thá»­ láº¡i!', 'error');
      setError('Lá»—i káº¿t ná»‘i. Vui lÃ²ng thá»­ láº¡i!');
      setPayStep('qr');
    }
  };

  /**
   * Chiáº¿n lÆ°á»£c xÃ¡c nháº­n thanh toÃ¡n â€” 2 lá»›p:
   *
   * Lá»›p 1 (thá»­ trÆ°á»›c): Supabase Realtime subscription.
   *   - Server push ngay khi webhook update status='paid'.
   *   - 0 polling request, latency ~200ms sau khi DB update.
   *   - LÆ°u Ã½: RLS DENY ALL anon trÃªn báº£ng purchases â†’ Realtime sáº½ tháº¥t báº¡i
   *     má»™t cÃ¡ch tháº§m láº·ng. Timeout 3 giÃ¢y sáº½ tá»± Ä‘á»™ng báº­t fallback.
   *
   * Lá»›p 2 (nguá»“n truth chÃ­nh): setInterval polling má»—i 8 giÃ¢y.
   *   - Hoáº¡t Ä‘á»™ng hoÃ n toÃ n Ä‘á»™c láº­p vá»›i Realtime.
   *   - Má»—i request thÃªm ?t=timestamp Ä‘á»ƒ phÃ¡ browser cache.
   *   - Ngay khi API tráº£ { status: 'paid' } â†’ clearInterval + unlock ngay.
   *   - Giá»›i háº¡n 15 láº§n (2 phÃºt) trÆ°á»›c khi timeout.
   */
  const startVerification = () => {
    setPayStep('checking');

    // Báº­t fallback polling ngay láº­p tá»©c â€” khÃ´ng chá» Realtime
    // Realtime chá»‰ lÃ  "bonus" náº¿u hoáº¡t Ä‘á»™ng, polling má»›i lÃ  Ä‘áº£m báº£o
    startFallbackPolling();

    // Thá»­ Realtime song song â€” náº¿u thÃ nh cÃ´ng sáº½ cancel polling
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
              // Realtime thÃ nh cÃ´ng â€” cancel polling Ä‘á»ƒ trÃ¡nh double-call
              if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
              channel.unsubscribe();
              // Fetch full dbData + aiAnalysis qua API (Realtime payload khÃ´ng cÃ³ salary_data)
              try {
                const res  = await fetch('/api/premium/verify', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id: vspiId, salary, market_location: marketLocation, work_province: workProvince }),
                });
                const data = await res.json();
                if (data.status === 'paid' && data.dbData) onUnlock(data.dbData, data.aiAnalysis ?? '', data.benchmark ?? null);
              } catch { /* polling Ä‘ang cháº¡y song song sáº½ xá»­ lÃ½ */ }
            }
          }
        )
        .subscribe();

      channelRef.current = channel;
    } catch {
      // Realtime khÃ´ng kháº£ dá»¥ng â€” polling Ä‘Ã£ cháº¡y rá»“i, khÃ´ng cáº§n lÃ m gÃ¬ thÃªm
    }
  };

  // â”€â”€ Lá»›p 2: Polling â€” nguá»“n truth chÃ­nh, hoáº¡t Ä‘á»™ng Ä‘á»™c láº­p vá»›i Realtime â”€â”€
  const startFallbackPolling = () => {
    // TrÃ¡nh táº¡o nhiá»u interval náº¿u Ä‘Æ°á»£c gá»i nhiá»u láº§n
    if (pollRef.current) return;

    let count = 0;
    pollRef.current = setInterval(async () => {
      count++;
      setPollCount(count);
      try {
        // POST khÃ´ng bá»‹ Vercel CDN cache â€” luÃ´n nháº­n data má»›i nháº¥t
        const res  = await fetch('/api/premium/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: vspiId, salary, market_location: marketLocation, work_province: workProvince }),
        });
        if (!res.ok) {
          console.error('Lá»—i gá»i API Verify:', res.status);
          return; // bá» qua láº§n nÃ y, retry á»Ÿ interval tiáº¿p theo
        }
        const data = await res.json();
        if (data.status === 'paid' && data.dbData) {
          // Unlock ngay láº­p tá»©c
          clearInterval(pollRef.current!);
          pollRef.current = null;
          if (channelRef.current) channelRef.current.unsubscribe?.();
          onUnlock(data.dbData, data.aiAnalysis ?? '', data.benchmark ?? null);
        }
      } catch { /* ignore network errors â€” sáº½ retry á»Ÿ láº§n sau */ }

      if (count >= 15) { // 15 Ã— 8s = 2 phÃºt timeout
        clearInterval(pollRef.current!);
        pollRef.current = null;
        setPayStep('qr');
        setError('ChÆ°a nháº­n Ä‘Æ°á»£c xÃ¡c nháº­n. Náº¿u Ä‘Ã£ chuyá»ƒn khoáº£n, liÃªn há»‡ Zalo: 0915 662 876');
      }
    }, 8000);
  };

  // â”€â”€ STEP QR: hiá»‡n QR to ngay, form nhá» bÃªn dÆ°á»›i â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (payStep === 'qr') return (
    <div className="bg-[#0f1219] rounded-[2rem] overflow-hidden border border-[#e8b84b]/40 shadow-2xl shadow-[#e8b84b]/10">

      {/* Header */}
      <div className="bg-[#161b26] px-6 pt-6 pb-4 border-b border-white/10">
        <div className="flex items-start justify-between mb-1">
          <div>
            <h3 className="text-lg font-serif font-black text-[#f0ede8]">Má»Ÿ khÃ³a VSPI Premium</h3>
            <p className="text-[11px] text-[#f0ede8]/45 mt-0.5">
              {dailyViews > 0 ? (
                <><span className="text-green-400 font-bold">âœ“ {dailyViews} ngÆ°á»i</span> Ä‘Ã£ xem bÃ¡o cÃ¡o hÃ´m nay</>
              ) : (
                <span className="text-[#e8b84b] font-bold">Beta tráº£ phÃ­ Ä‘ang má»Ÿ cho nhÃ³m Ä‘áº§u tiÃªn</span>
              )}
            </p>
          </div>
          <span className="bg-red-600 text-white text-[9px] font-black px-2 py-1 rounded-full uppercase tracking-wider shrink-0 ml-2">
            Ra máº¯t Ä‘áº·c biá»‡t
          </span>
        </div>
        {/* Price */}
        <div className="flex items-center gap-2 mt-3">
          <span className="text-[#f0ede8]/35 line-through text-sm">59.000Ä‘</span>
          <span className="text-2xl font-black text-[#e8b84b]">29.000Ä‘</span>
          <span className="bg-red-600 text-white text-[9px] font-black px-2 py-0.5 rounded-full">-51%</span>
          <span className="text-[10px] text-orange-400 font-mono ml-auto">â° Cuá»‘i tuáº§n nÃ y</span>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-4">
          {[
            'Má»‘c Top 10/5/1',
            'Nguá»“n benchmark',
            'Khoáº£ng cÃ¡ch lÆ°Æ¡ng',
            'Script deal lÆ°Æ¡ng',
          ].map(item => (
            <div key={item} className="bg-[#0f1219] border border-white/8 rounded-xl px-3 py-2">
              <p className="text-[10px] text-[#f0ede8]/65 font-bold">âœ“ {item}</p>
            </div>
          ))}
        </div>
      </div>

      {/* QR â€” to, trung tÃ¢m, háº¥p dáº«n */}
      <div className="px-6 pt-6 pb-4 flex flex-col items-center">
        <div className="w-full mb-5 rounded-2xl border border-[#e8b84b]/25 bg-[#e8b84b]/8 p-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-[10px] font-mono font-black uppercase tracking-[0.22em] text-[#e8b84b]">
              29k má»Ÿ khÃ³a gÃ¬?
            </p>
            <span className="rounded-full bg-[#e8b84b] px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-[#0a0c10]">
              hiá»ƒu trong 3 giÃ¢y
            </span>
          </div>
          <div className="space-y-2">
            {[
              'Má»Ÿ khÃ³a má»‘c Top 10 / Top 5 / Top 1',
              'Xem nghá»/khu vá»±c nÃ o tráº£ cao hÆ¡n',
              'CÃ³ script deal lÆ°Æ¡ng dÃ¹ng ngay',
            ].map(item => (
              <div key={item} className="flex items-start gap-2">
                <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-green-400/15 text-[11px] font-black text-green-300">
                  âœ“
                </span>
                <p className="text-[12px] font-bold leading-relaxed text-[#f0ede8]">{item}</p>
              </div>
            ))}
          </div>
        </div>

        <p className="text-[11px] font-mono font-bold text-[#e8b84b] uppercase tracking-widest mb-4">
          QuÃ©t QR Ä‘á»ƒ thanh toÃ¡n ngay
        </p>

        {/* QR card */}
        <div className="bg-white rounded-2xl p-3 shadow-[0_0_32px_rgba(232,184,75,0.2)] mb-3">
          {(() => {
            // XÃ³a dáº¥u gáº¡ch ngang Ä‘á»ƒ ngÃ¢n hÃ ng khÃ´ng tá»± Ã½ biáº¿n Ä‘á»•i ná»™i dung
            const cleanVspiId = vspiId.replace(/-/g, '').toUpperCase();
            return (
              <img
                src={`https://img.vietqr.io/image/msb-96886693012762-compact2.png?amount=29000&addInfo=${cleanVspiId}&accountName=NGUYEN%20TRONG%20VAN`}
                alt="QR thanh toÃ¡n 29.000Ä‘"
                className="w-56 h-56 rounded-xl block"
              />
            );
          })()}
        </div>

        {/* Bank info */}
        <div className="bg-[#161b26] border border-white/10 rounded-xl px-4 py-2.5 text-center w-full mb-1">
          <p className="text-[11px] font-mono text-[#f0ede8]/50">
            MSB Â· <strong className="text-[#f0ede8]">96886693012762</strong> Â· NGUYEN TRONG VAN
          </p>
        </div>
        <div className="bg-[#0a0c10] border border-[#e8b84b]/25 rounded-xl px-4 py-2 text-center w-full">
          <p className="text-[10px] font-mono text-[#f0ede8]/50">
            Ná»™i dung CK:{' '}
            <span className="font-black text-[#e8b84b] tracking-wider">{vspiId.replace(/-/g, '').toUpperCase()}</span>
          </p>
        </div>
      </div>

      {/* Form nhá» + CTA â€” phÃ­a dÆ°á»›i QR */}
      <div className="px-6 pb-6 space-y-3">
        {/* 1 input duy nháº¥t */}
        <div>
          <label className="text-[10px] font-mono font-bold text-[#f0ede8]/60 uppercase tracking-widest block mb-1.5">
            SÄT / Zalo nháº­n bÃ¡o cÃ¡o
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
            TÃ´i Ä‘á»“ng Ã½ VSPI lÆ°u vÃ  xá»­ lÃ½ SÄT, nghá» nghiá»‡p, má»©c lÆ°Æ¡ng Ä‘á»ƒ xÃ¡c nháº­n thanh toÃ¡n, má»Ÿ khÃ³a bÃ¡o cÃ¡o vÃ  há»— trá»£ sau mua. CÃ³ thá»ƒ yÃªu cáº§u xÃ³a dá»¯ liá»‡u táº¡i trang Báº£o máº­t.
          </span>
        </label>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5">
            <p className="text-[11px] text-red-400">{error}</p>
          </div>
        )}

        {/* CTA chÃ­nh */}
        <button
          onClick={handleConfirmPayment}
          className="w-full bg-[#e8b84b] text-[#0a0c10] font-black py-4 rounded-xl text-base
                     hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(232,184,75,0.35)]
                     active:scale-[0.98] transition-all"
        >
          âœ… ÄÃ£ Chuyá»ƒn Khoáº£n â€” Má»Ÿ KhÃ³a Ngay
        </button>

        {/* ROI / Elite copy */}
        <div className="bg-[#161b26] rounded-xl p-3 border border-[#e8b84b]/15 text-center">
          {resultPercent <= 10 ? (
            <p className="text-[11px] font-sans text-[#f0ede8]/60">
              ðŸ’¡ <strong className="text-[#e8b84b]">29k</strong> = 1 ly cÃ  phÃª â€” Má»Ÿ khÃ³a chiáº¿n lÆ°á»£c{' '}
              <strong className="text-[#e8b84b]">C-Level &amp; Top 1%</strong>
            </p>
          ) : (
            <p className="text-[11px] font-sans text-[#f0ede8]/60">
              ðŸ’¡ <strong className="text-[#e8b84b]">29k</strong> = 1 ly cÃ  phÃª Â· Láº¥y láº¡i{' '}
              <strong className="text-[#e8b84b]">{lostMoney.toLocaleString('vi-VN')}Ä‘/nÄƒm</strong>
              {' '}Â· ROI = <strong className="text-[#e8b84b]">{Math.round(lostMoney / 29000)}x</strong>
            </p>
          )}
        </div>

        <p className="text-[9px] font-mono text-center text-[#f0ede8]/30">
          SÄT chá»‰ dÃ¹ng Ä‘á»ƒ gá»­i bÃ¡o cÃ¡o Â· KhÃ´ng spam Â· KhÃ´ng bÃ¡n data
        </p>
      </div>
    </div>
  );

  // â”€â”€ STEP CREATING: Ä‘ang táº¡o Ä‘Æ¡n hÃ ng trong DB â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (payStep === 'creating') return (
    <div className="bg-[#0f1219] rounded-[2rem] p-12 border border-[#e8b84b]/30 shadow-2xl flex flex-col items-center text-center">
      <div className="relative w-16 h-16 mb-5">
        <div className="absolute inset-0 border-4 border-white/10 rounded-full" />
        <div className="absolute inset-0 border-4 border-t-[#e8b84b] rounded-full animate-spin" />
      </div>
      <h3 className="text-lg font-serif font-bold text-[#f0ede8] mb-1">Äang táº¡o Ä‘Æ¡n hÃ ng...</h3>
      <p className="text-sm font-sans text-[#f0ede8]/45">Vui lÃ²ng chá» trong giÃ¢y lÃ¡t</p>
    </div>
  );

  // â”€â”€ STEP CHECKING: Ä‘ang poll â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <div className="bg-[#0f1219] rounded-[2rem] p-12 border border-green-500/50 shadow-2xl flex flex-col items-center text-center">
      <div className="relative w-16 h-16 mb-5">
        <div className="absolute inset-0 border-4 border-white/10 rounded-full" />
        <div className="absolute inset-0 border-4 border-t-green-400 rounded-full animate-spin" />
      </div>
      <h3 className="text-lg font-serif font-bold text-[#f0ede8] mb-1">Äang xÃ¡c nháº­n thanh toÃ¡n...</h3>
      <p className="text-sm font-sans text-[#f0ede8]/45 mb-4">Há»‡ thá»‘ng Ä‘ang kiá»ƒm tra giao dá»‹ch cá»§a báº¡n</p>
      <div className="bg-[#161b26] border border-green-500/20 rounded-2xl px-5 py-3 text-center mb-4">
        <p className="text-[11px] font-mono text-green-400">
          Ná»™i dung CK: <span className="font-black text-[#f0ede8]">{vspiId.replace(/-/g, '').toUpperCase()}</span>
        </p>
        <p className="text-[10px] font-sans text-green-400/70 mt-1">
          Tá»± Ä‘á»™ng unlock sau khi xÃ¡c nháº­n Â· Thá»­ láº§n {pollCount}/24
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
        â† Quay láº¡i
      </button>
      <p className="text-[10px] font-mono text-[#f0ede8]/45 mt-3">
        Náº¿u chá» quÃ¡ 2 phÃºt, liÃªn há»‡ Zalo:{' '}
        <strong className="text-[#e8b84b]">0915 662 876</strong>
        {' '}hoáº·c má»Ÿ <Link href="/support/payment" className="text-[#e8b84b] underline">trang há»— trá»£</Link>.
      </p>
    </div>
  );
}

/* â•â•â• MAIN â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â• */
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
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [showSources, setShowSources] = useState(false);
  const [showAudiencePresets, setShowAudiencePresets] = useState(false);

  // â”€â”€ Restore Premium session tá»« localStorage (xem láº¡i sau khi thoÃ¡t) â”€â”€â”€â”€â”€
  useEffect(() => {
    try {
      const saved = localStorage.getItem('vspi-premium-session');
      if (!saved) return;
      const session = JSON.parse(saved);
      // Session háº¿t háº¡n sau 7 ngÃ y
      if (!session.savedAt || Date.now() - session.savedAt > 7 * 24 * 60 * 60 * 1000) {
        localStorage.removeItem('vspi-premium-session');
        return;
      }
      // Restore state
      if (session.selectedJob) setSelectedJob(session.selectedJob);
      if (session.salary) setSalary(String(session.salary));
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
        showToast('âœ… ÄÃ£ khÃ´i phá»¥c bÃ¡o cÃ¡o Premium cá»§a báº¡n', 'success');
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // â”€â”€ Inline toast (thay tháº¿ window.alert) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [toast, setToast] = useState<{ msg: string; type: 'error' | 'success' | 'info' } | null>(null);
  const toastTimer = useRef<NodeJS.Timeout | null>(null);
  const showToast = useCallback((msg: string, type: 'error' | 'success' | 'info' = 'info') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  // â”€â”€ Sticky CTA: chá»‰ hiá»‡n khi QR Ä‘Ã£ scroll ra khá»i viewport â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    const numericSalary = parseInt(String(salary).replace(/,/g, ''), 10) || 0;
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

  // Scanning animation state
  const [scanStep, setScanStep] = useState(0);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanDone, setScanDone] = useState(false);
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

    // Canvas API fallback â€” váº½ certificate Ä‘Æ¡n giáº£n khÃ´ng phá»¥ thuá»™c DOM
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
      ctx.fillText('Chá»©ng nháº­n vá»‹ trÃ­ thu nháº­p 2026', 400, 92);
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
      ctx.fillText(`VSPI ID: ${vspiId}  Â·  ${TODAY}  Â·  top-percent-scanner.vercel.app`, 400, 440);
      return canvas;
    };

    try {
      let canvas: HTMLCanvasElement | null = null;

      if (el) {
        try {
          // Äá»£i font load xong trÆ°á»›c khi capture
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
        // Element chÆ°a render (user chÆ°a má»Ÿ tab cert) â€” dÃ¹ng fallback
        canvas = drawFallbackCert();
      }

      if (!canvas) throw new Error('Canvas creation failed');
      const link = document.createElement('a');
      link.download = `VSPI-Certificate-${name.replace(/\s+/g, '-')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      showToast('ÄÃ£ táº£i chá»©ng nháº­n!', 'success');
    } catch (err) {
      console.error('Certificate download error:', err);
      showToast('CÃ³ lá»—i khi táº¡o áº£nh. Vui lÃ²ng thá»­ láº¡i.', 'error');
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
        const excludeRegex = /chá»§|kinh doanh tá»± do|founder|owner/i;
        const groups: Record<string, Set<string>> = {};
        data.forEach((item: { industry?: string; job_title: string }) => {
          if (excludeRegex.test(item.job_title)) return;
          const ind = item.industry || 'NgÃ nh khÃ¡c';
          if (!groups[ind]) groups[ind] = new Set();
          groups[ind].add(item.job_title);
        });
        if (!groups['Dá»‹ch vá»¥/Váº­n táº£i hÃ ng khÃ´ng']) groups['Dá»‹ch vá»¥/Váº­n táº£i hÃ ng khÃ´ng'] = new Set();
        groups['Dá»‹ch vá»¥/Váº­n táº£i hÃ ng khÃ´ng'].add('Tiáº¿p viÃªn hÃ ng khÃ´ng');
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
            // All steps done â€” show result
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
    if (preset.salary) setSalary(preset.salary);
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
    if (!selectedJob || !salary) { showToast('Vui lÃ²ng nháº­p Ä‘á»§ Nghá» nghiá»‡p vÃ  Thu nháº­p!', 'error'); return; }
    if (!agreedToTerms) { showToast('Vui lÃ²ng Ä‘á»“ng Ã½ vá»›i ChÃ­nh sÃ¡ch báº£o máº­t vÃ  Äiá»u khoáº£n sá»­ dá»¥ng!', 'error'); return; }

    // Start scanning animation immediately
    paywallSeenRef.current = false;
    setStep(2);

    try {
      const userSal = parseInt(String(salary).replace(/,/g, ''), 10);
      if (isNaN(userSal) || userSal <= 0) { showToast('Thu nháº­p khÃ´ng há»£p lá»‡', 'error'); setStep(1); return; }

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

      // Store result â€” animation will pick it up when done
      pendingResult.current = { percent: json.percent, dbData: json.dbData, isAboveMedian: json.isAboveMedian, lostMoney: json.lostMoney, benchmark: json.benchmark ?? null };

      // LÆ°u scan history (fire-and-forget â€” khÃ´ng block UX)
      fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: null, // sáº½ gÃ¡n SÄT khi user mua premium
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
      showToast('CÃ³ lá»—i xáº£y ra khi truy váº¥n dá»¯ liá»‡u. Vui lÃ²ng thá»­ láº¡i sau.', 'error');
    }
  };

  const strokeDashoffset = CIRCUMFERENCE - (animatedFill / 100) * CIRCUMFERENCE;
  const ringColor = getRingColor(resultPercent);
  const stats = useStats(); // real DB stats only, no artificial baseline
  const selectedWorkProvince = getWorkProvince(workProvince);

  const painMsg = () => {
    const f = lostMoney.toLocaleString('vi-VN');
    if (isAboveMedian && resultPercent <= 20) return <><strong className="text-red-700">{f}Ä‘/nÄƒm</strong> Ä‘ang bá»‹ bá» láº¡i so vá»›i nhÃ³m Top {resultPercent <= 10 ? '5' : '10'}% â€” khoáº£ng cÃ¡ch hoÃ n toÃ n cÃ³ thá»ƒ xÃ³a bá».</>;
    return <>Má»—i nÄƒm báº¡n Ä‘ang <strong className="text-red-700">"bá» lá»¡" {f}Ä‘</strong> â€” chá»‰ vÃ¬ thiáº¿u thÃ´ng tin thá»‹ trÆ°á»ng Ä‘Ãºng lÃºc.</>;
  };

  // Effective display name: certName if entered, else fullName
  const displayName = certName.trim() || fullName.trim() || 'Báº¡n';

  return (
    <div className="min-h-screen bg-[#0a0c10] flex items-start justify-center p-4 pt-6 font-sans text-[#f0ede8]">
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
      <div className="max-w-md w-full space-y-3">

        {/* Trust bar */}
        <div className="bg-[#0f1219]/80 backdrop-blur rounded-2xl px-4 py-3 border border-white/10 shadow-sm">
          <button onClick={() => setShowSources(s => !s)} className="w-full flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono font-black text-[#f0ede8]/45 uppercase tracking-widest">Dá»¯ liá»‡u tá»«</span>
              <div className="flex gap-1.5">{['Adecco', 'ITviec', 'VietnamWorks', 'GSO'].map(s => <span key={s} className="font-mono text-[9px] font-bold bg-[#161b26] text-[#f0ede8]/70 px-2 py-0.5 rounded-full border border-white/10">{s}</span>)}</div>
            </div>
            <span className="text-[#f0ede8]/45 text-xs">{showSources ? 'â–²' : 'â–¼'}</span>
          </button>
          {showSources && (
            <div className="mt-3 space-y-2 fade-up">
              {DATA_SOURCES.map(src => (
                <div key={src.name} className="flex gap-2">
                  <span className="text-[#e8b84b] text-xs mt-0.5">âœ“</span>
                  <div><p className="font-sans text-[11px] font-bold text-[#f0ede8]">{src.label}</p><p className="font-sans text-[10px] text-[#f0ede8]/45">{src.detail}</p></div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* â”€â”€ STEP 1: FORM â”€â”€ */}
        {step === 1 && (
          <div className="relative overflow-hidden bg-[#0f1219] rounded-[2rem] p-8 shadow-2xl shadow-black/50 border border-white/10 fade-up">
            <div className="salary-scan-grid absolute inset-0 pointer-events-none" />
            <div className="salary-scan-beam absolute left-5 right-5 h-px pointer-events-none"
              style={{ background: 'linear-gradient(90deg, transparent 0%, rgba(232,184,75,0.15) 10%, rgba(232,184,75,0.9) 50%, rgba(232,184,75,0.15) 90%, transparent 100%)', boxShadow: '0 0 18px rgba(232,184,75,0.45), 0 0 42px rgba(232,184,75,0.18)' }} />
            <div className="absolute left-5 top-5 w-8 h-8 border-l border-t border-[#e8b84b]/30 rounded-tl-xl pointer-events-none" />
            <div className="absolute right-5 bottom-5 w-8 h-8 border-r border-b border-[#e8b84b]/30 rounded-br-xl pointer-events-none" />
            <div className="relative z-10 text-center mb-8">
              <h1 className="font-black text-[#f0ede8] mb-4" style={{ fontSize: 'clamp(1.9rem, 8vw, 3.2rem)', lineHeight: 1.12 }}>
                LÆ°Æ¡ng báº¡n Ä‘ang Ä‘á»©ng <br />
                <span className="font-serif italic text-[#e8b84b]">Top máº¥y %</span> táº¡i Viá»‡t Nam?
              </h1>
              <p className="text-[#f0ede8]/70 text-sm md:text-base leading-relaxed">
                Há»‡ thá»‘ng Æ°á»›c tÃ­nh vá»‹ trÃ­ thu nháº­p cá»§a báº¡n tá»« dá»¯ liá»‡u GSO, salary guide vÃ  cÃ¡c ná»n táº£ng tuyá»ƒn dá»¥ng lá»›n. <span className="text-[#e8b84b]">CÃ³ nguá»“n, cÃ³ Ä‘á»™ tin cáº­y, cÃ³ má»‘c Top % rÃµ rÃ ng.</span>
              </p>
            </div>

            <div className="relative z-10 space-y-5">
              {/* Nghá» nghiá»‡p */}
              <div>
                <label className="block text-[11px] font-mono font-bold text-[#f0ede8]/70 uppercase tracking-widest mb-2">Nghá» nghiá»‡p hiá»‡n táº¡i</label>
                {!isCustomMode ? (
                  loadingJobs ? (
                    <div className="w-full bg-[#161b26] border border-white/10 rounded-xl p-4 text-[#f0ede8]/70 flex items-center gap-2 text-sm">
                      <div className="w-3 h-3 border-2 border-[#e8b84b] border-t-transparent rounded-full animate-spin" />
                      Äang táº£i danh sÃ¡ch ngÃ nh nghá»...
                    </div>
                  ) : (
                    <div className="relative" ref={dropdownRef}>
                      <div className="relative">
                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[#f0ede8]/45">ðŸ”</span>
                        <input type="text"
                          className="w-full bg-[#161b26] border border-white/10 rounded-xl py-4 pl-10 pr-10 text-[#f0ede8] focus:border-[#e8b84b] focus:ring-1 focus:ring-[#e8b84b] outline-none transition-all text-sm placeholder:text-[#f0ede8]/30"
                          placeholder="TÃ¬m ngÃ nh nghá» (vd: marketing...)"
                          value={showJobDropdown ? jobSearchQuery : selectedJob}
                          onChange={e => { setJobSearchQuery(e.target.value); setShowJobDropdown(true); if (e.target.value === '') setSelectedJob(''); }}
                          onFocus={() => { setShowJobDropdown(true); setJobSearchQuery(''); }}
                        />
                        {selectedJob && !showJobDropdown && (
                          <button className="absolute right-4 top-1/2 -translate-y-1/2 text-[#0a0c10] hover:bg-[#e8b84b]/80 w-6 h-6 flex items-center justify-center bg-[#e8b84b] rounded-full text-xs font-bold transition-colors"
                            onClick={e => { e.stopPropagation(); setSelectedJob(''); setJobSearchQuery(''); setShowJobDropdown(true); }}>âœ•</button>
                        )}
                        {(!selectedJob || showJobDropdown) && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[#f0ede8]/45 pointer-events-none text-xs">â–¼</span>}
                      </div>
                      {showJobDropdown && (
                        <div className="absolute z-50 w-full mt-2 bg-[#161b26] border border-white/10 rounded-2xl shadow-xl max-h-60 overflow-y-auto">
                          {filteredJobs.length === 0 ? (
                            <div className="p-4 text-center text-sm text-[#f0ede8]/45">
                              <p className="mb-2">KhÃ´ng tÃ¬m tháº¥y "{jobSearchQuery}"</p>
                              <button className="text-[#e8b84b] font-bold bg-[#e8b84b]/10 border border-[#e8b84b]/20 px-4 py-2 rounded-xl w-full hover:bg-[#e8b84b]/20 transition-colors"
                                onClick={() => { setIsCustomMode(true); setShowJobDropdown(false); setSelectedJob(jobSearchQuery); }}>âž• ThÃªm ngÃ nh nÃ y</button>
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
                                <span className="text-sm text-[#e8b84b] font-black">âž• NgÃ nh khÃ¡c (nháº­p tay)...</span>
                              </li>
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                  )
                ) : (
                  <div className="relative">
                    <input type="text" autoFocus placeholder="VD: HÆ°á»›ng dáº«n viÃªn, Chá»§ shop..."
                      className="w-full bg-[#161b26] border border-[#e8b84b] rounded-xl p-4 text-[#f0ede8] ring-4 ring-[#e8b84b]/20 outline-none text-sm"
                      value={selectedJob} onChange={e => setSelectedJob(e.target.value)} />
                    <button className="absolute right-4 top-1/2 -translate-y-1/2 text-[#f0ede8]/45 hover:text-red-400"
                      onClick={() => { setIsCustomMode(false); setSelectedJob(''); }}>âœ•</button>
                  </div>
                )}
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => setShowAudiencePresets(v => !v)}
                    className="w-full flex items-center justify-between rounded-xl border border-white/8 bg-[#161b26]/45 px-3 py-2.5 text-left hover:border-[#e8b84b]/30 transition-colors"
                  >
                    <span className="text-[11px] text-[#f0ede8]/55">
                      Báº¡n thuá»™c nhÃ³m Ä‘áº·c biá»‡t? <span className="text-[#e8b84b]/80 font-bold">Chá»n máº«u nhanh</span>
                    </span>
                    <span className="text-[10px] text-[#f0ede8]/35">{showAudiencePresets ? 'â–²' : 'â–¼'}</span>
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

              {/* Thu nháº­p */}
              <div>
                <label className="block text-[11px] font-mono font-bold text-[#f0ede8]/70 uppercase tracking-widest mb-2">Thu nháº­p thÃ¡ng (VNÄ)</label>
                <input type="number" placeholder="VD: 25000000"
                  className="w-full bg-[#161b26] border border-white/10 rounded-xl p-4 text-[#f0ede8] focus:border-[#e8b84b] focus:ring-1 focus:ring-[#e8b84b] outline-none transition-all text-sm placeholder:text-[#f0ede8]/30"
                  value={salary} onChange={e => setSalary(e.target.value)} min={0} />
                {salary && <p className="text-[11px] font-mono text-[#e8b84b] mt-2 pl-1">â‰ˆ {parseInt(salary).toLocaleString('vi-VN')} Ä‘á»“ng/thÃ¡ng</p>}
              </div>

              <div>
                <label className="block text-[11px] font-mono font-bold text-[#f0ede8]/70 uppercase tracking-widest mb-2">
                  Tá»‰nh/thÃ nh lÃ m viá»‡c <span className="text-red-400">*</span>
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
                  Tá»± quy Ä‘á»•i sang vÃ¹ng lÆ°Æ¡ng: <span className="text-[#e8b84b]/80">{MARKET_LOCATIONS.find(item => item.key === selectedWorkProvince.marketLocation)?.label}</span>. Data nÃ y giÃºp VSPI táº¡o benchmark tá»‰nh/thÃ nh tá»‘t hÆ¡n theo thá»i gian.
                </p>
              </div>

              {/* Kinh nghiá»‡m thá»±c táº¿ */}
              <div>
                <label className="block text-[11px] font-mono font-bold text-[#f0ede8]/70 uppercase tracking-widest mb-2">
                  Kinh nghiá»‡m thá»±c táº¿ <span className="text-red-400">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { value: 'junior', label: '0â€“2 nÄƒm', sub: 'Junior' },
                    { value: 'mid',    label: '3â€“5 nÄƒm', sub: 'Mid-level' },
                    { value: 'senior', label: 'TrÃªn 5 nÄƒm', sub: 'Senior / Lead' },
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

              {/* Checkbox Ä‘á»“ng Ã½ */}
              <div className="flex items-start gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setAgreedToTerms(v => !v)}
                  className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${agreedToTerms ? 'bg-[#e8b84b] border-[#e8b84b]' : 'border-white/30 bg-transparent hover:border-[#e8b84b]/60'}`}
                  aria-label="Äá»“ng Ã½ Ä‘iá»u khoáº£n"
                >
                  {agreedToTerms && <span className="text-[#0a0c10] text-[11px] font-black leading-none">âœ“</span>}
                </button>
                <p className="text-[11px] text-[#f0ede8]/60 leading-relaxed">
                  TÃ´i Ä‘á»“ng Ã½ vá»›i{' '}
                  <Link href="/privacy" target="_blank" className="text-[#e8b84b] underline underline-offset-2 hover:text-[#f0ede8] transition-colors">ChÃ­nh sÃ¡ch báº£o máº­t</Link>
                  {' '}vÃ {' '}
                  <Link href="/terms" target="_blank" className="text-[#e8b84b] underline underline-offset-2 hover:text-[#f0ede8] transition-colors">Äiá»u khoáº£n sá»­ dá»¥ng</Link>
                </p>
              </div>

              <button
                onClick={handleScan}
                disabled={!agreedToTerms}
                className="w-full mt-6 p-4 bg-[#e8b84b] text-[#0a0c10] font-black rounded-xl text-lg hover:-translate-y-1 hover:shadow-[0_8px_32px_rgba(232,184,75,0.3)] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none"
              >
                âš¡ XEM NGAY TÃ”I Äá»¨NG TOP Máº¤Y %
              </button>

              <div className="pt-4 border-t border-white/10 mt-6 text-center">
                <p className="text-[10px] text-[#f0ede8]/45 mb-2 font-mono uppercase tracking-widest">Nguá»“n dá»¯ liá»‡u uy tÃ­n tá»«:</p>
                <div className="flex flex-wrap justify-center gap-2">
                  <span className="text-[10px] bg-white/5 border border-white/10 px-3 py-1 rounded-full text-[#f0ede8]/70">Tá»•ng cá»¥c thá»‘ng kÃª GSO</span>
                  <span className="text-[10px] bg-white/5 border border-white/10 px-3 py-1 rounded-full text-[#f0ede8]/70">Adecco Report 2026</span>
                  <span className="text-[10px] bg-white/5 border border-white/10 px-3 py-1 rounded-full text-[#f0ede8]/70">VietnamWorks Data</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* â”€â”€ STEP 2: SCANNING ANIMATION â”€â”€ */}
        {step === 2 && (
          <div className="bg-[#0f1219] rounded-[2rem] p-10 shadow-2xl flex flex-col items-center text-center fade-up border border-white/10">
            {/* Animated scanner visual */}
            <div className="relative w-24 h-24 mb-6 overflow-hidden rounded-2xl border border-[#e8b84b]/20 bg-[#161b26]">
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-4xl">ðŸ”</span>
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

        {/* â”€â”€ STEP 3: RESULT â”€â”€ */}
        {step === 3 && (
          <div className="fade-up space-y-3 pb-24">
            {/* Ring */}
            <div className="bg-[#161b26] rounded-[2rem] p-8 text-center text-[#f0ede8] shadow-2xl relative overflow-hidden border border-[#e8b84b]/20">
              {/* Glow background */}
              <div className="absolute top-[-20%] left-[-10%] w-64 h-64 bg-[#e8b84b]/10 rounded-full blur-3xl pointer-events-none" />

              {/* â”€â”€ SCAN LINE ANIMATION â€” Ä‘Æ°á»ng quÃ©t tá»« trÃªn xuá»‘ng â”€â”€ */}
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
              <p className="text-[10px] font-bold font-mono text-[#e8b84b] uppercase tracking-[0.3em] mb-0.5">VSPI Â· Vietnam Salary Percentile Index</p>
              <p className="text-[9px] font-sans text-[#f0ede8]/45 mb-4">6 nguá»“n bÃ¡o cÃ¡o Â· Q1/2026</p>
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
              <p className="text-xl font-serif font-bold text-[#f0ede8]">Báº¡n cao hÆ¡n {100 - resultPercent}%</p>
              <p className="text-sm font-sans opacity-50 mb-1">ngÆ°á»i lao Ä‘á»™ng ngÃ nh {selectedJob}</p>
              <p className="text-[9px] text-[#e8b84b] font-mono">VSPI ID: {vspiId}</p>
              {benchmarkMeta?.matchedJobTitle && benchmarkMeta.matchedJobTitle.toLowerCase() !== selectedJob.toLowerCase() && (
                <p className="mt-2 text-[10px] text-[#f0ede8]/45">
                  Benchmark gáº§n nháº¥t: <span className="text-[#f0ede8]/70">{benchmarkMeta.matchedJobTitle}</span>
                </p>
              )}
              {benchmarkMeta?.marketLocation && (
                <p className="mt-1 text-[10px] text-[#f0ede8]/45">
                  Khu vá»±c: <span className="text-[#f0ede8]/70">{benchmarkMeta.marketLocation}</span>
                  {benchmarkMeta.locationMultiplier && benchmarkMeta.locationMultiplier !== 1
                    ? <span> Â· há»‡ sá»‘ {benchmarkMeta.locationMultiplier.toFixed(2)}x</span>
                    : null}
                </p>
              )}
              {/* Badge kinh nghiá»‡m â€” luÃ´n hiá»ƒn thá»‹ */}
              <div className="mt-2 inline-flex items-center gap-1.5 bg-[#161b26] border border-white/15 text-[#f0ede8]/55 text-[9px] font-mono px-3 py-1 rounded-full">
                <span>âš™ï¸</span>
                <span>ÄÃ£ Ä‘iá»u chá»‰nh theo má»‘c kinh nghiá»‡m cá»§a báº¡n</span>
              </div>
              {benchmarkMeta && (
                <div className="mt-3 grid grid-cols-2 gap-2 text-left">
                  <div className="bg-[#0f1219] border border-white/10 rounded-xl px-3 py-2">
                    <p className="text-[9px] font-mono uppercase tracking-wider text-[#f0ede8]/35">Äá»™ tin cáº­y</p>
                    <p className="text-sm font-black text-[#e8b84b]">{benchmarkMeta.confidenceScore}/100</p>
                    <p className="text-[9px] text-[#f0ede8]/45">{benchmarkMeta.confidenceLabel}</p>
                  </div>
                  <div className="bg-[#0f1219] border border-white/10 rounded-xl px-3 py-2">
                    <p className="text-[9px] font-mono uppercase tracking-wider text-[#f0ede8]/35">Xáº¿p háº¡ng Æ°á»›c tÃ­nh</p>
                    <p className="text-sm font-black text-[#f0ede8]">#{benchmarkMeta.rankEstimate.toLocaleString('vi-VN')}</p>
                    <p className="text-[9px] text-[#f0ede8]/45">trong lá»±c lÆ°á»£ng lao Ä‘á»™ng</p>
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
              {resultPercent <= 10 && <div className="mt-2 inline-block bg-[#e8b84b]/10 border border-[#e8b84b]/40 text-[#e8b84b] text-xs font-mono font-bold px-3 py-1 rounded-full">ðŸ† Elite â€” Top {resultPercent}% thá»‹ trÆ°á»ng</div>}
            </div>

            <PercentileLadderCard benchmark={benchmarkMeta} percent={resultPercent} />

            {/* â”€â”€ GROUP COMPARE â€” So sÃ¡nh áº©n danh vá»›i nhÃ³m báº¡n â”€â”€ */}
            <GroupCompareCard
              job={selectedJob}
              percent={resultPercent}
              industry={dbData?.industry ?? undefined}
            />

            {/* â”€â”€ INDUSTRY SWITCH CALCULATOR â€” Náº¿u nháº£y ngÃ nh? â”€â”€ */}
            <IndustrySwitchCard currentJob={selectedJob} currentPercent={resultPercent} salary={parseInt(String(salary).replace(/,/g, ''), 10) || 0} />

            {/* â”€â”€ SALARY TIMELINE â€” LÆ°Æ¡ng 3 nÄƒm tá»›i â”€â”€ */}
            <SalaryTimelineCard salary={parseInt(String(salary).replace(/,/g, ''), 10) || 0} percent={resultPercent} job={selectedJob} />

            {/* â”€â”€ NEGOTIATION POWER SCORE â€” Báº¡n cÃ³ Ä‘á»§ leverage? â”€â”€ */}
            <NegotiationScoreCard job={selectedJob} percent={resultPercent} experience={experience} />

            {/* â”€â”€ JOB JUMP MAP â€” há»c insight tá»« Job Ops, nhÆ°ng bÃ¡n action map â”€â”€ */}
            <JobJumpMapTeaser
              job={selectedJob}
              salary={parseInt(String(salary).replace(/,/g, ''), 10) || 0}
              percent={resultPercent}
            />

            {/* Pain / Elite box â€” conditional rendering theo resultPercent */}
            {resultPercent <= 10 ? (
              /* â”€â”€ ELITE: viá»n vÃ ng, khÃ´ng hiá»‡n sá»‘ 0Ä‘ â”€â”€ */
              <div className="bg-[#161b26] border border-[#e8b84b]/50 rounded-3xl p-5"
                style={{ boxShadow: '0 0 24px rgba(232,184,75,0.12)' }}>
                <h4 className="text-[#e8b84b] font-bold font-sans text-sm mb-3">ðŸ† Vá»‹ tháº¿ Tinh hoa â€” NhÃ³m dáº«n Ä‘áº§u thá»‹ trÆ°á»ng</h4>
                <p className="text-[#f0ede8]/80 text-sm leading-relaxed mb-3">
                  Báº¡n Ä‘Ã£ vÆ°á»£t qua <strong className="text-[#e8b84b]">{100 - resultPercent}%</strong> nhÃ¢n sá»± cÃ¹ng ngÃ nh.
                  á»ž Ä‘áº³ng cáº¥p nÃ y, cuá»™c chÆ¡i khÃ´ng cÃ²n lÃ  tÄƒng lÆ°Æ¡ng cÆ¡ báº£n â€” mÃ  lÃ  Ä‘Ã m phÃ¡n{' '}
                  <strong className="text-[#e8b84b]">Cá»• pháº§n (ESOP)</strong>,{' '}
                  <strong className="text-[#e8b84b]">ThÆ°á»Ÿng KPI vÆ°á»£t khung (Out-of-band)</strong> vÃ {' '}
                  <strong className="text-[#e8b84b]">Báº£o vá»‡ vá»‹ trÃ­ trÆ°á»›c AI</strong>.
                </p>
                <div className="bg-[#0f1219] rounded-xl p-3 border border-[#e8b84b]/20 text-center">
                  <p className="text-[10px] font-mono text-[#f0ede8]/45 mb-0.5">Báº¡n Ä‘ang á»Ÿ nhÃ³m</p>
                  <p className="text-2xl font-serif text-[#e8b84b]">Top {resultPercent}% Elite ðŸ…</p>
                </div>
              </div>
            ) : (
              /* â”€â”€ THÆ¯á»œNG: viá»n Ä‘á» cáº£nh bÃ¡o â”€â”€ */
              <div className="bg-red-500/10 border border-red-500/30 rounded-3xl p-5">
                <h4 className="text-red-400 font-bold font-sans text-sm mb-2">âš ï¸ Cáº£nh bÃ¡o lÃ£ng phÃ­ tÃ i nÄƒng</h4>
                <p className="text-[#f0ede8] text-sm leading-relaxed">{painMsg()}</p>
                <div className="mt-3 bg-[#161b26] rounded-xl p-3 border border-red-500/20 text-center">
                  <p className="text-[10px] font-mono text-[#f0ede8]/45 mb-0.5">Báº¡n Ä‘ang bá» lá»¡ má»—i thÃ¡ng</p>
                  <p className="text-2xl font-serif text-red-400">{Math.round(lostMoney / 12).toLocaleString('vi-VN')}Ä‘</p>
                </div>
              </div>
            )}

            {/* â”€â”€ THá»¨ Tá»° Má»šI: PaywallBox ngay sau Pain box â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
                Má»¥c tiÃªu: QR Code xuáº¥t hiá»‡n trong 2-3 mÃ n hÃ¬nh Ä‘áº§u tiÃªn trÃªn mobile
                Secondary content (Teaser, Share, Cert) Ä‘áº©y xuá»‘ng dÆ°á»›i
            â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}

            {!isPremiumUnlocked ? (
              <>
                {/* Teaser Preview â€” cho user Ä‘á»c trÆ°á»›c khi tháº¥y QR */}
                <div className="bg-[#0f1219] rounded-3xl overflow-hidden border border-white/10">
                  <div className="px-5 pt-5 pb-3">
                    <p className="text-[10px] font-mono font-bold text-[#e8b84b] uppercase tracking-widest mb-4">ðŸ“‹ Xem trÆ°á»›c ná»™i dung bÃ¡o cÃ¡o</p>

                    {/* Preview Ä‘oáº¡n 1 â€” hiá»‡n rÃµ */}
                    <div className="mb-3">
                      <p className="text-[11px] font-bold text-[#f0ede8]/50 uppercase tracking-wider mb-1.5">Äiá»u khÃ´ng ai nÃ³i tháº³ng vá»›i báº¡n</p>
                      <p className="text-sm text-[#f0ede8]/75 leading-relaxed">
                        Háº§u háº¿t ngÆ°á»i á»Ÿ vá»‹ trÃ­ Top {resultPercent}% khÃ´ng biáº¿t mÃ¬nh Ä‘ang bá»‹ undervalue â€” vÃ  máº¥t trung bÃ¬nh 3â€“5 nÄƒm má»›i nháº­n ra. BÃ¡o cÃ¡o nÃ y chá»‰ ra Ä‘Ãºng 1 ká»¹ nÄƒng táº¡o ra khoáº£ng cÃ¡ch lÆ°Æ¡ng lá»›n nháº¥t trong ngÃ nh {selectedJob}.
                      </p>
                    </div>

                    {/* Preview Ä‘oáº¡n 2 â€” blur */}
                    <div className="relative">
                      <div className="blur-[4px] select-none pointer-events-none">
                        <p className="text-[11px] font-bold text-[#f0ede8]/50 uppercase tracking-wider mb-1.5">Viá»‡c cáº§n lÃ m ngay trong 30 ngÃ y tá»›i</p>
                        <p className="text-sm text-[#f0ede8]/75 leading-relaxed">
                          Lead 1 feature end-to-end, viáº¿t technical doc, mentor 1 junior Ä‘á»ƒ Ä‘á»§ Ä‘iá»u kiá»‡n apply senior. ÄÃ¢y lÃ  con Ä‘Æ°á»ng ngáº¯n nháº¥t Ä‘á»ƒ tÄƒng thÃªm 6 triá»‡u/thÃ¡ng trong 12 thÃ¡ng tá»›i mÃ  khÃ´ng cáº§n nháº£y viá»‡c ngay.
                        </p>
                      </div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span className="bg-[#0f1219]/85 backdrop-blur-sm text-[#e8b84b] text-[10px] font-mono font-bold px-3 py-1.5 rounded-full border border-[#e8b84b]/30">
                          ðŸ”’ Má»Ÿ khÃ³a Ä‘á»ƒ Ä‘á»c Ä‘áº§y Ä‘á»§
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* CTA bridge */}
                  <div className="bg-[#161b26] border-t border-white/8 px-5 py-3 flex items-center justify-between">
                    <p className="text-[11px] text-[#f0ede8]/45">+ Ká»‹ch báº£n Ä‘Ã m phÃ¡n lÆ°Æ¡ng Â· Lá»™ trÃ¬nh 30 ngÃ y Â· Chá»©ng nháº­n VSPI</p>
                    <span className="text-[#e8b84b] text-xs font-black">29k â†“</span>
                  </div>
                </div>

                {/* 1. PaywallBox â€” QR ngay sau Teaser */}
                <div id="paywall-anchor" ref={paywallRef}>
                  <PaywallBox
                    fullName={displayName}
                    vspiId={vspiId}
                    selectedJob={selectedJob}
                    resultPercent={resultPercent}
                    lostMoney={lostMoney}
                    salary={parseInt(String(salary).replace(/,/g, ''), 10) || 0}
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
                        salary_band: getSalaryBand(parseInt(String(salary).replace(/,/g, ''), 10) || 0),
                        confidence_score: benchmark?.confidenceScore ?? benchmarkMeta?.confidenceScore,
                        match_type: benchmark?.matchType ?? benchmarkMeta?.matchType,
                      });
                      setIsPremiumUnlocked(true);
                      // LÆ°u vÃ o localStorage Ä‘á»ƒ xem láº¡i sau khi thoÃ¡t
                      try {
                        localStorage.setItem('vspi-premium-session', JSON.stringify({
                          vspiId,
                          selectedJob,
                          salary: parseInt(String(salary).replace(/,/g, ''), 10) || 0,
                          resultPercent,
                          lostMoney,
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

                {/* 2. TeaserZone â€” sau QR, dÃ¹ng Ä‘á»ƒ reinforce value */}
                <TeaserZone
                  fullName={displayName}
                  job={selectedJob}
                  percent={resultPercent}
                  lostMoney={lostMoney}
                  dbData={dbData}
                  paidCount={stats.paidCount}
                  dailyViews={stats.dailyViews}
                />

                {/* 3. Secondary: Share + Social proof + Cert â€” cuá»‘i trang */}
                <BetaFeedbackPanel paidCount={stats.paidCount} dailyViews={stats.dailyViews} />

                <div className="space-y-3 pt-2 border-t border-white/5">
                  <ShareButton percent={resultPercent} job={selectedJob} benchmark={benchmarkMeta} />

                  <div className="text-center py-1">
                    <p className="text-[11px] font-mono text-[#f0ede8]/35">
                      {stats.dailyViews > 0 ? `ðŸ”¥ ${stats.dailyViews.toLocaleString('vi-VN')} lÆ°á»£t quÃ©t hÃ´m nay` : 'Beta tráº£ phÃ­: social proof hiá»ƒn thá»‹ theo sá»‘ tháº­t'}
                    </p>
                  </div>

                  {/* Certificate input â€” cuá»‘i cÃ¹ng */}
                  <div className="bg-[#0f1219] border border-white/10 rounded-2xl p-4">
                    <p className="text-[11px] font-mono font-bold text-[#f0ede8]/50 uppercase tracking-widest mb-2">ðŸ… Táº£i chá»©ng nháº­n (sau khi má»Ÿ khÃ³a)</p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Nháº­p tÃªn Ä‘á»ƒ in trÃªn chá»©ng nháº­n..."
                        className="flex-1 bg-[#161b26] border border-white/10 rounded-xl px-4 py-2.5 text-sm text-[#f0ede8] focus:border-[#e8b84b] outline-none transition-colors placeholder:text-[#f0ede8]/25"
                        value={certName}
                        onChange={e => setCertName(e.target.value)}
                      />
                      <button
                        onClick={() => {
                          if (!certName.trim()) { showToast('Vui lÃ²ng nháº­p há» tÃªn!', 'error'); return; }
                          setFullName(certName.trim());
                          showToast('ÄÃ£ lÆ°u tÃªn! Má»Ÿ khÃ³a Premium Ä‘á»ƒ táº£i chá»©ng nháº­n Ä‘áº§y Ä‘á»§.', 'info');
                        }}
                        className="bg-[#161b26] border border-white/15 text-[#f0ede8]/60 font-bold px-3 py-2.5 rounded-xl text-xs hover:border-[#e8b84b]/30 transition-colors whitespace-nowrap"
                      >
                        LÆ°u tÃªn
                      </button>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <EliteLetter fullName={displayName} job={selectedJob} percent={resultPercent} />

                {/* Certificate input â€” sau khi Ä‘Ã£ mua */}
                <div className="bg-[#0f1219] border border-[#e8b84b]/20 rounded-3xl p-5">
                  <p className="text-[11px] font-mono font-bold text-[#e8b84b] uppercase tracking-widest mb-1">ðŸ… Táº£i chá»©ng nháº­n cá»§a báº¡n</p>
                  <p className="text-[11px] text-[#f0ede8]/50 mb-3">Nháº­p tÃªn Ä‘á»ƒ in trÃªn chá»©ng nháº­n VSPI cÃ¡ nhÃ¢n hÃ³a</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Há» vÃ  tÃªn cá»§a báº¡n..."
                      className="flex-1 bg-[#161b26] border border-white/10 rounded-xl px-4 py-3 text-sm text-[#f0ede8] focus:border-[#e8b84b] outline-none transition-colors placeholder:text-[#f0ede8]/30"
                      value={certName}
                      onChange={e => setCertName(e.target.value)}
                    />
                    <button
                      onClick={() => {
                        if (!certName.trim()) { showToast('Vui lÃ²ng nháº­p há» tÃªn!', 'error'); return; }
                        setFullName(certName.trim());
                        handleDownloadCertificate(certName.trim());
                      }}
                      disabled={certDownloading}
                      className="bg-[#e8b84b] text-[#0a0c10] font-black px-4 py-3 rounded-xl text-sm hover:bg-[#f0c84b] transition-colors whitespace-nowrap disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {certDownloading ? 'Äang táº¡o...' : 'Táº£i chá»©ng nháº­n'}
                    </button>
                  </div>
                </div>

                <ShareButton percent={resultPercent} job={selectedJob} benchmark={benchmarkMeta} />

                {/* Lazy-loaded â€” chá»‰ táº£i bundle khi isPremiumUnlocked === true */}
                <Suspense fallback={
                  <div className="bg-[#0f1219] rounded-[2rem] p-12 flex flex-col items-center gap-4 border border-white/10">
                    <div className="w-10 h-10 border-4 border-[#e8b84b]/30 border-t-[#e8b84b] rounded-full animate-spin" />
                    <p className="text-[11px] font-mono text-[#f0ede8]/45">Äang táº£i bÃ¡o cÃ¡o Premium...</p>
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

            <button onClick={() => { setStep(1); setAnimatedFill(0); setIsPremiumUnlocked(false); setAiAnalysis(''); setCertName(''); setExperience('mid'); setMarketLocation('hcm'); setWorkProvince(DEFAULT_WORK_PROVINCE); setBenchmarkMeta(null); pendingResult.current = null; localStorage.removeItem('vspi-premium-session'); }}
              className="w-full text-center py-5 text-[11px] font-mono text-[#f0ede8]/45 hover:text-[#e8b84b] transition-colors">
              â† QUÃ‰T Láº I Vá»šI Má»¨C LÆ¯Æ NG KHÃC
            </button>
          </div>
        )}

        {/* â”€â”€ STICKY CTA BAR â€” chá»‰ hiá»‡n khi QR Ä‘Ã£ scroll ra khá»i viewport â”€â”€ */}
        {step === 3 && !isPremiumUnlocked && qrOutOfView && (
          <div className="fixed bottom-0 left-0 right-0 z-50 pointer-events-none">
            {/* Gradient fade phÃ­a trÃªn */}
            <div className="h-6 bg-gradient-to-t from-[#0a0c10] to-transparent" />
            <div className="bg-[#0a0c10]/95 backdrop-blur-md border-t border-[#e8b84b]/25 px-4 py-3 pointer-events-auto">
              <div className="max-w-md mx-auto flex items-center gap-3">
                {/* Text bÃªn trÃ¡i */}
                <div className="flex-1 min-w-0">
                  {resultPercent <= 10 ? (
                    <p className="text-[11px] font-mono text-[#f0ede8]/60 leading-tight truncate">
                      Chiáº¿n lÆ°á»£c C-Level &amp; Top 1%
                    </p>
                  ) : (
                    <p className="text-[11px] font-mono text-[#f0ede8]/60 leading-tight truncate">
                      Bá» lá»¡{' '}
                      <span className="text-red-400 font-bold">
                        {(lostMoney / 1_000_000).toFixed(0)} triá»‡u/nÄƒm?
                      </span>
                    </p>
                  )}
                  <p className="text-[10px] text-[#f0ede8]/35 font-mono truncate">
                    <span className="line-through">59k</span> â†’ 29k Â· Æ¯u Ä‘Ã£i cuá»‘i tuáº§n
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
                  Má»ž KHÃ“A Â· 29K
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* â”€â”€ TOAST NOTIFICATION â€” thay tháº¿ window.alert â”€â”€ */}
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
            {toast.type === 'error'   && 'âš ï¸'}
            {toast.type === 'success' && 'âœ…'}
            {toast.type === 'info'    && 'ðŸ’¡'}
          </span>
          <span className="leading-snug">{toast.msg}</span>
          <button
            onClick={() => setToast(null)}
            className="ml-1 opacity-60 hover:opacity-100 transition-opacity text-base leading-none shrink-0"
          >âœ•</button>
        </div>
      )}
    </div>
  );
}
