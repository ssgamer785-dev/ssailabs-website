import { useCallback } from 'react';
import { audioPreferenceEnabled, setAudioPreference } from './audio/preferences';

/** Original short, gently rising three-note in-app chime. */
const PARTIALS = [
  { hz: 659.25, gain: 0.09, delay: 0, decay: 0.28 },
  { hz: 987.77, gain: 0.08, delay: 0.12, decay: 0.35 },
  { hz: 1318.5, gain: 0.055, delay: 0.25, decay: 0.42 },
];
const ATTACK_SECONDS = 0.006;
const CHIMED_CAP = 300;
const SOUND_DURATION_SECONDS = 0.68;
const MAX_QUEUED_SECONDS = 1.55;

type AudioContextConstructor = typeof AudioContext;
let ctx: AudioContext | null = null;
let lastScheduledEnd = 0;
let unlockInstalled = false;
const chimed = new Set<string>();

function context(): AudioContext | null {
  if (ctx?.state === 'closed') { ctx = null; lastScheduledEnd = 0; }
  if (ctx) return ctx;
  const Constructor: AudioContextConstructor | undefined = typeof window === 'undefined'
    ? undefined
    : window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
  if (!Constructor) return null;
  try { ctx = new Constructor(); return ctx; }
  catch { return null; }
}

/** Same notification row may be delivered by overlapping app-wide/feed listeners. */
export function markNotificationSoundSeen(id: string): boolean {
  if (!id || chimed.has(id)) return false;
  chimed.add(id);
  if (chimed.size > CHIMED_CAP) {
    const oldest = chimed.values().next().value;
    if (oldest) chimed.delete(oldest);
  }
  return true;
}

export function notificationSoundEnabled(): boolean {
  return audioPreferenceEnabled('notificationSound');
}

/** Kept for callers/tests from the earlier notification-only settings control. */
export function notificationSoundSettingEnabled(value: string | null): boolean {
  return value !== 'off';
}
export function setNotificationSoundEnabled(enabled: boolean): void {
  setAudioPreference('notificationSound', enabled);
}

/** Plays at most once per event id, queues only a short burst, and never overlaps tones. */
export function playNotificationChime(id?: string): void {
  if (id && !markNotificationSoundSeen(id)) return;
  if (!notificationSoundEnabled()) return;
  const audio = context();
  if (!audio) return;

  try {
    // Do not suspend after each effect. The old suspend caused the next
    // Realtime event to attempt an autoplay-blocked resume and then dedupe it.
    const ready = audio.state === 'running' ? Promise.resolve() : audio.resume();
    void ready.then(() => {
      if (ctx !== audio || audio.state !== 'running') return;
      const now = audio.currentTime;
      const startAt = Math.max(now + 0.005, lastScheduledEnd);
      if (startAt - now > MAX_QUEUED_SECONDS) return;
      lastScheduledEnd = startAt + SOUND_DURATION_SECONDS + 0.06;

      const tone = audio.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 5200;
      tone.Q.value = 0.7;
      tone.connect(audio.destination);

      let remaining = PARTIALS.length;
      for (const partial of PARTIALS) {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        const start = startAt + partial.delay;
        oscillator.type = 'sine';
        oscillator.frequency.value = partial.hz;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(partial.gain, start + ATTACK_SECONDS);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + partial.decay);
        oscillator.connect(gain);
        gain.connect(tone);
        oscillator.onended = () => {
          oscillator.disconnect();
          gain.disconnect();
          remaining -= 1;
          if (remaining === 0) tone.disconnect();
        };
        oscillator.start(start);
        oscillator.stop(start + partial.decay + 0.02);
      }
    }).catch(() => {
      // Browser audio policy may block a resume. The next genuine gesture can unlock it.
    });
  } catch { /* Notifications remain visible when audio is unsupported. */ }
}

/** Called directly from a real user gesture (also from the push Allow button). */
export function unlockNotificationAudio(): void {
  const audio = context();
  if (audio && audio.state !== 'running' && audio.state !== 'closed') void audio.resume().catch(() => {});
}

/** Installs one app-lifetime gesture/lifecycle unlock; never asks for OS permission. */
export function installNotificationAudioUnlock(): void {
  if (unlockInstalled || typeof document === 'undefined') return;
  unlockInstalled = true;
  const onGesture = () => unlockNotificationAudio();
  const onVisible = () => { if (document.visibilityState === 'visible') unlockNotificationAudio(); };
  document.addEventListener('pointerdown', onGesture, { passive: true });
  document.addEventListener('keydown', onGesture);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('pageshow', onGesture);
}

export function useNotificationSound() {
  return useCallback((id?: string) => playNotificationChime(id), []);
}
