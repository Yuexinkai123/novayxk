const fs = require("node:fs/promises");
const fsSync = require("node:fs");

function getDefaultConfig() {
  return {
    providers: [],
    activeProviderId: null,
    lastProjectRoot: null,
    theme: "dark",
    aiControlMode: "safe",
    hasSeenWelcome: false,
    hasSeenWorkspaceGuide: false,
    pendingAdminResume: null,
  };
}

function normalizeProvider(provider, index, safeStorage) {
  const apiKey = decodeStoredApiKey(provider, safeStorage);
  return {
    id: String(provider?.id || `provider-${index + 1}`),
    name: String(provider?.name || `供应商 ${index + 1}`),
    baseUrl: String(provider?.baseUrl || ""),
    apiKey,
    model: String(provider?.model || ""),
    apiMode: provider?.apiMode === "responses" ? "responses" : "chatCompletions",
  };
}

function normalizeConfig(rawConfig, safeStorage) {
  const fallback = getDefaultConfig();
  const providers = Array.isArray(rawConfig?.providers)
    ? rawConfig.providers.map((provider, index) => normalizeProvider(provider, index, safeStorage))
    : fallback.providers;

  return {
    providers,
    activeProviderId: typeof rawConfig?.activeProviderId === "string" ? rawConfig.activeProviderId : fallback.activeProviderId,
    lastProjectRoot: typeof rawConfig?.lastProjectRoot === "string" ? rawConfig.lastProjectRoot : fallback.lastProjectRoot,
    theme: rawConfig?.theme === "light" ? "light" : fallback.theme,
    aiControlMode: rawConfig?.aiControlMode === "full" ? "full" : fallback.aiControlMode,
    hasSeenWelcome: rawConfig?.hasSeenWelcome === true,
    hasSeenWorkspaceGuide: rawConfig?.hasSeenWorkspaceGuide === true,
    pendingAdminResume: normalizePendingAdminResume(rawConfig?.pendingAdminResume),
  };
}

function normalizePendingResumeMessage(message) {
  if (!message || typeof message !== "object") return null;
  const role = message.role === "system" || message.role === "assistant" ? message.role : "user";
  const content = typeof message.content === "string" ? message.content.slice(0, 12_000) : "";
  if (!content) return null;
  const normalized = {
    role,
    content,
  };
  if (Number.isFinite(message.elapsedMs) && message.elapsedMs >= 0) {
    normalized.elapsedMs = Math.round(message.elapsedMs);
  }
  return normalized;
}

function normalizePendingAdminResume(value) {
  if (!value || typeof value !== "object") return null;
  const action = value.action === "run-command" ? "run-command" : null;
  const source = value.source === "manual" ? "manual" : value.source === "ai" ? "ai" : null;
  const command = typeof value.command === "string" ? value.command.trim().slice(0, 20_000) : "";
  const controlMode = value.controlMode === "full" ? "full" : "safe";
  const createdAt = typeof value.createdAt === "string" ? value.createdAt : "";
  if (!action || !source || !command || !createdAt) return null;
  const messages = Array.isArray(value.messages)
    ? value.messages.map(normalizePendingResumeMessage).filter(Boolean).slice(-20)
    : undefined;
  return {
    action,
    source,
    command,
    controlMode,
    taskId: typeof value.taskId === "string" ? value.taskId : null,
    projectRoot: typeof value.projectRoot === "string" ? value.projectRoot : null,
    createdAt,
    ...(messages?.length ? { messages } : {}),
  };
}

function decodeStoredApiKey(provider, safeStorage) {
  if (provider?.apiKeyEncrypted && safeStorage?.isEncryptionAvailable?.()) {
    try {
      return safeStorage.decryptString(Buffer.from(String(provider.apiKeyEncrypted), "base64"));
    } catch {
      return "";
    }
  }
  return typeof provider?.apiKey === "string" ? provider.apiKey : "";
}

function encodeStoredApiKey(apiKey, safeStorage) {
  const normalized = String(apiKey || "");
  if (!normalized) return { apiKeyEncrypted: "", apiKeyStorage: "empty" };
  if (safeStorage?.isEncryptionAvailable?.()) {
    return {
      apiKeyEncrypted: safeStorage.encryptString(normalized).toString("base64"),
      apiKeyStorage: "safeStorage",
    };
  }
  return {
    apiKey: normalized,
    apiKeyStorage: "plain",
  };
}

function buildDiskConfig(config, safeStorage) {
  const normalized = normalizeConfig(config, safeStorage);
  return {
    providers: normalized.providers.map((provider) => ({
      id: provider.id,
      name: provider.name,
      baseUrl: provider.baseUrl,
      ...encodeStoredApiKey(provider.apiKey, safeStorage),
      model: provider.model,
      apiMode: provider.apiMode,
    })),
    activeProviderId: normalized.activeProviderId,
    lastProjectRoot: normalized.lastProjectRoot,
    theme: normalized.theme,
    aiControlMode: normalized.aiControlMode,
    hasSeenWelcome: normalized.hasSeenWelcome,
    hasSeenWorkspaceGuide: normalized.hasSeenWorkspaceGuide,
    pendingAdminResume: normalized.pendingAdminResume,
  };
}

function needsConfigMigration(rawConfig) {
  if (!Array.isArray(rawConfig?.providers)) return false;
  return rawConfig.providers.some((provider) => typeof provider?.apiKey === "string" && provider.apiKey.length > 0);
}

function createConfigService({ configDir, configFile, logApp, safeStorage }) {
  function persistDiskConfigSync(config) {
    fsSync.mkdirSync(configDir, { recursive: true });
    fsSync.writeFileSync(configFile, JSON.stringify(config, null, 2), "utf8");
  }

  async function persistDiskConfig(config) {
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(configFile, JSON.stringify(config, null, 2), "utf8");
  }

  function readParsedConfigSync() {
    try {
      const raw = fsSync.readFileSync(configFile, "utf8");
      return JSON.parse(raw);
    } catch {
      return getDefaultConfig();
    }
  }

  async function readParsedConfig() {
    try {
      const raw = await fs.readFile(configFile, "utf8");
      return JSON.parse(raw);
    } catch {
      return getDefaultConfig();
    }
  }

  function migrateIfNeededSync(rawConfig) {
    if (!needsConfigMigration(rawConfig)) return;
    try {
      persistDiskConfigSync(buildDiskConfig(rawConfig, safeStorage));
    } catch {
      // Keep the in-memory config usable even if the migration write fails.
    }
  }

  async function migrateIfNeeded(rawConfig) {
    if (!needsConfigMigration(rawConfig)) return;
    try {
      await persistDiskConfig(buildDiskConfig(rawConfig, safeStorage));
    } catch {
      // Keep the in-memory config usable even if the migration write fails.
    }
  }

  function readConfigSync() {
    const rawConfig = readParsedConfigSync();
    migrateIfNeededSync(rawConfig);
    return normalizeConfig(rawConfig, safeStorage);
  }

  async function readConfig() {
    const rawConfig = await readParsedConfig();
    await migrateIfNeeded(rawConfig);
    return normalizeConfig(rawConfig, safeStorage);
  }

  async function writeConfig(config) {
    const diskConfig = buildDiskConfig(config, safeStorage);
    await persistDiskConfig(diskConfig);
    logApp("config:saved", {
      providerCount: Array.isArray(diskConfig?.providers) ? diskConfig.providers.length : 0,
      activeProviderId: diskConfig?.activeProviderId || null,
      theme: diskConfig?.theme || null,
      aiControlMode: diskConfig?.aiControlMode || null,
      hasLastProjectRoot: Boolean(diskConfig?.lastProjectRoot),
      hasSeenWelcome: diskConfig?.hasSeenWelcome === true,
      hasSeenWorkspaceGuide: diskConfig?.hasSeenWorkspaceGuide === true,
      hasPendingAdminResume: Boolean(diskConfig?.pendingAdminResume?.command),
      encryptedProviderCount: Array.isArray(diskConfig?.providers)
        ? diskConfig.providers.filter((provider) => provider.apiKeyStorage === "safeStorage").length
        : 0,
    });
    return normalizeConfig(config, safeStorage);
  }

  return { readConfig, readConfigSync, writeConfig };
}

module.exports = { createConfigService };
