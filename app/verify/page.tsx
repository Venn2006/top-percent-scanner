import { supabaseServer } from '@/lib/supabaseServer';

export const dynamic = 'force-dynamic';

type VerifySearchParams = Promise<{
  id?: string;
  job?: string;
  pct?: string;
  date?: string;
}>;

type PurchaseVerifyRow = {
  vspi_id: string;
  job_title: string | null;
  percent: number | null;
  paid_at: string | null;
  status: string | null;
};

type RoadmapVerifyRow = {
  vspi_id: string;
  phone?: string | null;
  job_title: string | null;
  current_salary: number | null;
  target_salary: number | null;
  duration_months: number | null;
  goal_label: string | null;
  task_progress: Record<string, unknown> | null;
  paid_at: string | null;
  created_at: string | null;
  status: string | null;
};

function formatDate(value?: string | null, fallback?: string) {
  if (fallback) return fallback;
  if (!value) return 'Chưa rõ';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Chưa rõ';
  return date.toLocaleDateString('vi-VN');
}

function formatSalary(value?: number | null) {
  if (!value || value <= 0) return 'Chưa rõ';
  return `${Math.round(value).toLocaleString('vi-VN')}đ/tháng`;
}

function maskPhone(value?: string | null) {
  const clean = String(value || '').replace(/\D/g, '');
  if (clean.length < 7) return 'Đã xác thực';
  return `${clean.slice(0, 3)}***${clean.slice(-3)}`;
}

function roadmapEvidenceSummary(progress?: Record<string, unknown> | null) {
  const data = progress && typeof progress === 'object' ? progress : {};
  const completed = Object.entries(data).filter(([key, value]) => /^w\d{1,2}_t\d{1,2}$/.test(key) && value === true).length;
  const rawEvidence = data._evidence;
  const evidence = rawEvidence && typeof rawEvidence === 'object' && !Array.isArray(rawEvidence)
    ? Object.values(rawEvidence as Record<string, unknown>).filter(Boolean).length
    : 0;
  return { completed, evidence };
}

export default async function VerifyPage({ searchParams }: { searchParams: VerifySearchParams }) {
  const { id, job, pct, date } = await searchParams;
  const cleanId = typeof id === 'string' ? id.trim().toUpperCase() : '';

  const [purchaseResult, roadmapResult] = cleanId
    ? await Promise.all([
        supabaseServer
          .from('purchases')
          .select('vspi_id, job_title, percent, paid_at, status')
          .eq('vspi_id', cleanId)
          .maybeSingle(),
        supabaseServer
          .from('roadmaps')
          .select('vspi_id, phone, job_title, current_salary, target_salary, duration_months, goal_label, task_progress, paid_at, created_at, status')
          .eq('vspi_id', cleanId)
          .maybeSingle(),
      ])
    : [{ data: null }, { data: null }];

  const purchase = (purchaseResult.data || null) as PurchaseVerifyRow | null;
  const roadmap = (roadmapResult.data || null) as RoadmapVerifyRow | null;
  const isPurchaseValid = purchase?.status === 'paid';
  const isRoadmapValid = roadmap?.status === 'paid';
  const isValid = isPurchaseValid || isRoadmapValid;
  const evidenceSummary = roadmapEvidenceSummary(roadmap?.task_progress);
  const productName = isRoadmapValid ? 'Lộ trình tăng lương 79K' : 'Báo cáo lương 29K';

  return (
    <div className="min-h-screen bg-[#F0F2F8] flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl text-center">
        {isValid ? (
          <>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-4xl font-black text-green-600">✓</div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-400">Top Lương Verified · VSPI ID</p>
            <h1 className="mt-2 text-2xl font-black text-green-700">Chứng nhận hợp lệ</h1>
            <p className="mt-1 text-sm font-semibold text-slate-500">{productName}</p>

            <div className="mt-5 bg-green-50 border border-green-200 rounded-2xl p-4 text-left space-y-2">
              <p className="text-sm"><span className="text-slate-500">VSPI ID:</span> <strong className="font-mono">{cleanId}</strong></p>
              <p className="text-sm"><span className="text-slate-500">Ngành/vị trí:</span> <strong>{roadmap?.job_title || purchase?.job_title || job || 'Đã xác thực'}</strong></p>
              {isPurchaseValid && (
                <p className="text-sm"><span className="text-slate-500">Vị trí thị trường:</span> <strong className="text-blue-600">Top {purchase?.percent || pct}%</strong></p>
              )}
              {isRoadmapValid && (
                <>
                  <p className="text-sm"><span className="text-slate-500">Thời lượng:</span> <strong>{roadmap?.duration_months || 6} tháng</strong></p>
                  <p className="text-sm"><span className="text-slate-500">Lương hiện tại:</span> <strong>{formatSalary(roadmap?.current_salary)}</strong></p>
                  <p className="text-sm"><span className="text-slate-500">Mốc mục tiêu:</span> <strong>{formatSalary(roadmap?.target_salary)}</strong></p>
                  <p className="text-sm"><span className="text-slate-500">Bằng chứng đã nộp:</span> <strong>{evidenceSummary.evidence}</strong></p>
                  <p className="text-sm"><span className="text-slate-500">Task đã tick:</span> <strong>{evidenceSummary.completed}</strong></p>
                  <p id="evidence" className="text-xs leading-relaxed text-slate-500">Evidence log được xác thực từ tiến độ lưu trên hệ thống Top Lương. HR có thể đối chiếu VSPI ID này với hồ sơ ứng viên.</p>
                </>
              )}
              <p className="text-sm"><span className="text-slate-500">Cấp ngày:</span> <strong>{formatDate(roadmap?.paid_at || roadmap?.created_at || purchase?.paid_at, date)}</strong></p>
              {isRoadmapValid && <p className="text-sm"><span className="text-slate-500">SĐT:</span> <strong>{maskPhone(roadmap?.phone)}</strong></p>}
            </div>

            <p className="text-[10px] text-slate-400 mt-4">
              Xác thực bởi VSPI Vietnam · Vietnam Salary Percentile Index 2026
            </p>
          </>
        ) : (
          <>
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-4xl font-black text-red-600">×</div>
            <h1 className="text-xl font-black text-red-600 mb-2">Không tìm thấy chứng nhận</h1>
            <p className="text-sm text-slate-500">ID <strong className="font-mono">{cleanId || 'N/A'}</strong> không tồn tại hoặc chưa được xác thực thanh toán.</p>
            <p className="text-[11px] text-slate-400 mt-3">Liên hệ: Zalo 0915 662 876</p>
          </>
        )}
      </div>
    </div>
  );
}
