import React from "react";
import {
  Check,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  ChevronRight,
  FileCode2,
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
  ChatMessage,
  TerminalTask,
} from "../vite-env";
import { TerminalPanel } from "./terminal/TerminalPanel";
import { ConfirmDialog, type ConfirmDialogState } from "./dialogs/ConfirmDialog";
import { CreateEntryDialog } from "./dialogs/CreateEntryDialog";
import { MemoryModal } from "./settings/MemoryModal";
import { SettingsModal } from "./settings/SettingsModal";
import { ProjectSidebar } from "./sidebar/ProjectSidebar";
import { EditorPane } from "./editor/EditorPane";
import { AssistantPanel } from "./assistant/AssistantPanel";
import { WelcomeGuide } from "./onboarding/WelcomeGuide";
import { useTerminalTasks } from "../hooks/useTerminalTasks";
import { useProjectMemory } from "../hooks/useProjectMemory";
import { useWorkspaceLayout } from "../hooks/useWorkspaceLayout";
import { useProviderSettings } from "../hooks/useProviderSettings";
import { useProjectWorkspace } from "../hooks/useProjectWorkspace";
import { useAiAssistant } from "../hooks/useAiAssistant";
import { useWorkspaceActions } from "../hooks/useWorkspaceActions";
import { hasAnyConfiguredProvider } from "../ai/providers";
import {
  getExecutionModeLabel,
  getExecutionModeTitle,
  getPrivilegeChipLabel,
  getWorkspaceStatusLabel,
  PRODUCT_NAME,
  PRODUCT_TAGLINE,
} from "../app/product";
import { getGuidePromptStatus, getWorkspaceGuideKind } from "../app/workspaceGuide";
import {
  normalizeRelativePath,
  shortPath,
} from "../project/tree";
import { countTextMatches, getEditorStats, handleCodeEditorKeyDown } from "../hooks/useCodeEditor";

const emptyMessages: ChatMessage[] = [];
type AdminRequestState = "ready" | "restarting" | "cancelled";

function App() {
  const initialConfig = window.novayxk?.initialConfig ?? {};
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
  const [status, setStatus] = React.useState("打开一个项目，开始和 Novayxk 协作。");
  const [assistantPromptFocusNonce, setAssistantPromptFocusNonce] = React.useState(0);
  const {
    isLeftCollapsed,
    setIsLeftCollapsed,
    isRightCollapsed,
    setIsRightCollapsed,
    isBottomCollapsed,
    setIsBottomCollapsed,
    workspaceStyle,
    editorStyle,
    startPanelResize,
  } = useWorkspaceLayout();
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
    aiControlMode,
    privilege,
    isRestartingAsAdmin,
    theme,
    activeProvider,
    editingProvider,
    hasSeenWelcome,
    hasSeenWorkspaceGuide,
    pendingAdminResume,
    saveAppConfig,
    saveProviders,
    savePendingAdminResume,
    switchActiveProvider,
    updateTheme,
    updateAiControlMode,
    refreshPrivilegeState,
    restartAsAdmin,
    clearPendingAdminResume,
    saveLastProjectRoot,
    updateActiveProvider,
    addProvider,
    removeActiveProvider,
    testActiveProvider,
  } = useProviderSettings({
    initialConfig,
    setStatus,
  });

  const runtimePermissionContext = React.useMemo(
    () => ({
      controlMode: aiControlMode,
      isAdmin: privilege?.isAdmin === true,
      privilegeLabel: privilege?.isAdmin ? "Windows 管理员权限" : privilege ? "Windows 普通权限" : "未知权限",
    }),
    [aiControlMode, privilege],
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

  const selectedFileStats = React.useMemo(() => getEditorStats(selectedFile?.content ?? ""), [selectedFile?.content]);
  const editorFindMatches = React.useMemo(
    () => countTextMatches(selectedFile?.content ?? "", editorFind),
    [editorFind, selectedFile?.content],
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
    const confirmed = await confirmAdminRequest(command, inspection.adminReason ?? "该命令可能需要管理员权限", source);
    if (!confirmed) {
      setStatus("已取消管理员模式切换。");
      return "cancelled";
    }
    try {
      const started = await restartAsAdmin();
      return started ? "restarting" : "cancelled";
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "管理员授权请求失败");
      return "cancelled";
    }
  };

  const handleTerminalTaskNeedsInput = React.useCallback((task: TerminalTask) => {
    setIsBottomCollapsed(false);
    setStatus(`终端任务等待输入：${task.title}`);
  }, []);

  const {
    terminalCommand,
    setTerminalCommand,
    terminalInput,
    setTerminalInput,
    terminalTasks,
    activeTerminalTask,
    runningTerminalTaskCount,
    setActiveTerminalTaskId,
    upsertTerminalTask,
    startTerminalTask,
    stopActiveTerminalTask,
    restartActiveTerminalTask,
    copyTerminalOutput,
    sendTerminalInput,
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
    privilege,
    updateAiControlMode,
    activeTerminalTask,
    terminalTasks,
    setActiveTerminalTaskId,
    upsertTerminalTask,
    showBottomPanel: () => setIsBottomCollapsed(false),
    activeTaskId,
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

  return (
    <main className="app-shell" data-theme={theme}>
      <header className="topbar">
        <div className="brand-block">
          <div className="brand-mark">
            <img src={novayxkLogo} alt="" />
          </div>
          <div>
            <h1>{PRODUCT_NAME}</h1>
            <p>{PRODUCT_TAGLINE}</p>
          </div>
        </div>

        <div className="top-actions">
          <div className={`privilege-chip ${privilege?.isAdmin ? "admin" : "standard"}`}>
            {privilege?.isAdmin ? <ShieldCheck size={15} /> : <LockKeyhole size={15} />}
            {getPrivilegeChipLabel(privilege?.isAdmin)}
          </div>
          <div className={`control-mode ${aiControlMode === "full" ? "full" : "safe"}`}>
            <button
              className={aiControlMode === "safe" ? "active" : ""}
              onClick={() => void updateAiControlMode("safe")}
              title={getExecutionModeTitle("safe")}
            >
              <LockKeyhole size={15} />
              {getExecutionModeLabel("safe")}
            </button>
            <button
              className={aiControlMode === "full" ? "active" : ""}
              onClick={() => void updateAiControlMode("full")}
              title={getExecutionModeTitle("full")}
            >
              <UnlockKeyhole size={15} />
              {getExecutionModeLabel("full")}
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

        <ProjectSidebar
          isCollapsed={isLeftCollapsed}
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

        {!isLeftCollapsed && (
          <div
            className="resize-handle vertical left-handle"
            onPointerDown={(event) => startPanelResize(event, "left")}
            role="separator"
            aria-label="调整项目栏宽度"
          />
        )}

        <section className={`editor-area ${isBottomCollapsed ? "bottom-collapsed" : ""}`} style={editorStyle}>
          <EditorPane
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
              setStatus(getGuidePromptStatus());
            }}
            onSelectedFileContentChange={(content) => {
              if (!selectedFile) return;
              setSelectedFile({ ...selectedFile, content });
              setIsEditorDirty(true);
            }}
            onEditorKeyDown={(event) => {
              if (!selectedFile) return;
              handleCodeEditorKeyDown(event, selectedFile, setSelectedFile, setIsEditorDirty);
            }}
          />

          {!isBottomCollapsed && (
            <div
              className="resize-handle horizontal bottom-handle"
              onPointerDown={(event) => startPanelResize(event, "bottom")}
              role="separator"
              aria-label="调整底部工具区高度"
            />
          )}

          <div className="bottom-grid" aria-hidden={isBottomCollapsed}>
            <TerminalPanel
              canUndoPatch={canUndoPatch}
              isLoading={isLoading}
              hasPatchPreview={Boolean(patchPreview)}
              hasProject={Boolean(project)}
              fileOpsPreviewCount={fileOpsPreview.length}
              terminalCommand={terminalCommand}
              terminalInput={terminalInput}
              terminalTasks={terminalTasks}
              activeTerminalTask={activeTerminalTask}
              runningTerminalTaskCount={runningTerminalTaskCount}
              projectRoot={project?.root ?? null}
              onUndoPatch={undoPatch}
              onAskApplyPatch={askApplyPatch}
              onAskApplyFileOps={askApplyFileOps}
              onCopyTerminalOutput={copyTerminalOutput}
              onCollapse={() => setIsBottomCollapsed(true)}
              onTerminalCommandChange={setTerminalCommand}
              onStartTerminalTask={startTerminalTask}
              onStopActiveTerminalTask={stopActiveTerminalTask}
              onRestartActiveTerminalTask={restartActiveTerminalTask}
              onSelectTerminalTask={setActiveTerminalTaskId}
              onTerminalInputChange={setTerminalInput}
              onSendTerminalInput={sendTerminalInput}
            />
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

        <AssistantPanel
          isCollapsed={isRightCollapsed}
          model={activeProvider.model}
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
            void loadTask(taskId);
          }}
          onStartNewTask={() => {
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
          onStopGeneration={stopGeneration}
        />
      </section>

      <footer className="statusbar">
        <span>{status}</span>
        <span>{getWorkspaceStatusLabel(Boolean(project))}</span>
      </footer>

      {isSettingsOpen && (
        <SettingsModal
          providers={providers}
          activeProviderId={activeProviderId}
          editingProvider={editingProvider}
          providerTestStatus={providerTestStatus}
          isTestingProvider={isTestingProvider}
          privilege={privilege}
          isRestartingAsAdmin={isRestartingAsAdmin}
          onSelectProvider={setEditingProviderId}
          onAddProvider={addProvider}
          onRemoveProvider={removeActiveProvider}
          onUpdateProvider={updateActiveProvider}
          onTestProvider={testActiveProvider}
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
          projectLabel={project ? shortPath(project.root) : "尚未打开项目"}
          memoryDraft={projectMemoryDraft}
          canSave={Boolean(project)}
          onMemoryDraftChange={setProjectMemoryDraft}
          onClose={() => setIsMemoryOpen(false)}
          onSave={saveProjectMemoryDraft}
        />
      )}

      {createEntryDialog && (
        <CreateEntryDialog
          dialog={createEntryDialog}
          projectLabel={project ? shortPath(project.root) : "尚未打开项目"}
          canSubmit={Boolean(normalizeRelativePath(createEntryDialog.path))}
          onPathChange={(path) => setCreateEntryDialog({ ...createEntryDialog, path })}
          onCancel={() => setCreateEntryDialog(null)}
          onSubmit={submitCreateTreeEntry}
        />
      )}

      {confirmDialog && (
        <ConfirmDialog
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
