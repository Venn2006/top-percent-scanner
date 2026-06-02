import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import FooterNav from "./components/FooterNav";
import Providers from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const OG_IMAGE_URL = 'https://topluong.com/og-image.png?v=20260602-vi-font';
const OG_SHARE_URL = 'https://topluong.com';

export const metadata: Metadata = {
  metadataBase: new URL('https://topluong.com'),
  title: 'Top Lương — Bạn đang ở Top mấy % thị trường lao động?',
  description: 'Ước tính vị trí thu nhập của bạn bằng salary guide, dữ liệu tuyển dụng và bối cảnh lực lượng lao động Việt Nam từ NSO/GSO.',
  alternates: {
    canonical: 'https://topluong.com',
  },
  openGraph: {
    title: 'Lương của bạn đang ở Top mấy %? — Top Lương 2026',
    description: 'Quét miễn phí trong 30 giây. Kết quả có confidence score và nguồn tham chiếu từ salary guide, job-market reports, NSO/GSO.',
    url: OG_SHARE_URL,
    siteName: 'Top Lương',
    images: [{
      url: OG_IMAGE_URL,
      secureUrl: OG_IMAGE_URL,
      width: 1200,
      height: 630,
      type: 'image/png',
      alt: 'Top Lương 2026 - Bạn đang ở Top mấy phần trăm thu nhập Việt Nam?',
    }],
    locale: 'vi_VN',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Top Lương — Lương bạn đang ở Top mấy %?',
    description: 'Quét miễn phí · Dữ liệu 2026 · Mở khóa Báo cáo lương 29K',
    images: [OG_IMAGE_URL],
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
        <Providers>
          <main className="flex-1 min-w-0 overflow-x-hidden">{children}</main>
        </Providers>
        <Analytics />
        <footer className="w-full max-w-[100dvw] overflow-x-hidden bg-[#0a0c10] border-t border-white/10 px-2 pb-[calc(11rem+env(safe-area-inset-bottom))] pt-5 sm:px-4 md:pb-5">
          <FooterNav />
        </footer>
      </body>
    </html>
  );
}
