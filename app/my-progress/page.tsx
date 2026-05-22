"use client";

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface ScanEntry {
  job_title: string;
  salary: number;
  percent: number;
  experience: string | null;
  scanned_at: string;
}

export default function MyProgressPage() {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<ScanEntry[] | null>(null);

  // Kiểm tra có lộ trình 79k đã mua không
  const [savedRoadmapId, setSavedRoadmapId] = useState<string | null>(null);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('vspi-roadmap-v2');
      if (saved) {
        const { vspiId } = JSON.parse(saved);
        if (vspiId) setSavedRoadmapId(vspiId);
      }
    } catch { /* ignore */ }
  }, []);

  const handleLookup = async () => {
    if (!phone || !/^0[0-9]{9}$/.test(phone)) {
      setError('Nhập SĐT 10 số (VD: 0901234567)');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch(`/api/history?phone=${phone}`);
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Lỗi'); return; }
      setHistory(data.history);
    } catch {
      setError('Lỗi kết nối');
    } finally {
      setLoading(false);
    }
  };

  // Tính tiến độ
  const getProgress = () => {
    if (!history || history.length < 2) return null;
    const latest = history[0];
    const oldest = history[history.length - 1];
    const salaryGrowth = latest.salary - oldest.salary;
    const percentChange = oldest.percent - latest.percent; // giảm = tốt hơn
    const months = Math.max(1, Math.round(
      (new Date(latest.scanned_at).getTime() - new Date(oldest.scanned_at).getTime()) / (30 * 24 * 60 * 60 * 1000)
    ));
    return { salaryGrowth, percentChange, months, scans: history.length };
  };

  const progress = history ? getProgress() : null;

  return (
    <div className="min-h-screen bg-[#0a0c10] p-4 font-sans text-[#f0ede8]">
      <div className="max-w-sm mx-auto space-y-6 pt-8">

        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl font-black text-[#e8b84b] mb-1">📈 Tiến Độ Sự Nghiệp</h1>
          <p className="text-sm text-[#f0ede8]/50">Xem lịch sử quét lương & tracking tiến độ tăng trưởng</p>
        </div>

        {/* Lộ trình 79k — nếu đã mua */}
        {savedRoadmapId && (
          <Link href="/roadmap"
            className="flex items-center gap-3 bg-[#e8b84b]/10 border border-[#e8b84b]/30 rounded-2xl p-4 hover:bg-[#e8b84b]/15 transition-all">
            <div className="w-10 h-10 bg-[#e8b84b] rounded-xl flex items-center justify-center shrink-0 text-lg">🗺️</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-black text-[#e8b84b]">Lộ trình của bạn đang chờ</p>
              <p className="text-[10px] text-[#f0ede8]/50 truncate">Mã: {savedRoadmapId} · Nhấn để xem tiếp</p>
            </div>
            <span className="text-[#e8b84b] text-lg shrink-0">→</span>
          </Link>
        )}

        {/* Login bằng SĐT */}
        {!history && (
          <div className="bg-[#0f1219] border border-white/10 rounded-2xl p-6 space-y-4">
            <div>
              <label className="text-[10px] font-mono font-bold text-[#f0ede8]/60 uppercase tracking-widest block mb-1.5">
                SĐT / Zalo của bạn
              </label>
              <input
                type="tel"
                placeholder="0901234567"
                className="w-full bg-[#161b26] border border-white/10 rounded-xl px-4 py-3 text-sm text-[#f0ede8] outline-none focus:border-[#e8b84b] placeholder:text-[#f0ede8]/20"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLookup()}
              />
            </div>
            {error && <p className="text-[11px] text-red-400">{error}</p>}
            <button
              onClick={handleLookup}
              disabled={loading}
              className="w-full bg-[#e8b84b] text-[#0a0c10] font-black py-3.5 rounded-xl text-sm disabled:opacity-50"
            >
              {loading ? 'Đang tìm...' : 'Xem tiến độ của tôi'}
            </button>
            <p className="text-[9px] text-[#f0ede8]/30 text-center">
              Dùng SĐT bạn đã nhập khi mua Premium. Nếu chưa quét lần nào với SĐT này, hãy quét lại từ trang chủ.
            </p>
          </div>
        )}

        {/* Progress Dashboard */}
        {history && (
          <div className="space-y-4">

            {/* Summary card */}
            {progress && (
              <div className="bg-[#0f1219] border border-[#e8b84b]/25 rounded-2xl p-5">
                <p className="text-[10px] font-mono text-[#e8b84b] uppercase tracking-widest mb-3">📊 Tổng kết tiến độ</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="text-center">
                    <p className={`text-2xl font-black ${progress.salaryGrowth > 0 ? 'text-green-400' : 'text-[#f0ede8]/40'}`}>
                      {progress.salaryGrowth > 0 ? '+' : ''}{(progress.salaryGrowth / 1_000_000).toFixed(1)}M
                    </p>
                    <p className="text-[9px] text-[#f0ede8]/40">Tăng lương</p>
                  </div>
                  <div className="text-center">
                    <p className={`text-2xl font-black ${progress.percentChange > 0 ? 'text-green-400' : progress.percentChange < 0 ? 'text-red-400' : 'text-[#f0ede8]/40'}`}>
                      {progress.percentChange > 0 ? '↑' : progress.percentChange < 0 ? '↓' : '='}{Math.abs(progress.percentChange)}%
                    </p>
                    <p className="text-[9px] text-[#f0ede8]/40">Thay đổi Top %</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-black text-[#f0ede8]/70">{progress.months}</p>
                    <p className="text-[9px] text-[#f0ede8]/40">Tháng theo dõi</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-black text-[#e8b84b]">{progress.scans}</p>
                    <p className="text-[9px] text-[#f0ede8]/40">Lần quét</p>
                  </div>
                </div>
              </div>
            )}

            {history.length === 0 && (
              <div className="bg-[#0f1219] border border-white/10 rounded-2xl p-6 text-center">
                <p className="text-sm text-[#f0ede8]/50">Chưa có lịch sử quét nào với SĐT này.</p>
                <Link href="/" className="text-[#e8b84b] text-sm font-bold mt-2 inline-block">
                  → Quét ngay từ trang chủ
                </Link>
              </div>
            )}

            {/* History timeline */}
            {history.length > 0 && (
              <div className="bg-[#0f1219] border border-white/10 rounded-2xl p-5">
                <p className="text-[10px] font-mono text-[#f0ede8]/40 uppercase tracking-widest mb-4">🕐 Lịch sử quét</p>
                <div className="space-y-3">
                  {history.map((entry, i) => {
                    const prevEntry = history[i + 1];
                    const improved = prevEntry && entry.percent < prevEntry.percent;
                    const same = prevEntry && entry.percent === prevEntry.percent;
                    return (
                      <div key={i} className={`flex items-center gap-3 p-3 rounded-xl border ${i === 0 ? 'bg-[#e8b84b]/5 border-[#e8b84b]/20' : 'bg-[#161b26] border-white/5'}`}>
                        {/* Rank indicator */}
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-xs font-black
                          ${i === 0 ? 'bg-[#e8b84b] text-[#0a0c10]' : improved ? 'bg-green-500/20 text-green-400' : 'bg-[#161b26] text-[#f0ede8]/30 border border-white/10'}`}>
                          {i === 0 ? '🆕' : improved ? '↑' : same ? '=' : '↓'}
                        </div>
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-bold truncate ${i === 0 ? 'text-[#e8b84b]' : 'text-[#f0ede8]'}`}>
                            Top {entry.percent}% · {entry.job_title}
                          </p>
                          <p className="text-[10px] text-[#f0ede8]/40">
                            {(entry.salary / 1_000_000).toFixed(1)}M/tháng · {new Date(entry.scanned_at).toLocaleDateString('vi-VN')}
                          </p>
                        </div>
                        {/* Change badge */}
                        {prevEntry && (
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0
                            ${improved ? 'bg-green-500/20 text-green-400' : same ? 'bg-white/5 text-[#f0ede8]/30' : 'bg-red-500/10 text-red-400'}`}>
                            {entry.percent < prevEntry.percent ? `↑${prevEntry.percent - entry.percent}%` :
                             entry.percent > prevEntry.percent ? `↓${entry.percent - prevEntry.percent}%` : '='}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* CTA quét lại */}
            <Link href="/"
              className="block w-full bg-[#e8b84b] text-[#0a0c10] font-black py-3.5 rounded-xl text-sm text-center">
              ⚡ Quét lại — Cập nhật tiến độ mới nhất
            </Link>

            <button
              onClick={() => { setHistory(null); setPhone(''); }}
              className="w-full text-center text-[10px] font-mono text-[#f0ede8]/30 hover:text-[#f0ede8]/60 py-2"
            >
              ← Đổi SĐT khác
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
