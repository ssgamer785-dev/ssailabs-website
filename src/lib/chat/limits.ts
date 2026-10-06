/**
 * Chat attachments a member keeps, all threads together (the server's
 * MEDIA_QUOTA_BYTES): when a new one would not fit, the oldest of the
 * member's own attachments are removed to make room.
 */
export const CHAT_MEDIA_QUOTA_BYTES = 100 * 1024 * 1024;

const mb = (n: number) => `${Math.round(n / 1024 / 1024)} MB`;

/**
 * Why a batch should not be sent as it is, or null when it can be. A batch
 * larger than the whole allowance would have its own first files removed to
 * make room for its last ones — an album that loses photos while it arrives.
 */
export function batchTooLarge(sizes: number[]): string | null {
  const total = sizes.reduce((sum, size) => sum + size, 0);
  if (total <= CHAT_MEDIA_QUOTA_BYTES) return null;
  return `These ${sizes.length} files come to ${mb(total)}. Chat keeps your most recent ${mb(CHAT_MEDIA_QUOTA_BYTES)} of attachments, so this batch would lose its first files as the last ones arrive. Remove a few to send it.`;
}
