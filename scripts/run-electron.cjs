const childProcess = require("node:child_process");
const path = require("node:path");

const root = path.resolve(__dirname, "..");

let electronPath;
try {
  electronPath = require("electron");
} catch {
  console.error("Electron is not installed yet. Run npm run setup:desktop first.");
  process.exit(1);
}

if (typeof electronPath !== "string") {
  console.error("Electron did not resolve to an executable path. Run npm run setup:desktop again.");
  process.exit(1);
}

const child = childProcess.spawn(electronPath, process.argv.slice(2), {
  cwd: root,
  stdio: "inherit",
});

child.on("exit", (code) => {
  process.exit(code ?? 0);
});
