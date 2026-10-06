import { beforeEach, describe, expect, it, mock } from 'bun:test';

/** What the database answers to the capability question (post_media_for with no posts). */
let reply: () => Promise<{ error: { code?: string; message?: string } | null }> = async () => ({ error: null });
let asked = 0;
mock.module('../supabase', () => ({ supabase: { rpc: () => { asked++; return reply(); } } }));
const { knownMultiMediaSupport, multiMediaSupport, multiMediaSupported, resetMultiMediaSupportForTests } = await import('./multi-media');

beforeEach(() => { resetMultiMediaSupportForTests(); asked = 0; });

describe('can a post hold several attachments?', () => {
  it('before anyone asked, the answer is unknown — never "no": the picker must still take many files', () => {
    expect(knownMultiMediaSupport()).toBe('unknown');
  });
  it('a database with the RC5 migration says yes, once; the next screen has the answer in its first frame', async () => {
    reply = async () => ({ error: null });
    expect(await multiMediaSupport()).toBe('yes');
    expect(knownMultiMediaSupport()).toBe('yes');
    expect(await multiMediaSupported()).toBe(true);
    await multiMediaSupport();
    expect(asked).toBe(1);
  });
  it('only a database that really lacks the RC5 functions says no (the Preview today)', async () => {
    reply = async () => ({ error: { code: 'PGRST202', message: 'Could not find the function public.post_media_for(p_post_ids) in the schema cache' } });
    expect(await multiMediaSupport()).toBe('no');
    expect(knownMultiMediaSupport()).toBe('no');
    expect(await multiMediaSupported()).toBe(false);
  });
  it('a dropped connection or a server error is not "no": it stays unknown and is asked again', async () => {
    reply = async () => { throw new TypeError('Failed to fetch'); };
    expect(await multiMediaSupport()).toBe('unknown');
    reply = async () => ({ error: { code: '503', message: 'Service Unavailable' } });
    expect(await multiMediaSupport()).toBe('unknown');
    expect(knownMultiMediaSupport()).toBe('unknown');
    reply = async () => ({ error: null });
    expect(await multiMediaSupport()).toBe('yes');
    expect(asked).toBe(3);
  });
  it('asked by several screens at once, the database is asked once', async () => {
    let release: () => void = () => {};
    reply = () => new Promise(resolve => { release = () => resolve({ error: null }); });
    const answers = Promise.all([multiMediaSupport(), multiMediaSupport(), multiMediaSupport()]);
    release();
    expect(await answers).toEqual(['yes', 'yes', 'yes']);
    expect(asked).toBe(1);
  });
});
