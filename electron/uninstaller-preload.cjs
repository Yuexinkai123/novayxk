const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("novayxkUninstaller", {
  getInfo: () => ipcRenderer.invoke("uninstall:getInfo"),
  run: (request) => ipcRenderer.invoke("uninstall:run", request),
  finalize: () => ipcRenderer.invoke("uninstall:finalize"),
  openPath: (targetPath) => ipcRenderer.invoke("uninstall:openPath", targetPath),
  onProgress: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on("uninstall:progress", listener);
    return () => ipcRenderer.removeListener("uninstall:progress", listener);
  },
  minimize: () => ipcRenderer.invoke("window:minimize"),
  close: () => ipcRenderer.invoke("window:close"),
});
