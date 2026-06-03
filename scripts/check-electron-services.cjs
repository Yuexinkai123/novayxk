const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const targets = [
  path.join(root, "electron", "main.cjs"),
  path.join(root, "electron", "preload.cjs"),
  path.join(root, "electron", "uninstaller-preload.cjs"),
  path.join(root, "installer", "main.cjs"),
  path.join(root, "installer", "preload.cjs"),
  ...fs
    .readdirSync(path.join(root, "electron", "services"))
    .filter((name) => name.endsWith(".cjs"))
    .map((name) => path.join(root, "electron", "services", name)),
];

for (const target of targets) {
  const result = spawnSync(process.execPath, ["--check", target], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exit(result.status || 1);
  }
  console.log(`ok ${path.relative(root, target)}`);
}

const logsSource = fs.readFileSync(path.join(root, "electron", "services", "logs.cjs"), "utf8");
if (/\buninstallTargetArg\b/.test(logsSource)) {
  console.error("electron/services/logs.cjs must receive debug paths through createLogService options.");
  process.exit(1);
}

const mainSource = fs.readFileSync(path.join(root, "electron", "main.cjs"), "utf8");
if (!/resolveRequestedCommandScope/.test(mainSource) || !/getSystemCommandCwd/.test(mainSource)) {
  console.error("electron/main.cjs must route commands through project/system command scopes.");
  process.exit(1);
}
const runCommandWithModePrelude = mainSource.match(/ipcMain\.handle\("project:runCommandWithMode"[\s\S]*?const command =/);
if (!runCommandWithModePrelude || /!activeProjectRoot/.test(runCommandWithModePrelude[0])) {
  console.error("project:runCommandWithMode must not require an active project before command scope is resolved.");
  process.exit(1);
}

const commandSource = fs.readFileSync(path.join(root, "electron", "services", "command.cjs"), "utf8");
if (!/detectCommandScope/.test(commandSource) || !/winget/.test(commandSource) || !/ms-windows-store/.test(commandSource)) {
  console.error("electron/services/command.cjs must classify software and store commands as system commands.");
  process.exit(1);
}

const projectSource = fs.readFileSync(path.join(root, "electron", "services", "project.cjs"), "utf8");
if (!/setMainActiveProjectRoot\(activeProjectRoot\)/.test(projectSource)) {
  console.error("electron/services/project.cjs must sync openProjectRoot state back to the main process.");
  process.exit(1);
}

const installerSource = fs.readFileSync(path.join(root, "installer", "main.cjs"), "utf8");
if (!/closeRunningAppProcesses/.test(installerSource) || !/安装目录正在被占用/.test(installerSource)) {
  console.error("installer/main.cjs must close running Novayxk processes and show a friendly busy-directory message.");
  process.exit(1);
}

const installerRendererSource = fs.readFileSync(path.join(root, "installer", "renderer.js"), "utf8");
if (!/Error invoking remote method/.test(installerRendererSource)) {
  console.error("installer/renderer.js must strip raw Electron remote-method error prefixes.");
  process.exit(1);
}
console.log("ok electron services static guards");
