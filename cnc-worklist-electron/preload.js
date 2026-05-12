const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,

  selectFolder: (title) =>
    ipcRenderer.invoke("select-folder", { title }),

  saveCSV: (csvContent, suggestedFilename) =>
    ipcRenderer.invoke("save-csv", { csvContent, suggestedFilename }),
});
