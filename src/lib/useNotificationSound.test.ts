import { describe, expect, it } from 'bun:test';
import { notificationSoundSettingEnabled } from './useNotificationSound';

describe('notification sound preference', () => {
  it('is enabled by default and remains enabled when explicitly stored on', () => {
    expect(notificationSoundSettingEnabled(null)).toBe(true);
    expect(notificationSoundSettingEnabled('on')).toBe(true);
  });

  it('respects an explicit opt-out', () => {
    expect(notificationSoundSettingEnabled('off')).toBe(false);
  });
});
