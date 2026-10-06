/**
 * Several attachments per post (RC5): the client half.
 *
 * The first attachment stays on the post row (so older apps still show it);
 * the rest are post_media items, read through post_media_for() which applies
 * the same anonymity rules as the feed. Before the database has the RC5
 * migration none of this exists: a post holds one attachment, and the
 * composer says so (it never pretends to take several).
 */
import { supabase } from '../supabase';
import { requestPostUploadUrl, resumePostUploadUrl, uploadPostMedia, type PostMediaKind, type PostUploadTicket } from './media-api';
import type { MediaSize } from '../media/dimensions';

export interface PostMediaItem {
  id: string;
  postId: string;
  position: number;
  kind: 'image' | 'video' | 'pdf' | 'file';
  storageKey: string | null;
  posterKey: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  fileName: string | null;
  width: number | null;
  height: number | null;
  mediaPurged: boolean;
}

type ItemRow = {
  id: string; post_id: string; position: number; kind: PostMediaItem['kind'];
  storage_key: string | null; poster_key: string | null; mime_type: string | null; size_bytes: number | null;
  file_name: string | null; width: number | null; height: number | null; media_purged: boolean;
};

function isMissing(error: { code?: string; message?: string } | null): boolean {
  return !!error && (['PGRST202', '42883', 'PGRST205', '42P01'].includes(error.code ?? '') || /could not find|does not exist/i.test(error.message ?? ''));
}

/**
 * Whether the database can hold several attachments per post: 'yes' or 'no'
 * once it has answered, 'unknown' while it has not (not asked yet, or the ask
 * failed — offline, a dropped connection). Only a database that really lacks
 * the RC5 functions is 'no'.
 */
export type MultiMediaSupport = 'yes' | 'no' | 'unknown';

let known: 'yes' | 'no' | null = null;
let asking: Promise<MultiMediaSupport> | null = null;

/** The answer already in hand, without asking: a screen can open with it in its first frame. */
export function knownMultiMediaSupport(): MultiMediaSupport {
  return known ?? 'unknown';
}

/** Asks the database once per page load; a failed ask is asked again next time. */
export function multiMediaSupport(): Promise<MultiMediaSupport> {
  if (known) return Promise.resolve(known);
  asking ??= (async () => {
    try {
      const { error } = await supabase.rpc('post_media_for' as never, { p_post_ids: [] } as never);
      if (!error) known = 'yes';
      else if (isMissing(error)) known = 'no';
    } catch { /* unknown: asked again next time */ }
    asking = null;
    return known ?? 'unknown';
  })();
  return asking;
}

/** True only once the database has said it holds several attachments per post. */
export async function multiMediaSupported(): Promise<boolean> {
  return (await multiMediaSupport()) === 'yes';
}

/** For tests: forget the answer. */
export function resetMultiMediaSupportForTests(): void {
  known = null;
  asking = null;
}

export interface PostMediaInfo {
  /** Items 2..n, in order. */
  items: PostMediaItem[];
  /** The first attachment's own size, when known. */
  firstSize: { width: number; height: number } | null;
}

/** Items 2..n of these posts (and the first item's size), by post. Empty before the migration. */
export async function fetchPostMedia(postIds: string[]): Promise<Map<string, PostMediaInfo>> {
  const out = new Map<string, PostMediaInfo>();
  if (!postIds.length || !(await multiMediaSupported())) return out;
  const { data, error } = await supabase.rpc('post_media_for' as never, { p_post_ids: postIds } as never);
  if (error) {
    if (isMissing(error)) return out;
    throw new Error(error.message);
  }
  for (const r of (data ?? []) as ItemRow[]) {
    const info = out.get(r.post_id) ?? { items: [], firstSize: null };
    out.set(r.post_id, info);
    if (r.position === 0) {
      if (r.width && r.height) info.firstSize = { width: r.width, height: r.height };
      continue;
    }
    info.items.push({
      id: r.id, postId: r.post_id, position: r.position, kind: r.kind,
      storageKey: r.storage_key, posterKey: r.poster_key, mimeType: r.mime_type, sizeBytes: r.size_bytes,
      fileName: r.file_name, width: r.width, height: r.height, mediaPurged: r.media_purged,
    });
  }
  return out;
}

/** Adds every post's extra attachments and first-item size; a failure leaves the posts as they were. */
export async function withPostMedia<P extends { id: string }>(posts: P[]): Promise<(P & { extraMedia?: PostMediaItem[]; firstMediaSize?: { width: number; height: number } | null })[]> {
  try {
    const media = await fetchPostMedia(posts.map(p => p.id));
    if (!media.size) return posts;
    return posts.map(post => {
      const info = media.get(post.id);
      return info ? { ...post, extraMedia: info.items, firstMediaSize: info.firstSize } : post;
    });
  } catch (error) {
    console.warn('[community] extra attachments could not be loaded:', error);
    return posts;
  }
}

/** One attachment the composer will publish. */
export interface DraftAttachment {
  file: File;
  kind: PostMediaKind;
  poster: Blob | null;
  size: MediaSize | null;
  /** Kept after a failed attempt, so a retry re-sends to the same key (no orphan, no duplicate). */
  ticket?: PostUploadTicket;
}

/** What publishing needs once an attachment's bytes are stored. */
export interface UploadedAttachment {
  kind: PostMediaKind;
  storageKey: string;
  posterKey: string | null;
  posterSizeBytes: number | null;
  mimeType: string;
  sizeBytes: number;
  fileName: string;
  width: number | null;
  height: number | null;
}

/** Uploads one attachment (and its video poster), resuming its earlier key when it has one. */
export async function uploadDraftAttachment(draft: DraftAttachment, signal: AbortSignal, onProgress: (fraction: number) => void): Promise<UploadedAttachment> {
  const args = { kind: draft.kind, mimeType: draft.file.type, sizeBytes: draft.file.size, posterBytes: draft.poster?.size };
  const ticket = draft.ticket ? await resumePostUploadUrl(draft.ticket, args) : await requestPostUploadUrl(args);
  draft.ticket = ticket;
  await uploadPostMedia(ticket.uploadUrl, draft.file, draft.file.type, onProgress, signal);
  let posterKey: string | null = null;
  if (ticket.posterUploadUrl && draft.poster) {
    await uploadPostMedia(ticket.posterUploadUrl, draft.poster, 'image/jpeg', () => {}, signal);
    posterKey = ticket.posterKey ?? null;
  }
  return {
    kind: draft.kind, storageKey: ticket.storageKey, posterKey, posterSizeBytes: posterKey ? draft.poster?.size ?? null : null,
    mimeType: draft.file.type, sizeBytes: draft.file.size, fileName: draft.file.name,
    width: draft.size?.width ?? null, height: draft.size?.height ?? null,
  };
}

/**
 * Publishes a post with all its uploaded attachments in one transaction: the
 * first on the post itself, the rest as items. Returns the new post's id.
 */
export async function publishPostWithMedia(post: {
  authorId: string; channel: 'official' | 'students'; title: string | null; body: string | null; isAnonymous: boolean;
}, uploads: UploadedAttachment[]): Promise<string> {
  const [first, ...rest] = uploads;
  const { data, error } = await supabase.rpc('create_post_with_media' as never, {
    p_post: {
      author_id: post.authorId, channel: post.channel, title: post.title, body: post.body, is_anonymous: post.isAnonymous,
      attachment: first?.kind ?? 'none', storage_key: first?.storageKey ?? null, poster_key: first?.posterKey ?? null,
      poster_size_bytes: first?.posterSizeBytes ?? null, mime_type: first?.mimeType ?? null, size_bytes: first?.sizeBytes ?? null,
      file_name: first?.fileName ?? null, media_width: first?.width ?? null, media_height: first?.height ?? null,
    },
    p_media: rest.map(item => ({
      kind: item.kind, storage_key: item.storageKey, poster_key: item.posterKey, poster_size_bytes: item.posterSizeBytes,
      mime_type: item.mimeType, size_bytes: item.sizeBytes, file_name: item.fileName, width: item.width, height: item.height,
    })),
  } as never);
  if (error) throw new Error(error.message);
  return data as unknown as string;
}
