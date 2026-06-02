import type { Metadata } from 'next';

const ROADMAP_URL = 'https://topluong.com/roadmap';
const ROADMAP_OG_IMAGE = 'https://topluong.com/roadmap-og-image.png?v=20260602-vi-font';

export const metadata: Metadata = {
  title: 'Checklist tăng lương AI 79K | Top Lương',
  description: 'AI cá nhân hóa checklist tăng lương theo nghề, mức lương, khu vực và mục tiêu của bạn: việc cần làm từng tuần, bằng chứng cần lưu và câu review lương.',
  alternates: {
    canonical: ROADMAP_URL,
  },
  openGraph: {
    title: 'Checklist tăng lương AI 79K | Top Lương',
    description: '29K cho biết mốc lương. 79K biến mốc đó thành checklist hành động, evidence log, KPI và câu review lương.',
    url: ROADMAP_URL,
    siteName: 'Top Lương',
    images: [
      {
        url: ROADMAP_OG_IMAGE,
        secureUrl: ROADMAP_OG_IMAGE,
        width: 1200,
        height: 630,
        type: 'image/png',
        alt: 'Checklist tăng lương AI 79K - Top Lương',
      },
    ],
    locale: 'vi_VN',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Checklist tăng lương AI 79K | Top Lương',
    description: 'AI cá nhân hóa checklist theo nghề, mức lương và mục tiêu của bạn. Không phải tư vấn 1-1 bởi chuyên gia người thật.',
    images: [ROADMAP_OG_IMAGE],
  },
};

export default function RoadmapLayout({ children }: { children: React.ReactNode }) {
  return children;
}
