"use client";

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { playTap } from '@/lib/sound';

function normalizeVspiId(value: string): string {
  const trimmed = value.trim().toUpperCase();
  if (/^VSPI-2026-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(trimmed)) return trimmed;
  const compact = trimmed.replace(/[^A-Z0-9]/g, '');
  const match = compact.match(/^VSPI2026([A-Z0-9]{4})([A-Z0-9]{4})$/);
  return match ? `VSPI-2026-${match[1]}-${match[2]}` : trimmed;
}

export default function AdminQuickConfirmForm() {
  const router = useRouter();
  const [vspiId, setVspiId] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = normalizeVspiId(vspiId);
    if (!normalized) return;
    playTap();
    const ok = window.confirm(`Mở khóa thủ công cho ${normalized}? Chỉ bấm khi đã kiểm tra giao dịch.`);
    if (!ok) return;

    setStatus('loading');
    setMessage('');
    try {
      const res = await fetch('/api/admin/manual-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vspiId: normalized }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setStatus('done');
      setMessage(data.message || `Đã mở khóa ${data.table || 'đơn'} ${data.vspiId || normalized}`);
      setVspiId('');
      router.refresh();
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Không mở khóa được');
    }
  }

  return (
    <form onSubmit={submit} className="rounded-3xl border border-[#e8b84b]/25 bg-[#111722] p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0 flex-1">
          <p className="text-lg font-black text-white">Mở khóa nhanh bằng mã chuyển khoản</p>
          <p className="mt-1 text-xs leading-5 text-white/45">
            Dán mã trên màn hình khách, ví dụ <span className="font-mono text-[#e8b84b]">VSPI2026ABCD1234</span> hoặc dạng có gạch ngang.
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto">
          <input
            value={vspiId}
            onChange={event => setVspiId(event.target.value)}
            placeholder="VSPI2026..."
            className="min-w-0 rounded-2xl border border-white/10 bg-[#0a0c10] px-4 py-3 font-mono text-sm text-white outline-none focus:border-[#e8b84b] sm:w-72"
          />
          <button
            type="submit"
            disabled={status === 'loading' || !vspiId.trim()}
            className="rounded-2xl bg-[#e8b84b] px-4 py-3 text-sm font-black text-[#0a0c10] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {status === 'loading' ? 'Đang mở...' : 'Mở khóa'}
          </button>
        </div>
      </div>
      {message && (
        <p className={`mt-3 text-xs font-bold ${status === 'error' ? 'text-red-300' : 'text-green-300'}`}>
          {message}
        </p>
      )}
    </form>
  );
}
