import { useCallback, useEffect } from 'react';
import moneySound from '../assets/money-sound-for-trader.m4a';

/**
 * The cash-register sound that marks a completed pull-to-refresh.
 *
 * This used to be synthesised with Web Audio oscillators — an approximation of
 * a cha-ching, built because there was no audio asset. There is one now, so it
 * plays that file and nothing else.
 *
 * One element, created on first play and reused. That is what keeps a fast
 * second pull from stacking a second voice on top of the first: rewinding to
 * zero restarts the clip instead of overlapping it. It also means the auth
 * screens never construct an audio element at all, since they never reach the
 * call site.
 *
 * Every failure path here is silent on purpose. If the browser's autoplay
 * policy refuses the play() promise, or the element cannot be created at all,
 * the refresh still runs — a missing sound effect is not worth an error.
 */
export function useMoneySound() {
  useEffect(() => {
    const unlock = () => {
      const el = moneyElement();
      if (!el || unlocked) return;
      const started = Date.now();
      el.muted = true;
      void el.play().then(() => {
        if (lastPlayedAt <= started) { el.pause(); el.currentTime = 0; }
        el.muted = false; unlocked = true;
      }).catch(() => { el.muted = false; });
    };
    document.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });
    return () => { document.removeEventListener('pointerdown', unlock); document.removeEventListener('keydown', unlock); };
  }, []);

  // Stable across renders. PhoneShell's gesture effect depends on this
  // callback, and a new identity each render would tear the effect down mid-
  // refresh and strand the indicator.
  return useCallback(function playMoney() {
    try {
      const el = moneyElement();
      if (!el || Date.now() - lastPlayedAt < 800) return;
      lastPlayedAt = Date.now();
      el.muted = false;
      el.pause();
      el.currentTime = 0;
      void el.play().catch(() => { /* autoplay blocked; stay quiet */ });
    } catch {
      /* no audio support in this environment */
    }
  }, []);
}

let sharedElement: HTMLAudioElement | null = null;
let unlocked = false;
let lastPlayedAt = 0;
function moneyElement(): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null;
  if (!sharedElement) { sharedElement = new Audio(moneySound); sharedElement.preload = 'auto'; }
  return sharedElement;
}
