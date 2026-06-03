import React from "react";
import { Check, FilePlus2, FolderPlus } from "lucide-react";

export type CreateEntryDialogState = {
  kind: "file" | "directory";
  path: string;
};

type CreateEntryDialogProps = {
  dialog: CreateEntryDialogState;
  projectLabel: string;
  canSubmit: boolean;
  onPathChange: (path: string) => void;
  onCancel: () => void;
  onSubmit: () => void;
};

export function CreateEntryDialog({
  dialog,
  projectLabel,
  canSubmit,
  onPathChange,
  onCancel,
  onSubmit,
}: CreateEntryDialogProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="confirm-modal create-entry-modal"
        role="dialog"
        aria-modal="true"
        aria-label={dialog.kind === "file" ? "新建文件" : "新建文件夹"}
      >
        <div className="modal-header">
          <div>
            <span>{dialog.kind === "file" ? "新建文件" : "新建文件夹"}</span>
            <h2>{projectLabel}</h2>
          </div>
          {dialog.kind === "file" ? <FilePlus2 size={23} /> : <FolderPlus size={23} />}
        </div>
        <label className="create-entry-field">
          路径
          <input
            autoFocus
            value={dialog.path}
            onChange={(event) => onPathChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onSubmit();
              if (event.key === "Escape") onCancel();
            }}
            placeholder={dialog.kind === "file" ? "src/new-file.ts" : "src/new-folder"}
          />
        </label>
        <p className="memory-hint">路径相对于当前项目根目录。可以输入子目录，例如 src/components/Button.tsx。</p>
        <div className="modal-actions">
          <button className="ghost-button" onClick={onCancel}>
            取消
          </button>
          <button className="primary-button" onClick={onSubmit} disabled={!canSubmit}>
            <Check size={17} />
            创建
          </button>
        </div>
      </section>
    </div>
  );
}
