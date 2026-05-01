const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,

  saveCSV: (csvContent, suggestedFilename) =>
    ipcRenderer.invoke("save-csv", { csvContent, suggestedFilename }),
});
