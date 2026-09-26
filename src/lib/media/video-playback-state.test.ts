import { describe, expect, it } from 'bun:test';
import { clampVideoPosition, shouldRestoreVideoSource, snapshotVideoPlayback } from './video-playback-state';

describe('video viewer playback handoff', () => {
  it('captures position and playing state before switching viewers', () => {
    expect(snapshotVideoPlayback({ currentTime: 18.4, paused: false })).toEqual({ currentTime: 18.4, playing: true });
    expect(snapshotVideoPlayback({ currentTime: 3, paused: true })).toEqual({ currentTime: 3, playing: false });
    expect(snapshotVideoPlayback(null)).toEqual({ currentTime: 0, playing: false });
  });

  it('clamps a restored position to the video duration', () => {
    expect(clampVideoPosition(12, 20)).toBe(12);
    expect(clampVideoPosition(21, 20)).toBe(19.95);
    expect(clampVideoPosition(-4, 20)).toBe(0);
    expect(clampVideoPosition(12, Number.NaN)).toBe(12);
  });

  it('recognizes a re-signed URL after the media hook temporarily clears src', () => {
    expect(shouldRestoreVideoSource('signed-url-a', 'signed-url-b')).toBe(true);
    expect(shouldRestoreVideoSource('signed-url-a', null)).toBe(false);
    expect(shouldRestoreVideoSource(null, 'signed-url-b')).toBe(false);
    expect(shouldRestoreVideoSource('same-url', 'same-url')).toBe(false);
  });
});
