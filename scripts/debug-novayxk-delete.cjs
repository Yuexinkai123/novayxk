const fs = require("node:fs/promises");
const path = require("node:path");

const target = process.argv[2] || "D:\\novayxk";

async function main() {
  console.log(`target=${target}`);
  try {
    const stat = await fs.stat(target);
    console.log(`targetType=${stat.isDirectory() ? "directory" : "file"}`);
  } catch (error) {
    console.log(`targetStatError=${error.code || error.message}`);
    return;
  }

  const entries = await fs.readdir(target, { withFileTypes: true }).catch((error) => {
    console.log(`readdirError=${error.code || error.message}`);
    return [];
  });

  for (const entry of entries) {
    const fullPath = path.join(target, entry.name);
    try {
      await fs.access(fullPath);
      console.log(`access ok ${entry.isDirectory() ? "dir " : "file"} ${fullPath}`);
    } catch (error) {
      console.log(`access fail ${fullPath} ${error.code || error.message}`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
