import { useEffect, useRef, useState } from 'react';
import { css } from '../../lib/css';
import { formatDuration, type ChatMessage } from '../../lib/chat/types';
import { useMediaUrl, usePosterUrl } from './useMediaUrl';
import { FailedNote, MetaRow } from './bubble-parts';

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
    <div style={css('width:46px;height:46px;border-radius:50%;background:rgba(15,23,42,.55);backdrop-filter:blur(2px);display:flex;align-items:center;justify-content:center')}>
      {paused
        ? <svg width="18" height="18" viewBox="0 0 24 24" fill="#FFFFFF" style={css('margin-left:2px')}><path d="M8.5 5.5l10 6.5-10 6.5z" /></svg>
        : <svg width="16" height="16" viewBox="0 0 24 24" fill="#FFFFFF"><rect x="6.5" y="5" width="4" height="14" rx="1.2" /><rect x="13.5" y="5" width="4" height="14" rx="1.2" /></svg>}
    </div>
  );
}

function Spinner() {
  return (
    <div style={css('width:34px;height:34px;border-radius:50%;border:2.5px solid rgba(255,255,255,.35);border-top-color:#FFFFFF;animation:tp-spin .8s linear infinite')}>
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
  const [wanted, setWanted] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);

  const poster = usePosterUrl(message);
  // `armed` only once the viewer has asked for it — this is what keeps the
  // video bytes off the wire until then.
  const media = useMediaUrl(message, wanted);

  const uploading = message.status === 'uploading';
  const failed = message.status === 'failed';
  const total = message.durationSeconds ?? 0;

  // Autoplay once the source is ready, but only because a tap asked for it.
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !wanted || !media.url) return;
    el.play().then(() => setPlaying(true)).catch(() => setPlaying(false));
  }, [wanted, media.url]);

  function toggle() {
    if (message.mediaPurged || uploading) return;
    if (failed) {
      onRetry();
      return;
    }
    if (!wanted) {
      setWanted(true);
      return;
    }
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) {
      el.play().then(() => setPlaying(true)).catch(() => {});
    } else {
      el.pause();
      setPlaying(false);
    }
  }

  const showVideo = wanted && !!media.url && !message.mediaPurged;
  const loadingVideo = wanted && !media.url && !media.failed && !message.mediaPurged;
  const ringFraction = uploading ? (message.progress ?? 0) : progress;
  const ringColor = uploading ? '#0B5FEF' : failed ? '#EF4444' : 'rgba(255,255,255,.9)';

  return (
    <div style={css('display:flex;flex-direction:column;gap:6px;align-items:flex-end')}>
      <div
        // Both hooks watch the same element: the poster resolves as soon as the
        // circle nears the viewport, the video only once a tap has armed it.
        ref={node => { poster.ref(node); media.ref(node); }}
        onClick={toggle}
        style={{
          position: 'relative',
          width: SIZE,
          height: SIZE,
          borderRadius: '50%',
          overflow: 'hidden',
          background: '#0F172A',
          cursor: message.mediaPurged ? 'default' : 'pointer',
          flex: 'none',
          boxShadow: '0 4px 16px rgba(15,23,42,.16)',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {message.mediaPurged ? (
          <div style={css('width:100%;height:100%;display:flex;align-items:center;justify-content:center;text-align:center;font-size:11px;color:#CBD5E1;padding:0 26px;line-height:1.45')}>
            Removed to stay within your 100 MB storage limit
          </div>
        ) : (
          <>
            {poster.url && !showVideo && (
              <img
                src={poster.url}
                alt={message.fileName ?? 'Video message'}
                decoding="async"
                style={css('width:100%;height:100%;object-fit:cover;display:block')}
              />
            )}
            {showVideo && (
              <video
                ref={videoRef}
                src={media.url ?? undefined}
                poster={poster.url ?? undefined}
                playsInline
                // Never preloads: the src only exists after a tap.
                preload="none"
                onTimeUpdate={e => {
                  const el = e.currentTarget;
                  setElapsed(el.currentTime);
                  if (el.duration) setProgress(el.currentTime / el.duration);
                }}
                onEnded={() => { setPlaying(false); setProgress(0); setElapsed(0); }}
                onPause={() => setPlaying(false)}
                onPlay={() => setPlaying(true)}
                style={css('width:100%;height:100%;object-fit:cover;display:block')}
              />
            )}

            <div style={css('position:absolute;inset:0;display:flex;align-items:center;justify-content:center')}>
              {uploading ? (
                <div style={css('font-size:14px;font-weight:700;color:#FFFFFF;text-shadow:0 1px 6px rgba(15,23,42,.5)')}>
                  {Math.round((message.progress ?? 0) * 100)}%
                </div>
              ) : loadingVideo ? (
                <Spinner />
              ) : media.failed ? (
                <div style={css('font-size:11px;color:#FCA5A5;text-align:center;padding:0 24px;line-height:1.4')}>
                  Could not load this video
                </div>
              ) : !playing ? (
                <PlayGlyph paused />
              ) : null}
            </div>

            {(uploading || progress > 0) && <ProgressRing fraction={ringFraction} color={ringColor} />}

            {total > 0 && !uploading && (
              <div style={css('position:absolute;left:0;right:0;bottom:12px;display:flex;justify-content:center;pointer-events:none')}>
                <div style={css('padding:2px 9px;border-radius:999px;background:rgba(15,23,42,.55);font-size:10.5px;font-weight:600;color:#FFFFFF;letter-spacing:.1px')}>
                  {formatDuration(playing || progress > 0 ? elapsed : total)}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div style={css('display:flex;flex-direction:column;gap:5px;padding-right:4px')}>
        <FailedNote message={message} onRetry={onRetry} />
        <MetaRow message={message} out={out} />
      </div>
    </div>
  );
}
