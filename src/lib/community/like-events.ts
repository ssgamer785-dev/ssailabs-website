/**
 * How a realtime change on `likes` moves a post's count.
 *
 * Your own tap is already applied optimistically, and its echo used to be
 * applied again, so one tap showed +2 until a reload (TP-020). Only other
 * people's likes move the number here.
 */
export function likeCountDelta(eventType: string, row: { user_id?: string | null } | null, myUserId: string): number {
  if (!row || row.user_id === myUserId) return 0;
  if (eventType === 'INSERT') return 1;
  if (eventType === 'DELETE') return -1;
  return 0;
}
