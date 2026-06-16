const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const localAppData = path.join(root, ".local-app-data");
const builderCache = path.join(root, ".electron-builder-cache");
const electronCache = path.join(root, ".electron-cache");
const sevenZip = path.join(root, "node_modules", "7zip-bin", "win", "x64", "7za.exe");
const manualWinCodeSign = path.join(builderCache, "winCodeSign", "manual");
const manualRceditX64 = path.join(manualWinCodeSign, "rcedit-x64.exe");
const manualRceditIa32 = path.join(manualWinCodeSign, "rcedit-ia32.exe");
const manualRceditX86 = path.join(manualWinCodeSign, "rcedit-x86.exe");
const manualSignTool = path.join(manualWinCodeSign, "windows-10", "x64", "signtool.exe");
const manualNsis = path.join(builderCache, "nsis", "manual");
const manualNsisResources = path.join(builderCache, "nsis-resources", "manual");
const unpackedAsar = path.join(root, "dist-release", "win-unpacked", "resources", "app.asar");

fs.mkdirSync(localAppData, { recursive: true });
fs.mkdirSync(builderCache, { recursive: true });
fs.mkdirSync(electronCache, { recursive: true });

const builderCli = path.join(root, "node_modules", "electron-builder", "cli.js");
const args = process.argv.slice(2);
const isFastPack = args.includes("--fast");
const builderArgs = args.filter((arg) => arg !== "--fast");

const localToolEnv = {};
if (!fs.existsSync(manualRceditX86) && fs.existsSync(manualRceditIa32)) {
  fs.copyFileSync(manualRceditIa32, manualRceditX86);
}

function isFileLocked(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const probePath = `${filePath}.lockcheck-${process.pid}`;
  try {
    fs.renameSync(filePath, probePath);
    fs.renameSync(probePath, filePath);
    return false;
  } catch (error) {
    if (fs.existsSync(probePath) && !fs.existsSync(filePath)) {
      try {
        fs.renameSync(probePath, filePath);
      } catch {
        // If this ever fails, let the original lock/error path explain the packaging problem.
      }
    }
    if (error && (error.code === "EBUSY" || error.code === "EPERM" || error.code === "EACCES")) {
      return true;
    }
    return false;
  }
}

function listLikelyLockingProcesses() {
  if (process.platform !== "win32") return "";
  const script = [
    "$items = Get-CimInstance Win32_Process |",
    "Where-Object {",
    "$_.Name -in @('Novayxk.exe','electron.exe') -or",
    "$_.ExecutablePath -like '*Novayxk*' -or",
    "$_.CommandLine -like '*Novayxk*' -or",
    "$_.CommandLine -like '*dist-release*'",
    "} | Select-Object -First 20 ProcessId,Name,@{Name='Path';Expression={$_.ExecutablePath}};",
    "$items | Format-Table -AutoSize",
  ].join(" ");
  const result = childProcess.spawnSync("powershell.exe", ["-NoProfile", "-Command", script], {
    cwd: root,
    encoding: "utf8",
  });
  return `${result.stdout || ""}${result.stderr || ""}`.trim();
}

function assertPreviousBuildNotLocked() {
  if (!isFileLocked(unpackedAsar)) return;

  console.error("");
  console.error("Cannot package Novayxk because the previous unpacked app is still locked:");
  console.error(`  ${unpackedAsar}`);
  console.error("");
  console.error("Close any running Novayxk/Electron windows, then run npm run package:custom again.");
  console.error("If the window is already closed, wait a few seconds for Windows Defender or Explorer to release app.asar.");
  const processes = listLikelyLockingProcesses();
  if (processes) {
    console.error("");
    console.error("Likely related processes:");
    console.error(processes);
  }
  console.error("");
  console.error("Manual cleanup command if needed:");
  console.error("  Get-Process Novayxk,electron -ErrorAction SilentlyContinue | Stop-Process");
  console.error("");
  process.exit(1);
}

assertPreviousBuildNotLocked();

function prepareLocalArchive({ cacheName, archiveName, outputDir, probeFile }) {
  if (fs.existsSync(probeFile)) {
    return true;
  }

  const archive = path.join(builderCache, cacheName, archiveName);
  if (!fs.existsSync(archive) || !fs.existsSync(sevenZip)) {
    return false;
  }

  fs.mkdirSync(outputDir, { recursive: true });
  const result = childProcess.spawnSync(sevenZip, ["x", "-snld", "-bd", archive, `-o${outputDir}`, "-y"], {
    cwd: path.join(builderCache, cacheName),
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  return fs.existsSync(probeFile);
}

if (fs.existsSync(manualRceditX64) && fs.existsSync(manualRceditX86)) {
  localToolEnv.ELECTRON_BUILDER_RCEDIT_PATH = manualWinCodeSign;
}
if (fs.existsSync(manualSignTool)) {
  localToolEnv.SIGNTOOL_PATH = manualSignTool;
  localToolEnv.ELECTRON_BUILDER_WINDOWS_KITS_PATH = path.dirname(manualSignTool);
}
if (
  prepareLocalArchive({
    cacheName: "nsis",
    archiveName: "nsis-3.0.4.1.7z",
    outputDir: manualNsis,
    probeFile: path.join(manualNsis, "Bin", "makensis.exe"),
  })
) {
  localToolEnv.ELECTRON_BUILDER_NSIS_DIR = manualNsis;
}
if (
  prepareLocalArchive({
    cacheName: "nsis-resources",
    archiveName: "nsis-resources-3.4.1.7z",
    outputDir: manualNsisResources,
    probeFile: path.join(manualNsisResources, "plugins", "x86-unicode", "nsis7z.dll"),
  })
) {
  localToolEnv.ELECTRON_BUILDER_NSIS_RESOURCES_DIR = manualNsisResources;
}

const result = childProcess.spawnSync(process.execPath, [builderCli, ...builderArgs], {
  cwd: root,
  env: {
    ...process.env,
    ...localToolEnv,
    LOCALAPPDATA: localAppData,
    ELECTRON_BUILDER_CACHE: builderCache,
    ELECTRON_CACHE: electronCache,
    electron_config_cache: electronCache,
    npm_config_electron_mirror: "https://npmmirror.com/mirrors/electron/",
    ELECTRON_MIRROR: "https://npmmirror.com/mirrors/electron/",
  },
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 0);
