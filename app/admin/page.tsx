import {
  getAdminDashboardData,
  getAdminSecretConfigured,
  isAdminDashboardAuthorized,
  type AdminCustomer,
  type AdminDeletionRequest,
  type AdminInsight,
  type AdminPaymentEvent,
} from '@/lib/adminDashboard';
import AdminManualConfirmButton from './AdminManualConfirmButton';

export const dynamic = 'force-dynamic';
export const metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

type AdminPageProps = {
  searchParams: Promise<{ key?: string | string[] }>;
};

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const params = await searchParams;
  const key = Array.isArray(params.key) ? params.key[0] : params.key;

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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="bg-white/[0.03] text-[10px] uppercase tracking-widest text-white/35">
                <tr>
                  <th className="px-5 py-3">Trạng thái</th>
                  <th className="px-5 py-3">SĐT</th>
                  <th className="px-5 py-3">Nghề nghiệp</th>
                  <th className="px-5 py-3">Top%</th>
                  <th className="px-5 py-3">Lương</th>
                  <th className="px-5 py-3">Tỉnh/thành</th>
                  <th className="px-5 py-3">Ngày tạo</th>
                  <th className="px-5 py-3">VSPI ID</th>
                  <th className="px-5 py-3">Mở khóa</th>
                </tr>
              </thead>
              <tbody>
                {data.customers.length === 0 ? (
                  <tr>
                    <td className="px-5 py-8 text-center text-white/45" colSpan={9}>
                      Chưa có purchase nào. Khi user bấm mở khóa, dữ liệu sẽ hiện ở đây.
                    </td>
                  </tr>
                ) : (
                  data.customers.map(customer => <CustomerRow key={customer.vspiId} customer={customer} adminKey={key || ''} />)
                )}
              </tbody>
            </table>
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
      <form className="w-full max-w-md rounded-3xl border border-white/10 bg-[#111722] p-6 shadow-2xl">
        <p className="font-mono text-[11px] font-black uppercase tracking-[0.26em] text-[#e8b84b]">Owner only</p>
        <h1 className="mt-3 text-2xl font-black text-white">Nhập admin key</h1>
        <p className="mt-2 text-sm leading-6 text-white/50">
          Dashboard này có SĐT và dữ liệu khách hàng nên phải khóa riêng. Dùng biến môi trường <code className="text-[#e8b84b]">ADMIN_DASHBOARD_KEY</code>.
        </p>
        {!configured && (
          <p className="mt-3 rounded-2xl border border-orange-400/20 bg-orange-400/10 px-3 py-2 text-xs text-orange-200">
            Local dev chưa set key: có thể tạm mở bằng <code>?key=dev</code>. Lên production phải set key thật.
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

function CustomerRow({ customer, adminKey }: { customer: AdminCustomer; adminKey: string }) {
  const paid = customer.status === 'paid';
  return (
    <tr className="border-t border-white/8 hover:bg-white/[0.03]">
      <td className="px-5 py-4">
        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ${
          paid ? 'bg-green-400/15 text-green-300' : 'bg-orange-400/15 text-orange-300'
        }`}>
          {paid ? 'paid' : customer.status || 'pending'}
        </span>
      </td>
      <td className="px-5 py-4 font-mono text-white">{customer.phone || 'Chưa có'}</td>
      <td className="px-5 py-4">
        <p className="font-bold text-white">{customer.jobTitle || 'Chưa rõ'}</p>
        <p className="mt-0.5 text-[11px] text-white/35">{customer.experience || 'no level'}</p>
      </td>
      <td className="px-5 py-4 font-mono text-[#e8b84b]">{customer.percent ? `Top ${customer.percent}%` : '-'}</td>
      <td className="px-5 py-4 font-mono text-white/70">{customer.currentSalary ? formatVnd(customer.currentSalary) : '-'}</td>
      <td className="px-5 py-4 text-white/70">{customer.workProvinceLabel}</td>
      <td className="px-5 py-4 font-mono text-xs text-white/45">{formatDate(customer.createdAt)}</td>
      <td className="px-5 py-4 font-mono text-xs text-white/35">{customer.vspiId}</td>
      <td className="px-5 py-4">
        <AdminManualConfirmButton vspiId={customer.vspiId} adminKey={adminKey} disabled={paid || !customer.vspiId} />
      </td>
    </tr>
  );
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
