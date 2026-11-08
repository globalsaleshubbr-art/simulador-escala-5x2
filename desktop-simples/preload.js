const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("escalaDesktop", {
  load: () => ipcRenderer.invoke("escala:load"),
  save: (json) => ipcRenderer.invoke("escala:save", json),
  saveFile: (name, bytes) => ipcRenderer.invoke("escala:saveFile", name, bytes),
  dataPath: () => ipcRenderer.invoke("escala:dataPath"),
});
