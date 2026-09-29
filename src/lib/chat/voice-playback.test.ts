/**
 * Voice-message playback against a model of WebKit's media-element gesture rules.
 *
 * The model implements only what WebKit's source does (WebKit main, 2026):
 * - HTMLMediaElement.play() for audible media is refused (NotAllowedError) unless the
 *   document is "processing a user gesture for media": inside the event handler of a
 *   gesture, or within 5 s of one (transient activation)
 *   (MediaElementSession::playbackStateChangePermitted → RequireUserGestureForAudioRateChange,
 *   Document::mediaUserGestureReason, LocalDOMWindow defaultTransientActivationDuration).
 * - load() and setting src (prepareForLoad) or a successful play() inside such a gesture removes
 *   that restriction from THIS element for good (removeBehaviorRestrictionsAfterFirstUserGesture).
 * A model shows what the code does under those rules; it cannot show what a particular iPhone does.
 */
import { describe, expect, it } from 'bun:test';
import { createVoicePlayback, SIGNED_URL_TTL_MS, VOICE_MESSAGES, type Activation, type VoiceElement } from './voice-playback';

class Gestures {
  clock = 0;
  inGesture = false;
  lastActivationAt = -Infinity;
  readonly activationMs = 5_000;
  /** A tap: the handler runs inside the gesture and the window keeps transient activation afterwards. */
  tap<T>(fn: () => T): T {
    this.inGesture = true;
    this.lastActivationAt = this.clock;
    try { return fn(); } finally { this.inGesture = false; }
  }
  processing(): boolean { return this.inGesture || this.clock - this.lastActivationAt < this.activationMs; }
  advance(ms: number) { this.clock += ms; }
}

class ModelElement implements VoiceElement {
  paused = true;
  currentTime = 0;
  duration = Number.NaN;
  error: unknown = null;
  restrictionRemoved = false;
  loads = 0;
  plays = 0;
  /** A browser that does not lift the restriction on load(): the case the "tap again" fallback exists for. */
  loadLiftsRestriction = true;
  /** Hold play() pending, like an element buffering a remote file. */
  holdPlay = false;
  private pendingPlay: { resolve: () => void; reject: (error: unknown) => void } | null = null;
  private listeners = new Map<string, (() => void)[]>();
  private source = '';
  constructor(private gestures: Gestures) {}

  get src() { return this.source; }
  set src(value: string) {
    this.prepareForLoad();
    this.source = value;
    this.error = null;
    this.currentTime = 0;
  }
  private prepareForLoad() {
    if (this.gestures.processing() && this.loadLiftsRestriction) this.restrictionRemoved = true;
    if (!this.paused) { this.paused = true; this.abortPending(); this.emit('pause'); }
  }
  load() { this.loads += 1; this.prepareForLoad(); }
  addEventListener(type: string, listener: () => void) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]); }
  private emit(type: string) { (this.listeners.get(type) ?? []).forEach(listener => listener()); }
  private abortPending() {
    const pending = this.pendingPlay;
    this.pendingPlay = null;
    pending?.reject(new DOMException('The play() request was interrupted', 'AbortError'));
  }

  play(): Promise<void> {
    this.plays += 1;
    if (!this.restrictionRemoved && !this.gestures.processing()) {
      return Promise.reject(new DOMException('The request is not allowed by the user agent or the platform in the current context.', 'NotAllowedError'));
    }
    if (this.gestures.processing()) this.restrictionRemoved = true;
    if (this.error) return Promise.reject(new DOMException('The operation is not supported.', 'NotSupportedError'));
    this.paused = false;
    this.emit('play');
    if (!this.holdPlay) return Promise.resolve();
    return new Promise<void>((resolve, reject) => { this.pendingPlay = { resolve, reject }; });
  }
  /** Buffering finished: playback actually started. */
  startedPlaying() { const pending = this.pendingPlay; this.pendingPlay = null; pending?.resolve(); }
  pause() {
    if (this.paused) return;
    this.paused = true;
    this.abortPending();
    this.emit('pause');
  }
  /** The file finished. */
  finish() { this.paused = true; this.emit('pause'); this.emit('ended'); }
  /** A fatal media error. Browsers leave `paused` false here (the play() promise rejects instead), so the model does too. */
  fail(code: number) { this.error = { code }; this.emit('error'); }
}

const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0));

function setup(options: { activation?: Activation; loadLiftsRestriction?: boolean } = {}) {
  const gestures = new Gestures();
  const element = new ModelElement(gestures);
  element.loadLiftsRestriction = options.loadLiftsRestriction ?? true;
  const traced: string[] = [];
  const claims: { id: string; stop: () => void }[] = [];
  const released: string[] = [];
  const player = createVoicePlayback({
    createElement: () => element,
    activation: () => options.activation ?? (gestures.processing() ? 'active' : 'inactive'),
    now: () => gestures.clock,
    claim: (id, stop) => { claims.push({ id, stop }); },
    release: id => { released.push(id); },
    trace: (event, detail) => { traced.push(detail ? `${event} ${detail}` : event); },
  });
  /** resolveSrc whose answer the test releases, like a signing request in flight. */
  const address = (url = 'https://media.example/voice.m4a?sig=secret-token') => {
    let calls = 0;
    let release: (value: string | null) => void = () => {};
    let fail: (error: unknown) => void = () => {};
    const resolve = () => { calls += 1; return new Promise<string | null>((res, rej) => { release = res; fail = rej; }); };
    return { resolve, answer: (value: string | null = url) => release(value), reject: (error: unknown) => fail(error), get calls() { return calls; } };
  };
  return { gestures, element, player, traced, claims, released, address };
}

describe('the failure this fixes: the address arrives after the gesture window', () => {
  it('the previous behaviour (sign, then set src, then play) is refused by the model when signing takes longer than 5 s', async () => {
    const { gestures, element } = setup();
    const legacyToggle = async (resolve: () => Promise<string>) => {
      const src = await resolve();            // network round trip after the tap
      element.pause();
      element.src = src;
      await element.play();
    };
    let release: (value: string) => void = () => {};
    const started = gestures.tap(() => legacyToggle(() => new Promise<string>(res => { release = res; })));
    gestures.advance(6_000);                  // a slow connection
    release('https://media.example/voice.m4a');
    await expect(started).rejects.toMatchObject({ name: 'NotAllowedError' });
    expect(element.paused).toBe(true);
  });

  it('with the element loaded inside the tap, the same slow address plays on the first tap', async () => {
    const { gestures, element, player, address } = setup();
    const signing = address();
    const done = gestures.tap(() => player.toggle('m1', signing.resolve));
    gestures.advance(9_000);                  // far past the 5 s window
    signing.answer();
    await done;
    expect(element.paused).toBe(false);
    expect(player.view('m1')).toMatchObject({ playing: true, error: null, hint: null, loading: false });
    expect(element.loads).toBe(1);            // the prime; nothing else touched load()
  });

  it('a tap anywhere in the app earlier is enough: the voice tap can be arbitrarily late afterwards', async () => {
    const { gestures, element, player, address } = setup();
    gestures.tap(() => player.prime());       // e.g. the first tap after the app opened
    gestures.advance(60_000);
    const signing = address();
    const done = gestures.tap(() => player.toggle('m1', signing.resolve));
    gestures.advance(30_000);
    signing.answer();
    await done;
    expect(element.paused).toBe(false);
    expect(element.loads).toBe(1);            // primed once, not again for the voice tap
  });
});

describe('priming', () => {
  it('does nothing outside a gesture and does not latch, so a later real tap still primes', () => {
    const { gestures, element, player } = setup();
    player.prime();                           // e.g. a programmatic call, no activation
    expect(element.loads).toBe(0);
    gestures.tap(() => player.prime());
    expect(element.loads).toBe(1);
    gestures.tap(() => player.prime());       // latched: taps stop touching the element
    expect(element.loads).toBe(1);
  });

  it('never disturbs a clip that is playing or loaded', async () => {
    const { gestures, element, player, address } = setup();
    const signing = address();
    const done = gestures.tap(() => player.toggle('m1', signing.resolve));
    signing.answer();
    await done;
    const loadsWhilePlaying = element.loads;
    gestures.tap(() => player.prime());
    expect(element.loads).toBe(loadsWhilePlaying);
    expect(element.paused).toBe(false);
  });

  it('on an engine without navigator.userActivation it tries at every idle tap until a play succeeds', async () => {
    const { gestures, element, player, address } = setup({ activation: 'unknown' });
    gestures.tap(() => player.prime());
    gestures.tap(() => player.prime());
    expect(element.loads).toBe(2);            // cannot confirm the gesture, so it does not latch
    const signing = address();
    const done = gestures.tap(() => player.toggle('m1', signing.resolve));
    signing.answer();
    await done;
    const afterPlay = element.loads;
    gestures.tap(() => player.prime());
    expect(element.loads).toBe(afterPlay);    // a successful play() is proof the element is unlocked
  });
});

describe('a browser that still refuses: the source is kept and the next tap plays inside its own gesture', () => {
  it('shows a hint (not an error), keeps the address, and plays on the second tap without signing again', async () => {
    const { gestures, element, player, address } = setup({ loadLiftsRestriction: false });
    const signing = address();
    const first = gestures.tap(() => player.toggle('m1', signing.resolve));
    gestures.advance(9_000);
    signing.answer();
    await first;
    expect(element.paused).toBe(true);
    expect(player.view('m1')).toMatchObject({ playing: false, error: null, hint: VOICE_MESSAGES.blocked, loading: false });
    expect(signing.calls).toBe(1);

    const playsBefore = element.plays;
    await gestures.tap(() => player.toggle('m1', signing.resolve));
    expect(signing.calls).toBe(1);            // no second signing round trip
    expect(element.plays).toBe(playsBefore + 1);
    expect(element.paused).toBe(false);
    expect(player.view('m1')).toMatchObject({ playing: true, hint: null, error: null });
  });

  it('the hint belongs to that clip only', async () => {
    const { gestures, player, address } = setup({ loadLiftsRestriction: false });
    const signing = address();
    const first = gestures.tap(() => player.toggle('m1', signing.resolve));
    gestures.advance(9_000);
    signing.answer();
    await first;
    expect(player.view('m1').hint).toBe(VOICE_MESSAGES.blocked);
    expect(player.view('m2').hint).toBeNull();
  });
});

describe('what the member is told', () => {
  it('a network failure while signing shows the app\'s own message, and the next tap tries again from scratch', async () => {
    const { gestures, player, address } = setup();
    const signing = address();
    const done = gestures.tap(() => player.toggle('m1', signing.resolve));
    signing.reject(new Error("You're offline. Reconnect and try again."));
    await done;
    expect(player.view('m1')).toMatchObject({ error: "You're offline. Reconnect and try again.", hint: null, loading: false, playing: false });
    const retry = gestures.tap(() => player.toggle('m1', signing.resolve));
    expect(signing.calls).toBe(2);
    signing.answer();
    await retry;
    expect(player.view('m1')).toMatchObject({ playing: true, error: null });
  });

  it('a browser DOMException is never shown raw', async () => {
    const { gestures, player, address } = setup();
    const signing = address();
    const done = gestures.tap(() => player.toggle('m1', signing.resolve));
    signing.reject(new DOMException('The request is not allowed by the user agent or the platform in the current context, possibly because the user denied permission.', 'NotAllowedError'));
    await done;
    expect(player.view('m1').error).toBe(VOICE_MESSAGES.failed);
  });

  it('an address that is missing says the message is unavailable', async () => {
    const { gestures, player, address } = setup();
    const signing = address();
    const done = gestures.tap(() => player.toggle('m1', signing.resolve));
    signing.answer(null);
    await done;
    expect(player.view('m1').error).toBe(VOICE_MESSAGES.unavailable);
  });

  it('a file the device cannot decode shows a failure, and the next tap signs a fresh address', async () => {
    const { gestures, element, player, address } = setup();
    const signing = address();
    const first = gestures.tap(() => player.toggle('m1', signing.resolve));
    signing.answer();
    await first;
    element.fail(4);                          // MEDIA_ERR_SRC_NOT_SUPPORTED
    expect(player.view('m1').error).toBe(VOICE_MESSAGES.failed);
    expect(player.view('m1').playing).toBe(false);   // never a pause icon next to an error
    expect(element.paused).toBe(true);
    const retry = gestures.tap(() => player.toggle('m1', signing.resolve));
    expect(signing.calls).toBe(2);
    signing.answer();
    await retry;
    expect(player.view('m1')).toMatchObject({ error: null, playing: true });
  });

  it('a play() interrupted by another tap (AbortError) is not reported', async () => {
    const { gestures, element, player, address } = setup();
    element.holdPlay = true;
    const signing = address();
    const first = gestures.tap(() => player.toggle('m1', signing.resolve));
    signing.answer();
    await flush();
    element.pause();                          // another tap paused it while it was still buffering
    await first;
    expect(player.view('m1')).toMatchObject({ error: null, hint: null, loading: false });
  });
});

describe('play, pause, resume and the signed address', () => {
  it('pause then resume plays the same address without signing again, inside the tap', async () => {
    const { gestures, element, player, address } = setup();
    const signing = address();
    const first = gestures.tap(() => player.toggle('m1', signing.resolve));
    signing.answer();
    await first;
    await gestures.tap(() => player.toggle('m1', signing.resolve));     // pause
    expect(element.paused).toBe(true);
    gestures.advance(60_000);
    await gestures.tap(() => player.toggle('m1', signing.resolve));     // resume
    expect(element.paused).toBe(false);
    expect(signing.calls).toBe(1);
  });

  it('an address older than the signed lifetime is replaced before playing again', async () => {
    const { gestures, player, address } = setup();
    const signing = address();
    const first = gestures.tap(() => player.toggle('m1', signing.resolve));
    signing.answer();
    await first;
    await gestures.tap(() => player.toggle('m1', signing.resolve));     // pause
    gestures.advance(SIGNED_URL_TTL_MS + 1_000);
    const again = gestures.tap(() => player.toggle('m1', signing.resolve));
    expect(signing.calls).toBe(2);
    signing.answer();
    await again;
    expect(player.view('m1').playing).toBe(true);
  });

  it('after the clip ends the next tap plays it again from the start', async () => {
    const { gestures, element, player, address } = setup();
    const signing = address();
    const first = gestures.tap(() => player.toggle('m1', signing.resolve));
    signing.answer();
    await first;
    element.finish();
    expect(player.view('m1')).toMatchObject({ playing: false, progress: 0 });
    const again = gestures.tap(() => player.toggle('m1', signing.resolve));
    signing.answer();
    await again;
    expect(element.paused).toBe(false);
    expect(element.currentTime).toBe(0);
  });

  it('a second tap while the audio is still buffering pauses it (the member can cancel a slow start)', async () => {
    const { gestures, element, player, address } = setup();
    element.holdPlay = true;
    const signing = address();
    const first = gestures.tap(() => player.toggle('m1', signing.resolve));
    signing.answer();
    await flush();
    expect(player.view('m1').loading).toBe(true);
    await gestures.tap(() => player.toggle('m1', signing.resolve));
    expect(element.paused).toBe(true);
    await first;
    expect(player.view('m1')).toMatchObject({ playing: false, loading: false, error: null });
  });
});

describe('several voice messages', () => {
  it('starting another stops the first: one element, one clip at a time', async () => {
    const { gestures, element, player, address } = setup();
    const a = address();
    const first = gestures.tap(() => player.toggle('a', a.resolve));
    a.answer();
    await first;
    const b = address('https://media.example/b.m4a');
    const second = gestures.tap(() => player.toggle('b', b.resolve));
    b.answer('https://media.example/b.m4a');
    await second;
    expect(element.src).toBe('https://media.example/b.m4a');
    expect(player.view('a').playing).toBe(false);
    expect(player.view('b').playing).toBe(true);
  });

  it('tapping B while A\'s address is still on the way: B plays, and A\'s late address is ignored', async () => {
    const { gestures, element, player, address } = setup();
    const a = address('https://media.example/a.m4a');
    const b = address('https://media.example/b.m4a');
    const first = gestures.tap(() => player.toggle('a', a.resolve));
    const second = gestures.tap(() => player.toggle('b', b.resolve));
    b.answer('https://media.example/b.m4a');
    await second;
    a.answer('https://media.example/a.m4a');   // arrives late
    await first;
    expect(element.src).toBe('https://media.example/b.m4a');
    expect(player.view('b').playing).toBe(true);
    expect(player.view('a')).toMatchObject({ playing: false, loading: false, error: null });
  });

  it('a double tap on the same clip while its address is on the way signs once', async () => {
    const { gestures, player, address } = setup();
    const signing = address();
    const first = gestures.tap(() => player.toggle('m1', signing.resolve));
    const second = gestures.tap(() => player.toggle('m1', signing.resolve));
    signing.answer();
    await Promise.all([first, second]);
    expect(signing.calls).toBe(1);
    expect(player.view('m1').playing).toBe(true);
  });
});

describe('exclusive playback with videos and other clips', () => {
  it('claims the shared "playing" slot when it starts, and the stop it hands over pauses the element', async () => {
    const { gestures, element, player, address, claims } = setup();
    const signing = address();
    const done = gestures.tap(() => player.toggle('m1', signing.resolve));
    signing.answer();
    await done;
    expect(claims.map(claim => claim.id)).toEqual(['voice']);
    claims[0].stop();                         // a video started elsewhere
    expect(element.paused).toBe(true);
    expect(player.view('m1').playing).toBe(false);
  });

  it('releases the slot when it pauses or ends', async () => {
    const { gestures, element, player, address, released } = setup();
    const signing = address();
    const done = gestures.tap(() => player.toggle('m1', signing.resolve));
    signing.answer();
    await done;
    element.pause();
    element.finish();
    expect(released).toContain('voice');
  });
});

describe('diagnostics carry no addresses, keys or content', () => {
  it('every event across a full session is a name and a number, never a URL, signature or message id', async () => {
    const { gestures, element, player, address, traced } = setup({ loadLiftsRestriction: false });
    const signing = address('https://media.example/chat/secret-key-123.m4a?X-Amz-Signature=deadbeef');
    const first = gestures.tap(() => player.toggle('message-id-abc', signing.resolve));
    gestures.advance(9_000);
    signing.answer('https://media.example/chat/secret-key-123.m4a?X-Amz-Signature=deadbeef');
    await first;
    await gestures.tap(() => player.toggle('message-id-abc', signing.resolve));
    element.fail(4);
    const failing = gestures.tap(() => player.toggle('message-id-abc', signing.resolve));
    signing.reject(new Error('You are offline: https://media.example/x'));
    await failing;
    expect(traced.length).toBeGreaterThan(4);
    for (const line of traced) expect(line).not.toMatch(/https?:|secret|signature|deadbeef|message-id|media\.example|offline/i);
  });
});
