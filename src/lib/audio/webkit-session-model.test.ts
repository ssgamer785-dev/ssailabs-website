/**
 * Refresh-sound behaviour against a model of WebKit's iOS audio-session rules.
 *
 * The model implements only what WebKit's source does (WebKit main, 2026):
 * - A context needs a user activation to leave "suspended"; until then resume()
 *   stays pending (AudioContext::willBeginPlayback → shouldDocumentAllowWebAudioToAutoPlay).
 * - Starting registers the context's media session (willBeginPlayback →
 *   m_mediaSession->setActive(true)); close() unregisters it (setActive(false)).
 * - When the last session is unregistered, the iOS audio session is deactivated
 *   (removeSession → hasNoSession → maybeDeactivateAudioSession).
 * - Playback admission while the audio session is inactive must first activate
 *   it (startSessionAdmission → AudioSession::tryToSetActive(true)); rendering,
 *   and the resume() promise, wait for that.
 * How long activation takes on a given iPhone is NOT modelled from evidence; the
 * tests run it faster and slower than the start window. Audible output on a
 * device is not something a model can establish.
 */
import { describe, expect, it } from 'bun:test';
import { createAudioOutput } from './audio-output';
import { createOneShotAudioPlayer } from './one-shot-audio';
import { createRefreshSoundPlayer } from './refresh-sound';

const SOUND = { duration: 0.08 };
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const now = () => performance.now();

class WebKitModel {
  sessionActive = false;
  sessions = new Set<FakeContext>();
  activations = 0;
  deactivations = 0;
  inGesture = false;
  contexts: FakeContext[] = [];
  constructor(public activationLatencyMs: number) {}

  create = () => { const context = new FakeContext(this); this.contexts.push(context); return context; };
  gesture<T>(fn: () => T): T { this.inGesture = true; try { return fn(); } finally { this.inGesture = false; } }

  register(context: FakeContext, onAdmitted: () => void) {
    this.sessions.add(context);
    if (this.sessionActive) { setTimeout(onAdmitted, 5); return; }
    setTimeout(() => {
      this.sessionActive = true;
      this.activations += 1;
      // startSessionAdmission: activated, but every session went away meanwhile.
      if (!this.sessions.size) this.deactivate();
      else onAdmitted();
    }, this.activationLatencyMs);
  }

  unregister(context: FakeContext) {
    if (!this.sessions.delete(context)) return;
    if (!this.sessions.size && this.sessionActive) this.deactivate();
  }

  deactivate() { this.sessionActive = false; this.deactivations += 1; }
}

class FakeSource {
  buffer: AudioBuffer | null = null;
  onended: ((event: Event) => void) | null = null;
  calledAt = 0;
  stoppedAt: number | null = null;
  heardAt: number | null = null;
  endedAt: number | null = null;
  constructor(private context: FakeContext) {}
  connect() {}
  disconnect() {}
  start() { this.calledAt = now(); this.context.sources.push(this); this.context.poll(); }
  stop() { if (this.stoppedAt === null) this.stoppedAt = now(); }
}

class FakeContext {
  state: AudioContextState = 'suspended';
  destination = {} as AudioNode;
  sources: FakeSource[] = [];
  unlocked = false;
  stalled = false;
  private base = 0;
  private since = 0;
  private listeners: (() => void)[] = [];
  private waiting: (() => void)[] = [];
  constructor(private webkit: WebKitModel) {}

  get currentTime() { return this.base + (this.state === 'running' && !this.stalled ? (now() - this.since) / 1000 : 0); }
  addEventListener(_type: 'statechange', listener: () => void) { this.listeners.push(listener); }
  setState(state: AudioContextState) {
    if (this.state === state) return;
    this.base = this.currentTime;
    this.since = now();
    this.state = state;
    this.listeners.forEach(listener => listener());
    if (state === 'running') { this.waiting.splice(0).forEach(resolve => resolve()); this.poll(); }
  }
  /** A scheduled source becomes audible the moment the clock runs, unless stopped first. */
  poll() {
    if (this.state !== 'running' || this.stalled) return;
    for (const source of this.sources) {
      if (source.heardAt !== null || source.stoppedAt !== null) continue;
      source.heardAt = now();
      setTimeout(() => {
        if (source.stoppedAt !== null) return;
        source.endedAt = now();
        source.onended?.(new Event('ended'));
      }, SOUND.duration * 1000);
    }
  }
  resume() {
    if (this.state === 'closed') return Promise.reject(new Error('closed'));
    const settled = new Promise<void>(resolve => this.waiting.push(resolve));
    if (this.state === 'running') { this.setState('running'); return Promise.resolve(); }
    if (!this.unlocked && !this.webkit.inGesture) return settled;   // parked until something runs it
    this.unlocked = true;
    if (!this.webkit.sessions.has(this)) this.webkit.register(this, () => { if (this.state !== 'closed') this.setState('running'); });
    else setTimeout(() => { if (this.state !== 'closed') this.setState('running'); }, 5);
    return settled;
  }
  close() { this.setState('closed'); this.webkit.unregister(this); return Promise.resolve(); }
  decodeAudioData() { return Promise.resolve(SOUND as AudioBuffer); }
  createBufferSource() { return new FakeSource(this); }
  /** Reports "running" but renders nothing: the clock freezes where it is. */
  stall() { this.base = this.currentTime; this.since = now(); this.stalled = true; }
  /** WebKit on backgrounding: interrupted, clock frozen, session kept. */
  interrupt() { this.setState('interrupted' as AudioContextState); }
}

type Result = { heard: boolean; delayMs: number | null };
const verdict = (gestureAt: number, sources: FakeSource[]): Result => {
  const heard = sources.find(source => source.calledAt >= gestureAt && source.heardAt !== null);
  return { heard: !!heard, delayMs: heard ? Math.round(heard.heardAt! - gestureAt) : null };
};

/** The current production player: prepare on touchstart, play on touchend, release on settle. */
async function legacyRefreshes(webkit: WebKitModel, count: number): Promise<Result[]> {
  const player = createOneShotAudioPlayer({ createContext: webkit.create, loadBuffer: async () => SOUND });
  await player.preload();
  const results: Result[] = [];
  for (let i = 0; i < count; i++) {
    player.prepareFromGesture();                         // touchstart: not an activation on iOS
    await wait(20);
    const gestureAt = now();
    webkit.gesture(() => player.playFromGesture());       // touchend
    await wait(500);
    player.cancelPreparation();                          // PhoneShell settle()
    await wait(150);
    results.push(verdict(gestureAt, webkit.contexts.flatMap(context => context.sources)));
  }
  return results;
}

async function sharedRefreshes(webkit: WebKitModel, count: number, between = 150): Promise<{ results: Result[]; player: ReturnType<typeof createRefreshSoundPlayer<FakeContext>>; output: ReturnType<typeof createAudioOutput<FakeContext>> }> {
  const output = createAudioOutput<FakeContext>({ createContext: webkit.create });
  const player = createRefreshSoundPlayer<FakeContext>({ output, loadBuffer: async () => SOUND });
  await player.preload();
  const results: Result[] = [];
  for (let i = 0; i < count; i++) {
    const gestureAt = now();
    webkit.gesture(() => player.playFromGesture(true));
    await wait(between);
    results.push(verdict(gestureAt, webkit.contexts.flatMap(context => context.sources)));
  }
  return { results, player, output };
}

describe('WebKit audio-session model: the release player (legacy)', () => {
  it('re-activates the iOS audio session for every refresh, so each sound waits for it (the "delayed" symptom)', async () => {
    const webkit = new WebKitModel(150);
    const results = await legacyRefreshes(webkit, 4);
    expect(webkit.activations).toBe(4);
    expect(webkit.deactivations).toBe(4);
    expect(results.every(result => result.heard && result.delayMs! >= 150)).toBe(true);
  });

  it('is silent on every refresh once activation outlasts its 250 ms window (the "silent" symptom), and never recovers', async () => {
    const webkit = new WebKitModel(400);
    const results = await legacyRefreshes(webkit, 4);
    expect(results.filter(result => result.heard)).toHaveLength(0);
    expect(webkit.activations).toBe(4);
  });
});

describe('WebKit audio-session model: the shared long-lived output', () => {
  it('activates the audio session once for 20 consecutive refreshes; after the first, sounds start at once', async () => {
    const webkit = new WebKitModel(150);
    const { results } = await sharedRefreshes(webkit, 20);
    expect(webkit.contexts).toHaveLength(1);
    expect(webkit.activations).toBe(1);
    expect(webkit.deactivations).toBe(0);
    expect(results.every(result => result.heard)).toBe(true);
    expect(results.slice(1).every(result => result.delayMs! < 30)).toBe(true);
  });

  it('when activation outlasts the start window: drops only the first sound, never plays it late, then recovers', async () => {
    const webkit = new WebKitModel(600);
    const { results } = await sharedRefreshes(webkit, 8, 700);
    expect(results[0].heard).toBe(false);
    expect(webkit.contexts[0].sources[0].stoppedAt).not.toBeNull();   // dropped at the window, never heard after
    expect(results.slice(1).every(result => result.heard && result.delayMs! < 30)).toBe(true);
    expect(webkit.activations).toBe(1);
  }, 10_000);

  it('rapid refreshes: one sound each, the previous one replaced, never two at once', async () => {
    const webkit = new WebKitModel(100);
    const { results } = await sharedRefreshes(webkit, 12, 120);
    const sources = webkit.contexts[0].sources;
    expect(sources).toHaveLength(12);
    // Each earlier sound had finished or was stopped by the time the next one was scheduled.
    for (let i = 1; i < sources.length; i++) expect(sources[i - 1].stoppedAt ?? sources[i - 1].endedAt ?? Infinity).toBeLessThanOrEqual(sources[i].calledAt + 1);
    expect(results.slice(1).every(result => result.heard)).toBe(true);
  });

  it('ignores the duplicate touch/pointer/click of one tap', async () => {
    const webkit = new WebKitModel(50);
    const { player } = await sharedRefreshes(webkit, 1);
    await wait(150);
    webkit.gesture(() => { player.playFromGesture(true); player.playFromGesture(true); player.playFromGesture(true); });
    expect(webkit.contexts[0].sources).toHaveLength(2);
  });

  it('background and return: the sound stops, the session is kept, no new context, next refresh is immediate', async () => {
    const webkit = new WebKitModel(150);
    const { player, output } = await sharedRefreshes(webkit, 2);
    const context = webkit.contexts[0];
    webkit.gesture(() => player.playFromGesture(true));
    await wait(10);
    player.stop('hidden');                       // visibilitychange hidden
    context.interrupt();                         // WebKit: EnteringBackground
    await wait(100);
    context.setState('running');                 // WebKit: endInterruption(MayResumePlaying)
    output.foreground();
    await wait(350);
    const gestureAt = now();
    webkit.gesture(() => player.playFromGesture(true));
    await wait(60);
    expect(verdict(gestureAt, context.sources)).toEqual({ heard: true, delayMs: expect.any(Number) });
    expect(verdict(gestureAt, context.sources).delayMs!).toBeLessThan(30);
    expect(webkit.contexts).toHaveLength(1);
    expect(webkit.deactivations).toBe(0);
  });

  it('a context "running" with a frozen clock after return is replaced in the next gesture without dropping the session', async () => {
    const webkit = new WebKitModel(150);
    const { player, output } = await sharedRefreshes(webkit, 2);
    const stale = webkit.contexts[0];
    stale.stall();                               // reports running, renders nothing
    output.foreground();
    await wait(350);                             // foreground probe sees the clock not moving
    const gestureAt = now();
    webkit.gesture(() => player.playFromGesture(true));
    await wait(80);
    expect(webkit.contexts).toHaveLength(2);
    expect(verdict(gestureAt, webkit.contexts[1].sources).heard).toBe(true);
    expect(stale.state).toBe('closed');          // retired only after its replacement ran
    expect(webkit.deactivations).toBe(0);
    expect(webkit.activations).toBe(1);
  });

  it('a stalled context is never used for a later sound: the next gesture schedules on its replacement', async () => {
    const webkit = new WebKitModel(100);
    const { player } = await sharedRefreshes(webkit, 2);
    const stale = webkit.contexts[0];
    stale.stall();
    const stalledAt = now();
    await wait(400);                             // at least one clock check has passed
    const gestureAt = now();
    webkit.gesture(() => player.playFromGesture(true));   // unlock sees the frozen clock and rebuilds
    await wait(450);
    expect(webkit.contexts).toHaveLength(2);
    expect(stale.sources.every(source => source.heardAt === null || source.heardAt < stalledAt)).toBe(true);
    expect(verdict(gestureAt, webkit.contexts[1].sources).heard).toBe(true);
    expect(webkit.deactivations).toBe(0);
  });

  it('a stall that begins after the sound was scheduled drops it rather than letting it play late', async () => {
    const webkit = new WebKitModel(100);
    const { player } = await sharedRefreshes(webkit, 2);
    const context = webkit.contexts[0];
    context.interrupt();                         // e.g. back from an interruption, not yet rendering
    await wait(150);
    webkit.gesture(() => player.playFromGesture(true));
    context.stall();                             // WebKit then reports "running", but the clock never moves
    const late = context.sources.at(-1)!;
    await wait(500);
    expect(context.state).toBe('running');
    expect(late.heardAt).toBeNull();
    expect(late.stoppedAt).not.toBeNull();       // dropped by the stall check, not left scheduled
    context.stalled = false;                     // clock comes back: the dropped sound must stay silent
    context.poll();
    expect(late.heardAt).toBeNull();
    // and the next gesture moves to a fresh context instead of reusing the stalled one
    webkit.gesture(() => player.playFromGesture(true));
    expect(webkit.contexts).toHaveLength(2);
  });
});
