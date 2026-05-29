const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require("electron");
const childProcess = require("node:child_process");
const fs = require("node:fs/promises");
const fsSync = require("node:fs");
const originalFs = require("original-fs");
const path = require("node:path");
const os = require("node:os");

const diskFs = originalFs.promises;
const APP_NAME = "Novayxk";
const PUBLISHER = "Novayxk";
const INSTALL_DIR_NAME = "Novayxk";
const APP_EXE = "Novayxk.exe";
const UNINSTALLER_EXE = "Novayxk Uninstaller.exe";
const CLEANUP_EXE = "Novayxk Cleanup.exe";
const APP_REGISTRY_KEY = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Novayxk";
const APP_USER_DATA_DIR = path.join(os.homedir(), ".novayxk");
const UNINSTALL_CLEANUP_LOG = path.join(os.tmpdir(), "novayxk-uninstall-cleanup.log");
const INSTALLER_PAYLOAD_ARCHIVE = path.join(__dirname, "payload", "novayxk-payload.zip");
const ICON_PATH = app.isPackaged
  ? path.join(process.resourcesPath, "assets", "novayxk.ico")
  : path.join(__dirname, "assets", "novayxk.ico");
const LOGO_PATH = app.isPackaged
  ? path.join(process.resourcesPath, "assets", "novayxk-256.png")
  : path.join(__dirname, "assets", "novayxk-256.png");

let mainWindow;
let installInProgress = false;
let pendingUninstallCleanup = null;
let hasStartedCleanup = false;

const cliArgs = process.argv.slice(1);
const launcherExecutablePath = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
const launcherExecutableDir = process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(launcherExecutablePath);
const executableName = path.basename(launcherExecutablePath).toLowerCase();
const isExecutableUninstaller = executableName.includes("uninstaller");
const isUninstallMode = cliArgs.includes("--uninstall") || isExecutableUninstaller;
const uninstallTargetArg = getArgValue(cliArgs, "--target") || (isExecutableUninstaller ? launcherExecutableDir : "");
const DEBUG_LOG_NAME = "novayxk-launch-debug.log";

app.setName(isUninstallMode ? "Novayxk Uninstaller" : "Novayxk Installer");
app.setAppUserModelId(isUninstallMode ? "com.novayxk.uninstaller" : "com.novayxk.installer");
writeDebugLog("bootstrap", {
  source: "installer-main",
  isUninstallMode,
  launcherExecutablePath,
  launcherExecutableDir,
  processExecPath: process.execPath,
  processArgv: process.argv,
  env: {
    PORTABLE_EXECUTABLE_FILE: process.env.PORTABLE_EXECUTABLE_FILE || "",
    PORTABLE_EXECUTABLE_DIR: process.env.PORTABLE_EXECUTABLE_DIR || "",
  },
});

function createWindow() {
  writeDebugLog("createWindow", {
    source: "installer-main",
    isUninstallMode,
  });
  mainWindow = new BrowserWindow({
    width: 980,
    height: 680,
    minWidth: 900,
    minHeight: 620,
    backgroundColor: "#111418",
    title: isUninstallMode ? "Novayxk Uninstaller" : "Novayxk Installer",
    icon: ICON_PATH,
    frame: false,
    resizable: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "index.html"));
  writeDebugLog("loadFile", {
    source: "installer-main",
    target: "installer/index.html",
  });
  mainWindow.on("close", (event) => {
    if (pendingUninstallCleanup && !hasStartedCleanup) {
      event.preventDefault();
      void launchPendingCleanup().finally(() => {
        mainWindow?.destroy();
      });
    }
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();
});

app.on("window-all-closed", () => {
  app.quit();
});

ipcMain.handle("window:minimize", () => {
  mainWindow?.minimize();
});

ipcMain.handle("window:close", async () => {
  if (installInProgress) return false;
  if (pendingUninstallCleanup && !hasStartedCleanup) {
    await launchPendingCleanup();
  }
  mainWindow?.close();
  return true;
});

ipcMain.handle("installer:getDefaults", async () => {
  const requestedDefaultDir = uninstallTargetArg || process.env.NOVAYXK_INSTALL_DIR || getDefaultInstallDir();
  const defaultInstallDir = isUninstallMode ? path.resolve(requestedDefaultDir) : normalizeInstallDir(requestedDefaultDir);
  writeDebugLog("installer:getDefaults", {
    source: "installer-main",
    uninstallDir: defaultInstallDir,
    mode: isUninstallMode ? "uninstall" : "install",
  });
  return {
    mode: isUninstallMode ? "uninstall" : "install",
    version: app.getVersion(),
    defaultInstallDir,
    userDataDir: APP_USER_DATA_DIR,
    userDataExists: await pathExists(APP_USER_DATA_DIR),
    logoDataUrl: await imageToDataUrl(LOGO_PATH, "image/png"),
  };
});

ipcMain.handle("installer:chooseDirectory", async (_event, currentPath) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: "选择 Novayxk 安装位置",
    defaultPath: currentPath || getDefaultInstallDir(),
    properties: ["openDirectory", "createDirectory"],
  });

  if (result.canceled || !result.filePaths[0]) return null;
  return normalizeInstallDir(result.filePaths[0]);
});

ipcMain.handle("installer:openPath", async (_event, targetPath) => {
  if (!targetPath || typeof targetPath !== "string") return false;
  await shell.openPath(targetPath);
  return true;
});

ipcMain.handle("installer:launchApp", async (_event, installDir) => {
  const exePath = path.join(installDir || getDefaultInstallDir(), APP_EXE);
  childProcess.spawn(exePath, [], {
    cwd: path.dirname(exePath),
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  }).unref();
  return true;
});

ipcMain.handle("installer:finalizeUninstall", async () => {
  if (pendingUninstallCleanup && !hasStartedCleanup) {
    await launchPendingCleanup();
  }
  mainWindow?.close();
  return true;
});

ipcMain.handle("installer:install", async (event, options) => {
  writeDebugLog("installer:install", {
    source: "installer-main",
    installDir: options?.installDir || "",
  });
  if (installInProgress) throw new Error("安装正在进行中。");
  installInProgress = true;

  try {
    const normalized = normalizeInstallOptions(options);
    const payloadDir = await getPayloadDir(event);
    const targetExe = path.join(normalized.installDir, APP_EXE);
    const stagingDir = getStagingInstallDir(normalized.installDir);

    if (!(await pathExists(payloadDir))) {
      throw new Error(`安装资源不存在：${payloadDir}`);
    }

    emitProgress(event, 2, "准备安装目录", normalized.installDir);
    await assertInstallDirSafe(normalized.installDir);
    await removePath(stagingDir);
    await diskFs.mkdir(stagingDir, { recursive: true });

    emitProgress(event, 7, "检查应用资源", "正在统计需要复制的文件");
    const totalFiles = await countFiles(payloadDir);

    emitProgress(event, 10, "复制 Novayxk", "正在写入主程序文件");
    let copiedFiles = 0;
    await copyDirectory(payloadDir, stagingDir, (filePath) => {
      copiedFiles += 1;
      const percent = 10 + Math.round((copiedFiles / Math.max(totalFiles, 1)) * 62);
      emitProgress(event, Math.min(percent, 72), "复制 Novayxk", path.relative(payloadDir, filePath));
    });

    emitProgress(event, 74, "切换安装目录", "正在替换旧版本文件");
    await replaceInstallDirectory(stagingDir, normalized.installDir);

    emitProgress(event, 76, "写入卸载程序", "自定义卸载器默认保留 .novayxk 数据");
    await prepareUninstaller(normalized.installDir, targetExe);

    if (normalized.createDesktopShortcut) {
      emitProgress(event, 83, "创建桌面快捷方式", "Novayxk.lnk");
      await createShortcut(getDesktopShortcutPath(), targetExe, normalized.installDir);
    } else {
      await removePath(getDesktopShortcutPath());
    }

    if (normalized.createStartMenuShortcut) {
      emitProgress(event, 88, "创建开始菜单入口", "Novayxk.lnk");
      await createStartMenuShortcut(targetExe, normalized.installDir);
    } else {
      await removePath(getStartMenuShortcutPath());
    }

    emitProgress(event, 94, "注册卸载入口", "Windows 应用和功能");
    await writeUninstallRegistry(normalized.installDir, targetExe, totalFiles);

    emitProgress(event, 100, "安装完成", targetExe);
    return {
      ok: true,
      installDir: normalized.installDir,
      exePath: targetExe,
      userDataDir: APP_USER_DATA_DIR,
    };
  } finally {
    installInProgress = false;
  }
});

ipcMain.handle("installer:uninstall", async (event, options) => {
  writeDebugLog("installer:uninstall", {
    source: "installer-main",
    installDir: options?.installDir || "",
    deleteUserData: options?.deleteUserData === true,
  });
  if (installInProgress) throw new Error("卸载正在进行中。");
  installInProgress = true;

  try {
    const normalized = normalizeUninstallOptions(options);
    const targetExe = path.join(normalized.installDir, APP_EXE);
    const targetUninstaller = path.join(normalized.installDir, UNINSTALLER_EXE);

    emitProgress(event, 5, "准备卸载", normalized.installDir);
    await assertUninstallDirSafe(normalized.installDir);

    emitProgress(event, 18, "关闭运行中的 Novayxk", "正在释放被占用的文件");
    await closeRunningAppProcesses();

    emitProgress(event, 36, "移除快捷方式", "桌面与开始菜单入口");
    await removeShellArtifacts();

    emitProgress(event, 58, "清理系统卸载入口", "Windows 应用和功能");
    await removeUninstallRegistry();

    emitProgress(event, 72, "安排目录清理", "关闭窗口后完成最终删除");
    pendingUninstallCleanup = {
      installDir: normalized.installDir,
      deleteUserData: normalized.deleteUserData,
      userDataDir: APP_USER_DATA_DIR,
      targetExe,
      targetUninstaller,
    };
    hasStartedCleanup = false;

    emitProgress(
      event,
      100,
      "卸载准备完成",
      normalized.deleteUserData ? "关闭窗口后会同时删除 .novayxk 数据" : "关闭窗口后会保留 .novayxk 数据",
    );
    return {
      ok: true,
      installDir: normalized.installDir,
      userDataDir: APP_USER_DATA_DIR,
      deleteUserData: normalized.deleteUserData,
    };
  } finally {
    installInProgress = false;
  }
});

function getDefaultInstallDir() {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  return path.join(localAppData, "Programs", "Novayxk");
}

async function getPayloadDir(event) {
  if (app.isPackaged) {
    const externalPayloadDir = path.join(process.resourcesPath, "payload", "win-unpacked");
    if (await pathExists(externalPayloadDir)) {
      writeDebugLog("payload:external", {
        source: "installer-main",
        payloadDir: externalPayloadDir,
      });
      return externalPayloadDir;
    }

    const extractedPayloadDir = path.join(app.getPath("temp"), `novayxk-installer-payload-${app.getVersion()}`, "win-unpacked");
    emitProgress(event, 4, "解包安装资源", "正在准备 Novayxk 主程序");
    await removePath(path.dirname(extractedPayloadDir));
    await fs.mkdir(extractedPayloadDir, { recursive: true });
    const payloadArchive = await copyPayloadArchiveToTemp();
    await extractZip(payloadArchive, extractedPayloadDir);
    writeDebugLog("payload:extracted", {
      source: "installer-main",
      payloadArchive,
      payloadDir: extractedPayloadDir,
    });
    return extractedPayloadDir;
  }
  return path.join(__dirname, "..", "dist-release", "win-unpacked");
}

function normalizeInstallOptions(options) {
  const installDir = normalizeInstallDir(options?.installDir || getDefaultInstallDir());
  if (!installDir) throw new Error("安装目录不能为空。");

  return {
    installDir,
    createDesktopShortcut: options?.createDesktopShortcut !== false,
    createStartMenuShortcut: options?.createStartMenuShortcut !== false,
    launchAfterInstall: options?.launchAfterInstall !== false,
  };
}

function normalizeInstallDir(rawInstallDir) {
  const raw = String(rawInstallDir || "").trim();
  if (!raw) throw new Error("安装目录不能为空。");
  if (isDriveRootInput(raw)) {
    return path.join(`${raw.slice(0, 2)}\\`, INSTALL_DIR_NAME);
  }

  const resolved = path.resolve(raw);
  const parsed = path.parse(resolved);
  if (samePath(resolved, parsed.root)) {
    return path.join(parsed.root, INSTALL_DIR_NAME);
  }

  return resolved;
}

function isDriveRootInput(value) {
  return /^[a-zA-Z]:[\\/]*$/.test(String(value).trim());
}

function samePath(left, right) {
  return trimTrailingSeparators(path.resolve(left)).toLowerCase() === trimTrailingSeparators(path.resolve(right)).toLowerCase();
}

function trimTrailingSeparators(value) {
  const normalized = String(value).replace(/[\\/]+$/, "");
  return normalized || value;
}

function normalizeUninstallOptions(options) {
  const installDir = path.resolve(String(options?.installDir || uninstallTargetArg || getDefaultInstallDir()).trim());
  if (!installDir) throw new Error("卸载目录不能为空。");

  return {
    installDir,
    deleteUserData: options?.deleteUserData === true,
  };
}

function getStagingInstallDir(installDir) {
  const parentDir = path.dirname(installDir);
  const baseName = path.basename(installDir);
  return path.join(parentDir, `.${baseName}.staging-${Date.now()}`);
}

async function replaceInstallDirectory(stagingDir, installDir) {
  const backupDir = `${installDir}.backup-${Date.now()}`;
  const hadExistingInstall = await diskPathExists(installDir);

  if (hadExistingInstall) {
    await removePath(backupDir);
    await diskFs.rename(installDir, backupDir);
  }

  try {
    await diskFs.rename(stagingDir, installDir);
    await removePath(backupDir);
  } catch (error) {
    if (hadExistingInstall && !(await diskPathExists(installDir)) && (await diskPathExists(backupDir))) {
      await diskFs.rename(backupDir, installDir).catch(() => {});
    }
    await removePath(stagingDir);
    throw error;
  }
}

async function assertInstallDirSafe(installDir) {
  const parsed = path.parse(installDir);
  const resolved = path.resolve(installDir);
  const forbidden = new Set([
    path.resolve(parsed.root),
    path.resolve(os.homedir()),
    path.resolve(process.env.SystemRoot || "C:\\Windows"),
    path.resolve(process.env.ProgramFiles || "C:\\Program Files"),
    path.resolve(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)"),
  ]);

  if (forbidden.has(resolved)) {
    throw new Error("这个目录过于宽泛，请选择 Novayxk 专用文件夹。");
  }

  const marker = path.join(installDir, APP_EXE);
  const entries = await diskFs.readdir(installDir).catch(() => []);
  if (entries.length > 0 && !(await diskPathExists(marker)) && path.basename(installDir).toLowerCase() !== "novayxk") {
    throw new Error("所选目录已有其他文件。为避免覆盖，请选择空目录或名为 Novayxk 的专用目录。");
  }
}

async function assertUninstallDirSafe(installDir) {
  await assertInstallDirSafe(installDir);
  const appMarker = path.join(installDir, APP_EXE);
  const uninstallerMarker = path.join(installDir, UNINSTALLER_EXE);
  if (!(await diskPathExists(appMarker)) && !(await diskPathExists(uninstallerMarker))) {
    throw new Error("没有在这个目录里找到 Novayxk 主程序或卸载器。");
  }
}

async function imageToDataUrl(filePath, mimeType) {
  try {
    const buffer = await fs.readFile(filePath);
    return `data:${mimeType};base64,${buffer.toString("base64")}`;
  } catch {
    return "";
  }
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function diskPathExists(filePath) {
  try {
    await diskFs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function removePath(filePath) {
  await diskFs.rm(filePath, { force: true, recursive: true }).catch(() => {});
}

async function countFiles(dir) {
  const entries = await diskFs.readdir(dir, { withFileTypes: true });
  let total = 0;
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) total += await countFiles(fullPath);
    else if (entry.isFile()) total += 1;
  }
  return total;
}

async function copyDirectory(sourceDir, targetDir, onFileCopied) {
  await diskFs.mkdir(targetDir, { recursive: true });
  const entries = await diskFs.readdir(sourceDir, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      await copyDirectory(sourcePath, targetPath, onFileCopied);
      continue;
    }

    if (entry.isFile()) {
      await diskFs.mkdir(path.dirname(targetPath), { recursive: true });
      await diskFs.copyFile(sourcePath, targetPath);
      onFileCopied?.(sourcePath);
    }
  }
}

async function extractZip(archivePath, outputDir) {
  const script = `
$archivePath = ${psQuote(archivePath)}
$outputDir = ${psQuote(outputDir)}
Expand-Archive -LiteralPath $archivePath -DestinationPath $outputDir -Force
`;
  await runPowerShell(script);
}

async function copyPayloadArchiveToTemp() {
  const candidates = [
    path.join(process.resourcesPath, "payload", "novayxk-payload.zip"),
    INSTALLER_PAYLOAD_ARCHIVE,
  ];
  const archive = await findExistingPath(candidates);
  if (!archive) {
    throw new Error(`安装资源包不存在。已检查：${candidates.join("；")}`);
  }

  const tempArchive = path.join(app.getPath("temp"), `novayxk-payload-${app.getVersion()}.zip`);
  const archiveBuffer = await fs.readFile(archive);
  await diskFs.writeFile(tempArchive, archiveBuffer);
  return tempArchive;
}

async function findExistingPath(candidates) {
  for (const candidate of candidates) {
    if (await pathExists(candidate)) return candidate;
  }
  return null;
}

function emitProgress(event, percent, title, detail) {
  event.sender.send("installer:progress", {
    percent,
    title,
    detail,
  });
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function runPowerShell(script) {
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return runCommand("powershell.exe", [
    "-NoLogo",
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-EncodedCommand",
    encoded,
  ]);
}

function runCommand(command, args) {
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

function getDesktopShortcutPath() {
  return path.join(os.homedir(), "Desktop", "Novayxk.lnk");
}

function getStartMenuShortcutPath() {
  const appData = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  return path.join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "Novayxk", "Novayxk.lnk");
}

async function createShortcut(shortcutPath, targetExe, workingDirectory) {
  await diskFs.mkdir(path.dirname(shortcutPath), { recursive: true });
  await runPowerShell(`
$shortcutPath = ${psQuote(shortcutPath)}
$targetPath = ${psQuote(targetExe)}
$workingDirectory = ${psQuote(workingDirectory)}
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $targetPath
$shortcut.WorkingDirectory = $workingDirectory
$shortcut.IconLocation = "$targetPath,0"
$shortcut.Description = "Novayxk AI coding assistant"
$shortcut.Save()
`);
}

async function createStartMenuShortcut(targetExe, workingDirectory) {
  await createShortcut(getStartMenuShortcutPath(), targetExe, workingDirectory);
}

async function prepareUninstaller(installDir, targetExe) {
  if (targetExe && (await diskPathExists(targetExe))) {
    await diskFs.copyFile(targetExe, path.join(installDir, UNINSTALLER_EXE));
  }
}

async function writeUninstallRegistry(installDir, targetExe, totalFiles) {
  const uninstallExe = path.join(installDir, UNINSTALLER_EXE);
  const uninstallCommand = (await diskPathExists(uninstallExe))
    ? `"${uninstallExe}" --uninstall --target "${installDir}"`
    : `"${targetExe}" --uninstall --target "${installDir}"`;
  const estimatedSizeKb = Math.max(1, Math.round((await directorySize(installDir)) / 1024));
  const version = app.getVersion();
  const values = [
    ["DisplayName", "REG_SZ", APP_NAME],
    ["DisplayVersion", "REG_SZ", version],
    ["Publisher", "REG_SZ", PUBLISHER],
    ["InstallLocation", "REG_SZ", installDir],
    ["DisplayIcon", "REG_SZ", `${targetExe},0`],
    ["UninstallString", "REG_SZ", uninstallCommand],
    ["QuietUninstallString", "REG_SZ", uninstallCommand],
    ["NoModify", "REG_DWORD", "1"],
    ["NoRepair", "REG_DWORD", "1"],
    ["EstimatedSize", "REG_DWORD", String(estimatedSizeKb)],
    ["Comments", "REG_SZ", `Files installed: ${totalFiles}. User data is kept at ${APP_USER_DATA_DIR}.`],
  ];

  for (const [name, type, value] of values) {
    await runCommand("reg.exe", ["add", APP_REGISTRY_KEY, "/v", name, "/t", type, "/d", value, "/f"]);
  }
}

async function directorySize(dir) {
  const entries = await diskFs.readdir(dir, { withFileTypes: true });
  let total = 0;
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) total += await directorySize(fullPath);
    else if (entry.isFile()) {
      const stat = await diskFs.stat(fullPath);
      total += stat.size;
    }
  }
  return total;
}

async function closeRunningAppProcesses() {
  await runPowerShell(`
Get-Process -Name "Novayxk" -ErrorAction SilentlyContinue | Stop-Process -Force
`).catch(() => {});
}

async function removeShellArtifacts() {
  await removePath(getDesktopShortcutPath());
  await removePath(getStartMenuShortcutPath());
  await removePath(path.dirname(getStartMenuShortcutPath()));
}

async function removeUninstallRegistry() {
  await runCommand("reg.exe", ["delete", APP_REGISTRY_KEY, "/f"]).catch(() => {});
}

function getArgValue(args, name) {
  const index = args.indexOf(name);
  if (index === -1) return "";
  return String(args[index + 1] ?? "").trim();
}

function getDebugLogPaths() {
  const paths = new Set([path.join(os.tmpdir(), DEBUG_LOG_NAME)]);
  try {
    paths.add(path.join(launcherExecutableDir, DEBUG_LOG_NAME));
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

async function launchPendingCleanup() {
  if (!pendingUninstallCleanup || hasStartedCleanup) return;
  hasStartedCleanup = true;

  const cleanupHelperPath = await launchCleanupHelper({
    installDir: pendingUninstallCleanup.installDir,
    deleteUserData: pendingUninstallCleanup.deleteUserData,
    userDataDir: pendingUninstallCleanup.userDataDir,
  });
  writeDebugLog("cleanup:spawned", {
    source: "installer-main",
    installDir: pendingUninstallCleanup.installDir,
    deleteUserData: pendingUninstallCleanup.deleteUserData,
    cleanupHelperPath,
  });
}

async function findCleanupHelper() {
  const candidates = [
    path.join(process.resourcesPath || "", "cleanup", CLEANUP_EXE),
    path.join(launcherExecutableDir, "resources", "cleanup", CLEANUP_EXE),
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
  const helperTarget = path.join(os.tmpdir(), `Novayxk Cleanup-${Date.now()}-${Math.random().toString(16).slice(2)}.exe`);
  await diskFs.copyFile(helperSource, helperTarget);

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
