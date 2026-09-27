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
  trace?: (event: string, detail?: string) => void;
}) {
  const trace = options.trace ?? (() => {});
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
  let clockSampleTimer: ReturnType<typeof setTimeout> | undefined;

  const clearClockSample = () => {
    if (clockSampleTimer) clearTimeout(clockSampleTimer);
    clockSampleTimer = undefined;
  };

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
    trace('context-close', target.state);
    void target.close().catch(() => {});
  };

  const resumeContext = (target: OneShotContext, fromFreshGesture = false): Promise<void> => {
    if (target.state === 'running') {
      trace('resume-skipped', 'running');
      return Promise.resolve();
    }
    // iOS can leave the touch-start resume pending. Touch-end is a separate
    // user activation; retry in that task instead of awaiting the stale one.
    if (resumePromise && !fromFreshGesture) {
      trace('resume-pending', target.state);
      return resumePromise;
    }
    trace('resume-request', target.state);
    const startedAt = performance.now();
    const attempt = target.resume();
    resumePromise = attempt;
    void attempt.then(() => trace('resume-resolved', `${target.state} ${Math.round(performance.now() - startedAt)}ms`))
      .catch(() => trace('resume-rejected', target.state));
    void attempt.finally(() => {
      if (resumePromise === attempt) resumePromise = null;
    }).catch(() => {});
    return attempt;
  };

  const stopSource = () => {
    clearPlaybackWatchdog();
    clearClockSample();
    const previous = source;
    if (!previous) return;
    source = null;
    previous.onended = null;
    try { previous.stop(); } catch { /* It may already have ended. */ }
    previous.disconnect();
    trace('source-stopped');
  };

  const cancel = (target: OneShotContext, request: number) => {
    if (context !== target || generation !== request) return;
    trace('request-cancel', `${target.state} clock=${target.currentTime.toFixed(3)}`);
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
      || (target.state !== 'running' && !gestureScheduled)) {
      trace('start-skipped', target.state);
      return;
    }
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
      clearClockSample();
      next.disconnect();
      trace('source-ended', `${target.state} clock=${target.currentTime.toFixed(3)}`);
      release(target);
    };
    try {
      const clockAtStart = target.currentTime;
      next.start(clockAtStart);
      trace('source-start', `${target.state} clock=${clockAtStart.toFixed(3)} duration=${sound.duration.toFixed(2)}s`);
      if (options.trace) clockSampleTimer = setTimeout(() => {
        if (context !== target || generation !== request || source !== next) return;
        const delta = target.currentTime - clockAtStart;
        trace('clock-after-150ms', `${target.state} +${delta.toFixed(3)}s${delta < 0.03 ? ' STALLED' : ''}`);
      }, 150);
      // WebKit can leave a context reporting "running" while its clock and
      // onended callback stop. Never reuse that silent context indefinitely.
      playbackWatchdogTimer = setTimeout(
        () => { trace('source-watchdog', target.state); cancel(target, request); },
        Math.max(0, sound.duration) * 1_000 + 1_000,
      );
    }
    catch { trace('source-start-failed', target.state); cancel(target, request); }
  };

  return {
    /** Discard a browser-interrupted output session; keep the decoded sound. */
    resetOutput() {
      const target = context;
      trace('output-reset', target?.state ?? 'none');
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
      if (!target) { trace('preload-no-context'); return false; }
      trace('preload-start', target.state);
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
      try { await work; trace('preload-ready'); return true; }
      catch { trace('preload-failed'); preloadPromise = null; return false; }
    },

    /** Unlock on the real touch/pointer start, before the later pull release. */
    prepareFromGesture() {
      if (!context || context.state === 'closed') context = options.createContext();
      const target = context;
      if (!target) { trace('prepare-no-context'); return; }
      trace('prepare-gesture', `${target.state} clock=${target.currentTime.toFixed(3)}`);
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
      if (now - lastGestureAt < 100) { trace('duplicate-gesture-ignored'); return; }
      lastGestureAt = now;
      if (!context || context.state === 'closed') {
        context = options.createContext();
      }
      const target = context;
      if (!target) { trace('play-no-context'); return; }
      trace('play-gesture', `${target.state} clock=${target.currentTime.toFixed(3)} decoded=${!!cachedBuffer}`);
      clearPreparedClose();
      const request = ++generation;
      pending = true;
      stopSource();
      clearStartDeadline();
      startDeadlineTimer = setTimeout(() => { trace('start-deadline', target.state); cancel(target, request); }, MAX_START_DELAY_MS);
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
