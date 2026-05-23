"use client";

import Link from 'next/link';
import { playTap } from '@/lib/sound';
import SoundToggle from './SoundToggle';

// Shared chip styling. Mobile keeps a compact dock height; desktop steps up
// to a chunkier, more readable size so the bottom dock doesn't feel cheap.
const CHIP_BASE =
  'inline-flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-[#f0ede8]/75 transition-all hover:-translate-y-0.5 hover:border-[#e8b84b]/40 hover:text-[#e8b84b] active:scale-95';
const CHIP_SIZE =
  'min-h-10 px-3 py-2 text-center text-xs font-bold sm:min-h-12 sm:px-5 sm:py-3 sm:text-sm';

export default function FooterNav() {
  const tap = () => playTap();

  return (
    <nav
      aria-label="Liên kết chân trang"
      className="mx-auto flex w-full max-w-md flex-col gap-2 sm:max-w-3xl sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-2.5"
    >
      {/* Primary row — mobile: CTA + small mute toggle side-by-side. */}
      {/* Desktop: sm:contents flattens this wrapper so its children become   */}
      {/* direct flex items in the nav row.                                   */}
      <div className="flex items-stretch gap-2 sm:contents">
        <Link
          href="/roadmap"
          onClick={tap}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-2xl bg-[#e8b84b] px-4 py-2.5 text-center text-xs font-black text-[#0a0c10] shadow-[0_0_18px_rgba(232,184,75,0.22)] transition-all hover:-translate-y-0.5 hover:bg-[#f0c84b] active:scale-95 sm:min-h-12 sm:flex-initial sm:px-6 sm:py-3 sm:text-sm"
        >
          <span aria-hidden="true" className="mr-1.5">🗺️</span>
          Lộ trình 79k
        </Link>
        <SoundToggle
          className={`h-11 w-11 sm:order-last sm:h-12 sm:w-12 ${CHIP_BASE}`}
        />
      </div>

      {/* Secondary row — mobile: balanced 2×2 grid (no orphan full-width). */}
      {/* Desktop: sm:contents flattens it into the nav row.                */}
      <div className="grid grid-cols-2 gap-2 sm:contents">
        <Link
          href="/my-progress"
          onClick={tap}
          className={`${CHIP_BASE} ${CHIP_SIZE}`}
        >
          <span aria-hidden="true" className="mr-1">📈</span>
          Tiến độ
        </Link>
        <Link
          href="/methodology"
          onClick={tap}
          className={`${CHIP_BASE} ${CHIP_SIZE}`}
        >
          Phương pháp
        </Link>
        <Link
          href="/privacy"
          onClick={tap}
          className={`${CHIP_BASE} ${CHIP_SIZE}`}
        >
          Bảo mật
        </Link>
        <Link
          href="/terms"
          onClick={tap}
          className={`${CHIP_BASE} ${CHIP_SIZE}`}
        >
          Điều khoản
        </Link>
      </div>
    </nav>
  );
}
