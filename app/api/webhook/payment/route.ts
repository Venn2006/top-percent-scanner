import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || '';

    // 1. DẸP BIẾN MÔI TRƯỜNG, ĐIỀN CỨNG MẬT KHẨU CỦA ANH VÀO ĐÂY:
    const mySecretKey = "o000080";

    // Nếu không khớp, chửi bằng tiếng Việt luôn
    if (!authHeader.includes(mySecretKey)) {
      return NextResponse.json({ thong_bao: "SAI MẬT KHẨU RỒI VERECEL ƠI" }, { status: 401 });
    }

    // 2. NHẬN TIỀN VÀ BỎ GẠCH NGANG
    const body = await req.json();
    if (body.transferType !== 'in') {
      return NextResponse.json({ message: 'ok' }, { status: 200 });
    }

    const cleanContent = (body.content || '').replace(/[\s-]/g, '').toUpperCase();

    // 3. TÌM VÀ MỞ KHÓA TRONG DATABASE
    const { data: records, error: dbError } = await supabaseAdmin
      .from('purchases')
      .select('*')
      .eq('status', 'pending');

    if (dbError) throw dbError;

    let targetRecord = null;
    for (const record of records || []) {
      const dbIdClean = String(record.vspi_id).replace(/[\s-]/g, '').toUpperCase();
      if (cleanContent.includes(dbIdClean)) {
        targetRecord = record;
        break;
      }
    }

    if (targetRecord) {
      await supabaseAdmin.from('purchases').update({ status: 'paid' }).eq('id', targetRecord.id);
    }

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error: any) {
    return NextResponse.json({ loi: error.message }, { status: 500 });
  }
}