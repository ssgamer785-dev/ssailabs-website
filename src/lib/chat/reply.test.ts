import { describe, expect, it } from 'bun:test';
import { SWIPE_MAX_PX, SWIPE_TRIGGER_PX, replySender, replySnippet, swipeIntent, swipeOffset } from './reply';

const base = { kind: 'text' as const, body: null, deletedAt: null, fileName: null, durationSeconds: null, mediaPurged: false };

describe('what a quote says', () => {
  it('quotes text on one line, shortened', () => {
    expect(replySnippet({ ...base, body: 'Buy gold\n  at 2400' })).toBe('Buy gold at 2400');
    const long = replySnippet({ ...base, body: 'x'.repeat(200) });
    expect(long.length).toBe(90);
    expect(long.endsWith('…')).toBe(true);
  });
  it('names attachments instead of showing them', () => {
    expect(replySnippet({ ...base, kind: 'image' })).toBe('Photo');
    expect(replySnippet({ ...base, kind: 'video' })).toBe('Video');
    expect(replySnippet({ ...base, kind: 'voice', durationSeconds: 75 })).toBe('Voice message · 1:15');
    expect(replySnippet({ ...base, kind: 'pdf', fileName: 'levels.pdf' })).toBe('Document · levels.pdf');
    expect(replySnippet({ ...base, kind: 'file' })).toBe('Document');
    expect(replySnippet({ ...base, kind: 'image', mediaPurged: true })).toBe('Photo (removed)');
  });
  it('says nothing of a deleted message but that it was deleted', () => {
    expect(replySnippet({ ...base, body: 'secret', deletedAt: '2026-11-15T10:00:00Z' })).toBe('This message was deleted');
    expect(replySnippet({ ...base, kind: 'pdf', fileName: 'private.pdf', deletedAt: '2026-11-15T10:00:00Z' })).toBe('This message was deleted');
  });
  it('labels the author as the viewer knows them', () => {
    expect(replySender('me', 'me', false, 'Asha')).toBe('You');
    expect(replySender('admin-id', 'me', false, 'Asha')).toBe('Admin');
    expect(replySender('student-id', 'admin-id', true, 'Asha Rao')).toBe('Asha Rao');
  });
});

describe('reading a swipe', () => {
  it('waits until the finger has really moved', () => {
    expect(swipeIntent(3, 2)).toBe('undecided');
    expect(swipeIntent(-5, 6)).toBe('undecided');
    // A thumb's first pixels wobble: not judged yet (this used to be thrown away as a scroll).
    expect(swipeIntent(9, 7)).toBe('undecided');
  });
  it('a clear rightward pull is a reply', () => {
    expect(swipeIntent(20, 4)).toBe('reply');
    expect(swipeIntent(40, 25)).toBe('reply');
  });
  it('a thumb swipe that starts on a slight arc is still a reply', () => {
    expect(swipeIntent(13, 9)).toBe('reply');
    expect(swipeIntent(12, -10)).toBe('reply');
  });
  it('scrolling, a diagonal and a leftward swipe are left to the page', () => {
    expect(swipeIntent(4, 30)).toBe('ignore');
    expect(swipeIntent(20, 20)).toBe('ignore');
    expect(swipeIntent(11, 11)).toBe('ignore');
    expect(swipeIntent(-30, 2)).toBe('ignore');
  });
  it('follows the finger, then resists, and never moves left', () => {
    expect(swipeOffset(-20)).toBe(0);
    expect(swipeOffset(30)).toBe(30);
    expect(swipeOffset(SWIPE_MAX_PX)).toBe(SWIPE_MAX_PX);
    expect(swipeOffset(SWIPE_MAX_PX + 40)).toBe(SWIPE_MAX_PX + 10);
    expect(swipeOffset(1000)).toBe(SWIPE_MAX_PX + 24);
  });
  it('the reply threshold is reachable before the resistance starts', () => {
    expect(SWIPE_TRIGGER_PX).toBeLessThan(SWIPE_MAX_PX);
    expect(swipeOffset(SWIPE_TRIGGER_PX)).toBe(SWIPE_TRIGGER_PX);
  });
});
