import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { css } from '../lib/css';
import { supabase } from '../lib/supabase';
import { useAppState } from '../lib/app-state';
import { useAuth } from '../lib/auth-context';
import { requestPostUploadUrl, resumePostUploadUrl, uploadPostMedia, type PostMediaKind, type PostUploadTicket } from '../lib/community/media-api';
import { createPollPost } from '../lib/community/polls';
import { probeVideo } from '../lib/media/video-poster';
import type { AttachmentKind, PostChannel } from '../lib/database.types';
import { PhoneShell } from '../components/PhoneShell';
import { AppBackButton } from '../components/ui/AppBackButton';
import { useVoiceRecorder } from '../lib/chat/useVoiceRecorder';
import { formatDuration } from '../lib/chat/types';
import { normalizePickedFile } from '../lib/media/file-types';

const attachBtn = css('width:56px;height:56px;border-radius:15px;background:var(--surface);border:1px solid var(--border-4);box-shadow:0 2px 8px rgba(var(--shadow-rgb),.04);display:flex;align-items:center;justify-content:center');
const attachCol = css('width:62px;display:flex;flex-direction:column;align-items:center;gap:9px;cursor:pointer');
const attachLabel = css('font-size:11.5px;font-weight:500;color:var(--text-tertiary)');

/**
 * Maps a picked file to the attachment kind the backend accepts.
 *
 * 'file' is the catch-all for documents, and it is the LAST branch on purpose:
 * a PDF is both `application/pdf` and a document, and the specific kind is the
 * one that gets the right icon and the right size limit. The server holds the
 * actual allowlist of document MIME types and refuses anything outside it, so
 * returning 'file' here is a proposal rather than permission.
 */
function kindForFile(file: File): PostMediaKind | null {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type === 'application/pdf') return 'pdf';
  if (file.type.startsWith('audio/')) return 'voice';
  if (file.type) return 'file';
  return null;
}

/**
 * What each attachment button offers the picker.
 *
 * All four used to open the same dialog accepting `image/*,video/*,application/pdf`,
 * so "PDF" would happily take a video and the labels meant nothing. Each one
 * now restricts the picker to what it says on it.
 */
const ACCEPT: Record<'image' | 'video' | 'pdf' | 'file', string> = {
  image: 'image/*',
  video: 'video/*',
  pdf: 'application/pdf',
  file: [
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.oasis.opendocument.spreadsheet',
    'application/vnd.oasis.opendocument.presentation',
    'application/zip',
    'text/plain',
    'text/csv',
  ].join(','),
};

const MAX_POLL_OPTIONS = 10;
const MIN_POLL_OPTIONS = 2;

export function CreatePostScreen() {
  const submitRef = useRef(false);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { reveal, toggleReveal, userName } = useAppState();
  const { user, isAdmin } = useAuth();
  const recorder = useVoiceRecorder();

  // Admins compose Official updates via ?channel=official; everything else is
  // a student post. ?edit=<id> reuses this same screen to edit in place.
  const channel: PostChannel = params.get('channel') === 'official' && isAdmin ? 'official' : 'students';
  const editId = params.get('edit');

  const [postText, setPostText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [poster, setPoster] = useState<Blob | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Held after a failed upload so a retry re-sends to the same key rather than
  // stranding the first attempt's bytes in the bucket.
  const [ticket, setTicket] = useState<PostUploadTicket | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  /** What the next picker press should accept. Set by whichever button opened it. */
  const [accept, setAccept] = useState<string>(ACCEPT.image);

  // Poll mode. Two blank options to start with, because two is the minimum a
  // poll can have and starting with one implies one is enough.
  const [pollMode, setPollMode] = useState(false);
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);

  const myIdentity = reveal ? userName : 'Unknown User';

  // Editing: prefill from the existing row.
  useEffect(() => {
    if (!editId) return;
    let active = true;
    supabase.from('posts').select('body, title').eq('id', editId).single().then(({ data }) => {
      if (active && data) setPostText(data.body ?? data.title ?? '');
    });
    return () => { active = false; };
  }, [editId]);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  /** Opens the file dialog restricted to one kind. */
  function openPicker(kind: keyof typeof ACCEPT) {
    // A poll and an uploaded file are different posts; choosing one leaves the
    // other rather than trying to publish both.
    setPollMode(false);
    setAccept(ACCEPT[kind]);
    // The accept attribute is state, so the input has to re-render with the new
    // value before the dialog opens — otherwise the first press of a different
    // button shows the previous filter.
    window.setTimeout(() => fileInput.current?.click(), 0);
  }

  async function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.files?.[0];
    e.target.value = '';
    if (!raw) return;
    const picked = normalizePickedFile(raw);
    if (!kindForFile(picked)) {
      setError('That file type cannot be attached.');
      return;
    }
    setError(null);
    setCanRetry(false);
    setTicket(null);
    setFile(picked);
    setPoster(null);
    setPreviewUrl(picked.type.startsWith('image/') ? URL.createObjectURL(picked) : null);

    // A video gets a poster frame lifted off the file itself, so the feed can
    // show the post without anyone downloading the video first.
    if (picked.type.startsWith('video/')) {
      const probe = await probeVideo(picked);
      if (probe.poster) {
        setPoster(probe.poster.blob);
        setPreviewUrl(URL.createObjectURL(probe.poster.blob));
      }
    }
  }

  async function stopVoice() {
    const clip = await recorder.stop();
    if (!clip) return;
    const extension = clip.mimeType.includes('mp4') ? 'm4a' : clip.mimeType.includes('aac') ? 'aac' : clip.mimeType.includes('ogg') ? 'ogg' : 'webm';
    const voiceFile = new File([clip.blob], `Voice message.${extension}`, { type: clip.mimeType });
    setPollMode(false);
    setFile(voiceFile);
    setPoster(null);
    setTicket(null);
    setCanRetry(false);
    setPreviewUrl(URL.createObjectURL(voiceFile));
    setError(null);
  }

  async function submit() {
    if (busy || submitRef.current || !user) return;

    if (editId && file) {
      setError('Attachments cannot be changed while editing a post.');
      return;
    }

    if (pollMode) {
      const filled = pollOptions.map(o => o.trim()).filter(Boolean);
      if (!postText.trim()) { setError('A poll needs a question.'); return; }
      if (filled.length < MIN_POLL_OPTIONS) { setError(`A poll needs at least ${MIN_POLL_OPTIONS} options.`); return; }

      submitRef.current = true;
      setBusy(true);
      setError(null);
      let result;
      try {
        result = await createPollPost({
          channel,
          question: postText,
          options: pollOptions,
          isAnonymous: channel === 'students' ? !reveal : false,
        });
      } finally { submitRef.current = false; setBusy(false); }
      if (!result.ok) { setError(result.message ?? 'Could not create the poll.'); return; }
      navigate(channel === 'official' ? '/community' : '/community?tab=students', { replace: true });
      return;
    }

    if (!postText.trim() && !file) {
      setError('Write something or attach a file first.');
      return;
    }
    submitRef.current = true;
    setBusy(true);
    setError(null);
    setCanRetry(false);

    try {
      let storageKey: string | null = null;
      let posterKey: string | null = null;
      let attachment: AttachmentKind = 'none';

      if (file) {
        const kind = kindForFile(file)!;
        attachment = kind;
        setProgress(0);
        // Reuse the ticket from a failed attempt while its signature is still
        // good; otherwise ask for a fresh one.
        const uploadArgs = {
          kind,
          mimeType: file.type,
          sizeBytes: file.size,
          posterBytes: poster?.size,
        };
        const active = ticket
          ? await resumePostUploadUrl(ticket, uploadArgs)
          : await requestPostUploadUrl(uploadArgs);
        setTicket(active);

        await uploadPostMedia(active.uploadUrl, file, file.type, setProgress);
        if (active.posterUploadUrl && poster) {
          await uploadPostMedia(active.posterUploadUrl, poster, 'image/jpeg', () => {});
          posterKey = active.posterKey ?? null;
        }
        storageKey = active.storageKey;
        setProgress(null);
      }

      if (editId) {
        const { error: upError } = await supabase.from('posts')
          .update({ body: postText.trim() || null })
          .eq('id', editId);
        if (upError) throw new Error(upError.message);
      } else {
        const { error: insError } = await supabase.from('posts').insert({
          author_id: user.id,
          channel,
          title: channel === 'official' ? (postText.trim().split('\n')[0] || null) : null,
          body: postText.trim() || null,
          attachment,
          storage_key: storageKey,
          poster_key: posterKey,
          poster_size_bytes: poster?.size ?? null,
          mime_type: file?.type ?? null,
          size_bytes: file?.size ?? null,
          file_name: file?.name ?? null,
          is_anonymous: channel === 'students' ? !reveal : false,
        });
        if (insError) throw new Error(insError.message);
      }

      navigate('/community', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not publish the post.');
      setProgress(null);
      setCanRetry(!!file);
    } finally {
      submitRef.current = false;
      setBusy(false);
    }
  }

  return (
    <PhoneShell>
      <div style={css('flex:none;height:52px;display:flex;align-items:center;padding:0 20px;gap:12px')}>
        <AppBackButton fallback="/community" />
        <div style={css('flex:1;text-align:center;font-size:17px;font-weight:700;letter-spacing:-.35px')}>{editId ? 'Edit Post' : 'Create Post'}</div>
        <div onClick={submit} style={{ ...css('font-size:15px;font-weight:700;color:var(--accent-ink);cursor:pointer;flex:none'), opacity: busy ? 0.5 : 1 }}>
          {busy ? 'Posting…' : editId ? 'Save' : pollMode ? 'Create poll' : 'Post'}
        </div>
      </div>
      <div style={css('flex:none;padding:14px 20px 0')}>
        <textarea placeholder={pollMode ? 'Ask your question…' : "What's on your mind?"} value={postText} onChange={e => setPostText(e.target.value)} style={css('width:100%;height:196px;font-size:15px;line-height:1.55')} />
      </div>

      <input ref={fileInput} type="file" accept={accept} onChange={pickFile} style={{ display: 'none' }} />

      {!editId && <div style={css(isAdmin
        ? 'flex:none;padding:6px 20px 0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));justify-items:center;row-gap:14px'
        : 'flex:none;padding:6px 20px 0;display:flex;justify-content:space-between;gap:4px')}>
        <button type="button" onClick={() => openPicker('image')} aria-label="Attach an image" style={attachCol} className="row-focus">
          <span style={attachBtn}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--success-ink)" strokeWidth={1.7} strokeLinejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="3.4" /><circle cx="9" cy="10" r="1.7" /><path d="M4.6 17.4l4.5-4.3 3.3 3.1 2.6-2.4 4.4 4" /></svg></span>
          <span style={attachLabel}>Image</span>
        </button>
        <button type="button" onClick={() => openPicker('video')} aria-label="Attach a video" style={attachCol} className="row-focus">
          <span style={attachBtn}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth={1.7} strokeLinejoin="round"><rect x="3.2" y="6.6" width="12" height="10.8" rx="2.6" /><path d="M15.2 11.2 20.4 8.2v7.6l-5.2-3z" /></svg></span>
          <span style={attachLabel}>Video</span>
        </button>
        <button type="button" onClick={() => openPicker('pdf')} aria-label="Attach a PDF" style={attachCol} className="row-focus">
          <span style={attachBtn}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--danger-ink)" strokeWidth={1.7} strokeLinejoin="round"><path d="M7 3.6h7L18.4 8v12.4H7z" /><path d="M9.6 14.2h4.8" /></svg></span>
          <span style={attachLabel}>PDF</span>
        </button>
        <button type="button" onClick={() => openPicker('file')} aria-label="Attach a document" style={attachCol} className="row-focus">
          <span style={attachBtn}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth={1.7} strokeLinejoin="round"><path d="M5.6 4.4h8.2l4.6 4.6v10.6H5.6z" /><path d="M13.6 4.4V9h4.6" /></svg></span>
          <span style={attachLabel}>File</span>
        </button>
        <button
          type="button"
          onClick={() => {
            // Entering poll mode drops any picked file for the same reason
            // openPicker drops the poll: one post, one attachment.
            setPollMode(v => !v);
            setFile(null); setPreviewUrl(null); setPoster(null); setTicket(null); setCanRetry(false);
            setError(null);
          }}
          aria-pressed={pollMode}
          aria-label="Create a poll"
          style={attachCol}
          className="row-focus"
        >
          <span style={{
            ...attachBtn,
            borderColor: pollMode ? 'var(--accent)' : 'var(--border-4)',
            background: pollMode ? 'var(--accent-tint)' : 'var(--surface)',
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-ink)" strokeWidth={1.9} strokeLinecap="round"><path d="M6 8h12M6 12.5h8.5M6 17h5.5" /></svg>
          </span>
          <span style={{ ...attachLabel, color: pollMode ? 'var(--accent-ink)' : 'var(--text-tertiary)', fontWeight: pollMode ? 700 : 500 }}>Poll</span>
        </button>
        {isAdmin && <button type="button" onClick={() => recorder.recording ? void stopVoice() : void recorder.start()}
          aria-label={recorder.recording ? 'Stop recording voice message' : 'Record voice message'}
          style={attachCol} className="row-focus">
          <span style={{ ...attachBtn, background: recorder.recording ? 'var(--danger-soft)' : 'var(--surface)' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={recorder.recording ? 'var(--danger-ink)' : 'var(--accent-ink)'} strokeWidth={1.8} strokeLinecap="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" /></svg>
          </span>
          <span style={attachLabel}>{recorder.recording ? formatDuration(recorder.seconds) : 'Voice'}</span>
        </button>}
      </div>}

      {recorder.recording && <div style={css('display:flex;align-items:center;justify-content:space-between;margin:12px 20px;color:var(--danger-ink);font-size:12px')}>
        <span>Recording · {formatDuration(recorder.seconds)}</span>
        <button type="button" onClick={recorder.cancel} style={css('color:var(--danger-ink);font-weight:700')}>Cancel</button>
        <button type="button" onClick={() => void stopVoice()} style={css('color:var(--accent-ink);font-weight:700')}>Stop &amp; preview</button>
      </div>}
      {recorder.error && <div role="alert" style={css('padding:8px 20px;color:var(--danger-ink);font-size:12px')}>{recorder.error}</div>}

      {pollMode && (
        <div style={css('flex:none;margin:14px 20px 0;padding:14px;border-radius:14px;border:1px solid var(--accent-border);background:var(--accent-tint);display:flex;flex-direction:column;gap:9px')}>
          <div style={css('font-size:11px;font-weight:700;letter-spacing:.1em;color:var(--accent-ink)')}>
            POLL OPTIONS
          </div>
          <div style={css('font-size:11.5px;color:var(--text-muted);line-height:1.45;text-wrap:pretty')}>
            The text above is the question. Blank options are ignored, so you can
            leave the ones you do not need empty.
          </div>
          {pollOptions.map((value, i) => (
            <div key={i} style={css('display:flex;align-items:center;gap:8px')}>
              <input
                value={value}
                onChange={e => setPollOptions(prev => prev.map((v, j) => (j === i ? e.target.value : v)))}
                placeholder={`Option ${i + 1}`}
                aria-label={`Poll option ${i + 1}`}
                maxLength={120}
                style={css('flex:1;min-width:0;height:42px;border-radius:10px;border:1px solid var(--border-4);background:var(--surface);padding:0 12px;font-size:14px')}
              />
              {pollOptions.length > MIN_POLL_OPTIONS && (
                <button
                  type="button"
                  onClick={() => setPollOptions(prev => prev.filter((_, j) => j !== i))}
                  aria-label={`Remove option ${i + 1}`}
                  className="pressable row-focus"
                  style={css('flex:none;width:32px;height:32px;border-radius:50%;border:0;background:var(--surface);display:flex;align-items:center;justify-content:center;cursor:pointer')}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth={2.6} strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
                </button>
              )}
            </div>
          ))}
          {pollOptions.length < MAX_POLL_OPTIONS && (
            <button
              type="button"
              onClick={() => setPollOptions(prev => [...prev, ''])}
              className="pressable row-focus"
              style={css('align-self:flex-start;height:36px;padding:0 13px;border-radius:9px;border:1px dashed var(--accent-border);background:transparent;font-size:12.5px;font-weight:700;color:var(--accent-ink);cursor:pointer')}
            >
              + Add option
            </button>
          )}
        </div>
      )}

      {channel === 'students' && (
        <div style={css('flex:none;margin:11px 20px 0;border:1px solid var(--border-4);border-radius:12px;padding:13px 14px;display:flex;align-items:center;gap:12px;background:var(--surface)')}>
          <div style={css('flex:1;display:flex;flex-direction:column;gap:3px;min-width:0')}>
            <div style={css('font-size:13.5px;font-weight:700;letter-spacing:-.2px;white-space:nowrap')}>Post with my real name</div>
            <div style={css('font-size:11.5px;color:var(--text-muted);line-height:1.4')}>Members will see <strong style={css('color:var(--text-secondary);font-weight:700')}>{myIdentity}</strong> · admins always see your real name</div>
          </div>
          <div onClick={toggleReveal} style={{ width: 44, height: 26, borderRadius: 999, flex: 'none', cursor: 'pointer', padding: 3, display: 'flex', alignItems: 'center', justifyContent: reveal ? 'flex-end' : 'flex-start', background: reveal ? 'var(--accent)' : 'var(--switch-track)', transition: 'background .18s ease' }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--surface)', boxShadow: '0 1px 3px rgba(var(--shadow-rgb),.28)' }} />
          </div>
        </div>
      )}

      {error && (
        <div style={css('flex:none;padding:12px 20px 0;display:flex;align-items:center;gap:10px')}>
          <div style={css('flex:1;font-size:12px;color:var(--danger-ink);line-height:1.4')}>{error}</div>
          {canRetry && !busy && (
            <div onClick={submit} style={css('flex:none;font-size:12px;font-weight:700;color:var(--accent-ink);cursor:pointer;white-space:nowrap')}>Retry</div>
          )}
        </div>
      )}

      {/* Only ever shown once a file is actually picked. This used to be an
          unconditional tile that rendered a fake candlestick chart whenever
          there was nothing to preview — including for a plain text post,
          where it sat there for the whole time someone was composing,
          suggesting their post was somehow about a trading chart. A picked
          PDF (or a video mid-poster-probe) still has no image to preview, so
          that case now shows the real filename instead of invented imagery,
          rather than the tile disappearing and losing its cancel button. */}
      {file && (
      <div style={{ ...css('flex:none;padding:22px 20px 0'), display: pollMode ? 'none' : 'block' }}>
        <div style={css('position:relative;width:122px;height:156px;border-radius:14px;overflow:hidden;box-shadow:0 6px 18px rgba(var(--shadow-rgb),.14)')}>
          {previewUrl && file.type.startsWith('audio/') ? (
            <div style={css('width:100%;height:100%;background:var(--surface-secondary);display:flex;align-items:center;justify-content:center;padding:8px')}>
              <audio src={previewUrl} controls preload="metadata" style={css('width:100%')} />
            </div>
          ) : previewUrl ? (
            <img src={previewUrl} alt="Attachment preview" style={css('width:100%;height:100%;object-fit:contain;display:block;background:var(--surface-sunken-2)')} />
          ) : (
            <div style={css('width:100%;height:100%;background:var(--surface-sunken-2);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:0 12px')}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth={1.7} strokeLinejoin="round"><path d="M7 3.6h7L18.4 8v12.4H7z" /><path d="M9.6 14.2h4.8" /></svg>
              <div style={css('font-size:10.5px;color:var(--text-faint);text-align:center;line-height:1.4;word-break:break-word')}>{file.name}</div>
            </div>
          )}
          {progress !== null && (
            <div style={css('position:absolute;inset:0;background:rgba(var(--shadow-rgb),.4);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:var(--on-accent)')}>
              {Math.round(progress * 100)}%
            </div>
          )}
          {file && progress === null && (
            <div onClick={() => { setFile(null); setPreviewUrl(null); setPoster(null); setTicket(null); setCanRetry(false); }} style={css('position:absolute;top:8px;right:8px;width:24px;height:24px;border-radius:50%;background:var(--ink-chip);display:flex;align-items:center;justify-content:center;cursor:pointer')}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--on-accent)" strokeWidth={2.6} strokeLinecap="round"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></svg>
            </div>
          )}
        </div>
      </div>
      )}
      <div style={css('flex:1')} />
    </PhoneShell>
  );
}
