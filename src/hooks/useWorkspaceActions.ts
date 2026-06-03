import React from "react";
import { extractFileOps, extractPatch, extractPatchFiles } from "../ai/chat";
import type { AiControlMode, ChatMessage, FileOperation, ProjectPayload } from "../vite-env";
import type { ConfirmDialogState } from "../components/dialogs/ConfirmDialog";
import { createDesktopBridgeUnavailableError, formatActionableError } from "../app/errors";

type SelectedFile = { path: string; content: string } | null;

type UseWorkspaceActionsOptions = {
  displayedMessage: string;
  project: ProjectPayload | null;
  selectedFile: SelectedFile;
  canUndoPatch: boolean;
  isLoading: boolean;
  setIsLoading: (value: boolean) => void;
  setStatus: (status: string) => void;
  setCanUndoPatch: (value: boolean) => void;
  setConfirmDialog: (dialog: ConfirmDialogState | null) => void;
  stopRequestedRef: React.MutableRefObject<boolean>;
  privilege: { isAdmin: boolean; canElevate: boolean } | null;
  prepareAdminCommandResume: (payload: {
    command: string;
    source: "manual" | "ai";
    controlMode: AiControlMode;
    taskId?: string | null;
    messages?: ChatMessage[];
  }) => Promise<void>;
  clearPendingAdminResume: () => Promise<void>;
  requestAdminForCommandIfNeeded: (
    command: string,
    inspection: { requiresAdmin?: boolean; adminReason?: string },
    source: "manual" | "ai",
  ) => Promise<"ready" | "restarting" | "cancelled">;
  confirmSystemAction: (command: string, label: string, source: "manual" | "ai") => Promise<boolean>;
  syncProjectView: (options?: { preferredPath?: string | null; clearMissingSelection?: boolean }) => Promise<void>;
};

export function useWorkspaceActions({
  displayedMessage,
  project,
  selectedFile,
  canUndoPatch,
  isLoading,
  setIsLoading,
  setStatus,
  setCanUndoPatch,
  setConfirmDialog,
  stopRequestedRef,
  privilege,
  prepareAdminCommandResume,
  clearPendingAdminResume,
  requestAdminForCommandIfNeeded,
  confirmSystemAction,
  syncProjectView,
}: UseWorkspaceActionsOptions) {
  const patchPreview = React.useMemo(() => extractPatch(displayedMessage), [displayedMessage]);
  const fileOpsPreview = React.useMemo(() => extractFileOps(displayedMessage), [displayedMessage]);

  async function executeConfirmedCommand(confirmedCommand: string) {
    stopRequestedRef.current = false;
    setIsLoading(true);
    setStatus("正在执行命令...");
    try {
      if (!window.novayxk) {
        throw createDesktopBridgeUnavailableError("执行命令");
      }
      const inspection = await window.novayxk.inspectCommand(confirmedCommand);
      const needsAdminRestart = inspection.requiresAdmin && !privilege?.isAdmin && privilege?.canElevate;
      if (needsAdminRestart) {
        await prepareAdminCommandResume({
          command: confirmedCommand,
          source: "manual",
          controlMode: "full",
        });
      }
      const adminState = await requestAdminForCommandIfNeeded(confirmedCommand, inspection, "manual");
      if (adminState !== "ready") {
        if (adminState === "cancelled" && needsAdminRestart) {
          await clearPendingAdminResume();
        }
        return;
      }
      if (needsAdminRestart) {
        await clearPendingAdminResume();
      }
      const confirmedSystemAction = inspection.requiresConfirmation
        ? await confirmSystemAction(confirmedCommand, inspection.systemAction?.label ?? "系统动作", "manual")
        : false;
      if (inspection.requiresConfirmation && !confirmedSystemAction) {
        setStatus("已取消特殊系统动作");
        return;
      }
      const result = await window.novayxk.runCommandWithMode({
        command: confirmedCommand,
        controlMode: "full",
        confirmedSystemAction,
      });
      if (stopRequestedRef.current) {
        setStatus("已停止终端任务");
        return;
      }
      await syncProjectView();
      setStatus(result.longRunning ? "命令已在终端任务中运行" : result.code === 0 ? "命令执行成功" : "命令执行失败，输出已保留");
    } catch (error) {
      setStatus(formatActionableError(error, "命令执行失败"));
    } finally {
      setIsLoading(false);
      stopRequestedRef.current = false;
    }
  }

  function askApplyPatch() {
    if (!patchPreview) {
      setStatus("没有可应用的补丁。");
      return;
    }
    if (!project) {
      setStatus("请先打开一个项目。");
      return;
    }

    setConfirmDialog({
      type: "patch",
      patchText: patchPreview,
      files: extractPatchFiles(patchPreview),
    });
  }

  async function applyConfirmedPatch(patchText: string) {
    setIsLoading(true);
    setStatus("正在应用补丁...");
    try {
      if (!window.novayxk) {
        throw createDesktopBridgeUnavailableError("应用补丁");
      }
      const result = await window.novayxk.applyPatch(patchText);
      setCanUndoPatch(result.canUndo ?? true);
      await syncProjectView({
        preferredPath: selectedFile && result.changedFiles.includes(selectedFile.path) ? selectedFile.path : null,
      });
      setStatus(`已应用补丁：${result.changedFiles.join(", ")}`);
    } catch (error) {
      setStatus(formatActionableError(error, "应用补丁失败"));
    } finally {
      setIsLoading(false);
    }
  }

  function askApplyFileOps() {
    if (!fileOpsPreview.length) {
      setStatus("没有可执行的文件操作。");
      return;
    }
    if (!project) {
      setStatus("请先打开一个项目。");
      return;
    }

    setConfirmDialog({
      type: "fileops",
      operations: fileOpsPreview,
    });
  }

  async function applyConfirmedFileOps(operations: FileOperation[]) {
    setIsLoading(true);
    setStatus("正在执行文件操作...");
    try {
      if (!window.novayxk) {
        throw createDesktopBridgeUnavailableError("执行文件操作");
      }
      const result = await window.novayxk.applyFileOps(operations);
      const firstWrittenFile = operations.find((operation) => operation.type === "write")?.path ?? null;
      const selectedWasChanged = selectedFile ? result.changedFiles.includes(selectedFile.path) : false;
      await syncProjectView({
        preferredPath: selectedWasChanged ? selectedFile?.path ?? null : firstWrittenFile,
      });
      setStatus(`已执行文件操作：${result.changedFiles.join(", ")}`);
    } catch (error) {
      setStatus(formatActionableError(error, "执行文件操作失败"));
    } finally {
      setIsLoading(false);
    }
  }

  async function undoPatch() {
    if (!canUndoPatch || isLoading) return;
    setIsLoading(true);
    setStatus("正在撤销上次补丁...");
    try {
      if (!window.novayxk) {
        throw createDesktopBridgeUnavailableError("撤销补丁");
      }
      const result = await window.novayxk.undoLastPatch();
      setCanUndoPatch(result.canUndo ?? false);
      await syncProjectView({
        preferredPath: selectedFile && result.restoredFiles.includes(selectedFile.path) ? selectedFile.path : null,
      });
      setStatus(`已撤销补丁：${result.restoredFiles.join(", ")}`);
    } catch (error) {
      setStatus(formatActionableError(error, "撤销补丁失败"));
    } finally {
      setIsLoading(false);
    }
  }

  return {
    patchPreview,
    fileOpsPreview,
    executeConfirmedCommand,
    askApplyPatch,
    applyConfirmedPatch,
    askApplyFileOps,
    applyConfirmedFileOps,
    undoPatch,
  };
}
