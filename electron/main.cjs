const { app, BrowserWindow, Menu, dialog, ipcMain, shell, safeStorage, session, protocol, net, clipboard, nativeImage } = require("electron");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
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
const { getHeaderValue, isAbortError, requestBuffer } = require("./services/http.cjs");
const { createProjectService } = require("./services/project.cjs");
const { createInstallerService } = require("./services/installer.cjs");
const { createWebSearchService } = require("./services/web-search.cjs");

const isDev = !app.isPackaged;
const NOVAYXK_HOME = path.join(os.homedir(), ".novayxk");
const CONFIG_DIR = path.join(NOVAYXK_HOME, "config");
const CONFIG_FILE = path.join(CONFIG_DIR, "providers.json");
const PROJECTS_DIR = path.join(NOVAYXK_HOME, "projects");
const GENERATED_IMAGES_DIR = path.join(NOVAYXK_HOME, "generated-images");
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
const BROWSER_START_URL = "https://www.baidu.com/";
const BROWSER_PARTITION = "novayxk-browser";
const BROWSER_GUEST_PRELOAD_URL = pathToFileURL(path.join(__dirname, "browser-preload.cjs")).toString();
const MAX_BROWSER_ACTION_LOGS = 200;
const MAX_BROWSER_NETWORK_LOGS = 300;
const BROWSER_WORKSPACE_COMMAND_TIMEOUT_MS = 12_000;
const BROWSER_TRACE_PREVIEW_BYTES = 80_000;
const MAX_GENERATED_IMAGE_BYTES = 25 * 1024 * 1024;
const IMAGE_GENERATION_TIMEOUT_MS = 10 * 60 * 1000;
const IMAGE_GENERATION_ABORT_MESSAGE = "The current generation was stopped by the user.";
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
  { pattern: /\b(git\s+reset\s+--hard|git\s+clean\s+-[a-z]*[fdx][a-z]*)\b/i, reason: "This would discard local code changes." },
  { pattern: /\b(format|diskpart|shutdown|reboot)\b/i, reason: "This may affect the system or disk." },
  { pattern: /\b(reg\s+delete|set-executionpolicy)\b/i, reason: "This would modify system-level configuration." },
  { pattern: /\b(remove-item|rm|del|erase|rd|rmdir)\b[\s\S]*(?:-recurse|\/s)\b[\s\S]*(?:-force|\/q)\b/i, reason: "This includes forced recursive deletion." },
  { pattern: /\brm\s+-[a-z]*r[a-z]*f[a-z]*\s+(?:[/"']|~|\*)/i, reason: "This includes a high-risk delete command." },
  { pattern: /\b(curl(?:\.exe)?|wget(?:\.exe)?|iwr|irm|invoke-webrequest|invoke-restmethod)\b[\s\S]*\|[\s\S]*(?:sh|bash|iex|invoke-expression)\b/i, reason: "This would download and execute a remote script directly." },
];
const SYSTEM_ACTION_COMMANDS = [
  { action: "shutdown", label: "Shut down", pattern: /\b(shutdown(\.exe)?\s+\/s|stop-computer\b)\b/i },
  { action: "restart", label: "Restart", pattern: /\b(shutdown(\.exe)?\s+\/r|restart-computer\b|reboot\b)\b/i },
  { action: "logout", label: "Sign out", pattern: /\b(shutdown(\.exe)?\s+\/l|logoff(\.exe)?\b)\b/i },
  { action: "hibernate", label: "Hibernate", pattern: /\b(shutdown(\.exe)?\s+\/h|rundll32(\.exe)?\s+powrprof\.dll,\s*setsuspendstate\s+hibernate)\b/i },
  { action: "sleep", label: "Sleep", pattern: /\brundll32(\.exe)?\s+powrprof\.dll,\s*setsuspendstate\b/i },
  { action: "lock", label: "Lock screen", pattern: /\brundll32(\.exe)?\s+user32\.dll,\s*lockworkstation\b/i },
];

function normalizeSystemLanguage(value) {
  return /^zh(?:[-_]|$)/i.test(String(value || "").trim()) ? "zh-CN" : "en";
}

function detectSystemLanguage() {
  const preferredLanguages = typeof app.getPreferredSystemLanguages === "function"
    ? app.getPreferredSystemLanguages()
    : [];
  const candidates = Array.isArray(preferredLanguages) ? preferredLanguages.filter(Boolean) : [];
  if (typeof app.getLocale === "function") {
    candidates.push(app.getLocale());
  }
  return normalizeSystemLanguage(candidates[0] || "en");
}
const ADMIN_REQUIRED_COMMANDS = [
  { label: "System service management", pattern: /\b(?:sc(?:\.exe)?\s+(?:create|delete|config|start|stop)|new-service|set-service|start-service|stop-service|restart-service)\b/i },
  { label: "Registry changes under system hives", pattern: /\breg(?:\.exe)?\s+(?:add|delete|import|restore|save|copy)\s+HK(?:LM|CR|U|CC)\\/i },
  { label: "Windows permissions or firewall changes", pattern: /\b(?:netsh\s+advfirewall|set-executionpolicy|bcdedit|takeown|icacls)\b/i },
  { label: "Writing to system directories", pattern: /\b(?:copy|move|remove-item|rm|del|mkdir|new-item|set-content|add-content)\b[\s\S]*(?:C:\\Windows|C:\\Program Files|C:\\ProgramData)/i },
  { label: "Software package install or uninstall", pattern: /\b(?:winget|choco|scoop)\s+(?:install|uninstall|upgrade)|\b(?:install-package|uninstall-package|add-appxpackage|remove-appxpackage|msiexec(?:\.exe)?)\b/i },
  { label: "Force-stopping processes", pattern: /\btaskkill(?:\.exe)?\b[\s\S]*\s\/f\b/i },
  { label: "PowerShell run as administrator", pattern: /\bstart-process\b[\s\S]*\b-verb\s+runas\b/i },
];

protocol.registerSchemesAsPrivileged([
  {
    scheme: "novayxk-image",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
    },
  },
  {
    scheme: "novayxk-project",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
    },
  },
]);

let mainWindow;
let browserWorkspaceWindow = null;
let browserWorkspaceReady = false;
let browserTraceFile = null;
const browserWorkspaceReadyResolvers = new Set();
let activeProjectRoot = null;
const patchTransactions = [];
const activeChatStreams = new Map();
let activeImageGenerationController = null;
const terminalTasks = new Map();
const browserActionLogs = [];
const browserNetworkLogs = [];
const browserRequestMeta = new Map();
let browserSnapshot = createBrowserSnapshot();
let browserSessionObserversInstalled = false;

function createBrowserSnapshot() {
  return {
    currentUrl: BROWSER_START_URL,
    title: "Browser Workspace",
    canGoBack: false,
    canGoForward: false,
    isLoading: false,
    startedAt: new Date().toISOString(),
  };
}

function serializeBrowserSnapshot() {
  return { ...browserSnapshot };
}

function updateBrowserSnapshot(patch = {}) {
  browserSnapshot = {
    ...browserSnapshot,
    ...patch,
  };
  return serializeBrowserSnapshot();
}

function sendBrowserEventToRenderer(channel, payload) {
  const targets = [mainWindow, browserWorkspaceWindow];
  for (const target of targets) {
    if (!target || target.isDestroyed()) continue;
    target.webContents?.send(channel, payload);
  }
}

function shouldRedactBrowserTraceKey(key) {
  return /(authorization|cookie|set-cookie|token|secret|password|passwd|pwd|credential|session|csrf|xsrf|api[-_]?key|验证码|密码)/i.test(String(key || ""));
}

function redactBrowserTraceValue(value, key = "") {
  if (value == null) return value;
  if (shouldRedactBrowserTraceKey(key)) return "[redacted]";
  if (Array.isArray(value)) return value.map((item) => redactBrowserTraceValue(item, key));
  if (typeof value === "object") {
    const output = {};
    for (const [entryKey, entryValue] of Object.entries(value)) {
      output[entryKey] = redactBrowserTraceValue(entryValue, entryKey);
    }
    return output;
  }
  const text = String(value);
  if (shouldRedactBrowserTraceKey(text)) return "[redacted]";
  return text.length > 4000 ? `${text.slice(0, 4000)}...[truncated]` : value;
}

function sanitizeBrowserTraceRecord(record) {
  return redactBrowserTraceValue(record);
}

async function appendBrowserTraceRecord(kind, payload) {
  if (!browserTraceFile) return;
  const record = sanitizeBrowserTraceRecord({
    kind,
    createdAt: new Date().toISOString(),
    payload,
  });
  try {
    await fs.appendFile(browserTraceFile, `${JSON.stringify(record)}\n`, "utf8");
  } catch (error) {
    logError("browser:trace:appendFailed", {
      message: error instanceof Error ? error.message : String(error),
    });
  }
}

async function ensureBrowserTraceFile() {
  if (browserTraceFile) {
    return browserTraceFile;
  }
  const tracePath = await createBrowserTraceFile();
  const replayRecords = [
    ...browserActionLogs.map((payload) => ({ kind: "action", createdAt: payload.createdAt, payload })),
    ...browserNetworkLogs.map((payload) => ({ kind: "network", createdAt: payload.createdAt, payload })),
  ].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  if (replayRecords.length) {
    const content = replayRecords
      .map((record) => JSON.stringify(sanitizeBrowserTraceRecord(record)))
      .join("\n");
    await fs.appendFile(tracePath, `${content}\n`, "utf8");
  }
  return tracePath;
}

async function readBrowserTracePreview({ createIfMissing = false } = {}) {
  if (!browserTraceFile && createIfMissing) {
    await ensureBrowserTraceFile();
  }
  if (!browserTraceFile) {
    return { path: "", preview: "" };
  }
  try {
    const stat = await fs.stat(browserTraceFile);
    const handle = await fs.open(browserTraceFile, "r");
    try {
      const size = Math.min(stat.size, BROWSER_TRACE_PREVIEW_BYTES);
      const buffer = Buffer.alloc(size);
      await handle.read(buffer, 0, size, Math.max(0, stat.size - size));
      return {
        path: browserTraceFile,
        preview: buffer.toString("utf8"),
      };
    } finally {
      await handle.close();
    }
  } catch {
    return { path: browserTraceFile, preview: "" };
  }
}

async function deleteBrowserTraceFile() {
  const tracePath = browserTraceFile;
  browserTraceFile = null;
  if (!tracePath) return;
  try {
    await fs.rm(tracePath, { force: true });
  } catch {
    // Temporary trace cleanup is best-effort.
  }
}

async function createBrowserTraceFile() {
  await deleteBrowserTraceFile();
  const traceDir = path.join(os.tmpdir(), "novayxk-browser-traces");
  await fs.mkdir(traceDir, { recursive: true });
  browserTraceFile = path.join(traceDir, `browser-trace-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.jsonl`);
  await fs.writeFile(
    browserTraceFile,
    `${JSON.stringify({
      kind: "session-start",
      createdAt: new Date().toISOString(),
      payload: {
        startUrl: browserSnapshot.currentUrl,
      },
    })}\n`,
    "utf8",
  );
  return browserTraceFile;
}

function pushBrowserActionLog(record) {
  browserActionLogs.unshift(record);
  if (browserActionLogs.length > MAX_BROWSER_ACTION_LOGS) {
    browserActionLogs.length = MAX_BROWSER_ACTION_LOGS;
  }
  void appendBrowserTraceRecord("action", record);
  sendBrowserEventToRenderer("browser:actionEvent", record);
}

function pushBrowserNetworkLog(record) {
  const existing = browserNetworkLogs.find((item) => item.id === record.id);
  const mergedRecord = existing ? { ...existing, ...record } : record;
  const index = browserNetworkLogs.findIndex((item) => item.id === record.id);
  if (index >= 0) {
    browserNetworkLogs.splice(index, 1);
  }
  browserNetworkLogs.unshift(mergedRecord);
  if (browserNetworkLogs.length > MAX_BROWSER_NETWORK_LOGS) {
    browserNetworkLogs.length = MAX_BROWSER_NETWORK_LOGS;
  }
  void appendBrowserTraceRecord("network", mergedRecord);
  sendBrowserEventToRenderer("browser:networkEvent", mergedRecord);
}

function emitBrowserPageEvent(type) {
  const payload = {
    type,
    snapshot: serializeBrowserSnapshot(),
  };
  void appendBrowserTraceRecord("page", payload);
  sendBrowserEventToRenderer("browser:pageEvent", payload);
}

function normalizeBrowserUrl(input) {
  const trimmed = String(input ?? "").trim();
  if (!trimmed) return BROWSER_START_URL;
  if (/^(?:https?|file|about):/i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/+/, "")}`;
}

function getMainWebContents() {
  if (!mainWindow || mainWindow.isDestroyed()) throw new Error("The main window is unavailable.");
  return mainWindow.webContents;
}

function handleBrowserNavigate(targetUrl) {
  const nextUrl = normalizeBrowserUrl(targetUrl);
  updateBrowserSnapshot({
    currentUrl: nextUrl,
    isLoading: true,
  });
  void appendBrowserTraceRecord("command", {
    type: "navigate",
    url: nextUrl,
  });
  emitBrowserPageEvent("did-start-loading");
  return serializeBrowserSnapshot();
}

function isInsideDirectory(parentDir, targetPath) {
  const relative = path.relative(path.resolve(parentDir), path.resolve(targetPath));
  return Boolean(relative) && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function assertGeneratedImageFile(imagePath) {
  const targetPath = path.resolve(String(imagePath || ""));
  if (!isInsideDirectory(GENERATED_IMAGES_DIR, targetPath)) {
    throw new Error("Invalid image path.");
  }
  return targetPath;
}

function sanitizeGeneratedImageFileName(fileName) {
  const normalized = String(fileName || "")
    .replace(/[<>:"|?*\u0000-\u001f]/g, "-")
    .replace(/[\\/]+/g, "/")
    .split("/")
    .filter(Boolean)
    .join("/");
  return normalized.replace(/^\.+/, "").trim();
}

function buildDefaultGeneratedImageProjectPath(imagePath) {
  const extension = path.extname(imagePath) || ".png";
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  return `generated-image-${stamp}${extension}`;
}

async function ensureUniqueProjectImagePath(relativePath) {
  const targetPath = assertProjectFile(relativePath);
  try {
    await fs.access(targetPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return relativePath;
    }
    throw error;
  }

  const extension = path.extname(relativePath);
  const baseName = extension ? relativePath.slice(0, -extension.length) : relativePath;
  for (let index = 2; index < 10_000; index += 1) {
    const nextRelativePath = `${baseName}-${index}${extension}`;
    try {
      await fs.access(assertProjectFile(nextRelativePath));
    } catch (error) {
      if (error?.code === "ENOENT") {
        return nextRelativePath;
      }
      throw error;
    }
  }
  throw new Error("Too many image filename conflicts. Please specify a filename manually.");
}

function resolveGeneratedImageProtocolPath(requestUrl) {
  const parsed = new URL(requestUrl);
  const rawRelative = decodeURIComponent(`${parsed.hostname}${parsed.pathname}`).replace(/^\/+/, "");
  if (!rawRelative) {
    throw new Error("Invalid image URL.");
  }
  const targetPath = path.resolve(GENERATED_IMAGES_DIR, rawRelative);
  if (!isInsideDirectory(GENERATED_IMAGES_DIR, targetPath)) {
    throw new Error("The image URL is outside the allowed range.");
  }
  return targetPath;
}

function buildGeneratedImageUrl(imagePath) {
  const relativePath = path.relative(GENERATED_IMAGES_DIR, imagePath)
    .split(path.sep)
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `novayxk-image://${relativePath}`;
}

function resolveProjectProtocolPath(requestUrl) {
  const parsed = new URL(requestUrl);
  const rawRelative = decodeURIComponent(`${parsed.hostname}${parsed.pathname}`).replace(/^\/+/, "");
  if (!rawRelative) {
    throw new Error("Invalid project file URL.");
  }
  return assertProjectFile(rawRelative);
}

function buildProjectFileUrl(relativePath) {
  const encodedPath = String(relativePath || "")
    .split(/[\\/]+/)
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `novayxk-project://${encodedPath}`;
}

function getProjectFileMimeType(relativePath) {
  const extension = path.extname(String(relativePath || "")).toLowerCase();
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".webp") return "image/webp";
  if (extension === ".gif") return "image/gif";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".bmp") return "image/bmp";
  return "image/png";
}

function registerGeneratedImageProtocol() {
  protocol.handle("novayxk-image", (request) => {
    const targetPath = resolveGeneratedImageProtocolPath(request.url);
    return net.fetch(pathToFileURL(targetPath).toString());
  });
}

function registerProjectFileProtocol() {
  protocol.handle("novayxk-project", (request) => {
    const targetPath = resolveProjectProtocolPath(request.url);
    return net.fetch(pathToFileURL(targetPath).toString());
  });
}

function parseImageDataUrl(value) {
  const match = String(value || "").match(/^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i);
  if (!match) return null;
  return {
    mimeType: match[1].toLowerCase(),
    base64: match[2],
  };
}

function sniffImageMimeType(buffer, fallback = "image/png") {
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  if (buffer.length >= 6 && /^GIF8[79]a$/.test(buffer.subarray(0, 6).toString("ascii"))) {
    return "image/gif";
  }
  return fallback;
}

function getImageExtension(mimeType) {
  if (/jpe?g/i.test(mimeType)) return "jpg";
  if (/webp/i.test(mimeType)) return "webp";
  if (/gif/i.test(mimeType)) return "gif";
  return "png";
}

async function downloadGeneratedImageUrl(url, timeoutMs = IMAGE_GENERATION_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await requestBuffer(url, {
      method: "GET",
      signal: controller.signal,
      maxBytes: MAX_GENERATED_IMAGE_BYTES + 1,
    });
    if (!response.ok) {
      throw new Error(`Failed to download the generated image: ${response.status}`);
    }
    return {
      buffer: response.body,
      mimeType: sniffImageMimeType(response.body, getHeaderValue(response.headers, "content-type") || "image/png"),
    };
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error("Timed out while downloading the generated image. Check the network connection or provider status.");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function readGeneratedImageBytes(item, options = {}) {
  const base64Source = typeof item?.b64_json === "string"
    ? { mimeType: String(item?.mime_type || "image/png"), base64: item.b64_json }
    : parseImageDataUrl(item?.image ?? item?.data ?? "");
  if (base64Source?.base64) {
    const buffer = Buffer.from(base64Source.base64, "base64");
    return {
      buffer,
      mimeType: sniffImageMimeType(buffer, base64Source.mimeType || "image/png"),
    };
  }

  if (typeof item?.url === "string" && item.url.trim()) {
    return downloadGeneratedImageUrl(item.url, options.timeoutMs ?? IMAGE_GENERATION_TIMEOUT_MS);
  }

  throw new Error("The image generation result is missing b64_json or url.");
}

async function saveGeneratedImageItem(item, prompt, index, options = {}) {
  const { buffer, mimeType } = await readGeneratedImageBytes(item, options);
  if (!buffer.length) throw new Error("The image generation result is empty.");
  if (buffer.length > MAX_GENERATED_IMAGE_BYTES) {
    throw new Error("The generated image is too large and was not saved.");
  }

  await fs.mkdir(GENERATED_IMAGES_DIR, { recursive: true });
  const extension = getImageExtension(mimeType);
  const fileName = `image-${Date.now()}-${index + 1}-${crypto.randomBytes(4).toString("hex")}.${extension}`;
  const imagePath = path.join(GENERATED_IMAGES_DIR, fileName);
  await fs.writeFile(imagePath, buffer);
  return {
    type: "image",
    path: imagePath,
    url: buildGeneratedImageUrl(imagePath),
    mimeType,
    prompt: String(prompt || "").slice(0, 4000),
    revisedPrompt: String(item?.revised_prompt || item?.revisedPrompt || "").slice(0, 4000),
    createdAt: new Date().toISOString(),
  };
}

function installBrowserSessionObservers() {
  if (browserSessionObserversInstalled) return;
  browserSessionObserversInstalled = true;
  const browserSession = session.fromPartition(BROWSER_PARTITION);

  browserSession.webRequest.onBeforeRequest((details, callback) => {
    browserRequestMeta.set(details.id, {
      startedAt: Date.now(),
      method: details.method,
      url: details.url,
      resourceType: details.resourceType,
    });
    pushBrowserNetworkLog({
      id: String(details.id),
      url: details.url,
      method: details.method,
      stage: "request",
      resourceType: details.resourceType,
      source: "webRequest",
      createdAt: new Date().toISOString(),
    });
    callback({});
  });

  browserSession.webRequest.onCompleted((details) => {
    const meta = browserRequestMeta.get(details.id);
    pushBrowserNetworkLog({
      id: String(details.id),
      url: details.url,
      method: details.method,
      stage: "response",
      statusCode: details.statusCode,
      resourceType: details.resourceType,
      durationMs: meta ? Math.max(0, Date.now() - meta.startedAt) : undefined,
      source: "webRequest",
      createdAt: new Date().toISOString(),
    });
    browserRequestMeta.delete(details.id);
  });

  browserSession.webRequest.onErrorOccurred((details) => {
    const meta = browserRequestMeta.get(details.id);
    pushBrowserNetworkLog({
      id: String(details.id),
      url: details.url,
      method: details.method,
      stage: "error",
      resourceType: details.resourceType,
      durationMs: meta ? Math.max(0, Date.now() - meta.startedAt) : undefined,
      errorText: details.error,
      source: "webRequest",
      createdAt: new Date().toISOString(),
    });
    browserRequestMeta.delete(details.id);
  });
}

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
  getDefaultLanguage: detectSystemLanguage,
});
const memoryService = createMemoryService({
  projectsDir: PROJECTS_DIR,
  getActiveProjectRoot: () => activeProjectRoot,
});
const { readProjectMemoryState, writeProjectMemory, saveTaskHistory, loadTaskHistory } = memoryService;
const { listProviderModels, requestImageGeneration, requestChatCompletion, requestChatCompletionStream, extractModelText } = createAiService({
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
const webSearchService = createWebSearchService({
  logApp,
  logError,
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
      webviewTag: true,
    },
  });
  mainWindow.setMenu(null);
  installBrowserSessionObservers();

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

function loadRendererTarget(targetWindow, options = {}) {
  if (!targetWindow || targetWindow.isDestroyed()) return;
  const browserWorkspaceQuery = options.browserWorkspace ? "?novayxk-browser-window=1" : "";
  if (isDev) {
    targetWindow.loadURL(`http://127.0.0.1:5173/${browserWorkspaceQuery}`);
    return;
  }
  targetWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"), {
    query: options.browserWorkspace ? { "novayxk-browser-window": "1" } : {},
  });
}

function createBrowserWorkspaceWindow(options = {}) {
  const shouldFocus = options.focus !== false;
  if (browserWorkspaceWindow && !browserWorkspaceWindow.isDestroyed()) {
    if (shouldFocus) {
      if (browserWorkspaceWindow.isMinimized()) browserWorkspaceWindow.restore();
      browserWorkspaceWindow.show();
      browserWorkspaceWindow.focus();
    }
    void ensureBrowserTraceFile().catch((error) => {
      logError("browser:trace:ensureFailed", {
        message: error instanceof Error ? error.message : String(error),
      });
    });
    return browserWorkspaceWindow;
  }

  browserWorkspaceWindow = new BrowserWindow({
    width: 1380,
    height: 920,
    minWidth: 1080,
    minHeight: 720,
    backgroundColor: "#f6f2ea",
    title: "Novayxk Browser Workspace",
    icon: ICON_PATH,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
      additionalArguments: ["--novayxk-browser-window=1"],
    },
  });
  browserWorkspaceWindow.setMenu(null);
  browserWorkspaceWindow.maximize();
  installBrowserSessionObservers();
  browserWorkspaceReady = false;
  void createBrowserTraceFile().catch((error) => {
    logError("browser:trace:createFailed", {
      message: error instanceof Error ? error.message : String(error),
    });
  });
  browserWorkspaceWindow.webContents.on("did-start-loading", () => {
    browserWorkspaceReady = false;
  });
  loadRendererTarget(browserWorkspaceWindow, { browserWorkspace: true });
  browserWorkspaceWindow.on("closed", () => {
    browserWorkspaceWindow = null;
    browserWorkspaceReady = false;
    void deleteBrowserTraceFile();
  });
  return browserWorkspaceWindow;
}

function markBrowserWorkspaceReady() {
  browserWorkspaceReady = true;
  const resolvers = [...browserWorkspaceReadyResolvers];
  browserWorkspaceReadyResolvers.clear();
  for (const resolve of resolvers) {
    resolve();
  }
}

function waitForBrowserWorkspaceReady(targetWindow, timeoutMs = BROWSER_WORKSPACE_COMMAND_TIMEOUT_MS) {
  if (!targetWindow || targetWindow.isDestroyed()) {
    return Promise.reject(new Error("The browser workspace window is unavailable."));
  }
  if (browserWorkspaceReady) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out while starting the browser workspace window."));
    }, timeoutMs);
    const cleanup = () => {
      clearTimeout(timeout);
      targetWindow.webContents.removeListener("did-fail-load", onFailed);
      targetWindow.removeListener("closed", onClosed);
      browserWorkspaceReadyResolvers.delete(onReady);
    };
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onFailed = (_event, _errorCode, errorDescription) => {
      cleanup();
      reject(new Error(errorDescription || "Failed to load the browser workspace window."));
    };
    const onClosed = () => {
      cleanup();
      reject(new Error("The browser workspace window was closed."));
    };
    browserWorkspaceReadyResolvers.add(onReady);
    targetWindow.webContents.once("did-fail-load", onFailed);
    targetWindow.once("closed", onClosed);
  });
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
    registerGeneratedImageProtocol();
    registerProjectFileProtocol();
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
  emitUninstallProgress(event.sender, 6, "Checking install directory", installDir);
  if (!(await pathExists(path.join(installDir, APP_EXE)))) {
    throw new Error(`${APP_EXE} was not found here: ${installDir}`);
  }

  emitUninstallProgress(event.sender, 22, "Closing running Novayxk processes", "Releasing files that are still in use");
  await closeRunningInstalledApp();
  emitUninstallProgress(event.sender, 48, "Removing shortcuts", "Desktop and Start menu entries");
  await removeShellArtifacts();
  emitUninstallProgress(event.sender, 72, "Cleaning uninstall entry", "Windows Apps & Features");
  await removeUninstallRegistry();

  setPendingUninstallCleanup({
    installDir,
    deleteUserData: request?.deleteUserData === true,
  });
  emitUninstallProgress(
    event.sender,
    100,
    "Uninstall is ready",
    request?.deleteUserData === true
      ? "After you click Finish, the install directory and .novayxk data will continue to be removed in the background."
      : "After you click Finish, the install directory will continue to be removed in the background and .novayxk data will be kept.",
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
  if (!activeProjectRoot) throw new Error("Please open a project first.");
  return activeProjectRoot;
}

function getSystemCommandCwd() {
  const homeDir = os.homedir();
  if (homeDir && fsSync.existsSync(homeDir)) return homeDir;
  return os.tmpdir();
}

function startTerminalTask(command, options = {}) {
  const normalized = String(command ?? "").trim();
  if (!normalized) throw new Error("The command is empty.");
  if (normalized.length > MAX_FULL_COMMAND_LENGTH) throw new Error(`The command is too long. Keep it within ${MAX_FULL_COMMAND_LENGTH} characters.`);
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
      ? `${serializedTask.output.slice(-18000)}\n\nThe command is still running as a terminal task and has not finished yet. Future output will continue to appear in the bottom Terminal Tasks panel.`.trim()
      : serializedTask.output.slice(-20000);
    return {
      code: stillRunning ? null : serializedTask.code ?? 1,
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
  if (!task) throw new Error("The terminal task does not exist.");
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
  if (!task) throw new Error("The terminal task does not exist.");
  if (!task.child || task.status !== "running") throw new Error("The terminal task is not running, so input cannot be sent.");
  if (!task.child.stdin || task.child.stdin.destroyed || !task.child.stdin.writable) {
    throw new Error("The current terminal task is not accepting input.");
  }
  const rawInput = String(input ?? "");
  if (!rawInput.trim()) throw new Error("Please enter the content to send to the terminal task.");
  if (rawInput.length > 2000) throw new Error("A single terminal input cannot exceed 2000 characters.");
  const line = rawInput.endsWith("\n") || rawInput.endsWith("\r") ? rawInput : `${rawInput}${os.EOL}`;
  task.child.stdin.write(line, "utf8");
  task.needsInput = false;
  task.userIntervened = true;
  task.inputCount = (task.inputCount ?? 0) + 1;
  task.lastInputAt = new Date().toISOString();
  task.output = trimTerminalOutput(`${task.output}\n[Novayxk note: the user intervened and sent one line of input to the current terminal task]\n`);
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
  if (!task) throw new Error("The terminal task does not exist.");
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
  return String(command ?? "").replace(/\s+/g, " ").trim().slice(0, 48) || "PowerShell task";
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
    `The command has started as a terminal task: ${task.title}`,
    `Task ID: ${task.id}`,
    `Working directory: ${task.cwd}`,
    'Output will appear live in the bottom "Terminal Tasks" panel.',
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
    title: "Choose a code project",
  });

  if (result.canceled || !result.filePaths[0]) return null;
  return openProjectRoot(result.filePaths[0]);
});

ipcMain.handle("project:openPath", async (_event, projectRoot) => {
  return openProjectRoot(projectRoot);
});

ipcMain.handle("project:refresh", async () => {
  if (!activeProjectRoot) throw new Error("Please open a project first.");
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
  if (stat.size > 160_000) throw new Error("The file is too large. Please choose a smaller file.");
  return {
    path: relativePath,
    content: await fs.readFile(fullPath, "utf8"),
  };
});

ipcMain.handle("project:getFileAsset", async (_event, relativePath) => {
  const fullPath = assertProjectFile(relativePath);
  const stat = await fs.stat(fullPath);
  if (!stat.isFile()) throw new Error("The current selection is not a file.");
  return {
    kind: "image",
    path: relativePath,
    url: buildProjectFileUrl(relativePath),
    mimeType: getProjectFileMimeType(relativePath),
    size: stat.size,
  };
});

ipcMain.handle("project:saveFile", async (_event, request) => {
  const relativePath = request?.relativePath;
  const content = request?.content;
  if (typeof content !== "string") throw new Error("Invalid file content.");
  if (content.length > 400_000) throw new Error("The file content is too long. Please split it into a smaller file.");
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
  if (!activeProjectRoot) throw new Error("Please open a project first.");
  if (!patchText || patchText.length > 400_000) throw new Error("The patch is empty or too large.");

  const files = parseUnifiedPatch(patchText);
  if (!files.length) throw new Error("No applicable unified diff was recognized.");

  const backups = [];
  for (const file of files) {
    const fullPath = assertProjectFile(file.path);
    const existingStat = await statIfExists(fullPath);
    if (file.isCreate && existingStat) throw new Error(`The file to be created by the patch already exists: ${file.path}`);
    if (!file.isCreate && !existingStat) throw new Error(`The patch target file does not exist: ${file.path}`);
    if (file.isDelete && existingStat?.isDirectory()) throw new Error(`The patch cannot delete a directory: ${file.path}`);

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
  if (!activeProjectRoot) throw new Error("Please open a project first.");
  if (!Array.isArray(operations) || operations.length === 0) throw new Error("There are no file operations to execute.");
  if (operations.length > 30) throw new Error("There are too many file operations. Please split them into smaller steps.");

  const changedFiles = [];
  for (const operation of operations) {
    if (!operation || typeof operation !== "object") throw new Error("Invalid file operation format.");
    if (operation.type !== "mkdir" && operation.type !== "write" && operation.type !== "replace" && operation.type !== "delete") {
      throw new Error(`Unsupported file operation: ${operation.type}`);
    }
    if (!operation.path || typeof operation.path !== "string") throw new Error("The file operation is missing a path.");

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
          throw new Error(`The path to delete does not exist: ${operation.path}`);
        }
        throw error;
      }
      changedFiles.push(operation.path);
      continue;
    }

    if (operation.type === "replace") {
      if (typeof operation.search !== "string" || !operation.search) throw new Error(`The replace operation is missing search: ${operation.path}`);
      if (typeof operation.replace !== "string") throw new Error(`The replace operation is missing replace: ${operation.path}`);
      if (operation.search.length > 50_000 || operation.replace.length > 50_000) {
        throw new Error(`The replace content is too long: ${operation.path}`);
      }
      const original = await fs.readFile(targetPath, "utf8").catch((error) => {
        if (error.code === "ENOENT") throw new Error(`The file to replace does not exist: ${operation.path}`);
        throw error;
      });
      if (!original.includes(operation.search)) {
        throw new Error(`The original text to replace was not found in the file: ${operation.path}`);
      }
      const nextContent =
        operation.occurrence === "all"
          ? original.split(operation.search).join(operation.replace)
          : original.replace(operation.search, operation.replace);
      await fs.writeFile(targetPath, nextContent, "utf8");
      changedFiles.push(operation.path);
      continue;
    }

    if (typeof operation.content !== "string") throw new Error(`The write operation is missing content: ${operation.path}`);
    if (operation.content.length > 400_000) throw new Error(`The file content is too long: ${operation.path}`);

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    try {
      await fs.writeFile(targetPath, operation.content, {
        encoding: "utf8",
        flag: operation.overwrite ? "w" : "wx",
      });
    } catch (error) {
      if (error.code === "EEXIST") {
        throw new Error(`The file already exists. To overwrite it, set overwrite: true in fileops: ${operation.path}`);
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
      searchBytes: typeof operation.search === "string" ? Buffer.byteLength(operation.search, "utf8") : 0,
      replaceBytes: typeof operation.replace === "string" ? Buffer.byteLength(operation.replace, "utf8") : 0,
    })),
    changedFiles,
  });
  return { changedFiles };
});

ipcMain.handle("project:undoLastPatch", async () => {
  if (!activeProjectRoot) throw new Error("Please open a project first.");
  const transaction = patchTransactions.pop();
  if (!transaction) throw new Error("There is no patch available to undo.");

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
  if (!activeProjectRoot) throw new Error("Please open a project first.");
  const inspection = inspectCommand(command);
  if (!inspection.allowed) {
    logApp("command:blocked", {
      projectRoot: activeProjectRoot,
      reason: inspection.reason,
      commandPreview: String(command).slice(0, 500),
      controlMode: "safe",
    }, "warn");
    throw new Error(`The command was blocked: ${inspection.reason}`);
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
        reason: "The special system action was confirmed by the user.",
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
    const error = new Error(`The command was blocked: ${inspection.reason}`);
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
    ? { allowed: true, reason: "The special system action was confirmed by the user." }
    : inspectCommandForMode(command, mode);
  if (!inspection.allowed) {
    const error = new Error(`The command was blocked: ${inspection.reason}`);
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
  if (!activeProjectRoot) throw new Error("Please open a project first.");
  return readProjectMemoryState();
});

ipcMain.handle("memory:saveProjectMemory", async (_event, memory) => {
  if (!activeProjectRoot) throw new Error("Please open a project first.");
  return writeProjectMemory(memory);
});

ipcMain.handle("memory:saveTask", async (_event, taskInput) => {
  if (!activeProjectRoot) throw new Error("Please open a project first.");
  return saveTaskHistory(taskInput);
});

ipcMain.handle("memory:loadTask", async (_event, taskId) => {
  if (!activeProjectRoot) throw new Error("Please open a project first.");
  return loadTaskHistory(taskId);
});

ipcMain.on("config:getInitialSync", (event) => {
  try {
    event.returnValue = {
      ...readConfigSync(),
      appVersion: app.getVersion(),
    };
  } catch {
    event.returnValue = {
      appVersion: app.getVersion(),
    };
  }
});
ipcMain.handle("config:get", readConfig);
ipcMain.handle("config:save", async (_event, config) => writeConfig(config));
ipcMain.handle("web:search", async (_event, request) => webSearchService.search(request));

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
  if (provider?.apiMode === "imageGenerations") {
    const models = await listProviderModels(provider);
    const selectedModel = String(provider?.model || "").trim();
    const modelNote = selectedModel && !models.includes(selectedModel)
      ? `, but the current model ${selectedModel} does not appear in the model list`
      : "";
    return {
      ok: true,
      message: `Image endpoint connected successfully: loaded ${models.length} model(s)${modelNote}.`,
    };
  }

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
    message: content ? `Connection successful: ${content}` : "Connection successful.",
  };
});

ipcMain.handle("ai:generateImage", async (_event, request) => {
  const provider = request?.provider;
  const prompt = String(request?.prompt || "").trim();
  const size = typeof request?.size === "string" ? request.size : "1024x1024";
  const n = Number.isFinite(request?.n) ? request.n : 1;
  const controller = new AbortController();
  activeImageGenerationController = controller;
  logBehavior("ai:image:request", {
    providerName: provider?.name,
    model: provider?.model,
    prompt,
    size,
    n,
  });
  try {
    const data = await requestImageGeneration(provider, prompt, {
      size,
      n,
      timeoutMs: IMAGE_GENERATION_TIMEOUT_MS,
      controller,
      abortMessage: IMAGE_GENERATION_ABORT_MESSAGE,
    });
    const images = [];
    for (const [index, item] of data.data.entries()) {
      images.push(await saveGeneratedImageItem(item, prompt, index, { timeoutMs: IMAGE_GENERATION_TIMEOUT_MS }));
    }
    logBehavior("ai:image:result", {
      providerName: provider?.name,
      model: provider?.model,
      imageCount: images.length,
      imagePaths: images.map((image) => image.path),
    });
    return {
      ok: true,
      images,
      message: `Image generation complete: ${images.length} image(s)`,
    };
  } finally {
    if (activeImageGenerationController === controller) {
      activeImageGenerationController = null;
    }
  }
});

ipcMain.handle("ai:imageCancel", async () => {
  if (!activeImageGenerationController) return { ok: false };
  activeImageGenerationController.abort();
  return { ok: true };
});

ipcMain.handle("ai:openGeneratedImage", async (_event, imagePath) => {
  const targetPath = assertGeneratedImageFile(imagePath);
  const result = await shell.openPath(targetPath);
  if (result) throw new Error(result);
  return { ok: true };
});

ipcMain.handle("ai:copyGeneratedImage", async (_event, imagePath) => {
  const targetPath = assertGeneratedImageFile(imagePath);
  let image = nativeImage.createFromPath(targetPath);
  if (image.isEmpty()) {
    image = nativeImage.createFromBuffer(await fs.readFile(targetPath));
  }
  if (image.isEmpty()) {
    throw new Error("This image could not be copied.");
  }
  clipboard.clear();
  clipboard.write({
    image,
    text: targetPath,
  });
  clipboard.writeBuffer("PNG", image.toPNG());
  return { ok: true };
});

ipcMain.handle("ai:saveGeneratedImageToProject", async (_event, request) => {
  if (!activeProjectRoot) throw new Error("Please open a project first.");
  const sourcePath = assertGeneratedImageFile(request?.imagePath);
  const requestedPath = sanitizeGeneratedImageFileName(request?.targetPath || "");
  const relativePath = requestedPath
    ? requestedPath
    : await ensureUniqueProjectImagePath(buildDefaultGeneratedImageProjectPath(sourcePath));
  if (requestedPath) {
    const explicitTarget = assertProjectFile(relativePath);
    try {
      await fs.access(explicitTarget);
      throw new Error(`The target file already exists: ${relativePath}`);
    } catch (error) {
      if (error?.message?.startsWith("The target file already exists")) throw error;
      if (error?.code !== "ENOENT") throw error;
    }
  }
  const targetPath = assertProjectFile(relativePath);
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.copyFile(sourcePath, targetPath);
  logApp("ai:image:savedToProject", {
    projectRoot: activeProjectRoot,
    sourcePath,
    targetPath,
    relativePath,
  });
  return {
    ok: true,
    path: targetPath,
    relativePath,
  };
});

ipcMain.handle("ai:listProviderModels", async (_event, provider) => {
  const models = await listProviderModels(provider);
  return {
    ok: true,
    models,
    message: `Loaded ${models.length} model(s)`,
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
        abortMessage: "The current generation was stopped by the user.",
      },
    );
    event.sender.send("ai:chatStream:done", requestId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Model request failed.";
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

ipcMain.handle("app:openBrowserWorkspaceWindow", async () => {
  createBrowserWorkspaceWindow({ focus: true });
  return { ok: true };
});

ipcMain.on("browser:workspaceReady", (event) => {
  if (browserWorkspaceWindow && !browserWorkspaceWindow.isDestroyed() && event.sender === browserWorkspaceWindow.webContents) {
    markBrowserWorkspaceReady();
  }
});

ipcMain.on("browser:workspaceCommand", async (event, requestId, request) => {
  const shouldFocusBrowser = request?.type !== "prompt-context" && request?.focus !== false;
  const targetWindow = browserWorkspaceWindow && !browserWorkspaceWindow.isDestroyed()
    ? createBrowserWorkspaceWindow({ focus: shouldFocusBrowser })
    : shouldFocusBrowser
      ? createBrowserWorkspaceWindow({ focus: true })
      : null;
  const replyToSender = (payload) => {
    if (!event.sender.isDestroyed()) {
      event.sender.send("browser:workspaceCommand:reply", requestId, payload);
    }
  };

  if (!targetWindow || targetWindow.isDestroyed()) {
    if (request?.type === "prompt-context") {
      readBrowserTracePreview({ createIfMissing: browserActionLogs.length > 0 || browserNetworkLogs.length > 0 })
        .then((trace) => {
          replyToSender({
            ok: true,
            result: {
              snapshot: serializeBrowserSnapshot(),
              trace,
            },
          });
        })
        .catch((error) => {
          replyToSender({
            ok: false,
            error: error instanceof Error ? error.message : "Failed to read the browser trace.",
          });
        });
      return;
    }
    replyToSender({
      ok: false,
      error: "The browser workspace window is unavailable.",
    });
    return;
  }

  const responseChannel = `browser:workspaceCommand:reply:${requestId}`;
  let timeout = null;
  const cleanup = () => {
    if (timeout) clearTimeout(timeout);
    ipcMain.removeAllListeners(responseChannel);
  };

  ipcMain.once(responseChannel, (_replyEvent, payload) => {
    cleanup();
    replyToSender(payload);
  });

  timeout = setTimeout(() => {
    cleanup();
    replyToSender({
      ok: false,
      error: "The browser workspace command timed out.",
    });
  }, BROWSER_WORKSPACE_COMMAND_TIMEOUT_MS);

  try {
    await waitForBrowserWorkspaceReady(targetWindow);
    if (targetWindow.isDestroyed()) {
      throw new Error("The browser workspace window was closed.");
    }
    targetWindow.webContents.send("browser:workspaceCommand:execute", requestId, request);
  } catch (error) {
    cleanup();
    replyToSender({
      ok: false,
      error: error instanceof Error ? error.message : "Browser workspace command failed.",
    });
  }
});

ipcMain.on("browser:workspaceCommand:reply", (_event, requestId, payload) => {
  ipcMain.emit(`browser:workspaceCommand:reply:${requestId}`, null, payload);
});

ipcMain.handle("browser:getSnapshot", async () => serializeBrowserSnapshot());

ipcMain.handle("browser:navigate", async (_event, request) => handleBrowserNavigate(request?.url));

ipcMain.handle("browser:reload", async () => {
  updateBrowserSnapshot({ isLoading: true });
  emitBrowserPageEvent("did-start-loading");
  return serializeBrowserSnapshot();
});

ipcMain.handle("browser:goBack", async () => {
  return serializeBrowserSnapshot();
});

ipcMain.handle("browser:goForward", async () => {
  return serializeBrowserSnapshot();
});

ipcMain.handle("browser:clearLogs", async () => {
  browserActionLogs.length = 0;
  browserNetworkLogs.length = 0;
  browserRequestMeta.clear();
  await createBrowserTraceFile();
  return { ok: true };
});

ipcMain.handle("browser:getActionLog", async () => [...browserActionLogs]);

ipcMain.handle("browser:getNetworkLog", async () => [...browserNetworkLogs]);

ipcMain.handle("browser:getGuestPreloadUrl", async () => BROWSER_GUEST_PRELOAD_URL);

ipcMain.handle("browser:getTrace", async () => readBrowserTracePreview({ createIfMissing: true }));

ipcMain.on("browser:syncSnapshot", (_event, payload) => {
  updateBrowserSnapshot(payload);
});

ipcMain.on("browser:pageEvent", (_event, type, snapshot) => {
  if (snapshot && typeof snapshot === "object") {
    updateBrowserSnapshot(snapshot);
  }
  emitBrowserPageEvent(type || "did-navigate");
});

ipcMain.on("browser:actionObserved", (_event, payload) => {
  if (!payload || typeof payload !== "object") return;
  pushBrowserActionLog(payload);
});

ipcMain.on("browser:networkObserved", (_event, payload) => {
  if (!payload || typeof payload !== "object") return;
  pushBrowserNetworkLog(payload);
});
