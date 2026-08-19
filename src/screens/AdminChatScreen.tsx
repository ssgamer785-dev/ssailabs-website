import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { css } from '../lib/css';
import { Hoverable } from '../lib/Hoverable';
import { makeRand } from '../lib/rng';
import { useAuth } from '../lib/auth-context';
import { useConversation } from '../lib/chat/useConversation';
import { useVoiceRecorder } from '../lib/chat/useVoiceRecorder';
import { formatDuration, type MediaKind } from '../lib/chat/types';
import { StatusBar } from '../components/StatusBar';
import { PhoneShell } from '../components/PhoneShell';
import { MessageBubble } from '../components/chat/MessageBubble';

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
function TypingBubble() {
  return (
    <div style={css('display:flex;align-items:flex-end;gap:9px')}>
      <div style={css('width:30px;height:30px;border-radius:50%;background:#DCE7F7;color:#29527F;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex:none')}>A</div>
      <div style={css('background:#F4F6FA;border-radius:16px 16px 16px 5px;padding:13px 15px;display:flex;align-items:center;gap:4px')}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: '#94A3B8', animation: `tp-blink 1.2s ${i * 0.18}s infinite ease-in-out` }} />
        ))}
      </div>
      <style>{'@keyframes tp-blink{0%,80%,100%{opacity:.3}40%{opacity:1}}'}</style>
    </div>
  );
}

/** Maps a picked file to the attachment kind the backend expects. */
function kindForFile(file: File): MediaKind | null {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type === 'application/pdf') return 'pdf';
  return null;
}

export function AdminChatScreen() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params] = useSearchParams();
  // Admins open a specific student's thread via ?c=<id>; students get their own.
  const chat = useConversation(params.get('c') ?? undefined);
  const recorder = useVoiceRecorder();

  const [msg, setMsg] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  /** Height before prepending an older page, so we can restore the position. */
  const restoreHeight = useRef<number | null>(null);

  const { messages, markRead, loadOlder, hasMore, loadingOlder, peerTyping, connection } = chat;

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

  useEffect(() => { void markRead(); }, [markRead, messages.length]);

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
    if (!body) return;
    setMsg('');
    atBottom.current = true;
    await chat.sendText(body);
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const kind = kindForFile(file);
    if (!kind) {
      setNotice('Only images, videos and PDFs can be attached.');
      return;
    }
    setNotice(null);
    atBottom.current = true;
    await chat.sendMedia(file, kind, file.name);
  }

  async function handleMic() {
    if (!recorder.recording) {
      await recorder.start();
      return;
    }
    const clip = await recorder.stop();
    if (!clip) return;
    atBottom.current = true;
    await chat.sendMedia(clip.blob, 'voice', 'voice-note', clip.durationSeconds);
  }

  const subtitle = peerTyping ? 'typing…'
    : connection === 'offline' ? 'Reconnecting…'
    : connection === 'connecting' ? 'Connecting…'
    : 'Online';
  const subtitleColor = peerTyping ? '#0B5FEF' : connection === 'online' ? '#22C55E' : '#94A3B8';

  function MicBtn({ size = 40 }: { size?: number }) {
    const on = recorder.recording;
    return (
      <div onClick={handleMic} title="Record a voice message" style={{ width: size, height: size, borderRadius: '50%', flex: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', background: on ? '#EF4444' : '#F2F4F9', boxShadow: on ? '0 0 0 4px rgba(239,68,68,.16)' : 'none' }}>
        <svg width={Math.round(size * 0.44)} height={Math.round(size * 0.44)} viewBox="0 0 24 24" fill="none" stroke={on ? '#FFFFFF' : '#64748B'} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
          <rect x={9} y={3.2} width={6} height={10.4} rx={3} />
          <path d="M5.6 11.4a6.4 6.4 0 0 0 12.8 0M12 17.8v3M8.8 20.8h6.4" />
        </svg>
      </div>
    );
  }

  return (
    <PhoneShell scrollRef={scrollRef}>
      <StatusBar />
      <div style={css('flex:none;height:58px;display:flex;align-items:center;padding:0 18px;gap:11px;border-bottom:1px solid #F1F4F9')}>
        <svg onClick={() => navigate(-1)} width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" style={css('cursor:pointer;flex:none')}><path d="M14.5 5.5l-7 6.5 7 6.5" /></svg>
        <div style={css('position:relative;flex:none')}>
          <div style={css('width:38px;height:38px;border-radius:50%;background:#DCE7F7;color:#29527F;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700')}>A</div>
          <div style={{ position: 'absolute', right: -1, bottom: -1, width: 11, height: 11, borderRadius: '50%', background: connection === 'online' ? '#22C55E' : '#CBD5E1', border: '2.2px solid #fff' }} />
        </div>
        <div style={css('flex:1;display:flex;flex-direction:column;gap:1px;min-width:0')}>
          <div style={css('font-size:15px;font-weight:700;letter-spacing:-.25px')}>Admin</div>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: subtitleColor }}>{subtitle}</div>
        </div>
        <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="#0B5FEF" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={css('cursor:pointer;flex:none')}><path d="M4.5 5.2c0-1 .8-1.8 1.8-1.8h1.9c.8 0 1.5.5 1.7 1.3l.7 2.5c.2.7-.1 1.5-.7 1.9l-1.2.8a11 11 0 0 0 4.4 4.4l.8-1.2c.4-.6 1.2-.9 1.9-.7l2.5.7c.8.2 1.3.9 1.3 1.7v1.9c0 1-.8 1.8-1.8 1.8C10.6 20.3 4.5 14.2 4.5 5.2z" /></svg>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0B5FEF" strokeWidth={1.8} strokeLinejoin="round" style={css('cursor:pointer;flex:none;margin-left:4px')}><rect x="2.6" y="6.8" width="12.4" height="10.4" rx="2.6" /><path d="M15 11 20.8 8v8l-5.8-3z" /></svg>
      </div>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        style={css('flex:1;min-height:0;padding:16px 18px 0;display:flex;flex-direction:column;gap:14px;overflow-y:auto;background:#FDFDFE;overscroll-behavior:contain;-webkit-overflow-scrolling:touch')}
      >
        {loadingOlder && (
          <div style={css('flex:none;text-align:center;font-size:11px;color:#94A3B8;padding:2px 0')}>Loading earlier messages…</div>
        )}
        {chat.loading ? (
          <div style={css('flex:1;display:flex;align-items:center;justify-content:center;font-size:12.5px;color:#94A3B8')}>Loading chat…</div>
        ) : messages.length === 0 ? (
          <div style={css('flex:1;display:flex;align-items:center;justify-content:center;text-align:center;font-size:12.5px;color:#94A3B8;line-height:1.5;padding:0 30px')}>
            No messages yet. Say hello to the Admin — they usually reply within a few hours.
          </div>
        ) : (
          messages.map(m => (
            <MessageBubble
              key={m.clientId}
              message={m}
              out={m.senderId === user?.id}
              onRetry={() => chat.retry(m.clientId)}
              onDelete={() => chat.deleteMessage(m)}
            />
          ))
        )}
        {peerTyping && <TypingBubble />}
        <div ref={bottomRef} />
        <div style={css('flex:1')} />
      </div>

      {(notice || chat.error) && (
        <div style={css('flex:none;padding:6px 18px;font-size:11.5px;color:#EF4444;text-align:center;line-height:1.4')}>
          {notice ?? chat.error}
        </div>
      )}

      <input
        ref={fileInput}
        type="file"
        accept="image/*,video/*,application/pdf"
        onChange={handleFile}
        style={{ display: 'none' }}
      />

      {!recorder.recording ? (
        <div style={css('flex:none;padding:12px 18px 24px;display:flex;align-items:center;gap:9px;background:#FFFFFF')}>
          <div onClick={() => fileInput.current?.click()} style={css('width:38px;height:38px;border-radius:50%;background:#F2F4F9;display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none')}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth={2.1} strokeLinecap="round"><path d="M12 6v12M6 12h12" /></svg>
          </div>
          <div style={css('flex:1;height:44px;border-radius:999px;background:#F2F4F9;display:flex;align-items:center;padding:0 16px')}>
            <input
              placeholder="Type a message..."
              value={msg}
              onChange={e => { setMsg(e.target.value); chat.notifyTyping(); }}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void handleSendText(); } }}
              style={css('flex:1;font-size:14px;height:100%')}
            />
          </div>
          <MicBtn />
          <Hoverable onClick={handleSendText} style={css('width:44px;height:44px;border-radius:50%;background:#0B5FEF;box-shadow:0 6px 16px rgba(11,95,239,.32);display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none')} hoverStyle={css('background:#0A52D6')}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="#FFFFFF" style={css('margin-left:-1px')}><path d="M20.8 3.2 3.9 9.9c-.7.3-.6 1.3.1 1.5l6.3 1.9 1.9 6.3c.2.7 1.2.8 1.5.1z" /></svg>
          </Hoverable>
        </div>
      ) : (
        <div style={css('flex:none;padding:12px 18px 24px;display:flex;align-items:center;gap:9px;background:#FFFFFF')}>
          <Hoverable onClick={recorder.cancel} style={css('width:38px;height:38px;border-radius:50%;background:#FEF1F1;display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none')} hoverStyle={css('background:#FDE1E3')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M5.6 7.4h12.8M9.4 7.4V5.2h5.2v2.2M7.2 7.4l.9 12h7.8l.9-12" /></svg>
          </Hoverable>
          <div style={css('flex:1;height:44px;border-radius:999px;background:#FEF4F4;border:1px solid #FBD5D9;display:flex;align-items:center;padding:0 14px;gap:10px;min-width:0')}>
            <div style={css('width:8px;height:8px;border-radius:50%;background:#EF4444;flex:none')} />
            <div style={css('font-size:12.5px;font-weight:700;color:#EF4444;flex:none;white-space:nowrap')}>{formatDuration(recorder.seconds)}</div>
            <Wave bars={34} color="rgba(239,68,68,.55)" height={22} gap={2.6} seed={91} />
            <div style={css('font-size:11px;color:#94A3B8;flex:none;white-space:nowrap')}>Recording</div>
          </div>
          <MicBtn />
          <Hoverable onClick={handleMic} style={css('width:44px;height:44px;border-radius:50%;background:#0B5FEF;box-shadow:0 6px 16px rgba(11,95,239,.32);display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none')} hoverStyle={css('background:#0A52D6')}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="#FFFFFF" style={css('margin-left:-1px')}><path d="M20.8 3.2 3.9 9.9c-.7.3-.6 1.3.1 1.5l6.3 1.9 1.9 6.3c.2.7 1.2.8 1.5.1z" /></svg>
          </Hoverable>
        </div>
      )}
      {recorder.error && (
        <div style={css('flex:none;padding:0 18px 12px;font-size:11.5px;color:#EF4444;text-align:center')}>{recorder.error}</div>
      )}
    </PhoneShell>
  );
}
