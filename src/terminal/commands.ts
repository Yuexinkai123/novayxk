export const COMMAND_LOOP_SAFETY_LIMIT = 50;
const COMMAND_LOOP_REPEAT_LIMIT = 9;

export type PowerShellCommandRequest = {
  command: string;
  source: "block" | "inline";
};

export type CommandLoopState = {
  rounds: number;
  seenCommands: Map<string, number>;
  seenSignatures: Map<string, number>;
};

export function createCommandLoopState(): CommandLoopState {
  return {
    rounds: 0,
    seenCommands: new Map(),
    seenSignatures: new Map(),
  };
}

export function inspectCommandLoop(commands: PowerShellCommandRequest[], state: CommandLoopState) {
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

export function normalizeCommandForLoop(command: string) {
  return command
    .replace(/\s+/g, " ")
    .replace(/["']/g, "")
    .trim()
    .toLowerCase();
}

export function extractPowerShellCommandRequests(content: string, options: { includeInline?: boolean } = {}) {
  const requests: PowerShellCommandRequest[] = [];
  const seen = new Set<string>();
  for (const command of extractPowerShellCommands(content)) {
    addPowerShellCommandRequest(requests, seen, command, "block");
  }
  if (options.includeInline === true) {
    for (const command of extractInlinePowerShellCommands(content)) {
      addPowerShellCommandRequest(requests, seen, command, "inline");
    }
  }
  return requests;
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

export function addPowerShellCommandRequest(
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

export function extractInlinePowerShellCommands(content: string) {
  const withoutFencedBlocks = content.replace(/```[\s\S]*?```/g, "\n");
  return withoutFencedBlocks
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(isLikelyStandalonePowerShellCommand);
}

export function isLikelyStandalonePowerShellCommand(line: string) {
  if (!line || line.length > 1200) return false;
  if (/[\u4e00-\u9fa5]/.test(line)) return false;
  if (/[。！？]/.test(line)) return false;
  if (/^(?:\$|PS>|>|`|-|\d+\.|\*)\s*/.test(line)) return false;
  if (/^PowerShell\s+执行结果/i.test(line)) return false;

  const commandPrefix =
    /^(?:winget|choco|scoop|npm|pnpm|yarn|npx|node|python|py|pip|git|docker|wsl|mysql|where(?:\.exe)?|Invoke-WebRequest|Invoke-RestMethod|iwr|irm|curl(?:\.exe)?|wget(?:\.exe)?|Find-Package|Install-Package|Uninstall-Package|Get-Package|Get-[A-Za-z]+|Set-[A-Za-z]+|New-[A-Za-z]+|Remove-[A-Za-z]+|Start-[A-Za-z]+|Stop-[A-Za-z]+|Restart-[A-Za-z]+|Test-[A-Za-z]+|Select-[A-Za-z]+|Get-ChildItem|Get-Service|Start-Process|Stop-Process|shutdown(?:\.exe)?|taskkill(?:\.exe)?|reg(?:\.exe)?|msiexec(?:\.exe)?|powershell(?:\.exe)?|pwsh(?:\.exe)?)\b/i;
  if (!commandPrefix.test(line)) return false;

  return /(?:\s--?[\w-]+|\s\/[a-z?]+|\s\|[^\|]|\s;|\s&&|\s"[^"]*"|\s'[^']*'|\s[A-Za-z0-9_.:-]+)$/i.test(line);
}

export function upsertTerminalTask<T extends { id: string; startedAt: string }>(tasks: T[], task: T) {
  const next = tasks.filter((item) => item.id !== task.id);
  return [task, ...next].sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
}

export function formatTerminalStatus(task: {
  status: "running" | "exited" | "failed" | "stopped";
  code: number | null;
  needsInput?: boolean;
  userIntervened?: boolean;
}) {
  const suffix = task.userIntervened ? " · 已介入" : "";
  if (task.status === "running" && task.needsInput) return `等待输入${suffix}`;
  if (task.status === "running") return `运行中${suffix}`;
  if (task.status === "stopped") return `已停止${suffix}`;
  if (task.status === "failed") return `${`失败 ${task.code ?? ""}`.trim()}${suffix}`;
  return `退出 ${task.code ?? 0}${suffix}`;
}
