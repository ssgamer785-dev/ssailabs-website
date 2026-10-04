import { supabase } from '../supabase';

/** A request to our own API with the session token, refreshing the session once if it has just expired. */
export async function authorizedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const { data } = await supabase.auth.getSession();
  let token = data.session?.access_token;
  if (!token) throw new Error('Your session has ended. Please sign in again.');

  const send = (bearer: string) => fetch(path, { ...init, headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${bearer}` } });
  let response = await send(token);
  if (response.status === 401) {
    const { data: refreshed, error } = await supabase.auth.refreshSession();
    token = refreshed.session?.access_token;
    if (error || !token) throw new Error('Your session has ended. Please sign in again.');
    response = await send(token);
  }
  return response;
}

/** What a refused media key means, in words a member can act on. */
export function mediaErrorFor(status: number): string {
  if (status === 401) return 'Your session has ended. Please sign in again.';
  if (status === 403) return 'You do not have access to this attachment.';
  if (status === 404) return 'This attachment is no longer available.';
  if (status === 400) return 'This attachment link is not valid.';
  return `Could not load attachment (HTTP ${status}). Please retry.`;
}

/** One session refresh after an expired token; never retry a denied media key. */
export async function fetchSignedUrl(path: string): Promise<{ url: string; expiresIn: number }> {
  const response = await authorizedFetch(path);
  if (!response.ok) throw new Error(mediaErrorFor(response.status));
  return response.json();
}
