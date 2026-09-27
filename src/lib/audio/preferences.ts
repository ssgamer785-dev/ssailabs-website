export type AudioPreference = 'refreshSound' | 'notificationSound';
export interface AudioPreferences {
  refreshSound: boolean;
  notificationSound: boolean;
}

const DEFAULTS: AudioPreferences = { refreshSound: true, notificationSound: true };
const PREFIX = 'tp:audio-preferences:v1:';
const LEGACY_NOTIFICATION_KEY = 'tp:notification-sound';
const CHANGE_EVENT = 'tp:audio-preferences-change';
let activeUserId: string | null = null;

function key(userId = activeUserId): string {
  return `${PREFIX}${userId || 'device'}`;
}

function parse(value: string | null): AudioPreferences | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<AudioPreferences>;
    return {
      refreshSound: typeof parsed.refreshSound === 'boolean' ? parsed.refreshSound : true,
      notificationSound: typeof parsed.notificationSound === 'boolean' ? parsed.notificationSound : true,
    };
  } catch { return null; }
}

export function audioPreferencesFromStorage(value: string | null): AudioPreferences {
  const saved = parse(value);
  if (saved) return saved;
  return { ...DEFAULTS };
}

export function migrateLegacyAudioPreference(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>, userId: string): void {
  const accountKey = key(userId);
  if (storage.getItem(accountKey)) return;
  const legacy = storage.getItem(LEGACY_NOTIFICATION_KEY);
  if (legacy === null) return;
  storage.setItem(accountKey, JSON.stringify({ ...DEFAULTS, notificationSound: legacy !== 'off' }));
  storage.removeItem(LEGACY_NOTIFICATION_KEY);
}

export function setAudioPreferenceUser(userId: string | null): void {
  if (userId && userId !== activeUserId) {
    try {
      // Carry the former device-wide notification preference into the first
      // authenticated account only, then retire the legacy value so it cannot
      // leak one account's choice into another account on a shared device.
      migrateLegacyAudioPreference(localStorage, userId);
    } catch { /* Private browsing can disable local storage. */ }
  }
  activeUserId = userId;
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function getAudioPreferences(): AudioPreferences {
  try {
    const saved = localStorage.getItem(key());
    const parsed = parse(saved);
    if (parsed) return parsed;
    const migrated = audioPreferencesFromStorage(saved);
    // Preserve the old setting when moving to the account-scoped preference.
    localStorage.setItem(key(), JSON.stringify(migrated));
    return migrated;
  } catch { return { ...DEFAULTS }; }
}

export function audioPreferenceEnabled(preference: AudioPreference): boolean {
  return getAudioPreferences()[preference];
}

export function setAudioPreference(preference: AudioPreference, enabled: boolean): AudioPreferences {
  const next = { ...getAudioPreferences(), [preference]: enabled };
  try {
    localStorage.setItem(key(), JSON.stringify(next));
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch { /* Private browsing can disable local storage. */ }
  return next;
}

export function subscribeAudioPreferences(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener(CHANGE_EVENT, listener);
  const onStorage = (event: StorageEvent) => { if (event.key === key()) listener(); };
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function audioPreferencesStorageKey(userId: string | null): string {
  return key(userId);
}
