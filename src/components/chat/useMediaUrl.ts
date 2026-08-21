import { getMediaUrl } from '../../lib/chat/media-api';
import { useLazyMediaUrl } from '../../lib/media/useLazyMediaUrl';
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

/** The video's poster frame — cheap, so it loads as soon as the bubble is near. */
export function usePosterUrl(message: ChatMessage) {
  return useLazyMediaUrl(
    message.mediaPurged ? null : message.posterKey,
    getMediaUrl,
    { localUrl: message.localPosterUrl ?? null },
  );
}
