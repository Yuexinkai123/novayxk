import type { AiControlMode, AssistantMode, ChatMessage, FileOperation, ProjectContext, TaskSummary, WebSearchRequest } from "../vite-env";
import { isBrowserAutomationAction, type BrowserAutomationAction } from "../browser/actions";
import { formatBytes } from "../project/tree";

export const STREAM_ABORT_MESSAGE = "The current generation was stopped by the user.";
export const STREAM_ABORT_PLACEHOLDER = "Generation stopped.";

export type RuntimePermissionContext = {
  controlMode: "safe" | "full";
  isAdmin: boolean;
  privilegeLabel: string;
};

export type AssistantModeProfile = {
  mode: AssistantMode;
  memoryLimit: number;
  taskSummaryLimit: number;
  selectedFileLimit: number;
  historyLimitWithContext?: number;
  historyLimitWithoutContext: number;
  continuationHistoryLimit: number;
  commandSummaryHistoryLimit: number;
  projectFileListLimit: number;
  projectRelatedFileLimit?: number;
  projectRelatedContentLimit: number;
};

const ASSISTANT_MODE_PROFILES: Record<AssistantMode, AssistantModeProfile> = {
  low: {
    mode: "low",
    memoryLimit: 2200,
    taskSummaryLimit: 1200,
    selectedFileLimit: 7000,
    historyLimitWithContext: 6,
    historyLimitWithoutContext: 5,
    continuationHistoryLimit: 6,
    commandSummaryHistoryLimit: 10,
    projectFileListLimit: 90,
    projectRelatedFileLimit: 4,
    projectRelatedContentLimit: 5000,
  },
  standard: {
    mode: "standard",
    memoryLimit: 6000,
    taskSummaryLimit: 3000,
    selectedFileLimit: 12000,
    historyLimitWithoutContext: 6,
    continuationHistoryLimit: 8,
    commandSummaryHistoryLimit: 20,
    projectFileListLimit: 180,
    projectRelatedContentLimit: 8000,
  },
  deep: {
    mode: "deep",
    memoryLimit: 10000,
    taskSummaryLimit: 5000,
    selectedFileLimit: 20000,
    historyLimitWithoutContext: 14,
    continuationHistoryLimit: 12,
    commandSummaryHistoryLimit: 30,
    projectFileListLimit: 260,
    projectRelatedFileLimit: 8,
    projectRelatedContentLimit: 12000,
  },
};

export function normalizeAssistantMode(value: unknown): AssistantMode {
  if (value === "low" || value === "deep") return value;
  return "standard";
}

export function getAssistantModeProfile(mode: AssistantMode = "standard") {
  return ASSISTANT_MODE_PROFILES[normalizeAssistantMode(mode)];
}

function getAssistantModeSystemInstruction(mode: AssistantMode) {
  if (mode === "low") {
    return "Current assistant mode: Ultra-light. Lower token usage does not mean lower quality; the goal is still to solve the problem. Use as little context and as few words as possible, lead with the answer, and keep only the necessary steps. If context is insufficient, fill the single most important gap with the cheapest useful check or ask the user one key question. Do not become vague, guess, or give up just because this mode saves tokens. Unless the user explicitly asks for it or the task truly requires it, avoid background explanation, long option lists, long-form reasoning, or extra checks. After files, commands, browser actions, or image actions, do only the lowest-cost verification by default.";
  }
  if (mode === "deep") {
    return "Current assistant mode: Deep. You may keep more context, which is suitable for complex debugging, refactors, and multi-step tasks. Explain the key evidence, risks, and verification results, but still avoid irrelevant padding. After files, commands, browser actions, or image actions, complete the full verification chain.";
  }
  return "Current assistant mode: Standard. Balance context, speed, and completeness while still fully solving the user's problem. Answers should be concrete and actionable, with moderate explanation. When context is missing, fill the most relevant gap first, then give the conclusion. After files, commands, browser actions, or image actions, verify the key result.";
}

export function buildSystemPrompt(
  projectMemory: string,
  taskSummary: string,
  runtimePermission: RuntimePermissionContext,
  assistantMode: AssistantMode = "standard",
) {
  const profile = getAssistantModeProfile(assistantMode);
  const normalizedAssistantMode = profile.mode;
  const memoryBlock = projectMemory.trim()
    ? `\n\n[Project long-term memory]\n${projectMemory.trim().slice(0, profile.memoryLimit)}`
    : "";
  const taskBlock = taskSummary.trim() ? `\n\n[Current task summary]\n${taskSummary.trim().slice(0, profile.taskSummaryLimit)}` : "";
  const windowsPrivilegeBlock = runtimePermission.isAdmin
    ? "Current Novayxk Windows process privilege: administrator. You may tell the user clearly that the app is already running with administrator privileges."
    : `Current Novayxk Windows process privilege: ${runtimePermission.privilegeLabel}. When the user asks to switch "administrator mode", "system permission", or "administrator privilege", that usually refers to the Administrator Mode button in Settings: Novayxk can request Windows UAC approval and restart with administrator privileges. Do not answer as if the user must manually right-click and reopen the app. Do not confuse Windows process privilege with Novayxk's internal execution scope.`;
  const controlModeBlock =
    runtimePermission.controlMode === "full"
      ? "Current Novayxk internal AI execution scope: system-level execution. The user allows you to request PowerShell commands through ```powershell-run``` blocks, including software installation, system setting changes, and other high-risk commands. Still explain the purpose first and avoid meaningless damage."
      : "Current Novayxk internal AI execution scope: project-level execution. Only interpret requests like \"system-level execution\", \"AI execution scope\", or \"internal execution mode\" as execution-scope switches. If the user only says \"administrator mode\", interpret that first as a Windows UAC administrator-privilege request. You may request common project-directory development commands through ```powershell-run``` blocks, such as npm run build, npm test, dir, Get-ChildItem, and git status. Do not place high-risk commands such as delete, reset, format, system-setting changes, or download-and-execute scripts into automatic execution blocks.";
  const logBlock =
    '\nNovayxk\'s own logs are stored in %USERPROFILE%\\.novayxk\\logs\\, including app.log, error.log, ai.log, and behavior.log. behavior.log is a temporary full behavior log and records more detailed IPC, model streaming, command, terminal, and user-intervention behavior. When the user asks about Novayxk\'s own errors, logs, or why a command did not execute, you may use read-only powershell-run commands to inspect the tail of these logs, such as Get-Content "$env:USERPROFILE\\.novayxk\\logs\\error.log" -Tail 120 or Get-Content "$env:USERPROFILE\\.novayxk\\logs\\behavior.log" -Tail 200.';
  const imageBlock =
    "\nGenerated image attachments from the conversation are stored in %USERPROFILE%\\.novayxk\\generated-images\\. If the user asks to save a recently generated image into the current project directory, do not claim that Novayxk lacks the ability to write files to disk.";
  const shellBlock = `\n\n${windowsPrivilegeBlock}\n${controlModeBlock}${logBlock}${imageBlock}`;
  if (normalizedAssistantMode === "low") {
    const compactBehaviorBlock = `${getAssistantModeSystemInstruction(normalizedAssistantMode)}

You are Novayxk, a cautious but natural local-execution and project-collaboration assistant. Do not describe yourself as only being able to write code; if a task can be advanced through local commands, fileops, browser-actions, built-in web-search, or Windows UAC within the safety boundary, then advance it.

For knowledge questions, greetings, and simple Q&A, answer briefly and directly without proactively calling tools. Only output automatic execution blocks when the user explicitly asks you to inspect the local machine, verify something online, install or uninstall software, run commands, edit files, or operate webpages.

Ultra-light mode reduces redundant context and long wording, not your actual problem-solving ability. For complex tasks, prefer the smallest viable step that moves the task forward. If more context is necessary to avoid a bad edit or a bad judgment, explicitly gather the single most important missing context instead of giving an unreliable answer.

For complex tasks, you may first give a minimal 2-to-4-step plan, but immediately continue with execution, summary, or conclusion after the plan. Do not stop at the plan, a preface, or "let me take a look first."

When the user asks you to inspect, organize, or summarize the current project, and the context already includes a project summary, file list, or related file content, give the project summary directly. Do not reply only with preparatory lines such as "let me look first" or "I will summarize later."

Prefer strict JSON \`\`\`fileops\`\`\` for file creation or modification, strict JSON \`\`\`browser-actions\`\`\` for browser operations, strict JSON \`\`\`web-search\`\`\` for built-in online search, and place PowerShell commands only inside standalone \`\`\`powershell-run\`\`\` blocks. Do not ask the user to copy and run commands manually. After outputting these blocks, wait for Novayxk to return the actual result before summarizing. After a powershell-run block, do not append invented "results", "execution output", "conclusions", "installed", "version", or "path" claims in the same reply, because the command has not really run yet.

Avoid leaking sensitive credentials. Do not fill passwords, verification codes, payments, or external authorization steps on the user's behalf. Explain the purpose carefully before high-risk, destructive, system-setting, or protected-directory actions.`;
    return `${compactBehaviorBlock}${shellBlock}${memoryBlock}${taskBlock}`;
  }

  const behaviorBlock = `${getAssistantModeSystemInstruction(normalizedAssistantMode)}

You are Novayxk, a cautious but natural general-purpose local-execution and project-collaboration assistant. You are not only a coding assistant: you can help users with code projects, the Windows environment, software installation and removal, application configuration, file handling, online fact-checking, command execution, and ordinary computer tasks. Your answers should be concrete and actionable, while still sounding like a normal conversation that matches the user's tone and immediate need.

Do not refuse a task just because it is not programming. Do not say things like "I am only a coding assistant", "I cannot search online", or "I cannot install software" when those statements conflict with Novayxk's real capabilities. If a task can be completed through fileops, built-in web-search, powershell-run, browser-actions, Windows UAC approval, or safe local commands, proactively move it forward. If there is a real limitation, explain the exact limitation and the workable alternative.

When the user asks you to research information, inspect webpages, verify news, or judge whether something is true, prefer the built-in \`\`\`web-search\`\`\` tool first instead of ad hoc PowerShell web scraping. A valid block looks like {"query":"OpenAI GPT-5.4","domains":["openai.com","developers.openai.com"],"maxResults":5,"includePageContent":true,"includePageContentCount":2}. Use powershell-run for online access only as a fallback when the task truly requires a local command or a site-specific request that web-search cannot cover. Prefer official notices, school or institution announcements, authoritative media, or multiple independent reliable sources. If you only find forums, short videos, marketing accounts, blocked pages, guessed URLs, or scattered discussion, say that no reliable source has confirmed it yet rather than treating rumor as fact. In your summary, distinguish confirmed facts, unconfirmed claims, and inferences, and provide source names and URLs when possible.

When the user asks to install, uninstall, or upgrade software, prefer winget, choco, scoop, msiexec, or built-in Windows tools. Search candidate packages first, for example with winget search, and install or uninstall only after confirming the package ID, for example with winget install --id ... --accept-package-agreements --accept-source-agreements. If administrator privileges are required, Novayxk can request Windows UAC approval; do not default to telling the user to visit the official website and install manually unless the package manager has no usable result or the official site is the only reasonable source. If download or install attempts keep failing, do not repeat the same class of command endlessly. Instead, find the official download page, a web download page, or the Microsoft Store web URL, then use powershell-run with Start-Process "https://..." to open it directly and explain based on the real result whether it opened.

For concept, definition, principle, comparison, and usage questions, answer directly first. Do not proactively emit powershell-run, fileops, browser-actions, web-search, or any other auto-executed content just to be helpful. Only output these automatic execution blocks when the user explicitly asks you to install, run, execute, open, search, inspect, check local-machine state, verify online, or act on their behalf.

When the user is only greeting you, making small talk, checking whether you are online, or sending a very short casual message, respond briefly and naturally. Do not proactively introduce the project, repeat the file list, or list features. Only use file lists and related file context when the user explicitly asks you to analyze the project, inspect files, modify code, explain project content, or ask about the project's state. If the user only asks about versions, the environment, terminal commands, or runtime state, do not introduce project files; if a command is needed, simply request the command execution. Hidden context exists to help your judgment and should not be proactively repeated as project paths, file lists, or "I can see your project."

When the user asks you to inspect, organize, or summarize the current project, and the context already includes a project summary, file list, or relevant file content, provide the project summary directly rather than replying only with preparatory filler.

When the user asks you to create pages, components, scripts, styles, or other new files, prefer returning one or more \`\`\`fileops JSON\`\`\` blocks directly, because Novayxk can execute project-local file operations automatically. fileops uses objects such as {"type":"mkdir","path":"relative/dir"}, {"type":"write","path":"relative/file","content":"...","overwrite":false}, {"type":"replace","path":"relative/file","search":"old","replace":"new","occurrence":"first"}, and {"type":"delete","path":"relative/path"}. When the user explicitly wants to create, fully overwrite, delete a file, or delete a directory, prefer fileops over prose. When generating a full frontend app, backend system, or large page, do not cram all HTML/CSS/JS into one enormous single-file string; split it into multiple project files or multiple fileops blocks such as package.json, src/main.js, src/App.vue, and src/styles.css, and try to keep each write under about 12000 characters. For small local changes to existing files, prefer precise fileops replace operations rather than PowerShell Set-Content or full-file overwrite. Only set overwrite:true on fileops write when the user explicitly wants to overwrite the existing file.

When the task involves automatic actions on the current embedded browser page, use a standalone \`\`\`browser-actions JSON\`\`\` block. The format may include [{"type":"navigate","url":"https://example.com"},{"type":"click","selector":"button[type=submit]"},{"type":"type","selector":"input[name=email]","text":"user@example.com"},{"type":"waitFor","selector":".result","timeoutMs":5000},{"type":"pressKey","key":"Enter","selector":"input[name=q]"},{"type":"scrollTo","selector":"#result"},{"type":"select","selector":"select[name=city]","value":"shanghai"},{"type":"extractText","selector":".result-title","multiple":true},{"type":"runScript","script":"document.title"}]. Output strict JSON only, with no comments and no explanatory prose inside the code block. Prefer stable CSS selectors, and use runScript only when truly necessary for page-internal logic. If the page has several broad buttons like Continue or Sign in, avoid selectors like button:has-text("Continue") when a more stable selector exists; prefer button[type=submit], data-testid, name, id, or a selector tied closely to the relevant field. When the next step involves passwords, verification codes, second-factor checks, payment, or external authorization, do not fill the sensitive content yourself and instruct the user to complete that part manually in the browser.

When the task involves online search outside the current embedded browser page, use a standalone \`\`\`web-search JSON\`\`\` block. The format may include {"query":"latest GPT-5.4 release","domains":["openai.com","developers.openai.com"],"maxResults":5,"includePageContent":true,"includePageContentCount":2}. Output strict JSON only, with no comments and no explanatory prose inside the code block. Prefer one well-targeted search at a time. Add domains when official confirmation matters. Use includePageContent when the answer depends on what the source page actually says rather than only the result title or snippet.

Browser traces may only be used to analyze the user's own page flow and API shape. When the user explicitly asks for login, check-in, or automation scripts, you may write code that calls login endpoints, reads response fields, reads session cookies that belong to the script's own requests, and sets headers for follow-up API requests. If file changes are needed, prefer fileops instead of telling the user to edit manually. Do not proactively steal or exfiltrate third-party credentials the user did not ask you to handle, and do not describe unwritten changes as already written. Only say that something was blocked by a safety policy when the execution result explicitly says blocked, stopped automatic execution, high risk, or similar. Ordinary Python errors such as KeyError, missing fields, timeouts, 401, or 404 must not be misattributed to fileops blocking.

When the context contains a "Browser API evidence pack", treat it as the highest-priority evidence for generating site scripts. Follow the real request order, method, URL, header names, request body, and response fields from the evidence pack. Do not let older chat guesses about token, session, or access_token override the captured evidence. If the evidence pack lacks a critical login or check-in request, first use browser-actions to open the page, click the user-specified button, or inspect page state further rather than inventing API fields. After generating the script, validate it through powershell-run, and if it fails, repair it according to the real output rather than claiming it might have been blocked by safety policy unless the output explicitly says so.

When PowerShell commands are needed, you must return a complete standalone \`\`\`powershell-run\`\`\` block, and each block should contain only one command or one closely related group of commands. Project-related commands run in the current project root. System tasks such as software installation, system queries, opening webpages or stores, online research fallbacks, and Novayxk log inspection run from the user's home directory and may be attempted even when no project is open. Do not output XML-style tool-call formats such as <tool_call>, <function=shell>, or <parameter=command>; Novayxk does not use that protocol. Do not place commands in plain prose, inline code, or generic \`\`\`text\`\`\` blocks. After you output powershell-run, fileops, browser-actions, or web-search, Novayxk will execute them automatically and hand the result back to you for summarization, so do not ask the user to run commands manually, copy outputs, or send the result back. Also do not say "installation started", "wait for the result", or invent checks, execution outputs, conclusions, installed states, versions, or paths before the real execution result exists. fileops paths must stay relative to the current project. PowerShell commands run in the current project root by default, but when the user explicitly asks for system, software, web, or log tasks, those commands may access the required outside-project paths, network URLs, or Novayxk's own logs. Do not ask the user to reveal secrets.`;
  return `${behaviorBlock}${shellBlock}${memoryBlock}${taskBlock}`;
}

export function summarizeTaskForUi(messages: ChatMessage[]) {
  const userMessages = messages
    .filter((message) => message.role === "user")
    .slice(-6)
    .map((message) => stripInjectedContext(message.content).trim())
    .filter(Boolean);
  return userMessages.length ? `Recent task focus: ${userMessages.join("; ").slice(0, 1200)}` : "";
}

export function formatTaskLabel(task: TaskSummary) {
  const date = task.updatedAt ? new Date(task.updatedAt).toLocaleDateString() : "";
  return date ? `${task.title} · ${date}` : task.title;
}

export type ProjectContextMode = "none" | "runtime" | "full";

export function detectAdminPrivilegeRequest(prompt: string) {
  const normalized = prompt.trim().replace(/\s+/g, "").toLowerCase();
  if (!normalized) return false;
  if (/(?:已经|已|刚刚|刚才|目前|当前|现在).{0,10}(?:打开了|开启了|切到了|进入了|处于|在).{0,12}(?:管理员模式|管理员权限|高级权限|windows管理员|uac|以管理员身份运行)/i.test(normalized)) {
    return false;
  }
  if (/(?:现在|当前|已经).{0,12}(?:可以|能).{0,12}(?:做什么|干什么|怎么用|用你)/i.test(normalized)) {
    return false;
  }
  if (!/(?:切换|换成|改成|设置为|设为|打开|开启|启用|进入|调到|变成|请求|申请|授权|提权|帮我|帮忙)/i.test(normalized)) {
    return false;
  }
  if (/(?:完全控制|ai控制模式|内部控制模式|powershell控制模式|默认权限|安全模式|safe|full|项目内执行|系统级执行|执行范围)/i.test(normalized)) {
    return false;
  }
  return /(?:管理员模式|管理员权限|高级权限|windows管理员|uac|以管理员身份运行|提权)/i.test(normalized);
}

export function detectInternalControlModeRequest(prompt: string): AiControlMode | null {
  const normalized = prompt.trim().replace(/\s+/g, "").toLowerCase();
  if (!normalized) return null;
  if (/(?:windows|uac|系统管理员|以管理员身份运行|提权|受保护目录|注册表|管理员模式|管理员权限)/i.test(normalized)) return null;
  if (!/(?:切换|换成|改成|设置为|设为|打开|开启|启用|进入|调到|变成|关闭|关掉|退出|恢复)/i.test(normalized)) {
    return null;
  }
  if (!/(?:软件内部|内部|novayxk|ai|控制模式|权限模式|默认权限|完全控制|高风险|危险命令|项目内执行|系统级执行|执行范围)/i.test(normalized)) {
    return null;
  }
  if (/(?:默认权限|普通权限|安全模式|普通模式|safe|关闭完全控制|关掉完全控制|退出完全控制|恢复默认|项目内执行|只在项目内执行)/i.test(normalized)) {
    return "safe";
  }
  if (/(?:完全控制|full|高风险|危险命令|系统级执行|允许系统级操作)/i.test(normalized)) {
    return "full";
  }
  return null;
}

export function detectAssistantModeRequest(prompt: string): AssistantMode | null {
  const normalized = prompt.trim().replace(/\s+/g, "").toLowerCase();
  if (!normalized) return null;
  if (!/(?:切换|切到|换成|改成|改为|设置为|设为|打开|开启|启用|进入|调到|变成|使用|用)/i.test(normalized)) {
    return null;
  }
  if (
    !/(?:助手模式|ai模式|token模式|低token|省token|极省|低消耗|低消耗模式|标准模式|默认模式|普通模式|深度模式|深度协作|low|standard|normal|deep)/i.test(
      normalized,
    )
  ) {
    return null;
  }
  if (/(?:极省|低token|省token|低消耗|节省token|low)/i.test(normalized)) return "low";
  if (/(?:深度|深度协作|仔细模式|复杂模式|deep)/i.test(normalized)) return "deep";
  if (/(?:标准|默认|普通|standard|normal)/i.test(normalized)) return "standard";
  return null;
}

export function getProjectContextMode(prompt: string): ProjectContextMode {
  const normalized = prompt.trim().toLowerCase();
  if (!normalized) return "none";
  if (/^(?:你?好|您好|哈喽|嗨|在吗|在不在|hi|hello|hey|yo|nihao|你好呀|早上好|下午好|晚上好)[!.。！？，,\s]*$/i.test(normalized)) {
    return "none";
  }
  if (/^(?:谢谢|谢了|thanks|thank you|ok|okay|好的|好|嗯|哦|收到|明白)[!.。！？，,\s]*$/i.test(normalized)) {
    return "none";
  }
  if (/(?:分析|梳理|查看|读取|打开|修改|改|创建|新建|删除|重构|优化|解释|排查|修复|生成|写|覆盖|美化|样式|页面|组件|代码|文件|目录|项目结构|项目情况|html|css|jsx?|tsx?|vue|json|md|toml|login|register|hospital)/i.test(normalized)) {
    return "full";
  }
  if (/(?:node|npm|pnpm|yarn|git|版本|命令|终端|运行|执行|测试|build|test|install|dev|start|serve|报错|错误|日志|环境|依赖)/i.test(normalized)) {
    return "runtime";
  }
  if (normalized.length <= 12) return "none";
  return "runtime";
}

export function buildModelChatHistory(
  messages: ChatMessage[],
  latestContext: string,
  assistantMode: AssistantMode = "standard",
) {
  const profile = getAssistantModeProfile(assistantMode);
  const cleanMessages = sanitizeChatHistory(messages).map((message) => ({
    role: message.role,
    content: message.content,
  }));
  if (/(?:浏览器 API 证据包|Browser API evidence pack)/i.test(latestContext)) {
    const lastUserMessage = cleanMessages.filter((message) => message.role === "user").at(-1);
    return lastUserMessage
      ? [{ ...lastUserMessage, content: `${stripInjectedContext(lastUserMessage.content)}${latestContext}` }]
      : [];
  }
  const hasLatestContext = latestContext.trim().length > 0;
  const historyLimit = hasLatestContext ? profile.historyLimitWithContext : profile.historyLimitWithoutContext;
  const scopedMessages = typeof historyLimit === "number" ? cleanMessages.slice(-historyLimit) : cleanMessages;
  if (!hasLatestContext && scopedMessages.length > 0) {
    return scopedMessages.filter((message) => !looksLikeProjectContextReply(message.content));
  }
  if (!hasLatestContext || scopedMessages.length === 0) return scopedMessages;
  const lastIndex = scopedMessages.length - 1;
  return scopedMessages.map((message, index) => {
    if (index !== lastIndex || message.role !== "user") return message;
    return {
      ...message,
      content: `${stripInjectedContext(message.content)}${latestContext}`,
    };
  });
}

export function looksLikeProjectContextReply(content: string) {
  return /项目上下文摘要|文件清单|我看到你的项目|你的项目目录|目前有\s*\d+\s*个|Project context summary|File list|I can see your project|Current browser workspace context|Browser API evidence pack|hospital\.html|login\.html|register\.html/i.test(content);
}

export function stripContext(content: string) {
  return stripInjectedContext(content);
}

export function stripInjectedContext(content: string) {
  const markers = [
    "\n\n当前选中文件：",
    "\n\n项目上下文摘要：",
    "\n\n运行上下文：",
    "\n\nCurrent selected file:",
    "\n\nProject context summary:",
    "\n\nRuntime context:",
  ];
  const indexes = markers
    .map((marker) => content.indexOf(marker))
    .filter((index) => index > -1);
  return indexes.length ? content.slice(0, Math.min(...indexes)) : content;
}

export function sanitizeChatHistory(messages: ChatMessage[]) {
  return messages
    .filter((message) => !isAbortPlaceholderMessage(message))
    .map((message) => {
      const attachments = sanitizeChatAttachments(message.attachments);
      const elapsedMs = message.elapsedMs;
      const tokenUsage = sanitizeTokenUsage(message.tokenUsage);
      const normalized = {
        role: message.role,
        content: message.role === "user"
          ? stripInjectedContext(message.content).trim()
          : String(message.content ?? ""),
        ...(typeof elapsedMs === "number" && Number.isFinite(elapsedMs) && elapsedMs >= 0 ? { elapsedMs } : {}),
        ...(tokenUsage ? { tokenUsage } : {}),
      };
      return attachments.length ? { ...normalized, attachments } : normalized;
    });
}

function sanitizeTokenUsage(usage: ChatMessage["tokenUsage"]) {
  if (!usage || typeof usage !== "object") return null;
  const promptTokens = Math.max(0, Math.round(Number(usage.promptTokens)));
  const completionTokens = Math.max(0, Math.round(Number(usage.completionTokens)));
  const totalTokens = Math.max(promptTokens + completionTokens, Math.round(Number(usage.totalTokens)));
  if (!Number.isFinite(promptTokens) || !Number.isFinite(completionTokens) || !Number.isFinite(totalTokens)) return null;
  return {
    promptTokens,
    completionTokens,
    totalTokens,
    estimated: usage.estimated !== false,
  };
}

function sanitizeChatAttachments(attachments: ChatMessage["attachments"]) {
  if (!Array.isArray(attachments)) return [];
  return attachments
    .filter((attachment) => attachment?.type === "image" && attachment.url && attachment.path)
    .slice(0, 8)
    .map((attachment) => ({
      type: "image" as const,
      path: String(attachment.path).slice(0, 2000),
      url: String(attachment.url).slice(0, 2000),
      mimeType: String(attachment.mimeType || "image/png").slice(0, 120),
      ...(attachment.prompt ? { prompt: String(attachment.prompt).slice(0, 4000) } : {}),
      ...(attachment.revisedPrompt ? { revisedPrompt: String(attachment.revisedPrompt).slice(0, 4000) } : {}),
      ...(attachment.createdAt ? { createdAt: String(attachment.createdAt).slice(0, 80) } : {}),
    }));
}

export function isAbortPlaceholderMessage(message: ChatMessage) {
  return (
    message.role === "assistant" &&
    /^(?:Generation stopped\.|已停止生成。)$/.test(message.content.trim())
  );
}

export function normalizeAssistantToolCallContent(content: string) {
  if (!/<tool_call\b|<function=|<tool_result\b/i.test(content)) return content;

  const toolCalls = [...content.matchAll(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi)];
  const convertedBlocks = toolCalls
    .map((match) => convertToolCallBlock(match[1] ?? ""))
    .filter(Boolean);

  if (convertedBlocks.length) {
    const leadText = stripToolProtocolText(content.slice(0, toolCalls[0]?.index ?? 0));
    return [leadText, ...convertedBlocks].filter(Boolean).join("\n\n").trim();
  }

  let normalized = content.replace(
    /<tool_call>\s*<function=([a-z0-9_-]+)>\s*<parameter=command>([\s\S]*?)<\/parameter>\s*<\/function>\s*<\/tool_call>/gi,
    (_full, functionName: string, rawCommand: string) => {
      const command = decodeToolCallText(rawCommand).trim();
      if (!command) return "";
      if (/^(?:shell|powershell|pwsh|cmd|terminal|bash|powershell-run|ps-run|shell-run)$/i.test(functionName)) {
        return `\`\`\`powershell-run\n${command}\n\`\`\``;
      }
      return "";
    },
  );

  normalized = normalized.replace(/<tool_result>[\s\S]*?<\/tool_result>/gi, "");
  normalized = normalized.replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "");
  normalized = normalized.replace(/<tool_call\b[\s\S]*$/i, "Preparing the command request...");
  normalized = normalized.replace(/<function=[\s\S]*$/i, "Preparing the command request...");
  return normalized.trim();
}

export function stripPrematurePowerShellResultText(content: string) {
  const blockPattern = /```(?:powershell-run|ps-run|shell-run|web-search)\n[\s\S]*?```/gi;
  let lastMatch: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  while ((match = blockPattern.exec(content))) {
    lastMatch = match;
  }
  if (!lastMatch) return content;

  const trailingStart = (lastMatch.index ?? 0) + lastMatch[0].length;
  const trailing = content.slice(trailingStart).trim();
  if (!trailing) return content;
  if (/^```/.test(trailing)) return content;

  const looksLikePrematureResult =
    /(?:检查结果|执行结果|命令结果|结果如下|结论|已安装|未安装|没有安装|找到了|没找到|版本[:：]|路径[:：]|退出码[:：]|成功|失败|完成|可以直接用|execution output|result|conclusion|installed|not installed|version[:：]|path[:：]|exit code[:：]|success|failed|completed|✅|❌)/i.test(
      trailing,
    );
  if (!looksLikePrematureResult) return content;

  return content.slice(0, trailingStart).trim();
}

export function decodeToolCallText(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function convertToolCallBlock(rawBlock: string) {
  const decoded = decodeToolCallText(rawBlock).trim();
  if (!decoded) return "";

  const legacyMatch = decoded.match(
    /^<function=([a-z0-9_-]+)>\s*<parameter=command>([\s\S]*?)<\/parameter>\s*<\/function>$/i,
  );
  if (legacyMatch) {
    const command = legacyMatch[2]?.trim();
    if (command && /^(?:shell|powershell|pwsh|cmd|terminal|bash|powershell-run|ps-run|shell-run)$/i.test(legacyMatch[1])) {
      return `\`\`\`powershell-run\n${command}\n\`\`\``;
    }
    return "";
  }

  try {
    const parsed = JSON.parse(decoded);
    const functionName = typeof parsed?.name === "string"
      ? parsed.name
      : typeof parsed?.function === "string"
        ? parsed.function
        : typeof parsed?.tool === "string"
          ? parsed.tool
          : "";
    const args = parsed?.arguments ?? parsed?.parameters ?? parsed?.args ?? parsed?.input ?? null;
    const command = typeof args === "string"
      ? args
      : typeof args?.command === "string"
        ? args.command
        : typeof args?.script === "string"
          ? args.script
          : "";

    if (command.trim() && /^(?:shell|powershell|pwsh|cmd|terminal|bash|powershell-run|ps-run|shell-run)$/i.test(functionName)) {
      return `\`\`\`powershell-run\n${command.trim()}\n\`\`\``;
    }

    const query = typeof args?.query === "string" ? args.query.trim() : "";
    if (query && /^(?:web[-_ ]?search|search[-_ ]?web|online[-_ ]?search|browser[-_ ]?search)$/i.test(functionName)) {
      const request = normalizeWebSearchRequest({
        query,
        domains: Array.isArray(args?.domains) ? args.domains : undefined,
        maxResults: args?.maxResults,
        includePageContent: args?.includePageContent,
        includePageContentCount: args?.includePageContentCount,
      });
      if (request) {
        return `\`\`\`web-search\n${JSON.stringify(request, null, 2)}\n\`\`\``;
      }
    }
  } catch {
    return "";
  }

  return "";
}

function stripToolProtocolText(value: string) {
  return decodeToolCallText(
    value
      .replace(/<tool_result>[\s\S]*?<\/tool_result>/gi, "")
      .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "")
      .replace(/<tool_call\b[\s\S]*$/gi, ""),
  ).trim();
}

export function extractPatch(content: string) {
  const diffBlock = content.match(/```(?:diff|patch)\n([\s\S]*?)```/i);
  if (diffBlock?.[1]) return diffBlock[1].trim();
  const genericBlock = content.match(/```\n([\s\S]*?(?:^\+|^-)[\s\S]*?)```/m);
  return genericBlock?.[1]?.trim() ?? "";
}

export function extractPatchFiles(patchText: string) {
  const files = new Set<string>();
  for (const line of patchText.split(/\r?\n/)) {
    if (line.startsWith("+++ ")) {
      const file = line.slice(4).trim().split(/\s+/)[0].replace(/^"|"$/g, "");
      if (file && file !== "/dev/null") files.add(file.replace(/^[ab]\//, ""));
    }
  }
  return [...files];
}

export function extractPowerShellCommands(content: string) {
  const commands: string[] = [];
  const pattern = /```(?:powershell-run|ps-run|shell-run)\n([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content))) {
    if (match[1]?.trim()) commands.push(match[1].trim());
  }
  return commands;
}

const FILE_OP_TYPE_PATTERN = /"type"\s*:\s*"(?:mkdir|write|replace|delete)"/i;
const FILE_OP_PATH_PATTERN = /"path"\s*:\s*"/i;

export function extractFileOps(content: string): FileOperation[] {
  const blocks = [...content.matchAll(/```(?:fileops|json)\n([\s\S]*?)```/gi)];
  const fencedOperations = blocks.flatMap((block) => {
    if (!isLikelyFileOpsBlock(block[0], block[1])) return [];
    return parseFileOpsCandidate(block[1]);
  });
  if (fencedOperations.length) return fencedOperations;

  return collectBareFileOpsCandidates(content).flatMap((candidate) => parseFileOpsCandidate(candidate));
}

export function extractBrowserActions(content: string): BrowserAutomationAction[] {
  const blocks = [...content.matchAll(/```(?:browser-actions|json)\n([\s\S]*?)```/gi)];
  if (!blocks.length) return [];

  return blocks.flatMap((block) => {
    if (!isLikelyBrowserActionsBlock(block[0], block[1])) return [];
    try {
      const parsed = JSON.parse(block[1]);
      return normalizeBrowserActionsPayload(parsed);
    } catch {
      return [];
    }
  });
}

export function extractWebSearchRequests(content: string): WebSearchRequest[] {
  const blocks = [...content.matchAll(/```(?:web-search|json)\n([\s\S]*?)```/gi)];
  if (!blocks.length) return [];

  return blocks.flatMap((block) => {
    if (!isLikelyWebSearchBlock(block[0], block[1])) return [];
    try {
      const parsed = JSON.parse(block[1]);
      return normalizeWebSearchPayload(parsed);
    } catch {
      return [];
    }
  });
}

export function getBrowserActionsParseIssue(content: string) {
  const hasOpenFence =
    /```browser-actions\n/i.test(content) ||
    /```json\n[\s\S]*?"(?:type|action)"\s*:\s*"(?:navigate|click|type|waitFor|pressKey|scrollTo|select|extractText|runScript)"/i.test(content);
  if (!hasOpenFence) return "";

  const closedBlocks = [...content.matchAll(/```(?:browser-actions|json)\n([\s\S]*?)```/gi)].filter((block) =>
    isLikelyBrowserActionsBlock(block[0], block[1]),
  );
  if (!closedBlocks.length) return "The code block was not closed properly, which usually means the output stopped halfway.";

  const hadActionLikeBlock = closedBlocks.some((block) =>
    /"(?:type|action)"\s*:\s*"(?:navigate|click|type|waitFor|pressKey|scrollTo|select|extractText|runScript)"/i.test(block[1]),
  );
  if (!hadActionLikeBlock) return "";

  const parsedActions = extractBrowserActions(content);
  if (!parsedActions.length) return "The code block exists, but the JSON is not a valid browser-actions payload.";
  return "";
}

export function getWebSearchParseIssue(content: string) {
  const hasOpenFence =
    /```web-search\n/i.test(content) ||
    /```json\n[\s\S]*?"query"\s*:\s*"/i.test(content);
  if (!hasOpenFence) return "";

  const closedBlocks = [...content.matchAll(/```(?:web-search|json)\n([\s\S]*?)```/gi)].filter((block) =>
    isLikelyWebSearchBlock(block[0], block[1]),
  );
  if (!closedBlocks.length) return "The code block was not closed properly, which usually means the output stopped halfway.";

  const parsedRequests = extractWebSearchRequests(content);
  if (!parsedRequests.length) return "The code block exists, but the JSON is not a valid web-search payload.";
  return "";
}

export function hasDestructiveFileOps(operations: FileOperation[]) {
  return operations.some((operation) => operation.type === "delete");
}

export function getFileOpsParseIssue(content: string) {
  const hasOpenFileOpsFence = /```fileops\n/i.test(content);
  const hasOpenJsonFileOpsFence = /```json\n[\s\S]*?"type"\s*:\s*"(?:mkdir|write|replace|delete)"/i.test(content);
  const looksLikeBareFileOps = looksLikeFileOpsJson(content);
  if (!hasOpenFileOpsFence && !hasOpenJsonFileOpsFence && !looksLikeBareFileOps) return "";

  const closedBlocks = [...content.matchAll(/```(?:fileops|json)\n([\s\S]*?)```/gi)].filter((block) =>
    isLikelyFileOpsBlock(block[0], block[1]),
  );
  const bareCandidates = collectBareFileOpsCandidates(content);
  if (!closedBlocks.length && !bareCandidates.length) {
    return hasOpenFileOpsFence || hasOpenJsonFileOpsFence
      ? "The code block was not closed properly, which usually means the output stopped halfway."
      : "Detected what looks like bare JSON fileops, but the structure is incomplete, which usually means the output stopped halfway.";
  }

  const hadFileOpsLikeBlock = closedBlocks.some((block) => FILE_OP_TYPE_PATTERN.test(block[1])) || bareCandidates.length > 0;
  if (!hadFileOpsLikeBlock) return "";

  const parsedOperations = extractFileOps(content);
  if (!parsedOperations.length) {
    return hasOpenFileOpsFence || hasOpenJsonFileOpsFence
      ? "The code block exists, but the JSON is not a valid fileops payload."
      : "Detected what looks like bare JSON fileops, but the JSON is not a valid fileops payload.";
  }
  return "";
}

function isAbsoluteLikePath(value: string) {
  return /^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(value.trim());
}

export function getAutomationRecoveryIssue(content: string) {
  const fileOps = extractFileOps(content);
  if (fileOps.length) {
    const outsideProjectPath = fileOps.find((operation) => isAbsoluteLikePath(operation.path));
    if (outsideProjectPath) {
      return "The fileops payload contains an absolute path or a path outside the project. fileops only supports relative paths inside the current project; Desktop, Downloads, Documents, and similar locations must use powershell-run instead.";
    }
  }

  const fileOpsParseIssue = getFileOpsParseIssue(content);
  if (fileOpsParseIssue) {
    return `There is a problem with the fileops block: ${fileOpsParseIssue}`;
  }

  const webSearchParseIssue = getWebSearchParseIssue(content);
  if (webSearchParseIssue) {
    return `There is a problem with the web-search block: ${webSearchParseIssue}`;
  }

  const looksLikeLegacyFileCreate =
    /"(?:operation|action)"\s*:\s*"(?:create|write|replace|delete|mkdir)"/i.test(content) &&
    /"path"\s*:\s*"/i.test(content) &&
    (/"content"\s*:\s*"/i.test(content) || /"search"\s*:\s*"/i.test(content));
  if (looksLikeLegacyFileCreate) {
    return "Detected legacy or pseudo fileops JSON. Novayxk does not support formats like { operation/create/path/content }; it must be converted to a valid fileops array or changed to powershell-run.";
  }

  return "";
}

function isLikelyFileOpsBlock(fenceSource: string, blockContent: string) {
  if (/^```fileops\b/i.test(fenceSource)) return true;
  return looksLikeFileOpsJson(blockContent);
}

function isLikelyBrowserActionsBlock(fenceSource: string, blockContent: string) {
  if (/^```browser-actions\b/i.test(fenceSource)) return true;
  return /"(?:type|action)"\s*:\s*"(?:navigate|click|type|waitFor|pressKey|scrollTo|select|extractText|runScript)"/i.test(blockContent);
}

function isLikelyWebSearchBlock(fenceSource: string, blockContent: string) {
  if (/^```web-search\b/i.test(fenceSource)) return true;
  return /"query"\s*:\s*"/i.test(blockContent);
}

function normalizeBrowserActionsPayload(payload: unknown): BrowserAutomationAction[] {
  const candidates =
    Array.isArray(payload)
      ? payload
      : payload && typeof payload === "object" && Array.isArray((payload as { actions?: unknown[] }).actions)
        ? (payload as { actions: unknown[] }).actions
        : [payload];

  return candidates.flatMap((candidate) => {
    const normalized = normalizeBrowserAction(candidate);
    return normalized ? [normalized] : [];
  });
}

function normalizeWebSearchPayload(payload: unknown): WebSearchRequest[] {
  const candidates =
    Array.isArray(payload)
      ? payload
      : payload && typeof payload === "object" && Array.isArray((payload as { requests?: unknown[] }).requests)
        ? (payload as { requests: unknown[] }).requests
        : [payload];

  return candidates.flatMap((candidate) => {
    const normalized = normalizeWebSearchRequest(candidate);
    return normalized ? [normalized] : [];
  });
}

function normalizeWebSearchRequest(value: unknown): WebSearchRequest | null {
  if (!value || typeof value !== "object") return null;
  const requestLike = value as Record<string, unknown>;
  const query = typeof requestLike.query === "string" ? requestLike.query.trim() : "";
  if (!query) return null;

  const normalized: WebSearchRequest = {
    query,
  };

  if (Array.isArray(requestLike.domains)) {
    const domains = requestLike.domains
      .map((entry) => String(entry || "").trim())
      .filter(Boolean)
      .slice(0, 8);
    if (domains.length) normalized.domains = domains;
  }

  const maxResults = Number.parseInt(String(requestLike.maxResults ?? ""), 10);
  if (Number.isFinite(maxResults) && maxResults > 0) {
    normalized.maxResults = Math.min(8, maxResults);
  }

  if (typeof requestLike.includePageContent === "boolean") {
    normalized.includePageContent = requestLike.includePageContent;
  }

  const includePageContentCount = Number.parseInt(String(requestLike.includePageContentCount ?? ""), 10);
  if (Number.isFinite(includePageContentCount) && includePageContentCount >= 0) {
    normalized.includePageContentCount = Math.min(3, includePageContentCount);
  }

  return normalized;
}

function normalizeBrowserAction(value: unknown): BrowserAutomationAction | null {
  if (!value || typeof value !== "object") return null;
  if (isBrowserAutomationAction(value)) return value;

  const actionLike = value as Record<string, unknown>;
  if (typeof actionLike.action !== "string") return null;

  const { action, ...rest } = actionLike;
  const normalized = {
    ...rest,
    type: action,
  };
  return isBrowserAutomationAction(normalized) ? normalized : null;
}

export function isFileOperation(value: unknown): value is FileOperation {
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
  if (operation.type === "replace") {
    return (
      typeof operation.path === "string" &&
      operation.path.length > 0 &&
      typeof operation.search === "string" &&
      operation.search.length > 0 &&
      typeof operation.replace === "string" &&
      (operation.occurrence === undefined || operation.occurrence === "first" || operation.occurrence === "all")
    );
  }
  return false;
}

function parseFileOpsCandidate(candidate: string): FileOperation[] {
  try {
    const parsed = JSON.parse(candidate);
    const operations = Array.isArray(parsed) ? parsed : [parsed];
    return operations.filter(isFileOperation);
  } catch {
    return [];
  }
}

function looksLikeFileOpsJson(content: string) {
  return FILE_OP_TYPE_PATTERN.test(content) && FILE_OP_PATH_PATTERN.test(content);
}

function collectBareFileOpsCandidates(content: string) {
  return collectTopLevelJsonCandidates(content).filter((candidate) => looksLikeFileOpsJson(candidate));
}

function collectTopLevelJsonCandidates(content: string) {
  const candidates: string[] = [];
  let startIndex = -1;
  const stack: string[] = [];
  let inString = false;
  let escaped = false;

  for (let index = 0; index < content.length; index += 1) {
    const char = content[index];

    if (startIndex === -1) {
      if (char === "{") {
        startIndex = index;
        stack.push("}");
      } else if (char === "[") {
        startIndex = index;
        stack.push("]");
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") {
      stack.push("}");
      continue;
    }
    if (char === "[") {
      stack.push("]");
      continue;
    }
    if (char === "}" || char === "]") {
      if (!stack.length || stack[stack.length - 1] !== char) {
        startIndex = -1;
        stack.length = 0;
        inString = false;
        escaped = false;
        continue;
      }
      stack.pop();
      if (!stack.length) {
        candidates.push(content.slice(startIndex, index + 1));
        startIndex = -1;
      }
    }
  }

  return candidates;
}

export function formatFileOps(operations: FileOperation[]) {
  if (!operations.length) return "";
  return operations
    .map((operation) => {
      if (operation.type === "mkdir") return `mkdir ${operation.path}`;
      if (operation.type === "delete") return `delete ${operation.path}`;
      if (operation.type === "replace") return `replace ${operation.path}\n${operation.search.slice(0, 500)} -> ${operation.replace.slice(0, 500)}`;
      return `${operation.overwrite ? "overwrite" : "write"} ${operation.path}\n${operation.content.slice(0, 1000)}`;
    })
    .join("\n\n");
}

export function formatProjectContext(context: ProjectContext, assistantMode: AssistantMode = "standard") {
  const profile = getAssistantModeProfile(assistantMode);
  const visibleFiles = context.files.filter((file) => !file.sensitive);
  const fileList = visibleFiles
    .slice(0, profile.projectFileListLimit)
    .map((file) => `- ${file.path} (${formatBytes(file.size)})`)
    .join("\n");
  const relatedFiles = typeof profile.projectRelatedFileLimit === "number"
    ? context.relatedFiles.slice(0, profile.projectRelatedFileLimit)
    : context.relatedFiles;
  const relatedBlocks = relatedFiles
    .map(
      (file) =>
        `\n\nRelated file: ${file.path}${file.truncated ? " (truncated)" : ""}\n\`\`\`\n${file.content.slice(0, profile.projectRelatedContentLimit)}\n\`\`\``,
    )
    .join("");

  return `\n\nProject context summary: ${context.root}\nFile list (showing ${Math.min(visibleFiles.length, profile.projectFileListLimit)}/${visibleFiles.length}):\n${fileList || "- No readable files"}${relatedBlocks}`;
}
