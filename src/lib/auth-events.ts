/**
 * What an auth event means for the profile already in memory. Pure, so the
 * rule that keeps screens mounted across a resume can be tested directly.
 *
 * Supabase fires SIGNED_IN every time the tab becomes visible again (it
 * re-validates the stored session) and TOKEN_REFRESHED about hourly. Treating
 * either as a fresh sign-in used to put every guarded route back behind
 * "Loading your account…", which unmounted the screen and lost drafts, scroll
 * and playback.
 */
export type ProfileAction =
  /** Signed out: forget the profile. */
  | 'clear'
  /** A user whose profile we do not hold yet: load it, and let guards wait. */
  | 'load'
  /** Same user, nothing about the profile can have changed. */
  | 'keep'
  /** Same user: re-read quietly in the background; screens stay as they are. */
  | 'refresh-silently';

export function profileActionFor(event: string, nextUserId: string | null | undefined, heldProfileId: string | null | undefined): ProfileAction {
  if (!nextUserId) return 'clear';
  if (heldProfileId !== nextUserId) return 'load';
  if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') return 'keep';
  return 'refresh-silently';
}

interface UserLike { id: string; email?: string | null; updated_at?: string | null }

/**
 * Keeps the previous user object when a refreshed session describes the same
 * person, so effects keyed on `user` do not refetch and resubscribe on every
 * token refresh.
 */
export function stableUser<T extends UserLike>(previous: T | null, next: T | null): T | null {
  if (!next) return null;
  if (previous && previous.id === next.id && previous.email === next.email && previous.updated_at === next.updated_at) {
    return previous;
  }
  return next;
}
