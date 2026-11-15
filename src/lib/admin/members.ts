import { supabase } from '../supabase';

/**
 * Deleting a member, from the admin's screens. The server and the database
 * decide everything (who may, never yourself, never the last admin); this only
 * asks, with the word the admin typed in the second confirmation.
 */

/** The word the admin types to confirm. The server refuses a request without it. */
export const DELETE_CONFIRMATION = 'DELETE';

export class MemberDeleteError extends Error {
  readonly status: number;
  /** 'sign-in' when the member was removed from the app but their sign-in could not be closed yet (retryable). */
  readonly stage: string | null;
  constructor(message: string, status: number, stage: string | null) {
    super(message);
    this.name = 'MemberDeleteError';
    this.status = status;
    this.stage = stage;
  }
}

export interface MemberDeleted {
  /** True when the member had already been deleted (a retry that finished the job). */
  already: boolean;
}

export async function deleteMember(memberId: string, confirmation: string): Promise<MemberDeleted> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new MemberDeleteError('Your session expired. Sign in again and retry.', 401, null);

  let res: Response;
  try {
    res = await fetch(`/api/admin/members/${encodeURIComponent(memberId)}/delete`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: confirmation }),
    });
  } catch {
    throw new MemberDeleteError('Could not reach the server. Check your connection and try again.', 0, null);
  }
  const body = await res.json().catch(() => null) as { ok?: boolean; already?: boolean; error?: string; stage?: string } | null;
  if (res.ok && body?.ok) return { already: !!body.already };
  throw new MemberDeleteError(body?.error || 'The member could not be deleted. Please try again.', res.status, body?.stage ?? null);
}
