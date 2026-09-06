/**
 * Regency Tailor — Windows desktop shell.
 *
 * A window around the same build the website serves, talking to the same
 * Supabase project. There is no local database, no second copy of the data and
 * no sync layer: every read and write is the app's existing repository code
 * against production, so an order placed at the counter is on the website
 * before the customer has left, and one placed on a phone is here.
 *
 * What this file is responsible for, and nothing else:
 *   - serving the built app from a real origin so sessions persist
 *   - handing the Google sign-in URL to the system browser
 *   - catching the callback Windows sends back and passing it to the renderer
 *   - a window that remembers where it was
 *   - refusing every navigation and every window the app does not need
 */
const { app, BrowserWindow, Menu, shell, ipcMain, protocol, net, dialog, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const isDev = !app.isPackaged;

/* ------------------------------------------------------------------ origin */
/**
 * The app is served from app://regency-tailor rather than file://.
 *
 * Two reasons. The build references its assets absolutely (/assets/…), which
 * a file:// page resolves against the filesystem root and fails to find. And
 * a file:// page has an opaque origin, so localStorage — where the Supabase
 * session lives — is not reliably the same store between runs; the counter
 * hand would be asked to sign in again every morning. A registered standard
 * scheme is a real, stable, secure origin: absolute paths resolve, storage
 * persists, and the page still gets none of the privileges of a file:// page.
 */
const APP_SCHEME = 'app';
const APP_ORIGIN = `${APP_SCHEME}://regency-tailor`;

/** The custom scheme Supabase redirects back to after Google sign-in. */
const AUTH_SCHEME = 'regencytailor';
const AUTH_CALLBACK = `${AUTH_SCHEME}://auth-callback`;

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
  }
]);

const RENDERER_ROOT = app.isPackaged
  ? path.join(process.resourcesPath, 'app')
  : path.join(__dirname, '..', 'dist');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff',
  '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.map': 'application/json'
};

function serveRenderer() {
  protocol.handle(APP_SCHEME, async request => {
    const { pathname } = new URL(request.url);
    // Resolve inside RENDERER_ROOT and refuse anything that escapes it, so a
    // crafted path cannot read the rest of the disk.
    const rel = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html';
    const target = path.resolve(RENDERER_ROOT, rel);
    const root = path.resolve(RENDERER_ROOT);
    if (target !== root && !target.startsWith(root + path.sep)) {
      return new Response('Forbidden', { status: 403 });
    }
    const onDisk = fs.existsSync(target) && fs.statSync(target).isFile();
    // The app is a single page with no router, so a request for a document is
    // always the page. A request for a named asset that is not there is a
    // build fault and says so — answering it with index.html would hand a
    // stylesheet a page of HTML and turn a missing file into a silent oddity.
    const wantsDocument =
      rel === 'index.html' || path.extname(rel) === '' ||
      (request.headers.get('accept') || '').includes('text/html');
    if (!onDisk && !wantsDocument) return new Response('Not found', { status: 404 });
    const file = onDisk ? target : path.join(root, 'index.html');
    const res = await net.fetch(pathToFileURL(file).toString());
    const type = MIME[path.extname(file).toLowerCase()];
    if (type) {
      const headers = new Headers(res.headers);
      headers.set('Content-Type', type);
      return new Response(res.body, { status: res.status, headers });
    }
    return res;
  });
}

/* ------------------------------------------------------- window placement */
const boundsFile = () => path.join(app.getPath('userData'), 'window-state.json');

function readBounds() {
  try {
    const saved = JSON.parse(fs.readFileSync(boundsFile(), 'utf8'));
    if (
      Number.isFinite(saved.width) && Number.isFinite(saved.height) &&
      saved.width >= 800 && saved.height >= 600
    ) return saved;
  } catch { /* first run, or the file was damaged: fall back to the default */ }
  return null;
}

function saveBounds(win) {
  if (!win || win.isDestroyed() || win.isMinimized()) return;
  try {
    const b = win.getNormalBounds();
    fs.writeFileSync(boundsFile(), JSON.stringify({ ...b, maximized: win.isMaximized() }));
  } catch { /* a window that cannot be remembered is not worth an error */ }
}

/* ---------------------------------------------------------- the OAuth link */
let mainWindow = null;
/** Callbacks that arrive before the page is ready to receive them. */
let pendingAuthUrl = null;

function deliverAuthCallback(url) {
  if (typeof url !== 'string' || !url.startsWith(`${AUTH_SCHEME}://`)) return;
  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isLoading()) {
    mainWindow.webContents.send('regency:auth-callback', url);
  } else {
    pendingAuthUrl = url;
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
}

/** Windows hands the deep link over as an argument to a second launch. */
const authUrlFromArgv = argv =>
  (argv || []).find(a => typeof a === 'string' && a.startsWith(`${AUTH_SCHEME}://`)) || null;

/* ------------------------------------------------------------------ window */
function createWindow() {
  const saved = readBounds();
  mainWindow = new BrowserWindow({
    width: saved?.width ?? 1440,
    height: saved?.height ?? 900,
    x: saved?.x,
    y: saved?.y,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: '#F7F3EA',
    title: 'Regency Tailor',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      // The renderer is the existing web app and needs nothing from Node.
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      webviewTag: false,
      spellcheck: false
    }
  });

  if (saved?.maximized) mainWindow.maximize();

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    if (pendingAuthUrl) {
      mainWindow.webContents.send('regency:auth-callback', pendingAuthUrl);
      pendingAuthUrl = null;
    }
  });

  let saveTimer = null;
  const remember = () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveBounds(mainWindow), 400);
  };
  mainWindow.on('resize', remember);
  mainWindow.on('move', remember);
  mainWindow.on('close', () => { clearTimeout(saveTimer); saveBounds(mainWindow); });
  mainWindow.on('closed', () => { mainWindow = null; });

  /**
   * Nothing navigates this window except the app itself.
   *
   * A link to Google, to the showroom's own website, to anything at all opens
   * in the customer's browser instead of replacing the till screen. Google's
   * sign-in page in particular must never load in here: it is an embedded
   * browser as far as Google is concerned, and signing in through one is both
   * refused by Google and a worse security posture than the system browser.
   */
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.startsWith(APP_ORIGIN)) return;
    event.preventDefault();
    void openExternal(url);
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-attach-webview', event => event.preventDefault());

  // Permissions the showroom suite has no use for are refused outright.
  mainWindow.webContents.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));

  void mainWindow.loadURL(`${APP_ORIGIN}/index.html`);
}

/**
 * A Content-Security-Policy for the desktop window.
 *
 * Set here rather than in index.html so the website is not touched: the page
 * that Vercel serves keeps exactly the headers it has, and this policy applies
 * only inside the application window. Without it Electron warns — correctly —
 * that a renderer with no policy is a renderer where any injected script runs.
 *
 * What each allowance is for:
 *   script-src  'self'                    the bundle, and nothing else. No
 *                                         inline script, no eval.
 *   style-src   'unsafe-inline'           React style props and Tailwind's
 *                                         injected sheet are inline by design.
 *   font-src    fonts.gstatic.com, data:  the two brand faces, and the fonts
 *                                         jsPDF embeds when exporting.
 *   img-src     data:, blob:              html-to-image renders the documents
 *                                         to a canvas before jsPDF writes them.
 *   connect-src the Supabase project      every read and write the app makes.
 *   frame-src / object-src 'none'         nothing is ever embedded in this app.
 */
function applyContentSecurityPolicy() {
  const supabaseHost = 'https://*.supabase.co';
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob:",
    `connect-src 'self' ${supabaseHost} wss://*.supabase.co https://fonts.googleapis.com https://fonts.gstatic.com`,
    "media-src 'self' data: blob:",
    "worker-src 'self' blob:",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'"
  ].join('; ');

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    if (!details.url.startsWith(`${APP_SCHEME}://`)) return callback({});
    const headers = { ...details.responseHeaders };
    delete headers['content-security-policy'];
    delete headers['Content-Security-Policy'];
    headers['Content-Security-Policy'] = [policy];
    callback({ responseHeaders: headers });
  });
}

/** Only ordinary web addresses reach the browser — never a file or a script. */
async function openExternal(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return;
    await shell.openExternal(url.toString());
  } catch { /* not a URL: nothing to open */ }
}

/* -------------------------------------------------------------------- menu */
/**
 * The sidebar is the application's navigation and is not duplicated here.
 * What a desktop window is expected to have and a web page cannot provide —
 * printing, zoom, reload, quit — is all that this holds.
 */
function buildMenu() {
  const template = [
    {
      label: '&File',
      submenu: [
        {
          label: 'Print…',
          accelerator: 'CmdOrCtrl+P',
          click: () => mainWindow?.webContents.send('regency:print')
        },
        { type: 'separator' },
        { role: 'quit', label: 'Exit' }
      ]
    },
    {
      label: '&View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(isDev ? [{ role: 'toggleDevTools' }] : [])
      ]
    },
    {
      label: '&Help',
      submenu: [
        {
          label: 'About Regency Tailor',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Regency Tailor',
              message: 'Regency Tailor',
              detail:
                `Version ${app.getVersion()}\n` +
                `Electron ${process.versions.electron} · Chromium ${process.versions.chrome}\n\n` +
                'Bespoke Showroom & Tailoring Suite.\n' +
                'Records are stored in the showroom database, shared with the website.',
              buttons: ['Close'],
              noLink: true
            });
          }
        }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ------------------------------------------------------------------ single */
// A second launch — including the one Windows performs to deliver the sign-in
// callback — hands its arguments to the running window instead of opening a
// second till screen with a second session.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    const url = authUrlFromArgv(argv);
    if (url) deliverAuthCallback(url);
    else if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // macOS/Linux deliver the deep link as an event rather than an argument.
  app.on('open-url', (event, url) => {
    event.preventDefault();
    deliverAuthCallback(url);
  });

  app.whenReady().then(() => {
    // Register the callback scheme with the operating system. In development
    // the executable is Electron itself, so the path to this project has to be
    // passed along or Windows would launch a bare Electron.
    if (process.defaultApp && process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(AUTH_SCHEME, process.execPath, [path.resolve(process.argv[1])]);
    } else {
      app.setAsDefaultProtocolClient(AUTH_SCHEME);
    }

    applyContentSecurityPolicy();
      serveRenderer();
      buildMenu();
      createWindow();

    const launchUrl = authUrlFromArgv(process.argv);
    if (launchUrl) pendingAuthUrl = launchUrl;

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on('window-all-closed', () => app.quit());

/**
 * Nothing may attach a preload of its own or turn Node back on in a renderer
 * this process did not configure.
 */
app.on('web-contents-created', (_event, contents) => {
  contents.on('will-attach-webview', event => event.preventDefault());
  contents.setWindowOpenHandler(({ url }) => {
    void openExternal(url);
    return { action: 'deny' };
  });
});

/* --------------------------------------------------------------------- ipc */
/**
 * The whole surface the renderer is given. Three messages, each with one job.
 */
ipcMain.handle('regency:sign-in', async (_event, url) => {
  // The URL is built by supabase-js in the renderer and points at the Supabase
  // project's authorize endpoint. It is opened in the customer's own browser:
  // Google requires that, and it keeps the credential out of this process
  // entirely — the app never sees the password, only the code that comes back.
  if (typeof url !== 'string') return false;
  let parsed;
  try { parsed = new URL(url); } catch { return false; }
  if (parsed.protocol !== 'https:') return false;
  await shell.openExternal(parsed.toString());
  return true;
});

ipcMain.handle('regency:auth-callback-url', () => AUTH_CALLBACK);

ipcMain.handle('regency:take-pending-auth', () => {
  const url = pendingAuthUrl;
  pendingAuthUrl = null;
  return url;
});
