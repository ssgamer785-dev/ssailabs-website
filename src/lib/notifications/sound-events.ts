export interface ForegroundNotificationEvent {
  id?: string | null;
  read_at?: string | null;
}

export function foregroundNotificationSoundId(row: ForegroundNotificationEvent, visible: boolean): string | null {
  return visible && row.id && !row.read_at ? row.id : null;
}

export interface CommunityPostSoundEvent {
  id?: string | null;
  author_id?: string | null;
  channel?: string | null;
}

export function incomingStudentPostSoundId(row: CommunityPostSoundEvent, currentUserId: string, visible: boolean): string | null {
  return visible && row.id && row.channel === 'students' && row.author_id !== currentUserId
    ? `student-post:${row.id}`
    : null;
}
