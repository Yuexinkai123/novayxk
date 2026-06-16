import type { MutableRefObject } from "react";
import type { BrowserAutomationAction } from "../browser/actions";
import {
  STREAM_ABORT_MESSAGE,
  buildModelChatHistory,
  buildSystemPrompt,
  detectAdminPrivilegeRequest,
  detectAssistantModeRequest,
  detectInternalControlModeRequest,
  extractBrowserActions,
  extractFileOps,
  formatProjectContext,
  getAssistantModeProfile,
  getAutomationRecoveryIssue,
  getBrowserActionsParseIssue,
  getFileOpsParseIssue,
  hasDestructiveFileOps,
  getProjectContextMode,
  normalizeAssistantToolCallContent,
  sanitizeChatHistory,
  stripPrematurePowerShellResultText,
  type RuntimePermissionContext,
} from "../ai/chat";
import {
  buildCommandResultJudgementNote,
  buildUserIntentInstruction,
  getUserIntentProfile,
  isLikelyIncompleteAssistantReply,
  type UserIntentProfile,
} from "../policy";
import { inspectSensitiveGeneratedContent, isWriteLikePowerShellCommand } from "../policy/sensitive";
import type {
  AiControlMode,
  AssistantMode,
  BrowserAutomationResult,
  ChatMessage,
  FileOperation,
  PendingAdminResume,
  ProjectMemoryState,
  ProjectPayload,
  ProviderConfig,
  ProjectSelectedFile,
  TaskHistory,
  TerminalTask,
  TokenUsage,
} from "../vite-env";
import {
  COMMAND_LOOP_SAFETY_LIMIT,
  type CommandLoopState,
  createCommandLoopState,
  extractPowerShellCommandRequests,
  inspectCommandLoop,
} from "../terminal/commands";
import { formatActionableError } from "../app/errors";
import { getAssistantModeStatus, getExecutionModeLabel, getExecutionModeStatus } from "../app/product";
import { isImageGenerationMode, isLikelyImageModel } from "../ai/providers";
import { buildEstimatedTokenUsage, mergeTokenUsage } from "../ai/tokens";

type PrivilegeState = { platform: string; isAdmin: boolean; canElevate: boolean; isDev: boolean } | null;
type CommandInspection = { requiresAdmin?: boolean; adminReason?: string; requiresConfirmation?: boolean; systemAction?: { label: string } };

const BROWSER_AUTOMATION_LOOP_LIMIT = 4;
const BROWSER_AUTOMATION_REPEAT_LIMIT = 2;
const MODEL_REQUEST_MAX_RETRIES = 5;
const DEEP_VERIFICATION_CONTEXT_LIMIT = 5000;
const SENSITIVE_AUTOMATION_PATTERN =
  /(?:password|passwd|pwd|authorization|cookie|set-cookie|new-api-user|api[_-]?key|secret|credential|document\.cookie|localstorage|sessionstorage|\/api\/user\/login|\/api\/auth\/login|__capturedrequests|xmlhttprequest\.prototype|window\.fetch\s*=)/i;

type VerificationDepth = "minimal" | "standard" | "deep";
type VerificationSummary = {
  note: string;
  tokenUsage?: TokenUsage;
};

type UseAiAssistantOptions = {
  prompt: string;
  setPrompt: (prompt: string) => void;
  messages: ChatMessage[];
  setMessages: (messages: ChatMessage[]) => void;
  isLoading: boolean;
  setIsLoading: (value: boolean) => void;
  isStopping: boolean;
  setIsStopping: (value: boolean) => void;
  setLoadingStartedAt: (value: number | null) => void;
  setLoadingElapsedMs: (value: number) => void;
  setStatus: (status: string) => void;
  stopRequestedRef: MutableRefObject<boolean>;
  project: ProjectPayload | null;
  selectedFile: ProjectSelectedFile | null;
  activeProvider: ProviderConfig;
  memoryState: ProjectMemoryState | null;
  activeTaskSummary: string;
  runtimePermissionContext: RuntimePermissionContext;
  aiControlMode: AiControlMode;
  assistantMode: AssistantMode;
  privilege: PrivilegeState;
  openBrowserWorkspace: () => void;
  getBrowserPromptContext: () => Promise<string>;
  executeBrowserAutomation: (actions: BrowserAutomationAction[]) => Promise<BrowserAutomationResult[]>;
  updateAiControlMode: (mode: AiControlMode) => Promise<boolean>;
  updateAssistantMode: (mode: AssistantMode) => Promise<boolean>;
  activeTerminalTask: TerminalTask | null;
  terminalTasks: TerminalTask[];
  setActiveTerminalTaskId: (taskId: string) => void;
  upsertTerminalTask: (task: TerminalTask) => void;
  showBottomPanel: () => void;
  activeTaskId: string | null;
  editingMessageIndex: number | null;
  setEditingMessageIndex: (value: number | null) => void;
  prepareAdminCommandResume: (payload: {
    command: string;
    source: "manual" | "ai";
    controlMode: AiControlMode;
    taskId?: string | null;
    messages?: ChatMessage[];
  }) => Promise<void>;
  clearPendingAdminResume: () => Promise<void>;
  requestAdminForCommandIfNeeded: (
    command: string,
    inspection: CommandInspection,
    source: "manual" | "ai",
  ) => Promise<"ready" | "restarting" | "cancelled">;
  confirmSystemAction: (command: string, label: string, source: "manual" | "ai") => Promise<boolean>;
  saveCurrentTask: (messages?: ChatMessage[]) => Promise<TaskHistory | null>;
  restartAsAdmin: () => Promise<boolean>;
  syncProjectView: (options?: { preferredPath?: string | null; clearMissingSelection?: boolean }) => Promise<void>;
};

export function useAiAssistant({
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
  privilege,
  openBrowserWorkspace,
  getBrowserPromptContext,
  executeBrowserAutomation,
  updateAiControlMode,
  updateAssistantMode,
  activeTerminalTask,
  terminalTasks,
  setActiveTerminalTaskId,
  upsertTerminalTask,
  showBottomPanel,
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
}: UseAiAssistantOptions) {
  async function waitForUiCommit() {
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
    });
  }

  function shouldRetryModelRequest(error: unknown) {
    const message = error instanceof Error ? error.message : String(error || "");
    if (!message || message === STREAM_ABORT_MESSAGE) return false;
    if (
      /供应商配置不完整|图片提示词不能为空|当前在浏览器预览模式|没有检测到 Novayxk 桌面桥接|Base URL 无效|当前供应商配置为图片生成接口|当前系统权限不够|请先打开一个项目|图片生成接口返回成功，但没有图片数据|模型列表接口返回成功，但没有可用模型/i.test(
        message,
      )
    ) {
      return false;
    }
    if (/\b(?:400|401|403|404|422)\b|invalid_request_error|Param Incorrect/i.test(message)) {
      return false;
    }
    return /ECONNRESET|ETIMEDOUT|ENOTFOUND|fetch failed|socket hang up|网络|连接|超时|503|502|504|429|overloaded|temporarily unavailable|暂时不可用/i.test(
      message,
    );
  }

  async function waitBeforeModelRetry(retryIndex: number, actionLabel: string) {
    setStatus(`${actionLabel}失败，正在重试 ${retryIndex}/${MODEL_REQUEST_MAX_RETRIES}...`);
    await new Promise((resolve) => window.setTimeout(resolve, Math.min(1200 * retryIndex, 4000)));
  }

  async function runModelRequestWithRetries<T>(actionLabel: string, runner: () => Promise<T>) {
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= MODEL_REQUEST_MAX_RETRIES; attempt += 1) {
      try {
        return await runner();
      } catch (error) {
        lastError = error;
        if (!shouldRetryModelRequest(error) || attempt >= MODEL_REQUEST_MAX_RETRIES) {
          throw error;
        }
        await waitBeforeModelRetry(attempt, actionLabel);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(`${actionLabel}失败`);
  }

  function getVerificationDepth(mode: AssistantMode): VerificationDepth {
    if (mode === "deep") return "deep";
    if (mode === "standard") return "standard";
    return "minimal";
  }

  function getLatestUserGoal(baseMessages: ChatMessage[]) {
    return [...baseMessages].reverse().find((message) => message.role === "user")?.content.trim() ?? "";
  }

  function appendVerificationNote(content: string, note: string) {
    const trimmedNote = note.trim();
    if (!trimmedNote) return content;
    return `${content.trim()}\n\n${trimmedNote}`;
  }

  function truncateForVerification(value: string, limit = DEEP_VERIFICATION_CONTEXT_LIMIT) {
    return value.length > limit ? `${value.slice(0, limit)}\n...（已截断）` : value;
  }

  function normalizeProjectRelativePath(relativePath: string) {
    return String(relativePath ?? "").replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/").trim();
  }

  function splitProjectPath(relativePath: string) {
    const normalized = normalizeProjectRelativePath(relativePath);
    if (!normalized) return { parent: "", name: "" };
    const parts = normalized.split("/").filter(Boolean);
    const name = parts.pop() ?? "";
    return {
      parent: parts.join("/"),
      name,
    };
  }

  async function requestDeepVerification(
    label: string,
    baseMessages: ChatMessage[],
    evidence: string,
  ): Promise<VerificationSummary> {
    const bridge = window.novayxk;
    if (!bridge || getVerificationDepth(assistantMode) !== "deep") return { note: "" };

    const userGoal = getLatestUserGoal(baseMessages);
    const promptMessages: ChatMessage[] = [
      {
        role: "system",
        content: `${buildSystemPrompt(memoryState?.memory ?? "", activeTaskSummary, runtimePermissionContext, assistantMode)}

【深度复查规则】
你正在做一次执行后复查。只能基于已经发生的真实结果判断，不要脑补成功。
- 只用 1 到 2 句中文。
- 先写“深度复查：已确认 / 基本确认 / 未确认”三选一。
- 再补最关键的依据或仍需人工确认的点。
- 不要输出 powershell-run、fileops、browser-actions、diff 或 JSON。`,
      },
      {
        role: "user",
        content: `原始用户目标：${userGoal || "未提供"}\n\n复查对象：${label}\n\n真实证据：\n${truncateForVerification(evidence)}`,
      },
    ];

    const rawReply = await runModelRequestWithRetries("深度复查请求", () =>
      bridge.chat({
        provider: activeProvider,
        messages: promptMessages,
      }),
    );
    const note = stripPrematurePowerShellResultText(normalizeAssistantToolCallContent(String(rawReply || ""))).trim();
    return {
      note,
      tokenUsage: note ? buildEstimatedTokenUsage(promptMessages, note) : undefined,
    };
  }

  async function doesProjectPathExist(relativePath: string) {
    if (!window.novayxk) return false;
    const { parent, name } = splitProjectPath(relativePath);
    if (!name) return false;
    try {
      const directory = await window.novayxk.readDirectory(parent);
      return directory.children.some((entry) => entry.name === name);
    } catch {
      return false;
    }
  }

  async function buildFileOpsVerificationSummary(
    operations: FileOperation[],
    changedFiles: string[],
    baseMessages: ChatMessage[],
  ): Promise<VerificationSummary> {
    if (!window.novayxk) return { note: "" };

    const depth = getVerificationDepth(assistantMode);
    const writeLikeOperations = operations.filter(
      (operation): operation is Extract<FileOperation, { type: "write" }> | Extract<FileOperation, { type: "replace" }> =>
        operation.type === "write" || operation.type === "replace",
    );
    const mkdirOperations = operations.filter((operation): operation is Extract<FileOperation, { type: "mkdir" }> => operation.type === "mkdir");
    const writeLikeLimit = depth === "minimal" ? 2 : 6;
    const mkdirLimit = depth === "minimal" ? 0 : 4;
    let confirmedWrites = 0;
    let confirmedDirs = 0;
    const failedChecks: string[] = [];
    const evidenceBlocks: string[] = [];

    for (const operation of writeLikeOperations.slice(0, writeLikeLimit)) {
      try {
        const file = await window.novayxk.readFile(operation.path);
        if (operation.type === "write") {
          if (file.content === operation.content) {
            confirmedWrites += 1;
          } else {
            failedChecks.push(`${operation.path}：回读内容与写入内容不一致`);
          }
        } else if (!file.content.includes(operation.replace)) {
          failedChecks.push(`${operation.path}：回读后未找到替换文本`);
        } else if (operation.occurrence === "all" && file.content.includes(operation.search)) {
          failedChecks.push(`${operation.path}：仍然存在未替换完的原文本`);
        } else {
          confirmedWrites += 1;
        }

        if (depth === "deep") {
          evidenceBlocks.push(`文件 ${operation.path}：\n${truncateForVerification(file.content.slice(0, 1400), 1400)}`);
        }
      } catch (error) {
        failedChecks.push(`${operation.path}：${error instanceof Error ? error.message : "回读失败"}`);
      }
    }

    for (const operation of mkdirOperations.slice(0, mkdirLimit)) {
      if (await doesProjectPathExist(operation.path)) {
        confirmedDirs += 1;
      } else {
        failedChecks.push(`${operation.path}：目录未出现在项目树中`);
      }
    }

    const writeLikeChecked = Math.min(writeLikeOperations.length, writeLikeLimit);
    const mkdirChecked = Math.min(mkdirOperations.length, mkdirLimit);
    const confirmedSegments = [
      writeLikeChecked ? `${confirmedWrites}/${writeLikeChecked} 个关键文件回写成功` : "",
      mkdirChecked ? `${confirmedDirs}/${mkdirChecked} 个目录已创建` : "",
    ].filter(Boolean);
    const baseNote =
      failedChecks.length > 0
        ? `已复查：${confirmedSegments.length ? `已确认 ${confirmedSegments.join("，")}` : "自动执行已返回成功"}；仍有未确认项：${failedChecks.join("；")}。`
        : `已复查：${confirmedSegments.length ? `已确认 ${confirmedSegments.join("，")}` : "自动执行已返回成功"}。`;

    if (depth !== "deep") {
      return { note: baseNote };
    }

    const deepVerification = await requestDeepVerification(
      "文件操作结果",
      baseMessages,
      [
        `本地复查：${baseNote}`,
        changedFiles.length ? `变更文件：${changedFiles.join(", ")}` : "",
        ...evidenceBlocks,
      ]
        .filter(Boolean)
        .join("\n\n"),
    ).catch(() => ({ note: "" } as VerificationSummary));

    return {
      note: deepVerification.note ? `${baseNote}\n${deepVerification.note}` : baseNote,
      tokenUsage: deepVerification.tokenUsage,
    };
  }

  function buildCommandVerificationNote(commandResults: Array<{ command: string; output: string; code: number | null }>) {
    const running = commandResults.filter((result) => result.code === null);
    const failed = commandResults.filter((result) => result.code !== null && result.code !== 0);
    const emptySucceeded = commandResults.filter((result) => result.code === 0 && !result.output.trim());

    if (running.length) {
      return `已复查：仍有 ${running.length} 个命令在终端里持续运行，当前还不能断言任务已经完成。`;
    }
    if (failed.length) {
      return `已复查：有 ${failed.length} 个命令退出码非 0，这次结果还不能算完全完成。`;
    }
    if (emptySucceeded.length) {
      return `已复查：所有命令退出码都正常，但有 ${emptySucceeded.length} 个步骤没有可见输出，只能确认命令执行了，不能完全确认目标状态。`;
    }
    return "已复查：所有自动执行命令都有可见输出且退出码正常。";
  }

  async function buildCommandVerificationSummary(
    baseMessages: ChatMessage[],
    commandResults: Array<{ command: string; output: string; code: number | null }>,
    executionContent: string,
    summaryContent: string,
  ): Promise<VerificationSummary> {
    const baseNote = buildCommandVerificationNote(commandResults);
    if (getVerificationDepth(assistantMode) !== "deep") {
      return { note: baseNote };
    }

    const deepVerification = await requestDeepVerification(
      "PowerShell 执行结果",
      baseMessages,
      `本地复查：${baseNote}\n\n模型总结：\n${summaryContent}\n\n命令真实输出：\n${executionContent}`,
    ).catch(() => ({ note: "" } as VerificationSummary));

    return {
      note: deepVerification.note ? `${baseNote}\n${deepVerification.note}` : baseNote,
      tokenUsage: deepVerification.tokenUsage,
    };
  }

  async function buildBrowserVerificationSummary(
    baseMessages: ChatMessage[],
    roundBlocks: string[],
    followUpNote: string,
  ): Promise<VerificationSummary> {
    const bridge = window.novayxk;
    if (!bridge) return { note: "" };

    const snapshot = await bridge.getBrowserSnapshot().catch(() => null);
    const locationNote = snapshot ? `${snapshot.title || "当前页面"} · ${snapshot.currentUrl}` : "当前页面信息暂时不可用";
    const baseNote = followUpNote
      ? `已复查：浏览器当前停留在 ${locationNote}。另外，自动流程在本轮停下的原因是：${followUpNote}`
      : `已复查：浏览器当前停留在 ${locationNote}。本轮自动动作没有检测到失败。`;

    if (getVerificationDepth(assistantMode) !== "deep") {
      return { note: baseNote };
    }

    const browserContext = await getBrowserPromptContext().catch(() => "");
    const deepVerification = await requestDeepVerification(
      "浏览器自动操作结果",
      baseMessages,
      [baseNote, ...roundBlocks, browserContext].filter(Boolean).join("\n\n"),
    ).catch(() => ({ note: "" } as VerificationSummary));

    return {
      note: deepVerification.note ? `${baseNote}\n${deepVerification.note}` : baseNote,
      tokenUsage: deepVerification.tokenUsage,
    };
  }

  function buildImageVerificationSummary(imageCount: number): VerificationSummary {
    if (imageCount <= 0) {
      return { note: "已复查：接口没有返回任何图片文件，所以这次结果不能算完成。" };
    }
    return { note: `已复查：本次已收到 ${imageCount} 张图片文件，并已保存在本地生成目录。` };
  }

  async function handleInternalControlModeRequest(userPrompt: string, nextMessages: ChatMessage[]) {
    const nextMode = detectInternalControlModeRequest(userPrompt);
    if (!nextMode) return false;

    setPrompt("");
    setMessages(nextMessages);
    const saved = aiControlMode === nextMode ? true : await updateAiControlMode(nextMode);
    const assistantContent =
      nextMode === "full"
        ? "已切换到 Novayxk 的系统级执行范围。这个只决定 AI 可以请求执行哪些命令，不等于当前已经拥有 Windows 管理员权限；如果后面遇到系统级命令，我还会单独请求 UAC/管理员授权。"
        : "已切换回 Novayxk 的项目内执行范围。之后我会优先执行项目目录内的开发命令，系统级动作会继续拦截或要求确认。";
    const handledMessages: ChatMessage[] = [
      ...nextMessages,
      {
        role: "assistant",
        content: assistantContent,
      },
    ];
    setMessages(handledMessages);
    setStatus(saved ? getExecutionModeStatus(nextMode) : "执行范围已切换，但保存偏好失败");
    await saveCurrentTask(handledMessages);
    return true;
  }

  async function handleAssistantModeRequest(userPrompt: string, nextMessages: ChatMessage[]) {
    const nextMode = detectAssistantModeRequest(userPrompt);
    if (!nextMode) return false;

    setPrompt("");
    setMessages(nextMessages);
    const saved = assistantMode === nextMode ? true : await updateAssistantMode(nextMode);
    const assistantContent =
      nextMode === "low"
        ? "已切换到极省模式。之后我会尽量少带上下文、少解释，只保留必要动作和结论；执行后默认只做最低成本复查。"
        : nextMode === "deep"
          ? "已切换到深度模式。之后我会保留更多上下文，更适合复杂排查、重构和多步骤任务；执行后会补完整复查链路。"
          : "已切换到标准模式。之后我会在上下文、速度和完整度之间保持平衡；执行后会补关键结果复查。";
    const handledMessages: ChatMessage[] = [
      ...nextMessages,
      {
        role: "assistant",
        content: assistantContent,
      },
    ];
    setMessages(handledMessages);
    setStatus(saved ? getAssistantModeStatus(nextMode) : "助手模式已切换，但保存偏好失败");
    await saveCurrentTask(handledMessages);
    return true;
  }

  async function handleAdminPrivilegeRequest(userPrompt: string, nextMessages: ChatMessage[]) {
    if (!detectAdminPrivilegeRequest(userPrompt)) return false;

    setPrompt("");
    setMessages(nextMessages);

    let assistantContent = "";
    if (!window.novayxk) {
      assistantContent = "没有检测到 Novayxk 桌面桥接，当前不能请求 Windows 管理员权限。请关闭当前窗口后重新打开 Novayxk，再切换管理员模式。";
      setStatus("没有检测到 Novayxk 桌面桥接，请重新打开 Novayxk 后再切换管理员模式。");
    } else if (privilege?.isAdmin) {
      assistantContent = "当前已经在管理员模式下，不需要再次切换。";
      setStatus("当前已经在管理员模式下。");
    } else if (!privilege?.canElevate) {
      assistantContent = "当前环境不能直接请求 Windows UAC 管理员权限。请确认你现在运行的是桌面应用，而不是网页预览或开发调试壳。";
      setStatus("当前环境不能直接切到管理员模式。");
    } else {
      assistantContent = "我正在请求切换到管理员模式。接下来会弹出 Windows UAC 授权窗口；确认后 Novayxk 会以管理员权限重启。";
      setStatus("正在请求 Windows 管理员权限...");
      const pendingMessages: ChatMessage[] = [
        ...nextMessages,
        {
          role: "assistant",
          content: assistantContent,
        },
      ];
      setMessages(pendingMessages);
      await saveCurrentTask(pendingMessages);
      const started = await restartAsAdmin();
      if (started) return true;
      assistantContent = "管理员模式没有成功启动。可能是当前处于开发模式，或 Windows UAC 授权被取消。";
    }

    const handledMessages: ChatMessage[] = [
      ...nextMessages,
      {
        role: "assistant",
        content: assistantContent,
      },
    ];
    setMessages(handledMessages);
    await saveCurrentTask(handledMessages);
    return true;
  }

  function detectOpenBrowserWorkspaceRequest(userPrompt: string) {
    const normalized = userPrompt.trim().replace(/\s+/g, "").toLowerCase();
    if (!normalized) return false;
    if (!/(?:内嵌浏览器|浏览器工作区|browserworkspace|browser窗口)/i.test(normalized)) return false;
    if (!/(?:打开|开启|显示|进入|调出|切到|切换到)/i.test(normalized)) return false;
    if (/(?:https?:\/\/|www\.|网址|链接|访问|导航|跳转|搜索|点击|输入|表单|操作网页|打开网站)/i.test(normalized)) return false;
    return true;
  }

  async function handleOpenBrowserWorkspaceRequest(userPrompt: string, nextMessages: ChatMessage[]) {
    if (!detectOpenBrowserWorkspaceRequest(userPrompt)) return false;

    setPrompt("");
    setMessages(nextMessages);

    const assistantContent = !window.novayxk
      ? "当前是浏览器预览环境，这里不能真正打开 Electron 的内嵌浏览器窗口。请用桌面版 Novayxk 打开。"
      : "已为你打开内嵌浏览器工作区。";

    if (window.novayxk) {
      openBrowserWorkspace();
      setStatus("已打开浏览器工作区窗口");
    } else {
      setStatus("当前环境不支持打开内嵌浏览器窗口");
    }

    const handledMessages: ChatMessage[] = [
      ...nextMessages,
      {
        role: "assistant",
        content: assistantContent,
      },
    ];
    setMessages(handledMessages);
    await saveCurrentTask(handledMessages);
    return true;
  }

  function buildPendingResumeMessages(baseMessages: ChatMessage[]) {
    return sanitizeChatHistory(baseMessages)
      .slice(-20)
      .map((message) => ({
        ...message,
        content: String(message.content ?? "").slice(0, 12_000),
      }));
  }

  async function prepareAiAdminResume(command: string, baseMessages: ChatMessage[]) {
    const task = await saveCurrentTask(baseMessages);
    await prepareAdminCommandResume({
      command,
      source: "ai",
      controlMode: aiControlMode,
      taskId: task?.id ?? activeTaskId ?? null,
      messages: buildPendingResumeMessages(baseMessages),
    });
  }

  async function buildProjectContextForPrompt(userPrompt: string) {
    if (!project || !window.novayxk) return "";

    try {
      const context = await window.novayxk.getProjectContext({
        selectedPath: selectedFile?.path ?? null,
        prompt: userPrompt,
      });
      return formatProjectContext(context, assistantMode);
    } catch (error) {
      setStatus(formatActionableError(error, "读取项目上下文失败"));
      return "";
    }
  }

  async function buildBrowserContextForPrompt(userPrompt: string) {
    const bridge = window.novayxk;
    if (!bridge) return "";

    const normalized = userPrompt.trim().toLowerCase();
    const likelyBrowserTask =
      /(?:浏览器|网页|页面|网站|web|url|链接|按钮|表单|输入框|点击|点开|跳转|打开这个站|操作|轨迹|记录|接口|api|请求|怎么进来|咋进来|看到了吗|browser)/i.test(normalized);
    if (!likelyBrowserTask) return "";

    try {
      return await getBrowserPromptContext();
    } catch (error) {
      setStatus(formatActionableError(error, "读取浏览器上下文失败"));
      return "";
    }
  }

  function findLatestGeneratedImageAttachment(messageList: ChatMessage[]) {
    for (let index = messageList.length - 1; index >= 0; index -= 1) {
      const images = messageList[index]?.attachments?.filter((attachment) => attachment.type === "image") ?? [];
      if (images.length) {
        return images[images.length - 1];
      }
    }
    return null;
  }

  function isSaveGeneratedImageRequest(promptText: string) {
    const normalized = promptText.trim().toLowerCase();
    if (!normalized) return false;
    const mentionsImage = /(?:图片|照片|图像|内嵌图|刚才那张图|刚才生成|生成的图|生成的图片|这张图|这张图片)/i.test(normalized);
    const mentionsSave = /(?:保存|另存|存到|放到|放进|落盘|导出|复制到)/i.test(normalized);
    const mentionsProjectFolder = /(?:当前(?:打开的)?文件夹|当前目录|项目目录|这个目录|这个文件夹|下面|本地)/i.test(normalized);
    return mentionsImage && (mentionsSave || mentionsProjectFolder);
  }

  function extractGeneratedImageTargetPath(promptText: string) {
    const quotedMatch = promptText.match(/[“"'`]\s*([^"'`]+?\.(?:png|jpe?g|webp|gif))\s*[”"'`]/i);
    if (quotedMatch?.[1]) return quotedMatch[1].trim();
    const namedMatch = promptText.match(/(?:保存为|另存为|命名为|文件名(?:叫)?|叫做|叫)\s*([^\s，。！？"'`]+?\.(?:png|jpe?g|webp|gif))/i);
    if (namedMatch?.[1]) return namedMatch[1].trim();
    const pathMatch = promptText.match(/\b([A-Za-z0-9_\-./\\]+?\.(?:png|jpe?g|webp|gif))\b/i);
    if (pathMatch?.[1]) return pathMatch[1].trim();
    return "";
  }

  async function handleGeneratedImageSaveRequest(userPrompt: string, nextMessages: ChatMessage[]) {
    if (!isSaveGeneratedImageRequest(userPrompt)) return false;

    setPrompt("");
    setMessages(nextMessages);

    if (!project) {
      const blockedMessages: ChatMessage[] = [
        ...nextMessages,
        {
          role: "assistant",
          content: "还没有打开项目，所以现在没有地方可保存这张图片。",
        },
      ];
      setMessages(blockedMessages);
      setStatus("请先打开一个项目。");
      await saveCurrentTask(blockedMessages);
      return true;
    }

    if (!window.novayxk) {
      const blockedMessages: ChatMessage[] = [
        ...nextMessages,
        {
          role: "assistant",
          content: "当前在浏览器预览模式，保存对话图片到项目目录需要用 Electron 启动。",
        },
      ];
      setMessages(blockedMessages);
      setStatus("当前环境不支持保存对话图片到项目目录。");
      await saveCurrentTask(blockedMessages);
      return true;
    }

    const latestImage = findLatestGeneratedImageAttachment(messages);
    if (!latestImage) {
      const blockedMessages: ChatMessage[] = [
        ...nextMessages,
        {
          role: "assistant",
          content: "最近对话里没有可保存的图片。",
        },
      ];
      setMessages(blockedMessages);
      setStatus("没有找到可保存的对话图片。");
      await saveCurrentTask(blockedMessages);
      return true;
    }

    const targetPath = extractGeneratedImageTargetPath(userPrompt);
    setStatus(targetPath ? `正在保存图片到 ${targetPath}...` : "正在保存图片到当前项目目录...");
    try {
      const result = await window.novayxk.saveGeneratedImageToProject({
        imagePath: latestImage.path,
        ...(targetPath ? { targetPath } : {}),
      });
      const completedMessages: ChatMessage[] = [
        ...nextMessages,
        {
          role: "assistant",
          content: `已将刚才生成的图片保存到当前项目目录：${result.relativePath}`,
        },
      ];
      await syncProjectView({ preferredPath: result.relativePath });
      setMessages(completedMessages);
      setStatus(`图片已保存：${result.relativePath}`);
      await saveCurrentTask(completedMessages);
    } catch (error) {
      const content = formatActionableError(error, "保存对话图片失败");
      const failedMessages: ChatMessage[] = [
        ...nextMessages,
        {
          role: "assistant",
          content,
        },
      ];
      setMessages(failedMessages);
      setStatus(content);
      await saveCurrentTask(failedMessages);
    }
    return true;
  }

  async function executeAiFileOperations(assistantContent: string, baseMessages: ChatMessage[]) {
    const operations = extractFileOps(assistantContent);
    if (!operations.length) {
      const parseIssue = getFileOpsParseIssue(assistantContent);
      if (!parseIssue) return null;
      const nextMessages: ChatMessage[] = [
        ...baseMessages,
        {
          role: "assistant",
          content: `检测到 fileops 文件操作代码块不完整或 JSON 解析失败，可能是模型一次性生成的内容太长被截断了。\n\n原因：${parseIssue}\n\n建议把大型前端页面拆成多个文件分批生成，例如 package.json、src/main.js、src/App.vue、src/styles.css，而不是把完整系统塞进一个超大的 HTML 字符串。`,
        },
      ];
      setMessages(nextMessages);
      setStatus("fileops 不完整，可能被模型输出长度截断");
      return nextMessages;
    }

    const sensitiveMutation = operations
      .filter(
        (
          operation,
        ): operation is Extract<FileOperation, { type: "write" }> | Extract<FileOperation, { type: "replace" }> =>
          operation.type === "write" || operation.type === "replace",
      )
      .map((operation) => ({
        operation,
        inspection: /\.(?:py|js|ts|mjs|cjs|ps1|bat|cmd|env|json|yaml|yml|toml|ini)$/i.test(operation.path)
          ? inspectSensitiveGeneratedContent(
              operation.type === "write" ? operation.content : `${operation.search}\n${operation.replace}`,
            )
          : { blocked: false, reason: "" },
      }))
      .find(({ inspection }) => inspection.blocked);
    if (sensitiveMutation) {
      const warning =
        `检测到文件修改包含敏感内容，Novayxk 已暂停自动执行，但保留了这次 fileops。你确认这是自己要写入的内容后，可以点底部工具栏的“执行文件操作”手动执行。\n\n` +
        `原因：${sensitiveMutation.inspection.reason}\n\n` +
        `提示：如果不想每次确认，可以让 AI 改成环境变量、命令行参数、交互输入或占位符。`;
      const lastMessage = baseMessages[baseMessages.length - 1];
      const blockedMessages: ChatMessage[] = [
        ...baseMessages.slice(0, -1),
        lastMessage?.role === "assistant"
          ? { ...lastMessage, content: `${lastMessage.content.trim()}\n\n${warning}` }
          : { role: "assistant", content: warning },
      ];
      setMessages(blockedMessages);
      setStatus("敏感文件操作已暂停，等待你手动确认");
      return blockedMessages;
    }

    if (hasDestructiveFileOps(operations)) {
      const warning =
        "检测到 delete 文件操作。为了避免 AI 自动误删项目内容，这类 fileops 不会自动执行；请先检查路径，再点底部工具栏的“执行文件操作”按钮手动确认。";
      const lastMessage = baseMessages[baseMessages.length - 1];
      const nextMessages: ChatMessage[] =
        lastMessage?.role === "assistant"
          ? [
              ...baseMessages.slice(0, -1),
              {
                ...lastMessage,
                content: `${lastMessage.content.trim()}\n\n${warning}`,
              },
            ]
          : [...baseMessages, { role: "assistant", content: warning }];
      setMessages(nextMessages);
      setStatus("检测到删除类 fileops，已改为等待人工确认");
      return nextMessages;
    }

    if (!project) {
      const blockedMessages: ChatMessage[] = [
        ...baseMessages,
        {
          role: "assistant",
          content:
            "检测到文件操作，但当前还没有打开项目，所以这次没有执行。若目标文件在当前项目内，请先打开对应项目；若目标是桌面、下载或其他项目外路径，请让我改用 powershell-run 处理。",
        },
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
      const firstWrittenFile =
        operations.find((operation) => operation.type === "write" || operation.type === "replace")?.path ?? null;
      const selectedWasChanged = selectedFile ? result.changedFiles.includes(selectedFile.path) : false;
      await syncProjectView({
        preferredPath: selectedWasChanged ? selectedFile?.path ?? null : firstWrittenFile,
      });
      const verification = await buildFileOpsVerificationSummary(operations, result.changedFiles, baseMessages);

      const nextMessages: ChatMessage[] = [
        ...baseMessages,
        {
          role: "assistant",
          content: appendVerificationNote(
            `文件操作已自动执行：\n\n${result.changedFiles.map((file) => `- ${file}`).join("\n")}`,
            verification.note,
          ),
          ...(verification.tokenUsage ? { tokenUsage: verification.tokenUsage } : {}),
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
      setStatus(formatActionableError(error, "自动执行文件操作失败"));
      return null;
    }
  }

  async function executeAiPowerShellCommands(
    assistantContent: string,
    baseMessages: ChatMessage[],
    commandLoopState: CommandLoopState = createCommandLoopState(),
  ) {
    const commands = extractPowerShellCommandRequests(assistantContent);
    if (!commands.length) return null;
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
    const commandResults: Array<{ command: string; output: string; code: number | null }> = [];
    for (const commandRequest of commands.slice(0, 5)) {
      const commandText = commandRequest.command.trim();
      if (!commandText) continue;
      setStatus(`AI 正在以${getExecutionModeLabel(aiControlMode)}执行 PowerShell...`);

      try {
        if (isWriteLikePowerShellCommand(commandText)) {
          const sensitiveInspection = inspectSensitiveGeneratedContent(commandText);
          if (sensitiveInspection.blocked) {
            throw new Error(`已拦截：自动 PowerShell 写入存在敏感风险。原因：${sensitiveInspection.reason}。请改用环境变量/占位符，或由用户手动确认敏感内容。`);
          }
        }
        if (!window.novayxk) {
          throw new Error("当前在浏览器预览模式，执行命令需要用 Electron 启动。");
        }
        const inspection = await window.novayxk.inspectCommand(commandText);
        const needsAdminRestart = inspection.requiresAdmin && !privilege?.isAdmin && privilege?.canElevate;
        if (needsAdminRestart) {
          await prepareAiAdminResume(commandText, baseMessages);
        }
        const adminState = await requestAdminForCommandIfNeeded(commandText, inspection, "ai");
        if (adminState !== "ready") {
          if (adminState === "cancelled" && needsAdminRestart) {
            await clearPendingAdminResume();
          }
          const adminMessage = adminState === "restarting"
            ? `需要 Windows 管理员权限：${inspection.adminReason ?? "该命令可能需要 Windows 管理员权限"}。Novayxk 已请求用户授权以 Windows 管理员权限重启，命令尚未执行。`
            : `需要 Windows 管理员权限：${inspection.adminReason ?? "该命令可能需要 Windows 管理员权限"}。这次管理员模式切换没有完成，命令尚未执行。`;
          resultLines.push(`$ ${commandText}\n${adminMessage}`);
          continue;
        }
        if (needsAdminRestart) {
          await clearPendingAdminResume();
        }
        const confirmedSystemAction = inspection.requiresConfirmation
          ? await confirmSystemAction(commandText, inspection.systemAction?.label ?? "系统动作", "ai")
          : false;
        if (inspection.requiresConfirmation && !confirmedSystemAction) {
          resultLines.push(`$ ${commandText}\n特殊系统动作已取消：${inspection.systemAction?.label ?? "系统动作"}`);
          commandResults.push({ command: commandText, output: "", code: null });
          continue;
        }
        const result = await window.novayxk.runCommandWithMode({
          command: commandText,
          controlMode: aiControlMode,
          confirmedSystemAction,
        });
        if (result.terminalTask) {
          upsertTerminalTask(result.terminalTask);
          setActiveTerminalTaskId(result.terminalTask.id);
          showBottomPanel();
        }
        const sourceNote = commandRequest.source === "inline" ? "来源：普通文本中识别出的疑似命令" : "来源：powershell-run 代码块";
        const taskNote = result.terminalTask ? `终端任务：${result.terminalTask.id}` : "";
        const output = `${sourceNote}\n${taskNote ? `${taskNote}\n` : ""}$ ${commandText}\n${result.output}\n${result.longRunning ? "状态：仍在终端任务中运行" : `退出码：${result.code}`}`;
        resultLines.push(output);
        commandResults.push({
          command: commandText,
          output: result.output,
          code: result.longRunning ? null : result.code,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "AI PowerShell 执行失败";
        const sourceNote = commandRequest.source === "inline" ? "来源：普通文本中识别出的疑似命令" : "来源：powershell-run 代码块";
        resultLines.push(`${sourceNote}\n$ ${commandText}\n${message}`);
        commandResults.push({ command: commandText, output: message, code: 1 });
      }
      if (stopRequestedRef.current) break;
    }

    try {
      await syncProjectView();
    } catch {
      // Ignore workspace refresh failures so command summaries still reach the user.
    }

    if (stopRequestedRef.current) {
      const stoppedContent = resultLines.length
        ? `已停止本次生成，正在运行的终端任务已请求停止。\n\nPowerShell 执行结果：\n\n\`\`\`text\n${resultLines.join("\n\n").slice(0, 18000)}\n\`\`\``
        : "已停止本次生成，正在运行的终端任务已请求停止。";
      const stoppedMessages: ChatMessage[] = [
        ...baseMessages,
        {
          role: "assistant",
          content: stoppedContent,
        },
      ];
      setMessages(stoppedMessages);
      setStatus("已停止本次生成");
      return stoppedMessages;
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

    const bridge = window.novayxk;
    if (!bridge) {
      return nextMessages;
    }

    try {
      let summaryContent = "";
      const summaryStartedAt = Date.now();
      setLoadingStartedAt(summaryStartedAt);
      setLoadingElapsedMs(0);
      const resultJudgementNote = buildCommandResultJudgementNote(commandResults);
      const summaryMessages: ChatMessage[] = [
        {
          role: "system",
          content: `${buildSystemPrompt(memoryState?.memory ?? "", activeTaskSummary, runtimePermissionContext, assistantMode)}

【命令结果整理规则】
Novayxk 已经自动执行了你刚才通过 powershell-run 请求的命令。你现在必须基于命令输出直接回答用户原始问题。
- 不要再要求用户执行命令、复制输出或“把结果发我”。
- 先给明确结论，再给必要的简短解释。
- 如果命令失败，说明失败原因和下一步建议。
- 如果命令输出为空、被截断、没有展示出来，或退出码不是 0，严禁说“跑通了”“成功了”“这次是真的”；只能说当前没有足够证据证明成功。
- 如果为了完成用户原始任务必须继续执行下一步命令，可以继续输出完整的 powershell-run 代码块；不要把要执行的命令写成普通文字，也不要声称尚未执行的命令已经开始。
- 如果你发现自己准备重复上一轮或前几轮已经执行过的命令，不要继续输出命令；请总结为什么卡住、已经尝试了什么、建议用户下一步怎么确认。
- 如果只是给建议或可选操作，不要再输出 powershell-run、fileops 或 diff 代码块。
${resultJudgementNote ? `\n\n【结果判定护栏】\n${resultJudgementNote}` : ""}`,
        },
        ...sanitizeChatHistory(baseMessages).slice(-getAssistantModeProfile(assistantMode).commandSummaryHistoryLimit),
        {
          role: "user",
          content: `Novayxk 已经自动执行了 PowerShell 命令。请直接回答我最开始的问题，不要只复述原始输出。\n\n${executionContent}`,
        },
      ];

      await runModelRequestWithRetries("模型总结请求", async () => {
        summaryContent = "";
        setMessages([...nextMessages, { role: "assistant", content: "" }]);
        await bridge.chatStream(
          {
            provider: activeProvider,
            messages: summaryMessages,
          },
          {
            onChunk: (chunk) => {
              summaryContent += chunk;
              setMessages([...nextMessages, { role: "assistant", content: normalizeAssistantToolCallContent(summaryContent) }]);
            },
          },
        );
      });

      const finalSummaryContent = stripPrematurePowerShellResultText(normalizeAssistantToolCallContent(summaryContent)).trim();
      const summaryUsage = buildEstimatedTokenUsage(summaryMessages, finalSummaryContent || "命令已经执行完成，但模型没有返回总结。");
      let finalMessages: ChatMessage[] = [
        ...nextMessages,
        {
          role: "assistant",
          content: finalSummaryContent || "命令已经执行完成，但模型没有返回总结。",
          elapsedMs: Date.now() - summaryStartedAt,
          tokenUsage: summaryUsage,
        },
      ];
      setMessages(finalMessages);
      const followUpCommands = extractPowerShellCommandRequests(finalSummaryContent);
      if (followUpCommands.length && commandLoopState.rounds < COMMAND_LOOP_SAFETY_LIMIT) {
        setStatus("检测到后续 PowerShell 步骤，继续执行...");
        return executeAiPowerShellCommands(finalSummaryContent, finalMessages, commandLoopState);
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
      const verification = await buildCommandVerificationSummary(
        baseMessages,
        commandResults,
        executionContent,
        finalSummaryContent || "命令已经执行完成，但模型没有返回总结。",
      );
      if (verification.note) {
        const lastMessage = finalMessages[finalMessages.length - 1];
        finalMessages = [
          ...finalMessages.slice(0, -1),
          {
            ...lastMessage,
            content: appendVerificationNote(lastMessage.content, verification.note),
            tokenUsage: mergeTokenUsage(lastMessage.tokenUsage, verification.tokenUsage),
          },
        ];
        setMessages(finalMessages);
      }
      setStatus(commandLoopState.rounds > 1 ? "AI PowerShell 连续步骤执行完成" : "AI PowerShell 执行完成，并已生成结论");
      return finalMessages;
    } catch (error) {
      const message = error instanceof Error ? error.message : "命令结果总结失败";
      if (message === STREAM_ABORT_MESSAGE) {
        setStatus("已停止本次生成");
        return nextMessages;
      }
      setStatus(formatActionableError(error, "整理命令结果失败"));
      return nextMessages;
    }
  }

  function formatBrowserActionLabel(action: BrowserAutomationAction) {
    if (action.type === "navigate") return `${action.type} ${action.url}`;
    if (action.type === "runScript") return "runScript";
    if ("selector" in action && action.selector) return `${action.type} ${action.selector}`;
    if (action.type === "pressKey") return `pressKey ${action.key}`;
    return action.type;
  }

  function formatBrowserRoundSummary(actions: BrowserAutomationAction[], results: BrowserAutomationResult[]) {
    return results
      .map((result, index) => {
        const action = actions[index];
        return `- ${result.ok ? "成功" : "失败"} · ${formatBrowserActionLabel(action)} · ${result.preview}`;
      })
      .join("\n");
  }

  function getBrowserActionLoopKey(action: BrowserAutomationAction) {
    if (action.type === "navigate") return `navigate:${action.url}`;
    if (action.type === "runScript") return `runScript:${action.script.slice(0, 120)}`;
    if (action.type === "pressKey") return `pressKey:${action.key}:${action.selector ?? ""}`;
    if (action.type === "scrollTo") return `scrollTo:${action.selector ?? ""}:${action.x ?? ""}:${action.y ?? ""}`;
    if (action.type === "select") return `select:${action.selector}:${action.value}`;
    if (action.type === "extractText") return `extractText:${action.selector}:${action.multiple === true ? "multi" : "single"}`;
    if (action.type === "type") return `type:${action.selector}:${action.text.slice(0, 120)}`;
    if (action.type === "waitFor") return `waitFor:${action.selector}:${action.timeoutMs}`;
    return `${action.type}:${"selector" in action ? action.selector : ""}`;
  }

  function getSensitiveBrowserActionReason(action: BrowserAutomationAction) {
    const selector = "selector" in action ? String(action.selector ?? "") : "";
    const text = action.type === "type" ? action.text : "";
    const script = action.type === "runScript" ? action.script : "";
    const target = `${selector} ${text} ${script}`.toLowerCase();
    if (SENSITIVE_AUTOMATION_PATTERN.test(target)) {
      return "下一步涉及登录凭据、Token、Cookie、鉴权头或抓取登录接口细节，需要你手动处理；Novayxk 不会自动执行这类浏览器动作。";
    }
    if (/(password|passwd|pwd|current-password|new-password|one-time-code|otp|totp|mfa|2fa|verification|captcha|验证码|校验码|动态码|密码|二次验证|两步验证)/i.test(target)) {
      return "下一步涉及密码、验证码或二次验证，需要你在内嵌浏览器里手动完成。";
    }
    return "";
  }

  function splitBrowserActionsAtSensitiveStep(actions: BrowserAutomationAction[]) {
    const safeActions: BrowserAutomationAction[] = [];
    for (const action of actions) {
      const blockedReason = getSensitiveBrowserActionReason(action);
      if (blockedReason) {
        return { safeActions, blockedReason };
      }
      safeActions.push(action);
    }
    return { safeActions, blockedReason: "" };
  }

  function shouldOpenBrowserWorkspaceForActions(actions: BrowserAutomationAction[]) {
    return actions.some((action) => {
      if (action.type === "extractText") return false;
      if (action.type === "runScript") {
        return !/^(?:document\.location\.href|location\.href|document\.title|document\.body\.innerText|document\.body\.textContent)$/i.test(action.script.trim());
      }
      return true;
    });
  }

  async function requestNextBrowserAutomationStep(
    baseMessages: ChatMessage[],
    roundSummary: string,
    roundIndex: number,
  ) {
    const bridge = window.novayxk;
    if (!bridge) return "";

    let browserContext = "";
    try {
      browserContext = await getBrowserPromptContext();
    } catch (error) {
      setStatus(formatActionableError(error, "读取浏览器上下文失败"));
      return "";
    }

    const continuationMessages: ChatMessage[] = [
      {
        role: "system",
        content: `${buildSystemPrompt(memoryState?.memory ?? "", activeTaskSummary, runtimePermissionContext, assistantMode)}

【浏览器续步规则】
Novayxk 刚刚已经自动执行了一轮 browser-actions。你现在必须基于最新页面状态判断是否还需要继续下一步。
- 如果还需要继续点击、输入、等待、滚动或提取页面信息，请返回一个完整的 \`\`\`browser-actions JSON\`\`\` 代码块。
- 如果当前阶段已经完成，或者下一步需要用户手动处理（例如密码、验证码、二次验证、支付、外部授权确认），就直接用一句简短中文说明，不要输出 browser-actions。
- 优先识别页面里最明显的主按钮，例如“继续”“下一步”“登录”“确认”“提交”。
- 不要重复输出和前一轮完全相同的点击/输入动作，除非只是短暂等待页面变化。
- 一次最多给 1 到 3 个紧密相连的动作。`,
      },
      ...sanitizeChatHistory(baseMessages).slice(-getAssistantModeProfile(assistantMode).continuationHistoryLimit),
      {
        role: "user",
        content: `Novayxk 已经完成第 ${roundIndex} 轮浏览器动作。

执行结果：
${roundSummary}
${browserContext}

请判断现在是否需要继续下一步。`,
      },
    ];

    const reply = await runModelRequestWithRetries("模型续步请求", () =>
      bridge.chat({
        provider: activeProvider,
        messages: continuationMessages,
      }),
    );
    return normalizeAssistantToolCallContent(String(reply || "")).trim();
  }

  async function executeAiBrowserActions(assistantContent: string, baseMessages: ChatMessage[]) {
    const actions = extractBrowserActions(assistantContent);
    if (!actions.length) {
      const parseIssue = getBrowserActionsParseIssue(assistantContent);
      if (!parseIssue) return null;
      const nextMessages: ChatMessage[] = [
        ...baseMessages,
        {
          role: "assistant",
          content: `检测到 browser-actions 代码块不完整或 JSON 解析失败。\n\n原因：${parseIssue}\n\n请把浏览器动作拆成严格 JSON 数组，例如先 navigate，再 click/type/waitFor，不要在代码块里混入注释或解释文字。`,
        },
      ];
      setMessages(nextMessages);
      setStatus("browser-actions 不完整，可能被模型输出长度截断");
      return nextMessages;
    }

    if (!window.novayxk) {
      const blockedMessages: ChatMessage[] = [
        ...baseMessages,
        { role: "assistant", content: "检测到浏览器动作，但当前不在 Electron 桌面环境，所以没有执行。" },
      ];
      setMessages(blockedMessages);
      return blockedMessages;
    }

    await waitForUiCommit();
    if (shouldOpenBrowserWorkspaceForActions(actions)) {
      openBrowserWorkspace();
    }
    setStatus("AI 正在执行浏览器动作...");

    try {
      const actionVisitCounts = new Map<string, number>();
      const roundBlocks: string[] = [];
      let followUpNote = "";
      let pendingActions = actions;
      let roundIndex = 0;

      while (pendingActions.length && roundIndex < BROWSER_AUTOMATION_LOOP_LIMIT) {
        const { safeActions, blockedReason } = splitBrowserActionsAtSensitiveStep(pendingActions);
        if (!safeActions.length && blockedReason) {
          followUpNote = blockedReason;
          break;
        }

        roundIndex += 1;
        const results = await executeBrowserAutomation(safeActions);
        const roundSummary = formatBrowserRoundSummary(safeActions, results);
        roundBlocks.push(`第 ${roundIndex} 轮：\n${roundSummary}`);

        for (const action of safeActions) {
          const key = getBrowserActionLoopKey(action);
          actionVisitCounts.set(key, (actionVisitCounts.get(key) ?? 0) + 1);
        }

        if (results.some((result) => !result.ok)) {
          followUpNote = "自动续步已停止，因为上一轮存在失败动作。";
          break;
        }

        if (blockedReason) {
          followUpNote = blockedReason;
          break;
        }

        const continuationReply = await requestNextBrowserAutomationStep(baseMessages, roundSummary, roundIndex);
        if (!continuationReply) {
          followUpNote = "已完成当前可自动推进的浏览器步骤。";
          break;
        }

        const nextActions = extractBrowserActions(continuationReply);
        if (!nextActions.length) {
          followUpNote = continuationReply;
          break;
        }

        const allRepeated = nextActions.every((action) => {
          if (action.type === "waitFor") return false;
          const key = getBrowserActionLoopKey(action);
          return (actionVisitCounts.get(key) ?? 0) >= BROWSER_AUTOMATION_REPEAT_LIMIT;
        });
        if (allRepeated) {
          followUpNote = "自动续步已停止，因为模型反复给出了相同的浏览器动作。";
          break;
        }

        pendingActions = nextActions;
        setStatus(`检测到浏览器后续步骤，继续执行第 ${roundIndex + 1} 轮...`);
      }

      if (!followUpNote && pendingActions.length && roundIndex >= BROWSER_AUTOMATION_LOOP_LIMIT) {
        followUpNote = "已达到浏览器自动续步上限，避免在当前页面重复循环。";
      }
      const verification = await buildBrowserVerificationSummary(baseMessages, roundBlocks, followUpNote);

      const nextMessages: ChatMessage[] = [
        ...baseMessages,
        {
          role: "assistant",
          content: appendVerificationNote(
            `浏览器动作已自动执行：\n\n${roundBlocks.join("\n\n")}${followUpNote ? `\n\n${followUpNote}` : ""}`,
            verification.note,
          ),
          ...(verification.tokenUsage ? { tokenUsage: verification.tokenUsage } : {}),
        },
      ];
      setMessages(nextMessages);
      setStatus(followUpNote || "浏览器动作执行完成");
      return nextMessages;
    } catch (error) {
      const message = error instanceof Error ? error.message : "浏览器动作执行失败";
      const nextMessages: ChatMessage[] = [
        ...baseMessages,
        {
          role: "assistant",
          content: `浏览器动作自动执行失败：${message}`,
        },
      ];
      setMessages(nextMessages);
      setStatus(formatActionableError(error, "浏览器动作执行失败"));
      return nextMessages;
    }
  }

  async function recoverIncompleteAssistantReply(
    nextMessages: ChatMessage[],
    requestMessages: ChatMessage[],
    userIntent: UserIntentProfile,
    partialContent: string,
  ) {
    const bridge = window.novayxk;
    if (!bridge) return partialContent;

    setStatus("模型上一条回复没说完，正在补全...");
    let recoveredContent = "";

    await runModelRequestWithRetries("模型补全请求", async () => {
      recoveredContent = "";
      await bridge.chatStream(
        {
          provider: activeProvider,
          messages: [
            ...requestMessages,
            {
              role: "assistant",
              content: partialContent,
            },
            {
              role: "user",
              content:
                `你上一条回复停在了半句，没有给出完整答复。请输出一条“完整替换版”回复，不要续写残句。\n\n` +
                `要求：\n` +
                `1. 如果这轮需要代为检查或执行，就直接给完整的 powershell-run / fileops / 补丁内容。\n` +
                `2. 如果不需要执行，就直接给完整结论。\n` +
                `3. 如果这轮是在分析浏览器轨迹、页面操作、API 请求或项目结构，就直接给完整时间线、关键接口、关键文件和你看不到的缺口。\n` +
                `4. 不要只写“我来查一下：”“如下：”“先帮你看一下：”“让我把轨迹读出来”这类引子。\n` +
                `5. 如果是检查类任务，单次查询空输出只能说“这次未查到”，不要直接断言“不存在”或“没安装”。\n` +
                `6. 如果这轮任务适合先列计划，计划必须是极简的 2 到 4 步，而且在同一条回复里继续给阶段结果、结论或下一步动作，不能只停在计划。\n` +
                `7. 这轮任务类型是：${userIntent.kind === "inspect" ? "状态核实" : userIntent.kind === "execute" ? "代为操作" : "解释问答"}。`,
            },
          ],
        },
        {
          onChunk: (chunk) => {
            recoveredContent += chunk;
            setMessages([...nextMessages, { role: "assistant", content: normalizeAssistantToolCallContent(recoveredContent) }]);
          },
        },
      );
    });

    const normalizedRecoveredContent = stripPrematurePowerShellResultText(normalizeAssistantToolCallContent(recoveredContent)).trim();
    if (!normalizedRecoveredContent) {
      return partialContent;
    }

    if (isLikelyIncompleteAssistantReply(normalizedRecoveredContent, userIntent)) {
      return `${normalizedRecoveredContent}\n\n模型这次回复仍然不完整。请重试，或换一种更明确的说法让我继续。`;
    }

    return normalizedRecoveredContent;
  }

  async function recoverInvalidAutomationReply(
    nextMessages: ChatMessage[],
    requestMessages: ChatMessage[],
    issue: string,
    partialContent: string,
  ) {
    const bridge = window.novayxk;
    if (!bridge) return partialContent;

    setStatus("检测到自动执行格式不对，正在纠正...");
    let recoveredContent = "";

    await runModelRequestWithRetries("自动执行格式修正请求", async () => {
      recoveredContent = "";
      await bridge.chatStream(
        {
          provider: activeProvider,
          messages: [
            ...requestMessages,
            {
              role: "assistant",
              content: partialContent,
            },
            {
              role: "user",
              content:
                `你上一条回复里的自动执行内容不能被 Novayxk 正确执行。请输出一条完整替换版回复，不要续写残句。\n\n` +
                `当前问题：${issue}\n\n` +
                `必须遵守：\n` +
                `1. 如果是项目内文件修改，只能输出合法的 \`\`\`fileops\`\`\` JSON 数组，字段只能是 type/path/content/overwrite/search/replace/occurrence。\n` +
                `2. fileops 的 path 必须是当前项目内相对路径，不能写桌面、下载、文档等绝对路径。\n` +
                `3. 如果目标是桌面、下载、系统目录、浏览器打开、外部网页、系统文件或任意项目外路径，必须改用 \`\`\`powershell-run\`\`\`。\n` +
                `4. 不要再输出 { operation/create/path/content } 这种旧格式 JSON。\n` +
                `5. 如果需要长内容，优先分步骤，不要只给引子。\n` +
                `6. 只输出最终可执行的完整替换版回复。`,
            },
          ],
        },
        {
          onChunk: (chunk) => {
            recoveredContent += chunk;
            setMessages([...nextMessages, { role: "assistant", content: normalizeAssistantToolCallContent(recoveredContent) }]);
          },
        },
      );
    });

    return stripPrematurePowerShellResultText(normalizeAssistantToolCallContent(recoveredContent)).trim() || partialContent;
  }

  async function sendMessage(promptOverride?: string) {
    const sourcePrompt = typeof promptOverride === "string" ? promptOverride : prompt;
    const trimmed = sourcePrompt.trim();
    if (!trimmed || isLoading) return;
    stopRequestedRef.current = false;

    const isEditingRequest =
      editingMessageIndex !== null &&
      editingMessageIndex >= 0 &&
      editingMessageIndex < messages.length &&
      messages[editingMessageIndex]?.role === "user";
    const baseMessages = isEditingRequest ? messages.slice(0, editingMessageIndex) : messages;
    const nextMessages: ChatMessage[] = [
      ...baseMessages,
      {
        role: "user",
        content: trimmed,
      },
    ];
    if (editingMessageIndex !== null) {
      setEditingMessageIndex(null);
    }
    if (await handleAdminPrivilegeRequest(trimmed, nextMessages)) return;
    if (await handleInternalControlModeRequest(trimmed, nextMessages)) return;
    if (await handleAssistantModeRequest(trimmed, nextMessages)) return;
    if (await handleOpenBrowserWorkspaceRequest(trimmed, nextMessages)) return;
    if (await handleGeneratedImageSaveRequest(trimmed, nextMessages)) return;

    setPrompt("");
    setMessages(nextMessages);
    setIsLoading(true);
    const responseStartedAt = Date.now();
    setLoadingStartedAt(responseStartedAt);
    setLoadingElapsedMs(0);
    setStatus("正在准备请求...");
    await waitForUiCommit();

    if (isImageGenerationMode(activeProvider.apiMode) || isLikelyImageModel(activeProvider.model)) {
      try {
        if (!window.novayxk) {
          throw new Error("当前在浏览器预览模式，图片生成需要用 Electron 启动。");
        }
        const bridge = window.novayxk;

        setStatus("正在生成图片...");
        const result = await runModelRequestWithRetries("图片生成请求", () =>
          bridge.generateImage({
            provider: activeProvider,
            prompt: trimmed,
            size: "1024x1024",
            n: 1,
          }),
        );
        const revisedPrompts = result.images
          .map((image, index) => image.revisedPrompt ? `图片 ${index + 1} 修订提示词：${image.revisedPrompt}` : "")
          .filter(Boolean);
        const verification = buildImageVerificationSummary(result.images.length);
        const completedContent = appendVerificationNote([
          result.message || `图片生成完成：${result.images.length} 张`,
          ...revisedPrompts,
        ].join("\n\n"), verification.note);
        const completedMessages: ChatMessage[] = [
          ...nextMessages,
          {
            role: "assistant",
            content: completedContent,
            attachments: result.images,
            elapsedMs: Date.now() - responseStartedAt,
          },
        ];
        setMessages(completedMessages);
        await saveCurrentTask(completedMessages);
        setStatus(result.message || "图片生成完成");
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : "图片生成失败";
        if (rawMessage === STREAM_ABORT_MESSAGE) {
          const stoppedMessages: ChatMessage[] = [
            ...nextMessages,
            {
              role: "assistant",
              content: "已停止本次生成。",
              elapsedMs: Date.now() - responseStartedAt,
            },
          ];
          setMessages(stoppedMessages);
          setStatus("已停止本次生成");
          await saveCurrentTask(stoppedMessages);
        } else {
          const content = formatActionableError(error, "图片生成失败");
          setMessages([
            ...nextMessages,
            {
              role: "assistant",
              content,
              elapsedMs: Date.now() - responseStartedAt,
            },
          ]);
          setStatus(content);
        }
      } finally {
        setIsLoading(false);
        setIsStopping(false);
        setLoadingStartedAt(null);
        stopRequestedRef.current = false;
      }
      return;
    }

    const contextMode = getProjectContextMode(trimmed);
    const userIntent = getUserIntentProfile(trimmed);
    const assistantModeProfile = getAssistantModeProfile(assistantMode);
    const projectContext = contextMode === "full" ? await buildProjectContextForPrompt(trimmed) : "";
    const browserContext = await buildBrowserContextForPrompt(trimmed);
    const selectedFileContext = contextMode === "full" && selectedFile?.kind === "text"
      ? `\n\n当前选中文件：${selectedFile.path}\n\`\`\`\n${selectedFile.content.slice(0, assistantModeProfile.selectedFileLimit)}\n\`\`\``
      : "";
    const runtimeContext = contextMode === "runtime" && project
      ? `\n\n运行上下文：当前项目根目录是 ${project.root}。如需执行命令，命令会在该目录运行。不要主动复述这个路径。`
      : "";
    const lightPlanContext =
      userIntent.needsLightPlan
        ? "\n\n轻量计划要求：如果这轮任务明显是多步骤、先看再总结、先排查再修复或需要避免半路忘记，可以先用 2 到 4 条极简步骤组织答案；但计划后必须立刻继续给已完成的观察、结论、代码、命令或下一步动作，不能只停在计划或引子。"
        : "";

    let streamedContent = "";
    let requestMessages: ChatMessage[] = [];
    setStatus("正在请求模型...");

    try {
      if (!window.novayxk) {
        throw new Error("当前在浏览器预览模式，真实模型请求需要用 Electron 启动。");
      }
      const bridge = window.novayxk;

      requestMessages = [
        {
          role: "system",
          content: buildSystemPrompt(memoryState?.memory ?? "", activeTaskSummary, runtimePermissionContext, assistantMode),
        },
        {
          role: "system",
          content: buildUserIntentInstruction(userIntent),
        },
        ...buildModelChatHistory(
          nextMessages,
          `${selectedFileContext}${projectContext}${runtimeContext}${browserContext}${lightPlanContext}`,
          assistantMode,
        ),
      ];

      setMessages([...nextMessages, { role: "assistant", content: "" }]);
      await runModelRequestWithRetries("模型请求", async () => {
        streamedContent = "";
        setMessages([...nextMessages, { role: "assistant", content: "" }]);
        await bridge.chatStream(
          {
            provider: activeProvider,
            messages: requestMessages,
          },
          {
            onChunk: (chunk) => {
              streamedContent += chunk;
              setMessages([...nextMessages, { role: "assistant", content: normalizeAssistantToolCallContent(streamedContent) }]);
            },
          },
        );
      });

      let completedContent = stripPrematurePowerShellResultText(normalizeAssistantToolCallContent(streamedContent));
      if (isLikelyIncompleteAssistantReply(completedContent, userIntent)) {
        completedContent = await recoverIncompleteAssistantReply(nextMessages, requestMessages, userIntent, completedContent);
      }
      const automationRecoveryIssue = getAutomationRecoveryIssue(completedContent);
      if (automationRecoveryIssue) {
        completedContent = await recoverInvalidAutomationReply(
          nextMessages,
          requestMessages,
          automationRecoveryIssue,
          completedContent,
        );
      }
      const completedMessages: ChatMessage[] = [
        ...nextMessages,
        {
          role: "assistant",
          content: completedContent,
          elapsedMs: Date.now() - responseStartedAt,
          tokenUsage: buildEstimatedTokenUsage(requestMessages, completedContent),
        },
      ];
      setMessages(completedMessages);
      await waitForUiCommit();
      const fileOpMessages = await executeAiFileOperations(completedContent, completedMessages);
      const browserActionMessages = await executeAiBrowserActions(completedContent, fileOpMessages ?? completedMessages);
      const commandResultMessages = userIntent.autoExecutePowerShell || extractPowerShellCommandRequests(completedContent).length > 0
        ? await executeAiPowerShellCommands(completedContent, browserActionMessages ?? fileOpMessages ?? completedMessages)
        : null;
      await saveCurrentTask(commandResultMessages ?? browserActionMessages ?? fileOpMessages ?? completedMessages);
      setStatus(commandResultMessages ? "模型已整理命令结果" : "模型响应完成");
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "模型请求失败";
      if (rawMessage === STREAM_ABORT_MESSAGE) {
        const stoppedContent = normalizeAssistantToolCallContent(streamedContent).trim() || "已停止本次生成。";
        const stoppedMessages: ChatMessage[] = [
          ...nextMessages,
          {
            role: "assistant",
            content: stoppedContent,
            elapsedMs: Date.now() - responseStartedAt,
            tokenUsage: buildEstimatedTokenUsage(requestMessages, stoppedContent),
          },
        ];
        setMessages(stoppedMessages);
        setStatus("已停止本次生成");
        if (streamedContent.trim()) {
          await saveCurrentTask(stoppedMessages);
        }
        return;
      }
      const content = formatActionableError(error, "请求模型失败");
      setMessages([
        ...nextMessages,
        {
          role: "assistant",
          content,
          elapsedMs: Date.now() - responseStartedAt,
          tokenUsage: buildEstimatedTokenUsage(requestMessages, content),
        },
      ]);
      setStatus(content);
    } finally {
      setIsLoading(false);
      setIsStopping(false);
      setLoadingStartedAt(null);
      stopRequestedRef.current = false;
    }
  }

  async function resumePendingAdminCommand(pendingAdminResume: PendingAdminResume) {
    if (pendingAdminResume.action !== "run-command") {
      await clearPendingAdminResume();
      return;
    }

    const commandText = pendingAdminResume.command.trim();
    if (!commandText) {
      await clearPendingAdminResume();
      return;
    }

    stopRequestedRef.current = false;
    setPrompt("");
    setIsLoading(true);
    setIsStopping(false);
    setStatus("已切换到管理员模式，正在继续刚才的系统操作...");
    setLoadingStartedAt(Date.now());
    setLoadingElapsedMs(0);

    const resumeBaseMessages = pendingAdminResume.messages?.length
      ? sanitizeChatHistory(pendingAdminResume.messages)
      : sanitizeChatHistory(messages);
    const resumeIntro = {
      role: "assistant" as const,
      content: `已切换到管理员模式，继续执行刚才中断的系统操作：\n\n\`\`\`powershell\n${commandText}\n\`\`\``,
    };
    const nextMessages: ChatMessage[] = [...resumeBaseMessages, resumeIntro];
    setMessages(nextMessages);

    try {
      const resumedMessages = await executeAiPowerShellCommands(`\`\`\`powershell-run\n${commandText}\n\`\`\``, nextMessages);
      await saveCurrentTask(resumedMessages ?? nextMessages);
      await clearPendingAdminResume();
      setStatus("已在管理员模式下继续执行刚才的操作");
    } catch (error) {
      const content = formatActionableError(error, "恢复管理员任务失败");
      const failedMessages: ChatMessage[] = [
        ...nextMessages,
        {
          role: "assistant",
          content,
        },
      ];
      setMessages(failedMessages);
      await saveCurrentTask(failedMessages);
      await clearPendingAdminResume();
      setStatus(content);
    } finally {
      setIsLoading(false);
      setIsStopping(false);
      setLoadingStartedAt(null);
      stopRequestedRef.current = false;
    }
  }

  async function stopGeneration() {
    if (!isLoading || !window.novayxk || isStopping) return;
    stopRequestedRef.current = true;
    const runningTask =
      activeTerminalTask?.status === "running"
        ? activeTerminalTask
        : terminalTasks.find((task) => task.status === "running") ?? null;
    setIsStopping(true);
    setStatus(runningTask ? `正在停止生成和终端任务：${runningTask.title}` : "正在停止生成...");
    try {
      const stopTerminalPromise = runningTask
        ? window.novayxk.stopTerminalTask(runningTask.id)
        : Promise.resolve<TerminalTask | null>(null);
      const stopResults = await Promise.allSettled([
        window.novayxk.cancelActiveChatStream(),
        window.novayxk.cancelImageGeneration(),
        stopTerminalPromise,
      ] as const);
      const terminalResult = stopResults[2];
      if (terminalResult.status === "fulfilled") {
        const stoppedTask = terminalResult.value;
        if (stoppedTask) {
          upsertTerminalTask(stoppedTask);
        }
      }
      const failedResult = stopResults.find((result) => result.status === "rejected");
      if (failedResult?.status === "rejected") {
        throw failedResult.reason;
      }
      setStatus(runningTask ? `正在停止终端任务：${runningTask.title}` : "正在停止生成...");
    } catch (error) {
      setIsStopping(false);
      setStatus(error instanceof Error ? error.message : "停止生成失败");
    }
  }

  return {
    sendMessage,
    stopGeneration,
    resumePendingAdminCommand,
  };
}
