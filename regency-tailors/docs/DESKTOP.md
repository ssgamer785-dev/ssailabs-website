# Regency Tailor for Windows

The desktop application is the website in a window. Same build, same Supabase
project, same records — an order placed at the counter is on the website before
the customer has left, and one placed on a phone is at the counter.

There is no local database. There is no offline mode. When the internet is
down the app reports the same save failure it reports in a browser, and it does
not pretend a write succeeded.

---

## One setting is required before Google sign-in works

The desktop window cannot sign in the way a browser tab does. A browser tab is
redirected to Google and back to its own address; a desktop window has no
address to come back to, and Google refuses to sign anyone in inside an
embedded browser — an application that renders the Google password page could
read it.

So the app hands the sign-in page to the counter hand's own browser, and
Windows hands the reply back to the app through a registered address:

```
regencytailor://auth-callback
```

**This address has been added to the Supabase project.** It is recorded here
so that anyone re-provisioning the project knows to add it again:

> Supabase Dashboard → your project → **Authentication** → **URL Configuration**
> → **Redirect URLs** → *Add URL* → `regencytailor://auth-callback` → Save

Nothing else changes. In particular:

- **Google Cloud Console needs no change.** Whatever address the app asks to be
  returned to, the address Supabase gives Google is always its own callback,
  `https://<project>.supabase.co/auth/v1/callback`. The desktop address never
  reaches Google.
- **Site URL stays as it is.** The website keeps working exactly as it does.
- **No new provider, no second login, no client secret** anywhere in the app.

### If the setting is missing

Supabase does not refuse an address that is not on the list — it quietly
replaces it with the project's Site URL. The browser will sign in on the
website instead, and the desktop window will wait. After ninety seconds it says
so and names this setting, rather than sitting there blank.

---

## Building the installer

### The reliable way — GitHub Actions

`.github/workflows/windows-installer.yml` builds on a real Windows runner.
Actions tab → **Windows installer** → *Run workflow*. The installer is attached
to the run as an artifact.

Two repository secrets are read, both of which the website already uses:

| Secret | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | `https://<project>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | the publishable/anon key |

The service-role key is never used, and the workflow fails the build if a
privileged credential is ever found in the bundle.

### On a Windows machine

```
git clone <repo> && cd regency-tailors
npm ci
# .env.local with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run electron:build:win
```

Output:

```
release/Regency Tailor Setup <version>.exe
release/win-unpacked/Regency Tailor.exe
```

### On Linux or macOS

`npm run electron:pack` produces `release/win-unpacked/`, the complete Windows
application.

Wrapping it in the NSIS installer additionally needs a 32-bit Windows loader,
because electron-builder runs the NSIS stub through wine to sign the
uninstaller. On Debian/Ubuntu:

```
dpkg --add-architecture i386 && apt-get update
apt-get install -y --no-install-recommends libgd3:i386 wine32:i386
apt-get install -y --reinstall wine        # restores /usr/bin/wine
WINEPREFIX=/tmp/wineprefix WINEDEBUG=-all \
  npx electron-builder --win nsis --x64 --publish never
```

This produces a genuine installer, but a Linux box cannot *run* it: a 32-bit
wine prefix refuses an x64 payload, and Ubuntu's 32- and 64-bit wine packages
overwrite each other's PE files, so a wow64 prefix cannot be built alongside
the 32-bit loader NSIS needs. **Install-and-run testing requires real Windows.**

---

## What the installer does

- Installs per user — **no administrator prompt**, which matters on a laptop
  where the showroom owner is not the machine's administrator.
- Lets the user choose the folder.
- Creates a **Start Menu** entry and offers a **Desktop** shortcut.
- Registers `regencytailor://` for the sign-in reply.
- Uninstalls from *Apps & features* and removes what it installed.
- Needs no Node.js, no npm and no terminal on the showroom machine.

Running a newer installer over an older one upgrades in place.

### SmartScreen on first run

The installer is not code-signed, so Windows will show *"Windows protected your
PC"* the first time. The counter hand clicks **More info → Run anyway**. This is
normal for unsigned software and does not mean anything is wrong.

To remove that screen, buy an OV or EV code-signing certificate and give
electron-builder `CSC_LINK` and `CSC_KEY_PASSWORD`; nothing else needs to
change. An EV certificate clears SmartScreen immediately, an OV one clears it
after the installer builds reputation.

---

## Updates

There is no update server, and one has not been invented for this. For v1:

1. Build a new installer with the version raised in `package.json`.
2. Send the `.exe` to the showroom, or put it somewhere they can download it.
3. They run it. It installs over the existing copy, keeping the signed-in
    session and the window position.

Nothing is lost in an upgrade, because nothing that matters is stored on the
machine: the records are in Supabase.

If automatic updates are wanted later, electron-builder's `autoUpdater` reads a
plain static folder — a GitHub release, or any web server — and no paid service
is required. It is deliberately not enabled now.

---

## How the shell is put together

| File | What it does |
| --- | --- |
| `electron/main.cjs` | The window, the `app://` origin, the sign-in hand-off, the deep-link callback, the menu |
| `electron/preload.cjs` | The only bridge to the page: six functions, no Node |
| `electron/verify.cjs` | Boots the shell headlessly and prints its security posture — `npm run electron:verify` |
| `electron-builder.yml` | Windows packaging |
| `build/icon.png` | The existing brand mark, rendered square |
| `build/icon.ico` | The same mark as a multi-resolution Windows icon (256/128/64/48/32/24/16). NSIS reads this file directly and rejects a PNG |
| `src/lib/desktop.ts` | The page's view of the shell; inert in a browser |

The page is served from `app://regency-tailor` rather than `file://`. A
`file://` page resolves the build's absolute asset paths against the filesystem
root and fails to find them, and its origin is opaque, so the stored session
would not reliably be the same one between runs — the counter hand would sign
in again every morning. A registered standard scheme is a real, stable, secure
origin with none of a `file://` page's privileges.

### Security posture

Verified by `npm run electron:verify`:

- `contextIsolation` on, `nodeIntegration` off, `sandbox` on, `webSecurity` on
- `webviewTag` off; `will-attach-webview` refused
- `require`, `process`, `Buffer`, `global` and `module` are all unreachable
  from the page
- Every navigation away from `app://` and every `window.open` is refused and
  handed to the system browser instead; only `http:` and `https:` are opened
- All permission requests (camera, location, notifications…) are refused
- One instance only: a second launch hands its arguments to the running window
- No service-role key, no Google client secret — the app holds only the
  publishable key the website already ships, and Row Level Security is what
  actually guards the data
