import type { AudioOutput, OutputLike } from './audio-output';

type BufferLike = Pick<AudioBuffer, 'duration'>;

type Source = {
  buffer: AudioBuffer | null;
  onended: ((event: Event) => void) | null;
  connect: (destination: AudioNode) => unknown;
  start: (when?: number) => void;
  stop: () => void;
  disconnect: () => void;
};

export type RefreshContext = OutputLike & {
  destination: AudioNode;
  decodeAudioData: (bytes: ArrayBuffer) => Promise<AudioBuffer>;
  createBufferSource: () => Source;
};

/**
 * The refresh sound, played on the page's single long-lived output.
 *
 * One refresh gesture schedules at most one source, replacing any sound still
 * playing. A sound that has not started within the start window is dropped,
 * never played late — but the output is kept, because an audio session that
 * finished activating a moment too late is exactly what the next refresh needs.
 */
export function createRefreshSoundPlayer<C extends RefreshContext>(options: {
  output: AudioOutput<C>;
  loadBuffer: (context: C) => Promise<BufferLike>;
  trace?: (event: string, detail?: string) => void;
  /** Longest acceptable gap between the gesture and the sound starting. */
  maxStartDelayMs?: number;
}) {
  const trace = options.trace ?? (() => {});
  const maxStartDelayMs = options.maxStartDelayMs ?? 400;
  let buffer: BufferLike | null = null;
  let decoding: Promise<BufferLike> | null = null;
  let source: Source | null = null;
  let timers: ReturnType<typeof setTimeout>[] = [];
  let lastGestureAt = -Infinity;

  const clearTimers = () => { timers.forEach(clearTimeout); timers = []; };

  const drop = (event: string, detail: string) => {
    clearTimers();
    const previous = source;
    if (!previous) return;
    source = null;
    previous.onended = null;
    try { previous.stop(); } catch { /* It may never have started. */ }
    previous.disconnect();
    trace(event, detail);
  };

  const decode = (): Promise<BufferLike> | null => {
    if (buffer) return Promise.resolve(buffer);
    if (decoding) return decoding;
    const target = options.output.ensure();
    if (!target) return null;
    trace('preload-start', target.state);
    decoding = options.loadBuffer(target).then(sound => {
      buffer = sound;
      trace('preload-ready');
      return sound;
    }).catch(error => {
      decoding = null;
      trace('preload-failed');
      throw error;
    });
    return decoding;
  };

  return {
    /** Decode once, on the shared output, before any gesture needs it. */
    async preload(): Promise<boolean> {
      try { await decode(); return true; } catch { return false; }
    },

    /** Call synchronously inside the refresh gesture's touchend/pointerup/wheel task. */
    playFromGesture(hasActivation = true) {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - lastGestureAt < 100) { trace('duplicate-gesture-ignored'); return; }
      lastGestureAt = now;

      const target = options.output.unlock(hasActivation);
      if (!target) { trace('play-no-context'); return; }
      trace('play-gesture', `${target.state} clock=${target.currentTime.toFixed(3)} decoded=${!!buffer}`);
      drop('source-replaced', target.state);
      // Never queue a sound behind a decode: this refresh stays silent and
      // the next one plays.
      if (!buffer) { void decode()?.catch(() => {}); trace('play-not-decoded'); return; }

      const sound = buffer;
      const next = target.createBufferSource();
      next.buffer = sound as AudioBuffer;
      next.connect(target.destination);
      source = next;
      next.onended = () => {
        if (source !== next) return;
        source = null;
        next.onended = null;
        clearTimers();
        next.disconnect();
        trace('source-ended', `${target.state} clock=${target.currentTime.toFixed(3)}`);
      };
      try {
        // Scheduled inside the gesture even while suspended: iOS starts it the
        // moment admission completes, with no second trip through a promise.
        next.start(target.currentTime);
      } catch {
        drop('source-start-failed', target.state);
        return;
      }
      trace('source-start', `${target.state} clock=${target.currentTime.toFixed(3)} duration=${sound.duration.toFixed(2)}s`);

      const check = (final: boolean) => {
        if (source !== next) return;
        const clock = options.output.clock(target);
        if (target.state === 'running' && clock === 'stalled') {
          // Rendering is not advancing: whatever it would play, it would play late.
          drop('source-dropped', `stalled clock=${target.currentTime.toFixed(3)}`);
          options.output.markStalled(target, 'refresh-start');
          return;
        }
        if (final && target.state !== 'running') {
          // iOS has not admitted playback yet. Drop the sound so it cannot
          // start late, but keep the output: the activation in flight is what
          // makes the next refresh immediate.
          drop('start-deadline', `${target.state} kept-output`);
          return;
        }
        if (!final) trace('clock-after-150ms', `${target.state} ${clock} clock=${target.currentTime.toFixed(3)}`);
      };
      timers.push(setTimeout(() => check(false), 150));
      timers.push(setTimeout(() => check(true), maxStartDelayMs));
      // onended never arriving means the clock stopped mid-sound.
      timers.push(setTimeout(() => {
        if (source !== next) return;
        drop('source-watchdog', target.state);
        options.output.markStalled(target, 'no-onended');
      }, Math.max(0, sound.duration) * 1_000 + 1_000));
    },

    /** The page is hiding: nothing may keep sounding, or start on return. */
    stop(reason: string) { drop('source-stopped', reason); },

    state() {
      return { active: source ? 1 : 0, decoded: !!buffer };
    },
  };
}
