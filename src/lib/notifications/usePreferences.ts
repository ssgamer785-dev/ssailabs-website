import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../supabase';
import { useAuth } from '../auth-context';
import type { Database } from '../database.types';
import { DEFAULT_PREFERENCES, type NotificationCategory, type NotificationPreferences } from './categories';

type PreferenceInsert = Database['public']['Tables']['notification_preferences']['Insert'];
export type PreferencesState = 'loading' | 'ready' | 'unavailable';

/** A member's saved choices laid over the defaults; no row (or a partial one) is the defaults. */
export function mergePreferences(row: Partial<Record<NotificationCategory, unknown>> | null | undefined): NotificationPreferences {
  const merged = { ...DEFAULT_PREFERENCES };
  if (!row) return merged;
  for (const key of Object.keys(DEFAULT_PREFERENCES) as NotificationCategory[]) {
    if (typeof row[key] === 'boolean') merged[key] = row[key] as boolean;
  }
  return merged;
}

/** PostgREST / Postgres answers for a table the database does not have yet (migration not applied). */
export function isMissingTable(error: { code?: string; message?: string } | null | undefined): boolean {
  return !!error && (error.code === 'PGRST205' || error.code === '42P01' || /Could not find the table|does not exist/i.test(error.message ?? ''));
}

/**
 * The signed-in member's notification choices, stored in Supabase (their own
 * row only, by RLS) so they follow the account to every device.
 * Each switch saves at once; a failed save puts the switch back and says so.
 */
export function useNotificationPreferences() {
  const { user } = useAuth();
  const userId = user?.id;
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [state, setState] = useState<PreferencesState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<NotificationCategory | null>(null);
  const active = useRef(true);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data, error: loadError } = await supabase.from('notification_preferences').select('*').eq('user_id', userId).maybeSingle();
    if (!active.current) return;
    if (loadError) {
      setState('unavailable');
      setError(isMissingTable(loadError)
        ? 'Notification settings cannot be saved yet. The defaults are in use.'
        : 'Your notification settings could not be loaded. Check your connection and try again.');
      return;
    }
    setPreferences(mergePreferences(data as Partial<Record<NotificationCategory, unknown>> | null));
    setState('ready');
    setError(null);
  }, [userId]);

  useEffect(() => {
    active.current = true;
    setState('loading');
    void load();
    // A change made on another device is picked up when this one comes back.
    const onVisible = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { active.current = false; document.removeEventListener('visibilitychange', onVisible); };
  }, [load]);

  const setPreference = useCallback(async (key: NotificationCategory, value: boolean) => {
    if (!userId || state === 'unavailable') return;
    const previous = preferences[key];
    setPreferences(current => ({ ...current, [key]: value }));
    setSaving(key);
    setError(null);
    const row = { user_id: userId, [key]: value } as PreferenceInsert;
    const { error: saveError } = await supabase.from('notification_preferences').upsert(row, { onConflict: 'user_id' });
    if (!active.current) return;
    setSaving(null);
    if (saveError) {
      setPreferences(current => ({ ...current, [key]: previous }));
      setError('That setting could not be saved. Please try again.');
    }
  }, [preferences, state, userId]);

  return { preferences, state, error, saving, setPreference, reload: load };
}
