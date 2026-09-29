/** Fired on window whenever this device changes or learns of a change to a member's notifications. */
export const NOTIFICATIONS_CHANGED_EVENT = 'tp:notifications-changed';

export function announceNotificationsChanged(userId: string): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(NOTIFICATIONS_CHANGED_EVENT, { detail: { userId } }));
}
