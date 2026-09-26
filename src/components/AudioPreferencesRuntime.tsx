import { useEffect } from 'react';
import { useAuth } from '../lib/auth-context';
import { setAudioPreferenceUser } from '../lib/audio/preferences';
import { handleMoneySoundSessionReady } from '../lib/useMoneySound';

/** Keeps shared sound services scoped to the currently authenticated account. */
export function AudioPreferencesRuntime() {
  const { user, loading } = useAuth();
  useEffect(() => {
    if (loading) return;
    setAudioPreferenceUser(user?.id ?? null);
    handleMoneySoundSessionReady();
    return () => setAudioPreferenceUser(null);
  }, [user?.id, loading]);
  return null;
}
