"use client";

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

interface WeekPlan {
  week: number;
  focus: string;
  tasks: string[];
  milestone: string;
}

interface RoadmapData {
  goal: string;
  summary: string;
  weeks: WeekPlan[];
  negotiation_timing: string;
  salary_projection: string;
}

type PageStep = 'setup' | 'qr' | 'checking' | 'roadmap';

export default function RoadmapPage() {
  const [step, setStep] = useState<PageStep>('setup');

  // Setup form
  const [job, setJob] = useState('');
  const [currentSalary, setCurrentSalary] = useState('');
  const [targetSalary, setTargetSalary] = useState('');
  const [duration, setDuration] = useState<3 | 6>(3);
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);

  // Payment
  const [vspiId, setVspiId] = useState('');
  const [pollCount, setPollCount] = useState(0);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Roadmap data
  const [roadmap, setRoadmap] = useState<RoadmapData | null>(null);
  const [progress, setProgress] = useState<Record<string, boolean>>({});
  const [generating, setGenerating] = useState(false);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // ── SETUP: tạo đơn hàng ──────────────────────────────────────────────────
  const handleSetup = async () => {
    if (!job.trim()) { setError('Nhập nghề nghiệp'); return; }
    const cur = parseInt(currentSalary.replace(/,/g, ''), 10);
    const tgt = parseInt(targetSalary.replace(/,/g, ''), 10);
    if (!cur || cur < 1_000_000) { setError('Nhập lương hiện tại hợp lệ'); return; }
    if (!tgt || tgt <= cur) { setError('Lương mục tiêu phải cao hơn lương hiện tại'); return; }
    if (tgt - cur > 50_000_000) { setError('Mục tiêu tăng tối đa 50 triệu/tháng'); return; }

    setError('');
    setCreating(true);
    try {
      const goalLabel = `Tăng ${((tgt - cur) / 1_000_000).toFixed(1)} triệu trong ${duration} tháng`;
      const res = await fetch('/api/roadmap/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phone || null,
          job_title: job.trim(),
          current_salary: cur,
          target_salary: tgt,
          duration_months: duration,
          goal_label: goalLabel,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Lỗi tạo đơn'); return; }
      setVspiId(data.vspiId);
      setStep('qr');
    } catch { setError('Lỗi kết nối'); }
    finally { setCreating(false); }
  };

  // ── POLLING sau khi chuyển khoản ─────────────────────────────────────────
  const startPolling = () => {
    setStep('checking');
    let count = 0;
    pollRef.current = setInterval(async () => {
      count++;
      setPollCount(count);
      try {
        const res = await fetch(`/api/roadmap/generate?id=${vspiId}&t=${Date.now()}`, { method: 'GET' });
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === 'paid') {
          clearInterval(pollRef.current!);
          await loadRoadmap();
        }
      } catch { /* retry */ }
      if (count >= 15) {
        clearInterval(pollRef.current!);
        setStep('qr');
        setError('Chưa nhận được xác nhận. Liên hệ Zalo: 0915 662 876');
      }
    }, 8000);
  };

  const loadRoadmap = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/roadmap/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vspiId }),
      });
      const data = await res.json();
      if (data.roadmap) {
        setRoadmap(data.roadmap);
        setProgress(data.progress || {});
        setStep('roadmap');
      }
    } catch { setError('Lỗi tải lộ trình'); }
    finally { setGenerating(false); }
  };

  // ── TICK TASK ─────────────────────────────────────────────────────────────
  const toggleTask = async (weekIdx: number, taskIdx: number) => {
    const key = `w${weekIdx}_t${taskIdx}`;
    const newVal = !progress[key];
    const newProgress = { ...progress, [key]: newVal };
    setProgress(newProgress);
    // Save to server
    fetch('/api/roadmap/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vspiId, taskKey: key, done: newVal }),
    }).catch(() => {});
  };

  // ── PROGRESS STATS ────────────────────────────────────────────────────────
  const getStats = () => {
    if (!roadmap) return { done: 0, total: 0, pct: 0 };
    let total = 0, done = 0;
    roadmap.weeks.forEach((w, wi) => {
      w.tasks.forEach((_, ti) => {
        total++;
        if (progress[`w${wi}_t${ti}`]) done++;
      });
    });
    return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  };

  const stats = getStats();
  const cleanVspiId = vspiId.replace(/-/g, '').toUpperCase();

  // ════════════════════════════════════════════════════════════════════════
  // RENDER
  // ════════════════════════════════════════════════════════════════════════

  // ── STEP: SETUP ──────────────────────────────────────────────────────────
  if (step === 'setup') return (
    <div className="min-h-screen bg-[#0a0c10] p-4 font-sans text-[#f0ede8]">
      <div className="max-w-sm mx-auto pt-8 space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center gap-2 bg-[#e8b84b]/10 border border-[#e8b84b]/30 rounded-full px-4 py-1.5 mb-4">
            <span className="text-[#e8b84b] text-xs font-black">VSPI ROADMAP</span>
            <span className="bg-red-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">79K</span>
          </div>
          <h1 className="text-2xl font-black text-[#f0ede8] mb-2 leading-tight">
            Lộ trình tăng lương<br />
            <span className="text-[#e8b84b]">thiết kế riêng cho bạn</span>
          </h1>
          <p className="text-sm text-[#f0ede8]/50">AI tạo kế hoạch từng tuần · Tick task · Đồng hành đến khi lên lương</p>
        </div>

        {/* Form */}
        <div className="bg-[#0f1219] border border-white/10 rounded-2xl p-6 space-y-4">
          <div>
            <label className="text-[10px] font-mono font-bold text-[#f0ede8]/60 uppercase block mb-1.5">Nghề nghiệp</label>
            <input type="text" placeholder="VD: Backend Developer, Kế toán..."
              className="w-full bg-[#161b26] border border-white/10 rounded-xl px-4 py-3 text-sm text-[#f0ede8] outline-none focus:border-[#e8b84b] placeholder:text-[#f0ede8]/20"
              value={job} onChange={e => setJob(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] font-mono font-bold text-[#f0ede8]/60 uppercase block mb-1.5">Lương hiện tại</label>
              <input type="number" placeholder="15000000"
                className="w-full bg-[#161b26] border border-white/10 rounded-xl px-3 py-3 text-sm text-[#f0ede8] outline-none focus:border-[#e8b84b] placeholder:text-[#f0ede8]/20"
                value={currentSalary} onChange={e => setCurrentSalary(e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] font-mono font-bold text-[#f0ede8]/60 uppercase block mb-1.5">Lương mục tiêu</label>
              <input type="number" placeholder="20000000"
                className="w-full bg-[#161b26] border border-white/10 rounded-xl px-3 py-3 text-sm text-[#f0ede8] outline-none focus:border-[#e8b84b] placeholder:text-[#f0ede8]/20"
                value={targetSalary} onChange={e => setTargetSalary(e.target.value)} />
            </div>
          </div>

          {/* Duration */}
          <div>
            <label className="text-[10px] font-mono font-bold text-[#f0ede8]/60 uppercase block mb-2">Thời gian mục tiêu</label>
            <div className="grid grid-cols-2 gap-2">
              {([3, 6] as const).map(d => (
                <button key={d} onClick={() => setDuration(d)}
                  className={`py-3 rounded-xl border-2 text-sm font-bold transition-all ${duration === d ? 'border-[#e8b84b] bg-[#e8b84b]/10 text-[#e8b84b]' : 'border-white/10 bg-[#161b26] text-[#f0ede8]/50'}`}>
                  {d} tháng
                </button>
              ))}
            </div>
          </div>

          {/* Preview goal */}
          {currentSalary && targetSalary && parseInt(targetSalary) > parseInt(currentSalary) && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-center">
              <p className="text-sm font-bold text-green-400">
                Mục tiêu: +{((parseInt(targetSalary) - parseInt(currentSalary)) / 1_000_000).toFixed(1)} triệu/tháng trong {duration} tháng
              </p>
              <p className="text-[10px] text-green-400/60 mt-0.5">
                = +{(((parseInt(targetSalary) - parseInt(currentSalary)) / parseInt(currentSalary)) * 100).toFixed(0)}% so với hiện tại
              </p>
            </div>
          )}

          <div>
            <label className="text-[10px] font-mono font-bold text-[#f0ede8]/60 uppercase block mb-1.5">SĐT / Zalo (để lưu lộ trình)</label>
            <input type="tel" placeholder="0901234567"
              className="w-full bg-[#161b26] border border-white/10 rounded-xl px-4 py-3 text-sm text-[#f0ede8] outline-none focus:border-[#e8b84b] placeholder:text-[#f0ede8]/20"
              value={phone} onChange={e => setPhone(e.target.value)} />
          </div>

          {error && <p className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2">{error}</p>}

          <button onClick={handleSetup} disabled={creating}
            className="w-full bg-[#e8b84b] text-[#0a0c10] font-black py-4 rounded-xl text-base disabled:opacity-50 hover:-translate-y-0.5 transition-all">
            {creating ? 'Đang tạo...' : '🗺️ Tạo lộ trình — 79.000đ'}
          </button>

          <p className="text-[9px] text-[#f0ede8]/25 text-center">
            AI generate lộ trình 1 lần · Lưu vĩnh viễn · Tick task theo tuần
          </p>
        </div>

        <Link href="/" className="block text-center text-[10px] text-[#f0ede8]/30 hover:text-[#f0ede8]/60">
          ← Quay lại trang chủ
        </Link>
      </div>
    </div>
  );

  // ── STEP: QR ─────────────────────────────────────────────────────────────
  if (step === 'qr') return (
    <div className="min-h-screen bg-[#0a0c10] p-4 font-sans text-[#f0ede8]">
      <div className="max-w-sm mx-auto pt-8 space-y-5">
        <div className="text-center">
          <h2 className="text-xl font-black text-[#f0ede8] mb-1">Quét QR để mở khóa lộ trình</h2>
          <p className="text-sm text-[#f0ede8]/50">Thanh toán xong → AI tạo lộ trình riêng cho bạn ngay</p>
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
                src={`https://img.vietqr.io/image/msb-96886693012762-compact2.png?amount=79000&addInfo=${cleanVspiId}&accountName=NGUYEN%20TRONG%20VAN`}
                alt="QR 79k" className="w-56 h-56 rounded-xl block"
              />
            </div>
            <div className="bg-[#161b26] border border-white/10 rounded-xl px-4 py-2 text-center w-full mb-1">
              <p className="text-[11px] font-mono text-[#f0ede8]/50">MSB · <strong className="text-[#f0ede8]">96886693012762</strong> · NGUYEN TRONG VAN</p>
            </div>
            <div className="bg-[#0a0c10] border border-[#e8b84b]/25 rounded-xl px-4 py-2 text-center w-full">
              <p className="text-[10px] font-mono text-[#f0ede8]/50">
                Nội dung CK: <span className="font-black text-[#e8b84b] tracking-wider">{cleanVspiId}</span>
              </p>
            </div>
          </div>

          <div className="px-5 pb-5 space-y-3">
            {error && <p className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2">{error}</p>}
            <button onClick={startPolling}
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

  // ── STEP: CHECKING ────────────────────────────────────────────────────────
  if (step === 'checking' || generating) return (
    <div className="min-h-screen bg-[#0a0c10] flex items-center justify-center p-4 font-sans text-[#f0ede8]">
      <div className="text-center space-y-4">
        <div className="relative w-16 h-16 mx-auto">
          <div className="absolute inset-0 border-4 border-white/10 rounded-full" />
          <div className="absolute inset-0 border-4 border-t-[#e8b84b] rounded-full animate-spin" />
        </div>
        <p className="text-lg font-bold text-[#f0ede8]">
          {generating ? '🤖 AI đang tạo lộ trình riêng cho bạn...' : 'Đang xác nhận thanh toán...'}
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
    <div className="min-h-screen bg-[#0a0c10] p-4 pb-10 font-sans text-[#f0ede8]">
      <div className="max-w-sm mx-auto pt-6 space-y-5">

        {/* Header */}
        <div className="bg-[#0f1219] border border-[#e8b84b]/25 rounded-2xl p-5">
          <div className="flex items-start justify-between mb-3">
            <div>
              <span className="text-[9px] bg-[#e8b84b]/10 border border-[#e8b84b]/30 text-[#e8b84b] font-mono font-black px-2 py-0.5 rounded-full">✓ VSPI ROADMAP</span>
              <h1 className="text-lg font-black text-[#f0ede8] mt-2 leading-tight">{roadmap.goal}</h1>
            </div>
          </div>
          <p className="text-[11px] text-[#f0ede8]/60 leading-relaxed mb-4">{roadmap.summary}</p>

          {/* Overall progress */}
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
        </div>

        {/* Salary projection */}
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-center">
          <p className="text-[11px] text-green-300 leading-relaxed">{roadmap.salary_projection}</p>
        </div>

        {/* Weekly tasks */}
        <div className="space-y-4">
          {roadmap.weeks.map((week, wi) => {
            const weekDone = week.tasks.filter((_, ti) => progress[`w${wi}_t${ti}`]).length;
            const weekPct = Math.round((weekDone / week.tasks.length) * 100);
            const isComplete = weekDone === week.tasks.length;

            return (
              <div key={wi} className={`bg-[#0f1219] border rounded-2xl overflow-hidden ${isComplete ? 'border-green-500/30' : 'border-white/8'}`}>
                {/* Week header */}
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

                {/* Tasks */}
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

        {/* Quét lại CTA */}
        <Link href="/"
          className="block w-full bg-[#e8b84b] text-[#0a0c10] font-black py-4 rounded-xl text-base text-center hover:-translate-y-0.5 transition-all">
          ⚡ Quét lại — Xem lương đã tăng chưa
        </Link>

        <p className="text-center text-[9px] text-[#f0ede8]/20 font-mono">
          Mã lộ trình: {vspiId} · Lưu link này để quay lại
        </p>
      </div>
    </div>
  );
}
