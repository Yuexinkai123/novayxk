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
