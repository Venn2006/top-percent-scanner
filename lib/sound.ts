/**
 * Lightweight client-side sound + haptics utility (Web Audio API + Vibration API).
 * - No external audio assets, no libraries.
 * - SSR-safe: every export is a no-op outside the browser.
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
let researchTimer: number | null = null;

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
    stopResearchPulse();
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

// ── Haptics ─────────────────────────────────────────────────────────────────

export function vibrate(pattern: number | number[]): void {
  if (!isBrowser()) return;
  if (isMuted() || prefersReducedMotion()) return;
  const nav = window.navigator as Navigator & {
    vibrate?: (pattern: number | number[]) => boolean;
  };
  if (typeof nav.vibrate !== 'function') return;
  try {
    nav.vibrate(pattern);
  } catch {
    /* fail silently — desktop Safari etc. */
  }
}

// Per-stage haptic flavour: light tap, normal tap, double thump, sharp final.
export function vibrateStage(stage: number): void {
  switch (stage) {
    case 0:
      vibrate(15);
      break;
    case 1:
      vibrate(20);
      break;
    case 2:
      vibrate([25, 40, 25]); // double thump
      break;
    case 3:
      vibrate([30, 20, 40]); // sharp final
      break;
    default:
      vibrate(15);
  }
}

// ── Public API: discrete cues ───────────────────────────────────────────────

export function playTap(): void {
  // Soft, short click — quick decay
  playTone(820, 0.06, 'sine', 0.035);
}

export function playSuccess(): void {
  // Two-note rising chime + one subtle haptic
  playTone(660, 0.12, 'sine', 0.05);
  if (isBrowser()) {
    window.setTimeout(() => playTone(990, 0.18, 'sine', 0.05), 110);
  }
  vibrate(30);
}

// Distinct tone per scanning stage (0..3) — used on stage transition.
export function playStageTick(stage: number): void {
  switch (stage) {
    case 0:
      // Light high tick — searching
      playTone(720, 0.07, 'triangle', 0.032);
      break;
    case 1:
      // Slightly fuller tick — comparing
      playTone(540, 0.08, 'triangle', 0.034);
      break;
    case 2: {
      // Double thump — calculating
      playTone(120, 0.09, 'sine', 0.045);
      if (isBrowser()) {
        window.setTimeout(() => playTone(86, 0.12, 'sine', 0.04), 140);
      }
      break;
    }
    case 3:
      // Bright pre-result tick — opening
      playTone(880, 0.09, 'triangle', 0.04);
      break;
    default:
      playTap();
  }
}

// ── Public API: legacy heartbeat loop (kept for completeness) ───────────────

export function startHeartbeat(): void {
  if (!isBrowser()) return;
  if (isMuted() || prefersReducedMotion()) return;
  if (heartbeatTimer !== null) return;
  const tick = () => {
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

// ── Public API: research pulse keyed to current stage ───────────────────────
//
// Plays a soft repeating tick whose cadence depends on the *current* scan
// stage. Caller supplies a `getStage()` reader so the loop always reads the
// latest stage without re-binding.

const STAGE_CADENCE_MS = [880, 740, 620, 480]; // slower → faster across stages

export function startResearchPulse(getStage: () => number): void {
  if (!isBrowser()) return;
  if (isMuted() || prefersReducedMotion()) return;
  if (researchTimer !== null) stopResearchPulse();

  const schedule = () => {
    if (researchTimer === null) return;
    const stage = Math.max(0, Math.min(3, getStage()));
    // Soft per-tick ambient — distinct from the stage-transition tick so the
    // loop hums underneath instead of overlapping with the on-change cue.
    const freq = [180, 150, 130, 200][stage];
    const dur = stage === 2 ? 0.1 : 0.07;
    const vol = stage === 2 ? 0.03 : 0.022;
    playTone(freq, dur, 'sine', vol);
    if (stage === 2) {
      window.setTimeout(() => playTone(100, 0.09, 'sine', 0.022), 130);
    }
    const cadence = STAGE_CADENCE_MS[stage] ?? 700;
    researchTimer = window.setTimeout(schedule, cadence);
  };
  // Sentinel so the first schedule() call doesn't bail out.
  researchTimer = window.setTimeout(schedule, 0);
}

export function stopResearchPulse(): void {
  if (researchTimer !== null) {
    clearTimeout(researchTimer);
    researchTimer = null;
  }
}

// ── Public API: generic thinking pulse (used by roadmap) ────────────────────

export function startThinkingPulse(): void {
  if (!isBrowser()) return;
  if (isMuted() || prefersReducedMotion()) return;
  if (pulseTimer !== null) return;
  pulseStep = 0;
  const pulse = () => {
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
