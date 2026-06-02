import type { Metadata } from 'next';
import Link from 'next/link';
import { TRUSTED_SALARY_SOURCES } from '@/lib/trustedSalarySources';

export const metadata: Metadata = {
  title: 'Nguồn dữ liệu và phương pháp tính - Top Lương',
  description: 'Cách Top Lương ước tính percentile thu nhập, nguồn benchmark lương và độ tin cậy dữ liệu.',
};

const tierGroups = [
  {
    title: 'Tier A - nguồn chính / chuẩn đối chiếu',
    tiers: ['A'],
    note: 'Ưu tiên dùng để kiểm tra benchmark, lương tối thiểu vùng, salary guide lớn và tín hiệu thị trường có độ phủ cao.',
  },
  {
    title: 'Tier B - salary guide bổ trợ',
    tiers: ['B'],
    note: 'Dùng để cross-check theo function, cấp bậc, công ty FDI/MNC và nhóm professional/manager.',
  },
  {
    title: 'Tier C/D - bối cảnh & estimate',
    tiers: ['C', 'D'],
    note: 'Chỉ dùng để đặt bối cảnh hoặc fallback khi nghề niche chưa đủ dữ liệu trực tiếp.',
  },
];

const methodSteps = [
  'Chuẩn hóa nghề người dùng nhập về chức danh benchmark gần nhất, có kiểm tra role segment để tránh ghép sai ngành.',
  'Điều chỉnh theo cấp kinh nghiệm, khu vực làm việc và sàn lương tối thiểu vùng khi phù hợp.',
  'Đối chiếu các mốc Top 50%, Top 20%, Top 10%, Top 5% từ salary guide, dữ liệu tuyển dụng và benchmark nội bộ.',
  'Nội suy phân vị thu nhập theo nghề/khu vực/kinh nghiệm, sau đó chặn các kết quả nhảy mốc quá vô lý.',
  'Gán confidence score dựa trên chất lượng match, số nguồn kiểm chứng và độ đầy đủ của benchmark.',
];

export default function MethodologyPage() {
  const sourceCount = TRUSTED_SALARY_SOURCES.length;

  return (
    <main className="min-h-screen bg-[#0a0c10] px-4 py-8 text-[#f0ede8]">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm font-bold text-[#e8b84b] hover:text-[#f0ede8]">
          Quay lại Top Lương
        </Link>

        <section className="py-8">
          <p className="mb-3 text-xs font-black uppercase tracking-[0.24em] text-[#e8b84b]">
            Phương pháp tính
          </p>
          <h1 className="max-w-2xl text-3xl font-black leading-tight md:text-5xl">
            Top Lương tính Top % lương như thế nào?
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[#f0ede8]/68">
            Top Lương không coi kết quả là con số tuyệt đối. Đây là ước tính thống kê dựa trên {sourceCount} nguồn tham chiếu
            đã phân tầng: dữ liệu chính thức NSO/GSO, sàn lương tối thiểu vùng, salary guide công khai, báo cáo tuyển dụng,
            benchmark nội bộ và mô hình nội suy theo nghề/khu vực/kinh nghiệm. Mục tiêu là giúp người lao động có điểm tham chiếu
            tốt hơn khi deal lương, đổi việc hoặc lập kế hoạch nâng thu nhập.
          </p>
        </section>

        <section className="grid gap-3 md:grid-cols-3">
          {tierGroups.map(group => {
            const sources = TRUSTED_SALARY_SOURCES.filter(source => group.tiers.includes(source.tier));
            return (
              <div key={group.title} className="rounded-2xl border border-white/10 bg-[#0f1219] p-5">
                <h2 className="mb-3 text-sm font-black text-[#e8b84b]">{group.title}</h2>
                <p className="mb-3 text-xs leading-5 text-[#f0ede8]/55">{group.note}</p>
                <ul className="space-y-2 text-xs leading-5 text-[#f0ede8]/68">
                  {sources.map(source => (
                    <li key={source.name}>- {source.shortLabel}: {source.detail}</li>
                  ))}
                </ul>
              </div>
            );
          })}
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

        <section className="mt-8 rounded-3xl border border-white/10 bg-[#0f1219] p-6">
          <h2 className="text-xl font-black text-[#f0ede8]">Nguồn có thể kiểm chứng</h2>
          <p className="mt-3 text-sm leading-6 text-[#f0ede8]/68">
            Các nguồn dưới đây được dùng như nguồn tham chiếu thị trường. Không có nghĩa mỗi kết quả cá nhân được trích trực tiếp
            từ một báo cáo duy nhất; VSPI luôn ưu tiên nguồn phù hợp nhất với nghề, cấp bậc và khu vực.
          </p>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {TRUSTED_SALARY_SOURCES.map(source => (
              <a
                key={source.href}
                href={source.href}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-white/10 px-4 py-3 text-xs font-bold text-[#f0ede8]/72 transition hover:border-[#e8b84b]/40 hover:text-[#e8b84b]"
              >
                <span className="block text-[#f0ede8]">{source.label}</span>
                <span className="mt-1 block text-[10px] font-medium text-[#f0ede8]/45">Tier {source.tier} · {source.detail}</span>
              </a>
            ))}
          </div>
        </section>

        <section className="mt-8 grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl border border-[#e8b84b]/25 bg-[#e8b84b]/8 p-5">
            <h2 className="text-base font-black text-[#e8b84b]">Confidence score là gì?</h2>
            <p className="mt-3 text-sm leading-6 text-[#f0ede8]/68">
              Điểm độ tin cậy 0-100 cho biết kết quả đang dựa trên benchmark trực tiếp, vai trò tương đương,
              ước tính theo ngành hay fallback thị trường chung. Điểm càng cao thì dữ liệu càng gần với nghề/khu vực/cấp kinh nghiệm của bạn.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#0f1219] p-5">
            <h2 className="text-base font-black text-[#f0ede8]">Giới hạn cần biết</h2>
            <p className="mt-3 text-sm leading-6 text-[#f0ede8]/68">
              VSPI không phải lời khuyên tài chính hay cam kết mức lương. Một số ngành/tỉnh thành ít dữ liệu sẽ được gắn nhãn ít dữ liệu trực tiếp
              hoặc độ tin cậy trung bình. Người dùng nên dùng kết quả như một điểm tham chiếu khi trao đổi với nhà tuyển dụng/quản lý.
            </p>
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-[#e8b84b]/25 bg-[#e8b84b]/8 p-6">
          <h2 className="text-xl font-black text-[#e8b84b]">Cách đọc kết quả</h2>
          <p className="mt-3 text-sm leading-6 text-[#f0ede8]/72">
            VSPI không sở hữu dữ liệu lương đầy đủ của toàn bộ lực lượng lao động Việt Nam. Các con số như quy mô lực lượng lao động
            hoặc thu nhập bình quân được dùng để đặt bối cảnh thị trường, không phải mẫu dữ liệu trực tiếp để xếp hạng từng cá nhân.
            Với executive compensation, creator/freelance income, commission, bonus, equity hoặc nghề niche ít dữ liệu, kết quả cần được đọc
            như khoảng tham chiếu và dựa thêm vào confidence score.
          </p>
        </section>

        <section className="mt-8 rounded-3xl border border-white/10 bg-[#0f1219] p-6">
          <h2 className="text-xl font-black text-[#f0ede8]">Quyền riêng tư</h2>
          <p className="mt-3 text-sm leading-6 text-[#f0ede8]/68">
            Ảnh chia sẻ kết quả sẽ không hiển thị mức lương cá nhân. Số điện thoại/email chỉ được dùng để xác nhận thanh toán,
            mở khóa báo cáo và hỗ trợ sau mua. Bạn có thể yêu cầu xóa dữ liệu tại trang bảo mật.
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
