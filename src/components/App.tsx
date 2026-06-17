import React from "react";
import {
  Check,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  ChevronRight,
  Folder,
  FolderOpen,
  LockKeyhole,
  Moon,
  Save,
  Settings,
  ShieldCheck,
  Sun,
  UnlockKeyhole,
  X,
} from "lucide-react";
import novayxkLogo from "../../assets/icons/novayxk-64.png";
import type {
  AiControlMode,
  AssistantMode,
  BrowserAutomationResult,
  BrowserSnapshot,
  BrowserTraceSnapshot,
  ChatMessage,
  TerminalTask,
} from "../vite-env";
import type { BrowserAutomationAction } from "../browser/actions";
import { formatBrowserPromptContext } from "../browser/context";
import { TerminalPanel } from "./terminal/TerminalPanel";
import { ConfirmDialog, type ConfirmDialogState } from "./dialogs/ConfirmDialog";
import { CreateEntryDialog } from "./dialogs/CreateEntryDialog";
import { MemoryModal } from "./settings/MemoryModal";
import { SettingsModal } from "./settings/SettingsModal";
import { ProjectSidebar } from "./sidebar/ProjectSidebar";
import { EditorPane } from "./editor/EditorPane";
import { BrowserWorkspace } from "./browser/BrowserWorkspace";
import { AssistantPanel } from "./assistant/AssistantPanel";
import { WelcomeGuide } from "./onboarding/WelcomeGuide";
import { useTerminalTasks } from "../hooks/useTerminalTasks";
import { useProjectMemory } from "../hooks/useProjectMemory";
import { useWorkspaceLayout } from "../hooks/useWorkspaceLayout";
import { useProviderSettings } from "../hooks/useProviderSettings";
import { useProjectWorkspace } from "../hooks/useProjectWorkspace";
import { useAiAssistant } from "../hooks/useAiAssistant";
import { useWorkspaceActions } from "../hooks/useWorkspaceActions";
import { useBrowserWorkspace } from "../hooks/useBrowserWorkspace";
import { hasAnyConfiguredProvider } from "../ai/providers";
import {
  PRODUCT_NAME,
} from "../app/product";
import { getWorkspaceGuideKind } from "../app/workspaceGuide";
import { getLocaleStrings, normalizeAppLanguage } from "../app/i18n";
import {
  normalizeRelativePath,
  shortPath,
} from "../project/tree";
import { countTextMatches, getEditorStats, handleCodeEditorKeyDown } from "../hooks/useCodeEditor";

const emptyMessages: ChatMessage[] = [];
type AdminRequestState = "ready" | "restarting" | "cancelled";
const isBrowserWorkspaceWindow = new URLSearchParams(window.location.search).get("novayxk-browser-window") === "1";

function App() {
  const initialConfig = window.novayxk?.initialConfig ?? {};
  const initialLanguage = normalizeAppLanguage(initialConfig.language);
  const [messages, setMessages] = React.useState<ChatMessage[]>(emptyMessages);
  const [prompt, setPrompt] = React.useState("");
  const [isSettingsOpen, setIsSettingsOpen] = React.useState(false);
  const [isMemoryOpen, setIsMemoryOpen] = React.useState(false);
  const [confirmDialog, setConfirmDialog] = React.useState<ConfirmDialogState | null>(null);
  const [canUndoPatch, setCanUndoPatch] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(false);
  const [isStopping, setIsStopping] = React.useState(false);
  const [loadingStartedAt, setLoadingStartedAt] = React.useState<number | null>(null);
  const [loadingElapsedMs, setLoadingElapsedMs] = React.useState(0);
  const [status, setStatus] = React.useState<string>(getLocaleStrings(initialLanguage).app.statusOpenProjectToStart);
  const [assistantPromptFocusNonce, setAssistantPromptFocusNonce] = React.useState(0);
  const [editingMessageIndex, setEditingMessageIndex] = React.useState<number | null>(null);
  const [editorFind, setEditorFind] = React.useState("");
  const [isWordWrapEnabled, setIsWordWrapEnabled] = React.useState(false);
  const [isWelcomeOpen, setIsWelcomeOpen] = React.useState(
    initialConfig?.hasSeenWelcome !== true &&
      !initialConfig?.lastProjectRoot &&
      (!Array.isArray(initialConfig?.providers) || initialConfig.providers.length === 0),
  );
  const chatListRef = React.useRef<HTMLDivElement | null>(null);
  const shouldStickToBottomRef = React.useRef(true);
  const stopRequestedRef = React.useRef(false);
  const initialRestoreRootRef = React.useRef(initialConfig.lastProjectRoot ?? null);
  const pendingResumeLoadRef = React.useRef<string | null>(null);
  const handledPendingResumeRef = React.useRef<string | null>(null);

  const {
    providers,
    activeProviderId,
    editingProviderId,
    setEditingProviderId,
    providerTestStatus,
    isTestingProvider,
    providerModelOptions,
    providerModelStatus,
    isLoadingProviderModels,
    aiControlMode,
    assistantMode,
    privilege,
    isRestartingAsAdmin,
    language,
    theme,
    browserShowAdvancedControls,
    activeProvider,
    editingProvider,
    hasSeenWelcome,
    hasSeenWorkspaceGuide,
    pendingAdminResume,
    saveAppConfig,
    saveProviders,
    savePendingAdminResume,
    switchActiveProvider,
    updateLanguage,
    updateTheme,
    updateAiControlMode,
    updateAssistantMode,
    updateBrowserShowAdvancedControls,
    refreshPrivilegeState,
    restartAsAdmin,
    clearPendingAdminResume,
    saveLastProjectRoot,
    updateActiveProvider,
    addProvider,
    removeActiveProvider,
    testActiveProvider,
    loadProviderModels,
  } = useProviderSettings({
    initialConfig,
    setStatus,
  });
  const locale = React.useMemo(() => getLocaleStrings(language), [language]);
  const appStrings = locale.app;
  const getLocalizedAssistantModeStatus = React.useCallback(
    (nextMode: AssistantMode) => {
      if (nextMode === "low") return appStrings.switchedToLowMode;
      if (nextMode === "deep") return appStrings.switchedToDeepMode;
      return appStrings.switchedToStandardMode;
    },
    [appStrings],
  );
  const persistWorkspaceLayout = React.useCallback(
    (workspaceLayout: NonNullable<typeof initialConfig.workspaceLayout>) => {
      void saveAppConfig({ workspaceLayout }).catch(() => {
        // Keep layout changes local even if persistence fails.
      });
    },
    [initialConfig.workspaceLayout, saveAppConfig],
  );
  const {
    isLeftCollapsed,
    setIsLeftCollapsed,
    isRightCollapsed,
    setIsRightCollapsed,
    isBottomCollapsed,
    setIsBottomCollapsed,
    isSidebarVisible,
    isCenterVisible,
    workspaceStyle,
    editorStyle,
    startPanelResize,
  } = useWorkspaceLayout({
    initialLayout: initialConfig.workspaceLayout,
    onLayoutChange: persistWorkspaceLayout,
  });

  const runtimePermissionContext = React.useMemo(
    () => ({
      controlMode: aiControlMode,
      isAdmin: privilege?.isAdmin === true,
      privilegeLabel: privilege?.isAdmin ? "Windows administrator privilege" : privilege ? "Windows standard privilege" : "Unknown privilege",
    }),
    [aiControlMode, privilege],
  );
  const switchAssistantMode = React.useCallback(
    async (nextMode: AssistantMode) => {
      const saved = await updateAssistantMode(nextMode);
      setStatus(saved ? getLocalizedAssistantModeStatus(nextMode) : appStrings.assistantModeSaveFailed);
    },
    [appStrings.assistantModeSaveFailed, getLocalizedAssistantModeStatus, setStatus, updateAssistantMode],
  );
  const hasConfiguredProvider = React.useMemo(() => hasAnyConfiguredProvider(providers), [providers]);

  const {
    project,
    selectedFile,
    setSelectedFile,
    activeTreePath,
    isEditorDirty,
    setIsEditorDirty,
    fileTree,
    expandedPaths,
    treeFilter,
    setTreeFilter,
    filteredFileTree,
    hasTreeFilter,
    isSearchingTree,
    loadingDirectories,
    createEntryDialog,
    setCreateEntryDialog,
    openProject,
    restoreLastProject,
    saveSelectedFile,
    syncProjectView,
    selectFile,
    refreshTree,
    expandAllTreeFolders,
    collapseAllTreeFolders,
    createTreeEntry,
    submitCreateTreeEntry,
  } = useProjectWorkspace({
    saveLastProjectRoot,
    setStatus,
  });
  const selectedTextFile = selectedFile?.kind === "text" ? selectedFile : null;

  const handleProjectMemorySaved = React.useCallback(() => {
    setIsMemoryOpen(false);
  }, []);
  const {
    memoryState,
    projectMemoryDraft,
    setProjectMemoryDraft,
    activeTaskId,
    activeTaskTitle,
    setActiveTaskTitle,
    activeTaskSummary,
    activeTask,
    saveCurrentTask,
    saveCurrentTaskWithStatus,
    startNewTask,
    loadTask,
    saveProjectMemoryDraft,
    hydrateProjectMemory,
  } = useProjectMemory({
    hasProject: Boolean(project),
    messages,
    setMessages,
    setStatus,
    onMemorySaved: handleProjectMemorySaved,
  });

  const selectedFileStats = React.useMemo(() => getEditorStats(selectedTextFile?.content ?? ""), [selectedTextFile?.content]);
  const editorFindMatches = React.useMemo(
    () => countTextMatches(selectedTextFile?.content ?? "", editorFind),
    [editorFind, selectedTextFile?.content],
  );
  const workspaceGuideKind = React.useMemo(
    () =>
      getWorkspaceGuideKind({
        hasConfiguredProvider,
        hasProject: Boolean(project),
        hasSelectedFile: Boolean(selectedFile),
        messageCount: messages.length,
      }),
    [hasConfiguredProvider, messages.length, project, selectedFile],
  );
  const [showWorkspaceStarterGuide, setShowWorkspaceStarterGuide] = React.useState(false);
  React.useEffect(() => {
    if (initialRestoreRootRef.current) {
      const projectRoot = initialRestoreRootRef.current;
      initialRestoreRootRef.current = null;
      void restoreLastProject(projectRoot);
    }
  }, [restoreLastProject]);

  React.useEffect(() => {
    void refreshPrivilegeState();
  }, [refreshPrivilegeState]);

  React.useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  React.useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  React.useEffect(() => {
    if (hasSeenWelcome) {
      setIsWelcomeOpen(false);
    }
  }, [hasSeenWelcome]);

  React.useEffect(() => {
    if (workspaceGuideKind === "start-working" && !hasSeenWorkspaceGuide) {
      setShowWorkspaceStarterGuide(true);
      void saveAppConfig({ hasSeenWorkspaceGuide: true }).catch(() => {
        // Keep the guide visible for this session even if the preference write fails.
      });
      return;
    }
    if (workspaceGuideKind !== "start-working" && showWorkspaceStarterGuide) {
      setShowWorkspaceStarterGuide(false);
    }
  }, [hasSeenWorkspaceGuide, saveAppConfig, showWorkspaceStarterGuide, workspaceGuideKind]);

  const displayedWorkspaceGuideKind = workspaceGuideKind === "start-working"
    ? (showWorkspaceStarterGuide || !hasSeenWorkspaceGuide ? "start-working" : null)
    : workspaceGuideKind;

  React.useEffect(() => {
    if (project?.root) {
      void hydrateProjectMemory();
    }
  }, [hydrateProjectMemory, project?.root]);

  React.useEffect(() => {
    const chatList = chatListRef.current;
    if (chatList) {
      if (!shouldStickToBottomRef.current) return;
      chatList.scrollTop = chatList.scrollHeight;
    }
  }, [messages, isLoading]);

  React.useEffect(() => {
    const chatList = chatListRef.current;
    if (!chatList) return;

    const handleScroll = () => {
      const distanceFromBottom = chatList.scrollHeight - chatList.scrollTop - chatList.clientHeight;
      shouldStickToBottomRef.current = distanceFromBottom <= 40;
    };

    handleScroll();
    chatList.addEventListener("scroll", handleScroll, { passive: true });
    return () => chatList.removeEventListener("scroll", handleScroll);
  }, []);

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

  const prepareAdminCommandResume = React.useCallback(
    async (payload: {
      command: string;
      source: "manual" | "ai";
      controlMode: AiControlMode;
      taskId?: string | null;
      messages?: ChatMessage[];
    }) => {
      await savePendingAdminResume({
        action: "run-command",
        source: payload.source,
        command: payload.command,
        controlMode: payload.controlMode,
        taskId: payload.taskId ?? null,
        projectRoot: project?.root ?? null,
        createdAt: new Date().toISOString(),
        ...(payload.messages?.length ? { messages: payload.messages } : {}),
      });
    },
    [project?.root, savePendingAdminResume],
  );

  const requestAdminForCommandIfNeeded = async (
    command: string,
    inspection: { requiresAdmin?: boolean; adminReason?: string },
    source: "manual" | "ai",
  ): Promise<AdminRequestState> => {
    if (!inspection.requiresAdmin || privilege?.isAdmin || !privilege?.canElevate) return "ready";
    const confirmed = await confirmAdminRequest(command, inspection.adminReason ?? appStrings.commandMayRequireAdmin, source);
    if (!confirmed) {
      setStatus(appStrings.adminSwitchCancelled);
      return "cancelled";
    }
    try {
      const started = await restartAsAdmin();
      return started ? "restarting" : "cancelled";
    } catch (error) {
      setStatus(error instanceof Error ? error.message : appStrings.adminAuthorizationFailed);
      return "cancelled";
    }
  };

  const handleTerminalTaskNeedsInput = React.useCallback((task: TerminalTask) => {
    setIsBottomCollapsed(false);
    setStatus(`${appStrings.terminalTaskWaitingForInput}: ${task.title}`);
  }, [appStrings.terminalTaskWaitingForInput]);

  const {
    terminalTasks,
    activeTerminalTask,
    runningTerminalTaskCount,
    setActiveTerminalTaskId,
    upsertTerminalTask,
    copyTerminalOutput,
  } = useTerminalTasks({
    aiControlMode,
    privilege,
    setStatus,
    prepareAdminCommandResume,
    clearPendingAdminResume,
    requestAdminForCommandIfNeeded,
    confirmSystemAction,
    onTaskNeedsInput: handleTerminalTaskNeedsInput,
  });
  const {
    webviewRef,
    browserUrlInput,
    setBrowserUrlInput,
    browserSnapshot,
    browserActionLog,
    browserNetworkLog,
    browserTraceSnapshot,
    browserGuestPreloadUrl,
    browserScriptInput,
    setBrowserScriptInput,
    browserActionSelector,
    setBrowserActionSelector,
    browserActionText,
    setBrowserActionText,
    browserActionTimeoutMs,
    setBrowserActionTimeoutMs,
    lastBrowserAutomationResult,
    setLastBrowserAutomationResult,
    browserPromptSnapshot,
    browserCommand,
    browserCommandNonce,
    browserTargetUrl,
    navigateBrowser,
    runBrowserCommand,
    runBrowserAutomation,
    getBrowserPromptContext,
    clearBrowserLogs,
  } = useBrowserWorkspace({
    setStatus,
  });

  const runBrowserAutomationViaWorkspaceWindow = React.useCallback(
    async (action: BrowserAutomationAction, focus = true) => {
      const result = await window.novayxk?.browserRunInWorkspaceWindow({
        type: "automation",
        action,
        focus,
      });
      return result as BrowserAutomationResult;
    },
    [],
  );

  const getBrowserPromptContextViaWorkspaceWindow = React.useCallback(async () => {
    const result = await window.novayxk?.browserRunInWorkspaceWindow({
      type: "prompt-context",
    });
    if (result && typeof result === "object" && "snapshot" in result) {
      const fallback = result as { snapshot: BrowserSnapshot; trace?: BrowserTraceSnapshot };
      return formatBrowserPromptContext({
        snapshot: fallback.snapshot,
        page: null,
        actions: browserActionLog,
        network: browserNetworkLog,
        trace: fallback.trace ?? null,
      });
    }
    return String(result || "");
  }, [browserActionLog, browserNetworkLog]);

  const shouldFocusBrowserForAutomation = React.useCallback((action: BrowserAutomationAction) => {
    if (action.type === "extractText") return false;
    if (action.type === "runScript") {
      return !/^(?:document\.location\.href|location\.href|document\.title|document\.body\.innerText|document\.body\.textContent)$/i.test(action.script.trim());
    }
    return true;
  }, []);

  const navigateBrowserViaWorkspaceWindow = React.useCallback(async () => {
    const nextUrl = browserUrlInput;
    await window.novayxk?.browserRunInWorkspaceWindow({
      type: "navigate",
      url: nextUrl,
    });
  }, [browserUrlInput]);

  const runBrowserCommandViaWorkspaceWindow = React.useCallback(
    async (command: "reload" | "back" | "forward") => {
      await window.novayxk?.browserRunInWorkspaceWindow({
        type: "command",
        command,
      });
    },
    [],
  );
  const { sendMessage, stopGeneration, resumePendingAdminCommand } = useAiAssistant({
    prompt,
    setPrompt,
    messages,
    setMessages,
    isLoading,
    setIsLoading,
    isStopping,
    setIsStopping,
    setLoadingStartedAt,
    setLoadingElapsedMs,
    setStatus,
    stopRequestedRef,
    project,
    selectedFile,
    activeProvider,
    memoryState,
    activeTaskSummary,
    runtimePermissionContext,
    aiControlMode,
    assistantMode,
    language,
    privilege,
    openBrowserWorkspace: () => {
      void openBrowserWorkspaceWindow();
    },
    getBrowserPromptContext: isBrowserWorkspaceWindow ? getBrowserPromptContext : getBrowserPromptContextViaWorkspaceWindow,
    executeBrowserAutomation: async (actions: BrowserAutomationAction[]) => {
      const results: BrowserAutomationResult[] = [];
      for (const action of actions) {
        const result = isBrowserWorkspaceWindow
          ? await runBrowserAutomation(action)
          : await runBrowserAutomationViaWorkspaceWindow(action, shouldFocusBrowserForAutomation(action));
        results.push(result);
        if (!result.ok) break;
      }
      return results;
    },
    updateAiControlMode,
    updateAssistantMode,
    activeTerminalTask,
    terminalTasks,
    setActiveTerminalTaskId,
    upsertTerminalTask,
    showBottomPanel: () => setIsBottomCollapsed(false),
    activeTaskId,
    editingMessageIndex,
    setEditingMessageIndex,
    prepareAdminCommandResume,
    clearPendingAdminResume,
    requestAdminForCommandIfNeeded,
    confirmSystemAction,
    saveCurrentTask,
    restartAsAdmin,
    syncProjectView,
  });

  const dismissWelcomeGuide = React.useCallback(async () => {
    setIsWelcomeOpen(false);
    try {
      await saveAppConfig({ hasSeenWelcome: true });
    } catch {
      // Keep the guide dismissed locally even if saving the preference fails.
    }
  }, [saveAppConfig]);
  const displayedMessage = messages[messages.length - 1]?.content ?? "";
  const {
    patchPreview,
    fileOpsPreview,
    executeConfirmedCommand,
    askApplyPatch,
    applyConfirmedPatch,
    askApplyFileOps,
    applyConfirmedFileOps,
    undoPatch,
  } = useWorkspaceActions({
    displayedMessage,
    project,
    selectedFile,
    canUndoPatch,
    isLoading,
    setIsLoading,
    setStatus,
    setCanUndoPatch,
    setConfirmDialog,
    stopRequestedRef,
    privilege,
    prepareAdminCommandResume,
    clearPendingAdminResume,
    requestAdminForCommandIfNeeded,
    confirmSystemAction,
    syncProjectView,
  });

  const openBrowserWorkspaceWindow = React.useCallback(async () => {
    try {
      await window.novayxk?.openBrowserWorkspaceWindow();
      setStatus(appStrings.openedBrowserWorkspaceWindow);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : appStrings.failedToOpenBrowserWorkspaceWindow);
    }
  }, [appStrings.failedToOpenBrowserWorkspaceWindow, appStrings.openedBrowserWorkspaceWindow]);

  React.useEffect(() => {
    if (!pendingAdminResume) {
      pendingResumeLoadRef.current = null;
      handledPendingResumeRef.current = null;
      return;
    }
    if (!privilege?.isAdmin) return;
    if (handledPendingResumeRef.current === pendingAdminResume.createdAt) return;
    if (pendingAdminResume.projectRoot && pendingAdminResume.projectRoot !== project?.root) return;

    if (pendingAdminResume.taskId && activeTaskId !== pendingAdminResume.taskId) {
      if (pendingResumeLoadRef.current === pendingAdminResume.taskId) return;
      pendingResumeLoadRef.current = pendingAdminResume.taskId;
      void loadTask(pendingAdminResume.taskId);
      return;
    }

    pendingResumeLoadRef.current = null;
    handledPendingResumeRef.current = pendingAdminResume.createdAt;
    void resumePendingAdminCommand(pendingAdminResume).catch(() => {
      handledPendingResumeRef.current = null;
    });
  }, [
    activeTaskId,
    loadTask,
    pendingAdminResume,
    privilege?.isAdmin,
    project?.root,
    resumePendingAdminCommand,
  ]);

  if (isBrowserWorkspaceWindow) {
    return (
      <main className="app-shell browser-window-shell" data-theme={theme}>
        <section className="browser-window-panel">
          <div className="center-panel-tabs browser-window-tabs">
            <button className="active">
              <Folder size={15} />
              {appStrings.browserWorkspace}
            </button>
          </div>
          <BrowserWorkspace
            language={language}
            webviewRef={webviewRef}
            browserUrlInput={browserUrlInput}
            browserSnapshot={browserSnapshot}
            browserActionLog={browserActionLog}
            browserNetworkLog={browserNetworkLog}
            browserTraceSnapshot={browserTraceSnapshot}
            browserGuestPreloadUrl={browserGuestPreloadUrl}
            browserScriptInput={browserScriptInput}
            browserActionSelector={browserActionSelector}
            browserActionText={browserActionText}
            browserActionTimeoutMs={browserActionTimeoutMs}
            lastBrowserAutomationResult={lastBrowserAutomationResult}
            browserPromptSnapshot={browserPromptSnapshot}
            browserCommand={browserCommand}
            browserCommandNonce={browserCommandNonce}
            browserTargetUrl={browserTargetUrl}
            onBrowserUrlInputChange={setBrowserUrlInput}
            onBrowserScriptInputChange={setBrowserScriptInput}
            onBrowserActionSelectorChange={setBrowserActionSelector}
            onBrowserActionTextChange={setBrowserActionText}
            onBrowserActionTimeoutChange={setBrowserActionTimeoutMs}
            onNavigateBrowser={() => {
              void navigateBrowser();
            }}
            onRunBrowserCommand={(command) => {
              void runBrowserCommand(command);
            }}
            onBrowserScriptExecuted={({ ok, preview }) => {
              setLastBrowserAutomationResult({
                ok,
                action: "runScript",
                preview,
              });
              setStatus(ok ? `${appStrings.pageScriptCompleted}: ${preview}` : `${appStrings.pageScriptFailed}: ${preview}`);
            }}
            onRunBrowserAutomation={runBrowserAutomation}
            onClearBrowserLogs={() => {
              void clearBrowserLogs();
            }}
            showAdvancedControls={browserShowAdvancedControls}
            isActive
          />
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell" data-theme={theme}>
      <header className="topbar">
        <div className="topbar-leading">
          <div className="brand-block">
            <div className="brand-mark">
              <img src={novayxkLogo} alt="" />
            </div>
            <div>
              <h1>{PRODUCT_NAME}</h1>
              <p>{appStrings.productTagline}</p>
            </div>
          </div>
          <div className="topbar-project-state">
            <span>{appStrings.currentWorkspace}</span>
            <strong>{project ? shortPath(project.root) : appStrings.noProjectOpened}</strong>
          </div>
        </div>

        <div className="top-actions">
          <div className="top-actions-meta">
            <div className={`privilege-chip ${privilege?.isAdmin ? "admin" : "standard"}`}>
              {privilege?.isAdmin ? <ShieldCheck size={15} /> : <LockKeyhole size={15} />}
              {privilege?.isAdmin ? appStrings.privilegeAdmin : appStrings.privilegeStandard}
            </div>
            <div className={`control-mode ${aiControlMode === "full" ? "full" : "safe"}`}>
              <button
                className={aiControlMode === "safe" ? "active" : ""}
                onClick={() => void updateAiControlMode("safe")}
                title={appStrings.executionProjectTitle}
              >
                <LockKeyhole size={15} />
                {appStrings.executionProject}
              </button>
              <button
                className={aiControlMode === "full" ? "active" : ""}
                onClick={() => void updateAiControlMode("full")}
                title={appStrings.executionSystemTitle}
              >
                <UnlockKeyhole size={15} />
                {appStrings.executionSystem}
              </button>
            </div>
            <button
              className="theme-toggle"
              onClick={() => void updateTheme(theme === "dark" ? "light" : "dark")}
              title={theme === "dark" ? appStrings.switchToLightMode : appStrings.switchToDarkMode}
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
          <div className="top-actions-main">
            <select
              className="model-select"
              value={activeProviderId}
              onChange={(event) => void switchActiveProvider(event.target.value)}
              aria-label={appStrings.chooseModelProvider}
            >
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name} / {provider.model || appStrings.noModelSelected}
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
              {appStrings.settings}
            </button>
            <button className="primary-button" onClick={openProject}>
              <FolderOpen size={17} />
              {appStrings.openProject}
            </button>
          </div>
        </div>
      </header>

      <section
        className={`workspace ${isLeftCollapsed ? "left-collapsed" : ""} ${isRightCollapsed ? "right-collapsed" : ""}`}
        style={workspaceStyle}
      >
        {isLeftCollapsed && (
          <button className="restore-panel restore-left" onClick={() => setIsLeftCollapsed(false)} title={appStrings.showProjectPanel}>
            <ChevronsRight size={15} />
          </button>
        )}
        {isRightCollapsed && (
          <button className="restore-panel restore-right" onClick={() => setIsRightCollapsed(false)} title={appStrings.showAssistantPanel}>
            <ChevronsLeft size={15} />
          </button>
        )}

        {isSidebarVisible && (
          <ProjectSidebar
            isCollapsed={false}
            language={language}
            projectRoot={project?.root ?? null}
            treeFilter={treeFilter}
            filteredFileTree={filteredFileTree}
            hasTreeFilter={hasTreeFilter}
            isSearchingTree={isSearchingTree}
            expandedPaths={expandedPaths}
            selectedPath={activeTreePath ?? selectedFile?.path}
            loadingDirectories={loadingDirectories}
            onCollapse={() => setIsLeftCollapsed(true)}
            onTreeFilterChange={setTreeFilter}
            onClearTreeFilter={() => setTreeFilter("")}
            onRefreshTree={refreshTree}
            onExpandAll={expandAllTreeFolders}
            onCollapseAll={collapseAllTreeFolders}
            onCreateEntry={createTreeEntry}
            onSelectFile={selectFile}
          />
        )}

        {isSidebarVisible && (
          <div
            className="resize-handle vertical left-handle"
            onPointerDown={(event) => startPanelResize(event, "left")}
            role="separator"
            aria-label={appStrings.resizeProjectPanel}
          />
        )}

        {isCenterVisible && (
          <section className={`editor-area ${isBottomCollapsed ? "bottom-collapsed" : ""}`} style={editorStyle}>
            <EditorPane
              language={language}
              selectedFile={selectedFile}
              isEditorDirty={isEditorDirty}
              stats={selectedFileStats}
              editorFind={editorFind}
              editorFindMatches={editorFindMatches}
              isWordWrapEnabled={isWordWrapEnabled}
              isBottomCollapsed={isBottomCollapsed}
              aiControlMode={aiControlMode}
              workspaceGuideKind={displayedWorkspaceGuideKind}
              onEditorFindChange={setEditorFind}
              onToggleWordWrap={() => setIsWordWrapEnabled((value) => !value)}
              onShowBottomPanel={() => setIsBottomCollapsed(false)}
              onSaveSelectedFile={saveSelectedFile}
              onOpenSettings={() => {
                setEditingProviderId(activeProvider.id);
                setIsSettingsOpen(true);
              }}
              onOpenProject={() => {
                void openProject();
              }}
              onUseGuidePrompt={(nextPrompt) => {
                setIsRightCollapsed(false);
                setPrompt(nextPrompt);
                setAssistantPromptFocusNonce((value) => value + 1);
                setStatus(appStrings.starterPromptInserted);
              }}
              onSelectedFileContentChange={(content) => {
                if (!selectedTextFile) return;
                setSelectedFile({ ...selectedTextFile, content });
                setIsEditorDirty(true);
              }}
              onEditorKeyDown={(event) => {
                if (!selectedTextFile) return;
                handleCodeEditorKeyDown(event, selectedTextFile, setSelectedFile, setIsEditorDirty);
              }}
            />

            {!isBottomCollapsed && (
              <div
                className="resize-handle horizontal bottom-handle"
                onPointerDown={(event) => startPanelResize(event, "bottom")}
                role="separator"
                aria-label={appStrings.resizeBottomTools}
              />
            )}

            <div className="bottom-grid" aria-hidden={isBottomCollapsed}>
              <TerminalPanel
                language={language}
                canUndoPatch={canUndoPatch}
                isLoading={isLoading}
                hasPatchPreview={Boolean(patchPreview)}
                hasProject={Boolean(project)}
                fileOpsPreviewCount={fileOpsPreview.length}
                terminalTasks={terminalTasks}
                activeTerminalTask={activeTerminalTask}
                runningTerminalTaskCount={runningTerminalTaskCount}
                projectRoot={project?.root ?? null}
                onUndoPatch={undoPatch}
                onAskApplyPatch={askApplyPatch}
                onAskApplyFileOps={askApplyFileOps}
                onCopyTerminalOutput={copyTerminalOutput}
                onCollapse={() => setIsBottomCollapsed(true)}
                onSelectTerminalTask={setActiveTerminalTaskId}
              />
            </div>
          </section>
        )}

        {!isRightCollapsed && (
          <div
            className="resize-handle vertical right-handle"
            onPointerDown={(event) => startPanelResize(event, "right")}
            role="separator"
            aria-label={appStrings.resizeAssistantPanel}
          />
        )}

        <AssistantPanel
          isCollapsed={isRightCollapsed}
          model={activeProvider.model || appStrings.noModelSelected}
          language={language}
          assistantMode={assistantMode}
          hasProject={Boolean(project)}
          isModelReady={hasConfiguredProvider}
          activeTaskId={activeTaskId}
          activeTaskTitle={activeTaskTitle}
          activeTask={activeTask}
          tasks={memoryState?.tasks ?? []}
          projectMemoryLength={memoryState?.memory.length ?? 0}
          messages={messages}
          isLoading={isLoading}
          loadingElapsedMs={loadingElapsedMs}
          prompt={prompt}
          isStopping={isStopping}
          runningTerminalTaskCount={runningTerminalTaskCount}
          promptFocusNonce={assistantPromptFocusNonce}
          chatListRef={chatListRef}
          onCollapse={() => setIsRightCollapsed(true)}
          onLoadTask={(taskId) => {
            setEditingMessageIndex(null);
            void loadTask(taskId);
          }}
          onStartNewTask={() => {
            setEditingMessageIndex(null);
            void startNewTask();
          }}
          onSaveCurrentTask={saveCurrentTaskWithStatus}
          onOpenMemory={() => setIsMemoryOpen(true)}
          onTaskTitleChange={setActiveTaskTitle}
          onTaskTitleBlur={() => {
            if (activeTaskId) void saveCurrentTask(messages);
          }}
          onPromptChange={setPrompt}
          onSendMessage={sendMessage}
          onAssistantModeChange={switchAssistantMode}
          onStopGeneration={stopGeneration}
          editingMessageIndex={editingMessageIndex}
          onEditPreviousPrompt={(index) => {
            const targetMessage = messages[index];
            if (!targetMessage || targetMessage.role !== "user") return;
            setPrompt(targetMessage.content);
            setEditingMessageIndex(index);
            setAssistantPromptFocusNonce((value) => value + 1);
            setStatus(appStrings.previousPromptRestored);
          }}
        />
      </section>

      <footer className="statusbar">
        <span>{status}</span>
        <span>{project ? appStrings.workspaceConnected : appStrings.workspacePreview}</span>
      </footer>

      {isSettingsOpen && (
        <SettingsModal
          language={language}
          providers={providers}
          activeProviderId={activeProviderId}
          editingProvider={editingProvider}
          providerTestStatus={providerTestStatus}
          isTestingProvider={isTestingProvider}
          providerModelOptions={providerModelOptions[editingProvider.id] ?? []}
          providerModelStatus={providerModelStatus}
          isLoadingProviderModels={isLoadingProviderModels}
          browserShowAdvancedControls={browserShowAdvancedControls}
          privilege={privilege}
          isRestartingAsAdmin={isRestartingAsAdmin}
          onSelectProvider={setEditingProviderId}
          onAddProvider={addProvider}
          onRemoveProvider={removeActiveProvider}
          onUpdateProvider={updateActiveProvider}
          onTestProvider={testActiveProvider}
          onReloadModels={() => {
            void loadProviderModels(editingProvider, { force: true });
          }}
          onToggleBrowserShowAdvancedControls={(value) => {
            void updateBrowserShowAdvancedControls(value);
          }}
          onLanguageChange={(nextLanguage) => {
            void updateLanguage(nextLanguage);
          }}
          onRestartAsAdmin={() => {
            void restartAsAdmin();
          }}
          onClose={() => setIsSettingsOpen(false)}
          onSave={() => {
            void saveProviders(providers, activeProviderId).then(() => setIsSettingsOpen(false));
          }}
        />
      )}

      {isMemoryOpen && (
        <MemoryModal
          language={language}
          projectLabel={project ? shortPath(project.root) : appStrings.noProjectOpened}
          memoryDraft={projectMemoryDraft}
          canSave={Boolean(project)}
          onMemoryDraftChange={setProjectMemoryDraft}
          onClose={() => setIsMemoryOpen(false)}
          onSave={saveProjectMemoryDraft}
        />
      )}

      {createEntryDialog && (
        <CreateEntryDialog
          language={language}
          dialog={createEntryDialog}
          projectLabel={project ? shortPath(project.root) : appStrings.noProjectOpened}
          canSubmit={Boolean(normalizeRelativePath(createEntryDialog.path))}
          onPathChange={(path) => setCreateEntryDialog({ ...createEntryDialog, path })}
          onCancel={() => setCreateEntryDialog(null)}
          onSubmit={submitCreateTreeEntry}
        />
      )}

      {confirmDialog && (
        <ConfirmDialog
          language={language}
          dialog={confirmDialog}
          onCancel={() => {
            if (confirmDialog.type === "system-action" || confirmDialog.type === "admin-request") {
              confirmDialog.resolve(false);
            }
            setConfirmDialog(null);
          }}
          onConfirm={() => {
            const dialog = confirmDialog;
            setConfirmDialog(null);
            if (dialog.type === "command") {
              void executeConfirmedCommand(dialog.command);
            } else if (dialog.type === "patch") {
              void applyConfirmedPatch(dialog.patchText);
            } else if (dialog.type === "fileops") {
              void applyConfirmedFileOps(dialog.operations);
            } else {
              dialog.resolve(true);
            }
          }}
        />
      )}

      {isWelcomeOpen && !project && messages.length === 0 && (
        <WelcomeGuide
          language={language}
          onDismiss={() => {
            void dismissWelcomeGuide();
          }}
          onOpenSettings={() => {
            void dismissWelcomeGuide().then(() => {
              setEditingProviderId(activeProvider.id);
              setIsSettingsOpen(true);
            });
          }}
          onOpenProject={() => {
            void dismissWelcomeGuide().then(() => {
              void openProject();
            });
          }}
        />
      )}
    </main>
  );
}

export default App;
