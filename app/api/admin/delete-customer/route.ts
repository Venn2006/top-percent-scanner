import { NextRequest, NextResponse } from 'next/server';
import { protectAdminRequest } from '@/lib/adminRequest';
import { supabaseServer } from '@/lib/supabaseServer';
import { cleanRoadmapAccessCode } from '@/lib/roadmapAccess';
import { issueRoadmapAccessCode } from '@/lib/roadmapAccessServer';

type DeleteMode = 'row' | 'phone' | 'vspi' | 'accessCode';
type DeleteProduct = 'report29' | 'roadmap79' | 'all';
type CleanupTable = 'purchases' | 'roadmaps' | 'scan_history' | 'data_deletion_requests' | 'zalo_subscribers';

interface DeletePayload {
  mode?: DeleteMode | 'record';
  id?: string;
  rowId?: string;
  table?: CleanupTable;
  sourceTable?: CleanupTable;
  phone?: string | null;
  vspiId?: string | null;
  accessCode?: string | null;
  product?: DeleteProduct | 'premium' | 'roadmap';
  dryRun?: boolean;
}

interface DeleteResult {
  table: string;
  column: string;
  value: string;
  deleted: number;
  skipped?: boolean;
  reason?: string;
}

const ROW_TABLES = new Set<CleanupTable>([
  'purchases',
  'roadmaps',
  'scan_history',
  'data_deletion_requests',
  'zalo_subscribers',
]);

const VSPI_TABLES: Array<{ table: 'purchases' | 'roadmaps' | 'payment_events'; column: string }> = [
  { table: 'purchases', column: 'vspi_id' },
  { table: 'roadmaps', column: 'vspi_id' },
  { table: 'payment_events', column: 'vspi_id' },
];

function jsonError(error: string, status: number) {
  return NextResponse.json({ error }, { status });
}

function cleanText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function cleanPhone(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\D/g, '') : '';
}

function maskPhone(phone: string): string {
  if (phone.length < 7) return phone ? '***' : '';
  return `${phone.slice(0, 3)}****${phone.slice(-3)}`;
}

function isMissingTableError(error: { message?: string } | null | undefined): boolean {
  return Boolean(error?.message && /relation|schema cache|does not exist/i.test(error.message));
}

function normalizeMode(value: unknown): DeleteMode | null {
  if (value === 'record') return 'row';
  return value === 'row' || value === 'phone' || value === 'vspi' || value === 'accessCode' ? value : null;
}

function normalizeProduct(value: unknown): DeleteProduct {
  if (value === 'premium' || value === 'report29') return 'report29';
  if (value === 'roadmap' || value === 'roadmap79') return 'roadmap79';
  return 'all';
}

function normalizeTable(value: unknown): CleanupTable | null {
  return typeof value === 'string' && ROW_TABLES.has(value as CleanupTable) ? value as CleanupTable : null;
}

function tableForRow(product: DeleteProduct, explicitTable: CleanupTable | null): CleanupTable | null {
  if (explicitTable) return explicitTable;
  if (product === 'report29') return 'purchases';
  if (product === 'roadmap79') return 'roadmaps';
  return null;
}

async function safeCount(table: string, column: string, value: string): Promise<DeleteResult> {
  if (!value) return { table, column, value, deleted: 0, skipped: true, reason: 'missing_identifier' };
  const result = await supabaseServer
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq(column, value);

  if (result.error) {
    if (isMissingTableError(result.error)) return { table, column, value, deleted: 0, skipped: true, reason: 'missing_table' };
    throw result.error;
  }

  return { table, column, value, deleted: result.count ?? 0 };
}

async function safeDelete(table: string, column: string, value: string, dryRun: boolean): Promise<DeleteResult> {
  if (dryRun) return safeCount(table, column, value);
  if (!value) return { table, column, value, deleted: 0, skipped: true, reason: 'missing_identifier' };
  const result = await supabaseServer
    .from(table)
    .delete({ count: 'exact' })
    .eq(column, value);

  if (result.error) {
    if (isMissingTableError(result.error)) return { table, column, value, deleted: 0, skipped: true, reason: 'missing_table' };
    throw result.error;
  }

  return { table, column, value, deleted: result.count ?? 0 };
}

async function fetchIdentifiersByRow(table: CleanupTable, id: string) {
  const result = await supabaseServer
    .from(table)
    .select('id, phone, vspi_id, payment_ref')
    .eq('id', id)
    .maybeSingle();

  if (result.error) {
    if (isMissingTableError(result.error)) return { phone: '', vspiId: '', paymentRef: '' };
    if (/column|payment_ref|vspi_id/i.test(result.error.message)) {
      const fallback = await supabaseServer
        .from(table)
        .select('id, phone')
        .eq('id', id)
        .maybeSingle();
      if (fallback.error) throw fallback.error;
      return { phone: cleanPhone(fallback.data?.phone), vspiId: '', paymentRef: '' };
    }
    throw result.error;
  }

  return {
    phone: cleanPhone(result.data?.phone),
    vspiId: cleanText(result.data?.vspi_id),
    paymentRef: cleanText(result.data?.payment_ref),
  };
}

async function fetchLinkedIdsByPhone(phone: string) {
  const ids = new Set<string>();
  const refs = new Set<string>();
  const [purchases, roadmaps] = await Promise.all([
    supabaseServer.from('purchases').select('vspi_id, payment_ref').eq('phone', phone),
    supabaseServer.from('roadmaps').select('vspi_id, payment_ref').eq('phone', phone),
  ]);

  if (purchases.error && !isMissingTableError(purchases.error)) throw purchases.error;
  if (roadmaps.error && !isMissingTableError(roadmaps.error)) throw roadmaps.error;

  for (const row of purchases.data || []) {
    if (row.vspi_id) ids.add(String(row.vspi_id));
    if (row.payment_ref) refs.add(String(row.payment_ref));
  }
  for (const row of roadmaps.data || []) {
    if (row.vspi_id) ids.add(String(row.vspi_id));
    if (row.payment_ref) refs.add(String(row.payment_ref));
  }
  return { vspiIds: Array.from(ids), paymentRefs: Array.from(refs) };
}

async function fetchPaymentRefsByVspi(vspiId: string) {
  const refs = new Set<string>();
  const [purchases, roadmaps] = await Promise.all([
    supabaseServer.from('purchases').select('payment_ref').eq('vspi_id', vspiId),
    supabaseServer.from('roadmaps').select('payment_ref').eq('vspi_id', vspiId),
  ]);

  if (purchases.error && !isMissingTableError(purchases.error)) throw purchases.error;
  if (roadmaps.error && !isMissingTableError(roadmaps.error)) throw roadmaps.error;

  for (const row of purchases.data || []) if (row.payment_ref) refs.add(String(row.payment_ref));
  for (const row of roadmaps.data || []) if (row.payment_ref) refs.add(String(row.payment_ref));
  return Array.from(refs);
}

async function findVspiByAccessCode(accessCode: string): Promise<string> {
  const result = await supabaseServer
    .from('roadmaps')
    .select('vspi_id')
    .order('created_at', { ascending: false })
    .limit(1000);

  if (result.error) throw result.error;
  const match = (result.data || []).find(row => row.vspi_id && issueRoadmapAccessCode(String(row.vspi_id)) === accessCode);
  return match?.vspi_id ? String(match.vspi_id) : '';
}

async function cleanupByVspi(vspiId: string, product: DeleteProduct, dryRun: boolean): Promise<DeleteResult[]> {
  const paymentRefs = await fetchPaymentRefsByVspi(vspiId);
  const results: DeleteResult[] = [];
  const tables = product === 'report29'
    ? VSPI_TABLES.filter(item => item.table !== 'roadmaps')
    : product === 'roadmap79'
      ? VSPI_TABLES.filter(item => item.table !== 'purchases')
      : VSPI_TABLES;

  for (const item of tables) {
    results.push(await safeDelete(item.table, item.column, vspiId, dryRun));
  }
  for (const paymentRef of paymentRefs) {
    results.push(await safeDelete('payment_events', 'payment_ref', paymentRef, dryRun));
  }
  return results;
}

async function cleanupByPhone(phone: string, dryRun: boolean): Promise<DeleteResult[]> {
  const linked = await fetchLinkedIdsByPhone(phone);
  const results: DeleteResult[] = [
    await safeDelete('scan_history', 'phone', phone, dryRun),
    await safeDelete('purchases', 'phone', phone, dryRun),
    await safeDelete('roadmaps', 'phone', phone, dryRun),
    await safeDelete('data_deletion_requests', 'phone', phone, dryRun),
    await safeDelete('zalo_subscribers', 'phone', phone, dryRun),
  ];

  for (const vspiId of linked.vspiIds) {
    results.push(await safeDelete('payment_events', 'vspi_id', vspiId, dryRun));
  }
  for (const paymentRef of linked.paymentRefs) {
    results.push(await safeDelete('payment_events', 'payment_ref', paymentRef, dryRun));
  }
  return results;
}

async function cleanupByRow(table: CleanupTable, id: string, product: DeleteProduct, dryRun: boolean): Promise<DeleteResult[]> {
  const identifiers = await fetchIdentifiersByRow(table, id);
  const results: DeleteResult[] = [await safeDelete(table, 'id', id, dryRun)];

  if (identifiers.vspiId) {
    results.push(...await cleanupByVspi(identifiers.vspiId, product, dryRun));
  } else if (identifiers.paymentRef) {
    results.push(await safeDelete('payment_events', 'payment_ref', identifiers.paymentRef, dryRun));
  }

  return results;
}

export async function POST(req: NextRequest) {
  try {
    const adminError = protectAdminRequest(req, 'admin-delete-customer', { maxRequests: 50 });
    if (adminError) return adminError;

    const body = await req.json().catch(() => ({})) as DeletePayload;
    const mode = normalizeMode(body.mode);
    const product = normalizeProduct(body.product);
    const dryRun = body.dryRun === true;
    const id = cleanText(body.id || body.rowId);
    const phone = cleanPhone(body.phone);
    const vspiId = cleanText(body.vspiId);
    const accessCode = cleanRoadmapAccessCode(body.accessCode);
    const rowTable = tableForRow(product, normalizeTable(body.table || body.sourceTable));

    if (!mode) return jsonError('Missing or invalid delete mode', 400);

    let results: DeleteResult[] = [];
    if (mode === 'row') {
      if (!id || !rowTable) return jsonError('Missing row id or table', 400);
      results = await cleanupByRow(rowTable, id, product, dryRun);
    } else if (mode === 'phone') {
      if (!phone) return jsonError('Missing phone', 400);
      results = await cleanupByPhone(phone, dryRun);
    } else if (mode === 'vspi') {
      if (!vspiId) return jsonError('Missing vspiId', 400);
      results = await cleanupByVspi(vspiId, product, dryRun);
    } else if (mode === 'accessCode') {
      if (!accessCode) return jsonError('Missing accessCode', 400);
      const matchedVspiId = await findVspiByAccessCode(accessCode);
      if (!matchedVspiId) return jsonError('Access code not found', 404);
      results = await cleanupByVspi(matchedVspiId, 'roadmap79', dryRun);
    }

    const totalDeleted = results.reduce((sum, item) => sum + item.deleted, 0);
    if (phone) console.info('[admin/delete-customer]', { mode, dryRun, phone: maskPhone(phone), deleted: totalDeleted });
    return NextResponse.json({
      success: true,
      dryRun,
      mode,
      product,
      id: id || null,
      vspiId: vspiId || null,
      phone: phone ? maskPhone(phone) : null,
      deleted: totalDeleted,
      results,
      message: dryRun ? 'Dry-run cleanup ready.' : 'Đã xóa dữ liệu test.',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown admin delete error';
    console.error('[admin/delete-customer]', message);
    return NextResponse.json({ error: 'Không xóa được dữ liệu. Vui lòng thử lại hoặc kiểm tra quyền admin.' }, { status: 500 });
  }
}
