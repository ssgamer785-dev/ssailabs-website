import type { CSSProperties } from 'react';
import type { MediaImage } from '../../lib/media/useMediaImage';

/**
 * Where a picture will be, while it is genuinely not here yet: a quiet surface
 * with a slow sheen (still under reduced motion). It fills the space already
 * reserved for the picture, so nothing moves when the picture arrives.
 */
export function MediaShimmer({ style }: { style?: CSSProperties }) {
  return <span aria-hidden="true" className="media-shimmer" style={{ position: 'absolute', inset: 0, ...style }} />;
}

/**
 * The picture of a media slot. Prepared ahead, it is drawn in the first frame
 * as it is. Otherwise it stays invisible until it has fully arrived and is
 * then faded in once — never drawn half-loaded.
 */
export function MediaImg({ media, alt, style, eager = false, priority }: {
  media: MediaImage; alt: string; style?: CSSProperties; eager?: boolean;
  /** The top picture of a screen asks for the link first. */
  priority?: 'high';
}) {
  if (!media.src) return null;
  return (
    <img
      src={media.src}
      alt={alt}
      onLoad={media.onLoad}
      onError={media.onError}
      draggable={false}
      decoding={media.instant ? 'sync' : 'async'}
      loading={media.instant || eager || priority ? 'eager' : 'lazy'}
      fetchPriority={priority}
      style={{ ...style, opacity: media.loaded ? 1 : 0, transition: media.instant ? undefined : 'opacity .22s ease' }}
    />
  );
}
