import React from "react";
import { Check, TriangleAlert } from "lucide-react";
import type { FileOperation } from "../../vite-env";

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
  dialog: ConfirmDialogState;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({ dialog, onCancel, onConfirm }: ConfirmDialogProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="confirm-modal" role="dialog" aria-modal="true" aria-label="确认操作">
        <div className="modal-header">
          <div>
            <span>{getDialogEyebrow(dialog)}</span>
            <h2>{getDialogTitle(dialog)}</h2>
          </div>
          <TriangleAlert size={23} />
        </div>

        <ConfirmDialogBody dialog={dialog} />

        <div className="modal-actions">
          <button className="ghost-button" onClick={onCancel}>
            取消
          </button>
          <button className="primary-button" onClick={onConfirm}>
            <Check size={17} />
            {dialog.type === "system-action" ? `确认${dialog.label}` : "确认"}
          </button>
        </div>
      </section>
    </div>
  );
}

function ConfirmDialogBody({ dialog }: { dialog: ConfirmDialogState }) {
  if (dialog.type === "command") {
    return (
      <>
        <p className="confirm-copy">命令将在当前项目根目录执行。请确认它符合你的预期。</p>
        <pre className="confirm-preview">{dialog.command}</pre>
      </>
    );
  }

  if (dialog.type === "patch") {
    return (
      <>
        <p className="confirm-copy">Novayxk 将按 unified diff 修改以下文件，并保留一次撤销记录。</p>
        <ul className="file-confirm-list">
          {(dialog.files.length ? dialog.files : ["未能从补丁头解析文件名"]).map((file) => (
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
            ? "Novayxk 将在当前项目内执行以下文件操作，其中包含删除路径。请特别确认删除目标、覆盖行为和影响范围。"
            : "Novayxk 将在当前项目内执行以下文件操作。请确认路径和覆盖行为符合预期。"}
        </p>
        <ul className="file-confirm-list">
          {dialog.operations.map((operation, index) => (
            <li key={`${operation.type}-${operation.path}-${index}`}>
              {operation.type === "mkdir"
                ? "创建目录"
                : operation.type === "delete"
                  ? "删除路径"
                  : operation.type === "replace"
                    ? "替换文本"
                    : operation.overwrite
                      ? "覆盖写入"
                      : "写入文件"}
              ：{operation.path}
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
          {dialog.source === "ai" ? "AI 请求执行的命令" : "你准备执行的命令"}
          需要更高的 Windows 系统权限：{dialog.reason}。确认后 Novayxk 会触发 Windows UAC 并以管理员模式重启；当前命令不会在重启前自动执行。
        </p>
        <pre className="confirm-preview">{dialog.command}</pre>
      </>
    );
  }

  return (
    <>
      <p className="confirm-copy">
        {dialog.source === "ai" ? "AI 请求执行特殊系统动作。" : "你正在执行特殊系统动作。"}
        这个动作可能会立即中断当前工作，请确认所有文件已经保存。
      </p>
      <pre className="confirm-preview">{dialog.command}</pre>
    </>
  );
}

function getDialogEyebrow(dialog: ConfirmDialogState) {
  if (dialog.type === "command") return "命令确认";
  if (dialog.type === "patch") return "补丁确认";
  if (dialog.type === "fileops") return "文件操作确认";
  if (dialog.type === "admin-request") return "Windows 管理员授权";
  return "系统动作确认";
}

function getDialogTitle(dialog: ConfirmDialogState) {
  if (dialog.type === "command") return "确认执行命令";
  if (dialog.type === "patch") return "确认应用代码补丁";
  if (dialog.type === "fileops") return "确认执行文件操作";
  if (dialog.type === "admin-request") return "需要 Windows 管理员权限";
  return `确认${dialog.label}`;
}
