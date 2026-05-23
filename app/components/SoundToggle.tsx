"use client";

import { useEffect, useState } from 'react';
import { isMuted, setMuted, playTap } from '@/lib/sound';

interface SoundToggleProps {
  className?: string;
}

export default function SoundToggle({ className = '' }: SoundToggleProps) {
  const [muted, setLocalMuted] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setLocalMuted(isMuted());
    setMounted(true);
  }, []);

  const handleToggle = () => {
    const next = !muted;
    setMuted(next);
    setLocalMuted(next);
    if (!next) playTap();
  };

  const base =
    'inline-flex shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-[#f0ede8]/70 transition-all hover:-translate-y-0.5 hover:border-[#e8b84b]/40 hover:text-[#e8b84b] active:scale-95';

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label={muted ? 'Bật âm thanh' : 'Tắt âm thanh'}
      aria-pressed={!muted}
      title={muted ? 'Bật âm thanh' : 'Tắt âm thanh'}
      className={`${base} ${className}`.trim()}
    >
      <span aria-hidden="true" className="text-base leading-none sm:text-lg">
        {mounted ? (muted ? '🔇' : '🔊') : '🔊'}
      </span>
    </button>
  );
}
