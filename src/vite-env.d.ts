/// <reference types="vite/client" />

export type ProviderConfig = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  apiMode?: "chatCompletions" | "responses";
};

export type ThemeMode = "dark" | "light";

export type AiControlMode = "safe" | "full";

export type PendingAdminResume = {
  action: "run-command";
  source: "manual" | "ai";
  command: string;
  controlMode: AiControlMode;
  taskId?: string | null;
  projectRoot?: string | null;
  createdAt: string;
  messages?: ChatMessage[];
};

export type AppConfig = {
  providers: ProviderConfig[];
  activeProviderId: string | null;
  lastProjectRoot?: string | null;
  theme?: ThemeMode;
  aiControlMode?: AiControlMode;
  hasSeenWelcome?: boolean;
  hasSeenWorkspaceGuide?: boolean;
  pendingAdminResume?: PendingAdminResume | null;
};

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
  elapsedMs?: number;
};

export type TaskSummary = {
  id: string;
  title: string;
  summary: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
};

export type TaskHistory = {
  id: string;
  title: string;
  summary: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
};

export type ProjectMemoryState = {
  projectId: string;
  projectRoot: string;
  memory: string;
  tasks: TaskSummary[];
};

export type FileNode = {
  type: "directory" | "file";
  name: string;
  path: string;
  sensitive?: boolean;
  loaded?: boolean;
  size?: number;
  children?: FileNode[];
};

export type ProjectPayload = {
  root: string;
  tree: FileNode[];
};

export type ProjectContext = {
  root: string;
  files: Array<{
    path: string;
    size: number;
    sensitive?: boolean;
  }>;
  relatedFiles: Array<{
    path: string;
    content: string;
    truncated?: boolean;
  }>;
};

export type FileOperation =
  | {
      type: "mkdir";
      path: string;
    }
  | {
      type: "delete";
      path: string;
    }
  | {
      type: "write";
      path: string;
      content: string;
      overwrite?: boolean;
    };

export type TerminalTask = {
  id: string;
  title: string;
  command: string;
  commandScope: "project" | "system";
  cwd: string;
  status: "running" | "exited" | "failed" | "stopped";
  code: number | null;
  startedAt: string;
  endedAt: string | null;
  output: string;
  needsInput?: boolean;
  userIntervened?: boolean;
  inputCount?: number;
  lastInputAt?: string | null;
};

export type TerminalTaskUpdate = {
  event: string;
  task: TerminalTask;
  chunk?: string;
  stream?: "stdout" | "stderr" | "stdin";
};

declare global {
  interface Window {
    novayxk?: {
      initialConfig?: Partial<AppConfig>;
      openProject: () => Promise<ProjectPayload | null>;
      openProjectPath: (projectRoot: string) => Promise<ProjectPayload>;
      refreshProject: () => Promise<ProjectPayload>;
      readDirectory: (relativePath: string) => Promise<{ path: string; children: FileNode[] }>;
      searchFiles: (query: string) => Promise<FileNode[]>;
      getProjectContext: (request: { selectedPath?: string | null; prompt?: string }) => Promise<ProjectContext>;
      readFile: (relativePath: string) => Promise<{ path: string; content: string }>;
      saveFile: (relativePath: string, content: string) => Promise<{ path: string }>;
      applyPatch: (patchText: string) => Promise<{ changedFiles: string[]; canUndo?: boolean }>;
      applyFileOps: (operations: FileOperation[]) => Promise<{ changedFiles: string[] }>;
      undoLastPatch: () => Promise<{ restoredFiles: string[]; canUndo?: boolean }>;
      inspectCommand: (command: string) => Promise<{
        allowed: boolean;
        reason: string;
        requiresAdmin?: boolean;
        adminReason?: string;
        requiresConfirmation?: boolean;
        commandScope?: "project" | "system";
        systemAction?: {
          action: string;
          label: string;
        };
      }>;
      runCommand: (command: string) => Promise<{
        code: number | null;
        output: string;
        terminalTask?: TerminalTask;
        longRunning?: boolean;
      }>;
      runCommandWithMode: (request: {
        command: string;
        controlMode: "safe" | "full";
        confirmedSystemAction?: boolean;
        commandScope?: "project" | "system";
      }) => Promise<{
        code: number | null;
        output: string;
        command: string;
        commandScope: "project" | "system";
        controlMode: "safe" | "full";
        bypassedDangerCheck: boolean;
        terminalTask?: TerminalTask;
        longRunning?: boolean;
      }>;
      startTerminalTask: (request: {
        command: string;
        title?: string;
        controlMode: "safe" | "full";
        confirmedSystemAction?: boolean;
        commandScope?: "project" | "system";
      }) => Promise<TerminalTask>;
      stopTerminalTask: (taskId: string) => Promise<TerminalTask>;
      writeTerminalInput: (taskId: string, input: string) => Promise<TerminalTask>;
      restartTerminalTask: (taskId: string) => Promise<TerminalTask>;
      listTerminalTasks: () => Promise<TerminalTask[]>;
      onTerminalTaskUpdate: (handler: (payload: TerminalTaskUpdate) => void) => () => void;
      getProjectMemoryState: () => Promise<ProjectMemoryState>;
      saveProjectMemory: (memory: string) => Promise<ProjectMemoryState>;
      saveTask: (task: {
        id?: string | null;
        title?: string;
        summary?: string;
        messages: ChatMessage[];
      }) => Promise<TaskHistory>;
      loadTask: (taskId: string) => Promise<TaskHistory>;
      getConfig: () => Promise<AppConfig>;
      saveConfig: (config: AppConfig) => Promise<void>;
      chat: (request: { provider: ProviderConfig; messages: ChatMessage[] }) => Promise<string>;
      chatStream: (
        request: { provider: ProviderConfig; messages: ChatMessage[] },
        handlers: { onChunk?: (chunk: string) => void },
      ) => Promise<void>;
      cancelActiveChatStream: () => Promise<{ ok: boolean }>;
      testProvider: (provider: ProviderConfig) => Promise<{ ok: boolean; message: string }>;
      platform: () => Promise<{ platform: string; home: string; novayxkHome: string }>;
      getLogInfo: () => Promise<{
        logDir: string;
        appLog: string;
        errorLog: string;
        aiLog: string;
        behaviorLog: string;
        uninstallCleanupLog: string;
        launchDebugLog: string;
      }>;
      readLogs: () => Promise<{
        appLog: string;
        errorLog: string;
        aiLog: string;
        behaviorLog: string;
      }>;
      openLogs: () => Promise<{
        logDir: string;
        appLog: string;
        errorLog: string;
        aiLog: string;
        behaviorLog: string;
        uninstallCleanupLog: string;
        launchDebugLog: string;
      }>;
      getPrivilege: () => Promise<{ platform: string; isAdmin: boolean; canElevate: boolean; isDev: boolean }>;
      restartAsAdmin: () => Promise<{ ok: boolean }>;
    };
  }
}
