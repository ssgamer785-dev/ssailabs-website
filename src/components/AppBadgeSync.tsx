import { useEffect } from 'react';
import { useAuth } from '../lib/auth-context';
import { setAppBadge } from '../lib/notifications/app-badge';
import { useUnreadNotificationCount } from '../lib/notifications/unread-store';

/**
 * Keeps the number on the installed app's icon equal to the member's unread
 * notifications, on every screen. The count comes from the database (the same
 * number on every device they are signed in on); reading a notification, or
 * signing out, updates or clears the badge. Where the browser has no Badging
 * API the badge is simply not shown.
 */
export function AppBadgeSync() {
  const { user, isActivated } = useAuth();
  const signedIn = !!user && isActivated;
  const count = useUnreadNotificationCount();
  useEffect(() => { setAppBadge(signedIn ? count : 0); }, [signedIn, count]);
  return null;
}
