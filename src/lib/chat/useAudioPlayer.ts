import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * One shared <audio> element for the whole thread, so starting a voice note
 * always stops whichever one was playing — and mobile only ever holds a
 * single decoder.
 */
let sharedAudio: HTMLAudioElement | null = null;
const listeners = new Set<() => void>();
let activeKey: string | null = null;
let signedAt = 0;

function getAudio(): HTMLAudioElement {
  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.preload = 'none';
    const notify = () => listeners.forEach(l => l());
    sharedAudio.addEventListener('timeupdate', notify);
    sharedAudio.addEventListener('play', notify);
    sharedAudio.addEventListener('pause', notify);
    sharedAudio.addEventListener('loadedmetadata', notify);
    sharedAudio.addEventListener('waiting', notify);
    sharedAudio.addEventListener('canplay', notify);
    sharedAudio.addEventListener('error', notify);
    sharedAudio.addEventListener('ended', () => { activeKey = null; notify(); });
  }
  return sharedAudio;
}

export interface UseAudioPlayer {
  playing: boolean;
  /** 0..1 through the clip. */
  progress: number;
  /** Seconds elapsed, for the running timer on the bubble. */
  elapsed: number;
  duration: number;
  loading: boolean;
  error: string | null;
  toggle: () => Promise<void>;
  seek: (fraction: number) => void;
}

/**
 * @param key      stable id for this clip (message id)
 * @param resolveSrc lazily resolves the playable URL — a signed R2 GET, or a
 *                 local object URL while the note is still uploading
 */
export function useAudioPlayer(key: string, resolveSrc: () => Promise<string | null>): UseAudioPlayer {
  const [, force] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resolveRef = useRef(resolveSrc);
  resolveRef.current = resolveSrc;

  useEffect(() => {
    const rerender = () => force(n => n + 1);
    listeners.add(rerender);
    return () => { listeners.delete(rerender); };
  }, []);

  const audio = getAudio();
  const isActive = activeKey === key;
  const playing = isActive && !audio.paused;
  const duration = isActive && Number.isFinite(audio.duration) ? audio.duration : 0;
  const elapsed = isActive ? audio.currentTime : 0;
  const progress = duration > 0 ? Math.min(1, elapsed / duration) : 0;

  const toggle = useCallback(async () => {
    const el = getAudio();
    if (activeKey === key && !error && !el.error && Date.now() - signedAt < 12 * 60 * 1000) {
      if (el.paused) {
        try { await el.play(); }
        catch { setError('Playback could not start. Tap to retry.'); }
      } else el.pause();
      force(n => n + 1);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const src = await resolveRef.current();
      if (!src) throw new Error('Voice message is unavailable.');
      el.pause();
      el.src = src;
      activeKey = key;
      signedAt = Date.now();
      await el.play();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not play this voice message.');
    } finally {
      setLoading(false);
      force(n => n + 1);
    }
  }, [key, error]);

  const seek = useCallback((fraction: number) => {
    const el = getAudio();
    if (activeKey !== key || !Number.isFinite(el.duration) || el.duration <= 0) return;
    el.currentTime = Math.max(0, Math.min(1, fraction)) * el.duration;
    force(n => n + 1);
  }, [key]);

  return { playing, progress, elapsed, duration, loading, error: error ?? (isActive && audio.error ? 'Could not play this format. Tap to retry.' : null), toggle, seek };
}
