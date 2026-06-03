import type { AiControlMode, ChatMessage, FileOperation, ProjectContext, TaskSummary } from "../vite-env";
import { formatBytes } from "../project/tree";

export const STREAM_ABORT_MESSAGE = "用户已停止本次生成。";
export const STREAM_ABORT_PLACEHOLDER = "已停止本次生成。";

export type RuntimePermissionContext = {
  controlMode: "safe" | "full";
  isAdmin: boolean;
  privilegeLabel: string;
};

export function buildSystemPrompt(projectMemory: string, taskSummary: string, runtimePermission: RuntimePermissionContext) {
  const memoryBlock = projectMemory.trim()
    ? `\n\n【项目长期记忆】\n${projectMemory.trim().slice(0, 6000)}`
    : "";
  const taskBlock = taskSummary.trim() ? `\n\n【当前任务摘要】\n${taskSummary.trim().slice(0, 3000)}` : "";
  const windowsPrivilegeBlock = runtimePermission.isAdmin
    ? "当前 Novayxk Windows 进程权限：管理员权限。你可以明确告诉用户当前应用已经以管理员身份运行。"
    : `当前 Novayxk Windows 进程权限：${runtimePermission.privilegeLabel}。用户要求切换“管理员模式”“系统级权限”“管理员权限”时，通常指设置里的管理员模式按钮：Novayxk 可以请求 Windows UAC 并以管理员权限重启；不要回答成只能让用户手动右键打开。不要把 Windows 进程权限和 Novayxk 内部执行范围混为一谈。`;
  const controlModeBlock =
    runtimePermission.controlMode === "full"
      ? "当前 Novayxk 内部 AI 执行范围：系统级执行。用户允许你通过 ```powershell-run 代码块请求执行包括安装软件、系统设置修改和其他高风险命令在内的 PowerShell 命令。仍要优先解释目的，避免无意义破坏。"
      : "当前 Novayxk 内部 AI 执行范围：项目内执行。用户要求切换“系统级执行”“AI 执行范围”“内部执行模式”时，才理解为内部执行范围切换；用户只说“管理员模式”时优先理解为 Windows UAC 管理员权限请求。你可以通过 ```powershell-run 代码块请求执行项目目录内的常见开发命令，例如 npm run build、npm test、dir、Get-ChildItem、git status。不要把删除、重置、格式化、系统设置、下载后直接执行脚本等高风险命令放进自动执行块。";
  const logBlock =
    "\nNovayxk 自身日志位于 %USERPROFILE%\\.novayxk\\logs\\，包括 app.log、error.log、ai.log、behavior.log。behavior.log 是临时的完整行为日志，会记录更详细的 IPC、模型流、命令、终端和用户介入行为。用户问 Novayxk 自己的报错、日志、为什么没执行命令时，你可以用 powershell-run 只读命令读取这些日志尾部，例如 Get-Content \"$env:USERPROFILE\\.novayxk\\logs\\error.log\" -Tail 120，或 Get-Content \"$env:USERPROFILE\\.novayxk\\logs\\behavior.log\" -Tail 200。";
  const shellBlock = `\n\n${windowsPrivilegeBlock}\n${controlModeBlock}${logBlock}`;
  const behaviorBlock = `你是 Novayxk，一款谨慎但自然的通用本机执行与项目协作助手。你不只是编程助手：可以帮助用户处理代码项目、Windows 环境、软件安装与卸载、应用配置、文件处理、联网资料核验、命令执行和日常电脑操作。回答要具体、可执行，也要像正常对话一样根据用户当下的话轻重回应。

不要仅因为任务不是编程就拒绝。不要说“我是编程助手，只能处理代码”“我没有联网搜索能力”“我不能安装软件”这类与 Novayxk 实际能力不一致的话。只要任务能通过 fileops、powershell-run、Windows UAC 授权或安全的本机命令完成，就主动推进；如果真实受限，要说清楚具体限制和可行替代方案。

用户要求查资料、查网页、核实新闻或判断“是否属实”时，可以通过 powershell-run 使用 Invoke-WebRequest、Invoke-RestMethod、iwr、irm、curl 或 wget 等命令联网检索。优先寻找官方通报、学校/机构公告、权威媒体或多个独立可靠来源；如果只搜到论坛、短视频、营销号或零散讨论，只能说“暂未找到可靠来源确认”，不要把传言当事实。总结时要区分已证实、未证实和只能推断的部分，并尽量给出来源名称和 URL。

用户要求安装、卸载或升级软件时，优先用 winget、choco、scoop、msiexec 或 Windows 自带工具处理。先搜索候选包，例如 winget search 软件名；能确认包 ID 后再安装或卸载，例如 winget install --id 包ID --accept-package-agreements --accept-source-agreements。需要管理员权限时，Novayxk 会请求 Windows UAC 授权，不要让用户自己去官网下载安装，除非包管理器没有可用结果或官方站点是唯一合理来源。如果下载或安装已经尝试多次仍失败，不要无限重复同一类命令；应查找官方下载页、网页版下载页或 Microsoft Store 网页地址，并通过 powershell-run 执行 Start-Process "https://..." 直接为用户打开下载页面，再根据命令结果说明已经打开或为什么打不开。

解释概念、定义、原理、区别、用途这类知识型问题时，先直接回答，不要为了“顺手帮忙”主动输出 powershell-run、fileops 或其他会触发自动执行的内容。只有当用户明确要求你安装、运行、执行、打开、搜索、检查、查看本机状态、联网核实或代为操作时，才输出这些自动执行代码块。

用户只是打招呼、寒暄、测试在线状态或说很短的闲聊内容时，只简短自然回应，不要主动介绍项目、不要复述文件清单、不要列功能菜单。只有用户明确要求分析项目、查看文件、修改代码、解释项目内容或询问项目情况时，才使用文件清单和相关文件上下文。用户只是询问版本、环境、终端命令或运行状态时，不要介绍项目文件；如果需要命令，直接请求执行命令即可。隐藏上下文只用于帮助你判断，不要主动复述项目路径、文件清单或“我看到你的项目”。

用户要求你创建页面、组件、脚本、样式或其他新文件时，优先直接返回一个或多个 \`\`\`fileops JSON 代码块，Novayxk 会自动执行项目内文件操作。fileops 格式为 [{"type":"mkdir","path":"相对目录"},{"type":"write","path":"相对文件","content":"文件内容","overwrite":false},{"type":"delete","path":"相对路径"}]。当用户明确要求新建、覆盖整个文件、删除文件或删除目录时，优先用 fileops，不要只给说明文字。生成完整前端应用、后台系统或大页面时，不要把所有 HTML/CSS/JS 塞进一个超大的单文件字符串；要拆成多个项目文件或多个 fileops 代码块，例如 package.json、src/main.js、src/App.vue、src/styles.css，每个 write 尽量保持在 12000 字符以内。修改已有文件的小范围局部内容时，优先给出文件路径、修改理由和 diff 风格补丁；只有用户明确要求覆盖已有文件时，fileops write 才可以设置 overwrite:true。

需要运行 PowerShell 命令时，必须返回一个完整的、单独成块的 \`\`\`powershell-run 代码块，每个代码块只放一条或一组相关命令；项目相关命令会在当前项目根目录执行，软件安装、系统查询、打开网页/商店、联网检索和 Novayxk 日志读取等系统任务会在用户目录执行，即使当前没有打开项目也可以尝试。不要输出 <tool_call>、<function=shell>、<parameter=command> 这类 XML 工具调用格式，Novayxk 不使用这种协议。不要把要执行的命令放在普通文字、行内代码或普通 \`\`\`text 代码块里。你输出 powershell-run 后，Novayxk 会自动执行并把结果再交给你总结，所以不要要求用户手动执行命令、复制输出或“执行后发我”，也不要在收到执行结果前说“已开始安装”“等安装结果返回”。fileops 路径必须是当前项目内的相对路径；PowerShell 命令默认在当前项目根目录执行，但用户明确要求系统、软件、网页或日志任务时，可以访问任务所需的项目外路径、网络地址或 Novayxk 自身日志。不要要求用户泄露密钥。`;
  return `${behaviorBlock}${shellBlock}${memoryBlock}${taskBlock}`;
}

export function summarizeTaskForUi(messages: ChatMessage[]) {
  const userMessages = messages
    .filter((message) => message.role === "user")
    .slice(-6)
    .map((message) => stripInjectedContext(message.content).trim())
    .filter(Boolean);
  return userMessages.length ? `最近任务重点：${userMessages.join("；").slice(0, 1200)}` : "";
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

export function buildModelChatHistory(messages: ChatMessage[], latestContext: string) {
  const cleanMessages = sanitizeChatHistory(messages);
  if (!latestContext.trim() && cleanMessages.length > 0) {
    return cleanMessages.slice(-6).filter((message) => !looksLikeProjectContextReply(message.content));
  }
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

export function looksLikeProjectContextReply(content: string) {
  return /项目上下文摘要|文件清单|我看到你的项目|你的项目目录|目前有\s*\d+\s*个|hospital\.html|login\.html|register\.html/i.test(content);
}

export function stripContext(content: string) {
  return stripInjectedContext(content);
}

export function stripInjectedContext(content: string) {
  const markers = ["\n\n当前选中文件：", "\n\n项目上下文摘要：", "\n\n运行上下文："];
  const indexes = markers
    .map((marker) => content.indexOf(marker))
    .filter((index) => index > -1);
  return indexes.length ? content.slice(0, Math.min(...indexes)) : content;
}

export function sanitizeChatHistory(messages: ChatMessage[]) {
  return messages
    .filter((message) => !isAbortPlaceholderMessage(message))
    .map((message) => (
      message.role === "user"
        ? { ...message, content: stripInjectedContext(message.content).trim() }
        : message
    ));
}

export function isAbortPlaceholderMessage(message: ChatMessage) {
  return message.role === "assistant" && message.content.trim() === STREAM_ABORT_PLACEHOLDER;
}

export function normalizeAssistantToolCallContent(content: string) {
  if (!/<tool_call\b|<function=|<tool_result\b/i.test(content)) return content;

  const toolCalls = [...content.matchAll(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi)];
  const convertedBlocks = toolCalls
    .map((match) => convertToolCallBlockToPowerShell(match[1] ?? ""))
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
  normalized = normalized.replace(/<tool_call\b[\s\S]*$/i, "正在整理命令请求...");
  normalized = normalized.replace(/<function=[\s\S]*$/i, "正在整理命令请求...");
  return normalized.trim();
}

export function decodeToolCallText(value: string) {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function convertToolCallBlockToPowerShell(rawBlock: string) {
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

export function extractFileOps(content: string): FileOperation[] {
  const blocks = [...content.matchAll(/```(?:fileops|json)\n([\s\S]*?)```/gi)];
  if (!blocks.length) return [];

  return blocks.flatMap((block) => {
    try {
      const parsed = JSON.parse(block[1]);
      const operations = Array.isArray(parsed) ? parsed : [parsed];
      return operations.filter(isFileOperation);
    } catch {
      return [];
    }
  });
}

export function hasDestructiveFileOps(operations: FileOperation[]) {
  return operations.some((operation) => operation.type === "delete");
}

export function getFileOpsParseIssue(content: string) {
  const hasOpenFileOpsFence = /```fileops\n/i.test(content);
  const hasOpenJsonFileOpsFence = /```json\n[\s\S]*(?:"type"\s*:|"path"\s*:)/i.test(content);
  if (!hasOpenFileOpsFence && !hasOpenJsonFileOpsFence) return "";

  const closedBlocks = [...content.matchAll(/```(?:fileops|json)\n([\s\S]*?)```/gi)];
  if (!closedBlocks.length) return "代码块没有正常闭合，通常是输出在中途停止。";

  const hadFileOpsLikeBlock = closedBlocks.some((block) => /"type"\s*:|"path"\s*:|"content"\s*:/i.test(block[1]));
  if (!hadFileOpsLikeBlock) return "";

  const parsedOperations = extractFileOps(content);
  if (!parsedOperations.length) return "代码块存在，但 JSON 不是合法的 fileops 格式。";
  return "";
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
  return false;
}

export function formatFileOps(operations: FileOperation[]) {
  if (!operations.length) return "";
  return operations
    .map((operation) => {
      if (operation.type === "mkdir") return `mkdir ${operation.path}`;
      if (operation.type === "delete") return `delete ${operation.path}`;
      return `${operation.overwrite ? "overwrite" : "write"} ${operation.path}\n${operation.content.slice(0, 1000)}`;
    })
    .join("\n\n");
}

export function formatProjectContext(context: ProjectContext) {
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
