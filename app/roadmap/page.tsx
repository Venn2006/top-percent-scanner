"use client";

import { useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import QRCode from 'react-qr-code';
import { getCareerCompassContext } from '@/lib/careerCompassEngine';
import { getAttributionPayload } from '@/lib/attribution';
import { playSuccess, playTap, startThinkingPulse, stopThinkingPulse, vibrate } from '@/lib/sound';
import { cleanRoadmapAccessCode, getRoadmapAccessCode } from '@/lib/roadmapAccess';

function calcTargetSalary(currentSalary: number, job: string, months: number) {
  const ctx = getCareerCompassContext(job, currentSalary, 50);
  // Floor = max(multiplier, absolute increase). nextBandMin acts as upward lift for 12-month only.
  const floors: Record<number, { mult: number; abs: number }> = {
    3:  { mult: 1.12, abs: 1_500_000 },
    6:  { mult: 1.25, abs: 3_000_000 },
    12: { mult: 1.40, abs: 5_000_000 },
  };
  const f = floors[months] ?? floors[6];
  let target = Math.max(currentSalary * f.mult, currentSalary + f.abs);

  // 12-month: if user's next career band sits higher, lift toward it (capped at +15%).
  if (months === 12 && ctx.nextBandMin > target) {
    const lift = Math.min(ctx.nextBandMin - target, target * 0.15);
    target += lift;
  }

  // Sanity cap: never project more than 2x current — keeps numbers realistic.
  target = Math.min(target, currentSalary * 2);
  target = Math.round(target / 500_000) * 500_000;

  const inc = target - currentSalary;
  const pct = Math.round((inc / currentSalary) * 100);
  return {
    target,
    label: `+${(inc / 1_000_000).toFixed(1)} triệu/tháng (+${pct}%)`,
    rationale: months === 3
      ? `Mục tiêu +${pct}% trong 3 tháng — có cơ sở để yêu cầu nếu hoàn thành task và có thành tích đo được`
      : months === 6
      ? `Mục tiêu +${pct}% trong 6 tháng — đủ thời gian nâng kỹ năng, chứng minh giá trị và đàm phán`
      : `Mục tiêu +${pct}% trong 1 năm — lộ trình bền vững qua thăng tiến nội bộ hoặc đổi vai trò`,
  };
}

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

const cleanMoneyInput = (value: string) => value.replace(/\D/g, '').slice(0, 12);
const formatMoneyInput = (value: string) => {
  const digits = cleanMoneyInput(value);
  return digits ? Number(digits).toLocaleString('en-US') : '';
};
const formatDurationLabel = (months: number) => months === 12 ? '1 năm' : `${months} tháng`;
interface RoadmapIntake {
  currentPosition?: string;
  mainWeakness?: string;
  twoYearGoal?: string;
  educationLevel?: string;
  educationDetail?: string;
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
interface RoadmapProfile extends RoadmapIntake { vspiId: string; accessCode?: string; phone: string; job: string; salary: number; duration: number; }

// Bước: setup → qr → checking → intake → roadmap | restore (nhập SĐT để lấy lại)
type PageStep = 'setup' | 'restore' | 'qr' | 'checking' | 'intake' | 'roadmap';

const STORAGE_KEY = 'vspi-roadmap-v2';
const DRAFT_KEY = 'vspi-roadmap-draft-v1';
const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const ROADMAP_PRESETS = [
  {
    id: 'fresh-graduate',
    title: 'Mới tốt nghiệp',
    note: 'Từ offer đầu đời thành portfolio + script deal sau thử việc.',
    job: 'Fresher / Sinh viên mới tốt nghiệp',
    salary: '10000000',
    duration: 6 as const,
  },
  {
    id: 'binh-duong-worker',
    title: 'Công nhân Bình Dương',
    note: 'Biến năng suất, chuyên cần, kỹ năng máy thành hồ sơ xin tăng lương.',
    job: 'Công nhân vận hành máy Bình Dương',
    salary: '9000000',
    duration: 6 as const,
  },
];

const EDUCATION_LEVELS = [
  '12/12',
  'Trung cấp / Cao đẳng',
  'Cử nhân',
  'Thạc sĩ / MBA',
  'Tiến sĩ',
  'Khác',
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
  const lines = markdown.split(/\r?\n/);
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
  const levelNames = ['Tân binh', 'Có nền', 'Có bằng chứng', 'Sẵn sàng deal', 'Ứng viên top'];
  const remaining = Math.max(0, total - done);
  const encouragement = pct >= 100
    ? 'Max Level rồi. Bây giờ không chỉ là học nữa, đây là bộ bằng chứng để nói chuyện lương hoặc tìm nơi trả đúng giá.'
    : pct >= 80
      ? `Gần chạm Max Level. Còn ${remaining} task nữa là đủ bộ hồ sơ deal lương cực sắc.`
      : pct >= 50
        ? `Đã qua nửa đường. Tiếp tục đóng gói output, đừng để bằng chứng nằm rải rác trong đầu.`
        : pct >= 20
          ? `Đang lên level. Mỗi task tick xong là thêm một mảnh bằng chứng để tăng xác suất deal.`
          : `Bắt đầu bằng task dễ nhất hôm nay. Không cần hoàn hảo, chỉ cần có output đầu tiên.`;
  return (
    <div className="rounded-2xl border border-[#e8b84b]/25 bg-[#0f1219] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-mono font-black uppercase tracking-normal text-[#e8b84b]">
            {plan?.levelName || 'Evidence Level'}
          </p>
          <h2 className="mt-1 text-lg font-black leading-tight text-[#f0ede8]">
            Level {level} - {levelNames[level - 1]}
          </h2>
        </div>
        <div className="shrink-0 rounded-xl border border-white/10 bg-[#161b26] px-3 py-2 text-center">
          <p className="text-[9px] uppercase text-[#f0ede8]/35">XP</p>
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
          <p className="text-[9px] uppercase text-[#f0ede8]/35">Hoàn thành</p>
          <p className="text-xs font-black text-[#f0ede8]">{done}/{total} task</p>
        </div>
        <div className="rounded-xl border border-white/8 bg-[#161b26] px-3 py-2">
          <p className="text-[9px] uppercase text-[#f0ede8]/35">Tiến độ</p>
          <p className="text-xs font-black text-green-300">{pct}%</p>
        </div>
      </div>
      {plan && (
        <p className="mt-3 text-[11px] leading-relaxed text-[#f0ede8]/55">
          Cam kết chuẩn {plan.standardWeeks} tuần, nhịp bận {plan.flexibleWeeks} tuần, mỗi tuần {plan.weeklyHours}. {plan.completionRule}
        </p>
      )}
      <p className="mt-3 rounded-xl border border-[#e8b84b]/20 bg-[#e8b84b]/8 px-3 py-2 text-[11px] font-bold leading-relaxed text-[#f0ede8]/75">
        {encouragement}
      </p>
    </div>
  );
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function practicalSkillBank(profile: RoadmapProfile | null, plan?: RoadmapActionPlan) {
  const text = normalizeText([
    profile?.job,
    profile?.currentPosition,
    profile?.educationDetail,
    ...(plan?.milestones.flatMap(milestone => [milestone.title, milestone.objective, ...milestone.skills]) ?? []),
  ].filter(Boolean).join(' '));

  if (/dao tao|l&d|learning|teacher|giao vien|giang day|tesol|ngon ngu anh|trung tam ngoai ngu/.test(text)) {
    return [
      'Instructional Design',
      'Thiết kế slide Canva/PowerPoint',
      'Quay và edit video bài giảng',
      'Photoshop/Canva xử lý hình ảnh',
      'Thiết kế quiz/LMS/e-learning',
      'Tiếng Anh B2+ cho công việc',
      'Viết CV/LinkedIn dạng case study',
      'Phân tích feedback học viên',
    ];
  }

  if (/marketing|content|social|media|brand|designer|thiet ke/.test(text)) {
    return [
      'Edit video short-form',
      'Thiết kế Canva',
      'Photoshop cơ bản',
      'Copywriting chuyển đổi',
      'Lập content calendar',
      'Đọc chỉ số reach/CTR/CVR',
      'Viết portfolio campaign',
      'Viết CV/LinkedIn dạng case study',
    ];
  }

  if (/developer|engineer|backend|frontend|data|it|software|devops|tester|qa/.test(text)) {
    return [
      'Git/GitHub workflow',
      'TypeScript/JavaScript thực chiến',
      'SQL và đọc dữ liệu',
      'API integration',
      'Debugging có log',
      'Viết tài liệu kỹ thuật',
      'System design cơ bản',
      'Viết CV kỹ thuật theo project',
    ];
  }

  if (/cong nhan|van hanh may|san xuat|factory|operator|line|kho|qc/.test(text)) {
    return [
      'Vận hành máy đúng SOP',
      '5S và an toàn lao động',
      'Ghi chép lỗi sản xuất',
      'Excel/Sheets theo dõi sản lượng',
      'QC checklist',
      'Giảm lỗi line',
      'Đào tạo người mới',
      'Hồ sơ lên tổ phó/tổ trưởng',
    ];
  }

  if (/sales|kinh doanh|account|tu van|ban hang/.test(text)) {
    return [
      'CRM pipeline',
      'Cold message/email',
      'Viết proposal',
      'Follow-up khách hàng',
      'Đọc conversion rate',
      'Chốt lịch demo/tư vấn',
      'Phân tích lý do mất deal',
      'Viết CV sales bằng số',
    ];
  }

  return [
    'Excel/Google Sheets dashboard',
    'Canva/PowerPoint trình bày',
    'Viết CV/LinkedIn dạng case study',
    'Tiếng Anh B2+ cho công việc',
    'Viết báo cáo KPI',
    'Quản lý task bằng checklist',
    'Giao tiếp với quản lý/khách hàng',
    'Đóng gói portfolio cá nhân',
  ];
}

function uniqueRoadmapSkills(plan: RoadmapActionPlan | undefined, profile: RoadmapProfile | null) {
  const blocked = /đàm phán lương|tạo bằng chứng tăng lương|evidence log|tìm cơ hội trả cao hơn|đóng gói output/i;
  const bank = practicalSkillBank(profile, plan);
  const fromPlan = plan?.milestones.flatMap(milestone => [
    ...milestone.skills,
    ...milestone.weeks.flatMap(week => week.tasks.map(task => task.skill)),
  ]) ?? [];
  const clean = fromPlan
    .map(skill => skill.trim())
    .filter(skill => skill.length > 2 && skill.length <= 48 && !blocked.test(skill) && !/^n\/a$/i.test(skill));

  return Array.from(new Set([...bank, ...clean])).slice(0, 8);
}

function roadmapAchievements(plan: RoadmapActionPlan | undefined, profile: RoadmapProfile | null, stats: { done: number; total: number }) {
  const text = normalizeText(`${profile?.job || ''} ${profile?.currentPosition || ''} ${profile?.educationDetail || ''}`);
  if (/dao tao|l&d|learning|teacher|giao vien|giang day|trung tam ngoai ngu/.test(text)) {
    return [
      `Hoàn thành ${stats.done}/${stats.total} task theo checklist có output và KPI.`,
      'Tạo được 1 bộ slide/lesson outline có mục tiêu học, bài tập và tiêu chí đánh giá.',
      'Có ít nhất 1 video hoặc demo bài giảng ngắn để đưa vào portfolio.',
      'Thu thập feedback thật và có phiên bản đã sửa sau feedback.',
      'Biết quy đổi kết quả đào tạo thành chỉ số: completion, feedback score, retention hoặc complaint.',
      'Có CV/LinkedIn bullet theo format: kỹ năng + sản phẩm + kết quả đo được.',
    ];
  }

  const outputs = Array.from(new Set((plan?.milestones
    .flatMap(milestone => milestone.weeks.flatMap(week => week.tasks.map(task => task.output)))
    .map(output => output.trim())
    .filter(output => output.length > 6 && !/evidence log|output gắn trực tiếp/i.test(output)) ?? []))).slice(0, 3);

  return [
    `Hoàn thành ${stats.done}/${stats.total} task theo checklist có output và KPI.`,
    `Có portfolio/case study cho role ${profile?.job || 'ứng viên'} để gửi cho sếp hoặc HR.`,
    'Có CV/LinkedIn bullet theo format: kỹ năng + sản phẩm + kết quả đo được.',
    'Có dashboard hoặc bảng theo dõi KPI trước/sau.',
    ...outputs.map(output => `Hoàn thành sản phẩm: ${output}`),
  ].slice(0, 6);
}

function RoadmapCompletionReward({
  profile,
  plan,
  stats,
  showCertificate,
  onShowCertificate,
}: {
  profile: RoadmapProfile | null;
  plan?: RoadmapActionPlan;
  stats: { done: number; total: number; pct: number };
  showCertificate: boolean;
  onShowCertificate: () => void;
}) {
  const [certDownloading, setCertDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const skills = uniqueRoadmapSkills(plan, profile);
  const achievements = roadmapAchievements(plan, profile, stats);
  const issuedAt = new Date().toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const verifyUrl = `https://topluong.com/verify?id=${encodeURIComponent(profile?.vspiId || '')}&type=roadmap&job=${encodeURIComponent(profile?.job || '')}&tasks=${stats.total}`;

  const downloadCertificate = async () => {
    const el = document.getElementById('roadmap-completion-certificate');
    if (!el) return;
    setCertDownloading(true);
    setDownloadError('');
    try {
      await document.fonts.ready;
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(el, {
        backgroundColor: '#0a0c10',
        scale: Math.min(2.5, window.devicePixelRatio || 2),
        useCORS: true,
        allowTaint: false,
        logging: false,
      });
      const link = document.createElement('a');
      link.download = `Top-Luong-Max-Level-${(profile?.phone || profile?.vspiId || 'roadmap').replace(/\D/g, '') || 'certificate'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      playSuccess();
    } catch (err) {
      console.error('Roadmap certificate download error:', err);
      setDownloadError('Chưa tải được ảnh. Thử bấm lại sau vài giây.');
    } finally {
      setCertDownloading(false);
    }
  };

  if (!stats.total) return null;
  if (stats.done < stats.total) {
    const left = stats.total - stats.done;
    return (
      <div className="rounded-2xl border border-[#e8b84b]/20 bg-[#0f1219] p-4">
        <p className="text-[10px] font-mono font-black uppercase tracking-normal text-[#e8b84b]">Phần thưởng cuối lộ trình</p>
        <h3 className="mt-1 text-base font-black leading-tight text-[#f0ede8]">Hoàn thành {left} task nữa để mở Max Level</h3>
        <p className="mt-2 text-[11px] leading-relaxed text-[#f0ede8]/55">
          Khi đạt 100%, bạn sẽ nhận “Bằng chứng nhận hoàn thành lộ trình”, kèm checklist hành động: xin review lương, gửi proposal tăng scope, hoặc apply sang nơi trả cao hơn.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-green-400/30 bg-green-400/10 p-4 shadow-[0_0_28px_rgba(74,222,128,0.12)]">
      <p className="text-[10px] font-mono font-black uppercase tracking-normal text-green-300">Max Level unlocked</p>
      <h3 className="mt-1 text-lg font-black leading-tight text-[#f0ede8]">Bạn đã hoàn thành toàn bộ lộ trình</h3>
      <p className="mt-2 text-[11px] leading-relaxed text-[#f0ede8]/65">
        Đây là lúc chuyển từ “làm task” sang “đòi giá trị”: đặt lịch review lương trong 7 ngày, gửi portfolio/case study cho sếp, hoặc apply 10 nơi có band cao hơn nếu công ty hiện tại không có ngân sách.
      </p>

      <button
        type="button"
        onClick={onShowCertificate}
        className="mt-4 w-full rounded-xl bg-green-300 px-4 py-3 text-sm font-black text-[#0a0c10] transition-all hover:-translate-y-0.5"
      >
        {showCertificate ? 'Ẩn bằng khen' : 'Tôi đã hoàn thành - nhận bằng khen'}
      </button>

      {showCertificate && (
        <div className="mt-4 space-y-3">
          <div
            id="roadmap-completion-certificate"
            className="relative overflow-hidden rounded-2xl border border-[#e8b84b]/45 bg-[#0a0c10] p-5 text-left shadow-2xl shadow-green-400/10"
          >
            <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'repeating-linear-gradient(45deg,#fff 0,#fff 1px,transparent 0,transparent 34px)' }} />
            <div className="absolute right-3 top-3 flex h-20 w-20 rotate-[-10deg] items-center justify-center rounded-full border-2 border-[#e8b84b]/45 text-center text-[9px] font-black uppercase leading-tight text-[#e8b84b]/80">
              Top Lương<br />Verified
            </div>
            <div className="relative z-10 pr-20">
              <p className="text-[10px] font-mono font-black uppercase tracking-[0.12em] text-[#e8b84b]">Top Lương Certificate</p>
              <h4 className="mt-2 text-2xl font-black leading-tight text-[#f0ede8]">Bằng khen Max Level</h4>
              <p className="mt-1 text-sm font-black text-green-300">Hoàn thành lộ trình tăng lương {stats.done}/{stats.total} task</p>
            </div>

            <div className="relative z-10 mt-5 rounded-2xl border border-white/10 bg-[#111723] p-4">
              <p className="text-[9px] uppercase text-[#f0ede8]/40">Trao cho hồ sơ</p>
              <p className="mt-1 text-lg font-black leading-tight text-[#f0ede8]">{profile?.job || 'Ứng viên Top Lương'}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-[#f0ede8]/55">
                Mã xác thực {profile?.vspiId || 'VSPI'} · Cấp ngày {issuedAt} · Gắn với SĐT {profile?.phone || 'đã xác thực'}
              </p>
            </div>

            <div className="relative z-10 mt-4">
              <p className="text-[10px] font-mono font-black uppercase tracking-normal text-[#e8b84b]">Specific skills đã đạt</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {skills.map(skill => (
                  <span key={skill} className="rounded-full border border-green-300/25 bg-green-300/10 px-2.5 py-1 text-[10px] font-bold leading-tight text-green-200">
                    {skill}
                  </span>
                ))}
              </div>
            </div>

            <div className="relative z-10 mt-4">
              <p className="text-[10px] font-mono font-black uppercase tracking-normal text-[#e8b84b]">Specific achievements có thể show sếp</p>
              <div className="mt-2 space-y-2">
                {achievements.map(item => (
                  <div key={item} className="rounded-xl border border-white/8 bg-white/[0.04] px-3 py-2">
                    <p className="text-[11px] font-semibold leading-relaxed text-[#f0ede8]/78">✓ {item}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative z-10 mt-4 grid grid-cols-[minmax(0,1fr)_5.5rem] gap-3">
              <div className="rounded-2xl border border-[#e8b84b]/20 bg-[#e8b84b]/10 p-3">
                <p className="text-[10px] font-black uppercase text-[#e8b84b]">Next move trong 7 ngày</p>
                <p className="mt-1 text-[11px] leading-relaxed text-[#f0ede8]/70">
                  Gửi portfolio/case study + bằng khen này để xin review lương. Nếu không có ngân sách, dùng cùng bộ kỹ năng để apply 10 nơi có band cao hơn.
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white p-2">
                <QRCode value={verifyUrl} size={72} />
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={downloadCertificate}
            disabled={certDownloading}
            className="w-full rounded-xl bg-[#e8b84b] px-4 py-3 text-sm font-black leading-tight text-[#0a0c10] transition-all hover:-translate-y-0.5 disabled:opacity-60"
          >
            {certDownloading ? 'Đang tạo ảnh...' : 'Tải chứng nhận PNG có QR'}
          </button>
          {downloadError && <p className="text-center text-[11px] text-red-300">{downloadError}</p>}
        </div>
      )}
    </div>
  );
}

function RoadmapActionPlanView({
  plan,
  progress,
  onToggle,
}: {
  plan: RoadmapActionPlan;
  progress: Record<string, boolean>;
  onToggle: (key: string) => void;
}) {
  return (
    <div className="space-y-4">
      {plan.milestones.map(milestone => {
        const milestoneTasks = milestone.weeks.flatMap(week =>
          week.tasks.map((_, taskIndex) => `w${week.week}_t${taskIndex}`)
        );
        const done = milestoneTasks.filter(key => progress[key]).length;
        const pct = milestoneTasks.length ? Math.round((done / milestoneTasks.length) * 100) : 0;
        return (
          <section key={milestone.month} className="overflow-hidden rounded-2xl border border-white/8 bg-[#0f1219]">
            <div className="border-b border-white/8 bg-[#111723] px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-mono font-black uppercase tracking-normal text-[#e8b84b]">Tháng {milestone.month}</p>
                  <h3 className="mt-1 text-base font-black leading-tight text-[#f0ede8]">{milestone.title}</h3>
                </div>
                <span className="shrink-0 rounded-full border border-[#e8b84b]/25 bg-[#e8b84b]/10 px-2 py-1 text-[10px] font-black text-[#e8b84b]">
                  {done}/{milestoneTasks.length}
                </span>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-[#f0ede8]/55">{milestone.objective}</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#0a0c10]">
                <div className="h-full rounded-full bg-[#e8b84b]" style={{ width: `${pct}%` }} />
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {milestone.skills.map(skill => (
                  <span key={skill} className="rounded-full border border-white/8 bg-white/[0.04] px-2 py-1 text-[10px] font-bold text-[#f0ede8]/65">
                    {skill}
                  </span>
                ))}
              </div>
            </div>

            <div className="space-y-4 p-4">
              {milestone.weeks.map(week => (
                <div key={week.week} className="rounded-2xl border border-white/8 bg-[#161b26] p-3">
                  <div className="mb-3 flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[#e8b84b]/15 text-xs font-black text-[#e8b84b]">
                      W{week.week}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-black leading-tight text-[#f0ede8]">{week.focus}</p>
                      <p className="mt-1 text-[10px] leading-relaxed text-[#f0ede8]/45">Checkpoint: {week.checkpoint}</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {week.tasks.map((task, taskIndex) => {
                      const key = `w${week.week}_t${taskIndex}`;
                      const checked = progress[key] || false;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => onToggle(key)}
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
                              {checked ? '✓' : taskIndex + 1}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className={`text-[12px] font-black leading-relaxed ${checked ? 'text-green-300' : 'text-[#f0ede8]'}`}>
                                {task.title}
                              </p>
                              <div className="mt-2 grid gap-1.5 text-[10px] leading-relaxed text-[#f0ede8]/55">
                                <p><span className="font-black text-[#e8b84b]">Skill:</span> {task.skill}</p>
                                <p><span className="font-black text-[#e8b84b]">Output:</span> {task.output}</p>
                                <p><span className="font-black text-[#e8b84b]">KPI:</span> {task.kpi}</p>
                                <p><span className="font-black text-[#e8b84b]">Tick khi:</span> {task.doneDefinition}</p>
                              </div>
                            </div>
                          </div>
                        </button>
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
    <div className="min-h-screen bg-[#0a0c10] p-4 font-sans text-[#f0ede8]">
      <div className="mx-auto max-w-sm pt-16">
        <div className="rounded-2xl border border-[#e8b84b]/20 bg-[#0f1219] p-5 shadow-[0_0_40px_rgba(232,184,75,0.08)]">
          <div className="mb-5 flex items-center gap-3">
            <div className="relative h-12 w-12 rounded-full border border-[#e8b84b]/25 bg-[#161b26]">
              <div className="absolute inset-2 rounded-full border-2 border-t-[#e8b84b] border-white/10 animate-spin" />
            </div>
            <div>
              <p className="text-sm font-black text-[#f0ede8]">Chuyên gia đang phân tích hồ sơ</p>
              <p className="text-[10px] text-[#f0ede8]/40">Đang dựng bản lộ trình chuyên gia theo vị trí, điểm yếu và mục tiêu {durationLabel}</p>
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
          <p className="mt-4 text-center text-[10px] text-[#f0ede8]/35">Âm thanh thinking đang bật nếu máy không mute</p>
        </div>
      </div>
    </div>
  );
}

export default function RoadmapPage() {
  const [step, setStep]           = useState<PageStep>('setup');
  const [job, setJob]             = useState('');
  const [currentSalary, setCurrentSalary] = useState('');
  const [duration, setDuration]   = useState<3 | 6 | 12>(6);
  const [phone, setPhone]         = useState('');
  const [name, setName]           = useState('');
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [website, setWebsite]     = useState('');
  const formStartedAtRef = useRef(Date.now());
  const [error, setError]         = useState('');
  const [creating, setCreating]   = useState(false);

  const cur        = parseInt(currentSalary.replace(/,/g, ''), 10) || 0;
  const targetCalc = job && cur > 0 ? calcTargetSalary(cur, job, duration) : null;
  const durationLabel = formatDurationLabel(duration);

  const [vspiId, setVspiId]       = useState('');
  const [profile, setProfile]     = useState<RoadmapProfile | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const [roadmap, setRoadmap]     = useState<RoadmapData | null>(null);
  const [progress, setProgress]   = useState<Record<string, boolean>>({});
  const [generating, setGenerating] = useState(false);
  const [currentPosition, setCurrentPosition] = useState('');
  const [mainWeakness, setMainWeakness] = useState('');
  const [twoYearGoal, setTwoYearGoal] = useState('');
  const [educationLevel, setEducationLevel] = useState('');
  const [educationDetail, setEducationDetail] = useState('');
  const [showCertificate, setShowCertificate] = useState(false);

  // Restore phone input cho trang restore
  const [restorePhone, setRestorePhone] = useState('');
  const [restoreAccessCode, setRestoreAccessCode] = useState('');
  const [restoreLoading, setRestoreLoading] = useState(false);
  const activeAccessCode = profile?.accessCode || getRoadmapAccessCode(vspiId);

  const applyPreset = (preset: typeof ROADMAP_PRESETS[number]) => {
    setJob(preset.job);
    setCurrentSalary(formatMoneyInput(preset.salary));
    setDuration(preset.duration);
    setError('');
  };

  const applyDraftProfile = (draft: Partial<RoadmapProfile>) => {
    const draftDuration = draft.duration === 3 || draft.duration === 6 || draft.duration === 12 ? draft.duration : duration;
    if (draft.job) {
      setJob(String(draft.job));
      setCurrentPosition(String(draft.job));
    }
    if (draft.salary) setCurrentSalary(formatMoneyInput(String(draft.salary)));
    if (draft.duration === 3 || draft.duration === 6 || draft.duration === 12) setDuration(draftDuration);
    if (draft.phone) setPhone(String(draft.phone));
    if (draft.accessCode) setRestoreAccessCode(String(draft.accessCode));
    if (draft.educationLevel) setEducationLevel(String(draft.educationLevel));
    if (draft.educationDetail) setEducationDetail(String(draft.educationDetail));
    setTwoYearGoal(draft.job ? `Lên mốc lương/level cao hơn cho ${draft.job} trong ${formatDurationLabel(draftDuration)} tới` : '');
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
    setVspiId('');
    setProfile(null);
    setPollCount(0);
    setGenerating(false);
    setShowCertificate(false);
    setError('');
  };

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // ── Thinking pulse while roadmap is being generated ────────────────────
  useEffect(() => {
    if (generating) {
      startThinkingPulse();
      return () => stopThinkingPulse();
    }
    stopThinkingPulse();
  }, [generating]);


  // ── Auto-restore khi load trang ──────────────────────────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const wantsNew = params.get('new') === '1';
    const wantsRestore = params.get('restore') === '1';
    const queryJob = params.get('job')?.trim();
    const querySalary = Number(params.get('salary') || 0);
    const queryDuration = Number(params.get('duration') || 6);

    if (wantsNew || queryJob || querySalary > 0) {
      clearRoadmapSession();
      setJob('');
      setCurrentSalary('');
      setCurrentPosition('');
      setMainWeakness('');
      setTwoYearGoal('');
      setEducationLevel('');
      setEducationDetail('');
      setPrivacyConsent(false);
      const draftFromQuery: Partial<RoadmapProfile> = {};
      if (queryJob) draftFromQuery.job = queryJob;
      if (Number.isFinite(querySalary) && querySalary > 0) draftFromQuery.salary = querySalary;
      if (queryDuration === 3 || queryDuration === 6 || queryDuration === 12) draftFromQuery.duration = queryDuration;

      try {
        const savedDraft = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}') as Partial<RoadmapProfile> & { savedAt?: number };
        const freshDraft = savedDraft.savedAt && Date.now() - savedDraft.savedAt < DRAFT_MAX_AGE_MS ? savedDraft : {};
        applyDraftProfile({ duration: 6, ...freshDraft, ...draftFromQuery });
      } catch {
        applyDraftProfile({ duration: 6, ...draftFromQuery });
      }

      setStep('setup');
      return;
    }

    const saved = wantsRestore ? localStorage.getItem(STORAGE_KEY) : null;
    if (!saved) {
      try {
        const savedDraft = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}') as Partial<RoadmapProfile> & { savedAt?: number };
        if (savedDraft.savedAt && Date.now() - savedDraft.savedAt < DRAFT_MAX_AGE_MS) {
          applyDraftProfile(savedDraft);
        }
      } catch {
        /* ignore */
      }
      return;
    }
    try {
      const p: RoadmapProfile = JSON.parse(saved);
      if (!p.vspiId || !p.phone) return;
      if (!p.accessCode) p.accessCode = getRoadmapAccessCode(p.vspiId);
      setProfile(p);
      setVspiId(p.vspiId);
      if (wantsRestore) {
        setGenerating(true);
        // Thử load bằng vspiId trước
        const savedAccessCode = p.accessCode || getRoadmapAccessCode(p.vspiId);
        fetch(`/api/roadmap/generate?id=${encodeURIComponent(p.vspiId)}&accessCode=${encodeURIComponent(savedAccessCode)}&t=${Date.now()}`)
          .then(r => r.json())
          .then(async data => {
            if (data.status === 'paid') {
              if (data.roadmap_json) {
                setRoadmap(data.roadmap_json);
                setProgress(data.task_progress || {});
                if (data.roadmap_json.intake) {
                  setCurrentPosition(data.roadmap_json.intake.currentPosition || p.currentPosition || p.job || '');
                  setMainWeakness(data.roadmap_json.intake.mainWeakness || p.mainWeakness || '');
                  setTwoYearGoal(data.roadmap_json.intake.twoYearGoal || p.twoYearGoal || '');
                  setEducationLevel(data.roadmap_json.intake.educationLevel || p.educationLevel || '');
                  setEducationDetail(data.roadmap_json.intake.educationDetail || p.educationDetail || '');
                }
                setStep('roadmap');
              } else {
                setStep('intake');
              }
            }
            // pending → ở setup, user thấy form đã điền sẵn
          })
          .catch(() => {})
          .finally(() => setGenerating(false));
      }
      // Pre-fill form
      setJob(p.job || '');
      setCurrentSalary(formatMoneyInput(String(p.salary || '')));
      if (p.duration) setDuration(p.duration as 3 | 6 | 12);
      setPhone(p.phone || '');
      setCurrentPosition(p.currentPosition || p.job || '');
      setMainWeakness(p.mainWeakness || '');
      setTwoYearGoal(p.twoYearGoal || '');
      setEducationLevel(p.educationLevel || '');
      setEducationDetail(p.educationDetail || '');
    } catch { /* ignore */ }
  }, []);

  // ── Tạo đơn hàng ─────────────────────────────────────────────────────────
  const handleSetup = async () => {
    if (!name.trim()) { setError('Nhập họ tên của bạn'); return; }
    if (!phone || !/^0[0-9]{8,10}$/.test(phone.replace(/\s/g, ''))) {
      setError('Nhập SĐT hợp lệ (VD: 0901234567)'); return;
    }
    if (!job.trim()) { setError('Nhập nghề nghiệp'); return; }
    if (!cur || cur < 1_000_000) { setError('Nhập lương hiện tại hợp lệ'); return; }
    if (!privacyConsent) { setError('Vui lòng đồng ý xử lý dữ liệu để tạo lộ trình và hỗ trợ sau mua'); return; }
    if (!targetCalc) return;

    setError(''); setCreating(true);
    try {
      const goalLabel = `Tăng ${((targetCalc.target - cur) / 1_000_000).toFixed(1)} triệu trong ${duration} tháng`;
      const res = await fetch('/api/roadmap/checkout', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...getAttributionPayload(),
          phone: phone.replace(/\s/g, ''),
          job_title: job.trim(),
          current_salary: cur,
          target_salary: targetCalc.target,
          duration_months: duration,
          goal_label: goalLabel,
          privacyConsent,
          website,
          formStartedAt: formStartedAtRef.current,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Lỗi tạo đơn'); return; }

      const newProfile: RoadmapProfile = {
        vspiId: data.vspiId,
        accessCode: data.accessCode || getRoadmapAccessCode(data.vspiId),
        phone: phone.replace(/\s/g, ''),
        job: job.trim(), salary: cur, duration,
      };
      setVspiId(data.vspiId);
      setProfile(newProfile);
      setCurrentPosition(job.trim());
      setMainWeakness('');
      setTwoYearGoal(targetCalc ? `${(targetCalc.target / 1_000_000).toFixed(1)} triệu/tháng trong ${durationLabel} tới` : '');
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newProfile));
      setStep('qr');
    } catch { setError('Lỗi kết nối'); }
    finally { setCreating(false); }
  };

  // ── Restore bằng SĐT ─────────────────────────────────────────────────────
  const handleRestoreByPhone = async () => {
    const clean = restorePhone.replace(/\D/g, '');
    const code = cleanRoadmapAccessCode(restoreAccessCode);
    if (!clean || clean.length < 9) { setError('Nhập SĐT hợp lệ'); return; }
    if (code.length < 4) { setError('Nhập mã truy cập 4 ký tự được cấp sau thanh toán'); return; }
    setError(''); setRestoreLoading(true);
    try {
      const res = await fetch(`/api/roadmap/generate?phone=${clean}&accessCode=${encodeURIComponent(code)}&t=${Date.now()}`);
      if (!res.ok) { setError('Không tìm thấy lộ trình hoặc mã truy cập chưa đúng'); return; }
      const data = await res.json();
      if (data.status !== 'paid') { setError('Lộ trình chưa được thanh toán'); return; }

      const newProfile: RoadmapProfile = {
        vspiId: data.vspi_id,
        accessCode: data.accessCode || getRoadmapAccessCode(data.vspi_id),
        phone: clean,
        job: data.job_title || '', salary: data.current_salary || 0, duration: data.duration_months || 6,
      };
      setVspiId(data.vspi_id);
      setProfile(newProfile);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newProfile));
      setCurrentPosition(data.roadmap_json?.intake?.currentPosition || data.job_title || '');
      setMainWeakness(data.roadmap_json?.intake?.mainWeakness || '');
      setTwoYearGoal(data.roadmap_json?.intake?.twoYearGoal || '');
      setEducationLevel(data.roadmap_json?.intake?.educationLevel || '');
      setEducationDetail(data.roadmap_json?.intake?.educationDetail || '');

      if (data.roadmap_json) {
        setRoadmap(data.roadmap_json);
        setProgress(data.task_progress || {});
        setStep('roadmap');
      } else {
        setStep('intake');
      }
    } catch { setError('Lỗi kết nối'); }
    finally { setRestoreLoading(false); }
  };

  // ── Polling sau khi CK ───────────────────────────────────────────────────
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
          if (data.roadmap_json) {
            setRoadmap(data.roadmap_json);
            setProgress(data.task_progress || {});
            setStep('roadmap');
          } else {
            setStep('intake');
          }
        }
      } catch { /* retry */ }
      if (count >= 15) {
        clearInterval(pollRef.current!); setStep('qr');
        setError('Chưa nhận được xác nhận. Liên hệ Zalo: 0915 662 876');
      }
    }, 8000);
  };

  const loadRoadmap = async () => {
    if (!currentPosition.trim()) { setError('Nhập vị trí hiện tại của bạn'); return; }
    if (!mainWeakness.trim()) { setError('Nhập điểm yếu chuyên môn lớn nhất'); return; }
    if (!twoYearGoal.trim()) { setError(`Nhập mục tiêu chức vụ/lương trong ${durationLabel} tới`); return; }
    if (!educationLevel.trim()) { setError('Chọn trình độ học vấn cao nhất'); return; }
    setGenerating(true);
    setError('');
    vibrate([15, 30, 15]);
    try {
      const res = await fetch('/api/roadmap/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vspiId,
          accessCode: activeAccessCode,
          currentPosition: currentPosition.trim(),
          mainWeakness: mainWeakness.trim(),
          twoYearGoal: twoYearGoal.trim(),
          educationLevel: educationLevel.trim(),
          educationDetail: educationDetail.trim(),
        }),
      });
      const data = await res.json();
      if (data.roadmap) {
        const baseProfile: RoadmapProfile | null = profile || (vspiId ? {
          vspiId,
          accessCode: activeAccessCode,
          phone: phone.replace(/\s/g, ''),
          job: job.trim() || currentPosition.trim(),
          salary: cur,
          duration,
        } : null);
        const updatedProfile: RoadmapProfile | null = baseProfile ? {
          ...baseProfile,
          currentPosition: currentPosition.trim(),
          mainWeakness: mainWeakness.trim(),
          twoYearGoal: twoYearGoal.trim(),
          educationLevel: educationLevel.trim(),
          educationDetail: educationDetail.trim(),
        } : null;
        if (updatedProfile) {
          setProfile(updatedProfile);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedProfile));
        }
        setRoadmap(data.roadmap);
        setProgress(data.progress || {});
        playSuccess();
        setStep('roadmap');
      } else {
        setError(data.error || 'Lỗi tải lộ trình');
      }
    } catch { setError('Lỗi tải lộ trình'); }
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

  // ════════════════════════════════════════════════════════════════════════
  // RENDER — Loading restore
  // ════════════════════════════════════════════════════════════════════════
  if (generating && step !== 'checking') return (
    <RoadmapGeneratingSkeleton duration={duration} />
  );

  // ── STEP: SETUP ──────────────────────────────────────────────────────────
  if (step === 'setup') return (
    <div className="min-h-screen w-full max-w-full overflow-x-clip bg-[#0a0c10] px-3 pb-4 pt-[max(1rem,env(safe-area-inset-top))] font-sans text-[#f0ede8] sm:px-4">
      <div className="mx-auto w-full max-w-[22.5rem] pt-8 space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 bg-[#e8b84b]/10 border border-[#e8b84b]/30 rounded-full px-4 py-1.5 mb-4">
            <span className="text-[#e8b84b] text-xs font-black">VSPI ROADMAP</span>
            <span className="bg-red-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">79K</span>
          </div>
          <h1 className="text-2xl font-black text-[#f0ede8] mb-2 leading-tight">
            Lộ trình tăng lương<br />
            <span className="text-[#e8b84b]">thiết kế riêng cho bạn</span>
          </h1>
          <p className="text-sm text-[#f0ede8]/50">Chuyên gia thiết kế riêng · Tick task từng tuần · Đồng hành đến khi lên lương</p>
        </div>

        <div className="bg-[#0f1219] border border-[#e8b84b]/20 rounded-2xl p-4 grid grid-cols-2 gap-2">
          {[
            'Portfolio/case study',
            'KPI trước/sau',
            'CV/LinkedIn bullet',
            'Hướng nhảy việc tăng lương',
            'Skill nghề cụ thể',
            'Keyword apply đúng role',
          ].map(item => (
            <div key={item} className="bg-[#161b26] border border-white/8 rounded-xl px-3 py-2">
              <p className="text-[10px] text-[#f0ede8]/70 font-bold">✓ {item}</p>
            </div>
          ))}
          <p className="col-span-2 text-[10px] text-[#f0ede8]/35 leading-relaxed mt-1">
            79k không bán lời hứa tăng lương. Nó bán một hệ thống biến công việc hằng tuần thành bằng chứng đàm phán có thể đưa cho sếp hoặc HR.
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
                  Dùng mẫu
                </span>
              </div>
            </button>
          ))}
        </div>

        <div className="w-full overflow-hidden bg-[#0f1219] border border-white/10 rounded-2xl p-4 space-y-4 sm:p-6">
          {/* Họ tên */}
          <div>
            <label className="text-[10px] font-mono font-bold text-[#f0ede8]/60 uppercase block mb-1.5">Họ và tên <span className="text-red-400">*</span></label>
            <input type="text" placeholder="VD: Nguyễn Văn A"
              className="w-full bg-[#161b26] border border-white/10 rounded-xl px-4 py-3 text-sm text-[#f0ede8] outline-none focus:border-[#e8b84b] placeholder:text-[#f0ede8]/20"
              value={name} onChange={e => setName(e.target.value)} />
          </div>

          {/* SĐT — bắt buộc, dùng để khôi phục */}
          <div>
            <label className="text-[10px] font-mono font-bold text-[#f0ede8]/60 uppercase block mb-1.5">
              SĐT / Zalo <span className="text-red-400">*</span>
              <span className="text-[#e8b84b] ml-1 normal-case font-normal">(dùng để xem lại lộ trình)</span>
            </label>
            <input type="tel" placeholder="0901234567"
              className="w-full bg-[#161b26] border border-white/10 rounded-xl px-4 py-3 text-sm text-[#f0ede8] outline-none focus:border-[#e8b84b] placeholder:text-[#f0ede8]/20"
              value={phone} onChange={e => setPhone(e.target.value)} />
            <p className="text-[9px] text-[#f0ede8]/30 mt-1 pl-1">Sau thanh toán bạn sẽ nhận thêm mã truy cập 4 ký tự để bảo mật lộ trình</p>
          </div>

          {/* Nghề nghiệp */}
          <div>
            <label className="text-[10px] font-mono font-bold text-[#f0ede8]/60 uppercase block mb-1.5">Nghề nghiệp <span className="text-red-400">*</span></label>
            <input type="text" placeholder="VD: Backend Developer, Kế toán..."
              className="w-full bg-[#161b26] border border-white/10 rounded-xl px-4 py-3 text-sm text-[#f0ede8] outline-none focus:border-[#e8b84b] placeholder:text-[#f0ede8]/20"
              value={job} onChange={e => setJob(e.target.value)} />
          </div>

          {/* Lương hiện tại */}
          <div>
            <label className="text-[10px] font-mono font-bold text-[#f0ede8]/60 uppercase block mb-1.5">Lương hiện tại (VNĐ/tháng) <span className="text-red-400">*</span></label>
            <input type="text" inputMode="numeric" placeholder="VD: 13,000,000"
              className="w-full bg-[#161b26] border border-white/10 rounded-xl px-4 py-3 text-sm text-[#f0ede8] outline-none focus:border-[#e8b84b] placeholder:text-[#f0ede8]/20"
              value={currentSalary} onChange={e => setCurrentSalary(formatMoneyInput(e.target.value))} />
            {cur > 0 && <p className="text-[10px] text-[#f0ede8]/35 mt-1 pl-1">≈ {(cur/1_000_000).toFixed(1)} triệu/tháng</p>}
          </div>

          {/* Thời gian */}
          <div>
            <label className="text-[10px] font-mono font-bold text-[#f0ede8]/60 uppercase block mb-2">Mục tiêu trong bao lâu?</label>
            <div className="grid min-w-0 grid-cols-3 gap-1.5 sm:gap-2">
              {([3, 6, 12] as const).map(d => (
                <button key={d} onClick={() => setDuration(d)}
                  className={`min-w-0 rounded-xl border-2 px-1 py-3 text-[12px] font-bold leading-none transition-all sm:text-sm ${duration === d ? 'border-[#e8b84b] bg-[#e8b84b]/10 text-[#e8b84b]' : 'border-white/10 bg-[#161b26] text-[#f0ede8]/50'}`}>
                  {d === 12 ? '1 năm' : `${d} tháng`}
                </button>
              ))}
            </div>
          </div>

          {/* Preview mục tiêu */}
          {targetCalc && cur > 0 && (
            <div className="bg-[#161b26] border border-[#e8b84b]/20 rounded-xl p-4 space-y-2">
              <p className="text-[10px] font-mono text-[#e8b84b] uppercase tracking-wider">🎯 Mục tiêu hệ thống đề xuất</p>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-lg font-black leading-tight text-[#f0ede8]">{(targetCalc.target/1_000_000).toFixed(1)} triệu/tháng</p>
                  <p className="text-[11px] text-green-400 font-bold">{targetCalc.label}</p>
                </div>
                <p className="shrink-0 text-right text-[9px] text-[#f0ede8]/35">trong {duration === 12 ? '1 năm' : `${duration} tháng`}</p>
              </div>
              <p className="text-[10px] text-[#f0ede8]/45 leading-relaxed">{targetCalc.rationale}</p>
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
              Tôi đồng ý VSPI lưu và xử lý họ tên, SĐT, nghề nghiệp, lương hiện tại để tạo lộ trình, xác nhận thanh toán và hỗ trợ sau mua.
            </span>
          </label>

          {error && <p className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2">{error}</p>}

          <button onClick={() => { playTap(); handleSetup(); }} disabled={creating}
            className="w-full bg-[#e8b84b] text-[#0a0c10] font-black py-4 rounded-xl text-base disabled:opacity-50 hover:-translate-y-0.5 transition-all">
            {creating ? 'Đang tạo...' : 'Tạo lộ trình - 79.000đ'}
          </button>

          <p className="text-[9px] text-[#f0ede8]/25 text-center">
            Chuyên gia thiết kế lộ trình 1 lần · Xem lại bằng SĐT + mã truy cập · Tick task theo tuần
          </p>
        </div>

        {/* Đã mua rồi → xem lại */}
        <button onClick={() => { setError(''); setStep('restore'); }}
          className="w-full text-center text-[11px] text-[#e8b84b]/60 hover:text-[#e8b84b] py-2">
          Đã mua rồi? Nhập SĐT + mã truy cập để xem lại →
        </button>

        <Link href="/" className="block text-center text-[10px] text-[#f0ede8]/30 hover:text-[#f0ede8]/60">
          ← Quay lại trang chủ
        </Link>
      </div>
    </div>
  );

  // ── STEP: RESTORE ─────────────────────────────────────────────────────────
  if (step === 'restore') return (
    <div className="min-h-screen bg-[#0a0c10] p-4 font-sans text-[#f0ede8]">
      <div className="max-w-sm mx-auto pt-16 space-y-6">
        <div className="text-center">
          <p className="text-3xl mb-3">🔑</p>
          <h2 className="text-xl font-black text-[#f0ede8] mb-1">Xem lại lộ trình của bạn</h2>
          <p className="text-sm text-[#f0ede8]/50">Nhập SĐT và mã truy cập để khôi phục lộ trình</p>
        </div>

        <div className="bg-[#0f1219] border border-white/10 rounded-2xl p-6 space-y-4">
          <div>
            <label className="text-[10px] font-mono font-bold text-[#f0ede8]/60 uppercase block mb-1.5">SĐT / Zalo đã đăng ký</label>
            <input type="tel" placeholder="0901234567"
              className="w-full bg-[#161b26] border border-white/10 rounded-xl px-4 py-3 text-sm text-[#f0ede8] outline-none focus:border-[#e8b84b] placeholder:text-[#f0ede8]/20"
              value={restorePhone} onChange={e => setRestorePhone(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleRestoreByPhone()} />
          </div>

          <div>
            <label className="text-[10px] font-mono font-bold text-[#f0ede8]/60 uppercase block mb-1.5">Mã truy cập</label>
            <input
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              placeholder="VD: A7K9"
              className="w-full bg-[#161b26] border border-white/10 rounded-xl px-4 py-3 text-sm font-black tracking-[0.18em] text-[#f0ede8] outline-none focus:border-[#e8b84b] placeholder:tracking-normal placeholder:text-[#f0ede8]/20"
              value={restoreAccessCode}
              onChange={e => setRestoreAccessCode(cleanRoadmapAccessCode(e.target.value).slice(0, 4))}
              onKeyDown={e => e.key === 'Enter' && handleRestoreByPhone()}
            />
            <p className="mt-1 text-[9px] leading-relaxed text-[#f0ede8]/35">
              Mã 4 ký tự được hiển thị sau thanh toán. Không có mã thì không thể xem lộ trình của người khác.
            </p>
          </div>

          {error && <p className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2">{error}</p>}

          <button onClick={() => { playTap(); handleRestoreByPhone(); }} disabled={restoreLoading}
            className="w-full bg-[#e8b84b] text-[#0a0c10] font-black py-4 rounded-xl text-base disabled:opacity-50">
            {restoreLoading ? 'Đang tìm...' : 'Tìm lộ trình của tôi'}
          </button>
        </div>

        <button onClick={() => { setError(''); setStep('setup'); }}
          className="w-full text-center text-[10px] font-mono text-[#f0ede8]/30 hover:text-[#f0ede8]/60 py-2">
          ← Quay lại
        </button>
      </div>
    </div>
  );

  // ── STEP: QR ──────────────────────────────────────────────────────────────
  if (step === 'qr') return (
    <div className="min-h-screen bg-[#0a0c10] p-4 font-sans text-[#f0ede8]">
      <div className="max-w-sm mx-auto pt-8 space-y-5">
        {/* Profile đã cam kết */}
        <div className="bg-[#0f1219] border border-[#e8b84b]/20 rounded-2xl p-4">
          <p className="text-[10px] font-mono text-[#e8b84b] uppercase tracking-wider mb-2">📋 Hồ sơ của bạn</p>
          <div className="space-y-1">
            <p className="text-sm font-bold text-[#f0ede8]">{name} · {phone}</p>
            <p className="text-[11px] text-[#f0ede8]/50">{job} · {(cur/1_000_000).toFixed(1)}M/tháng · {duration} tháng</p>
            {targetCalc && <p className="text-[11px] text-green-400 font-bold">Mục tiêu: {(targetCalc.target/1_000_000).toFixed(1)}M/tháng {targetCalc.label}</p>}
          </div>
        </div>

        <div className="text-center">
          <h2 className="text-xl font-black text-[#f0ede8] mb-1">Quét QR để mở khóa lộ trình</h2>
          <p className="text-sm text-[#f0ede8]/50">Thanh toán xong → Chuyên gia tạo lộ trình riêng cho bạn ngay</p>
        </div>

        <div className="bg-[#0f1219] border border-[#e8b84b]/30 rounded-2xl overflow-hidden">
          <div className="bg-[#161b26] px-5 py-3 border-b border-white/10 flex items-center justify-between">
            <div>
              <p className="text-sm font-black text-[#f0ede8]">VSPI Roadmap</p>
              <p className="text-[10px] text-[#f0ede8]/45">{job} · {duration} tháng</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-black text-[#e8b84b]">79.000đ</p>
              <p className="text-[9px] text-[#f0ede8]/35 line-through">149.000đ</p>
            </div>
          </div>

          <div className="p-5 flex flex-col items-center">
            <div className="bg-white rounded-2xl p-3 shadow-[0_0_32px_rgba(232,184,75,0.2)] mb-3">
              <img
                src={`https://img.vietqr.io/image/msb-96886693012762-compact2.png?amount=79000&addInfo=${cleanVspi}&accountName=NGUYEN%20TRONG%20VAN`}
                alt="QR 79k" className="w-56 h-56 rounded-xl block"
              />
            </div>
            <div className="bg-[#161b26] border border-white/10 rounded-xl px-4 py-2 text-center w-full mb-1">
              <p className="text-[11px] font-mono text-[#f0ede8]/50">MSB · <strong className="text-[#f0ede8]">96886693012762</strong> · NGUYEN TRONG VAN</p>
            </div>
            <div className="bg-[#0a0c10] border border-[#e8b84b]/25 rounded-xl px-4 py-2 text-center w-full">
              <p className="text-[10px] font-mono text-[#f0ede8]/50">
                Nội dung CK: <span className="font-black text-[#e8b84b] tracking-wider">{cleanVspi}</span>
              </p>
            </div>
            <div className="mt-2 grid w-full grid-cols-[minmax(0,1fr)_6rem] gap-2">
              <div className="rounded-xl border border-white/10 bg-[#161b26] px-3 py-2">
                <p className="text-[9px] font-mono uppercase text-[#f0ede8]/35">Bảo mật xem lại</p>
                <p className="mt-0.5 text-[10px] leading-relaxed text-[#f0ede8]/55">Lưu SĐT + mã này. Không có mã thì người khác không xem được lộ trình.</p>
              </div>
              <div className="rounded-xl border border-[#e8b84b]/30 bg-[#e8b84b]/10 px-3 py-2 text-center">
                <p className="text-[9px] font-mono uppercase text-[#f0ede8]/35">Mã truy cập</p>
                <p className="mt-1 text-lg font-black tracking-[0.16em] text-[#e8b84b]">{activeAccessCode}</p>
              </div>
            </div>
          </div>

          <div className="px-5 pb-5 space-y-3">
            {error && <p className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2">{error}</p>}
            <button onClick={() => { playTap(); startPolling(); }}
              className="w-full bg-[#e8b84b] text-[#0a0c10] font-black py-4 rounded-xl text-base hover:-translate-y-0.5 transition-all">
              ✅ Đã Chuyển Khoản — Tạo Lộ Trình Ngay
            </button>
            <button onClick={() => setStep('setup')}
              className="w-full text-center text-[10px] font-mono text-[#f0ede8]/30 hover:text-[#f0ede8]/60 py-1">
              ← Quay lại
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // ── STEP: INTAKE ──────────────────────────────────────────────────────────
  if (step === 'intake') return (
    <div className="min-h-screen bg-[#0a0c10] p-4 font-sans text-[#f0ede8]">
      <div className="max-w-sm mx-auto pt-8 space-y-5">
        <div className="rounded-2xl border border-[#e8b84b]/25 bg-[#0f1219] p-5">
          <div className="mb-4 flex items-center justify-between gap-3 border-b border-white/8 pb-4">
            <div>
              <p className="text-[10px] font-mono font-black uppercase tracking-wider text-[#e8b84b]">Đã xác nhận 79K</p>
              <h2 className="mt-1 text-xl font-black leading-tight text-[#f0ede8]">Lộ trình thăng tiến Độc Bản</h2>
            </div>
            <span className="rounded-full border border-green-400/30 bg-green-400/10 px-2 py-1 text-[9px] font-black text-green-300">PAID</span>
          </div>

          <div className="space-y-1 rounded-xl border border-white/8 bg-[#161b26] p-3">
            <p className="text-xs font-black text-[#f0ede8]">{profile?.job || job || 'Hồ sơ của bạn'}</p>
            <p className="text-[10px] text-[#f0ede8]/45">
              {(profile?.salary || cur) ? `${((profile?.salary || cur) / 1_000_000).toFixed(1)}M/tháng` : 'Lương đã ghi nhận'} · {profile?.duration || duration} tháng · {profile?.phone || phone}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#0f1219] p-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-[10px] font-mono font-bold uppercase text-[#f0ede8]/60">Vị trí hiện tại</label>
            <input
              type="text"
              value={currentPosition}
              onChange={e => setCurrentPosition(e.target.value)}
              placeholder="VD: Backend Developer level Mid, Kế toán tổng hợp..."
              className="w-full rounded-xl border border-white/10 bg-[#161b26] px-4 py-3 text-sm text-[#f0ede8] outline-none placeholder:text-[#f0ede8]/20 focus:border-[#e8b84b]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-mono font-bold uppercase text-[#f0ede8]/60">Điểm yếu chuyên môn lớn nhất</label>
            <textarea
              value={mainWeakness}
              onChange={e => setMainWeakness(e.target.value)}
              placeholder="VD: Chưa có system design, tiếng Anh yếu, thiếu số liệu KPI..."
              rows={3}
              className="w-full resize-none rounded-xl border border-white/10 bg-[#161b26] px-4 py-3 text-sm text-[#f0ede8] outline-none placeholder:text-[#f0ede8]/20 focus:border-[#e8b84b]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-mono font-bold uppercase text-[#f0ede8]/60">Mục tiêu chức vụ/lương trong {durationLabel} tới</label>
            <textarea
              value={twoYearGoal}
              onChange={e => setTwoYearGoal(e.target.value)}
              placeholder="VD: Senior Backend 45M, Lead team 5 người, lên Finance Manager..."
              rows={3}
              className="w-full resize-none rounded-xl border border-white/10 bg-[#161b26] px-4 py-3 text-sm text-[#f0ede8] outline-none placeholder:text-[#f0ede8]/20 focus:border-[#e8b84b]"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-mono font-bold uppercase text-[#f0ede8]/60">
              Trình độ học vấn cao nhất
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
              Chuyên gia sẽ xem bằng cấp đang được thị trường trả tiền, bị bỏ phí, hay cần bù bằng KPI thực chiến.
            </p>
          </div>

          <div>
            <label className="mb-1.5 block text-[10px] font-mono font-bold uppercase text-[#f0ede8]/60">Ngành học / chứng chỉ liên quan</label>
            <input
              type="text"
              value={educationDetail}
              onChange={e => setEducationDetail(e.target.value)}
              placeholder="VD: Ngôn ngữ Anh, Quản trị kinh doanh, TESOL, CELTA, IELTS, MBA..."
              className="w-full rounded-xl border border-white/10 bg-[#161b26] px-4 py-3 text-sm text-[#f0ede8] outline-none placeholder:text-[#f0ede8]/20 focus:border-[#e8b84b]"
            />
          </div>

          {error && <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2 text-[11px] text-red-400">{error}</p>}

          <button
            onClick={() => { playTap(); loadRoadmap(); }}
            disabled={generating}
            className="w-full rounded-xl bg-[#e8b84b] py-4 text-base font-black text-[#0a0c10] transition-all hover:-translate-y-0.5 disabled:opacity-50"
          >
            Tạo lộ trình Độc Bản từ chuyên gia
          </button>

          <p className="text-center text-[9px] leading-relaxed text-[#f0ede8]/30">
            Lộ trình chỉ tạo sau khi đơn đã paid và sẽ được lưu theo SĐT để xem lại.
          </p>
        </div>
      </div>
    </div>
  );

  // ── STEP: CHECKING ────────────────────────────────────────────────────────
  if (step === 'checking' || generating) return (
    <div className="min-h-screen bg-[#0a0c10] flex items-center justify-center p-4 font-sans text-[#f0ede8]">
      <div className="text-center space-y-4">
        <div className="relative w-16 h-16 mx-auto">
          <div className="absolute inset-0 border-4 border-white/10 rounded-full" />
          <div className="absolute inset-0 border-4 border-t-[#e8b84b] rounded-full animate-spin" />
        </div>
        <p className="text-lg font-bold text-[#f0ede8]">
          {generating ? '✨ Chuyên gia đang tạo lộ trình cho bạn...' : 'Đang xác nhận thanh toán...'}
        </p>
        <p className="text-sm text-[#f0ede8]/45">
          {generating ? 'Mất khoảng 10-15 giây' : `Thử lần ${pollCount}/15 · Tự động unlock sau khi xác nhận`}
        </p>
        {!generating && (
          <button onClick={() => { if (pollRef.current) clearInterval(pollRef.current); setStep('qr'); }}
            className="text-[10px] font-mono text-[#f0ede8]/30 hover:text-[#f0ede8]/60">
            ← Quay lại
          </button>
        )}
      </div>
    </div>
  );

  // ── STEP: ROADMAP ─────────────────────────────────────────────────────────
  if (!roadmap) return null;

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-clip bg-[#0a0c10] px-3 pb-10 pt-[max(1rem,env(safe-area-inset-top))] font-sans text-[#f0ede8] sm:px-4">
      <div className="mx-auto w-full max-w-[22.5rem] pt-6 space-y-5">

        {/* Header + profile */}
        <div className="bg-[#0f1219] border border-[#e8b84b]/25 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3 pb-3 border-b border-white/8">
            <div className="w-10 h-10 bg-[#e8b84b] rounded-full flex items-center justify-center text-[#0a0c10] font-black text-base shrink-0">
              {(profile?.job || 'U')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-[#f0ede8] truncate">{profile?.job || 'Lộ trình của bạn'}</p>
              <p className="text-[10px] text-[#f0ede8]/40">{profile?.phone} · {profile?.duration} tháng</p>
            </div>
            <span className="text-[9px] bg-[#e8b84b]/10 border border-[#e8b84b]/30 text-[#e8b84b] font-mono font-black px-2 py-0.5 rounded-full shrink-0">✓ PAID</span>
          </div>

          <h1 className="text-base font-black text-[#f0ede8] mb-2 leading-tight">{roadmap.goal}</h1>
          <p className="text-[11px] text-[#f0ede8]/60 leading-relaxed mb-4">{roadmap.summary}</p>

          {isExpertRoadmap ? (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-[#e8b84b]/20 bg-[#161b26] px-3 py-2">
                <p className="text-[9px] font-mono uppercase text-[#f0ede8]/35">Nguồn phân tích</p>
                <p className="text-xs font-black text-[#e8b84b]">Hệ chuyên gia</p>
              </div>
              <div className="rounded-xl border border-green-400/20 bg-green-400/10 px-3 py-2">
                <p className="text-[9px] font-mono uppercase text-[#f0ede8]/35">Trạng thái</p>
                <p className="text-xs font-black text-green-300">Độc Bản</p>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex justify-between text-[10px]">
                <span className="text-[#f0ede8]/50">Tiến độ tổng</span>
                <span className="font-black text-[#e8b84b]">{stats.done}/{stats.total} tasks · {stats.pct}%</span>
              </div>
              <div className="h-3 bg-[#161b26] rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-[#e8b84b] to-green-400 transition-all duration-500"
                  style={{ width: `${stats.pct}%` }} />
              </div>
              <p className="text-[9px] text-[#f0ede8]/30 text-center">
                {stats.pct === 0 ? '💪 Bắt đầu tick task đầu tiên!' :
                 stats.pct < 50 ? '🔥 Đang trên đường — tiếp tục!' :
                 stats.pct < 80 ? '⚡ Hơn nửa rồi — gần đến lúc deal lương!' :
                 '🏆 Sắp xong — chuẩn bị đàm phán!'}
              </p>
            </div>
          )}
        </div>

        {isExpertRoadmap ? (
          <>
            <RoadmapLevelCard plan={roadmap.actionPlan} done={stats.done} total={stats.total} pct={stats.pct} />

            <RoadmapCompletionReward
              profile={profile}
              plan={roadmap.actionPlan}
              stats={stats}
              showCertificate={showCertificate}
              onShowCertificate={() => {
                playSuccess();
                setShowCertificate(value => !value);
              }}
            />

            {(roadmap.intake?.educationLevel || roadmap.intake?.educationDetail) && (
              <div className="rounded-2xl border border-[#e8b84b]/25 bg-[#0f1219] p-4">
                <p className="mb-1 text-[10px] font-mono font-black uppercase tracking-wider text-[#e8b84b]">
                  Độ khớp học vấn với lương
                </p>
                <h2 className="text-base font-black leading-tight text-[#f0ede8]">
                  Bằng cấp có đang được thị trường trả tiền chưa?
                </h2>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-white/8 bg-[#161b26] px-3 py-2">
                    <p className="text-[9px] uppercase text-[#f0ede8]/35">Học vấn</p>
                    <p className="text-xs font-black text-[#f0ede8]">{roadmap.intake.educationLevel || 'Chưa cung cấp'}</p>
                  </div>
                  <div className="rounded-xl border border-white/8 bg-[#161b26] px-3 py-2">
                    <p className="text-[9px] uppercase text-[#f0ede8]/35">Liên quan</p>
                    <p className="text-xs font-black text-[#f0ede8]">{roadmap.intake.educationDetail || 'Cần chứng minh bằng KPI'}</p>
                  </div>
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-[#f0ede8]/55">
                  Phần phân tích bên dưới sẽ chỉ ra bằng cấp đang là lợi thế, điểm bị định giá thấp, hay phần cần bù bằng bằng chứng vận hành.
                </p>
              </div>
            )}

            {roadmap.actionPlan && (
              <RoadmapActionPlanView
                plan={roadmap.actionPlan}
                progress={progress}
                onToggle={(key) => { playTap(); toggleTaskKey(key); }}
              />
            )}

            {roadmap.markdown && (
              <details className="rounded-2xl border border-white/8 bg-[#0f1219] p-4 sm:p-5">
                <summary className="cursor-pointer text-sm font-black text-[#e8b84b]">
                  Phân tích chuyên gia chi tiết
                </summary>
                <div className="mt-4">
                  <MarkdownRoadmap markdown={roadmap.markdown} />
                </div>
              </details>
            )}
            <div className="rounded-xl border border-green-500/20 bg-green-500/10 p-3 text-center">
              <p className="text-[11px] leading-relaxed text-green-300">{roadmap.salary_projection}</p>
            </div>
          </>
        ) : (
          <>
            {/* Salary projection */}
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-center">
              <p className="text-[11px] text-green-300 leading-relaxed">{roadmap.salary_projection}</p>
            </div>

            {/* Weekly tasks */}
            <div className="space-y-4">
              {roadmap.weeks.map((week, wi) => {
                const weekDone = week.tasks.filter((_, ti) => progress[`w${wi}_t${ti}`]).length;
                const isComplete = weekDone === week.tasks.length;
                return (
                  <div key={wi} className={`bg-[#0f1219] border rounded-2xl overflow-hidden ${isComplete ? 'border-green-500/30' : 'border-white/8'}`}>
                    <div className={`px-4 py-3 flex items-center gap-3 ${isComplete ? 'bg-green-500/5' : ''}`}>
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-black shrink-0
                        ${isComplete ? 'bg-green-500/30 text-green-400' : 'bg-[#161b26] border border-white/10 text-[#f0ede8]/40'}`}>
                        {isComplete ? '✓' : `W${week.week}`}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-bold ${isComplete ? 'text-green-400' : 'text-[#f0ede8]'}`}>{week.focus}</p>
                        <p className="text-[9px] text-[#f0ede8]/35 mt-0.5">🎯 {week.milestone}</p>
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
                              {checked && <span className="text-white text-[10px] font-black">✓</span>}
                            </div>
                            <p className={`text-[12px] leading-relaxed ${checked ? 'text-green-400/70 line-through' : 'text-[#f0ede8]/80'}`}>
                              {task}
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
              <p className="text-[10px] font-mono text-[#e8b84b] uppercase tracking-wider mb-1.5">⚡ Thời điểm deal lương</p>
              <p className="text-sm text-[#f0ede8]/80 leading-relaxed">{roadmap.negotiation_timing}</p>
              <p className="text-[10px] text-[#f0ede8]/40 mt-2">
                Tip: Đừng chờ hoàn hảo 100%. Khi tick xong 70% tasks — bạn đã có đủ bằng chứng để đàm phán.
              </p>
            </div>
          </>
        )}

        <div className="rounded-xl border border-[#e8b84b]/20 bg-[#e8b84b]/8 p-3 text-center">
          <p className="text-[11px] leading-relaxed text-[#f0ede8]/65">
            Một lần mua mở khóa một lộ trình gắn với SĐT này. Cứ tick task ở đây để giữ tiến độ; khi đạt 80% hãy quét lại mức lương để chuẩn bị deal.
          </p>
        </div>

        <Link href="/"
          className="block w-full bg-[#e8b84b] text-[#0a0c10] font-black py-4 rounded-xl text-base text-center hover:-translate-y-0.5 transition-all">
          ⚡ Quét lại — Xem lương đã tăng chưa
        </Link>

        {/* Khóa xem lại */}
        <div className="bg-[#0f1219] border border-white/8 rounded-xl p-4 text-center space-y-1">
          <p className="text-[10px] font-mono text-[#f0ede8]/30 uppercase tracking-wider">Khóa xem lại lộ trình</p>
          <p className="text-sm font-black text-[#e8b84b]">{profile?.phone} · {activeAccessCode}</p>
          <p className="text-[9px] text-[#f0ede8]/25">
            Dùng SĐT và mã truy cập này để xem lại trên thiết bị khác. Không chia sẻ mã nếu không muốn người khác mở lộ trình.
          </p>
        </div>

      </div>
    </div>
  );
}
