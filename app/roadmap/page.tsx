"use client";

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { getCareerCompassContext } from '@/lib/careerCompassEngine';
import { getAttributionPayload } from '@/lib/attribution';

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
interface RoadmapData { goal: string; summary: string; weeks: WeekPlan[]; negotiation_timing: string; salary_projection: string; }
interface RoadmapProfile { vspiId: string; phone: string; job: string; salary: number; duration: number; }

// Bước: setup → qr → checking → roadmap | restore (nhập SĐT để lấy lại)
type PageStep = 'setup' | 'restore' | 'qr' | 'checking' | 'roadmap';

const STORAGE_KEY = 'vspi-roadmap-v2';

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

  const [vspiId, setVspiId]       = useState('');
  const [profile, setProfile]     = useState<RoadmapProfile | null>(null);
  const [pollCount, setPollCount] = useState(0);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  const [roadmap, setRoadmap]     = useState<RoadmapData | null>(null);
  const [progress, setProgress]   = useState<Record<string, boolean>>({});
  const [generating, setGenerating] = useState(false);

  // Restore phone input cho trang restore
  const [restorePhone, setRestorePhone] = useState('');
  const [restoreLoading, setRestoreLoading] = useState(false);

  const applyPreset = (preset: typeof ROADMAP_PRESETS[number]) => {
    setJob(preset.job);
    setCurrentSalary(preset.salary);
    setDuration(preset.duration);
    setError('');
  };

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // ── Auto-restore khi load trang ──────────────────────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    try {
      const p: RoadmapProfile = JSON.parse(saved);
      if (!p.vspiId || !p.phone) return;
      setProfile(p);
      setVspiId(p.vspiId);
      setGenerating(true);
      // Thử load bằng vspiId trước
      fetch(`/api/roadmap/generate?id=${p.vspiId}&t=${Date.now()}`)
        .then(r => r.json())
        .then(async data => {
          if (data.status === 'paid') {
            if (data.roadmap_json) {
              setRoadmap(data.roadmap_json);
              setProgress(data.task_progress || {});
              setStep('roadmap');
            } else {
              // Paid nhưng chưa generate
              const r2 = await fetch('/api/roadmap/generate', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vspiId: p.vspiId }),
              });
              const d2 = await r2.json();
              if (d2.roadmap) { setRoadmap(d2.roadmap); setProgress(d2.progress || {}); setStep('roadmap'); }
            }
          }
          // pending → ở setup, user thấy form đã điền sẵn
        })
        .catch(() => {})
        .finally(() => setGenerating(false));
      // Pre-fill form
      setJob(p.job || '');
      setCurrentSalary(String(p.salary || ''));
      if (p.duration) setDuration(p.duration as 3 | 6 | 12);
      setPhone(p.phone || '');
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
        vspiId: data.vspiId, phone: phone.replace(/\s/g, ''),
        job: job.trim(), salary: cur, duration,
      };
      setVspiId(data.vspiId);
      setProfile(newProfile);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newProfile));
      setStep('qr');
    } catch { setError('Lỗi kết nối'); }
    finally { setCreating(false); }
  };

  // ── Restore bằng SĐT ─────────────────────────────────────────────────────
  const handleRestoreByPhone = async () => {
    const clean = restorePhone.replace(/\D/g, '');
    if (!clean || clean.length < 9) { setError('Nhập SĐT hợp lệ'); return; }
    setError(''); setRestoreLoading(true);
    try {
      const res = await fetch(`/api/roadmap/generate?phone=${clean}&t=${Date.now()}`);
      if (!res.ok) { setError('Không tìm thấy lộ trình với SĐT này'); return; }
      const data = await res.json();
      if (data.status !== 'paid') { setError('Lộ trình chưa được thanh toán'); return; }

      const newProfile: RoadmapProfile = {
        vspiId: data.vspi_id, phone: clean,
        job: data.job_title || '', salary: data.current_salary || 0, duration: data.duration_months || 6,
      };
      setVspiId(data.vspi_id);
      setProfile(newProfile);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newProfile));

      if (data.roadmap_json) {
        setRoadmap(data.roadmap_json);
        setProgress(data.task_progress || {});
        setStep('roadmap');
      } else {
        // Generate lần đầu
        setGenerating(true);
        const r2 = await fetch('/api/roadmap/generate', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vspiId: data.vspi_id }),
        });
        const d2 = await r2.json();
        if (d2.roadmap) { setRoadmap(d2.roadmap); setProgress(d2.progress || {}); setStep('roadmap'); }
        else setError('Lỗi tải lộ trình');
        setGenerating(false);
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
        const res = await fetch(`/api/roadmap/generate?id=${vspiId}&t=${Date.now()}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === 'paid') { clearInterval(pollRef.current!); await loadRoadmap(); }
      } catch { /* retry */ }
      if (count >= 15) {
        clearInterval(pollRef.current!); setStep('qr');
        setError('Chưa nhận được xác nhận. Liên hệ Zalo: 0915 662 876');
      }
    }, 8000);
  };

  const loadRoadmap = async () => {
    setGenerating(true);
    try {
      const res = await fetch('/api/roadmap/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vspiId }),
      });
      const data = await res.json();
      if (data.roadmap) { setRoadmap(data.roadmap); setProgress(data.progress || {}); setStep('roadmap'); }
    } catch { setError('Lỗi tải lộ trình'); }
    finally { setGenerating(false); }
  };

  const toggleTask = async (wi: number, ti: number) => {
    const key = `w${wi}_t${ti}`;
    const newVal = !progress[key];
    setProgress(p => ({ ...p, [key]: newVal }));
    fetch('/api/roadmap/progress', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vspiId, taskKey: key, done: newVal }),
    }).catch(() => {});
  };

  const getStats = () => {
    if (!roadmap) return { done: 0, total: 0, pct: 0 };
    let total = 0, done = 0;
    roadmap.weeks.forEach((w, wi) => w.tasks.forEach((_, ti) => {
      total++; if (progress[`w${wi}_t${ti}`]) done++;
    }));
    return { done, total, pct: total > 0 ? Math.round((done / total) * 100) : 0 };
  };

  const stats      = getStats();
  const cleanVspi  = vspiId.replace(/-/g, '').toUpperCase();

  // ════════════════════════════════════════════════════════════════════════
  // RENDER — Loading restore
  // ════════════════════════════════════════════════════════════════════════
  if (generating && step !== 'checking') return (
    <div className="min-h-screen bg-[#0a0c10] flex items-center justify-center p-4 font-sans text-[#f0ede8]">
      <div className="text-center space-y-4">
        <div className="relative w-16 h-16 mx-auto">
          <div className="absolute inset-0 border-4 border-white/10 rounded-full" />
          <div className="absolute inset-0 border-4 border-t-[#e8b84b] rounded-full animate-spin" />
        </div>
        <p className="text-base font-bold text-[#f0ede8]">Đang tải lộ trình của bạn...</p>
      </div>
    </div>
  );

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
          <p className="text-sm text-[#f0ede8]/50">Chuyên gia thiết kế riêng · Tick task từng tuần · Đồng hành đến khi lên lương</p>
        </div>

        <div className="bg-[#0f1219] border border-[#e8b84b]/20 rounded-2xl p-4 grid grid-cols-2 gap-2">
          {[
            'Evidence log có số liệu',
            'KPI trước/sau',
            'Script deal lương',
            'Hướng nhảy việc tăng lương',
            'CV/LinkedIn bullet',
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

        <div className="bg-[#0f1219] border border-white/10 rounded-2xl p-6 space-y-4">
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
            <p className="text-[9px] text-[#f0ede8]/30 mt-1 pl-1">SĐT này là chìa khóa để xem lại lộ trình bất cứ lúc nào</p>
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
            <input type="number" placeholder="VD: 15000000"
              className="w-full bg-[#161b26] border border-white/10 rounded-xl px-4 py-3 text-sm text-[#f0ede8] outline-none focus:border-[#e8b84b] placeholder:text-[#f0ede8]/20"
              value={currentSalary} onChange={e => setCurrentSalary(e.target.value)} />
            {cur > 0 && <p className="text-[10px] text-[#f0ede8]/35 mt-1 pl-1">≈ {(cur/1_000_000).toFixed(1)} triệu/tháng</p>}
          </div>

          {/* Thời gian */}
          <div>
            <label className="text-[10px] font-mono font-bold text-[#f0ede8]/60 uppercase block mb-2">Mục tiêu trong bao lâu?</label>
            <div className="grid grid-cols-3 gap-2">
              {([3, 6, 12] as const).map(d => (
                <button key={d} onClick={() => setDuration(d)}
                  className={`py-3 rounded-xl border-2 text-sm font-bold transition-all ${duration === d ? 'border-[#e8b84b] bg-[#e8b84b]/10 text-[#e8b84b]' : 'border-white/10 bg-[#161b26] text-[#f0ede8]/50'}`}>
                  {d === 12 ? '1 năm' : `${d} tháng`}
                </button>
              ))}
            </div>
          </div>

          {/* Preview mục tiêu */}
          {targetCalc && cur > 0 && (
            <div className="bg-[#161b26] border border-[#e8b84b]/20 rounded-xl p-4 space-y-2">
              <p className="text-[10px] font-mono text-[#e8b84b] uppercase tracking-wider">🎯 Mục tiêu hệ thống đề xuất</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-black text-[#f0ede8]">{(targetCalc.target/1_000_000).toFixed(1)} triệu/tháng</p>
                  <p className="text-[11px] text-green-400 font-bold">{targetCalc.label}</p>
                </div>
                <p className="text-[9px] text-[#f0ede8]/35">trong {duration === 12 ? '1 năm' : `${duration} tháng`}</p>
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

          <button onClick={handleSetup} disabled={creating}
            className="w-full bg-[#e8b84b] text-[#0a0c10] font-black py-4 rounded-xl text-base disabled:opacity-50 hover:-translate-y-0.5 transition-all">
            {creating ? 'Đang tạo...' : '🗺️ Tạo lộ trình — 79.000đ'}
          </button>

          <p className="text-[9px] text-[#f0ede8]/25 text-center">
            Chuyên gia thiết kế lộ trình 1 lần · Lưu vĩnh viễn theo SĐT · Tick task theo tuần
          </p>
        </div>

        {/* Đã mua rồi → xem lại */}
        <button onClick={() => { setError(''); setStep('restore'); }}
          className="w-full text-center text-[11px] text-[#e8b84b]/60 hover:text-[#e8b84b] py-2">
          Đã mua rồi? Nhập SĐT để xem lại lộ trình →
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
          <p className="text-sm text-[#f0ede8]/50">Nhập SĐT đã đăng ký để khôi phục lộ trình</p>
        </div>

        <div className="bg-[#0f1219] border border-white/10 rounded-2xl p-6 space-y-4">
          <div>
            <label className="text-[10px] font-mono font-bold text-[#f0ede8]/60 uppercase block mb-1.5">SĐT / Zalo đã đăng ký</label>
            <input type="tel" placeholder="0901234567"
              className="w-full bg-[#161b26] border border-white/10 rounded-xl px-4 py-3 text-sm text-[#f0ede8] outline-none focus:border-[#e8b84b] placeholder:text-[#f0ede8]/20"
              value={restorePhone} onChange={e => setRestorePhone(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleRestoreByPhone()} />
          </div>

          {error && <p className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2">{error}</p>}

          <button onClick={handleRestoreByPhone} disabled={restoreLoading}
            className="w-full bg-[#e8b84b] text-[#0a0c10] font-black py-4 rounded-xl text-base disabled:opacity-50">
            {restoreLoading ? 'Đang tìm...' : '🔍 Tìm lộ trình của tôi'}
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
    <div className="min-h-screen bg-[#0a0c10] p-4 pb-10 font-sans text-[#f0ede8]">
      <div className="max-w-sm mx-auto pt-6 space-y-5">

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

        <Link href="/"
          className="block w-full bg-[#e8b84b] text-[#0a0c10] font-black py-4 rounded-xl text-base text-center hover:-translate-y-0.5 transition-all">
          ⚡ Quét lại — Xem lương đã tăng chưa
        </Link>

        {/* SĐT là chìa khóa */}
        <div className="bg-[#0f1219] border border-white/8 rounded-xl p-4 text-center space-y-1">
          <p className="text-[10px] font-mono text-[#f0ede8]/30 uppercase tracking-wider">🔑 Chìa khóa lộ trình</p>
          <p className="text-sm font-black text-[#e8b84b]">{profile?.phone}</p>
          <p className="text-[9px] text-[#f0ede8]/25">
            Dùng SĐT này để xem lại lộ trình bất cứ lúc nào, trên bất kỳ thiết bị nào.
          </p>
        </div>

      </div>
    </div>
  );
}
