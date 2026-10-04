import { getMediaUrl } from '../../lib/chat/media-api';
import { useLazyMediaUrl } from '../../lib/media/useLazyMediaUrl';
import { useMediaImage } from '../../lib/media/useMediaImage';
import type { ChatMessage } from '../../lib/chat/types';

/**
 * What a chat media bubble should render: the local object URL while the
 * attachment is still uploading, otherwise a signed R2 GET fetched only once
 * the bubble is close to the viewport.
 */
export function useMediaUrl(message: ChatMessage, armed = true) {
  return useLazyMediaUrl(
    message.mediaPurged ? null : message.storageKey,
    getMediaUrl,
    { armed, localUrl: message.localPreviewUrl ?? null },
  );
}

/** The video's poster frame — a picture like any other: prepared ahead, shown at once. */
export function usePosterUrl(message: ChatMessage) {
  return useMediaImage('chat', message.mediaPurged ? null : message.posterKey, { localUrl: message.localPosterUrl ?? null, bytes: message.posterSizeBytes });
}
