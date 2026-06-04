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
}

interface RecoveryItem {
  id: string;
  product: 'report29' | 'roadmap79';
  productLabel: string;
  jobTitle: string | null;
  roleId?: string | null;
  targetJobTitle: string | null;
  currentSalary: number | null;
  targetSalary: number | null;
  status: string;
  statusLabel: string;
  progressDone: number | null;
  progressTotal: number | null;
  certificateEligible: boolean;
  lastUpdated: string | null;
  maskedAccessCode: string;
  accessVerified: boolean;
  vspiId?: string;
  accessCode?: string;
}

const STORAGE_KEY = 'vspi-roadmap-v2';
const CLIENT_REPORT_CACHE_VERSION = '2026-06-role-guard-v3';

const getRoadmapRestoreHref = (vspiId: string, accessCode: string, phone?: string) => {
  const params = new URLSearchParams({
    restore: '1',
    id: vspiId,
    accessCode: cleanRoadmapAccessCode(accessCode),
  });
  const cleanPhone = phone?.replace(/\D/g, '') || '';
  if (cleanPhone) params.set('phone', cleanPhone);
  return `/roadmap?${params.toString()}`;
};

const getReportRestoreHref = (vspiId: string, phone?: string) => {
  const params = new URLSearchParams({ vspiId });
  const cleanPhone = phone?.replace(/\D/g, '') || '';
  if (cleanPhone) params.set('phone', cleanPhone);
  return `/report?${params.toString()}`;
};

const maskClientAccessCode = (value: string | null | undefined) => {
  const clean = cleanRoadmapAccessCode(value || '');
  if (!clean) return '';
  if (clean.length <= 8) return `${clean.slice(0, 2)}••••${clean.slice(-2)}`;
  return `${clean.slice(0, 4)}••••${clean.slice(-3)}`;
};

export default function MyProgressPage() {
  const [phone, setPhone] = useState('');
  const [accessCode, setAccessCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<ScanEntry[] | null>(null);
  const [recoveries, setRecoveries] = useState<RecoveryItem[]>([]);
  const [roadmapHit, setRoadmapHit] = useState<RoadmapLookup | null>(null);
  const [savedRoadmapId, setSavedRoadmapId] = useState<string | null>(null);
  const [savedRoadmapAccessCode, setSavedRoadmapAccessCode] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return;
      const parsed = JSON.parse(saved) as { vspiId?: string; accessCode?: string; cacheVersion?: string };
      if (parsed.cacheVersion !== CLIENT_REPORT_CACHE_VERSION) return;
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
    setRecoveries([]);

    try {
      const params = new URLSearchParams({ phone: cleanPhone, t: String(Date.now()) });
      if (cleanAccess) params.set('accessCode', cleanAccess);
      const historyRes = await fetch(`/api/history?${params.toString()}`);

      const historyData = await historyRes.json();
      if (!historyRes.ok) {
        setError(historyData.error || 'Không lấy được lịch sử quét');
        return;
      }

      const recoveryItems = Array.isArray(historyData.recoveries) ? historyData.recoveries as RecoveryItem[] : [];
      setRecoveries(recoveryItems);

      const verifiedRoadmap = recoveryItems.find(item => item.product === 'roadmap79' && item.accessVerified && item.vspiId && item.accessCode);
      if (verifiedRoadmap?.vspiId && verifiedRoadmap.accessCode) {
        setSavedRoadmapId(verifiedRoadmap.vspiId);
        setSavedRoadmapAccessCode(verifiedRoadmap.accessCode);
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          cacheVersion: CLIENT_REPORT_CACHE_VERSION,
          vspiId: verifiedRoadmap.vspiId,
          accessCode: verifiedRoadmap.accessCode,
          phone: cleanPhone,
          job: verifiedRoadmap.jobTitle || '',
          selectedRoleId: verifiedRoadmap.roleId || undefined,
          salary: verifiedRoadmap.currentSalary || 0,
          duration: 6,
          savedAt: Date.now(),
        }));
      }

      if (cleanAccess && !recoveryItems.some(item => item.accessVerified)) {
        setError('Mã truy cập chưa khớp với đơn nào của SĐT này');
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
          <h1 className="mb-1 text-2xl font-black text-[#e8b84b]">Quay lại báo cáo/lộ trình đã mua</h1>
          <p className="text-sm leading-5 text-[#f0ede8]/50">
            Nhập SĐT để tìm báo cáo và lộ trình của bạn. Để mở đầy đủ, bạn cần mã truy cập đã nhận sau khi thanh toán.
          </p>
          <p className="mt-2 text-[11px] leading-5 text-[#f0ede8]/35">
            Mã truy cập chỉ hiện dạng rút gọn trong kết quả tìm kiếm để bảo vệ quyền riêng tư.
          </p>
        </div>

        {savedRoadmapId && savedRoadmapAccessCode && (
          <Link href={getRoadmapRestoreHref(savedRoadmapId, savedRoadmapAccessCode, phone)} className="flex items-center gap-3 rounded-2xl border border-[#e8b84b]/30 bg-[#e8b84b]/10 p-4 transition-all hover:bg-[#e8b84b]/15">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e8b84b] text-sm font-black text-[#0a0c10]">79k</div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-[#e8b84b]">Lộ trình đã lưu trên máy này</p>
              <p className="truncate text-[10px] text-[#f0ede8]/50">
                VSPI: {savedRoadmapId}{savedRoadmapAccessCode ? ` · Mã: ${maskClientAccessCode(savedRoadmapAccessCode)}` : ''}
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
              Chỉ nhập SĐT để xem lịch sử và mã đã che một phần. Nhập đúng mã truy cập để mở báo cáo/lộ trình đã thanh toán.
            </p>
          </div>
        )}

        {history && (
          <div className="space-y-4">
            {roadmapHit && (
              <Link href={getRoadmapRestoreHref(roadmapHit.vspi_id, roadmapHit.accessCode, phone)} className="flex items-center gap-3 rounded-2xl border border-[#e8b84b]/35 bg-[#e8b84b]/10 p-4 transition-all hover:bg-[#e8b84b]/15">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e8b84b] text-sm font-black text-[#0a0c10]">79k</div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-[#e8b84b]">Đã tìm thấy lộ trình 79k</p>
                  <p className="truncate text-[10px] text-[#f0ede8]/50">
                    Mã truy cập: {maskClientAccessCode(roadmapHit.accessCode)} · {roadmapHit.job_title || 'Lộ trình tăng lương'}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-black text-[#e8b84b]">Mở →</span>
              </Link>
            )}

            {recoveries.length > 0 && (
              <section className="space-y-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#e8b84b]">Đơn đã tìm thấy</p>
                  <p className="mt-1 text-[11px] leading-5 text-[#f0ede8]/45">Chọn đúng báo cáo hoặc lộ trình. Mã truy cập được ẩn một phần; nhập đủ mã sau thanh toán để mở nội dung đã mua.</p>
                </div>
                {recoveries.map(item => (
                  <RecoveryCard key={item.id} item={item} phone={phone} />
                ))}
              </section>
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

            {history.length === 0 && recoveries.length === 0 && (
              <div className="rounded-2xl border border-white/10 bg-[#0f1219] p-6 text-center">
                <p className="text-sm font-bold text-[#f0ede8]">Không tìm thấy đơn nào với số này</p>
                <p className="mt-2 text-xs leading-5 text-[#f0ede8]/45">Kiểm tra lại SĐT hoặc nhập mã truy cập nếu bạn có mã trên nội dung chuyển khoản/chứng nhận. Nếu đơn đang chờ xác nhận, giữ nguyên mã VSPI trong nội dung chuyển khoản và liên hệ hỗ trợ.</p>
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
              onClick={() => { setHistory(null); setRecoveries([]); setRoadmapHit(null); setPhone(''); setAccessCode(''); setError(''); }}
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

function RecoveryCard({ item, phone }: { item: RecoveryItem; phone: string }) {
  const isRoadmap = item.product === 'roadmap79';
  const paid = item.status === 'paid' || item.status === 'generated';
  const openHref = item.accessVerified && item.vspiId && item.accessCode
    ? isRoadmap
      ? getRoadmapRestoreHref(item.vspiId, item.accessCode, phone)
      : getReportRestoreHref(item.vspiId, phone)
    : '';
  const actionLabel = !paid
    ? 'Đang chờ thanh toán'
    : !item.accessVerified
      ? 'Nhập mã truy cập'
      : isRoadmap
        ? 'Tiếp tục lộ trình'
        : 'Mở báo cáo';
  const progressText = item.progressDone !== null && item.progressTotal !== null
    ? `${item.progressDone}/${item.progressTotal} việc`
    : null;

  return (
    <article className="rounded-2xl border border-white/10 bg-[#0f1219] p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-[#e8b84b]">{item.productLabel}</p>
          <h2 className="mt-1 break-words text-base font-black leading-snug text-[#f0ede8]">{item.jobTitle || 'Chưa rõ nghề'}</h2>
          {item.targetJobTitle && item.targetJobTitle !== item.jobTitle && (
            <p className="mt-1 text-[11px] leading-5 text-[#f0ede8]/55">Mục tiêu: <strong className="text-[#f0ede8]">{item.targetJobTitle}</strong></p>
          )}
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${paid ? 'bg-green-400/15 text-green-300' : 'bg-orange-400/15 text-orange-300'}`}>
          {paid ? 'paid' : 'pending'}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-[#f0ede8]/55">
        <InfoLine label="Lương hiện tại" value={formatMoney(item.currentSalary)} />
        <InfoLine label="Lương mục tiêu" value={formatMoney(item.targetSalary)} />
        <InfoLine label="Tiến độ" value={progressText || (isRoadmap ? 'Chưa tạo roadmap' : '-')} />
        <InfoLine label="Cập nhật" value={formatDateLabel(item.lastUpdated)} />
      </div>

      <div className="mt-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">
        <p className="text-[9px] font-black uppercase tracking-wider text-white/30">Mã truy cập</p>
        <p className="mt-1 font-mono text-xs font-black text-white/70">{item.maskedAccessCode || 'Chưa có'}</p>
      </div>

      <p className="mt-3 text-[11px] font-bold leading-5 text-[#f0ede8]/70">{item.statusLabel}</p>

      <div className="mt-3 flex flex-wrap gap-2">
        {openHref ? (
          <Link href={openHref} className="rounded-xl bg-[#e8b84b] px-4 py-2 text-xs font-black text-[#0a0c10]">
            {actionLabel}
          </Link>
        ) : (
          <span className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-xs font-black text-white/45">
            {actionLabel}
          </span>
        )}
        {item.certificateEligible && openHref && (
          <Link href={`${openHref}#certificate`} className="rounded-xl border border-[#e8b84b]/30 bg-[#e8b84b]/10 px-4 py-2 text-xs font-black text-[#e8b84b]">
            Tải chứng nhận
          </Link>
        )}
      </div>
    </article>
  );
}

function InfoLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/8 bg-[#161b26] px-3 py-2">
      <p className="text-[9px] font-black uppercase tracking-wider text-white/30">{label}</p>
      <p className="mt-1 truncate font-bold text-white/70">{value}</p>
    </div>
  );
}

function formatMoney(value: number | null): string {
  if (!value) return '-';
  return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
}

function formatDateLabel(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString('vi-VN');
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
