"use client";

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { playTap } from '@/lib/sound';

type DeleteMode = 'record' | 'phone';

export default function AdminDeleteCustomerButton({
  vspiId,
  phone,
  product,
}: {
  vspiId: string;
  phone: string | null;
  product: 'premium' | 'roadmap';
}) {
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function deleteCustomer(mode: DeleteMode) {
    if (!vspiId && !phone) return;
    playTap();

    const target =
      mode === 'phone'
        ? `toàn bộ dữ liệu theo SĐT ${phone || '(không có SĐT)'}`
        : `dòng ${product === 'roadmap' ? '79k' : '29k'} ${vspiId}`;
    const ok = window.confirm(`Xóa ${target}? Hành động này dùng để dọn data test và không hoàn tác trên dashboard.`);
    if (!ok) return;

    setStatus('loading');
    setMessage('');

    try {
      const res = await fetch('/api/admin/delete-customer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vspiId, phone, product, mode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      setStatus('done');
      setMessage(data.message || 'Đã xóa');
      router.refresh();
    } catch (err) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Không xóa được');
    }
  }

  return (
    <div className="flex min-w-[150px] flex-col gap-1">
      <div className="grid grid-cols-2 gap-1">
        <button
          type="button"
          onClick={() => deleteCustomer('record')}
          disabled={status === 'loading' || !vspiId}
          className="rounded-xl border border-red-400/25 bg-red-400/10 px-2 py-2 text-[10px] font-black text-red-300 transition hover:bg-red-400 hover:text-[#0a0c10] disabled:cursor-not-allowed disabled:opacity-45"
        >
          Xóa dòng
        </button>
        <button
          type="button"
          onClick={() => deleteCustomer('phone')}
          disabled={status === 'loading' || !phone}
          className="rounded-xl border border-orange-400/25 bg-orange-400/10 px-2 py-2 text-[10px] font-black text-orange-300 transition hover:bg-orange-400 hover:text-[#0a0c10] disabled:cursor-not-allowed disabled:opacity-45"
        >
          Xóa SĐT
        </button>
      </div>
      {message && (
        <p className={`text-[10px] leading-4 ${status === 'error' ? 'text-red-300' : 'text-green-300'}`}>
          {message}
        </p>
      )}
    </div>
  );
}
