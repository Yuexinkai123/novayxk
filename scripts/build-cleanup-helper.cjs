const childProcess = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const outputDir = path.join(root, "dist-cleanup");
const outputExe = path.join(outputDir, "Novayxk Cleanup.exe");
const goCacheDir = path.join(root, ".go-cache");

function run(command, args, options = {}) {
  const result = childProcess.spawnSync(command, args, {
    cwd: root,
    env: {
      ...process.env,
      ...options.env,
    },
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

fs.rmSync(outputDir, { recursive: true, force: true });
fs.mkdirSync(outputDir, { recursive: true });
fs.mkdirSync(goCacheDir, { recursive: true });

run("go", ["build", "-trimpath", "-ldflags", "-s -w -H=windowsgui", "-o", outputExe, path.join("cleanup", "main.go")], {
  env: {
    CGO_ENABLED: "0",
    GOOS: "windows",
    GOARCH: "amd64",
    GOCACHE: goCacheDir,
  },
});

if (!fs.existsSync(outputExe)) {
  console.error(`Cleanup helper was not created: ${outputExe}`);
  process.exit(1);
}

console.log(`Cleanup helper ready: ${outputExe}`);
