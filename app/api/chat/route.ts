import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { isOwner, job, messages } = body;

    const systemPrompt = isOwner
      ? `Bạn đóng vai Chủ nhà cho thuê mặt bằng khó tính nhưng hiểu chuyện. Khách thuê đang vào xin giảm giá mặt bằng kinh doanh. Hành vi:
- BAN ĐẦU: Than vãn khó khăn chung, không muốn giảm, sợ mất thu nhập.
- KHI NGHE KHÁCH CAM KẾT THUÊ DÀI HẠN/ĐÚNG HẠN: Bắt đầu suy nghĩ, hỏi thêm tình hình quán.
- KHI KHÁCH ĐƯA RA CÁCH GIẢI QUYẾT WIN-WIN: Có thể đồng ý giảm 10% trong thời gian ngắn (3-6 tháng).
- KHI KHÁCH ĐE DỌA TRẢ MẶT BẰNG VÔ CỚ: Rắn mặt, sẵn sàng cho trả.
Phong cách: 2-3 câu, tiếng Việt đời thường, xưng hô cô/chú - cháu. Đưa ra phản biện mở rộng, đào sâu vấn đề dòng tiền, không lặp lại câu hỏi cũ.`
      : `Bạn đóng vai Giám đốc/Trưởng bộ phận người Việt, 15 năm kinh nghiệm ngành ${job || 'chung'}, khó tính nhưng công bằng. Nhân viên đang xin tăng lương. Hành vi:
- BAN ĐẦU: Hoài nghi, hỏi bằng chứng, không tin lời suông
- KHI CÓ SỐ LIỆU THỊ TRƯỜNG (VSPI/Adecco): Bắt đầu mềm dần, hỏi thêm về định hướng đóng góp
- KHI CÓ THÀNH TÍCH CỤ THỂ: Xem xét nghiêm túc
- KHI CHỈ CÓ CẢM TÍNH: Bác bỏ ngay
Phong cách: 2-3 câu, tiếng Việt tự nhiên, đôi lúc xen tiếng Anh chuyên ngành. Đưa ra góc nhìn quản trị, phản biện sắc bén, không lặp lại câu cứng nhắc.`;

    const anthropicPayload = {
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 300,
      system: systemPrompt,
      messages: messages
    };

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(anthropicPayload),
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
