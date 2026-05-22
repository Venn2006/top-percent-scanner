"use client";

import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';

export default function DeleteDataPage() {
  const formStartedAt = useRef(Date.now());
  const [phone, setPhone] = useState('');
  const [vspiId, setVspiId] = useState('');
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [website, setWebsite] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    setMessage('');
    setLoading(true);
    try {
      const res = await fetch('/api/privacy/delete-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          vspiId,
          email,
          note,
          website,
          formStartedAt: formStartedAt.current,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Không gửi được yêu cầu');
        return;
      }
      setMessage('Đã nhận yêu cầu. VSPI sẽ xử lý trong 7 ngày làm việc và liên hệ nếu cần xác minh thêm.');
      setPhone('');
      setVspiId('');
      setEmail('');
      setNote('');
    } catch {
      setError('Lỗi kết nối');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-[#0a0c10] px-4 py-12 text-[#f0ede8]">
      <div className="mx-auto max-w-md space-y-6">
        <Link href="/privacy" className="text-[11px] font-mono text-[#f0ede8]/45 hover:text-[#e8b84b]">
          ← Quay về chính sách bảo mật
        </Link>

        <div>
          <p className="font-mono text-[11px] font-black uppercase tracking-[0.24em] text-[#e8b84b]">Privacy request</p>
          <h1 className="mt-2 text-3xl font-black text-white">Yêu cầu xóa dữ liệu</h1>
          <p className="mt-2 text-sm leading-6 text-white/55">
            Nhập SĐT, VSPI ID hoặc email từng dùng khi quét/mua báo cáo. Chúng tôi dùng thông tin này để tìm đúng bản ghi cần xóa.
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-[#111722] p-5 space-y-4">
          <input
            className="hidden"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={e => setWebsite(e.target.value)}
            aria-hidden="true"
          />

          <Field label="SĐT / Zalo">
            <input
              type="tel"
              placeholder="0901234567"
              className="w-full rounded-2xl border border-white/10 bg-[#0a0c10] px-4 py-3 text-sm outline-none focus:border-[#e8b84b]"
              value={phone}
              onChange={e => setPhone(e.target.value)}
            />
          </Field>

          <Field label="VSPI ID">
            <input
              type="text"
              placeholder="VSPI-2026-XXXX-XXXX"
              className="w-full rounded-2xl border border-white/10 bg-[#0a0c10] px-4 py-3 font-mono text-sm uppercase outline-none focus:border-[#e8b84b]"
              value={vspiId}
              onChange={e => setVspiId(e.target.value)}
            />
          </Field>

          <Field label="Email">
            <input
              type="email"
              placeholder="you@example.com"
              className="w-full rounded-2xl border border-white/10 bg-[#0a0c10] px-4 py-3 text-sm outline-none focus:border-[#e8b84b]"
              value={email}
              onChange={e => setEmail(e.target.value)}
            />
          </Field>

          <Field label="Ghi chú">
            <textarea
              placeholder="Ví dụ: xóa toàn bộ lịch sử scan và purchase liên quan tới SĐT này"
              className="min-h-24 w-full rounded-2xl border border-white/10 bg-[#0a0c10] px-4 py-3 text-sm outline-none focus:border-[#e8b84b]"
              value={note}
              onChange={e => setNote(e.target.value)}
            />
          </Field>

          {error && <p className="rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-3 text-xs text-red-200">{error}</p>}
          {message && <p className="rounded-2xl border border-green-400/20 bg-green-400/10 px-4 py-3 text-xs text-green-200">{message}</p>}

          <button
            onClick={submit}
            disabled={loading}
            className="w-full rounded-2xl bg-[#e8b84b] px-4 py-3 font-black text-[#0a0c10] transition hover:-translate-y-0.5 disabled:opacity-60"
          >
            {loading ? 'Đang gửi...' : 'Gửi yêu cầu xóa dữ liệu'}
          </button>
        </div>
      </div>
    </main>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block font-mono text-[10px] font-bold uppercase tracking-widest text-white/50">{label}</span>
      {children}
    </label>
  );
}
