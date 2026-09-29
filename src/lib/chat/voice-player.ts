import { traceRefreshAudio } from '../audio/refresh-diagnostics';
import { claimPlayback, releasePlayback } from '../media/exclusive-playback';
import { createVoicePlayback, type Activation, type VoiceElement } from './voice-playback';

function activation(): Activation {
  if (typeof navigator === 'undefined') return 'unknown';
  const state = (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
  return state ? (state.isActive ? 'active' : 'inactive') : 'unknown';
}

/**
 * The page's one voice-message player: a single <audio> element, so starting a
 * voice note always stops whichever one was playing and a phone only ever
 * holds one decoder. The element is created on first use.
 */
export const voicePlayer = createVoicePlayback({
  createElement: () => {
    const audio = new Audio();
    audio.preload = 'none';
    return audio as unknown as VoiceElement;
  },
  activation,
  claim: claimPlayback,
  release: releasePlayback,
  trace: traceRefreshAudio,
});

/** Call from inside a user gesture: lets WebKit lift its gesture requirement for voice messages. */
export function primeVoicePlayback(): void {
  voicePlayer.prime();
}
