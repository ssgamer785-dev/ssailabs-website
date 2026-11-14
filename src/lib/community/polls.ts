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

export async function createPollPost(args: {
  channel: PostChannel;
  question: string;
  options: string[];
  isAnonymous?: boolean;
}): Promise<CreatePollResult> {
  const { data, error } = await supabase.rpc('create_poll_post', {
    p_channel: args.channel,
    p_question: args.question,
    p_options: args.options,
    p_is_anonymous: args.isAnonymous ?? false,
  });
  if (error) {
    console.error('[polls] create failed:', error);
    // The database's own messages here are written for a person ("A poll needs
    // at least two options"), so they are worth showing rather than replacing.
    return { ok: false, message: error.message || 'Could not create the poll.' };
  }
  return { ok: true, postId: data as unknown as string };
}
