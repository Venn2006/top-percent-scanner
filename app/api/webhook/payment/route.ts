import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Khởi tạo Supabase Admin với quyền Service Role để bypass RLS
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    // 1. Xác thực bảo mật từ SePay
    const authHeader = req.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Apikey ')) {
      return NextResponse.json({ error: 'Missing or invalid Authorization header' }, { status: 401 });
    }

    const apikey = authHeader.replace('Apikey ', '');
    if (apikey !== process.env.SEPAY_API_KEY) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Đọc payload JSON
    const body = await req.json();

    // 3. Chỉ xử lý các giao dịch nhận tiền ("in")
    if (body.transferType !== 'in') {
      return NextResponse.json({ success: true, message: 'Ignored non-in transfer' }, { status: 200 });
    }

    // 4. Trích xuất mã giao dịch (vspiId) từ nội dung chuyển khoản
    const content = body.content || '';
    // Regex tìm chuỗi có dạng VSPI [Dấu cách] [Mã] (Mã thường gồm chữ cái hoa và số)
    const match = content.match(/VSPI\s+([A-Z0-9]+)/i);
    
    if (!match || !match[1]) {
      // Trả về 200 để SePay không gửi lại nhiều lần nếu nội dung sai chuẩn
      return NextResponse.json({ success: true, message: 'No VSPI ID found in content' }, { status: 200 });
    }

    const vspiId = match[1].toUpperCase();

    // 5. Cập nhật trạng thái database
    const { error } = await supabaseAdmin
      .from('purchases')
      .update({ status: 'paid', updated_at: new Date().toISOString() })
      .eq('vspi_id', vspiId);

    if (error) {
      console.error('Supabase update error:', error);
      return NextResponse.json({ error: 'Database update failed' }, { status: 500 });
    }

    // 6. Hoàn tất thành công
    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('Webhook Error:', error);
    // Vẫn trả về 500 để SePay có thể retry theo policy của họ nếu gặp lỗi logic cục bộ
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
