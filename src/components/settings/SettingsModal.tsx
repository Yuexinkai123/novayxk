import React from "react";
import { Check, Plus, Save, ShieldCheck, Sparkles, Trash2 } from "lucide-react";
import type { ProviderConfig } from "../../vite-env";

export type PrivilegeState = {
  platform: string;
  isAdmin: boolean;
  canElevate: boolean;
  isDev: boolean;
};

type SettingsModalProps = {
  providers: ProviderConfig[];
  activeProviderId: string;
  editingProvider: ProviderConfig;
  providerTestStatus: string;
  isTestingProvider: boolean;
  privilege: PrivilegeState | null;
  isRestartingAsAdmin: boolean;
  onSelectProvider: (providerId: string) => void;
  onAddProvider: () => void;
  onRemoveProvider: () => void;
  onUpdateProvider: (patch: Partial<ProviderConfig>) => void;
  onTestProvider: () => void;
  onRestartAsAdmin: () => void;
  onClose: () => void;
  onSave: () => void;
};

export function SettingsModal({
  providers,
  activeProviderId,
  editingProvider,
  providerTestStatus,
  isTestingProvider,
  privilege,
  isRestartingAsAdmin,
  onSelectProvider,
  onAddProvider,
  onRemoveProvider,
  onUpdateProvider,
  onTestProvider,
  onRestartAsAdmin,
  onClose,
  onSave,
}: SettingsModalProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="settings-modal" role="dialog" aria-modal="true" aria-label="模型供应商设置">
        <div className="modal-header">
          <div>
            <span>模型与系统</span>
            <h2>连接模型服务，管理系统级权限</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="关闭设置">
            <Check size={18} />
          </button>
        </div>

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
            新增
          </button>
        </div>

        <div className="provider-actions-row">
          <button
            className="ghost-button danger-button"
            onClick={onRemoveProvider}
            disabled={providers.length <= 1}
            title={providers.length <= 1 ? "至少保留一个供应商配置" : `删除 ${editingProvider.name}`}
          >
            <Trash2 size={16} />
            删除当前供应商
          </button>
          <span>{providers.length <= 1 ? "至少保留一个供应商配置。" : "删除后会在保存配置时一并持久化。"}</span>
        </div>

        <label>
          名称
          <input value={editingProvider.name} onChange={(event) => onUpdateProvider({ name: event.target.value })} />
        </label>
        <label>
          Base URL
          <input
            value={editingProvider.baseUrl}
            onChange={(event) => onUpdateProvider({ baseUrl: event.target.value })}
            placeholder="https://api.openai.com/v1"
          />
        </label>
        <label>
          API Key
          <input
            type="password"
            value={editingProvider.apiKey}
            onChange={(event) => onUpdateProvider({ apiKey: event.target.value })}
            placeholder="sk-..."
          />
        </label>
        <label>
          Model
          <input value={editingProvider.model} onChange={(event) => onUpdateProvider({ model: event.target.value })} />
        </label>
        <label>
          接口类型
          <select
            className="settings-select"
            value={editingProvider.apiMode ?? "chatCompletions"}
            onChange={(event) => onUpdateProvider({ apiMode: event.target.value as ProviderConfig["apiMode"] })}
          >
            <option value="chatCompletions">Chat Completions (/chat/completions)</option>
            <option value="responses">Responses API (/responses)</option>
          </select>
        </label>

        <div className="provider-test-row">
          <button className="ghost-button" onClick={onTestProvider} disabled={isTestingProvider}>
            <Sparkles size={16} />
            测试连接
          </button>
          <span>{providerTestStatus || "保存前可以先测试供应商是否可用。API Key 会优先保存在当前 Windows 账户下的本地加密存储中。"}</span>
        </div>

        <div className={`privilege-panel ${privilege?.isAdmin ? "admin" : ""}`}>
          <div>
            <span>Windows 系统权限</span>
            <strong>{privilege?.isAdmin ? "当前可执行系统级操作" : "当前仅有普通系统权限"}</strong>
            <p>
              {privilege?.isAdmin
                ? "安装软件、修改系统设置、处理注册表和受保护目录时，会直接使用当前管理员权限。"
                : "遇到安装软件、受保护目录或系统设置修改时，可以通过 Windows UAC 切换到管理员模式后重试。"}
            </p>
          </div>
          <button
            className="ghost-button"
            onClick={onRestartAsAdmin}
            disabled={Boolean(privilege?.isAdmin) || !privilege?.canElevate || isRestartingAsAdmin}
            title={privilege?.isDev ? "开发模式下请打包后测试管理员模式" : "通过 Windows UAC 以管理员权限重启 Novayxk"}
          >
            <ShieldCheck size={16} />
            {isRestartingAsAdmin ? "等待确认" : privilege?.isAdmin ? "已进入管理员模式" : "切换到管理员模式"}
          </button>
        </div>

        <div className="modal-actions">
          <button className="ghost-button" onClick={onClose}>
            取消
          </button>
          <button className="primary-button" onClick={onSave}>
            <Save size={17} />
            保存配置
          </button>
        </div>
      </section>
    </div>
  );
}
