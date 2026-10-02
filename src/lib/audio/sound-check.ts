import type { OutputStatus } from './audio-output';

/**
 * The sound settings' test. It answers the one question the page can answer:
 * did the device START the sound for this tap? It can never say the sound was
 * heard (silent switch, volume, Bluetooth are invisible to a web page), so a
 * successful result is always followed by asking the member.
 */
export type SoundCheckResult = 'started' | 'blocked' | 'unsupported';

/** How long a device gets to activate its audio session before the test is called blocked. */
export const SOUND_CHECK_WINDOW_MS = 2_000;
const POLL_MS = 100;

export interface SoundCheckDeps {
  /** Unlock and resume the output; runs inside the tap. Returns false when there is no Web Audio at all. */
  unlock: () => boolean;
  /** Start the sound; runs inside the tap, before any await. */
  play: () => void;
  status: () => OutputStatus;
  /** Readies other gesture-gated media (the voice-message element) in the same tap. */
  prime?: () => void;
  now?: () => number;
  wait?: (ms: number) => Promise<void>;
  windowMs?: number;
}

export async function runSoundCheck(deps: SoundCheckDeps): Promise<SoundCheckResult> {
  const now = deps.now ?? (() => performance.now());
  const wait = deps.wait ?? (ms => new Promise<void>(resolve => setTimeout(resolve, ms)));
  // Everything up to the first await runs inside the tap.
  deps.prime?.();
  if (!deps.unlock()) return 'unsupported';
  deps.play();
  const deadline = now() + (deps.windowMs ?? SOUND_CHECK_WINDOW_MS);
  for (;;) {
    if (deps.status() === 'running') return 'started';
    if (now() >= deadline) return 'blocked';
    await wait(POLL_MS);
  }
}

export interface OutputDescription {
  tone: 'good' | 'wait' | 'bad' | 'neutral';
  title: string;
  detail: string;
}

/**
 * The output's state under one of five names, the same everywhere (sound
 * settings, device diagnostics): what the member can act on, never a claim
 * that a sound was heard.
 */
export type OutputLabel = 'Ready' | 'Needs one tap' | 'Suspended' | 'Unsupported' | 'Failed';

export function outputLabel(status: OutputStatus | 'unsupported'): OutputLabel {
  switch (status) {
    case 'running': return 'Ready';
    case 'interrupted':
    case 'suspended': return 'Suspended';
    case 'stalled': return 'Failed';
    case 'unsupported': return 'Unsupported';
    case 'locked':
    case 'none':
    default: return 'Needs one tap';
  }
}

/** Plain-language state of the output for the sound settings. */
export function describeOutput(status: OutputStatus | 'unsupported'): OutputDescription {
  const title = outputLabel(status);
  switch (status) {
    case 'running':
      return { tone: 'good', title, detail: 'This device is running the app’s audio. Use a test below to hear it.' };
    case 'interrupted':
    case 'suspended':
      return { tone: 'wait', title, detail: 'A call, another app or the screen lock paused it. Tap a test below to start it again.' };
    case 'stalled':
      return { tone: 'wait', title, detail: 'The audio stopped moving. Tap a test below to restart it.' };
    case 'unsupported':
      return { tone: 'bad', title, detail: 'This browser cannot play the app’s sounds.' };
    case 'locked':
    case 'none':
    default:
      return { tone: 'wait', title, detail: 'Your device lets an app start sound only after you tap the screen. Tap a test below, or anywhere in the app.' };
  }
}
