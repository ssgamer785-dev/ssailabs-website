/**
 * Client half of the R2 flow for community post attachments. Mirrors the chat
 * media client, but hits /api/posts — where reads are open to any signed-in
 * member and writes are keyed to the uploader.
 */

import { supabase } from '../supabase';

export type PostMediaKind = 'image' | 'video' | 'pdf';

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

export async function requestPostUploadUrl(args: {
  kind: PostMediaKind;
  mimeType: string;
  sizeBytes: number;
}): Promise<{ uploadUrl: string; storageKey: string }> {
  const res = await fetch('/api/posts/upload-url', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(await readError(res, 'Could not start the upload.'));
  return res.json();
}

/** XHR rather than fetch, because fetch still has no upload-progress event. */
export function uploadPostMedia(
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

export async function deletePostMedia(postId: string): Promise<void> {
  const res = await fetch('/api/posts/delete-media', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ postId }),
  });
  if (!res.ok) throw new Error(await readError(res, 'Could not delete the attachment.'));
}

/** Signed GET URLs, cached and re-signed a minute before they lapse. */
const urlCache = new Map<string, { url: string; expiresAt: number }>();

export async function getPostMediaUrl(storageKey: string): Promise<string> {
  const hit = urlCache.get(storageKey);
  if (hit && hit.expiresAt > Date.now()) return hit.url;

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('You are signed out. Please log in again.');

  const res = await fetch(`/api/posts/media-url?key=${encodeURIComponent(storageKey)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await readError(res, 'Could not load this attachment.'));

  const { url, expiresIn } = await res.json();
  urlCache.set(storageKey, { url, expiresAt: Date.now() + (expiresIn - 60) * 1000 });
  return url;
}
