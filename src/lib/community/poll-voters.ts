/**
 * Who voted for what on a poll — for the admin.
 *
 * Read straight from poll_votes, whose own row-level security decides who
 * sees what: an admin reads every vote, anyone else only their own
 * (poll_votes_select_own_or_admin), and the voter's name comes from profiles
 * under the same rule (profiles_select_own_or_admin). So a student who sends
 * this exact request gets their own vote back and nobody else's: the database
 * enforces it, and nothing here is trusted to. poll_votes is not published to
 * Realtime, so no other channel carries votes either.
 */
import { supabase } from '../supabase';

export interface PollVoter {
  voterId: string;
  /** The member's real name (profiles.full_name). */
  name: string;
  /** When they made their current choice. */
  votedAt: string;
  /** They moved their vote here from another option. */
  changed: boolean;
}

export interface VoteRow {
  option_id: string;
  created_at: string;
  updated_at: string;
  voter: { id: string; full_name: string | null } | null;
}

/** A vote updated more than this after it was first cast was changed. */
const CHANGED_AFTER_MS = 2000;

/** Votes grouped by option, newest choice first within each. */
export function groupVoters(rows: VoteRow[]): Map<string, PollVoter[]> {
  const byOption = new Map<string, PollVoter[]>();
  for (const row of rows) {
    if (!row.voter) continue;
    const list = byOption.get(row.option_id) ?? [];
    list.push({
      voterId: row.voter.id,
      name: row.voter.full_name?.trim() || 'Unnamed member',
      votedAt: row.updated_at,
      changed: new Date(row.updated_at).getTime() - new Date(row.created_at).getTime() > CHANGED_AFTER_MS,
    });
    byOption.set(row.option_id, list);
  }
  for (const list of byOption.values()) list.sort((a, b) => b.votedAt.localeCompare(a.votedAt));
  return byOption;
}

/** null means the request failed (shown as such, never as "no votes"). */
export async function fetchPollVoters(postId: string): Promise<Map<string, PollVoter[]> | null> {
  const { data, error } = await supabase
    .from('poll_votes')
    .select('option_id, created_at, updated_at, voter:profiles!voter_id(id, full_name)')
    .eq('post_id', postId)
    .order('updated_at', { ascending: false })
    .limit(2000);
  if (error) {
    console.error('[polls] voters failed:', error);
    return null;
  }
  return groupVoters((data ?? []) as unknown as VoteRow[]);
}
