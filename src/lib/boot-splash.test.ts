import { describe, expect, it } from 'bun:test';
import { barAnimationDelay } from './boot-splash';

describe('boot splash hand-over', () => {
  it('starts the React bar where the boot bar already is', () => {
    expect(barAnimationDelay(1000, 1850)).toBe('-850ms');
  });
  it('starts from empty when there was no boot splash', () => {
    expect(barAnimationDelay(null, 1850)).toBe('0ms');
  });
  it('never delays into the future on a clock that went backwards', () => {
    expect(barAnimationDelay(2000, 1850)).toBe('0ms');
  });
});
