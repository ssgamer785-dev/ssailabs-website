import { useCallback, useEffect } from 'react';
import moneySound from '../assets/money-sound-for-trader.m4a';
import { createOneShotAudioPlayer } from './audio/one-shot-audio';

let bootHandled = false;

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

export function useMoneySound() {
  useEffect(() => {
    if (bootHandled) return;
    bootHandled = true;
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    void moneyPlayer.preload().then(() => {
      if (navigation?.type === 'reload') moneyPlayer.tryAutoplay();
    });
  }, []);

  // PhoneShell calls this directly from its pull-to-refresh pointer gesture.
  return useCallback(() => moneyPlayer.playFromGesture(), []);
}

/** Shared entry point for explicit in-app refresh/retry buttons. */
export function playMoneyRefreshSound(): void {
  moneyPlayer.playFromGesture();
}
