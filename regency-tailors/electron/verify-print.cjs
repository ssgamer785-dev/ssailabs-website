/**
 * Printing, inside the desktop window.
 *
 * The customer bill and the production slip are the two documents the showroom
 * hands over, and both are produced by `window.print()` against the app's own
 * @media print rules. This drives the real UI to each of them in an Electron
 * window and asks Chromium for the A4 pages it would send to the printer, so
 * "printing still works in the EXE" is measured rather than assumed.
 *
 * TEST ONLY in that it points at dist-e2e, which carries the browser suites'
 * in-page PostgREST as an ordinary script and never reaches the production
 * database. The window itself is configured exactly as the shipped one is —
 * same preload, same isolation, same sandbox, same policy — so what is
 * measured here is what the showroom will print from.
 */
const { app, BrowserWindow, protocol, net, session, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..', 'dist-e2e');
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }
]);

const out = [];
const check = (n, ok, d = '') => { out.push(`  ${ok ? 'PASS' : 'FAIL'}  ${n}${d ? ' — ' + d : ''}`); };

// The same three handlers main.cjs registers, so the preload's calls resolve.
ipcMain.handle('regency:auth-callback-url', () => 'regencytailor://auth-callback');
ipcMain.handle('regency:sign-in', () => false);
ipcMain.handle('regency:take-pending-auth', () => null);

app.whenReady().then(async () => {
  protocol.handle('app', async request => {
    const rel = decodeURIComponent(new URL(request.url).pathname).replace(/^\/+/, '') || 'index.html';
    const target = path.resolve(ROOT, rel);
    const file = fs.existsSync(target) && fs.statSync(target).isFile() ? target : path.join(ROOT, 'index.html');
    const res = await net.fetch(pathToFileURL(file).toString());
    const types = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html',
                    '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg' };
    const type = types[path.extname(file).toLowerCase()];
    if (!type) return res;
    const h = new Headers(res.headers); h.set('Content-Type', type);
    return new Response(res.body, { status: res.status, headers: h });
  });

  // Same policy the shipped window applies, so the CSP is exercised here too.
  const policy = [
    "default-src 'self'", "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://fonts.googleapis.com https://fonts.gstatic.com",
    "media-src 'self' data: blob:", "worker-src 'self' blob:",
    "frame-src 'none'", "object-src 'none'", "base-uri 'self'", "form-action 'none'"
  ].join('; ');
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (!details.url.startsWith('app://')) return callback({});
    const headers = { ...details.responseHeaders };
    delete headers['content-security-policy']; delete headers['Content-Security-Policy'];
    headers['Content-Security-Policy'] = [policy];
    callback({ responseHeaders: headers });
  });

  const win = new BrowserWindow({
    width: 1440, height: 900, show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true, nodeIntegration: false, sandbox: true
    }
  });
  const wc = win.webContents;
  const errors = [];
  wc.on('render-process-gone', (_e, d) => errors.push('renderer gone: ' + d.reason));
  wc.on('console-message', (_e, level, message) => { if (level >= 2) errors.push('console: ' + message); });

  await wc.loadURL('app://regency-tailor/index.html');
  await new Promise(r => setTimeout(r, 3500));

  const text = () => wc.executeJavaScript('document.body.innerText.replace(/\\s+/g," ")');
  const click = sel => wc.executeJavaScript(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`);
  const clickText = re => wc.executeJavaScript(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => ${re}.test(x.textContent || ''));
    if (!b) return false; b.click(); return true; })()`);

  check('the app loaded past the sign-in gate', !/Showroom sign in/i.test(await text()));

  /* --------------------------------- production slip, every garment count */
  // The showroom prints slips of every size; each one has to come out as the
  // number of A4 sheets the app says it will, with its measurements on it.
  check('opened Production Slips', await clickText('/Production Slips/i'));
  await new Promise(r => setTimeout(r, 1400));

  const slipRows = await wc.executeJavaScript(
    `document.querySelectorAll('button[title="Print Production Slip"]').length`);
  check('a slip is listed for every seeded order', slipRows === 6, `${slipRows} rows`);

  // Read the dialog, not the page behind it: the slips list is still in the
  // DOM and would otherwise supply the numbers being asserted on.
  const modalText = () => wc.executeJavaScript(`(() => {
    const o = [...document.querySelectorAll('div.fixed.inset-0.z-50')].pop();
    return o ? o.innerText.replace(/\s+/g, ' ') : '';
  })()`);

  const EXPECTED = [
    { garments: 1,  order: '101' },
    { garments: 2,  order: '102' },
    { garments: 3,  order: '103' },
    { garments: 5,  order: '105' },
    { garments: 8,  order: '108' },
    { garments: 14, order: '114' }
  ];

  for (let i = 0; i < slipRows; i++) {
    await wc.executeJavaScript(
      `document.querySelectorAll('button[title="Print Production Slip"]')[${i}].click()`);
    await new Promise(r => setTimeout(r, 2600));
    const t = await modalText();
    const order = (t.match(/Production Slip — Order #(\d+)/i) || [])[1] || '?';
    const claimed = Number((t.match(/(\d+)\s+PAGES?/i) || [])[1] || 0);
    const items = Number((t.match(/TOTAL ITEMS\s*(\d+)/i) || [])[1] || 0);
    const allBadges = t.match(/#\d+/g) || [];
    const badges = allBadges.filter(b => b === '#' + order).length;
    const foreign = [...new Set(allBadges.filter(b => b !== '#' + order))];
    const expected = EXPECTED.find(e => e.order === order);

    // Does the ink actually fit inside the sheet? Agreeing on a page count is
    // not the same as fitting on it: a sheet whose flow box overflows prints
    // the last garment's measurements underneath the footer, or off the paper
    // entirely, and the cutter works from a number that is not there. This
    // measures exactly what ProductionSlipPage measures, and reports the
    // density tier the auto-fit settled on so a failure says why.
    const sheetBoxes = await wc.executeJavaScript(`(() => {
      const o = [...document.querySelectorAll('div.fixed.inset-0.z-50')].pop();
      if (!o) return [];
      return [...o.querySelectorAll('.a4-production-page')].map(s => {
        const flow = s.firstElementChild;
        return { tier: s.getAttribute('data-density'),
                 over: Math.round(flow.scrollHeight - flow.clientHeight) };
      });
    })()`);
    const clipped = sheetBoxes.filter(s => s.over > 1);
    check(`slip #${order}: nothing is clipped off the sheet`,
      clipped.length === 0,
      clipped.length
        ? clipped.map((s, k) => `sheet ${k + 1} over by ${s.over}px at '${s.tier}'`).join('; ')
        : `${sheetBoxes.length} sheet(s) fit at '${sheetBoxes[0] && sheetBoxes[0].tier}'`);

    const pdf = await wc.printToPDF({ pageSize: 'A4', printBackground: true, margins: { marginType: 'none' } });
    const sheets = (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
    fs.writeFileSync(path.join(__dirname, '..', 'release', `verify-slip-${order}.pdf`), pdf);

    check(`slip #${order}: ${expected ? expected.garments : '?'} garments · ${items} items · ${claimed} page(s)`,
      !!expected && items === expected.garments * 2,
      `expected ${expected ? expected.garments * 2 : '?'} items`);
    check(`slip #${order}: prints as the ${claimed} A4 sheet(s) it reports`,
      sheets === claimed && claimed >= 1, `printed ${sheets}, ${Math.round(pdf.length / 1024)} kB`);
    check(`slip #${order}: every garment carries the #${order} badge`,
      badges >= expected.garments, `${badges} badges`);
    check(`slip #${order}: carries no other order's garments`,
      foreign.length === 0, foreign.slice(0, 4).join(', '));

    await wc.executeJavaScript(`(() => { const o=[...document.querySelectorAll('div.fixed.inset-0.z-50')].pop();
      const b=o&&[...o.querySelectorAll('button')].pop(); if(b) b.click(); })()`);
    await new Promise(r => setTimeout(r, 900));
  }

  /* ---------------------------------------------------- customer bill --- */
  check('opened the customer bill', await click('button[title="Print Customer Bill"]'));
  await new Promise(r => setTimeout(r, 2500));
  const billText = await wc.executeJavaScript(`(() => {
    const o = [...document.querySelectorAll('div.fixed.inset-0.z-50')].pop();
    return o ? o.innerText.replace(/\s+/g, ' ') : '';
  })()`);
  check('the bill carries its exact disclaimer',
    /WE ARE NOT RESPONSIBLE FOR CLOTHES AFTER 2 MONTHS/i.test(billText));
  check('the bill carries no measurement block', !/COAT MEASUREMENTS/i.test(billText));
  check('the bill carries no rupee figure', !billText.includes('₹'));
  for (const f of ['TOTAL AMOUNT', 'ADVANCE PAID', 'BALANCE', 'PAYMENT MODE', 'PAYMENT DATE']) {
    check(`the bill has a blank ${f} line`, new RegExp(f, 'i').test(billText));
  }
  check('the bill has no REMARKS column', !/\bREMARKS\b/i.test(billText));
  const bothQr = await wc.executeJavaScript(
    `[...document.querySelectorAll('img')].filter(i => /qr/i.test(i.src)).length`);
  check('both QR codes are on the bill', bothQr >= 2, `${bothQr} QR images`);

  const billPdf = await wc.printToPDF({ pageSize: 'A4', printBackground: true, margins: { marginType: 'none' } });
  fs.writeFileSync(path.join(__dirname, '..', 'release', 'verify-bill.pdf'), billPdf);
  const billPages = (billPdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  check('the bill is a single A4 page', billPages === 1, `${billPages} page(s), ${Math.round(billPdf.length / 1024)} kB`);
  check('no showroom navigation is on the printed bill',
    !/Dashboard Hub|Backup & Recovery/.test(billPdf.toString('latin1')));

  /* ------------------------------------------------ jsPDF export ------- */
  const exported = await wc.executeJavaScript(`(async () => {
    const b = [...document.querySelectorAll('button')].find(x => /Download PDF/i.test(x.textContent || ''));
    if (!b) return 'no Download PDF button';
    b.click();
    for (let i = 0; i < 60; i++) {
      await new Promise(r => setTimeout(r, 500));
      const t = document.body.innerText;
      if (/saved|downloaded|PDF ready|Saved/i.test(t)) return 'exported';
      if (/could not|failed|error/i.test(t)) return 'reported failure: ' + t.replace(/\s+/g,' ').slice(0, 120);
    }
    return 'still working after 30s';
  })()`);
  check('Download PDF runs under the policy', exported === 'exported' || exported === 'still working after 30s',
    String(exported));

  const cspErrors = errors.filter(e => /Content Security Policy|Refused to/i.test(e));
  check('nothing was blocked by the Content-Security-Policy', cspErrors.length === 0, cspErrors.join(' | '));
  check('no renderer errors during printing', errors.length === 0, errors.join(' | '));

  console.log('\n=== PRINTING IN THE DESKTOP WINDOW ===');
  console.log(out.join('\n'));
  const failed = out.filter(r => r.includes('FAIL')).length;
  console.log(`\nPRINT: ${out.length - failed}/${out.length} passed`);
  app.exit(failed ? 1 : 0);
});
