export interface VideoPlaybackSnapshot {
  currentTime: number;
  playing: boolean;
}

/** Capture the small piece of playback state needed when swapping viewers. */
export function snapshotVideoPlayback(
  video: Pick<HTMLVideoElement, 'currentTime' | 'paused'> | null,
): VideoPlaybackSnapshot {
  const currentTime = video?.currentTime ?? 0;
  return {
    currentTime: Number.isFinite(currentTime) && currentTime > 0 ? currentTime : 0,
    playing: !!video && !video.paused,
  };
}

/** Clamp saved positions to a newly loaded video's seekable duration. */
export function clampVideoPosition(position: number, duration: number): number {
  const safePosition = Number.isFinite(position) && position > 0 ? position : 0;
  if (!Number.isFinite(duration) || duration <= 0) return safePosition;
  return Math.min(safePosition, Math.max(0, duration - 0.05));
}

/** A transient missing src during URL re-signing must not lose playback state. */
export function shouldRestoreVideoSource(previous: string | null, next: string | null): boolean {
  return !!previous && !!next && previous !== next;
}
