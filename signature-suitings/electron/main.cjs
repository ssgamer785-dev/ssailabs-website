/**
 * Electron main process for Signature Suitings.
 *
 * This is a packaging wrapper only. It loads the existing production Vite build
 * (dist/index.html) and changes nothing about how the application behaves: the
 * renderer is the same bundle the browser build produces, talking to the same
 * Supabase project, with the same LocalStorage cache underneath it.
 */
const { app, BrowserWindow, shell, Menu, dialog, session, net } = require("electron");
const path = require("node:path");

// Shown in the window title bar, the Windows task bar, and %APPDATA%.
app.setName("Signature Suitings");

// Keep renderer state (LocalStorage / IndexedDB) under a stable, product-named
// directory rather than one derived from package.json's "react-example".
app.setPath("userData", path.join(app.getPath("appData"), "Signature Suitings"));

const isDev = !app.isPackaged;
let mainWindow = null;

// Web fonts, and why they are gated below.
//
// index.html pulls Inter from fonts.googleapis.com through a render-blocking
// <link rel="stylesheet">. Served over http(s) that is harmless, but the packaged
// app is served from file:// on a showroom laptop that may have no internet. An
// unreachable stylesheet host does not fail fast there — the request simply hangs,
// and because a pending stylesheet blocks the module script that boots React, the
// window stays empty indefinitely. Measured here: the app never finished loading
// offline, and loaded in ~200ms once these two hosts were taken out of the picture.
//
// So: probe once at startup with a short deadline. Online, the fonts load and the
// desktop app looks exactly like the browser build. Offline, they are cancelled
// immediately and the app starts at once, falling back to the next font in the
// stack the stylesheet already declares (Segoe UI on Windows).
const FONT_HOSTS = ["*://fonts.googleapis.com/*", "*://fonts.gstatic.com/*"];

function probeFontsReachable(timeoutMs = 1500) {
  return new Promise(resolve => {
    let settled = false;
    const finish = value => { if (!settled) { settled = true; resolve(value); } };
    const timer = setTimeout(() => finish(false), timeoutMs);
    try {
      const request = net.request({ method: "HEAD", url: "https://fonts.googleapis.com/" });
      request.on("response", () => { clearTimeout(timer); finish(true); });
      request.on("error", () => { clearTimeout(timer); finish(false); });
      request.end();
    } catch (err) {
      clearTimeout(timer);
      finish(false);
    }
  });
}

async function configureWebFonts() {
  const reachable = await probeFontsReachable();
  if (reachable) {
    console.log("[fonts] Google Fonts reachable — loading Inter as the web build does.");
    return;
  }
  console.log("[fonts] Google Fonts unreachable — cancelling those requests so the app starts offline.");
  session.defaultSession.webRequest.onBeforeRequest({ urls: FONT_HOSTS }, (_details, callback) => {
    callback({ cancel: true });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    backgroundColor: "#FAF7F0", // matches the app's cream background, avoids a white flash
    title: "Signature Suitings",
    icon: path.join(__dirname, "icons", "icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      // The renderer is a plain web app and needs no Node access. Keeping the
      // sandbox on and Node off means the packaged app is no more privileged
      // than the same page in a browser.
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  });

  // Avoid showing a blank frame while the bundle parses.
  mainWindow.once("ready-to-show", () => mainWindow.show());

  // Open real external links (docs, support) in the user's browser instead of
  // replacing the application window with them.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) {
      shell.openExternal(url);
    }
    return { action: "deny" };
  });

  // Same guard for in-page navigations away from the app shell.
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const current = mainWindow.webContents.getURL();
    if (url !== current && /^https?:/i.test(url)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  if (isDev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    // The renderer is the production Vite build. It is built with a relative
    // base (see the electron:build script) so its asset URLs resolve under
    // file://, which is what makes the packaged app work offline.
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// A minimal menu. Print and the clipboard/editing roles have to be present for
// Ctrl+P and Ctrl+C/V to behave the way they do in a browser.
function buildMenu() {
  const template = [
    {
      label: "File",
      submenu: [
        {
          label: "Print…",
          accelerator: "CmdOrCtrl+P",
          click: () => {
            if (mainWindow) mainWindow.webContents.print({});
          }
        },
        { type: "separator" },
        { role: "quit", label: "Exit" }
      ]
    },
    { label: "Edit", submenu: [
      { role: "undo" }, { role: "redo" }, { type: "separator" },
      { role: "cut" }, { role: "copy" }, { role: "paste" }, { role: "selectAll" }
    ] },
    { label: "View", submenu: [
      { role: "reload" }, { role: "forceReload" }, { type: "separator" },
      { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" },
      { role: "togglefullscreen" }, { role: "toggleDevTools" }
    ] }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Only one showroom window at a time; re-focus the existing one instead of
// starting a second copy against the same local cache.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    // Must run before the first window loads, otherwise the hang described above
    // happens on that very first load.
    await configureWebFonts();
    buildMenu();
    createWindow();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });
}

app.on("window-all-closed", () => {
  app.quit();
});

// Surface a renderer crash rather than leaving an apparently frozen window.
app.on("render-process-gone", (_event, _contents, details) => {
  dialog.showErrorBox(
    "Signature Suitings stopped responding",
    `The application window closed unexpectedly (${details.reason}). Please reopen Signature Suitings.\n\n` +
    `Your data is stored in the cloud database and in this machine's local cache, so nothing entered before this point is lost.`
  );
});
