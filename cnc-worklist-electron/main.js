const { app, BrowserWindow, ipcMain, dialog, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const path = require("path");
const fs = require("fs");

require("dotenv").config();

const WEBAPP_URL =
  process.env.WEBAPP_URL || "https://your-deployed-app.replit.app";

let mainWindow;

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

  autoUpdater.checkForUpdatesAndNotify();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", () => {
  app.isQuitting = true;
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
