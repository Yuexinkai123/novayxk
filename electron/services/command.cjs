const MAX_SAFE_COMMAND_LENGTH = 12_000;
const MAX_FULL_COMMAND_LENGTH = 50_000;
const DANGEROUS_COMMANDS = [
  { pattern: /\b(git\s+reset\s+--hard|git\s+clean\s+-[a-z]*[fdx][a-z]*)\b/i, reason: "This would discard local code changes." },
  { pattern: /\b(format|diskpart|shutdown|reboot)\b/i, reason: "This may affect the system or disk." },
  { pattern: /\b(reg\s+delete|set-executionpolicy)\b/i, reason: "This would modify system-level configuration." },
  { pattern: /\b(remove-item|rm|del|erase|rd|rmdir)\b[\s\S]*(?:-recurse|\/s)\b/i, reason: "This includes recursive deletion." },
  { pattern: /\b(remove-item|rm|del|erase|rd|rmdir)\b[\s\S]*(?:-recurse|\/s)\b[\s\S]*(?:-force|\/q)\b/i, reason: "This includes forced recursive deletion." },
  { pattern: /\brm\s+-[a-z]*r[a-z]*f[a-z]*\s+(?:[/"']|~|\*)/i, reason: "This includes a high-risk delete command." },
  { pattern: /\b(curl(?:\.exe)?|wget(?:\.exe)?|iwr|irm|invoke-webrequest|invoke-restmethod)\b[\s\S]*\|[\s\S]*(?:sh|bash|iex|invoke-expression)\b/i, reason: "This would download and execute a remote script directly." },
];
const SYSTEM_ACTION_COMMANDS = [
  { action: "shutdown", label: "Shut down", pattern: /\b(shutdown(\.exe)?\s+\/s|stop-computer\b)\b/i },
  { action: "restart", label: "Restart", pattern: /\b(shutdown(\.exe)?\s+\/r|restart-computer\b|reboot\b)\b/i },
  { action: "logout", label: "Sign out", pattern: /\b(shutdown(\.exe)?\s+\/l|logoff(\.exe)?\b)\b/i },
  { action: "hibernate", label: "Hibernate", pattern: /\b(shutdown(\.exe)?\s+\/h|rundll32(\.exe)?\s+powrprof\.dll,\s*setsuspendstate\s+hibernate)\b/i },
  { action: "sleep", label: "Sleep", pattern: /\brundll32(\.exe)?\s+powrprof\.dll,\s*setsuspendstate\b/i },
  { action: "lock", label: "Lock screen", pattern: /\brundll32(\.exe)?\s+user32\.dll,\s*lockworkstation\b/i },
];
const ADMIN_REQUIRED_COMMANDS = [
  { label: "System service management", pattern: /\b(?:sc(?:\.exe)?\s+(?:create|delete|config|start|stop)|new-service|set-service|start-service|stop-service|restart-service)\b/i },
  { label: "Registry changes under system hives", pattern: /\breg(?:\.exe)?\s+(?:add|delete|import|restore|save|copy)\s+HK(?:LM|CR|U|CC)\\/i },
  { label: "Windows permissions or firewall changes", pattern: /\b(?:netsh\s+advfirewall|set-executionpolicy|bcdedit|takeown|icacls)\b/i },
  { label: "Writing to system directories", pattern: /\b(?:copy|move|remove-item|rm|del|mkdir|new-item|set-content|add-content)\b[\s\S]*(?:C:\\Windows|C:\\Program Files|C:\\ProgramData)/i },
  { label: "Software package install or uninstall", pattern: /\b(?:winget|choco|scoop)\s+(?:install|uninstall|upgrade)|\b(?:install-package|uninstall-package|add-appxpackage|remove-appxpackage|msiexec(?:\.exe)?)\b/i },
  { label: "Force-stopping processes", pattern: /\btaskkill(?:\.exe)?\b[\s\S]*\s\/f\b/i },
  { label: "PowerShell run as administrator", pattern: /\bstart-process\b[\s\S]*\b-verb\s+runas\b/i },
];

function inspectCommand(command) {
  const normalized = String(command ?? "").trim();
  if (!normalized) {
    return { allowed: false, reason: "The command is empty." };
  }
  const adminRequirement = detectAdminRequirement(normalized);
  const systemAction = detectSystemAction(normalized);
  if (systemAction) {
    return {
      allowed: false,
      reason: `${systemAction.label} is a special system action and requires your manual confirmation.`,
      requiresConfirmation: true,
      systemAction,
      ...(adminRequirement ? { requiresAdmin: true, adminReason: adminRequirement.label } : {}),
    };
  }
  if (normalized.length > MAX_SAFE_COMMAND_LENGTH) {
    return {
      allowed: false,
      reason: `The command is too long. In safe mode, keep it within ${MAX_SAFE_COMMAND_LENGTH} characters.`,
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
    return { allowed: false, reason: "The command is empty." };
  }
  const adminRequirement = detectAdminRequirement(normalized);
  const systemAction = detectSystemAction(normalized);
  if (systemAction) {
    return {
      allowed: false,
      reason: `${systemAction.label} is a special system action and requires your manual confirmation.`,
      requiresConfirmation: true,
      systemAction,
      ...(adminRequirement ? { requiresAdmin: true, adminReason: adminRequirement.label } : {}),
    };
  }
  if (normalized.length > MAX_FULL_COMMAND_LENGTH) {
    return {
      allowed: false,
      reason: `The command is too long. Keep it within ${MAX_FULL_COMMAND_LENGTH} characters.`,
      ...(adminRequirement ? { requiresAdmin: true, adminReason: adminRequirement.label } : {}),
    };
  }

  if (controlMode === "full") {
    return {
      allowed: true,
      reason: "System-level execution is enabled, so high-risk command blocking was skipped.",
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
