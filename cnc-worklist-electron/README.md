# CNC Worklist Manager — Desktop App

Native desktop wrapper for the CNC Worklist Manager, built with Electron. The app loads the deployed Replit web frontend so all workstations share the same live database. Native capabilities added on top: a "Save As" dialog for CSV exports and automatic updates via GitHub Releases.

---

## Prerequisites

- Node.js 20 or later
- npm
- For macOS builds: Xcode Command Line Tools
- For Windows builds: No additional tools required (NSIS is bundled with electron-builder)

---

## Local development

```bash
# Install dependencies
npm install

# Copy and configure environment
cp .env.example .env
# Edit .env and set WEBAPP_URL to your deployed app URL

# Launch the app in development mode
npm start
```

The app window loads the URL specified in `WEBAPP_URL`. If running against a local backend, you can point this at `http://localhost:3000` (or whatever port the dev server uses).

---

## Cutting a release

Releases are built and published automatically by GitHub Actions whenever you push a version tag.

1. **Bump the version** in `package.json`:
   ```json
   { "version": "1.0.1" }
   ```

2. **Commit and tag**:
   ```bash
   git add package.json
   git commit -m "chore: release v1.0.1"
   git tag v1.0.1
   git push origin main --tags
   ```

3. GitHub Actions picks up the tag, builds installers on Windows and macOS runners, and uploads them to a new GitHub Release automatically.

4. The installers appear on the **Releases** page of this repository:
   - `CNC Worklist Manager Setup 1.0.1.exe` — Windows NSIS installer
   - `CNC Worklist Manager 1.0.1.msi` — Windows MSI installer
   - `CNC Worklist Manager-1.0.1.dmg` — macOS disk image (Intel + Apple Silicon)

---

## Required GitHub repository secrets

Set these in **Settings → Secrets and variables → Actions**:

| Secret | Description |
|---|---|
| `WEBAPP_URL` | Full URL of the deployed Replit web app (e.g. `https://cnc-worklist.replit.app`) |
| `CSC_LINK` | *(Optional)* Base64-encoded Windows code-signing `.p12` certificate |
| `CSC_KEY_PASSWORD` | *(Optional)* Password for the `.p12` certificate |
| `APPLE_ID` | *(Optional)* Apple ID email for macOS notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | *(Optional)* App-specific password for notarization |
| `APPLE_TEAM_ID` | *(Optional)* Apple Developer Team ID |

`GITHUB_TOKEN` is automatically provided by Actions and requires no setup — it is used to upload release assets.

---

## How end-users install and update

### Windows
1. Download `CNC Worklist Manager Setup x.x.x.exe` from the Releases page.
2. Run the installer. It places a shortcut on the Desktop and in the Start Menu.
3. On first launch (and subsequent launches) the app silently checks for newer releases. If one is found, a dialog prompts you to install now or later. Choosing **Restart Now** downloads, installs, and relaunches automatically.

### macOS
1. Download `CNC Worklist Manager-x.x.x.dmg`.
2. Open the DMG and drag the app to **Applications**.
3. Launch from Applications. Auto-update works the same way as Windows.

---

## Adding app icons (recommended before first release)

Place these files in the `build/` directory to replace the default Electron icon:

| File | Size | Used for |
|---|---|---|
| `build/icon.ico` | 256×256 | Windows installer & taskbar |
| `build/icon.icns` | 512×512 | macOS installer & Dock |
| `build/tray-icon.png` | 16×16 or 32×32 | Windows system tray |

If the files are absent, `electron-builder` falls back to the default Electron icon and the build will still succeed.

---

## Windows system tray

On Windows, closing the main window minimizes the app to the system tray rather than quitting it. A tray icon appears in the notification area with a right-click context menu:

- **Show CNC Worklist Manager** — restores and focuses the window
- **Quit** — fully exits the app

Double-clicking the tray icon also restores the window. The tray is removed when the app fully quits.

---

## Code signing

**Installers are currently unsigned.** Windows will show a SmartScreen warning on first run; users can click "More info → Run anyway." macOS will show a Gatekeeper warning; users can right-click → Open to bypass it once.

To suppress these warnings in production, supply signing certificates:

- **Windows**: Obtain a code-signing certificate from a trusted CA (DigiCert, Sectigo, etc.). Export as `.p12` and set `CSC_LINK` / `CSC_KEY_PASSWORD` in GitHub secrets.
- **macOS**: Enrol in the Apple Developer Program, export your Developer ID Application certificate, and set the `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` secrets. The `electron-builder.yml` already has `hardenedRuntime: true` and the required entitlements for notarization.

---

## CSV export

When running inside the desktop app, the **Download CSV** button opens a native Save As dialog instead of using the browser's download mechanism. The file is written directly to the path you choose on your local machine or network drive.

When accessed via a regular browser, the button falls back to the standard browser download.

---

## Architecture overview

```
┌─────────────────────────────────┐
│  Electron main process          │
│  main.js                        │
│  - Creates BrowserWindow        │
│  - Loads WEBAPP_URL             │
│  - Handles IPC: save-csv        │
│  - Auto-update (electron-updater│
└──────────────┬──────────────────┘
               │ contextBridge (IPC)
┌──────────────▼──────────────────┐
│  Renderer (web app)             │
│  Loaded from WEBAPP_URL         │
│  window.electronAPI.saveCSV()   │
│  → ipcMain.handle('save-csv')   │
│  → native dialog + fs.write     │
└──────────────┬──────────────────┘
               │ HTTPS
┌──────────────▼──────────────────┐
│  Replit backend                 │
│  Express + PostgreSQL           │
│  Shared across all workstations │
└─────────────────────────────────┘
```
