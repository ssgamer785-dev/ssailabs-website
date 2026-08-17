// Determines whether the blob download failure is a real Electron defect or an
// artifact of Playwright intercepting downloads over CDP.
import { _electron as electron } from 'playwright-core';
import { rmSync, mkdirSync, existsSync, statSync } from 'node:fs';

const OUT = '/tmp/ss_pg/dl-diag';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
rmSync(`${process.env.HOME}/.config/Signature Suitings`, { recursive: true, force: true });

const app = await electron.launch({ args: ['.', '--no-sandbox'], cwd: '/home/user/ssailabs-website/signature-suitings' });

// Record whether the MAIN process ever sees the download.
await app.evaluate(({ session }) => {
  globalThis.__willDownloadFired = 0;
  globalThis.__savedPaths = [];
  session.defaultSession.on('will-download', (_e, item) => {
    globalThis.__willDownloadFired++;
    globalThis.__savedPaths.push(item.getFilename());
  });
});

const p = await app.firstWindow();
p.setDefaultTimeout(15000);
await p.waitForLoadState('domcontentloaded');
await p.waitForTimeout(2000);

console.log('renderer URL:', p.url());

// Capture via Playwright's own download API.
let pwDownload = null;
const downloadPromise = p.waitForEvent('download', { timeout: 12000 }).catch(() => null);

await p.evaluate(() => {
  const blob = new Blob([new Uint8Array([80, 75, 3, 4, 9, 9, 9, 9])], { type: 'application/zip' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.setAttribute('download', 'Diag-Backup.backup');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
});

pwDownload = await downloadPromise;
console.log('playwright download event:', pwDownload ? 'FIRED' : 'did not fire');
if (pwDownload) {
  console.log('  suggested filename:', pwDownload.suggestedFilename());
  const dest = `${OUT}/${pwDownload.suggestedFilename()}`;
  await pwDownload.saveAs(dest);
  console.log('  saveAs ->', dest, existsSync(dest) ? `${statSync(dest).size} bytes` : 'MISSING');
}

await p.waitForTimeout(1500);
const mainSaw = await app.evaluate(() => ({
  fired: globalThis.__willDownloadFired,
  names: globalThis.__savedPaths
}));
console.log('main-process will-download fired:', JSON.stringify(mainSaw));

await app.close();
