/**
 * One Web Audio output for the whole page, kept open for its lifetime.
 *
 * Why not a context per sound: in WebKit, AudioContext.close() deactivates the
 * context's media session (AudioContext::close → PlatformMediaSession::
 * setActive(false) → removeSession), and when no active session is left WebKit
 * deactivates the iOS audio session itself (maybeDeactivateAudioSession →
 * AudioSession::tryToSetActive(false)). The next context then cannot play
 * until playback admission re-activates it (startSessionAdmission →
 * tryToSetActive(true)), an asynchronous trip to the system audio server that
 * resume() waits on. Closing after every refresh, on every backgrounding, or
 * on every missed start therefore puts an audio-session activation in front of
 * the next sound — and a start window shorter than that activation closes the
 * context again, so the page never gets out of the loop.
 *
 * So this output is never closed while the page lives. WebKit interrupts it on
 * backgrounding and resumes it on return by itself. The only reason to replace
 * it is a context that reports "running" while its clock is not moving; the
 * replacement is started before the stale one is closed, so there is never a
 * moment without an active session.
 */

export type OutputLike = {
  state: AudioContextState;
  currentTime: number;
  resume: () => Promise<void>;
  close: () => Promise<void>;
  addEventListener?: (type: 'statechange', listener: () => void) => void;
};

/** Below this share of wall-clock time, a "running" clock is not really running. */
const MIN_CLOCK_RATE = 0.4;
/** Shorter intervals are too noisy to judge (render quanta, timer jitter). */
const MIN_JUDGE_INTERVAL_MS = 100;
/**
 * A replaced context is closed this long after its replacement runs, so a
 * refresh sound or chime already playing on it finishes instead of being cut.
 * Until then its session stays registered, so WebKit never sees "no session".
 */
const RETIRE_GRACE_MS = 3_000;
/** Close it even if the replacement never runs. */
const RETIRE_MAX_MS = 6_000;
/** While running, how often the clock is checked, so a freeze is known before the next gesture. */
const HEARTBEAT_MS = 250;

/**
 * What can honestly be told to the member about app sounds right now. Never
 * "the sound was heard": the page cannot know that (silent switch, volume,
 * Bluetooth); it only knows whether the browser is running the output.
 */
export type OutputStatus =
  | 'none'         // no Web Audio in this browser, or the output is closed
  | 'locked'       // never ran: the browser wants a tap before it starts
  | 'running'      // running and its clock moves
  | 'stalled'      // says running, but its clock is frozen: replaced at the next tap
  | 'interrupted'  // paused by the system (call, another app, screen lock)
  | 'suspended';   // stopped; resumes without a tap because it has run before

export interface AudioOutput<C extends OutputLike> {
  /** The live context, created (suspended) if there is none. Never unlocks. */
  ensure(): C | null;
  /**
   * Call from inside a user activation (touchend, click, keydown). Resumes a
   * context that is not running and replaces one whose clock has stalled.
   */
  unlock(hasActivation?: boolean): C | null;
  /** 'moving' | 'stalled' | 'unknown' (not running, or too soon to judge). */
  clock(target: C): 'moving' | 'stalled' | 'unknown';
  /** Replace this context at the next user activation. */
  markStalled(target: C, reason: string): void;
  /** After the page returns to the foreground: re-baseline, then judge the clock. */
  foreground(): void;
  /** Whether the current context has ever run: on iOS it cannot start without a tap's activation until then. */
  isUnlocked(): boolean;
  /** For the sound settings screen: the output's state in terms a member can act on. */
  status(): OutputStatus;
  /** Called whenever `status()` may have changed. Returns the unsubscribe function. */
  subscribe(listener: () => void): () => void;
  /** Page unload only. */
  close(): void;
}

export function createAudioOutput<C extends OutputLike>(options: {
  createContext: () => C | null;
  trace?: (event: string, detail?: string) => void;
  now?: () => number;
  /** Whether the page is on screen. Sound is only brought back while it is; defaults to the document's visibility. */
  visible?: () => boolean;
}): AudioOutput<C> {
  const trace = options.trace ?? (() => {});
  const now = options.now ?? (() => performance.now());
  const visible = options.visible ?? (() => typeof document === 'undefined' || document.visibilityState === 'visible');
  let context: C | null = null;
  let stalled = false;
  /** The current context has reached "running" at least once (WebKit lifted its gesture restriction). */
  let unlocked = false;
  /** (wall, clock) taken while running; null whenever the context is not running. */
  let sample: { wall: number; clock: number } | null = null;
  let foregroundTimer: ReturnType<typeof setTimeout> | undefined;
  /** One tap fires pointerup, touchend and click: one resume request covers them. */
  let lastResume: { target: C; at: number } | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach(listener => listener());

  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const stopHeartbeat = () => { if (heartbeat) clearInterval(heartbeat); heartbeat = undefined; };

  const rebase = (target: C) => {
    if (target === context && target.state === 'running') unlocked = true;
    sample = target === context && target.state === 'running' ? { wall: now(), clock: target.currentTime } : null;
    if (target === context) notify();
    if (!sample) { stopHeartbeat(); return; }
    if (heartbeat) return;
    heartbeat = setInterval(() => {
      const current = context;
      if (!current || current.state !== 'running') { stopHeartbeat(); return; }
      if (clock(current) === 'stalled') { markStalled(current, 'heartbeat'); stopHeartbeat(); }
    }, HEARTBEAT_MS);
  };

  const create = (): C | null => {
    const next = options.createContext();
    if (!next) return null;
    next.addEventListener?.('statechange', () => {
      if (next !== context) return;
      rebase(next);
      // When an interruption ends without "may resume", WebKit moves the context to
      // "suspended" and leaves it there (AudioContext::mayResumePlayback(false)):
      // only a script resume() restarts it. One that has run before needs no gesture
      // for that, so bring it back while the page is on screen.
      if (unlocked && next.state === 'suspended' && visible()) requestResume(next, 'suspended');
    });
    context = next;
    stalled = false;
    unlocked = false;
    rebase(next);
    return next;
  };

  const retire = (old: C, replacement: C) => {
    let done = false;
    let graceTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      if (done) return;
      done = true;
      trace('output-retired', old.state);
      void old.close().catch(() => {});
    };
    const replacementRunning = () => {
      if (graceTimer || replacement.state !== 'running') return;
      graceTimer = setTimeout(finish, RETIRE_GRACE_MS);
    };
    replacement.addEventListener?.('statechange', replacementRunning);
    replacementRunning();
    setTimeout(finish, RETIRE_MAX_MS);
  };

  const clock = (target: C): 'moving' | 'stalled' | 'unknown' => {
    if (target !== context || target.state !== 'running' || !sample) return 'unknown';
    const wall = now() - sample.wall;
    if (wall < MIN_JUDGE_INTERVAL_MS) return 'unknown';
    const advanced = (target.currentTime - sample.clock) * 1000;
    sample = { wall: now(), clock: target.currentTime };
    return advanced < wall * MIN_CLOCK_RATE ? 'stalled' : 'moving';
  };

  const markStalled = (target: C, reason: string) => {
    if (target !== context || stalled) return;
    stalled = true;
    trace('output-stalled', `${target.state} ${reason}`);
    notify();
  };

  /** One resume request per burst of events (a tap fires pointerup, touchend and click). */
  const requestResume = (target: C, why?: string) => {
    if (lastResume?.target === target && now() - lastResume.at < 50) return;
    lastResume = { target, at: now() };
    trace('resume-request', why ? `${target.state} ${why}` : target.state);
    const startedAt = now();
    void target.resume()
      .then(() => trace('resume-resolved', `${target.state} ${Math.round(now() - startedAt)}ms`))
      .catch(() => trace('resume-rejected', target.state));
  };

  return {
    ensure() {
      if (context && context.state !== 'closed') return context;
      return create();
    },

    unlock(hasActivation = true) {
      let target = context && context.state !== 'closed' ? context : null;
      if (target && target.state === 'running' && clock(target) === 'stalled') markStalled(target, 'clock-not-moving');
      // A replacement can only start inside an activation; outside one, keep
      // the current context rather than create one that cannot run.
      if (target && stalled && hasActivation) {
        const old = target;
        target = create();
        trace('output-rebuild', `${old.state} -> ${target?.state ?? 'none'}`);
        if (target) retire(old, target);
        else context = old;
      }
      if (!target) target = create();
      if (!target) return null;
      if (target.state !== 'running') requestResume(target);
      return target;
    },

    clock,
    markStalled,
    isUnlocked: () => unlocked,

    status() {
      const target = context;
      if (!target || target.state === 'closed') return 'none';
      if (target.state === 'running') return stalled ? 'stalled' : 'running';
      if (!unlocked) return 'locked';
      return (target.state as string) === 'interrupted' ? 'interrupted' : 'suspended';
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },

    foreground() {
      const target = context;
      if (!target || target.state === 'closed') return;
      rebase(target);
      // WebKit resumes an interrupted context by itself when the interruption
      // ends, but that notification can be missed (a call, the screen lock,
      // another app's audio). A context that has run before needs no gesture
      // to resume, so ask again now rather than leave the next pull-to-refresh
      // to find it stopped. One that never ran cannot start without a tap and
      // is left alone.
      if (unlocked && target.state !== 'running') requestResume(target, 'foreground');
      if (foregroundTimer) clearTimeout(foregroundTimer);
      // The case the old per-refresh contexts were built for: back from the
      // background, "running", but its clock no longer moves.
      foregroundTimer = setTimeout(() => {
        foregroundTimer = undefined;
        if (clock(target) === 'stalled') markStalled(target, 'after-foreground');
      }, 300);
    },

    close() {
      if (foregroundTimer) clearTimeout(foregroundTimer);
      stopHeartbeat();
      const target = context;
      context = null;
      sample = null;
      if (target && target.state !== 'closed') void target.close().catch(() => {});
      notify();
    },
  };
}
