/**
 * Boots the real shell headlessly and reports what it actually did: which
 * origin the page is on, what the renderer can reach, whether Node leaked in,
 * and whether the app rendered. Run with `npm run electron:verify`.
 */
const { app, BrowserWindow } = require('electron');
const path = require('node:path');

process.env.REGENCY_VERIFY = '1';
require('./main.cjs');

const out = [];
const say = (k, v) => { out.push(`${k.padEnd(46)} ${v}`); };

app.whenReady().then(async () => {
  // Give the window a moment to load through app://.
  await new Promise(r => setTimeout(r, 4000));
  const win = BrowserWindow.getAllWindows()[0];
  if (!win) { console.log('NO WINDOW'); app.exit(1); return; }

  const wc = win.webContents;
  const prefs = wc.getLastWebPreferences() || {};

  say('window created', 'yes');
  say('  size', JSON.stringify(win.getBounds()));
  say('  minimum size', JSON.stringify(win.getMinimumSize()));
  say('  resizable / maximizable', `${win.isResizable()} / ${win.isMaximizable()}`);
  say('contextIsolation', String(prefs.contextIsolation));
  say('nodeIntegration', String(prefs.nodeIntegration === true));
  say('sandbox', String(prefs.sandbox !== false));
  say('webSecurity', String(prefs.webSecurity !== false));
  say('webviewTag', String(prefs.webviewTag === true));
  say('page URL', wc.getURL());

  const probe = await wc.executeJavaScript(`(() => ({
    origin: window.location.origin,
    isSecureContext: window.isSecureContext,
    hasRequire: typeof require !== 'undefined',
    hasProcess: typeof process !== 'undefined',
    hasBuffer: typeof Buffer !== 'undefined',
    hasGlobal: typeof global !== 'undefined',
    hasModule: typeof module !== 'undefined',
    bridgeKeys: window.regencyDesktop ? Object.keys(window.regencyDesktop).sort() : null,
    bridgeFrozenProto: window.regencyDesktop ? Object.getPrototypeOf(window.regencyDesktop) === Object.prototype : null,
    localStorageWorks: (() => { try { localStorage.setItem('__probe','1'); const v = localStorage.getItem('__probe'); localStorage.removeItem('__probe'); return v === '1'; } catch (e) { return 'threw: ' + e.message; } })(),
    rootChildren: document.getElementById('root') ? document.getElementById('root').children.length : -1,
    bodyText: (document.body.innerText || '').replace(/\\s+/g,' ').slice(0, 130),
    title: document.title
  }))()`);

  say('renderer origin', probe.origin);
  say('  secure context', String(probe.isSecureContext));
  say('  require() reachable', String(probe.hasRequire));
  say('  process reachable', String(probe.hasProcess));
  say('  Buffer reachable', String(probe.hasBuffer));
  say('  global reachable', String(probe.hasGlobal));
  say('  module reachable', String(probe.hasModule));
  say('  localStorage usable', String(probe.localStorageWorks));
  say('preload bridge keys', JSON.stringify(probe.bridgeKeys));
  say('document.title', probe.title);
  say('#root children', String(probe.rootChildren));
  say('first paint text', probe.bodyText);

  console.log('\n=== ELECTRON SHELL VERIFICATION ===');
  console.log(out.join('\n'));
  app.exit(0);
});
