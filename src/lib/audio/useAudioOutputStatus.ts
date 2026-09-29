import { useSyncExternalStore } from 'react';
import type { OutputStatus } from './audio-output';
import { sharedAudioOutput } from './shared-output';

function webAudioSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return !!(window.AudioContext ?? (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext);
}

const snapshot = (): OutputStatus | 'unsupported' => (webAudioSupported() ? sharedAudioOutput.status() : 'unsupported');

/** The shared audio output's state, kept current as the browser changes it (locked → running, interrupted, …). */
export function useAudioOutputStatus(): OutputStatus | 'unsupported' {
  return useSyncExternalStore(sharedAudioOutput.subscribe, snapshot, () => 'none');
}
