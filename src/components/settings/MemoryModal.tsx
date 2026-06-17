import React from "react";
import { BookOpen, Save } from "lucide-react";
import type { AppLanguage } from "../../vite-env";
import { getLocaleStrings } from "../../app/i18n";

type MemoryModalProps = {
  language: AppLanguage;
  projectLabel: string;
  memoryDraft: string;
  canSave: boolean;
  onMemoryDraftChange: (memory: string) => void;
  onClose: () => void;
  onSave: () => void;
};

export function MemoryModal({
  language,
  projectLabel,
  memoryDraft,
  canSave,
  onMemoryDraftChange,
  onClose,
  onSave,
}: MemoryModalProps) {
  const locale = getLocaleStrings(language).memory;
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="memory-modal" role="dialog" aria-modal="true" aria-label={locale.dialogLabel}>
        <div className="modal-header">
          <div>
            <span>{locale.header}</span>
            <h2>{projectLabel}</h2>
          </div>
          <BookOpen size={23} />
        </div>
        <textarea
          className="memory-editor"
          value={memoryDraft}
          onChange={(event) => onMemoryDraftChange(event.target.value)}
          placeholder={locale.placeholder}
        />
        <p className="memory-hint">{locale.hint}</p>
        <div className="modal-actions">
          <button className="ghost-button" onClick={onClose}>
            {locale.cancel}
          </button>
          <button className="primary-button" onClick={onSave} disabled={!canSave}>
            <Save size={17} />
            {locale.save}
          </button>
        </div>
      </section>
    </div>
  );
}
