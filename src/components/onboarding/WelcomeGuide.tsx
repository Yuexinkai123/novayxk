import React from "react";
import { BookOpen, FolderOpen, PlayCircle, Settings, ShieldCheck, Sparkles } from "lucide-react";
import type { AppLanguage } from "../../vite-env";
import { getLocaleStrings } from "../../app/i18n";

type WelcomeGuideProps = {
  language: AppLanguage;
  onOpenSettings: () => void;
  onOpenProject: () => void;
  onDismiss: () => void;
};

export function WelcomeGuide({ language, onOpenSettings, onOpenProject, onDismiss }: WelcomeGuideProps) {
  const strings = getLocaleStrings(language).welcome;

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="welcome-modal" role="dialog" aria-modal="true" aria-label={strings.ariaLabel}>
        <div className="welcome-hero">
          <span className="welcome-kicker">{strings.kicker}</span>
          <h2>{strings.title}</h2>
          <p>{strings.body}</p>
        </div>

        <div className="welcome-grid">
          <article className="welcome-card">
            <div className="welcome-card-icon">
              <Settings size={18} />
            </div>
            <strong>{strings.connectTitle}</strong>
            <p>{strings.connectBody}</p>
          </article>
          <article className="welcome-card">
            <div className="welcome-card-icon">
              <FolderOpen size={18} />
            </div>
            <strong>{strings.projectTitle}</strong>
            <p>{strings.projectBody}</p>
          </article>
          <article className="welcome-card">
            <div className="welcome-card-icon">
              <Sparkles size={18} />
            </div>
            <strong>{strings.askTitle}</strong>
            <p>{strings.askBody}</p>
          </article>
        </div>

        <div className="welcome-notes">
          <div className="welcome-note">
            <ShieldCheck size={15} />
            <span>{strings.executionNote}</span>
          </div>
          <div className="welcome-note">
            <BookOpen size={15} />
            <span>{strings.storageNote}</span>
          </div>
        </div>

        <div className="modal-actions">
          <button className="ghost-button" onClick={onDismiss}>
            {strings.maybeLater}
          </button>
          <button className="ghost-button" onClick={onOpenSettings}>
            <Settings size={16} />
            {strings.configureModelFirst}
          </button>
          <button className="primary-button" onClick={onOpenProject}>
            <PlayCircle size={16} />
            {strings.openProject}
          </button>
        </div>
      </section>
    </div>
  );
}
