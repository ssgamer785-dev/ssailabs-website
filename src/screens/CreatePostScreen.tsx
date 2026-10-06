import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { css } from '../lib/css';
import { supabase } from '../lib/supabase';
import { useAppState } from '../lib/app-state';
import { officialHeadline } from '../lib/community/display-body';
import { useAuth } from '../lib/auth-context';
import type { PostMediaKind } from '../lib/community/media-api';
import { knownMultiMediaSupport, multiMediaSupport, publishPostWithMedia, uploadDraftAttachment, type DraftAttachment, type MultiMediaSupport, type UploadedAttachment } from '../lib/community/multi-media';
import { requestCopies } from '../lib/media/media-cache';
import { UploadQueue, type UploadItem } from '../lib/media/upload-queue';
import { measureImage } from '../lib/media/dimensions';
import { AttachmentTray } from '../components/community/AttachmentTray';
import { createPollPost } from '../lib/community/polls';
import { probeVideo } from '../lib/media/video-poster';
import type { AttachmentKind, PostChannel } from '../lib/database.types';
import { PhoneShell } from '../components/PhoneShell';
import { AppBackButton } from '../components/ui/AppBackButton';
import { useVoiceRecorder } from '../lib/chat/useVoiceRecorder';
import { formatDuration } from '../lib/chat/types';
import { normalizePickedFile } from '../lib/media/file-types';
import { PortableImageError, toPortableImage } from '../lib/media/portable-image';

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
/** Attachments in one post (the database allows 50; a post is not an album dump). */
const MAX_ATTACHMENTS = 30;
/** Said whenever the database cannot hold several attachments in one post (before the RC5 migration). */
const ONE_PER_POST = 'until the RC5 database update is applied, a post holds one attachment.';

/** One picked attachment, with what its tile shows. */
interface Attachment extends DraftAttachment { previewUrl: string | null }
type AttachmentItem = UploadItem<Attachment, UploadedAttachment>;
const MIN_POLL_OPTIONS = 2;

export function CreatePostScreen() {
  const submitRef = useRef(false);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { reveal: revealDefault, userName } = useAppState();
  // This post's own choice, starting from the member's saved default. Flipping
  // it here does not change the default (that lives on Name Visibility).
  const [reveal, setReveal] = useState(revealDefault);
  const toggleReveal = () => setReveal(v => !v);
  const { user, isAdmin } = useAuth();
  const recorder = useVoiceRecorder();

  // Admins compose Official updates via ?channel=official; everything else is
  // a student post. ?edit=<id> reuses this same screen to edit in place.
  const channel: PostChannel = params.get('channel') === 'official' && isAdmin ? 'official' : 'students';
  const editId = params.get('edit');

  const [postText, setPostText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  // Attachments upload through one queue: a few at a time, each with its own
  // progress, retry and cancel. A finished item keeps its upload, so posting
  // again after a failure never uploads (or publishes) it twice; a retried
  // item re-sends to its own key, so nothing is left behind in storage.
  const [items, setItems] = useState<AttachmentItem[]>([]);
  const queueRef = useRef<UploadQueue<Attachment, UploadedAttachment> | null>(null);
  queueRef.current ??= new UploadQueue<Attachment, UploadedAttachment>({
    concurrency: 3,
    run: (item, signal, onProgress) => uploadDraftAttachment(item.payload, signal, onProgress),
    onChange: next => setItems([...next]),
  });
  const queue = queueRef.current;
  // Several attachments per post need the RC5 database. The picker takes many unless the database has said it
  // cannot hold them: a slow or failed answer must never turn a member's pick into a single file.
  const [support, setSupport] = useState<MultiMediaSupport>(knownMultiMediaSupport);
  useEffect(() => {
    let live = true;
    void multiMediaSupport().then(answer => { if (live) setSupport(answer); });
    return () => { live = false; };
  }, []);
  const oneOnly = support === 'no';
  const overall = queue.overall();
  const failedCount = items.filter(i => i.state === 'failed').length;
  const hasVoice = items.some(i => i.payload.kind === 'voice');
  const canRetry = failedCount > 0;
  /** What the next picker press should accept. Set by whichever button opened it. */
  const [accept, setAccept] = useState<string>(ACCEPT.image);

  // Poll mode. Two blank options to start with, because two is the minimum a
  // poll can have and starting with one implies one is enough.
  const [pollMode, setPollMode] = useState(false);
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);

  const myIdentity = reveal ? userName : 'Unknown User';

  // Editing: prefill from the existing row, and remember its channel so the
  // headline of an Official post can follow the edit.
  const [editChannel, setEditChannel] = useState<string | null>(null);
  useEffect(() => {
    if (!editId) return;
    let active = true;
    supabase.from('posts').select('body, title, channel').eq('id', editId).single().then(({ data }) => {
      if (active && data) { setPostText(data.body ?? data.title ?? ''); setEditChannel(data.channel); }
    });
    return () => { active = false; };
  }, [editId]);

  // Leaving the screen stops every transfer and frees every preview.
  useEffect(() => () => {
    queue.cancelAll();
    for (const item of queue.list()) if (item.payload.previewUrl) URL.revokeObjectURL(item.payload.previewUrl);
  }, [queue]);

  function clearAttachments() {
    for (const item of queue.list()) {
      if (item.payload.previewUrl) URL.revokeObjectURL(item.payload.previewUrl);
      queue.remove(item.id);
    }
  }

  function removeAttachment(id: string) {
    const item = queue.list().find(i => i.id === id);
    if (item?.payload.previewUrl) URL.revokeObjectURL(item.payload.previewUrl);
    queue.remove(id);
  }

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
    const picked = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (!picked.length) return;
    // Every picked file is kept, after the ones already picked — unless the database cannot hold several
    // attachments per post yet (asked now when it has not answered): then a post keeps one, and says so.
    const answer = support === 'unknown' ? await multiMediaSupport() : support;
    if (answer !== support) setSupport(answer);
    const many = answer !== 'no';
    if (!many || hasVoice) clearAttachments();
    const room = many ? MAX_ATTACHMENTS - (hasVoice ? 0 : queue.list().length) : 1;
    const chosen = picked.slice(0, Math.max(0, room));
    const problems: string[] = [];
    for (const raw of chosen) {
      let file = normalizePickedFile(raw);
      try { file = await toPortableImage(file); }
      catch (error) {
        if (error instanceof PortableImageError) { problems.push(`${raw.name}: ${error.message}`); continue; }
        throw error;
      }
      const kind = kindForFile(file);
      if (!kind || kind === 'voice') { problems.push(`${raw.name}: this file type cannot be attached.`); continue; }
      let poster: Blob | null = null;
      let previewUrl: string | null = file.type.startsWith('image/') ? URL.createObjectURL(file) : null;
      let size = kind === 'image' ? await measureImage(file) : null;
      // A video gets a poster frame lifted off the file itself, so the feed can
      // show the post without anyone downloading the video first.
      if (kind === 'video') {
        const probe = await probeVideo(file);
        if (probe.poster) {
          poster = probe.poster.blob;
          previewUrl = URL.createObjectURL(poster);
          size = { width: probe.poster.width, height: probe.poster.height };
        }
      }
      // Into the tray as soon as it is ready, in the order picked: twelve photos fill it one by one, not all at the end.
      queue.add([{ file, kind, poster, size, previewUrl }], false);
    }
    if (picked.length > chosen.length) {
      problems.push(many
        ? `A post holds up to ${MAX_ATTACHMENTS} attachments; the rest were not added.`
        : `Only the first of the ${picked.length} files was added: ${ONE_PER_POST}`);
    }
    setError(problems.length ? problems.join(' ') : null);
  }

  async function stopVoice() {
    const clip = await recorder.stop();
    if (!clip) return;
    const extension = clip.mimeType.includes('mp4') ? 'm4a' : clip.mimeType.includes('aac') ? 'aac' : clip.mimeType.includes('ogg') ? 'ogg' : 'webm';
    const voiceFile = new File([clip.blob], `Voice message.${extension}`, { type: clip.mimeType });
    setPollMode(false);
    // A voice post is a voice note on its own.
    clearAttachments();
    queue.add([{ file: voiceFile, kind: 'voice', poster: null, size: null, previewUrl: URL.createObjectURL(voiceFile) }], false);
    setError(null);
  }

  async function submit() {
    if (busy || submitRef.current || !user) return;

    if (editId && items.length) {
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

    if (!postText.trim() && !items.length) {
      setError('Write something or attach a file first.');
      return;
    }
    submitRef.current = true;
    setBusy(true);
    setError(null);

    try {
      // Upload whatever is not uploaded yet (a cancelled item is sent again on
      // Post); finished items keep their upload.
      for (const item of queue.list()) if (item.state === 'cancelled') queue.retry(item.id);
      queue.start();
      await queue.whenSettled();
      const all = queue.list();
      const failed = all.filter(i => i.state === 'failed');
      if (failed.length) {
        setError(`${failed.length} of ${all.length} attachment${all.length === 1 ? '' : 's'} did not upload. Retry ${failed.length === 1 ? 'it' : 'them'}, or remove ${failed.length === 1 ? 'it' : 'them'} to post the rest.`);
        return;
      }
      const uploads = all.filter(i => i.state === 'done' && i.result).map(i => i.result!);
      // Every attachment may have been cancelled while it uploaded: never publish an empty post.
      if (!postText.trim() && !uploads.length) {
        setError('Write something or attach a file first.');
        return;
      }
      // What the database can hold, asked again if it had not answered yet.
      const answer = support === 'unknown' ? await multiMediaSupport() : support;
      if (answer !== support) setSupport(answer);
      if (uploads.length > 1 && answer === 'no') {
        setError(`This post has ${uploads.length} attachments: ${ONE_PER_POST} Remove all but one to post now.`);
        return;
      }

      if (editId) {
        // An Official headline is the first line, as when the post was made;
        // editing only the body left Home and the detail view on the old one.
        const headline = officialHeadline(postText);
        const { error: upError } = await supabase.from('posts')
          .update(editChannel === 'official' ? { body: postText.trim() || null, title: headline } : { body: postText.trim() || null })
          .eq('id', editId);
        if (upError) throw new Error(upError.message);
      } else if (answer !== 'no' && (answer === 'yes' || uploads.length > 1) && !uploads.some(u => u.kind === 'voice')) {
        // The post and all its attachments in one transaction: nobody ever sees half a post.
        await publishPostWithMedia({
          authorId: user.id,
          channel,
          title: channel === 'official' ? officialHeadline(postText) : null,
          body: postText.trim() || null,
          isAnonymous: channel === 'students' ? !reveal : false,
        }, uploads);
      } else {
        const first = uploads[0];
        const attachment: AttachmentKind = first?.kind ?? 'none';
        const { error: insError } = await supabase.from('posts').insert({
          author_id: user.id,
          channel,
          title: channel === 'official' ? officialHeadline(postText) : null,
          body: postText.trim() || null,
          attachment,
          storage_key: first?.storageKey ?? null,
          poster_key: first?.posterKey ?? null,
          poster_size_bytes: first?.posterSizeBytes ?? null,
          mime_type: first?.mimeType ?? null,
          size_bytes: first?.sizeBytes ?? null,
          file_name: first?.fileName ?? null,
          is_anonymous: channel === 'students' ? !reveal : false,
        });
        if (insError) throw new Error(insError.message);
      }

      // The new pictures' display copies are made now, so every member's feed draws those rather than the originals.
      if (!editId) void requestCopies('post', uploads.filter(u => u.kind === 'image').map(u => u.storageKey));
      navigate('/community', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not publish the post.');
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

      {/* One press of Image, Video, PDF or File picks as many as the member likes (never `capture`, which would
          open the camera alone and allow one shot): iPhone offers Photo Library, Take Photo and Choose Files,
          Android its photo picker, camera and files, a computer its file dialog. */}
      <input ref={fileInput} type="file" accept={accept} multiple={!oneOnly} onChange={pickFile} style={{ display: 'none' }} />

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
            clearAttachments();
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

      {oneOnly && !editId && (
        <div role="note" style={css('flex:none;margin:10px 20px 0;padding:9px 12px;border-radius:10px;background:var(--surface-secondary);font-size:11.5px;color:var(--text-muted);line-height:1.45')}>
          One attachment per post until the RC5 database update is applied. After it, several photos, videos and files in one post switch on by themselves.
        </div>
      )}

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
          <button type="button" role="switch" aria-checked={reveal} aria-label="Post with my real name" onClick={toggleReveal} style={{ width: 44, height: 26, borderRadius: 999, flex: 'none', cursor: 'pointer', padding: 3, display: 'flex', alignItems: 'center', justifyContent: reveal ? 'flex-end' : 'flex-start', background: reveal ? 'var(--accent)' : 'var(--switch-track)', transition: 'background .18s ease' }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--surface)', boxShadow: '0 1px 3px rgba(var(--shadow-rgb),.28)' }} />
          </button>
        </div>
      )}

      {error && (
        <div style={css('flex:none;padding:12px 20px 0;display:flex;align-items:center;gap:10px')}>
          <div style={css('flex:1;font-size:12px;color:var(--danger-ink);line-height:1.4')}>{error}</div>
          {canRetry && !busy && (
            <div onClick={() => { queue.retryFailed(); void submit(); }} style={css('flex:none;font-size:12px;font-weight:700;color:var(--accent-ink);cursor:pointer;white-space:nowrap')}>Retry</div>
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
      {items.length > 0 && !pollMode && (
        <AttachmentTray
          items={items}
          busy={busy}
          overall={overall}
          onRemove={removeAttachment}
          onCancel={removeAttachment}
          onRetry={id => queue.retry(id)}
          onMove={(id, to) => queue.move(id, to)}
          onCancelAll={() => queue.cancelAll()}
        />
      )}
      <div style={css('flex:1')} />
    </PhoneShell>
  );
}
