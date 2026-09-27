import { useCallback } from 'react';
import moneySound from '../assets/money-sound-for-trader.m4a';
import { createOneShotAudioPlayer } from './audio/one-shot-audio';
import { audioPreferenceEnabled } from './audio/preferences';
import { refreshAudioDiagnosticsEnabled, refreshAudioExperimentMode, traceRefreshAudio } from './audio/refresh-diagnostics';

let diagnosticContextSerial = 0;
/** Contexts created and not yet reported closed: a leak shows up as a climbing number. */
let diagnosticLiveContexts = 0;

const moneyPlayer = createOneShotAudioPlayer({
  trace: refreshAudioDiagnosticsEnabled() ? traceRefreshAudio : undefined,
  retainContext: refreshAudioExperimentMode() === 'warm',
  createContext: () => {
    if (typeof window === 'undefined') return null;
    const Constructor = window.AudioContext ?? (window as unknown as {
      webkitAudioContext?: typeof AudioContext;
    }).webkitAudioContext;
    if (!Constructor) return null;
    try {
      const context = new Constructor();
      // Diagnostic-only: numbered so the log shows which context changed, and
      // every transition is recorded — including WebKit's non-standard
      // 'interrupted' state, which call-site snapshots can miss entirely.
      if (refreshAudioDiagnosticsEnabled()) {
        const id = ++diagnosticContextSerial;
        const live = ++diagnosticLiveContexts;
        traceRefreshAudio('ctx-created', `#${id} ${context.state} ${context.sampleRate}Hz live=${live}`);
        let counted = false;
        context.addEventListener('statechange', () => {
          if (context.state === 'closed' && !counted) {
            counted = true;
            diagnosticLiveContexts -= 1;
            traceRefreshAudio('ctx-statechange', `#${id} closed live=${diagnosticLiveContexts}`);
            return;
          }
          traceRefreshAudio('ctx-statechange', `#${id} ${context.state}`);
        });
      }
      return context;
    } catch {
      traceRefreshAudio('ctx-create-failed');
      return null;
    }
  },
  loadBuffer: async context => {
    const response = await fetch(moneySound);
    if (!response.ok) throw new Error('Could not load refresh sound.');
    const bytes = await response.arrayBuffer();
    return context.decodeAudioData(bytes);
  },
});

let preloaded = false;
let preloadInFlight = false;
let reloadAttempted = false;

/** Pre-decode at boot so a later refresh gesture can schedule without waiting on network I/O. */
export function preloadMoneyRefreshSound(): void {
  if (preloaded || preloadInFlight) return;
  preloadInFlight = true;
  void moneyPlayer.preload().then(ready => { preloaded = ready; })
    .finally(() => { preloadInFlight = false; });
}

/** Preserve the previous best-effort reload sound only after auth restored the account preference. */
export function handleMoneySoundSessionReady(): void {
  if (reloadAttempted) return;
  reloadAttempted = true;
  const navigation = typeof performance !== 'undefined'
    ? performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    : undefined;
  if (navigation?.type === 'reload' && audioPreferenceEnabled('refreshSound')) moneyPlayer.tryAutoplay();
}

export function useMoneySound() {

  // PhoneShell calls this directly from its pull-to-refresh pointer gesture.
  return useCallback(() => {
    if (audioPreferenceEnabled('refreshSound')) moneyPlayer.playFromGesture();
    else traceRefreshAudio('refresh-sound-off');
  }, []);
}

/** Shared entry point for explicit in-app refresh/retry buttons. */
export function playMoneyRefreshSound(): void {
  if (audioPreferenceEnabled('refreshSound')) moneyPlayer.playFromGesture();
  else traceRefreshAudio('refresh-sound-off');
}

/** Prepare Web Audio during the pointer/touch start that precedes a pull. */
export function prepareMoneyRefreshSound(): void {
  if (audioPreferenceEnabled('refreshSound')) moneyPlayer.prepareFromGesture();
}

export function cancelMoneyRefreshPreparation(): void {
  moneyPlayer.cancelPreparation();
}

/** A hidden/page-cached tab must not reuse a silent WebKit output context. */
export function resetMoneyRefreshAudioSession(): void {
  moneyPlayer.resetOutput();
}
