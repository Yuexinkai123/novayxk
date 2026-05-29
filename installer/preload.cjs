const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("novayxkInstaller", {
  getDefaults: () => ipcRenderer.invoke("installer:getDefaults"),
  chooseDirectory: (currentPath) => ipcRenderer.invoke("installer:chooseDirectory", currentPath),
  install: (options) => ipcRenderer.invoke("installer:install", options),
  uninstall: (options) => ipcRenderer.invoke("installer:uninstall", options),
  finalizeUninstall: () => ipcRenderer.invoke("installer:finalizeUninstall"),
  launchApp: (installDir) => ipcRenderer.invoke("installer:launchApp", installDir),
  openPath: (targetPath) => ipcRenderer.invoke("installer:openPath", targetPath),
  minimize: () => ipcRenderer.invoke("window:minimize"),
  close: () => ipcRenderer.invoke("window:close"),
  onProgress: (callback) => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on("installer:progress", listener);
    return () => ipcRenderer.removeListener("installer:progress", listener);
  },
});
