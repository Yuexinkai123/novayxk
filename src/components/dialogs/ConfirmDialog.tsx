import React from "react";
import { Check, TriangleAlert } from "lucide-react";
import type { AppLanguage, FileOperation } from "../../vite-env";
import { getLocaleStrings } from "../../app/i18n";

export type ConfirmDialogState =
  | {
      type: "command";
      command: string;
      reason: string;
    }
  | {
      type: "patch";
      patchText: string;
      files: string[];
    }
  | {
      type: "fileops";
      operations: FileOperation[];
    }
  | {
      type: "system-action";
      command: string;
      label: string;
      source: "manual" | "ai";
      resolve: (confirmed: boolean) => void;
    }
  | {
      type: "admin-request";
      command: string;
      reason: string;
      source: "manual" | "ai";
      resolve: (confirmed: boolean) => void;
    };

type ConfirmDialogProps = {
  language: AppLanguage;
  dialog: ConfirmDialogState;
  onCancel: () => void;
  onConfirm: () => void;
};

type ConfirmDialogStrings = ReturnType<typeof getLocaleStrings>["dialogs"];

export function ConfirmDialog({ language, dialog, onCancel, onConfirm }: ConfirmDialogProps) {
  const strings = getLocaleStrings(language).dialogs;

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="confirm-modal" role="dialog" aria-modal="true" aria-label={strings.confirmAction}>
        <div className="modal-header">
          <div>
            <span>{getDialogEyebrow(dialog, strings)}</span>
            <h2>{getDialogTitle(dialog, strings)}</h2>
          </div>
          <TriangleAlert size={23} />
        </div>

        <ConfirmDialogBody dialog={dialog} strings={strings} />

        <div className="modal-actions">
          <button className="ghost-button" onClick={onCancel}>
            {strings.cancel}
          </button>
          <button className="primary-button" onClick={onConfirm}>
            <Check size={17} />
            {dialog.type === "system-action" ? `${strings.confirm} ${dialog.label}` : strings.confirm}
          </button>
        </div>
      </section>
    </div>
  );
}

function ConfirmDialogBody({ dialog, strings }: { dialog: ConfirmDialogState; strings: ConfirmDialogStrings }) {
  if (dialog.type === "command") {
    return (
      <>
        <p className="confirm-copy">{strings.commandCopy}</p>
        <pre className="confirm-preview">{dialog.command}</pre>
      </>
    );
  }

  if (dialog.type === "patch") {
    return (
      <>
        <p className="confirm-copy">{strings.patchCopy}</p>
        <ul className="file-confirm-list">
          {(dialog.files.length ? dialog.files : [strings.patchFallback]).map((file) => (
            <li key={file}>{file}</li>
          ))}
        </ul>
      </>
    );
  }

  if (dialog.type === "fileops") {
    const hasDeleteOperation = dialog.operations.some((operation) => operation.type === "delete");
    return (
      <>
        <p className="confirm-copy">
            {hasDeleteOperation
            ? strings.fileopsDeleteCopy
            : strings.fileopsCopy}
        </p>
        <ul className="file-confirm-list">
          {dialog.operations.map((operation, index) => (
            <li key={`${operation.type}-${operation.path}-${index}`}>
              {operation.type === "mkdir"
                ? strings.createDirectory
                : operation.type === "delete"
                  ? strings.deletePath
                  : operation.type === "replace"
                    ? strings.replaceText
                    : operation.overwrite
                      ? strings.overwriteFile
                      : strings.writeFile}
              : {operation.path}
            </li>
          ))}
        </ul>
      </>
    );
  }

  if (dialog.type === "admin-request") {
    return (
      <>
        <p className="confirm-copy">
          {dialog.source === "ai" ? strings.aiCommandPrefix : strings.manualCommandPrefix}
          {" "}{strings.adminRequires}: {dialog.reason}. {strings.adminCopySuffix}
        </p>
        <pre className="confirm-preview">{dialog.command}</pre>
      </>
    );
  }

  return (
    <>
      <p className="confirm-copy">
        {dialog.source === "ai" ? strings.aiSystemAction : strings.manualSystemAction}
        {" "}{strings.systemActionSuffix}
      </p>
      <pre className="confirm-preview">{dialog.command}</pre>
    </>
  );
}

function getDialogEyebrow(dialog: ConfirmDialogState, strings: ConfirmDialogStrings) {
  if (dialog.type === "command") return strings.commandEyebrow;
  if (dialog.type === "patch") return strings.patchEyebrow;
  if (dialog.type === "fileops") return strings.fileopsEyebrow;
  if (dialog.type === "admin-request") return strings.adminEyebrow;
  return strings.systemActionEyebrow;
}

function getDialogTitle(dialog: ConfirmDialogState, strings: ConfirmDialogStrings) {
  if (dialog.type === "command") return strings.commandTitle;
  if (dialog.type === "patch") return strings.patchTitle;
  if (dialog.type === "fileops") return strings.fileopsTitle;
  if (dialog.type === "admin-request") return strings.adminTitle;
  return `${strings.confirm} ${dialog.label}`;
}
