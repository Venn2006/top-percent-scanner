import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const { vspiId, phone } = await req.json();

    if (!vspiId) {
      return NextResponse.json({ error: 'Thiếu mã VSPI ID' }, { status: 400 });
    }

    const { data, error } = await supabaseServer
      .from('purchases')
      .select('vspi_id, job_title, percent, status, paid_at, phone')
      .eq('vspi_id', String(vspiId).toUpperCase())
      .eq('status', 'paid')
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return NextResponse.json({ error: 'Không tìm thấy báo cáo với mã này (hoặc chưa thanh toán)' }, { status: 404 });
    }

    // Xác thực bằng SĐT nếu có
    if (phone && data.phone && data.phone !== phone) {
      return NextResponse.json({ error: 'SĐT không khớp với mã VSPI ID này' }, { status: 403 });
    }

    return NextResponse.json({
      vspi_id:   data.vspi_id,
      job_title: data.job_title,
      percent:   data.percent,
      paid_at:   data.paid_at,
    });

  } catch (err: unknown) {
    console.error('[report-lookup]', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Lỗi server' }, { status: 500 });
  }
}
