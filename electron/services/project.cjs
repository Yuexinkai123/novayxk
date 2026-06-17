const path = require("node:path");
const fs = require("node:fs/promises");

let activeProjectRoot = null;
let logApp = () => {};
let setMainActiveProjectRoot = () => {};
const patchTransactions = [];

const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".turbo",
  "target",
  "coverage",
]);
const SENSITIVE_FILES = [/^\.env/i, /secret/i, /private/i, /credential/i, /\.pem$/i, /\.key$/i, /\.p12$/i];
const TREE_ENTRY_LIMIT = 300;
const TREE_INITIAL_DEPTH = 1;
const PROJECT_SEARCH_LIMIT = 160;
const PROJECT_CONTEXT_FILE_LIMIT = 420;
const PROJECT_CONTEXT_RELATED_LIMIT = 6;
const PROJECT_CONTEXT_RELATED_BYTES = 28_000;
const PROJECT_WALK_DEPTH_LIMIT = 12;
const TEXT_FILE_EXTENSIONS = new Set([
  ".cjs",
  ".css",
  ".csv",
  ".env.example",
  ".go",
  ".html",
  ".js",
  ".json",
  ".jsx",
  ".md",
  ".mjs",
  ".ps1",
  ".py",
  ".rs",
  ".scss",
  ".sh",
  ".toml",
  ".ts",
  ".tsx",
  ".txt",
  ".vue",
  ".xml",
  ".yaml",
  ".yml",
]);

function isInsideProject(candidatePath) {
  if (!activeProjectRoot) return false;
  const relative = path.relative(activeProjectRoot, candidatePath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function isSensitiveFile(filePath) {
  const basename = path.basename(filePath);
  return SENSITIVE_FILES.some((pattern) => pattern.test(basename));
}

function assertProjectFile(relativePath) {
  if (!activeProjectRoot) throw new Error("Please open a project first.");
  if (!relativePath || typeof relativePath !== "string") throw new Error("Invalid file path.");
  const fullPath = path.resolve(activeProjectRoot, relativePath);
  if (!isInsideProject(fullPath)) throw new Error("The file path is outside the current project.");
  if (isSensitiveFile(fullPath)) throw new Error("This file appears to contain sensitive information, so the operation was blocked.");
  return fullPath;
}

function assertProjectPath(relativePath = "") {
  if (!activeProjectRoot) throw new Error("Please open a project first.");
  if (typeof relativePath !== "string") throw new Error("Invalid project path.");
  const normalized = normalizeRelativeProjectPath(relativePath);
  const fullPath = normalized ? path.resolve(activeProjectRoot, normalized) : activeProjectRoot;
  if (!isInsideProject(fullPath)) throw new Error("The path is outside the current project.");
  if (normalized && isSensitiveFile(fullPath)) throw new Error("This path appears to contain sensitive information, so the operation was blocked.");
  return fullPath;
}

function normalizeRelativeProjectPath(relativePath) {
  return String(relativePath ?? "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/")
    .trim();
}

async function statIfExists(fullPath) {
  try {
    return await fs.stat(fullPath);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}




function parseUnifiedPatch(patchText) {
  const lines = patchText.replace(/\r\n/g, "\n").split("\n");
  const files = [];
  let current = null;
  let hunks = [];
  let currentHunk = null;

  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      if (current) files.push({ ...current, hunks });
      current = null;
      hunks = [];
      currentHunk = null;
      continue;
    }

    if (line.startsWith("--- ")) {
      if (current) files.push({ ...current, hunks });
      current = {
        oldPath: normalizePatchPath(line.slice(4).trim()),
        newPath: null,
      };
      hunks = [];
      currentHunk = null;
      continue;
    }

    if (line.startsWith("+++ ")) {
      if (!current) current = { oldPath: null, newPath: null };
      current.newPath = normalizePatchPath(line.slice(4).trim());
      continue;
    }

    const hunkMatch = line.match(/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/);
    if (hunkMatch) {
      if (!current) throw new Error("The patch is missing a file header.");
      currentHunk = {
        oldStart: Number(hunkMatch[1]),
        oldCount: Number(hunkMatch[2] ?? "1"),
        newStart: Number(hunkMatch[3]),
        newCount: Number(hunkMatch[4] ?? "1"),
        lines: [],
      };
      hunks.push(currentHunk);
      continue;
    }

    if (currentHunk && /^[ +\-\\]/.test(line)) {
      if (line.startsWith("\\ No newline at end of file")) continue;
      currentHunk.lines.push(line);
    }
  }

  if (current) files.push({ ...current, hunks });
  return files
    .map((file) => {
      const isCreate = file.oldPath === "/dev/null";
      const isDelete = file.newPath === "/dev/null";
      return {
        oldPath: file.oldPath,
        newPath: file.newPath,
        path: isDelete ? file.oldPath : file.newPath,
        isCreate,
        isDelete,
        hunks: file.hunks,
      };
    })
    .filter((file) => file.path && file.path !== "/dev/null" && file.hunks.length);
}

function normalizePatchPath(rawPath) {
  const cleaned = rawPath.split(/\s+/)[0].replace(/^"|"$/g, "");
  if (cleaned === "/dev/null") return cleaned;
  return cleaned.replace(/^[ab]\//, "").replace(/\\/g, "/");
}

function applyHunks(original, hunks) {
  const source = original.replace(/\r\n/g, "\n");
  const originalLines = source.split("\n");
  const hasTrailingNewline = source.endsWith("\n");
  if (hasTrailingNewline) originalLines.pop();

  const result = [];
  let cursor = 0;

  for (const hunk of hunks) {
    const start = Math.max(hunk.oldStart - 1, 0);
    if (start < cursor) throw new Error("Patch hunks overlap and cannot be applied safely.");
    result.push(...originalLines.slice(cursor, start));
    cursor = start;

    for (const hunkLine of hunk.lines) {
      const marker = hunkLine[0];
      const text = hunkLine.slice(1);
      if (marker === " ") {
        if (originalLines[cursor] !== text) {
          throw new Error(`Patch context did not match: ${text}`);
        }
        result.push(originalLines[cursor]);
        cursor += 1;
      } else if (marker === "-") {
        if (originalLines[cursor] !== text) {
          throw new Error(`Patch deletion line did not match: ${text}`);
        }
        cursor += 1;
      } else if (marker === "+") {
        result.push(text);
      }
    }
  }

  result.push(...originalLines.slice(cursor));
  return result.join("\n") + (hasTrailingNewline ? "\n" : "");
}

async function buildTree(dir, depth = 0, options = {}) {
  const maxDepth = Number.isFinite(options.maxDepth) ? options.maxDepth : TREE_INITIAL_DEPTH;
  if (depth > maxDepth) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const visible = entries
    .filter((entry) => !IGNORED_DIRS.has(entry.name))
    .filter((entry) => !entry.name.startsWith(".") || entry.name === ".github")
    .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));

  const nodes = [];
  for (const entry of visible.slice(0, TREE_ENTRY_LIMIT)) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(activeProjectRoot, fullPath).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      const childEntries = depth < maxDepth ? await buildTree(fullPath, depth + 1, options) : [];
      nodes.push({
        type: "directory",
        name: entry.name,
        path: relativePath,
        children: childEntries,
        loaded: depth < maxDepth,
      });
    } else {
      nodes.push({
        type: "file",
        name: entry.name,
        path: relativePath,
        sensitive: isSensitiveFile(fullPath),
      });
    }
  }
  return nodes;
}

async function buildDirectoryTree(relativePath = "") {
  const normalized = normalizeRelativeProjectPath(relativePath);
  const fullPath = assertProjectPath(normalized);
  const stat = await fs.stat(fullPath);
  if (!stat.isDirectory()) throw new Error("The path is not a folder.");
  return {
    path: normalized,
    children: await buildTree(fullPath, 0, { maxDepth: 0 }),
  };
}

async function searchProjectFiles(query) {
  if (!activeProjectRoot) throw new Error("Please open a project first.");
  const term = String(query ?? "").trim().toLowerCase();
  if (!term) return [];
  const matches = [];
  await walkProjectFiles(activeProjectRoot, async (fullPath, relativePath, stat) => {
    if (matches.length >= PROJECT_SEARCH_LIMIT) return false;
    const normalizedPath = relativePath.replace(/\\/g, "/");
    if (!normalizedPath.toLowerCase().includes(term)) return true;
    matches.push({
      type: "file",
      name: path.basename(normalizedPath),
      path: normalizedPath,
      sensitive: isSensitiveFile(fullPath),
      size: stat.size,
    });
    return true;
  });
  return matches;
}

async function readProjectContext(request = {}) {
  if (!activeProjectRoot) throw new Error("Please open a project first.");
  const selectedPath = normalizeRelativeProjectPath(request.selectedPath ?? "");
  const prompt = String(request.prompt ?? "");
  const projectFiles = [];
  await walkProjectFiles(activeProjectRoot, async (fullPath, relativePath, stat) => {
    if (projectFiles.length >= PROJECT_CONTEXT_FILE_LIMIT) return false;
    const normalizedPath = relativePath.replace(/\\/g, "/");
    projectFiles.push({
      path: normalizedPath,
      size: stat.size,
      sensitive: isSensitiveFile(fullPath),
    });
    return true;
  });

  const relatedPaths = pickRelatedProjectFiles(projectFiles, selectedPath, prompt);
  const relatedFiles = [];
  let usedBytes = 0;
  for (const relativePath of relatedPaths) {
    if (usedBytes >= PROJECT_CONTEXT_RELATED_BYTES) break;
    try {
      const fullPath = assertProjectFile(relativePath);
      const stat = await fs.stat(fullPath);
      if (!isLikelyTextFile(fullPath, stat.size)) continue;
      const remaining = PROJECT_CONTEXT_RELATED_BYTES - usedBytes;
      const content = await fs.readFile(fullPath, "utf8");
      const clipped = content.slice(0, Math.max(0, remaining));
      relatedFiles.push({
        path: relativePath,
        content: clipped,
        truncated: clipped.length < content.length,
      });
      usedBytes += clipped.length;
    } catch {
      // Skip files that disappeared, grew too large, or are blocked as sensitive.
    }
  }

  return {
    root: activeProjectRoot,
    files: projectFiles,
    relatedFiles,
  };
}

async function walkProjectFiles(dir, visitor, depth = 0) {
  if (depth > PROJECT_WALK_DEPTH_LIMIT) return true;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return true;
  }

  const visible = entries
    .filter((entry) => !IGNORED_DIRS.has(entry.name))
    .filter((entry) => !entry.name.startsWith(".") || entry.name === ".github")
    .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));

  for (const entry of visible) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(activeProjectRoot, fullPath).replace(/\\/g, "/");
    if (entry.isDirectory()) {
      const shouldContinue = await walkProjectFiles(fullPath, visitor, depth + 1);
      if (shouldContinue === false) return false;
    } else if (entry.isFile()) {
      const stat = await statIfExists(fullPath);
      if (!stat) continue;
      const shouldContinue = await visitor(fullPath, relativePath, stat);
      if (shouldContinue === false) return false;
    }
  }
  return true;
}

function pickRelatedProjectFiles(files, selectedPath, prompt) {
  const tokens = extractPromptTokens(`${prompt} ${selectedPath}`);
  const selectedDir = selectedPath ? path.posix.dirname(selectedPath.replace(/\\/g, "/")) : "";
  const scored = [];
  for (const file of files) {
    if (file.sensitive || !isLikelyTextProjectPath(file.path) || file.size > 120_000) continue;
    if (file.path === selectedPath) continue;
    let score = 0;
    const lowerPath = file.path.toLowerCase();
    for (const token of tokens) {
      if (lowerPath.includes(token)) score += token.length > 4 ? 4 : 2;
    }
    if (selectedDir && path.posix.dirname(file.path) === selectedDir) score += 3;
    if (/^(package\.json|vite\.config\.ts|tsconfig\.json|README\.md)$/i.test(file.path)) score += 2;
    if (score > 0) scored.push({ path: file.path, score });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, PROJECT_CONTEXT_RELATED_LIMIT)
    .map((item) => item.path);
}

function extractPromptTokens(text) {
  const matches = String(text ?? "").toLowerCase().match(/[a-z0-9_.-]{3,}/g) ?? [];
  return [...new Set(matches)].slice(0, 24);
}

function isLikelyTextProjectPath(relativePath) {
  const lower = String(relativePath ?? "").toLowerCase();
  if (/(^|\/)(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/.test(lower)) return false;
  if (/\.(png|jpg|jpeg|gif|webp|ico|bmp|pdf|zip|7z|gz|tgz|exe|dll|dat|pak|asar|node)$/i.test(lower)) return false;
  const extension = path.extname(lower);
  return TEXT_FILE_EXTENSIONS.has(extension) || !extension;
}

function isLikelyTextFile(fullPath, size) {
  return size <= 160_000 && isLikelyTextProjectPath(path.relative(activeProjectRoot, fullPath));
}

async function openProjectRoot(projectRoot) {
  if (!projectRoot || typeof projectRoot !== "string") throw new Error("Invalid project path.");
  const resolvedRoot = path.resolve(projectRoot);
  const stat = await fs.stat(resolvedRoot);
  if (!stat.isDirectory()) throw new Error("The project path is not a folder.");
  activeProjectRoot = resolvedRoot;
  setMainActiveProjectRoot(activeProjectRoot);
  logApp("project:opened", { projectRoot: activeProjectRoot });
  return {
    root: activeProjectRoot,
    tree: await buildTree(activeProjectRoot, 0, { maxDepth: TREE_INITIAL_DEPTH }),
  };
}




function createProjectService(options = {}) {
  logApp = options.logApp || logApp;
  setMainActiveProjectRoot = options.setActiveProjectRoot || setMainActiveProjectRoot;
  return {
    openProjectRoot,
    buildTree,
    buildDirectoryTree,
    searchProjectFiles,
    readProjectContext,
    assertProjectFile,
    statIfExists,
    parseUnifiedPatch,
    applyHunks,
    getActiveProjectRoot: () => activeProjectRoot,
  };
}

module.exports = { createProjectService };
