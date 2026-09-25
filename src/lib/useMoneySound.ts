import { useCallback, useEffect } from 'react';
import moneySound from '../assets/money-sound-for-trader.m4a';

/** The original recording, played as a short UI effect rather than an HTML media player. */
let context: AudioContext | null = null;
let decoded: Promise<AudioBuffer> | null = null;
let active: AudioBufferSourceNode | null = null;
let pending = false;
let bootHandled = false;
let listenersInstalled = false;
let lastPlayedAt = 0;

function audioContext(): AudioContext | null {
  if (context) return context;
  const Constructor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Constructor) return null;
  try { context = new Constructor(); return context; } catch { return null; }
}

function buffer(ctx: AudioContext): Promise<AudioBuffer> {
  if (!decoded) decoded = fetch(moneySound).then(res => {
    if (!res.ok) throw new Error('Could not load startup sound.');
    return res.arrayBuffer();
  }).then(bytes => ctx.decodeAudioData(bytes)).catch(error => { decoded = null; throw error; });
  return decoded;
}

function removeUnlock(): void {
  if (!listenersInstalled) return;
  document.removeEventListener('pointerdown', unlock);
  document.removeEventListener('keydown', unlock);
  listenersInstalled = false;
}

function unlock(): void {
  const ctx = audioContext();
  if (!ctx) return;
  void ctx.resume().then(() => {
    if (pending) void play();
    else { removeUnlock(); void ctx.suspend().catch(() => {}); }
  }).catch(() => {});
}

function installUnlock(): void {
  if (listenersInstalled) return;
  document.addEventListener('pointerdown', unlock);
  document.addEventListener('keydown', unlock);
  listenersInstalled = true;
}

async function play(): Promise<void> {
  if (active || Date.now() - lastPlayedAt < 800) return;
  const ctx = audioContext();
  if (!ctx) return;
  pending = true;
  installUnlock();
  try {
    // Decode once, retaining the exact asset bytes. A gesture resumes the
    // context when browser autoplay rules blocked the first attempt.
    const clip = await buffer(ctx);
    if (ctx.state !== 'running') {
      await ctx.resume();
      if ((ctx as AudioContext).state !== 'running') return;
    }
    if (active || Date.now() - lastPlayedAt < 800) return;
    const source = ctx.createBufferSource();
    source.buffer = clip;
    source.connect(ctx.destination);
    active = source;
    lastPlayedAt = Date.now();
    pending = false;
    removeUnlock();
    source.onended = () => {
      source.disconnect();
      if (active === source) active = null;
      // Releasing the output session avoids a lingering iOS lock-screen player.
      void ctx.suspend().catch(() => {});
    };
    source.start();
  } catch {
    // Autoplay and decoder support vary by browser; retain one pending attempt.
  }
}

export function useMoneySound() {
  useEffect(() => {
    installUnlock();
    if (bootHandled) return;
    bootHandled = true;
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (navigation?.type === 'reload') void play();
  }, []);

  return useCallback(() => { void play(); }, []);
}
