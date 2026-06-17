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
  extractWebSearchRequests,
  formatProjectContext,
  getAssistantModeProfile,
  getAutomationRecoveryIssue,
  getBrowserActionsParseIssue,
  getFileOpsParseIssue,
  getWebSearchParseIssue,
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
  AppLanguage,
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
  WebSearchRequest,
  WebSearchResponse,
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
const WEB_SEARCH_LOOP_LIMIT = 3;
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
  language: AppLanguage;
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
  language,
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
  const isChinese = language === "zh-CN";
  const localizedStopMessage = isChinese ? "已停止生成。" : "Generation stopped.";
  const localizedStopStatus = isChinese ? "已停止生成" : "Generation stopped";
  const localizedTexts = {
    executionOutput: isChinese ? "执行结果" : "Execution Output",
    powershellExecutionOutput: isChinese ? "PowerShell 执行结果：" : "PowerShell execution output:",
    builtInWebSearchResults: isChinese ? "内置联网搜索结果：" : "Built-in web search results:",
    sourceInline: isChinese ? "来源：在普通内容里检测到类似命令的文本" : "Source: command-like text detected in normal content",
    sourceCodeBlock: isChinese ? "来源：powershell-run 代码块" : "Source: powershell-run code block",
    terminalTask: isChinese ? "终端任务" : "Terminal task",
    exitCode: isChinese ? "退出码" : "Exit code",
    stillRunningStatus: isChinese ? "状态：仍在终端任务中运行" : "Status: still running as a terminal task",
    noCommandSummary: isChinese ? "命令已执行，但模型没有返回总结。" : "The command finished, but the model did not return a summary.",
    noWebSearchSummary: isChinese ? "内置联网搜索已完成，但模型没有返回总结。" : "The built-in web search finished, but the model did not return a summary.",
    warnings: isChinese ? "警告" : "Warnings",
    url: "URL",
    host: isChinese ? "域名" : "Host",
    displayedUrl: isChinese ? "展示链接" : "Displayed URL",
    publishedAt: isChinese ? "发布时间" : "Published",
    searchSnippet: isChinese ? "搜索摘要" : "Search snippet",
    pageTitle: isChinese ? "页面标题" : "Page title",
    pageDescription: isChinese ? "页面描述" : "Page description",
    pageExcerpt: isChinese ? "页面摘录" : "Page excerpt",
    pageFetchNote: isChinese ? "页面抓取说明" : "Page fetch note",
    noResults: isChinese ? "没有结果。" : "No results.",
    builtInWebSearchQuery: isChinese ? "内置联网搜索查询" : "Built-in web search query",
    engine: isChinese ? "搜索引擎" : "Engine",
    searchedAt: isChinese ? "搜索时间" : "Searched at",
    resultCount: isChinese ? "结果数量" : "Result count",
    fetchedPagePreviews: isChinese ? "抓取到的页面预览数" : "Fetched page previews",
  } as const;

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
      /供应商配置不完整|图片提示词不能为空|当前在浏览器预览模式|没有检测到 Novayxk 桌面桥接|Base URL 无效|当前供应商配置为图片生成接口|当前系统权限不够|请先打开一个项目|图片生成接口返回成功，但没有图片数据|模型列表接口返回成功，但没有可用模型|provider configuration is incomplete|image prompt cannot be empty|browser preview mode|desktop bridge was not detected|base url is invalid|current provider configuration is for image generation|current system privileges are insufficient|open a project first|image generation endpoint returned success, but no image data|model list request returned success, but no available models/i.test(
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
    setStatus(`${actionLabel} failed. Retrying ${retryIndex}/${MODEL_REQUEST_MAX_RETRIES}...`);
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
    throw lastError instanceof Error ? lastError : new Error(`${actionLabel} failed`);
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
    return value.length > limit ? `${value.slice(0, limit)}\n... (truncated)` : value;
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
        content: isChinese
          ? `${buildSystemPrompt(memoryState?.memory ?? "", activeTaskSummary, runtimePermissionContext, assistantMode)}

【深度复查规则】
你正在执行一次动作后的复查。只能根据已经真实发生的结果判断，不要想象成功。
- 只用 1 到 2 句短句。
- 必须以下列其一开头："深度复查：已确认"、"深度复查：大体确认"、或 "深度复查：未确认"。
- 然后补充最关键的一条证据，或者说明仍需人工确认的主要点。
- 不要输出 powershell-run、fileops、browser-actions、diff 或 JSON。`
          : `${buildSystemPrompt(memoryState?.memory ?? "", activeTaskSummary, runtimePermissionContext, assistantMode)}

[Deep verification rules]
You are performing a post-execution verification pass. Judge only from real results that already happened; do not imagine success.
- Use only 1 to 2 short sentences.
- Start with one of: "Deep verification: confirmed", "Deep verification: mostly confirmed", or "Deep verification: not confirmed".
- Then add the single most important piece of evidence, or the main point that still needs manual confirmation.
- Do not output powershell-run, fileops, browser-actions, diff, or JSON.`,
      },
      {
        role: "user",
        content: isChinese
          ? `原始用户目标：${userGoal || "未提供"}\n\n复查目标：${label}\n\n真实证据：\n${truncateForVerification(evidence)}`
          : `Original user goal: ${userGoal || "Not provided"}\n\nVerification target: ${label}\n\nReal evidence:\n${truncateForVerification(evidence)}`,
      },
    ];

    const rawReply = await runModelRequestWithRetries("Deep verification request", () =>
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
            failedChecks.push(`${operation.path}: ${isChinese ? "回读内容与写入内容不一致" : "the read-back content does not match the written content"}`);
          }
        } else if (!file.content.includes(operation.replace)) {
          failedChecks.push(`${operation.path}: ${isChinese ? "回读后没有找到替换后的文本" : "the replacement text was not found after reading the file back"}`);
        } else if (operation.occurrence === "all" && file.content.includes(operation.search)) {
          failedChecks.push(`${operation.path}: ${isChinese ? "应该被替换掉的原文本仍然存在" : "some original text that should have been replaced is still present"}`);
        } else {
          confirmedWrites += 1;
        }

        if (depth === "deep") {
          evidenceBlocks.push(`${isChinese ? "文件" : "File"} ${operation.path}:\n${truncateForVerification(file.content.slice(0, 1400), 1400)}`);
        }
      } catch (error) {
        failedChecks.push(`${operation.path}: ${error instanceof Error ? error.message : isChinese ? "回读失败" : "read-back failed"}`);
      }
    }

    for (const operation of mkdirOperations.slice(0, mkdirLimit)) {
      if (await doesProjectPathExist(operation.path)) {
        confirmedDirs += 1;
      } else {
        failedChecks.push(`${operation.path}: ${isChinese ? "项目树里没有出现这个目录" : "the directory did not appear in the project tree"}`);
      }
    }

    const writeLikeChecked = Math.min(writeLikeOperations.length, writeLikeLimit);
    const mkdirChecked = Math.min(mkdirOperations.length, mkdirLimit);
    const confirmedSegments = [
      writeLikeChecked ? (isChinese ? `${confirmedWrites}/${writeLikeChecked} 个关键文件已回读确认` : `${confirmedWrites}/${writeLikeChecked} key file write-backs confirmed`) : "",
      mkdirChecked ? (isChinese ? `${confirmedDirs}/${mkdirChecked} 个目录已确认创建` : `${confirmedDirs}/${mkdirChecked} directories confirmed created`) : "",
    ].filter(Boolean);
    const baseNote =
      failedChecks.length > 0
        ? isChinese
          ? `已复查：${confirmedSegments.length ? confirmedSegments.join("，") : "自动执行本身已返回成功"}；仍有未解决检查项：${failedChecks.join("；")}。`
          : `Verified: ${confirmedSegments.length ? `confirmed ${confirmedSegments.join(", ")}` : "automatic execution already returned success"}; unresolved checks remain: ${failedChecks.join("; ")}.`
        : isChinese
          ? `已复查：${confirmedSegments.length ? confirmedSegments.join("，") : "自动执行本身已返回成功"}。`
          : `Verified: ${confirmedSegments.length ? `confirmed ${confirmedSegments.join(", ")}` : "automatic execution already returned success"}.`;

    if (depth !== "deep") {
      return { note: baseNote };
    }

    const deepVerification = await requestDeepVerification(
      "File operation result",
      baseMessages,
      [
        `${isChinese ? "本地复查" : "Local verification"}: ${baseNote}`,
        changedFiles.length ? `${isChinese ? "变更文件" : "Changed files"}: ${changedFiles.join(", ")}` : "",
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
      return isChinese
        ? `已复查：仍有 ${running.length} 条命令在终端里继续运行，所以这个任务暂时还不能视为完成。`
        : `Verified: ${running.length} command(s) are still running in the terminal, so the task cannot be considered complete yet.`;
    }
    if (failed.length) {
      return isChinese
        ? `已复查：有 ${failed.length} 条命令以非零退出码结束，所以这个结果还不能算完全完成。`
        : `Verified: ${failed.length} command(s) exited with a non-zero code, so this result is not fully complete yet.`;
    }
    if (emptySucceeded.length) {
      return isChinese
        ? `已复查：所有命令都正常退出了，但有 ${emptySucceeded.length} 步没有可见输出，所以目前只能确认命令执行过，不能完全确认目标状态。`
        : `Verified: all commands exited normally, but ${emptySucceeded.length} step(s) produced no visible output, so only command execution is confirmed, not the full target state.`;
    }
    return isChinese
      ? "已复查：所有自动执行的命令都产生了可见输出，并且正常退出。"
      : "Verified: all automatically executed commands produced visible output and exited normally.";
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
      isChinese ? "PowerShell 执行结果" : "PowerShell execution result",
      baseMessages,
      `${isChinese ? "本地复查" : "Local verification"}: ${baseNote}\n\n${isChinese ? "模型总结" : "Model summary"}:\n${summaryContent}\n\n${isChinese ? "真实命令输出" : "Real command output"}:\n${executionContent}`,
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
    const locationNote = snapshot
      ? `${snapshot.title || (isChinese ? "当前页面" : "Current page")} · ${snapshot.currentUrl}`
      : isChinese
        ? "当前页面信息暂时不可用"
        : "Current page information is temporarily unavailable";
    const baseNote = followUpNote
      ? isChinese
        ? `已复查：浏览器当前位于 ${locationNote}。本轮自动流程停止的原因是：${followUpNote}`
        : `Verified: the browser is currently on ${locationNote}. The automatic flow stopped in this round because: ${followUpNote}`
      : isChinese
        ? `已复查：浏览器当前位于 ${locationNote}。本轮自动动作没有检测到失败。`
        : `Verified: the browser is currently on ${locationNote}. No failures were detected in this round of automatic actions.`;

    if (getVerificationDepth(assistantMode) !== "deep") {
      return { note: baseNote };
    }

    const browserContext = await getBrowserPromptContext().catch(() => "");
    const deepVerification = await requestDeepVerification(
      isChinese ? "浏览器自动化结果" : "Browser automation result",
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
      return { note: isChinese ? "已复查：接口没有返回任何图片文件，所以这个结果不能视为完成。" : "Verified: the endpoint returned no image files, so this result cannot be considered complete." };
    }
    return { note: isChinese ? `已复查：收到了 ${imageCount} 个图片文件，并已保存到本地 generated-images 目录。` : `Verified: ${imageCount} image file(s) were received and saved in the local generated-images directory.` };
  }

  async function handleInternalControlModeRequest(userPrompt: string, nextMessages: ChatMessage[]) {
    const nextMode = detectInternalControlModeRequest(userPrompt);
    if (!nextMode) return false;

    setPrompt("");
    setMessages(nextMessages);
    const saved = aiControlMode === nextMode ? true : await updateAiControlMode(nextMode);
    const assistantContent =
      nextMode === "full"
        ? "Switched Novayxk to system-level execution scope. This only changes which commands the AI may request; it does not mean the app already has Windows administrator privileges. If a later step needs system-level access, I will still request UAC or administrator approval separately."
        : "Switched Novayxk back to project-level execution scope. I will prioritize development commands inside the current project, and system-level actions will still be blocked or require confirmation.";
    const handledMessages: ChatMessage[] = [
      ...nextMessages,
      {
        role: "assistant",
        content: assistantContent,
      },
    ];
    setMessages(handledMessages);
    setStatus(saved ? getExecutionModeStatus(nextMode) : "Execution scope was switched, but the preference could not be saved");
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
        ? "Switched to Ultra-light mode. I will keep context and explanation to a minimum, preserve only the necessary actions and conclusions, and do only the lowest-cost verification by default."
        : nextMode === "deep"
          ? "Switched to Deep mode. I will keep more context, which is better for complex debugging, refactors, and multi-step tasks, and I will add the full verification chain after execution."
          : "Switched to Standard mode. I will balance context, speed, and completeness, and verify the key results after execution.";
    const handledMessages: ChatMessage[] = [
      ...nextMessages,
      {
        role: "assistant",
        content: assistantContent,
      },
    ];
    setMessages(handledMessages);
    setStatus(saved ? getAssistantModeStatus(nextMode) : "Assistant mode was switched, but the preference could not be saved");
    await saveCurrentTask(handledMessages);
    return true;
  }

  async function handleAdminPrivilegeRequest(userPrompt: string, nextMessages: ChatMessage[]) {
    if (!detectAdminPrivilegeRequest(userPrompt)) return false;

    setPrompt("");
    setMessages(nextMessages);

    let assistantContent = "";
    if (!window.novayxk) {
      assistantContent = "The Novayxk desktop bridge is not available, so I cannot request Windows administrator privileges right now. Close this window, reopen Novayxk, and then switch to Administrator Mode again.";
      setStatus("Desktop bridge not detected. Reopen Novayxk before switching to Administrator Mode.");
    } else if (privilege?.isAdmin) {
      assistantContent = "Novayxk is already running in Administrator Mode, so there is no need to switch again.";
      setStatus("Already running in Administrator Mode.");
    } else if (!privilege?.canElevate) {
      assistantContent = "This environment cannot request Windows UAC administrator privileges directly. Make sure you are running the desktop app, not a browser preview or a development shell.";
      setStatus("This environment cannot switch directly to Administrator Mode.");
    } else {
      assistantContent = "I am requesting Administrator Mode now. A Windows UAC approval window will appear next; once you confirm it, Novayxk will restart with administrator privileges.";
      setStatus("Requesting Windows administrator privileges...");
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
      assistantContent = "Administrator Mode did not start successfully. The app may be running in development mode, or the Windows UAC prompt may have been cancelled.";
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
      ? "This is a browser preview environment, so it cannot open the real embedded Electron browser window. Please use the desktop version of Novayxk."
      : "The embedded browser workspace is now open.";

    if (window.novayxk) {
      openBrowserWorkspace();
      setStatus("Opened the browser workspace window");
    } else {
      setStatus("This environment does not support opening the embedded browser window");
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
      setStatus(formatActionableError(error, "Failed to read project context"));
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
      setStatus(formatActionableError(error, "Failed to read browser context"));
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
          content: "No project is currently open, so there is nowhere to save this image yet.",
        },
      ];
      setMessages(blockedMessages);
      setStatus("Open a project first.");
      await saveCurrentTask(blockedMessages);
      return true;
    }

    if (!window.novayxk) {
      const blockedMessages: ChatMessage[] = [
        ...nextMessages,
        {
          role: "assistant",
          content: "You are in browser preview mode. Saving a chat image into the project directory requires the Electron desktop app.",
        },
      ];
      setMessages(blockedMessages);
      setStatus("This environment cannot save chat images into the project directory.");
      await saveCurrentTask(blockedMessages);
      return true;
    }

    const latestImage = findLatestGeneratedImageAttachment(messages);
    if (!latestImage) {
      const blockedMessages: ChatMessage[] = [
        ...nextMessages,
        {
          role: "assistant",
          content: "There is no recent generated image in this conversation to save.",
        },
      ];
      setMessages(blockedMessages);
      setStatus("No savable chat image was found.");
      await saveCurrentTask(blockedMessages);
      return true;
    }

    const targetPath = extractGeneratedImageTargetPath(userPrompt);
    setStatus(targetPath ? `Saving image to ${targetPath}...` : "Saving image to the current project directory...");
    try {
      const result = await window.novayxk.saveGeneratedImageToProject({
        imagePath: latestImage.path,
        ...(targetPath ? { targetPath } : {}),
      });
      const completedMessages: ChatMessage[] = [
        ...nextMessages,
        {
          role: "assistant",
          content: `Saved the recently generated image to the current project directory: ${result.relativePath}`,
        },
      ];
      await syncProjectView({ preferredPath: result.relativePath });
      setMessages(completedMessages);
      setStatus(`Image saved: ${result.relativePath}`);
      await saveCurrentTask(completedMessages);
    } catch (error) {
      const content = formatActionableError(error, "Failed to save the chat image");
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
          content: `An incomplete \`fileops\` block or a JSON parsing failure was detected. The model output was likely truncated because too much content was generated at once.\n\nReason: ${parseIssue}\n\nIt is better to split large frontend work across multiple files, such as package.json, src/main.js, src/App.vue, and src/styles.css, instead of trying to generate an entire system inside one huge HTML string.`,
        },
      ];
      setMessages(nextMessages);
      setStatus("The fileops block is incomplete and may have been truncated by the model output length");
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
        `Detected sensitive content in the file change. Novayxk paused automatic execution, but kept this fileops payload. After you confirm that this is content you really want to write, you can click "Run file operations" in the bottom toolbar to execute it manually.\n\n` +
        `Reason: ${sensitiveMutation.inspection.reason}\n\n` +
        `Tip: If you do not want to confirm every time, ask the AI to switch to environment variables, command-line arguments, interactive input, or placeholders.`;
      const lastMessage = baseMessages[baseMessages.length - 1];
      const blockedMessages: ChatMessage[] = [
        ...baseMessages.slice(0, -1),
        lastMessage?.role === "assistant"
          ? { ...lastMessage, content: `${lastMessage.content.trim()}\n\n${warning}` }
          : { role: "assistant", content: warning },
      ];
      setMessages(blockedMessages);
      setStatus("Sensitive file operations were paused and are waiting for your confirmation");
      return blockedMessages;
    }

    if (hasDestructiveFileOps(operations)) {
      const warning =
        'Detected a delete file operation. To avoid accidental AI-driven deletion of project content, this kind of fileops payload will not run automatically. Check the path first, then click "Run file operations" in the bottom toolbar to confirm it manually.';
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
      setStatus("Delete fileops detected and switched to manual confirmation");
      return nextMessages;
    }

    if (!project) {
      const blockedMessages: ChatMessage[] = [
        ...baseMessages,
        {
          role: "assistant",
          content:
            "File operations were detected, but no project is currently open, so they were not executed. If the target file belongs to the current project, open that project first. If the target is on the Desktop, in Downloads, or anywhere else outside the project, ask me to switch to powershell-run instead.",
        },
      ];
      setMessages(blockedMessages);
      return null;
    }

    try {
      if (!window.novayxk) {
        throw new Error("You are currently in browser preview mode. File operations require the Electron app.");
      }

      setStatus("The AI is running file operations...");
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
            `File operations were executed automatically:\n\n${result.changedFiles.map((file) => `- ${file}`).join("\n")}`,
            verification.note,
          ),
          ...(verification.tokenUsage ? { tokenUsage: verification.tokenUsage } : {}),
        },
      ];
      setMessages(nextMessages);
      setStatus(`File operations completed automatically: ${result.changedFiles.join(", ")}`);
      return nextMessages;
    } catch (error) {
      const message = error instanceof Error ? error.message : "AI file operations failed";
      const nextMessages: ChatMessage[] = [
        ...baseMessages,
        {
          role: "assistant",
          content: `Automatic file operations failed: ${message}\n\nI kept this fileops payload for you. You can click "Run file operations" in the bottom toolbar to confirm it manually, or ask me to rewrite it in a different way.`,
        },
      ];
      setMessages(nextMessages);
      setStatus(formatActionableError(error, "Automatic file operations failed"));
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
          content: `Novayxk automatically stopped repeated PowerShell execution: ${loopCheck.reason}\n\nRecently repeated commands:\n\n\`\`\`powershell\n${commands
            .map((command) => command.command)
            .join("\n\n")
            .slice(0, 3000)}\n\`\`\`\n\nI did not continue the repeated steps. Try a different install source, inspect the failure from the previous step, or ask the user to confirm what should happen next.`,
        },
      ];
      setMessages(stoppedMessages);
      setStatus("Repeated PowerShell steps were detected and stopped automatically");
      return stoppedMessages;
    }

    const resultLines: string[] = [];
    const commandResults: Array<{ command: string; output: string; code: number | null }> = [];
    for (const commandRequest of commands.slice(0, 5)) {
      const commandText = commandRequest.command.trim();
      if (!commandText) continue;
      setStatus(`The AI is running PowerShell in ${getExecutionModeLabel(aiControlMode)} mode...`);

      try {
        if (isWriteLikePowerShellCommand(commandText)) {
          const sensitiveInspection = inspectSensitiveGeneratedContent(commandText);
          if (sensitiveInspection.blocked) {
            throw new Error(`Blocked: automatic PowerShell write contains sensitive risk. Reason: ${sensitiveInspection.reason}. Please switch to environment variables/placeholders, or have the user confirm the sensitive content manually.`);
          }
        }
        if (!window.novayxk) {
          throw new Error("You are currently in browser preview mode. Command execution requires the Electron app.");
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
            ? `Windows administrator permission is required: ${inspection.adminReason ?? "This command may require Windows administrator privileges."} Novayxk requested permission to restart with Windows administrator privileges, so the command has not been executed yet.`
            : `Windows administrator permission is required: ${inspection.adminReason ?? "This command may require Windows administrator privileges."} The administrator mode switch did not complete, so the command has not been executed yet.`;
          resultLines.push(`$ ${commandText}\n${adminMessage}`);
          continue;
        }
        if (needsAdminRestart) {
          await clearPendingAdminResume();
        }
        const confirmedSystemAction = inspection.requiresConfirmation
          ? await confirmSystemAction(commandText, inspection.systemAction?.label ?? "system action", "ai")
          : false;
        if (inspection.requiresConfirmation && !confirmedSystemAction) {
          resultLines.push(`$ ${commandText}\nSpecial system action canceled: ${inspection.systemAction?.label ?? "system action"}`);
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
        const sourceNote = commandRequest.source === "inline" ? localizedTexts.sourceInline : localizedTexts.sourceCodeBlock;
        const taskNote = result.terminalTask ? `${localizedTexts.terminalTask}: ${result.terminalTask.id}` : "";
        const output = `${sourceNote}\n${taskNote ? `${taskNote}\n` : ""}$ ${commandText}\n${result.output}\n${result.longRunning ? localizedTexts.stillRunningStatus : `${localizedTexts.exitCode}: ${result.code}`}`;
        resultLines.push(output);
        commandResults.push({
          command: commandText,
          output: result.output,
          code: result.longRunning ? null : result.code,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "AI PowerShell execution failed";
        const sourceNote = commandRequest.source === "inline" ? localizedTexts.sourceInline : localizedTexts.sourceCodeBlock;
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
        ? `${isChinese ? "已停止生成，并已请求停止所有仍在运行的终端任务。" : "Generation stopped, and any running terminal task was asked to stop."}\n\n${localizedTexts.powershellExecutionOutput}\n\n\`\`\`text\n${resultLines.join("\n\n").slice(0, 18000)}\n\`\`\``
        : isChinese
          ? "已停止生成，并已请求停止所有仍在运行的终端任务。"
          : "Generation stopped, and any running terminal task was asked to stop.";
      const stoppedMessages: ChatMessage[] = [
        ...baseMessages,
        {
          role: "assistant",
          content: stoppedContent,
        },
      ];
      setMessages(stoppedMessages);
      setStatus(localizedStopStatus);
      return stoppedMessages;
    }

    const executionContent = `${localizedTexts.powershellExecutionOutput}\n\n\`\`\`text\n${resultLines.join("\n\n").slice(0, 18000)}\n\`\`\``;
    const nextMessages: ChatMessage[] = [
      ...baseMessages,
      {
        role: "assistant",
        content: executionContent,
      },
    ];
    setMessages(nextMessages);
    setStatus("The AI is organizing the PowerShell execution output...");

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

[Command result reply rules]
Novayxk already executed the commands you requested through powershell-run. You must now answer the user's original question directly from the real command output.
- Do not ask the user to run commands again, copy output, or "send me the result".
- Start with a clear conclusion, then add only the necessary short explanation.
- If a command failed, explain why it failed and what the next best step is.
- If the command output is empty, truncated, not shown, or the exit code is not 0, do not claim success. Say there is not enough evidence to confirm success yet.
- If the original user task truly requires another command, you may output a complete powershell-run block for the next step. Do not write commands as plain text, and do not claim an unexecuted command has already started.
- If you notice you are about to repeat a command that already ran in the previous turn or earlier turns, stop outputting commands. Summarize why the flow is stuck, what has already been tried, and how the user can verify the next step.
- If you are only giving advice or optional actions, do not output powershell-run, fileops, or diff blocks.
${resultJudgementNote ? `\n\n[Result judgement guardrails]\n${resultJudgementNote}` : ""}`,
        },
        ...sanitizeChatHistory(baseMessages).slice(-getAssistantModeProfile(assistantMode).commandSummaryHistoryLimit),
        {
          role: "user",
          content: `Novayxk already executed the PowerShell command automatically. Please answer my original question directly instead of only repeating the raw output.\n\n${executionContent}`,
        },
      ];

      await runModelRequestWithRetries("Model summary request", async () => {
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
      const summaryUsage = buildEstimatedTokenUsage(summaryMessages, finalSummaryContent || localizedTexts.noCommandSummary);
      let finalMessages: ChatMessage[] = [
        ...nextMessages,
        {
          role: "assistant",
          content: finalSummaryContent || localizedTexts.noCommandSummary,
          elapsedMs: Date.now() - summaryStartedAt,
          tokenUsage: summaryUsage,
        },
      ];
      setMessages(finalMessages);
      const followUpCommands = extractPowerShellCommandRequests(finalSummaryContent);
      if (followUpCommands.length && commandLoopState.rounds < COMMAND_LOOP_SAFETY_LIMIT) {
        setStatus("Detected follow-up PowerShell steps. Continuing...");
        return executeAiPowerShellCommands(finalSummaryContent, finalMessages, commandLoopState);
      }
      if (followUpCommands.length) {
        const safetyMessages: ChatMessage[] = [
          ...finalMessages,
          {
            role: "assistant",
            content:
              "Novayxk triggered the repeated PowerShell safety fuse because there were too many consecutive steps. Automatic continuation was stopped to avoid hanging or repetitive installs. Check the earlier execution results before confirming the next step.",
          },
        ];
        setMessages(safetyMessages);
        setStatus("Too many consecutive PowerShell steps triggered the safety fuse");
        return safetyMessages;
      }
      const verification = await buildCommandVerificationSummary(
        baseMessages,
        commandResults,
        executionContent,
        finalSummaryContent || localizedTexts.noCommandSummary,
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
      setStatus(commandLoopState.rounds > 1 ? "AI PowerShell multi-step execution completed" : "AI PowerShell execution completed and a conclusion was generated");
      return finalMessages;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to summarize the command result";
      if (message === STREAM_ABORT_MESSAGE) {
        setStatus(localizedStopStatus);
        return nextMessages;
      }
      setStatus(formatActionableError(error, "Failed to summarize the command result"));
      return nextMessages;
    }
  }

  function formatWebSearchResponse(response: WebSearchResponse) {
    const warningBlock = response.warnings?.length ? `${localizedTexts.warnings}:\n${response.warnings.map((item) => `- ${item}`).join("\n")}\n\n` : "";
    const resultsBlock = response.results.length
      ? response.results
        .map((result, index) =>
          [
            `${index + 1}. ${result.title}`,
            `${localizedTexts.url}: ${result.url}`,
            `${localizedTexts.host}: ${result.host}`,
            result.displayedUrl ? `${localizedTexts.displayedUrl}: ${result.displayedUrl}` : "",
            result.publishedAt ? `${localizedTexts.publishedAt}: ${result.publishedAt}` : "",
            result.snippet ? `${localizedTexts.searchSnippet}: ${result.snippet}` : "",
            result.pageTitle ? `${localizedTexts.pageTitle}: ${result.pageTitle}` : "",
            result.pageDescription ? `${localizedTexts.pageDescription}: ${result.pageDescription}` : "",
            result.pageExcerpt ? `${localizedTexts.pageExcerpt}: ${truncateForVerification(result.pageExcerpt, 900)}` : "",
            result.pageError ? `${localizedTexts.pageFetchNote}: ${result.pageError}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        )
        .join("\n\n")
      : localizedTexts.noResults;

    return [
      `${localizedTexts.builtInWebSearchQuery}: ${response.query}`,
      `${localizedTexts.engine}: ${response.engine}`,
      `${localizedTexts.searchedAt}: ${response.searchedAt}`,
      `${localizedTexts.resultCount}: ${response.resultCount}`,
      `${localizedTexts.fetchedPagePreviews}: ${response.pageFetchCount}`,
      "",
      `${warningBlock}${resultsBlock}`.trim(),
    ].join("\n");
  }

  function getWebSearchLoopKey(request: WebSearchRequest) {
    return JSON.stringify({
      query: request.query.trim().toLowerCase(),
      domains: [...(request.domains ?? [])].map((entry) => entry.trim().toLowerCase()).sort(),
      maxResults: request.maxResults ?? null,
      includePageContent: request.includePageContent ?? null,
      includePageContentCount: request.includePageContentCount ?? null,
    });
  }

  async function buildWebSearchVerificationSummary(
    baseMessages: ChatMessage[],
    responses: WebSearchResponse[],
    summaryContent: string,
  ): Promise<VerificationSummary> {
    const totalResults = responses.reduce((sum, response) => sum + response.resultCount, 0);
    const totalFetchedPages = responses.reduce((sum, response) => sum + response.pageFetchCount, 0);
    const baseNote =
      totalResults > 0
        ? isChinese
          ? `已复查：内置联网搜索共返回了 ${totalResults} 条结果，经历了 ${responses.length} 轮搜索步骤，并抓取了 ${totalFetchedPages} 个来源页面预览。`
          : `Verified: the built-in web search returned ${totalResults} result(s) across ${responses.length} search step(s), and fetched page previews for ${totalFetchedPages} source page(s).`
        : isChinese
          ? "已复查：内置联网搜索没有返回可用的匹配结果，因此目前还没有建立可靠的在线确认。"
          : "Verified: the built-in web search did not return any usable matching result, so no online confirmation was established.";

    if (getVerificationDepth(assistantMode) !== "deep") {
      return { note: baseNote };
    }

    const deepVerification = await requestDeepVerification(
      isChinese ? "内置联网搜索结果" : "Built-in web search result",
      baseMessages,
      [
        ...responses.map((response) => formatWebSearchResponse(response)),
        `${isChinese ? "基于搜索证据的模型总结" : "Model summary from the search evidence"}:\n${summaryContent}`,
      ].join("\n\n"),
    ).catch(() => ({ note: "" } as VerificationSummary));

    return {
      note: deepVerification.note ? `${baseNote}\n${deepVerification.note}` : baseNote,
      tokenUsage: deepVerification.tokenUsage,
    };
  }

  async function executeAiWebSearch(
    assistantContent: string,
    baseMessages: ChatMessage[],
    seenSearches = new Set<string>(),
    round = 1,
  ) {
    const requests = extractWebSearchRequests(assistantContent);
    if (!requests.length) {
      const parseIssue = getWebSearchParseIssue(assistantContent);
      if (!parseIssue) return null;
      const nextMessages: ChatMessage[] = [
        ...baseMessages,
        {
          role: "assistant",
          content: `An incomplete \`web-search\` block or JSON parsing failure was detected.\n\nReason: ${parseIssue}\n\nPlease output a strict JSON \`web-search\` block such as {"query":"latest GPT-5.4 release","domains":["openai.com"],"maxResults":5,"includePageContent":true,"includePageContentCount":2}.`,
        },
      ];
      setMessages(nextMessages);
      setStatus("The web-search block is incomplete and may have been truncated by the model output length");
      return nextMessages;
    }

    if (!window.novayxk) {
      const blockedMessages: ChatMessage[] = [
        ...baseMessages,
        {
          role: "assistant",
          content: "Built-in web search was detected, but it was not executed because the app is not currently running in the Electron desktop environment.",
        },
      ];
      setMessages(blockedMessages);
      return blockedMessages;
    }

    const freshRequests: WebSearchRequest[] = [];
    for (const request of requests.slice(0, 3)) {
      const key = getWebSearchLoopKey(request);
      if (seenSearches.has(key)) continue;
      seenSearches.add(key);
      freshRequests.push(request);
    }

    if (!freshRequests.length) {
      const repeatedMessages: ChatMessage[] = [
        ...baseMessages,
        {
          role: "assistant",
          content: "Novayxk automatically stopped repeated built-in web searches because the same search request had already been executed.",
        },
      ];
      setMessages(repeatedMessages);
      setStatus("Repeated built-in web-search steps were detected and stopped automatically");
      return repeatedMessages;
    }

    setStatus("The AI is using the built-in web search...");
    const responses: WebSearchResponse[] = [];
    const resultBlocks: string[] = [];

    for (const request of freshRequests) {
      const response = await window.novayxk.webSearch(request);
      responses.push(response);
      resultBlocks.push(formatWebSearchResponse(response));
    }

    const executionContent = `${localizedTexts.builtInWebSearchResults}\n\n\`\`\`text\n${resultBlocks.join("\n\n-----\n\n").slice(0, 22000)}\n\`\`\``;
    const nextMessages: ChatMessage[] = [
      ...baseMessages,
      {
        role: "assistant",
        content: executionContent,
      },
    ];
    setMessages(nextMessages);
    setStatus("The AI is organizing the built-in web search results...");

    const bridge = window.novayxk;
    if (!bridge) {
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
          content: `${buildSystemPrompt(memoryState?.memory ?? "", activeTaskSummary, runtimePermissionContext, assistantMode)}

[Built-in web search reply rules]
Novayxk already executed the built-in web search for you. You must now answer the user's original question directly from the real search evidence.
- Start with the conclusion, then give only the necessary supporting detail.
- Distinguish confirmed facts, unconfirmed claims, and your own inference.
- If official sources conflict with media coverage, say so clearly and prefer the official source.
- If the evidence is weak, blocked, snippet-only, or missing, say that there is not enough reliable evidence yet.
- Mention source names and URLs in plain text when they matter.
- If one more targeted search is truly necessary, you may output exactly one valid \`\`\`web-search\`\`\` block for the next step.
- Do not output powershell-run just to search the web again unless a local command is genuinely required.
- Do not invent article contents when a page fetch failed or was blocked.`,
        },
        ...sanitizeChatHistory(baseMessages).slice(-getAssistantModeProfile(assistantMode).commandSummaryHistoryLimit),
        {
          role: "user",
          content: `Novayxk already executed the built-in web search automatically. Please answer my original question directly from the real search evidence.\n\n${executionContent}`,
        },
      ];

      await runModelRequestWithRetries("Built-in web search summary request", async () => {
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
      const summaryUsage = buildEstimatedTokenUsage(summaryMessages, finalSummaryContent || localizedTexts.noWebSearchSummary);
      let finalMessages: ChatMessage[] = [
        ...nextMessages,
        {
          role: "assistant",
          content: finalSummaryContent || localizedTexts.noWebSearchSummary,
          elapsedMs: Date.now() - summaryStartedAt,
          tokenUsage: summaryUsage,
        },
      ];
      setMessages(finalMessages);

      const followUpRequests = extractWebSearchRequests(finalSummaryContent);
      if (followUpRequests.length && round < WEB_SEARCH_LOOP_LIMIT) {
        setStatus("Detected a follow-up built-in web search step. Continuing...");
        return executeAiWebSearch(finalSummaryContent, finalMessages, seenSearches, round + 1);
      }
      if (followUpRequests.length) {
        const safetyMessages: ChatMessage[] = [
          ...finalMessages,
          {
            role: "assistant",
            content:
              "Novayxk triggered the built-in web-search safety fuse because there were too many consecutive search rounds. Automatic continuation was stopped to avoid getting stuck in repeated lookups.",
          },
        ];
        setMessages(safetyMessages);
        setStatus("Too many consecutive built-in web-search steps triggered the safety fuse");
        return safetyMessages;
      }

      const verification = await buildWebSearchVerificationSummary(
        baseMessages,
        responses,
        finalSummaryContent || localizedTexts.noWebSearchSummary,
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

      setStatus("Built-in web search completed and a conclusion was generated");
      return finalMessages;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to summarize the built-in web search result";
      if (message === STREAM_ABORT_MESSAGE) {
        setStatus(localizedStopStatus);
        return nextMessages;
      }
      setStatus(formatActionableError(error, "Failed to summarize the built-in web search result"));
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
        return `- ${result.ok ? "Success" : "Failed"} · ${formatBrowserActionLabel(action)} · ${result.preview}`;
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
      return "The next step involves login credentials, tokens, cookies, authorization headers, or captured login API details. You need to handle that manually; Novayxk will not execute this kind of browser action automatically.";
    }
    if (/(password|passwd|pwd|current-password|new-password|one-time-code|otp|totp|mfa|2fa|verification|captcha|验证码|校验码|动态码|密码|二次验证|两步验证)/i.test(target)) {
      return "The next step involves a password, verification code, or secondary verification, so you need to complete it manually in the embedded browser.";
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
      setStatus(formatActionableError(error, "Failed to read browser context"));
      return "";
    }

    const continuationMessages: ChatMessage[] = [
      {
        role: "system",
        content: `${buildSystemPrompt(memoryState?.memory ?? "", activeTaskSummary, runtimePermissionContext, assistantMode)}

[Browser continuation rules]
Novayxk has just completed one round of browser-actions. Decide from the latest page state whether another step is still needed.
- If another click, input, wait, scroll, or extraction step is still needed, return a complete \`\`\`browser-actions JSON\`\`\` block.
- If the current stage is done, or the next step requires the user to act manually, such as entering a password, a verification code, completing 2FA, making a payment, or confirming external authorization, reply with one short sentence and do not output browser-actions.
- Prefer the most obvious primary action on the page, such as "Continue", "Next", "Sign in", "Confirm", or "Submit".
- Do not repeat the exact same click or input sequence from the previous round unless you are only waiting briefly for the page to change.
- Return at most 1 to 3 closely connected actions at a time.`,
      },
      ...sanitizeChatHistory(baseMessages).slice(-getAssistantModeProfile(assistantMode).continuationHistoryLimit),
      {
        role: "user",
        content: `Novayxk completed browser action round ${roundIndex}.

Execution result:
${roundSummary}
${browserContext}

Please decide whether another step is needed now.`,
      },
    ];

    const reply = await runModelRequestWithRetries("Model continuation request", () =>
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
          content: `An incomplete browser-actions block or JSON parsing failure was detected.\n\nReason: ${parseIssue}\n\nPlease split the browser actions into a strict JSON array, for example navigate first, then click/type/waitFor, and do not mix comments or explanation text into the code block.`,
        },
      ];
      setMessages(nextMessages);
      setStatus("browser-actions is incomplete and may have been truncated by the model output length");
      return nextMessages;
    }

    if (!window.novayxk) {
      const blockedMessages: ChatMessage[] = [
        ...baseMessages,
        { role: "assistant", content: "Browser actions were detected, but they were not executed because the app is not currently running in the Electron desktop environment." },
      ];
      setMessages(blockedMessages);
      return blockedMessages;
    }

    await waitForUiCommit();
    if (shouldOpenBrowserWorkspaceForActions(actions)) {
      openBrowserWorkspace();
    }
    setStatus("The AI is executing browser actions...");

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
        roundBlocks.push(`Round ${roundIndex}:\n${roundSummary}`);

        for (const action of safeActions) {
          const key = getBrowserActionLoopKey(action);
          actionVisitCounts.set(key, (actionVisitCounts.get(key) ?? 0) + 1);
        }

        if (results.some((result) => !result.ok)) {
          followUpNote = "Automatic continuation stopped because the previous round had a failed action.";
          break;
        }

        if (blockedReason) {
          followUpNote = blockedReason;
          break;
        }

        const continuationReply = await requestNextBrowserAutomationStep(baseMessages, roundSummary, roundIndex);
        if (!continuationReply) {
          followUpNote = "The browser steps that can be advanced automatically are complete for now.";
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
          followUpNote = "Automatic continuation stopped because the model kept returning the same browser actions.";
          break;
        }

        pendingActions = nextActions;
        setStatus(`Detected follow-up browser steps. Continuing with round ${roundIndex + 1}...`);
      }

      if (!followUpNote && pendingActions.length && roundIndex >= BROWSER_AUTOMATION_LOOP_LIMIT) {
        followUpNote = "Reached the browser auto-continuation limit to avoid repeating the same loop on the current page.";
      }
      const verification = await buildBrowserVerificationSummary(baseMessages, roundBlocks, followUpNote);

      const nextMessages: ChatMessage[] = [
        ...baseMessages,
        {
          role: "assistant",
          content: appendVerificationNote(
            `Browser actions were executed automatically:\n\n${roundBlocks.join("\n\n")}${followUpNote ? `\n\n${followUpNote}` : ""}`,
            verification.note,
          ),
          ...(verification.tokenUsage ? { tokenUsage: verification.tokenUsage } : {}),
        },
      ];
      setMessages(nextMessages);
      setStatus(followUpNote || "Browser actions completed");
      return nextMessages;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Browser actions failed";
      const nextMessages: ChatMessage[] = [
        ...baseMessages,
        {
          role: "assistant",
          content: `Automatic browser actions failed: ${message}`,
        },
      ];
      setMessages(nextMessages);
      setStatus(formatActionableError(error, "Browser actions failed"));
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

    setStatus("The model's previous reply was incomplete. Recovering it...");
    let recoveredContent = "";

    await runModelRequestWithRetries("Model recovery request", async () => {
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
                `Your previous reply stopped mid-sentence and did not provide a complete answer. Output one full replacement reply instead of continuing the fragment.\n\n` +
                `Requirements:\n` +
                `1. If this turn requires inspection or execution, output the complete powershell-run / fileops / browser-actions / web-search / patch content directly.\n` +
                `2. If no execution is needed, give the full conclusion directly.\n` +
                `3. If this turn is about browser traces, page actions, API requests, or project structure, give the full timeline, key interfaces, key files, and any gaps you cannot see.\n` +
                `4. Do not write only lead-ins such as "Let me check", "Here it is", or "Let me read the trace first".\n` +
                `5. For inspection tasks, if a single query returns no output, say only "this check did not find it" instead of asserting that it does not exist or is not installed.\n` +
                `6. If this task benefits from a plan first, the plan must be an ultra-short 2-to-4-step plan, and the same reply must continue with results, conclusions, or the next action instead of stopping at the plan.\n` +
                `7. The task type this turn is: ${userIntent.kind === "inspect" ? "status verification" : userIntent.kind === "execute" ? "hands-on execution" : "explanation and Q&A"}.`,
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
      return `${normalizedRecoveredContent}\n\nThe model reply is still incomplete. Please try again, or rephrase the request more clearly so I can continue.`;
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

    setStatus("Detected an invalid automation format. Correcting it...");
    let recoveredContent = "";

    await runModelRequestWithRetries("Automation format repair request", async () => {
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
                `The automation content in your previous reply cannot be executed correctly by Novayxk. Output one full replacement reply instead of continuing the fragment.\n\n` +
                `Current issue: ${issue}\n\n` +
                `You must follow these rules:\n` +
                `1. For project file changes, output only a valid \`\`\`fileops\`\`\` JSON array. The only allowed fields are type, path, content, overwrite, search, replace, and occurrence.\n` +
                `2. Every fileops path must be a relative path inside the current project. Do not use absolute paths such as Desktop, Downloads, or Documents.\n` +
                `3. For browser page actions, output only a valid \`\`\`browser-actions\`\`\` JSON payload.\n` +
                `4. For built-in online lookup, output only a valid \`\`\`web-search\`\`\` JSON payload such as {"query":"...","domains":["openai.com"],"maxResults":5,"includePageContent":true,"includePageContentCount":2}.\n` +
                `5. If the target is the Desktop, Downloads, a system directory, a system file, or any path outside the project, use \`\`\`powershell-run\`\`\` instead.\n` +
                `6. Do not output the old JSON shape like { operation/create/path/content } again.\n` +
                `7. If the content is long, prefer multiple steps instead of only giving a lead-in.\n` +
                `8. Output only the final complete replacement reply that can actually run.`,
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
    setStatus("Preparing the request...");
    await waitForUiCommit();

    if (isImageGenerationMode(activeProvider.apiMode) || isLikelyImageModel(activeProvider.model)) {
      try {
        if (!window.novayxk) {
          throw new Error("You are currently in browser preview mode. Image generation requires the Electron app.");
        }
        const bridge = window.novayxk;

        setStatus("Generating image...");
        const result = await runModelRequestWithRetries("Image generation request", () =>
          bridge.generateImage({
            provider: activeProvider,
            prompt: trimmed,
            size: "1024x1024",
            n: 1,
          }),
        );
        const revisedPrompts = result.images
          .map((image, index) => image.revisedPrompt ? `Image ${index + 1} revised prompt: ${image.revisedPrompt}` : "")
          .filter(Boolean);
        const verification = buildImageVerificationSummary(result.images.length);
        const completedContent = appendVerificationNote([
          result.message || `Image generation complete: ${result.images.length} image(s)`,
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
        setStatus(result.message || "Image generation complete");
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : "Image generation failed";
        if (rawMessage === STREAM_ABORT_MESSAGE) {
          const stoppedMessages: ChatMessage[] = [
            ...nextMessages,
            {
              role: "assistant",
              content: localizedStopMessage,
              elapsedMs: Date.now() - responseStartedAt,
            },
          ];
          setMessages(stoppedMessages);
          setStatus(localizedStopStatus);
          await saveCurrentTask(stoppedMessages);
        } else {
          const content = formatActionableError(error, "Image generation failed");
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
      ? `\n\nCurrent selected file: ${selectedFile.path}\n\`\`\`\n${selectedFile.content.slice(0, assistantModeProfile.selectedFileLimit)}\n\`\`\``
      : "";
    const runtimeContext = contextMode === "runtime" && project
      ? `\n\nRuntime context: the current project root is ${project.root}. If a command needs to be executed, it will run in this directory. Do not repeat this path unless it is necessary.`
      : "";
    const lightPlanContext =
      userIntent.needsLightPlan
        ? "\n\nLight planning rule: if this turn is clearly multi-step, involves inspect-then-summarize, debug-then-fix, or needs a structure that prevents losing track halfway through, you may first organize the answer into 2 to 4 ultra-short steps. But the same reply must immediately continue with completed observations, conclusions, code, commands, or the next action. Do not stop at only the plan or a lead-in."
        : "";

    let streamedContent = "";
    let requestMessages: ChatMessage[] = [];
    setStatus("Requesting the model...");

    try {
      if (!window.novayxk) {
        throw new Error("You are currently in browser preview mode. Real model requests require the Electron app.");
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
      await runModelRequestWithRetries("Model request", async () => {
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
      const webSearchMessages = await executeAiWebSearch(completedContent, browserActionMessages ?? fileOpMessages ?? completedMessages);
      const commandSourceMessages = webSearchMessages ?? browserActionMessages ?? fileOpMessages ?? completedMessages;
      const commandSourceContent = commandSourceMessages[commandSourceMessages.length - 1]?.content ?? completedContent;
      const commandResultMessages = userIntent.autoExecutePowerShell || extractPowerShellCommandRequests(commandSourceContent).length > 0
        ? await executeAiPowerShellCommands(commandSourceContent, commandSourceMessages)
        : null;
      await saveCurrentTask(commandResultMessages ?? webSearchMessages ?? browserActionMessages ?? fileOpMessages ?? completedMessages);
      setStatus(commandResultMessages || webSearchMessages ? "The model has organized the execution result" : "Model response complete");
    } catch (error) {
      const rawMessage = error instanceof Error ? error.message : "Model request failed";
      if (rawMessage === STREAM_ABORT_MESSAGE) {
        const stoppedContent = normalizeAssistantToolCallContent(streamedContent).trim() || localizedStopMessage;
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
        setStatus(localizedStopStatus);
        if (streamedContent.trim()) {
          await saveCurrentTask(stoppedMessages);
        }
        return;
      }
      const content = formatActionableError(error, "Model request failed");
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
    setStatus("Administrator mode is active. Resuming the interrupted system task...");
    setLoadingStartedAt(Date.now());
    setLoadingElapsedMs(0);

    const resumeBaseMessages = pendingAdminResume.messages?.length
      ? sanitizeChatHistory(pendingAdminResume.messages)
      : sanitizeChatHistory(messages);
    const resumeIntro = {
      role: "assistant" as const,
      content: `Administrator mode is now active. Resuming the interrupted system task:\n\n\`\`\`powershell\n${commandText}\n\`\`\``,
    };
    const nextMessages: ChatMessage[] = [...resumeBaseMessages, resumeIntro];
    setMessages(nextMessages);

    try {
      const resumedMessages = await executeAiPowerShellCommands(`\`\`\`powershell-run\n${commandText}\n\`\`\``, nextMessages);
      await saveCurrentTask(resumedMessages ?? nextMessages);
      await clearPendingAdminResume();
      setStatus("The previous task resumed in administrator mode");
    } catch (error) {
      const content = formatActionableError(error, "Failed to resume the administrator task");
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
    setStatus(runningTask ? `Stopping generation and terminal task: ${runningTask.title}` : "Stopping generation...");
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
      setStatus(runningTask ? `Stopping terminal task: ${runningTask.title}` : "Stopping generation...");
    } catch (error) {
      setIsStopping(false);
      setStatus(error instanceof Error ? error.message : "Failed to stop generation");
    }
  }

  return {
    sendMessage,
    stopGeneration,
    resumePendingAdminCommand,
  };
}
