import { useState } from 'react';
import { css } from '../../lib/css';
import { formatDuration, type ChatMessage } from '../../lib/chat/types';
import { useMediaUrl, usePosterUrl } from './useMediaUrl';
import { FailedNote, MetaRow } from './bubble-parts';
import { MediaActions } from '../media/MediaActions';
import { getMediaUrl } from '../../lib/chat/media-api';
import { VideoViewer } from '../media/VideoViewer';

const SIZE = 184;
const RING = 3;
const RADIUS = (SIZE - RING) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * A ring drawn around the circle's edge. Doubles as the upload gauge before
 * the message is sent and the playback gauge afterwards.
 */
function ProgressRing({ fraction, color }: { fraction: number; color: string }) {
  const clamped = Math.max(0, Math.min(1, fraction));
  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      style={css('position:absolute;inset:0;pointer-events:none;transform:rotate(-90deg)')}
    >
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        fill="none"
        stroke={color}
        strokeWidth={RING}
        strokeLinecap="round"
        strokeDasharray={CIRCUMFERENCE}
        strokeDashoffset={CIRCUMFERENCE * (1 - clamped)}
        style={{ transition: 'stroke-dashoffset .12s linear' }}
      />
    </svg>
  );
}

function PlayGlyph({ paused }: { paused: boolean }) {
  return (
    <div style={css('width:46px;height:46px;border-radius:50%;background:rgba(var(--shadow-rgb),.55);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center')}>
      {paused
        ? <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--on-accent)" style={css('margin-left:2px')}><path d="M8.5 5.5l10 6.5-10 6.5z" /></svg>
        : <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--on-accent)"><rect x="6.5" y="5" width="4" height="14" rx="1.2" /><rect x="13.5" y="5" width="4" height="14" rx="1.2" /></svg>}
    </div>
  );
}

function Spinner() {
  return (
    <div style={css('width:34px;height:34px;border-radius:50%;border:2.5px solid rgba(255,255,255,.35);border-top-color:var(--border-on-accent);animation:tp-spin .8s linear infinite')}>
      <style>{'@keyframes tp-spin{to{transform:rotate(360deg)}}'}</style>
    </div>
  );
}

/**
 * A video message, shown as a compact circle rather than a rectangle — the
 * shape a short "look at this" clip has settled on across messaging apps.
 *
 * Nothing about the video downloads until it is asked for: the circle shows the
 * uploaded poster frame, and only a tap resolves a signed URL and starts
 * loading bytes. Playback never starts on its own, so a thread full of clips
 * stays silent and cheap.
 */
export function CircularVideoBubble({ message, out, onRetry }: {
  message: ChatMessage;
  out: boolean;
  onRetry: () => void;
}) {
  const [viewerOpen, setViewerOpen] = useState(false);

  const poster = usePosterUrl(message);
  const media = useMediaUrl(message, viewerOpen);

  const uploading = message.status === 'uploading';
  const failed = message.status === 'failed';
  const total = message.durationSeconds ?? 0;

  function openViewer() {
    if (message.mediaPurged || uploading) return;
    if (failed) {
      onRetry();
      return;
    }
    setViewerOpen(true);
  }

  const ringFraction = message.progress ?? 0;
  const ringColor = uploading ? 'var(--accent-ink)' : failed ? 'var(--danger-ink)' : 'rgba(255,255,255,.9)';

  return (
    <div style={css('display:flex;flex-direction:column;gap:6px;align-items:flex-end')}>
      <div
        // The poster is lightweight; video bytes are requested only on open.
        ref={node => { poster.ref(node); media.ref(node); }}
        onClick={openViewer}
        style={{
          position: 'relative',
          width: SIZE,
          height: SIZE,
          borderRadius: '50%',
          overflow: 'hidden',
          background: 'var(--ink-chip)',
          cursor: message.mediaPurged ? 'default' : 'pointer',
          flex: 'none',
          boxShadow: '0 4px 16px rgba(var(--shadow-rgb),.16)',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {message.mediaPurged ? (
          <div style={css('width:100%;height:100%;display:flex;align-items:center;justify-content:center;text-align:center;font-size:11px;color:var(--text-dim-2);padding:0 26px;line-height:1.45')}>
            Removed to stay within your 100 MB storage limit
          </div>
        ) : (
          <>
            {poster.url && (
              <img
                src={poster.url}
                onError={poster.retry}
                alt={message.fileName ?? 'Video message'}
                decoding="async"
                style={css('width:100%;height:100%;object-fit:cover;display:block')}
              />
            )}
            <div style={css('position:absolute;inset:0;display:flex;align-items:center;justify-content:center')}>
              {uploading ? (
                <div style={css('font-size:14px;font-weight:700;color:var(--on-accent);text-shadow:0 1px 6px rgba(var(--shadow-rgb),.5)')}>
                  {Math.round((message.progress ?? 0) * 100)}%
                </div>
              ) : viewerOpen && media.loading ? (
                <Spinner />
              ) : media.failed ? (
                <button type="button" onClick={event => { event.stopPropagation(); media.forceRetry(); }} style={css('font-size:11px;color:var(--on-accent);background:rgba(0,0,0,.65);padding:8px 10px;border-radius:10px')}>
                  Try again
                </button>
              ) : (
                <PlayGlyph paused />
              )}
            </div>

            {uploading && <ProgressRing fraction={ringFraction} color={ringColor} />}

            {total > 0 && !uploading && (
              <div style={css('position:absolute;left:0;right:0;bottom:12px;display:flex;justify-content:center;pointer-events:none')}>
                <div style={css('padding:2px 9px;border-radius:999px;background:rgba(var(--shadow-rgb),.55);font-size:10.5px;font-weight:600;color:var(--on-accent);letter-spacing:.1px')}>
                  {formatDuration(total)}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div style={css('display:flex;flex-direction:column;gap:5px;padding-right:4px')}>
        {!message.mediaPurged && message.status === 'sent' && <MediaActions storageKey={message.storageKey} fileName={message.fileName} getUrl={getMediaUrl} />}
        <FailedNote message={message} onRetry={onRetry} />
        <MetaRow message={message} out={out} />
      </div>
      {viewerOpen && <VideoViewer
        src={media.url}
        poster={poster.url}
        fileName={message.fileName}
        loading={media.loading}
        error={media.failed ? media.error ?? 'Could not load this video.' : null}
        onRetry={media.forceRetry}
        onClose={() => setViewerOpen(false)}
      />}
    </div>
  );
}
