/**
 * One thing plays sound at a time: a voice message, a community clip, or the
 * full-screen video viewer. Starting one stops whichever other was playing.
 *
 * iPhone already refuses to run two media elements together, but desktop and
 * Android browsers happily play a voice message underneath a video, which
 * sounds like a glitch. Each player claims when it actually starts and
 * releases when it pauses or ends; the claim is what stops the previous owner.
 */
type Owner = { id: string; stop: () => void };

let current: Owner | null = null;

/** `id` is now playing; whoever else was playing is stopped. Claiming again with the same id only refreshes its stop function. */
export function claimPlayback(id: string, stop: () => void): void {
  const previous = current;
  current = { id, stop };
  if (previous && previous.id !== id) {
    // The previous owner may already be unmounted; that is not this caller's problem.
    try { previous.stop(); } catch { /* Nothing left to stop. */ }
  }
}

/** `id` stopped by itself (paused, ended, unmounted). Only the current owner can release. */
export function releasePlayback(id: string): void {
  if (current?.id === id) current = null;
}

/** Who is playing, for tests and diagnostics. */
export function currentPlaybackOwner(): string | null {
  return current?.id ?? null;
}
