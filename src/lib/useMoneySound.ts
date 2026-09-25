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

let preloadStarted = false;

/** Pre-decode at boot so a later refresh gesture can schedule without waiting on network I/O. */
export function preloadMoneyRefreshSound(): void {
  if (preloadStarted) return;
  preloadStarted = true;
  void moneyPlayer.preload();
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
