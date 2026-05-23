import { WORK_PROVINCES } from '@/lib/workProvinces';

export interface AdminMetric {
  label: string;
  value: number;
  displayValue?: string;
  hint: string;
}

export interface AdminCustomer {
  product: 'premium' | 'roadmap';
  vspiId: string;
  phone: string | null;
  email: string | null;
  jobTitle: string | null;
  percent: number | null;
  currentSalary: number | null;
  targetSalary: number | null;
  experience: string | null;
  marketLocation: string | null;
  workProvince: string | null;
  workProvinceLabel: string;
  status: string | null;
  amount: number | null;
  createdAt: string | null;
  paidAt: string | null;
}

export interface AdminInsight {
  key: string;
  label: string;
  count: number;
  avgSalary: number;
  avgPercent: number;
}

export interface AdminPaymentEvent {
  id: string;
  status: string;
  product: string | null;
  vspiId: string | null;
  amount: number | null;
  paymentRef: string | null;
  message: string | null;
  createdAt: string | null;
}

export interface AdminDeletionRequest {
  id: string;
  phone: string | null;
  email: string | null;
  vspiId: string | null;
  status: string;
  note: string | null;
  createdAt: string | null;
}

export interface AdminDashboardData {
  generatedAt: string;
  metrics: AdminMetric[];
  customers: AdminCustomer[];
  provinceInsights: AdminInsight[];
  jobInsights: AdminInsight[];
  trafficInsights: AdminInsight[];
  paymentEvents: AdminPaymentEvent[];
  deletionRequests: AdminDeletionRequest[];
}

type PurchaseRow = {
  vspi_id?: string | null;
  email?: string | null;
  phone?: string | null;
  job_title?: string | null;
  percent?: number | null;
  amount?: number | null;
  status?: string | null;
  created_at?: string | null;
  paid_at?: string | null;
  experience?: string | null;
  current_salary?: number | null;
  market_location?: string | null;
  work_province?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  referrer?: string | null;
};

type ScanRow = {
  phone?: string | null;
  job_title?: string | null;
  salary?: number | null;
  percent?: number | null;
  experience?: string | null;
  market_location?: string | null;
  work_province?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  referrer?: string | null;
  scanned_at?: string | null;
};

type RoadmapRow = {
  vspi_id?: string | null;
  phone?: string | null;
  job_title?: string | null;
  current_salary?: number | null;
  target_salary?: number | null;
  duration_months?: number | null;
  goal_label?: string | null;
  status?: string | null;
  created_at?: string | null;
  paid_at?: string | null;
  utm_source?: string | null;
  utm_medium?: string | null;
  utm_campaign?: string | null;
  referrer?: string | null;
};

type PaymentEventRow = {
  id?: string | null;
  status?: string | null;
  product?: string | null;
  vspi_id?: string | null;
  amount?: number | null;
  payment_ref?: string | null;
  message?: string | null;
  created_at?: string | null;
};

type DeletionRequestRow = {
  id?: string | null;
  phone?: string | null;
  email?: string | null;
  vspi_id?: string | null;
  status?: string | null;
  note?: string | null;
  created_at?: string | null;
};

const provinceLabelMap = new Map<string, string>(WORK_PROVINCES.map(item => [item.key, item.label]));

export function getAdminSecretConfigured(): boolean {
  return Boolean(process.env.ADMIN_DASHBOARD_KEY);
}

export function isAdminDashboardAuthorized(inputKey: string | null | undefined): boolean {
  const configuredKey = process.env.ADMIN_DASHBOARD_KEY;
  if (!configuredKey) {
    return process.env.NODE_ENV !== 'production' && (inputKey === 'dev' || inputKey === process.env.WEBHOOK_SECRET_KEY);
  }
  return Boolean(inputKey) && inputKey === configuredKey;
}

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  const { supabaseServer } = await import('@/lib/supabase');

  const [
    purchasesResult,
    roadmapsResult,
    scanHistoryResult,
    paymentEventsResult,
    deletionRequestsResult,
    purchaseCountResult,
    scanCountResult,
  ] = await Promise.all([
    fetchPurchases(),
    fetchRoadmaps(),
    fetchScanHistory(),
    fetchPaymentEvents(),
    fetchDeletionRequests(),
    supabaseServer.from('purchases').select('id', { count: 'exact', head: true }),
    supabaseServer.from('scan_history').select('id', { count: 'exact', head: true }),
  ]);

  const purchases = purchasesResult;
  const roadmaps = roadmapsResult;
  const scans = scanHistoryResult;
  const now = Date.now();
  const activeSince = now - 7 * 24 * 60 * 60 * 1000;
  const lastSeenByPhone = new Map<string, number>();

  for (const purchase of purchases) {
    const phone = cleanPhone(purchase.phone);
    if (!phone) continue;
    updateLastSeen(lastSeenByPhone, phone, purchase.paid_at || purchase.created_at);
  }

  for (const roadmap of roadmaps) {
    const phone = cleanPhone(roadmap.phone);
    if (!phone) continue;
    updateLastSeen(lastSeenByPhone, phone, roadmap.paid_at || roadmap.created_at);
  }

  for (const scan of scans) {
    const phone = cleanPhone(scan.phone);
    if (!phone) continue;
    updateLastSeen(lastSeenByPhone, phone, scan.scanned_at);
  }

  const anonymousRecentScans = scans.filter(scan => !cleanPhone(scan.phone) && isRecent(scan.scanned_at, activeSince)).length;
  const anonymousScans = scans.filter(scan => !cleanPhone(scan.phone)).length;
  const knownUsers = lastSeenByPhone.size;
  const activeKnownUsers = Array.from(lastSeenByPhone.values()).filter(ts => ts >= activeSince).length;
  const totalUsers = knownUsers + anonymousScans;
  const activeUsers = activeKnownUsers + anonymousRecentScans;
  const premiumOpens = purchaseCountResult.count ?? purchases.length;
  const premiumPaid = purchases.filter(p => p.status === 'paid').length;
  const roadmapOpens = roadmaps.length;
  const roadmapPaid = roadmaps.filter(r => r.status === 'paid').length;
  const totalPaymentOpens = premiumOpens + roadmapOpens;
  const totalPaidOrders = premiumPaid + roadmapPaid;
  const conversionRate = totalPaymentOpens ? (totalPaidOrders / totalPaymentOpens) * 100 : 0;
  const estimatedUnpaidUsers = Math.max(0, totalUsers - uniquePaidUsers(purchases, roadmaps));
  const revenue = purchases
    .filter(p => p.status === 'paid')
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0) + roadmapPaid * 79_000;
  const customers = [...purchases.map(toCustomer), ...roadmaps.map(toRoadmapCustomer)]
    .sort((a, b) => Date.parse(b.createdAt || '') - Date.parse(a.createdAt || ''))
    .slice(0, 240);
  const paidOrders = totalPaidOrders;
  const pendingOrders = Math.max(0, totalPaymentOpens - totalPaidOrders);

  return {
    generatedAt: new Date().toISOString(),
    metrics: [
      { label: 'Lượt scan', value: scanCountResult.count ?? scans.length, hint: 'Tổng lượt quét lương' },
      { label: 'Lead có SĐT', value: knownUsers, hint: `${anonymousScans} lượt chưa để SĐT` },
      { label: 'Mở payment 29k', value: premiumOpens, hint: 'Số đơn báo cáo đã tạo' },
      { label: 'Mở payment 79k', value: roadmapOpens, hint: 'Số đơn lộ trình đã tạo' },
      { label: 'Paid 29k', value: premiumPaid, hint: 'Báo cáo đã thanh toán' },
      { label: 'Paid 79k', value: roadmapPaid, hint: 'Lộ trình đã thanh toán' },
      { label: 'Conversion', value: Math.round(conversionRate), displayValue: `${conversionRate.toFixed(1)}%`, hint: `${totalPaidOrders}/${totalPaymentOpens || 0} đơn đã thanh toán` },
      { label: 'Doanh thu', value: revenue, displayValue: formatVnd(revenue), hint: `${estimatedUnpaidUsers} lead/đơn chưa trả tiền` },
      { label: 'Tổng user', value: totalUsers || (purchaseCountResult.count ?? 0), hint: `${knownUsers} có SĐT, ${anonymousScans} lượt ẩn danh` },
      { label: 'Active 7 ngày', value: activeUsers, hint: 'Có scan hoặc tạo đơn gần đây' },
      { label: 'Inactive', value: Math.max(0, totalUsers - activeUsers), hint: 'User có dấu vết nhưng 7 ngày chưa quay lại' },
      { label: 'Đã pay', value: paidOrders, hint: `Doanh thu ghi nhận ${formatVnd(revenue)}` },
      { label: 'Chưa pay', value: Math.max(pendingOrders, estimatedUnpaidUsers), hint: 'Đơn pending + lead chưa trả tiền' },
      { label: 'Tổng lượt scan', value: scanCountResult.count ?? scans.length, hint: 'Nhu cầu tra cứu thực tế' },
    ],
    customers,
    provinceInsights: buildInsights(scans, scan => scan.work_province || scan.market_location || 'unknown', getProvinceLabel).slice(0, 12),
    jobInsights: buildInsights(scans, scan => scan.job_title || 'unknown', label => label).slice(0, 12),
    trafficInsights: buildTrafficInsights([...scans, ...purchases, ...roadmaps]).slice(0, 12),
    paymentEvents: paymentEventsResult.map(toPaymentEvent),
    deletionRequests: deletionRequestsResult.map(toDeletionRequest),
  };

  async function fetchPurchases(): Promise<PurchaseRow[]> {
    const full = await supabaseServer
      .from('purchases')
      .select('vspi_id, email, phone, job_title, percent, amount, status, created_at, paid_at, experience, current_salary, market_location, work_province, utm_source, utm_medium, utm_campaign, referrer')
      .order('created_at', { ascending: false })
      .limit(1000);

    if (!full.error) return (full.data || []) as PurchaseRow[];
    if (!/current_salary|market_location|work_province|utm_|referrer|schema cache|column/i.test(full.error.message)) {
      throw full.error;
    }

    const fallback = await supabaseServer
      .from('purchases')
      .select('vspi_id, email, phone, job_title, percent, amount, status, created_at, paid_at, experience')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (fallback.error) throw fallback.error;
    return (fallback.data || []) as PurchaseRow[];
  }

  async function fetchRoadmaps(): Promise<RoadmapRow[]> {
    const full = await supabaseServer
      .from('roadmaps')
      .select('vspi_id, phone, job_title, current_salary, target_salary, duration_months, goal_label, status, created_at, paid_at, utm_source, utm_medium, utm_campaign, referrer')
      .order('created_at', { ascending: false })
      .limit(1000);

    if (!full.error) return (full.data || []) as RoadmapRow[];
    if (!/roadmaps|utm_|referrer|schema cache|column|relation/i.test(full.error.message)) {
      throw full.error;
    }

    const fallback = await supabaseServer
      .from('roadmaps')
      .select('vspi_id, phone, job_title, current_salary, target_salary, duration_months, goal_label, status, created_at, paid_at')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (fallback.error) {
      if (/roadmaps|schema cache|relation/i.test(fallback.error.message)) return [];
      throw fallback.error;
    }
    return (fallback.data || []) as RoadmapRow[];
  }

  async function fetchScanHistory(): Promise<ScanRow[]> {
    const full = await supabaseServer
      .from('scan_history')
      .select('phone, job_title, salary, percent, experience, market_location, work_province, utm_source, utm_medium, utm_campaign, referrer, scanned_at')
      .order('scanned_at', { ascending: false })
      .limit(5000);

    if (!full.error) return (full.data || []) as ScanRow[];
    if (!/market_location|work_province|utm_|referrer|schema cache|column/i.test(full.error.message)) {
      throw full.error;
    }

    const fallback = await supabaseServer
      .from('scan_history')
      .select('phone, job_title, salary, percent, experience, scanned_at')
      .order('scanned_at', { ascending: false })
      .limit(5000);
    if (fallback.error) throw fallback.error;
    return (fallback.data || []) as ScanRow[];
  }

  async function fetchPaymentEvents(): Promise<PaymentEventRow[]> {
    const result = await supabaseServer
      .from('payment_events')
      .select('id, status, product, vspi_id, amount, payment_ref, message, created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    if (!result.error) return (result.data || []) as PaymentEventRow[];
    if (/payment_events|schema cache|relation/i.test(result.error.message)) return [];
    throw result.error;
  }

  async function fetchDeletionRequests(): Promise<DeletionRequestRow[]> {
    const result = await supabaseServer
      .from('data_deletion_requests')
      .select('id, phone, email, vspi_id, status, note, created_at')
      .order('created_at', { ascending: false })
      .limit(50);
    if (!result.error) return (result.data || []) as DeletionRequestRow[];
    if (/data_deletion_requests|schema cache|relation/i.test(result.error.message)) return [];
    throw result.error;
  }
}

function cleanPhone(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const phone = value.replace(/\D/g, '');
  return phone.length >= 9 ? phone : null;
}

function updateLastSeen(map: Map<string, number>, phone: string, dateValue: string | null | undefined) {
  const ts = dateValue ? Date.parse(dateValue) : 0;
  if (!Number.isFinite(ts) || ts <= 0) return;
  map.set(phone, Math.max(map.get(phone) || 0, ts));
}

function isRecent(dateValue: string | null | undefined, activeSince: number): boolean {
  const ts = dateValue ? Date.parse(dateValue) : 0;
  return Number.isFinite(ts) && ts >= activeSince;
}

function uniquePaidUsers(purchases: PurchaseRow[], roadmaps: RoadmapRow[]): number {
  const ids = new Set<string>();
  purchases.forEach((purchase, index) => {
    if (purchase.status !== 'paid') return;
    ids.add(cleanPhone(purchase.phone) || purchase.vspi_id || `paid-${index}`);
  });
  roadmaps.forEach((roadmap, index) => {
    if (roadmap.status !== 'paid') return;
    ids.add(cleanPhone(roadmap.phone) || roadmap.vspi_id || `roadmap-paid-${index}`);
  });
  return ids.size;
}

function toCustomer(row: PurchaseRow): AdminCustomer {
  return {
    product: 'premium',
    vspiId: row.vspi_id || '',
    phone: cleanPhone(row.phone),
    email: row.email || null,
    jobTitle: row.job_title || null,
    percent: numberOrNull(row.percent),
    currentSalary: numberOrNull(row.current_salary),
    targetSalary: null,
    experience: row.experience || null,
    marketLocation: row.market_location || null,
    workProvince: row.work_province || null,
    workProvinceLabel: getProvinceLabel(row.work_province || row.market_location || 'unknown'),
    status: row.status || null,
    amount: numberOrNull(row.amount),
    createdAt: row.created_at || null,
    paidAt: row.paid_at || null,
  };
}

function toRoadmapCustomer(row: RoadmapRow): AdminCustomer {
  return {
    product: 'roadmap',
    vspiId: row.vspi_id || '',
    phone: cleanPhone(row.phone),
    email: null,
    jobTitle: row.job_title || null,
    percent: null,
    currentSalary: numberOrNull(row.current_salary),
    targetSalary: numberOrNull(row.target_salary),
    experience: null,
    marketLocation: null,
    workProvince: null,
    workProvinceLabel: 'Lộ trình',
    status: row.status || null,
    amount: 79_000,
    createdAt: row.created_at || null,
    paidAt: row.paid_at || null,
  };
}

function toPaymentEvent(row: PaymentEventRow): AdminPaymentEvent {
  return {
    id: row.id || '',
    status: row.status || 'unknown',
    product: row.product || null,
    vspiId: row.vspi_id || null,
    amount: numberOrNull(row.amount),
    paymentRef: row.payment_ref || null,
    message: row.message || null,
    createdAt: row.created_at || null,
  };
}

function toDeletionRequest(row: DeletionRequestRow): AdminDeletionRequest {
  return {
    id: row.id || '',
    phone: cleanPhone(row.phone),
    email: row.email || null,
    vspiId: row.vspi_id || null,
    status: row.status || 'pending',
    note: row.note || null,
    createdAt: row.created_at || null,
  };
}

function buildInsights(
  scans: ScanRow[],
  getKey: (scan: ScanRow) => string,
  getLabel: (key: string) => string
): AdminInsight[] {
  const groups = new Map<string, { salary: number; percent: number; count: number }>();
  for (const scan of scans) {
    const key = getKey(scan) || 'unknown';
    const current = groups.get(key) || { salary: 0, percent: 0, count: 0 };
    current.salary += Number(scan.salary) || 0;
    current.percent += Number(scan.percent) || 0;
    current.count += 1;
    groups.set(key, current);
  }

  return Array.from(groups.entries())
    .map(([key, group]) => ({
      key,
      label: getLabel(key),
      count: group.count,
      avgSalary: Math.round(group.salary / Math.max(1, group.count)),
      avgPercent: Math.round(group.percent / Math.max(1, group.count)),
    }))
    .sort((a, b) => b.count - a.count);
}

function buildTrafficInsights(rows: Array<ScanRow | PurchaseRow | RoadmapRow>): AdminInsight[] {
  const groups = new Map<string, number>();
  for (const row of rows) {
    const key = getTrafficKey(row);
    groups.set(key, (groups.get(key) || 0) + 1);
  }

  return Array.from(groups.entries())
    .map(([key, count]) => ({
      key,
      label: key,
      count,
      avgSalary: 0,
      avgPercent: 0,
    }))
    .sort((a, b) => b.count - a.count);
}

function getTrafficKey(row: ScanRow | PurchaseRow | RoadmapRow): string {
  const campaign = cleanString(row.utm_campaign);
  const source = cleanString(row.utm_source);
  const medium = cleanString(row.utm_medium);
  if (source && campaign) return `${source} / ${campaign}`;
  if (source && medium) return `${source} / ${medium}`;
  if (source) return source;
  const referrer = cleanString(row.referrer);
  if (referrer) return referrer;
  return 'direct / chưa gắn UTM';
}

function cleanString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim();
  return cleaned || null;
}

function getProvinceLabel(key: string): string {
  if (!key || key === 'unknown') return 'Chưa rõ';
  return provinceLabelMap.get(key) || key;
}

function numberOrNull(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function formatVnd(value: number): string {
  return `${value.toLocaleString('vi-VN')}đ`;
}
