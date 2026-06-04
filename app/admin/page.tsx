import {
  getAdminDashboardData,
  ADMIN_DASHBOARD_COOKIE,
  getAdminSecretConfigured,
  isAdminDashboardAuthorized,
  type AdminCustomer,
  type AdminCustomJobSuggestion,
  type AdminDeletionRequest,
  type AdminInsight,
  type AdminPaymentEvent,
} from '@/lib/adminDashboard';
import { cookies } from 'next/headers';
import AdminManualConfirmButton from './AdminManualConfirmButton';
import AdminDeleteCustomerButton from './AdminDeleteCustomerButton';
import AdminQuickConfirmForm from './AdminQuickConfirmForm';

export const dynamic = 'force-dynamic';
export const metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default async function AdminPage() {
  const cookieStore = await cookies();
  const key = cookieStore.get(ADMIN_DASHBOARD_COOKIE)?.value;

  if (!isAdminDashboardAuthorized(key)) {
    return <LockedAdmin configured={getAdminSecretConfigured()} />;
  }

  const data = await getAdminDashboardData();

  return (
    <main className="min-h-screen bg-[#0a0c10] text-[#f0ede8]">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-8">
        <header className="flex flex-col gap-3 border-b border-white/10 pb-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="font-mono text-[11px] font-black uppercase tracking-[0.26em] text-[#e8b84b]">
              VSPI Owner Dashboard
            </p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-white md:text-5xl">
              Điều khiển user & doanh thu
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
              Theo dõi user tổng, active, inactive, paid, chưa paid và danh sách khách hàng để chăm sóc lại.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-right">
            <p className="text-[10px] font-bold uppercase tracking-widest text-white/35">Cập nhật</p>
            <p className="mt-1 font-mono text-xs text-[#e8b84b]">{formatDateTime(data.generatedAt)}</p>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {data.metrics.map(metric => (
            <div key={metric.label} className="rounded-2xl border border-white/10 bg-[#111722] p-4">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">{metric.label}</p>
              <p className="mt-3 text-3xl font-black text-white">{metric.displayValue || metric.value.toLocaleString('vi-VN')}</p>
              <p className="mt-2 min-h-8 text-[11px] leading-4 text-white/45">{metric.hint}</p>
            </div>
          ))}
          <InsightPanel title="Nguồn traffic" subtitle="UTM/referrer từ scan, đơn 29k và đơn 79k" rows={data.trafficInsights} />
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <InsightPanel title="Tỉnh/thành có nhu cầu" subtitle="Để biết vùng nào nên chạy ads hoặc chăm lại" rows={data.provinceInsights} />
          <InsightPanel title="Nghề đang được scan" subtitle="Dùng để làm content, SEO và gói benchmark B2B" rows={data.jobInsights} />
        </section>

        <PaymentEventPanel rows={data.paymentEvents} />

        <AdminQuickConfirmForm />

        <CustomJobSuggestionPanel rows={data.customJobSuggestions} />

        <DeletionRequestPanel rows={data.deletionRequests} />

        <section className="rounded-3xl border border-white/10 bg-[#111722]">
          <div className="flex flex-col gap-2 border-b border-white/10 px-5 py-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-black text-white">Khách hàng cần chăm sóc</h2>
              <p className="text-xs text-white/45">Ưu tiên gọi/Zalo người đã để SĐT, nghề rõ, trạng thái pending hoặc mới scan.</p>
            </div>
            <p className="rounded-full border border-[#e8b84b]/25 bg-[#e8b84b]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-[#e8b84b]">
              không public
            </p>
          </div>
          <div className="space-y-3 px-4 py-4">
            {data.customers.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-8 text-center text-sm text-white/45">
                Chưa có purchase nào. Khi user bấm mở khóa, dữ liệu sẽ hiện ở đây.
              </div>
            ) : (
              data.customers.map(customer => (
                <CustomerRow
                  key={`${customer.packageLabel}-${customer.product}-${customer.vspiId || customer.phone || customer.createdAt}`}
                  customer={customer}
                />
              ))
            )}
          </div>
          <div className="border-t border-white/10 px-5 py-3">
            <p className="text-[11px] leading-5 text-white/40">
              Ghi chú: chỉ dùng SĐT để gửi báo cáo, hỗ trợ thanh toán và chăm sóc người đã để lại thông tin. Không bán raw data cá nhân cho bên thứ ba.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

function LockedAdmin({ configured }: { configured: boolean }) {
  return (
    <main className="grid min-h-screen place-items-center bg-[#0a0c10] px-5 text-[#f0ede8]">
      <form method="post" action="/admin/login" className="w-full max-w-md rounded-3xl border border-white/10 bg-[#111722] p-6 shadow-2xl">
        <p className="font-mono text-[11px] font-black uppercase tracking-[0.26em] text-[#e8b84b]">Owner only</p>
        <h1 className="mt-3 text-2xl font-black text-white">Nhập admin key</h1>
        <p className="mt-2 text-sm leading-6 text-white/50">
          Dashboard này có SĐT và dữ liệu khách hàng nên phải khóa riêng. Dùng biến môi trường <code className="text-[#e8b84b]">ADMIN_DASHBOARD_KEY</code>.
        </p>
        {!configured && (
          <p className="mt-3 rounded-2xl border border-orange-400/20 bg-orange-400/10 px-3 py-2 text-xs text-orange-200">
            Local dev chưa set key: có thể tạm mở bằng key <code>dev</code>. Lên production phải set key thật.
          </p>
        )}
        <input
          name="key"
          type="password"
          placeholder="Admin key"
          className="mt-5 w-full rounded-2xl border border-white/10 bg-[#0a0c10] px-4 py-3 text-sm text-white outline-none focus:border-[#e8b84b]"
        />
        <button className="mt-3 w-full rounded-2xl bg-[#e8b84b] px-4 py-3 font-black text-[#0a0c10] transition hover:-translate-y-0.5">
          Mở dashboard
        </button>
      </form>
    </main>
  );
}

function PaymentEventPanel({ rows }: { rows: AdminPaymentEvent[] }) {
  const needsAttention = rows.filter(row => ['amount_too_low', 'no_match', 'error', 'unauthorized'].includes(row.status)).length;
  return (
    <section className="rounded-3xl border border-white/10 bg-[#111722]">
      <div className="flex flex-col gap-2 border-b border-white/10 px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-black text-white">Cảnh báo thanh toán</h2>
          <p className="text-xs text-white/45">Webhook không khớp đơn, chuyển thiếu tiền, hoặc lỗi cần xác nhận bằng tay.</p>
        </div>
        <p className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${
          needsAttention ? 'border border-red-400/30 bg-red-400/10 text-red-300' : 'border border-green-400/25 bg-green-400/10 text-green-300'
        }`}>
          {needsAttention ? `${needsAttention} cần xem` : 'sạch'}
        </p>
      </div>
      <div className="divide-y divide-white/8">
        {rows.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-white/40">Chưa có event webhook hoặc chưa chạy migration payment_events.</p>
        ) : rows.slice(0, 12).map(row => (
          <div key={row.id || `${row.createdAt}-${row.vspiId}`} className="grid gap-2 px-5 py-3 text-sm md:grid-cols-[110px_90px_1fr_120px] md:items-center">
            <span className={`w-fit rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${
              row.status === 'matched' ? 'bg-green-400/15 text-green-300' : row.status === 'ignored' ? 'bg-white/8 text-white/45' : 'bg-red-400/15 text-red-300'
            }`}>
              {row.status}
            </span>
            <span className="font-mono text-xs text-[#e8b84b]">{row.product || '-'}</span>
            <div className="min-w-0">
              <p className="truncate font-mono text-xs text-white/70">{row.vspiId || row.paymentRef || 'no ref'}</p>
              <p className="truncate text-[11px] text-white/35">{row.message || '-'}</p>
            </div>
            <div className="text-left md:text-right">
              <p className="font-mono text-xs text-white/60">{row.amount ? formatVnd(row.amount) : '-'}</p>
              <p className="font-mono text-[10px] text-white/30">{formatDateTimeSafe(row.createdAt)}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function CustomJobSuggestionPanel({ rows }: { rows: AdminCustomJobSuggestion[] }) {
  const pending = rows.filter(row => row.status === 'pending').length;
  return (
    <section className="rounded-3xl border border-white/10 bg-[#111722]">
      <div className="flex flex-col gap-2 border-b border-white/10 px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-black text-white">Job nhập tay chờ duyệt</h2>
          <p className="text-xs text-white/45">User vẫn được scan. Chỉ owner mới quyết định job nào được thêm vào benchmark chuẩn.</p>
        </div>
        <p className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${
          pending ? 'border border-[#e8b84b]/30 bg-[#e8b84b]/10 text-[#e8b84b]' : 'border border-green-400/25 bg-green-400/10 text-green-300'
        }`}>
          {pending ? `${pending} pending` : 'đã xử lý'}
        </p>
      </div>
      <div className="divide-y divide-white/8">
        {rows.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-white/40">Chưa có job nhập tay hoặc chưa chạy migration custom_job_suggestions.</p>
        ) : rows.slice(0, 20).map(row => (
          <div key={row.id || `${row.jobTitle}-${row.createdAt}`} className="grid gap-2 px-5 py-3 text-sm md:grid-cols-[110px_1fr_120px_110px_120px] md:items-center">
            <span className={`w-fit rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${
              row.status === 'approved' ? 'bg-green-400/15 text-green-300' :
              row.status === 'rejected' ? 'bg-red-400/15 text-red-300' :
              'bg-[#e8b84b]/15 text-[#e8b84b]'
            }`}>
              {row.status}
            </span>
            <div className="min-w-0">
              <p className="truncate font-bold text-white">{row.jobTitle || 'Chưa rõ'}</p>
              <p className="truncate text-[11px] text-white/35">{row.matchType || 'custom_input'} · {row.experience || 'no level'} · {row.workProvinceLabel}</p>
              {row.note && <p className="truncate text-[10px] text-[#e8b84b]/70">{formatCustomJobNote(row.note)}</p>}
            </div>
            <p className="font-mono text-xs text-white/60">{row.salary ? formatVnd(row.salary) : '-'}</p>
            <p className="font-mono text-xs text-[#e8b84b]">{row.percent ? `Top ${row.percent}%` : '-'}</p>
            <p className="font-mono text-[10px] text-white/30 md:text-right">{formatDateTimeSafe(row.createdAt)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function formatCustomJobNote(note: string) {
  try {
    const parsed = JSON.parse(note) as { industry?: string; top_50?: number; top_20?: number; top_10?: number; top_5?: number; skills?: string[] };
    const bands = [parsed.top_50, parsed.top_20, parsed.top_10, parsed.top_5]
      .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
      .map(value => `${Math.round(value / 1_000_000)}m`)
      .join('/');
    const skills = Array.isArray(parsed.skills) ? parsed.skills.slice(0, 2).join(', ') : '';
    return [parsed.industry, bands && `band ${bands}`, skills].filter(Boolean).join(' · ');
  } catch {
    return note;
  }
}

function DeletionRequestPanel({ rows }: { rows: AdminDeletionRequest[] }) {
  const pending = rows.filter(row => row.status === 'pending').length;
  return (
    <section className="rounded-3xl border border-white/10 bg-[#111722]">
      <div className="flex flex-col gap-2 border-b border-white/10 px-5 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-lg font-black text-white">Yêu cầu xóa dữ liệu</h2>
          <p className="text-xs text-white/45">Danh sách cần xác minh và xử lý trong 7 ngày làm việc.</p>
        </div>
        <p className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${
          pending ? 'border border-orange-400/30 bg-orange-400/10 text-orange-300' : 'border border-green-400/25 bg-green-400/10 text-green-300'
        }`}>
          {pending ? `${pending} pending` : 'không có pending'}
        </p>
      </div>
      <div className="divide-y divide-white/8">
        {rows.length === 0 ? (
          <p className="px-5 py-6 text-center text-sm text-white/40">Chưa có yêu cầu xóa dữ liệu.</p>
        ) : rows.slice(0, 12).map(row => (
          <div key={row.id} className="grid gap-2 px-5 py-3 text-sm md:grid-cols-[110px_1fr_120px] md:items-center">
            <span className={`w-fit rounded-full px-2.5 py-1 text-[10px] font-black uppercase ${
              row.status === 'done' ? 'bg-green-400/15 text-green-300' : 'bg-orange-400/15 text-orange-300'
            }`}>
              {row.status}
            </span>
            <div className="min-w-0">
              <p className="truncate font-mono text-xs text-white/70">{row.phone || row.vspiId || row.email || 'no id'}</p>
              <p className="truncate text-[11px] text-white/35">{row.note || '-'}</p>
            </div>
            <p className="font-mono text-[10px] text-white/30 md:text-right">{formatDateTimeSafe(row.createdAt)}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function InsightPanel({ title, subtitle, rows }: { title: string; subtitle: string; rows: AdminInsight[] }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-[#111722] p-5">
      <h2 className="text-lg font-black text-white">{title}</h2>
      <p className="mt-1 text-xs text-white/45">{subtitle}</p>
      <div className="mt-4 space-y-2">
        {rows.length === 0 ? (
          <p className="rounded-2xl border border-white/10 px-4 py-5 text-center text-sm text-white/35">Chưa đủ dữ liệu.</p>
        ) : (
          rows.map(row => (
            <div key={row.key} className="grid grid-cols-[1fr_auto_auto] items-center gap-3 rounded-2xl border border-white/8 bg-[#0a0c10] px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-white">{row.label}</p>
                <p className="mt-0.5 text-[11px] text-white/35">Lương TB {formatVnd(row.avgSalary)}</p>
              </div>
              <p className="font-mono text-xs text-[#e8b84b]">{row.count} scan</p>
              <p className="font-mono text-xs text-white/45">Top {row.avgPercent}%</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function CustomerRow({ customer }: { customer: AdminCustomer }) {
  const paid = customer.status === 'paid';
  const isLeadOnly = customer.product === 'lead';
  const packageTone = customer.packageLabel === '79k'
      ? 'border-[#8b5cf6]/35 bg-[#8b5cf6]/12 text-[#c4b5fd]'
      : isLeadOnly
        ? 'border-sky-400/30 bg-sky-400/10 text-sky-300'
        : 'border-[#e8b84b]/30 bg-[#e8b84b]/10 text-[#e8b84b]';
  return (
    <article className="rounded-2xl border border-white/10 bg-[#0f1219] p-4 shadow-sm transition hover:border-white/20">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
              paid ? 'bg-green-400/15 text-green-300' : 'bg-orange-400/15 text-orange-300'
            }`}>
              {isLeadOnly ? 'lead' : paid ? 'paid' : customer.status || 'pending'}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${packageTone}`}>
              {customer.packageLabel === '79k' ? 'Roadmap 79k' : isLeadOnly ? 'Lead / job mới' : 'Report 29k'}
            </span>
            <span className="font-mono text-sm font-black text-white">{maskAdminPhone(customer.phone) || 'Chưa có SĐT'}</span>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1.6fr)_auto] md:items-end">
            <div className="min-w-0">
              <p className="break-words text-base font-black leading-snug text-white">{customer.jobTitle || 'Chưa rõ nghề'}</p>
              <p className="mt-1 text-[11px] text-white/45">{customer.experience || customer.packageLabel || 'no level'}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 md:text-right">
              <p className="font-mono text-sm font-black text-white/80">{customer.currentSalary ? formatVnd(customer.currentSalary) : '-'}</p>
              <p className="mt-1 font-mono text-[10px] font-black text-[#e8b84b]">{customer.percent ? `Top ${customer.percent}%` : 'Top -'}</p>
            </div>
          </div>
        </div>

        <div className="shrink-0">
          {isLeadOnly ? (
            <div className="max-w-sm rounded-xl border border-sky-400/20 bg-sky-400/10 px-3 py-2 text-[10px] font-bold leading-4 text-sky-200">
              Chưa có mã VSPI. Nhắn khách mở QR 29k/79k rồi dùng mã chuyển khoản để unlock.
            </div>
          ) : (
            <AdminManualConfirmButton vspiId={customer.vspiId} disabled={paid || !customer.vspiId} packageLabel={customer.packageLabel === '79k' ? '79k' : '29k'} />
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-2 text-[11px] text-white/45 sm:grid-cols-2 lg:grid-cols-4">
        <InfoPill label="Tỉnh/thành" value={customer.workProvinceLabel || '-'} />
        <InfoPill label="Ngày tạo" value={formatDate(customer.createdAt)} />
        <InfoPill label="VSPI ID" value={customer.vspiId || '-'} mono />
        <InfoPill label="Mã truy cập" value={maskAdminAccessCode(customer.accessCode) || 'Chưa có'} mono />
      </div>

      <div className="mt-4">
        <AdminDeleteCustomerButton
          rowId={customer.sourceId}
          sourceTable={customer.sourceTable}
          vspiId={customer.vspiId}
          phone={customer.phone}
          product={customer.product === 'roadmap' ? 'roadmap79' : customer.product === 'premium' ? 'report29' : 'all'}
        />
      </div>
    </article>
  );
}

function InfoPill({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">
      <p className="text-[9px] font-black uppercase tracking-wider text-white/30">{label}</p>
      <p className={`mt-1 break-words text-[11px] font-bold text-white/65 ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}

function maskAdminPhone(value: string | null): string {
  const clean = value?.replace(/\D/g, '') || '';
  if (!clean) return '';
  if (clean.length < 7) return '***';
  return `${clean.slice(0, 3)}****${clean.slice(-3)}`;
}

function maskAdminAccessCode(value: string | null): string {
  const clean = value?.trim().toUpperCase() || '';
  if (!clean) return '';
  if (clean.length <= 8) return `${clean.slice(0, 2)}••••${clean.slice(-2)}`;
  return `${clean.slice(0, 4)}••••${clean.slice(-3)}`;
}

function formatVnd(value: number): string {
  if (!value) return '0đ';
  return `${value.toLocaleString('vi-VN')}đ`;
}

function formatDate(value: string | null): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(value));
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatDateTimeSafe(value: string | null): string {
  if (!value) return '-';
  return formatDateTime(value);
}
