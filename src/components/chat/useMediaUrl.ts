import { useEffect, useState } from 'react';
import { getMediaUrl } from '../../lib/chat/media-api';
import type { ChatMessage } from '../../lib/chat/types';

/**
 * Resolves what a media bubble should actually render:
 * the local object URL while it is still uploading, otherwise a signed R2 GET.
 */
export function useMediaUrl(message: ChatMessage): { url: string | null; failed: boolean } {
  const [url, setUrl] = useState<string | null>(message.localPreviewUrl ?? null);
  const [failed, setFailed] = useState(false);

  const storageKey = message.storageKey;
  const preview = message.localPreviewUrl;

  useEffect(() => {
    if (preview) {
      setUrl(preview);
      return;
    }
    if (!storageKey || message.mediaPurged) {
      setUrl(null);
      return;
    }
    let active = true;
    getMediaUrl(storageKey)
      .then(u => { if (active) { setUrl(u); setFailed(false); } })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [storageKey, preview, message.mediaPurged]);

  return { url, failed };
}
