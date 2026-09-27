import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { pendingDestination, consumeDestination } from '../lib/notifications/destination';
import { useAuth } from '../lib/auth-context';

/** Clear a saved push target only after its protected screen actually opens. */
export function NotificationNavigation() {
  const location = useLocation();
  const { session, loading, profileLoading, isActivated } = useAuth();
  useEffect(() => {
    if (session && !loading && !profileLoading && isActivated && pendingDestination() === location.pathname + location.search) consumeDestination();
  }, [location.pathname, location.search, session, loading, profileLoading, isActivated]);
  return null;
}
