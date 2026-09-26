/**
 * The client side of the activation gate.
 *
 * Every function here is a thin call to a SECURITY DEFINER database function.
 * None of them decides anything: redemption, code creation and the admin reads
 * are all authorised inside Postgres, against auth.uid(), where the client
 * cannot reach. What this module owns is turning the database's answer into a
 * sentence a person can act on.
 */

import { supabase } from './supabase';
import type { Database, MembershipRequestStatus } from './database.types';

// Re-exported so screens have one import for the whole flow, while the
// formatter itself stays free of the Supabase client and unit-testable.
export { formatCodeInput, CODE_ALPHABET } from './activation-code';

export type MembershipRequest = Database['public']['Tables']['membership_requests']['Row'];

export interface AdminActivationCode {
  id: string;
  code_hint: string;
  created_at: string;
  expires_at: string;
  redeemed_at: string | null;
  redeemed_by_name: string | null;
  status: 'ACTIVE' | 'USED' | 'EXPIRED';
}

/** What the admin is shown once, at creation. Nothing stores the plaintext. */
export interface CreatedCode {
  id: string;
  code: string;
  expires_at: string;
}

/**
 * The gate's user-facing copy.
 *
 * The database answers 'invalid' for a code that never existed, one that has
 * expired and one already redeemed — deliberately, so a guesser learns
 * nothing. That means this cannot say "expired" even when it would be more
 * helpful, and the wording has to cover all three without implying which.
 */
const REDEEM_MESSAGES: Record<string, string> = {
  invalid: 'That code isn’t valid. Codes expire 15 minutes after they’re issued and work once — ask for a fresh one.',
  too_many_attempts: 'Too many attempts. Wait a few minutes and try again.',
  unauthenticated: 'Your session expired. Please sign in again.',
};

const GENERIC = 'Something went wrong. Please try again.';

export interface RedeemResult {
  ok: boolean;
  /** Present only on failure, and always safe to show. */
  message?: string;
}

/** Redeems a code for the signed-in user. The user is never named by the client. */
export async function redeemActivationCode(code: string): Promise<RedeemResult> {
  const { data, error } = await supabase.rpc('redeem_activation_code', { p_code: code });
  if (error) {
    // A database error is a bug or an outage, not something the person can act
    // on, so it is logged and replaced rather than shown.
    console.error('[activation] redeem failed:', error);
    return { ok: false, message: GENERIC };
  }
  const result = data as { ok?: boolean; reason?: string } | null;
  if (result?.ok) return { ok: true };
  return { ok: false, message: REDEEM_MESSAGES[result?.reason ?? ''] ?? REDEEM_MESSAGES.invalid };
}

/** Admin only — the database refuses this for anyone else. */
export async function createActivationCode(): Promise<CreatedCode | null> {
  const { data, error } = await supabase.rpc('create_activation_code');
  if (error) {
    console.error('[activation] create failed:', error);
    return null;
  }
  return data as unknown as CreatedCode;
}

/**
 * Admin only — an empty array for anyone else, by construction.
 *
 * null means the request FAILED; an empty array means it succeeded and there
 * is nothing to show. These must stay distinguishable: collapsing a failure
 * into [] made the screen say "No codes yet", which is a different and wrong
 * statement about the world — and on the membership list it would have told
 * an admin nobody had applied when the query had simply errored.
 */
export async function listActivationCodes(limit = 50): Promise<AdminActivationCode[] | null> {
  const { data, error } = await supabase.rpc('admin_activation_codes', { p_limit: limit });
  if (error) {
    console.error('[activation] list failed:', error);
    return null;
  }
  return (data ?? []) as unknown as AdminActivationCode[];
}

/** null means the request failed; [] means there are genuinely none. */
export async function listMembershipRequests(limit = 100): Promise<MembershipRequest[] | null> {
  const { data, error } = await supabase.rpc('admin_membership_requests', { p_limit: limit });
  if (error) {
    console.error('[activation] membership list failed:', error);
    return null;
  }
  return (data ?? []) as unknown as MembershipRequest[];
}

export async function setMembershipStatus(
  id: string,
  status: MembershipRequestStatus,
): Promise<boolean> {
  const { error } = await supabase.rpc('admin_set_membership_status', { p_id: id, p_status: status });
  if (error) {
    console.error('[activation] status change failed:', error);
    return false;
  }
  return true;
}

export interface MembershipForm {
  email: string;
  name: string;
  mobile: string;
  tradingExperience: string;
  address: string;
}

/**
 * Lodges a membership request. Grants nothing — RLS ties the row to
 * auth.uid() and the gate does not consult this table.
 */
export async function submitMembershipRequest(
  userId: string,
  form: MembershipForm,
): Promise<{ ok: boolean; message?: string }> {
  const { error } = await supabase.from('membership_requests').insert({
    requested_by: userId,
    email: form.email.trim(),
    name: form.name.trim(),
    mobile: form.mobile.trim(),
    trading_experience: form.tradingExperience.trim(),
    address: form.address.trim(),
  });
  if (error) {
    console.error('[activation] membership submit failed:', error);
    return { ok: false, message: GENERIC };
  }
  return { ok: true };
}
