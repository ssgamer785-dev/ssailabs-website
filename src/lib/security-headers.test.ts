import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'bun:test';

const vercel = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8')) as {
  headers: { source: string; headers: { key: string; value: string }[] }[];
};
const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const site = Object.fromEntries(vercel.headers.find(h => h.source === '/(.*)')!.headers.map(h => [h.key, h.value]));

/** The inline classic scripts the browser actually runs (comments removed, modules and src= excluded). */
function inlineScripts(source: string): string[] {
  const live = source.replace(/<!--[\s\S]*?-->/g, '');
  return [...live.matchAll(/<script(?![^>]*\bsrc=)(?![^>]*type="module")[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
}

describe('security headers (vercel.json)', () => {
  it('sends the baseline protections on every response', () => {
    expect(site['X-Content-Type-Options']).toBe('nosniff');
    expect(site['X-Frame-Options']).toBe('DENY');
    expect(site['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    // Voice notes need the microphone; nothing needs the camera, location or payments.
    expect(site['Permissions-Policy']).toContain('microphone=(self)');
    expect(site['Permissions-Policy']).toContain('camera=()');
  });

  it("allows every inline script in index.html by hash, and nothing inline beyond them", () => {
    const policy = site['Content-Security-Policy-Report-Only'] ?? site['Content-Security-Policy'];
    const scriptSrc = policy.split(';').map(part => part.trim()).find(part => part.startsWith('script-src'))!;
    const expected = inlineScripts(html).map(body => `'sha256-${createHash('sha256').update(body).digest('base64')}'`);
    expect(expected.length).toBe(3);
    for (const hash of expected) expect(scriptSrc).toContain(hash);
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc.match(/'sha256-/g)?.length).toBe(expected.length);
  });

  it('caches hashed build files for a year, but never the service worker', () => {
    const assets = vercel.headers.find(h => h.source === '/assets/(.*)')!.headers;
    expect(assets).toContainEqual({ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' });
    expect(vercel.headers.find(h => h.source === '/sw.js')!.headers).toContainEqual({ key: 'Cache-Control', value: 'no-cache' });
  });
});
