import { useCallback } from 'react';

/**
 * The chime that marks a newly arrived notification.
 *
 * An original, short three-note Web Audio effect kept separate from the
 * existing refresh recording.
 *
 * Deliberately quiet and short (~0.7 s). A notification chime
 * is heard many times a day; anything louder stops being a signal and becomes
 * something the user turns off.
 *
 * Everything here fails silently. Autoplay policy blocks audio until the page
 * has seen a gesture, Safari suspends the context when the tab is hidden, and
 * some embedded webviews have no AudioContext at all — in each case a missing
 * chime is not worth an error, because the notification itself still arrives.
 */

/** Original, gently rising three-note chime; separate from the refresh sound. */
const PARTIALS: { hz: number; gain: number; delay: number; decay: number }[] = [
  { hz: 659.25, gain: 0.09, delay: 0, decay: 0.28 },
  { hz: 987.77, gain: 0.08, delay: 0.12, decay: 0.35 },
  { hz: 1318.5, gain: 0.055, delay: 0.25, decay: 0.42 },
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
const SOUND_SETTING = 'tp:notification-sound';

export function notificationSoundEnabled(): boolean {
  try { return localStorage.getItem(SOUND_SETTING) !== 'off'; }
  catch { return true; }
}

export function setNotificationSoundEnabled(enabled: boolean): void {
  try { localStorage.setItem(SOUND_SETTING, enabled ? 'on' : 'off'); }
  catch { /* Private browsing may disable storage. */ }
}

/** Plays the chime once for `id`; a repeat call with the same id does nothing. */
export function playNotificationChime(id?: string): void {
  if (!notificationSoundEnabled()) return;
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
  const playedAt = lastChimeAt;

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
    window.setTimeout(() => {
      tone.disconnect();
      if (lastChimeAt === playedAt && audio.state === 'running') void audio.suspend().catch(() => {});
    }, 900);
  } catch {
    /* no audio in this environment; the notification still arrived */
  }
}

/** Resume Web Audio on the first real gesture, before any realtime event arrives. */
export function installNotificationAudioUnlock(): void {
  const unlock = () => {
    const audio = context();
    if (audio?.state === 'suspended') {
      void audio.resume().then(() => {
        if (Date.now() - lastChimeAt >= 900 && audio.state === 'running') return audio.suspend();
      }).catch(() => {});
    }
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
