const { app, ipcMain } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const os = require("node:os");

const NOVAYXK_HOME = path.join(os.homedir(), ".novayxk");
const LOG_DIR = path.join(NOVAYXK_HOME, "logs");
const APP_LOG_FILE = path.join(LOG_DIR, "app.log");
const ERROR_LOG_FILE = path.join(LOG_DIR, "error.log");
const AI_LOG_FILE = path.join(LOG_DIR, "ai.log");
const BEHAVIOR_LOG_FILE = path.join(LOG_DIR, "behavior.log");
const UNINSTALL_CLEANUP_LOG = path.join(os.tmpdir(), "novayxk-uninstall-cleanup.log");
const MAX_LOG_FILE_BYTES = 2 * 1024 * 1024;
const MAX_BEHAVIOR_LOG_FILE_BYTES = 20 * 1024 * 1024;
const DEBUG_LOG_NAME = "novayxk-launch-debug.log";
let debugLogTargetDir = "";

function getDebugLogPaths() {
  const paths = new Set([path.join(os.tmpdir(), DEBUG_LOG_NAME)]);
  try {
    paths.add(path.join(path.dirname(process.execPath), DEBUG_LOG_NAME));
  } catch {
    // Ignore path resolution issues for debug logging.
  }
  if (debugLogTargetDir) {
    try {
      paths.add(path.join(debugLogTargetDir, DEBUG_LOG_NAME));
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

function rotateLogIfNeeded(filePath, maxBytes = MAX_LOG_FILE_BYTES) {
  try {
    const stat = fsSync.statSync(filePath);
    if (stat.size < maxBytes) return;
    const rotatedPath = `${filePath}.1`;
    fsSync.rmSync(rotatedPath, { force: true });
    fsSync.renameSync(filePath, rotatedPath);
  } catch {
    // Missing files and rotation failures should not interrupt the app.
  }
}

function writeStructuredLog(filePath, level, eventName, payload = {}, options = {}) {
  try {
    fsSync.mkdirSync(LOG_DIR, { recursive: true });
    rotateLogIfNeeded(filePath, options.maxBytes ?? MAX_LOG_FILE_BYTES);
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
  logBehavior(`app:${eventName}`, payload, level);
}

function logError(eventName, error, payload = {}) {
  const errorPayload = {
    ...payload,
    error: serializeError(error),
  };
  writeStructuredLog(ERROR_LOG_FILE, "error", eventName, errorPayload);
  logBehavior(`error:${eventName}`, errorPayload, "error");
}

function logAi(eventName, payload = {}, level = "info") {
  writeStructuredLog(AI_LOG_FILE, level, eventName, payload);
  logBehavior(`ai:${eventName}`, payload, level);
}

function logBehavior(eventName, payload = {}, level = "debug") {
  writeStructuredLog(BEHAVIOR_LOG_FILE, level, eventName, payload, {
    maxBytes: MAX_BEHAVIOR_LOG_FILE_BYTES,
  });
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
      logBehavior("ipc:start", {
        channel,
        args: summarizeBehaviorIpcArgs(channel, args),
      });
      try {
        const result = await listener(event, ...args);
        logApp("ipc:ok", {
          channel,
          elapsedMs: Date.now() - startedAt,
        });
        logBehavior("ipc:result", {
          channel,
          elapsedMs: Date.now() - startedAt,
          result: summarizeBehaviorIpcResult(channel, result),
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

function summarizeBehaviorIpcArgs(channel, args) {
  if (channel === "config:save" || channel === "ai:testProvider") return "[REDACTED]";
  return args;
}

function summarizeBehaviorIpcResult(channel, result) {
  if ((typeof channel === "string" && channel.startsWith("config:")) || channel === "ai:chat" || channel === "ai:testProvider") return "[REDACTED]";
  return result;
}

function getLogInfo() {
  return {
    logDir: LOG_DIR,
    appLog: APP_LOG_FILE,
    errorLog: ERROR_LOG_FILE,
    aiLog: AI_LOG_FILE,
    behaviorLog: BEHAVIOR_LOG_FILE,
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

function createLogService(options = {}) {
  debugLogTargetDir = String(options.debugLogTargetDir || "");
  return {
    NOVAYXK_HOME,
    LOG_DIR,
    APP_LOG_FILE,
    ERROR_LOG_FILE,
    AI_LOG_FILE,
    BEHAVIOR_LOG_FILE,
    UNINSTALL_CLEANUP_LOG,
    writeDebugLog,
    logApp,
    logError,
    logAi,
    logBehavior,
    installIpcErrorLogger,
    installProcessErrorLogger,
    getLogInfo,
    readLogTail,
  };
}

module.exports = { createLogService };
