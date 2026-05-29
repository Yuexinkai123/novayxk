const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const packageJson = require(path.join(root, "package.json"));
const payloadDir = path.join(root, "dist-release", "win-unpacked");
const payloadArchive = path.join(root, "installer", "payload", "novayxk-payload.zip");
const installerConfig = path.join(root, "build", "installer-builder.json");
const cleanupOutputDir = path.join(root, "dist-cleanup");
const cleanupResource = path.join(cleanupOutputDir, "Novayxk Cleanup.exe");
const payloadCleanupDir = path.join(payloadDir, "resources", "cleanup");
const payloadCleanupExe = path.join(payloadCleanupDir, "Novayxk Cleanup.exe");
const outputDir = path.join(root, "dist-custom-installer");
const sevenZip = path.join(root, "node_modules", "7zip-bin", "win", "x64", "7za.exe");

function assertInsideRoot(targetPath) {
  const relative = path.relative(root, path.resolve(targetPath));
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Refusing to touch path outside project: ${targetPath}`);
  }
}

function run(command, args) {
  const result = childProcess.spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (!fs.existsSync(path.join(payloadDir, "Novayxk.exe"))) {
  console.error("Missing dist-release\\win-unpacked\\Novayxk.exe. Run npm run pack first.");
  process.exit(1);
}

if (!fs.existsSync(sevenZip)) {
  console.error("Missing 7-Zip helper: node_modules\\7zip-bin\\win\\x64\\7za.exe");
  process.exit(1);
}

if (!fs.existsSync(installerConfig)) {
  console.error("Missing build\\installer-builder.json.");
  process.exit(1);
}

assertInsideRoot(outputDir);
assertInsideRoot(cleanupOutputDir);
fs.rmSync(path.join(outputDir, "win-unpacked"), { recursive: true, force: true });
fs.rmSync(path.join(outputDir, `Novayxk-Custom-Setup-${packageJson.version}.exe`), { force: true });
fs.rmSync(cleanupOutputDir, { recursive: true, force: true });
fs.rmSync(path.dirname(payloadArchive), { recursive: true, force: true });
fs.mkdirSync(path.dirname(payloadArchive), { recursive: true });

run(process.execPath, [
  path.join(root, "scripts", "build-cleanup-helper.cjs"),
]);

if (!fs.existsSync(cleanupResource)) {
  console.error(`Missing cleanup helper artifact: ${cleanupResource}`);
  process.exit(1);
}

fs.mkdirSync(payloadCleanupDir, { recursive: true });
fs.copyFileSync(cleanupResource, payloadCleanupExe);

run(sevenZip, [
  "a",
  "-tzip",
  "-mx=5",
  payloadArchive,
  path.join(payloadDir, "*"),
]);

run(process.execPath, [
  path.join(root, "scripts", "package-electron.cjs"),
  "--config",
  installerConfig,
  "--win",
  "portable",
]);

const artifact = path.join(outputDir, `Novayxk-Custom-Setup-${packageJson.version}.exe`);
if (!fs.existsSync(artifact)) {
  console.warn(`Custom installer build finished, but expected artifact was not found: ${artifact}`);
  process.exit(0);
}

console.log("");
console.log(`Custom installer ready: ${artifact}`);
