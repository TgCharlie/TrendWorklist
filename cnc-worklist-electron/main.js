const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  Tray,
  Menu,
  nativeImage,
} = require("electron");
const { autoUpdater } = require("electron-updater");

let updateStatus = { status: "idle", version: app.getVersion() };
const path = require("path");
const fs = require("fs");
const net = require("net");
const http = require("http");
const crypto = require("crypto");

// undici (used by the API bundle for FileMaker SSL bypass) calls
// v8.markAsUncloneable which was added in Node 22. Electron 32 ships
// Node 20, so we polyfill it here before requiring the bundle.
const v8 = require("v8");
if (typeof v8.markAsUncloneable !== "function") {
  v8.markAsUncloneable = () => {};
}

let mainWindow;
let tray = null;
let apiPort = null;

// ─── Asset path helper ────────────────────────────────────────────────────────
function getAssetPath(...parts) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, ...parts);
  }
  return path.join(__dirname, ...parts);
}

// ─── Find a free TCP port ─────────────────────────────────────────────────────
function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

// ─── Poll until /api/health responds ─────────────────────────────────────────
function waitForServer(port, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    function attempt() {
      const req = http.get(
        { host: "127.0.0.1", port, path: "/api/health", timeout: 800 },
        (res) => {
          if (res.statusCode < 500) {
            resolve();
          } else {
            retry();
          }
        },
      );
      req.on("error", retry);
      req.on("timeout", () => { req.destroy(); retry(); });
    }
    function retry() {
      if (Date.now() > deadline) {
        reject(new Error("API server did not start within timeout"));
        return;
      }
      setTimeout(attempt, 300);
    }
    attempt();
  });
}

// ─── Start the bundled API server in-process ──────────────────────────────────
async function startApiServer() {
  const port = await findFreePort();

  const dbPath = path.join(app.getPath("userData"), "cnc-worklist.db");
  const frontendPath = app.isPackaged
    ? path.join(process.resourcesPath, "frontend")
    : path.join(__dirname, "dist", "frontend");

  // Set env before requiring the bundle (it reads process.env at module load)
  process.env.PORT = String(port);
  process.env.SQLITE_DB_PATH = dbPath;
  process.env.SESSION_SECRET = crypto.randomBytes(32).toString("hex");
  process.env.NODE_ENV = "production";
  process.env.ELECTRON_FRONTEND_STATIC = frontendPath;

  const apiBundle = path.join(__dirname, "api", "electron-index.js");

  // Ensure the bundle exists before requiring it
  if (!fs.existsSync(apiBundle)) {
    throw new Error(
      `API bundle not found at ${apiBundle}. Run 'node build-api.mjs' first.`,
    );
  }

  require(apiBundle);

  await waitForServer(port);
  return port;
}

// ─── Auto-updater ─────────────────────────────────────────────────────────────
function setupAutoUpdater() {
  autoUpdater.logger = null;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("update-available", (info) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-status", { status: "downloading", version: app.getVersion(), nextVersion: info.version });
    }
    dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "Update Available",
      message: `Version ${info.version} is available`,
      detail:
        "The update is downloading in the background. You'll be notified when it's ready to install.",
      buttons: ["OK"],
    });
  });

  autoUpdater.on("update-downloaded", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-status", { status: "ready", version: app.getVersion() });
    }
    dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "Update Ready to Install",
      message: "A new version has been downloaded.",
      detail:
        "Restart now to apply the update, or it will install automatically the next time you quit the app.",
      buttons: ["Restart Now", "Later"],
      defaultId: 0,
      cancelId: 1,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall();
    });
  });

  autoUpdater.on("error", (err) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("update-status", { status: "error", version: app.getVersion(), error: err?.message ?? String(err) });
    }
    console.error("Auto-updater error:", err?.message ?? err);
  });

  // Check 5 seconds after startup so the main window is fully loaded
  setTimeout(() => {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  }, 5000);
}

// Broadcast current update status to renderer (for sidebar badge)
ipcMain.handle("get-app-version", () => ({ version: app.getVersion() }));

ipcMain.on("check-for-updates", () => checkForUpdatesManually());

function checkForUpdatesManually() {
  if (!app.isPackaged) {
    dialog.showMessageBox(mainWindow, {
      type: "info",
      title: "Dev Mode",
      message: "Update checking is only available in the packaged app.",
      buttons: ["OK"],
    });
    return;
  }
  autoUpdater.checkForUpdates().catch((err) => {
    dialog.showErrorBox("Update Check Failed", err?.message ?? String(err));
  });
}

// ─── Application menu ─────────────────────────────────────────────────────────
function buildAppMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    { role: "fileMenu" },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        {
          label: "Check for Updates…",
          click: checkForUpdatesManually,
        },
        { type: "separator" },
        {
          label: "View on GitHub",
          click: () =>
            shell.openExternal(
              "https://github.com/TgCharlie/TrendWorklist/releases",
            ),
        },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── Tray icon ────────────────────────────────────────────────────────────────
function createFallbackTrayIcon() {
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  for (let i = 0; i < buf.length; i += 4) {
    buf[i] = 60; buf[i + 1] = 120; buf[i + 2] = 200; buf[i + 3] = 255;
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

function createTray() {
  const iconPath = getAssetPath("build", "tray-icon.png");
  const trayIcon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : createFallbackTrayIcon();

  tray = new Tray(trayIcon);
  tray.setToolTip("CNC Worklist Manager");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show CNC Worklist Manager",
      click: () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => { app.isQuitting = true; app.quit(); },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on("double-click", () => { if (mainWindow) { mainWindow.show(); mainWindow.focus(); } });
}

// ─── Browser window ───────────────────────────────────────────────────────────
function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: "CNC Worklist Manager",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}/`);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.platform === "win32") {
    mainWindow.on("close", (e) => {
      if (!app.isQuitting) { e.preventDefault(); mainWindow.hide(); }
    });
  }
}

// ─── IPC: select folder via native dialog ────────────────────────────────────
ipcMain.handle("select-folder", async (_event, { title } = {}) => {
  const { filePaths, canceled } = await dialog.showOpenDialog(mainWindow, {
    title: title || "Select Folder",
    properties: ["openDirectory", "createDirectory"],
  });
  if (canceled || filePaths.length === 0) return { canceled: true, path: null };
  return { canceled: false, path: filePaths[0] };
});

// ─── IPC: save CSV via native dialog ─────────────────────────────────────────
ipcMain.handle("save-csv", async (_event, { csvContent, suggestedFilename }) => {
  const { filePath, canceled } = await dialog.showSaveDialog(mainWindow, {
    title: "Save CSV",
    defaultPath: suggestedFilename,
    filters: [{ name: "CSV Files", extensions: ["csv"] }],
  });
  if (canceled || !filePath) return { success: false, canceled: true };
  try {
    fs.writeFileSync(filePath, csvContent, "utf8");
    return { success: true, filePath };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

// ─── App lifecycle ────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  // Show a loading window while the API server starts
  const splash = new BrowserWindow({
    width: 400,
    height: 200,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: { contextIsolation: true },
  });
  splash.loadURL(
    "data:text/html," +
      encodeURIComponent(
        `<html><body style="margin:0;display:flex;align-items:center;justify-content:center;
         height:100vh;background:#18181b;font-family:system-ui;color:#a1a1aa;font-size:14px;">
         <div><div style="color:#fff;font-size:18px;font-weight:600;margin-bottom:8px;">
         CNC Worklist Manager</div>Starting local server…</div></body></html>`,
      ),
  );

  try {
    apiPort = await startApiServer();
  } catch (err) {
    dialog.showErrorBox(
      "Startup Error",
      `Failed to start the local server:\n\n${err.message}\n\nThe application will now exit.`,
    );
    app.quit();
    return;
  }

  splash.close();

  buildAppMenu();
  createWindow(apiPort);
  setupAutoUpdater();

  if (process.platform === "win32") {
    createTray();
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow(apiPort);
  });
});

app.on("before-quit", () => {
  app.isQuitting = true;
  if (tray) { tray.destroy(); tray = null; }
});

app.on("window-all-closed", () => {
  app.quit();
});
