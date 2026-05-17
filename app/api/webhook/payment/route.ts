import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase'; // Đã đổi tên ở đây cho khớp với file của anh

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get('authorization') || '';

    // ĐIỀN CỨNG MẬT KHẨU
    const mySecretKey = "o000080";

    if (!authHeader.includes(mySecretKey)) {
      return NextResponse.json({ thong_bao: "SAI MẬT KHẨU RỒI VERECEL ƠI" }, { status: 401 });
    }

    const body = await req.json();
    if (body.transferType !== 'in') {
      return NextResponse.json({ message: 'ok' }, { status: 200 });
    }

    const cleanContent = (body.content || '').replace(/[\s-]/g, '').toUpperCase();

    // GỌI DATABASE ĐỂ TÌM MÃ (Đã đổi thành supabaseServer)
    const { data: records, error: dbError } = await supabaseServer
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

    // CẬP NHẬT TRẠNG THÁI (Đã đổi thành supabaseServer)
    if (targetRecord) {
      await supabaseServer.from('purchases').update({ status: 'paid' }).eq('id', targetRecord.id);
    }

    return NextResponse.json({ success: true }, { status: 200 });

  } catch (error: any) {
    return NextResponse.json({ loi: error.message }, { status: 500 });
  }
}