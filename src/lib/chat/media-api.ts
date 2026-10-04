/**
 * Client half of the R2 media flow. Every call goes through our own server,
 * which holds the R2 credentials and authorizes the request against the
 * caller's Supabase session.
 */

import { supabase } from '../supabase';
import { peekMedia, signedUrl } from '../media/media-cache';
import { OFFLINE_MESSAGE, ReadableError } from '../errors';
import type { MediaKind } from './types';

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

export interface UploadTicket {
  uploadUrl: string;
  storageKey: string;
  /** Signed PUT for the poster frame, when one was asked for. */
  posterUploadUrl?: string;
  posterKey?: string;
  quotaBytes: number;
  /** How many older attachments FIFO cleanup dropped to fit this one in. */
  purged: number;
  mediaBytesUsed: number;
}

/**
 * Asks for somewhere to put a file. The server makes room first — if this
 * upload would push the conversation past 100 MB it deletes the oldest
 * attachments before signing anything, and reports how many went.
 */
export async function requestUploadUrl(args: {
  conversationId: string;
  kind: MediaKind;
  mimeType: string;
  sizeBytes: number;
  /** Set when a poster frame will be uploaded alongside the video. */
  posterBytes?: number;
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
        // R2 answers with XML. Keep the status and its error code, so a refused
        // signature or a storage failure is not reported as a lost connection.
        const code = xhr.responseText.match(/<Code>([^<]+)<\/Code>/)?.[1];
        console.warn('[chat] media storage rejected the upload', xhr.status, code ?? '');
        reject(new ReadableError(`Media storage rejected the upload (HTTP ${xhr.status}${code ? `: ${code}` : ''}).`));
      }
    };
    // No readable answer: offline, a dropped connection, or storage refusing
    // this site's address (its CORS rule). JavaScript cannot tell these apart.
    xhr.onerror = () => {
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      console.warn('[chat] no answer from media storage (offline, dropped connection, or its CORS rule)');
      reject(new ReadableError(offline
        ? OFFLINE_MESSAGE
        : 'Could not connect to media storage. Please retry; if this continues, contact support.'));
    };
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));

    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(blob);
  });
}

/**
 * Re-signs the PUT for an upload that already has a row, so a retry sends the
 * bytes to the same key rather than stranding the first one in the bucket.
 * The server checks that the row is still pending and belongs to the caller.
 */
export async function resumeUpload(messageId: string): Promise<{
  uploadUrl: string;
  storageKey: string;
  posterUploadUrl?: string;
  posterKey?: string;
}> {
  const res = await fetch('/api/chat/resume-upload', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ messageId }),
  });
  if (!res.ok) throw new Error(await readError(res, 'Could not resume the upload.'));
  return res.json();
}

export interface QuotaState {
  mediaBytesUsed: number;
  quotaBytes: number;
  purged: number;
}

/**
 * Reconciles storage after a send. Making room happens before the upload, so
 * this normally finds nothing to do — it exists to catch the cases the
 * pre-flight cannot see, such as two devices uploading at once.
 */
export async function finalizeUpload(conversationId: string): Promise<QuotaState> {
  const res = await fetch('/api/chat/finalize', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ conversationId }),
  });
  if (!res.ok) throw new Error(await readError(res, 'Could not finalize the upload.'));
  return res.json();
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
 * Resolves a private R2 key to a short-lived signed URL: from the shared media
 * cache (this page's memory only — chat addresses are never written to the
 * device) when one is still valid, otherwise signed together with every other
 * request made in the same moment. `force` always signs afresh.
 */
export const getMediaUrl = Object.assign(
  (storageKey: string, force = false): Promise<string> => signedUrl('chat', storageKey, force),
  /** What can be shown at once without asking anyone (a prepared picture, or a valid address). */
  { peek: (storageKey: string) => peekMedia('chat', storageKey)?.src ?? null },
);
