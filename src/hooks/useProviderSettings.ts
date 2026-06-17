import React from "react";
import type { AppConfig, AiControlMode, AppLanguage, AssistantMode, LanguagePreferenceSource, PendingAdminResume, ProviderConfig, ThemeMode } from "../vite-env";
import { defaultProvider, getProviderId, inferProviderApiMode, isAiControlMode, isAssistantMode, isThemeMode } from "../ai/providers";
import type { PrivilegeState } from "../components/settings/SettingsModal";
import { createDesktopBridgeUnavailableError, formatActionableError } from "../app/errors";

type UseProviderSettingsOptions = {
  initialConfig: Partial<AppConfig>;
  setStatus: (status: string) => void;
};

export function useProviderSettings({ initialConfig, setStatus }: UseProviderSettingsOptions) {
  const initialProviders = initialConfig?.providers?.length ? initialConfig.providers : [defaultProvider];
  const initialActiveProviderId = getProviderId(initialProviders, initialConfig?.activeProviderId, initialProviders[0].id);
  const initialLanguage: AppLanguage = initialConfig?.language === "zh-CN" ? "zh-CN" : "en";
  const initialLanguagePreferenceSource: LanguagePreferenceSource = initialConfig?.languagePreferenceSource === "user" ? "user" : "system";
  const initialTheme = isThemeMode(initialConfig?.theme) ? initialConfig.theme : "dark";
  const initialAiControlMode = isAiControlMode(initialConfig?.aiControlMode) ? initialConfig.aiControlMode : "safe";
  const initialAssistantMode = isAssistantMode(initialConfig?.assistantMode) ? initialConfig.assistantMode : "standard";
  const initialBrowserShowAdvancedControls = initialConfig?.browserShowAdvancedControls === true;

  const [providers, setProviders] = React.useState<ProviderConfig[]>(initialProviders);
  const [activeProviderId, setActiveProviderId] = React.useState(initialActiveProviderId);
  const [editingProviderId, setEditingProviderId] = React.useState(initialActiveProviderId);
  const [lastProjectRoot, setLastProjectRoot] = React.useState<string | null>(initialConfig?.lastProjectRoot ?? null);
  const [language, setLanguage] = React.useState<AppLanguage>(initialLanguage);
  const [languagePreferenceSource, setLanguagePreferenceSource] = React.useState<LanguagePreferenceSource>(initialLanguagePreferenceSource);
  const [providerTestStatus, setProviderTestStatus] = React.useState("");
  const [isTestingProvider, setIsTestingProvider] = React.useState(false);
  const [providerModelOptions, setProviderModelOptions] = React.useState<Record<string, string[]>>({});
  const [providerModelStatuses, setProviderModelStatuses] = React.useState<Record<string, string>>({});
  const [isLoadingProviderModels, setIsLoadingProviderModels] = React.useState(false);
  const [aiControlMode, setAiControlMode] = React.useState<AiControlMode>(initialAiControlMode);
  const [assistantMode, setAssistantMode] = React.useState<AssistantMode>(initialAssistantMode);
  const [hasSeenWelcome, setHasSeenWelcome] = React.useState(initialConfig?.hasSeenWelcome === true);
  const [hasSeenWorkspaceGuide, setHasSeenWorkspaceGuide] = React.useState(initialConfig?.hasSeenWorkspaceGuide === true);
  const [pendingAdminResume, setPendingAdminResume] = React.useState<PendingAdminResume | null>(
    initialConfig?.pendingAdminResume ?? null,
  );
  const [privilege, setPrivilege] = React.useState<PrivilegeState | null>(null);
  const [isRestartingAsAdmin, setIsRestartingAsAdmin] = React.useState(false);
  const [theme, setTheme] = React.useState<ThemeMode>(initialTheme);
  const [browserShowAdvancedControls, setBrowserShowAdvancedControls] = React.useState(initialBrowserShowAdvancedControls);

  const activeProvider = providers.find((provider) => provider.id === activeProviderId) ?? providers[0] ?? defaultProvider;
  const editingProvider = providers.find((provider) => provider.id === editingProviderId) ?? activeProvider;
  const providerModelStatus = providerModelStatuses[editingProvider.id] ?? "";
  const lastModelLoadSignatureRef = React.useRef<Record<string, string>>({});

  const saveAppConfig = React.useCallback(
    async (patch: Partial<AppConfig> = {}) => {
      if (typeof patch.hasSeenWelcome === "boolean") {
        setHasSeenWelcome(patch.hasSeenWelcome);
      }
      if (typeof patch.hasSeenWorkspaceGuide === "boolean") {
        setHasSeenWorkspaceGuide(patch.hasSeenWorkspaceGuide);
      }
      if (patch.language === "en" || patch.language === "zh-CN") {
        setLanguage(patch.language);
      }
      if (patch.languagePreferenceSource === "user" || patch.languagePreferenceSource === "system") {
        setLanguagePreferenceSource(patch.languagePreferenceSource);
      }
      if ("pendingAdminResume" in patch) {
        setPendingAdminResume(patch.pendingAdminResume ?? null);
      }
      await window.novayxk?.saveConfig({
        providers,
        activeProviderId,
        lastProjectRoot,
        language,
        languagePreferenceSource,
        theme,
        aiControlMode,
        assistantMode,
        browserShowAdvancedControls,
        hasSeenWelcome,
        hasSeenWorkspaceGuide,
        pendingAdminResume,
        ...patch,
      });
    },
    [activeProviderId, aiControlMode, assistantMode, browserShowAdvancedControls, hasSeenWelcome, hasSeenWorkspaceGuide, language, languagePreferenceSource, lastProjectRoot, pendingAdminResume, providers, theme],
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
      setStatus("Model provider settings saved");
    },
    [activeProviderId, editingProviderId, providers, saveAppConfig, setStatus],
  );

  const switchActiveProvider = React.useCallback(
    async (providerId: string) => {
      const nextActiveId = getProviderId(providers, providerId, activeProviderId);
      setActiveProviderId(nextActiveId);
      setEditingProviderId(nextActiveId);
      setStatus("Switched the model provider");
      try {
        await saveAppConfig({ activeProviderId: nextActiveId });
      } catch {
        setStatus("The model provider was switched, but the default selection could not be saved");
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
        setStatus("Theme switched, but the preference could not be saved");
      }
    },
    [saveAppConfig, setStatus],
  );

  const updateLanguage = React.useCallback(
    async (nextLanguage: AppLanguage) => {
      setLanguage(nextLanguage);
      setLanguagePreferenceSource("user");
      try {
        await saveAppConfig({ language: nextLanguage, languagePreferenceSource: "user" });
        setStatus(nextLanguage === "zh-CN" ? "语言已切换为简体中文" : "Language switched to English");
        return true;
      } catch {
        setStatus(nextLanguage === "zh-CN" ? "语言已切换，但保存偏好失败" : "Language switched, but the preference could not be saved");
        return false;
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
        setStatus("Execution scope switched, but the preference could not be saved");
        return false;
      }
    },
    [saveAppConfig, setStatus],
  );

  const updateAssistantMode = React.useCallback(
    async (nextMode: AssistantMode) => {
      setAssistantMode(nextMode);
      try {
        await saveAppConfig({ assistantMode: nextMode });
        return true;
      } catch {
        setStatus("Assistant mode switched, but the preference could not be saved");
        return false;
      }
    },
    [saveAppConfig, setStatus],
  );

  const updateBrowserShowAdvancedControls = React.useCallback(
    async (nextValue: boolean) => {
      setBrowserShowAdvancedControls(nextValue);
      try {
        await saveAppConfig({ browserShowAdvancedControls: nextValue });
        return true;
      } catch {
        setStatus("The browser advanced controls preference was switched, but it could not be saved");
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
    setStatus("Switching to Administrator Mode...");
    try {
      await window.novayxk.restartAsAdmin();
      return true;
    } catch (error) {
      setIsRestartingAsAdmin(false);
      setStatus(formatActionableError(error, "Failed to switch to Administrator Mode"));
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
      name: "New provider",
      baseUrl: "https://api.example.com/v1",
      apiKey: "",
      model: "",
      apiMode: "chatCompletions",
    };
    setProviders([...providers, nextProvider]);
    setEditingProviderId(id);
    setProviderTestStatus("");
  }, [providers]);

  const removeActiveProvider = React.useCallback(async () => {
    if (providers.length <= 1) {
      setProviderTestStatus("Keep at least one provider configuration.");
      setStatus("Keep at least one provider configuration.");
      return;
    }

    const activeIndex = providers.findIndex((provider) => provider.id === editingProvider.id);
    const nextProviders = providers.filter((provider) => provider.id !== editingProvider.id);
    const fallbackProvider = nextProviders[Math.max(0, Math.min(activeIndex, nextProviders.length - 1))] ?? nextProviders[0];
    const nextActiveId = activeProviderId === editingProvider.id ? fallbackProvider.id : activeProviderId;

    setProviders(nextProviders);
    setActiveProviderId(nextActiveId);
    setEditingProviderId(fallbackProvider.id);
    setProviderTestStatus(`Removed provider: ${editingProvider.name}`);
    setStatus(`Removed provider: ${editingProvider.name}`);
    try {
      await saveAppConfig({ providers: nextProviders, activeProviderId: nextActiveId });
    } catch {
      setStatus("The provider was removed, but saving the configuration failed");
    }
  }, [activeProviderId, editingProvider.id, editingProvider.name, providers, saveAppConfig, setStatus]);

  const testActiveProvider = React.useCallback(async () => {
    setIsTestingProvider(true);
    setProviderTestStatus("Testing the connection...");
    try {
      if (!window.novayxk) {
        throw createDesktopBridgeUnavailableError("Testing the connection");
      }

      const result = await window.novayxk.testProvider(editingProvider);
      setProviderTestStatus(result.message);
      setStatus(result.message);
    } catch (error) {
      const message = formatActionableError(error, "Connection test failed");
      setProviderTestStatus(message);
      setStatus(message);
    } finally {
      setIsTestingProvider(false);
    }
  }, [editingProvider, setStatus]);

  const loadProviderModels = React.useCallback(
    async (provider: ProviderConfig, options: { silent?: boolean; force?: boolean } = {}) => {
      const baseUrl = provider.baseUrl.trim();
      const apiKey = provider.apiKey.trim();
      if (!baseUrl || !apiKey) {
        setProviderModelStatuses((current) => ({
          ...current,
          [provider.id]: "",
        }));
        return [];
      }

      const signature = `${baseUrl}\n${apiKey}\n${provider.apiMode ?? "chatCompletions"}`;
      if (!options.force && lastModelLoadSignatureRef.current[provider.id] === signature && providerModelOptions[provider.id]?.length) {
        return providerModelOptions[provider.id];
      }

      setIsLoadingProviderModels(true);
      if (!options.silent) {
        setProviderModelStatuses((current) => ({ ...current, [provider.id]: "Loading the model list..." }));
      }
      try {
        if (!window.novayxk) {
          throw createDesktopBridgeUnavailableError("Loading the model list");
        }

        const result = await window.novayxk.listProviderModels(provider);
        const models = Array.isArray(result.models) ? result.models.filter(Boolean) : [];
        setProviderModelOptions((current) => ({ ...current, [provider.id]: models }));
        lastModelLoadSignatureRef.current[provider.id] = signature;
        setProviderModelStatuses((current) => ({
          ...current,
          [provider.id]: result.message || `Loaded ${models.length} model(s)`,
        }));

        if (models.length && !provider.model.trim()) {
          updateActiveProvider({
            model: models[0],
            apiMode: inferProviderApiMode(models[0]),
          });
        }
        return models;
      } catch (error) {
        const message = formatActionableError(error, "Failed to load the model list");
        setProviderModelStatuses((current) => ({ ...current, [provider.id]: message }));
        if (!options.silent) {
          setStatus(message);
        }
        return [];
      } finally {
        setIsLoadingProviderModels(false);
      }
    },
    [providerModelOptions, setStatus, updateActiveProvider],
  );

  React.useEffect(() => {
    const baseUrl = editingProvider.baseUrl.trim();
    const apiKey = editingProvider.apiKey.trim();
    if (!baseUrl || !apiKey) {
      setProviderModelStatuses((current) => ({
        ...current,
        [editingProvider.id]: "",
      }));
      return;
    }

    const timer = window.setTimeout(() => {
      void loadProviderModels(editingProvider, { silent: true });
    }, 500);

    return () => window.clearTimeout(timer);
  }, [editingProvider.baseUrl, editingProvider.apiKey, editingProvider.apiMode, editingProvider.id, loadProviderModels]);

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
    providerModelOptions,
    providerModelStatus,
    isLoadingProviderModels,
    aiControlMode,
    assistantMode,
    hasSeenWelcome,
    hasSeenWorkspaceGuide,
    pendingAdminResume,
    privilege,
    isRestartingAsAdmin,
    language,
    theme,
    browserShowAdvancedControls,
    activeProvider,
    editingProvider,
    saveAppConfig,
    saveProviders,
    savePendingAdminResume,
    switchActiveProvider,
    updateLanguage,
    updateTheme,
    updateAiControlMode,
    updateAssistantMode,
    updateBrowserShowAdvancedControls,
    refreshPrivilegeState,
    restartAsAdmin,
    clearPendingAdminResume,
    saveLastProjectRoot,
    updateActiveProvider,
    addProvider,
    removeActiveProvider,
    testActiveProvider,
    loadProviderModels,
  };
}
