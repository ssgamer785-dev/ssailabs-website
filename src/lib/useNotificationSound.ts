import { currentPlaybackOwner } from './media/exclusive-playback';
import { useCallback } from 'react';
import { audioPreferenceEnabled, setAudioPreference } from './audio/preferences';
import { refreshAudioDiagnosticsEnabled, refreshAudioExperimentMode, traceRefreshAudio } from './audio/refresh-diagnostics';
import { hasUserActivation, sharedAudioOutput } from './audio/shared-output';
import { primeVoicePlayback } from './chat/voice-player';

/** Original short, gently rising three-note in-app chime. */
const PARTIALS = [
  { hz: 659.25, gain: 0.09, delay: 0, decay: 0.28 },
  { hz: 987.77, gain: 0.08, delay: 0.12, decay: 0.35 },
  { hz: 1318.5, gain: 0.055, delay: 0.25, decay: 0.42 },
];
const ATTACK_SECONDS = 0.006;
const CHIMED_CAP = 300;
const SOUND_DURATION_SECONDS = 0.68;
const MAX_UNLOCK_DELAY_MS = 250;

type AudioContextConstructor = typeof AudioContext;
let ctx: AudioContext | null = null;
let lastScheduledEnd = 0;
let unlockInstalled = false;
const chimed = new Set<string>();
/** ?audioMode=legacy keeps the production chime's own context for the side-by-side device test. */
const legacy = refreshAudioExperimentMode() === 'legacy';

function context(): AudioContext | null {
  if (!legacy) {
    // The page's one output, shared with the refresh sound. Only the output
    // is shared; the chime keeps its own preference and scheduling.
    const shared = sharedAudioOutput.ensure();
    if (shared !== ctx) { ctx = shared; lastScheduledEnd = 0; }
    return ctx;
  }
  if (ctx?.state === 'closed') { ctx = null; lastScheduledEnd = 0; }
  if (ctx) return ctx;
  const Constructor: AudioContextConstructor | undefined = typeof window === 'undefined'
    ? undefined
    : window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextConstructor }).webkitAudioContext;
  if (!Constructor) return null;
  try {
    const created = new Constructor();
    ctx = created;
    // Diagnostic-only: this app-lifetime context shares the page's audio
    // session with every refresh context, so its state belongs in that trace.
    if (refreshAudioDiagnosticsEnabled()) {
      traceRefreshAudio('nctx-created', created.state);
      created.addEventListener('statechange', () => traceRefreshAudio('nctx-statechange', created.state));
    }
    return ctx;
  }
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

/**
 * Plays the chime once the output runs. `force` ignores the member's preference and
 * `maxDelayMs` widens the "too late to play" limit: both only for the sound settings'
 * test button. Resolves to whether a chime was actually scheduled.
 */
function chime(options: { id?: string; force?: boolean; maxDelayMs?: number } = {}): Promise<boolean> {
  const { id, force = false, maxDelayMs = MAX_UNLOCK_DELAY_MS } = options;
  if (id && !markNotificationSoundSeen(id)) return Promise.resolve(false);
  if (!force && !notificationSoundEnabled()) { traceRefreshAudio('chime-skipped', 'pref off'); return Promise.resolve(false); }
  // A voice message or video is playing: the notification stays visible, the chime does not talk over it.
  if (!force && currentPlaybackOwner()) { traceRefreshAudio('chime-skipped', 'media playing'); return Promise.resolve(false); }
  const audio = context();
  if (!audio) { traceRefreshAudio('chime-skipped', 'no context'); return Promise.resolve(false); }
  traceRefreshAudio('chime-request', audio.state);

  const requestedAt = performance.now();
  const schedule = (): boolean => {
    try {
      if (ctx !== audio || audio.state !== 'running') { traceRefreshAudio('chime-skipped', audio.state); return false; }
      if (performance.now() - requestedAt > maxDelayMs) { traceRefreshAudio('chime-skipped', 'late'); return false; }
      const now = audio.currentTime;
      if (now < lastScheduledEnd) { traceRefreshAudio('chime-skipped', 'overlap'); return false; }
      traceRefreshAudio('chime-scheduled', `clock=${now.toFixed(3)}`);
      const startAt = now + 0.005;
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
      return true;
    } catch { /* Notifications remain visible when audio is unsupported. */ return false; }
  };
  if (audio.state === 'running') return Promise.resolve(schedule());
  try {
    // Browser audio policy may block this; the next genuine gesture unlocks the
    // context, but never replays this old event as a delayed chime.
    return audio.resume().then(schedule).catch(() => false);
  } catch { /* OS/browser audio policy */ return Promise.resolve(false); }
}

/** Plays at most once per event id and drops bursts rather than playing late. */
export function playNotificationChime(id?: string): void {
  void chime({ id });
}

/** The sound settings' test button: call inside the tap. Ignores the preference; waits longer for a slow audio session. */
export function playNotificationChimeForCheck(maxDelayMs: number): Promise<boolean> {
  return chime({ force: true, maxDelayMs });
}

/** Called directly from a real user gesture (also from the push Allow button). */
export function unlockNotificationAudio(): void {
  if (!legacy) {
    if (audioPreferenceEnabled('notificationSound') || audioPreferenceEnabled('refreshSound')) {
      sharedAudioOutput.unlock(hasUserActivation());
    }
    return;
  }
  const audio = context();
  if (audio && audio.state !== 'running' && audio.state !== 'closed') {
    traceRefreshAudio('nctx-resume-request', audio.state);
    void audio.resume().catch(() => {});
  }
}

/** Installs one app-lifetime gesture/lifecycle unlock; never asks for OS permission. */
export function installNotificationAudioUnlock(): void {
  if (unlockInstalled || typeof document === 'undefined') return;
  unlockInstalled = true;
  const onGesture = () => unlockNotificationAudio();
  if (!legacy) {
    // Every event that can carry a user activation. On iOS a TAP carries one
    // (WebKit synthesises mousedown/click for it); a pull-to-refresh drag does
    // not, so the output must already be unlocked by an earlier tap for a pull
    // to sound. A touch pointerdown alone never carries one.
    const onTap = () => {
      // The same tap also readies the voice-message element (see voice-playback.ts).
      primeVoicePlayback();
      onGesture();
    };
    for (const type of ['mousedown', 'pointerup', 'touchend', 'click', 'keydown'] as const) {
      document.addEventListener(type, onTap, { passive: true, capture: true });
    }
    return;
  }
  const onVisible = () => { if (document.visibilityState === 'visible') unlockNotificationAudio(); };
  document.addEventListener('pointerdown', onGesture, { passive: true });
  document.addEventListener('keydown', onGesture);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('pageshow', onGesture);
}

export function useNotificationSound() {
  return useCallback((id?: string) => playNotificationChime(id), []);
}
