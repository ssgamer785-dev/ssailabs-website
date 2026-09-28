import { afterEach, describe, expect, it, mock } from 'bun:test';

mock.module('../supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: null } }) } } }));
const { uploadToR2 } = await import('./media-api');
const { OFFLINE_MESSAGE, friendlyError } = await import('../errors');

/** Just enough XMLHttpRequest for uploadToR2; each test decides how the PUT ends. */
class FakeXHR {
  static finish: (xhr: FakeXHR) => void = () => {};
  static last: FakeXHR | null = null;
  status = 0;
  responseText = '';
  method = '';
  url = '';
  headers: Record<string, string> = {};
  upload: { onprogress: ((e: { lengthComputable: boolean; loaded: number; total: number }) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;
  open(method: string, url: string) { this.method = method; this.url = url; }
  setRequestHeader(name: string, value: string) { this.headers[name] = value; }
  send() { FakeXHR.last = this; FakeXHR.finish(this); }
  abort() { this.onabort?.(); }
}

const realXHR = globalThis.XMLHttpRequest;
const realWarn = console.warn;
function useFakeXHR(finish: (xhr: FakeXHR) => void) {
  FakeXHR.finish = finish;
  (globalThis as { XMLHttpRequest: unknown }).XMLHttpRequest = FakeXHR;
  console.warn = () => {};
}
afterEach(() => {
  (globalThis as { XMLHttpRequest: unknown }).XMLHttpRequest = realXHR;
  console.warn = realWarn;
});

const blob = new Blob([new Uint8Array(4)], { type: 'image/jpeg' });

describe('uploadToR2', () => {
  it('PUTs the bytes with exactly the type the link was signed for', async () => {
    useFakeXHR(xhr => { xhr.status = 200; xhr.onload?.(); });
    await uploadToR2('https://storage.example/k?sig', blob, 'image/jpeg', () => {});
    expect(FakeXHR.last?.method).toBe('PUT');
    expect(FakeXHR.last?.headers['Content-Type']).toBe('image/jpeg');
  });

  it('reports a refused upload with its status and storage code, never as offline', async () => {
    useFakeXHR(xhr => {
      xhr.status = 403;
      xhr.responseText = '<?xml version="1.0" encoding="UTF-8"?><Error><Code>SignatureDoesNotMatch</Code></Error>';
      xhr.onload?.();
    });
    const error = await uploadToR2('https://storage.example/k?sig', blob, 'image/jpeg', () => {}).catch(e => e);
    expect(error.message).toBe('Media storage rejected the upload (HTTP 403: SignatureDoesNotMatch).');
    expect(friendlyError(error, 'Could not send. Tap to retry.')).toBe(error.message);
  });

  it('reports an unanswered upload as a storage connection problem while online', async () => {
    useFakeXHR(xhr => xhr.onerror?.());
    const error = await uploadToR2('https://storage.example/k?sig', blob, 'image/jpeg', () => {}).catch(e => e);
    expect(friendlyError(error, 'Could not send. Tap to retry.'))
      .toBe('Could not connect to media storage. Please retry; if this continues, contact support.');
    expect(friendlyError(error, 'x')).not.toBe(OFFLINE_MESSAGE);
  });
});
