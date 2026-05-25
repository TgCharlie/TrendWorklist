const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,

  selectFolder: (title) =>
    ipcRenderer.invoke("select-folder", { title }),

  saveCSV: (csvContent, suggestedFilename) =>
    ipcRenderer.invoke("save-csv", { csvContent, suggestedFilename }),

  getAppVersion: () =>
    ipcRenderer.invoke("get-app-version"),

  checkForUpdates: () =>
    ipcRenderer.send("check-for-updates"),

  onUpdateStatus: (callback) =>
    ipcRenderer.on("update-status", (_event, value) => callback(value)),
});
