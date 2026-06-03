const { app, BrowserWindow, Menu, dialog, ipcMain, shell, safeStorage } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const os = require("node:os");
const childProcess = require("node:child_process");
const crypto = require("node:crypto");
const { createLogService } = require("./services/logs.cjs");
const { createConfigService } = require("./services/config.cjs");
const { inspectCommand, inspectCommandForMode, detectCommandScope } = require("./services/command.cjs");
const { createMemoryService } = require("./services/memory.cjs");
const { createAiService } = require("./services/ai.cjs");
const { createProjectService } = require("./services/project.cjs");
const { createInstallerService } = require("./services/installer.cjs");

const isDev = !app.isPackaged;
const NOVAYXK_HOME = path.join(os.homedir(), ".novayxk");
const CONFIG_DIR = path.join(NOVAYXK_HOME, "config");
const CONFIG_FILE = path.join(CONFIG_DIR, "providers.json");
const PROJECTS_DIR = path.join(NOVAYXK_HOME, "projects");
const ICON_PATH = path.join(__dirname, "..", "assets", "icons", "novayxk.ico");
const APP_EXE = "Novayxk.exe";
const UNINSTALLER_EXE = "Novayxk Uninstaller.exe";
const CLEANUP_EXE = "Novayxk Cleanup.exe";
const APP_REGISTRY_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Novayxk";
const UNINSTALL_CLEANUP_LOG = path.join(os.tmpdir(), "novayxk-uninstall-cleanup.log");
const LOG_DIR = path.join(NOVAYXK_HOME, "logs");
const APP_LOG_FILE = path.join(LOG_DIR, "app.log");
const ERROR_LOG_FILE = path.join(LOG_DIR, "error.log");
const AI_LOG_FILE = path.join(LOG_DIR, "ai.log");
const BEHAVIOR_LOG_FILE = path.join(LOG_DIR, "behavior.log");
const MAX_LOG_FILE_BYTES = 2 * 1024 * 1024;
const MAX_BEHAVIOR_LOG_FILE_BYTES = 20 * 1024 * 1024;
const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".turbo",
  "target",
  "coverage",
]);
const SENSITIVE_FILES = [/^\.env/i, /secret/i, /private/i, /credential/i, /\.pem$/i, /\.key$/i, /\.p12$/i];
const MAX_SAFE_COMMAND_LENGTH = 12_000;
const MAX_FULL_COMMAND_LENGTH = 50_000;
const TREE_ENTRY_LIMIT = 300;
const TREE_INITIAL_DEPTH = 1;
const PROJECT_SEARCH_LIMIT = 160;
const PROJECT_CONTEXT_FILE_LIMIT = 420;
const PROJECT_CONTEXT_RELATED_LIMIT = 6;
const PROJECT_CONTEXT_RELATED_BYTES = 28_000;
const PROJECT_WALK_DEPTH_LIMIT = 12;
const MAX_TERMINAL_OUTPUT_BYTES = 80_000;
const MAX_TERMINAL_TASKS = 20;
const TERMINAL_WAIT_TIMEOUT_MS = 15 * 60 * 1000;
const TEXT_FILE_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".csv",
  ".env.example",
  ".go",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".ps1",
  ".py",
  ".rs",
  ".scss",
  ".sh",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".vue",
  ".xml",
  ".yaml",
  ".yml",
]);
const DANGEROUS_COMMANDS = [
  { pattern: /\b(git\s+reset\s+--hard|git\s+clean\s+-[a-z]*[fdx][a-z]*)\b/i, reason: "会丢弃本地代码改动" },
  { pattern: /\b(format|diskpart|shutdown|reboot)\b/i, reason: "可能影响系统或磁盘" },
  { pattern: /\b(reg\s+delete|set-executionpolicy)\b/i, reason: "会修改系统级配置" },
  { pattern: /\b(remove-item|rm|del|erase|rd|rmdir)\b[\s\S]*(?:-recurse|\/s)\b[\s\S]*(?:-force|\/q)\b/i, reason: "包含递归强制删除" },
  { pattern: /\brm\s+-[a-z]*r[a-z]*f[a-z]*\s+(?:[/"']|~|\*)/i, reason: "包含高风险删除命令" },
  { pattern: /\b(curl(?:\.exe)?|wget(?:\.exe)?|iwr|irm|invoke-webrequest|invoke-restmethod)\b[\s\S]*\|[\s\S]*(?:sh|bash|iex|invoke-expression)\b/i, reason: "会下载并直接执行远程脚本" },
];
const SYSTEM_ACTION_COMMANDS = [
  { action: "shutdown", label: "关机", pattern: /\b(shutdown(\.exe)?\s+\/s|stop-computer\b)\b/i },
  { action: "restart", label: "重启", pattern: /\b(shutdown(\.exe)?\s+\/r|restart-computer\b|reboot\b)\b/i },
  { action: "logout", label: "注销", pattern: /\b(shutdown(\.exe)?\s+\/l|logoff(\.exe)?\b)\b/i },
  { action: "hibernate", label: "休眠", pattern: /\b(shutdown(\.exe)?\s+\/h|rundll32(\.exe)?\s+powrprof\.dll,\s*setsuspendstate\s+hibernate)\b/i },
  { action: "sleep", label: "睡眠", pattern: /\brundll32(\.exe)?\s+powrprof\.dll,\s*setsuspendstate\b/i },
  { action: "lock", label: "锁屏", pattern: /\brundll32(\.exe)?\s+user32\.dll,\s*lockworkstation\b/i },
];
const ADMIN_REQUIRED_COMMANDS = [
  { label: "系统服务管理", pattern: /\b(?:sc(?:\.exe)?\s+(?:create|delete|config|start|stop)|new-service|set-service|start-service|stop-service|restart-service)\b/i },
  { label: "注册表系统分支修改", pattern: /\breg(?:\.exe)?\s+(?:add|delete|import|restore|save|copy)\s+HK(?:LM|CR|U|CC)\\/i },
  { label: "Windows 权限或防火墙修改", pattern: /\b(?:netsh\s+advfirewall|set-executionpolicy|bcdedit|takeown|icacls)\b/i },
  { label: "系统目录写入", pattern: /\b(?:copy|move|remove-item|rm|del|mkdir|new-item|set-content|add-content)\b[\s\S]*(?:C:\\Windows|C:\\Program Files|C:\\ProgramData)/i },
  { label: "软件包安装或卸载", pattern: /\b(?:winget|choco|scoop)\s+(?:install|uninstall|upgrade)|\b(?:install-package|uninstall-package|add-appxpackage|remove-appxpackage|msiexec(?:\.exe)?)\b/i },
  { label: "进程强制结束", pattern: /\btaskkill(?:\.exe)?\b[\s\S]*\s\/f\b/i },
  { label: "PowerShell 管理员启动", pattern: /\bstart-process\b[\s\S]*\b-verb\s+runas\b/i },
];

let mainWindow;
let activeProjectRoot = null;
const patchTransactions = [];
const activeChatStreams = new Map();
const terminalTasks = new Map();

function getArgValue(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return "";
  return String(args[index + 1] ?? "").trim();
}

const cliArgs = process.argv.slice(1);
const launchedExecutableName = path.basename(process.execPath).toLowerCase();
const isUninstallMode = cliArgs.includes("--uninstall") || launchedExecutableName.includes("uninstaller");
const uninstallTargetArg = getArgValue(cliArgs, "--target") || (isUninstallMode ? path.dirname(process.execPath) : "");
const DEBUG_LOG_NAME = "novayxk-launch-debug.log";
const {
  NOVAYXK_HOME: LOG_NOVAYXK_HOME,
  LOG_DIR: LOG_SERVICE_DIR,
  APP_LOG_FILE: LOG_SERVICE_APP_FILE,
  ERROR_LOG_FILE: LOG_SERVICE_ERROR_FILE,
  AI_LOG_FILE: LOG_SERVICE_AI_FILE,
  BEHAVIOR_LOG_FILE: LOG_SERVICE_BEHAVIOR_FILE,
  UNINSTALL_CLEANUP_LOG: LOG_SERVICE_UNINSTALL_CLEANUP_LOG,
  writeDebugLog,
  logApp,
  logError,
  logAi,
  logBehavior,
  installIpcErrorLogger,
  installProcessErrorLogger,
  getLogInfo,
  readLogTail,
} = createLogService({
  debugLogTargetDir: uninstallTargetArg,
});
const { readConfig, readConfigSync, writeConfig } = createConfigService({
  configDir: CONFIG_DIR,
  configFile: CONFIG_FILE,
  logApp,
  safeStorage,
});
const memoryService = createMemoryService({
  projectsDir: PROJECTS_DIR,
  getActiveProjectRoot: () => activeProjectRoot,
});
const { readProjectMemoryState, writeProjectMemory, saveTaskHistory, loadTaskHistory } = memoryService;
const { requestChatCompletion, requestChatCompletionStream, extractModelText } = createAiService({
  logAi,
  logError,
});
const projectService = createProjectService({
  logApp,
  setActiveProjectRoot: (projectRoot) => {
    activeProjectRoot = projectRoot;
  },
});
const {
  openProjectRoot,
  buildTree,
  buildDirectoryTree,
  searchProjectFiles,
  readProjectContext,
  assertProjectFile,
  statIfExists,
  parseUnifiedPatch,
  applyHunks,
} = projectService;
const installerService = createInstallerService({
  uninstallTargetArg,
  writeDebugLog,
  isDev,
});
const {
  getInstallDirForUninstaller,
  pathExists,
  isRunningAsAdmin,
  restartAsAdmin,
  closeRunningInstalledApp,
  removeShellArtifacts,
  removeUninstallRegistry,
  emitUninstallProgress,
  finalizeUninstallCleanup,
  setPendingUninstallCleanup,
  hasPendingUninstallCleanup,
  isUninstallCleanupStarted,
} = installerService;

app.setName(isUninstallMode ? "Novayxk Uninstaller" : "Novayxk");
writeDebugLog("bootstrap", {
  source: "electron-main",
  isUninstallMode,
  isDev,
  processExecPath: process.execPath,
  processArgv: process.argv,
  cwd: process.cwd(),
  uninstallTargetArg,
  env: {
    PORTABLE_EXECUTABLE_FILE: process.env.PORTABLE_EXECUTABLE_FILE || "",
    PORTABLE_EXECUTABLE_DIR: process.env.PORTABLE_EXECUTABLE_DIR || "",
  },
});
logApp("app:bootstrap", {
  isDev,
  isUninstallMode,
  execPath: process.execPath,
  version: app.getVersion(),
});
installIpcErrorLogger();
installProcessErrorLogger();

function createWindow() {
  writeDebugLog("createWindow", {
    source: "electron-main",
    isUninstallMode,
    preload: isUninstallMode ? "uninstaller-preload.cjs" : "preload.cjs",
  });
  mainWindow = new BrowserWindow({
    width: isUninstallMode ? 920 : 1440,
    height: isUninstallMode ? 640 : 920,
    minWidth: isUninstallMode ? 860 : 1120,
    minHeight: isUninstallMode ? 560 : 720,
    backgroundColor: "#f6f2ea",
    title: isUninstallMode ? "Novayxk Uninstaller" : "Novayxk",
    icon: ICON_PATH,
    autoHideMenuBar: true,
    frame: !isUninstallMode,
    webPreferences: {
      preload: path.join(__dirname, isUninstallMode ? "uninstaller-preload.cjs" : "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.setMenu(null);

  if (isUninstallMode) {
    writeDebugLog("loadFile", {
      source: "electron-main",
      target: "electron/uninstaller.html",
    });
    mainWindow.loadFile(path.join(__dirname, "uninstaller.html"));
    mainWindow.on("close", (event) => {
      if (hasPendingUninstallCleanup() && !isUninstallCleanupStarted()) {
        event.preventDefault();
        void finalizeUninstallCleanup().finally(() => {
          mainWindow?.destroy();
        });
      }
    });
  } else if (isDev) {
    writeDebugLog("loadURL", {
      source: "electron-main",
      target: "http://127.0.0.1:5173",
    });
    mainWindow.loadURL("http://127.0.0.1:5173");
  } else {
    writeDebugLog("loadFile", {
      source: "electron-main",
      target: "dist/index.html",
    });
    mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
  writeDebugLog("window:focusExisting", { source: "electron-main" });
  logApp("window:focusExisting");
  return true;
}

const hasSingleInstanceLock = isUninstallMode || app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  writeDebugLog("app:secondInstanceQuit", { source: "electron-main" });
  app.quit();
} else {
  if (!isUninstallMode) {
    app.on("second-instance", () => {
      if (!focusMainWindow() && app.isReady()) createWindow();
    });
  }

  app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
}

ipcMain.handle("window:minimize", () => {
  writeDebugLog("window:minimize", { source: "electron-main" });
  mainWindow?.minimize();
  return true;
});

ipcMain.handle("window:close", async () => {
  writeDebugLog("window:close", {
    source: "electron-main",
    hasPendingUninstallCleanup: hasPendingUninstallCleanup(),
  });
  if (hasPendingUninstallCleanup() && !isUninstallCleanupStarted()) {
    await finalizeUninstallCleanup();
  }
  mainWindow?.close();
  return true;
});

ipcMain.handle("uninstall:getInfo", async () => {
  const installDir = getInstallDirForUninstaller();
  writeDebugLog("uninstall:getInfo", {
    source: "electron-main",
    installDir,
  });
  return {
    appName: "Novayxk",
    installDir,
    userDataDir: NOVAYXK_HOME,
    userDataExists: await pathExists(NOVAYXK_HOME),
  };
});

ipcMain.handle("uninstall:run", async (event, request) => {
  const installDir = path.resolve(String(request?.installDir || getInstallDirForUninstaller()).trim());
  writeDebugLog("uninstall:run", {
    source: "electron-main",
    installDir,
    deleteUserData: request?.deleteUserData === true,
  });
  emitUninstallProgress(event.sender, 6, "检查安装目录", installDir);
  if (!(await pathExists(path.join(installDir, APP_EXE)))) {
    throw new Error(`没有在这里找到 ${APP_EXE}：${installDir}`);
  }

  emitUninstallProgress(event.sender, 22, "关闭运行中的 Novayxk", "正在释放被占用的文件");
  await closeRunningInstalledApp();
  emitUninstallProgress(event.sender, 48, "清理快捷方式", "桌面和开始菜单入口");
  await removeShellArtifacts();
  emitUninstallProgress(event.sender, 72, "清理系统卸载入口", "Windows 应用和功能");
  await removeUninstallRegistry();

  setPendingUninstallCleanup({
    installDir,
    deleteUserData: request?.deleteUserData === true,
  });
  emitUninstallProgress(
    event.sender,
    100,
    "卸载准备完成",
    request?.deleteUserData === true
      ? "点击完成后会在后台继续删除安装目录和 .novayxk 数据。"
      : "点击完成后会在后台继续删除安装目录，.novayxk 数据会保留。",
  );

  return {
    ok: true,
    installDir,
    userDataDir: NOVAYXK_HOME,
    deleteUserData: request?.deleteUserData === true,
  };
});

ipcMain.handle("uninstall:finalize", async () => {
  writeDebugLog("uninstall:finalize", { source: "electron-main" });
  await finalizeUninstallCleanup();
  mainWindow?.close();
  return { ok: true };
});

ipcMain.handle("uninstall:openPath", async (_event, targetPath) => {
  writeDebugLog("uninstall:openPath", {
    source: "electron-main",
    targetPath,
  });
  if (!targetPath || typeof targetPath !== "string") return false;
  await shell.openPath(targetPath);
  return true;
});

function resolveRequestedCommandScope(command, requestedScope) {
  if (requestedScope === "project") return "project";
  if (requestedScope === "system") return "system";
  const detectedScope = detectCommandScope(command);
  if (detectedScope === "system") return "system";
  return activeProjectRoot ? "project" : "system";
}

function resolveCommandCwd(commandScope) {
  if (commandScope === "system") return getSystemCommandCwd();
  if (!activeProjectRoot) throw new Error("请先打开一个项目。");
  return activeProjectRoot;
}

function getSystemCommandCwd() {
  const homeDir = os.homedir();
  if (homeDir && fsSync.existsSync(homeDir)) return homeDir;
  return os.tmpdir();
}

function startTerminalTask(command, options = {}) {
  const normalized = String(command ?? "").trim();
  if (!normalized) throw new Error("命令为空。");
  if (normalized.length > MAX_FULL_COMMAND_LENGTH) throw new Error(`命令过长，请控制在 ${MAX_FULL_COMMAND_LENGTH} 字符内。`);
  const commandScope = options.commandScope === "system" ? "system" : "project";
  const cwd = options.cwd || resolveCommandCwd(commandScope);

  const id = `term-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const task = {
    id,
    command: normalized,
    commandScope,
    cwd,
    title: String(options.title || titleFromCommand(normalized)).slice(0, 80),
    status: "running",
    code: null,
    startedAt: new Date().toISOString(),
    endedAt: null,
    output: "",
    needsInput: false,
    userIntervened: false,
    inputCount: 0,
    lastInputAt: null,
    child: null,
    doneListeners: [],
  };

  const shell = process.platform === "win32" ? "powershell.exe" : "/bin/sh";
  const tempScriptPath = process.platform === "win32"
    ? path.join(os.tmpdir(), `novayxk-terminal-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.ps1`)
    : "";
  const args = process.platform === "win32"
    ? ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", tempScriptPath]
    : ["-lc", normalized];

  if (process.platform === "win32") {
    const utf8Bom = Buffer.from([0xef, 0xbb, 0xbf]);
    const prelude = [
      "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
      "$OutputEncoding = [System.Text.Encoding]::UTF8",
      "",
    ].join(os.EOL);
    fsSync.writeFileSync(tempScriptPath, Buffer.concat([utf8Bom, Buffer.from(`${prelude}${normalized}`, "utf8")]));
  }

  const child = childProcess.spawn(shell, args, {
    cwd,
    env: process.env,
    windowsHide: true,
  });
  task.child = child;
  task.tempScriptPath = tempScriptPath;
  terminalTasks.set(id, task);
  trimTerminalTasks();
  emitTerminalTaskUpdate(task, "started");

  const appendOutput = (chunk, stream) => {
    const text = chunk.toString();
    task.output = trimTerminalOutput(`${task.output}${text}`);
    if (terminalOutputNeedsInput(task.output, text)) {
      task.needsInput = true;
    }
    logBehavior("terminal:output", {
      taskId: task.id,
      title: task.title,
      stream,
      chunk: text,
      needsInput: task.needsInput === true,
    });
    emitTerminalTaskUpdate(task, "output", { chunk: text, stream });
  };

  child.stdout.on("data", (chunk) => appendOutput(chunk, "stdout"));
  child.stderr.on("data", (chunk) => appendOutput(chunk, "stderr"));
  child.on("error", (error) => {
    task.status = "failed";
    task.code = 1;
    task.endedAt = new Date().toISOString();
    task.output = trimTerminalOutput(`${task.output}\n${error.message}`);
    cleanupTerminalTask(task);
    emitTerminalTaskUpdate(task, "error");
    notifyTerminalTaskDone(task);
  });
  child.on("close", (code) => {
    if (task.status === "stopped") {
      task.code = code ?? 1;
    } else {
      const effectiveCode = normalizePowerShellExitCode(code, task.output);
      task.code = effectiveCode;
      task.status = effectiveCode === 0 ? "exited" : "failed";
    }
    task.endedAt = new Date().toISOString();
    task.needsInput = false;
    cleanupTerminalTask(task);
    emitTerminalTaskUpdate(task, "closed");
    notifyTerminalTaskDone(task);
    void openProjectRefreshAfterTerminal();
    logApp(task.code === 0 ? "terminal:completed" : "terminal:finished", {
      taskId: task.id,
      commandPreview: task.command.slice(0, 500),
      cwd: task.cwd,
      code: task.code,
      status: task.status,
    }, task.code === 0 ? "info" : "warn");
  });

  logApp("terminal:started", {
    taskId: id,
    cwd: task.cwd,
    commandPreview: normalized.slice(0, 500),
  });

  return serializeTerminalTask(task);
}

function runCommandAsTerminalTask(command, options = {}) {
  const startedTask = startTerminalTask(command, {
    title: options.title || titleFromCommand(command),
    commandScope: options.commandScope,
    cwd: options.cwd,
  });
  return waitForTerminalTask(startedTask.id, options.timeoutMs ?? TERMINAL_WAIT_TIMEOUT_MS).then((finishedTask) => {
    const serializedTask = serializeTerminalTask(finishedTask);
    const stillRunning = serializedTask.status === "running";
    const output = stillRunning
      ? `${serializedTask.output.slice(-18000)}\n\n命令仍在终端任务中运行，后续输出会继续显示在底部“终端任务”面板。`.trim()
      : serializedTask.output.slice(-20000);
    return {
      code: stillRunning ? 0 : serializedTask.code ?? 1,
      output,
      task: serializedTask,
      longRunning: stillRunning,
    };
  });
}

function waitForTerminalTask(taskId, timeoutMs) {
  return new Promise((resolve) => {
    const task = terminalTasks.get(taskId);
    if (!task || task.status !== "running") {
      resolve(task ?? { id: taskId, code: 1, output: "", status: "failed" });
      return;
    }

    let timeout = null;
    const onDone = () => {
      clearTimeout(timeout);
      task.doneListeners = task.doneListeners.filter((listener) => listener !== onDone);
      resolve(terminalTasks.get(taskId) ?? task);
    };
    timeout = setTimeout(() => {
      task.doneListeners = task.doneListeners.filter((listener) => listener !== onDone);
      resolve(terminalTasks.get(taskId) ?? task);
    }, timeoutMs);
    task.doneListeners.push(onDone);
  });
}

function terminalOutputNeedsInput(output, latestChunk = "") {
  const text = `${String(output ?? "").slice(-3000)}${String(latestChunk ?? "")}`.replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, "");
  const tail = text.slice(-1200);
  return [
    /是否同意[\s\S]{0,180}\[[Yy]\][\s\S]{0,80}\[[Nn]\][\s\S]{0,60}[:：]\s*$/i,
    /(?:do you accept|do you agree|continue|proceed|confirm)[\s\S]{0,220}(?:\[?[Yy][\/\\]?[Nn]\]?|yes\/no)[\s\S]{0,80}[:?]\s*$/i,
    /(?:press|hit)\s+(?:enter|return|any key)[\s\S]{0,80}$/i,
    /(?:按|输入).{0,20}(?:回车|任意键).{0,80}$/i,
    /(?:password|passphrase|密码|口令|密钥).{0,80}[:：]\s*$/i,
    /(?:\[Y\].*\[N\]|\[y\].*\[n\]|y\/n|yes\/no).{0,80}[:?]\s*$/i,
  ].some((pattern) => pattern.test(tail));
}

function notifyTerminalTaskDone(task) {
  const listeners = [...(task.doneListeners ?? [])];
  task.doneListeners = [];
  for (const listener of listeners) listener();
}

function stopTerminalTask(taskId) {
  const task = terminalTasks.get(String(taskId ?? ""));
  if (!task) throw new Error("终端任务不存在。");
  if (!task.child || task.status !== "running") return serializeTerminalTask(task);
  task.status = "stopped";
  task.endedAt = new Date().toISOString();
  try {
    if (process.platform === "win32") {
      childProcess.spawn("taskkill.exe", ["/pid", String(task.child.pid), "/t", "/f"], {
        windowsHide: true,
        stdio: "ignore",
      });
    } else {
      task.child.kill("SIGTERM");
    }
  } catch {
    try {
      task.child.kill();
    } catch {
      // Ignore kill races; close/error events will settle the task.
    }
  }
  emitTerminalTaskUpdate(task, "stopping");
  return serializeTerminalTask(task);
}

function writeTerminalTaskInput(taskId, input) {
  const task = terminalTasks.get(String(taskId ?? ""));
  if (!task) throw new Error("终端任务不存在。");
  if (!task.child || task.status !== "running") throw new Error("终端任务没有在运行，不能发送输入。");
  if (!task.child.stdin || task.child.stdin.destroyed || !task.child.stdin.writable) {
    throw new Error("当前终端任务不接受输入。");
  }
  const rawInput = String(input ?? "");
  if (!rawInput.trim()) throw new Error("请输入要发送到终端任务的内容。");
  if (rawInput.length > 2000) throw new Error("单次终端输入不能超过 2000 个字符。");
  const line = rawInput.endsWith("\n") || rawInput.endsWith("\r") ? rawInput : `${rawInput}${os.EOL}`;
  task.child.stdin.write(line, "utf8");
  task.needsInput = false;
  task.userIntervened = true;
  task.inputCount = (task.inputCount ?? 0) + 1;
  task.lastInputAt = new Date().toISOString();
  task.output = trimTerminalOutput(`${task.output}\n[Novayxk 记录：用户已插手，并向当前终端任务发送了一行输入]\n`);
  logBehavior("terminal:userInput", {
    taskId: task.id,
    title: task.title,
    inputLength: rawInput.length,
    inputPreview: "[REDACTED_TERMINAL_INPUT]",
    inputCount: task.inputCount,
  });
  emitTerminalTaskUpdate(task, "input", { stream: "stdin" });
  return serializeTerminalTask(task);
}

function restartTerminalTask(taskId) {
  const task = terminalTasks.get(String(taskId ?? ""));
  if (!task) throw new Error("终端任务不存在。");
  const command = task.command;
  const title = task.title;
  if (task.status === "running") stopTerminalTask(task.id);
  return startTerminalTask(command, { title, commandScope: task.commandScope, cwd: task.cwd });
}

function listTerminalTasks() {
  return [...terminalTasks.values()].map(serializeTerminalTask);
}

function serializeTerminalTask(task) {
  return {
    id: task.id,
    title: task.title,
    command: task.command,
    commandScope: task.commandScope || "project",
    cwd: task.cwd,
    status: task.status,
    code: task.code,
    startedAt: task.startedAt,
    endedAt: task.endedAt,
    output: task.output,
    needsInput: task.needsInput === true,
    userIntervened: task.userIntervened === true,
    inputCount: task.inputCount ?? 0,
    lastInputAt: task.lastInputAt ?? null,
  };
}

function emitTerminalTaskUpdate(task, eventName, extra = {}) {
  mainWindow?.webContents?.send("terminal:taskUpdate", {
    event: eventName,
    task: serializeTerminalTask(task),
    ...extra,
  });
}

function cleanupTerminalTask(task) {
  task.child = null;
  if (task.tempScriptPath) {
    try {
      fsSync.rmSync(task.tempScriptPath, { force: true });
    } catch {
      // Ignore temp script cleanup failures.
    }
    task.tempScriptPath = "";
  }
}

function trimTerminalOutput(output) {
  const text = String(output ?? "");
  if (Buffer.byteLength(text, "utf8") <= MAX_TERMINAL_OUTPUT_BYTES) return text;
  return text.slice(-MAX_TERMINAL_OUTPUT_BYTES);
}

function trimTerminalTasks() {
  const tasks = [...terminalTasks.values()];
  if (tasks.length <= MAX_TERMINAL_TASKS) return;
  const removable = tasks
    .filter((task) => task.status !== "running")
    .sort((a, b) => String(a.startedAt).localeCompare(String(b.startedAt)));
  for (const task of removable.slice(0, Math.max(0, tasks.length - MAX_TERMINAL_TASKS))) {
    terminalTasks.delete(task.id);
  }
}

function titleFromCommand(command) {
  return String(command ?? "").replace(/\s+/g, " ").trim().slice(0, 48) || "PowerShell 任务";
}

function isLikelyLongRunningCommand(command) {
  const normalized = String(command ?? "").trim();
  if (!normalized) return false;
  return [
    /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:dev|start|serve|preview|watch)(?=\s|$|:)/i,
    /\b(?:vite|webpack-dev-server|nodemon|ts-node-dev|electron\s+\.|cargo\s+watch)\b/i,
    /\b(?:next|nuxt|astro|remix)\s+dev\b/i,
    /\b(?:webpack\s+serve|parcel\s+(?:serve|watch)|tauri\s+dev)\b/i,
    /\b(?:tsc|jest|vitest)\b[\s\S]*\s--watch\b/i,
  ].some((pattern) => pattern.test(normalized));
}

function formatStartedTerminalTaskOutput(task) {
  return [
    `命令已作为终端任务启动：${task.title}`,
    `任务 ID：${task.id}`,
    `工作目录：${task.cwd}`,
    "输出会在底部“终端任务”面板实时显示。",
  ].join("\n");
}

async function openProjectRefreshAfterTerminal() {
  if (!activeProjectRoot) return;
  try {
    mainWindow?.webContents?.send("project:maybeChanged");
  } catch {
    // Renderer may be gone while a terminal task exits.
  }
}

function normalizePowerShellExitCode(code, output) {
  if (code !== 0) return code ?? 1;
  if (process.platform !== "win32") return code ?? 0;
  const text = String(output ?? "");
  if (
    /CommandNotFoundException|ParserError|ParseException|TerminatorExpectedAtEndOfString/i.test(text) ||
    /无法将[“"].+[”"]项识别为|无法将.+识别为\s*cmdlet|FullyQualifiedErrorId\s*:\s*(?:CommandNotFoundException|ParserError|TerminatorExpectedAtEndOfString)/i.test(text)
  ) {
    return 1;
  }
  return code ?? 0;
}

ipcMain.handle("project:open", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
    title: "选择一个代码项目",
  });

  if (result.canceled || !result.filePaths[0]) return null;
  return openProjectRoot(result.filePaths[0]);
});

ipcMain.handle("project:openPath", async (_event, projectRoot) => {
  return openProjectRoot(projectRoot);
});

ipcMain.handle("project:refresh", async () => {
  if (!activeProjectRoot) throw new Error("请先打开一个项目。");
  return {
    root: activeProjectRoot,
    tree: await buildTree(activeProjectRoot, 0, { maxDepth: TREE_INITIAL_DEPTH }),
  };
});

ipcMain.handle("project:readDirectory", async (_event, relativePath) => {
  return buildDirectoryTree(relativePath);
});

ipcMain.handle("project:searchFiles", async (_event, query) => {
  return searchProjectFiles(query);
});

ipcMain.handle("project:context", async (_event, request) => {
  return readProjectContext(request);
});

ipcMain.handle("project:readFile", async (_event, relativePath) => {
  const fullPath = assertProjectFile(relativePath);
  const stat = await fs.stat(fullPath);
  if (stat.size > 160_000) throw new Error("文件太大，请选择更小的文件。");
  return {
    path: relativePath,
    content: await fs.readFile(fullPath, "utf8"),
  };
});

ipcMain.handle("project:saveFile", async (_event, request) => {
  const relativePath = request?.relativePath;
  const content = request?.content;
  if (typeof content !== "string") throw new Error("文件内容无效。");
  if (content.length > 400_000) throw new Error("文件内容太长，请拆成更小的文件。");
  const fullPath = assertProjectFile(relativePath);
  await fs.writeFile(fullPath, content, "utf8");
  logApp("project:fileSaved", {
    projectRoot: activeProjectRoot,
    path: relativePath,
    bytes: Buffer.byteLength(content, "utf8"),
  });
  return { path: relativePath };
});

ipcMain.handle("project:applyPatch", async (_event, patchText) => {
  if (!activeProjectRoot) throw new Error("请先打开一个项目。");
  if (!patchText || patchText.length > 400_000) throw new Error("补丁为空或过长。");

  const files = parseUnifiedPatch(patchText);
  if (!files.length) throw new Error("没有识别到可应用的 unified diff。");

  const backups = [];
  for (const file of files) {
    const fullPath = assertProjectFile(file.path);
    const existingStat = await statIfExists(fullPath);
    if (file.isCreate && existingStat) throw new Error(`补丁要新增的文件已存在：${file.path}`);
    if (!file.isCreate && !existingStat) throw new Error(`补丁目标文件不存在：${file.path}`);
    if (file.isDelete && existingStat?.isDirectory()) throw new Error(`补丁不能删除目录：${file.path}`);

    const original = existingStat ? await fs.readFile(fullPath, "utf8") : "";
    const nextContent = applyHunks(original, file.hunks);
    backups.push({
      path: file.path,
      fullPath,
      existedBefore: Boolean(existingStat),
      afterExists: !file.isDelete,
      before: original,
      after: nextContent,
    });
  }

  for (const backup of backups) {
    if (backup.afterExists) {
      await fs.mkdir(path.dirname(backup.fullPath), { recursive: true });
      await fs.writeFile(backup.fullPath, backup.after, "utf8");
    } else {
      await fs.rm(backup.fullPath, { force: false });
    }
  }

  patchTransactions.push({
    createdAt: new Date().toISOString(),
    files: backups.map((backup) => ({
      path: backup.path,
      existedBefore: backup.existedBefore,
      before: backup.before,
    })),
  });
  if (patchTransactions.length > 20) patchTransactions.shift();

  logApp("project:patchApplied", {
    projectRoot: activeProjectRoot,
    changedFiles: backups.map((backup) => backup.path),
  });
  return {
    changedFiles: backups.map((backup) => backup.path),
    canUndo: patchTransactions.length > 0,
  };
});

ipcMain.handle("project:applyFileOps", async (_event, operations) => {
  if (!activeProjectRoot) throw new Error("请先打开一个项目。");
  if (!Array.isArray(operations) || operations.length === 0) throw new Error("没有可执行的文件操作。");
  if (operations.length > 30) throw new Error("文件操作过多，请拆成更小的步骤。");

  const changedFiles = [];
  for (const operation of operations) {
    if (!operation || typeof operation !== "object") throw new Error("文件操作格式无效。");
    if (operation.type !== "mkdir" && operation.type !== "write" && operation.type !== "delete") {
      throw new Error(`不支持的文件操作：${operation.type}`);
    }
    if (!operation.path || typeof operation.path !== "string") throw new Error("文件操作缺少 path。");

    const targetPath = assertProjectFile(operation.path);
    if (operation.type === "mkdir") {
      await fs.mkdir(targetPath, { recursive: true });
      changedFiles.push(operation.path);
      continue;
    }

    if (operation.type === "delete") {
      try {
        await fs.rm(targetPath, { recursive: true, force: false });
      } catch (error) {
        if (error.code === "ENOENT") {
          throw new Error(`要删除的路径不存在：${operation.path}`);
        }
        throw error;
      }
      changedFiles.push(operation.path);
      continue;
    }

    if (typeof operation.content !== "string") throw new Error(`写入文件缺少 content：${operation.path}`);
    if (operation.content.length > 400_000) throw new Error(`文件内容过长：${operation.path}`);

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    try {
      await fs.writeFile(targetPath, operation.content, {
        encoding: "utf8",
        flag: operation.overwrite ? "w" : "wx",
      });
    } catch (error) {
      if (error.code === "EEXIST") {
        throw new Error(`文件已存在，若要覆盖请在 fileops 中设置 overwrite: true：${operation.path}`);
      }
      throw error;
    }
    changedFiles.push(operation.path);
  }

  logApp("project:fileOpsApplied", {
    projectRoot: activeProjectRoot,
    operations: operations.map((operation) => ({
      type: operation.type,
      path: operation.path,
      overwrite: operation.overwrite === true,
      contentBytes: typeof operation.content === "string" ? Buffer.byteLength(operation.content, "utf8") : 0,
    })),
    changedFiles,
  });
  return { changedFiles };
});

ipcMain.handle("project:undoLastPatch", async () => {
  if (!activeProjectRoot) throw new Error("请先打开一个项目。");
  const transaction = patchTransactions.pop();
  if (!transaction) throw new Error("没有可撤销的补丁。");

  const restored = [];
  for (const file of transaction.files) {
    const fullPath = assertProjectFile(file.path);
    if (file.existedBefore) {
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, file.before, "utf8");
    } else {
      await fs.rm(fullPath, { recursive: true, force: true });
    }
    restored.push(file.path);
  }

  logApp("project:patchUndone", {
    projectRoot: activeProjectRoot,
    restoredFiles: restored,
  });
  return {
    restoredFiles: restored,
    canUndo: patchTransactions.length > 0,
  };
});

ipcMain.handle("project:inspectCommand", async (_event, command) => ({
  ...inspectCommand(command),
  commandScope: detectCommandScope(command),
}));

ipcMain.handle("project:runCommand", async (_event, command) => {
  if (!activeProjectRoot) throw new Error("请先打开一个项目。");
  const inspection = inspectCommand(command);
  if (!inspection.allowed) {
    logApp("command:blocked", {
      projectRoot: activeProjectRoot,
      reason: inspection.reason,
      commandPreview: String(command).slice(0, 500),
      controlMode: "safe",
    }, "warn");
    throw new Error(`命令已被拦截：${inspection.reason}`);
  }
  if (isLikelyLongRunningCommand(command)) {
    const task = startTerminalTask(command);
    return {
      code: 0,
      output: formatStartedTerminalTaskOutput(task),
      terminalTask: task,
      longRunning: true,
    };
  }
  const result = await runCommandAsTerminalTask(command);
  return {
    code: result.code,
    output: result.output,
    terminalTask: result.task,
    longRunning: result.longRunning,
  };
});

ipcMain.handle("project:runCommandWithMode", async (_event, request) => {
  const command = String(request?.command ?? "").trim();
  const controlMode = request?.controlMode === "full" ? "full" : "safe";
  const commandScope = resolveRequestedCommandScope(command, request?.commandScope);
  const cwd = resolveCommandCwd(commandScope);
  const inspection = request?.confirmedSystemAction === true
    ? {
        allowed: true,
        reason: "特殊系统动作已由用户确认。",
      }
    : inspectCommandForMode(command, controlMode);
  if (!inspection.allowed) {
    logApp("command:blocked", {
      projectRoot: activeProjectRoot,
      commandScope,
      cwd,
      reason: inspection.reason,
      commandPreview: command.slice(0, 500),
      controlMode,
      requiresConfirmation: inspection.requiresConfirmation === true,
      systemAction: inspection.systemAction || null,
    }, "warn");
    const error = new Error(`命令已被拦截：${inspection.reason}`);
    if (inspection.requiresConfirmation) {
      error.code = "SYSTEM_ACTION_CONFIRMATION_REQUIRED";
      error.systemAction = inspection.systemAction;
    }
    throw error;
  }
  if (isLikelyLongRunningCommand(command)) {
    const task = startTerminalTask(command, { title: request?.title, commandScope, cwd });
    return {
      code: 0,
      output: formatStartedTerminalTaskOutput(task),
      command,
      commandScope,
      controlMode,
      bypassedDangerCheck: controlMode === "full",
      terminalTask: task,
      longRunning: true,
    };
  }
  const result = await runCommandAsTerminalTask(command, { title: request?.title, commandScope, cwd });
  return {
    code: result.code,
    output: result.output,
    command,
    commandScope,
    controlMode,
    bypassedDangerCheck: controlMode === "full",
    terminalTask: result.task,
    longRunning: result.longRunning,
  };
});

ipcMain.handle("terminal:start", async (_event, request) => {
  const command = String(request?.command ?? "").trim();
  const mode = request?.controlMode === "full" ? "full" : "safe";
  const commandScope = resolveRequestedCommandScope(command, request?.commandScope);
  const cwd = resolveCommandCwd(commandScope);
  const inspection = request?.confirmedSystemAction === true
    ? { allowed: true, reason: "特殊系统动作已由用户确认。" }
    : inspectCommandForMode(command, mode);
  if (!inspection.allowed) {
    const error = new Error(`命令已被拦截：${inspection.reason}`);
    if (inspection.requiresConfirmation) {
      error.code = "SYSTEM_ACTION_CONFIRMATION_REQUIRED";
      error.systemAction = inspection.systemAction;
    }
    throw error;
  }
  return startTerminalTask(command, { title: request?.title, commandScope, cwd });
});

ipcMain.handle("terminal:stop", async (_event, taskId) => stopTerminalTask(taskId));

ipcMain.handle("terminal:write", async (_event, request) => writeTerminalTaskInput(request?.taskId, request?.input));

ipcMain.handle("terminal:restart", async (_event, taskId) => restartTerminalTask(taskId));

ipcMain.handle("terminal:list", async () => listTerminalTasks());

ipcMain.handle("memory:getProjectState", async () => {
  if (!activeProjectRoot) throw new Error("请先打开一个项目。");
  return readProjectMemoryState();
});

ipcMain.handle("memory:saveProjectMemory", async (_event, memory) => {
  if (!activeProjectRoot) throw new Error("请先打开一个项目。");
  return writeProjectMemory(memory);
});

ipcMain.handle("memory:saveTask", async (_event, taskInput) => {
  if (!activeProjectRoot) throw new Error("请先打开一个项目。");
  return saveTaskHistory(taskInput);
});

ipcMain.handle("memory:loadTask", async (_event, taskId) => {
  if (!activeProjectRoot) throw new Error("请先打开一个项目。");
  return loadTaskHistory(taskId);
});

ipcMain.on("config:getInitialSync", (event) => {
  try {
    event.returnValue = readConfigSync();
  } catch {
    event.returnValue = {};
  }
});
ipcMain.handle("config:get", readConfig);
ipcMain.handle("config:save", async (_event, config) => writeConfig(config));

ipcMain.handle("ai:chat", async (_event, request) => {
  const { provider, messages } = request;
  logBehavior("ai:chat:requestMessages", {
    providerName: provider?.name,
    model: provider?.model,
    messages,
  });
  const data = await requestChatCompletion(provider, messages);
  const content = extractModelText(data, provider.apiMode ?? "chatCompletions");
  logBehavior("ai:chat:responseText", {
    providerName: provider?.name,
    model: provider?.model,
    content,
  });
  return content;
});

ipcMain.handle("ai:testProvider", async (_event, provider) => {
  const data = await requestChatCompletion(
    provider,
    [
      { role: "system", content: "You are a connection test endpoint." },
      { role: "user", content: "Reply with OK." },
    ],
    { maxTokens: 8, temperature: 0, timeoutMs: 20_000 },
  );

  const content = extractModelText(data, provider.apiMode ?? "chatCompletions").trim();
  return {
    ok: true,
    message: content ? `连接成功：${content}` : "连接成功。",
  };
});

ipcMain.on("ai:chatStream", async (event, requestId, request) => {
  const controller = new AbortController();
  activeChatStreams.set(requestId, controller);
  try {
    const { provider, messages } = request;
    logAi("stream:ipcStart", {
      requestId,
      providerName: provider?.name,
      model: provider?.model,
      messageCount: Array.isArray(messages) ? messages.length : 0,
    });
    logBehavior("ai:stream:requestMessages", {
      requestId,
      providerName: provider?.name,
      model: provider?.model,
      messages,
    });
    await requestChatCompletionStream(
      provider,
      messages,
      (chunk) => {
        logBehavior("ai:stream:chunk", {
          requestId,
          chunk,
        });
        event.sender.send("ai:chatStream:chunk", requestId, chunk);
      },
      {
        controller,
        abortMessage: "用户已停止本次生成。",
      },
    );
    event.sender.send("ai:chatStream:done", requestId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "模型请求失败";
    logError("ai:chatStream:ipcError", error, { requestId });
    event.sender.send("ai:chatStream:error", requestId, message);
  } finally {
    activeChatStreams.delete(requestId);
  }
});

ipcMain.handle("ai:chatStreamCancel", async (_event, requestId) => {
  const controller = activeChatStreams.get(requestId);
  if (!controller) return { ok: false };
  controller.abort();
  logAi("stream:cancelled", { requestId }, "warn");
  return { ok: true };
});

ipcMain.handle("app:platform", async () => ({
  platform: process.platform,
  home: os.homedir(),
  novayxkHome: NOVAYXK_HOME,
}));

ipcMain.handle("app:getLogInfo", async () => getLogInfo());

ipcMain.handle("app:readLogs", async () => ({
  appLog: await readLogTail(APP_LOG_FILE),
  errorLog: await readLogTail(ERROR_LOG_FILE),
  aiLog: await readLogTail(AI_LOG_FILE),
  behaviorLog: await readLogTail(BEHAVIOR_LOG_FILE, 120_000),
}));

ipcMain.handle("app:openLogs", async () => {
  await fs.mkdir(LOG_DIR, { recursive: true });
  await shell.openPath(LOG_DIR);
  return getLogInfo();
});

ipcMain.handle("app:getPrivilege", async () => ({
  platform: process.platform,
  isAdmin: await isRunningAsAdmin(),
  canElevate: process.platform === "win32" && !isDev,
  isDev,
}));

ipcMain.handle("app:restartAsAdmin", async () => ({
  ok: await restartAsAdmin(),
}));
