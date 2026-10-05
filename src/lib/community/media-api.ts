/**
 * Client half of the R2 flow for community post attachments. Mirrors the chat
 * media client, but hits /api/posts — where reads are open to any signed-in
 * member and writes are keyed to the uploader.
 */

import { supabase } from '../supabase';
import { peekMedia, peekSignedUrl, signedUrl } from '../media/media-cache';

export type PostMediaKind = 'image' | 'video' | 'pdf' | 'file' | 'voice';

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('You are signed out. Please log in again.');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function readError(res: Response, fallback: string): Promise<string> {
  if (res.status === 401) return 'Your session has ended. Please sign in again.';
  try {
    const body = await res.json();
    return typeof body?.error === 'string' ? body.error : fallback;
  } catch {
    return fallback;
  }
}

export interface PostUploadTicket {
  uploadUrl: string;
  storageKey: string;
  /** Signed PUT for the poster frame, when one was asked for. */
  posterUploadUrl?: string;
  posterKey?: string;
}

export async function requestPostUploadUrl(args: {
  kind: PostMediaKind;
  mimeType: string;
  sizeBytes: number;
  /** Set when a poster frame will be uploaded alongside the video. */
  posterBytes?: number;
}): Promise<PostUploadTicket> {
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
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('Upload cancelled.', 'AbortError')); return; }
    const xhr = new XMLHttpRequest();
    // Cancelling an item stops its transfer at once instead of letting it finish unseen.
    signal?.addEventListener('abort', () => { xhr.abort(); reject(new DOMException('Upload cancelled.', 'AbortError')); }, { once: true });
    xhr.open('PUT', uploadUrl, true);
    xhr.setRequestHeader('Content-Type', mimeType);
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) { onProgress(1); resolve(); }
      else {
        // R2 returns XML errors. Keep the HTTP status and error code visible so
        // a rejected signature or storage failure is not mistaken for a lost connection.
        const code = xhr.responseText.match(/<Code>([^<]+)<\/Code>/)?.[1];
        reject(new Error(`Media storage rejected the upload (HTTP ${xhr.status}${code ? `: ${code}` : ''}).`));
      }
    };
    // A CORS-blocked response has no readable status/body in browser JavaScript.
    xhr.onerror = () => reject(new Error('Could not connect to media storage. Please retry; if this continues, contact support.'));
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

/**
 * A signed GET for a community attachment: from the shared media cache when a
 * valid one is known, otherwise signed together with every other request made
 * in the same moment (one request for a screen). `force` always signs afresh.
 */
export const getPostMediaUrl = Object.assign(
  (storageKey: string, force = false): Promise<string> => signedUrl('post', storageKey, force),
  {
    /** A still-valid address of the original itself, known without asking anyone (viewers, players, downloads). */
    peek: (storageKey: string) => peekSignedUrl('post', storageKey),
    /** The picture already prepared for lists (its display copy): drawn at once while the original loads. */
    prepared: (storageKey: string) => peekMedia('post', storageKey)?.src ?? null,
  },
);

export async function resumePostUploadUrl(ticket: PostUploadTicket, args: {
  kind: PostMediaKind; mimeType: string; sizeBytes: number; posterBytes?: number;
}): Promise<PostUploadTicket> {
  const res = await fetch('/api/posts/resume-upload', {
    method: 'POST', headers: await authHeaders(),
    body: JSON.stringify({ ...args, storageKey: ticket.storageKey, posterKey: ticket.posterKey }),
  });
  if (!res.ok) throw new Error(await readError(res, 'Could not retry the upload.'));
  return res.json();
}
