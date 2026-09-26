import { useCallback } from 'react';
import moneySound from '../assets/money-sound-for-trader.m4a';
import { createOneShotAudioPlayer } from './audio/one-shot-audio';
import { audioPreferenceEnabled } from './audio/preferences';

const moneyPlayer = createOneShotAudioPlayer({
  createContext: () => {
    if (typeof window === 'undefined') return null;
    const Constructor = window.AudioContext ?? (window as unknown as {
      webkitAudioContext?: typeof AudioContext;
    }).webkitAudioContext;
    if (!Constructor) return null;
    try {
      return new Constructor();
    } catch {
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
  }, []);
}

/** Shared entry point for explicit in-app refresh/retry buttons. */
export function playMoneyRefreshSound(): void {
  if (audioPreferenceEnabled('refreshSound')) moneyPlayer.playFromGesture();
}

/** Prepare Web Audio during the pointer/touch start that precedes a pull. */
export function prepareMoneyRefreshSound(): void {
  if (audioPreferenceEnabled('refreshSound')) moneyPlayer.prepareFromGesture();
}

export function cancelMoneyRefreshPreparation(): void {
  moneyPlayer.cancelPreparation();
}
