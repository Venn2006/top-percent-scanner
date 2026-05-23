"use client";

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function AdminManualConfirmButton({
  vspiId,
  adminKey,
  disabled = false,
}: {
  vspiId: string;
  adminKey: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function confirmUnlock() {
    if (!vspiId || disabled) return;
    const ok = window.confirm(`Mở khóa thủ công cho ${vspiId}? Chỉ bấm khi đã kiểm tra giao dịch.`);
    if (!ok) return;

    setStatus('loading');
    setMessage('');

    try {
      const res = await fetch('/api/admin/manual-confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vspiId, adminKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      setStatus('done');
      setMessage(data.message || `Đã mở khóa ${data.table || 'đơn'}`);
      router.refresh();
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Không confirm được');
    }
  }

  return (
    <div className="flex min-w-[150px] flex-col gap-1">
      <button
        type="button"
        onClick={confirmUnlock}
        disabled={disabled || status === 'loading'}
        className="rounded-xl border border-[#e8b84b]/30 bg-[#e8b84b]/10 px-3 py-2 text-xs font-black text-[#e8b84b] transition hover:bg-[#e8b84b] hover:text-[#0a0c10] disabled:cursor-not-allowed disabled:opacity-45"
      >
        {status === 'loading' ? 'Đang mở...' : 'Confirm unlock'}
      </button>
      {message && (
        <p className={`text-[10px] leading-4 ${status === 'error' ? 'text-red-300' : 'text-green-300'}`}>
          {message}
        </p>
      )}
    </div>
  );
}
