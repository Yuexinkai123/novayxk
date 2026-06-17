import React from "react";
import { Check, MonitorCog, Plus, RefreshCw, Save, ShieldCheck, Sparkles, Trash2, WandSparkles } from "lucide-react";
import type { AppLanguage, ProviderConfig } from "../../vite-env";
import { inferProviderApiMode, isLikelyImageModel } from "../../ai/providers";
import { getLocaleStrings } from "../../app/i18n";

export type PrivilegeState = {
  platform: string;
  isAdmin: boolean;
  canElevate: boolean;
  isDev: boolean;
};

type SettingsModalProps = {
  language: AppLanguage;
  providers: ProviderConfig[];
  activeProviderId: string;
  editingProvider: ProviderConfig;
  providerTestStatus: string;
  isTestingProvider: boolean;
  providerModelOptions: string[];
  providerModelStatus: string;
  isLoadingProviderModels: boolean;
  browserShowAdvancedControls: boolean;
  privilege: PrivilegeState | null;
  isRestartingAsAdmin: boolean;
  onSelectProvider: (providerId: string) => void;
  onAddProvider: () => void;
  onRemoveProvider: () => void;
  onUpdateProvider: (patch: Partial<ProviderConfig>) => void;
  onTestProvider: () => void;
  onReloadModels: () => void;
  onToggleBrowserShowAdvancedControls: (value: boolean) => void;
  onLanguageChange: (next: AppLanguage) => void;
  onRestartAsAdmin: () => void;
  onClose: () => void;
  onSave: () => void;
};

export function SettingsModal({
  language,
  providers,
  activeProviderId,
  editingProvider,
  providerTestStatus,
  isTestingProvider,
  providerModelOptions,
  providerModelStatus,
  isLoadingProviderModels,
  browserShowAdvancedControls,
  privilege,
  isRestartingAsAdmin,
  onSelectProvider,
  onAddProvider,
  onRemoveProvider,
  onUpdateProvider,
  onTestProvider,
  onReloadModels,
  onToggleBrowserShowAdvancedControls,
  onLanguageChange,
  onRestartAsAdmin,
  onClose,
  onSave,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = React.useState<"models" | "browser" | "system">("models");
  const locale = getLocaleStrings(language).settings;
  const modelOptions = React.useMemo(() => {
    return [...new Set(providerModelOptions.map((model) => model.trim()).filter(Boolean))];
  }, [editingProvider.model, providerModelOptions]);
  const selectedModelOption = modelOptions.includes(editingProvider.model.trim()) ? editingProvider.model.trim() : "";

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="settings-modal" role="dialog" aria-modal="true" aria-label={locale.dialogLabel}>
        <div className="modal-header">
          <div>
            <span>{locale.header}</span>
            {/* <h2>连接模型服务，管理系统级权限</h2> */}
          </div>
          <button className="icon-button" onClick={onClose} aria-label={locale.close}>
            <Check size={18} />
          </button>
        </div>

        <div className="settings-section-tabs">
          <button className={activeTab === "models" ? "active" : ""} onClick={() => setActiveTab("models")}>
            <WandSparkles size={15} />
            {locale.tabs.models}
          </button>
          <button className={activeTab === "browser" ? "active" : ""} onClick={() => setActiveTab("browser")}>
            <MonitorCog size={15} />
            {locale.tabs.browser}
          </button>
          <button className={activeTab === "system" ? "active" : ""} onClick={() => setActiveTab("system")}>
            <ShieldCheck size={15} />
            {locale.tabs.system}
          </button>
        </div>

        <div className="settings-page">
          {activeTab === "models" ? (
            <>
              <div className="provider-tabs">
                {providers.map((provider) => (
                  <button
                    key={provider.id}
                    className={provider.id === editingProvider.id ? "active" : ""}
                    onClick={() => onSelectProvider(provider.id)}
                  >
                    {provider.name}
                  </button>
                ))}
                <button onClick={onAddProvider}>
                  <Plus size={15} />
                  {locale.provider.new}
                </button>
              </div>

              <div className="provider-actions-row">
                <button
                  className="ghost-button danger-button"
                  onClick={onRemoveProvider}
                  disabled={providers.length <= 1}
                  title={providers.length <= 1 ? locale.provider.keepAtLeastOne : `${locale.provider.deleteCurrent}: ${editingProvider.name}`}
                >
                  <Trash2 size={16} />
                  {locale.provider.deleteCurrent}
                </button>
                <span>{providers.length <= 1 ? locale.provider.keepAtLeastOne : locale.provider.deleteWithSettings}</span>
              </div>

              <label>
                {locale.provider.name}
                <input value={editingProvider.name} onChange={(event) => onUpdateProvider({ name: event.target.value })} />
              </label>
              <label>
                {locale.provider.baseUrl}
                <input
                  value={editingProvider.baseUrl}
                  onChange={(event) => onUpdateProvider({ baseUrl: event.target.value })}
                  placeholder="https://api.openai.com/v1"
                />
              </label>
              <label>
                {locale.provider.apiKey}
                <input
                  type="password"
                  value={editingProvider.apiKey}
                  onChange={(event) => onUpdateProvider({ apiKey: event.target.value })}
                  placeholder="sk-..."
                />
              </label>
              <label>
                {locale.provider.model}
                <div className="provider-model-row">
                  <div className="provider-model-fields">
                    <div className="provider-model-select-row">
                      <select
                        className="settings-select"
                        value={selectedModelOption}
                        onChange={(event) => {
                          const model = event.target.value;
                          if (!model) return;
                          onUpdateProvider({
                            model,
                            apiMode: inferProviderApiMode(model),
                          });
                        }}
                        disabled={isLoadingProviderModels || modelOptions.length === 0}
                      >
                        <option value="">{locale.provider.chooseFromList}</option>
                        {modelOptions.map((model) => (
                          <option key={model} value={model}>
                            {model}
                            {isLikelyImageModel(model) ? locale.provider.imageSuffix : ""}
                          </option>
                        ))}
                      </select>
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={onReloadModels}
                        disabled={isLoadingProviderModels}
                        title={locale.provider.reloadModelList}
                      >
                        <RefreshCw size={16} />
                        {isLoadingProviderModels ? locale.provider.loading : locale.provider.refreshModels}
                      </button>
                    </div>
                    <input
                      list={`provider-model-options-${editingProvider.id}`}
                      value={editingProvider.model}
                      onChange={(event) => {
                        const model = event.target.value;
                        onUpdateProvider({
                          model,
                          apiMode: inferProviderApiMode(model),
                        });
                      }}
                    />
                    <datalist id={`provider-model-options-${editingProvider.id}`}>
                      {modelOptions.map((model) => (
                        <option key={model} value={model} />
                      ))}
                    </datalist>
                  </div>
                </div>
              </label>
              {providerModelStatus ? <div className="provider-model-hint">{providerModelStatus}</div> : null}
              <label>
                {locale.provider.apiMode}
                <select
                  className="settings-select"
                  value={editingProvider.apiMode ?? "chatCompletions"}
                  onChange={(event) => onUpdateProvider({ apiMode: event.target.value as ProviderConfig["apiMode"] })}
                >
                  <option value="chatCompletions">{locale.provider.chatCompletions}</option>
                  <option value="responses">{locale.provider.responses}</option>
                  <option value="imageGenerations">{locale.provider.imageGeneration}</option>
                </select>
              </label>

              <div className="provider-test-row">
                <button className="ghost-button" onClick={onTestProvider} disabled={isTestingProvider}>
                  <Sparkles size={16} />
                  {locale.provider.testConnection}
                </button>
                <span>{providerTestStatus || locale.provider.testHint}</span>
              </div>
            </>
          ) : null}

          {activeTab === "browser" ? (
            <div className="settings-card">
              <span>{locale.browser.title}</span>
              <strong>{locale.browser.strong}</strong>
              <p>{locale.browser.description}</p>
              <label className="settings-toggle">
                <input
                  type="checkbox"
                  checked={browserShowAdvancedControls}
                  onChange={(event) => onToggleBrowserShowAdvancedControls(event.target.checked)}
                />
                <span>{browserShowAdvancedControls ? locale.browser.showByDefault : locale.browser.hideByDefault}</span>
              </label>
            </div>
          ) : null}

          {activeTab === "system" ? (
            <>
              <div className="settings-card">
                <span>{locale.system.languageTitle}</span>
                <strong>{language === "zh-CN" ? locale.system.chinese : locale.system.english}</strong>
                <p>{locale.system.languageDescription}</p>
                <select
                  className="settings-select"
                  value={language}
                  onChange={(event) => onLanguageChange(event.target.value as AppLanguage)}
                >
                  <option value="en">{locale.system.english}</option>
                  <option value="zh-CN">{locale.system.chinese}</option>
                </select>
              </div>

              <div className={`privilege-panel ${privilege?.isAdmin ? "admin" : ""}`}>
                <div>
                  <span>{locale.system.privilegeTitle}</span>
                  <strong>{privilege?.isAdmin ? locale.system.privilegeAdmin : locale.system.privilegeStandard}</strong>
                  <p>
                    {privilege?.isAdmin
                      ? locale.system.privilegeAdminDescription
                      : locale.system.privilegeStandardDescription}
                  </p>
                </div>
                <button
                  className="ghost-button"
                  onClick={onRestartAsAdmin}
                  disabled={Boolean(privilege?.isAdmin) || !privilege?.canElevate || isRestartingAsAdmin}
                  title={privilege?.isDev ? locale.system.privilegeDevTitle : locale.system.privilegeRestartTitle}
                >
                  <ShieldCheck size={16} />
                  {isRestartingAsAdmin
                    ? locale.system.waitingForConfirmation
                    : privilege?.isAdmin
                      ? locale.system.alreadyAdminMode
                      : locale.system.switchToAdminMode}
                </button>
              </div>
            </>
          ) : null}
        </div>

        <div className="modal-actions">
          <button className="ghost-button" onClick={onClose}>
            {locale.cancel}
          </button>
          <button className="primary-button" onClick={onSave}>
            <Save size={17} />
            {locale.save}
          </button>
        </div>
      </section>
    </div>
  );
}
