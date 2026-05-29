const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const os = require("node:os");
const childProcess = require("node:child_process");
const crypto = require("node:crypto");

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
const MAX_LOG_FILE_BYTES = 2 * 1024 * 1024;
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
  { pattern: /\b(curl|wget|iwr|invoke-webrequest)\b[\s\S]*\|[\s\S]*(?:sh|bash|iex|invoke-expression)\b/i, reason: "会下载并直接执行远程脚本" },
];
const SYSTEM_ACTION_COMMANDS = [
  { action: "shutdown", label: "关机", pattern: /\b(shutdown(\.exe)?\s+\/s|stop-computer\b)\b/i },
  { action: "restart", label: "重启", pattern: /\b(shutdown(\.exe)?\s+\/r|restart-computer\b|reboot\b)\b/i },
  { action: "logout", label: "注销", pattern: /\b(shutdown(\.exe)?\s+\/l|logoff(\.exe)?\b)\b/i },
  { action: "hibernate", label: "休眠", pattern: /\b(shutdown(\.exe)?\s+\/h|rundll32(\.exe)?\s+powrprof\.dll,\s*setsuspendstate\s+hibernate)\b/i },
  { action: "sleep", label: "睡眠", pattern: /\brundll32(\.exe)?\s+powrprof\.dll,\s*setsuspendstate\b/i },
  { action: "lock", label: "锁屏", pattern: /\brundll32(\.exe)?\s+user32\.dll,\s*lockworkstation\b/i },
];

let mainWindow;
let activeProjectRoot = null;
const patchTransactions = [];
const activeChatStreams = new Map();
let pendingUninstallCleanup = null;
let hasStartedUninstallCleanup = false;
let cachedAdminState = null;

const cliArgs = process.argv.slice(1);
const launchedExecutableName = path.basename(process.execPath).toLowerCase();
const isUninstallMode = cliArgs.includes("--uninstall") || launchedExecutableName.includes("uninstaller");
const uninstallTargetArg = getArgValue(cliArgs, "--target") || (isUninstallMode ? path.dirname(process.execPath) : "");
const DEBUG_LOG_NAME = "novayxk-launch-debug.log";

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
      if (pendingUninstallCleanup && !hasStartedUninstallCleanup) {
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

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle("window:minimize", () => {
  writeDebugLog("window:minimize", { source: "electron-main" });
  mainWindow?.minimize();
  return true;
});

ipcMain.handle("window:close", async () => {
  writeDebugLog("window:close", {
    source: "electron-main",
    hasPendingUninstallCleanup: Boolean(pendingUninstallCleanup),
  });
  if (pendingUninstallCleanup && !hasStartedUninstallCleanup) {
    await finalizeUninstallCleanup();
  }
  mainWindow?.close();
  return true;
});

function isInsideProject(candidatePath) {
  if (!activeProjectRoot) return false;
  const relative = path.relative(activeProjectRoot, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isSensitiveFile(filePath) {
  const basename = path.basename(filePath);
  return SENSITIVE_FILES.some((pattern) => pattern.test(basename));
}

function assertProjectFile(relativePath) {
  if (!activeProjectRoot) throw new Error("请先打开一个项目。");
  if (!relativePath || typeof relativePath !== "string") throw new Error("文件路径无效。");
  const fullPath = path.resolve(activeProjectRoot, relativePath);
  if (!isInsideProject(fullPath)) throw new Error("文件路径不在当前项目内。");
  if (isSensitiveFile(fullPath)) throw new Error("该文件看起来包含敏感信息，已阻止操作。");
  return fullPath;
}

function assertProjectPath(relativePath = "") {
  if (!activeProjectRoot) throw new Error("请先打开一个项目。");
  if (typeof relativePath !== "string") throw new Error("项目路径无效。");
  const normalized = normalizeRelativeProjectPath(relativePath);
  const fullPath = normalized ? path.resolve(activeProjectRoot, normalized) : activeProjectRoot;
  if (!isInsideProject(fullPath)) throw new Error("路径不在当前项目内。");
  if (normalized && isSensitiveFile(fullPath)) throw new Error("该路径看起来包含敏感信息，已阻止操作。");
  return fullPath;
}

function normalizeRelativeProjectPath(relativePath) {
  return String(relativePath ?? "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/")
    .trim();
}

async function statIfExists(fullPath) {
  try {
    return await fs.stat(fullPath);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

function getProjectId(projectRoot = activeProjectRoot) {
  if (!projectRoot) throw new Error("请先打开一个项目。");
  return crypto.createHash("sha256").update(path.resolve(projectRoot).toLowerCase()).digest("hex").slice(0, 16);
}

function getProjectMemoryPaths(projectRoot = activeProjectRoot) {
  const projectId = getProjectId(projectRoot);
  const projectDir = path.join(PROJECTS_DIR, projectId);
  return {
    projectId,
    projectDir,
    metaFile: path.join(projectDir, "project.json"),
    memoryFile: path.join(projectDir, "memory.md"),
    tasksDir: path.join(projectDir, "tasks"),
  };
}

function assertTaskId(taskId) {
  if (!taskId || typeof taskId !== "string" || !/^[a-zA-Z0-9_-]{8,64}$/.test(taskId)) {
    throw new Error("任务 ID 无效。");
  }
  return taskId;
}

function createTaskId() {
  return `task-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function titleFromMessages(messages) {
  const firstUserMessage = Array.isArray(messages) ? messages.find((message) => message?.role === "user") : null;
  const raw = firstUserMessage?.content ?? "新任务";
  return raw
    .replace(/\n\n当前选中文件：[\s\S]*$/, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 36) || "新任务";
}

function summarizeMessages(messages) {
  if (!Array.isArray(messages)) return "";
  const userMessages = messages
    .filter((message) => message?.role === "user")
    .slice(-6)
    .map((message) => message.content.replace(/\n\n当前选中文件：[\s\S]*$/, "").trim())
    .filter(Boolean);
  if (!userMessages.length) return "";
  return `最近任务重点：${userMessages.join("；").slice(0, 1200)}`;
}

async function ensureProjectMemoryRoot(projectRoot = activeProjectRoot) {
  const paths = getProjectMemoryPaths(projectRoot);
  await fs.mkdir(paths.tasksDir, { recursive: true });
  await fs.writeFile(
    paths.metaFile,
    JSON.stringify(
      {
        projectId: paths.projectId,
        root: projectRoot,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );
  return paths;
}

async function readProjectMemoryState(projectRoot = activeProjectRoot) {
  const paths = await ensureProjectMemoryRoot(projectRoot);
  let memory = "";
  try {
    memory = await fs.readFile(paths.memoryFile, "utf8");
  } catch {
    memory = "";
  }

  let taskFiles = [];
  try {
    taskFiles = await fs.readdir(paths.tasksDir, { withFileTypes: true });
  } catch {
    taskFiles = [];
  }

  const tasks = [];
  for (const entry of taskFiles) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(paths.tasksDir, entry.name), "utf8");
      const task = JSON.parse(raw);
      tasks.push({
        id: task.id,
        title: task.title || "未命名任务",
        summary: task.summary || "",
        messageCount: Array.isArray(task.messages) ? task.messages.length : 0,
        createdAt: task.createdAt || "",
        updatedAt: task.updatedAt || "",
      });
    } catch {
      // Ignore broken task files so one bad history does not break the app.
    }
  }

  tasks.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return {
    projectId: paths.projectId,
    projectRoot,
    memory,
    tasks,
  };
}

async function writeProjectMemory(memory) {
  if (typeof memory !== "string") throw new Error("项目记忆必须是文本。");
  if (memory.length > 80_000) throw new Error("项目记忆太长，请精简后再保存。");
  const paths = await ensureProjectMemoryRoot();
  await fs.writeFile(paths.memoryFile, memory, "utf8");
  return readProjectMemoryState();
}

async function saveTaskHistory(taskInput) {
  if (!taskInput || typeof taskInput !== "object") throw new Error("任务数据无效。");
  const paths = await ensureProjectMemoryRoot();
  const now = new Date().toISOString();
  const id = taskInput.id ? assertTaskId(taskInput.id) : createTaskId();
  const taskFile = path.join(paths.tasksDir, `${id}.json`);
  let existing = {};

  try {
    existing = JSON.parse(await fs.readFile(taskFile, "utf8"));
  } catch {
    existing = {};
  }

  const messages = Array.isArray(taskInput.messages) ? taskInput.messages : existing.messages ?? [];
  if (messages.length > 300) throw new Error("任务消息太多，请新建一个任务继续。");
  const normalizedMessages = messages.map((message) => ({
    role: message.role,
    content: String(message.content ?? "").slice(0, 80_000),
    ...(Number.isFinite(message.elapsedMs) && message.elapsedMs >= 0
      ? { elapsedMs: Math.round(message.elapsedMs) }
      : {}),
  }));
  const title = String(taskInput.title || existing.title || titleFromMessages(normalizedMessages)).slice(0, 80);
  const summary = String(taskInput.summary || summarizeMessages(normalizedMessages)).slice(0, 4000);
  const task = {
    id,
    title,
    summary,
    messages: normalizedMessages,
    createdAt: existing.createdAt || now,
    updatedAt: now,
  };

  await fs.writeFile(taskFile, JSON.stringify(task, null, 2), "utf8");
  return task;
}

async function loadTaskHistory(taskId) {
  const paths = await ensureProjectMemoryRoot();
  const id = assertTaskId(taskId);
  const raw = await fs.readFile(path.join(paths.tasksDir, `${id}.json`), "utf8");
  return JSON.parse(raw);
}

function inspectCommand(command) {
  const normalized = String(command ?? "").trim();
  if (!normalized) {
    return { allowed: false, reason: "命令为空。" };
  }
  const systemAction = detectSystemAction(normalized);
  if (systemAction) {
    return {
      allowed: false,
      reason: `${systemAction.label}属于特殊系统动作，需要你手动确认。`,
      requiresConfirmation: true,
      systemAction,
    };
  }
  if (normalized.length > MAX_SAFE_COMMAND_LENGTH) {
    return { allowed: false, reason: `命令过长，安全模式下请控制在 ${MAX_SAFE_COMMAND_LENGTH} 字符内。` };
  }

  const hit = DANGEROUS_COMMANDS.find((item) => item.pattern.test(normalized));
  if (hit) {
    return { allowed: false, reason: hit.reason };
  }

  return { allowed: true, reason: "" };
}

function inspectCommandForMode(command, controlMode = "safe") {
  const normalized = String(command ?? "").trim();
  if (!normalized) {
    return { allowed: false, reason: "命令为空。" };
  }
  const systemAction = detectSystemAction(normalized);
  if (systemAction) {
    return {
      allowed: false,
      reason: `${systemAction.label}属于特殊系统动作，需要你手动确认。`,
      requiresConfirmation: true,
      systemAction,
    };
  }
  if (normalized.length > MAX_FULL_COMMAND_LENGTH) {
    return { allowed: false, reason: `命令过长，请控制在 ${MAX_FULL_COMMAND_LENGTH} 字符内。` };
  }

  if (controlMode === "full") {
    return { allowed: true, reason: "完全控制模式已开启，危险命令拦截已跳过。" };
  }

  return inspectCommand(normalized);
}

function detectSystemAction(command) {
  const normalized = String(command ?? "").trim();
  const hit = SYSTEM_ACTION_COMMANDS.find((item) => item.pattern.test(normalized));
  if (!hit) return null;
  return {
    action: hit.action,
    label: hit.label,
  };
}

function getArgValue(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return "";
  return String(args[index + 1] ?? "").trim();
}

function getDebugLogPaths() {
  const paths = new Set([path.join(os.tmpdir(), DEBUG_LOG_NAME)]);
  try {
    paths.add(path.join(path.dirname(process.execPath), DEBUG_LOG_NAME));
  } catch {
    // Ignore path resolution issues for debug logging.
  }
  if (uninstallTargetArg) {
    try {
      paths.add(path.join(uninstallTargetArg, DEBUG_LOG_NAME));
    } catch {
      // Ignore path resolution issues for debug logging.
    }
  }
  return [...paths];
}

function writeDebugLog(eventName, payload) {
  const line = `${new Date().toISOString()} [${eventName}] ${JSON.stringify(payload)}${os.EOL}`;
  for (const logPath of getDebugLogPaths()) {
    try {
      fsSync.mkdirSync(path.dirname(logPath), { recursive: true });
      fsSync.appendFileSync(logPath, line, "utf8");
    } catch {
      // Debug logging must never break app startup.
    }
  }
}

function rotateLogIfNeeded(filePath) {
  try {
    const stat = fsSync.statSync(filePath);
    if (stat.size < MAX_LOG_FILE_BYTES) return;
    const rotatedPath = `${filePath}.1`;
    fsSync.rmSync(rotatedPath, { force: true });
    fsSync.renameSync(filePath, rotatedPath);
  } catch {
    // Missing files and rotation failures should not interrupt the app.
  }
}

function writeStructuredLog(filePath, level, eventName, payload = {}) {
  try {
    fsSync.mkdirSync(LOG_DIR, { recursive: true });
    rotateLogIfNeeded(filePath);
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      event: eventName,
      ...sanitizeLogPayload(payload),
    });
    fsSync.appendFileSync(filePath, `${line}${os.EOL}`, "utf8");
  } catch {
    // Logging must never break user workflows.
  }
}

function logApp(eventName, payload = {}, level = "info") {
  writeStructuredLog(APP_LOG_FILE, level, eventName, payload);
}

function logError(eventName, error, payload = {}) {
  writeStructuredLog(ERROR_LOG_FILE, "error", eventName, {
    ...payload,
    error: serializeError(error),
  });
}

function logAi(eventName, payload = {}, level = "info") {
  writeStructuredLog(AI_LOG_FILE, level, eventName, payload);
}

function serializeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: error.code,
    };
  }
  return {
    message: String(error),
  };
}

function sanitizeLogPayload(value) {
  const seen = new WeakSet();
  return sanitizeValue(value, seen);
}

function sanitizeValue(value, seen) {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactSensitiveText(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Error) return serializeError(value);
  if (Array.isArray(value)) return value.slice(0, 30).map((item) => sanitizeValue(item, seen));
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[Circular]";
  seen.add(value);

  const result = {};
  for (const [key, item] of Object.entries(value).slice(0, 80)) {
    if (isSensitiveLogKey(key)) {
      result[key] = "[REDACTED]";
      continue;
    }
    result[key] = sanitizeValue(item, seen);
  }
  return result;
}

function isSensitiveLogKey(key) {
  return /(api[-_]?key|authorization|token|secret|password|credential|cookie|auth)/i.test(key);
}

function redactSensitiveText(value) {
  return String(value)
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, "sk-[REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, "Bearer [REDACTED]")
    .slice(0, 8000);
}

function installIpcErrorLogger() {
  const originalHandle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (channel, listener) =>
    originalHandle(channel, async (event, ...args) => {
      const startedAt = Date.now();
      try {
        const result = await listener(event, ...args);
        logApp("ipc:ok", {
          channel,
          elapsedMs: Date.now() - startedAt,
        });
        return result;
      } catch (error) {
        logError("ipc:error", error, {
          channel,
          elapsedMs: Date.now() - startedAt,
          args: summarizeIpcArgs(channel, args),
        });
        throw error;
      }
    });
}

function installProcessErrorLogger() {
  process.on("uncaughtException", (error) => {
    logError("process:uncaughtException", error);
  });
  process.on("unhandledRejection", (reason) => {
    logError("process:unhandledRejection", reason);
  });
}

function summarizeIpcArgs(channel, args) {
  if (channel.startsWith("ai:") || channel.startsWith("config:")) {
    return "[REDACTED]";
  }
  return args;
}

function getLogInfo() {
  return {
    logDir: LOG_DIR,
    appLog: APP_LOG_FILE,
    errorLog: ERROR_LOG_FILE,
    aiLog: AI_LOG_FILE,
    uninstallCleanupLog: UNINSTALL_CLEANUP_LOG,
    launchDebugLog: path.join(os.tmpdir(), DEBUG_LOG_NAME),
  };
}

async function readLogTail(filePath, maxBytes = 32_000) {
  try {
    const stat = await fs.stat(filePath);
    const start = Math.max(0, stat.size - maxBytes);
    const handle = await fs.open(filePath, "r");
    try {
      const buffer = Buffer.alloc(stat.size - start);
      await handle.read(buffer, 0, buffer.length, start);
      return buffer.toString("utf8");
    } finally {
      await handle.close();
    }
  } catch {
    return "";
  }
}

function getInstallDirForUninstaller() {
  return uninstallTargetArg || path.dirname(process.execPath);
}

function getDesktopShortcutPath() {
  return path.join(os.homedir(), "Desktop", "Novayxk.lnk");
}

function getStartMenuShortcutPath() {
  const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  return path.join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "Novayxk", "Novayxk.lnk");
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function removePath(filePath) {
  await fs.rm(filePath, { recursive: true, force: true }).catch(() => {});
}

function runExecutable(command, args) {
  return new Promise((resolve, reject) => {
    const child = childProcess.spawn(command, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(output);
      } else {
        reject(new Error(output.trim() || `${command} 退出码 ${code}`));
      }
    });
  });
}

function runExecutableCapture(command, args) {
  return new Promise((resolve) => {
    const child = childProcess.spawn(command, args, {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", (error) => {
      resolve({ code: -1, output: error.message });
    });
    child.on("close", (code) => {
      resolve({ code: code ?? -1, output });
    });
  });
}

async function isRunningAsAdmin() {
  if (process.platform !== "win32") return process.getuid?.() === 0;
  if (cachedAdminState !== null) return cachedAdminState;
  const result = await runExecutableCapture("net.exe", ["session"]);
  cachedAdminState = result.code === 0;
  return cachedAdminState;
}

async function restartAsAdmin() {
  if (process.platform !== "win32") {
    throw new Error("当前系统不支持 Windows UAC 提权重启。");
  }
  if (isDev) {
    throw new Error("开发模式下不能可靠地以管理员权限重启，请先打包后测试。");
  }

  const exePath = process.execPath;
  const args = process.argv.slice(1).filter((arg) => arg !== "--uninstall");
  const argumentList = args.map((arg) => `"${String(arg).replace(/"/g, '\\"')}"`).join(" ");
  const psScriptLines = [
    `$exePath = ${psQuote(exePath)}`,
  ];
  if (argumentList) {
    psScriptLines.push(`$argumentList = ${psQuote(argumentList)}`);
    psScriptLines.push("Start-Process -FilePath $exePath -ArgumentList $argumentList -Verb RunAs");
  } else {
    psScriptLines.push("Start-Process -FilePath $exePath -Verb RunAs");
  }
  const psScript = psScriptLines.join("\r\n");
  await runExecutable("powershell.exe", [
    "-NoLogo",
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    psScript,
  ]);
  app.quit();
  return true;
}

async function closeRunningInstalledApp() {
  await runExecutable("taskkill.exe", ["/IM", APP_EXE, "/F"]).catch(() => {});
}

async function removeShellArtifacts() {
  await removePath(getDesktopShortcutPath());
  await removePath(getStartMenuShortcutPath());
  await removePath(path.dirname(getStartMenuShortcutPath()));
}

async function removeUninstallRegistry() {
  await runExecutable("reg.exe", ["delete", APP_REGISTRY_KEY, "/f"]).catch(() => {});
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function emitUninstallProgress(target, percent, title, detail) {
  target?.send("uninstall:progress", {
    percent,
    title,
    detail,
  });
}

async function finalizeUninstallCleanup() {
  if (!pendingUninstallCleanup || hasStartedUninstallCleanup) return;
  hasStartedUninstallCleanup = true;
  const cleanupHelperPath = await launchCleanupHelper({
    installDir: pendingUninstallCleanup.installDir,
    deleteUserData: pendingUninstallCleanup.deleteUserData,
    userDataDir: NOVAYXK_HOME,
  });
  writeDebugLog("uninstall:cleanupSpawned", {
    source: "electron-main",
    installDir: pendingUninstallCleanup.installDir,
    deleteUserData: pendingUninstallCleanup.deleteUserData,
    cleanupHelperPath,
  });
}

async function findCleanupHelper() {
  const candidates = [
    path.join(process.resourcesPath || "", "cleanup", CLEANUP_EXE),
    path.join(path.dirname(process.execPath), "resources", "cleanup", CLEANUP_EXE),
    path.join(__dirname, "..", "dist-release", "win-unpacked", "resources", "cleanup", CLEANUP_EXE),
    path.join(__dirname, "..", "dist-cleanup", CLEANUP_EXE),
  ];
  for (const candidate of candidates) {
    if (candidate && (await pathExists(candidate))) return candidate;
  }
  throw new Error(`没有找到 ${CLEANUP_EXE}，请重新打包安装。`);
}

async function launchCleanupHelper({ installDir, deleteUserData, userDataDir }) {
  const helperSource = await findCleanupHelper();
  const helperTarget = path.join(
    os.tmpdir(),
    `Novayxk Cleanup-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.exe`,
  );
  await fs.copyFile(helperSource, helperTarget);

  const args = [
    "--target",
    installDir,
    "--wait-pid",
    String(process.pid),
    "--log",
    UNINSTALL_CLEANUP_LOG,
  ];
  if (deleteUserData) {
    args.push("--delete-user-data", "--user-data", userDataDir);
  }

  childProcess.spawn(helperTarget, args, {
    cwd: os.tmpdir(),
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  }).unref();

  return helperTarget;
}

function parseUnifiedPatch(patchText) {
  const lines = patchText.replace(/\r\n/g, "\n").split("\n");
  const files = [];
  let current = null;
  let hunks = [];
  let currentHunk = null;

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      if (current) files.push({ ...current, hunks });
      current = null;
      hunks = [];
      currentHunk = null;
      continue;
    }

    if (line.startsWith("--- ")) {
      if (current) files.push({ ...current, hunks });
      current = {
        oldPath: normalizePatchPath(line.slice(4).trim()),
        newPath: null,
      };
      hunks = [];
      currentHunk = null;
      continue;
    }

    if (line.startsWith("+++ ")) {
      if (!current) current = { oldPath: null, newPath: null };
      current.newPath = normalizePatchPath(line.slice(4).trim());
      continue;
    }

    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (hunkMatch) {
      if (!current) throw new Error("补丁缺少文件头。");
      currentHunk = {
        oldStart: Number(hunkMatch[1]),
        oldCount: Number(hunkMatch[2] ?? "1"),
        newStart: Number(hunkMatch[3]),
        newCount: Number(hunkMatch[4] ?? "1"),
        lines: [],
      };
      hunks.push(currentHunk);
      continue;
    }

    if (currentHunk && /^[ +\-\\]/.test(line)) {
      if (line.startsWith("\\ No newline at end of file")) continue;
      currentHunk.lines.push(line);
    }
  }

  if (current) files.push({ ...current, hunks });
  return files
    .map((file) => {
      const isCreate = file.oldPath === "/dev/null";
      const isDelete = file.newPath === "/dev/null";
      return {
        oldPath: file.oldPath,
        newPath: file.newPath,
        path: isDelete ? file.oldPath : file.newPath,
        isCreate,
        isDelete,
        hunks: file.hunks,
      };
    })
    .filter((file) => file.path && file.path !== "/dev/null" && file.hunks.length);
}

function normalizePatchPath(rawPath) {
  const cleaned = rawPath.split(/\s+/)[0].replace(/^"|"$/g, "");
  if (cleaned === "/dev/null") return cleaned;
  return cleaned.replace(/^[ab]\//, "").replace(/\\/g, "/");
}

function applyHunks(original, hunks) {
  const source = original.replace(/\r\n/g, "\n");
  const originalLines = source.split("\n");
  const hasTrailingNewline = source.endsWith("\n");
  if (hasTrailingNewline) originalLines.pop();

  const result = [];
  let cursor = 0;

  for (const hunk of hunks) {
    const start = Math.max(hunk.oldStart - 1, 0);
    if (start < cursor) throw new Error("补丁块位置重叠，无法安全应用。");
    result.push(...originalLines.slice(cursor, start));
    cursor = start;

    for (const hunkLine of hunk.lines) {
      const marker = hunkLine[0];
      const text = hunkLine.slice(1);
      if (marker === " ") {
        if (originalLines[cursor] !== text) {
          throw new Error(`补丁上下文不匹配：${text}`);
        }
        result.push(originalLines[cursor]);
        cursor += 1;
      } else if (marker === "-") {
        if (originalLines[cursor] !== text) {
          throw new Error(`补丁删除行不匹配：${text}`);
        }
        cursor += 1;
      } else if (marker === "+") {
        result.push(text);
      }
    }
  }

  result.push(...originalLines.slice(cursor));
  return result.join("\n") + (hasTrailingNewline ? "\n" : "");
}

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

  pendingUninstallCleanup = {
    installDir,
    deleteUserData: request?.deleteUserData === true,
  };
  hasStartedUninstallCleanup = false;
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

async function buildTree(dir, depth = 0, options = {}) {
  const maxDepth = Number.isFinite(options.maxDepth) ? options.maxDepth : TREE_INITIAL_DEPTH;
  if (depth > maxDepth) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const visible = entries
    .filter((entry) => !IGNORED_DIRS.has(entry.name))
    .filter((entry) => !entry.name.startsWith(".") || entry.name === ".github")
    .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));

  const nodes = [];
  for (const entry of visible.slice(0, TREE_ENTRY_LIMIT)) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(activeProjectRoot, fullPath).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      const childEntries = depth < maxDepth ? await buildTree(fullPath, depth + 1, options) : [];
      nodes.push({
        type: "directory",
        name: entry.name,
        path: relativePath,
        children: childEntries,
        loaded: depth < maxDepth,
      });
    } else {
      nodes.push({
        type: "file",
        name: entry.name,
        path: relativePath,
        sensitive: isSensitiveFile(fullPath),
      });
    }
  }
  return nodes;
}

async function buildDirectoryTree(relativePath = "") {
  const normalized = normalizeRelativeProjectPath(relativePath);
  const fullPath = assertProjectPath(normalized);
  const stat = await fs.stat(fullPath);
  if (!stat.isDirectory()) throw new Error("路径不是文件夹。");
  return {
    path: normalized,
    children: await buildTree(fullPath, 0, { maxDepth: 0 }),
  };
}

async function searchProjectFiles(query) {
  if (!activeProjectRoot) throw new Error("请先打开一个项目。");
  const term = String(query ?? "").trim().toLowerCase();
  if (!term) return [];
  const matches = [];
  await walkProjectFiles(activeProjectRoot, async (fullPath, relativePath, stat) => {
    if (matches.length >= PROJECT_SEARCH_LIMIT) return false;
    const normalizedPath = relativePath.replace(/\\/g, "/");
    if (!normalizedPath.toLowerCase().includes(term)) return true;
    matches.push({
      type: "file",
      name: path.basename(normalizedPath),
      path: normalizedPath,
      sensitive: isSensitiveFile(fullPath),
      size: stat.size,
    });
    return true;
  });
  return matches;
}

async function readProjectContext(request = {}) {
  if (!activeProjectRoot) throw new Error("请先打开一个项目。");
  const selectedPath = normalizeRelativeProjectPath(request.selectedPath ?? "");
  const prompt = String(request.prompt ?? "");
  const projectFiles = [];
  await walkProjectFiles(activeProjectRoot, async (fullPath, relativePath, stat) => {
    if (projectFiles.length >= PROJECT_CONTEXT_FILE_LIMIT) return false;
    const normalizedPath = relativePath.replace(/\\/g, "/");
    projectFiles.push({
      path: normalizedPath,
      size: stat.size,
      sensitive: isSensitiveFile(fullPath),
    });
    return true;
  });

  const relatedPaths = pickRelatedProjectFiles(projectFiles, selectedPath, prompt);
  const relatedFiles = [];
  let usedBytes = 0;
  for (const relativePath of relatedPaths) {
    if (usedBytes >= PROJECT_CONTEXT_RELATED_BYTES) break;
    try {
      const fullPath = assertProjectFile(relativePath);
      const stat = await fs.stat(fullPath);
      if (!isLikelyTextFile(fullPath, stat.size)) continue;
      const remaining = PROJECT_CONTEXT_RELATED_BYTES - usedBytes;
      const content = await fs.readFile(fullPath, "utf8");
      const clipped = content.slice(0, Math.max(0, remaining));
      relatedFiles.push({
        path: relativePath,
        content: clipped,
        truncated: clipped.length < content.length,
      });
      usedBytes += clipped.length;
    } catch {
      // Skip files that disappeared, grew too large, or are blocked as sensitive.
    }
  }

  return {
    root: activeProjectRoot,
    files: projectFiles,
    relatedFiles,
  };
}

async function walkProjectFiles(dir, visitor, depth = 0) {
  if (depth > PROJECT_WALK_DEPTH_LIMIT) return true;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return true;
  }

  const visible = entries
    .filter((entry) => !IGNORED_DIRS.has(entry.name))
    .filter((entry) => !entry.name.startsWith(".") || entry.name === ".github")
    .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));

  for (const entry of visible) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(activeProjectRoot, fullPath).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      const shouldContinue = await walkProjectFiles(fullPath, visitor, depth + 1);
      if (shouldContinue === false) return false;
    } else if (entry.isFile()) {
      const stat = await statIfExists(fullPath);
      if (!stat) continue;
      const shouldContinue = await visitor(fullPath, relativePath, stat);
      if (shouldContinue === false) return false;
    }
  }
  return true;
}

function pickRelatedProjectFiles(files, selectedPath, prompt) {
  const tokens = extractPromptTokens(`${prompt} ${selectedPath}`);
  const selectedDir = selectedPath ? path.posix.dirname(selectedPath.replace(/\\/g, "/")) : "";
  const scored = [];
  for (const file of files) {
    if (file.sensitive || !isLikelyTextProjectPath(file.path) || file.size > 120_000) continue;
    if (file.path === selectedPath) continue;
    let score = 0;
    const lowerPath = file.path.toLowerCase();
    for (const token of tokens) {
      if (lowerPath.includes(token)) score += token.length > 4 ? 4 : 2;
    }
    if (selectedDir && path.posix.dirname(file.path) === selectedDir) score += 3;
    if (/^(package\.json|vite\.config\.ts|tsconfig\.json|README\.md)$/i.test(file.path)) score += 2;
    if (score > 0) scored.push({ path: file.path, score });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, PROJECT_CONTEXT_RELATED_LIMIT)
    .map((item) => item.path);
}

function extractPromptTokens(text) {
  const matches = String(text ?? "").toLowerCase().match(/[a-z0-9_.-]{3,}/g) ?? [];
  return [...new Set(matches)].slice(0, 24);
}

function isLikelyTextProjectPath(relativePath) {
  const lower = String(relativePath ?? "").toLowerCase();
  if (/(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(lower)) return false;
  if (/\.(png|jpg|jpeg|gif|webp|ico|bmp|pdf|zip|7z|gz|tgz|exe|dll|dat|pak|asar|node)$/i.test(lower)) return false;
  const extension = path.extname(lower);
  return TEXT_FILE_EXTENSIONS.has(extension) || !extension;
}

function isLikelyTextFile(fullPath, size) {
  return size <= 160_000 && isLikelyTextProjectPath(path.relative(activeProjectRoot, fullPath));
}

async function openProjectRoot(projectRoot) {
  if (!projectRoot || typeof projectRoot !== "string") throw new Error("项目路径无效。");
  const resolvedRoot = path.resolve(projectRoot);
  const stat = await fs.stat(resolvedRoot);
  if (!stat.isDirectory()) throw new Error("项目路径不是文件夹。");
  activeProjectRoot = resolvedRoot;
  logApp("project:opened", { projectRoot: activeProjectRoot });
  return {
    root: activeProjectRoot,
    tree: await buildTree(activeProjectRoot, 0, { maxDepth: TREE_INITIAL_DEPTH }),
  };
}

async function readConfig() {
  try {
    const raw = await fs.readFile(CONFIG_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return {
      providers: [],
      activeProviderId: null,
      theme: "dark",
      aiControlMode: "safe",
    };
  }
}

async function writeConfig(config) {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
  logApp("config:saved", {
    providerCount: Array.isArray(config?.providers) ? config.providers.length : 0,
    activeProviderId: config?.activeProviderId || null,
    theme: config?.theme || null,
    aiControlMode: config?.aiControlMode || null,
    hasLastProjectRoot: Boolean(config?.lastProjectRoot),
  });
  return config;
}

function runCommand(command, cwd) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const shell = process.platform === "win32" ? "powershell.exe" : "/bin/sh";
    const tempScriptPath = process.platform === "win32"
      ? path.join(os.tmpdir(), `novayxk-command-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.ps1`)
      : "";
    const args = process.platform === "win32"
      ? ["-NoLogo", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", tempScriptPath]
      : ["-lc", command];
    if (process.platform === "win32") {
      const utf8Bom = Buffer.from([0xef, 0xbb, 0xbf]);
      const prelude = [
        "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
        "$OutputEncoding = [System.Text.Encoding]::UTF8",
        "",
      ].join(os.EOL);
      fsSync.writeFileSync(tempScriptPath, Buffer.concat([utf8Bom, Buffer.from(`${prelude}${command}`, "utf8")]));
    }
    const child = childProcess.spawn(shell, args, {
      cwd,
      env: process.env,
      windowsHide: true,
    });
    let output = "";

    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("close", (code) => {
      if (tempScriptPath) {
        fsSync.rmSync(tempScriptPath, { force: true });
      }
      const effectiveCode = normalizePowerShellExitCode(code, output);
      logApp(effectiveCode === 0 ? "command:completed" : "command:failed", {
        cwd,
        code: effectiveCode,
        originalCode: code,
        elapsedMs: Date.now() - startedAt,
        commandPreview: String(command).slice(0, 500),
      }, effectiveCode === 0 ? "info" : "warn");
      resolve({
        code: effectiveCode,
        output: output.slice(-20000),
      });
    });
  });
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

async function requestChatCompletion(provider, messages, options = {}) {
  if (!provider?.baseUrl || !provider?.apiKey || !provider?.model) {
    throw new Error("供应商配置不完整。");
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 45_000);
  const apiMode = provider.apiMode ?? "chatCompletions";
  const endpoint = buildProviderEndpoint(provider.baseUrl, apiMode);
  const providerProfile = getProviderProfile(provider);
  logAi("request:start", {
    providerName: provider.name,
    model: provider.model,
    apiMode,
    endpoint,
    providerProfile,
    messageCount: Array.isArray(messages) ? messages.length : 0,
    stream: false,
  });
  const body = buildProviderRequestBody(provider, messages, {
    ...options,
    stream: false,
  });

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: buildProviderHeaders(provider),
      signal: controller.signal,
      body: JSON.stringify(body),
    });

    const responseText = await response.text();
    if (!response.ok) {
      logAi("request:httpError", {
        providerName: provider.name,
        model: provider.model,
        apiMode,
        endpoint,
        status: response.status,
        elapsedMs: Date.now() - startedAt,
        responsePreview: responseText.slice(0, 500),
      }, "warn");
      throw new Error(`模型请求失败：${response.status} ${formatProviderError(responseText, endpoint)}`);
    }

    try {
      const parsed = JSON.parse(responseText);
      logAi("request:done", {
        providerName: provider.name,
        model: provider.model,
        apiMode,
        endpoint,
        elapsedMs: Date.now() - startedAt,
      });
      return parsed;
    } catch {
      logAi("request:invalidJson", {
        providerName: provider.name,
        model: provider.model,
        apiMode,
        endpoint,
        elapsedMs: Date.now() - startedAt,
        responsePreview: responseText.slice(0, 500),
      }, "error");
      throw new Error(`供应商返回的不是 JSON。请检查接口类型和 Base URL。当前请求：${endpoint}`);
    }
  } catch (error) {
    logError("ai:request:error", error, {
      providerName: provider.name,
      model: provider.model,
      apiMode,
      endpoint,
      elapsedMs: Date.now() - startedAt,
    });
    if (error.name === "AbortError") {
      throw new Error("模型请求超时，请检查 Base URL、网络或供应商状态。");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function buildProviderEndpoint(baseUrl, apiMode) {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Base URL 无效，请填写类似 https://api.openai.com/v1 的地址。");
  }

  const pathName = parsed.pathname.replace(/\/+$/, "");
  const apiBase = pathName && pathName !== "/" ? trimmed : `${trimmed}/v1`;
  return apiMode === "responses" ? `${apiBase}/responses` : `${apiBase}/chat/completions`;
}

function getProviderProfile(provider) {
  const source = `${provider?.name || ""} ${provider?.baseUrl || ""} ${provider?.model || ""}`;
  if (/xiaomimimo|mimo-v2|mimo-v/i.test(source)) return "mimo";
  return "openai-compatible";
}

function buildProviderHeaders(provider) {
  const headers = {
    "Content-Type": "application/json",
  };
  if (getProviderProfile(provider) === "mimo") {
    headers["api-key"] = provider.apiKey;
  } else {
    headers.Authorization = `Bearer ${provider.apiKey}`;
  }
  return headers;
}

function buildProviderRequestBody(provider, messages, options = {}) {
  const apiMode = provider.apiMode ?? "chatCompletions";
  const providerProfile = getProviderProfile(provider);

  if (apiMode === "responses") {
    return {
      model: provider.model,
      input: messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      temperature: options.temperature ?? 0.2,
      ...(options.stream ? { stream: true } : {}),
      ...(options.maxTokens ? { max_output_tokens: options.maxTokens } : {}),
    };
  }

  if (providerProfile === "mimo") {
    return {
      model: provider.model,
      messages,
      temperature: options.temperature ?? 0.7,
      top_p: options.topP ?? 0.95,
      stream: options.stream === true,
      stop: null,
      frequency_penalty: 0,
      presence_penalty: 0,
      thinking: { type: "disabled" },
      ...(options.maxTokens ? { max_completion_tokens: options.maxTokens } : {}),
    };
  }

  return {
    model: provider.model,
    messages,
    temperature: options.temperature ?? 0.2,
    ...(options.stream ? { stream: true } : {}),
    ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
  };
}

function formatProviderError(responseText, endpoint) {
  const trimmed = responseText.trim();
  if (trimmed.startsWith("<")) {
    return `供应商返回了 HTML 页面，通常是 Base URL 或接口类型不匹配。当前请求：${endpoint}`;
  }
  return trimmed.slice(0, 500);
}

function extractModelText(data, apiMode) {
  if (apiMode === "responses") {
    if (typeof data.output_text === "string") return data.output_text;
    const parts = [];
    for (const item of data.output ?? []) {
      for (const content of item.content ?? []) {
        if (typeof content.text === "string") parts.push(content.text);
      }
    }
    return parts.join("\n");
  }

  return data.choices?.[0]?.message?.content ?? "";
}

function extractStreamText(data, apiMode) {
  if (apiMode === "responses") {
    if (typeof data.delta === "string") return data.delta;
    if (data.type === "response.output_text.delta" && typeof data.delta === "string") return data.delta;
    if (data.type === "response.output_item.done") return extractModelText(data.item ?? {}, "responses");
    return "";
  }

  return data.choices?.[0]?.delta?.content ?? "";
}

async function requestChatCompletionStream(provider, messages, onChunk, options = {}) {
  if (!provider?.baseUrl || !provider?.apiKey || !provider?.model) {
    throw new Error("供应商配置不完整。");
  }

  const startedAt = Date.now();
  const controller = options.controller ?? new AbortController();
  let didTimeout = false;
  const timeout = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, options.timeoutMs ?? 120_000);
  const apiMode = provider.apiMode ?? "chatCompletions";
  const endpoint = buildProviderEndpoint(provider.baseUrl, apiMode);
  const providerProfile = getProviderProfile(provider);
  let chunkCount = 0;
  logAi("stream:start", {
    providerName: provider.name,
    model: provider.model,
    apiMode,
    endpoint,
    providerProfile,
    messageCount: Array.isArray(messages) ? messages.length : 0,
    stream: true,
  });
  const body = buildProviderRequestBody(provider, messages, {
    ...options,
    stream: true,
  });

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        ...buildProviderHeaders(provider),
        Accept: "text/event-stream",
      },
      signal: controller.signal,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logAi("stream:httpError", {
        providerName: provider.name,
        model: provider.model,
        apiMode,
        endpoint,
        status: response.status,
        elapsedMs: Date.now() - startedAt,
        responsePreview: errorText.slice(0, 500),
      }, "warn");
      throw new Error(`模型请求失败：${response.status} ${formatProviderError(errorText, endpoint)}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("供应商没有返回可读取的流。");

    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? "";
      for (const event of events) {
        for (const line of event.split(/\r?\n/)) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const parsed = JSON.parse(payload);
            const text = extractStreamText(parsed, apiMode);
            if (text) {
              chunkCount += 1;
              onChunk(text);
            }
          } catch {
            // Ignore malformed keepalive/event payloads.
          }
        }
      }
    }
    logAi("stream:done", {
      providerName: provider.name,
      model: provider.model,
      apiMode,
      endpoint,
      elapsedMs: Date.now() - startedAt,
      chunkCount,
    });
  } catch (error) {
    logError("ai:stream:error", error, {
      providerName: provider.name,
      model: provider.model,
      apiMode,
      endpoint,
      elapsedMs: Date.now() - startedAt,
      chunkCount,
    });
    if (error.name === "AbortError") {
      if (!didTimeout && options.abortMessage) {
        throw new Error(options.abortMessage);
      }
      throw new Error("模型请求超时，请检查 Base URL、网络或供应商状态。");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
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

ipcMain.handle("project:inspectCommand", async (_event, command) => inspectCommand(command));

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
  return runCommand(command, activeProjectRoot);
});

ipcMain.handle("project:runCommandWithMode", async (_event, request) => {
  if (!activeProjectRoot) throw new Error("请先打开一个项目。");
  const command = String(request?.command ?? "").trim();
  const controlMode = request?.controlMode === "full" ? "full" : "safe";
  const inspection = request?.confirmedSystemAction === true
    ? {
        allowed: true,
        reason: "特殊系统动作已由用户确认。",
      }
    : inspectCommandForMode(command, controlMode);
  if (!inspection.allowed) {
    logApp("command:blocked", {
      projectRoot: activeProjectRoot,
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
  const result = await runCommand(command, activeProjectRoot);
  return {
    ...result,
    command,
    controlMode,
    bypassedDangerCheck: controlMode === "full",
  };
});

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

ipcMain.handle("config:get", readConfig);
ipcMain.handle("config:save", async (_event, config) => writeConfig(config));

ipcMain.handle("ai:chat", async (_event, request) => {
  const { provider, messages } = request;
  const data = await requestChatCompletion(provider, messages);
  return extractModelText(data, provider.apiMode ?? "chatCompletions");
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
    await requestChatCompletionStream(
      provider,
      messages,
      (chunk) => {
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
