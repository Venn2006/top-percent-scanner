"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { cleanRoadmapAccessCode } from '@/lib/roadmapAccess';

interface ScanEntry {
  job_title: string;
  salary: number;
  percent: number;
  experience: string | null;
  scanned_at: string;
}

interface RoadmapLookup {
  vspi_id: string;
  accessCode: string;
  job_title: string | null;
  current_salary: number | null;
  target_salary: number | null;
  duration_months: number | null;
}

export default function MyProgressPage() {
  const [phone, setPhone] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<ScanEntry[] | null>(null);
  const [roadmapHit, setRoadmapHit] = useState<RoadmapLookup | null>(null);
  const [savedRoadmapId, setSavedRoadmapId] = useState<string | null>(null);
  const [savedRoadmapAccessCode, setSavedRoadmapAccessCode] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('vspi-roadmap-v2');
      if (!saved) return;
      const parsed = JSON.parse(saved) as { vspiId?: string; accessCode?: string };
      if (parsed.vspiId) setSavedRoadmapId(parsed.vspiId);
      if (parsed.accessCode) setSavedRoadmapAccessCode(parsed.accessCode);
    } catch { /* ignore */ }
  }, []);

  const handleLookup = async () => {
    const cleanPhone = phone.replace(/\D/g, '');
    const cleanAccess = cleanRoadmapAccessCode(accessCode);
    if (!cleanPhone || !/^0[0-9]{9}$/.test(cleanPhone)) {
      setError('Nhập SĐT 10 số, ví dụ 0901234567');
      return;
    }

    setError('');
    setLoading(true);
    setRoadmapHit(null);

    try {
      const roadmapUrl = cleanAccess
        ? `/api/roadmap/generate?phone=${cleanPhone}&accessCode=${encodeURIComponent(cleanAccess)}&t=${Date.now()}`
        : null;
      const [historyRes, roadmapRes] = await Promise.all([
        fetch(`/api/history?phone=${cleanPhone}`),
        roadmapUrl ? fetch(roadmapUrl) : Promise.resolve(null),
      ]);

      const historyData = await historyRes.json();
      if (!historyRes.ok) {
        setError(historyData.error || 'Không lấy được lịch sử quét');
        return;
      }

      if (roadmapRes?.ok) {
        const roadmapData = await roadmapRes.json();
        if (roadmapData?.vspi_id) {
          const found: RoadmapLookup = {
            vspi_id: roadmapData.vspi_id,
            accessCode: roadmapData.accessCode || cleanAccess,
            job_title: roadmapData.job_title ?? null,
            current_salary: roadmapData.current_salary ?? null,
            target_salary: roadmapData.target_salary ?? null,
            duration_months: roadmapData.duration_months ?? null,
          };
          setRoadmapHit(found);
          setSavedRoadmapId(found.vspi_id);
          setSavedRoadmapAccessCode(found.accessCode);
          localStorage.setItem('vspi-roadmap-v2', JSON.stringify({
            vspiId: found.vspi_id,
            accessCode: found.accessCode,
            phone: cleanPhone,
            job: found.job_title || '',
            salary: found.current_salary || 0,
            duration: found.duration_months || 6,
          }));
        }
      } else if (roadmapRes && cleanAccess) {
        setError('Không tìm thấy lộ trình với SĐT + mã truy cập này');
      }

      setHistory(historyData.history || []);
      setPhone(cleanPhone);
      setAccessCode(cleanAccess);
    } catch {
      setError('Lỗi kết nối');
    } finally {
      setLoading(false);
    }
  };

  const progress = getProgress(history);

  return (
    <div className="min-h-screen bg-[#0a0c10] p-4 font-sans text-[#f0ede8]">
      <div className="mx-auto max-w-sm space-y-6 pt-8">
        <div className="text-center">
          <h1 className="mb-1 text-2xl font-black text-[#e8b84b]">Lịch sử & lộ trình</h1>
          <p className="text-sm leading-5 text-[#f0ede8]/50">
            SĐT dùng để xem lịch sử quét. Lộ trình 79k bắt buộc cần thêm mã truy cập.
          </p>
        </div>

        {savedRoadmapId && (
          <Link href="/roadmap?restore=1" className="flex items-center gap-3 rounded-2xl border border-[#e8b84b]/30 bg-[#e8b84b]/10 p-4 transition-all hover:bg-[#e8b84b]/15">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e8b84b] text-sm font-black text-[#0a0c10]">79k</div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-[#e8b84b]">Lộ trình đã lưu trên máy này</p>
              <p className="truncate text-[10px] text-[#f0ede8]/50">
                VSPI: {savedRoadmapId}{savedRoadmapAccessCode ? ` · Mã: ${savedRoadmapAccessCode}` : ''}
              </p>
            </div>
            <span className="shrink-0 text-lg text-[#e8b84b]">→</span>
          </Link>
        )}

        {!history && (
          <div className="space-y-4 rounded-2xl border border-white/10 bg-[#0f1219] p-6">
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-[#f0ede8]/60">
                SĐT / Zalo của bạn
              </label>
              <input
                type="tel"
                placeholder="0901234567"
                className="w-full rounded-xl border border-white/10 bg-[#161b26] px-4 py-3 text-sm text-[#f0ede8] outline-none placeholder:text-[#f0ede8]/20 focus:border-[#e8b84b]"
                value={phone}
                onChange={event => setPhone(event.target.value)}
                onKeyDown={event => event.key === 'Enter' && handleLookup()}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-[#f0ede8]/60">
                Mã truy cập lộ trình 79k <span className="normal-case tracking-normal text-[#f0ede8]/35">(nếu có)</span>
              </label>
              <input
                type="text"
                inputMode="text"
                autoCapitalize="characters"
                placeholder="VD: GRXGUQD5AZ3U"
                className="w-full rounded-xl border border-white/10 bg-[#161b26] px-4 py-3 text-sm font-black tracking-[0.14em] text-[#f0ede8] outline-none placeholder:tracking-normal placeholder:text-[#f0ede8]/20 focus:border-[#e8b84b]"
                value={accessCode}
                onChange={event => setAccessCode(cleanRoadmapAccessCode(event.target.value))}
                onKeyDown={event => event.key === 'Enter' && handleLookup()}
              />
            </div>
            {error && <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">{error}</p>}
            <button
              onClick={handleLookup}
              disabled={loading}
              className="w-full rounded-xl bg-[#e8b84b] py-3.5 text-sm font-black text-[#0a0c10] disabled:opacity-50"
            >
              {loading ? 'Đang tìm...' : 'Xem lịch sử / mở lộ trình'}
            </button>
            <p className="text-center text-[9px] leading-4 text-[#f0ede8]/30">
              Chỉ nhập SĐT thì xem lịch sử quét. Nhập thêm mã truy cập thì mở được lộ trình 79k đã thanh toán.
            </p>
          </div>
        )}

        {history && (
          <div className="space-y-4">
            {roadmapHit && (
              <Link href="/roadmap?restore=1" className="flex items-center gap-3 rounded-2xl border border-[#e8b84b]/35 bg-[#e8b84b]/10 p-4 transition-all hover:bg-[#e8b84b]/15">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e8b84b] text-sm font-black text-[#0a0c10]">79k</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-[#e8b84b]">Đã tìm thấy lộ trình 79k</p>
                  <p className="truncate text-[10px] text-[#f0ede8]/50">
                    Mã truy cập: {roadmapHit.accessCode} · {roadmapHit.job_title || 'Lộ trình tăng lương'}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-black text-[#e8b84b]">Mở →</span>
              </Link>
            )}

            {error && <p className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">{error}</p>}

            {progress && (
              <div className="rounded-2xl border border-[#e8b84b]/25 bg-[#0f1219] p-5">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[#e8b84b]">Tổng kết lịch sử quét</p>
                <div className="grid grid-cols-2 gap-3">
                  <ProgressMetric label="Tăng lương" value={`${progress.salaryGrowth > 0 ? '+' : ''}${(progress.salaryGrowth / 1_000_000).toFixed(1)}M`} good={progress.salaryGrowth > 0} />
                  <ProgressMetric label="Đổi Top %" value={`${progress.percentChange > 0 ? '↑' : progress.percentChange < 0 ? '↓' : '='}${Math.abs(progress.percentChange)}%`} good={progress.percentChange > 0} bad={progress.percentChange < 0} />
                  <ProgressMetric label="Tháng theo dõi" value={String(progress.months)} />
                  <ProgressMetric label="Lần quét" value={String(progress.scans)} accent />
                </div>
              </div>
            )}

            {history.length === 0 && (
              <div className="rounded-2xl border border-white/10 bg-[#0f1219] p-6 text-center">
                <p className="text-sm text-[#f0ede8]/50">Chưa có lịch sử quét nào với SĐT này.</p>
                {roadmapHit && (
                  <p className="mt-2 text-xs leading-5 text-[#f0ede8]/45">
                    Nhưng hệ thống đã tìm thấy lộ trình 79k. Nhấn card màu vàng phía trên để mở tiếp.
                  </p>
                )}
                <Link href="/" className="mt-2 inline-block text-sm font-bold text-[#e8b84b]">Quét ngay từ trang chủ →</Link>
              </div>
            )}

            {history.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-[#0f1219] p-5">
                <p className="mb-4 text-[10px] font-bold uppercase tracking-widest text-[#f0ede8]/40">Lịch sử quét</p>
                <div className="space-y-3">
                  {history.map((entry, index) => {
                    const previous = history[index + 1];
                    const improved = previous && entry.percent < previous.percent;
                    const same = previous && entry.percent === previous.percent;
                    return (
                      <div key={`${entry.scanned_at}-${index}`} className={`flex items-center gap-3 rounded-xl border p-3 ${index === 0 ? 'border-[#e8b84b]/20 bg-[#e8b84b]/5' : 'border-white/5 bg-[#161b26]'}`}>
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-xs font-black ${index === 0 ? 'bg-[#e8b84b] text-[#0a0c10]' : improved ? 'bg-green-500/20 text-green-400' : 'border border-white/10 bg-[#161b26] text-[#f0ede8]/30'}`}>
                          {index === 0 ? 'Mới' : improved ? '↑' : same ? '=' : '↓'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`truncate text-sm font-bold ${index === 0 ? 'text-[#e8b84b]' : 'text-[#f0ede8]'}`}>Top {entry.percent}% · {entry.job_title}</p>
                          <p className="text-[10px] text-[#f0ede8]/40">{(entry.salary / 1_000_000).toFixed(1)}M/tháng · {new Date(entry.scanned_at).toLocaleDateString('vi-VN')}</p>
                        </div>
                        {previous && (
                          <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold ${improved ? 'bg-green-500/20 text-green-400' : same ? 'bg-white/5 text-[#f0ede8]/30' : 'bg-red-500/10 text-red-400'}`}>
                            {entry.percent < previous.percent ? `↑${previous.percent - entry.percent}%` : entry.percent > previous.percent ? `↓${entry.percent - previous.percent}%` : '='}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <Link href="/" className="block w-full rounded-xl bg-[#e8b84b] py-3.5 text-center text-sm font-black text-[#0a0c10]">Quét lại để cập nhật lịch sử</Link>

            <button
              onClick={() => { setHistory(null); setRoadmapHit(null); setPhone(''); setAccessCode(''); setError(''); }}
              className="w-full py-2 text-center text-[10px] font-mono text-[#f0ede8]/30 hover:text-[#f0ede8]/60"
            >
              ← Đổi SĐT / mã truy cập khác
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ProgressMetric({ label, value, good, bad, accent }: { label: string; value: string; good?: boolean; bad?: boolean; accent?: boolean }) {
  return (
    <div className="text-center">
      <p className={`text-2xl font-black ${good ? 'text-green-400' : bad ? 'text-red-400' : accent ? 'text-[#e8b84b]' : 'text-[#f0ede8]/70'}`}>{value}</p>
      <p className="text-[9px] text-[#f0ede8]/40">{label}</p>
    </div>
  );
}

function getProgress(history: ScanEntry[] | null) {
  if (!history || history.length < 2) return null;
  const latest = history[0];
  const oldest = history[history.length - 1];
  const salaryGrowth = latest.salary - oldest.salary;
  const percentChange = oldest.percent - latest.percent;
  const months = Math.max(1, Math.round(
    (new Date(latest.scanned_at).getTime() - new Date(oldest.scanned_at).getTime()) / (30 * 24 * 60 * 60 * 1000)
  ));
  return { salaryGrowth, percentChange, months, scans: history.length };
}
