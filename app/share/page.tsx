import type { Metadata } from 'next';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

type ShareSearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function cleanPercent(value: string | undefined) {
  const percent = Number(value ?? 50);
  return Math.min(100, Math.max(1, Number.isFinite(percent) ? Math.round(percent) : 50));
}

function cleanText(value: string | undefined, fallback: string, max = 52) {
  const cleaned = (value ?? '').replace(/[<>]/g, '').trim();
  return (cleaned || fallback).slice(0, max);
}

function cleanRank(value: string | undefined) {
  return cleanText(value, '#26.650.000', 18);
}

function buildShareParams(params: Record<string, string | string[] | undefined>) {
  const percent = cleanPercent(first(params.pct));
  const job = cleanText(first(params.job), 'thị trường lao động Việt Nam', 52);
  const confidence = Math.min(100, Math.max(0, Number(first(params.confidence) ?? 78) || 78));
  const rank = cleanRank(first(params.rank));
  const vspi = cleanText(first(params.vspi), 'VSPI-2026-SHARE', 28);
  return { percent, job, confidence, rank, vspi };
}

function buildOgImageUrl(data: ReturnType<typeof buildShareParams>) {
  const params = new URLSearchParams({
    pct: String(data.percent),
    job: data.job,
    confidence: String(data.confidence),
    rank: data.rank,
    vspi: data.vspi,
    v: 'card-v4',
  });
  return `https://topluong.com/api/og?${params.toString()}`;
}

export async function generateMetadata({ searchParams }: { searchParams: ShareSearchParams }): Promise<Metadata> {
  const data = buildShareParams(await searchParams);
  const shareUrl = `https://topluong.com/share?${new URLSearchParams({
    pct: String(data.percent),
    job: data.job,
    confidence: String(data.confidence),
    rank: data.rank,
    vspi: data.vspi,
    v: 'card-v4',
  }).toString()}`;
  const imageUrl = buildOgImageUrl(data);
  const title = `Tôi đang ở Top ${data.percent}% thu nhập Việt Nam`;
  const description = `Kết quả Top Lương cho ngành ${data.job}. Không hiển thị lương cá nhân.`;

  return {
    title,
    description,
    alternates: { canonical: shareUrl },
    robots: { index: false, follow: false },
    openGraph: {
      title,
      description,
      url: shareUrl,
      siteName: 'Top Lương',
      images: [
        {
          url: imageUrl,
          secureUrl: imageUrl,
          width: 1200,
          height: 630,
          type: 'image/png',
          alt: `Kết quả Top Lương: Top ${data.percent}% ngành ${data.job}`,
        },
      ],
      locale: 'vi_VN',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default async function SharePage({ searchParams }: { searchParams: ShareSearchParams }) {
  const data = buildShareParams(await searchParams);
  const higherThan = Math.max(0, 100 - data.percent);

  return (
    <main className="min-h-screen bg-[#07090d] px-4 py-10 text-[#f0ede8]">
      <section className="mx-auto flex max-w-md flex-col items-center rounded-[2rem] border border-[#e8b84b]/30 bg-[#111722] px-6 py-8 text-center shadow-2xl">
        <p className="font-mono text-xs font-black uppercase tracking-[0.35em] text-[#e8b84b]">
          VSPI
        </p>
        <h1 className="mt-5 font-serif text-5xl font-black leading-none">Top {data.percent}%</h1>
        <p className="mt-4 text-lg font-bold">Bạn cao hơn {higherThan}% người lao động</p>
        <p className="mt-2 text-sm leading-relaxed text-[#f0ede8]/60">ngành {data.job}</p>
        <div className="mt-6 rounded-lg border border-[#22c55e] bg-[#0a2a1a] px-4 py-2 text-sm font-bold text-[#86efac]">
          ✓ Đã tính toán · Có confidence score
        </div>
        <p className="mt-5 font-mono text-xs font-bold text-[#e8b84b]">VSPI ID: {data.vspi}</p>
        <Link
          href="/"
          className="mt-8 w-full rounded-2xl bg-[#e8b84b] px-5 py-4 text-center text-base font-black text-[#05070a] transition hover:bg-[#f3c75b]"
        >
          Quét lương của tôi
        </Link>
      </section>
    </main>
  );
}
