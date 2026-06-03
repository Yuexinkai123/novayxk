const path = require("node:path");
const fs = require("node:fs/promises");
const crypto = require("node:crypto");

let activeProjectRoot = null;
let PROJECTS_DIR = "";

function getProjectId(projectRoot = activeProjectRoot) {
  if (!projectRoot) throw new Error("请先打开一个项目。");
  return crypto.createHash("sha256").update(path.resolve(projectRoot).toLowerCase()).digest("hex").slice(0, 16);
}

function getProjectMemoryPaths(projectRoot = activeProjectRoot) {
  const projectId = getProjectId(projectRoot);
  const projectDir = path.join(PROJECTS_DIR, projectId);
  return {
    projectId,
    projectDir,
    metaFile: path.join(projectDir, "project.json"),
    memoryFile: path.join(projectDir, "memory.md"),
    tasksDir: path.join(projectDir, "tasks"),
  };
}

function assertTaskId(taskId) {
  if (!taskId || typeof taskId !== "string" || !/^[a-zA-Z0-9_-]{8,64}$/.test(taskId)) {
    throw new Error("任务 ID 无效。");
  }
  return taskId;
}

function createTaskId() {
  return `task-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
}

function titleFromMessages(messages) {
  const firstUserMessage = Array.isArray(messages) ? messages.find((message) => message?.role === "user") : null;
  const raw = firstUserMessage?.content ?? "新任务";
  return stripInjectedContext(raw).replace(/\s+/g, " ")
    .trim()
    .slice(0, 36) || "新任务";
}

function summarizeMessages(messages) {
  if (!Array.isArray(messages)) return "";
  const userMessages = messages
    .filter((message) => message?.role === "user")
    .slice(-6)
    .map((message) => stripInjectedContext(message.content).trim())
    .filter(Boolean);
  if (!userMessages.length) return "";
  return `最近任务重点：${userMessages.join("；").slice(0, 1200)}`;
}

function stripInjectedContext(content) {
  const text = String(content ?? "");
  const indexes = ["\n\n当前选中文件：", "\n\n项目上下文摘要：", "\n\n运行上下文："]
    .map((marker) => text.indexOf(marker))
    .filter((index) => index > -1);
  return indexes.length ? text.slice(0, Math.min(...indexes)) : text;
}

async function ensureProjectMemoryRoot(projectRoot = activeProjectRoot) {
  const paths = getProjectMemoryPaths(projectRoot);
  await fs.mkdir(paths.tasksDir, { recursive: true });
  await fs.writeFile(
    paths.metaFile,
    JSON.stringify(
      {
        projectId: paths.projectId,
        root: projectRoot,
        updatedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
    "utf8",
  );
  return paths;
}

async function readProjectMemoryState(projectRoot = activeProjectRoot) {
  const paths = await ensureProjectMemoryRoot(projectRoot);
  let memory = "";
  try {
    memory = await fs.readFile(paths.memoryFile, "utf8");
  } catch {
    memory = "";
  }

  let taskFiles = [];
  try {
    taskFiles = await fs.readdir(paths.tasksDir, { withFileTypes: true });
  } catch {
    taskFiles = [];
  }

  const tasks = [];
  for (const entry of taskFiles) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(paths.tasksDir, entry.name), "utf8");
      const task = JSON.parse(raw);
      tasks.push({
        id: task.id,
        title: task.title || "未命名任务",
        summary: task.summary || "",
        messageCount: Array.isArray(task.messages) ? task.messages.length : 0,
        createdAt: task.createdAt || "",
        updatedAt: task.updatedAt || "",
      });
    } catch {
      // Ignore broken task files so one bad history does not break the app.
    }
  }

  tasks.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return {
    projectId: paths.projectId,
    projectRoot,
    memory,
    tasks,
  };
}

async function writeProjectMemory(memory) {
  if (typeof memory !== "string") throw new Error("项目记忆必须是文本。");
  if (memory.length > 80_000) throw new Error("项目记忆太长，请精简后再保存。");
  const paths = await ensureProjectMemoryRoot();
  await fs.writeFile(paths.memoryFile, memory, "utf8");
  return readProjectMemoryState();
}

async function saveTaskHistory(taskInput) {
  if (!taskInput || typeof taskInput !== "object") throw new Error("任务数据无效。");
  const paths = await ensureProjectMemoryRoot();
  const now = new Date().toISOString();
  const id = taskInput.id ? assertTaskId(taskInput.id) : createTaskId();
  const taskFile = path.join(paths.tasksDir, `${id}.json`);
  let existing = {};

  try {
    existing = JSON.parse(await fs.readFile(taskFile, "utf8"));
  } catch {
    existing = {};
  }

  const messages = Array.isArray(taskInput.messages) ? taskInput.messages : existing.messages ?? [];
  if (messages.length > 300) throw new Error("任务消息太多，请新建一个任务继续。");
  const normalizedMessages = messages.map((message) => ({
    role: message.role,
    content: (message.role === "user"
      ? stripInjectedContext(message.content)
      : String(message.content ?? "")).slice(0, 80_000),
    ...(Number.isFinite(message.elapsedMs) && message.elapsedMs >= 0
      ? { elapsedMs: Math.round(message.elapsedMs) }
      : {}),
  }));
  const title = String(taskInput.title || existing.title || titleFromMessages(normalizedMessages)).slice(0, 80);
  const summary = String(taskInput.summary || summarizeMessages(normalizedMessages)).slice(0, 4000);
  const task = {
    id,
    title,
    summary,
    messages: normalizedMessages,
    createdAt: existing.createdAt || now,
    updatedAt: now,
  };

  await fs.writeFile(taskFile, JSON.stringify(task, null, 2), "utf8");
  return task;
}

async function loadTaskHistory(taskId) {
  const paths = await ensureProjectMemoryRoot();
  const id = assertTaskId(taskId);
  const raw = await fs.readFile(path.join(paths.tasksDir, `${id}.json`), "utf8");
  return JSON.parse(raw);
}

function createMemoryService({ projectsDir, getActiveProjectRoot }) {
  PROJECTS_DIR = projectsDir;
  const syncProjectRoot = () => {
    activeProjectRoot = getActiveProjectRoot();
  };
  return {
    readProjectMemoryState: async () => {
      syncProjectRoot();
      return readProjectMemoryState();
    },
    writeProjectMemory: async (memory) => {
      syncProjectRoot();
      return writeProjectMemory(memory);
    },
    saveTaskHistory: async (taskInput) => {
      syncProjectRoot();
      return saveTaskHistory(taskInput);
    },
    loadTaskHistory: async (taskId) => {
      syncProjectRoot();
      return loadTaskHistory(taskId);
    },
  };
}

module.exports = { createMemoryService };
