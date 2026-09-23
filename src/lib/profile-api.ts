/**
 * Editing your own profile: display name and picture.
 *
 * Authorization is not decided here, and cannot be. The name change is an
 * ordinary PATCH against `profiles` filtered to the caller's own id, so the
 * profiles RLS policy is what actually refuses a write to anybody else's row —
 * a client that dropped the filter would simply be refused by Postgres. The
 * avatar endpoints take no user id at all: the server builds the key from the
 * id inside the verified JWT, so there is no parameter to point elsewhere.
 */

import { supabase } from './supabase';
import { validateFullName } from './profile-name';

// Re-exported so screens have one import for the whole flow, while the rules
// themselves stay free of the Supabase client and unit-testable.
export { MAX_NAME_LENGTH, MIN_NAME_LENGTH, validateFullName } from './profile-name';

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('You are signed out. Please log in again.');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    return typeof body?.error === 'string' ? body.error : fallback;
  } catch {
    return fallback;
  }
}

/** Saves the caller's own display name. RLS refuses any other row. */
export async function updateFullName(userId: string, fullName: string): Promise<{ ok: boolean; message?: string }> {
  const problem = validateFullName(fullName);
  if (problem) return { ok: false, message: problem };

  const { error } = await supabase
    .from('profiles')
    .update({ full_name: fullName.trim() })
    .eq('id', userId);

  if (error) {
    console.error('[profile] name update failed:', error);
    return { ok: false, message: 'Could not save your name. Please try again.' };
  }
  return { ok: true };
}

export interface AvatarTicket { uploadUrl: string; storageKey: string }

export async function requestAvatarUploadUrl(file: File): Promise<AvatarTicket> {
  const res = await fetch('/api/profile/avatar-upload-url', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ mimeType: file.type, sizeBytes: file.size }),
  });
  if (!res.ok) throw new Error(await readError(res, 'Could not start the upload.'));
  return res.json();
}

/** XHR rather than fetch, for the same reason as post media: upload progress. */
export function uploadAvatar(
  uploadUrl: string,
  blob: Blob,
  mimeType: string,
  onProgress: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    xhr.setRequestHeader('Content-Type', mimeType);
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) { onProgress(1); resolve(); }
      else reject(new Error(`Upload failed (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error('Upload failed — check your connection.'));
    xhr.send(blob);
  });
}

/**
 * Points the profile row at a freshly uploaded object.
 *
 * Called only after the bytes have landed. Writing the key first would leave
 * every screen that draws this person showing a broken image for as long as
 * the upload took, and permanently if it failed.
 */
export async function setAvatarKey(userId: string, storageKey: string): Promise<boolean> {
  const { error } = await supabase
    .from('profiles')
    .update({ avatar_key: storageKey })
    .eq('id', userId);
  if (error) {
    console.error('[profile] avatar key update failed:', error);
    return false;
  }
  return true;
}

/** Removes the object and clears the column, in that order. */
export async function removeAvatar(): Promise<{ ok: boolean; message?: string }> {
  const res = await fetch('/api/profile/avatar-delete', {
    method: 'POST',
    headers: await authHeaders(),
    body: '{}',
  });
  if (!res.ok) return { ok: false, message: await readError(res, 'Could not remove the picture.') };
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Signed GET URLs for avatars, cached like post media.
//
// An avatar is drawn on nearly every screen, often several times, so the cache
// is doing more work here than it does for a post attachment: without it,
// opening the admin inbox would sign one URL per row per render.
// ---------------------------------------------------------------------------
const urlCache = new Map<string, { url: string; expiresAt: number }>();
const inFlight = new Map<string, Promise<string>>();

export async function getAvatarUrl(storageKey: string): Promise<string> {
  const hit = urlCache.get(storageKey);
  if (hit && hit.expiresAt > Date.now()) return hit.url;

  const pending = inFlight.get(storageKey);
  if (pending) return pending;

  const work = (async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error('You are signed out. Please log in again.');

    const res = await fetch(`/api/profile/avatar-url?key=${encodeURIComponent(storageKey)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(await readError(res, 'Could not load this picture.'));

    const { url, expiresIn } = await res.json();
    // Re-signed a minute early, so a URL is never handed to an <img> with
    // seconds left on it.
    urlCache.set(storageKey, { url, expiresAt: Date.now() + (expiresIn - 60) * 1000 });
    return url as string;
  })();

  inFlight.set(storageKey, work);
  try {
    return await work;
  } finally {
    inFlight.delete(storageKey);
  }
}

/**
 * Drops a key from the signed-URL cache.
 *
 * Needed when a picture is replaced: the new object has a new key so the cache
 * would not collide, but the OLD key must not keep serving a valid URL to an
 * object that has just been deleted.
 */
export function forgetAvatarUrl(storageKey: string | null | undefined): void {
  if (storageKey) urlCache.delete(storageKey);
}
