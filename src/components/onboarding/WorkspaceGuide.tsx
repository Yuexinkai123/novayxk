import React from "react";
import { FolderOpen, MessageSquareText, Settings, Sparkles } from "lucide-react";
import type { WorkspaceGuideKind } from "../../app/workspaceGuide";
import type { AppLanguage } from "../../vite-env";
import { getLocaleStrings } from "../../app/i18n";

type WorkspaceGuideProps = {
  language: AppLanguage;
  kind: Exclude<WorkspaceGuideKind, null>;
  onOpenSettings: () => void;
  onOpenProject: () => void;
  onUsePrompt: (prompt: string) => void;
};

export function WorkspaceGuide({ language, kind, onOpenSettings, onOpenProject, onUsePrompt }: WorkspaceGuideProps) {
  const strings = getLocaleStrings(language).workspaceGuide;

  if (kind === "configure-model") {
    return (
      <section className="workspace-guide">
        <div className="workspace-guide-header">
          <div className="workspace-guide-icon">
            <Settings size={18} />
          </div>
          <div>
            <strong>{strings.configureTitle}</strong>
            <p>{strings.configureBody}</p>
          </div>
        </div>
        <div className="workspace-guide-actions">
          <button className="ghost-button" onClick={onOpenSettings}>
            <Settings size={16} />
            {strings.openSettings}
          </button>
        </div>
      </section>
    );
  }

  if (kind === "open-project") {
    return (
      <section className="workspace-guide">
        <div className="workspace-guide-header">
          <div className="workspace-guide-icon">
            <FolderOpen size={18} />
          </div>
          <div>
            <strong>{strings.openProjectTitle}</strong>
            <p>{strings.openProjectBody}</p>
          </div>
        </div>
        <div className="workspace-guide-actions">
          <button className="primary-button" onClick={onOpenProject}>
            <FolderOpen size={16} />
            {strings.openLocalProject}
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="workspace-guide">
      <div className="workspace-guide-header">
        <div className="workspace-guide-icon">
          <Sparkles size={18} />
        </div>
        <div>
          <strong>{strings.readyTitle}</strong>
          <p>{strings.readyBody}</p>
        </div>
      </div>
      <div className="workspace-guide-prompt-list">
        {strings.prompts.map((prompt) => (
          <button key={prompt} className="workspace-guide-prompt" onClick={() => onUsePrompt(prompt)}>
            <MessageSquareText size={14} />
            {prompt}
          </button>
        ))}
      </div>
    </section>
  );
}
