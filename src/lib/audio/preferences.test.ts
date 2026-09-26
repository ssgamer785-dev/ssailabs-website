import { describe, expect, it } from 'bun:test';
import { audioPreferencesFromStorage, migrateLegacyAudioPreference } from './preferences';

describe('audio preference persistence format', () => {
  it('defaults both independent switches on when no stored settings exist', () => {
    expect(audioPreferencesFromStorage(null)).toEqual({ refreshSound: true, notificationSound: true });
  });

  it('round-trips all four valid switch combinations without coupling them', () => {
    for (const refreshSound of [true, false]) {
      for (const notificationSound of [true, false]) {
        const stored = JSON.stringify({ refreshSound, notificationSound });
        expect(audioPreferencesFromStorage(stored)).toEqual({ refreshSound, notificationSound });
      }
    }
  });

  it('recovers malformed or partial values safely', () => {
    expect(audioPreferencesFromStorage('{bad json')).toEqual({ refreshSound: true, notificationSound: true });
    expect(audioPreferencesFromStorage('{"refreshSound":false}')).toEqual({ refreshSound: false, notificationSound: true });
  });

  it('migrates the former notification opt-out into only the first account', () => {
    const values = new Map([['tp:notification-sound', 'off']]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value); },
      removeItem: (key: string) => { values.delete(key); },
    };
    migrateLegacyAudioPreference(storage, 'admin');
    expect(JSON.parse(values.get('tp:audio-preferences:v1:admin')!)).toEqual({ refreshSound: true, notificationSound: false });
    expect(values.has('tp:notification-sound')).toBe(false);
    migrateLegacyAudioPreference(storage, 'student');
    expect(values.has('tp:audio-preferences:v1:student')).toBe(false);
  });
});
