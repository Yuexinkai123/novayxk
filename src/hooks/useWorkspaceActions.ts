import React from "react";
import { extractFileOps, extractPatch, extractPatchFiles } from "../ai/chat";
import type { AiControlMode, ChatMessage, FileOperation, ProjectPayload, ProjectSelectedFile } from "../vite-env";
import type { ConfirmDialogState } from "../components/dialogs/ConfirmDialog";
import { createDesktopBridgeUnavailableError, formatActionableError } from "../app/errors";

type UseWorkspaceActionsOptions = {
  displayedMessage: string;
  project: ProjectPayload | null;
  selectedFile: ProjectSelectedFile | null;
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
    setStatus("Running the command...");
    try {
      if (!window.novayxk) {
        throw createDesktopBridgeUnavailableError("Running a command");
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
        ? await confirmSystemAction(confirmedCommand, inspection.systemAction?.label ?? "System action", "manual")
        : false;
      if (inspection.requiresConfirmation && !confirmedSystemAction) {
        setStatus("Cancelled the special system action");
        return;
      }
      const result = await window.novayxk.runCommandWithMode({
        command: confirmedCommand,
        controlMode: "full",
        confirmedSystemAction,
      });
      if (stopRequestedRef.current) {
        setStatus("Stopped the terminal task");
        return;
      }
      await syncProjectView();
      setStatus(result.longRunning ? "The command is running as a terminal task" : result.code === 0 ? "Command completed successfully" : "Command failed, and the output was kept");
    } catch (error) {
      setStatus(formatActionableError(error, "Command execution failed"));
    } finally {
      setIsLoading(false);
      stopRequestedRef.current = false;
    }
  }

  function askApplyPatch() {
    if (!patchPreview) {
      setStatus("No patch is available to apply.");
      return;
    }
    if (!project) {
      setStatus("Open a project first.");
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
    setStatus("Applying the patch...");
    try {
      if (!window.novayxk) {
        throw createDesktopBridgeUnavailableError("Applying a patch");
      }
      const result = await window.novayxk.applyPatch(patchText);
      setCanUndoPatch(result.canUndo ?? true);
      await syncProjectView({
        preferredPath: selectedFile && result.changedFiles.includes(selectedFile.path) ? selectedFile.path : null,
      });
      setStatus(`Patch applied: ${result.changedFiles.join(", ")}`);
    } catch (error) {
      setStatus(formatActionableError(error, "Failed to apply the patch"));
    } finally {
      setIsLoading(false);
    }
  }

  function askApplyFileOps() {
    if (!fileOpsPreview.length) {
      setStatus("No file operations are available to run.");
      return;
    }
    if (!project) {
      setStatus("Open a project first.");
      return;
    }

    setConfirmDialog({
      type: "fileops",
      operations: fileOpsPreview,
    });
  }

  async function applyConfirmedFileOps(operations: FileOperation[]) {
    setIsLoading(true);
    setStatus("Running file operations...");
    try {
      if (!window.novayxk) {
        throw createDesktopBridgeUnavailableError("Running file operations");
      }
      const result = await window.novayxk.applyFileOps(operations);
      const firstWrittenFile =
        operations.find((operation) => operation.type === "write" || operation.type === "replace")?.path ?? null;
      const selectedWasChanged = selectedFile ? result.changedFiles.includes(selectedFile.path) : false;
      await syncProjectView({
        preferredPath: selectedWasChanged ? selectedFile?.path ?? null : firstWrittenFile,
      });
      setStatus(`File operations completed: ${result.changedFiles.join(", ")}`);
    } catch (error) {
      setStatus(formatActionableError(error, "Failed to run file operations"));
    } finally {
      setIsLoading(false);
    }
  }

  async function undoPatch() {
    if (!canUndoPatch || isLoading) return;
    setIsLoading(true);
    setStatus("Undoing the last patch...");
    try {
      if (!window.novayxk) {
        throw createDesktopBridgeUnavailableError("Undoing a patch");
      }
      const result = await window.novayxk.undoLastPatch();
      setCanUndoPatch(result.canUndo ?? false);
      await syncProjectView({
        preferredPath: selectedFile && result.restoredFiles.includes(selectedFile.path) ? selectedFile.path : null,
      });
      setStatus(`Patch undone: ${result.restoredFiles.join(", ")}`);
    } catch (error) {
      setStatus(formatActionableError(error, "Failed to undo the patch"));
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
