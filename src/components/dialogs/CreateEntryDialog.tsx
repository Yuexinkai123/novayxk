import React from "react";
import { Check, FilePlus2, FolderPlus } from "lucide-react";
import type { AppLanguage } from "../../vite-env";
import { getLocaleStrings } from "../../app/i18n";

export type CreateEntryDialogState = {
  kind: "file" | "directory";
  path: string;
};

type CreateEntryDialogProps = {
  language: AppLanguage;
  dialog: CreateEntryDialogState;
  projectLabel: string;
  canSubmit: boolean;
  onPathChange: (path: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

export function CreateEntryDialog({
  language,
  dialog,
  projectLabel,
  canSubmit,
  onPathChange,
  onCancel,
  onSubmit,
}: CreateEntryDialogProps) {
  const strings = getLocaleStrings(language).createEntry;
  const createLabel = dialog.kind === "file" ? strings.createFile : strings.createFolder;

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="confirm-modal create-entry-modal"
        role="dialog"
        aria-modal="true"
        aria-label={createLabel}
      >
        <div className="modal-header">
          <div>
            <span>{createLabel}</span>
            <h2>{projectLabel}</h2>
          </div>
          {dialog.kind === "file" ? <FilePlus2 size={23} /> : <FolderPlus size={23} />}
        </div>
        <label className="create-entry-field">
          {strings.path}
          <input
            autoFocus
            value={dialog.path}
            onChange={(event) => onPathChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSubmit();
              if (event.key === "Escape") onCancel();
            }}
            placeholder={dialog.kind === "file" ? strings.filePlaceholder : strings.folderPlaceholder}
          />
        </label>
        <p className="memory-hint">{strings.hint}</p>
        <div className="modal-actions">
          <button className="ghost-button" onClick={onCancel}>
            {strings.cancel}
          </button>
          <button className="primary-button" onClick={onSubmit} disabled={!canSubmit}>
            <Check size={17} />
            {strings.create}
          </button>
        </div>
      </section>
    </div>
  );
}
