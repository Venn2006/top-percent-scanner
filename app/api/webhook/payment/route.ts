import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

// ── Helper: chuẩn hóa chuỗi để so sánh ──────────────────────────────────────
// Xóa tất cả ký tự không phải chữ/số, uppercase
function normalize(s: string): string {
  return s.replace(/[^A-Z0-9]/gi, '').toUpperCase();
}

// ── Helper: tái tạo VSPI ID chuẩn từ 8 ký tự raw ────────────────────────────
// Input:  "2T46FKWH"  →  Output: "VSPI-2026-2T46-FKWH"
function reconstructId(raw8: string): string {
  const clean = raw8.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  return `VSPI-2026-${clean.slice(0, 4)}-${clean.slice(4, 8)}`;
}

// ── Helper: update record thành 'paid' ───────────────────────────────────────
async function markAsPaid(
  recordId: string,
  vspiId: string,
  paymentRef: string | null
): Promise<boolean> {
  const { error } = await supabaseServer
    .from('purchases')
    .update({
      status:      'paid',
      paid_at:     new Date().toISOString(),
      payment_ref: paymentRef,
    })
    .eq('id', recordId)
    .eq('status', 'pending'); // guard: chỉ update nếu vẫn còn pending

  if (error) {
    console.error('[webhook] Update error for', vspiId, ':', error.message);
    return false;
  }
  console.log(`[webhook] ✅ Confirmed: ${vspiId}`);
  return true;
}

export async function POST(req: Request) {
  try {
    // ── 1. Xác thực webhook secret ───────────────────────────────────────────
    const webhookSecret = process.env.WEBHOOK_SECRET_KEY;
    if (!webhookSecret) {
      console.error('[webhook] WEBHOOK_SECRET_KEY not configured');
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    const authHeader   = (req.headers.get('authorization') || '').trim();
    const receivedToken = authHeader.replace(/^(Apikey|Bearer)\s+/i, '').trim();

    if (receivedToken !== webhookSecret) {
      console.error('[webhook] Auth failed | header:', authHeader.slice(0, 30));
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── 2. Parse body ────────────────────────────────────────────────────────
    const body = await req.json();
    console.log('[webhook] Body:', JSON.stringify(body));

    // Chỉ xử lý giao dịch tiền vào
    if (body.transferType !== 'in') {
      return NextResponse.json({ success: true, message: 'skipped: not incoming' }, { status: 200 });
    }

    const rawContent = (body.content || '').trim();
    const paymentRef = body.referenceCode || body.id || null;

    console.log('[webhook] rawContent:', rawContent);

    if (!rawContent) {
      return NextResponse.json({ success: true, message: 'no content' }, { status: 200 });
    }

    // ── 3. Trích xuất VSPI ID — 4 lớp theo độ ưu tiên ───────────────────────
    //
    // Ngân hàng có thể biến đổi nội dung theo nhiều cách:
    //   A) Giữ nguyên:   "VSPI-2026-2T46-FKWH"
    //   B) Xóa dấu -:    "VSPI20262T46FKWH"
    //   C) Xóa dấu - và space: "VSPI20262T46FKWH" (Napas/MB Bank)
    //   D) Thêm prefix:  "VSPI VSPI-2026-2T46-FKWH"
    //   E) Viết thường:  "vspi-2026-2t46-fkwh"
    //
    // Tất cả đều được cover bởi 4 lớp dưới đây.

    let reconstructed: string | null = null;

    // ── Lớp 1: Format đầy đủ có dấu gạch ngang (case-insensitive) ────────────
    // Cover: A, D, E
    const layer1 = rawContent.toUpperCase().match(/VSPI-2026-([A-Z0-9]{4})-([A-Z0-9]{4})/);
    if (layer1) {
      reconstructed = `VSPI-2026-${layer1[1]}-${layer1[2]}`;
      console.log('[webhook] Layer 1 (full format):', reconstructed);
    }

    // ── Lớp 2: Format không có dấu gạch ngang — CASE CHÍNH CỦA BUG ──────────
    // Cover: B, C — Napas/MB Bank xóa hết dấu - và space
    // Pattern: "VSPI" + "2026" + đúng 8 ký tự alphanumeric
    if (!reconstructed) {
      const normalized = normalize(rawContent);
      const layer2 = normalized.match(/VSPI2026([A-Z0-9]{4})([A-Z0-9]{4})/);
      if (layer2) {
        reconstructed = `VSPI-2026-${layer2[1]}-${layer2[2]}`;
        console.log('[webhook] Layer 2 (no-dash, normalized):', reconstructed);
      }
    }

    // ── Lớp 3: Tìm bất kỳ chuỗi 8 ký tự sau "VSPI" và "2026" ────────────────
    // Cover: edge case ngân hàng chèn thêm ký tự lạ giữa VSPI và 2026
    // VD: "VSPI 2026 2T46FKWH" → normalize → "VSPI20262T46FKWH"
    if (!reconstructed) {
      const normalized = normalize(rawContent);
      // Tìm "VSPI" theo sau bởi "2026" (có thể có ký tự khác ở giữa, tối đa 4)
      const layer3 = normalized.match(/VSPI.{0,4}2026([A-Z0-9]{8})/);
      if (layer3 && layer3[1]) {
        reconstructed = reconstructId(layer3[1]);
        console.log('[webhook] Layer 3 (flexible prefix):', reconstructed);
      }
    }

    // ── Lớp 4: Fuzzy fallback — fetch pending trong 3 giờ qua ────────────────
    // Cover: mọi edge case còn lại, kể cả ngân hàng cắt bớt nội dung
    // Giới hạn 3 giờ để tránh fetch quá nhiều record khi scale
    if (!reconstructed) {
      console.log('[webhook] Layers 1-3 failed, trying fuzzy fallback...');

      const since3h = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
      const normalizedContent = normalize(rawContent);

      const { data: recentPending, error: fetchErr } = await supabaseServer
        .from('purchases')
        .select('id, vspi_id, status')
        .eq('status', 'pending')
        .gte('created_at', since3h)
        .order('created_at', { ascending: false })
        .limit(50); // tối đa 50 record trong 3h — đủ an toàn

      if (fetchErr) {
        console.error('[webhook] Fallback fetch error:', fetchErr.message);
        // Không throw — trả về 200 để SePay không retry vô hạn
        return NextResponse.json({ success: true, message: 'db error, will retry' }, { status: 200 });
      }

      for (const record of recentPending || []) {
        // Normalize vspi_id: "VSPI-2026-2T46-FKWH" → "VSPI20262T46FKWH"
        const idNormalized = normalize(record.vspi_id);

        // Check 2 chiều:
        // (a) ID normalized nằm trong content normalized
        // (b) Content normalized nằm trong ID normalized (content bị cắt ngắn)
        if (
          normalizedContent.includes(idNormalized) ||
          idNormalized.includes(normalizedContent.slice(-8)) // 8 ký tự cuối
        ) {
          reconstructed = record.vspi_id;
          console.log('[webhook] Layer 4 (fuzzy):', reconstructed, '| matched from:', normalizedContent);
          break;
        }
      }
    }

    // ── 4. Không tìm được ID — log và trả 200 ────────────────────────────────
    if (!reconstructed) {
      console.warn('[webhook] No VSPI ID found in content:', rawContent);
      // Trả 200 để SePay không retry — đây là giao dịch không liên quan
      return NextResponse.json({ success: true, message: 'no vspi id found' }, { status: 200 });
    }

    // ── 5. Query record theo ID đã tái tạo ───────────────────────────────────
    const { data: targetRecord, error: findErr } = await supabaseServer
      .from('purchases')
      .select('id, vspi_id, status')
      .eq('vspi_id', reconstructed)
      .maybeSingle();

    if (findErr) {
      console.error('[webhook] Find error:', findErr.message);
      return NextResponse.json({ success: true, message: 'db error' }, { status: 200 });
    }

    if (!targetRecord) {
      console.warn('[webhook] Record not found for:', reconstructed);
      return NextResponse.json({ success: true, message: 'record not found' }, { status: 200 });
    }

    // Đã paid rồi — idempotent, trả success
    if (targetRecord.status === 'paid') {
      console.log('[webhook] Already paid:', reconstructed);
      return NextResponse.json({ success: true, message: 'already paid' }, { status: 200 });
    }

    // ── 6. Update thành 'paid' ────────────────────────────────────────────────
    const updated = await markAsPaid(targetRecord.id, reconstructed, paymentRef);

    if (!updated) {
      // Update thất bại (race condition hoặc DB lỗi) — trả 200 để SePay không retry
      return NextResponse.json({ success: true, message: 'update failed, check logs' }, { status: 200 });
    }

    // ── 7. Trả 200 + success: true — SePay hiển thị "Thành công" ─────────────
    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[webhook] Unhandled error:', message);
    // Luôn trả 200 để SePay không retry vô hạn
    return NextResponse.json({ success: true, error: 'internal error' }, { status: 200 });
  }
}
