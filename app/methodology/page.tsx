import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Nguồn dữ liệu và phương pháp tính - VSPI Scanner',
  description: 'Cách VSPI Scanner ước tính percentile thu nhập, nguồn benchmark lương và độ tin cậy dữ liệu.',
};

const sourceGroups = [
  {
    title: 'Báo cáo lương và tuyển dụng',
    items: [
      'Adecco Vietnam Salary Guide',
      'ITviec Salary Report',
      'VietnamWorks / Navigos salary insights',
      'TopCV, CareerViet và các nền tảng tuyển dụng lớn',
    ],
  },
  {
    title: 'Dữ liệu vĩ mô và thị trường lao động',
    items: [
      'NSO/GSO về lực lượng lao động Việt Nam',
      'Salary guide từ ManpowerGroup, Reeracoen, PERSOLKELLY',
      'Tham chiếu total remuneration từ Talentnet/Mercer khi có liên quan',
    ],
  },
  {
    title: 'Dữ liệu nội bộ VSPI',
    items: [
      'Lượt scan ẩn danh theo ngành, tỉnh/thành, cấp kinh nghiệm',
      'Trạng thái thanh toán và phản hồi người dùng được cho phép hiển thị',
      'Các role alias để map nghề người dùng nhập tay về benchmark gần nhất',
    ],
  },
];

const methodSteps = [
  'Chuẩn hóa nghề nghiệp người dùng về chức danh benchmark gần nhất.',
  'Điều chỉnh theo cấp kinh nghiệm và khu vực làm việc.',
  'Dùng các mốc Top 50%, Top 20%, Top 10%, Top 5% để nội suy phân phối thu nhập.',
  'So sánh lương gross tháng của người dùng với các mốc đó để trả về Top %.',
  'Gán confidence score dựa trên chất lượng match, số nguồn và mức độ đầy đủ của benchmark.',
];

export default function MethodologyPage() {
  return (
    <main className="min-h-screen bg-[#0a0c10] px-4 py-8 text-[#f0ede8]">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm font-bold text-[#e8b84b] hover:text-[#f0ede8]">
          Quay lại VSPI Scanner
        </Link>

        <section className="py-8">
          <p className="mb-3 text-xs font-black uppercase tracking-[0.24em] text-[#e8b84b]">
            Phương pháp tính
          </p>
          <h1 className="max-w-2xl text-3xl font-black leading-tight md:text-5xl">
            VSPI tính Top % lương như thế nào?
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[#f0ede8]/68">
            VSPI Scanner không coi kết quả là con số tuyệt đối. Đây là ước tính thống kê dựa trên
            benchmark lương công khai, salary guide, dữ liệu tuyển dụng và các lượt scan nội bộ đã
            được tổng hợp. Mục tiêu là giúp người lao động có điểm tham chiếu tốt hơn khi deal lương,
            đổi việc hoặc lập kế hoạch nâng thu nhập.
          </p>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          {sourceGroups.map(group => (
            <div key={group.title} className="rounded-2xl border border-white/10 bg-[#0f1219] p-5">
              <h2 className="mb-3 text-sm font-black text-[#e8b84b]">{group.title}</h2>
              <ul className="space-y-2 text-xs leading-5 text-[#f0ede8]/62">
                {group.items.map(item => <li key={item}>- {item}</li>)}
              </ul>
            </div>
          ))}
        </section>

        <section className="mt-8 rounded-3xl border border-white/10 bg-[#0f1219] p-6">
          <h2 className="text-xl font-black text-[#f0ede8]">Phương pháp tính</h2>
          <ol className="mt-4 space-y-3 text-sm leading-6 text-[#f0ede8]/68">
            {methodSteps.map((step, index) => (
              <li key={step} className="flex gap-3">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#e8b84b] text-xs font-black text-[#0a0c10]">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-8 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-[#e8b84b]/25 bg-[#e8b84b]/8 p-5">
            <h2 className="text-base font-black text-[#e8b84b]">Confidence score là gì?</h2>
            <p className="mt-3 text-sm leading-6 text-[#f0ede8]/68">
              Điểm độ tin cậy 0-100 cho biết kết quả đang dựa trên benchmark trực tiếp, vai trò
              tương đương, ước tính theo ngành hay fallback thị trường chung. Điểm càng cao thì
              dữ liệu càng gần với nghề/khu vực/cấp kinh nghiệm của bạn.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#0f1219] p-5">
            <h2 className="text-base font-black text-[#f0ede8]">Giới hạn cần biết</h2>
            <p className="mt-3 text-sm leading-6 text-[#f0ede8]/68">
              VSPI không phải lời khuyên tài chính hay cam kết mức lương. Một số ngành/tỉnh thành
              ít dữ liệu sẽ được gắn nhãn ít dữ liệu trực tiếp hoặc độ tin cậy trung bình. Người dùng nên dùng kết
              quả như một điểm tham chiếu khi trao đổi với nhà tuyển dụng/quản lý.
            </p>
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-white/10 bg-[#0f1219] p-6">
          <h2 className="text-xl font-black text-[#f0ede8]">Quyền riêng tư</h2>
          <p className="mt-3 text-sm leading-6 text-[#f0ede8]/68">
            Ảnh chia sẻ kết quả sẽ không hiển thị mức lương cá nhân. Số điện thoại/email chỉ được
            dùng để xác nhận thanh toán, mở khóa báo cáo và hỗ trợ sau mua. Bạn có thể yêu cầu xóa
            dữ liệu tại trang bảo mật.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/privacy" className="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-[#f0ede8]/75 hover:border-[#e8b84b]/40 hover:text-[#e8b84b]">
              Chính sách bảo mật
            </Link>
            <Link href="/privacy/delete" className="rounded-xl bg-[#e8b84b] px-4 py-3 text-sm font-black text-[#0a0c10] hover:bg-[#f0c84b]">
              Yêu cầu xóa dữ liệu
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
