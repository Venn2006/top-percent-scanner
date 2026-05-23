import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Điều khoản sử dụng — VSPI Scanner",
  description: "Điều khoản và điều kiện sử dụng dịch vụ VSPI Scanner.",
};

export default function TermsPage() {
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
            Điều khoản sử dụng
          </h1>
          <p className="text-[11px] font-mono text-[#f0ede8]/45">
            Cập nhật lần cuối: 01/01/2026 · VSPI Scanner
          </p>
        </div>

        <div className="space-y-8 text-sm leading-relaxed text-[#f0ede8]/80">
          {/* 1 */}
          <section>
            <h2 className="text-base font-bold text-[#f0ede8] mb-3 border-l-4 border-[#e8b84b] pl-3">
              1. Chấp nhận điều khoản
            </h2>
            <p className="text-[#f0ede8]/70">
              Bằng việc truy cập và sử dụng VSPI Scanner tại{" "}
              <span className="text-[#e8b84b]">topluong.com</span>, bạn đồng ý bị ràng buộc bởi các điều khoản và điều kiện được nêu trong tài liệu này. Nếu bạn không đồng ý với bất kỳ điều khoản nào, vui lòng không sử dụng dịch vụ.
            </p>
          </section>

          {/* 2 */}
          <section>
            <h2 className="text-base font-bold text-[#f0ede8] mb-3 border-l-4 border-[#e8b84b] pl-3">
              2. Mô tả dịch vụ
            </h2>
            <p className="text-[#f0ede8]/70 mb-3">
              VSPI Scanner cung cấp công cụ tra cứu và phân tích vị trí thu nhập (percentile) của người dùng trong thị trường lao động Việt Nam, dựa trên dữ liệu tổng hợp từ các nguồn uy tín bao gồm GSO, Adecco, ITviec, VietnamWorks, Talentnet và NIC.
            </p>
            <p className="text-[#f0ede8]/70">
              Dịch vụ bao gồm hai cấp độ: <strong className="text-[#f0ede8]">Miễn phí</strong> (xem kết quả phân vị cơ bản) và <strong className="text-[#f0ede8]">Premium</strong> (báo cáo chuyên sâu, công cụ phân tích, chứng nhận VSPI).
            </p>
          </section>

          {/* 3 */}
          <section>
            <h2 className="text-base font-bold text-[#f0ede8] mb-3 border-l-4 border-[#e8b84b] pl-3">
              3. Giới hạn trách nhiệm về độ chính xác dữ liệu
            </h2>
            <div className="bg-[#161b26] border border-yellow-500/20 rounded-2xl p-5 mb-4">
              <p className="text-yellow-400 font-bold text-[11px] uppercase tracking-wider mb-2">
                ⚠️ Lưu ý quan trọng
              </p>
              <p className="text-[#f0ede8]/70">
                Kết quả phân vị thu nhập được tính toán dựa trên dữ liệu thứ cấp tổng hợp từ các báo cáo thị trường. Đây là ước tính thống kê, <strong className="text-[#f0ede8]">không phải con số chính xác tuyệt đối</strong> cho từng cá nhân.
              </p>
            </div>
            <ul className="list-disc pl-5 space-y-2 text-[#f0ede8]/70">
              <li>
                VSPI Scanner <strong className="text-[#f0ede8]">không đảm bảo</strong> tính chính xác 100% của kết quả phân vị do sự biến động của thị trường lao động.
              </li>
              <li>
                Kết quả có thể khác nhau tùy theo khu vực địa lý, quy mô công ty, kinh nghiệm và các yếu tố cá nhân khác không được thu thập trong form.
              </li>
              <li>
                Dữ liệu được cập nhật theo chu kỳ quý — có thể có độ trễ so với biến động thị trường thực tế.
              </li>
              <li>
                VSPI Scanner không chịu trách nhiệm về bất kỳ quyết định tài chính, nghề nghiệp hay đàm phán lương nào được đưa ra dựa trên kết quả từ công cụ này.
              </li>
            </ul>
          </section>

          {/* 4 */}
          <section>
            <h2 className="text-base font-bold text-[#f0ede8] mb-3 border-l-4 border-[#e8b84b] pl-3">
              4. Chính sách hoàn tiền
            </h2>
            <div className="bg-[#161b26] border border-red-500/20 rounded-2xl p-5">
              <p className="text-red-400 font-bold text-[11px] uppercase tracking-wider mb-3">
                🚫 Chính sách không hoàn tiền
              </p>
              <p className="text-[#f0ede8]/70 mb-3">
                Do tính chất của sản phẩm số (nội dung báo cáo được hiển thị ngay sau khi thanh toán xác nhận), chúng tôi áp dụng chính sách:
              </p>
              <ul className="list-disc pl-5 space-y-2 text-[#f0ede8]/70">
                <li>
                  <strong className="text-[#f0ede8]">Không hoàn tiền</strong> sau khi báo cáo Premium đã được mở khóa và hiển thị cho người dùng.
                </li>
                <li>
                  Nếu bạn đã thanh toán nhưng <strong className="text-[#f0ede8]">chưa nhận được báo cáo</strong> do lỗi kỹ thuật, chúng tôi sẽ hỗ trợ gửi lại hoặc hoàn tiền đầy đủ trong vòng 24 giờ.
                </li>
                <li>
                  Trường hợp thanh toán nhầm hoặc trùng lặp, vui lòng liên hệ Zalo{" "}
                  <span className="text-[#e8b84b] font-mono">0915.662.876</span> trong vòng 24 giờ để được xử lý.
                </li>
              </ul>
            </div>
          </section>

          {/* 5 */}
          <section>
            <h2 className="text-base font-bold text-[#f0ede8] mb-3 border-l-4 border-[#e8b84b] pl-3">
              5. Quy tắc sử dụng
            </h2>
            <p className="text-[#f0ede8]/70 mb-3">Khi sử dụng dịch vụ, bạn đồng ý:</p>
            <ul className="list-disc pl-5 space-y-2 text-[#f0ede8]/70">
              <li>Cung cấp thông tin trung thực và chính xác.</li>
              <li>Không sử dụng dịch vụ cho mục đích gian lận hoặc gây hại cho người khác.</li>
              <li>Không sao chép, phân phối lại nội dung báo cáo Premium mà không có sự cho phép bằng văn bản.</li>
              <li>Không cố gắng truy cập trái phép vào hệ thống hoặc dữ liệu của chúng tôi.</li>
            </ul>
          </section>

          {/* 6 */}
          <section>
            <h2 className="text-base font-bold text-[#f0ede8] mb-3 border-l-4 border-[#e8b84b] pl-3">
              6. Sở hữu trí tuệ
            </h2>
            <p className="text-[#f0ede8]/70">
              Toàn bộ nội dung, thiết kế, thuật toán và dữ liệu tổng hợp trên VSPI Scanner là tài sản trí tuệ của chúng tôi. Bạn được phép sử dụng kết quả cá nhân của mình (chứng nhận VSPI, báo cáo đã mua) cho mục đích cá nhân và nghề nghiệp, nhưng không được phép tái phân phối thương mại.
            </p>
          </section>

          {/* 7 */}
          <section>
            <h2 className="text-base font-bold text-[#f0ede8] mb-3 border-l-4 border-[#e8b84b] pl-3">
              7. Thay đổi điều khoản
            </h2>
            <p className="text-[#f0ede8]/70">
              Chúng tôi có quyền cập nhật các điều khoản này bất kỳ lúc nào. Thay đổi sẽ có hiệu lực ngay khi được đăng tải. Việc tiếp tục sử dụng dịch vụ sau khi thay đổi đồng nghĩa với việc bạn chấp nhận điều khoản mới.
            </p>
          </section>

          {/* 8 */}
          <section>
            <h2 className="text-base font-bold text-[#f0ede8] mb-3 border-l-4 border-[#e8b84b] pl-3">
              8. Liên hệ
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
