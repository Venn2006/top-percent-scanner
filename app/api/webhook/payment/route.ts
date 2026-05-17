import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Service role key, không phải anon key
);

export async function POST(req: NextRequest) {
  const body = await req.json();
  
  // Sepay webhook format — điều chỉnh nếu dùng PayOS
  const { content, transferAmount, success } = body;
  
  if (!success || transferAmount < 49000) {
    return NextResponse.json({ message: 'ignored' });
  }

  // Tìm VSPI ID trong nội dung chuyển khoản
  const vspiMatch = content?.match(/VSPI-2026-[A-Z0-9]{4}-[A-Z0-9]{4}/);
  if (!vspiMatch) {
    return NextResponse.json({ message: 'no vspi id found' });
  }

  const vspiId = vspiMatch[0];

  // Cập nhật trạng thái paid
  const { data } = await supabase
    .from('purchases')
    .update({ status: 'paid', paid_at: new Date().toISOString(), payment_ref: content })
    .eq('vspi_id', vspiId)
    .select()
    .single();

  if (data) {
    // TODO: Gửi Zalo/Email thông báo cho khách
    // Có thể dùng Zalo OA API hoặc Resend email
    console.log(`Payment confirmed for ${vspiId} - notify ${data.phone || data.email}`);
  }

  return NextResponse.json({ message: 'ok' });
}
