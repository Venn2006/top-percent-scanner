"use client";

import { useEffect, useState } from 'react';
import { isMuted, setMuted, playTap } from '@/lib/sound';

export default function SoundToggle() {
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

  return (
    <button
      type="button"
      onClick={handleToggle}
      aria-label={muted ? 'Bật âm thanh' : 'Tắt âm thanh'}
      aria-pressed={!muted}
      title={muted ? 'Bật âm thanh' : 'Tắt âm thanh'}
      className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-center text-[#f0ede8]/70 transition-all hover:-translate-y-0.5 hover:border-[#e8b84b]/40 hover:text-[#e8b84b] active:scale-95"
    >
      <span aria-hidden="true">{mounted ? (muted ? '🔇' : '🔊') : '🔊'}</span>
    </button>
  );
}
