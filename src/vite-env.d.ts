/// <reference types="vite/client" />

export type ProviderConfig = {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  apiMode?: "chatCompletions" | "responses" | "imageGenerations";
};

export type ThemeMode = "dark" | "light";

export type AppLanguage = "en" | "zh-CN";

export type LanguagePreferenceSource = "system" | "user";

export type AiControlMode = "safe" | "full";

export type AssistantMode = "low" | "standard" | "deep";

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

export type WorkspaceLayoutConfig = {
  leftPanelWidth?: number;
  rightPanelWidth?: number;
  bottomPanelHeight?: number;
  isLeftCollapsed?: boolean;
  isRightCollapsed?: boolean;
  isBottomCollapsed?: boolean;
};

export type AppConfig = {
  providers: ProviderConfig[];
  activeProviderId: string | null;
  lastProjectRoot?: string | null;
  language?: AppLanguage;
  languagePreferenceSource?: LanguagePreferenceSource;
  theme?: ThemeMode;
  aiControlMode?: AiControlMode;
  assistantMode?: AssistantMode;
  browserShowAdvancedControls?: boolean;
  hasSeenWelcome?: boolean;
  hasSeenWorkspaceGuide?: boolean;
  pendingAdminResume?: PendingAdminResume | null;
  workspaceLayout?: WorkspaceLayoutConfig;
};

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
  elapsedMs?: number;
  tokenUsage?: TokenUsage;
  attachments?: GeneratedImageAttachment[];
};

export type TokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimated?: boolean;
};

export type GeneratedImageAttachment = {
  type: "image";
  path: string;
  url: string;
  mimeType: string;
  prompt?: string;
  revisedPrompt?: string;
  createdAt?: string;
};

export type ProjectTextFile = {
  kind: "text";
  path: string;
  content: string;
};

export type ProjectImageFile = {
  kind: "image";
  path: string;
  url: string;
  mimeType: string;
  size: number;
};

export type ProjectSelectedFile = ProjectTextFile | ProjectImageFile;

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
    }
  | {
      type: "replace";
      path: string;
      search: string;
      replace: string;
      occurrence?: "first" | "all";
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

export type BrowserActionRecord = {
  id: string;
  source: "user" | "system";
  type: "click" | "input" | "change" | "submit" | "navigate";
  url: string;
  selector?: string;
  targetLabel?: string;
  valuePreview?: string;
  createdAt: string;
};

export type BrowserNetworkRecord = {
  id: string;
  url: string;
  method: string;
  stage: "request" | "response" | "error";
  statusCode?: number;
  resourceType?: string;
  durationMs?: number;
  errorText?: string;
  requestHeaders?: Record<string, string>;
  requestBodyText?: string;
  responseHeaders?: Record<string, string>;
  responseBodyText?: string;
  responseContentType?: string;
  source?: "webRequest" | "fetch" | "xhr";
  createdAt: string;
};

export type BrowserTraceSnapshot = {
  path: string;
  preview: string;
};

export type BrowserSnapshot = {
  currentUrl: string;
  title: string;
  canGoBack: boolean;
  canGoForward: boolean;
  isLoading: boolean;
  startedAt: string;
};

export type BrowserPageEvent = {
  type: "did-start-loading" | "did-stop-loading" | "page-title-updated" | "did-navigate" | "did-navigate-in-page";
  snapshot: BrowserSnapshot;
};

export type BrowserAutomationResult = {
  ok: boolean;
  action: "navigate" | "click" | "type" | "waitFor" | "pressKey" | "scrollTo" | "select" | "extractText" | "runScript";
  selector?: string;
  text?: string;
  elapsedMs?: number;
  preview: string;
};

export type BrowserRemoteRequest =
  | {
      type: "navigate";
      url: string;
    }
  | {
      type: "command";
      command: "reload" | "back" | "forward";
    }
  | {
      type: "automation";
      action: import("./browser/actions").BrowserAutomationAction;
      focus?: boolean;
    }
  | {
      type: "prompt-context";
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
      getProjectFileAsset: (relativePath: string) => Promise<ProjectImageFile>;
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
      generateImage: (request: {
        provider: ProviderConfig;
        prompt: string;
        size?: string;
        n?: number;
      }) => Promise<{ ok: boolean; message: string; images: GeneratedImageAttachment[] }>;
      cancelImageGeneration: () => Promise<{ ok: boolean }>;
      openGeneratedImage: (imagePath: string) => Promise<{ ok: boolean }>;
      copyGeneratedImage: (imagePath: string) => Promise<{ ok: boolean }>;
      saveGeneratedImageToProject: (request: {
        imagePath: string;
        targetPath?: string;
      }) => Promise<{ ok: boolean; path: string; relativePath: string }>;
      testProvider: (provider: ProviderConfig) => Promise<{ ok: boolean; message: string }>;
      listProviderModels: (provider: ProviderConfig) => Promise<{ ok: boolean; message: string; models: string[] }>;
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
      openBrowserWorkspaceWindow: () => Promise<{ ok: boolean }>;
      browserRunInWorkspaceWindow: (request: BrowserRemoteRequest) => Promise<unknown>;
      getBrowserSnapshot: () => Promise<BrowserSnapshot>;
      browserNavigate: (url: string) => Promise<BrowserSnapshot>;
      browserReload: () => Promise<BrowserSnapshot>;
      browserGoBack: () => Promise<BrowserSnapshot>;
      browserGoForward: () => Promise<BrowserSnapshot>;
      browserClearLogs: () => Promise<{ ok: boolean }>;
      browserGetActionLog: () => Promise<BrowserActionRecord[]>;
      browserGetNetworkLog: () => Promise<BrowserNetworkRecord[]>;
      browserGetGuestPreloadUrl: () => Promise<string>;
      browserGetTrace?: () => Promise<BrowserTraceSnapshot>;
      syncBrowserSnapshot: (snapshot: Partial<BrowserSnapshot>) => void;
      emitBrowserPageEvent: (type: BrowserPageEvent["type"], snapshot: Partial<BrowserSnapshot>) => void;
      emitBrowserActionObserved: (payload: BrowserActionRecord) => void;
      emitBrowserNetworkObserved: (payload: BrowserNetworkRecord) => void;
      onBrowserPageEvent: (handler: (payload: BrowserPageEvent) => void) => () => void;
      onBrowserActionEvent: (handler: (payload: BrowserActionRecord) => void) => () => void;
      onBrowserNetworkEvent: (handler: (payload: BrowserNetworkRecord) => void) => () => void;
      onBrowserWorkspaceCommand: (handler: (payload: { requestId: string; request: BrowserRemoteRequest }) => void) => () => void;
      notifyBrowserWorkspaceReady: () => void;
      replyBrowserWorkspaceCommand: (requestId: string, payload: { ok: boolean; result?: unknown; error?: string }) => void;
    };
  }
}

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        src?: string;
        partition?: string;
        allowpopups?: string;
        webpreferences?: string;
      };
    }
  }
}
