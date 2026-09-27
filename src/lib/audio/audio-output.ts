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
/** A stale context is closed once its replacement runs, or after this long. */
const RETIRE_AFTER_MS = 3_000;
/** While running, how often the clock is checked, so a freeze is known before the next gesture. */
const HEARTBEAT_MS = 250;

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
  /** Page unload only. */
  close(): void;
}

export function createAudioOutput<C extends OutputLike>(options: {
  createContext: () => C | null;
  trace?: (event: string, detail?: string) => void;
  now?: () => number;
}): AudioOutput<C> {
  const trace = options.trace ?? (() => {});
  const now = options.now ?? (() => performance.now());
  let context: C | null = null;
  let stalled = false;
  /** (wall, clock) taken while running; null whenever the context is not running. */
  let sample: { wall: number; clock: number } | null = null;
  let foregroundTimer: ReturnType<typeof setTimeout> | undefined;
  /** One tap fires pointerup, touchend and click: one resume request covers them. */
  let lastResume: { target: C; at: number } | null = null;

  let heartbeat: ReturnType<typeof setInterval> | undefined;
  const stopHeartbeat = () => { if (heartbeat) clearInterval(heartbeat); heartbeat = undefined; };

  const rebase = (target: C) => {
    sample = target === context && target.state === 'running' ? { wall: now(), clock: target.currentTime } : null;
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
    next.addEventListener?.('statechange', () => { if (next === context) rebase(next); });
    context = next;
    stalled = false;
    rebase(next);
    return next;
  };

  const retire = (old: C, replacement: C) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      trace('output-retired', old.state);
      void old.close().catch(() => {});
    };
    // Keep the old session registered until the new one is running, so
    // WebKit never sees "no active session" and deactivates the audio session.
    replacement.addEventListener?.('statechange', () => { if (replacement.state === 'running') finish(); });
    if (replacement.state === 'running') finish();
    setTimeout(finish, RETIRE_AFTER_MS);
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
      if (target.state !== 'running' && !(lastResume?.target === target && now() - lastResume.at < 50)) {
        lastResume = { target, at: now() };
        trace('resume-request', target.state);
        const startedAt = now();
        void target.resume()
          .then(() => trace('resume-resolved', `${target!.state} ${Math.round(now() - startedAt)}ms`))
          .catch(() => trace('resume-rejected', target!.state));
      }
      return target;
    },

    clock,
    markStalled,

    foreground() {
      const target = context;
      if (!target || target.state === 'closed') return;
      rebase(target);
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
    },
  };
}
