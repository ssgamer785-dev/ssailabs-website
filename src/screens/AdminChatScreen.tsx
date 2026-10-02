import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { css } from '../lib/css';
import { Hoverable } from '../lib/Hoverable';
import { makeRand } from '../lib/rng';
import { useAuth } from '../lib/auth-context';
import { supabase } from '../lib/supabase';
import { useKeyboardInset } from '../lib/useKeyboardInset';
import { useConversation } from '../lib/chat/useConversation';
import { useVoiceRecorder, type VoiceRecording } from '../lib/chat/useVoiceRecorder';
import { formatDuration, type MediaKind } from '../lib/chat/types';
import { PhoneShell } from '../components/PhoneShell';
import { MessageBubble } from '../components/chat/MessageBubble';
import { AlbumBubble } from '../components/chat/AlbumBubble';
import { groupAlbums } from '../lib/chat/albums';
import { AppBackButton } from '../components/ui/AppBackButton';
import logo from '../assets/traders-planet-mark.png';
import { Avatar } from '../components/ui/Avatar';
import { normalizePickedFile } from '../lib/media/file-types';
import { PortableImageError, toPortableImage } from '../lib/media/portable-image';
import { PresenceIndicator, usePresence } from '../lib/presence/usePresence';

function Wave({ bars, color, height, gap, seed }: { bars: number; color: string; height: number; gap: number; seed: number }) {
  const rand = makeRand(seed);
  const els: ReactNode[] = [];
  for (let i = 0; i < bars; i++) {
    const h = Math.max(3, Math.round((0.28 + rand() * 0.72) * height));
    els.push(<div key={i} style={{ width: 2, height: h, borderRadius: 2, background: color, flex: 'none' }} />);
  }
  return <div style={{ display: 'flex', alignItems: 'center', gap, height, flex: 1, overflow: 'hidden' }}>{els}</div>;
}

/** Three-dot "typing" bubble, styled like an incoming message. */
function TypingBubble({ incomingIsAdmin, peerName, peerAvatarKey }: { incomingIsAdmin: boolean; peerName: string; peerAvatarKey: string | null }) {
  return (
    <div style={css('display:flex;align-items:flex-end;gap:9px')}>
      {incomingIsAdmin
        ? <div style={css('width:30px;height:30px;border-radius:50%;background:var(--ink-chip);display:flex;align-items:center;justify-content:center;flex:none')}><img src={logo} alt="Admin" style={css('width:24px;height:24px;object-fit:contain')} /></div>
        : <Avatar name={peerName} avatarKey={peerAvatarKey} size={30} fontSize={12} />}
      <div style={css('background:var(--surface-secondary-2);border-radius:16px 16px 16px 5px;padding:13px 15px;display:flex;align-items:center;gap:4px')}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--neutral-fill)', animation: `tp-blink 1.2s ${i * 0.18}s infinite ease-in-out` }} />
        ))}
      </div>
      <style>{'@keyframes tp-blink{0%,80%,100%{opacity:.3}40%{opacity:1}}'}</style>
    </div>
  );
}

/** Maps a picked file to the attachment kind the backend expects. */
/** Files in one chat send (the database holds albums of up to 50). */
const MAX_ALBUM = 30;

function kindForFile(file: File): MediaKind | null {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type === 'application/pdf') return 'pdf';
  if (/^(application\/(msword|vnd\.|zip|x-zip-compressed)|text\/(plain|csv))/.test(file.type)) return 'file';
  return null;
}

/** Admins need a member thread; never create a conversation with themselves. */
export function AdminChatRoute() {
  const { isAdmin } = useAuth();
  const [params] = useSearchParams();
  if (isAdmin && !params.get('c')) return <Navigate to="/admin-inbox" replace />;
  return <AdminChatScreen />;
}

export function AdminChatScreen() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [params] = useSearchParams();
  const conversationId = params.get('c');
  const targetMessageId = params.get('m');
  // Admins open a specific student's thread via ?c=<id>; students get their own.
  const chat = useConversation(conversationId ?? undefined);
  // A notification can lead to a conversation that no longer exists (or that
  // this admin cannot read); say so instead of offering to start one.
  const [threadMissing, setThreadMissing] = useState(false);
  const chatReady = !!chat.conversationId && !chat.loading && !threadMissing;
  const [peer, setPeer] = useState<{ id: string; name: string; avatarKey: string | null } | null>(null);
  useEffect(() => {
    if (!isAdmin || !conversationId) { setPeer(null); setThreadMissing(false); return; }
    let active = true;
    setThreadMissing(false);
    // Just this thread's member: it used to load every member's conversation
    // summary (admin_conversations) to find one name.
    void (async () => {
      const { data: conv } = await supabase.from('conversations').select('student_id').eq('id', conversationId).maybeSingle();
      if (!active || !conv?.student_id) { if (active) { setPeer(null); setThreadMissing(true); } return; }
      const { data: profile } = await supabase.from('profiles').select('full_name, avatar_key').eq('id', conv.student_id).maybeSingle();
      if (!active) return;
      setPeer(profile ? { id: conv.student_id, name: profile.full_name, avatarKey: profile.avatar_key } : null);
    })();
    return () => { active = false; };
  }, [isAdmin, conversationId]);
  const recorder = useVoiceRecorder();
  const keyboardInset = useKeyboardInset();

  const [msg, setMsg] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [voicePreview, setVoicePreview] = useState<{ clip: VoiceRecording; url: string } | null>(null);
  const [sendingVoice, setSendingVoice] = useState(false);
  useEffect(() => () => { if (voicePreview) URL.revokeObjectURL(voicePreview.url); }, [voicePreview]);
  const fileInput = useRef<HTMLInputElement>(null);
  /** Several picked files wait here to be checked before they are sent, as in a chat app. */
  const [picked, setPicked] = useState<{ id: string; file: File; kind: MediaKind; previewUrl: string | null }[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  /** Height before prepending an older page, so we can restore the position. */
  const restoreHeight = useRef<number | null>(null);
  const targetPages = useRef(0);
  const targetReached = useRef(false);

  const presence = usePresence(isAdmin
    ? (peer ? [{ kind: 'student' as const, userId: peer.id }] : [])
    : [{ kind: 'admin' as const }]);
  const peerPresence = presence[isAdmin ? peer?.id ?? '' : 'admin'] ?? 'unknown';
  const { messages, markRead, loadOlder, hasMore, loadingOlder, peerTyping } = chat;

  useEffect(() => { targetPages.current = 0; targetReached.current = false; }, [targetMessageId]);
  useEffect(() => {
    if (!targetMessageId || chat.loading) return;
    if (messages.some(message => message.id === targetMessageId)) {
      if (targetReached.current) return;
      targetReached.current = true;
      document.getElementById(`message-${targetMessageId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } else if (hasMore && !loadingOlder && targetPages.current < 25) {
      targetPages.current++;
      void loadOlder();
    } else if ((!hasMore || targetPages.current >= 25) && !loadingOlder) {
      setNotice('This message is no longer available.');
    }
  }, [targetMessageId, chat.loading, messages, hasMore, loadingOlder, loadOlder]);

  // Keep the newest message in view, but never yank the user out of history.
  useEffect(() => {
    if (atBottom.current) bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, peerTyping]);

  // After older messages prepend, hold the reading position steady.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || restoreHeight.current === null) return;
    el.scrollTop = el.scrollHeight - restoreHeight.current;
    restoreHeight.current = null;
  }, [messages.length]);

  // Read receipts only while the thread is actually on screen: messages that
  // arrive while the app is in the background stay unread until it returns.
  useEffect(() => {
    if (document.visibilityState === 'visible') void markRead();
    const onVisible = () => { if (document.visibilityState === 'visible') void markRead(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [markRead, messages.length]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (el.scrollTop < 60 && hasMore && !loadingOlder) {
      restoreHeight.current = el.scrollHeight;
      void loadOlder();
    }
  }, [hasMore, loadingOlder, loadOlder]);

  async function handleSendText() {
    const body = msg.trim();
    if (!body || !chatReady) return;
    setMsg('');
    chat.stopTyping();
    atBottom.current = true;
    await chat.sendText(body);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const chosen = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!chosen.length || !chatReady) return;
    const ready: { id: string; file: File; kind: MediaKind; previewUrl: string | null }[] = [];
    const problems: string[] = [];
    for (const raw of chosen.slice(0, MAX_ALBUM - picked.length)) {
      let file = normalizePickedFile(raw);
      try { file = await toPortableImage(file); }
      catch (error) {
        if (error instanceof PortableImageError) { problems.push(`${raw.name}: ${error.message}`); continue; }
        throw error;
      }
      const kind = kindForFile(file);
      if (!kind) { problems.push(`${raw.name}: that file type cannot be attached.`); continue; }
      ready.push({ id: crypto.randomUUID(), file, kind, previewUrl: kind === 'image' ? URL.createObjectURL(file) : null });
    }
    if (chosen.length > MAX_ALBUM - picked.length) problems.push(`Up to ${MAX_ALBUM} at a time; the rest were not added.`);
    setNotice(problems.length ? problems.join(' ') : null);
    if (!ready.length) return;
    // One file goes straight out, as it always did; several are shown first.
    if (!picked.length && ready.length === 1) {
      const [only] = ready;
      if (only.previewUrl) URL.revokeObjectURL(only.previewUrl);
      atBottom.current = true;
      await chat.sendMedia(only.file, only.kind, only.file.name);
      return;
    }
    setPicked(prev => [...prev, ...ready]);
  }

  function discardPicked(id?: string) {
    setPicked(prev => {
      for (const item of prev) if ((!id || item.id === id) && item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return id ? prev.filter(item => item.id !== id) : [];
    });
  }

  function movePicked(id: string, by: number) {
    setPicked(prev => {
      const from = prev.findIndex(item => item.id === id);
      const to = from + by;
      if (from < 0 || to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  async function sendPicked() {
    if (!picked.length || !chatReady) return;
    const batch = picked.map(item => ({ file: item.file as Blob, kind: item.kind, fileName: item.file.name }));
    // The previews are not needed once the bubbles (with their own previews) exist.
    discardPicked();
    atBottom.current = true;
    await chat.sendMediaBatch(batch);
  }

  async function handleMic() {
    if (!chatReady) return;
    if (!recorder.recording) {
      await recorder.start();
      return;
    }
    const clip = await recorder.stop();
    if (!clip) return;
    setVoicePreview({ clip, url: URL.createObjectURL(clip.blob) });
  }

  async function sendVoicePreview() {
    if (!voicePreview || sendingVoice || !chatReady) return;
    setSendingVoice(true);
    const extension = /mp4/i.test(voicePreview.clip.mimeType) ? 'm4a' : /aac/i.test(voicePreview.clip.mimeType) ? 'aac' : /ogg/i.test(voicePreview.clip.mimeType) ? 'ogg' : 'webm';
    try {
      atBottom.current = true;
      await chat.sendMedia(voicePreview.clip.blob, 'voice', `voice-note.${extension}`, voicePreview.clip.durationSeconds);
      setVoicePreview(null);
    } finally { setSendingVoice(false); }
  }

  // Typing is transient conversation state; account online/offline state is
  // resolved independently by the authenticated account Presence topic.
  const subtitleColor = peerTyping ? 'var(--accent-ink)' : 'var(--text-faint)';

  function MicBtn({ size = 40 }: { size?: number }) {
    const on = recorder.recording;
    return (
      <div onClick={chatReady ? handleMic : undefined} title="Record a voice message" aria-disabled={!chatReady} style={{ width: size, height: size, borderRadius: '50%', flex: 'none', cursor: chatReady ? 'pointer' : 'default', opacity: chatReady ? 1 : .45, display: 'flex', alignItems: 'center', justifyContent: 'center', background: on ? 'var(--danger)' : 'var(--surface-secondary)', boxShadow: on ? '0 0 0 4px rgba(239,68,68,.16)' : 'none' }}>
        <svg width={Math.round(size * 0.44)} height={Math.round(size * 0.44)} viewBox="0 0 24 24" fill="none" stroke={on ? 'var(--on-accent)' : 'var(--text-muted)'} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
          <rect x={9} y={3.2} width={6} height={10.4} rx={3} />
          <path d="M5.6 11.4a6.4 6.4 0 0 0 12.8 0M12 17.8v3M8.8 20.8h6.4" />
        </svg>
      </div>
    );
  }

  return (
    <PhoneShell scrollRef={scrollRef}>
      <div style={css('flex:none;height:58px;display:flex;align-items:center;padding:0 18px;gap:11px;border-bottom:1px solid var(--border)')}>
        <AppBackButton fallback="/chat" />
        <div style={css('position:relative;flex:none')}>
          {isAdmin
            ? <Avatar name={peer?.name ?? 'Member'} avatarKey={peer?.avatarKey} size={38} fontSize={14} />
            : <div style={css('width:38px;height:38px;border-radius:50%;background:var(--ink-chip);display:flex;align-items:center;justify-content:center')}><img src={logo} alt="Admin" style={css('width:31px;height:31px;object-fit:contain')} /></div>}
          <div aria-hidden="true" style={{ position: 'absolute', right: -1, bottom: -1, width: 11, height: 11, borderRadius: '50%', background: peerPresence === 'online' ? 'var(--success)' : peerPresence === 'offline' ? 'var(--neutral-fill-2)' : 'var(--text-faint)', border: '2.2px solid var(--border-on-accent)' }} />
        </div>
        <div style={css('flex:1;display:flex;flex-direction:column;gap:1px;min-width:0')}>
          <div style={css('font-size:15px;font-weight:700;letter-spacing:-.25px')}>{isAdmin ? peer?.name ?? 'Member' : 'Admin'}</div>
          {peerTyping
            ? <div style={{ fontSize: 11.5, fontWeight: 600, color: subtitleColor }}>typing…</div>
            : <PresenceIndicator status={peerPresence} />}
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        style={css('flex:1;min-height:0;padding:16px 18px 0;display:flex;flex-direction:column;gap:14px;overflow-y:auto;background:var(--surface-2);overscroll-behavior:contain;-webkit-overflow-scrolling:touch')}
      >
        {loadingOlder && (
          <div style={css('flex:none;text-align:center;font-size:11px;color:var(--text-faint);padding:2px 0')}>Loading earlier messages…</div>
        )}
        {chat.loading ? (
          <div style={css('flex:1;display:flex;align-items:center;justify-content:center;font-size:12.5px;color:var(--text-faint)')}>Loading chat…</div>
        ) : !chat.conversationId && chat.error ? (
          <div role="alert" style={css('flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;text-align:center;padding:24px;color:var(--danger-ink);font-size:12.5px')}>
            <span>{chat.error}</span>
            <button type="button" onClick={chat.retryOpen} style={css('padding:9px 18px;border-radius:10px;background:var(--accent);color:var(--on-accent);font-weight:700;cursor:pointer')}>Retry opening chat</button>
          </div>
        ) : threadMissing ? (
          <div role="status" style={css('flex:1;display:flex;align-items:center;justify-content:center;text-align:center;font-size:12.5px;color:var(--text-muted);line-height:1.5;padding:0 30px')}>
            This conversation is no longer available. It may have been removed, or you may not have access to it.
          </div>
        ) : messages.length === 0 ? (
          <div style={css('flex:1;display:flex;align-items:center;justify-content:center;text-align:center;font-size:12.5px;color:var(--text-faint);line-height:1.5;padding:0 30px')}>
            {isAdmin ? 'No messages yet. Start a conversation with this member.' : 'No messages yet. Say hello to the Admin — they usually reply within a few hours.'}
          </div>
        ) : (
          groupAlbums(messages).map(entry => entry.type === 'album' ? (
            <AlbumBubble
              key={entry.key}
              messages={entry.messages}
              out={entry.messages[0].senderId === user?.id}
              incomingIsAdmin={!isAdmin}
              incomingName={peer?.name ?? 'Member'}
              incomingAvatarKey={peer?.avatarKey ?? null}
              onRetry={clientId => { void chat.retry(clientId); }}
              onCancel={clientId => { void chat.cancelUpload(clientId); }}
              onDeleteAll={async () => { for (const m of entry.messages) await chat.deleteMessage(m); }}
            />
          ) : (
            <MessageBubble
              key={entry.key}
              message={entry.message}
              highlighted={entry.message.id === targetMessageId}
              out={entry.message.senderId === user?.id}
              incomingIsAdmin={!isAdmin}
              incomingName={peer?.name ?? 'Member'}
              incomingAvatarKey={peer?.avatarKey ?? null}
              onRetry={() => chat.retry(entry.message.clientId)}
              onDelete={() => chat.deleteMessage(entry.message)}
            />
          ))
        )}
        {peerTyping && <TypingBubble incomingIsAdmin={!isAdmin} peerName={peer?.name ?? 'Member'} peerAvatarKey={peer?.avatarKey ?? null} />}
        <div ref={bottomRef} />
        <div style={css('flex:1')} />
      </div>

      {chat.storageNotice && (
        <div
          onClick={chat.dismissStorageNotice}
          style={css('flex:none;margin:0 14px 6px;padding:9px 12px;border-radius:11px;background:var(--warning-soft-2);border:1px solid var(--warning-border-2);display:flex;align-items:center;gap:9px;cursor:pointer')}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--warning-ink-2)" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" style={css('flex:none')}>
            <path d="M12 8.4v4.4M12 16.4h.01" /><circle cx="12" cy="12" r="8.6" />
          </svg>
          <div style={css('flex:1;font-size:11.5px;color:var(--warning-ink-4);line-height:1.4')}>{chat.storageNotice}</div>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--warning-ink-2)" strokeWidth={2.4} strokeLinecap="round" style={css('flex:none')}><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></svg>
        </div>
      )}

      {(notice || (chat.conversationId && chat.error)) && (
        <div style={css('flex:none;padding:6px 18px;font-size:11.5px;color:var(--danger-ink);text-align:center;line-height:1.4')}>
          {notice ?? chat.error}
        </div>
      )}

      <input
        ref={fileInput}
        type="file"
        disabled={!chatReady}
        accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.odt,.ods,.odp,.zip,.txt,.csv"
        multiple
        onChange={handleFile}
        style={{ display: 'none' }}
      />

      {picked.length > 0 && (
        <div role="region" aria-label="Attachments to send" style={css('flex:none;padding:10px 14px 4px;background:var(--surface);border-top:1px solid var(--border);display:flex;flex-direction:column;gap:8px')}>
          <div style={css('display:flex;gap:8px;overflow-x:auto;padding-bottom:4px')}>
            {picked.map((item, index) => (
              <div key={item.id} style={css('flex:none;width:76px;display:flex;flex-direction:column;gap:4px')}>
                <div style={css('position:relative;width:76px;height:76px;border-radius:10px;overflow:hidden;background:var(--surface-sunken-2)')}>
                  {item.previewUrl
                    ? <img src={item.previewUrl} alt="" style={css('width:100%;height:100%;object-fit:cover')} />
                    : <div style={css('width:100%;height:100%;display:flex;align-items:center;justify-content:center;padding:6px;font-size:9.5px;color:var(--text-faint);text-align:center;word-break:break-word')}>{item.kind === 'video' ? '🎬 ' : ''}{item.file.name}</div>}
                  <button type="button" onClick={() => discardPicked(item.id)} aria-label={`Remove ${item.file.name}`}
                    style={css('position:absolute;top:4px;right:4px;width:22px;height:22px;border-radius:50%;background:var(--ink-chip);display:flex;align-items:center;justify-content:center;cursor:pointer')}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--on-accent)" strokeWidth={2.8} strokeLinecap="round"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></svg>
                  </button>
                </div>
                {picked.length > 1 && <div style={css('display:flex;justify-content:space-between')}>
                  <button type="button" disabled={index === 0} onClick={() => movePicked(item.id, -1)} aria-label={`Move ${item.file.name} earlier`} style={{ ...css('min-width:28px;min-height:22px;border-radius:6px;background:var(--surface-secondary)'), opacity: index === 0 ? 0.35 : 1 }}>‹</button>
                  <button type="button" disabled={index === picked.length - 1} onClick={() => movePicked(item.id, 1)} aria-label={`Move ${item.file.name} later`} style={{ ...css('min-width:28px;min-height:22px;border-radius:6px;background:var(--surface-secondary)'), opacity: index === picked.length - 1 ? 0.35 : 1 }}>›</button>
                </div>}
              </div>
            ))}
          </div>
          <div style={css('display:flex;align-items:center;gap:10px')}>
            <button type="button" onClick={() => fileInput.current?.click()} style={css('font-size:12px;font-weight:700;color:var(--accent-ink)')}>+ Add more</button>
            <div style={css('flex:1')} />
            <button type="button" onClick={() => discardPicked()} style={css('font-size:12px;font-weight:700;color:var(--danger-ink)')}>Cancel</button>
            <button type="button" onClick={() => void sendPicked()} disabled={!chatReady}
              style={css('padding:9px 14px;border-radius:10px;background:var(--accent);color:var(--on-accent);font-size:12.5px;font-weight:700;cursor:pointer')}>
              Send {picked.length}
            </button>
          </div>
        </div>
      )}

      {voicePreview ? (
        <div style={{ ...css('flex:none;display:flex;align-items:center;gap:8px;padding:12px 18px;background:var(--surface)'), paddingBottom: `calc(24px + env(safe-area-inset-bottom, 0px) + ${keyboardInset}px)` }}>
          <button type="button" onClick={() => setVoicePreview(null)} disabled={sendingVoice} style={css('color:var(--danger-ink);font-size:12px;font-weight:700')}>Cancel</button>
          <audio controls preload="metadata" src={voicePreview.url} style={css('flex:1;min-width:0;height:42px')} />
          <button type="button" onClick={() => void sendVoicePreview()} disabled={sendingVoice} style={css('padding:10px 12px;border-radius:10px;background:var(--accent);color:var(--on-accent);font-size:12px;font-weight:700')}>{sendingVoice ? 'Sending…' : 'Send'}</button>
        </div>
      ) : !recorder.recording ? (
        <div style={{ ...css('flex:none;display:flex;align-items:center;gap:9px;background:var(--surface)'), padding: '12px 18px', paddingBottom: `calc(24px + env(safe-area-inset-bottom, 0px) + ${keyboardInset}px)` }}>
          <div onClick={chatReady ? () => fileInput.current?.click() : undefined} aria-disabled={!chatReady} style={css(`width:38px;height:38px;border-radius:50%;background:var(--surface-secondary);display:flex;align-items:center;justify-content:center;cursor:${chatReady ? 'pointer' : 'default'};opacity:${chatReady ? 1 : .45};flex:none`)}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={2.1} strokeLinecap="round"><path d="M12 6v12M6 12h12" /></svg>
          </div>
          <div style={css('flex:1;min-width:0;height:44px;border-radius:999px;background:var(--surface-secondary);display:flex;align-items:center;padding:0 16px')}>
            <input
              placeholder="Type a message..."
              disabled={!chatReady}
              value={msg}
              onChange={e => { setMsg(e.target.value); chat.notifyTyping(); }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void handleSendText(); } }}
              onBlur={() => chat.stopTyping()}
              style={css('flex:1;min-width:0;font-size:14px;height:100%')}
            />
          </div>
          <MicBtn />
          <Hoverable onClick={chatReady ? handleSendText : undefined} aria-disabled={!chatReady} style={css(`width:44px;height:44px;border-radius:50%;background:var(--accent);box-shadow:0 6px 16px rgba(11,95,239,.32);display:flex;align-items:center;justify-content:center;cursor:${chatReady ? 'pointer' : 'default'};opacity:${chatReady ? 1 : .45};flex:none`)} hoverStyle={css('background:var(--accent-hover)')}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="var(--on-accent)" style={css('margin-left:-1px')}><path d="M20.8 3.2 3.9 9.9c-.7.3-.6 1.3.1 1.5l6.3 1.9 1.9 6.3c.2.7 1.2.8 1.5.1z" /></svg>
          </Hoverable>
        </div>
      ) : (
        <div style={{ ...css('flex:none;display:flex;align-items:center;gap:9px;background:var(--surface)'), padding: '12px 18px', paddingBottom: `calc(24px + env(safe-area-inset-bottom, 0px) + ${keyboardInset}px)` }}>
          <Hoverable onClick={recorder.cancel} style={css('width:38px;height:38px;border-radius:50%;background:var(--danger-soft);display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none')} hoverStyle={css('background:var(--danger-soft-4)')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--danger-ink)" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M5.6 7.4h12.8M9.4 7.4V5.2h5.2v2.2M7.2 7.4l.9 12h7.8l.9-12" /></svg>
          </Hoverable>
          <div style={css('flex:1;height:44px;border-radius:999px;background:var(--danger-soft-2);border:1px solid var(--danger-border);display:flex;align-items:center;padding:0 14px;gap:10px;min-width:0')}>
            <div style={css('width:8px;height:8px;border-radius:50%;background:var(--danger);flex:none')} />
            <div style={css('font-size:12.5px;font-weight:700;color:var(--danger-ink);flex:none;white-space:nowrap')}>{formatDuration(recorder.seconds)}</div>
            <Wave bars={34} color="rgba(239,68,68,.55)" height={22} gap={2.6} seed={91} />
            <div style={css('font-size:11px;color:var(--text-faint);flex:none;white-space:nowrap')}>Recording</div>
          </div>
          <MicBtn />
          <Hoverable onClick={handleMic} style={css('width:44px;height:44px;border-radius:50%;background:var(--accent);box-shadow:0 6px 16px rgba(11,95,239,.32);display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none')} hoverStyle={css('background:var(--accent-hover)')}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="var(--on-accent)" style={css('margin-left:-1px')}><path d="M20.8 3.2 3.9 9.9c-.7.3-.6 1.3.1 1.5l6.3 1.9 1.9 6.3c.2.7 1.2.8 1.5.1z" /></svg>
          </Hoverable>
        </div>
      )}
      {recorder.error && (
        <div style={css('flex:none;padding:0 18px 12px;font-size:11.5px;color:var(--danger-ink);text-align:center')}>{recorder.error}</div>
      )}
    </PhoneShell>
  );
}
