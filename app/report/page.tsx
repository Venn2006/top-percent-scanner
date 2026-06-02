"use client";

import { useState } from 'react';

interface RestoredReport {
  vspi_id: string;
  job_title: string;
  percent: number;
  paid_at: string;
  salary: number | null;
  experience: 'junior' | 'mid' | 'senior';
  dbData: {
    top_50: number;
    top_20: number | null;
    top_10: number | null;
    top_5: number | null;
    top_1?: number | null;
  } | null;
  benchmark: {
    matchedJobTitle?: string;
    confidenceScore?: number;
    sourceType?: string;
  } | null;
}

export default function ReportPage() {
  const [vspiId, setVspiId] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<RestoredReport | null>(null);

  const handleLookup = async () => {
    if (!vspiId.trim()) {
      setError('Nhập mã VSPI ID trên chứng nhận của bạn');
      return;
    }

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
        setResult(data as RestoredReport);
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
          <h1 className="text-2xl font-black text-[#e8b84b] mb-2">Xem lại báo cáo Premium</h1>
          <p className="text-sm text-[#f0ede8]/50">Nhập VSPI ID để truy cập lại báo cáo đã mua</p>
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
              SĐT đã đăng ký
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
              <span className="text-green-400">✓</span>
              <p className="text-sm font-bold text-[#f0ede8]">Đã tìm thấy báo cáo</p>
            </div>
            <div className="space-y-2 text-[11px] text-[#f0ede8]/70">
              <p>Nghề: <strong className="text-[#f0ede8]">{result.job_title}</strong></p>
              {result.benchmark?.matchedJobTitle && result.benchmark.matchedJobTitle !== result.job_title && (
                <p>Benchmark: <strong className="text-[#f0ede8]">{result.benchmark.matchedJobTitle}</strong></p>
              )}
              <p>Vị trí: <strong className="text-[#e8b84b]">Top {result.percent}%</strong></p>
              {result.salary && <p>Lương: <strong className="text-[#f0ede8]">{result.salary.toLocaleString('vi-VN')}đ/tháng</strong></p>}
              {result.dbData?.top_10 && <p>Mốc Top 10%: <strong className="text-[#e8b84b]">{result.dbData.top_10.toLocaleString('vi-VN')}đ/tháng</strong></p>}
              {result.dbData?.top_1 && <p>Mốc Top 1%: <strong className="text-[#e8b84b]">{result.dbData.top_1.toLocaleString('vi-VN')}đ/tháng</strong></p>}
              <p>Mã: <strong className="text-[#e8b84b] font-mono">{result.vspi_id}</strong></p>
              <p>Ngày mua: <strong className="text-[#f0ede8]">{new Date(result.paid_at).toLocaleDateString('vi-VN')}</strong></p>
            </div>
            <p className="text-[10px] text-[#f0ede8]/40 border-t border-white/10 pt-3">
              {result.dbData
                ? 'Báo cáo lương 29K đã được khôi phục từ dữ liệu thanh toán. Hãy lưu lại VSPI ID này để xem lại khi cần.'
                : 'Bản mua cũ chưa lưu lương. Để xem lại đầy đủ, quay lại trang chủ và quét lại với đúng nghề + lương đã mua.'}
            </p>
          </div>
        )}

        <p className="text-center text-[10px] text-[#f0ede8]/30">
          VSPI ID nằm trên chứng nhận hoặc nội dung chuyển khoản.
        </p>
      </div>
    </div>
  );
}
