import { useCallback } from 'react';
import moneySound from '../assets/money-sound-for-trader.m4a';
import { createOneShotAudioPlayer } from './audio/one-shot-audio';
import { audioPreferenceEnabled } from './audio/preferences';
import { refreshAudioDiagnosticsEnabled, refreshAudioExperimentMode, traceRefreshAudio } from './audio/refresh-diagnostics';
import { createRefreshSoundPlayer } from './audio/refresh-sound';
import { createTracedAudioContext, hasUserActivation, sharedAudioOutput } from './audio/shared-output';

async function loadMoneySound(context: { decodeAudioData: (bytes: ArrayBuffer) => Promise<AudioBuffer> }): Promise<AudioBuffer> {
  const response = await fetch(moneySound);
  if (!response.ok) throw new Error('Could not load refresh sound.');
  return context.decodeAudioData(await response.arrayBuffer());
}

const trace = refreshAudioDiagnosticsEnabled() ? traceRefreshAudio : undefined;
/** ?audioMode=legacy: the current production player, kept only for the side-by-side device test. */
const legacy = refreshAudioExperimentMode() === 'legacy';

const sharedPlayer = legacy ? null : createRefreshSoundPlayer<AudioContext>({
  output: sharedAudioOutput,
  loadBuffer: loadMoneySound,
  trace,
});

const legacyPlayer = legacy ? createOneShotAudioPlayer({
  trace,
  createContext: () => createTracedAudioContext('ctx'),
  loadBuffer: loadMoneySound,
}) : null;

let preloaded = false;
let preloadInFlight = false;
let reloadAttempted = false;

/** Pre-decode at boot so a later refresh gesture can schedule without waiting on network I/O. */
export function preloadMoneyRefreshSound(): void {
  if (preloaded || preloadInFlight) return;
  preloadInFlight = true;
  void (sharedPlayer ?? legacyPlayer!).preload().then(ready => { preloaded = ready; })
    .finally(() => { preloadInFlight = false; });
}

/** Preserve the previous best-effort reload sound only after auth restored the account preference. */
export function handleMoneySoundSessionReady(): void {
  if (reloadAttempted) return;
  reloadAttempted = true;
  const navigation = typeof performance !== 'undefined'
    ? performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    : undefined;
  if (navigation?.type !== 'reload' || !audioPreferenceEnabled('refreshSound')) return;
  if (legacyPlayer) { legacyPlayer.tryAutoplay(); return; }
  // Only where the browser already lets this page play (desktop); iOS keeps
  // the output suspended until a gesture, and nothing is queued for later.
  void sharedPlayer!.preload().then(() => {
    if (sharedAudioOutput.ensure()?.state === 'running') sharedPlayer!.playFromGesture(false);
  });
}

function play(): void {
  if (!audioPreferenceEnabled('refreshSound')) { traceRefreshAudio('refresh-sound-off'); return; }
  if (legacyPlayer) legacyPlayer.playFromGesture();
  else sharedPlayer!.playFromGesture(hasUserActivation());
}

export function useMoneySound() {
  // PhoneShell calls this directly from its pull-to-refresh touch/pointer/wheel gesture.
  return useCallback(play, []);
}

/** Shared entry point for explicit in-app refresh/retry buttons. */
export function playMoneyRefreshSound(): void {
  play();
}

/** The touch/pointer start that precedes a pull. */
export function prepareMoneyRefreshSound(): void {
  if (!audioPreferenceEnabled('refreshSound')) return;
  if (legacyPlayer) { legacyPlayer.prepareFromGesture(); return; }
  // A mouse press is an activation and can start the output early; an iOS
  // touchstart is not, so this only makes sure the sound is decoded.
  if (hasUserActivation() && sharedAudioOutput.ensure()?.state !== 'running') sharedAudioOutput.unlock(true);
  preloadMoneyRefreshSound();
}

export function cancelMoneyRefreshPreparation(): void {
  // The shared output is kept for the page's lifetime; only legacy releases.
  legacyPlayer?.cancelPreparation();
}

/** Page lifecycle: the sound must never continue, or start, while the page is hidden. */
export function handleRefreshAudioLifecycle(event: 'hidden' | 'visible' | 'pagehide' | 'pageshow', persisted = false): void {
  if (legacyPlayer) {
    if (event === 'hidden' || event === 'pagehide') legacyPlayer.resetOutput();
    else preloadMoneyRefreshSound();
    return;
  }
  if (event === 'hidden' || event === 'pagehide') {
    sharedPlayer!.stop(event);
    // A page that is really unloading releases its output; a page going into
    // the back/forward cache keeps it, and WebKit interrupts it meanwhile.
    if (event === 'pagehide' && !persisted) sharedAudioOutput.close();
    return;
  }
  sharedAudioOutput.foreground();
  preloadMoneyRefreshSound();
}
