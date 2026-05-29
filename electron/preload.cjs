const { contextBridge, ipcRenderer } = require("electron");

function readInitialConfig() {
  try {
    const fs = require("node:fs");
    const os = require("node:os");
    const path = require("node:path");
    const configPath = path.join(os.homedir(), ".novayxk", "config", "providers.json");
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    return {};
  }
}

const initialConfig = readInitialConfig();

if (initialConfig.theme === "light" || initialConfig.theme === "dark") {
  document.documentElement.dataset.theme = initialConfig.theme;
}

function createRequestId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

let activeStreamRequestId = null;

contextBridge.exposeInMainWorld("novayxk", {
  initialConfig,
  openProject: () => ipcRenderer.invoke("project:open"),
  openProjectPath: (projectRoot) => ipcRenderer.invoke("project:openPath", projectRoot),
  refreshProject: () => ipcRenderer.invoke("project:refresh"),
  readDirectory: (relativePath) => ipcRenderer.invoke("project:readDirectory", relativePath),
  searchFiles: (query) => ipcRenderer.invoke("project:searchFiles", query),
  getProjectContext: (request) => ipcRenderer.invoke("project:context", request),
  readFile: (relativePath) => ipcRenderer.invoke("project:readFile", relativePath),
  saveFile: (relativePath, content) => ipcRenderer.invoke("project:saveFile", { relativePath, content }),
  applyPatch: (patchText) => ipcRenderer.invoke("project:applyPatch", patchText),
  applyFileOps: (operations) => ipcRenderer.invoke("project:applyFileOps", operations),
  undoLastPatch: () => ipcRenderer.invoke("project:undoLastPatch"),
  inspectCommand: (command) => ipcRenderer.invoke("project:inspectCommand", command),
  runCommand: (command) => ipcRenderer.invoke("project:runCommand", command),
  runCommandWithMode: (request) => ipcRenderer.invoke("project:runCommandWithMode", request),
  startTerminalTask: (request) => ipcRenderer.invoke("terminal:start", request),
  stopTerminalTask: (taskId) => ipcRenderer.invoke("terminal:stop", taskId),
  restartTerminalTask: (taskId) => ipcRenderer.invoke("terminal:restart", taskId),
  listTerminalTasks: () => ipcRenderer.invoke("terminal:list"),
  onTerminalTaskUpdate: (handler) => {
    const listener = (_event, payload) => handler?.(payload);
    ipcRenderer.on("terminal:taskUpdate", listener);
    return () => ipcRenderer.removeListener("terminal:taskUpdate", listener);
  },
  getProjectMemoryState: () => ipcRenderer.invoke("memory:getProjectState"),
  saveProjectMemory: (memory) => ipcRenderer.invoke("memory:saveProjectMemory", memory),
  saveTask: (task) => ipcRenderer.invoke("memory:saveTask", task),
  loadTask: (taskId) => ipcRenderer.invoke("memory:loadTask", taskId),
  getConfig: () => ipcRenderer.invoke("config:get"),
  saveConfig: (config) => ipcRenderer.invoke("config:save", config),
  chat: (request) => ipcRenderer.invoke("ai:chat", request),
  chatStream: (request, handlers) =>
    new Promise((resolve, reject) => {
      const requestId = createRequestId();
      activeStreamRequestId = requestId;
      const cleanup = () => {
        if (activeStreamRequestId === requestId) {
          activeStreamRequestId = null;
        }
        ipcRenderer.removeListener("ai:chatStream:chunk", onChunk);
        ipcRenderer.removeListener("ai:chatStream:done", onDone);
        ipcRenderer.removeListener("ai:chatStream:error", onError);
      };
      const onChunk = (_event, id, chunk) => {
        if (id === requestId) handlers?.onChunk?.(chunk);
      };
      const onDone = (_event, id) => {
        if (id !== requestId) return;
        cleanup();
        resolve();
      };
      const onError = (_event, id, message) => {
        if (id !== requestId) return;
        cleanup();
        reject(new Error(message));
      };

      ipcRenderer.on("ai:chatStream:chunk", onChunk);
      ipcRenderer.on("ai:chatStream:done", onDone);
      ipcRenderer.on("ai:chatStream:error", onError);
      ipcRenderer.send("ai:chatStream", requestId, request);
    }),
  cancelActiveChatStream: async () => {
    if (!activeStreamRequestId) return { ok: false };
    return ipcRenderer.invoke("ai:chatStreamCancel", activeStreamRequestId);
  },
  testProvider: (provider) => ipcRenderer.invoke("ai:testProvider", provider),
  platform: () => ipcRenderer.invoke("app:platform"),
  getLogInfo: () => ipcRenderer.invoke("app:getLogInfo"),
  readLogs: () => ipcRenderer.invoke("app:readLogs"),
  openLogs: () => ipcRenderer.invoke("app:openLogs"),
  getPrivilege: () => ipcRenderer.invoke("app:getPrivilege"),
  restartAsAdmin: () => ipcRenderer.invoke("app:restartAsAdmin"),
});
