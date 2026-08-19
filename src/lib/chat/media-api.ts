/**
 * Client half of the R2 media flow. Every call goes through our own server,
 * which holds the R2 credentials and authorizes the request against the
 * caller's Supabase session.
 */

import { supabase } from '../supabase';
import type { MediaKind } from './types';

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

export interface UploadTicket {
  uploadUrl: string;
  storageKey: string;
  quotaBytes: number;
}

export async function requestUploadUrl(args: {
  conversationId: string;
  kind: MediaKind;
  mimeType: string;
  sizeBytes: number;
}): Promise<UploadTicket> {
  const res = await fetch('/api/chat/upload-url', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(await readError(res, 'Could not start the upload.'));
  return res.json();
}

/**
 * PUTs the blob straight to R2 with progress. Uses XHR rather than fetch
 * because fetch still has no upload-progress event.
 */
export function uploadToR2(
  uploadUrl: string,
  blob: Blob,
  mimeType: string,
  onProgress: (fraction: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    xhr.setRequestHeader('Content-Type', mimeType);

    xhr.upload.onprogress = e => {
      if (e.lengthComputable) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve();
      } else {
        reject(new Error(`Upload failed (${xhr.status}). Tap to retry.`));
      }
    };
    xhr.onerror = () => reject(new Error('Upload failed — check your connection and retry.'));
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));

    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(blob);
  });
}

/** Brings the student back under the 100 MB cap, purging oldest media first. */
export async function finalizeUpload(conversationId: string): Promise<void> {
  const res = await fetch('/api/chat/finalize', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ conversationId }),
  });
  if (!res.ok) throw new Error(await readError(res, 'Could not finalize the upload.'));
}

export async function deleteRemoteMedia(messageId: string): Promise<void> {
  const res = await fetch('/api/chat/delete-media', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ messageId }),
  });
  if (!res.ok) throw new Error(await readError(res, 'Could not delete the attachment.'));
}

/**
 * Resolves a private R2 key to a short-lived signed URL. Cached in-memory and
 * expired early, so a scrolling thread doesn't re-sign the same object.
 */
const urlCache = new Map<string, { url: string; expiresAt: number }>();

export async function getMediaUrl(storageKey: string): Promise<string> {
  const hit = urlCache.get(storageKey);
  if (hit && hit.expiresAt > Date.now()) return hit.url;

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('You are signed out. Please log in again.');

  const res = await fetch(`/api/chat/media-url?key=${encodeURIComponent(storageKey)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(await readError(res, 'Could not load this attachment.'));

  const { url, expiresIn } = await res.json();
  // Re-sign a minute before the real expiry to avoid racing a long render.
  urlCache.set(storageKey, { url, expiresAt: Date.now() + (expiresIn - 60) * 1000 });
  return url;
}
