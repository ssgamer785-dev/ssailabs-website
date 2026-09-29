import { afterEach, describe, expect, it } from 'bun:test';
import { claimPlayback, currentPlaybackOwner, releasePlayback } from './exclusive-playback';

afterEach(() => { releasePlayback('a'); releasePlayback('b'); releasePlayback('c'); });

describe('exclusive playback', () => {
  it('starting one stops the one that was playing, and only that one', () => {
    const stopped: string[] = [];
    claimPlayback('a', () => stopped.push('a'));
    claimPlayback('b', () => stopped.push('b'));
    expect(stopped).toEqual(['a']);
    claimPlayback('c', () => stopped.push('c'));
    expect(stopped).toEqual(['a', 'b']);
    expect(currentPlaybackOwner()).toBe('c');
  });

  it('claiming again with the same id never stops itself', () => {
    const stopped: string[] = [];
    claimPlayback('a', () => stopped.push('a'));
    claimPlayback('a', () => stopped.push('a2'));
    expect(stopped).toEqual([]);
    expect(currentPlaybackOwner()).toBe('a');
  });

  it('a player that paused by itself releases, so the next start stops nothing', () => {
    const stopped: string[] = [];
    claimPlayback('a', () => stopped.push('a'));
    releasePlayback('a');
    claimPlayback('b', () => stopped.push('b'));
    expect(stopped).toEqual([]);
  });

  it('a stale release from a player that already lost its turn does not evict the current owner', () => {
    claimPlayback('a', () => {});
    claimPlayback('b', () => {});
    releasePlayback('a');                     // a's pause event arrives after b started
    expect(currentPlaybackOwner()).toBe('b');
  });

  it('a stop function that throws (its player is gone) does not prevent the new one from starting', () => {
    claimPlayback('a', () => { throw new Error('unmounted'); });
    expect(() => claimPlayback('b', () => {})).not.toThrow();
    expect(currentPlaybackOwner()).toBe('b');
  });
});
