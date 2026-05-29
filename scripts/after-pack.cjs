const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== "win32") {
    return;
  }

  const root = context.packager.projectDir;
  const rcedit = path.join(root, ".electron-builder-cache", "winCodeSign", "manual", "rcedit-x64.exe");
  const icon = path.join(root, "assets", "icons", "novayxk.ico");
  const productName = context.packager.appInfo.productName || "Novayxk";
  const version = context.packager.appInfo.version || "0.1.0";
  const exePath = path.join(context.appOutDir, `${productName}.exe`);

  if (!fs.existsSync(rcedit) || !fs.existsSync(icon) || !fs.existsSync(exePath)) {
    return;
  }

  const args = [
    exePath,
    "--set-icon",
    icon,
    "--set-version-string",
    "FileDescription",
    productName,
    "--set-version-string",
    "ProductName",
    productName,
    "--set-version-string",
    "CompanyName",
    "Novayxk",
    "--set-version-string",
    "LegalCopyright",
    `Copyright (C) ${new Date().getFullYear()} Novayxk`,
    "--set-file-version",
    version,
    "--set-product-version",
    version,
  ];

  const result = childProcess.spawnSync(rcedit, args, {
    cwd: root,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`rcedit failed with exit code ${result.status}`);
  }
};
