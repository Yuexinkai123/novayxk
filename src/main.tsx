import React from "react";
import ReactDOM from "react-dom/client";
import {
  Bot,
  BookOpen,
  Check,
  ChevronDown,
  ChevronsDown,
  ChevronsLeft,
  ChevronsRight,
  ChevronsUp,
  ChevronRight,
  Code2,
  Copy,
  FileCode2,
  FileSearch,
  FilePlus2,
  Folder,
  FolderOpen,
  FolderPlus,
  History,
  KeyRound,
  LockKeyhole,
  Moon,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  RotateCw,
  Square,
  Search,
  Send,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  TriangleAlert,
  UnlockKeyhole,
  X,
} from "lucide-react";
import "./styles.css";
import novayxkLogo from "../assets/icons/novayxk-64.png";
import type {
  AppConfig,
  ChatMessage,
  FileNode,
  FileOperation,
  ProjectMemoryState,
  ProjectContext,
  ProjectPayload,
  ProviderConfig,
  TaskHistory,
  TaskSummary,
  AiControlMode,
  ThemeMode,
  TerminalTask,
} from "./vite-env";

const defaultProvider: ProviderConfig = {
  id: "provider-openai-compatible",
  name: "OpenAI Compatible",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4.1-mini",
  apiMode: "chatCompletions",
};

const emptyMessages: ChatMessage[] = [];

const STREAM_ABORT_MESSAGE = "用户已停止本次生成。";
const STREAM_ABORT_PLACEHOLDER = "已停止本次生成。";
const COMMAND_LOOP_SAFETY_LIMIT = 50;
const COMMAND_LOOP_REPEAT_LIMIT = 2;
const TREE_SEARCH_MIN_LENGTH = 2;

type ConfirmDialogState =
  | {
      type: "command";
      command: string;
      reason: string;
    }
  | {
      type: "patch";
      patchText: string;
      files: string[];
    }
  | {
      type: "fileops";
      operations: FileOperation[];
    }
  | {
      type: "system-action";
      command: string;
      label: string;
      source: "manual" | "ai";
      resolve: (confirmed: boolean) => void;
    }
  | {
      type: "admin-request";
      command: string;
      reason: string;
      source: "manual" | "ai";
      resolve: (confirmed: boolean) => void;
    };

type PrivilegeState = {
  platform: string;
  isAdmin: boolean;
  canElevate: boolean;
  isDev: boolean;
};

function App() {
  const LEFT_PANEL_MIN_WIDTH = 268;
  const initialConfig = window.novayxk?.initialConfig;
  const initialProviders = initialConfig?.providers?.length ? initialConfig.providers : [defaultProvider];
  const initialActiveProviderId = getProviderId(initialProviders, initialConfig?.activeProviderId, initialProviders[0].id);
  const initialTheme = isThemeMode(initialConfig?.theme) ? initialConfig.theme : "dark";
  const initialAiControlMode = isAiControlMode(initialConfig?.aiControlMode) ? initialConfig.aiControlMode : "safe";
  const [providers, setProviders] = React.useState<ProviderConfig[]>(initialProviders);
  const [activeProviderId, setActiveProviderId] = React.useState(initialActiveProviderId);
  const [editingProviderId, setEditingProviderId] = React.useState(initialActiveProviderId);
  const [lastProjectRoot, setLastProjectRoot] = React.useState<string | null>(null);
  const [project, setProject] = React.useState<ProjectPayload | null>(null);
  const [selectedFile, setSelectedFile] = React.useState<{ path: string; content: string } | null>(null);
  const [activeTreePath, setActiveTreePath] = React.useState<string | null>(null);
  const [activeTreeNodeType, setActiveTreeNodeType] = React.useState<FileNode["type"] | null>(null);
  const [messages, setMessages] = React.useState<ChatMessage[]>(emptyMessages);
  const [prompt, setPrompt] = React.useState("");
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
  const [isMemoryOpen, setIsMemoryOpen] = React.useState(false);
  const [confirmDialog, setConfirmDialog] = React.useState<ConfirmDialogState | null>(null);
  const [canUndoPatch, setCanUndoPatch] = React.useState(false);
  const [providerTestStatus, setProviderTestStatus] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [isTestingProvider, setIsTestingProvider] = React.useState(false);
  const [isEditorDirty, setIsEditorDirty] = React.useState(false);
  const [isStopping, setIsStopping] = React.useState(false);
  const [loadingStartedAt, setLoadingStartedAt] = React.useState<number | null>(null);
  const [loadingElapsedMs, setLoadingElapsedMs] = React.useState(0);
  const [status, setStatus] = React.useState("准备就绪");
  const [expandedPaths, setExpandedPaths] = React.useState<Set<string>>(new Set(["src"]));
  const [memoryState, setMemoryState] = React.useState<ProjectMemoryState | null>(null);
  const [projectMemoryDraft, setProjectMemoryDraft] = React.useState("");
  const [activeTaskId, setActiveTaskId] = React.useState<string | null>(null);
  const [activeTaskTitle, setActiveTaskTitle] = React.useState("新任务");
  const [activeTaskSummary, setActiveTaskSummary] = React.useState("");
  const [aiControlMode, setAiControlMode] = React.useState<AiControlMode>(initialAiControlMode);
  const [privilege, setPrivilege] = React.useState<PrivilegeState | null>(null);
  const [isRestartingAsAdmin, setIsRestartingAsAdmin] = React.useState(false);
  const [theme, setTheme] = React.useState<ThemeMode>(initialTheme);
  const [leftPanelWidth, setLeftPanelWidth] = React.useState(280);
  const [rightPanelWidth, setRightPanelWidth] = React.useState(400);
  const [bottomPanelHeight, setBottomPanelHeight] = React.useState(272);
  const [isLeftCollapsed, setIsLeftCollapsed] = React.useState(false);
  const [isRightCollapsed, setIsRightCollapsed] = React.useState(false);
  const [isBottomCollapsed, setIsBottomCollapsed] = React.useState(false);
  const [treeFilter, setTreeFilter] = React.useState("");
  const [treeSearchResults, setTreeSearchResults] = React.useState<FileNode[] | null>(null);
  const [isSearchingTree, setIsSearchingTree] = React.useState(false);
  const [loadingDirectories, setLoadingDirectories] = React.useState<Set<string>>(new Set());
  const [editorFind, setEditorFind] = React.useState("");
  const [isWordWrapEnabled, setIsWordWrapEnabled] = React.useState(false);
  const [terminalCommand, setTerminalCommand] = React.useState("npm run dev");
  const [terminalTasks, setTerminalTasks] = React.useState<TerminalTask[]>([]);
  const [activeTerminalTaskId, setActiveTerminalTaskId] = React.useState<string | null>(null);
  const chatListRef = React.useRef<HTMLDivElement | null>(null);

  const activeProvider = providers.find((provider) => provider.id === activeProviderId) ?? providers[0] ?? defaultProvider;
  const editingProvider = providers.find((provider) => provider.id === editingProviderId) ?? activeProvider;
  const fileTree = project?.tree ?? [];
  const runtimePermissionContext = React.useMemo(
    () => ({
      controlMode: aiControlMode,
      isAdmin: privilege?.isAdmin === true,
      privilegeLabel: privilege?.isAdmin ? "管理员权限" : privilege ? "普通权限" : "未知权限",
    }),
    [aiControlMode, privilege],
  );
  const hasTreeFilter = treeFilter.trim().length > 0;
  const filteredFileTree = React.useMemo(
    () => treeSearchResults ?? filterFileTree(fileTree, treeFilter),
    [fileTree, treeFilter, treeSearchResults],
  );
  const selectedFileStats = React.useMemo(() => getEditorStats(selectedFile?.content ?? ""), [selectedFile?.content]);
  const editorFindMatches = React.useMemo(
    () => countTextMatches(selectedFile?.content ?? "", editorFind),
    [editorFind, selectedFile?.content],
  );
  const activeTask = memoryState?.tasks.find((task) => task.id === activeTaskId) ?? null;
  const activeTerminalTask = terminalTasks.find((task) => task.id === activeTerminalTaskId) ?? terminalTasks[0] ?? null;
  const runningTerminalTaskCount = terminalTasks.filter((task) => task.status === "running").length;
  const workspaceStyle: React.CSSProperties = {
    gridTemplateColumns: `${isLeftCollapsed ? "0px" : `${leftPanelWidth}px 6px`} minmax(420px, 1fr) ${
      isRightCollapsed ? "0px" : `6px ${rightPanelWidth}px`
    }`,
  };
  const editorStyle: React.CSSProperties = {
    gridTemplateRows: isBottomCollapsed
      ? "58px minmax(220px, 1fr) 0px"
      : `58px minmax(220px, 1fr) 6px ${bottomPanelHeight}px`,
  };

  React.useEffect(() => {
    window.novayxk
      ?.getConfig()
      .then(async (config) => {
        if (config.providers?.length) {
          const restoredActiveId = getProviderId(config.providers, config.activeProviderId, config.providers[0].id);
          setProviders(config.providers);
          setActiveProviderId(restoredActiveId);
          setEditingProviderId(restoredActiveId);
        }
        if (isThemeMode(config.theme)) {
          setTheme(config.theme);
        }
        if (isAiControlMode(config.aiControlMode)) {
          setAiControlMode(config.aiControlMode);
        }
        if (config.lastProjectRoot) {
          setLastProjectRoot(config.lastProjectRoot);
          await restoreLastProject(config.lastProjectRoot);
        }
      })
      .catch(() => setStatus("配置读取失败，可继续手动填写。"));
  }, []);

  React.useEffect(() => {
    void refreshPrivilegeState();
  }, []);

  React.useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  React.useEffect(() => {
    const chatList = chatListRef.current;
    if (chatList) {
      chatList.scrollTop = chatList.scrollHeight;
    }
  }, [messages, isLoading]);

  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void saveSelectedFile();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [selectedFile, isEditorDirty, project]);

  React.useEffect(() => {
    if (!isLoading || !loadingStartedAt) {
      setLoadingElapsedMs(0);
      return;
    }

    setLoadingElapsedMs(Date.now() - loadingStartedAt);
    const timer = window.setInterval(() => {
      setLoadingElapsedMs(Date.now() - loadingStartedAt);
    }, 200);

    return () => window.clearInterval(timer);
  }, [isLoading, loadingStartedAt]);

  React.useEffect(() => {
    if (!project || !window.novayxk) {
      setTreeSearchResults(null);
      setIsSearchingTree(false);
      return;
    }

    const query = treeFilter.trim();
    if (query.length < TREE_SEARCH_MIN_LENGTH) {
      setTreeSearchResults(null);
      setIsSearchingTree(false);
      return;
    }

    let cancelled = false;
    setIsSearchingTree(true);
    const timer = window.setTimeout(() => {
      window.novayxk
        ?.searchFiles(query)
        .then((results) => {
          if (!cancelled) setTreeSearchResults(results);
        })
        .catch((error) => {
          if (!cancelled) {
            setTreeSearchResults(null);
            setStatus(error instanceof Error ? error.message : "搜索文件失败");
          }
        })
        .finally(() => {
          if (!cancelled) setIsSearchingTree(false);
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [treeFilter, project?.root]);

  React.useEffect(() => {
    if (!window.novayxk) return;
    void refreshTerminalTasks();
    return window.novayxk.onTerminalTaskUpdate((payload) => {
      setTerminalTasks((current) => {
        const next = upsertTerminalTask(current, payload.task);
        return next;
      });
      setActiveTerminalTaskId((current) => (payload.event === "started" ? payload.task.id : current ?? payload.task.id));
    });
  }, []);

  const startPanelResize = (
    event: React.PointerEvent,
    panel: "left" | "right" | "bottom",
  ) => {
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = leftPanelWidth;
    const startRight = rightPanelWidth;
    const startBottom = bottomPanelHeight;

    const onMove = (moveEvent: PointerEvent) => {
      if (panel === "left") {
        setLeftPanelWidth(clamp(startLeft + moveEvent.clientX - startX, LEFT_PANEL_MIN_WIDTH, 420));
      } else if (panel === "right") {
        setRightPanelWidth(clamp(startRight - (moveEvent.clientX - startX), 320, 620));
      } else {
        setBottomPanelHeight(clamp(startBottom - (moveEvent.clientY - startY), 180, 420));
      }
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      document.body.classList.remove("is-resizing");
      delete document.body.dataset.resizePanel;
    };

    document.body.classList.add("is-resizing");
    document.body.dataset.resizePanel = panel;
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp, { once: true });
    window.addEventListener("pointercancel", onUp, { once: true });
  };

  const saveAppConfig = async (patch: Partial<AppConfig> = {}) => {
    await window.novayxk?.saveConfig({
      providers,
      activeProviderId,
      lastProjectRoot,
      theme,
      aiControlMode,
      ...patch,
    });
  };

  const saveProviders = async (nextProviders = providers, nextActiveId = activeProviderId) => {
    const resolvedActiveId = getProviderId(nextProviders, nextActiveId, activeProviderId);
    setProviders(nextProviders);
    setActiveProviderId(resolvedActiveId);
    if (!nextProviders.some((provider) => provider.id === editingProviderId)) {
      setEditingProviderId(resolvedActiveId);
    }
    await saveAppConfig({ providers: nextProviders, activeProviderId: resolvedActiveId });
    setStatus("模型供应商配置已保存");
  };

  const switchActiveProvider = async (providerId: string) => {
    const nextActiveId = getProviderId(providers, providerId, activeProviderId);
    setActiveProviderId(nextActiveId);
    setEditingProviderId(nextActiveId);
    setStatus("已切换模型供应商");
    try {
      await saveAppConfig({ activeProviderId: nextActiveId });
    } catch {
      setStatus("模型已切换，但保存默认模型失败");
    }
  };

  const updateTheme = async (nextTheme: ThemeMode) => {
    setTheme(nextTheme);
    try {
      await saveAppConfig({ theme: nextTheme });
    } catch {
      setStatus("主题已切换，但保存偏好失败");
    }
  };

  const updateAiControlMode = async (nextMode: AiControlMode) => {
    setAiControlMode(nextMode);
    try {
      await saveAppConfig({ aiControlMode: nextMode });
    } catch {
      setStatus("权限模式已切换，但保存偏好失败");
    }
  };

  const refreshPrivilegeState = async () => {
    if (!window.novayxk) return;
    try {
      const nextPrivilege = await window.novayxk.getPrivilege();
      setPrivilege(nextPrivilege);
    } catch {
      setPrivilege(null);
    }
  };

  const restartAsAdmin = async () => {
    if (!window.novayxk || isRestartingAsAdmin) return;
    setIsRestartingAsAdmin(true);
    setStatus("正在请求 Windows 管理员权限...");
    try {
      await window.novayxk.restartAsAdmin();
    } catch (error) {
      setIsRestartingAsAdmin(false);
      setStatus(error instanceof Error ? error.message : "管理员模式启动失败");
    }
  };

  const confirmSystemAction = React.useCallback(
    (command: string, label: string, source: "manual" | "ai") =>
      new Promise<boolean>((resolve) => {
        setConfirmDialog({
          type: "system-action",
          command,
          label,
          source,
          resolve,
        });
      }),
    [],
  );

  const confirmAdminRequest = React.useCallback(
    (command: string, reason: string, source: "manual" | "ai") =>
      new Promise<boolean>((resolve) => {
        setConfirmDialog({
          type: "admin-request",
          command,
          reason,
          source,
          resolve,
        });
      }),
    [],
  );

  const requestAdminForCommandIfNeeded = async (
    command: string,
    inspection: { requiresAdmin?: boolean; adminReason?: string },
    source: "manual" | "ai",
  ) => {
    if (!inspection.requiresAdmin || privilege?.isAdmin || !privilege?.canElevate) return true;
    const confirmed = await confirmAdminRequest(command, inspection.adminReason ?? "该命令可能需要管理员权限", source);
    if (!confirmed) return false;
    try {
      await restartAsAdmin();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "管理员授权请求失败");
    }
    return false;
  };

  const saveLastProjectRoot = async (projectRoot: string | null) => {
    setLastProjectRoot(projectRoot);
    await saveAppConfig({ lastProjectRoot: projectRoot });
  };

  const refreshMemoryState = async () => {
    if (!window.novayxk || !project) return null;
    const state = await window.novayxk.getProjectMemoryState();
    setMemoryState(state);
    setProjectMemoryDraft(state.memory);
    return state;
  };

  const saveCurrentTask = async (messagesToSave = messages) => {
    if (!window.novayxk || !project) return null;
    const cleanMessages = sanitizeChatHistory(messagesToSave);
    const task = await window.novayxk.saveTask({
      id: activeTaskId,
      title: !activeTaskId && activeTaskTitle === "新任务" ? undefined : activeTaskTitle,
      summary: activeTaskSummary || summarizeTaskForUi(cleanMessages),
      messages: cleanMessages,
    });
    setActiveTaskId(task.id);
    setActiveTaskTitle(task.title);
    setActiveTaskSummary(task.summary);
    await refreshMemoryState();
    return task;
  };

  const saveCurrentTaskWithStatus = async () => {
    try {
      const task = await saveCurrentTask(messages);
      if (task) setStatus(`已保存任务历史：${task.title}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "保存任务失败");
    }
  };

  const startNewTask = async () => {
    setActiveTaskId(null);
    setActiveTaskTitle("新任务");
    setActiveTaskSummary("");
    setMessages(emptyMessages);
    setStatus("已新建任务历史");
  };

  const loadTask = async (taskId: string) => {
    if (!taskId) return;
    try {
      if (!window.novayxk) {
        throw new Error("当前在浏览器预览模式，任务历史需要用 Electron 启动。");
      }
      const task = await window.novayxk.loadTask(taskId);
      setActiveTaskId(task.id);
      setActiveTaskTitle(task.title);
      setActiveTaskSummary(task.summary);
      setMessages(sanitizeChatHistory(task.messages));
      setStatus(`已载入任务历史：${task.title}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "载入任务失败");
    }
  };

  const saveProjectMemoryDraft = async () => {
    try {
      if (!window.novayxk || !project) {
        throw new Error("请先打开一个项目。");
      }
      const state = await window.novayxk.saveProjectMemory(projectMemoryDraft);
      setMemoryState(state);
      setProjectMemoryDraft(state.memory);
      setIsMemoryOpen(false);
      setStatus("项目长期记忆已保存");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "保存项目记忆失败");
    }
  };

  const updateActiveProvider = (patch: Partial<ProviderConfig>) => {
    const nextProviders = providers.map((provider) =>
      provider.id === editingProvider.id ? { ...provider, ...patch } : provider,
    );
    setProviders(nextProviders);
  };

  const addProvider = () => {
    const id = `provider-${Date.now()}`;
    const nextProvider: ProviderConfig = {
      id,
      name: "新供应商",
      baseUrl: "https://api.example.com/v1",
      apiKey: "",
      model: "model-name",
      apiMode: "chatCompletions",
    };
    setProviders([...providers, nextProvider]);
    setEditingProviderId(id);
    setProviderTestStatus("");
  };

  const removeActiveProvider = async () => {
    if (providers.length <= 1) {
      setProviderTestStatus("至少保留一个供应商配置。");
      setStatus("至少保留一个供应商配置。");
      return;
    }

    const activeIndex = providers.findIndex((provider) => provider.id === editingProvider.id);
    const nextProviders = providers.filter((provider) => provider.id !== editingProvider.id);
    const fallbackProvider = nextProviders[Math.max(0, Math.min(activeIndex, nextProviders.length - 1))] ?? nextProviders[0];
    const nextActiveId = activeProviderId === editingProvider.id ? fallbackProvider.id : activeProviderId;

    setProviders(nextProviders);
    setActiveProviderId(nextActiveId);
    setEditingProviderId(fallbackProvider.id);
    setProviderTestStatus(`已移除供应商：${editingProvider.name}`);
    setStatus(`已移除供应商：${editingProvider.name}`);
    try {
      await saveAppConfig({ providers: nextProviders, activeProviderId: nextActiveId });
    } catch {
      setStatus("供应商已移除，但保存配置失败");
    }
  };

  const testActiveProvider = async () => {
    setIsTestingProvider(true);
    setProviderTestStatus("正在测试连接...");
    try {
      if (!window.novayxk) {
        throw new Error("当前在浏览器预览模式，测试连接需要用 Electron 启动。");
      }

      const result = await window.novayxk.testProvider(editingProvider);
      setProviderTestStatus(result.message);
      setStatus(result.message);
    } catch (error) {
      const message = error instanceof Error ? error.message : "连接测试失败";
      setProviderTestStatus(message);
      setStatus(message);
    } finally {
      setIsTestingProvider(false);
    }
  };

  const openProject = async () => {
    setStatus("正在选择项目...");
    try {
      const payload = await window.novayxk?.openProject();
      if (payload) {
        await hydrateOpenedProject(payload);
        await saveLastProjectRoot(payload.root);
        setStatus(`已打开项目：${payload.root}`);
      } else {
        setStatus("已取消选择项目");
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "打开项目失败");
    }
  };

  const restoreLastProject = async (projectRoot: string) => {
    if (!window.novayxk) return;
    try {
      setStatus(`正在恢复上次工作区：${projectRoot}`);
      const payload = await window.novayxk.openProjectPath(projectRoot);
      await hydrateOpenedProject(payload);
      setStatus(`已恢复上次工作区：${payload.root}`);
    } catch (error) {
      setProject(null);
      setLastProjectRoot(null);
      setStatus(error instanceof Error ? `上次工作区无法打开：${error.message}` : "上次工作区无法打开");
      await saveAppConfig({ lastProjectRoot: null });
    }
  };

  const hydrateOpenedProject = async (payload: ProjectPayload) => {
    setProject(payload);
    setSelectedFile(null);
    setActiveTreePath(null);
    setActiveTreeNodeType(null);
    setIsEditorDirty(false);
    setTreeFilter("");
    setTreeSearchResults(null);
    setExpandedPaths(new Set(payload.tree.filter((node) => node.type === "directory" && node.loaded).map((node) => node.path)));

    const memory = await window.novayxk?.getProjectMemoryState();
    if (!memory) return;

    setMemoryState(memory);
    setProjectMemoryDraft(memory.memory);
    if (memory.tasks[0]) {
      const task = await window.novayxk?.loadTask(memory.tasks[0].id);
      if (task) {
        setActiveTaskId(task.id);
        setActiveTaskTitle(task.title);
        setActiveTaskSummary(task.summary);
        setMessages(sanitizeChatHistory(task.messages));
      }
    } else {
      setActiveTaskId(null);
      setActiveTaskTitle("新任务");
      setActiveTaskSummary("");
      setMessages(emptyMessages);
    }
  };

  const saveSelectedFile = async () => {
    if (!selectedFile || !isEditorDirty) return true;
    if (!project) {
      setStatus("请先打开一个项目。");
      return false;
    }

    try {
      if (!window.novayxk) {
        throw new Error("当前在浏览器预览模式，保存文件需要用 Electron 启动。");
      }

      await window.novayxk.saveFile(selectedFile.path, selectedFile.content);
      setIsEditorDirty(false);
      setStatus(`已保存 ${selectedFile.path}`);
      const nextProject = await window.novayxk.refreshProject();
      setProject(nextProject);
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "保存文件失败");
      return false;
    }
  };

  const syncProjectView = async (options?: { preferredPath?: string | null; clearMissingSelection?: boolean }) => {
    if (!window.novayxk || !project) return;

    const nextProject = await window.novayxk.refreshProject();
    setProject(nextProject);

    const candidatePath = options?.preferredPath ?? selectedFile?.path ?? null;
    if (!candidatePath) return;

    try {
      const file = await window.novayxk.readFile(candidatePath);
      setSelectedFile(file);
      setActiveTreePath(candidatePath);
      setActiveTreeNodeType("file");
      revealTreePath(candidatePath);
      setIsEditorDirty(false);
    } catch (error) {
      if (options?.clearMissingSelection !== false) {
        const message = error instanceof Error ? error.message : "";
        if (message.includes("ENOENT")) {
          if (selectedFile?.path === candidatePath) {
            setSelectedFile(null);
            setIsEditorDirty(false);
          }
          if (activeTreePath === candidatePath) {
            setActiveTreePath(null);
            setActiveTreeNodeType(null);
          }
          setStatus(`文件已不存在，已刷新工作区：${candidatePath}`);
          return;
        }
      }
      throw error;
    }
  };

  const loadTreeDirectory = async (directoryPath: string) => {
    if (!project || !window.novayxk || hasTreeFilter) return;
    const targetNode = findTreeNode(project.tree, directoryPath);
    if (!targetNode || targetNode.type !== "directory" || targetNode.loaded || loadingDirectories.has(directoryPath)) return;

    setLoadingDirectories((current) => new Set(current).add(directoryPath));
    try {
      const payload = await window.novayxk.readDirectory(directoryPath);
      setProject((current) =>
        current
          ? {
              ...current,
              tree: updateTreeNode(current.tree, payload.path, (node) => ({
                ...node,
                children: payload.children,
                loaded: true,
              })),
            }
          : current,
      );
      setStatus(`已加载目录：${directoryPath || shortPath(project.root)}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "加载目录失败");
    } finally {
      setLoadingDirectories((current) => {
        const next = new Set(current);
        next.delete(directoryPath);
        return next;
      });
    }
  };

  const selectFile = async (node: FileNode) => {
    setActiveTreePath(node.path);
    setActiveTreeNodeType(node.type);
    if (node.type === "directory") {
      const next = new Set(expandedPaths);
      if (next.has(node.path)) {
        next.delete(node.path);
      } else {
        next.add(node.path);
        void loadTreeDirectory(node.path);
      }
      setExpandedPaths(next);
      return;
    }

    if (!project) {
      setSelectedFile({ path: node.path, content: "打开真实项目后，这里会显示文件内容。" });
      return;
    }

    if (isEditorDirty && selectedFile && selectedFile.path !== node.path) {
      const saved = await saveSelectedFile();
      if (!saved) return;
    }

    setStatus(`正在读取 ${node.path}`);
    try {
      const file = await window.novayxk?.readFile(node.path);
      if (file) {
        setSelectedFile(file);
        setActiveTreePath(file.path);
        setActiveTreeNodeType("file");
        revealTreePath(file.path);
        setIsEditorDirty(false);
        setStatus(`已读取 ${file.path}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "读取文件失败";
      if (message.includes("ENOENT")) {
        try {
          await syncProjectView({ preferredPath: null });
        } catch {
          // Ignore follow-up refresh errors and show the original read error context below.
        }
        if (selectedFile?.path === node.path) {
          setSelectedFile(null);
          setIsEditorDirty(false);
        }
        if (activeTreePath === node.path) {
          setActiveTreePath(null);
          setActiveTreeNodeType(null);
        }
        setStatus(`文件不存在，工作区已刷新：${node.path}`);
        return;
      }
      setStatus(message);
    }
  };

  const revealTreePath = (relativePath: string) => {
    setExpandedPaths((current) => {
      const next = new Set(current);
      for (const part of listAncestorPaths(relativePath)) {
        next.add(part);
      }
      return next;
    });
  };

  const refreshTree = async () => {
    if (!project || !window.novayxk) {
      setStatus("请先打开一个项目。");
      return;
    }

    try {
      setStatus("正在刷新工作区...");
      await syncProjectView();
      setStatus(`已刷新工作区：${shortPath(project.root)}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "刷新工作区失败");
    }
  };

  const expandAllTreeFolders = () => {
    setExpandedPaths(new Set(collectDirectoryPaths(fileTree)));
    setStatus("已展开已加载的目录；未加载目录会在点击时读取。");
  };

  const collapseAllTreeFolders = () => {
    setExpandedPaths(new Set());
    setStatus("已收起全部目录");
  };

  const getPreferredTreeDirectory = () => {
    if (activeTreePath) {
      return activeTreeNodeType === "directory" ? activeTreePath : getParentDirectory(activeTreePath);
    }
    if (selectedFile?.path) {
      return getParentDirectory(selectedFile.path);
    }
    return "";
  };

  const createTreeEntry = async (kind: "file" | "directory") => {
    if (!project || !window.novayxk) {
      setStatus("请先打开一个项目。");
      return;
    }

    const baseDir = getPreferredTreeDirectory();
    const defaultPath =
      kind === "file"
        ? joinRelativePath(baseDir, "new-file.txt")
        : joinRelativePath(baseDir, "new-folder");
    const input = window.prompt(kind === "file" ? "输入新文件路径" : "输入新文件夹路径", defaultPath);
    const targetPath = normalizeRelativePath(input ?? "");
    if (!targetPath) return;

    try {
      if (kind === "file") {
        await window.novayxk.applyFileOps([{ type: "write", path: targetPath, content: "" }]);
        await syncProjectView({ preferredPath: targetPath });
        setStatus(`已新建文件：${targetPath}`);
      } else {
        await window.novayxk.applyFileOps([{ type: "mkdir", path: targetPath }]);
        revealTreePath(targetPath);
        await syncProjectView({ preferredPath: null });
        setActiveTreePath(targetPath);
        setActiveTreeNodeType("directory");
        setStatus(`已新建文件夹：${targetPath}`);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : `新建${kind === "file" ? "文件" : "文件夹"}失败`);
    }
  };

  const refreshTerminalTasks = async () => {
    if (!window.novayxk) return;
    try {
      const tasks = await window.novayxk.listTerminalTasks();
      setTerminalTasks(tasks);
      setActiveTerminalTaskId((current) => current ?? tasks[0]?.id ?? null);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "读取终端任务失败");
    }
  };

  const startTerminalTask = async () => {
    const command = terminalCommand.trim();
    if (!command) {
      setStatus("请输入要启动的终端命令。");
      return;
    }
    if (!project || !window.novayxk) {
      setStatus("请先打开一个项目。");
      return;
    }

    try {
      const inspection = await window.novayxk.inspectCommand(command);
      const adminReady = await requestAdminForCommandIfNeeded(command, inspection, "manual");
      if (!adminReady) {
        setStatus("已请求管理员授权，Novayxk 将以管理员模式重启。");
        return;
      }
      const confirmedSystemAction = inspection.requiresConfirmation
        ? await confirmSystemAction(command, inspection.systemAction?.label ?? "系统动作", "manual")
        : false;
      if (inspection.requiresConfirmation && !confirmedSystemAction) {
        setStatus("已取消特殊系统动作");
        return;
      }
      const task = await window.novayxk.startTerminalTask({
        command,
        controlMode: aiControlMode,
        confirmedSystemAction,
      });
      setTerminalTasks((current) => upsertTerminalTask(current, task));
      setActiveTerminalTaskId(task.id);
      setStatus(`终端任务已启动：${task.title}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "启动终端任务失败");
    }
  };

  const stopActiveTerminalTask = async () => {
    if (!activeTerminalTask || !window.novayxk) return;
    try {
      const task = await window.novayxk.stopTerminalTask(activeTerminalTask.id);
      setTerminalTasks((current) => upsertTerminalTask(current, task));
      setStatus(`正在停止终端任务：${task.title}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "停止终端任务失败");
    }
  };

  const restartActiveTerminalTask = async () => {
    if (!activeTerminalTask || !window.novayxk) return;
    try {
      const task = await window.novayxk.restartTerminalTask(activeTerminalTask.id);
      setTerminalTasks((current) => upsertTerminalTask(current, task));
      setActiveTerminalTaskId(task.id);
      setStatus(`终端任务已重启：${task.title}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "重启终端任务失败");
    }
  };

  const copyTerminalOutput = async () => {
    if (!activeTerminalTask?.output) return;
    try {
      await navigator.clipboard.writeText(activeTerminalTask.output);
      setStatus("终端输出已复制");
    } catch {
      setStatus("复制终端输出失败");
    }
  };

  const buildProjectContextForPrompt = async (userPrompt: string) => {
    if (!project || !window.novayxk) return "";

    try {
      const context = await window.novayxk.getProjectContext({
        selectedPath: selectedFile?.path ?? null,
        prompt: userPrompt,
      });
      return formatProjectContext(context);
    } catch (error) {
      setStatus(error instanceof Error ? `项目上下文读取失败：${error.message}` : "项目上下文读取失败");
      return "";
    }
  };

  const sendMessage = async () => {
    const trimmed = prompt.trim();
    if (!trimmed || isLoading) return;

    const projectContext = await buildProjectContextForPrompt(trimmed);
    const selectedFileContext = selectedFile
      ? `\n\n当前选中文件：${selectedFile.path}\n\`\`\`\n${selectedFile.content.slice(0, 12000)}\n\`\`\``
      : "";
    const nextMessages: ChatMessage[] = [
      ...messages,
      {
        role: "user",
        content: trimmed,
      },
    ];

    setPrompt("");
    setMessages(nextMessages);
    setIsLoading(true);
    let streamedContent = "";
    const responseStartedAt = Date.now();
    setLoadingStartedAt(responseStartedAt);
    setLoadingElapsedMs(0);
    setStatus("正在请求模型...");

    try {
      if (!window.novayxk) {
        throw new Error("当前在浏览器预览模式，真实模型请求需要用 Electron 启动。");
      }

      const requestMessages: ChatMessage[] = [
        {
          role: "system",
          content: buildSystemPrompt(memoryState?.memory ?? "", activeTaskSummary, runtimePermissionContext),
        },
        ...buildModelChatHistory(nextMessages, `${selectedFileContext}${projectContext}`),
      ];

      setMessages([...nextMessages, { role: "assistant", content: "" }]);
      await window.novayxk.chatStream(
        {
          provider: activeProvider,
          messages: requestMessages,
        },
        {
          onChunk: (chunk) => {
            streamedContent += chunk;
            setMessages([...nextMessages, { role: "assistant", content: streamedContent }]);
          },
        },
      );

      const completedMessages: ChatMessage[] = [
        ...nextMessages,
        {
          role: "assistant",
          content: streamedContent,
          elapsedMs: Date.now() - responseStartedAt,
        },
      ];
      setMessages(completedMessages);
      const fileOpMessages = await executeAiFileOperations(streamedContent, completedMessages);
      const commandResultMessages = await executeAiPowerShellCommands(streamedContent, fileOpMessages ?? completedMessages);
      await saveCurrentTask(commandResultMessages ?? fileOpMessages ?? completedMessages);
      setStatus(commandResultMessages ? "模型已整理命令结果" : "模型响应完成");
    } catch (error) {
      const content = error instanceof Error ? error.message : "模型请求失败";
      if (content === STREAM_ABORT_MESSAGE) {
        const stoppedContent = streamedContent.trim() || "已停止本次生成。";
        const stoppedMessages: ChatMessage[] = [
          ...nextMessages,
          {
            role: "assistant",
            content: stoppedContent,
            elapsedMs: Date.now() - responseStartedAt,
          },
        ];
        setMessages(stoppedMessages);
        setStatus("已停止本次生成");
        if (streamedContent.trim()) {
          await saveCurrentTask(stoppedMessages);
        }
        return;
      }
      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content,
          elapsedMs: Date.now() - responseStartedAt,
        },
      ]);
      setStatus(content);
    } finally {
      setIsLoading(false);
      setIsStopping(false);
      setLoadingStartedAt(null);
    }
  };

  const stopGeneration = async () => {
    if (!isLoading || !window.novayxk || isStopping) return;
    setIsStopping(true);
    setStatus("正在停止生成...");
    try {
      await window.novayxk.cancelActiveChatStream();
    } catch (error) {
      setIsStopping(false);
      setStatus(error instanceof Error ? error.message : "停止生成失败");
    }
  };

  const executeConfirmedCommand = async (confirmedCommand: string) => {
    setIsLoading(true);
    setStatus("正在执行命令...");
    try {
      if (!window.novayxk) {
        throw new Error("当前在浏览器预览模式，执行命令需要用 Electron 启动。");
      }
      const inspection = await window.novayxk.inspectCommand(confirmedCommand);
      const adminReady = await requestAdminForCommandIfNeeded(confirmedCommand, inspection, "manual");
      if (!adminReady) {
        setStatus("已请求管理员授权，Novayxk 将以管理员模式重启。");
        return;
      }
      const confirmedSystemAction = inspection.requiresConfirmation
        ? await confirmSystemAction(confirmedCommand, inspection.systemAction?.label ?? "系统动作", "manual")
        : false;
      if (inspection.requiresConfirmation && !confirmedSystemAction) {
        setStatus("已取消特殊系统动作");
        return;
      }
      const result = await window.novayxk.runCommandWithMode({
        command: confirmedCommand,
        controlMode: "full",
        confirmedSystemAction,
      });
      await syncProjectView();
      setStatus(result.longRunning ? "命令已在终端任务中运行" : result.code === 0 ? "命令执行成功" : "命令执行失败，输出已保留");
    } catch (error) {
      const output = error instanceof Error ? error.message : "命令执行失败";
      setStatus(output);
    } finally {
      setIsLoading(false);
    }
  };

  const executeAiPowerShellCommands = async (
    assistantContent: string,
    baseMessages: ChatMessage[],
    commandLoopState: CommandLoopState = createCommandLoopState(),
  ) => {
    const commands = extractPowerShellCommandRequests(assistantContent);
    if (!commands.length) return null;
    if (!project) {
      const blockedMessages: ChatMessage[] = [
        ...baseMessages,
        { role: "assistant", content: "检测到 PowerShell 命令，但还没有打开项目，所以没有执行。" },
      ];
      setMessages(blockedMessages);
      return blockedMessages;
    }
    const loopCheck = inspectCommandLoop(commands, commandLoopState);
    if (loopCheck.shouldStop) {
      const stoppedMessages: ChatMessage[] = [
        ...baseMessages,
        {
          role: "assistant",
          content: `Novayxk 已自动停止连续 PowerShell 执行：${loopCheck.reason}\n\n最近反复出现的命令：\n\n\`\`\`powershell\n${commands
            .map((command) => command.command)
            .join("\n\n")
            .slice(0, 3000)}\n\`\`\`\n\n我没有继续执行重复步骤。建议换一种安装源、检查前一步错误原因，或让用户确认下一步。`,
        },
      ];
      setMessages(stoppedMessages);
      setStatus("检测到重复 PowerShell 步骤，已自动中断");
      return stoppedMessages;
    }

    const resultLines: string[] = [];
    for (const commandRequest of commands.slice(0, 5)) {
      const commandText = commandRequest.command.trim();
      if (!commandText) continue;
      setStatus(aiControlMode === "full" ? "AI 正在以完全控制模式执行 PowerShell..." : "AI 正在以默认权限执行 PowerShell...");

      try {
        if (!window.novayxk) {
          throw new Error("当前在浏览器预览模式，执行命令需要用 Electron 启动。");
        }
        const inspection = await window.novayxk.inspectCommand(commandText);
        const adminReady = await requestAdminForCommandIfNeeded(commandText, inspection, "ai");
        if (!adminReady) {
          resultLines.push(`$ ${commandText}\n需要管理员权限：${inspection.adminReason ?? "该命令可能需要管理员权限"}。Novayxk 已请求用户授权以管理员模式重启，命令尚未执行。`);
          continue;
        }
        const confirmedSystemAction = inspection.requiresConfirmation
          ? await confirmSystemAction(commandText, inspection.systemAction?.label ?? "系统动作", "ai")
          : false;
        if (inspection.requiresConfirmation && !confirmedSystemAction) {
          resultLines.push(`$ ${commandText}\n特殊系统动作已取消：${inspection.systemAction?.label ?? "系统动作"}`);
          continue;
        }
        const result = await window.novayxk.runCommandWithMode({
          command: commandText,
          controlMode: aiControlMode,
          confirmedSystemAction,
        });
        const sourceNote = commandRequest.source === "inline" ? "来源：普通文本中识别出的疑似命令" : "来源：powershell-run 代码块";
        const taskNote = result.terminalTask ? `终端任务：${result.terminalTask.id}` : "";
        const output = `${sourceNote}\n${taskNote ? `${taskNote}\n` : ""}$ ${commandText}\n${result.output}\n${result.longRunning ? "状态：仍在终端任务中运行" : `退出码：${result.code}`}`;
        resultLines.push(output);
      } catch (error) {
        const message = error instanceof Error ? error.message : "AI PowerShell 执行失败";
        const sourceNote = commandRequest.source === "inline" ? "来源：普通文本中识别出的疑似命令" : "来源：powershell-run 代码块";
        resultLines.push(`${sourceNote}\n$ ${commandText}\n${message}`);
      }
    }

    try {
      await syncProjectView();
    } catch {
      // Ignore workspace refresh failures so command summaries still reach the user.
    }

    const executionContent = `PowerShell 执行结果：\n\n\`\`\`text\n${resultLines.join("\n\n").slice(0, 18000)}\n\`\`\``;
    const nextMessages: ChatMessage[] = [
      ...baseMessages,
      {
        role: "assistant",
        content: executionContent,
      },
    ];
    setMessages(nextMessages);
    setStatus("AI 正在整理 PowerShell 执行结果...");

    if (!window.novayxk) {
      return nextMessages;
    }

    try {
      let summaryContent = "";
      const summaryStartedAt = Date.now();
      setLoadingStartedAt(summaryStartedAt);
      setLoadingElapsedMs(0);
      const summaryMessages: ChatMessage[] = [
        {
          role: "system",
          content: `${buildSystemPrompt(memoryState?.memory ?? "", activeTaskSummary, runtimePermissionContext)}

【命令结果整理规则】
Novayxk 已经自动执行了你刚才通过 powershell-run 请求的命令。你现在必须基于命令输出直接回答用户原始问题。
- 不要再要求用户执行命令、复制输出或“把结果发我”。
- 先给明确结论，再给必要的简短解释。
- 如果命令失败，说明失败原因和下一步建议。
- 如果为了完成用户原始任务必须继续执行下一步命令，可以继续输出完整的 powershell-run 代码块；不要把要执行的命令写成普通文字，也不要声称尚未执行的命令已经开始。
- 如果你发现自己准备重复上一轮或前几轮已经执行过的命令，不要继续输出命令；请总结为什么卡住、已经尝试了什么、建议用户下一步怎么确认。
- 如果只是给建议或可选操作，不要再输出 powershell-run、fileops 或 diff 代码块。`,
        },
        ...sanitizeChatHistory(baseMessages),
        {
          role: "user",
          content: `Novayxk 已经自动执行了 PowerShell 命令。请直接回答我最开始的问题，不要只复述原始输出。\n\n${executionContent}`,
        },
      ];

      setMessages([...nextMessages, { role: "assistant", content: "" }]);
      await window.novayxk.chatStream(
        {
          provider: activeProvider,
          messages: summaryMessages,
        },
        {
          onChunk: (chunk) => {
            summaryContent += chunk;
            setMessages([...nextMessages, { role: "assistant", content: summaryContent }]);
          },
        },
      );

      const finalMessages: ChatMessage[] = [
        ...nextMessages,
        {
          role: "assistant",
          content: summaryContent.trim() || "命令已经执行完成，但模型没有返回总结。",
          elapsedMs: Date.now() - summaryStartedAt,
        },
      ];
      setMessages(finalMessages);
      const followUpCommands = extractPowerShellCommandRequests(summaryContent);
      if (followUpCommands.length && commandLoopState.rounds < COMMAND_LOOP_SAFETY_LIMIT) {
        setStatus("检测到后续 PowerShell 步骤，继续执行...");
        return executeAiPowerShellCommands(summaryContent, finalMessages, commandLoopState);
      }
      if (followUpCommands.length) {
        const safetyMessages: ChatMessage[] = [
          ...finalMessages,
          {
            role: "assistant",
            content:
              "Novayxk 已触发连续 PowerShell 执行保险丝：连续步骤过多。为了避免卡死或重复安装，我已停止自动继续。请检查前面的执行结果后再确认下一步。",
          },
        ];
        setMessages(safetyMessages);
        setStatus("连续 PowerShell 步骤过多，已触发保险丝");
        return safetyMessages;
      }
      setStatus(commandLoopState.rounds > 1 ? "AI PowerShell 连续步骤执行完成" : "AI PowerShell 执行完成，并已生成结论");
      return finalMessages;
    } catch (error) {
      const message = error instanceof Error ? error.message : "命令结果总结失败";
      if (message === STREAM_ABORT_MESSAGE) {
        setStatus("已停止本次生成");
        return nextMessages;
      }
      setStatus(message);
      return nextMessages;
    }
  };

  const executeAiFileOperations = async (assistantContent: string, baseMessages: ChatMessage[]) => {
    const operations = extractFileOps(assistantContent);
    if (!operations.length) return null;

    if (!project) {
      const blockedMessages: ChatMessage[] = [
        ...baseMessages,
        { role: "assistant", content: "检测到文件操作，但还没有打开项目，所以没有执行。" },
      ];
      setMessages(blockedMessages);
      return null;
    }

    try {
      if (!window.novayxk) {
        throw new Error("当前在浏览器预览模式，文件操作需要用 Electron 启动。");
      }

      setStatus("AI 正在执行文件操作...");
      const result = await window.novayxk.applyFileOps(operations);
      const firstWrittenFile = operations.find((operation) => operation.type === "write")?.path ?? null;
      const selectedWasChanged = selectedFile ? result.changedFiles.includes(selectedFile.path) : false;
      await syncProjectView({
        preferredPath: selectedWasChanged ? selectedFile?.path ?? null : firstWrittenFile,
      });

      const nextMessages: ChatMessage[] = [
        ...baseMessages,
        {
          role: "assistant",
          content: `文件操作已自动执行：\n\n${result.changedFiles.map((file) => `- ${file}`).join("\n")}`,
        },
      ];
      setMessages(nextMessages);
      setStatus(`文件操作已自动执行：${result.changedFiles.join(", ")}`);
      return nextMessages;
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI 文件操作执行失败";
      const nextMessages: ChatMessage[] = [
        ...baseMessages,
        {
          role: "assistant",
          content: `文件操作自动执行失败：${message}\n\n我已保留这次文件操作，你可以点底部工具栏的“执行文件操作”按钮手动确认，或者让我改成别的写法。`,
        },
      ];
      setMessages(nextMessages);
      setStatus(message);
      return null;
    }
  };

  const askApplyPatch = () => {
    if (!patchPreview) {
      setStatus("没有可应用的补丁。");
      return;
    }
    if (!project) {
      setStatus("请先打开一个项目。");
      return;
    }

    const files = extractPatchFiles(patchPreview);
    setConfirmDialog({
      type: "patch",
      patchText: patchPreview,
      files,
    });
  };

  const applyConfirmedPatch = async (patchText: string) => {
    setIsLoading(true);
    setStatus("正在应用补丁...");
    try {
      if (!window.novayxk) {
        throw new Error("当前在浏览器预览模式，应用补丁需要用 Electron 启动。");
      }
      const result = await window.novayxk.applyPatch(patchText);
      setCanUndoPatch(result.canUndo ?? true);
      await syncProjectView({
        preferredPath: selectedFile && result.changedFiles.includes(selectedFile.path) ? selectedFile.path : null,
      });
      setStatus(`已应用补丁：${result.changedFiles.join(", ")}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "应用补丁失败");
    } finally {
      setIsLoading(false);
    }
  };

  const askApplyFileOps = () => {
    if (!fileOpsPreview.length) {
      setStatus("没有可执行的文件操作。");
      return;
    }
    if (!project) {
      setStatus("请先打开一个项目。");
      return;
    }

    setConfirmDialog({
      type: "fileops",
      operations: fileOpsPreview,
    });
  };

  const applyConfirmedFileOps = async (operations: FileOperation[]) => {
    setIsLoading(true);
    setStatus("正在执行文件操作...");
    try {
      if (!window.novayxk) {
        throw new Error("当前在浏览器预览模式，文件操作需要用 Electron 启动。");
      }
      const result = await window.novayxk.applyFileOps(operations);
      const firstWrittenFile = operations.find((operation) => operation.type === "write")?.path ?? null;
      const selectedWasChanged = selectedFile ? result.changedFiles.includes(selectedFile.path) : false;
      await syncProjectView({
        preferredPath: selectedWasChanged ? selectedFile?.path ?? null : firstWrittenFile,
      });
      setStatus(`已执行文件操作：${result.changedFiles.join(", ")}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "文件操作失败");
    } finally {
      setIsLoading(false);
    }
  };

  const undoPatch = async () => {
    if (!canUndoPatch || isLoading) return;
    setIsLoading(true);
    setStatus("正在撤销上次补丁...");
    try {
      if (!window.novayxk) {
        throw new Error("当前在浏览器预览模式，撤销补丁需要用 Electron 启动。");
      }
      const result = await window.novayxk.undoLastPatch();
      setCanUndoPatch(result.canUndo ?? false);
      await syncProjectView({
        preferredPath: selectedFile && result.restoredFiles.includes(selectedFile.path) ? selectedFile.path : null,
      });
      setStatus(`已撤销补丁：${result.restoredFiles.join(", ")}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "撤销补丁失败");
    } finally {
      setIsLoading(false);
    }
  };

  const displayedMessage = messages[messages.length - 1]?.content ?? "";
  const patchPreview = extractPatch(displayedMessage);
  const fileOpsPreview = extractFileOps(displayedMessage);

  return (
    <main className="app-shell" data-theme={theme}>
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark">
            <img src={novayxkLogo} alt="" />
          </div>
          <div>
            <h1>Novayxk</h1>
            <p>Pro Workspace</p>
          </div>
        </div>

        <div className="top-actions">
          <div className={`privilege-chip ${privilege?.isAdmin ? "admin" : "standard"}`}>
            {privilege?.isAdmin ? <ShieldCheck size={15} /> : <LockKeyhole size={15} />}
            {privilege?.isAdmin ? "管理员权限" : "普通权限"}
          </div>
          <div className={`control-mode ${aiControlMode === "full" ? "full" : "safe"}`}>
            <button
              className={aiControlMode === "safe" ? "active" : ""}
              onClick={() => void updateAiControlMode("safe")}
              title="AI 只能自动执行低风险 PowerShell 命令"
            >
              <LockKeyhole size={15} />
              默认权限
            </button>
            <button
              className={aiControlMode === "full" ? "active" : ""}
              onClick={() => void updateAiControlMode("full")}
              title="AI 可以自动执行危险命令"
            >
              <UnlockKeyhole size={15} />
              完全控制
            </button>
          </div>
          <button
            className="theme-toggle"
            onClick={() => void updateTheme(theme === "dark" ? "light" : "dark")}
            title={theme === "dark" ? "切换浅色模式" : "切换深色模式"}
          >
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <select
            className="model-select"
            value={activeProviderId}
            onChange={(event) => void switchActiveProvider(event.target.value)}
            aria-label="选择模型供应商"
          >
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name} / {provider.model}
              </option>
            ))}
          </select>
          <button
            className="ghost-button"
            onClick={() => {
              setEditingProviderId(activeProvider.id);
              setIsSettingsOpen(true);
            }}
          >
            <Settings size={17} />
            设置
          </button>
          <button className="primary-button" onClick={openProject}>
            <FolderOpen size={17} />
            打开项目
          </button>
        </div>
      </header>

      <section
        className={`workspace ${isLeftCollapsed ? "left-collapsed" : ""} ${isRightCollapsed ? "right-collapsed" : ""}`}
        style={workspaceStyle}
      >
        {isLeftCollapsed && (
          <button className="restore-panel restore-left" onClick={() => setIsLeftCollapsed(false)} title="显示项目栏">
            <ChevronsRight size={15} />
          </button>
        )}
        {isRightCollapsed && (
          <button className="restore-panel restore-right" onClick={() => setIsRightCollapsed(false)} title="显示助手栏">
            <ChevronsLeft size={15} />
          </button>
        )}

        <aside className="sidebar" aria-hidden={isLeftCollapsed}>
          <div className="panel-heading">
            <div>
            <span>项目</span>
              <strong>{project ? shortPath(project.root) : "演示结构"}</strong>
            </div>
            <button className="panel-collapse-button" onClick={() => setIsLeftCollapsed(true)} title="隐藏项目栏">
              <ChevronsLeft size={15} />
            </button>
          </div>
          <div className="tree-toolbar">
            <div className="tree-search">
              <Search size={14} />
              <input
                value={treeFilter}
                onChange={(event) => setTreeFilter(event.target.value)}
                placeholder="搜索文件和目录"
                aria-label="搜索文件和目录"
              />
              {treeFilter ? (
                <button className="tree-toolbar-button" onClick={() => setTreeFilter("")} title="清空搜索">
                  <X size={13} />
                </button>
              ) : null}
            </div>
            <div className="tree-toolbar-actions">
              <button className="tree-toolbar-button" onClick={refreshTree} disabled={!project} title="刷新文件树">
                <RefreshCw size={14} />
              </button>
              <button className="tree-toolbar-button" onClick={expandAllTreeFolders} disabled={!project} title="展开全部">
                <ChevronsDown size={14} />
              </button>
              <button className="tree-toolbar-button" onClick={collapseAllTreeFolders} disabled={!project} title="收起全部">
                <ChevronsUp size={14} />
              </button>
            </div>
          </div>
          <div className="tree-action-row">
            <button className="tree-action-button" onClick={() => createTreeEntry("file")} disabled={!project} title="在当前目录新建文件">
              <FilePlus2 size={14} />
              新建文件
            </button>
            <button className="tree-action-button" onClick={() => createTreeEntry("directory")} disabled={!project} title="在当前目录新建文件夹">
              <FolderPlus size={14} />
              新建文件夹
            </button>
          </div>
          <div className="tree-list">
            {project ? (
              filteredFileTree.length ? (
                <>
                  {hasTreeFilter && (
                    <div className="tree-search-status">
                      <FileSearch size={13} />
                      {isSearchingTree ? "正在搜索项目文件..." : `项目搜索结果 ${filteredFileTree.length} 项`}
                    </div>
                  )}
                  {filteredFileTree.map((node) => (
                    <TreeNode
                      key={node.path}
                      node={node}
                      depth={0}
                      expandedPaths={expandedPaths}
                      selectedPath={activeTreePath ?? selectedFile?.path}
                      onSelect={selectFile}
                      forceExpanded={hasTreeFilter}
                      loadingPaths={loadingDirectories}
                    />
                  ))}
                </>
              ) : (
                <div className="tree-empty compact">
                  <Search size={24} />
                  <strong>没有匹配结果</strong>
                  <span>换个关键词试试，或者清空当前过滤。</span>
                </div>
              )
            ) : (
              <div className="tree-empty">
                <FolderOpen size={26} />
                <strong>尚未打开项目</strong>
                <span>选择一个代码目录后，这里会显示真实文件树。</span>
              </div>
            )}
          </div>
        </aside>

        {!isLeftCollapsed && (
          <div
            className="resize-handle vertical left-handle"
            onPointerDown={(event) => startPanelResize(event, "left")}
            role="separator"
            aria-label="调整项目栏宽度"
          />
        )}

        <section className={`editor-area ${isBottomCollapsed ? "bottom-collapsed" : ""}`} style={editorStyle}>
          <div className="editor-header">
            <div>
              <span>代码上下文</span>
              <strong>{selectedFile ? `${selectedFile.path}${isEditorDirty ? " *" : ""}` : "尚未选择文件"}</strong>
            </div>
            <div className="editor-header-actions">
              {selectedFile && (
                <div className="editor-find">
                  <Search size={13} />
                  <input
                    value={editorFind}
                    onChange={(event) => setEditorFind(event.target.value)}
                    placeholder="查找"
                    aria-label="查找当前文件"
                  />
                  <span>{editorFind ? editorFindMatches : selectedFileStats.lines}</span>
                </div>
              )}
              <button
                className={`editor-tool-button ${isWordWrapEnabled ? "active" : ""}`}
                onClick={() => setIsWordWrapEnabled((value) => !value)}
                disabled={!selectedFile}
                title="切换自动换行"
              >
                换行
              </button>
              {isBottomCollapsed && (
                <button className="panel-collapse-button" onClick={() => setIsBottomCollapsed(false)} title="显示底部工具区">
                  <ChevronsUp size={15} />
                </button>
              )}
              <button className="editor-save-button" onClick={saveSelectedFile} disabled={!selectedFile || !isEditorDirty} title="保存当前文件 Ctrl+S">
                <Save size={15} />
                保存
              </button>
              <div className="trust-chip">
                {aiControlMode === "full" ? <TriangleAlert size={15} /> : <ShieldCheck size={15} />}
                {aiControlMode === "full" ? "AI 完全控制已开启" : "敏感文件默认拦截"}
              </div>
            </div>
          </div>

          <div className="code-view">
            {selectedFile ? (
              <div className="code-editor-shell">
                <pre className="line-numbers" aria-hidden="true">
                  {Array.from({ length: selectedFileStats.lines }, (_, index) => index + 1).join("\n")}
                </pre>
                <textarea
                  className={`code-editor ${isWordWrapEnabled ? "wrap" : ""}`}
                  value={selectedFile.content}
                  spellCheck={false}
                  onChange={(event) => {
                    setSelectedFile({ ...selectedFile, content: event.target.value });
                    setIsEditorDirty(true);
                  }}
                  onKeyDown={(event) => handleCodeEditorKeyDown(event, selectedFile, setSelectedFile, setIsEditorDirty)}
                />
                <div className="editor-stats">
                  {selectedFileStats.lines} 行 · {selectedFileStats.characters} 字符
                  {editorFind ? ` · 匹配 ${editorFindMatches}` : ""}
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <Code2 size={44} />
                <h2>选择一个文件开始</h2>
                <p>Novayxk 会把当前文件作为上下文发送给模型。你也可以直接编辑文件，用 Ctrl+S 保存。</p>
              </div>
            )}
          </div>

          {!isBottomCollapsed && (
            <div
              className="resize-handle horizontal bottom-handle"
              onPointerDown={(event) => startPanelResize(event, "bottom")}
              role="separator"
              aria-label="调整底部工具区高度"
            />
          )}

          <div className="bottom-grid" aria-hidden={isBottomCollapsed}>
            <div className="terminal-panel">
              <div className="mini-heading split-heading">
                <span>
                  <Play size={16} />
                  终端任务
                </span>
                <div className="terminal-actions">
                  <button onClick={undoPatch} disabled={!canUndoPatch || isLoading} title="撤销上次补丁">
                    <RotateCcw size={14} />
                  </button>
                  <button onClick={askApplyPatch} disabled={!patchPreview || !project || isLoading} title="应用补丁">
                    <Check size={14} />
                  </button>
                  <button onClick={askApplyFileOps} disabled={!fileOpsPreview.length || !project || isLoading} title="执行文件操作">
                    <Plus size={14} />
                  </button>
                  <button onClick={copyTerminalOutput} disabled={!activeTerminalTask?.output} title="复制输出">
                    <Copy size={14} />
                  </button>
                  <button className="panel-collapse-button mini" onClick={() => setIsBottomCollapsed(true)} title="隐藏底部工具区">
                    <ChevronsDown size={14} />
                  </button>
                </div>
              </div>
              <div className="terminal-command-row">
                <input
                  value={terminalCommand}
                  onChange={(event) => setTerminalCommand(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void startTerminalTask();
                  }}
                  placeholder="npm run dev"
                  disabled={!project}
                  aria-label="终端命令"
                />
                <button className="terminal-primary" onClick={startTerminalTask} disabled={!project || !terminalCommand.trim()}>
                  <Play size={14} />
                  启动
                </button>
                <button onClick={stopActiveTerminalTask} disabled={!activeTerminalTask || activeTerminalTask.status !== "running"}>
                  <Square size={14} />
                  停止
                </button>
                <button onClick={restartActiveTerminalTask} disabled={!activeTerminalTask}>
                  <RotateCw size={14} />
                  重启
                </button>
              </div>
              <div className="terminal-body">
                <div className="terminal-task-list">
                  {terminalTasks.length ? (
                    terminalTasks.map((task) => (
                      <button
                        key={task.id}
                        className={`terminal-task ${task.id === activeTerminalTask?.id ? "active" : ""}`}
                        onClick={() => setActiveTerminalTaskId(task.id)}
                        title={task.command}
                      >
                        <span className={`terminal-dot ${task.status}`} />
                        <strong>{task.title}</strong>
                        <small>{formatTerminalStatus(task)}</small>
                      </button>
                    ))
                  ) : (
                    <div className="terminal-empty">暂无终端任务</div>
                  )}
                </div>
                <pre className="terminal-output">
                  {activeTerminalTask
                    ? activeTerminalTask.output || `${activeTerminalTask.command}\n\n任务已启动，等待输出...`
                    : "启动长期服务或后台命令后，这里会实时显示输出。AI 返回的 diff/fileops 仍可用右上角按钮处理。"}
                </pre>
              </div>
              <div className="terminal-footer">
                <span>{runningTerminalTaskCount} 个运行中</span>
                <span>{activeTerminalTask ? activeTerminalTask.cwd : project ? project.root : "未打开项目"}</span>
              </div>
            </div>
          </div>
        </section>

        {!isRightCollapsed && (
          <div
            className="resize-handle vertical right-handle"
            onPointerDown={(event) => startPanelResize(event, "right")}
            role="separator"
            aria-label="调整助手栏宽度"
          />
        )}

        <aside className="assistant-panel" aria-hidden={isRightCollapsed}>
          <div className="panel-heading">
            <div>
              <span>助手</span>
              <strong>{activeProvider.model}</strong>
            </div>
            <button className="panel-collapse-button" onClick={() => setIsRightCollapsed(true)} title="隐藏助手栏">
              <ChevronsRight size={15} />
            </button>
          </div>

          <div className="task-strip">
            <div className="task-row">
              <select
                className="task-select"
                value={activeTaskId ?? ""}
                onChange={(event) => {
                  if (event.target.value) void loadTask(event.target.value);
                  else void startNewTask();
                }}
                disabled={!project}
                aria-label="选择任务历史"
              >
                <option value="">新任务</option>
                {memoryState?.tasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {formatTaskLabel(task)}
                  </option>
                ))}
              </select>
              <button className="task-icon-button" onClick={saveCurrentTaskWithStatus} disabled={!project} title="保存任务">
                <Save size={15} />
              </button>
              <button className="task-icon-button" onClick={startNewTask} disabled={!project} title="新建任务">
                <Plus size={15} />
              </button>
              <button className="task-icon-button" onClick={() => setIsMemoryOpen(true)} disabled={!project} title="项目记忆">
                <BookOpen size={15} />
              </button>
            </div>
            <input
              className="task-title-input"
              value={activeTaskTitle}
              onChange={(event) => setActiveTaskTitle(event.target.value)}
              onBlur={() => {
                if (activeTaskId) void saveCurrentTask(messages);
              }}
              disabled={!project}
              aria-label="任务标题"
            />
            <div className="task-meta">
              <History size={13} />
              <span>
                {activeTask
                  ? `${activeTask.messageCount} 条消息 / ${memoryState?.tasks.length ?? 0} 份历史`
                  : `${memoryState?.memory.length ?? 0} 字项目记忆`}
              </span>
            </div>
          </div>

          <div className="chat-list" ref={chatListRef}>
            {messages.map((message, index) => (
              <article key={`${message.role}-${index}`} className={`chat-message ${message.role}`}>
                <div className="avatar">{message.role === "assistant" ? <Bot size={16} /> : <KeyRound size={16} />}</div>
                <div className="message-body">
                  <MarkdownView content={stripContext(message.content)} />
                  {message.role === "assistant" && typeof message.elapsedMs === "number" ? (
                    <div className="message-meta">处理 {formatElapsedSeconds(message.elapsedMs)}</div>
                  ) : null}
                </div>
              </article>
            ))}
            {isLoading && (
              <article className="chat-message assistant">
                <div className="avatar">
                  <Bot size={16} />
                </div>
                <div className="message-body">
                  <MarkdownView content="正在处理..." />
                  <div className="message-meta">已处理 {formatElapsedSeconds(loadingElapsedMs)}</div>
                </div>
              </article>
            )}
          </div>

          <div className="prompt-box">
            <textarea
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  sendMessage();
                }
              }}
              placeholder="让 Novayxk 分析代码、生成补丁或解释报错... Enter 发送，Shift+Enter 换行"
            />
            <button
              className={`send-button ${isLoading ? "stop" : ""}`}
              onClick={isLoading ? stopGeneration : sendMessage}
              disabled={isLoading ? isStopping : !prompt.trim()}
              title={isLoading ? "停止生成" : "发送"}
            >
              {isLoading ? <Square size={16} /> : <Send size={18} />}
            </button>
          </div>
        </aside>
      </section>

      <footer className="statusbar">
        <span>{status}</span>
        <span>{project ? "Status: Project Connected" : "Status: Preview Mode"}</span>
      </footer>

      {isSettingsOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="settings-modal" role="dialog" aria-modal="true" aria-label="模型供应商设置">
            <div className="modal-header">
              <div>
                <span>模型供应商</span>
                <h2>接入 OpenAI-compatible API</h2>
              </div>
              <button className="icon-button" onClick={() => setIsSettingsOpen(false)} aria-label="关闭设置">
                <Check size={18} />
              </button>
            </div>

            <div className="provider-tabs">
              {providers.map((provider) => (
                <button
                  key={provider.id}
                  className={provider.id === editingProvider.id ? "active" : ""}
                  onClick={() => setEditingProviderId(provider.id)}
                >
                  {provider.name}
                </button>
              ))}
              <button onClick={addProvider}>
                <Plus size={15} />
                新增
              </button>
            </div>

            <div className="provider-actions-row">
              <button
                className="ghost-button danger-button"
                onClick={removeActiveProvider}
                disabled={providers.length <= 1}
                title={providers.length <= 1 ? "至少保留一个供应商配置" : `删除 ${editingProvider.name}`}
              >
                <Trash2 size={16} />
                删除当前供应商
              </button>
              <span>{providers.length <= 1 ? "至少保留一个供应商配置。" : "删除后会在保存配置时一并持久化。"}</span>
            </div>

            <label>
              名称
              <input value={editingProvider.name} onChange={(event) => updateActiveProvider({ name: event.target.value })} />
            </label>
            <label>
              Base URL
              <input
                value={editingProvider.baseUrl}
                onChange={(event) => updateActiveProvider({ baseUrl: event.target.value })}
                placeholder="https://api.openai.com/v1"
              />
            </label>
            <label>
              API Key
              <input
                type="password"
                value={editingProvider.apiKey}
                onChange={(event) => updateActiveProvider({ apiKey: event.target.value })}
                placeholder="sk-..."
              />
            </label>
            <label>
              Model
              <input value={editingProvider.model} onChange={(event) => updateActiveProvider({ model: event.target.value })} />
            </label>
            <label>
              接口类型
              <select
                className="settings-select"
                value={editingProvider.apiMode ?? "chatCompletions"}
                onChange={(event) =>
                  updateActiveProvider({ apiMode: event.target.value as ProviderConfig["apiMode"] })
                }
              >
                <option value="chatCompletions">Chat Completions (/chat/completions)</option>
                <option value="responses">Responses API (/responses)</option>
              </select>
            </label>

            <div className="provider-test-row">
              <button className="ghost-button" onClick={testActiveProvider} disabled={isTestingProvider}>
                <Sparkles size={16} />
                测试连接
              </button>
              <span>{providerTestStatus || "保存前可以先测试供应商是否可用。"}</span>
            </div>

            <div className={`privilege-panel ${privilege?.isAdmin ? "admin" : ""}`}>
              <div>
                <span>高级权限</span>
                <strong>{privilege?.isAdmin ? "当前已是管理员模式" : "当前是普通权限模式"}</strong>
                <p>
                  {privilege?.isAdmin
                    ? "系统级命令、注册表和受保护目录操作会拥有更高权限。"
                    : "需要改系统设置、注册表或受保护目录时，可以通过 UAC 以管理员权限重启。"}
                </p>
              </div>
              <button
                className="ghost-button"
                onClick={restartAsAdmin}
                disabled={Boolean(privilege?.isAdmin) || !privilege?.canElevate || isRestartingAsAdmin}
                title={privilege?.isDev ? "开发模式下请打包后测试管理员重启" : "通过 Windows UAC 以管理员权限重启 Novayxk"}
              >
                <ShieldCheck size={16} />
                {isRestartingAsAdmin ? "等待确认" : privilege?.isAdmin ? "已提权" : "管理员模式"}
              </button>
            </div>

            <div className="modal-actions">
              <button className="ghost-button" onClick={() => setIsSettingsOpen(false)}>
                取消
              </button>
              <button
                className="primary-button"
                onClick={async () => {
                  await saveProviders(providers, activeProviderId);
                  setIsSettingsOpen(false);
                }}
              >
                <Save size={17} />
                保存配置
              </button>
            </div>
          </section>
        </div>
      )}

      {isMemoryOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="memory-modal" role="dialog" aria-modal="true" aria-label="项目长期记忆">
            <div className="modal-header">
              <div>
                <span>项目长期记忆</span>
                <h2>{project ? shortPath(project.root) : "尚未打开项目"}</h2>
              </div>
              <BookOpen size={23} />
            </div>
            <textarea
              className="memory-editor"
              value={projectMemoryDraft}
              onChange={(event) => setProjectMemoryDraft(event.target.value)}
              placeholder="记录这个项目的技术栈、目录约定、代码风格、常用命令、已知坑点。之后每次聊天都会自动带上这段长期记忆。"
            />
            <p className="memory-hint">
              配置属于全局记忆，项目记忆属于当前项目，任务历史属于当前项目下的某一次工作。
            </p>
            <div className="modal-actions">
              <button className="ghost-button" onClick={() => setIsMemoryOpen(false)}>
                取消
              </button>
              <button className="primary-button" onClick={saveProjectMemoryDraft} disabled={!project}>
                <Save size={17} />
                保存项目记忆
              </button>
            </div>
          </section>
        </div>
      )}

      {confirmDialog && (
        <div className="modal-backdrop" role="presentation">
          <section className="confirm-modal" role="dialog" aria-modal="true" aria-label="确认操作">
            <div className="modal-header">
              <div>
                <span>
                  {confirmDialog.type === "command"
                    ? "命令确认"
                    : confirmDialog.type === "patch"
                      ? "补丁确认"
                      : confirmDialog.type === "fileops"
                        ? "文件操作确认"
                        : confirmDialog.type === "admin-request"
                          ? "管理员授权"
                          : "系统动作确认"}
                </span>
                <h2>
                  {confirmDialog.type === "command"
                    ? "确认执行命令"
                    : confirmDialog.type === "patch"
                      ? "确认应用代码补丁"
                      : confirmDialog.type === "fileops"
                        ? "确认执行文件操作"
                        : confirmDialog.type === "admin-request"
                          ? "需要管理员模式"
                          : `确认${confirmDialog.label}`}
                </h2>
              </div>
              <TriangleAlert size={23} />
            </div>

            {confirmDialog.type === "command" ? (
              <>
                <p className="confirm-copy">命令将在当前项目根目录执行。请确认它符合你的预期。</p>
                <pre className="confirm-preview">{confirmDialog.command}</pre>
              </>
            ) : confirmDialog.type === "patch" ? (
              <>
                <p className="confirm-copy">Novayxk 将按 unified diff 修改以下文件，并保留一次撤销记录。</p>
                <ul className="file-confirm-list">
                  {(confirmDialog.files.length ? confirmDialog.files : ["未能从补丁头解析文件名"]).map((file) => (
                    <li key={file}>{file}</li>
                  ))}
                </ul>
              </>
            ) : confirmDialog.type === "fileops" ? (
              <>
                <p className="confirm-copy">Novayxk 将在当前项目内执行以下文件操作。请确认路径和覆盖行为符合预期。</p>
                <ul className="file-confirm-list">
                  {confirmDialog.operations.map((operation, index) => (
                    <li key={`${operation.type}-${operation.path}-${index}`}>
                      {operation.type === "mkdir"
                        ? "创建目录"
                        : operation.type === "delete"
                          ? "删除路径"
                          : operation.overwrite
                            ? "覆盖写入"
                            : "写入文件"}
                      ：{operation.path}
                    </li>
                  ))}
                </ul>
              </>
            ) : confirmDialog.type === "admin-request" ? (
              <>
                <p className="confirm-copy">
                  {confirmDialog.source === "ai" ? "AI 请求执行的命令" : "你准备执行的命令"}
                  可能需要管理员权限：{confirmDialog.reason}。确认后 Novayxk 会触发 Windows UAC 并以管理员模式重启；当前命令不会在重启前自动执行。
                </p>
                <pre className="confirm-preview">{confirmDialog.command}</pre>
              </>
            ) : (
              <>
                <p className="confirm-copy">
                  {confirmDialog.source === "ai" ? "AI 请求执行特殊系统动作。" : "你正在执行特殊系统动作。"}
                  这个动作可能会立即中断当前工作，请确认所有文件已经保存。
                </p>
                <pre className="confirm-preview">{confirmDialog.command}</pre>
              </>
            )}

            <div className="modal-actions">
              <button
                className="ghost-button"
                onClick={() => {
                  if (confirmDialog.type === "system-action" || confirmDialog.type === "admin-request") {
                    confirmDialog.resolve(false);
                  }
                  setConfirmDialog(null);
                }}
              >
                取消
              </button>
              <button
                className="primary-button"
                onClick={async () => {
                  const dialog = confirmDialog;
                  setConfirmDialog(null);
                  if (dialog.type === "command") {
                    await executeConfirmedCommand(dialog.command);
                  } else if (dialog.type === "patch") {
                    await applyConfirmedPatch(dialog.patchText);
                  } else if (dialog.type === "fileops") {
                    await applyConfirmedFileOps(dialog.operations);
                  } else {
                    dialog.resolve(true);
                  }
                }}
              >
                <Check size={17} />
                {confirmDialog.type === "system-action" ? `确认${confirmDialog.label}` : "确认"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

function TreeNode({
  node,
  depth,
  expandedPaths,
  selectedPath,
  onSelect,
  loadingPaths,
  forceExpanded = false,
}: {
  node: FileNode;
  depth: number;
  expandedPaths: Set<string>;
  selectedPath?: string;
  onSelect: (node: FileNode) => void;
  loadingPaths: Set<string>;
  forceExpanded?: boolean;
}) {
  const isExpanded = forceExpanded || expandedPaths.has(node.path);
  const isDirectory = node.type === "directory";
  const isSelected = selectedPath === node.path;
  const isLoading = loadingPaths.has(node.path);

  return (
    <div>
      <button
        className={`tree-row ${isSelected ? "selected" : ""}`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={() => onSelect(node)}
        title={node.path}
      >
        {isDirectory ? (
          <span className="tree-icon-stack">
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {isExpanded ? <FolderOpen size={14} /> : <Folder size={14} />}
          </span>
        ) : (
          <FileCode2 size={15} />
        )}
        <span>{node.name}</span>
        {isDirectory && isLoading && <small>加载</small>}
        {isDirectory && !node.loaded && !forceExpanded && !isLoading && <small>更多</small>}
        {node.sensitive && <small>敏感</small>}
      </button>
      {isDirectory &&
        isExpanded &&
        node.children?.map((child) => (
          <TreeNode
            key={child.path}
            node={child}
            depth={depth + 1}
            expandedPaths={expandedPaths}
            selectedPath={selectedPath}
            onSelect={onSelect}
            loadingPaths={loadingPaths}
            forceExpanded={forceExpanded}
          />
        ))}
    </div>
  );
}

function MarkdownView({ content }: { content: string }) {
  const blocks = parseMarkdownBlocks(content);
  return (
    <>
      {blocks.map((block, index) => {
        if (block.type === "code") {
          return (
            <pre key={`code-${index}`} className="markdown-code">
              <code>{block.content}</code>
            </pre>
          );
        }

        if (block.type === "heading") {
          const HeadingTag = `h${Math.min(block.level, 3)}` as "h1" | "h2" | "h3";
          return <HeadingTag key={`heading-${index}`}>{renderInlineMarkdown(block.content)}</HeadingTag>;
        }

        if (block.type === "list") {
          return (
            <ul key={`list-${index}`}>
              {block.items.map((item, itemIndex) => (
                <li key={`${item}-${itemIndex}`}>{renderInlineMarkdown(item)}</li>
              ))}
            </ul>
          );
        }

        return <p key={`paragraph-${index}`}>{renderInlineMarkdown(block.content)}</p>;
      })}
    </>
  );
}

type MarkdownBlock =
  | { type: "paragraph"; content: string }
  | { type: "heading"; level: number; content: string }
  | { type: "list"; items: string[] }
  | { type: "code"; language: string; content: string };

function parseMarkdownBlocks(content: string): MarkdownBlock[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let codeLines: string[] = [];
  let codeLanguage = "";
  let isInCode = false;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ type: "paragraph", content: paragraph.join("\n").trim() });
    paragraph = [];
  };

  const flushList = () => {
    if (!listItems.length) return;
    blocks.push({ type: "list", items: listItems });
    listItems = [];
  };

  for (const line of lines) {
    const fence = line.match(/^```([A-Za-z][\w-]*)?\s*$/);
    if (fence) {
      if (isInCode) {
        blocks.push({ type: "code", language: codeLanguage, content: codeLines.join("\n") });
        codeLines = [];
        codeLanguage = "";
        isInCode = false;
      } else {
        flushParagraph();
        flushList();
        isInCode = true;
        codeLanguage = fence[1] ?? "";
      }
      continue;
    }

    if (isInCode) {
      codeLines.push(line);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", level: heading[1].length, content: heading[2].trim() });
      continue;
    }

    const listItem = line.match(/^\s*[-*]\s+(.+)$/);
    if (listItem) {
      flushParagraph();
      listItems.push(listItem[1].trim());
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  if (isInCode) {
    blocks.push({ type: "code", language: codeLanguage, content: codeLines.join("\n") });
  }
  flushParagraph();
  flushList();
  return blocks.length ? blocks : [{ type: "paragraph", content }];
}

function renderInlineMarkdown(content: string) {
  const nodes: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content))) {
    if (match.index > lastIndex) {
      nodes.push(content.slice(lastIndex, match.index));
    }

    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(<strong key={`strong-${match.index}`}>{token.slice(2, -2)}</strong>);
    } else {
      nodes.push(<code key={`code-${match.index}`}>{token.slice(1, -1)}</code>);
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < content.length) {
    nodes.push(content.slice(lastIndex));
  }

  return nodes;
}

function shortPath(fullPath: string) {
  const normalized = fullPath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts.slice(-2).join("/");
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getProviderId(providers: ProviderConfig[], preferredId?: string | null, fallbackId?: string | null) {
  if (preferredId && providers.some((provider) => provider.id === preferredId)) return preferredId;
  if (fallbackId && providers.some((provider) => provider.id === fallbackId)) return fallbackId;
  return providers[0]?.id ?? defaultProvider.id;
}

function isThemeMode(value: unknown): value is ThemeMode {
  return value === "dark" || value === "light";
}

function isAiControlMode(value: unknown): value is AiControlMode {
  return value === "safe" || value === "full";
}

function formatElapsedSeconds(elapsedMs: number) {
  const seconds = Math.max(0, elapsedMs) / 1000;
  return `${seconds < 10 ? seconds.toFixed(1) : seconds.toFixed(0)} 秒`;
}

type RuntimePermissionContext = {
  controlMode: "safe" | "full";
  isAdmin: boolean;
  privilegeLabel: string;
};

function buildSystemPrompt(projectMemory: string, taskSummary: string, runtimePermission: RuntimePermissionContext) {
  const memoryBlock = projectMemory.trim()
    ? `\n\n【项目长期记忆】\n${projectMemory.trim().slice(0, 6000)}`
    : "";
  const taskBlock = taskSummary.trim() ? `\n\n【当前任务摘要】\n${taskSummary.trim().slice(0, 3000)}` : "";
  const windowsPrivilegeBlock = runtimePermission.isAdmin
    ? "当前 Novayxk Windows 进程权限：管理员权限。你可以明确告诉用户当前应用已经以管理员身份运行。"
    : `当前 Novayxk Windows 进程权限：${runtimePermission.privilegeLabel}。如果命令需要系统级权限，提醒用户先切换到管理员模式。`;
  const controlModeBlock =
    runtimePermission.controlMode === "full"
      ? "当前 AI PowerShell 控制模式：完全控制。用户允许你通过 ```powershell-run 代码块请求执行包括高风险命令在内的 PowerShell 命令。仍要优先解释目的，避免无意义破坏。"
      : "当前 AI PowerShell 控制模式：默认权限。你可以通过 ```powershell-run 代码块请求执行低风险 PowerShell 命令，例如 npm run build、npm test、dir、Get-ChildItem、git status。不要把删除、重置、格式化、系统设置、下载后直接执行脚本等高风险命令放进自动执行块。";
  const logBlock =
    "\nNovayxk 自身日志位于 %USERPROFILE%\\.novayxk\\logs\\，包括 app.log、error.log、ai.log。用户问 Novayxk 自己的报错、日志、为什么没执行命令时，你可以用 powershell-run 只读命令读取这些日志尾部，例如 Get-Content \"$env:USERPROFILE\\.novayxk\\logs\\error.log\" -Tail 120。";
  const shellBlock = `\n\n${windowsPrivilegeBlock}\n${controlModeBlock}${logBlock}`;
  return `你是 Novayxk，一款谨慎的 AI 编程助手。回答要具体、可执行。用户要求你创建页面、组件、脚本、样式或其他新文件时，优先直接返回一个 \`\`\`fileops JSON 代码块，Novayxk 会自动执行项目内文件操作。fileops 格式为 [{"type":"mkdir","path":"相对目录"},{"type":"write","path":"相对文件","content":"文件内容","overwrite":false},{"type":"delete","path":"相对路径"}]。当用户明确要求新建、覆盖整个文件、删除文件或删除目录时，优先用 fileops，不要只给说明文字。修改已有文件的小范围局部内容时，优先给出文件路径、修改理由和 diff 风格补丁；只有用户明确要求覆盖已有文件时，fileops write 才可以设置 overwrite:true。需要运行 PowerShell 命令时，必须返回一个完整的、单独成块的 \`\`\`powershell-run 代码块，每个代码块只放一条或一组相关命令；命令会在当前项目根目录执行。不要把要执行的命令放在普通文字、行内代码或普通 \`\`\`text 代码块里。你输出 powershell-run 后，Novayxk 会自动执行并把结果再交给你总结，所以不要要求用户手动执行命令、复制输出或“执行后发我”，也不要在收到执行结果前说“已开始安装”“等安装结果返回”。所有路径必须是当前项目内的相对路径；读取 Novayxk 自身日志除外。不要要求用户泄露密钥。${shellBlock}${memoryBlock}${taskBlock}`;
}

function summarizeTaskForUi(messages: ChatMessage[]) {
  const userMessages = messages
    .filter((message) => message.role === "user")
    .slice(-6)
    .map((message) => stripInjectedContext(message.content).trim())
    .filter(Boolean);
  return userMessages.length ? `最近任务重点：${userMessages.join("；").slice(0, 1200)}` : "";
}

function formatTaskLabel(task: TaskSummary) {
  const date = task.updatedAt ? new Date(task.updatedAt).toLocaleDateString() : "";
  return date ? `${task.title} · ${date}` : task.title;
}

function buildModelChatHistory(messages: ChatMessage[], latestContext: string) {
  const cleanMessages = sanitizeChatHistory(messages);
  if (!latestContext.trim() || cleanMessages.length === 0) return cleanMessages;
  const lastIndex = cleanMessages.length - 1;
  return cleanMessages.map((message, index) => {
    if (index !== lastIndex || message.role !== "user") return message;
    return {
      ...message,
      content: `${stripInjectedContext(message.content)}${latestContext}`,
    };
  });
}

function stripContext(content: string) {
  return stripInjectedContext(content);
}

function stripInjectedContext(content: string) {
  const markers = ["\n\n当前选中文件：", "\n\n项目上下文摘要："];
  const indexes = markers
    .map((marker) => content.indexOf(marker))
    .filter((index) => index > -1);
  return indexes.length ? content.slice(0, Math.min(...indexes)) : content;
}

function sanitizeChatHistory(messages: ChatMessage[]) {
  return messages
    .filter((message) => !isAbortPlaceholderMessage(message))
    .map((message) => (
      message.role === "user"
        ? { ...message, content: stripInjectedContext(message.content).trim() }
        : message
    ));
}

function isAbortPlaceholderMessage(message: ChatMessage) {
  return message.role === "assistant" && message.content.trim() === STREAM_ABORT_PLACEHOLDER;
}

function extractPatch(content: string) {
  const diffBlock = content.match(/```(?:diff|patch)\n([\s\S]*?)```/i);
  if (diffBlock?.[1]) return diffBlock[1].trim();
  const genericBlock = content.match(/```\n([\s\S]*?(?:^\+|^-)[\s\S]*?)```/m);
  return genericBlock?.[1]?.trim() ?? "";
}

function extractPatchFiles(patchText: string) {
  const files = new Set<string>();
  for (const line of patchText.split(/\r?\n/)) {
    if (line.startsWith("+++ ")) {
      const file = line.slice(4).trim().split(/\s+/)[0].replace(/^"|"$/g, "");
      if (file && file !== "/dev/null") files.add(file.replace(/^[ab]\//, ""));
    }
  }
  return [...files];
}

function extractPowerShellCommands(content: string) {
  const commands: string[] = [];
  const pattern = /```(?:powershell-run|ps-run|shell-run)\n([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content))) {
    if (match[1]?.trim()) commands.push(match[1].trim());
  }
  return commands;
}

type PowerShellCommandRequest = {
  command: string;
  source: "block" | "inline";
};

type CommandLoopState = {
  rounds: number;
  seenCommands: Map<string, number>;
  seenSignatures: Map<string, number>;
};

function createCommandLoopState(): CommandLoopState {
  return {
    rounds: 0,
    seenCommands: new Map(),
    seenSignatures: new Map(),
  };
}

function inspectCommandLoop(commands: PowerShellCommandRequest[], state: CommandLoopState) {
  state.rounds += 1;
  const normalizedCommands = commands.map((command) => normalizeCommandForLoop(command.command)).filter(Boolean);
  const signature = normalizedCommands.join("\n---\n");

  for (const normalized of normalizedCommands) {
    const count = state.seenCommands.get(normalized) ?? 0;
    if (count >= COMMAND_LOOP_REPEAT_LIMIT) {
      return { shouldStop: true, reason: "检测到同一条命令反复出现，可能陷入重复尝试。" };
    }
  }

  const signatureCount = state.seenSignatures.get(signature) ?? 0;
  if (signature && signatureCount >= COMMAND_LOOP_REPEAT_LIMIT) {
    return { shouldStop: true, reason: "检测到连续步骤的命令组合反复出现，可能陷入循环。" };
  }

  for (const normalized of normalizedCommands) {
    state.seenCommands.set(normalized, (state.seenCommands.get(normalized) ?? 0) + 1);
  }
  if (signature) {
    state.seenSignatures.set(signature, signatureCount + 1);
  }

  return { shouldStop: false, reason: "" };
}

function normalizeCommandForLoop(command: string) {
  return command
    .replace(/\s+/g, " ")
    .replace(/["']/g, "")
    .trim()
    .toLowerCase();
}

function extractPowerShellCommandRequests(content: string): PowerShellCommandRequest[] {
  const requests: PowerShellCommandRequest[] = [];
  const seen = new Set<string>();
  for (const command of extractPowerShellCommands(content)) {
    addPowerShellCommandRequest(requests, seen, command, "block");
  }
  for (const command of extractInlinePowerShellCommands(content)) {
    addPowerShellCommandRequest(requests, seen, command, "inline");
  }
  return requests;
}

function addPowerShellCommandRequest(
  requests: PowerShellCommandRequest[],
  seen: Set<string>,
  command: string,
  source: PowerShellCommandRequest["source"],
) {
  const normalized = command.trim();
  const key = normalized.toLowerCase();
  if (!normalized || seen.has(key)) return;
  seen.add(key);
  requests.push({ command: normalized, source });
}

function extractInlinePowerShellCommands(content: string) {
  const withoutFencedBlocks = content.replace(/```[\s\S]*?```/g, "\n");
  return withoutFencedBlocks
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(isLikelyStandalonePowerShellCommand);
}

function isLikelyStandalonePowerShellCommand(line: string) {
  if (!line || line.length > 1200) return false;
  if (/[\u4e00-\u9fa5]/.test(line)) return false;
  if (/[。！？]/.test(line)) return false;
  if (/^(?:\$|PS>|>|`|-|\d+\.|\*)\s*/.test(line)) return false;
  if (/^PowerShell\s+执行结果/i.test(line)) return false;

  const commandPrefix =
    /^(?:winget|choco|scoop|npm|pnpm|yarn|npx|node|python|py|pip|git|docker|wsl|mysql|where(?:\.exe)?|Get-[A-Za-z]+|Set-[A-Za-z]+|New-[A-Za-z]+|Remove-[A-Za-z]+|Start-[A-Za-z]+|Stop-[A-Za-z]+|Restart-[A-Za-z]+|Test-[A-Za-z]+|Select-[A-Za-z]+|Get-ChildItem|Get-Service|Start-Process|Stop-Process|shutdown(?:\.exe)?|taskkill(?:\.exe)?|reg(?:\.exe)?|msiexec(?:\.exe)?|powershell(?:\.exe)?|pwsh(?:\.exe)?)\b/i;
  if (!commandPrefix.test(line)) return false;

  return /(?:\s--?[\w-]+|\s\/[a-z?]+|\s\|[^\|]|\s;|\s&&|\s"[^"]*"|\s'[^']*'|\s[A-Za-z0-9_.:-]+)$/i.test(line);
}

function extractFileOps(content: string): FileOperation[] {
  const block = content.match(/```(?:fileops|json)\n([\s\S]*?)```/i);
  if (!block?.[1]) return [];

  try {
    const parsed = JSON.parse(block[1]);
    const operations = Array.isArray(parsed) ? parsed : [parsed];
    return operations.filter(isFileOperation);
  } catch {
    return [];
  }
}

function isFileOperation(value: unknown): value is FileOperation {
  if (!value || typeof value !== "object") return false;
  const operation = value as Partial<FileOperation>;
  if (operation.type === "mkdir") return typeof operation.path === "string" && operation.path.length > 0;
  if (operation.type === "delete") return typeof operation.path === "string" && operation.path.length > 0;
  if (operation.type === "write") {
    return (
      typeof operation.path === "string" &&
      operation.path.length > 0 &&
      typeof operation.content === "string" &&
      (operation.overwrite === undefined || typeof operation.overwrite === "boolean")
    );
  }
  return false;
}

function formatFileOps(operations: FileOperation[]) {
  if (!operations.length) return "";
  return operations
    .map((operation) => {
      if (operation.type === "mkdir") return `mkdir ${operation.path}`;
      if (operation.type === "delete") return `delete ${operation.path}`;
      return `${operation.overwrite ? "overwrite" : "write"} ${operation.path}\n${operation.content.slice(0, 1000)}`;
    })
    .join("\n\n");
}

function formatProjectContext(context: ProjectContext) {
  const visibleFiles = context.files.filter((file) => !file.sensitive);
  const fileList = visibleFiles
    .slice(0, 180)
    .map((file) => `- ${file.path} (${formatBytes(file.size)})`)
    .join("\n");
  const relatedBlocks = context.relatedFiles
    .map(
      (file) =>
        `\n\n相关文件：${file.path}${file.truncated ? "（已截断）" : ""}\n\`\`\`\n${file.content.slice(0, 8000)}\n\`\`\``,
    )
    .join("");

  return `\n\n项目上下文摘要：${context.root}\n文件清单（节选 ${Math.min(visibleFiles.length, 180)}/${visibleFiles.length}）：\n${fileList || "- 无可读文件"}${relatedBlocks}`;
}

function filterFileTree(nodes: FileNode[], keyword: string): FileNode[] {
  const term = keyword.trim().toLowerCase();
  if (!term) return nodes;

  return nodes.flatMap((node) => {
    const isMatch = node.name.toLowerCase().includes(term) || node.path.toLowerCase().includes(term);
    if (node.type === "directory") {
      const nextChildren = filterFileTree(node.children ?? [], keyword);
      if (isMatch || nextChildren.length) {
        return [{ ...node, children: nextChildren }];
      }
      return [];
    }

    return isMatch ? [node] : [];
  });
}

function updateTreeNode(nodes: FileNode[], targetPath: string, updater: (node: FileNode) => FileNode): FileNode[] {
  return nodes.map((node) => {
    if (node.path === targetPath) return updater(node);
    if (node.type === "directory" && node.children?.length) {
      return { ...node, children: updateTreeNode(node.children, targetPath, updater) };
    }
    return node;
  });
}

function findTreeNode(nodes: FileNode[], targetPath: string): FileNode | null {
  for (const node of nodes) {
    if (node.path === targetPath) return node;
    if (node.type === "directory") {
      const found = findTreeNode(node.children ?? [], targetPath);
      if (found) return found;
    }
  }
  return null;
}

function upsertTerminalTask(tasks: TerminalTask[], task: TerminalTask) {
  const next = tasks.filter((item) => item.id !== task.id);
  return [task, ...next].sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
}

function formatTerminalStatus(task: TerminalTask) {
  if (task.status === "running") return "运行中";
  if (task.status === "stopped") return "已停止";
  if (task.status === "failed") return `失败 ${task.code ?? ""}`.trim();
  return `退出 ${task.code ?? 0}`;
}

function collectDirectoryPaths(nodes: FileNode[]): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.type !== "directory") continue;
    paths.push(node.path);
    paths.push(...collectDirectoryPaths(node.children ?? []));
  }
  return paths;
}

function listAncestorPaths(relativePath: string): string[] {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized) return [];
  const parts = normalized.split("/");
  const ancestors: string[] = [];
  for (let index = 1; index < parts.length; index += 1) {
    ancestors.push(parts.slice(0, index).join("/"));
  }
  return ancestors;
}

function getParentDirectory(relativePath: string) {
  const normalized = normalizeRelativePath(relativePath);
  const index = normalized.lastIndexOf("/");
  return index > -1 ? normalized.slice(0, index) : "";
}

function joinRelativePath(baseDir: string, childPath: string) {
  const normalizedBase = normalizeRelativePath(baseDir);
  const normalizedChild = normalizeRelativePath(childPath);
  if (!normalizedBase) return normalizedChild;
  if (!normalizedChild) return normalizedBase;
  return `${normalizedBase}/${normalizedChild}`.replace(/\/+/g, "/");
}

function normalizeRelativePath(input: string) {
  return input.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/").trim();
}

function getEditorStats(content: string) {
  return {
    lines: content ? content.split(/\r\n|\r|\n/).length : 1,
    characters: content.length,
  };
}

function countTextMatches(content: string, query: string) {
  const needle = query.trim();
  if (!needle) return 0;
  let count = 0;
  let index = 0;
  const haystack = content.toLowerCase();
  const loweredNeedle = needle.toLowerCase();
  while ((index = haystack.indexOf(loweredNeedle, index)) !== -1) {
    count += 1;
    index += Math.max(1, loweredNeedle.length);
  }
  return count;
}

function handleCodeEditorKeyDown(
  event: React.KeyboardEvent<HTMLTextAreaElement>,
  selectedFile: { path: string; content: string },
  setSelectedFile: React.Dispatch<React.SetStateAction<{ path: string; content: string } | null>>,
  setIsEditorDirty: React.Dispatch<React.SetStateAction<boolean>>,
) {
  if (event.key !== "Tab" && event.key !== "Enter") return;
  event.preventDefault();
  const target = event.currentTarget;
  const start = target.selectionStart;
  const end = target.selectionEnd;

  if (event.key === "Tab") {
    const selectedText = selectedFile.content.slice(start, end);
    if (event.shiftKey && selectedText.includes("\n")) {
      const lineStart = selectedFile.content.lastIndexOf("\n", start - 1) + 1;
      const block = selectedFile.content.slice(lineStart, end);
      const nextBlock = block.replace(/^(?:  |\t)/gm, "");
      const nextContent = `${selectedFile.content.slice(0, lineStart)}${nextBlock}${selectedFile.content.slice(end)}`;
      setSelectedFile({ ...selectedFile, content: nextContent });
      setIsEditorDirty(true);
      requestAnimationFrame(() => {
        target.selectionStart = lineStart;
        target.selectionEnd = lineStart + nextBlock.length;
      });
      return;
    }

    if (selectedText.includes("\n")) {
      const lineStart = selectedFile.content.lastIndexOf("\n", start - 1) + 1;
      const block = selectedFile.content.slice(lineStart, end);
      const nextBlock = block.replace(/^/gm, "  ");
      const nextContent = `${selectedFile.content.slice(0, lineStart)}${nextBlock}${selectedFile.content.slice(end)}`;
      setSelectedFile({ ...selectedFile, content: nextContent });
      setIsEditorDirty(true);
      requestAnimationFrame(() => {
        target.selectionStart = lineStart;
        target.selectionEnd = lineStart + nextBlock.length;
      });
      return;
    }

    const nextContent = `${selectedFile.content.slice(0, start)}  ${selectedFile.content.slice(end)}`;
    setSelectedFile({ ...selectedFile, content: nextContent });
    setIsEditorDirty(true);
    requestAnimationFrame(() => {
      target.selectionStart = start + 2;
      target.selectionEnd = start + 2;
    });
    return;
  }

  const lineStart = selectedFile.content.lastIndexOf("\n", start - 1) + 1;
  const currentLine = selectedFile.content.slice(lineStart, start);
  const indent = currentLine.match(/^\s*/)?.[0] ?? "";
  const nextIndent = /[{[(]\s*$/.test(currentLine) ? `${indent}  ` : indent;
  const insert = `\n${nextIndent}`;
  const nextContent = `${selectedFile.content.slice(0, start)}${insert}${selectedFile.content.slice(end)}`;
  setSelectedFile({ ...selectedFile, content: nextContent });
  setIsEditorDirty(true);
  requestAnimationFrame(() => {
    target.selectionStart = start + insert.length;
    target.selectionEnd = start + insert.length;
  });
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
