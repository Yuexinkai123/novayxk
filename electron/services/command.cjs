const MAX_SAFE_COMMAND_LENGTH = 12_000;
const MAX_FULL_COMMAND_LENGTH = 50_000;
const DANGEROUS_COMMANDS = [
  { pattern: /\b(git\s+reset\s+--hard|git\s+clean\s+-[a-z]*[fdx][a-z]*)\b/i, reason: "会丢弃本地代码改动" },
  { pattern: /\b(format|diskpart|shutdown|reboot)\b/i, reason: "可能影响系统或磁盘" },
  { pattern: /\b(reg\s+delete|set-executionpolicy)\b/i, reason: "会修改系统级配置" },
  { pattern: /\b(remove-item|rm|del|erase|rd|rmdir)\b[\s\S]*(?:-recurse|\/s)\b[\s\S]*(?:-force|\/q)\b/i, reason: "包含递归强制删除" },
  { pattern: /\brm\s+-[a-z]*r[a-z]*f[a-z]*\s+(?:[/"']|~|\*)/i, reason: "包含高风险删除命令" },
  { pattern: /\b(curl(?:\.exe)?|wget(?:\.exe)?|iwr|irm|invoke-webrequest|invoke-restmethod)\b[\s\S]*\|[\s\S]*(?:sh|bash|iex|invoke-expression)\b/i, reason: "会下载并直接执行远程脚本" },
];
const SYSTEM_ACTION_COMMANDS = [
  { action: "shutdown", label: "关机", pattern: /\b(shutdown(\.exe)?\s+\/s|stop-computer\b)\b/i },
  { action: "restart", label: "重启", pattern: /\b(shutdown(\.exe)?\s+\/r|restart-computer\b|reboot\b)\b/i },
  { action: "logout", label: "注销", pattern: /\b(shutdown(\.exe)?\s+\/l|logoff(\.exe)?\b)\b/i },
  { action: "hibernate", label: "休眠", pattern: /\b(shutdown(\.exe)?\s+\/h|rundll32(\.exe)?\s+powrprof\.dll,\s*setsuspendstate\s+hibernate)\b/i },
  { action: "sleep", label: "睡眠", pattern: /\brundll32(\.exe)?\s+powrprof\.dll,\s*setsuspendstate\b/i },
  { action: "lock", label: "锁屏", pattern: /\brundll32(\.exe)?\s+user32\.dll,\s*lockworkstation\b/i },
];
const ADMIN_REQUIRED_COMMANDS = [
  { label: "系统服务管理", pattern: /\b(?:sc(?:\.exe)?\s+(?:create|delete|config|start|stop)|new-service|set-service|start-service|stop-service|restart-service)\b/i },
  { label: "注册表系统分支修改", pattern: /\breg(?:\.exe)?\s+(?:add|delete|import|restore|save|copy)\s+HK(?:LM|CR|U|CC)\\/i },
  { label: "Windows 权限或防火墙修改", pattern: /\b(?:netsh\s+advfirewall|set-executionpolicy|bcdedit|takeown|icacls)\b/i },
  { label: "系统目录写入", pattern: /\b(?:copy|move|remove-item|rm|del|mkdir|new-item|set-content|add-content)\b[\s\S]*(?:C:\\Windows|C:\\Program Files|C:\\ProgramData)/i },
  { label: "软件包安装或卸载", pattern: /\b(?:winget|choco|scoop)\s+(?:install|uninstall|upgrade)|\b(?:install-package|uninstall-package|add-appxpackage|remove-appxpackage|msiexec(?:\.exe)?)\b/i },
  { label: "进程强制结束", pattern: /\btaskkill(?:\.exe)?\b[\s\S]*\s\/f\b/i },
  { label: "PowerShell 管理员启动", pattern: /\bstart-process\b[\s\S]*\b-verb\s+runas\b/i },
];

function inspectCommand(command) {
  const normalized = String(command ?? "").trim();
  if (!normalized) {
    return { allowed: false, reason: "命令为空。" };
  }
  const adminRequirement = detectAdminRequirement(normalized);
  const systemAction = detectSystemAction(normalized);
  if (systemAction) {
    return {
      allowed: false,
      reason: `${systemAction.label}属于特殊系统动作，需要你手动确认。`,
      requiresConfirmation: true,
      systemAction,
      ...(adminRequirement ? { requiresAdmin: true, adminReason: adminRequirement.label } : {}),
    };
  }
  if (normalized.length > MAX_SAFE_COMMAND_LENGTH) {
    return {
      allowed: false,
      reason: `命令过长，安全模式下请控制在 ${MAX_SAFE_COMMAND_LENGTH} 字符内。`,
      ...(adminRequirement ? { requiresAdmin: true, adminReason: adminRequirement.label } : {}),
    };
  }

  const hit = DANGEROUS_COMMANDS.find((item) => item.pattern.test(normalized));
  if (hit) {
    return {
      allowed: false,
      reason: hit.reason,
      ...(adminRequirement ? { requiresAdmin: true, adminReason: adminRequirement.label } : {}),
    };
  }

  return {
    allowed: true,
    reason: "",
    ...(adminRequirement ? { requiresAdmin: true, adminReason: adminRequirement.label } : {}),
  };
}

function inspectCommandForMode(command, controlMode = "safe") {
  const normalized = String(command ?? "").trim();
  if (!normalized) {
    return { allowed: false, reason: "命令为空。" };
  }
  const adminRequirement = detectAdminRequirement(normalized);
  const systemAction = detectSystemAction(normalized);
  if (systemAction) {
    return {
      allowed: false,
      reason: `${systemAction.label}属于特殊系统动作，需要你手动确认。`,
      requiresConfirmation: true,
      systemAction,
      ...(adminRequirement ? { requiresAdmin: true, adminReason: adminRequirement.label } : {}),
    };
  }
  if (normalized.length > MAX_FULL_COMMAND_LENGTH) {
    return {
      allowed: false,
      reason: `命令过长，请控制在 ${MAX_FULL_COMMAND_LENGTH} 字符内。`,
      ...(adminRequirement ? { requiresAdmin: true, adminReason: adminRequirement.label } : {}),
    };
  }

  if (controlMode === "full") {
    return {
      allowed: true,
      reason: "系统级执行已开启，高风险命令拦截已跳过。",
      ...(adminRequirement ? { requiresAdmin: true, adminReason: adminRequirement.label } : {}),
    };
  }

  return inspectCommand(normalized);
}

function detectCommandScope(command) {
  const normalized = stripLeadingCommentLines(command);
  if (!normalized) return "project";
  if (isSystemCommand(normalized)) return "system";
  return "project";
}

function stripLeadingCommentLines(command) {
  return String(command ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .join("\n")
    .trim();
}

function isSystemCommand(command) {
  const normalized = String(command ?? "").trim();
  const unwrapped = normalized
    .replace(/^(?:cmd(?:\.exe)?\s+\/c|powershell(?:\.exe)?\s+-Command|pwsh(?:\.exe)?\s+-Command)\s+/i, "")
    .trim()
    .replace(/^["']([\s\S]*)["']$/g, "$1");
  const firstCommand = unwrapped.split(/\r?\n|;|&&|\|\|/)[0]?.trim() ?? "";
  const systemPatterns = [
    /^(?:winget|choco|scoop)\b/i,
    /^(?:find-package|install-package|uninstall-package|get-package|get-appxpackage|add-appxpackage|remove-appxpackage)\b/i,
    /^msiexec(?:\.exe)?\b/i,
    /^start-process\b[\s\S]*(?:https?:\/\/|ms-windows-store:|ms-settings:|shell:)/i,
    /^(?:invoke-webrequest|invoke-restmethod|iwr|irm|curl(?:\.exe)?|wget(?:\.exe)?)\b/i,
    /^get-content\b[\s\S]*(?:\$env:USERPROFILE|%USERPROFILE%|\.novayxk|\\AppData\\|\\ProgramData\\)/i,
    /^(?:where(?:\.exe)?|get-command)\s+(?:winget|choco|scoop|msiexec|curl|wget)\b/i,
  ];
  return systemPatterns.some((pattern) => pattern.test(firstCommand));
}

function detectSystemAction(command) {
  const normalized = String(command ?? "").trim();
  const hit = SYSTEM_ACTION_COMMANDS.find((item) => item.pattern.test(normalized));
  if (!hit) return null;
  return {
    action: hit.action,
    label: hit.label,
  };
}

function detectAdminRequirement(command) {
  const normalized = String(command ?? "").trim();
  const hit = ADMIN_REQUIRED_COMMANDS.find((item) => item.pattern.test(normalized));
  if (!hit) return null;
  return {
    label: hit.label,
  };
}

module.exports = { inspectCommand, inspectCommandForMode, detectCommandScope, detectSystemAction, detectAdminRequirement };
