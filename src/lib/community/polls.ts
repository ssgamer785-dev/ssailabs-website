/**
 * The client side of community polls.
 *
 * Every function here is a thin call to a database function. None of them
 * decides anything: who may vote, whether an option belongs to the poll it was
 * cast on, and how many votes each option has are all settled inside Postgres,
 * where the client cannot reach.
 *
 * The counts come from `poll_results` rather than a select on poll_votes on
 * purpose. RLS hides other people's votes — deliberately, so nobody can see
 * who voted for what — which means a client counting rows would count its own
 * vote and nothing else, and every poll would read 1/0/0 to everyone.
 */

import { supabase } from '../supabase';
import type { PostChannel } from '../database.types';

export interface PollOption {
  optionId: string;
  sortOrder: number;
  label: string;
  voteCount: number;
  isMyVote: boolean;
}

type PollResultRow = {
  option_id: string; sort_order: number; label: string;
  vote_count: number | string; is_my_vote: boolean;
};

/**
 * null means the request FAILED; [] means the post genuinely has no options.
 *
 * Kept distinguishable for the same reason the activation lists are: rendering
 * "no options" for a failed read tells the reader something untrue about the
 * poll rather than something true about the network.
 */
export async function fetchPollResults(postId: string): Promise<PollOption[] | null> {
  const { data, error } = await supabase.rpc('poll_results', { p_post_id: postId });
  if (error) {
    console.error('[polls] results failed:', error);
    return null;
  }
  return ((data ?? []) as PollResultRow[]).map(r => ({
    optionId: r.option_id,
    sortOrder: r.sort_order,
    label: r.label,
    voteCount: Number(r.vote_count) || 0,
    isMyVote: r.is_my_vote,
  }));
}

const VOTE_MESSAGES: Record<string, string> = {
  unauthenticated: 'Your session expired. Please sign in again.',
  not_activated: 'Your account is not activated yet.',
  invalid_option: 'That option is no longer available.',
};

export interface VoteResult { ok: boolean; message?: string }

/** Records the vote, or moves it if the caller has already voted on this poll. */
export async function castPollVote(postId: string, optionId: string): Promise<VoteResult> {
  const { data, error } = await supabase.rpc('cast_poll_vote', {
    p_post_id: postId,
    p_option_id: optionId,
  });
  if (error) {
    console.error('[polls] vote failed:', error);
    return { ok: false, message: 'Could not record your vote. Please try again.' };
  }
  const result = data as { ok?: boolean; reason?: string } | null;
  if (result?.ok) return { ok: true };
  return {
    ok: false,
    message: VOTE_MESSAGES[result?.reason ?? ''] ?? 'Could not record your vote.',
  };
}

/**
 * Creates a poll post and its options atomically.
 *
 * The channel rule is not re-checked here: the database's own
 * posts_guard_channel trigger raises for a non-admin writing to 'official',
 * and a second copy of that rule in the client would be one more place for it
 * to drift out of step with the one that actually enforces it.
 */
export interface CreatePollResult {
  ok: boolean;
  /** Present on success. */
  postId?: string;
  /** Present on failure, and always safe to show. */
  message?: string;
}

/** A poll's picture once its bytes are stored (an uploaded post image). */
export interface PollImage {
  storageKey: string;
  width: number | null;
  height: number | null;
}

/** The types a poll picture may be. The database checks the same list against the upload itself. */
export const POLL_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
/** The same limit the server applies to every post image. */
export const POLL_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

/** Why a picked file cannot be a poll picture, or null when it can. */
export function pollImageProblem(file: { type: string; size: number }): string | null {
  if (!(POLL_IMAGE_TYPES as readonly string[]).includes(file.type.toLowerCase())) return 'A poll picture must be a JPEG, PNG or WebP image.';
  if (file.size <= 0) return 'That picture is empty.';
  if (file.size > POLL_IMAGE_MAX_BYTES) return 'That picture is larger than the 10 MB limit.';
  return null;
}

function isMissingFunction(error: { code?: string; message?: string }): boolean {
  return error.code === 'PGRST202' || error.code === '42883' || /could not find the function/i.test(error.message ?? '');
}

export async function createPollPost(args: {
  channel: PostChannel;
  question: string;
  options: string[];
  isAnonymous?: boolean;
  /** One optional picture, shown above the options. */
  image?: PollImage | null;
}): Promise<CreatePollResult> {
  const common = {
    p_channel: args.channel,
    p_question: args.question,
    p_options: args.options,
    p_is_anonymous: args.isAnonymous ?? false,
  };
  // With a picture: the poll and its picture in one transaction, so nobody
  // ever sees the poll without the picture it was published with.
  const { data, error } = args.image
    ? await supabase.rpc('create_poll_post_with_image' as never, {
      ...common,
      p_image: { storage_key: args.image.storageKey, width: args.image.width, height: args.image.height },
    } as never)
    : await supabase.rpc('create_poll_post', common);
  if (error) {
    console.error('[polls] create failed:', error);
    if (args.image && isMissingFunction(error)) {
      return { ok: false, message: 'Poll pictures need the latest database update. Remove the picture to publish the poll now.' };
    }
    // The database's own messages here are written for a person ("A poll needs
    // at least two options"), so they are worth showing rather than replacing.
    return { ok: false, message: error.message || 'Could not create the poll.' };
  }
  return { ok: true, postId: data as unknown as string };
}
