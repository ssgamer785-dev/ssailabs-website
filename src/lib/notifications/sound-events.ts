export interface ForegroundNotificationEvent {
  id?: string | null;
  read_at?: string | null;
}

export function foregroundNotificationSoundId(row: ForegroundNotificationEvent, visible: boolean): string | null {
  return visible && row.id && !row.read_at ? row.id : null;
}

export interface CommunityPostSoundEvent {
  id?: string | null;
  /** Present on a realtime row; absent (or null) on another member's anonymous post. */
  author_id?: string | null;
  /** Present on a posts_feed row, and the only reliable "mine" for anonymous posts. */
  is_mine?: boolean | null;
  channel?: string | null;
}

export function incomingStudentPostSoundId(row: CommunityPostSoundEvent, currentUserId: string, visible: boolean): string | null {
  const mine = row.is_mine === true || row.author_id === currentUserId;
  return visible && row.id && row.channel === 'students' && !mine
    ? `student-post:${row.id}`
    : null;
}
