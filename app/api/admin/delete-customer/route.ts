import { NextRequest, NextResponse } from 'next/server';
import { protectAdminRequest } from '@/lib/adminRequest';
import { supabaseServer } from '@/lib/supabaseServer';

type Product = 'premium' | 'roadmap';
type DeleteMode = 'record' | 'phone';

const PRODUCT_TABLE: Record<Product, string> = {
  premium: 'purchases',
  roadmap: 'roadmaps',
};

function cleanPhone(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\D/g, '') : '';
}

function isMissingTableError(error: { message?: string } | null | undefined): boolean {
  return Boolean(error?.message && /relation|schema cache|does not exist/i.test(error.message));
}

async function safeDelete(table: string, column: string, value: string) {
  if (!value) return { table, deleted: 0, skipped: true };
  const result = await supabaseServer
    .from(table)
    .delete({ count: 'exact' })
    .eq(column, value);

  if (result.error) {
    if (isMissingTableError(result.error)) return { table, deleted: 0, skipped: true };
    throw result.error;
  }

  return { table, deleted: result.count ?? 0, skipped: false };
}

async function fetchVspiIdsByPhone(phone: string): Promise<string[]> {
  const ids = new Set<string>();
  const [purchases, roadmaps] = await Promise.all([
    supabaseServer.from('purchases').select('vspi_id').eq('phone', phone),
    supabaseServer.from('roadmaps').select('vspi_id').eq('phone', phone),
  ]);

  if (purchases.error && !isMissingTableError(purchases.error)) throw purchases.error;
  if (roadmaps.error && !isMissingTableError(roadmaps.error)) throw roadmaps.error;

  (purchases.data || []).forEach(row => row.vspi_id && ids.add(String(row.vspi_id)));
  (roadmaps.data || []).forEach(row => row.vspi_id && ids.add(String(row.vspi_id)));
  return Array.from(ids);
}

export async function POST(req: NextRequest) {
  try {
    const adminError = protectAdminRequest(req, 'admin-delete-customer', { maxRequests: 50 });
    if (adminError) return adminError;

    const body = await req.json().catch(() => ({}));
    const {
      vspiId,
      phone,
      product,
      mode,
    } = body as {
      vspiId?: string;
      phone?: string | null;
      product?: Product;
      mode?: DeleteMode;
    };

    const cleanVspiId = typeof vspiId === 'string' ? vspiId.trim() : '';
    const cleanProduct: Product = product === 'roadmap' ? 'roadmap' : 'premium';
    const cleanMode: DeleteMode = mode === 'phone' ? 'phone' : 'record';
    const cleanPhoneValue = cleanPhone(phone);

    if (cleanMode === 'record' && !cleanVspiId) {
      return NextResponse.json({ error: 'Missing vspiId' }, { status: 400 });
    }
    if (cleanMode === 'phone' && !cleanPhoneValue) {
      return NextResponse.json({ error: 'Missing phone' }, { status: 400 });
    }

    const results: Array<{ table: string; deleted: number; skipped?: boolean }> = [];

    if (cleanMode === 'record') {
      results.push(await safeDelete(PRODUCT_TABLE[cleanProduct], 'vspi_id', cleanVspiId));
      results.push(await safeDelete('payment_events', 'vspi_id', cleanVspiId));
    } else {
      const vspiIds = await fetchVspiIdsByPhone(cleanPhoneValue);
      results.push(await safeDelete('scan_history', 'phone', cleanPhoneValue));
      results.push(await safeDelete('purchases', 'phone', cleanPhoneValue));
      results.push(await safeDelete('roadmaps', 'phone', cleanPhoneValue));
      results.push(await safeDelete('data_deletion_requests', 'phone', cleanPhoneValue));
      for (const id of vspiIds) {
        results.push(await safeDelete('payment_events', 'vspi_id', id));
      }
    }

    const totalDeleted = results.reduce((sum, item) => sum + item.deleted, 0);
    return NextResponse.json({
      success: true,
      mode: cleanMode,
      vspiId: cleanVspiId || null,
      phone: cleanPhoneValue || null,
      deleted: totalDeleted,
      results,
      message: `Đã xóa ${totalDeleted} record${cleanMode === 'phone' ? ` theo SĐT ${cleanPhoneValue}` : ''}`,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown admin delete error';
    console.error('[admin/delete-customer]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
