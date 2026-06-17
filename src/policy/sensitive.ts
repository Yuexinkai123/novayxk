export type SensitiveContentInspection = {
  blocked: boolean;
  reason: string;
};

const SENSITIVE_CAPTURE_PATTERN =
  /(?:document\.cookie|localStorage|sessionStorage|__capturedRequests|XMLHttpRequest\.prototype|window\.fetch\s*=)/i;
const CONCRETE_BEARER_PATTERN =
  /Bearer\s+(?!\{|\$\{|%|\+|process\.env|import\.meta\.env|env:|<|YOUR_|TOKEN\b|ACCESS_TOKEN\b)[A-Za-z0-9._~+/=-]{10,}/i;
const CONCRETE_API_KEY_PATTERN = /\b(?:sk-[A-Za-z0-9_-]{8,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,})/;

const SENSITIVE_ASSIGNMENT_PATTERN =
  /(?:"|')?(password|passwd|pwd|access[_-]?token|refresh[_-]?token|id[_-]?token|authorization|cookie|set-cookie|session|new-api-user|api[_-]?key|secret|credential)(?:"|')?\s*[:=]\s*(?:"|')([^"'\r\n]{3,})(?:"|')/gi;

function isPlaceholderValue(value: string) {
  const normalized = value.trim();
  const bearerValue = normalized.match(/^(?:Bearer|Basic)\s+(.+)$/i)?.[1]?.trim();
  if (bearerValue && isPlaceholderValue(bearerValue)) return true;

  return (
    !normalized ||
    /^(?:x+|\*+|\.{3}|<[^>]+>|\$\{[^}]+}|%[A-Z0-9_]+%|\{[^}]+}|YOUR[_-]?[A-Z0-9_-]*|CHANGE[_-]?ME|PLACEHOLDER|TOKEN|ACCESS_TOKEN|API_KEY|PASSWORD)$/i.test(
      normalized,
    ) ||
    /(?:process\.env|import\.meta\.env|os\.environ|ENV\[|getenv|环境变量|占位符|手动填写)/i.test(normalized)
  );
}

function isLikelyConcreteSecret(key: string, value: string) {
  const normalizedKey = key.toLowerCase();
  const normalizedValue = value.trim();
  if (isPlaceholderValue(normalizedValue)) return false;

  if (/(?:password|passwd|pwd)/i.test(normalizedKey)) {
    return normalizedValue.length >= 4;
  }

  if (/(?:authorization)/i.test(normalizedKey)) {
    return /^(?:Bearer|Basic)\s+\S{8,}/i.test(normalizedValue);
  }

  if (/(?:cookie|set-cookie)/i.test(normalizedKey)) {
    return normalizedValue.includes("=") && normalizedValue.length >= 8;
  }

  if (/(?:token|session|new-api-user|api[_-]?key|secret|credential)/i.test(normalizedKey)) {
    return (
      normalizedValue.length >= 16 ||
      CONCRETE_API_KEY_PATTERN.test(normalizedValue) ||
      /^[A-Za-z0-9+/=_-]{12,}\.[A-Za-z0-9+/=_-]{8,}/.test(normalizedValue)
    );
  }

  return false;
}

function hasConcreteSensitiveAssignment(content: string) {
  SENSITIVE_ASSIGNMENT_PATTERN.lastIndex = 0;
  for (const match of content.matchAll(SENSITIVE_ASSIGNMENT_PATTERN)) {
    const [, key, value] = match;
    if (isLikelyConcreteSecret(key, value)) return true;
  }
  return false;
}

export function inspectSensitiveGeneratedContent(content: string): SensitiveContentInspection {
  if (SENSITIVE_CAPTURE_PATTERN.test(content)) {
    return {
      blocked: true,
      reason: "Contains credential-capture logic that reads Cookie/localStorage/sessionStorage or monkey-patches fetch/XHR",
    };
  }

  if (CONCRETE_BEARER_PATTERN.test(content)) {
    return {
      blocked: true,
      reason: "Contains what looks like a real Bearer Authorization value",
    };
  }

  if (CONCRETE_API_KEY_PATTERN.test(content)) {
    return {
      blocked: true,
      reason: "Contains what looks like a real Token or API key",
    };
  }

  if (hasConcreteSensitiveAssignment(content)) {
    return {
      blocked: true,
      reason: "Contains what looks like a real account password, token, cookie, session, or secret literal",
    };
  }

  return { blocked: false, reason: "" };
}

export function isWriteLikePowerShellCommand(command: string) {
  return /(?:set-content|out-file|add-content|>\s*[\w./\\:-]+\.(?:py|js|ts|mjs|cjs|ps1|bat|cmd|json|ya?ml|toml|ini)|\[System\.IO\.File\]::WriteAllText|@')/i.test(
    command,
  );
}
