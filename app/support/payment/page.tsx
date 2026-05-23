import Link from 'next/link';

export const metadata = {
  title: 'Hỗ trợ thanh toán — VSPI Scanner',
  robots: { index: false, follow: false },
};

export default function PaymentSupportPage() {
  return (
    <main className="min-h-screen bg-[#0a0c10] px-4 py-12 text-[#f0ede8]">
      <div className="mx-auto max-w-md space-y-6">
        <Link href="/" className="text-[11px] font-mono text-[#f0ede8]/45 hover:text-[#e8b84b]">
          ← Quay về trang chủ
        </Link>

        <div>
          <p className="text-xs font-black text-[#e8b84b]">Hỗ trợ thanh toán</p>
          <h1 className="mt-2 text-3xl font-black text-white">Đã chuyển khoản nhưng chưa mở khóa?</h1>
          <p className="mt-2 text-sm leading-6 text-white/55">
            Hệ thống thường xác nhận trong 10-60 giây. Nếu quá 2 phút chưa mở khóa, gửi thông tin bên dưới để được xác nhận bằng tay.
          </p>
        </div>

        <div className="rounded-3xl border border-white/10 bg-[#111722] p-5 space-y-4">
          {[
            ['VSPI ID', 'Mã VSPI-2026-XXXX-XXXX hoặc nội dung chuyển khoản đã bỏ dấu gạch ngang'],
            ['Ảnh giao dịch', 'Chụp màn hình có số tiền, thời gian, mã giao dịch'],
            ['SĐT / Zalo', 'Số đã nhập khi mua để đối chiếu đơn hàng'],
          ].map(([title, text]) => (
            <div key={title} className="rounded-2xl border border-white/8 bg-[#0a0c10] px-4 py-3">
              <p className="text-sm font-black text-white">{title}</p>
              <p className="mt-1 text-xs leading-5 text-white/45">{text}</p>
            </div>
          ))}

          <div className="rounded-2xl border border-[#e8b84b]/25 bg-[#e8b84b]/10 px-4 py-4">
            <p className="text-xs text-white/60">Zalo hỗ trợ</p>
            <p className="mt-1 font-mono text-xl font-black text-[#e8b84b]">0915 662 876</p>
            <p className="mt-2 text-[11px] leading-5 text-white/45">
              Gửi cú pháp: VSPI ID + ảnh giao dịch + gói đã mua (29k Premium hoặc 79k Roadmap).
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
