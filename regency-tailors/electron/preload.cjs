/**
 * The only bridge between the showroom app and the desktop shell.
 *
 * Four functions, no Node, no filesystem, no shell. The renderer is the same
 * bundle the website serves and is treated as untrusted here: it can ask for
 * the sign-in page to be opened and be told when the callback arrives, and
 * that is the whole of it. `contextBridge` copies values across the isolation
 * boundary, so nothing in this file's scope is reachable from the page.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('regencyDesktop', {
  /** Present only in the desktop build; the web build has no such object. */
  isDesktop: true,

  /** The address Supabase must send the browser back to after Google. */
  authCallbackUrl: () => ipcRenderer.invoke('regency:auth-callback-url'),

  /** Hands a Supabase authorize URL to the system browser. */
  openSignIn: url => ipcRenderer.invoke('regency:sign-in', url),

  /** A callback that arrived while the page was still loading, if any. */
  takePendingAuthCallback: () => ipcRenderer.invoke('regency:take-pending-auth'),

  /**
   * Called when Windows hands this app a sign-in callback. Returns an
   * unsubscribe function; only the callback URL crosses, never the event.
   */
  onAuthCallback: handler => {
    if (typeof handler !== 'function') return () => {};
    const listener = (_event, url) => handler(String(url));
    ipcRenderer.on('regency:auth-callback', listener);
    return () => ipcRenderer.removeListener('regency:auth-callback', listener);
  },

  /** File → Print… in the window menu, so the keyboard shortcut still works. */
  onPrintRequested: handler => {
    if (typeof handler !== 'function') return () => {};
    const listener = () => handler();
    ipcRenderer.on('regency:print', listener);
    return () => ipcRenderer.removeListener('regency:print', listener);
  }
});
