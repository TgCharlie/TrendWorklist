const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,

  selectFolder: () =>
    ipcRenderer.invoke("select-folder"),

  saveCSV: (csvContent, suggestedFilename) =>
    ipcRenderer.invoke("save-csv", { csvContent, suggestedFilename }),
});
