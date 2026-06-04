"use client";

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { playTap } from '@/lib/sound';

type DeleteMode = 'row' | 'phone' | 'vspi';
type SourceTable = 'purchases' | 'roadmaps' | 'scan_history' | 'zalo_subscribers';
type DeleteProduct = 'report29' | 'roadmap79' | 'all';

interface CleanupResult {
  table: string;
  column: string;
  deleted: number;
  skipped?: boolean;
  reason?: string;
}

interface CleanupPreview {
  mode: DeleteMode;
  deleted: number;
  results: CleanupResult[];
}

const CONFIRM_TEXT: Record<DeleteMode, string> = {
  row: 'Bạn chắc chắn muốn xóa dòng test này? Hành động này sẽ xóa record liên quan tới VSPI/access code này nếu có.',
  phone: 'Bạn chắc chắn muốn xóa tất cả dữ liệu test theo SĐT này? Chỉ dùng cho dữ liệu bạn tự test.',
  vspi: 'Bạn chắc chắn muốn xóa toàn bộ dữ liệu liên quan VSPI này?',
};

export default function AdminDeleteCustomerButton({
  rowId,
  sourceTable,
  vspiId,
  phone,
  product,
}: {
  rowId: string | null;
  sourceTable: SourceTable;
  vspiId: string;
  phone: string | null;
  product: DeleteProduct;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [preview, setPreview] = useState<CleanupPreview | null>(null);
  const cleanPhone = phone?.replace(/\D/g, '') || '';

  function buildPayload(mode: DeleteMode, dryRun: boolean) {
    return {
      mode,
      dryRun,
      id: rowId || undefined,
      sourceTable,
      vspiId: vspiId || undefined,
      phone: cleanPhone || undefined,
      product,
    };
  }

  async function requestCleanup(mode: DeleteMode, dryRun: boolean) {
    if (mode === 'row' && !rowId) return;
    if (mode === 'phone' && !cleanPhone) return;
    if (mode === 'vspi' && !vspiId) return;
    playTap();

    if (!dryRun) {
      if (!preview || preview.mode !== mode) {
        setStatus('error');
        setMessage('Chạy dry-run trước khi xóa để xem chính xác bảng/dòng sẽ bị ảnh hưởng.');
        return;
      }
      if (!window.confirm(`${CONFIRM_TEXT[mode]} Dry-run vừa thấy ${preview.deleted} dòng liên quan.`)) return;
    }

    setStatus('loading');
    setMessage('');

    try {
      const res = await fetch('/api/admin/delete-customer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload(mode, dryRun)),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);

      setStatus('done');
      if (dryRun) {
        const results = Array.isArray(data.results) ? data.results as CleanupResult[] : [];
        setPreview({ mode, deleted: Number(data.deleted) || 0, results });
        setMessage(`Dry-run: ${Number(data.deleted) || 0} dòng liên quan. Kiểm tra bảng bên dưới trước khi xóa.`);
      } else {
        setPreview(null);
        setMessage(data.message || 'Đã xóa dữ liệu test.');
        router.refresh();
      }
    } catch {
      setStatus('error');
      setMessage('Không xóa được dữ liệu. Vui lòng thử lại hoặc kiểm tra quyền admin.');
    }
  }

  return (
    <div className="flex w-full flex-col gap-1.5 rounded-2xl border border-red-400/15 bg-red-400/5 p-2 sm:w-fit sm:min-w-[190px]">
      <p className="text-[9px] font-black uppercase tracking-wider text-red-200/80">Dọn test</p>
      <div className="grid grid-cols-3 gap-1">
        {rowId && (
          <button
            type="button"
            onClick={() => requestCleanup('row', true)}
            disabled={status === 'loading'}
            className="rounded-xl border border-red-400/25 bg-red-400/10 px-2 py-2 text-[10px] font-black text-red-300 transition hover:bg-red-400 hover:text-[#0a0c10] disabled:cursor-not-allowed disabled:opacity-45"
          >
            Dry-run dòng
          </button>
        )}
        {cleanPhone && (
          <button
            type="button"
            onClick={() => requestCleanup('phone', true)}
            disabled={status === 'loading'}
            className="rounded-xl border border-orange-400/25 bg-orange-400/10 px-2 py-2 text-[10px] font-black text-orange-300 transition hover:bg-orange-400 hover:text-[#0a0c10] disabled:cursor-not-allowed disabled:opacity-45"
          >
            Dry-run SĐT
          </button>
        )}
        {vspiId && (
          <button
            type="button"
            onClick={() => requestCleanup('vspi', true)}
            disabled={status === 'loading'}
            className="rounded-xl border border-[#e8b84b]/25 bg-[#e8b84b]/10 px-2 py-2 text-[10px] font-black text-[#e8b84b] transition hover:bg-[#e8b84b] hover:text-[#0a0c10] disabled:cursor-not-allowed disabled:opacity-45"
          >
            Dry-run VSPI
          </button>
        )}
      </div>
      {preview && (
        <div className="rounded-xl border border-red-400/20 bg-[#0a0c10] p-2">
          <p className="text-[10px] font-black text-red-200">Dry-run {preview.mode}: {preview.deleted} dòng</p>
          <div className="mt-1 max-h-28 space-y-1 overflow-auto pr-1">
            {preview.results.map((item, index) => (
              <p key={`${item.table}-${item.column}-${index}`} className="font-mono text-[9px] leading-3 text-white/45">
                {item.table}.{item.column}: {item.deleted}{item.skipped ? ` (${item.reason || 'skipped'})` : ''}
              </p>
            ))}
          </div>
          <button
            type="button"
            onClick={() => requestCleanup(preview.mode, false)}
            disabled={status === 'loading'}
            className="mt-2 w-full rounded-lg border border-red-400/35 bg-red-400/15 px-2 py-2 text-[10px] font-black text-red-200 transition hover:bg-red-400 hover:text-[#0a0c10] disabled:cursor-not-allowed disabled:opacity-45"
          >
            Xóa {preview.mode === 'phone' ? 'SĐT' : preview.mode === 'vspi' ? 'VSPI' : 'dòng'} sau dry-run
          </button>
        </div>
      )}
      {message && (
        <p className={`text-[10px] leading-4 ${status === 'error' ? 'text-red-300' : 'text-green-300'}`}>
          {message}
        </p>
      )}
    </div>
  );
}
