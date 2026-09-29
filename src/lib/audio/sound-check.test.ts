import { describe, expect, it } from 'bun:test';
import type { OutputStatus } from './audio-output';
import { describeOutput, runSoundCheck, SOUND_CHECK_WINDOW_MS } from './sound-check';

/** A clock and a wait that advance together, so no test sleeps. */
function clock() {
  let t = 0;
  return { now: () => t, wait: async (ms: number) => { t += ms; } };
}

describe('sound check', () => {
  it('reports started as soon as the output runs, and never before the tap work is done', async () => {
    const order: string[] = [];
    const { now, wait } = clock();
    const result = await runSoundCheck({
      prime: () => order.push('prime'),
      unlock: () => { order.push('unlock'); return true; },
      play: () => order.push('play'),
      status: () => { order.push('status'); return 'running'; },
      now, wait,
    });
    expect(result).toBe('started');
    expect(order).toEqual(['prime', 'unlock', 'play', 'status']);   // all inside the tap, before any waiting
  });

  it('waits for a slow audio session and reports started when it arrives inside the window', async () => {
    const { now, wait } = clock();
    let polls = 0;
    const result = await runSoundCheck({
      unlock: () => true, play: () => {},
      status: () => (++polls > 8 ? 'running' : 'suspended'),   // ~0.8 s of activation
      now, wait,
    });
    expect(result).toBe('started');
  });

  it('reports blocked when the device never starts audio inside the window (no false success)', async () => {
    const { now, wait } = clock();
    const statuses: OutputStatus[] = [];
    const result = await runSoundCheck({
      unlock: () => true, play: () => {},
      status: () => { statuses.push('locked'); return 'locked'; },
      now, wait,
    });
    expect(result).toBe('blocked');
    expect(now()).toBeGreaterThanOrEqual(SOUND_CHECK_WINDOW_MS);
    expect(statuses.length).toBeGreaterThan(5);
  });

  it('a browser without Web Audio is reported as unsupported and no sound is attempted', async () => {
    let played = false;
    const result = await runSoundCheck({ unlock: () => false, play: () => { played = true; }, status: () => 'none' });
    expect(result).toBe('unsupported');
    expect(played).toBe(false);
  });
});

describe('describing the output', () => {
  it('says "ready" only for a running output, and always talks about what the device did, never about what was heard', () => {
    expect(describeOutput('running').tone).toBe('good');
    for (const status of ['locked', 'none', 'interrupted', 'suspended', 'stalled'] as const) expect(describeOutput(status).tone).toBe('wait');
    expect(describeOutput('unsupported').tone).toBe('bad');
    for (const status of ['running', 'locked', 'none', 'interrupted', 'suspended', 'stalled', 'unsupported'] as const) {
      expect(describeOutput(status).detail).not.toMatch(/you (should|will) hear|heard/i);
    }
  });

  it('a locked output tells the member what unlocks it', () => {
    expect(describeOutput('locked').detail).toMatch(/tap/i);
  });
});
