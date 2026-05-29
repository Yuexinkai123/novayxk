const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const electronVersion = "33.4.11";
const mirror = "https://npmmirror.com/mirrors/electron/";
const npmCli = process.env.npm_execpath;
const electronPackage = path.join(root, "node_modules", "electron", "package.json");
const electronInstallScript = path.join(root, "node_modules", "electron", "install.js");
const electronExe = path.join(root, "node_modules", "electron", "dist", process.platform === "win32" ? "electron.exe" : "electron");
const npmCache = path.join(root, ".npm-cache");
const electronCache = path.join(root, ".electron-cache");

function run(command, args, extraEnv = {}) {
  const result = childProcess.spawnSync(command, args, {
    cwd: root,
    env: {
      ...process.env,
      npm_config_cache: npmCache,
      npm_config_electron_mirror: mirror,
      ELECTRON_MIRROR: mirror,
      ...extraEnv,
    },
    stdio: "inherit",
  });

  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (!fs.existsSync(electronPackage)) {
  if (!npmCli) {
    console.error("Could not find npm CLI path. Run this script through npm: npm run setup:desktop");
    process.exit(1);
  }

  run(process.execPath, [
    npmCli,
    "install",
    `electron@${electronVersion}`,
    "--no-save",
    "--ignore-scripts",
    "--cache",
    npmCache,
  ]);
}

if (!fs.existsSync(electronInstallScript)) {
  console.error("Electron package is missing. Run npm run setup:desktop again.");
  process.exit(1);
}

if (fs.existsSync(electronExe)) {
  process.exit(0);
}

run(process.execPath, [electronInstallScript], {
  electron_config_cache: electronCache,
});
