const { contextBridge, ipcRenderer } = require("electron");

function readInitialConfig() {
  try {
    return ipcRenderer.sendSync("config:getInitialSync");
  } catch {
    return {};
  }
}

const initialConfig = readInitialConfig();
const BROWSER_WORKSPACE_COMMAND_TIMEOUT_MS = 15_000;

function applyInitialTheme(theme) {
  if (theme !== "light" && theme !== "dark") return;

  const applyTheme = () => {
    if (document.documentElement) {
      document.documentElement.dataset.theme = theme;
    }
  };

  if (document.documentElement) {
    applyTheme();
    return;
  }

  window.addEventListener("DOMContentLoaded", applyTheme, { once: true });
}

function createRequestId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

let activeStreamRequestId = null;
function createBridgeRequestId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

contextBridge.exposeInMainWorld("novayxk", {
  initialConfig,
  openProject: () => ipcRenderer.invoke("project:open"),
  openProjectPath: (projectRoot) => ipcRenderer.invoke("project:openPath", projectRoot),
  refreshProject: () => ipcRenderer.invoke("project:refresh"),
  readDirectory: (relativePath) => ipcRenderer.invoke("project:readDirectory", relativePath),
  searchFiles: (query) => ipcRenderer.invoke("project:searchFiles", query),
  getProjectContext: (request) => ipcRenderer.invoke("project:context", request),
  readFile: (relativePath) => ipcRenderer.invoke("project:readFile", relativePath),
  getProjectFileAsset: (relativePath) => ipcRenderer.invoke("project:getFileAsset", relativePath),
  saveFile: (relativePath, content) => ipcRenderer.invoke("project:saveFile", { relativePath, content }),
  applyPatch: (patchText) => ipcRenderer.invoke("project:applyPatch", patchText),
  applyFileOps: (operations) => ipcRenderer.invoke("project:applyFileOps", operations),
  undoLastPatch: () => ipcRenderer.invoke("project:undoLastPatch"),
  inspectCommand: (command) => ipcRenderer.invoke("project:inspectCommand", command),
  runCommand: (command) => ipcRenderer.invoke("project:runCommand", command),
  runCommandWithMode: (request) => ipcRenderer.invoke("project:runCommandWithMode", request),
  startTerminalTask: (request) => ipcRenderer.invoke("terminal:start", request),
  stopTerminalTask: (taskId) => ipcRenderer.invoke("terminal:stop", taskId),
  writeTerminalInput: (taskId, input) => ipcRenderer.invoke("terminal:write", { taskId, input }),
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
  generateImage: (request) => ipcRenderer.invoke("ai:generateImage", request),
  cancelImageGeneration: () => ipcRenderer.invoke("ai:imageCancel"),
  openGeneratedImage: (imagePath) => ipcRenderer.invoke("ai:openGeneratedImage", imagePath),
  copyGeneratedImage: (imagePath) => ipcRenderer.invoke("ai:copyGeneratedImage", imagePath),
  saveGeneratedImageToProject: (request) => ipcRenderer.invoke("ai:saveGeneratedImageToProject", request),
  testProvider: (provider) => ipcRenderer.invoke("ai:testProvider", provider),
  listProviderModels: (provider) => ipcRenderer.invoke("ai:listProviderModels", provider),
  platform: () => ipcRenderer.invoke("app:platform"),
  getLogInfo: () => ipcRenderer.invoke("app:getLogInfo"),
  readLogs: () => ipcRenderer.invoke("app:readLogs"),
  openLogs: () => ipcRenderer.invoke("app:openLogs"),
  getPrivilege: () => ipcRenderer.invoke("app:getPrivilege"),
  restartAsAdmin: () => ipcRenderer.invoke("app:restartAsAdmin"),
  openBrowserWorkspaceWindow: () => ipcRenderer.invoke("app:openBrowserWorkspaceWindow"),
  browserRunInWorkspaceWindow: (request) =>
    new Promise((resolve, reject) => {
      const requestId = createBridgeRequestId();
      const cleanup = () => {
        clearTimeout(timeout);
        ipcRenderer.removeListener("browser:workspaceCommand:reply", onReply);
      };
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error("Timed out while waiting for the browser workspace command."));
      }, BROWSER_WORKSPACE_COMMAND_TIMEOUT_MS);
      const onReply = (_event, incomingRequestId, payload) => {
        if (incomingRequestId !== requestId) return;
        cleanup();
        if (payload?.ok) {
          resolve(payload.result);
          return;
        }
        reject(new Error(payload?.error || "Browser workspace command failed."));
      };
      ipcRenderer.on("browser:workspaceCommand:reply", onReply);
      ipcRenderer.send("browser:workspaceCommand", requestId, request);
    }),
  getBrowserSnapshot: () => ipcRenderer.invoke("browser:getSnapshot"),
  browserNavigate: (url) => ipcRenderer.invoke("browser:navigate", { url }),
  browserReload: () => ipcRenderer.invoke("browser:reload"),
  browserGoBack: () => ipcRenderer.invoke("browser:goBack"),
  browserGoForward: () => ipcRenderer.invoke("browser:goForward"),
  browserClearLogs: () => ipcRenderer.invoke("browser:clearLogs"),
  browserGetActionLog: () => ipcRenderer.invoke("browser:getActionLog"),
  browserGetNetworkLog: () => ipcRenderer.invoke("browser:getNetworkLog"),
  browserGetGuestPreloadUrl: () => ipcRenderer.invoke("browser:getGuestPreloadUrl"),
  browserGetTrace: () => ipcRenderer.invoke("browser:getTrace"),
  syncBrowserSnapshot: (snapshot) => ipcRenderer.send("browser:syncSnapshot", snapshot),
  emitBrowserPageEvent: (type, snapshot) => ipcRenderer.send("browser:pageEvent", type, snapshot),
  emitBrowserActionObserved: (payload) => ipcRenderer.send("browser:actionObserved", payload),
  emitBrowserNetworkObserved: (payload) => ipcRenderer.send("browser:networkObserved", payload),
  onBrowserPageEvent: (handler) => {
    const listener = (_event, payload) => handler?.(payload);
    ipcRenderer.on("browser:pageEvent", listener);
    return () => ipcRenderer.removeListener("browser:pageEvent", listener);
  },
  onBrowserActionEvent: (handler) => {
    const listener = (_event, payload) => handler?.(payload);
    ipcRenderer.on("browser:actionEvent", listener);
    return () => ipcRenderer.removeListener("browser:actionEvent", listener);
  },
  onBrowserNetworkEvent: (handler) => {
    const listener = (_event, payload) => handler?.(payload);
    ipcRenderer.on("browser:networkEvent", listener);
    return () => ipcRenderer.removeListener("browser:networkEvent", listener);
  },
  onBrowserWorkspaceCommand: (handler) => {
    const listener = (_event, requestId, request) => handler?.({ requestId, request });
    ipcRenderer.on("browser:workspaceCommand:execute", listener);
    return () => ipcRenderer.removeListener("browser:workspaceCommand:execute", listener);
  },
  notifyBrowserWorkspaceReady: () => ipcRenderer.send("browser:workspaceReady"),
  replyBrowserWorkspaceCommand: (requestId, payload) => {
    ipcRenderer.send("browser:workspaceCommand:reply", requestId, payload);
  },
});

try {
  applyInitialTheme(initialConfig.theme);
} catch {
  // Keep the desktop bridge available even if early DOM access fails.
}
