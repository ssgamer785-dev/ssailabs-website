import { useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { css } from '../lib/css';
import { Hoverable } from '../lib/Hoverable';
import { useAuth } from '../lib/auth-context';
import { useAppState } from '../lib/app-state';
import { usePost } from '../lib/community/usePost';
import { useComments } from '../lib/community/useComments';
import { PhoneShell } from '../components/PhoneShell';
import { PostMedia, PdfRow, timeAgo } from '../components/community/PostMedia';
import { PollCard } from '../components/community/PollCard';
import { AppBackButton } from '../components/ui/AppBackButton';
import { AuthenticatedBottomNav } from '../components/ui/AuthenticatedBottomNav';
import { Avatar } from '../components/ui/Avatar';
import { resolveAuthorName } from '../lib/community/author-name';
import logo from '../assets/traders-planet-logo.jpg';

/**
 * One post, opened from the feed.
 *
 * This screen used to be a mock-up with a live comment list bolted on: the
 * heading said "Gold Analysis" whichever post you opened, the author was
 * always "The Traders Planet · Admin", the timestamp was the literal string
 * "2h ago", the attachment was a generated candlestick chart no matter what
 * had actually been uploaded, there were PDF and Video buttons behind which
 * nothing was wired, and the bookmark was component state that never reached
 * the database. All of that came from having no way to ask for one post with
 * its counts and author resolved. `post_by_id` is that way, and everything
 * below now renders what came back from it.
 *
 * Deleted here too: the voice-note recorder in the composer. It ran a timer
 * and drew a waveform and captured no audio — pressing send discarded whatever
 * the person thought they had just recorded. A control that convincingly
 * pretends to work is worse than one that is absent, so it is absent; the chat
 * screen has a real recorder for anyone who needs to send audio.
 */

function StatusLine({ children }: { children: React.ReactNode }) {
  return (
    <div style={css('flex:1;display:flex;align-items:center;justify-content:center;padding:0 32px;text-align:center;font-size:13px;color:var(--text-muted);line-height:1.55;text-wrap:pretty')}>
      {children}
    </div>
  );
}

export function PostDetailScreen() {
  const [params] = useSearchParams();
  const postId = params.get('post');
  const { isAdmin } = useAuth();
  const { reveal, userName } = useAppState();

  const { post, loading, notFound, error, toggleLike, toggleBookmark, refresh } = usePost(postId);
  const comments = useComments(postId);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [confirmCommentId, setConfirmCommentId] = useState<string | null>(null);
  const [deletingCommentId, setDeletingCommentId] = useState<string | null>(null);

  const send = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft('');
    // Anonymity follows the same switch the feed and composer use, so a comment
    // cannot reveal a name the person has chosen to keep hidden.
    await comments.addComment(text, !reveal);
    setSending(false);
  }, [draft, sending, comments, reveal]);

  if (loading) {
    return (
      <PhoneShell>
        <div style={css('flex:none;height:56px;display:flex;align-items:center;padding:0 20px;gap:12px')}>
          <AppBackButton fallback="/community" />
        </div>
        <StatusLine>Loading…</StatusLine>
        <AuthenticatedBottomNav />
      </PhoneShell>
    );
  }

  if (error) {
    return (
      <PhoneShell>
        <div style={css('flex:none;height:56px;display:flex;align-items:center;padding:0 20px;gap:12px')}>
          <AppBackButton fallback="/community" />
          <div style={css('flex:1;font-size:17px;font-weight:700;letter-spacing:-.35px')}>Post</div>
        </div>
        <div style={css('flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:0 32px;text-align:center')}>
          <div style={css('font-size:13px;color:var(--text-muted);line-height:1.55;text-wrap:pretty')}>
            Couldn&rsquo;t load this post. This is a loading problem, not a deleted post — try again.
          </div>
          <Hoverable
            as="button"
            type="button"
            onClick={() => void refresh()}
            className="pressable row-focus"
            style={css('height:38px;padding:0 16px;border-radius:10px;border:1px solid var(--border-strong);display:flex;align-items:center;font-size:13px;font-weight:700;color:var(--text-primary);cursor:pointer;background:var(--surface)')}
            hoverStyle={css('background:var(--surface-hover)')}
          >
            Try again
          </Hoverable>
        </div>
        <AuthenticatedBottomNav />
      </PhoneShell>
    );
  }

  if (notFound || !post) {
    return (
      <PhoneShell>
        <div style={css('flex:none;height:56px;display:flex;align-items:center;padding:0 20px;gap:12px')}>
          <AppBackButton fallback="/community" />
          <div style={css('flex:1;font-size:17px;font-weight:700;letter-spacing:-.35px')}>Post</div>
        </div>
        <StatusLine>
          {postId
            ? 'This post is no longer available. It may have been deleted by its author.'
            : 'No post was specified.'}
        </StatusLine>
        <AuthenticatedBottomNav />
      </PhoneShell>
    );
  }

  const official = post.channel === 'official';
  const heading = official ? 'Official Update' : 'Community Post';

  // One shared decision (resolveAuthorName) rather than logic re-implemented
  // per screen — see its own doc comment for why that duplication was the bug.
  const authorDisplayName = resolveAuthorName({
    official, isAdminViewer: isAdmin, isMine: post.isMine, reveal,
    isAnonymous: post.isAnonymous, authorName: post.authorName, myName: userName,
  });

  return (
    <PhoneShell>
      <div style={css('flex:none;height:56px;display:flex;align-items:center;padding:0 20px;gap:12px')}>
        <AppBackButton fallback={official ? '/community' : '/community?tab=students'} />
        <div style={css('flex:1;font-size:17px;font-weight:700;letter-spacing:-.35px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>
          {heading}
        </div>
      </div>

      <div style={css('flex:1;min-height:0;padding:4px 20px 0;display:flex;flex-direction:column;overflow-y:auto;overscroll-behavior:contain')}>

        {/* ---- author ---- */}
        <div style={css('flex:none;display:flex;align-items:center;gap:10px')}>
          {official ? (
            <div style={css('width:34px;height:34px;border-radius:50%;background:var(--ink-chip-2);display:flex;align-items:center;justify-content:center;overflow:hidden;flex:none')}>
              <img src={logo} alt="The Traders Planet" style={css('width:30px;height:30px;object-fit:contain')} />
            </div>
          ) : (
            <Avatar name={authorDisplayName} avatarKey={post.authorAvatarKey} size={34} />
          )}
          <div style={css('flex:1;display:flex;flex-direction:column;gap:1px;min-width:0')}>
            <div style={css('display:flex;align-items:center;gap:5px;min-width:0')}>
              <div style={css('font-size:13.5px;font-weight:700;letter-spacing:-.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>
                {authorDisplayName}
              </div>
              {post.authorRole === 'admin' && (
                <svg width="14" height="14" viewBox="0 0 24 24" aria-label="Admin" style={css('display:block;flex:none')}>
                  <circle cx="12" cy="12" r="9.5" fill="var(--accent-ink)" />
                  <path d="M8.2 12.3l2.6 2.6 5.1-5.4" fill="none" stroke="var(--on-accent)" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <div style={css('font-size:11.5px;color:var(--text-faint);white-space:nowrap')}>
              {post.authorRole === 'admin' ? 'Admin' : 'Member'}
              {/* Only an admin is told a post is anonymous, because only an
                  admin can see whose it is. */}
              {post.isAnonymous && isAdmin ? ' · posted anonymously' : ''}
            </div>
          </div>
          <div style={css('font-size:11.5px;color:var(--text-faint);flex:none;white-space:nowrap')}>
            {timeAgo(post.createdAt)}
          </div>
        </div>

        {/* ---- body ---- */}
        {post.title && (
          <div style={css('flex:none;margin-top:14px;font-size:16px;font-weight:700;letter-spacing:-.35px;line-height:1.35;text-wrap:pretty')}>
            {post.title}
          </div>
        )}
        {post.body && (
          <div style={css('flex:none;margin-top:6px;font-size:13.5px;line-height:1.55;color:var(--text-secondary);white-space:pre-wrap;word-break:break-word')}>
            {post.body}
          </div>
        )}

        {/* ---- the trade, when the post carries one ---- */}
        {(post.instrument || post.entryPrice !== null || post.stopLoss !== null || post.takeProfit !== null) && (
          <div style={css('flex:none;margin-top:12px;padding:12px 13px;border-radius:12px;background:var(--surface-inset);display:flex;flex-wrap:wrap;gap:14px')}>
            {([
              ['Instrument', post.instrument],
              ['Entry', post.entryPrice],
              ['Stop loss', post.stopLoss],
              ['Take profit', post.takeProfit],
            ] as [string, string | number | null][])
              .filter(([, v]) => v !== null && v !== '')
              .map(([label, value]) => (
                <div key={label} style={css('display:flex;flex-direction:column;gap:3px;min-width:0')}>
                  <div style={css('font-size:10px;font-weight:700;letter-spacing:.09em;color:var(--text-faint)')}>
                    {label.toUpperCase()}
                  </div>
                  <div style={css('font-size:13px;font-weight:700;color:var(--text-primary);font-variant-numeric:tabular-nums')}>
                    {value}
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* ---- attachment ---- */}
        {post.attachment === 'poll' ? (
          <div style={css('flex:none;margin-top:14px')}>
            <PollCard postId={post.id} />
          </div>
        ) : post.attachment === 'pdf' || post.attachment === 'file' ? (
          <div style={css('flex:none;margin-top:12px')}>
            <PdfRow post={post} />
          </div>
        ) : post.attachment !== 'none' ? (
          <div style={css('flex:none;margin-top:12px')}>
            <PostMedia post={post} height={210} />
          </div>
        ) : null}

        {/* ---- actions ---- */}
        <div style={css('flex:none;margin-top:14px;display:flex;align-items:center;gap:18px')}>
          <Hoverable
            as="button"
            type="button"
            onClick={toggleLike}
            aria-pressed={post.likedByMe}
            aria-label={`${post.likeCount} like${post.likeCount === 1 ? '' : 's'}`}
            className="row-focus"
            style={css('display:flex;align-items:center;gap:7px;cursor:pointer;border:0;background:transparent;padding:4px 0')}
            hoverStyle={css('opacity:.78')}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" style={css('display:block')}>
              <path d="M12 20.8S3.9 15.4 3.9 9.9A4.55 4.55 0 0 1 12 7.1a4.55 4.55 0 0 1 8.1 2.8c0 5.5-8.1 10.9-8.1 10.9z"
                fill={post.likedByMe ? 'var(--danger-ink)' : 'none'}
                stroke={post.likedByMe ? 'var(--danger-ink)' : 'var(--text-muted)'}
                strokeWidth={1.7} strokeLinejoin="round" />
            </svg>
            <span style={css('font-size:13px;font-weight:600;color:var(--text-secondary);font-variant-numeric:tabular-nums')}>
              {post.likeCount}
            </span>
          </Hoverable>

          <div style={css('display:flex;align-items:center;gap:7px')}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20.4 11.8c0 3.8-3.8 6.9-8.4 6.9-1 0-2-.1-2.9-.4L4.4 20.2l1.5-3.5c-1.6-1.3-2.5-3-2.5-4.9 0-3.8 3.8-6.9 8.4-6.9s8.6 3.1 8.6 6.9z" />
            </svg>
            <span style={css('font-size:13px;font-weight:600;color:var(--text-secondary);font-variant-numeric:tabular-nums')}>
              {post.commentCount}
            </span>
          </div>

          <div style={css('flex:1')} />

          <Hoverable
            as="button"
            type="button"
            onClick={toggleBookmark}
            aria-pressed={post.bookmarkedByMe}
            aria-label={post.bookmarkedByMe ? 'Remove bookmark' : 'Bookmark this post'}
            className="row-focus"
            style={css('cursor:pointer;border:0;background:transparent;padding:4px;display:flex')}
            hoverStyle={css('opacity:.78')}
          >
            <svg width="19" height="19" viewBox="0 0 24 24" style={css('display:block')}>
              <path d="M7 4.4h10v16l-5-3.5-5 3.5z"
                fill={post.bookmarkedByMe ? 'var(--accent-ink)' : 'none'}
                stroke={post.bookmarkedByMe ? 'var(--accent-ink)' : 'var(--text-muted)'}
                strokeWidth={1.7} strokeLinejoin="round" />
            </svg>
          </Hoverable>
        </div>

        {error && (
          <div role="alert" style={css('flex:none;margin-top:10px;font-size:12px;color:var(--danger-ink);line-height:1.45')}>
            {error}
          </div>
        )}

        {/* ---- comments ---- */}
        <div style={css('flex:none;margin-top:18px;font-size:13.5px;font-weight:700;letter-spacing:-.2px')}>
          Comments
        </div>

        {comments.loading ? (
          <div style={css('flex:none;margin-top:10px;font-size:12.5px;color:var(--text-faint)')}>Loading comments…</div>
        ) : comments.error ? (
          <div role="alert" style={css('flex:none;margin-top:10px;font-size:12.5px;color:var(--danger-ink);line-height:1.5')}>
            {comments.error}
          </div>
        ) : comments.comments.length === 0 ? (
          <div style={css('flex:none;margin-top:10px;font-size:12.5px;color:var(--text-faint)')}>
            No comments yet — be the first to reply.
          </div>
        ) : comments.comments.map(c => (
          <div
            key={c.id}
            onContextMenu={e => { if (c.isMine || isAdmin) { e.preventDefault(); setConfirmCommentId(c.id); } }}
            style={{
              ...css('flex:none;margin-top:8px;background:var(--surface-inset);border-radius:12px;padding:11px 12px;display:flex;align-items:flex-start;gap:10px'),
              opacity: c.pending ? 0.6 : 1,
            }}
          >
            <Avatar name={c.authorName} avatarKey={null} size={30} fontSize={12} />
            <div style={css('flex:1;display:flex;flex-direction:column;gap:3px;min-width:0')}>
              <div style={css('font-size:12.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>
                {c.authorName}
              </div>
              <div style={css('font-size:12.5px;color:var(--text-muted);line-height:1.5;white-space:pre-wrap;word-break:break-word')}>
                {c.body}
              </div>
              {c.failed && (
                <div style={css('font-size:11px;color:var(--danger-ink)')}>Couldn&rsquo;t send.</div>
              )}
            </div>
            <div style={css('font-size:10.5px;color:var(--text-faint);flex:none;white-space:nowrap')}>
              {c.pending ? 'sending…' : timeAgo(c.createdAt)}
            </div>
            {(c.isMine || isAdmin) && !c.pending && <div style={css('display:flex;flex-direction:column;align-items:flex-end;gap:5px')}>
              <button type="button" aria-label="Comment options" onClick={() => setConfirmCommentId(c.id)} style={css('color:var(--text-muted);font-size:18px;line-height:1')}>⋯</button>
              {confirmCommentId === c.id && <div style={css('display:flex;gap:8px;font-size:11px')}>
                <button type="button" disabled={deletingCommentId === c.id} onClick={() => {
                  setDeletingCommentId(c.id);
                  void comments.deleteComment(c.id).finally(() => { setDeletingCommentId(null); setConfirmCommentId(null); });
                }} style={css('color:var(--danger-ink);font-weight:700')}>{deletingCommentId === c.id ? 'Deleting…' : 'Delete'}</button>
                <button type="button" onClick={() => setConfirmCommentId(null)} style={css('color:var(--text-muted)')}>Cancel</button>
              </div>}
            </div>}
          </div>
        ))}

        {comments.hasMore && (
          <Hoverable
            as="button"
            type="button"
            onClick={comments.loadMore}
            className="row-focus"
            style={css('flex:none;margin-top:10px;padding:8px;border:0;background:transparent;text-align:center;font-size:12px;font-weight:600;color:var(--accent-ink);cursor:pointer')}
            hoverStyle={css('opacity:.75')}
          >
            {comments.loadingMore ? 'Loading…' : 'Load earlier comments'}
          </Hoverable>
        )}

        <div style={css('flex:none;height:14px')} />
      </div>

      {/* ---- composer ---- */}
      <div style={{ ...css('flex:none;padding:10px 18px;display:flex;align-items:center;gap:9px'), paddingBottom: 'calc(10px + var(--nav-space))' }}>
        <div style={css('flex:1;min-width:0;height:42px;border-radius:999px;background:var(--surface-secondary);display:flex;align-items:center;padding:0 16px')}>
          <input
            placeholder={reveal ? 'Write a comment…' : 'Comment as Unknown User…'}
            aria-label="Write a comment"
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void send(); } }}
            style={css('flex:1;min-width:0;font-size:13.5px;height:100%')}
          />
        </div>
        <Hoverable
          as="button"
          type="button"
          onClick={send}
          aria-label="Send comment"
          aria-disabled={!draft.trim() || sending}
          className="pressable row-focus"
          style={{
            ...css('width:40px;height:40px;border-radius:50%;background:var(--accent-soft-2);display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none;border:0'),
            opacity: !draft.trim() || sending ? 0.45 : 1,
            pointerEvents: !draft.trim() || sending ? 'none' : 'auto',
          }}
          hoverStyle={css('background:var(--accent-soft-3)')}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="var(--accent-ink)" style={css('margin-left:-1px')}>
            <path d="M20.8 3.2 3.9 9.9c-.7.3-.6 1.3.1 1.5l6.3 1.9 1.9 6.3c.2.7 1.2.8 1.5.1z" />
          </svg>
        </Hoverable>
      </div>

      <AuthenticatedBottomNav />
    </PhoneShell>
  );
}
