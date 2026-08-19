import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../supabase';
import { useAuth } from '../auth-context';
import type { ChatMessage, ConnectionState, MediaKind, MessageKind } from './types';
import { deleteRemoteMedia, finalizeUpload, requestUploadUrl, uploadToR2 } from './media-api';

const PAGE_SIZE = 30;
const TYPING_TIMEOUT_MS = 3500;

type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  kind: MessageKind;
  body: string | null;
  storage_key: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  file_name: string | null;
  voice_duration_seconds: number | null;
  read_at: string | null;
  created_at: string;
  client_id: string | null;
  deleted_at: string | null;
  media_purged: boolean | null;
};

const SELECT_COLUMNS =
  'id, conversation_id, sender_id, kind, body, storage_key, mime_type, size_bytes, file_name, voice_duration_seconds, read_at, created_at, client_id, deleted_at, media_purged';

function toMessage(row: MessageRow): ChatMessage {
  return {
    id: row.id,
    clientId: row.client_id ?? row.id,
    conversationId: row.conversation_id,
    senderId: row.sender_id,
    kind: row.kind,
    body: row.body,
    storageKey: row.storage_key,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    fileName: row.file_name,
    voiceDurationSeconds: row.voice_duration_seconds,
    readAt: row.read_at,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    mediaPurged: !!row.media_purged,
    status: 'sent',
  };
}

function sortByTime(list: ChatMessage[]): ChatMessage[] {
  return [...list].sort((a, b) => {
    const d = a.createdAt.localeCompare(b.createdAt);
    return d !== 0 ? d : a.clientId.localeCompare(b.clientId);
  });
}

/** Merges a confirmed row in, replacing its optimistic twin if one is present. */
function upsert(list: ChatMessage[], incoming: ChatMessage): ChatMessage[] {
  const idx = list.findIndex(m => m.clientId === incoming.clientId || m.id === incoming.id);
  if (idx === -1) return sortByTime([...list, incoming]);
  const next = [...list];
  // Keep the local preview so an image doesn't flicker while its signed URL loads.
  next[idx] = { ...incoming, localPreviewUrl: next[idx].localPreviewUrl };
  return sortByTime(next);
}

export interface UseConversation {
  conversationId: string | null;
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  connection: ConnectionState;
  hasMore: boolean;
  loadingOlder: boolean;
  peerTyping: boolean;
  loadOlder: () => Promise<void>;
  sendText: (body: string) => Promise<void>;
  sendMedia: (file: Blob, kind: MediaKind, fileName: string, durationSeconds?: number) => Promise<void>;
  retry: (clientId: string) => Promise<void>;
  deleteMessage: (message: ChatMessage) => Promise<void>;
  markRead: () => Promise<void>;
  notifyTyping: () => void;
}

/**
 * Drives one Student <-> Admin thread: history, pagination, Realtime sync,
 * optimistic sends with retry, read receipts and typing.
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
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [peerTyping, setPeerTyping] = useState(false);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastTypingSent = useRef(0);
  /** Newest server timestamp we hold — the gap-fill anchor after a reconnect. */
  const newestAt = useRef<string | null>(null);

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
      return sortByTime([...ordered, ...pending]);
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
    if (rows.length) setMessages(prev => sortByTime([...rows, ...prev]));
  }, [conversationId, hasMore, loadingOlder, messages]);

  // ---- realtime + reconnection -------------------------------------------

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
      .channel(`chat:${conversationId}`, { config: { broadcast: { self: false } } })
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
          setConnection('online');
          if (hadDrop) {
            hadDrop = false;
            void fillGap(conversationId);
          }
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          hadDrop = true;
          setConnection('offline');
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

  const insertRow = useCallback(async (draft: ChatMessage) => {
    const { data, error: insErr } = await supabase
      .from('messages')
      .insert({
        conversation_id: draft.conversationId,
        sender_id: draft.senderId,
        kind: draft.kind,
        body: draft.body,
        client_id: draft.clientId,
        storage_key: draft.storageKey,
        mime_type: draft.mimeType,
        size_bytes: draft.sizeBytes,
        file_name: draft.fileName,
        voice_duration_seconds: draft.voiceDurationSeconds,
      })
      .select(SELECT_COLUMNS)
      .single();

    if (insErr) throw new Error(insErr.message);
    return toMessage(data as MessageRow);
  }, []);

  const runSend = useCallback(async (draft: ChatMessage) => {
    try {
      if (draft.pendingFile && draft.kind !== 'text') {
        patch(draft.clientId, { status: 'uploading', progress: 0, error: undefined });
        const ticket = await requestUploadUrl({
          conversationId: draft.conversationId,
          kind: draft.kind as MediaKind,
          mimeType: draft.mimeType || 'application/octet-stream',
          sizeBytes: draft.pendingFile.size,
        });
        await uploadToR2(
          ticket.uploadUrl,
          draft.pendingFile,
          draft.mimeType || 'application/octet-stream',
          fraction => patch(draft.clientId, { progress: fraction }),
        );
        draft = { ...draft, storageKey: ticket.storageKey };
        patch(draft.clientId, { storageKey: ticket.storageKey, status: 'sending' });
      }

      const saved = await insertRow(draft);
      setMessages(prev => upsert(prev, { ...saved, localPreviewUrl: draft.localPreviewUrl }));
      if (!newestAt.current || saved.createdAt > newestAt.current) newestAt.current = saved.createdAt;

      // Quota is enforced after the row exists so the new object is counted.
      if (draft.storageKey) await finalizeUpload(draft.conversationId).catch(() => {});
    } catch (e) {
      patch(draft.clientId, {
        status: 'failed',
        error: e instanceof Error ? e.message : 'Could not send. Tap to retry.',
      });
    }
  }, [insertRow, patch]);

  const sendText = useCallback(async (body: string) => {
    const trimmed = body.trim();
    if (!trimmed || !conversationId || !userId) return;

    const draft: ChatMessage = {
      id: crypto.randomUUID(),
      clientId: crypto.randomUUID(),
      conversationId,
      senderId: userId,
      kind: 'text',
      body: trimmed,
      storageKey: null,
      mimeType: null,
      sizeBytes: null,
      fileName: null,
      voiceDurationSeconds: null,
      readAt: null,
      createdAt: new Date().toISOString(),
      deletedAt: null,
      mediaPurged: false,
      status: 'sending',
    };
    setMessages(prev => sortByTime([...prev, draft]));
    await runSend(draft);
  }, [conversationId, userId, runSend]);

  const sendMedia = useCallback(async (
    file: Blob,
    kind: MediaKind,
    fileName: string,
    durationSeconds?: number,
  ) => {
    if (!conversationId || !userId) return;

    const draft: ChatMessage = {
      id: crypto.randomUUID(),
      clientId: crypto.randomUUID(),
      conversationId,
      senderId: userId,
      kind,
      body: null,
      storageKey: null,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      fileName,
      voiceDurationSeconds: durationSeconds ?? null,
      readAt: null,
      createdAt: new Date().toISOString(),
      deletedAt: null,
      mediaPurged: false,
      status: 'uploading',
      progress: 0,
      // Renders instantly; revoked when the thread unmounts.
      localPreviewUrl: kind === 'image' || kind === 'video' || kind === 'voice'
        ? URL.createObjectURL(file)
        : undefined,
      pendingFile: file,
    };
    setMessages(prev => sortByTime([...prev, draft]));
    await runSend(draft);
  }, [conversationId, userId, runSend]);

  const retry = useCallback(async (clientId: string) => {
    const target = messages.find(m => m.clientId === clientId);
    if (!target || target.status !== 'failed') return;
    // Start over from the upload — a half-finished PUT leaves no usable object.
    await runSend({ ...target, storageKey: null, status: 'sending', error: undefined, progress: 0 });
  }, [messages, runSend]);

  const deleteMessage = useCallback(async (message: ChatMessage) => {
    if (message.senderId !== userId) return;

    // Never persisted — just drop the local bubble.
    if (message.status === 'failed' || message.status === 'sending' || message.status === 'uploading') {
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
      setError(delErr.message);
      return;
    }
    if (message.storageKey) await deleteRemoteMedia(message.id).catch(() => {});
  }, [messages, userId]);

  const markRead = useCallback(async () => {
    if (!conversationId) return;
    await supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId });
  }, [conversationId]);

  const notifyTyping = useCallback(() => {
    const now = Date.now();
    // At most one broadcast per 1.5s while the user keeps typing.
    if (now - lastTypingSent.current < 1500) return;
    lastTypingSent.current = now;
    channelRef.current?.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId, isTyping: true },
    });
  }, [userId]);

  // Release object URLs for optimistic previews on unmount.
  useEffect(() => () => {
    messages.forEach(m => { if (m.localPreviewUrl) URL.revokeObjectURL(m.localPreviewUrl); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visible = useMemo(
    () => messages.filter(m => !(m.deletedAt && m.senderId !== userId && !m.body)),
    [messages, userId],
  );

  return {
    conversationId,
    messages: visible,
    loading,
    error,
    connection,
    hasMore,
    loadingOlder,
    peerTyping,
    loadOlder,
    sendText,
    sendMedia,
    retry,
    deleteMessage,
    markRead,
    notifyTyping,
  };
}
