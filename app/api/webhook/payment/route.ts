import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

export async function POST(req: Request) {
  try {
    // ── Xác thực webhook secret ──────────────────────────────────────────────
    // SePay gửi header: "Apikey <WEBHOOK_SECRET_KEY>"
    // Logic: lấy phần sau "Apikey " hoặc "Bearer " rồi so sánh exact
    const webhookSecret = process.env.WEBHOOK_SECRET_KEY;
    if (!webhookSecret) {
      console.error('[webhook] WEBHOOK_SECRET_KEY is not configured');
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 });
    }

    const authHeader = (req.headers.get('authorization') || '').trim();
    // Lấy token: bỏ prefix "Apikey " hoặc "Bearer " nếu có, rồi trim
    const receivedToken = authHeader
      .replace(/^(Apikey|Bearer)\s+/i, '')
      .trim();

    // So sánh exact (không dùng includes để tránh false positive)
    if (receivedToken !== webhookSecret) {
      console.error(
        '[webhook] Auth failed — expected:',
        webhookSecret.slice(0, 4) + '****',
        '| received header:',
        authHeader.slice(0, 20) + (authHeader.length > 20 ? '...' : '')
      );
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Parse body ───────────────────────────────────────────────────────────
    const body = await req.json();
    console.log('[webhook] Received body:', JSON.stringify(body));

    // Chỉ xử lý giao dịch tiền vào
    if (body.transferType !== 'in') {
      return NextResponse.json({ message: 'ok' }, { status: 200 });
    }

    // ── Chuẩn hóa nội dung chuyển khoản ─────────────────────────────────────
    const rawContent = body.content || '';
    // Xóa khoảng trắng và dấu gạch ngang để normalize
    const cleanContent = rawContent.replace(/[\s]/g, '').toUpperCase();

    console.log('[webhook] Raw content:', rawContent);
    console.log('[webhook] Clean content:', cleanContent);

    if (!cleanContent) {
      return NextResponse.json({ message: 'no content' }, { status: 200 });
    }

    // ── Chiến lược match VSPI ID — 3 lớp ────────────────────────────────────
    //
    // VSPI ID format trong DB:  VSPI-2026-XXXX-XXXX  (có dấu gạch ngang)
    // Nội dung CK user nhập:    VSPI VSPI-2026-XXXX-XXXX  (có thể có prefix "VSPI ")
    //
    // Lớp 1: Match format đầy đủ có dấu gạch ngang (user copy đúng)
    //   VD: "VSPI VSPI-2026-3NAH-4NCM" → match "VSPI-2026-3NAH-4NCM"
    //
    // Lớp 2: Match format không có dấu gạch ngang (user tự gõ)
    //   VD: "VSPI20263NAH4NCM" → reconstruct "VSPI-2026-3NAH-4NCM"
    //
    // Lớp 3: Fallback — fetch tất cả pending và so sánh substring
    //   Dùng khi user nhập nội dung không chuẩn

    let reconstructed: string | null = null;

    // Lớp 1: tìm pattern VSPI-2026-XXXX-XXXX trong nội dung gốc (giữ dấu gạch ngang)
    const fullPattern = rawContent.toUpperCase().match(/VSPI-2026-[A-Z0-9]{4}-[A-Z0-9]{4}/);
    if (fullPattern) {
      reconstructed = fullPattern[0];
      console.log('[webhook] Layer 1 match:', reconstructed);
    }

    // Lớp 2: tìm trong cleanContent (đã xóa khoảng trắng, giữ dấu gạch ngang)
    if (!reconstructed) {
      const cleanWithDash = rawContent.replace(/\s/g, '').toUpperCase();
      const dashPattern = cleanWithDash.match(/VSPI-2026-[A-Z0-9]{4}-[A-Z0-9]{4}/);
      if (dashPattern) {
        reconstructed = dashPattern[0];
        console.log('[webhook] Layer 2 match:', reconstructed);
      }
    }

    // Lớp 3: tìm trong cleanContent không có dấu gạch ngang
    if (!reconstructed) {
      // Match đúng 8 ký tự sau "VSPI2026"
      const noDashPattern = cleanContent.match(/VSPI2026([A-Z0-9]{4})([A-Z0-9]{4})/);
      if (noDashPattern) {
        reconstructed = `VSPI-2026-${noDashPattern[1]}-${noDashPattern[2]}`;
        console.log('[webhook] Layer 3 match:', reconstructed);
      }
    }

    // Lớp 4: Fallback — fetch tất cả pending và so sánh substring
    // Dùng khi user nhập nội dung không theo format chuẩn
    if (!reconstructed) {
      console.log('[webhook] No pattern match, trying fallback substring search...');

      const { data: pendingRecords, error: fetchError } = await supabaseServer
        .from('purchases')
        .select('id, vspi_id, status')
        .eq('status', 'pending');

      if (fetchError) {
        console.error('[webhook] Fallback fetch error:', fetchError.message);
        throw fetchError;
      }

      // So sánh: xóa dấu gạch ngang của vspi_id rồi tìm trong cleanContent
      for (const record of pendingRecords || []) {
        const idClean = String(record.vspi_id).replace(/[-\s]/g, '').toUpperCase();
        if (cleanContent.includes(idClean)) {
          reconstructed = record.vspi_id;
          console.log('[webhook] Layer 4 fallback match:', reconstructed);
          break;
        }
      }
    }

    if (!reconstructed) {
      console.log('[webhook] No VSPI ID found in content:', cleanContent);
      return NextResponse.json({ message: 'no vspi id found' }, { status: 200 });
    }

    // ── Query record ─────────────────────────────────────────────────────────
    const { data: targetRecord, error: findError } = await supabaseServer
      .from('purchases')
      .select('id, vspi_id, status')
      .eq('vspi_id', reconstructed)
      .eq('status', 'pending')
      .maybeSingle();

    if (findError) {
      console.error('[webhook] DB find error:', findError.message);
      throw findError;
    }

    if (!targetRecord) {
      console.log('[webhook] Record not found or already paid for:', reconstructed);
      return NextResponse.json({ message: 'record not found or already processed' }, { status: 200 });
    }

    // ── Cập nhật trạng thái ──────────────────────────────────────────────────
    const { error: updateError } = await supabaseServer
      .from('purchases')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        payment_ref: body.referenceCode || body.id || null,
      })
      .eq('id', targetRecord.id)
      .eq('status', 'pending');

    if (updateError) {
      console.error('[webhook] DB update error:', updateError.message);
      throw updateError;
    }

    console.log(`[webhook] ✅ Payment confirmed for VSPI ID: ${reconstructed}`);
    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[webhook] Unhandled error:', message);
    return NextResponse.json({ error: 'Internal error' }, { status: 200 });
  }
}
