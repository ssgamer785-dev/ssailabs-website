/**
 * The desktop shell, as seen from the app.
 *
 * Everything here is inert in a browser: `window.regencyDesktop` is injected
 * by the Electron preload and exists nowhere else, so `isDesktop` is false on
 * the website and every function below returns without doing anything. The web
 * build's behaviour is unchanged — this file only describes what the desktop
 * build does differently, which is one thing: where Google sign-in happens.
 *
 * On the website the browser is already the browser, so Supabase redirects the
 * tab to Google and back. In a desktop window there is no tab to redirect, and
 * Google refuses to sign anyone in inside an embedded browser — correctly, as
 * an application that renders the Google password page can read it. So the
 * desktop build asks Supabase for the authorize URL without following it,
 * hands that URL to the counter hand's own browser, and waits for Windows to
 * hand back the callback. The code in that callback is exchanged for a session
 * by supabase-js exactly as it is on the web.
 */

export interface DesktopBridge {
  isDesktop: true;
  authCallbackUrl: () => Promise<string>;
  openSignIn: (url: string) => Promise<boolean>;
  takePendingAuthCallback: () => Promise<string | null>;
  onAuthCallback: (handler: (url: string) => void) => () => void;
  onPrintRequested: (handler: () => void) => () => void;
}

declare global {
  interface Window {
    regencyDesktop?: DesktopBridge;
  }
}

/** The bridge, or null in any browser. */
export const desktop: DesktopBridge | null =
  typeof window !== 'undefined' && window.regencyDesktop?.isDesktop
    ? window.regencyDesktop
    : null;

export const isDesktop = desktop !== null;

/**
 * The authorization code Supabase put in a callback URL.
 *
 * Both shapes are read. PKCE — which this project uses — returns
 * `?code=…`; an implicit-flow project would return `#access_token=…`, and
 * saying so plainly here is cheaper than a mystery later.
 */
export function readAuthCallback(url: string): { code?: string; error?: string } {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { error: 'The sign-in reply from the browser could not be read.' };
  }

  const hash = new URLSearchParams(parsed.hash.replace(/^#/, ''));
  const errorText =
    parsed.searchParams.get('error_description') ||
    parsed.searchParams.get('error') ||
    hash.get('error_description') ||
    hash.get('error');
  if (errorText) return { error: errorText };

  const code = parsed.searchParams.get('code') || hash.get('code');
  return code ? { code } : { error: 'The sign-in reply carried no authorization code.' };
}
