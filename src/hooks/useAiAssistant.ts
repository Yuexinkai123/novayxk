import type { MutableRefObject } from "react";
import {
  STREAM_ABORT_MESSAGE,
  buildModelChatHistory,
  buildSystemPrompt,
  detectAdminPrivilegeRequest,
  detectInternalControlModeRequest,
  extractFileOps,
  formatProjectContext,
  getFileOpsParseIssue,
  getProjectContextMode,
  normalizeAssistantToolCallContent,
  sanitizeChatHistory,
  type RuntimePermissionContext,
} from "../ai/chat";
import {
  buildCommandResultJudgementNote,
  buildUserIntentInstruction,
  getUserIntentProfile,
  isLikelyIncompleteAssistantReply,
  type UserIntentProfile,
} from "../policy";
import type {
  AiControlMode,
  ChatMessage,
  PendingAdminResume,
  ProjectMemoryState,
  ProjectPayload,
  ProviderConfig,
  TaskHistory,
  TerminalTask,
} from "../vite-env";
import {
  COMMAND_LOOP_SAFETY_LIMIT,
  type CommandLoopState,
  createCommandLoopState,
  extractPowerShellCommandRequests,
  inspectCommandLoop,
} from "../terminal/commands";
import { formatActionableError } from "../app/errors";
import { getExecutionModeLabel, getExecutionModeStatus } from "../app/product";

type SelectedFile = { path: string; content: string } | null;
type PrivilegeState = { platform: string; isAdmin: boolean; canElevate: boolean; isDev: boolean } | null;
type CommandInspection = { requiresAdmin?: boolean; adminReason?: string; requiresConfirmation?: boolean; systemAction?: { label: string } };

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
  selectedFile: SelectedFile;
  activeProvider: ProviderConfig;
  memoryState: ProjectMemoryState | null;
  activeTaskSummary: string;
  runtimePermissionContext: RuntimePermissionContext;
  aiControlMode: AiControlMode;
  privilege: PrivilegeState;
  updateAiControlMode: (mode: AiControlMode) => Promise<boolean>;
  activeTerminalTask: TerminalTask | null;
  terminalTasks: TerminalTask[];
  setActiveTerminalTaskId: (taskId: string) => void;
  upsertTerminalTask: (task: TerminalTask) => void;
  showBottomPanel: () => void;
  activeTaskId: string | null;
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
  privilege,
  updateAiControlMode,
  activeTerminalTask,
  terminalTasks,
  setActiveTerminalTaskId,
  upsertTerminalTask,
  showBottomPanel,
  activeTaskId,
  prepareAdminCommandResume,
  clearPendingAdminResume,
  requestAdminForCommandIfNeeded,
  confirmSystemAction,
  saveCurrentTask,
  restartAsAdmin,
  syncProjectView,
}: UseAiAssistantOptions) {
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
      return formatProjectContext(context);
    } catch (error) {
      setStatus(formatActionableError(error, "读取项目上下文失败"));
      return "";
    }
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

    if (!window.novayxk) {
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
          content: `${buildSystemPrompt(memoryState?.memory ?? "", activeTaskSummary, runtimePermissionContext)}

【命令结果整理规则】
Novayxk 已经自动执行了你刚才通过 powershell-run 请求的命令。你现在必须基于命令输出直接回答用户原始问题。
- 不要再要求用户执行命令、复制输出或“把结果发我”。
- 先给明确结论，再给必要的简短解释。
- 如果命令失败，说明失败原因和下一步建议。
- 如果为了完成用户原始任务必须继续执行下一步命令，可以继续输出完整的 powershell-run 代码块；不要把要执行的命令写成普通文字，也不要声称尚未执行的命令已经开始。
- 如果你发现自己准备重复上一轮或前几轮已经执行过的命令，不要继续输出命令；请总结为什么卡住、已经尝试了什么、建议用户下一步怎么确认。
- 如果只是给建议或可选操作，不要再输出 powershell-run、fileops 或 diff 代码块。
${resultJudgementNote ? `\n\n【结果判定护栏】\n${resultJudgementNote}` : ""}`,
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
            setMessages([...nextMessages, { role: "assistant", content: normalizeAssistantToolCallContent(summaryContent) }]);
          },
        },
      );

      const finalSummaryContent = normalizeAssistantToolCallContent(summaryContent).trim();
      const finalMessages: ChatMessage[] = [
        ...nextMessages,
        {
          role: "assistant",
          content: finalSummaryContent || "命令已经执行完成，但模型没有返回总结。",
          elapsedMs: Date.now() - summaryStartedAt,
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

  async function recoverIncompleteAssistantReply(
    nextMessages: ChatMessage[],
    requestMessages: ChatMessage[],
    userIntent: UserIntentProfile,
    partialContent: string,
  ) {
    if (!window.novayxk) return partialContent;

    setStatus("模型上一条回复没说完，正在补全...");
    let recoveredContent = "";

    await window.novayxk.chatStream(
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
              `3. 不要只写“我来查一下：”“如下：”“先帮你看一下：”这类引子。\n` +
              `4. 如果是检查类任务，单次查询空输出只能说“这次未查到”，不要直接断言“不存在”或“没安装”。\n` +
              `5. 这轮任务类型是：${userIntent.kind === "inspect" ? "状态核实" : "代为操作"}。`,
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

    const normalizedRecoveredContent = normalizeAssistantToolCallContent(recoveredContent).trim();
    if (!normalizedRecoveredContent) {
      return partialContent;
    }

    if (isLikelyIncompleteAssistantReply(normalizedRecoveredContent, userIntent)) {
      return `${normalizedRecoveredContent}\n\n模型这次回复仍然不完整。请重试，或换一种更明确的说法让我继续。`;
    }

    return normalizedRecoveredContent;
  }

  async function sendMessage() {
    const trimmed = prompt.trim();
    if (!trimmed || isLoading) return;
    stopRequestedRef.current = false;

    const nextMessages: ChatMessage[] = [
      ...messages,
      {
        role: "user",
        content: trimmed,
      },
    ];
    if (await handleAdminPrivilegeRequest(trimmed, nextMessages)) return;
    if (await handleInternalControlModeRequest(trimmed, nextMessages)) return;

    const contextMode = getProjectContextMode(trimmed);
    const userIntent = getUserIntentProfile(trimmed);
    const projectContext = contextMode === "full" ? await buildProjectContextForPrompt(trimmed) : "";
    const selectedFileContext = contextMode === "full" && selectedFile
      ? `\n\n当前选中文件：${selectedFile.path}\n\`\`\`\n${selectedFile.content.slice(0, 12000)}\n\`\`\``
      : "";
    const runtimeContext = contextMode === "runtime" && project
      ? `\n\n运行上下文：当前项目根目录是 ${project.root}。如需执行命令，命令会在该目录运行。不要主动复述这个路径。`
      : "";

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
        {
          role: "system",
          content: buildUserIntentInstruction(userIntent),
        },
        ...buildModelChatHistory(nextMessages, `${selectedFileContext}${projectContext}${runtimeContext}`),
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
            setMessages([...nextMessages, { role: "assistant", content: normalizeAssistantToolCallContent(streamedContent) }]);
          },
        },
      );

      let completedContent = normalizeAssistantToolCallContent(streamedContent);
      if (isLikelyIncompleteAssistantReply(completedContent, userIntent)) {
        completedContent = await recoverIncompleteAssistantReply(nextMessages, requestMessages, userIntent, completedContent);
      }
      const completedMessages: ChatMessage[] = [
        ...nextMessages,
        {
          role: "assistant",
          content: completedContent,
          elapsedMs: Date.now() - responseStartedAt,
        },
      ];
      setMessages(completedMessages);
      const fileOpMessages = await executeAiFileOperations(completedContent, completedMessages);
      const commandResultMessages = userIntent.autoExecutePowerShell || extractPowerShellCommandRequests(completedContent).length > 0
        ? await executeAiPowerShellCommands(completedContent, fileOpMessages ?? completedMessages)
        : null;
      await saveCurrentTask(commandResultMessages ?? fileOpMessages ?? completedMessages);
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
        stopTerminalPromise,
      ] as const);
      const terminalResult = stopResults[1];
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
