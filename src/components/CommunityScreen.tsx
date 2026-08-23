import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { css } from '../lib/css';
import { Hoverable } from '../lib/Hoverable';
import { makeRand } from '../lib/rng';
import { useAuth } from '../lib/auth-context';
import { useFeed, type FeedPost } from '../lib/community/useFeed';
import { useComments } from '../lib/community/useComments';
import { StatusBar } from './StatusBar';
import { BottomNav } from './BottomNav';
import { PostMedia, timeAgo } from './community/PostMedia';
import logo from '../assets/traders-planet-logo.jpg';

function Wave({ bars, color, height, gap, seed }: { bars: number; color: string; height: number; gap: number; seed: number }) {
  const rand = makeRand(seed);
  const els: ReactNode[] = [];
  for (let i = 0; i < bars; i++) {
    const h = Math.max(3, Math.round((0.28 + rand() * 0.72) * height));
    els.push(<div key={i} style={{ width: 2, height: h, borderRadius: 2, background: color, flex: 'none' }} />);
  }
  return <div style={{ display: 'flex', alignItems: 'center', gap, height, flex: 1, overflow: 'hidden' }}>{els}</div>;
}

function MaskAvatar({ size, online }: { size: number; online: boolean }) {
  return (
    <div style={{ position: 'relative', flex: 'none' }}>
      <div style={{ width: size, height: size, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#EDF0F5', border: '1px dashed #C2CAD6' }}>
        <svg width={Math.round(size * 0.5)} height={Math.round(size * 0.5)} viewBox="0 0 24 24" fill="none" stroke="#8794A8" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
          <circle cx={12} cy={8.4} r={3.3} />
          <path d="M5.6 19.6c0-3.4 2.9-5.8 6.4-5.8s6.4 2.4 6.4 5.8" />
        </svg>
      </div>
      {online && <div style={{ position: 'absolute', right: -1, bottom: -1, width: 10, height: 10, borderRadius: '50%', background: '#22C55E', border: '2px solid #fff' }} />}
    </div>
  );
}

function InitialAvatar({ text, size, bg, color, online }: { text: string; size: number; bg: string; color: string; online: boolean }) {
  return (
    <div style={{ position: 'relative', flex: 'none' }}>
      <div style={{ width: size, height: size, borderRadius: '50%', background: bg, color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: Math.round(size * 0.38), fontWeight: 700 }}>
        {text}
      </div>
      {online && <div style={{ position: 'absolute', right: -1, bottom: -1, width: 10, height: 10, borderRadius: '50%', background: '#22C55E', border: '2px solid #fff' }} />}
    </div>
  );
}

function LockMark() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" strokeWidth={1.9} strokeLinejoin="round" style={css('display:block;flex:none')}>
      <rect x={5} y={10.4} width={14} height={9.6} rx={2.6} />
      <path d="M8.2 10.4V8a3.8 3.8 0 0 1 7.6 0v2.4" />
    </svg>
  );
}

function SharedTag() {
  return (
    <div style={{ height: 16, padding: '0 6px', borderRadius: 5, background: '#E9F8EF', color: '#16A34A', display: 'flex', alignItems: 'center', fontSize: 8.5, fontWeight: 700, letterSpacing: '.05em', whiteSpace: 'nowrap', flex: 'none' }}>
      NAME SHARED
    </div>
  );
}

function SwitchEl({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <div onClick={onClick} style={{ width: 42, height: 25, borderRadius: 999, flex: 'none', cursor: 'pointer', padding: 3, display: 'flex', alignItems: 'center', justifyContent: on ? 'flex-end' : 'flex-start', background: on ? '#0B5FEF' : '#D5DBE5', transition: 'background .18s ease' }}>
      <div style={{ width: 19, height: 19, borderRadius: '50%', background: '#FFFFFF', boxShadow: '0 1px 3px rgba(15,23,42,.28)' }} />
    </div>
  );
}

function Heart({ on, size }: { on: boolean; size: number }) {
  const d = 'M12 20.8S3.9 15.4 3.9 9.9A4.55 4.55 0 0 1 12 7.1a4.55 4.55 0 0 1 8.1 2.8c0 5.5-8.1 10.9-8.1 10.9z';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block' }}>
      <path d={d} fill={on ? '#EF4444' : 'none'} stroke={on ? '#EF4444' : '#64748B'} strokeWidth={1.7} strokeLinejoin="round" />
    </svg>
  );
}

const iconBtn = css('height:36px;padding:0 14px;border:1px solid #E7EBF1;border-radius:10px;display:flex;align-items:center;gap:7px;cursor:pointer;background:#fff');
const VERIFIED = (
  <svg width="14" height="14" viewBox="0 0 24 24" style={css('display:block;flex:none')}>
    <circle cx="12" cy="12" r="9.5" fill="#0B5FEF" />
    <path d="M8.2 12.3l2.6 2.6 5.1-5.4" fill="none" stroke="#FFFFFF" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** Reply row on a student post — posts a real comment. */
function ReplyRow({ postId, anonymous }: { postId: string; anonymous: boolean }) {
  const { addComment } = useComments(postId);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  async function send() {
    if (!text.trim() || sending) return;
    setSending(true);
    await addComment(text, anonymous);
    setText('');
    setSending(false);
  }

  return (
    <div style={css('display:flex;align-items:center;gap:9px')}>
      <div style={css('flex:1;height:38px;border-radius:999px;background:#F2F4F9;display:flex;align-items:center;padding:0 14px')}>
        <input
          placeholder="Reply or send a voice note..."
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void send(); } }}
          style={css('flex:1;font-size:12.5px;height:100%')}
        />
      </div>
      <Hoverable as="div" onClick={send} style={css('width:36px;height:36px;border-radius:50%;background:#DCE9FF;display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none')} hoverStyle={css('background:#C6DBFF')}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="#0B5FEF" style={css('margin-left:-1px')}><path d="M20.8 3.2 3.9 9.9c-.7.3-.6 1.3.1 1.5l6.3 1.9 1.9 6.3c.2.7 1.2.8 1.5.1z" /></svg>
      </Hoverable>
    </div>
  );
}

/** Long-press (or right-click) to delete your own post — same gesture as chat. */
function useLongPressDelete(enabled: boolean) {
  const [confirming, setConfirming] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const start = useCallback(() => {
    if (enabled) timer.current = setTimeout(() => setConfirming(true), 500);
  }, [enabled]);
  const cancel = useCallback(() => clearTimeout(timer.current), []);
  return { confirming, setConfirming, start, cancel };
}

function DeleteBar({ onDelete, onCancel }: { onDelete: () => void; onCancel: () => void }) {
  return (
    <div style={css('display:flex;align-items:center;gap:10px;padding-top:2px')}>
      <div onClick={onDelete} style={css('font-size:11.5px;font-weight:700;color:#EF4444;cursor:pointer;white-space:nowrap')}>Delete post</div>
      <div onClick={onCancel} style={css('font-size:11.5px;font-weight:600;color:#94A3B8;cursor:pointer;white-space:nowrap')}>Cancel</div>
    </div>
  );
}

export function CommunityScreen({ initialTab = 'official', adminView = false, asOthers = false, reveal: revealProp, userName, onToggleReveal }: {
  initialTab?: 'official' | 'students';
  adminView?: boolean;
  asOthers?: boolean;
  reveal?: boolean;
  /** The signed-in user's real name; supplied by the caller from the profile. */
  userName: string;
  onToggleReveal?: () => void;
}) {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState(initialTab);
  const [myReveal, setMyReveal] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const feed = useFeed(tab);

  // `adminView` / `asOthers` are the design's preview modes; a real admin
  // session also gets the admin treatment.
  const admin = adminView || (isAdmin && !asOthers);
  const others = asOthers;
  const reveal = revealProp !== undefined ? revealProp : myReveal;

  function handleToggleReveal() {
    if (onToggleReveal) onToggleReveal();
    else setMyReveal(v => !v);
  }

  const isOfficial = tab === 'official';
  const isStudents = tab === 'students';

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 240) void feed.loadMore();
  }, [feed]);

  return (
    <div style={css("position:relative;width:100%;height:100%;display:flex;flex-direction:column;background:#FFFFFF;overflow:hidden;font-family:-apple-system,'SF Pro Text','Helvetica Neue',Helvetica,Arial,sans-serif;color:#0F172A")}>
      <StatusBar />

      <div style={css('flex:none;height:50px;display:flex;align-items:center;justify-content:center;gap:8px;padding:0 18px')}>
        <div style={css('font-size:17px;font-weight:700;letter-spacing:-.35px;white-space:nowrap')}>{isOfficial ? 'Community' : 'Students Community'}</div>
        {(admin || others) && (
          <div style={{ height: 22, padding: '0 9px', borderRadius: 7, flex: 'none', display: 'flex', alignItems: 'center', gap: 5, background: admin ? '#0F172A' : '#EDF3FE', border: admin ? 'none' : '1px solid #DCE9FF' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={admin ? '#FFFFFF' : '#0B5FEF'} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              {admin
                ? <path d="M12 3.8 5.6 6.2v5.3c0 4 2.6 7.4 6.4 8.7 3.8-1.3 6.4-4.7 6.4-8.7V6.2z" />
                : <g><circle cx={12} cy={8.4} r={3.3} /><path d="M5.6 19.6c0-3.4 2.9-5.8 6.4-5.8s6.4 2.4 6.4 5.8" /></g>}
            </svg>
            <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.05em', whiteSpace: 'nowrap', color: admin ? '#FFFFFF' : '#0B5FEF' }}>{admin ? 'ADMIN VIEW' : 'USER VIEW'}</div>
          </div>
        )}
      </div>

      <div style={css('flex:none;margin:4px 20px 14px;padding:4px;background:#F1F3F8;border-radius:999px;display:flex;gap:4px')}>
        {isOfficial && <div style={css('flex:1;height:40px;border-radius:999px;background:#0B5FEF;box-shadow:0 3px 10px rgba(11,95,239,.28);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;color:#FFFFFF;cursor:pointer;white-space:nowrap')}>Official</div>}
        {isStudents && <Hoverable onClick={() => setTab('official')} style={css('flex:1;height:40px;border-radius:999px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:500;color:#475569;cursor:pointer;white-space:nowrap')} hoverStyle={css('background:rgba(255,255,255,.7)')}>Official</Hoverable>}
        {isStudents && <div style={css('flex:1;height:40px;border-radius:999px;background:#0B5FEF;box-shadow:0 3px 10px rgba(11,95,239,.28);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:600;color:#FFFFFF;cursor:pointer;white-space:nowrap')}>Students</div>}
        {isOfficial && <Hoverable onClick={() => setTab('students')} style={css('flex:1;height:40px;border-radius:999px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:500;color:#475569;cursor:pointer;white-space:nowrap')} hoverStyle={css('background:rgba(255,255,255,.7)')}>Students</Hoverable>}
      </div>

      <div style={css('flex:1;min-height:0;background:#F3F5F9;display:flex;flex-direction:column;gap:8px;overflow:hidden;border-top:1px solid #EDF0F5')}>
        <div ref={scrollRef} onScroll={onScroll} style={css('flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:8px;overscroll-behavior:contain;-webkit-overflow-scrolling:touch')}>

          {isStudents && others && (
            <div style={css('background:#F7FAFF;border-top:1px solid #DCE9FF;border-bottom:1px solid #DCE9FF;padding:10px 18px;display:flex;gap:10px;align-items:flex-start')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#0B5FEF" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={css('flex:none;margin-top:1px')}><path d="M2.4 12S6 5.9 12 5.9 21.6 12 21.6 12 18 18.1 12 18.1 2.4 12 2.4 12z" /><circle cx="12" cy="12" r="2.9" /></svg>
              <div style={css('flex:1;font-size:11.5px;color:#334155;line-height:1.45;text-wrap:pretty')}>Member view — this is exactly what other students see. Names stay <strong style={css('font-weight:700')}>Unknown User</strong> unless a member shares them.</div>
            </div>
          )}
          {isStudents && admin && (
            <div style={css('background:#FFF9EC;border-top:1px solid #F3E3BE;border-bottom:1px solid #F3E3BE;padding:10px 18px;display:flex;gap:10px;align-items:flex-start')}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#B98F3C" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" style={css('flex:none;margin-top:1px')}><path d="M12 3.8 5.6 6.2v5.3c0 4 2.6 7.4 6.4 8.7 3.8-1.3 6.4-4.7 6.4-8.7V6.2z" /></svg>
              <div style={css('flex:1;font-size:11.5px;color:#7A5D25;line-height:1.45;text-wrap:pretty')}>Admin view — real names are always visible to you, even when a member posts as Unknown User.</div>
            </div>
          )}

          {feed.error && (
            <div style={css('background:#FFFFFF;padding:14px 20px;font-size:12px;color:#EF4444;line-height:1.4')}>{feed.error}</div>
          )}

          {feed.loading ? (
            <div style={css('flex:1;display:flex;align-items:center;justify-content:center;font-size:12.5px;color:#94A3B8')}>Loading posts…</div>
          ) : feed.posts.length === 0 ? (
            <div style={css('flex:1;display:flex;align-items:center;justify-content:center;text-align:center;font-size:12.5px;color:#94A3B8;line-height:1.5;padding:0 34px')}>
              {isOfficial
                ? 'No official updates yet. Analysis and signals from the team will appear here.'
                : 'No student posts yet. Be the first to share an idea with the group.'}
            </div>
          ) : (
            feed.posts.map(post => (
              <PostCard
                key={post.id}
                post={post}
                official={isOfficial}
                admin={admin}
                others={others}
                reveal={reveal}
                userName={userName}
                onToggleReveal={handleToggleReveal}
                onOpen={() => navigate(`/analysis?post=${post.id}`)}
                onToggleLike={() => feed.toggleLike(post.id)}
                onDelete={() => feed.deletePost(post)}
              />
            ))
          )}

          {feed.loadingMore && (
            <div style={css('padding:10px 0 16px;text-align:center;font-size:11.5px;color:#94A3B8')}>Loading more…</div>
          )}
        </div>
      </div>

      {isStudents && (
        <Hoverable
          as="div"
          onClick={() => navigate('/create-post')}
          style={css('position:absolute;right:20px;bottom:104px;width:54px;height:54px;border-radius:50%;background:#0B5FEF;box-shadow:0 8px 22px rgba(11,95,239,.38);display:flex;align-items:center;justify-content:center;cursor:pointer')}
          hoverStyle={css('background:#0A52D6')}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2.2} strokeLinecap="round"><path d="M12 5.5v13M5.5 12h13" /></svg>
        </Hoverable>
      )}

      {isOfficial && admin && (
        <Hoverable
          as="div"
          onClick={() => navigate('/create-post?channel=official')}
          style={css('position:absolute;right:20px;bottom:104px;width:54px;height:54px;border-radius:50%;background:#0B5FEF;box-shadow:0 8px 22px rgba(11,95,239,.38);display:flex;align-items:center;justify-content:center;cursor:pointer')}
          hoverStyle={css('background:#0A52D6')}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2.2} strokeLinecap="round"><path d="M12 5.5v13M5.5 12h13" /></svg>
        </Hoverable>
      )}

      <BottomNav active="community" />
    </div>
  );
}

function PostCard({ post, official, admin, others, reveal, userName, onToggleReveal, onOpen, onToggleLike, onDelete }: {
  post: FeedPost;
  official: boolean;
  admin: boolean;
  others: boolean;
  reveal: boolean;
  userName: string;
  onToggleReveal: () => void;
  onOpen: () => void;
  onToggleLike: () => void;
  onDelete: () => void;
}) {
  const press = useLongPressDelete(post.isMine || admin);
  const initials = post.authorName.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();

  const pressHandlers = {
    onPointerDown: press.start,
    onPointerUp: press.cancel,
    onPointerLeave: press.cancel,
    onContextMenu: (e: React.MouseEvent) => {
      if (post.isMine || admin) { e.preventDefault(); press.setConfirming(true); }
    },
  };

  if (official) {
    return (
      <div style={css('background:#FFFFFF;padding:16px 20px 14px;display:flex;flex-direction:column;gap:12px')} {...pressHandlers}>
        <div style={css('display:flex;align-items:center;gap:10px')}>
          <div style={css('width:34px;height:34px;border-radius:50%;background:#0F1733;display:flex;align-items:center;justify-content:center;overflow:hidden;flex:none')}>
            <img src={logo} alt="The Traders Planet" style={css('width:30px;height:30px;object-fit:contain')} />
          </div>
          <div style={css('flex:1;display:flex;flex-direction:column;gap:1px')}>
            <div style={css('display:flex;align-items:center;gap:5px')}>
              <div style={css('font-size:13.5px;font-weight:700;letter-spacing:-.2px;white-space:nowrap')}>The Traders Planet</div>
              {VERIFIED}
            </div>
            <div style={css('font-size:11.5px;color:#94A3B8')}>Admin</div>
          </div>
          <div style={css('font-size:11.5px;color:#94A3B8;flex:none;white-space:nowrap')}>{timeAgo(post.createdAt)}</div>
        </div>

        <div style={css('display:flex;flex-direction:column;gap:5px')} onClick={onOpen}>
          {post.title && <div style={css('font-size:16px;font-weight:700;letter-spacing:-.35px')}>{post.title}</div>}
          {post.body && <div style={css('font-size:13.5px;line-height:1.5;color:#334155;white-space:pre-wrap')}>{post.body}</div>}
          {post.entryPrice != null && (
            <div style={css('font-size:13.5px;line-height:1.5;color:#334155')}>
              SL {post.stopLoss ?? '—'} | TP {post.takeProfit ?? '—'}
            </div>
          )}
        </div>

        {post.attachment !== 'pdf' && <div onClick={onOpen}><PostMedia post={post} height={152} /></div>}
        {post.attachment === 'pdf' && <PostMedia post={post} height={152} />}

        <div style={css('display:flex;gap:10px')}>
          <Hoverable style={iconBtn} hoverStyle={css('border-color:#0B5FEF')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0B5FEF" strokeWidth={1.8} strokeLinejoin="round"><path d="M7 3.6h7L18.4 8v12.4H7z" /><path d="M9.6 14.2h4.8" /></svg>
            <div style={css('font-size:12.5px;font-weight:600')}>PDF</div>
          </Hoverable>
          <Hoverable style={iconBtn} hoverStyle={css('border-color:#0B5FEF')}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0B5FEF" strokeWidth={1.8} strokeLinejoin="round"><rect x="3.2" y="6.6" width="12" height="10.8" rx="2.6" /><path d="M15.2 11.2 20.4 8.2v7.6l-5.2-3z" /></svg>
            <div style={css('font-size:12.5px;font-weight:600')}>Video</div>
          </Hoverable>
        </div>

        <div style={css('display:flex;align-items:center;gap:18px;padding-top:2px')}>
          <div onClick={onToggleLike} style={css('display:flex;align-items:center;gap:7px;cursor:pointer')}>
            <Heart on={post.likedByMe} size={20} />
            <div style={css('font-size:13px;font-weight:600;color:#334155')}>{post.likeCount}</div>
          </div>
          <div onClick={onOpen} style={css('display:flex;align-items:center;gap:7px;cursor:pointer')}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M20.4 11.8c0 3.8-3.8 6.9-8.4 6.9-1 0-2-.1-2.9-.4L4.4 20.2l1.5-3.5c-1.6-1.3-2.5-3-2.5-4.9 0-3.8 3.8-6.9 8.4-6.9s8.6 3.1 8.6 6.9z" /></svg>
            <div style={css('font-size:13px;font-weight:600;color:#334155')}>{post.commentCount}</div>
          </div>
          <div style={css('flex:1')} />
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth={1.7} strokeLinejoin="round" style={css('cursor:pointer')}><path d="M7 4.4h10v16l-5-3.5-5 3.5z" /></svg>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth={1.7} strokeLinecap="round" style={css('cursor:pointer')}><circle cx="18" cy="5.6" r="2.4" /><circle cx="6.4" cy="12" r="2.4" /><circle cx="18" cy="18.4" r="2.4" /><path d="M8.6 10.8 15.8 6.9M8.6 13.2l7.2 3.9" /></svg>
        </div>

        {press.confirming && <DeleteBar onDelete={() => { press.setConfirming(false); onDelete(); }} onCancel={() => press.setConfirming(false)} />}
      </div>
    );
  }

  // ---- students card ----
  const showRealName = admin || (post.isMine && reveal) || !post.isAnonymous;
  const shownName = showRealName ? post.authorName : 'Unknown User';
  const role = post.isMine
    ? (admin
        ? (reveal ? 'You · name shared' : 'You · appears as Unknown User')
        : others ? 'Student' : (reveal ? 'You · name visible' : 'You · posting anonymously'))
    : (admin && post.isAnonymous ? 'Student · appears as Unknown User' : 'Student');

  return (
    <div style={css('background:#FFFFFF;padding:14px 18px 12px;display:flex;flex-direction:column;gap:11px')} {...pressHandlers}>
      <div style={css('display:flex;align-items:center;gap:10px')}>
        {showRealName
          ? <InitialAvatar text={initials} size={34} bg="#DCE7F7" color="#29527F" online={!post.isMine} />
          : <MaskAvatar size={34} online={!post.isMine} />}
        <div style={css('flex:1;display:flex;flex-direction:column;gap:1px;min-width:0')}>
          <div style={css('display:flex;align-items:center;gap:5px')}>
            <div style={css('font-size:13.5px;font-weight:700;letter-spacing:-.2px;white-space:nowrap')}>{shownName}</div>
            {post.isMine && reveal ? <SharedTag /> : post.isAnonymous ? <LockMark /> : null}
          </div>
          <div style={css('font-size:11.5px;color:#94A3B8;flex:none;white-space:nowrap')}>{role}</div>
        </div>
        <div style={css('font-size:11.5px;color:#94A3B8;flex:none;white-space:nowrap')}>{timeAgo(post.createdAt)}</div>
      </div>

      {post.body && <div style={css('font-size:14px;color:#0F172A;line-height:1.45;white-space:pre-wrap')} onClick={onOpen}>{post.body}</div>}

      {post.attachment !== 'none' && <div onClick={onOpen}><PostMedia post={post} height={148} /></div>}

      {post.isMine && !admin && !others && (
        <div style={css('background:#F7FAFF;border:1px solid #DCE9FF;border-radius:12px;padding:10px 12px;display:flex;align-items:center;gap:11px')}>
          <div style={css('flex:1;display:flex;flex-direction:column;gap:2px;min-width:0')}>
            <div style={css('font-size:12px;font-weight:700;letter-spacing:-.15px;white-space:nowrap')}>Show my real name on this post</div>
            <div style={css('font-size:11px;color:#64748B;line-height:1.4')}>{reveal ? `Others now see ${userName}` : 'Others see you as Unknown User'}</div>
          </div>
          <SwitchEl on={reveal} onClick={onToggleReveal} />
        </div>
      )}

      <div style={css('display:flex;align-items:center;gap:18px;padding-top:1px')}>
        <div onClick={onToggleLike} style={css('display:flex;align-items:center;gap:7px;cursor:pointer')}>
          <Heart on={post.likedByMe} size={19} />
          <div style={css('font-size:13px;font-weight:600;color:#334155')}>{post.likeCount}</div>
        </div>
        <div onClick={onOpen} style={css('display:flex;align-items:center;gap:7px;cursor:pointer')}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round"><path d="M20.4 11.8c0 3.8-3.8 6.9-8.4 6.9-1 0-2-.1-2.9-.4L4.4 20.2l1.5-3.5c-1.6-1.3-2.5-3-2.5-4.9 0-3.8 3.8-6.9 8.4-6.9s8.6 3.1 8.6 6.9z" /></svg>
          <div style={css('font-size:13px;font-weight:600;color:#334155')}>{post.commentCount}</div>
        </div>
        <div style={css('flex:1')} />
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#64748B" strokeWidth={1.7} strokeLinejoin="round" style={css('cursor:pointer')}><path d="M7 4.4h10v16l-5-3.5-5 3.5z" /></svg>
      </div>

      <ReplyRow postId={post.id} anonymous={!reveal} />

      {press.confirming && <DeleteBar onDelete={() => { press.setConfirming(false); onDelete(); }} onCancel={() => press.setConfirming(false)} />}
    </div>
  );
}

export { Wave };
