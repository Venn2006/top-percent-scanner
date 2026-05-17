import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://vspi-scanner.vercel.app'),
  title: 'VSPI Scanner — Bạn đang ở Top mấy % thị trường lao động?',
  description: 'Khám phá vị trí thu nhập của bạn trong 53.3 triệu người lao động Việt Nam. Dữ liệu từ Adecco, ITviec, VietnamWorks 2026.',
  openGraph: {
    title: 'Lương của bạn đang ở Top mấy %? — VSPI Scanner 2026',
    description: '⚡ Quét miễn phí trong 30 giây. Dữ liệu từ Adecco · ITviec · VietnamWorks · GSO 2026.',
    images: [{ url: '/og-image.png', width: 1200, height: 630 }],
    locale: 'vi_VN',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'VSPI Scanner — Lương bạn đang ở Top mấy %?',
    description: 'Quét miễn phí · Dữ liệu 2026 · Mở khóa báo cáo Premium 49k',
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
