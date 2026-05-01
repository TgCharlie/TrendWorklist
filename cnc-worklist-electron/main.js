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
const path = require("path");
const fs = require("fs");

// Load .env for local development (no-op in packaged builds)
require("dotenv").config();

function getWebappUrl() {
  // 1. config.json — written by CI at build time and bundled into the installer
  try {
    const configPath = path.join(__dirname, "config.json");
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    if (config.webappUrl && config.webappUrl.startsWith("http")) {
      return config.webappUrl;
    }
  } catch (_) {}

  // 2. WEBAPP_URL env var — for local development via .env
  if (process.env.WEBAPP_URL) return process.env.WEBAPP_URL;

  return "https://your-deployed-app.replit.app";
}

const WEBAPP_URL = getWebappUrl();

// In packaged builds, runtime assets live in process.resourcesPath.
// In development, they live next to main.js.
function getAssetPath(relativePath) {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, relativePath);
  }
  return path.join(__dirname, relativePath);
}

let mainWindow;
let tray = null;

function createTray() {
  const iconPath = getAssetPath(path.join("build", "tray-icon.png"));
  const trayIcon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath)
    : nativeImage.createEmpty();

  tray = new Tray(trayIcon);
  tray.setToolTip("CNC Worklist Manager");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "Show CNC Worklist Manager",
      click: () => {
        if (mainWindow) {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on("double-click", () => {
    if (mainWindow) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

function createWindow() {
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

  mainWindow.loadURL(WEBAPP_URL);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (process.platform === "win32") {
    mainWindow.on("close", (e) => {
      if (!app.isQuitting) {
        e.preventDefault();
        mainWindow.hide();
      }
    });
  }
}

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

app.whenReady().then(() => {
  createWindow();

  if (process.platform === "win32") {
    createTray();
  }

  autoUpdater.checkForUpdatesAndNotify();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  app.isQuitting = true;
  if (tray) {
    tray.destroy();
    tray = null;
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

autoUpdater.on("update-available", (info) => {
  dialog.showMessageBox(mainWindow, {
    type: "info",
    title: "Update Available",
    message: `Version ${info.version} is available and is being downloaded in the background.`,
    buttons: ["OK"],
  });
});

autoUpdater.on("update-downloaded", () => {
  dialog.showMessageBox(mainWindow, {
    type: "info",
    title: "Update Ready",
    message:
      "A new version has been downloaded. Restart the application to apply the update.",
    buttons: ["Restart Now", "Later"],
    defaultId: 0,
    cancelId: 1,
  }).then(({ response }) => {
    if (response === 0) {
      autoUpdater.quitAndInstall();
    }
  });
});

autoUpdater.on("error", (err) => {
  console.error("Auto-updater error:", err.message);
});
