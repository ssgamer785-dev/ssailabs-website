export interface ForegroundNotificationEvent {
  id?: string | null;
  read_at?: string | null;
}

export function foregroundNotificationSoundId(row: ForegroundNotificationEvent, visible: boolean): string | null {
  return visible && row.id && !row.read_at ? row.id : null;
}

// Students Community posts have no sound rule of their own any more: a member
// who switched them on receives them as notification rows, which take the rule
// above; a member who did not is never chimed at for a post they did not ask about.
