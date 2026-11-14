import { describe, expect, test } from 'bun:test';
import { sortByTime, upsertMessage } from './merge';
import { formatBytes, formatDuration, isMediaKind, purgeNotice, MEDIA_QUOTA_BYTES, type ChatMessage } from './types';

function message(over: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: over.id ?? 'row-1',
    clientId: over.clientId ?? 'client-1',
    conversationId: 'conv-1',
    senderId: 'student-1',
    kind: 'text',
    body: 'hello',
    storageKey: null,
    posterKey: null,
    posterSizeBytes: null,
    mimeType: null,
    sizeBytes: null,
    fileName: null,
    durationSeconds: null,
    readAt: null,
    createdAt: '2026-08-21T10:00:00.000Z',
    deletedAt: null,
    mediaPurged: false,
    uploadStatus: 'ready',
    status: 'sent',
    ...over,
  };
}

describe('duplicate prevention', () => {
  test('a confirmed row replaces its own optimistic bubble', () => {
    const optimistic = message({ id: 'temp-uuid', clientId: 'c1', status: 'sending' });
    const confirmed = message({ id: 'row-a', clientId: 'c1', status: 'sent' });

    const merged = upsertMessage([optimistic], confirmed);

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('row-a');
    expect(merged[0].status).toBe('sent');
  });

  test('the Realtime echo of a row already merged does not duplicate it', () => {
    const confirmed = message({ id: 'row-a', clientId: 'c1' });
    const echo = message({ id: 'row-a', clientId: 'c1', readAt: '2026-08-21T10:05:00.000Z' });

    const merged = upsertMessage(upsertMessage([], confirmed), echo);

    expect(merged).toHaveLength(1);
    expect(merged[0].readAt).toBe('2026-08-21T10:05:00.000Z');
  });

  test('a row arriving with no client id still matches on row id', () => {
    const existing = message({ id: 'row-a', clientId: 'row-a' });
    const echo = message({ id: 'row-a', clientId: 'row-a', body: 'edited by nobody' });

    expect(upsertMessage([existing], echo)).toHaveLength(1);
  });

  test('genuinely different messages both survive', () => {
    const first = message({ id: 'row-a', clientId: 'c1' });
    const second = message({ id: 'row-b', clientId: 'c2', createdAt: '2026-08-21T10:01:00.000Z' });

    expect(upsertMessage([first], second)).toHaveLength(2);
  });

  test('the incoming peer message lands in time order, not at the end', () => {
    const list = [
      message({ id: 'a', clientId: 'a', createdAt: '2026-08-21T10:00:00.000Z' }),
      message({ id: 'c', clientId: 'c', createdAt: '2026-08-21T10:02:00.000Z' }),
    ];
    const late = message({ id: 'b', clientId: 'b', createdAt: '2026-08-21T10:01:00.000Z' });

    expect(upsertMessage(list, late).map(m => m.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('local state survives a merge', () => {
  test('an uploading bubble keeps its preview, progress and retry payload', () => {
    const file = new Blob(['x']);
    const uploading = message({
      id: 'temp', clientId: 'c1', kind: 'image', status: 'uploading', progress: 0.4,
      localPreviewUrl: 'blob:preview', pendingFile: file, uploadStatus: 'ready',
    });
    const pendingRow = message({
      id: 'row-a', clientId: 'c1', kind: 'image', status: 'sent', uploadStatus: 'pending',
      storageKey: 'chat/conv-1/x.bin',
    });

    const [merged] = upsertMessage([uploading], pendingRow);

    expect(merged.id).toBe('row-a');
    expect(merged.storageKey).toBe('chat/conv-1/x.bin');
    // Still uploading as far as the sender is concerned.
    expect(merged.status).toBe('uploading');
    expect(merged.progress).toBe(0.4);
    expect(merged.localPreviewUrl).toBe('blob:preview');
    expect(merged.pendingFile).toBe(file);
  });

  test('once the row is ready the bubble follows it to sent', () => {
    const uploading = message({ id: 'row-a', clientId: 'c1', status: 'uploading', progress: 1 });
    const ready = message({ id: 'row-a', clientId: 'c1', status: 'sent', uploadStatus: 'ready' });

    expect(upsertMessage([uploading], ready)[0].status).toBe('sent');
  });

  test('a poster generated locally is not lost when the row arrives', () => {
    const uploading = message({
      id: 'temp', clientId: 'c1', kind: 'video', status: 'uploading',
      localPosterUrl: 'blob:poster',
    });
    const row = message({ id: 'row-a', clientId: 'c1', kind: 'video', uploadStatus: 'pending' });

    expect(upsertMessage([uploading], row)[0].localPosterUrl).toBe('blob:poster');
  });
});

describe('ordering', () => {
  test('messages sort oldest first', () => {
    const list = [
      message({ id: 'c', clientId: 'c', createdAt: '2026-08-21T12:00:00.000Z' }),
      message({ id: 'a', clientId: 'a', createdAt: '2026-08-21T10:00:00.000Z' }),
      message({ id: 'b', clientId: 'b', createdAt: '2026-08-21T11:00:00.000Z' }),
    ];
    expect(sortByTime(list).map(m => m.id)).toEqual(['a', 'b', 'c']);
  });

  test('a tie on timestamp is broken stably by client id', () => {
    const same = '2026-08-21T10:00:00.000Z';
    const list = [
      message({ id: '2', clientId: 'zz', createdAt: same }),
      message({ id: '1', clientId: 'aa', createdAt: same }),
    ];
    expect(sortByTime(list).map(m => m.clientId)).toEqual(['aa', 'zz']);
    // Sorting again must not shuffle them.
    expect(sortByTime(sortByTime(list)).map(m => m.clientId)).toEqual(['aa', 'zz']);
  });

  test('sorting does not mutate the input', () => {
    const list = [
      message({ id: 'b', clientId: 'b', createdAt: '2026-08-21T11:00:00.000Z' }),
      message({ id: 'a', clientId: 'a', createdAt: '2026-08-21T10:00:00.000Z' }),
    ];
    sortByTime(list);
    expect(list.map(m => m.id)).toEqual(['b', 'a']);
  });
});

describe('media helpers', () => {
  test('text is not media; every attachment kind is', () => {
    expect(isMediaKind('text')).toBe(false);
    expect(isMediaKind('image')).toBe(true);
    expect(isMediaKind('video')).toBe(true);
    expect(isMediaKind('pdf')).toBe(true);
    expect(isMediaKind('voice')).toBe(true);
  });

  test('the quota is 100 MB', () => {
    expect(MEDIA_QUOTA_BYTES).toBe(104857600);
  });

  test('byte sizes read the way a person would say them', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  test('durations read as m:ss', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(9)).toBe('0:09');
    expect(formatDuration(75)).toBe('1:15');
    expect(formatDuration(600)).toBe('10:00');
  });

  test('the cleanup notice names how much went and reassures about messages', () => {
    expect(purgeNotice(1)).toContain('oldest attachment was removed');
    expect(purgeNotice(3)).toContain('3 oldest attachments were removed');
    expect(purgeNotice(1)).toContain('Your messages are still here');
  });
});
