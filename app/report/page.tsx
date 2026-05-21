"use client";

import { useState } from 'react';

/**
 * Trang /report — User nhập VSPI ID + SĐT để xem lại báo cáo Premium đã mua.
 * Không cần login, chỉ cần đúng ID + SĐT trùng với record paid trong DB.
 */
export default function ReportPage() {
  const [vspiId, setVspiId] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);

  const handleLookup = async () => {
    if (!vspiId.trim()) { setError('Nhập mã VSPI ID (trên chứng nhận của bạn)'); return; }
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/report-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vspiId: vspiId.trim().toUpperCase(), phone: phone.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setError(data.error || 'Không tìm thấy báo cáo');
        setResult(null);
      } else {
        setResult(data);
      }
    } catch {
      setError('Lỗi kết nối');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0c10] flex items-center justify-center p-4 font-sans text-[#f0ede8]">
      <div className="max-w-sm w-full space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-black text-[#e8b84b] mb-2">Xem lại Báo cáo Premium</h1>
          <p className="text-sm text-[#f0ede8]/50">Nhập mã VSPI ID để truy cập lại báo cáo đã mua</p>
        </div>

        <div className="bg-[#0f1219] border border-white/10 rounded-2xl p-6 space-y-4">
          <div>
            <label className="text-[10px] font-mono font-bold text-[#f0ede8]/60 uppercase tracking-widest block mb-1.5">
              Mã VSPI ID
            </label>
            <input
              type="text"
              placeholder="VD: VSPI-2026-XXXX-XXXX"
              className="w-full bg-[#161b26] border border-white/10 rounded-xl px-4 py-3 text-sm text-[#f0ede8] uppercase font-mono tracking-wider outline-none focus:border-[#e8b84b] placeholder:text-[#f0ede8]/20"
              value={vspiId}
              onChange={e => setVspiId(e.target.value)}
            />
          </div>

          <div>
            <label className="text-[10px] font-mono font-bold text-[#f0ede8]/60 uppercase tracking-widest block mb-1.5">
              SĐT đã đăng ký (xác thực)
            </label>
            <input
              type="tel"
              placeholder="0901234567"
              className="w-full bg-[#161b26] border border-white/10 rounded-xl px-4 py-3 text-sm text-[#f0ede8] outline-none focus:border-[#e8b84b] placeholder:text-[#f0ede8]/20"
              value={phone}
              onChange={e => setPhone(e.target.value)}
            />
          </div>

          {error && (
            <p className="text-[11px] text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2">{error}</p>
          )}

          <button
            onClick={handleLookup}
            disabled={loading}
            className="w-full bg-[#e8b84b] text-[#0a0c10] font-black py-3.5 rounded-xl text-sm disabled:opacity-50"
          >
            {loading ? 'Đang tìm...' : 'Tìm báo cáo của tôi'}
          </button>
        </div>

        {result && (
          <div className="bg-[#0f1219] border border-green-500/30 rounded-2xl p-6 space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-green-400">✅</span>
              <p className="text-sm font-bold text-[#f0ede8]">Đã tìm thấy báo cáo</p>
            </div>
            <div className="space-y-2 text-[11px] text-[#f0ede8]/70">
              <p>Nghề: <strong className="text-[#f0ede8]">{result.job_title}</strong></p>
              <p>Vị trí: <strong className="text-[#e8b84b]">Top {result.percent}%</strong></p>
              <p>Mã: <strong className="text-[#e8b84b] font-mono">{result.vspi_id}</strong></p>
              <p>Ngày mua: <strong className="text-[#f0ede8]">{new Date(result.paid_at).toLocaleDateString('vi-VN')}</strong></p>
            </div>
            <p className="text-[10px] text-[#f0ede8]/40 border-t border-white/10 pt-3">
              💡 Để xem lại báo cáo đầy đủ, quay lại trang chủ → nhập lại nghề + lương → sau khi quét, hệ thống sẽ tự nhận diện bạn đã mua và mở khóa ngay.
            </p>
          </div>
        )}

        <p className="text-center text-[10px] text-[#f0ede8]/30">
          Mã VSPI ID nằm trên chứng nhận hoặc trong tin nhắn Zalo sau khi mua.
        </p>
      </div>
    </div>
  );
}
