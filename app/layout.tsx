import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import FooterNav from "./components/FooterNav";

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
        <main className="flex-1 min-w-0 overflow-x-hidden">{children}</main>
        <Analytics />
        <footer className="w-full max-w-[100dvw] overflow-x-hidden bg-[#0a0c10] border-t border-white/10 px-2 pb-[calc(11rem+env(safe-area-inset-bottom))] pt-5 sm:px-4 md:pb-5">
          <FooterNav />
        </footer>
      </body>
    </html>
  );
}
