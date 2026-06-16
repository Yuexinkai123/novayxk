import React from "react";
import type { AiControlMode, ChatMessage, TerminalTask } from "../vite-env";
import { upsertTerminalTask as upsertTerminalTaskItem } from "../terminal/commands";
import { formatActionableError, getDesktopBridgeUnavailableMessage } from "../app/errors";

type CommandInspection = {
  allowed: boolean;
  reason: string;
  requiresAdmin?: boolean;
  adminReason?: string;
  requiresConfirmation?: boolean;
  systemAction?: {
    action: string;
    label: string;
  };
};

type UseTerminalTasksOptions = {
  aiControlMode: AiControlMode;
  privilege: { isAdmin: boolean; canElevate: boolean } | null;
  setStatus: (status: string) => void;
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
    inspection: CommandInspection,
    source: "manual" | "ai",
  ) => Promise<"ready" | "restarting" | "cancelled">;
  confirmSystemAction: (command: string, label: string, source: "manual" | "ai") => Promise<boolean>;
  onTaskNeedsInput: (task: TerminalTask) => void;
};

export function useTerminalTasks({
  aiControlMode,
  privilege,
  setStatus,
  prepareAdminCommandResume,
  clearPendingAdminResume,
  requestAdminForCommandIfNeeded,
  confirmSystemAction,
  onTaskNeedsInput,
}: UseTerminalTasksOptions) {
  const [terminalCommand, setTerminalCommand] = React.useState("npm run dev");
  const [terminalTasks, setTerminalTasks] = React.useState<TerminalTask[]>([]);
  const [activeTerminalTaskId, setActiveTerminalTaskId] = React.useState<string | null>(null);
  const activeTerminalTask = terminalTasks.find((task) => task.id === activeTerminalTaskId) ?? terminalTasks[0] ?? null;
  const runningTerminalTaskCount = terminalTasks.filter((task) => task.status === "running").length;

  const upsertTerminalTask = React.useCallback((task: TerminalTask) => {
    setTerminalTasks((current) => upsertTerminalTaskItem(current, task));
  }, []);

  const refreshTerminalTasks = React.useCallback(async () => {
    if (!window.novayxk) return;
    try {
      const tasks = await window.novayxk.listTerminalTasks();
      setTerminalTasks(tasks);
      setActiveTerminalTaskId((current) => current ?? tasks[0]?.id ?? null);
    } catch (error) {
      setStatus(formatActionableError(error, "读取终端任务失败"));
    }
  }, [setStatus]);

  React.useEffect(() => {
    if (!window.novayxk) return;
    void refreshTerminalTasks();
    return window.novayxk.onTerminalTaskUpdate((payload) => {
      setTerminalTasks((current) => upsertTerminalTaskItem(current, payload.task));
      setActiveTerminalTaskId((current) => (payload.event === "started" ? payload.task.id : current ?? payload.task.id));
      if (payload.task.status === "running" && payload.task.needsInput) {
        setActiveTerminalTaskId(payload.task.id);
        onTaskNeedsInput(payload.task);
      }
    });
  }, [onTaskNeedsInput, refreshTerminalTasks]);

  const startTerminalTask = React.useCallback(async () => {
    const command = terminalCommand.trim();
    if (!command) {
      setStatus("请输入要启动的终端命令。");
      return;
    }
    if (!window.novayxk) {
      setStatus(getDesktopBridgeUnavailableMessage("启动终端任务"));
      return;
    }

    try {
      const inspection = await window.novayxk.inspectCommand(command);
      const needsAdminRestart = inspection.requiresAdmin && !privilege?.isAdmin && privilege?.canElevate;
      if (needsAdminRestart) {
        await prepareAdminCommandResume({
          command,
          source: "manual",
          controlMode: aiControlMode,
        });
      }
      const adminState = await requestAdminForCommandIfNeeded(command, inspection, "manual");
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
        ? await confirmSystemAction(command, inspection.systemAction?.label ?? "系统动作", "manual")
        : false;
      if (inspection.requiresConfirmation && !confirmedSystemAction) {
        setStatus("已取消特殊系统动作");
        return;
      }
      const task = await window.novayxk.startTerminalTask({
        command,
        controlMode: aiControlMode,
        confirmedSystemAction,
      });
      upsertTerminalTask(task);
      setActiveTerminalTaskId(task.id);
      setStatus(`终端任务已启动：${task.title}`);
    } catch (error) {
      setStatus(formatActionableError(error, "启动终端任务失败"));
    }
  }, [
    aiControlMode,
    clearPendingAdminResume,
    confirmSystemAction,
    prepareAdminCommandResume,
    privilege?.canElevate,
    privilege?.isAdmin,
    requestAdminForCommandIfNeeded,
    setStatus,
    terminalCommand,
    upsertTerminalTask,
  ]);

  const stopActiveTerminalTask = React.useCallback(async () => {
    if (!activeTerminalTask || !window.novayxk) return;
    try {
      const task = await window.novayxk.stopTerminalTask(activeTerminalTask.id);
      upsertTerminalTask(task);
      setStatus(`正在停止终端任务：${task.title}`);
    } catch (error) {
      setStatus(formatActionableError(error, "停止终端任务失败"));
    }
  }, [activeTerminalTask, setStatus, upsertTerminalTask]);

  const restartActiveTerminalTask = React.useCallback(async () => {
    if (!activeTerminalTask || !window.novayxk) return;
    try {
      const task = await window.novayxk.restartTerminalTask(activeTerminalTask.id);
      upsertTerminalTask(task);
      setActiveTerminalTaskId(task.id);
      setStatus(`终端任务已重启：${task.title}`);
    } catch (error) {
      setStatus(formatActionableError(error, "重启终端任务失败"));
    }
  }, [activeTerminalTask, setStatus, upsertTerminalTask]);

  const copyTerminalOutput = React.useCallback(async () => {
    if (!activeTerminalTask?.output) return;
    try {
      await navigator.clipboard.writeText(activeTerminalTask.output);
      setStatus("终端输出已复制");
    } catch {
      setStatus("复制终端输出失败");
    }
  }, [activeTerminalTask, setStatus]);

  return {
    terminalCommand,
    setTerminalCommand,
    terminalTasks,
    activeTerminalTask,
    runningTerminalTaskCount,
    setActiveTerminalTaskId,
    upsertTerminalTask,
    startTerminalTask,
    stopActiveTerminalTask,
    restartActiveTerminalTask,
    copyTerminalOutput,
  };
}
