"use client";

import Link from 'next/link';
import { playTap } from '@/lib/sound';
import SoundToggle from './SoundToggle';

export default function FooterNav() {
  const tap = () => playTap();

  return (
    <nav className="mx-auto flex max-w-md flex-col gap-2 text-xs font-bold sm:max-w-2xl sm:flex-row sm:flex-wrap sm:items-center sm:justify-center sm:gap-2.5">
      <Link
        href="/roadmap"
        onClick={tap}
        className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl bg-[#e8b84b] px-3 py-2.5 text-center font-black text-[#0a0c10] shadow-[0_0_18px_rgba(232,184,75,0.22)] transition-all hover:-translate-y-0.5 hover:bg-[#f0c84b] active:scale-95 sm:w-auto"
      >
        🗺️ Lộ trình 79k
      </Link>
      <div className="grid grid-cols-2 gap-2 sm:contents">
        <Link
          href="/my-progress"
          onClick={tap}
          className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center text-[#f0ede8]/80 transition-all hover:-translate-y-0.5 hover:border-[#e8b84b]/40 hover:text-[#e8b84b] active:scale-95"
        >
          📈 Tiến độ
        </Link>
        <Link
          href="/methodology"
          onClick={tap}
          className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center text-[#f0ede8]/70 transition-all hover:-translate-y-0.5 hover:border-[#e8b84b]/40 hover:text-[#e8b84b] active:scale-95"
        >
          Phương pháp
        </Link>
        <Link
          href="/privacy"
          onClick={tap}
          className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center text-[#f0ede8]/70 transition-all hover:-translate-y-0.5 hover:border-[#e8b84b]/40 hover:text-[#e8b84b] active:scale-95"
        >
          Bảo mật
        </Link>
        <Link
          href="/terms"
          onClick={tap}
          className="inline-flex min-h-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center text-[#f0ede8]/70 transition-all hover:-translate-y-0.5 hover:border-[#e8b84b]/40 hover:text-[#e8b84b] active:scale-95"
        >
          Điều khoản
        </Link>
        <SoundToggle />
      </div>
    </nav>
  );
}
