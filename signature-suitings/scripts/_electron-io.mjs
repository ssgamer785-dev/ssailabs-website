// Focused check of the Electron-specific I/O paths that packaging affects:
// blob downloads (backup export) and the file picker (backup import).
// The backup engine's own correctness is covered by the ZIP round-trip suite;
// what is unproven under Electron is whether a blob download reaches disk and
// whether <input type=file> is wired to a real dialog.
//
// CURRENT RESULT: the blob download FAILS — zero files reach disk. backupEngine's
// triggerFileDownload() builds an <a download> pointing at a blob: URL and clicks
// it, which works in a browser but produces nothing under Electron's file:// origin.
// In a packaged build that means "Export Full Backup" appears to run and silently
// writes no file.
//
// PROPOSED FIX (designed, NOT yet implemented or tested): stop loading the renderer
// over file:// and serve dist from a registered privileged scheme instead —
// protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard:
// true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }}])
// plus protocol.handle('app', ...) and loadURL('app://bundle/index.html'). A normal
// secure origin restores standard download behaviour. This is packaging-layer only;
// it needs no change to application source.
import { _electron as electron } from 'playwright-core';
import { existsSync, readdirSync, rmSync, mkdirSync, statSync } from 'node:fs';

let pass = 0, fail = 0;
const ck = (n, c, d = "") => { console.log(c ? `  PASS  ${n}` : `  FAIL  ${n}${d ? "  -- " + d : ""}`); c ? pass++ : fail++; };

const DL = '/tmp/ss_pg/electron-io';
rmSync(DL, { recursive: true, force: true });
mkdirSync(DL, { recursive: true });
rmSync(`${process.env.HOME}/.config/Signature Suitings`, { recursive: true, force: true });

const app = await electron.launch({ args: ['.', '--no-sandbox'], cwd: '/home/user/ssailabs-website/signature-suitings' });

await app.evaluate(async ({ session }, dir) => {
  session.defaultSession.on('will-download', (_e, item) => {
    item.setSavePath(require('node:path').join(dir, item.getFilename()));
  });
}, DL);

const p = await app.firstWindow();
p.setDefaultTimeout(15000);
await p.waitForLoadState('domcontentloaded');
await p.waitForTimeout(2500);

// --- 1. Blob download: the exact mechanism backupEngine.triggerFileDownload uses.
console.log('--- Electron download path (backup export mechanism) ---');
await p.evaluate(() => {
  const zipLike = new Blob([new Uint8Array([80, 75, 3, 4, 1, 2, 3, 4, 5, 6, 7, 8])], { type: 'application/zip' });
  const url = URL.createObjectURL(zipLike);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', 'Signature-Suitings-Backup-TEST.backup');
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
for (let i = 0; i < 20 && readdirSync(DL).length === 0; i++) await p.waitForTimeout(500);
const files = readdirSync(DL);
console.log('   files on disk:', JSON.stringify(files));
ck('blob download reached the filesystem', files.length > 0, JSON.stringify(files));
ck('download kept the .backup filename', files.some(f => f.endsWith('.backup')), JSON.stringify(files));
if (files.length) ck('downloaded file has real bytes', statSync(`${DL}/${files[0]}`).size > 0);

// --- 2. File picker exists and is a real OS dialog binding.
console.log('--- Electron file import path ---');
await p.evaluate(() => { localStorage.setItem('showroom_authenticated', 'true'); localStorage.setItem('showroom_role', 'Admin'); });
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForTimeout(3500);
await p.getByRole('button', { name: /Backup.*Recovery|Backup/i }).first().click();
await p.waitForTimeout(2500);
const fileInputs = await p.locator('input[type="file"]').count();
ck('backup IMPORT file input present on the Backup screen', fileInputs > 0, `${fileInputs} inputs`);

// setInputFiles proves the renderer accepts a real file handed to that input,
// which is what the OS picker does in the packaged app.
if (fileInputs > 0 && files.length > 0) {
  await p.locator('input[type="file"]').first().setInputFiles(`${DL}/${files[0]}`);
  await p.waitForTimeout(2500);
  const txt = await p.$eval('body', el => el.innerText).catch(() => '');
  // The stub is not a valid archive, so the app must REJECT it — that is the
  // correct, honest behaviour and proves the import path actually parses input.
  ck('import path processed the chosen file (validates rather than silently accepting)',
     /invalid|corrupt|could not|failed|unsupported|missing/i.test(txt),
     txt.slice(0, 160).replace(/\n+/g, ' | '));
}

// --- 3. Electron native dialog APIs are available for save/open.
const dialogApis = await app.evaluate(({ dialog }) => ({
  save: typeof dialog.showSaveDialog === 'function',
  open: typeof dialog.showOpenDialog === 'function'
}));
ck('Electron save dialog API available', dialogApis.save);
ck('Electron open dialog API available', dialogApis.open);

console.log(`\n================ ELECTRON I/O: ${pass} passed, ${fail} failed ================`);
await app.close();
process.exit(fail > 0 ? 1 : 0);
