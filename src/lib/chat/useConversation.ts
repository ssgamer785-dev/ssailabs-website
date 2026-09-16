import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { useAuth } from '../auth-context';
import { probeVideo } from '../media/video-poster';
import { sortByTime, upsertMessage as upsert } from './merge';
import {
  purgeNotice,
  type ChatMessage,
  type ConnectionState,
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
};

const SELECT_COLUMNS =
  'id, conversation_id, sender_id, kind, body, storage_key, poster_key, poster_size_bytes, mime_type, size_bytes, file_name, voice_duration_seconds, read_at, created_at, client_id, deleted_at, media_purged, upload_status';

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
    status: abandoned ? 'failed' : 'sent',
    error: abandoned ? "This upload didn't finish." : undefined,
  };
}

export interface UseConversation {
  conversationId: string | null;
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  connection: ConnectionState;
  /** True while the other side of this thread has the screen open. */
  peerOnline: boolean;
  hasMore: boolean;
  loadingOlder: boolean;
  peerTyping: boolean;
  /** Set when FIFO cleanup freed space; clears when dismissed. */
  storageNotice: string | null;
  dismissStorageNotice: () => void;
  loadOlder: () => Promise<void>;
  sendText: (body: string) => Promise<void>;
  sendMedia: (file: Blob, kind: MediaKind, fileName: string, durationSeconds?: number) => Promise<void>;
  retry: (clientId: string) => Promise<void>;
  deleteMessage: (message: ChatMessage) => Promise<void>;
  markRead: () => Promise<void>;
  notifyTyping: () => void;
  stopTyping: () => void;
}

/**
 * Drives one Student <-> Admin thread: history, pagination, Realtime sync,
 * presence, optimistic sends with retry, read receipts and typing.
 *
 * Pass a conversationId to open a specific thread (admin viewing a student);
 * omit it and the current student's own thread is resolved or created.
 */
export function useConversation(explicitConversationId?: string): UseConversation {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  const [conversationId, setConversationId] = useState<string | null>(explicitConversationId ?? null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<ConnectionState>('connecting');
  const [peerOnline, setPeerOnline] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);
  const [storageNotice, setStorageNotice] = useState<string | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastTypingSent = useRef(0);
  /** Newest server timestamp we hold — the gap-fill anchor after a reconnect. */
  const newestAt = useRef<string | null>(null);
  /** Every object URL this thread minted, so unmount can revoke all of them. */
  const objectUrls = useRef<string[]>([]);

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
    supabase.rpc('get_or_create_my_conversation').then(({ data, error: rpcError }) => {
      if (!active) return;
      if (rpcError) setError(rpcError.message);
      else setConversationId(data as unknown as string);
    });
    return () => { active = false; };
  }, [explicitConversationId, userId]);

  // ---- initial page -------------------------------------------------------

  const loadLatest = useCallback(async (id: string) => {
    const { data, error: qErr } = await supabase
      .from('messages')
      .select(SELECT_COLUMNS)
      .eq('conversation_id', id)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(PAGE_SIZE);

    if (qErr) {
      setError(qErr.message);
      return;
    }
    const rows = ((data ?? []) as MessageRow[]).map(toMessage);
    setHasMore(rows.length === PAGE_SIZE);
    const ordered = sortByTime(rows);
    newestAt.current = ordered.length ? ordered[ordered.length - 1].createdAt : null;
    // Preserve any in-flight optimistic messages across a refetch.
    setMessages(prev => {
      const pending = prev.filter(m => m.status !== 'sent');
      return ordered.reduce(upsert, pending);
    });
  }, []);

  useEffect(() => {
    if (!conversationId) return;
    let active = true;
    setLoading(true);
    loadLatest(conversationId).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [conversationId, loadLatest]);

  const loadOlder = useCallback(async () => {
    if (!conversationId || loadingOlder || !hasMore) return;
    const oldest = messages.find(m => m.status === 'sent');
    if (!oldest) return;

    setLoadingOlder(true);
    const { data, error: qErr } = await supabase
      .from('messages')
      .select(SELECT_COLUMNS)
      .eq('conversation_id', conversationId)
      .lt('created_at', oldest.createdAt)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(PAGE_SIZE);
    setLoadingOlder(false);

    if (qErr) {
      setError(qErr.message);
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
      .select(SELECT_COLUMNS)
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
        config: { broadcast: { self: false }, presence: { key: userId } },
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
      .on('presence', { event: 'sync' }, () => {
        if (!active) return;
        // Anyone in the channel who isn't us is the other side of the thread.
        const others = Object.keys(channel.presenceState()).filter(key => key !== userId);
        setPeerOnline(others.length > 0);
      })
      .subscribe(status => {
        if (!active) return;
        if (status === 'SUBSCRIBED') {
          setConnection('online');
          void channel.track({ userId, onlineAt: new Date().toISOString() });
          if (hadDrop) {
            hadDrop = false;
            void fillGap(conversationId);
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          hadDrop = true;
          setConnection('offline');
          setPeerOnline(false);
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
      })
      .select(SELECT_COLUMNS)
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
        error: e instanceof Error ? e.message : 'Could not send. Tap to retry.',
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
  const sendMediaRow = useCallback(async (draft: ChatMessage) => {
    const file = draft.pendingFile;
    if (!file) return;

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

        draft = { ...draft, storageKey: ticket.storageKey, posterKey: ticket.posterKey ?? null };
        const row = await insertRow(draft, 'pending');
        rowId = row.id;
        draft = { ...draft, id: row.id, createdAt: row.createdAt, uploadStatus: 'pending' };
        setMessages(prev => upsert(prev, { ...draft, status: 'uploading', progress: 0 }));
      }

      await uploadToR2(uploadUrl, file, mimeType, fraction =>
        patch(draft.clientId, { progress: fraction }));

      if (posterUploadUrl && draft.pendingPoster) {
        await uploadToR2(posterUploadUrl, draft.pendingPoster, 'image/jpeg', () => {});
      }

      patch(draft.clientId, { status: 'sending' });
      const { data, error: upErr } = await supabase
        .from('messages')
        .update({ upload_status: 'ready' })
        .eq('id', rowId)
        .select(SELECT_COLUMNS)
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
      patch(draft.clientId, {
        status: 'failed',
        error: e instanceof Error ? e.message : 'Could not send. Tap to retry.',
      });
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

    // Never reached the database — just drop the local bubble.
    if (message.status !== 'sent' && message.uploadStatus !== 'pending') {
      setMessages(prev => prev.filter(m => m.clientId !== message.clientId));
      return;
    }

    // An abandoned upload: remove the row and its object outright, rather than
    // leaving a tombstone for something nobody ever saw.
    if (message.uploadStatus === 'pending') {
      setMessages(prev => prev.filter(m => m.clientId !== message.clientId));
      await deleteRemoteMedia(message.id).catch(() => {});
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
      setError(delErr.message);
      return;
    }
    if (message.storageKey) await deleteRemoteMedia(message.id).catch(() => {});
  }, [messages, userId]);

  const markRead = useCallback(async () => {
    if (!conversationId) return;
    await supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId });
  }, [conversationId]);

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
    connection,
    peerOnline,
    hasMore,
    loadingOlder,
    peerTyping,
    storageNotice,
    dismissStorageNotice,
    loadOlder,
    sendText,
    sendMedia,
    retry,
    deleteMessage,
    markRead,
    notifyTyping,
    stopTyping,
  };
}
