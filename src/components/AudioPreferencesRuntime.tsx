import { useEffect } from 'react';
import { useAuth } from '../lib/auth-context';
import { setAudioPreferenceUser } from '../lib/audio/preferences';

/** Keeps shared sound services scoped to the currently authenticated account. */
export function AudioPreferencesRuntime() {
  const { user } = useAuth();
  useEffect(() => {
    setAudioPreferenceUser(user?.id ?? null);
    return () => setAudioPreferenceUser(null);
  }, [user?.id]);
  return null;
}
