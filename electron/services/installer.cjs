const { app } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const os = require("node:os");
const childProcess = require("node:child_process");

const NOVAYXK_HOME = path.join(os.homedir(), ".novayxk");
const APP_EXE = "Novayxk.exe";
const UNINSTALLER_EXE = "Novayxk Uninstaller.exe";
const CLEANUP_EXE = "Novayxk Cleanup.exe";
const APP_REGISTRY_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Novayxk";
const UNINSTALL_CLEANUP_LOG = path.join(os.tmpdir(), "novayxk-uninstall-cleanup.log");

let uninstallTargetArg = "";
let pendingUninstallCleanup = null;
let hasStartedUninstallCleanup = false;
let writeDebugLog = () => {};
let cachedAdminState = null;
let isDev = false;

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
    throw new Error("当前系统不支持 Windows UAC。请在 Windows 桌面版中使用管理员模式。");
  }
  if (isDev) {
    throw new Error("开发模式下不能可靠地切换管理员模式，请先用打包后的桌面版测试。");
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
  try {
    await runExecutable("powershell.exe", [
      "-NoLogo",
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      psScript,
    ]);
  } catch (error) {
    throw formatElevationError(error);
  }
  app.quit();
  return true;
}

function formatElevationError(error) {
  const message = String(error?.message || "");
  if (/operation was canceled by the user|已被用户取消|拒绝访问|cancelled by the user/i.test(message)) {
    return new Error("管理员模式没有启动，因为 Windows UAC 授权被取消了。请重新点击“管理员模式”，并在弹窗里选择“是”。");
  }
  if (/Start-Process/i.test(message) || /runas/i.test(message)) {
    return new Error("管理员模式没有成功启动。请确认当前桌面会话允许弹出 UAC 窗口，然后重试。");
  }
  return error instanceof Error ? error : new Error("管理员模式启动失败。");
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
    path.join(__dirname, "..", "..", "dist-release", "win-unpacked", "resources", "cleanup", CLEANUP_EXE),
    path.join(__dirname, "..", "..", "dist-cleanup", CLEANUP_EXE),
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
    `Novayxk Cleanup-${Date.now()}-${Math.random().toString(16).slice(2, 10)}.exe`,
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

function setPendingUninstallCleanup(value) {
  pendingUninstallCleanup = value;
  hasStartedUninstallCleanup = false;
}

function hasPendingUninstallCleanup() {
  return Boolean(pendingUninstallCleanup);
}

function isUninstallCleanupStarted() {
  return hasStartedUninstallCleanup;
}

function createInstallerService(options = {}) {
  uninstallTargetArg = options.uninstallTargetArg || "";
  writeDebugLog = options.writeDebugLog || writeDebugLog;
  isDev = options.isDev === true;
  return {
    NOVAYXK_HOME,
    getInstallDirForUninstaller,
    getDesktopShortcutPath,
    getStartMenuShortcutPath,
    pathExists,
    removePath,
    runExecutable,
    runExecutableCapture,
    isRunningAsAdmin,
    restartAsAdmin,
    closeRunningInstalledApp,
    removeShellArtifacts,
    removeUninstallRegistry,
    emitUninstallProgress,
    finalizeUninstallCleanup,
    findCleanupHelper,
    launchCleanupHelper,
    setPendingUninstallCleanup,
    hasPendingUninstallCleanup,
    isUninstallCleanupStarted,
  };
}

module.exports = { createInstallerService };
