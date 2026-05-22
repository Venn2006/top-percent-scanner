import { supabaseServer } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type VerifySearchParams = Promise<{
  id?: string;
  job?: string;
  pct?: string;
  date?: string;
}>;

export default async function VerifyPage({ searchParams }: { searchParams: VerifySearchParams }) {
  const { id, job, pct, date } = await searchParams;
  const cleanId = typeof id === 'string' ? id.trim().toUpperCase() : '';

  const { data } = cleanId
    ? await supabaseServer
        .from('purchases')
        .select('vspi_id, job_title, percent, paid_at, status')
        .eq('vspi_id', cleanId)
        .maybeSingle()
    : { data: null };

  const isValid = data?.status === 'paid';

  return (
    <div className="min-h-screen bg-[#F0F2F8] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center">
        {isValid ? (
          <>
            <div className="text-5xl mb-4">✓</div>
            <h1 className="text-xl font-black text-green-600 mb-2">Chứng nhận hợp lệ</h1>
            <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-left space-y-2">
              <p className="text-sm"><span className="text-slate-500">VSPI ID:</span> <strong className="font-mono">{data.vspi_id}</strong></p>
              <p className="text-sm"><span className="text-slate-500">Ngành:</span> <strong>{data.job_title || job}</strong></p>
              <p className="text-sm"><span className="text-slate-500">Vị trí:</span> <strong className="text-blue-600">Top {data.percent || pct}%</strong></p>
              <p className="text-sm"><span className="text-slate-500">Cấp ngày:</span> <strong>{date || new Date(data.paid_at).toLocaleDateString('vi-VN')}</strong></p>
            </div>
            <p className="text-[10px] text-slate-400 mt-4">
              Xác thực bởi VSPI Vietnam · Vietnam Salary Percentile Index 2026
            </p>
          </>
        ) : (
          <>
            <div className="text-5xl mb-4">×</div>
            <h1 className="text-xl font-black text-red-600 mb-2">Không tìm thấy chứng nhận</h1>
            <p className="text-sm text-slate-500">ID <strong className="font-mono">{cleanId || 'N/A'}</strong> không tồn tại hoặc chưa được xác thực.</p>
            <p className="text-[11px] text-slate-400 mt-3">Liên hệ: Zalo 0915 662 876</p>
          </>
        )}
      </div>
    </div>
  );
}
