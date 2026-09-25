type BufferLike = Pick<AudioBuffer, 'duration'>;

type OneShotSource = {
  buffer: AudioBuffer | null;
  onended: ((event: Event) => void) | null;
  connect: (destination: AudioNode) => unknown;
  start: (when?: number) => void;
  disconnect: () => void;
};

type OneShotContext = {
  state: AudioContextState;
  currentTime: number;
  destination: AudioNode;
  resume: () => Promise<void>;
  close: () => Promise<void>;
  decodeAudioData: (bytes: ArrayBuffer) => Promise<AudioBuffer>;
  createBufferSource: () => OneShotSource;
};

/**
 * Plays complete, non-overlapping UI effects. Resume is called synchronously
 * from the initiating gesture; the context is closed after the final buffer
 * ends so a short effect cannot leave an active audio session behind.
 */
export function createOneShotAudioPlayer(options: {
  createContext: () => OneShotContext | null;
  loadBuffer: (context: OneShotContext) => Promise<BufferLike>;
}) {
  let context: OneShotContext | null = null;
  let bufferPromise: Promise<BufferLike> | null = null;
  let queued = 0;
  let active = 0;
  let nextStartAt = 0;

  const release = (target: OneShotContext) => {
    if (context !== target || queued > 0 || active > 0) return;
    context = null;
    bufferPromise = null;
    nextStartAt = 0;
    void target.close().catch(() => {});
  };

  const getBuffer = (target: OneShotContext) => {
    if (!bufferPromise) {
      bufferPromise = options.loadBuffer(target).catch(error => {
        bufferPromise = null;
        throw error;
      });
    }
    return bufferPromise;
  };

  const schedule = (target: OneShotContext, sound: BufferLike) => {
    if (context !== target || target.state !== 'running') return;
    while (queued > 0) {
      queued -= 1;
      const source = target.createBufferSource();
      source.buffer = sound as AudioBuffer;
      source.connect(target.destination);
      const startAt = Math.max(target.currentTime + 0.01, nextStartAt);
      nextStartAt = startAt + sound.duration;
      active += 1;
      source.onended = () => {
        source.onended = null;
        source.disconnect();
        active -= 1;
        release(target);
      };
      try {
        source.start(startAt);
      } catch {
        source.onended = null;
        source.disconnect();
        active -= 1;
      }
    }
    release(target);
  };

  return {
    /** Call only from a user gesture. */
    playFromGesture() {
      if (!context || context.state === 'closed') {
        context = options.createContext();
        bufferPromise = null;
        nextStartAt = 0;
      }
      const target = context;
      if (!target) return;

      queued += 1;
      // This call must happen before awaiting decode so Safari sees the gesture.
      const resumed = target.state === 'running'
        ? Promise.resolve()
        : target.resume();
      void Promise.all([resumed, getBuffer(target)]).then(([, sound]) => {
        if (context === target && target.state === 'running') schedule(target, sound);
        else {
          queued = 0;
          release(target);
        }
      }).catch(() => {
        if (context === target) queued = 0;
        release(target);
      });
    },

    /** Try only when browser policy already permits autoplay; never prompt. */
    tryAutoplay() {
      if (context) return;
      const target = options.createContext();
      if (!target) return;
      context = target;
      bufferPromise = null;
      nextStartAt = 0;
      if (target.state !== 'running') {
        release(target);
        return;
      }
      queued = 1;
      void getBuffer(target).then(sound => schedule(target, sound)).catch(() => {
        queued = 0;
        release(target);
      });
    },

    /** Introspection kept small and useful for lifecycle regression tests. */
    state() {
      return { queued, active, hasContext: context !== null };
    },
  };
}
