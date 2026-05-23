import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Chính sách bảo mật — VSPI Scanner",
  description: "Chính sách bảo mật và quyền riêng tư của VSPI Scanner.",
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-[#0a0c10] text-[#f0ede8] font-sans py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-10">
          <Link
            href="/"
            className="text-[11px] font-mono text-[#f0ede8]/45 hover:text-[#e8b84b] transition-colors mb-6 inline-block"
          >
            ← Quay về trang chủ
          </Link>
          <h1 className="text-3xl font-serif font-black text-[#e8b84b] mb-2">
            Chính sách bảo mật
          </h1>
          <p className="text-[11px] font-mono text-[#f0ede8]/45">
            Cập nhật lần cuối: 01/01/2026 · VSPI Scanner
          </p>
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-[#f0ede8]/80">
          {/* 1 */}
          <section>
            <h2 className="text-base font-bold text-[#f0ede8] mb-3 border-l-4 border-[#e8b84b] pl-3">
              1. Dữ liệu chúng tôi thu thập
            </h2>
            <p className="mb-3">
              Khi bạn sử dụng VSPI Scanner, chúng tôi có thể thu thập các thông tin sau:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-[#f0ede8]/70">
              <li>
                <strong className="text-[#f0ede8]">Họ và tên:</strong> Được nhập tùy chọn để in trên chứng nhận VSPI cá nhân hóa.
              </li>
              <li>
                <strong className="text-[#f0ede8]">Nghề nghiệp / Ngành nghề:</strong> Dùng để tra cứu dữ liệu lương theo ngành và tính toán phân vị thu nhập.
              </li>
              <li>
                <strong className="text-[#f0ede8]">Thu nhập hàng tháng:</strong> Dùng để so sánh với dữ liệu thị trường và xác định vị trí phân vị của bạn.
              </li>
              <li>
                <strong className="text-[#f0ede8]">Số điện thoại / Email (tùy chọn):</strong> Chỉ thu thập khi bạn mua gói Premium, dùng để gửi báo cáo và hỗ trợ sau mua.
              </li>
              <li>
                <strong className="text-[#f0ede8]">Dữ liệu kỹ thuật:</strong> Địa chỉ IP, loại trình duyệt, thời gian truy cập — thu thập tự động để cải thiện dịch vụ.
              </li>
            </ul>
          </section>

          {/* 2 */}
          <section>
            <h2 className="text-base font-bold text-[#f0ede8] mb-3 border-l-4 border-[#e8b84b] pl-3">
              2. Mục đích sử dụng dữ liệu
            </h2>
            <ul className="list-disc pl-5 space-y-2 text-[#f0ede8]/70">
              <li>Tính toán phân vị thu nhập (percentile) của bạn trong thị trường lao động Việt Nam.</li>
              <li>Cá nhân hóa và in chứng nhận VSPI với tên của bạn.</li>
              <li>Gửi báo cáo Premium qua Zalo/Email sau khi thanh toán thành công.</li>
              <li>Cải thiện độ chính xác của thuật toán và trải nghiệm người dùng.</li>
              <li>Hỗ trợ kỹ thuật khi bạn liên hệ chúng tôi.</li>
            </ul>
          </section>

          {/* 3 */}
          <section>
            <h2 className="text-base font-bold text-[#f0ede8] mb-3 border-l-4 border-[#e8b84b] pl-3">
              3. Cam kết không bán dữ liệu
            </h2>
            <div className="bg-[#161b26] border border-[#e8b84b]/20 rounded-2xl p-5">
              <p className="text-[#f0ede8] font-medium mb-2">
                🔒 Chúng tôi cam kết tuyệt đối:
              </p>
              <ul className="list-disc pl-5 space-y-2 text-[#f0ede8]/70">
                <li>
                  <strong className="text-[#f0ede8]">Không bán</strong> thông tin cá nhân của bạn cho bất kỳ bên thứ ba nào.
                </li>
                <li>
                  <strong className="text-[#f0ede8]">Không chia sẻ</strong> dữ liệu thu nhập của bạn với nhà tuyển dụng, đối tác quảng cáo hay tổ chức nào khác.
                </li>
                <li>
                  <strong className="text-[#f0ede8]">Không spam</strong> — chúng tôi chỉ liên hệ bạn khi có liên quan trực tiếp đến giao dịch của bạn.
                </li>
                <li>
                  Dữ liệu được lưu trữ an toàn trên hệ thống Supabase với mã hóa tiêu chuẩn.
                </li>
              </ul>
            </div>
          </section>

          {/* 4 */}
          <section>
            <h2 className="text-base font-bold text-[#f0ede8] mb-3 border-l-4 border-[#e8b84b] pl-3">
              4. Lưu trữ và bảo mật dữ liệu
            </h2>
            <p className="text-[#f0ede8]/70 mb-3">
              Dữ liệu của bạn được lưu trữ trên hệ thống đám mây bảo mật (Supabase/PostgreSQL) với các biện pháp bảo vệ:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-[#f0ede8]/70">
              <li>Mã hóa dữ liệu khi truyền tải (HTTPS/TLS).</li>
              <li>Kiểm soát truy cập nghiêm ngặt — chỉ nhân viên được ủy quyền mới có thể xem dữ liệu.</li>
              <li>Dữ liệu giao dịch được lưu tối đa 12 tháng kể từ ngày mua.</li>
              <li>Yêu cầu xóa dữ liệu được ghi nhận và xử lý trong tối đa 7 ngày làm việc sau khi xác minh đúng chủ thể dữ liệu.</li>
            </ul>
          </section>

          {/* 5 */}
          <section>
            <h2 className="text-base font-bold text-[#f0ede8] mb-3 border-l-4 border-[#e8b84b] pl-3">
              5. Quyền của bạn
            </h2>
            <p className="text-[#f0ede8]/70 mb-3">
              Bạn có quyền yêu cầu chúng tôi:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-[#f0ede8]/70">
              <li>Xem lại dữ liệu cá nhân chúng tôi đang lưu trữ về bạn.</li>
              <li>Chỉnh sửa thông tin không chính xác.</li>
              <li>Xóa toàn bộ dữ liệu của bạn khỏi hệ thống.</li>
            </ul>
            <Link
              href="/privacy/delete"
              className="mt-4 inline-flex rounded-2xl border border-[#e8b84b]/30 bg-[#e8b84b]/10 px-4 py-3 text-xs font-black text-[#e8b84b] transition hover:bg-[#e8b84b]/15"
            >
              Gửi yêu cầu xóa dữ liệu
            </Link>
          </section>

          {/* 6 */}
          <section>
            <h2 className="text-base font-bold text-[#f0ede8] mb-3 border-l-4 border-[#e8b84b] pl-3">
              6. Thông tin liên hệ
            </h2>
            <div className="bg-[#161b26] border border-white/10 rounded-2xl p-5 space-y-2 text-[#f0ede8]/70">
              <p>
                <strong className="text-[#f0ede8]">Đơn vị vận hành:</strong> VSPI Scanner
              </p>
              <p>
                <strong className="text-[#f0ede8]">Người phụ trách:</strong> Nguyễn Trọng Văn
              </p>
              <p>
                <strong className="text-[#f0ede8]">Zalo hỗ trợ:</strong>{" "}
                <span className="text-[#e8b84b] font-mono">0915.662.876</span>
              </p>
              <p>
                <strong className="text-[#f0ede8]">Website:</strong>{" "}
                <span className="text-[#e8b84b]">topluong.com</span>
              </p>
            </div>
          </section>
        </div>

        <div className="mt-10 pt-6 border-t border-white/10 text-center">
          <Link href="/" className="text-[11px] font-mono text-[#f0ede8]/45 hover:text-[#e8b84b] transition-colors">
            ← Quay về trang chủ
          </Link>
        </div>
      </div>
    </div>
  );
}
