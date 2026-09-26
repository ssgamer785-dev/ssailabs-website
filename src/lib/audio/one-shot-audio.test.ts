import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'bun:test';
import { createOneShotAudioPlayer } from './one-shot-audio';

class FakeSource {
  buffer: AudioBuffer | null = null;
  onended: ((event: Event) => void) | null = null;
  startedAt: number | null = null;
  disconnected = 0;
  connect(_destination: AudioNode) {}
  start(when = 0) { this.startedAt = when; }
  stop() { this.finish(); }
  disconnect() { this.disconnected += 1; }
  finish() { this.onended?.(new Event('ended')); }
}

class FakeContext {
  state: AudioContextState;
  currentTime = 0;
  destination = {} as AudioNode;
  sources: FakeSource[] = [];
  closeCount = 0;
  resumeCount = 0;
  deferResume = false;
  resumePending: (() => void) | null = null;
  constructor(state: AudioContextState = 'running') { this.state = state; }
  resume() {
    this.resumeCount += 1;
    if (this.deferResume) return new Promise<void>(resolve => {
      this.resumePending = () => { this.state = 'running'; resolve(); };
    });
    this.state = 'running';
    return Promise.resolve();
  }
  close() { this.closeCount += 1; this.state = 'closed'; return Promise.resolve(); }
  decodeAudioData(_bytes: ArrayBuffer) { return Promise.resolve({ duration: 2 } as AudioBuffer); }
  createBufferSource() { const source = new FakeSource(); this.sources.push(source); return source; }
}

const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

describe('one-shot refresh sound lifecycle', () => {
  it('starts one effect without a delayed backlog and releases its context', async () => {
    const contexts: FakeContext[] = [];
    let loads = 0;
    const player = createOneShotAudioPlayer({
      createContext: () => { const context = new FakeContext(); contexts.push(context); return context; },
      loadBuffer: async () => { loads += 1; return { duration: 2 }; },
    });

    player.playFromGesture();
    player.playFromGesture();
    await flush();

    expect(loads).toBe(1);
    expect(contexts[0].sources.map(source => source.startedAt)).toEqual([0]);
    expect(player.state()).toEqual({ queued: 0, active: 1, hasContext: true });

    contexts[0].sources[0].finish();
    expect(contexts[0].sources[0].disconnected).toBe(1);
    await flush();
    expect(contexts[0].closeCount).toBe(1);
    expect(player.state()).toEqual({ queued: 0, active: 0, hasContext: false });

    await new Promise(resolve => setTimeout(resolve, 110));
    player.playFromGesture();
    await flush();
    expect(contexts).toHaveLength(2);
    expect(contexts[1].sources).toHaveLength(1);
  });

  it('does not leave a suspended autoplay context or stale queued sound', () => {
    const context = new FakeContext('suspended');
    const player = createOneShotAudioPlayer({
      createContext: () => context,
      loadBuffer: async () => ({ duration: 2 }),
    });

    player.tryAutoplay();

    expect(context.sources).toHaveLength(0);
    expect(context.closeCount).toBe(1);
    expect(player.state()).toEqual({ queued: 0, active: 0, hasContext: false });
  });

  it('schedules a predecoded source inside a suspended iOS gesture, then unlocks it', async () => {
    const contexts: FakeContext[] = [];
    let loads = 0;
    const player = createOneShotAudioPlayer({
      createContext: () => {
        const context = new FakeContext(contexts.length ? 'suspended' : 'running');
        if (contexts.length) context.deferResume = true;
        contexts.push(context);
        return context;
      },
      loadBuffer: async () => { loads += 1; return { duration: 2 }; },
    });

    await player.preload();
    expect(contexts[0].closeCount).toBe(1);
    expect(loads).toBe(1);

    player.playFromGesture();
    expect(contexts[1].sources).toHaveLength(1);
    expect(contexts[1].sources[0].startedAt).toBe(0);
    expect(contexts[1].state).toBe('suspended');
    contexts[1].resumePending?.();
    await flush();
    expect(contexts[1].state).toBe('running');
    expect(contexts[1].sources).toHaveLength(1);
    expect(loads).toBe(1);
    contexts[1].sources[0].finish();
  });

  it('drops an unlock that arrives too late instead of playing on the next gesture', async () => {
    const context = new FakeContext('suspended');
    context.deferResume = true;
    const player = createOneShotAudioPlayer({
      createContext: () => context,
      loadBuffer: async () => ({ duration: 2 }),
    });
    player.playFromGesture();
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(context.closeCount).toBe(1);
    context.resumePending?.();
    await flush();
    expect(context.sources).toHaveLength(0);
    expect(player.state()).toEqual({ queued: 0, active: 0, hasContext: false });
  });

  it('stops a predecoded suspended source before a late iOS resume can replay it', async () => {
    const contexts: FakeContext[] = [];
    const player = createOneShotAudioPlayer({
      createContext: () => {
        const context = new FakeContext(contexts.length ? 'suspended' : 'running');
        if (contexts.length) context.deferResume = true;
        contexts.push(context);
        return context;
      },
      loadBuffer: async () => ({ duration: 2 }),
    });
    await player.preload();
    player.playFromGesture();
    expect(contexts[1].sources).toHaveLength(1);
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(contexts[1].sources[0].disconnected).toBe(1);
    contexts[1].resumePending?.();
    await flush();
    expect(player.state()).toEqual({ queued: 0, active: 0, hasContext: false });
  });

  it('retries iOS resume synchronously on touch-end when touch-start resume is still pending', async () => {
    const contexts: FakeContext[] = [];
    const player = createOneShotAudioPlayer({
      createContext: () => {
        const context = new FakeContext(contexts.length ? 'suspended' : 'running');
        if (contexts.length) context.deferResume = true;
        contexts.push(context);
        return context;
      },
      loadBuffer: async () => ({ duration: 2 }),
    });
    await player.preload();
    player.prepareFromGesture();
    expect(contexts[1].resumeCount).toBe(1);
    player.playFromGesture();
    expect(contexts[1].resumeCount).toBe(2);
    expect(contexts[1].sources).toHaveLength(1);
    contexts[1].resumePending?.();
    await flush();
    expect(player.state()).toEqual({ queued: 0, active: 1, hasContext: true });
    contexts[1].sources[0].finish();
  });

  it('retries preloading after a temporary fetch or decode failure', async () => {
    let attempts = 0;
    const player = createOneShotAudioPlayer({
      createContext: () => new FakeContext(),
      loadBuffer: async () => {
        if (++attempts === 1) throw new Error('temporarily offline');
        return { duration: 2 };
      },
    });
    expect(await player.preload()).toBe(false);
    expect(await player.preload()).toBe(true);
    expect(attempts).toBe(2);
  });

  it('unlocks on pointer start and reuses that context when the pull is released', async () => {
    const contexts: FakeContext[] = [];
    const player = createOneShotAudioPlayer({
      createContext: () => {
        const context = new FakeContext(contexts.length ? 'suspended' : 'running');
        if (contexts.length) context.deferResume = true;
        contexts.push(context);
        return context;
      },
      loadBuffer: async () => ({ duration: 2 }),
    });
    await player.preload();
    player.prepareFromGesture();
    expect(contexts[1].resumeCount).toBe(1);
    contexts[1].resumePending?.();
    await flush();
    player.playFromGesture();
    expect(contexts[1].resumeCount).toBe(1);
    expect(contexts[1].sources[0].startedAt).toBe(0);
    contexts[1].sources[0].finish();
    expect(contexts[1].closeCount).toBe(1);
  });

  it('shares an unfinished preload with the first refresh instead of decoding twice', async () => {
    const contexts: FakeContext[] = [];
    let finishLoad: ((sound: { duration: number }) => void) | undefined;
    let loads = 0;
    const player = createOneShotAudioPlayer({
      createContext: () => { const context = new FakeContext(); contexts.push(context); return context; },
      loadBuffer: () => {
        loads += 1;
        return new Promise(resolve => { finishLoad = resolve; });
      },
    });
    const preload = player.preload();
    player.prepareFromGesture();
    player.playFromGesture();
    expect(loads).toBe(1);
    finishLoad?.({ duration: 2 });
    await preload;
    await flush();
    expect(contexts[1].sources).toHaveLength(1);
    contexts[1].sources[0].finish();
    expect(contexts[1].closeCount).toBe(1);
  });

  it('keeps the original refresh recording byte-for-byte unchanged', async () => {
    const asset = await readFile(new URL('../../assets/money-sound-for-trader.m4a', import.meta.url));
    const hash = createHash('sha256').update(asset).digest('hex').toUpperCase();
    expect(hash).toBe('C8F71D46FDB23B2CCEF8C1264575E550A23D27E4DC399123334C60D3980C0BA8');
  });

  it('survives 1,000 rapid refresh events without scheduling a sound backlog', async () => {
    const contexts: FakeContext[] = [];
    const player = createOneShotAudioPlayer({
      createContext: () => { const context = new FakeContext(); contexts.push(context); return context; },
      loadBuffer: async () => ({ duration: 2 }),
    });
    await player.preload();
    for (let i = 0; i < 1_000; i++) player.playFromGesture();
    await flush();
    expect(contexts.flatMap(context => context.sources)).toHaveLength(1);
    expect(player.state()).toEqual({ queued: 0, active: 1, hasContext: true });
    contexts[1].sources[0].finish();
    await flush();
    expect(player.state()).toEqual({ queued: 0, active: 0, hasContext: false });
    expect(contexts[1].closeCount).toBe(1);
  });

  it('restarts a later deliberate gesture immediately and stops the prior source', async () => {
    const contexts: FakeContext[] = [];
    const player = createOneShotAudioPlayer({
      createContext: () => { const context = new FakeContext(); contexts.push(context); return context; },
      loadBuffer: async () => ({ duration: 2 }),
    });
    await player.preload();
    player.playFromGesture();
    const first = contexts[1].sources[0];
    await new Promise(resolve => setTimeout(resolve, 110));
    player.playFromGesture();
    expect(contexts[1].sources).toHaveLength(2);
    expect(first.disconnected).toBe(1);
    expect(contexts[1].sources[1].startedAt).toBe(0);
    expect(player.state().active).toBe(1);
    contexts[1].sources[1].finish();
    await flush();
    expect(contexts[1].closeCount).toBe(1);
  });
});
