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
  metadataBase: new URL('https://top-percent-scanner.vercel.app'),
  title: 'VSPI Scanner — Bạn đang ở Top mấy % thị trường lao động?',
  description: 'Khám phá vị trí thu nhập của bạn trong 53.3 triệu người lao động Việt Nam. Dữ liệu từ Adecco, ITviec, VietnamWorks 2026.',
  openGraph: {
    title: 'Lương của bạn đang ở Top mấy %? — VSPI Scanner 2026',
    description: '⚡ Quét miễn phí trong 30 giây. Dữ liệu từ Adecco · ITviec · VietnamWorks · GSO 2026.',
    url: 'https://top-percent-scanner.vercel.app',
    images: [{ url: 'https://top-percent-scanner.vercel.app/og-image.png', width: 1200, height: 630 }],
    locale: 'vi_VN',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VSPI Scanner — Lương bạn đang ở Top mấy %?',
    description: 'Quét miễn phí · Dữ liệu 2026 · Mở khóa báo cáo Premium 29k',
    images: ['https://top-percent-scanner.vercel.app/og-image.png'],
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
        <footer className="bg-[#0a0c10] border-t border-white/10 py-4 text-center">
          <p style={{ fontSize: '12px' }} className="text-[#f0ede8]/40 font-sans">
            <Link href="/my-progress" className="hover:text-[#e8b84b] transition-colors underline underline-offset-2">
              📈 Tiến độ của tôi
            </Link>
            <span className="mx-2 opacity-40">·</span>
            <Link href="/privacy" className="hover:text-[#e8b84b] transition-colors underline underline-offset-2">
              Chính sách bảo mật
            </Link>
            <span className="mx-2 opacity-40">·</span>
            <Link href="/terms" className="hover:text-[#e8b84b] transition-colors underline underline-offset-2">
              Điều khoản sử dụng
            </Link>
          </p>
        </footer>
      </body>
    </html>
  );
}
