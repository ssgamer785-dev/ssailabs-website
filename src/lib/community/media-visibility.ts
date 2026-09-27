import type { FeedPost } from './useFeed';

/**
 * An anonymous post's attachment from before author-free media keys: its key
 * names the author, so the server does not give it to other members, and the
 * card says why instead of looking broken.
 */
export function isWithheldForAnonymity(post: Pick<FeedPost, 'attachment' | 'isAnonymous' | 'isMine' | 'storageKey' | 'mediaPurged'>): boolean {
  const hasObject = post.attachment === 'image' || post.attachment === 'video' || post.attachment === 'pdf'
    || post.attachment === 'file' || post.attachment === 'voice';
  return hasObject && post.isAnonymous && !post.isMine && !post.storageKey && !post.mediaPurged;
}
