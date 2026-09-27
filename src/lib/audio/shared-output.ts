import { createAudioOutput } from './audio-output';
import { refreshAudioDiagnosticsEnabled, traceRefreshAudio } from './refresh-diagnostics';

let diagnosticContextSerial = 0;
/** Contexts created and not yet reported closed: a leak shows up as a climbing number. */
let diagnosticLiveContexts = 0;

/** A real AudioContext; numbered in the diagnostic trace so the log shows which one changed. */
export function createTracedAudioContext(label = 'ctx'): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Constructor = window.AudioContext ?? (window as unknown as {
    webkitAudioContext?: typeof AudioContext;
  }).webkitAudioContext;
  if (!Constructor) return null;
  try {
    const context = new Constructor();
    if (refreshAudioDiagnosticsEnabled()) {
      const id = ++diagnosticContextSerial;
      const live = ++diagnosticLiveContexts;
      traceRefreshAudio(`${label}-created`, `#${id} ${context.state} ${context.sampleRate}Hz live=${live}`);
      let counted = false;
      context.addEventListener('statechange', () => {
        if (context.state === 'closed' && !counted) {
          counted = true;
          diagnosticLiveContexts -= 1;
          traceRefreshAudio(`${label}-statechange`, `#${id} closed live=${diagnosticLiveContexts}`);
          return;
        }
        traceRefreshAudio(`${label}-statechange`, `#${id} ${context.state}`);
      });
    }
    return context;
  } catch {
    traceRefreshAudio(`${label}-create-failed`);
    return null;
  }
}

/**
 * The page's one Web Audio output, shared by the refresh sound and the
 * notification chime. Each keeps its own on/off preference; they only share
 * the output, so either one's gesture keeps it (and the iOS audio session)
 * alive for the other.
 */
export const sharedAudioOutput = createAudioOutput<AudioContext>({
  createContext: () => createTracedAudioContext('ctx'),
  trace: refreshAudioDiagnosticsEnabled() ? traceRefreshAudio : undefined,
});

/** Whether this task holds a user activation; unknown (older WebKit) counts as yes. */
export function hasUserActivation(): boolean {
  const activation = typeof navigator === 'undefined' ? undefined
    : (navigator as Navigator & { userActivation?: { isActive: boolean } }).userActivation;
  return activation ? activation.isActive : true;
}
