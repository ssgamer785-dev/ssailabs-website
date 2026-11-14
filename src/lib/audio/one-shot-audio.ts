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
  let startDeadlineTimer: ReturnType<typeof setTimeout> | undefined;
  let playbackWatchdogTimer: ReturnType<typeof setTimeout> | undefined;
  let resumePromise: Promise<void> | null = null;

  // An unlock that arrives seconds later is a missed UI effect, not a sound to
  // replay over the member's next action.
  const MAX_START_DELAY_MS = 250;
  const clearStartDeadline = () => {
    if (startDeadlineTimer) clearTimeout(startDeadlineTimer);
    startDeadlineTimer = undefined;
  };

  const clearPreparedClose = () => {
    if (preparedCloseTimer) clearTimeout(preparedCloseTimer);
    preparedCloseTimer = undefined;
  };
  const clearPlaybackWatchdog = () => {
    if (playbackWatchdogTimer) clearTimeout(playbackWatchdogTimer);
    playbackWatchdogTimer = undefined;
  };

  const release = (target: OneShotContext) => {
    if (context !== target || pending || source) return;
    clearPreparedClose();
    clearStartDeadline();
    clearPlaybackWatchdog();
    context = null;
    bufferPromise = null;
    resumePromise = null;
    void target.close().catch(() => {});
  };

  const resumeContext = (target: OneShotContext, fromFreshGesture = false): Promise<void> => {
    if (target.state === 'running') return Promise.resolve();
    // iOS can leave the touch-start resume pending. Touch-end is a separate
    // user activation; retry in that task instead of awaiting the stale one.
    if (resumePromise && !fromFreshGesture) return resumePromise;
    const attempt = target.resume();
    resumePromise = attempt;
    void attempt.finally(() => {
      if (resumePromise === attempt) resumePromise = null;
    }).catch(() => {});
    return attempt;
  };

  const stopSource = () => {
    clearPlaybackWatchdog();
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
    clearStartDeadline();
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

  const start = (target: OneShotContext, sound: BufferLike, request: number, gestureScheduled = false) => {
    if (context !== target || generation !== request || target.state === 'closed'
      || (target.state !== 'running' && !gestureScheduled)) return;
    pending = target.state !== 'running';
    if (!pending) clearStartDeadline();
    stopSource();
    const next = target.createBufferSource();
    next.buffer = sound as AudioBuffer;
    next.connect(target.destination);
    source = next;
    next.onended = () => {
      if (source !== next) return;
      source = null;
      pending = false;
      next.onended = null;
      clearPlaybackWatchdog();
      next.disconnect();
      release(target);
    };
    try {
      next.start(target.currentTime);
      // WebKit can leave a context reporting "running" while its clock and
      // onended callback stop. Never reuse that silent context indefinitely.
      playbackWatchdogTimer = setTimeout(
        () => cancel(target, request),
        Math.max(0, sound.duration) * 1_000 + 1_000,
      );
    }
    catch { cancel(target, request); }
  };

  return {
    /** Discard a browser-interrupted output session; keep the decoded sound. */
    resetOutput() {
      const target = context;
      generation += 1;
      lastGestureAt = -Infinity;
      pending = false;
      clearPreparedClose();
      clearStartDeadline();
      stopSource();
      if (target) release(target);
    },
    /** Pre-decode before a gesture; never hold a persistent HTML media player. */
    async preload(): Promise<boolean> {
      if (cachedBuffer) return true;
      if (preloadPromise) {
        try { await preloadPromise; } catch { return false; }
        return !!cachedBuffer;
      }
      const target = options.createContext();
      if (!target) return false;
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
      try { await work; return true; }
      catch { preloadPromise = null; return false; }
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
      clearStartDeadline();
      startDeadlineTimer = setTimeout(() => cancel(target, request), MAX_START_DELAY_MS);
      // Resume must be requested in the browser's user-activation task.
      let resumed: Promise<void>;
      try { resumed = resumeContext(target, true); }
      catch { cancel(target, request); return; }
      if (cachedBuffer) {
        // Schedule the predecoded source synchronously inside touch-end. iOS
        // may require this even while its context is still suspended. The
        // deadline cancels it if resume cannot complete promptly.
        start(target, cachedBuffer, request, true);
        if (target.state !== 'running') void resumed.then(() => {
          if (context !== target || generation !== request) return;
          if (target.state !== 'running') { cancel(target, request); return; }
          pending = false;
          clearStartDeadline();
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
