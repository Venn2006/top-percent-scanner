/**
 * Lightweight client-side sound utility (Web Audio API).
 * - No external audio assets.
 * - SSR-safe: every function is a no-op outside the browser.
 * - Mobile-safe: AudioContext is created/resumed only inside user-gesture handlers.
 * - Respects user mute preference (localStorage) and prefers-reduced-motion.
 */

const STORAGE_KEY = 'vspi-sound-mute';

type AudioCtor = typeof AudioContext;
interface WindowWithWebkit extends Window {
  webkitAudioContext?: AudioCtor;
}

let ctx: AudioContext | null = null;
let heartbeatTimer: number | null = null;
let pulseTimer: number | null = null;
let pulseStep = 0;

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function prefersReducedMotion(): boolean {
  if (!isBrowser() || typeof window.matchMedia !== 'function') return false;
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function isMuted(): boolean {
  if (!isBrowser()) return true;
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setMuted(value: boolean): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(STORAGE_KEY, value ? '1' : '0');
  } catch {
    /* ignore quota errors */
  }
  if (value) {
    stopHeartbeat();
    stopThinkingPulse();
  }
}

function getCtx(): AudioContext | null {
  if (!isBrowser()) return null;
  if (isMuted()) return null;
  const Ctor: AudioCtor | undefined =
    typeof window.AudioContext !== 'undefined'
      ? window.AudioContext
      : (window as WindowWithWebkit).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

function playTone(
  freq: number,
  duration: number,
  type: OscillatorType = 'sine',
  volume = 0.05,
  attack = 0.005,
): void {
  if (isMuted() || prefersReducedMotion()) return;
  const audio = getCtx();
  if (!audio) return;
  try {
    const now = audio.currentTime;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(volume, now + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  } catch {
    /* ignore */
  }
}

// ── Public API ──────────────────────────────────────────────────────────────

export function playTap(): void {
  // Soft, short click — quick decay
  playTone(820, 0.06, 'sine', 0.035);
}

export function playSuccess(): void {
  // Two-note rising chime
  playTone(660, 0.12, 'sine', 0.05);
  if (isBrowser()) {
    window.setTimeout(() => playTone(990, 0.18, 'sine', 0.05), 110);
  }
}

export function startHeartbeat(): void {
  if (!isBrowser()) return;
  if (isMuted() || prefersReducedMotion()) return;
  if (heartbeatTimer !== null) return;
  const tick = () => {
    // Low-frequency double-thump like a heartbeat / sonar tick
    playTone(110, 0.08, 'sine', 0.05);
    window.setTimeout(() => playTone(78, 0.1, 'sine', 0.035), 130);
  };
  tick();
  heartbeatTimer = window.setInterval(tick, 850);
}

export function stopHeartbeat(): void {
  if (heartbeatTimer !== null) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

export function startThinkingPulse(): void {
  if (!isBrowser()) return;
  if (isMuted() || prefersReducedMotion()) return;
  if (pulseTimer !== null) return;
  pulseStep = 0;
  const pulse = () => {
    // 4-step rising arpeggio — feels like "working / processing"
    const seq = [392, 466, 523, 587];
    const freq = seq[pulseStep % seq.length];
    playTone(freq, 0.16, 'triangle', 0.03);
    pulseStep++;
  };
  pulse();
  pulseTimer = window.setInterval(pulse, 520);
}

export function stopThinkingPulse(): void {
  if (pulseTimer !== null) {
    clearInterval(pulseTimer);
    pulseTimer = null;
  }
  pulseStep = 0;
}
