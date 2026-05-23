import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import { Analytics } from "@vercel/analytics/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://topluong.com'),
  title: 'VSPI Scanner — Bạn đang ở Top mấy % thị trường lao động?',
  description: 'Khám phá vị trí thu nhập của bạn trong 53.3 triệu người lao động Việt Nam. Dữ liệu từ Adecco, ITviec, VietnamWorks 2026.',
  openGraph: {
    title: 'Lương của bạn đang ở Top mấy %? — VSPI Scanner 2026',
    description: '⚡ Quét miễn phí trong 30 giây. Dữ liệu từ Adecco · ITviec · VietnamWorks · GSO 2026.',
    url: 'https://topluong.com',
    images: [{ url: 'https://topluong.com/og-image.png', width: 1200, height: 630 }],
    locale: 'vi_VN',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VSPI Scanner — Lương bạn đang ở Top mấy %?',
    description: 'Quét miễn phí · Dữ liệu 2026 · Mở khóa báo cáo Premium 29k',
    images: ['https://topluong.com/og-image.png'],
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="vi"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <main className="flex-1">{children}</main>
        <Analytics />
        <footer className="bg-[#0a0c10] border-t border-white/10 px-4 pb-[calc(8rem+env(safe-area-inset-bottom))] pt-5 md:pb-5">
          <nav className="mx-auto flex max-w-md flex-col gap-2 text-xs font-bold sm:max-w-2xl sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-2.5">
            <Link
              href="/roadmap"
              className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-[#e8b84b] px-3 py-2.5 text-center font-black text-[#0a0c10] shadow-[0_0_18px_rgba(232,184,75,0.22)] transition-all hover:-translate-y-0.5 hover:bg-[#f0c84b] active:scale-95 sm:w-auto"
            >
              🗺️ Lộ trình 79k
            </Link>
            <div className="grid grid-cols-2 gap-2 sm:contents">
              <Link
                href="/my-progress"
                className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center text-[#f0ede8]/80 transition-all hover:-translate-y-0.5 hover:border-[#e8b84b]/40 hover:text-[#e8b84b] active:scale-95"
              >
                📈 Tiến độ
              </Link>
              <Link
                href="/methodology"
                className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center text-[#f0ede8]/70 transition-all hover:-translate-y-0.5 hover:border-[#e8b84b]/40 hover:text-[#e8b84b] active:scale-95"
              >
                Phương pháp
              </Link>
              <Link
                href="/privacy"
                className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center text-[#f0ede8]/70 transition-all hover:-translate-y-0.5 hover:border-[#e8b84b]/40 hover:text-[#e8b84b] active:scale-95"
              >
                Bảo mật
              </Link>
              <Link
                href="/terms"
                className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center text-[#f0ede8]/70 transition-all hover:-translate-y-0.5 hover:border-[#e8b84b]/40 hover:text-[#e8b84b] active:scale-95"
              >
                Điều khoản
              </Link>
            </div>
          </nav>
        </footer>
      </body>
    </html>
  );
}
