import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { css } from '../lib/css';
import { supabase } from '../lib/supabase';
import { useAppState } from '../lib/app-state';
import { useAuth } from '../lib/auth-context';
import { requestPostUploadUrl, uploadPostMedia, type PostMediaKind, type PostUploadTicket } from '../lib/community/media-api';
import { probeVideo } from '../lib/media/video-poster';
import type { AttachmentKind, PostChannel } from '../lib/database.types';
import { StatusBar } from '../components/StatusBar';
import { CandleChart } from '../components/CandleChart';
import { PhoneShell } from '../components/PhoneShell';

const attachBtn = css('width:56px;height:56px;border-radius:15px;background:#FFFFFF;border:1px solid #EAEEF4;box-shadow:0 2px 8px rgba(15,23,42,.04);display:flex;align-items:center;justify-content:center');
const attachCol = css('width:62px;display:flex;flex-direction:column;align-items:center;gap:9px;cursor:pointer');
const attachLabel = css('font-size:11.5px;font-weight:500;color:#475569');

/** Maps a picked file to the attachment kind the backend accepts. */
function kindForFile(file: File): PostMediaKind | null {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('video/')) return 'video';
  if (file.type === 'application/pdf') return 'pdf';
  return null;
}

export function CreatePostScreen() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { reveal, toggleReveal, userName } = useAppState();
  const { user, isAdmin } = useAuth();

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

  async function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = e.target.files?.[0];
    e.target.value = '';
    if (!picked) return;
    if (!kindForFile(picked)) {
      setError('Only images, videos and PDFs can be attached.');
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

  async function submit() {
    if (busy || !user) return;
    if (!postText.trim() && !file) {
      setError('Write something or attach a file first.');
      return;
    }
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
        const active = ticket ?? await requestPostUploadUrl({
          kind,
          mimeType: file.type,
          sizeBytes: file.size,
          posterBytes: poster?.size,
        });
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
      setBusy(false);
    }
  }

  return (
    <PhoneShell>
      <StatusBar />
      <div style={css('flex:none;height:52px;display:flex;align-items:center;padding:0 20px;gap:12px')}>
        <svg onClick={() => navigate(-1)} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" style={css('cursor:pointer;flex:none')}><path d="M14.5 5.5l-7 6.5 7 6.5" /></svg>
        <div style={css('flex:1;text-align:center;font-size:17px;font-weight:700;letter-spacing:-.35px')}>{editId ? 'Edit Post' : 'Create Post'}</div>
        <div onClick={submit} style={{ ...css('font-size:15px;font-weight:700;color:#0B5FEF;cursor:pointer;flex:none'), opacity: busy ? 0.5 : 1 }}>
          {busy ? 'Posting…' : editId ? 'Save' : 'Post'}
        </div>
      </div>
      <div style={css('flex:none;padding:14px 20px 0')}>
        <textarea placeholder="What's on your mind?" value={postText} onChange={e => setPostText(e.target.value)} style={css('width:100%;height:196px;font-size:15px;line-height:1.55')} />
      </div>

      <input ref={fileInput} type="file" accept="image/*,video/*,application/pdf" onChange={pickFile} style={{ display: 'none' }} />

      <div style={css('flex:none;padding:6px 20px 0;display:flex;justify-content:space-between')}>
        <div style={attachCol} onClick={() => fileInput.current?.click()}>
          <div style={attachBtn}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth={1.7} strokeLinejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="3.4" /><circle cx="9" cy="10" r="1.7" /><path d="M4.6 17.4l4.5-4.3 3.3 3.1 2.6-2.4 4.4 4" /></svg></div>
          <div style={attachLabel}>Image</div>
        </div>
        <div style={attachCol} onClick={() => fileInput.current?.click()}>
          <div style={attachBtn}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0B5FEF" strokeWidth={1.7} strokeLinejoin="round"><rect x="3.2" y="6.6" width="12" height="10.8" rx="2.6" /><path d="M15.2 11.2 20.4 8.2v7.6l-5.2-3z" /></svg></div>
          <div style={attachLabel}>Video</div>
        </div>
        <div style={attachCol} onClick={() => fileInput.current?.click()}>
          <div style={attachBtn}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth={1.7} strokeLinejoin="round"><path d="M7 3.6h7L18.4 8v12.4H7z" /><path d="M9.6 14.2h4.8" /></svg></div>
          <div style={attachLabel}>PDF</div>
        </div>
        <div style={attachCol}>
          <div style={attachBtn}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#0B5FEF" strokeWidth={1.9} strokeLinecap="round"><path d="M6 8h12M6 12.5h8.5M6 17h5.5" /></svg></div>
          <div style={attachLabel}>Poll</div>
        </div>
      </div>

      <div style={css('flex:none;margin:20px 20px 0;height:52px;border:1px solid #EAEEF4;border-radius:12px;display:flex;align-items:center;padding:0 14px;gap:10px;cursor:pointer;background:#fff')}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth={1.6} strokeLinejoin="round" style={css('flex:none')}><circle cx="12" cy="12" r="8.4" /><path d="M3.6 12h16.8" /><path d="M12 3.6c2.2 2.3 3.3 5.2 3.3 8.4S14.2 18.1 12 20.4c-2.2-2.3-3.3-5.2-3.3-8.4S9.8 5.9 12 3.6z" /></svg>
        <div style={css('font-size:14.5px;font-weight:600')}>{channel === 'official' ? 'Official' : 'Public'}</div>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#0F172A" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" style={css('flex:none')}><path d="M6 9.5l6 6 6-6" /></svg>
        <div style={css('flex:1')} />
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#C2CAD6" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" style={css('flex:none')}><path d="M9 6l6 6-6 6" /></svg>
      </div>

      {channel === 'students' && (
        <div style={css('flex:none;margin:11px 20px 0;border:1px solid #EAEEF4;border-radius:12px;padding:13px 14px;display:flex;align-items:center;gap:12px;background:#fff')}>
          <div style={css('flex:1;display:flex;flex-direction:column;gap:3px;min-width:0')}>
            <div style={css('font-size:13.5px;font-weight:700;letter-spacing:-.2px;white-space:nowrap')}>Post with my real name</div>
            <div style={css('font-size:11.5px;color:#64748B;line-height:1.4')}>Members will see <strong style={css('color:#334155;font-weight:700')}>{myIdentity}</strong> · admins always see your real name</div>
          </div>
          <div onClick={toggleReveal} style={{ width: 44, height: 26, borderRadius: 999, flex: 'none', cursor: 'pointer', padding: 3, display: 'flex', alignItems: 'center', justifyContent: reveal ? 'flex-end' : 'flex-start', background: reveal ? '#0B5FEF' : '#D5DBE5', transition: 'background .18s ease' }}>
            <div style={{ width: 20, height: 20, borderRadius: '50%', background: '#FFFFFF', boxShadow: '0 1px 3px rgba(15,23,42,.28)' }} />
          </div>
        </div>
      )}

      {error && (
        <div style={css('flex:none;padding:12px 20px 0;display:flex;align-items:center;gap:10px')}>
          <div style={css('flex:1;font-size:12px;color:#EF4444;line-height:1.4')}>{error}</div>
          {canRetry && !busy && (
            <div onClick={submit} style={css('flex:none;font-size:12px;font-weight:700;color:#0B5FEF;cursor:pointer;white-space:nowrap')}>Retry</div>
          )}
        </div>
      )}

      <div style={css('flex:none;padding:22px 20px 0')}>
        <div style={css('position:relative;width:122px;height:156px;border-radius:14px;overflow:hidden;box-shadow:0 6px 18px rgba(15,23,42,.14)')}>
          {previewUrl
            ? <img src={previewUrl} alt="Attachment preview" style={css('width:100%;height:100%;object-fit:cover;display:block')} />
            : <CandleChart seed={21} stamp="10:31 AM" />}
          {progress !== null && (
            <div style={css('position:absolute;inset:0;background:rgba(15,23,42,.4);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:700;color:#fff')}>
              {Math.round(progress * 100)}%
            </div>
          )}
          {file && progress === null && (
            <div onClick={() => { setFile(null); setPreviewUrl(null); setPoster(null); setTicket(null); setCanRetry(false); }} style={css('position:absolute;top:8px;right:8px;width:24px;height:24px;border-radius:50%;background:#0F172A;display:flex;align-items:center;justify-content:center;cursor:pointer')}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2.6} strokeLinecap="round"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11" /></svg>
            </div>
          )}
        </div>
      </div>
      <div style={css('flex:1')} />
    </PhoneShell>
  );
}
