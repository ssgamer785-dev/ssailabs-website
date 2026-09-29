/**
 * Voice-message playback on one shared <audio> element.
 *
 * Why the element is unlocked early, and why a refused play() keeps its source:
 *
 * iPhone (WebKit) refuses HTMLMediaElement.play() for audible media unless the
 * page is processing a user gesture at that moment, or the window still holds
 * transient user activation, which lasts 5 s (MediaElementSession::
 * playbackStateChangePermitted, Document::mediaUserGestureReason,
 * LocalDOMWindow::defaultTransientActivationDuration). A voice message needs
 * its signed address first, so the tap used to be followed by a network round
 * trip and only then by play(): fast enough on a good connection, refused with
 * NotAllowedError on a slow one. That is an intermittent failure that depends
 * on the network, not on the device.
 *
 * WebKit lifts the restriction for a given element for good the first time
 * that element is loaded or played inside a gesture
 * (HTMLMediaElement::prepareForLoad / play → removeBehaviorRestrictionsAfterFirstUserGesture).
 * So the shared element is loaded (load() with no source: no network, no audio
 * session) on the first tap anywhere in the app and again, if that never
 * happened, at the start of the tap on a voice message, before the address is
 * requested. After that, play() works whenever the address arrives.
 *
 * If a browser still refuses, the address is kept: the element already holds
 * the source, and the next tap calls play() inside its own gesture instead of
 * signing again and racing the clock a second time.
 */

/** A signed R2 address is valid for 15 minutes; leave a margin. */
export const SIGNED_URL_TTL_MS = 12 * 60 * 1000;

type VoiceEvent = 'timeupdate' | 'play' | 'pause' | 'loadedmetadata' | 'waiting' | 'canplay' | 'error' | 'ended';

/** The part of HTMLAudioElement this controller uses; a test supplies a model of WebKit's rules instead. */
export interface VoiceElement {
  src: string;
  readonly paused: boolean;
  currentTime: number;
  readonly duration: number;
  readonly error: unknown;
  play(): Promise<void>;
  pause(): void;
  load(): void;
  addEventListener(type: VoiceEvent, listener: () => void): void;
}

export type Activation = 'active' | 'inactive' | 'unknown';

export interface VoicePlaybackDeps {
  createElement: () => VoiceElement;
  /** Whether the current task holds a user activation; unknown on engines without navigator.userActivation. */
  activation?: () => Activation;
  now?: () => number;
  claim?: (id: string, stop: () => void) => void;
  release?: (id: string) => void;
  /** Diagnostics only: event names and numbers, never addresses, keys or message content. */
  trace?: (event: string, detail?: string) => void;
}

export interface VoiceView {
  playing: boolean;
  /** 0..1 through the clip. */
  progress: number;
  elapsed: number;
  duration: number;
  /** A tap is being served: the address is being fetched or the audio is starting. */
  loading: boolean;
  /** Could not play: a real failure, shown as an error. */
  error: string | null;
  /** The device wants another tap: shown as a hint, not as a failure. */
  hint: string | null;
}

export const VOICE_MESSAGES = {
  blocked: 'Tap play again to start this voice message.',
  failed: 'Could not play this voice message. Tap to try again.',
  unavailable: 'Voice message is unavailable.',
} as const;

type Problem = { key: string; kind: 'blocked' | 'failed'; message?: string };

const EXCLUSIVE_ID = 'voice';

function errorName(error: unknown): string {
  return typeof error === 'object' && error !== null && typeof (error as { name?: unknown }).name === 'string'
    ? (error as { name: string }).name : 'unknown';
}

/** DOMExceptions come from the browser and are mapped; an Error thrown by the app itself already carries user-facing words. */
function appMessage(error: unknown): string | undefined {
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) return undefined;
  return error instanceof Error && error.message ? error.message : undefined;
}

export function createVoicePlayback(deps: VoicePlaybackDeps) {
  const now = deps.now ?? (() => Date.now());
  const trace = deps.trace ?? (() => {});
  const activation = deps.activation ?? (() => 'unknown' as Activation);
  const listeners = new Set<() => void>();

  let element: VoiceElement | null = null;
  /** The clip whose source the element holds. */
  let activeKey: string | null = null;
  /** The clip a tap is currently serving (fetching its address, or waiting for play to start). */
  let loadingKey: string | null = null;
  let signedAt = 0;
  let problem: Problem | null = null;
  /** The element has been loaded or played inside a gesture: WebKit no longer asks for one. */
  let unlocked = false;

  const emit = () => listeners.forEach(listener => listener());

  const get = (): VoiceElement => {
    if (element) return element;
    const created = deps.createElement();
    for (const type of ['timeupdate', 'loadedmetadata', 'waiting', 'canplay', 'error'] as const) {
      created.addEventListener(type, () => {
        if (type === 'error') {
          trace('voice-source-error', String((created.error as { code?: number } | null)?.code ?? ''));
          // A fatal media error ends playback, but browsers leave `paused` false: settle it so nothing shows "playing".
          if (!created.paused) created.pause();
        }
        emit();
      });
    }
    created.addEventListener('play', () => { deps.claim?.(EXCLUSIVE_ID, () => created.pause()); emit(); });
    created.addEventListener('pause', () => { deps.release?.(EXCLUSIVE_ID); emit(); });
    created.addEventListener('ended', () => { activeKey = null; deps.release?.(EXCLUSIVE_ID); emit(); });
    element = created;
    return created;
  };

  const sourceUsable = (key: string, el: VoiceElement): boolean =>
    activeKey === key && !el.error && now() - signedAt < SIGNED_URL_TTL_MS
    && !(problem?.key === key && problem.kind === 'failed');

  const fail = (key: string, error: unknown) => {
    const name = errorName(error);
    // Another tap took over the element (a new source, or pause): nothing to report.
    if (name === 'AbortError') { trace('voice-play-aborted'); return; }
    // The browser wants a gesture. The element keeps its source, so the next tap plays it directly.
    if (name === 'NotAllowedError') { problem = { key, kind: 'blocked' }; trace('voice-play-blocked'); return; }
    problem = { key, kind: 'failed' };
    trace('voice-play-failed', name);
  };

  /** Calls play() synchronously (the caller is inside the tap) and reports how it went. */
  const startPlaying = async (el: VoiceElement, key: string, how: string): Promise<void> => {
    const startedAt = now();
    try {
      await el.play();
      unlocked = true;
      trace('voice-play-ok', `${how} ${Math.round(now() - startedAt)}ms`);
    } catch (error) {
      fail(key, error);
    }
  };

  /**
   * Call inside any user gesture. Loads the idle element once so WebKit lifts
   * its per-element gesture requirement (see the header). Never disturbs a
   * clip that is loaded or loading.
   */
  const prime = (): void => {
    if (unlocked) return;
    const state = activation();
    if (state === 'inactive') return;
    const el = get();
    if (!el.paused || activeKey !== null || loadingKey !== null) return;
    try { el.load(); } catch { return; }
    trace('voice-primed', state);
    // Without navigator.userActivation the gesture cannot be confirmed: try again on a later one.
    if (state === 'active') unlocked = true;
  };

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },

    view(key: string): VoiceView {
      const el = element;
      const active = activeKey === key && el !== null;
      const duration = active && Number.isFinite(el.duration) ? el.duration : 0;
      const elapsed = active ? el.currentTime : 0;
      const mine = problem?.key === key ? problem : null;
      const error = mine?.kind === 'failed' ? (mine.message ?? VOICE_MESSAGES.failed)
        : active && el.error ? VOICE_MESSAGES.failed : null;
      return {
        playing: active && !el.paused && !el.error,
        progress: duration > 0 ? Math.min(1, elapsed / duration) : 0,
        elapsed,
        duration,
        loading: loadingKey === key,
        error,
        hint: mine?.kind === 'blocked' ? VOICE_MESSAGES.blocked : null,
      };
    },

    prime,

    /** The play/pause button. Everything before the first await runs inside the tap. */
    async toggle(key: string, resolveSrc: () => Promise<string | null>): Promise<void> {
      const el = get();
      if (problem?.key === key && problem.kind === 'blocked') problem = null;

      if (sourceUsable(key, el)) {
        if (el.paused) {
          trace('voice-tap', 'resume');
          const done = startPlaying(el, key, 'resume');
          emit();
          await done;
          emit();
        } else {
          trace('voice-tap', 'pause');
          el.pause();
          emit();
        }
        return;
      }

      // The same clip is already being served: its address is on the way.
      if (loadingKey === key) return;

      trace('voice-tap', 'new');
      // Before the network round trip, while the tap still counts as a gesture.
      prime();
      loadingKey = key;
      problem = null;
      emit();
      try {
        const src = await resolveSrc();
        if (!src) throw new Error(VOICE_MESSAGES.unavailable);
        // A later tap on another clip took over while the address was being fetched.
        if (loadingKey !== key) return;
        el.pause();
        el.src = src;
        activeKey = key;
        signedAt = now();
        emit();
        await startPlaying(el, key, 'new');
      } catch (error) {
        if (loadingKey === key) {
          problem = { key, kind: 'failed', message: appMessage(error) };
          trace('voice-address-failed');
        }
      } finally {
        if (loadingKey === key) loadingKey = null;
        emit();
      }
    },

    seek(key: string, fraction: number): void {
      const el = element;
      if (!el || activeKey !== key || !Number.isFinite(el.duration) || el.duration <= 0) return;
      el.currentTime = Math.max(0, Math.min(1, fraction)) * el.duration;
      emit();
    },
  };
}
