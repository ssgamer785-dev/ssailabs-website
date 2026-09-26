type BufferLike = Pick<AudioBuffer, 'duration'>;

type OneShotSource = {
  buffer: AudioBuffer | null;
  onended: ((event: Event) => void) | null;
  connect: (destination: AudioNode) => unknown;
  start: (when?: number) => void;
  stop: () => void;
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

/** A short UI effect: at most one pending or playing source, never a backlog. */
export function createOneShotAudioPlayer(options: {
  createContext: () => OneShotContext | null;
  loadBuffer: (context: OneShotContext) => Promise<BufferLike>;
}) {
  let context: OneShotContext | null = null;
  let bufferPromise: Promise<BufferLike> | null = null;
  let cachedBuffer: BufferLike | null = null;
  let preloadPromise: Promise<void> | null = null;
  let pending = false;
  let source: OneShotSource | null = null;
  let generation = 0;
  let lastGestureAt = -Infinity;
  let preparedCloseTimer: ReturnType<typeof setTimeout> | undefined;
  let resumePromise: Promise<void> | null = null;

  const clearPreparedClose = () => {
    if (preparedCloseTimer) clearTimeout(preparedCloseTimer);
    preparedCloseTimer = undefined;
  };

  const release = (target: OneShotContext) => {
    if (context !== target || pending || source) return;
    clearPreparedClose();
    context = null;
    bufferPromise = null;
    resumePromise = null;
    void target.close().catch(() => {});
  };

  const resumeContext = (target: OneShotContext): Promise<void> => {
    if (target.state === 'running') return Promise.resolve();
    if (resumePromise) return resumePromise;
    const attempt = target.resume();
    resumePromise = attempt;
    void attempt.finally(() => {
      if (resumePromise === attempt) resumePromise = null;
    }).catch(() => {});
    return attempt;
  };

  const stopSource = () => {
    const previous = source;
    if (!previous) return;
    source = null;
    previous.onended = null;
    try { previous.stop(); } catch { /* It may already have ended. */ }
    previous.disconnect();
  };

  const cancel = (target: OneShotContext, request: number) => {
    if (context !== target || generation !== request) return;
    pending = false;
    stopSource();
    release(target);
  };

  const getBuffer = (target: OneShotContext) => {
    if (cachedBuffer) return Promise.resolve(cachedBuffer);
    if (!bufferPromise) {
      bufferPromise = options.loadBuffer(target).then(sound => {
        cachedBuffer = sound;
        return sound;
      }).catch(error => {
        bufferPromise = null;
        throw error;
      });
    }
    return bufferPromise;
  };

  const start = (target: OneShotContext, sound: BufferLike, request: number) => {
    if (context !== target || generation !== request || target.state === 'closed') return;
    pending = false;
    stopSource();
    const next = target.createBufferSource();
    next.buffer = sound as AudioBuffer;
    next.connect(target.destination);
    source = next;
    next.onended = () => {
      if (source !== next) return;
      source = null;
      next.onended = null;
      next.disconnect();
      release(target);
    };
    try { next.start(target.currentTime); }
    catch { cancel(target, request); }
  };

  return {
    /** Pre-decode before a gesture; never hold a persistent HTML media player. */
    async preload() {
      if (cachedBuffer) return;
      if (preloadPromise) return preloadPromise;
      const target = options.createContext();
      if (!target) return;
      // A gesture arriving during preload must await the same decode, not
      // start a second fetch/decode that can make the sound audibly late.
      const decode = options.loadBuffer(target).then(sound => {
        cachedBuffer = sound;
        return sound;
      }).catch(error => {
        if (bufferPromise === decode) bufferPromise = null;
        throw error;
      });
      bufferPromise = decode;
      const work = decode.then(() => {})
        .finally(() => { void target.close().catch(() => {}); });
      preloadPromise = work;
      try { await work; }
      catch { preloadPromise = null; }
    },

    /** Unlock on the real touch/pointer start, before the later pull release. */
    prepareFromGesture() {
      if (!context || context.state === 'closed') context = options.createContext();
      const target = context;
      if (!target) return;
      if (target.state !== 'running') void resumeContext(target).catch(() => {});
      if (!cachedBuffer) void getBuffer(target).catch(() => {});
      clearPreparedClose();
      preparedCloseTimer = setTimeout(() => release(target), 5_000);
    },

    cancelPreparation() {
      if (context) release(context);
    },

    /** Invoke in the refresh gesture. Repeated taps restart promptly without queuing. */
    playFromGesture() {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      // Duplicate touch/pointer events and stress bursts are one eligible gesture.
      if (now - lastGestureAt < 100) return;
      lastGestureAt = now;
      if (!context || context.state === 'closed') {
        context = options.createContext();
      }
      const target = context;
      if (!target) return;
      clearPreparedClose();
      const request = ++generation;
      pending = true;
      stopSource();
      // Resume must be requested in the browser's user-activation task.
      let resumed: Promise<void>;
      try { resumed = resumeContext(target); }
      catch { cancel(target, request); return; }
      if (cachedBuffer) {
        start(target, cachedBuffer, request);
        void resumed.then(() => {
          if (generation === request && target.state !== 'running') cancel(target, request);
        }).catch(() => cancel(target, request));
        return;
      }
      void Promise.all([resumed, getBuffer(target)]).then(([, sound]) => {
        if (target.state === 'running') start(target, sound, request);
        else cancel(target, request);
      }).catch(() => cancel(target, request));
    },

    /** Best effort on reload: browser autoplay restrictions still apply. */
    tryAutoplay() {
      if (context) return;
      const target = options.createContext();
      if (!target) return;
      context = target;
      bufferPromise = null;
      if (target.state !== 'running') { release(target); return; }
      const request = ++generation;
      pending = true;
      void getBuffer(target).then(sound => start(target, sound, request))
        .catch(() => cancel(target, request));
    },

    state() {
      return { queued: pending ? 1 : 0, active: source ? 1 : 0, hasContext: context !== null };
    },
  };
}
