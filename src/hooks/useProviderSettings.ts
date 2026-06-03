import React from "react";
import type { AppConfig, AiControlMode, PendingAdminResume, ProviderConfig, ThemeMode } from "../vite-env";
import { defaultProvider, getProviderId, isAiControlMode, isThemeMode } from "../ai/providers";
import type { PrivilegeState } from "../components/settings/SettingsModal";
import { createDesktopBridgeUnavailableError, formatActionableError } from "../app/errors";

type UseProviderSettingsOptions = {
  initialConfig: Partial<AppConfig>;
  setStatus: (status: string) => void;
};

export function useProviderSettings({ initialConfig, setStatus }: UseProviderSettingsOptions) {
  const initialProviders = initialConfig?.providers?.length ? initialConfig.providers : [defaultProvider];
  const initialActiveProviderId = getProviderId(initialProviders, initialConfig?.activeProviderId, initialProviders[0].id);
  const initialTheme = isThemeMode(initialConfig?.theme) ? initialConfig.theme : "dark";
  const initialAiControlMode = isAiControlMode(initialConfig?.aiControlMode) ? initialConfig.aiControlMode : "safe";

  const [providers, setProviders] = React.useState<ProviderConfig[]>(initialProviders);
  const [activeProviderId, setActiveProviderId] = React.useState(initialActiveProviderId);
  const [editingProviderId, setEditingProviderId] = React.useState(initialActiveProviderId);
  const [lastProjectRoot, setLastProjectRoot] = React.useState<string | null>(initialConfig?.lastProjectRoot ?? null);
  const [providerTestStatus, setProviderTestStatus] = React.useState("");
  const [isTestingProvider, setIsTestingProvider] = React.useState(false);
  const [aiControlMode, setAiControlMode] = React.useState<AiControlMode>(initialAiControlMode);
  const [hasSeenWelcome, setHasSeenWelcome] = React.useState(initialConfig?.hasSeenWelcome === true);
  const [hasSeenWorkspaceGuide, setHasSeenWorkspaceGuide] = React.useState(initialConfig?.hasSeenWorkspaceGuide === true);
  const [pendingAdminResume, setPendingAdminResume] = React.useState<PendingAdminResume | null>(
    initialConfig?.pendingAdminResume ?? null,
  );
  const [privilege, setPrivilege] = React.useState<PrivilegeState | null>(null);
  const [isRestartingAsAdmin, setIsRestartingAsAdmin] = React.useState(false);
  const [theme, setTheme] = React.useState<ThemeMode>(initialTheme);

  const activeProvider = providers.find((provider) => provider.id === activeProviderId) ?? providers[0] ?? defaultProvider;
  const editingProvider = providers.find((provider) => provider.id === editingProviderId) ?? activeProvider;

  const saveAppConfig = React.useCallback(
    async (patch: Partial<AppConfig> = {}) => {
      if (typeof patch.hasSeenWelcome === "boolean") {
        setHasSeenWelcome(patch.hasSeenWelcome);
      }
      if (typeof patch.hasSeenWorkspaceGuide === "boolean") {
        setHasSeenWorkspaceGuide(patch.hasSeenWorkspaceGuide);
      }
      if ("pendingAdminResume" in patch) {
        setPendingAdminResume(patch.pendingAdminResume ?? null);
      }
      await window.novayxk?.saveConfig({
        providers,
        activeProviderId,
        lastProjectRoot,
        theme,
        aiControlMode,
        hasSeenWelcome,
        hasSeenWorkspaceGuide,
        pendingAdminResume,
        ...patch,
      });
    },
    [activeProviderId, aiControlMode, hasSeenWelcome, hasSeenWorkspaceGuide, lastProjectRoot, pendingAdminResume, providers, theme],
  );

  const savePendingAdminResume = React.useCallback(
    async (nextPendingAdminResume: PendingAdminResume) => {
      await saveAppConfig({ pendingAdminResume: nextPendingAdminResume });
    },
    [saveAppConfig],
  );

  const clearPendingAdminResume = React.useCallback(async () => {
    await saveAppConfig({ pendingAdminResume: null });
  }, [saveAppConfig]);

  const saveProviders = React.useCallback(
    async (nextProviders = providers, nextActiveId = activeProviderId) => {
      const resolvedActiveId = getProviderId(nextProviders, nextActiveId, activeProviderId);
      setProviders(nextProviders);
      setActiveProviderId(resolvedActiveId);
      if (!nextProviders.some((provider) => provider.id === editingProviderId)) {
        setEditingProviderId(resolvedActiveId);
      }
      await saveAppConfig({ providers: nextProviders, activeProviderId: resolvedActiveId });
      setStatus("模型供应商配置已保存");
    },
    [activeProviderId, editingProviderId, providers, saveAppConfig, setStatus],
  );

  const switchActiveProvider = React.useCallback(
    async (providerId: string) => {
      const nextActiveId = getProviderId(providers, providerId, activeProviderId);
      setActiveProviderId(nextActiveId);
      setEditingProviderId(nextActiveId);
      setStatus("已切换模型供应商");
      try {
        await saveAppConfig({ activeProviderId: nextActiveId });
      } catch {
        setStatus("模型已切换，但默认模型保存失败");
      }
    },
    [activeProviderId, providers, saveAppConfig, setStatus],
  );

  const updateTheme = React.useCallback(
    async (nextTheme: ThemeMode) => {
      setTheme(nextTheme);
      try {
        await saveAppConfig({ theme: nextTheme });
      } catch {
        setStatus("主题已切换，但偏好保存失败");
      }
    },
    [saveAppConfig, setStatus],
  );

  const updateAiControlMode = React.useCallback(
    async (nextMode: AiControlMode) => {
      setAiControlMode(nextMode);
      try {
        await saveAppConfig({ aiControlMode: nextMode });
        return true;
      } catch {
        setStatus("执行范围已切换，但保存偏好失败");
        return false;
      }
    },
    [saveAppConfig, setStatus],
  );

  const refreshPrivilegeState = React.useCallback(async () => {
    if (!window.novayxk) return;
    try {
      const nextPrivilege = await window.novayxk.getPrivilege();
      setPrivilege(nextPrivilege);
    } catch {
      setPrivilege(null);
    }
  }, []);

  const restartAsAdmin = React.useCallback(async () => {
    if (!window.novayxk || isRestartingAsAdmin) return false;
    setIsRestartingAsAdmin(true);
    setStatus("正在切换到管理员模式...");
    try {
      await window.novayxk.restartAsAdmin();
      return true;
    } catch (error) {
      setIsRestartingAsAdmin(false);
      setStatus(formatActionableError(error, "切换管理员模式失败"));
      return false;
    }
  }, [isRestartingAsAdmin, setStatus]);

  const saveLastProjectRoot = React.useCallback(
    async (projectRoot: string | null) => {
      setLastProjectRoot(projectRoot);
      await saveAppConfig({ lastProjectRoot: projectRoot });
    },
    [saveAppConfig],
  );

  const updateActiveProvider = React.useCallback(
    (patch: Partial<ProviderConfig>) => {
      const nextProviders = providers.map((provider) =>
        provider.id === editingProvider.id ? { ...provider, ...patch } : provider,
      );
      setProviders(nextProviders);
    },
    [editingProvider.id, providers],
  );

  const addProvider = React.useCallback(() => {
    const id = `provider-${Date.now()}`;
    const nextProvider: ProviderConfig = {
      id,
      name: "新供应商",
      baseUrl: "https://api.example.com/v1",
      apiKey: "",
      model: "model-name",
      apiMode: "chatCompletions",
    };
    setProviders([...providers, nextProvider]);
    setEditingProviderId(id);
    setProviderTestStatus("");
  }, [providers]);

  const removeActiveProvider = React.useCallback(async () => {
    if (providers.length <= 1) {
      setProviderTestStatus("至少保留一个供应商配置。");
      setStatus("至少保留一个供应商配置。");
      return;
    }

    const activeIndex = providers.findIndex((provider) => provider.id === editingProvider.id);
    const nextProviders = providers.filter((provider) => provider.id !== editingProvider.id);
    const fallbackProvider = nextProviders[Math.max(0, Math.min(activeIndex, nextProviders.length - 1))] ?? nextProviders[0];
    const nextActiveId = activeProviderId === editingProvider.id ? fallbackProvider.id : activeProviderId;

    setProviders(nextProviders);
    setActiveProviderId(nextActiveId);
    setEditingProviderId(fallbackProvider.id);
    setProviderTestStatus(`已移除供应商：${editingProvider.name}`);
    setStatus(`已移除供应商：${editingProvider.name}`);
    try {
      await saveAppConfig({ providers: nextProviders, activeProviderId: nextActiveId });
    } catch {
      setStatus("供应商已移除，但保存配置失败");
    }
  }, [activeProviderId, editingProvider.id, editingProvider.name, providers, saveAppConfig, setStatus]);

  const testActiveProvider = React.useCallback(async () => {
    setIsTestingProvider(true);
    setProviderTestStatus("正在测试连接...");
    try {
      if (!window.novayxk) {
        throw createDesktopBridgeUnavailableError("连接测试");
      }

      const result = await window.novayxk.testProvider(editingProvider);
      setProviderTestStatus(result.message);
      setStatus(result.message);
    } catch (error) {
      const message = formatActionableError(error, "连接测试失败");
      setProviderTestStatus(message);
      setStatus(message);
    } finally {
      setIsTestingProvider(false);
    }
  }, [editingProvider, setStatus]);

  return {
    providers,
    setProviders,
    activeProviderId,
    setActiveProviderId,
    editingProviderId,
    setEditingProviderId,
    lastProjectRoot,
    setLastProjectRoot,
    providerTestStatus,
    isTestingProvider,
    aiControlMode,
    hasSeenWelcome,
    hasSeenWorkspaceGuide,
    pendingAdminResume,
    privilege,
    isRestartingAsAdmin,
    theme,
    activeProvider,
    editingProvider,
    saveAppConfig,
    saveProviders,
    savePendingAdminResume,
    switchActiveProvider,
    updateTheme,
    updateAiControlMode,
    refreshPrivilegeState,
    restartAsAdmin,
    clearPendingAdminResume,
    saveLastProjectRoot,
    updateActiveProvider,
    addProvider,
    removeActiveProvider,
    testActiveProvider,
  };
}
