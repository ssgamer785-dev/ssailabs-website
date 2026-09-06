import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAuthCallback, isDesktop, desktop } from '../desktop';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel: string): string => readFileSync(resolve(ROOT, rel), 'utf8');

/**
 * The desktop shell exists so that Google sign-in can happen in the counter
 * hand's own browser rather than inside the application window. These pin the
 * two things that would quietly break it: the reply from the browser being
 * misread, and the website accidentally taking the desktop path.
 */

describe('the desktop bridge is absent in a browser', () => {
  it('there is no shell here, so nothing desktop-specific runs', () => {
    expect(isDesktop).toBe(false);
    expect(desktop).toBeNull();
  });

  it('the website still redirects to its own origin', () => {
    const auth = read('src/lib/auth.tsx');
    expect(auth).toContain('redirectTo: window.location.origin');
  });

  it('and the desktop path is only reachable behind the bridge check', () => {
    const auth = read('src/lib/auth.tsx');
    const branch = auth.slice(auth.indexOf('if (desktop) {'), auth.indexOf('desktopSignInTimer.current = setTimeout'));
    expect(branch).toContain('skipBrowserRedirect: true');
    expect(branch).toContain('desktop.openSignIn(data.url)');
    // The desktop redirect address comes from the shell, never hard-coded here.
    expect(branch).toContain('await desktop.authCallbackUrl()');
  });
});

describe('reading the reply the browser hands back', () => {
  it('takes the authorization code from the query string', () => {
    expect(readAuthCallback('regencytailor://auth-callback?code=abc123'))
      .toEqual({ code: 'abc123' });
  });

  it('takes it from the fragment too', () => {
    expect(readAuthCallback('regencytailor://auth-callback#code=frag456'))
      .toEqual({ code: 'frag456' });
  });

  it('reports the reason when Google or Supabase refused', () => {
    const denied = readAuthCallback(
      'regencytailor://auth-callback?error=access_denied&error_description=The+user+said+no');
    expect(denied.code).toBeUndefined();
    expect(denied.error).toBe('The user said no');
  });

  it('reports an error carried in the fragment', () => {
    const denied = readAuthCallback('regencytailor://auth-callback#error=server_error');
    expect(denied.code).toBeUndefined();
    expect(denied.error).toBe('server_error');
  });

  it('a reply with neither a code nor an error is not treated as success', () => {
    const empty = readAuthCallback('regencytailor://auth-callback');
    expect(empty.code).toBeUndefined();
    expect(empty.error).toMatch(/no authorization code/i);
  });

  it('something that is not a URL at all is refused, not thrown on', () => {
    const bad = readAuthCallback('not a url');
    expect(bad.code).toBeUndefined();
    expect(bad.error).toMatch(/could not be read/i);
  });

  it('an error takes precedence over any code that came with it', () => {
    const both = readAuthCallback('regencytailor://auth-callback?code=abc&error=access_denied');
    expect(both.code).toBeUndefined();
    expect(both.error).toBe('access_denied');
  });
});

describe('the shell is configured the way it claims to be', () => {
  const main = read('electron/main.cjs');
  const preload = read('electron/preload.cjs');

  it('the window disables every Node affordance', () => {
    for (const flag of [
      'contextIsolation: true',
      'nodeIntegration: false',
      'nodeIntegrationInWorker: false',
      'nodeIntegrationInSubFrames: false',
      'sandbox: true',
      'webSecurity: true',
      'webviewTag: false',
      'allowRunningInsecureContent: false'
    ]) {
      expect(main, flag).toContain(flag);
    }
  });

  it('the preload exposes named functions, not Electron itself', () => {
    expect(preload).toContain('contextBridge.exposeInMainWorld');
    expect(preload).not.toMatch(/exposeInMainWorld\([^)]*,\s*ipcRenderer\s*\)/);
    // The only thing it imports from Electron is the bridge and the channel.
    const imports = preload.match(/require\('electron'\)[\s\S]{0,10}/) ? preload.match(/const \{[^}]*\} = require\('electron'\)/)![0] : '';
    expect(imports).toBe("const { contextBridge, ipcRenderer } = require('electron')");
    expect(preload).not.toMatch(/require\('node:/);
    expect(preload).not.toMatch(/require\('(fs|path|child_process|os)'\)/);
  });

  it('only https reaches the system browser from the sign-in bridge', () => {
    const handler = main.slice(main.indexOf("ipcMain.handle('regency:sign-in'"));
    expect(handler).toContain("parsed.protocol !== 'https:'");
    expect(handler).toContain('shell.openExternal');
  });

  it('the renderer is pinned to its own origin', () => {
    expect(main).toContain('if (url.startsWith(APP_ORIGIN)) return;');
    expect(main).toContain("return { action: 'deny' };");
  });

  it('there is a Content-Security-Policy and it forbids eval', () => {
    expect(main).toContain("script-src 'self'");
    expect(main).not.toContain('unsafe-eval');
    expect(main).toContain("object-src 'none'");
    expect(main).toContain("frame-src 'none'");
  });

  it('a path that escapes the renderer root is refused', () => {
    expect(main).toContain("return new Response('Forbidden', { status: 403 })");
  });

  it('no privileged credential is anywhere in the shell', () => {
    for (const f of ['electron/main.cjs', 'electron/preload.cjs', 'electron-builder.yml']) {
      expect(read(f), f).not.toMatch(/service_role|sb_secret_|client_secret/i);
    }
  });

  it('the installer is Windows x64 only, per-user, with both shortcuts', () => {
    const cfg = read('electron-builder.yml');
    expect(cfg).toContain('productName: Regency Tailor');
    expect(cfg).toMatch(/target: nsis/);
    expect(cfg).toMatch(/- x64/);
    expect(cfg).toContain('oneClick: false');
    expect(cfg).toContain('perMachine: false');
    expect(cfg).toContain('createDesktopShortcut: true');
    expect(cfg).toContain('createStartMenuShortcut: true');
    expect(cfg).toContain('icon: build/icon.png');
    expect(cfg).toContain('publish: null');
  });
});
