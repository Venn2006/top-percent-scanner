"use client";

import Link from 'next/link';
import { playTap } from '@/lib/sound';
import SoundToggle from './SoundToggle';

// Shared chip styling. Mobile keeps a compact dock height; desktop steps up
// to a chunkier, more readable size so the bottom dock doesn't feel cheap.
const CHIP_BASE =
  'inline-flex min-w-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] font-sans text-[#f0ede8]/75 antialiased transition-all hover:-translate-y-0.5 hover:border-[#e8b84b]/40 hover:text-[#e8b84b] active:scale-95';
const CHIP_SIZE =
  'min-h-11 px-2 py-2 text-center text-[13px] font-semibold tracking-normal leading-none sm:min-h-12 sm:px-5 sm:py-3 sm:text-sm';

export default function FooterNav() {
  const tap = () => playTap();

  return (
    <nav
      aria-label="Liên kết chân trang"
      className="mx-auto flex w-full max-w-[calc(100dvw-1rem)] min-w-0 flex-col gap-2 overflow-hidden sm:max-w-3xl sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-2.5"
    >
      {/* Primary row — mobile: CTA + small mute toggle side-by-side. */}
      {/* Desktop: sm:contents flattens this wrapper so its children become   */}
      {/* direct flex items in the nav row.                                   */}
      <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_6.75rem] items-stretch gap-1.5 sm:contents">
        <Link
          href="/roadmap?new=1"
          onClick={tap}
          className="inline-flex min-h-11 min-w-0 items-center justify-center overflow-hidden rounded-2xl bg-[#e8b84b] px-2 py-2.5 text-center text-[13px] font-black leading-none text-[#0a0c10] shadow-[0_0_18px_rgba(232,184,75,0.22)] transition-all hover:-translate-y-0.5 hover:bg-[#f0c84b] active:scale-95 sm:min-h-12 sm:flex-initial sm:px-6 sm:py-3 sm:text-sm"
        >
          <span className="block max-w-full truncate">Lộ trình 79k</span>
        </Link>
        <SoundToggle
          className={`h-11 w-full max-w-full sm:order-last sm:h-12 sm:w-28 ${CHIP_BASE}`}
        />
      </div>

      {/* Secondary row — mobile: balanced 2×2 grid (no orphan full-width). */}
      {/* Desktop: sm:contents flattens it into the nav row.                */}
      <div className="grid min-w-0 grid-cols-2 gap-1.5 sm:contents">
        <Link
          href="/my-progress"
          onClick={tap}
          className={`${CHIP_BASE} ${CHIP_SIZE}`}
        >
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
