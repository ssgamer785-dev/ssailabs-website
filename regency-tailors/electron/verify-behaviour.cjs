/**
 * The shell's behaviour, exercised rather than asserted from the source: what
 * happens to a navigation the app did not ask for, what the sign-in bridge
 * refuses, and whether a callback delivered while the page is loading survives.
 */
const { app, BrowserWindow, shell, ipcMain } = require('electron');
const path = require('node:path');

const opened = [];
shell.openExternal = async url => { opened.push(url); return undefined; };

require('./main.cjs');

const results = [];
const check = (name, ok, detail = '') => {
  results.push(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  return ok;
};

app.whenReady().then(async () => {
  await new Promise(r => setTimeout(r, 4000));
  const win = BrowserWindow.getAllWindows()[0];
  const wc = win.webContents;

  /* --- a navigation the app did not ask for goes to the browser --------- */
  opened.length = 0;
  const before = wc.getURL();
  await wc.executeJavaScript(`window.location.href = 'https://example.com/phishing'; true`);
  await new Promise(r => setTimeout(r, 1200));
  check('a navigation away from the app is refused', wc.getURL() === before, wc.getURL());
  check('and is handed to the system browser instead',
    opened.some(u => u.startsWith('https://example.com')), JSON.stringify(opened));

  /* --- window.open is denied ------------------------------------------- */
  opened.length = 0;
  const popup = await wc.executeJavaScript(
    `String(window.open('https://example.com/popup', '_blank'))`);
  await new Promise(r => setTimeout(r, 600));
  check('window.open does not create a second window',
    BrowserWindow.getAllWindows().length === 1 && popup === 'null', `${BrowserWindow.getAllWindows().length} windows, returned ${popup}`);
  check('the popup URL goes to the system browser',
    opened.some(u => u.startsWith('https://example.com')), JSON.stringify(opened));

  /* --- the sign-in bridge only opens https ------------------------------ */
  const trySignIn = url => wc.executeJavaScript(
    `window.regencyDesktop.openSignIn(${JSON.stringify(url)})`);
  opened.length = 0;
  check('sign-in refuses a file:// URL', (await trySignIn('file:///etc/passwd')) === false);
  check('sign-in refuses a javascript: URL', (await trySignIn('javascript:alert(1)')) === false);
  check('sign-in refuses plain http', (await trySignIn('http://insecure.example')) === false);
  check('sign-in refuses a non-string', (await wc.executeJavaScript(
    'window.regencyDesktop.openSignIn(42)')) === false);
  check('nothing was opened by any of those', opened.length === 0, JSON.stringify(opened));
  check('sign-in accepts an https Supabase authorize URL',
    (await trySignIn('https://bxzdhyeutljtekeljpqe.supabase.co/auth/v1/authorize?provider=google')) === true);
  check('and that one did reach the browser', opened.length === 1, JSON.stringify(opened));

  /* --- the callback address the renderer is told to use ----------------- */
  const cb = await wc.executeJavaScript('window.regencyDesktop.authCallbackUrl()');
  check('the callback address is the registered custom scheme',
    cb === 'regencytailor://auth-callback', cb);

  /* --- a callback delivered from the OS reaches the page ---------------- */
  const got = wc.executeJavaScript(`new Promise(resolve => {
    const off = window.regencyDesktop.onAuthCallback(url => { off(); resolve(url); });
    setTimeout(() => resolve('TIMEOUT'), 5000);
  })`, true);
  await new Promise(r => setTimeout(r, 400));
  // Fire it from the main process the way the second-instance handler does.
  app.emit('second-instance', {}, ['electron', 'regencytailor://auth-callback?code=probe-123']);
  const delivered = await got;
  check('a deep-link callback is delivered to the page',
    delivered === 'regencytailor://auth-callback?code=probe-123', String(delivered));

  /* --- a non-callback argument does not masquerade as one --------------- */
  const stray = wc.executeJavaScript(`new Promise(resolve => {
    const off = window.regencyDesktop.onAuthCallback(url => { off(); resolve('DELIVERED ' + url); });
    setTimeout(() => resolve('nothing delivered'), 2500);
  })`, true);
  await new Promise(r => setTimeout(r, 400));
  app.emit('second-instance', {}, ['electron', 'https://evil.example/?code=x']);
  const strayResult = await stray;
  check('an unrelated argument is not treated as a callback',
    strayResult === 'nothing delivered', String(strayResult));

  /* --- the page cannot reach beyond the renderer root ------------------- */
  const readOutside = await wc.executeJavaScript(
    `fetch('app://regency-tailor/../../../../etc/passwd')
       .then(async r => r.status + ':' + (await r.text()).slice(0, 12)).catch(() => 'threw')`);
  check('a traversal cannot read a file outside the app',
    !String(readOutside).includes('root:'), String(readOutside));
  const encoded = await wc.executeJavaScript(
    `fetch('app://regency-tailor/%2e%2e%2f%2e%2e%2f%2e%2e%2f%2e%2e%2fetc%2fpasswd')
       .then(r => r.status).catch(() => 'threw')`);
  check('an encoded traversal is refused outright', encoded === 403, String(encoded));
  const missing = await wc.executeJavaScript(
    `fetch('app://regency-tailor/assets/does-not-exist.js').then(r => r.status).catch(() => 'threw')`);
  check('a missing asset is a 404, not a page of HTML', missing === 404, String(missing));

  /* --- print bridge ----------------------------------------------------- */
  const printed = wc.executeJavaScript(`new Promise(resolve => {
    window.print = () => resolve('print() called');
    window.regencyDesktop.onPrintRequested(() => window.print());
    setTimeout(() => resolve('TIMEOUT'), 4000);
  })`, true);
  await new Promise(r => setTimeout(r, 400));
  wc.send('regency:print');
  const printResult = await printed;
  check('File → Print reaches the page', printResult === 'print() called', String(printResult));

  console.log('\n=== SHELL BEHAVIOUR ===');
  console.log(results.join('\n'));
  const failed = results.filter(r => r.includes('FAIL')).length;
  console.log(`\nBEHAVIOUR: ${results.length - failed}/${results.length} passed`);
  app.exit(failed ? 1 : 0);
});
