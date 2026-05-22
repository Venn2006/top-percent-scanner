import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Nguon du lieu va phuong phap tinh - VSPI Scanner',
  description: 'Cach VSPI Scanner uoc tinh percentile thu nhap, nguon benchmark luong va do tin cay du lieu.',
};

const sourceGroups = [
  {
    title: 'Bao cao luong va tuyen dung',
    items: [
      'Adecco Vietnam Salary Guide',
      'ITviec Salary Report',
      'VietnamWorks / Navigos salary insights',
      'TopCV, CareerViet va cac nen tang tuyen dung lon',
    ],
  },
  {
    title: 'Du lieu vi mo va thi truong lao dong',
    items: [
      'NSO/GSO ve luc luong lao dong Viet Nam',
      'Salary guide tu ManpowerGroup, Reeracoen, PERSOLKELLY',
      'Tham chieu total remuneration tu Talentnet/Mercer khi co lien quan',
    ],
  },
  {
    title: 'Du lieu noi bo VSPI',
    items: [
      'Luot scan an danh theo nganh, tinh/thanh, cap kinh nghiem',
      'Trang thai thanh toan va phan hoi beta duoc cho phep hien thi',
      'Cac role alias de map nghe nguoi dung nhap tay ve benchmark gan nhat',
    ],
  },
];

const methodSteps = [
  'Chuan hoa nghe nghiep nguoi dung ve chuc danh benchmark gan nhat.',
  'Dieu chinh theo cap kinh nghiem va khu vuc lam viec.',
  'Dung cac moc Top 50, Top 20, Top 10, Top 5 de noi suy phan phoi thu nhap.',
  'So sanh luong gross thang cua nguoi dung voi cac moc do de tra ve Top %.',
  'Gan confidence score dua tren chat luong match, so nguon va muc do day du cua benchmark.',
];

export default function MethodologyPage() {
  return (
    <main className="min-h-screen bg-[#0a0c10] px-4 py-8 text-[#f0ede8]">
      <div className="mx-auto max-w-3xl">
        <Link href="/" className="text-sm font-bold text-[#e8b84b] hover:text-[#f0ede8]">
          Quay lai VSPI Scanner
        </Link>

        <section className="py-8">
          <p className="mb-3 text-xs font-black uppercase tracking-[0.24em] text-[#e8b84b]">
            Data methodology
          </p>
          <h1 className="max-w-2xl text-3xl font-black leading-tight md:text-5xl">
            VSPI tinh Top % luong nhu the nao?
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-[#f0ede8]/68">
            VSPI Scanner khong coi ket qua la con so tuyet doi. Day la uoc tinh thong ke dua tren
            benchmark luong cong khai, salary guide, du lieu tuyen dung va cac luot scan noi bo da
            duoc tong hop. Muc tieu la giup nguoi lao dong co diem tham chieu tot hon khi deal luong,
            doi viec hoac lap ke hoach nang thu nhap.
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
          <h2 className="text-xl font-black text-[#f0ede8]">Phuong phap tinh</h2>
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
            <h2 className="text-base font-black text-[#e8b84b]">Confidence score la gi?</h2>
            <p className="mt-3 text-sm leading-6 text-[#f0ede8]/68">
              Diem do tin cay 0-100 cho biet ket qua dang dua tren benchmark truc tiep, vai tro
              tuong duong, uoc tinh theo nganh hay fallback thi truong chung. Diem cang cao thi
              du lieu cang gan voi nghe/khu vuc/cap kinh nghiem cua ban.
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#0f1219] p-5">
            <h2 className="text-base font-black text-[#f0ede8]">Gioi han can biet</h2>
            <p className="mt-3 text-sm leading-6 text-[#f0ede8]/68">
              VSPI khong phai loi khuyen tai chinh hay cam ket muc luong. Mot so nganh/tinh thanh
              it du lieu se duoc gan nhan beta hoac do tin cay trung binh. Nguoi dung nen dung ket
              qua nhu mot diem tham chieu khi trao doi voi nha tuyen dung/quan ly.
            </p>
          </div>
        </section>

        <section className="mt-8 rounded-3xl border border-white/10 bg-[#0f1219] p-6">
          <h2 className="text-xl font-black text-[#f0ede8]">Quyen rieng tu</h2>
          <p className="mt-3 text-sm leading-6 text-[#f0ede8]/68">
            Anh chia se ket qua se khong hien thi muc luong ca nhan. So dien thoai/email chi duoc
            dung de xac nhan thanh toan, mo khoa bao cao va ho tro sau mua. Ban co the yeu cau xoa
            du lieu tai trang bao mat.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/privacy" className="rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-[#f0ede8]/75 hover:border-[#e8b84b]/40 hover:text-[#e8b84b]">
              Chinh sach bao mat
            </Link>
            <Link href="/privacy/delete" className="rounded-xl bg-[#e8b84b] px-4 py-3 text-sm font-black text-[#0a0c10] hover:bg-[#f0c84b]">
              Yeu cau xoa du lieu
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
