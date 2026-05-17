import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase'; // Đường dẫn này phải khớp với project của anh

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const mySecretKey = (process.env.SEPAY_API_KEY || '').trim();

    // CHIÊU BẮT BỆNH: Báo thẳng ra SePay nếu sai mật khẩu
    if (!mySecretKey || !authHeader.includes(mySecretKey)) {
      return NextResponse.json({
        tinh_trang: "MẬT KHẨU KHÔNG KHỚP!",
        sepay_dang_mang_den: authHeader,
        vercel_dang_luu_la: mySecretKey || "BỊ TRỐNG (Vercel chưa nhận được biến môi trường)"
      }, { status: 401 });
    }

    // NẾU KHỚP MẬT KHẨU -> CHẠY TIẾP
    const body = await req.json();
    if (body.transferType !== 'in') {
      return NextResponse.json({ message: 'Không phải tiền vào' }, { status: 200 });
    }

    // XỬ LÝ NỘI DUNG CHUYỂN KHOẢN (Bỏ gạch ngang)
    const rawContent = body.content || '';
    const cleanContent = rawContent.replace(/[\s-]/g, '').toUpperCase();

    // LẤY DATABASE RA ĐỐI CHIẾU
    const { data: records, error: dbError } = await supabaseAdmin
      .from('purchases')
      .select('*')
      .eq('status', 'pending');

    if (dbError) throw dbError;

    let targetRecord = null;
    for (const record of records || []) {
      // Lưu ý: Em đã đổi thành vspi_id theo đúng bảng SQL lúc nãy của anh
      const dbIdClean = String(record.vspi_id).replace(/[\s-]/g, '').toUpperCase();
      if (cleanContent.includes(dbIdClean)) {
        targetRecord = record;
        break;
      }
    }

    // CẬP NHẬT TRẠNG THÁI ĐÃ THANH TOÁN
    if (targetRecord) {
      await supabaseAdmin
        .from('purchases')
        .update({ status: 'paid' })
        .eq('id', targetRecord.id);
    }

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error: any) {
    console.error('Webhook error:', error);
    return NextResponse.json({ loi_he_thong: error.message }, { status: 500 });
  }
}