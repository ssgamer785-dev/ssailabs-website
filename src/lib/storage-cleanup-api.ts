import { supabase } from './supabase';
import type { CleanupPage, CleanupRequest } from './storage-cleanup';

/** One page of the admin storage clean-up, as the signed-in admin. */
export const requestCleanupPage: CleanupRequest = async body => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in again to run the storage check.');
  const res = await fetch('/api/storage/unreferenced', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({})) as Partial<CleanupPage> & { error?: string };
  if (!res.ok || typeof json.scanned !== 'number') throw new Error(json.error || 'The storage check could not run. Try again.');
  return json as CleanupPage;
};
