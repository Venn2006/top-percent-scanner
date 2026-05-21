"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getCareerCompassContext } from '@/lib/careerCompassEngine';
import { CAREER_COMPASS, type CareerLadderStep } from '@/lib/careerCompassData';
import { detectJobGroup } from '@/lib/careerCompassEngine';

/**
 * /my-roadmap — Lộ trình sự nghiệp cá nhân hóa
 * User tick từng task nhỏ khi hoàn thành → tracking progress → motivate tiếp tục
 * Data lưu localStorage (không cần server — instant, offline-ready)
 */

interface TaskState {
  [stepBand: string]: { [taskIdx: number]: boolean };
}

export default function MyRoadmapPage() {
  const [job, setJob] = useState('');
  const [salary, setSalary] = useState('');
  const [started, setStarted] = useState(false);
  const [tasks, setTasks] = useState<TaskState>({});
  const [ladder, setLadder] = useState<CareerLadderStep[]>([]);
  const [currentBand, setCurrentBand] = useState('');
  const [compassCtx, setCompassCtx] = useState<ReturnType<typeof getCareerCompassContext> | null>(null);

  // Load saved state từ localStorage
  useEffect(() => {
    const saved = localStorage.getItem('vspi-roadmap');
    if (saved) {
      try {
        const data = JSON.parse(saved);
        if (data.job && data.salary) {
          setJob(data.job);
          setSalary(data.salary);
          setTasks(data.tasks || {});
          setStarted(true);
        }
      } catch { /* ignore */ }
    }
  }, []);

  // Khi started → tính ladder
  useEffect(() => {
    if (!started || !job || !salary) return;
    const sal = parseInt(String(salary).replace(/,/g, ''), 10) || 0;
    const ctx = getCareerCompassContext(job, sal, 50);
    setCompassCtx(ctx);
    setCurrentBand(ctx.band);
    setLadder(ctx.careerLadder);
  }, [started, job, salary]);

  // Save state
  useEffect(() => {
    if (started && job && salary) {
      localStorage.setItem('vspi-roadmap', JSON.stringify({ job, salary, tasks }));
    }
  }, [tasks, started, job, salary]);

  const toggleTask = (band: string, idx: number) => {
    setTasks(prev => ({
      ...prev,
      [band]: { ...(prev[band] || {}), [idx]: !(prev[band]?.[idx]) },
    }));
  };

  const getStepProgress = (band: string, totalTasks: number) => {
    const stepTasks = tasks[band] || {};
    const done = Object.values(stepTasks).filter(Boolean).length;
    return { done, total: totalTasks, pct: Math.round((done / totalTasks) * 100) };
  };

  const getTotalProgress = () => {
    if (!ladder.length) return 0;
    let done = 0, total = 0;
    ladder.forEach(step => {
      total += step.unlock.length;
      const stepTasks = tasks[step.band] || {};
      done += Object.values(stepTasks).filter(Boolean).length;
    });
    return total > 0 ? Math.round((done / total) * 100) : 0;
  };

  // ── SETUP: chưa nhập nghề/lương ──────────────────────────────────────────
  if (!started) return (
    <div className="min-h-screen bg-[#0a0c10] flex items-center justify-center p-4 font-sans text-[#f0ede8]">
      <div className="max-w-sm w-full space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-black text-[#e8b84b] mb-1">🗺️ Lộ Trình Sự Nghiệp</h1>
          <p className="text-sm text-[#f0ede8]/50">Chia nhỏ từng bước — tick dần đến mức lương mơ ước</p>
        </div>

        <div className="bg-[#0f1219] border border-white/10 rounded-2xl p-6 space-y-4">
          <div>
            <label className="text-[10px] font-mono font-bold text-[#f0ede8]/60 uppercase block mb-1.5">Nghề nghiệp hiện tại</label>
            <input type="text" placeholder="VD: Backend Developer, Marketing..."
              className="w-full bg-[#161b26] border border-white/10 rounded-xl px-4 py-3 text-sm text-[#f0ede8] outline-none focus:border-[#e8b84b] placeholder:text-[#f0ede8]/20"
              value={job} onChange={e => setJob(e.target.value)} />
          </div>
          <div>
            <label className="text-[10px] font-mono font-bold text-[#f0ede8]/60 uppercase block mb-1.5">Thu nhập hiện tại (VNĐ/tháng)</label>
            <input type="number" placeholder="VD: 15000000"
              className="w-full bg-[#161b26] border border-white/10 rounded-xl px-4 py-3 text-sm text-[#f0ede8] outline-none focus:border-[#e8b84b] placeholder:text-[#f0ede8]/20"
              value={salary} onChange={e => setSalary(e.target.value)} />
          </div>
          <button
            onClick={() => { if (job && salary) setStarted(true); }}
            disabled={!job || !salary}
            className="w-full bg-[#e8b84b] text-[#0a0c10] font-black py-3.5 rounded-xl text-sm disabled:opacity-40"
          >
            Tạo lộ trình cá nhân →
          </button>
        </div>
      </div>
    </div>
  );

  // ── ROADMAP DASHBOARD ─────────────────────────────────────────────────────
  const totalPct = getTotalProgress();
  const bandOrder = ['entry', 'mid', 'senior', 'lead', 'executive'];

  return (
    <div className="min-h-screen bg-[#0a0c10] p-4 pb-24 font-sans text-[#f0ede8]">
      <div className="max-w-sm mx-auto space-y-5 pt-6">

        {/* Header + overall progress */}
        <div className="text-center">
          <h1 className="text-xl font-black text-[#e8b84b] mb-1">🗺️ Lộ Trình Của Bạn</h1>
          <p className="text-[11px] text-[#f0ede8]/45">{job} · {compassCtx?.salaryFmt}/tháng · Band: {compassCtx?.bandLabel?.split('(')[0]}</p>
        </div>

        {/* Overall progress bar */}
        <div className="bg-[#0f1219] border border-[#e8b84b]/20 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-[#f0ede8]/60">Tổng tiến độ</p>
            <p className="text-sm font-black text-[#e8b84b]">{totalPct}%</p>
          </div>
          <div className="h-3 bg-[#161b26] rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-[#e8b84b] to-green-400 transition-all duration-500"
              style={{ width: `${totalPct}%` }} />
          </div>
          <p className="text-[9px] text-[#f0ede8]/30 mt-2 text-center">
            {totalPct === 0 ? '💪 Bắt đầu tick task đầu tiên!' :
             totalPct < 30 ? '🔥 Đang trên đường — tiếp tục!' :
             totalPct < 70 ? '⚡ Nửa đường rồi — đừng bỏ cuộc!' :
             totalPct < 100 ? '🏆 Sắp xong — gần đến đích!' : '🎉 Hoàn thành toàn bộ lộ trình!'}
          </p>
        </div>

        {/* Motivational quote */}
        <div className="bg-[#161b26] border border-[#e8b84b]/10 rounded-xl p-3 text-center">
          <p className="text-[11px] text-[#f0ede8]/60 italic">
            "Mỗi task bạn tick là 1 bước gần hơn đến mức lương {compassCtx?.nextBandMinFmt}/tháng. Can đảm lên — bạn xứng đáng được trả đúng giá trị."
          </p>
        </div>

        {/* Career Ladder — step by step */}
        <div className="space-y-4">
          {ladder.map((step, stepIdx) => {
            const isCurrent = step.band === currentBand;
            const isPast = bandOrder.indexOf(step.band) < bandOrder.indexOf(currentBand);
            const progress = getStepProgress(step.band, step.unlock.length);

            return (
              <div key={stepIdx} className={`rounded-2xl border overflow-hidden transition-all
                ${isCurrent ? 'border-[#e8b84b]/40 bg-[#0f1219]' : isPast ? 'border-green-500/20 bg-[#0a1a0a]' : 'border-white/5 bg-[#0f1219] opacity-60'}`}>

                {/* Step header */}
                <div className={`px-4 py-3 flex items-center gap-3 ${isCurrent ? 'bg-[#e8b84b]/5' : isPast ? 'bg-green-500/5' : ''}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0
                    ${isPast ? 'bg-green-500/30 text-green-400' : isCurrent ? 'bg-[#e8b84b] text-[#0a0c10]' : 'bg-[#161b26] text-[#f0ede8]/25 border border-white/10'}`}>
                    {isPast ? '✓' : isCurrent ? '→' : stepIdx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-bold truncate ${isCurrent ? 'text-[#e8b84b]' : isPast ? 'text-green-400' : 'text-[#f0ede8]/40'}`}>
                      {step.title}
                    </p>
                    <p className="text-[9px] text-[#f0ede8]/35">{step.salary} · {step.duration}</p>
                  </div>
                  {/* Mini progress */}
                  <div className="text-right shrink-0">
                    <p className={`text-xs font-black ${progress.pct === 100 ? 'text-green-400' : isCurrent ? 'text-[#e8b84b]' : 'text-[#f0ede8]/25'}`}>
                      {progress.done}/{progress.total}
                    </p>
                  </div>
                </div>

                {/* Tasks — expandable for current + past */}
                {(isCurrent || isPast) && (
                  <div className="px-4 pb-4 pt-2 space-y-2">
                    {step.unlock.map((task, taskIdx) => {
                      const checked = tasks[step.band]?.[taskIdx] || false;
                      return (
                        <button
                          key={taskIdx}
                          onClick={() => toggleTask(step.band, taskIdx)}
                          className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all
                            ${checked ? 'bg-green-500/10 border-green-500/20' : 'bg-[#161b26] border-white/5 hover:border-[#e8b84b]/30'}`}
                        >
                          {/* Checkbox */}
                          <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all
                            ${checked ? 'bg-green-500 border-green-500' : 'border-white/20'}`}>
                            {checked && <span className="text-white text-[10px] font-black">✓</span>}
                          </div>
                          {/* Task text */}
                          <p className={`text-[12px] leading-relaxed ${checked ? 'text-green-400/80 line-through' : 'text-[#f0ede8]/75'}`}>
                            {task}
                          </p>
                        </button>
                      );
                    })}

                    {/* Warning — chỉ hiện cho current */}
                    {isCurrent && step.warning && (
                      <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl px-3 py-2.5 mt-2">
                        <p className="text-[10px] text-orange-300 leading-relaxed">⚠️ {step.warning}</p>
                      </div>
                    )}

                    {/* Progress complete celebration */}
                    {progress.pct === 100 && (
                      <div className="bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2.5 text-center">
                        <p className="text-[11px] text-green-400 font-bold">🎉 Hoàn thành! Bạn sẵn sàng lên band tiếp theo.</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Deal lương CTA */}
        <div className="bg-[#e8b84b]/10 border border-[#e8b84b]/30 rounded-2xl p-5 text-center">
          <p className="text-lg font-black text-[#e8b84b] mb-2">💰 Sẵn sàng deal lương?</p>
          <p className="text-[11px] text-[#f0ede8]/60 mb-3">
            Khi bạn tick xong 2/3 tasks ở band hiện tại — đó là lúc bạn có đủ bằng chứng để đàm phán.
            Đừng chờ hoàn hảo 100%. 70% là đủ leverage.
          </p>
          <Link href="/"
            className="inline-block bg-[#e8b84b] text-[#0a0c10] font-black px-5 py-2.5 rounded-xl text-sm">
            Quét lại → Xem mức lương mới
          </Link>
        </div>

        {/* Reset button */}
        <button
          onClick={() => {
            if (confirm('Xóa lộ trình hiện tại?')) {
              localStorage.removeItem('vspi-roadmap');
              setStarted(false); setTasks({}); setJob(''); setSalary('');
            }
          }}
          className="w-full text-center text-[9px] font-mono text-[#f0ede8]/20 hover:text-red-400 py-2"
        >
          Xóa lộ trình & bắt đầu lại
        </button>
      </div>
    </div>
  );
}
