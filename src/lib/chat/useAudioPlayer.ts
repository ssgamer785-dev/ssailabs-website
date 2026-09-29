import { useCallback, useEffect, useRef, useState } from 'react';
import { voicePlayer } from './voice-player';

export interface UseAudioPlayer {
  playing: boolean;
  /** 0..1 through the clip. */
  progress: number;
  /** Seconds elapsed, for the running timer on the bubble. */
  elapsed: number;
  duration: number;
  loading: boolean;
  /** Could not play: a real failure. */
  error: string | null;
  /** The device wants another tap: a hint, not a failure. */
  hint: string | null;
  toggle: () => Promise<void>;
  seek: (fraction: number) => void;
}

/**
 * @param key      stable id for this clip (message id)
 * @param resolveSrc lazily resolves the playable URL — a signed R2 GET, or a
 *                 local object URL while the note is still uploading
 *
 * All clips share one <audio> element (see voice-player.ts); this hook is the
 * per-bubble view of it.
 */
export function useAudioPlayer(key: string, resolveSrc: () => Promise<string | null>): UseAudioPlayer {
  const [, force] = useState(0);
  const resolveRef = useRef(resolveSrc);
  resolveRef.current = resolveSrc;

  useEffect(() => voicePlayer.subscribe(() => force(n => n + 1)), []);

  const toggle = useCallback(() => voicePlayer.toggle(key, () => resolveRef.current()), [key]);
  const seek = useCallback((fraction: number) => voicePlayer.seek(key, fraction), [key]);

  return { ...voicePlayer.view(key), toggle, seek };
}
