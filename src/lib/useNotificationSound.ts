import { useCallback } from 'react';

/**
 * The chime that marks a newly arrived notification.
 *
 * Synthesised rather than loaded from a file. That is not a shortcut for a
 * missing asset — it is what makes the sound the right shape: two struck
 * partials a fifth apart, each on its own exponential decay, is a bell, and a
 * bell is what a notification should sound like. A file would add ~20 KB to
 * every page load and still be a fixed recording of exactly this.
 *
 * Deliberately quiet and short (~0.7 s, peak gain 0.16). A notification chime
 * is heard many times a day; anything louder stops being a signal and becomes
 * something the user turns off.
 *
 * Everything here fails silently. Autoplay policy blocks audio until the page
 * has seen a gesture, Safari suspends the context when the tab is hidden, and
 * some embedded webviews have no AudioContext at all — in each case a missing
 * chime is not worth an error, because the notification itself still arrives.
 */

/** A5 and E6 — a perfect fifth, the interval that reads as "bell" rather than "alarm". */
const PARTIALS: { hz: number; gain: number; delay: number; decay: number }[] = [
  { hz: 880.0,  gain: 0.16, delay: 0,     decay: 0.62 },
  { hz: 1318.5, gain: 0.11, delay: 0.085, decay: 0.55 },
  // A quiet octave above the root, struck with the second note. It is what
  // stops the pair sounding like two beeps and starts it sounding struck.
  { hz: 1760.0, gain: 0.04, delay: 0.085, decay: 0.30 },
];

const ATTACK_SECONDS = 0.006;

type Ctor = typeof AudioContext;

/**
 * One context for the whole tab. Browsers cap how many can exist, and creating
 * one per chime would exhaust that cap over a long session.
 */
let ctx: AudioContext | null = null;

function context(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor: Ctor | undefined =
    typeof window === 'undefined'
      ? undefined
      : window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    ctx = new Ctor();
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Notification ids already chimed for.
 *
 * Two hooks watch the same Realtime table — the feed and the badge — so a
 * single INSERT can reach this function twice within a frame. Without this the
 * chime would double-strike, which sounds like a fault rather than a flourish.
 *
 * Module-level on purpose: the guard has to outlive any one component, since
 * the duplicate arrives from a different one.
 */
const chimed = new Set<string>();
const CHIMED_CAP = 200;
let lastChimeAt = 0;

/** Plays the chime once for `id`; a repeat call with the same id does nothing. */
export function playNotificationChime(id?: string): void {
  if (id) {
    if (chimed.has(id)) return;
    chimed.add(id);
    // Bound memory without clearing the id that just arrived. A second
    // subscriber can still deliver that same row after the throttle window.
    if (chimed.size > CHIMED_CAP) {
      const oldest = chimed.values().next().value;
      if (oldest) chimed.delete(oldest);
    }
  }

  if (Date.now() - lastChimeAt < 900) return;
  lastChimeAt = Date.now();

  const audio = context();
  if (!audio) return;

  try {
    // Suspended is the normal state before the page's first gesture, and after
    // a tab has been backgrounded. resume() is a promise that may reject.
    if (audio.state === 'suspended') void audio.resume().catch(() => {});

    const now = audio.currentTime;

    // One shared lowpass: the raw sines have no harmonics above their
    // fundamental, but the attack transient does, and it is what makes an
    // otherwise smooth tone click at onset.
    const tone = audio.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 5200;
    tone.Q.value = 0.7;
    tone.connect(audio.destination);

    for (const p of PARTIALS) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      const start = now + p.delay;

      osc.type = 'sine';
      osc.frequency.value = p.hz;

      // Ramp from a small positive value, never from 0: exponentialRampToValue
      // throws on a zero endpoint, and a linear release sounds like a fade
      // rather than a decay.
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(p.gain, start + ATTACK_SECONDS);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + p.decay);

      osc.connect(gain);
      gain.connect(tone);
      osc.start(start);
      osc.stop(start + p.decay + 0.02);
      // Nodes are one-shot; releasing them here keeps a long session from
      // accumulating a graph it can never play again.
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    }

    // Longest partial plus its delay, plus the stop margin above.
    window.setTimeout(() => tone.disconnect(), 900);
  } catch {
    /* no audio in this environment; the notification still arrived */
  }
}

/** Resume Web Audio on the first real gesture, before any realtime event arrives. */
export function installNotificationAudioUnlock(): void {
  const unlock = () => {
    const audio = context();
    if (audio?.state === 'suspended') void audio.resume().catch(() => {});
    document.removeEventListener('pointerdown', unlock);
    document.removeEventListener('keydown', unlock);
  };
  document.addEventListener('pointerdown', unlock, { once: true });
  document.addEventListener('keydown', unlock, { once: true });
}

/** Hook form, for components that would rather not import a bare function. */
export function useNotificationSound() {
  return useCallback((id?: string) => playNotificationChime(id), []);
}
