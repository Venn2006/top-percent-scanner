import { WORK_PROVINCES } from '@/lib/workProvinces';

import { timingSafeEqual } from 'node:crypto';
import { issueRoadmapAccessCode } from '@/lib/roadmapAccessServer';

export const ADMIN_DASHBOARD_COOKIE = 'admin_dashboard_key';

export interface AdminMetric {
  label: string;
  value: number;
  displayValue?: string;
  hint: string;
}

export interface AdminCustomer {
  sourceTable: 'purchases' | 'roadmaps' | 'scan_history' | 'zalo_subscribers';
  sourceId: string | null;
  product: 'premium' | 'roadmap' | 'lead';
  packageLabel: '29k' | '79k' | 'lead';
  vspiId: string;
  accessCode: string | null;
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

export interface AdminCustomJobSuggestion {
  id: string;
  jobTitle: string;
  salary: number | null;
  percent: number | null;
  experience: string | null;
  workProvinceLabel: string;
  matchType: string | null;
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
  customJobSuggestions: AdminCustomJobSuggestion[];
}

type PurchaseRow = {
  id?: string | null;
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
  id?: string | null;
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
  id?: string | null;
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

type CustomJobSuggestionRow = {
  id?: string | null;
  job_title?: string | null;
  salary?: number | null;
  percent?: number | null;
  experience?: string | null;
  market_location?: string | null;
  work_province?: string | null;
  match_type?: string | null;
  status?: string | null;
  note?: string | null;
  created_at?: string | null;
};

type ZaloSubscriberRow = {
  id?: string | null;
  phone?: string | null;
  job?: string | null;
  city?: string | null;
  percentile?: number | null;
  created_at?: string | null;
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
  const configuredKey = process.env.ADMIN_DASHBOARD_KEY;
  if (!configuredKey) return false;
  return process.env.NODE_ENV !== 'production' || configuredKey.length >= 32;
}

export function isAdminDashboardAuthorized(inputKey: string | null | undefined): boolean {
  const configuredKey = process.env.ADMIN_DASHBOARD_KEY;
  if (!configuredKey) {
    return process.env.NODE_ENV !== 'production' && (inputKey === 'dev' || inputKey === process.env.WEBHOOK_SECRET_KEY);
  }
  if (process.env.NODE_ENV === 'production' && configuredKey.length < 32) return false;
  if (!inputKey) return false;
  return timingSafeTextEqual(inputKey, configuredKey);
}

function timingSafeTextEqual(input: string, expected: string): boolean {
  const inputBuffer = Buffer.from(input);
  const expectedBuffer = Buffer.from(expected);

  if (inputBuffer.length !== expectedBuffer.length) {
    const paddedInput = Buffer.alloc(expectedBuffer.length);
    inputBuffer.copy(paddedInput, 0, 0, Math.min(inputBuffer.length, expectedBuffer.length));
    timingSafeEqual(paddedInput, expectedBuffer);
    return false;
  }

  return timingSafeEqual(inputBuffer, expectedBuffer);
}

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  const { supabaseServer } = await import('@/lib/supabaseServer');

  const [
    purchasesResult,
    roadmapsResult,
    scanHistoryResult,
    paymentEventsResult,
    deletionRequestsResult,
    customJobSuggestionsResult,
    zaloSubscribersResult,
    purchaseCountResult,
    scanCountResult,
  ] = await Promise.all([
    fetchPurchases(),
    fetchRoadmaps(),
    fetchScanHistory(),
    fetchPaymentEvents(),
    fetchDeletionRequests(),
    fetchCustomJobSuggestions(),
    fetchZaloSubscribers(),
    supabaseServer.from('purchases').select('id', { count: 'exact', head: true }),
    supabaseServer.from('scan_history').select('id', { count: 'exact', head: true }),
  ]);

  const purchases = purchasesResult;
  const roadmaps = roadmapsResult;
  const scans = scanHistoryResult;
  const zaloSubscribers = zaloSubscribersResult;
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

  for (const subscriber of zaloSubscribers) {
    const phone = cleanPhone(subscriber.phone);
    if (!phone) continue;
    updateLastSeen(lastSeenByPhone, phone, subscriber.created_at);
  }

  const anonymousRecentScans = scans.filter(scan => !cleanPhone(scan.phone) && isRecent(scan.scanned_at, activeSince)).length;
  const anonymousScans = scans.filter(scan => !cleanPhone(scan.phone)).length;
  const knownUsers = lastSeenByPhone.size;
  const activeKnownUsers = Array.from(lastSeenByPhone.values()).filter(ts => ts >= activeSince).length;
  const totalUsers = knownUsers + anonymousScans;
  const activeUsers = activeKnownUsers + anonymousRecentScans;
  const premium29Opens = purchases.length;
  const premium29Paid = purchases.filter(p => p.status === 'paid').length;
  const roadmapOpens = roadmaps.length;
  const roadmapPaid = roadmaps.filter(r => r.status === 'paid').length;
  const totalPaymentOpens = premium29Opens + roadmapOpens;
  const totalPaidOrders = premium29Paid + roadmapPaid;
  const conversionRate = totalPaymentOpens ? (totalPaidOrders / totalPaymentOpens) * 100 : 0;
  const estimatedUnpaidUsers = Math.max(0, totalUsers - uniquePaidUsers(purchases, roadmaps));
  const revenue = purchases
    .filter(p => p.status === 'paid')
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0) + roadmapPaid * 79_000;
  const orderLeadKeys = buildOrderLeadKeys(purchases, roadmaps);
  const leadRows = [
    ...zaloSubscribers.map(toZaloLead),
    ...scans.filter(scan => cleanPhone(scan.phone)).map(toScanLead),
  ].filter(row => !orderLeadKeys.has(getLeadKey(row.phone, row.jobTitle)));
  const customers = [...purchases.map(toCustomer), ...roadmaps.map(toRoadmapCustomer), ...dedupeLeadRows(leadRows)]
    .sort((a, b) => {
      const aPending = a.status !== 'paid' ? 1 : 0;
      const bPending = b.status !== 'paid' ? 1 : 0;
      if (aPending !== bPending) return bPending - aPending;
      return safeTime(b.createdAt) - safeTime(a.createdAt);
    })
    .slice(0, 240);
  const paidOrders = totalPaidOrders;
  const pendingOrders = Math.max(0, totalPaymentOpens - totalPaidOrders);

  return {
    generatedAt: new Date().toISOString(),
    metrics: [
      { label: 'Lượt scan', value: scanCountResult.count ?? scans.length, hint: 'Tổng lượt quét lương' },
      { label: 'Lead có SĐT', value: knownUsers, hint: `${anonymousScans} lượt chưa để SĐT` },
      { label: 'Mở payment 29k', value: premium29Opens, hint: 'Số đơn báo cáo đã tạo' },
      { label: 'Mở payment 79k', value: roadmapOpens, hint: 'Số đơn lộ trình đã tạo' },
      { label: 'Paid 29k', value: premium29Paid, hint: 'Báo cáo đã thanh toán' },
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
    customJobSuggestions: customJobSuggestionsResult.map(toCustomJobSuggestion),
  };

  async function fetchPurchases(): Promise<PurchaseRow[]> {
    const full = await supabaseServer
      .from('purchases')
      .select('id, vspi_id, email, phone, job_title, percent, amount, status, created_at, paid_at, experience, current_salary, market_location, work_province, utm_source, utm_medium, utm_campaign, referrer')
      .order('created_at', { ascending: false })
      .limit(1000);

    if (!full.error) return (full.data || []) as PurchaseRow[];
    if (!/current_salary|market_location|work_province|utm_|referrer|schema cache|column/i.test(full.error.message)) {
      throw full.error;
    }

    const fallback = await supabaseServer
      .from('purchases')
      .select('id, vspi_id, email, phone, job_title, percent, amount, status, created_at, paid_at, experience')
      .order('created_at', { ascending: false })
      .limit(1000);
    if (fallback.error) throw fallback.error;
    return (fallback.data || []) as PurchaseRow[];
  }

  async function fetchRoadmaps(): Promise<RoadmapRow[]> {
    const full = await supabaseServer
      .from('roadmaps')
      .select('id, vspi_id, phone, job_title, current_salary, target_salary, duration_months, goal_label, status, created_at, paid_at, utm_source, utm_medium, utm_campaign, referrer')
      .order('created_at', { ascending: false })
      .limit(1000);

    if (!full.error) return (full.data || []) as RoadmapRow[];
    if (!/roadmaps|utm_|referrer|schema cache|column|relation/i.test(full.error.message)) {
      throw full.error;
    }

    const fallback = await supabaseServer
      .from('roadmaps')
      .select('id, vspi_id, phone, job_title, current_salary, target_salary, duration_months, goal_label, status, created_at, paid_at')
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
      .select('id, phone, job_title, salary, percent, experience, market_location, work_province, utm_source, utm_medium, utm_campaign, referrer, scanned_at')
      .order('scanned_at', { ascending: false })
      .limit(5000);

    if (!full.error) return (full.data || []) as ScanRow[];
    if (!/market_location|work_province|utm_|referrer|schema cache|column/i.test(full.error.message)) {
      throw full.error;
    }

    const fallback = await supabaseServer
      .from('scan_history')
      .select('id, phone, job_title, salary, percent, experience, scanned_at')
      .order('scanned_at', { ascending: false })
      .limit(5000);
    if (fallback.error) throw fallback.error;
    return (fallback.data || []) as ScanRow[];
  }

  async function fetchZaloSubscribers(): Promise<ZaloSubscriberRow[]> {
    const result = await supabaseServer
      .from('zalo_subscribers')
      .select('id, phone, job, city, percentile, created_at')
      .order('created_at', { ascending: false })
      .limit(300);
    if (!result.error) return (result.data || []) as ZaloSubscriberRow[];
    if (/zalo_subscribers|schema cache|relation/i.test(result.error.message)) return [];
    throw result.error;
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

  async function fetchCustomJobSuggestions(): Promise<CustomJobSuggestionRow[]> {
    const result = await supabaseServer
      .from('custom_job_suggestions')
      .select('id, job_title, salary, percent, experience, market_location, work_province, match_type, status, note, created_at')
      .order('created_at', { ascending: false })
      .limit(100);
    if (!result.error) return (result.data || []) as CustomJobSuggestionRow[];
    if (/custom_job_suggestions|schema cache|relation/i.test(result.error.message)) return [];
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

function safeTime(dateValue: string | null | undefined): number {
  const ts = dateValue ? Date.parse(dateValue) : 0;
  return Number.isFinite(ts) ? ts : 0;
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
  const vspiId = row.vspi_id || '';
  return {
    sourceTable: 'purchases',
    sourceId: row.id || null,
    product: 'premium',
    packageLabel: '29k',
    vspiId,
    accessCode: vspiId || null,
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
  const vspiId = row.vspi_id || '';
  return {
    sourceTable: 'roadmaps',
    sourceId: row.id || null,
    product: 'roadmap',
    packageLabel: '79k',
    vspiId,
    accessCode: issueRoadmapAccessCode(vspiId) || null,
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

function toZaloLead(row: ZaloSubscriberRow): AdminCustomer {
  return {
    sourceTable: 'zalo_subscribers',
    sourceId: row.id || null,
    product: 'lead',
    packageLabel: 'lead',
    vspiId: '',
    accessCode: null,
    phone: cleanPhone(row.phone),
    email: null,
    jobTitle: row.job || null,
    percent: numberOrNull(row.percentile),
    currentSalary: null,
    targetSalary: null,
    experience: 'zalo lead',
    marketLocation: null,
    workProvince: null,
    workProvinceLabel: row.city || 'Chưa rõ',
    status: 'lead',
    amount: null,
    createdAt: row.created_at || null,
    paidAt: null,
  };
}

function toScanLead(row: ScanRow): AdminCustomer {
  return {
    sourceTable: 'scan_history',
    sourceId: row.id || null,
    product: 'lead',
    packageLabel: 'lead',
    vspiId: '',
    accessCode: null,
    phone: cleanPhone(row.phone),
    email: null,
    jobTitle: row.job_title || null,
    percent: numberOrNull(row.percent),
    currentSalary: numberOrNull(row.salary),
    targetSalary: null,
    experience: row.experience || 'scan lead',
    marketLocation: row.market_location || null,
    workProvince: row.work_province || null,
    workProvinceLabel: getProvinceLabel(row.work_province || row.market_location || 'unknown'),
    status: 'lead',
    amount: null,
    createdAt: row.scanned_at || null,
    paidAt: null,
  };
}

function buildOrderLeadKeys(purchases: PurchaseRow[], roadmaps: RoadmapRow[]): Set<string> {
  const keys = new Set<string>();
  purchases.forEach(row => keys.add(getLeadKey(cleanPhone(row.phone), row.job_title || null)));
  roadmaps.forEach(row => keys.add(getLeadKey(cleanPhone(row.phone), row.job_title || null)));
  return keys;
}

function dedupeLeadRows(rows: AdminCustomer[]): AdminCustomer[] {
  const seen = new Set<string>();
  return rows
    .sort((a, b) => safeTime(b.createdAt) - safeTime(a.createdAt))
    .filter(row => {
      const key = getLeadKey(row.phone, row.jobTitle);
      if (!row.phone || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 120);
}

function getLeadKey(phone: string | null, jobTitle: string | null): string {
  return `${phone || 'no-phone'}:${(jobTitle || '').trim().toLowerCase()}`;
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

function toCustomJobSuggestion(row: CustomJobSuggestionRow): AdminCustomJobSuggestion {
  return {
    id: row.id || '',
    jobTitle: row.job_title || '',
    salary: numberOrNull(row.salary),
    percent: numberOrNull(row.percent),
    experience: row.experience || null,
    workProvinceLabel: getProvinceLabel(row.work_province || row.market_location || 'unknown'),
    matchType: row.match_type || null,
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
