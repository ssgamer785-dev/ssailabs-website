import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { useAuth } from '../auth-context';
import { probeVideo } from '../media/video-poster';
import { sortByTime, upsertMessage as upsert } from './merge';
import {
  purgeNotice,
  type ChatMessage,
  type MediaKind,
  type MessageKind,
  type UploadStatus,
} from './types';
import {
  deleteRemoteMedia,
  finalizeUpload,
  requestUploadUrl,
  resumeUpload,
  uploadToR2,
} from './media-api';
import { friendlyError } from '../errors';
import { measureImage } from '../media/dimensions';
import { announceNotificationsChanged } from '../notifications/events';
import { readView, warmView, writeView } from '../view-cache';
import type { ChatOverview } from './useChatOverview';

const PAGE_SIZE = 30;
const TYPING_TIMEOUT_MS = 3500;

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  kind: MessageKind;
  body: string | null;
  storage_key: string | null;
  poster_key: string | null;
  poster_size_bytes: number | null;
  mime_type: string | null;
  size_bytes: number | null;
  file_name: string | null;
  voice_duration_seconds: number | null;
  read_at: string | null;
  created_at: string;
  client_id: string | null;
  deleted_at: string | null;
  media_purged: boolean | null;
  upload_status: UploadStatus | null;
  album_id?: string | null; album_index?: number | null; album_size?: number | null;
  album_kind?: ChatMessage['albumKind']; media_width?: number | null; media_height?: number | null;
};

const SELECT_COLUMNS =
  'id, conversation_id, sender_id, kind, body, storage_key, poster_key, poster_size_bytes, mime_type, size_bytes, file_name, voice_duration_seconds, read_at, created_at, client_id, deleted_at, media_purged, upload_status';
/** RC5 adds albums and picture sizes; read only once the database has them. */
const RC5_COLUMNS = `${SELECT_COLUMNS}, album_id, album_index, album_size, album_kind, media_width, media_height`;
/** Learned from the first page load: does the database have the RC5 columns? */
let albumSchema: boolean | undefined;
// Typed as the legacy list: the query builder's column parser does not need to know the extras.
const columns = () => (albumSchema === false ? SELECT_COLUMNS : RC5_COLUMNS) as typeof SELECT_COLUMNS;
const isMissingColumn = (error: { code?: string; message?: string } | null) =>
  !!error && (error.code === '42703' || error.code === 'PGRST204' || /column .* does not exist|Could not find .* column/i.test(error.message ?? ''));
/** Items of an album uploading at the same time. */
const ALBUM_CONCURRENCY = 3;

/** A thread's latest page as last read, per account (memory only), so opening it renders at once. */
export const threadViewKey = (userId: string, conversationId: string) => `chat:${userId}:${conversationId}`;

/** The newest page of a thread, oldest first. Falls back to the pre-RC5 columns on a database without them. */
async function queryLatest(conversationId: string): Promise<{ rows: ChatMessage[]; error: { code?: string; message?: string } | null }> {
  // Which columns this read asks for. Several threads can be read at the same moment (an admin's recent threads,
  // or a thread being prepared while another is opened): each read that asked for the RC5 columns and found them
  // missing tries again without them — even when another read has just found that out.
  const askedForRc5 = albumSchema !== false;
  const { data, error } = await supabase
    .from('messages')
    .select(columns())
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE);
  if (error && askedForRc5 && isMissingColumn(error)) {
    // A database the RC5 migration has not reached: read what it has.
    albumSchema = false;
    return queryLatest(conversationId);
  }
  if (error) return { rows: [], error };
  if (albumSchema === undefined) albumSchema = true;
  return { rows: sortByTime(((data ?? []) as MessageRow[]).map(toMessage)), error: null };
}

/** Reads a thread's latest page in the background (after sign-in, or when a member is about to open it). */
export function warmConversation(userId: string, conversationId: string): Promise<ChatMessage[]> {
  return warmView(threadViewKey(userId, conversationId), async () => {
    const { rows, error } = await queryLatest(conversationId);
    if (error) throw error;
    return rows;
  });
}

function toMessage(row: MessageRow): ChatMessage {
  const uploadStatus: UploadStatus = row.upload_status ?? 'ready';
  // A row still marked pending when it reaches us from the server is an upload
  // that never finished — the sender closed the app mid-send. The live upload
  // keeps its own 'uploading' state through upsertMessage, so this only ever
  // labels the abandoned case.
  const abandoned = uploadStatus === 'pending';

  return {
    id: row.id,
    clientId: row.client_id ?? row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    kind: row.kind,
    body: row.body,
    storageKey: row.storage_key,
    posterKey: row.poster_key,
    posterSizeBytes: row.poster_size_bytes,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    fileName: row.file_name,
    durationSeconds: row.voice_duration_seconds,
    readAt: row.read_at,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    mediaPurged: !!row.media_purged,
    uploadStatus,
    albumId: row.album_id ?? null,
    albumIndex: row.album_index ?? null,
    albumSize: row.album_size ?? null,
    albumKind: row.album_kind ?? null,
    mediaWidth: row.media_width ?? null,
    mediaHeight: row.media_height ?? null,
    status: abandoned ? 'failed' : 'sent',
    error: abandoned ? "This upload didn't finish." : undefined,
  };
}

export interface UseConversation {
  conversationId: string | null;
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  /** True while the other side of this thread has the screen open. */
  hasMore: boolean;
  loadingOlder: boolean;
  peerTyping: boolean;
  /** Set when FIFO cleanup freed space; clears when dismissed. */
  storageNotice: string | null;
  dismissStorageNotice: () => void;
  loadOlder: () => Promise<void>;
  sendText: (body: string) => Promise<void>;
  sendMedia: (file: Blob, kind: MediaKind, fileName: string, durationSeconds?: number) => Promise<void>;
  /** Several attachments as one album (RC5). */
  sendMediaBatch: (files: { file: Blob; kind: MediaKind; fileName: string }[]) => Promise<void>;
  /** Stops one item mid-upload and removes it. */
  cancelUpload: (clientId: string) => Promise<void>;
  retryOpen: () => void;
  retry: (clientId: string) => Promise<void>;
  deleteMessage: (message: ChatMessage) => Promise<void>;
  markRead: () => Promise<void>;
  notifyTyping: () => void;
  stopTyping: () => void;
}

/**
 * Drives one Student <-> Admin thread: history, pagination, Realtime sync,
 * optimistic sends with retry, read receipts and typing. Account presence is
 * handled by the shared app-wide presence topics, not this conversation room.
 *
 * Pass a conversationId to open a specific thread (admin viewing a student);
 * omit it and the current student's own thread is resolved or created.
 */
export function useConversation(explicitConversationId?: string): UseConversation {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  // A student's own thread is already known from the chat overview, and its latest page may have been read
  // ahead: then the thread is on screen in the first frame and refreshes behind.
  const knownId = explicitConversationId ?? (userId ? readView<ChatOverview | null>(`chat-overview:${userId}`)?.conversationId ?? null : null);
  const cachedThread = userId && knownId ? readView<ChatMessage[]>(threadViewKey(userId, knownId)) : undefined;
  const [conversationId, setConversationId] = useState<string | null>(knownId);
  const [openAttempt, setOpenAttempt] = useState(0);
  const [messages, setMessages] = useState<ChatMessage[]>(cachedThread ?? []);
  const [loading, setLoading] = useState(!cachedThread);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const [storageNotice, setStorageNotice] = useState<string | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastTypingSent = useRef(0);
  /** Newest server timestamp we hold — the gap-fill anchor after a reconnect. */
  const newestAt = useRef<string | null>(cachedThread?.length ? cachedThread[cachedThread.length - 1].createdAt : null);
  /** Every object URL this thread minted, so unmount can revoke all of them. */
  const objectUrls = useRef<string[]>([]);

  /** The latest list, for callbacks that must not re-create on every change. */
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;
  const conversationIdRef = useRef(conversationId);
  conversationIdRef.current = conversationId;

  const trackObjectUrl = useCallback((url: string) => {
    objectUrls.current.push(url);
    return url;
  }, []);

  // ---- resolve the conversation ------------------------------------------

  useEffect(() => {
    if (explicitConversationId) {
      setConversationId(explicitConversationId);
      return;
    }
    if (!userId) return;
    let active = true;
    // With the thread already known (and on screen), this only confirms it, quietly.
    const quiet = !!conversationIdRef.current;
    if (!quiet) setLoading(true);
    setError(null);
    Promise.resolve(supabase.rpc('get_or_create_my_conversation')).then(({ data, error: rpcError }) => {
      if (!active) return;
      if (rpcError || !data) {
        if (quiet) return;
        setError(friendlyError(rpcError, 'Could not open this conversation.'));
        setLoading(false);
      } else setConversationId(data as unknown as string);
    }).catch(() => {
      if (!active || quiet) return;
      setError('Could not open this conversation.');
      setLoading(false);
    });
    return () => { active = false; };
  }, [explicitConversationId, userId, openAttempt]);

  const retryOpen = useCallback(() => {
    if (explicitConversationId || conversationId) return;
    setLoading(true);
    setOpenAttempt(attempt => attempt + 1);
  }, [explicitConversationId, conversationId]);

  // ---- initial page -------------------------------------------------------

  const loadLatest = useCallback(async (id: string) => {
    const { rows: ordered, error: qErr } = await queryLatest(id);
    if (qErr) {
      setError(friendlyError(qErr, 'Could not load messages.'));
      return;
    }
    setHasMore(ordered.length === PAGE_SIZE);
    newestAt.current = ordered.length ? ordered[ordered.length - 1].createdAt : null;
    if (userId) writeView(threadViewKey(userId, id), ordered);
    // Preserve any in-flight optimistic messages across a refetch.
    setMessages(prev => {
      const pending = prev.filter(m => m.status !== 'sent');
      return ordered.reduce(upsert, pending);
    });
  }, [userId]);

  useEffect(() => {
    if (!conversationId) return;
    let active = true;
    // A copy already on screen stays there while the latest page is read behind it.
    const copy = userId ? readView<ChatMessage[]>(threadViewKey(userId, conversationId)) : undefined;
    if (copy) setMessages(prev => (prev.length ? prev : copy));
    setLoading(!copy);
    loadLatest(conversationId).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [conversationId, loadLatest, userId]);

  const loadOlder = useCallback(async () => {
    if (!conversationId || loadingOlder || !hasMore) return;
    const oldest = messages.find(m => m.status === 'sent');
    if (!oldest) return;

    setLoadingOlder(true);
    const { data, error: qErr } = await supabase
      .from('messages')
      .select(columns())
      .eq('conversation_id', conversationId)
      .lt('created_at', oldest.createdAt)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(PAGE_SIZE);
    setLoadingOlder(false);

    if (qErr) {
      setError(friendlyError(qErr, 'Could not load messages.'));
      return;
    }
    const rows = ((data ?? []) as MessageRow[]).map(toMessage);
    setHasMore(rows.length === PAGE_SIZE);
    if (rows.length) setMessages(prev => rows.reduce(upsert, prev));
  }, [conversationId, hasMore, loadingOlder, messages]);

  // ---- realtime + presence + reconnection ---------------------------------

  /** After a dropped subscription, pull anything that landed while we were away. */
  const fillGap = useCallback(async (id: string) => {
    const since = newestAt.current;
    if (!since) {
      await loadLatest(id);
      return;
    }
    const { data } = await supabase
      .from('messages')
      .select(columns())
      .eq('conversation_id', id)
      .gt('created_at', since)
      .order('created_at', { ascending: true });

    const rows = ((data ?? []) as MessageRow[]).map(toMessage);
    if (!rows.length) return;
    setMessages(prev => rows.reduce(upsert, prev));
    newestAt.current = rows[rows.length - 1].createdAt;
  }, [loadLatest]);

  useEffect(() => {
    if (!conversationId || !userId) return;

    let active = true;
    let hadDrop = false;

    const channel = supabase
      .channel(`chat:${conversationId}`, {
        config: { broadcast: { self: false } },
      })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        payload => {
          if (!active) return;
          const msg = toMessage(payload.new as MessageRow);
          setMessages(prev => upsert(prev, msg));
          if (!newestAt.current || msg.createdAt > newestAt.current) newestAt.current = msg.createdAt;
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversationId}` },
        payload => {
          if (!active) return;
          setMessages(prev => upsert(prev, toMessage(payload.new as MessageRow)));
        },
      )
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (!active || payload?.userId === userId) return;
        setPeerTyping(!!payload?.isTyping);
        clearTimeout(typingTimer.current);
        if (payload?.isTyping) {
          // Self-clear in case the "stopped typing" broadcast never arrives.
          typingTimer.current = setTimeout(() => setPeerTyping(false), TYPING_TIMEOUT_MS);
        }
      })
      .subscribe(status => {
        if (!active) return;
        if (status === 'SUBSCRIBED') {
          if (hadDrop) {
            hadDrop = false;
            void fillGap(conversationId);
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          hadDrop = true;
          setPeerTyping(false);
        }
      });

    channelRef.current = channel;

    // A backgrounded PWA tab gets its socket killed; re-check on resume.
    const onVisible = () => {
      if (document.visibilityState === 'visible' && active) void fillGap(conversationId);
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);

    return () => {
      active = false;
      clearTimeout(typingTimer.current);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [conversationId, userId, fillGap]);

  // ---- sending ------------------------------------------------------------

  const patch = useCallback((clientId: string, changes: Partial<ChatMessage>) => {
    setMessages(prev => prev.map(m => (m.clientId === clientId ? { ...m, ...changes } : m)));
  }, []);

  const insertRow = useCallback(async (draft: ChatMessage, uploadStatus: UploadStatus) => {
    const { data, error: insErr } = await supabase
      .from('messages')
      .insert({
        conversation_id: draft.conversationId,
        sender_id: draft.senderId,
        kind: draft.kind,
        body: draft.body,
        client_id: draft.clientId,
        storage_key: draft.storageKey,
        poster_key: draft.posterKey,
        poster_size_bytes: draft.posterSizeBytes,
        mime_type: draft.mimeType,
        size_bytes: draft.sizeBytes,
        file_name: draft.fileName,
        voice_duration_seconds: draft.durationSeconds,
        upload_status: uploadStatus,
        ...(albumSchema && draft.albumId ? {
          album_id: draft.albumId, album_index: draft.albumIndex, album_size: draft.albumSize, album_kind: draft.albumKind,
        } : {}),
        ...(albumSchema && draft.mediaWidth && draft.mediaHeight ? { media_width: draft.mediaWidth, media_height: draft.mediaHeight } : {}),
      } as never)
      .select(columns())
      .single();

    if (insErr) throw new Error(insErr.message);
    return toMessage(data as MessageRow);
  }, []);

  /** Plain text: one insert, no bytes, nothing to reserve. */
  const sendTextRow = useCallback(async (draft: ChatMessage) => {
    try {
      const saved = await insertRow(draft, 'ready');
      setMessages(prev => upsert(prev, saved));
      if (!newestAt.current || saved.createdAt > newestAt.current) newestAt.current = saved.createdAt;
    } catch (e) {
      patch(draft.clientId, {
        status: 'failed',
        error: friendlyError(e, 'Could not send. Tap to retry.'),
      });
    }
  }, [insertRow, patch]);

  /**
   * Media send, in the order the storage rules require:
   *
   *   1. ask the server for somewhere to put it — that call frees space first,
   *      deleting the oldest attachments if this one wouldn't otherwise fit;
   *   2. write the message row as 'pending', so the database knows about the
   *      object before a single byte is sent and nothing can be orphaned;
   *   3. upload the bytes (and the poster frame, for video);
   *   4. flip the row to 'ready', which is what releases it to the recipient.
   *
   * A failure at any point leaves a pending row holding the key. Retrying
   * resumes that same row rather than starting a second one.
   */
  /** One controller per uploading message, so a single item can be cancelled. */
  const uploads = useRef(new Map<string, AbortController>());

  const sendMediaRow = useCallback(async (draft: ChatMessage) => {
    const file = draft.pendingFile;
    if (!file) return;
    const controller = new AbortController();
    uploads.current.set(draft.clientId, controller);
    /** The pending row this attempt created, if any (removed again on cancel). */
    let createdRow: string | null = null;

    try {
      patch(draft.clientId, { status: 'uploading', progress: 0, error: undefined });
      const mimeType = draft.mimeType || 'application/octet-stream';

      // A resumed send already has its row and its keys; a fresh one does not.
      let rowId = draft.uploadStatus === 'pending' && draft.storageKey ? draft.id : null;
      let uploadUrl: string;
      let posterUploadUrl: string | undefined;

      if (rowId) {
        const ticket = await resumeUpload(rowId);
        uploadUrl = ticket.uploadUrl;
        posterUploadUrl = ticket.posterUploadUrl;
      } else {
        const ticket = await requestUploadUrl({
          conversationId: draft.conversationId,
          kind: draft.kind as MediaKind,
          mimeType,
          sizeBytes: file.size,
          posterBytes: draft.pendingPoster?.size,
        });
        uploadUrl = ticket.uploadUrl;
        posterUploadUrl = ticket.posterUploadUrl;

        if (ticket.purged > 0) setStorageNotice(purgeNotice(ticket.purged));
        if (controller.signal.aborted) return;

        draft = { ...draft, storageKey: ticket.storageKey, posterKey: ticket.posterKey ?? null };
        const row = await insertRow(draft, 'pending');
        rowId = row.id;
        createdRow = row.id;
        if (controller.signal.aborted) {
          // Cancelled while its row was being written: take the row away again.
          await deleteRemoteMedia(row.id).catch(() => {});
          return;
        }
        draft = { ...draft, id: row.id, createdAt: row.createdAt, uploadStatus: 'pending' };
        setMessages(prev => upsert(prev, { ...draft, status: 'uploading', progress: 0 }));
      }

      await uploadToR2(uploadUrl, file, mimeType, fraction =>
        patch(draft.clientId, { progress: fraction }), controller.signal);

      if (posterUploadUrl && draft.pendingPoster) {
        await uploadToR2(posterUploadUrl, draft.pendingPoster, 'image/jpeg', () => {}, controller.signal);
      }
      if (controller.signal.aborted) return;

      patch(draft.clientId, { status: 'sending' });
      const { data, error: upErr } = await supabase
        .from('messages')
        .update({ upload_status: 'ready' })
        .eq('id', rowId)
        .select(columns())
        .single();
      if (upErr) throw new Error(upErr.message);

      // Set directly rather than through upsert: this is the one moment where
      // the local in-progress state should be dropped, not preserved.
      const saved = toMessage(data as MessageRow);
      setMessages(prev => prev.map(m => (m.clientId === saved.clientId
        ? { ...saved, localPreviewUrl: m.localPreviewUrl, localPosterUrl: m.localPosterUrl }
        : m)));
      if (!newestAt.current || saved.createdAt > newestAt.current) newestAt.current = saved.createdAt;

      // Reconciliation only — the space was already made in step 1.
      finalizeUpload(draft.conversationId)
        .then(state => { if (state.purged > 0) setStorageNotice(purgeNotice(state.purged)); })
        .catch(() => {});
    } catch (e) {
      // A cancelled item: its bubble is gone; make sure its half-made row is too.
      if (controller.signal.aborted) {
        if (createdRow) await deleteRemoteMedia(createdRow).catch(() => {});
        return;
      }
      patch(draft.clientId, {
        status: 'failed',
        error: friendlyError(e, 'Could not send. Tap to retry.'),
      });
    } finally {
      if (uploads.current.get(draft.clientId) === controller) uploads.current.delete(draft.clientId);
    }
  }, [insertRow, patch]);

  const blankDraft = useCallback((conversation: string, sender: string): ChatMessage => ({
    id: crypto.randomUUID(),
    clientId: crypto.randomUUID(),
    conversationId: conversation,
    senderId: sender,
    kind: 'text',
    body: null,
    storageKey: null,
    posterKey: null,
    posterSizeBytes: null,
    mimeType: null,
    sizeBytes: null,
    fileName: null,
    durationSeconds: null,
    readAt: null,
    createdAt: new Date().toISOString(),
    deletedAt: null,
    mediaPurged: false,
    uploadStatus: 'ready',
    status: 'sending',
  }), []);

  const sendText = useCallback(async (body: string) => {
    const trimmed = body.trim();
    if (!trimmed || !conversationId || !userId) return;

    const draft: ChatMessage = { ...blankDraft(conversationId, userId), body: trimmed };
    setMessages(prev => sortByTime([...prev, draft]));
    await sendTextRow(draft);
  }, [conversationId, userId, blankDraft, sendTextRow]);

  /** A media bubble, on screen at once; the video poster and sizes follow. */
  const prepareDraft = useCallback(async (
    conversation: string,
    sender: string,
    file: Blob,
    kind: MediaKind,
    fileName: string,
    durationSeconds: number | undefined,
    album: Pick<ChatMessage, 'albumId' | 'albumIndex' | 'albumSize' | 'albumKind'> | null,
    createdAt?: string,
  ): Promise<ChatMessage> => {
    let draft: ChatMessage = {
      ...blankDraft(conversation, sender),
      ...(album ?? {}),
      ...(createdAt ? { createdAt } : {}),
      kind,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      fileName,
      durationSeconds: durationSeconds ?? null,
      status: 'uploading',
      progress: 0,
      localPreviewUrl: kind === 'image' || kind === 'voice'
        ? trackObjectUrl(URL.createObjectURL(file))
        : undefined,
      pendingFile: file,
    };
    setMessages(prev => sortByTime([...prev, draft]));
    if (kind === 'image') {
      const size = await measureImage(file);
      if (size) {
        draft = { ...draft, mediaWidth: size.width, mediaHeight: size.height };
        patch(draft.clientId, { mediaWidth: size.width, mediaHeight: size.height });
      }
    }
    if (kind === 'video') {
      const probe = await probeVideo(file);
      const poster = probe.poster?.blob;
      const posterUrl = poster ? trackObjectUrl(URL.createObjectURL(poster)) : undefined;
      draft = {
        ...draft,
        durationSeconds: draft.durationSeconds ?? probe.durationSeconds,
        posterSizeBytes: poster?.size ?? null,
        localPosterUrl: posterUrl,
        pendingPoster: poster,
        mediaWidth: probe.poster?.width ?? null,
        mediaHeight: probe.poster?.height ?? null,
      };
      patch(draft.clientId, {
        durationSeconds: draft.durationSeconds,
        posterSizeBytes: draft.posterSizeBytes,
        localPosterUrl: posterUrl,
        pendingPoster: poster,
        mediaWidth: draft.mediaWidth,
        mediaHeight: draft.mediaHeight,
      });
    }
    return draft;
  }, [blankDraft, patch, trackObjectUrl]);

  /**
   * Several photos, videos or files sent together, like a chat app's album:
   * every bubble appears at once, a few upload at a time, each with its own
   * progress, retry and cancel, and the other side gets one notification for
   * the whole album. Before the RC5 migration they are sent one by one.
   */
  const sendMediaBatch = useCallback(async (files: { file: Blob; kind: MediaKind; fileName: string }[]) => {
    if (!conversationId || !userId || !files.length) return;
    if (files.length === 1) {
      const [only] = files;
      const draft = await prepareDraft(conversationId, userId, only.file, only.kind, only.fileName, undefined, null);
      await sendMediaRow(draft);
      return;
    }
    const visual = files.every(f => f.kind === 'image' || f.kind === 'video');
    const albumKind: ChatMessage['albumKind'] = visual
      ? (files.every(f => f.kind === 'image') ? 'photos' : files.every(f => f.kind === 'video') ? 'videos' : 'media')
      : 'files';
    const albumId = albumSchema !== false ? crypto.randomUUID() : null;
    const base = Date.now();
    const drafts = await Promise.all(files.map((f, index) => prepareDraft(
      conversationId, userId, f.file, f.kind, f.fileName, undefined,
      albumId ? { albumId, albumIndex: index, albumSize: files.length, albumKind } : null,
      new Date(base + index).toISOString(),
    )));
    let next = 0;
    const worker = async () => {
      while (next < drafts.length) {
        const draft = drafts[next++];
        await sendMediaRow(draft);
      }
    };
    await Promise.all(Array.from({ length: Math.min(ALBUM_CONCURRENCY, drafts.length) }, worker));
  }, [conversationId, userId, prepareDraft, sendMediaRow]);

  /**
   * Stops one item mid-upload and takes it away, removing its half-made row
   * and anything already stored. The rest of an album carries on.
   */
  const cancelUpload = useCallback(async (clientId: string) => {
    uploads.current.get(clientId)?.abort();
    uploads.current.delete(clientId);
    const target = messagesRef.current.find(m => m.clientId === clientId);
    setMessages(prev => prev.filter(m => m.clientId !== clientId));
    // A row exists once the item is 'pending' with its key; before that there is nothing to remove.
    if (target && target.uploadStatus === 'pending' && target.storageKey) {
      await deleteRemoteMedia(target.id).catch(() => {
        // Left as a pending row: the stale-upload sweep removes it later.
      });
    }
  }, []);

  const sendMedia = useCallback(async (
    file: Blob,
    kind: MediaKind,
    fileName: string,
    durationSeconds?: number,
  ) => {
    if (!conversationId || !userId) return;

    let draft: ChatMessage = {
      ...blankDraft(conversationId, userId),
      kind,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      fileName,
      durationSeconds: durationSeconds ?? null,
      status: 'uploading',
      progress: 0,
      // Renders instantly; revoked when the thread unmounts.
      localPreviewUrl: kind === 'image' || kind === 'voice'
        ? trackObjectUrl(URL.createObjectURL(file))
        : undefined,
      pendingFile: file,
    };
    // The bubble goes up before any of the slow work, so sending always looks
    // immediate — decoding a video frame can take a second or two.
    setMessages(prev => sortByTime([...prev, draft]));

    // Video gets a poster frame and a duration read off the file itself, so
    // the bubble can render without anyone touching the video bytes.
    if (kind === 'video') {
      const probe = await probeVideo(file);
      const poster = probe.poster?.blob;
      const posterUrl = poster ? trackObjectUrl(URL.createObjectURL(poster)) : undefined;
      draft = {
        ...draft,
        durationSeconds: draft.durationSeconds ?? probe.durationSeconds,
        posterSizeBytes: poster?.size ?? null,
        localPosterUrl: posterUrl,
        pendingPoster: poster,
      };
      patch(draft.clientId, {
        durationSeconds: draft.durationSeconds,
        posterSizeBytes: draft.posterSizeBytes,
        localPosterUrl: posterUrl,
        pendingPoster: poster,
      });
    }

    await sendMediaRow(draft);
  }, [conversationId, userId, blankDraft, patch, sendMediaRow, trackObjectUrl]);

  const retry = useCallback(async (clientId: string) => {
    const target = messages.find(m => m.clientId === clientId);
    if (!target || target.status !== 'failed') return;
    if (target.kind === 'text') {
      await sendTextRow({ ...target, status: 'sending', error: undefined });
      return;
    }
    // The file lives in memory only. An upload abandoned in an earlier session
    // has nothing left to send, so say so rather than spinning.
    if (!target.pendingFile) {
      patch(clientId, { error: "This upload can't be resumed — remove it and send the file again." });
      return;
    }
    await sendMediaRow({ ...target, status: 'uploading', error: undefined, progress: 0 });
  }, [messages, patch, sendTextRow, sendMediaRow]);

  const deleteMessage = useCallback(async (message: ChatMessage) => {
    if (message.senderId !== userId) return;
    if (message.deletedAt) {
      if (!message.storageKey || message.mediaPurged) return;
      try { await deleteRemoteMedia(message.id); patch(message.clientId, { mediaPurged: true, storageKey: null }); }
      catch (e) {
        setError(friendlyError(e, 'Could not remove the attachment.'));
        throw e;
      }
      return;
    }

    // Never reached the database — just drop the local bubble.
    if (message.status !== 'sent' && message.uploadStatus !== 'pending') {
      setMessages(prev => prev.filter(m => m.clientId !== message.clientId));
      return;
    }

    // An abandoned upload: remove the row and its object outright, rather than
    // leaving a tombstone for something nobody ever saw.
    if (message.uploadStatus === 'pending') {
      try { await deleteRemoteMedia(message.id); }
      catch (e) {
        setError(friendlyError(e, 'Could not remove the upload.'));
        throw e;
      }
      setMessages(prev => prev.filter(m => m.clientId !== message.clientId));
      return;
    }

    const previous = messages;
    setMessages(prev => prev.map(m =>
      m.id === message.id ? { ...m, deletedAt: new Date().toISOString(), body: null } : m));

    const { error: delErr } = await supabase
      .from('messages')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', message.id);

    if (delErr) {
      setMessages(previous);
      setError(friendlyError(delErr, 'Could not delete the message.'));
      throw delErr;
    }
    if (message.storageKey) {
      try { await deleteRemoteMedia(message.id); patch(message.clientId, { mediaPurged: true, storageKey: null }); }
      catch (e) {
        setError('Message deleted, but attachment cleanup is pending. Use the message menu to retry.');
        throw e;
      }
    }
  }, [messages, userId, patch]);

  const markRead = useCallback(async () => {
    if (!conversationId) return;
    await supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId });
    // The notifications about this conversation are read too, so the unread
    // badge and the count on the next banner are true. Ignored where the
    // function does not exist yet.
    const { data, error: notificationError } = await supabase.rpc('mark_related_notifications_read', { p_conversation_id: conversationId });
    if (!notificationError && Number(data) > 0 && userId) announceNotificationsChanged(userId);
  }, [conversationId, userId]);

  const broadcastTyping = useCallback((isTyping: boolean) => {
    channelRef.current?.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId, isTyping },
    });
  }, [userId]);

  const notifyTyping = useCallback(() => {
    const now = Date.now();
    // At most one broadcast per 1.5s while the user keeps typing.
    if (now - lastTypingSent.current < 1500) return;
    lastTypingSent.current = now;
    broadcastTyping(true);
  }, [broadcastTyping]);

  /** Sent on send/blur so the peer's indicator clears immediately. */
  const stopTyping = useCallback(() => {
    lastTypingSent.current = 0;
    broadcastTyping(false);
  }, [broadcastTyping]);

  const dismissStorageNotice = useCallback(() => setStorageNotice(null), []);

  // Release every object URL this thread minted, on unmount.
  useEffect(() => () => {
    objectUrls.current.forEach(url => URL.revokeObjectURL(url));
    objectUrls.current = [];
  }, []);

  const visible = useMemo(
    () => messages.filter(m => {
      // A deleted message the other side sent leaves nothing to show.
      if (m.deletedAt && m.senderId !== userId && !m.body) return false;
      // Someone else's upload is not a message until its bytes have landed.
      if (m.uploadStatus === 'pending' && m.senderId !== userId) return false;
      return true;
    }),
    [messages, userId],
  );

  return {
    conversationId,
    messages: visible,
    loading,
    error,
    hasMore,
    loadingOlder,
    peerTyping,
    storageNotice,
    dismissStorageNotice,
    loadOlder,
    sendText,
    sendMedia,
    sendMediaBatch,
    cancelUpload,
    retryOpen,
    retry,
    deleteMessage,
    markRead,
    notifyTyping,
    stopTyping,
  };
}
