import { supabase } from '../supabase';

/** One session refresh after an expired token; never retry a denied media key. */
export async function fetchSignedUrl(path: string): Promise<{ url: string; expiresIn: number }> {
  const { data } = await supabase.auth.getSession();
  let token = data.session?.access_token;
  if (!token) throw new Error('Your session has ended. Please sign in again.');

  let response = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
  if (response.status === 401) {
    const { data: refreshed, error } = await supabase.auth.refreshSession();
    token = refreshed.session?.access_token;
    if (error || !token) throw new Error('Your session has ended. Please sign in again.');
    response = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
  }
  if (!response.ok) {
    if (response.status === 401) throw new Error('Your session has ended. Please sign in again.');
    if (response.status === 403) throw new Error('You do not have access to this attachment.');
    if (response.status === 404) throw new Error('This attachment is no longer available.');
    throw new Error(`Could not load attachment (HTTP ${response.status}). Please retry.`);
  }
  return response.json();
}
