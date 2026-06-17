import React from "react";
import { Check, ChevronsDown, Copy, Play, Plus, RotateCcw } from "lucide-react";
import type { AppLanguage, TerminalTask } from "../../vite-env";
import { getLocaleStrings } from "../../app/i18n";
import { TerminalOutput } from "./TerminalOutput";

type TerminalPanelProps = {
  language: AppLanguage;
  canUndoPatch: boolean;
  isLoading: boolean;
  hasPatchPreview: boolean;
  hasProject: boolean;
  fileOpsPreviewCount: number;
  terminalTasks: TerminalTask[];
  activeTerminalTask: TerminalTask | null;
  runningTerminalTaskCount: number;
  projectRoot: string | null;
  onUndoPatch: () => void;
  onAskApplyPatch: () => void;
  onAskApplyFileOps: () => void;
  onCopyTerminalOutput: () => void;
  onCollapse: () => void;
  onSelectTerminalTask: (taskId: string) => void;
};

export function TerminalPanel({
  language,
  canUndoPatch,
  isLoading,
  hasPatchPreview,
  hasProject,
  fileOpsPreviewCount,
  terminalTasks,
  activeTerminalTask,
  runningTerminalTaskCount,
  projectRoot,
  onUndoPatch,
  onAskApplyPatch,
  onAskApplyFileOps,
  onCopyTerminalOutput,
  onCollapse,
  onSelectTerminalTask,
}: TerminalPanelProps) {
  const strings = getLocaleStrings(language).terminal;

  return (
    <div className="terminal-panel">
      <div className="mini-heading split-heading">
        <span>
          <Play size={16} />
          {strings.title}
        </span>
        <div className="terminal-actions">
          <button onClick={onUndoPatch} disabled={!canUndoPatch || isLoading} title={strings.undoLastPatch}>
            <RotateCcw size={14} />
          </button>
          <button onClick={onAskApplyPatch} disabled={!hasPatchPreview || !hasProject || isLoading} title={strings.applyPatch}>
            <Check size={14} />
          </button>
          <button onClick={onAskApplyFileOps} disabled={!fileOpsPreviewCount || !hasProject || isLoading} title={strings.runFileOperations}>
            <Plus size={14} />
          </button>
          <button onClick={onCopyTerminalOutput} disabled={!activeTerminalTask?.output} title={strings.copyOutput}>
            <Copy size={14} />
          </button>
          <button className="panel-collapse-button mini" onClick={onCollapse} title={strings.hideBottomTools}>
            <ChevronsDown size={14} />
          </button>
        </div>
      </div>
      <div className="terminal-body">
        <div className="terminal-task-list">
          {terminalTasks.length ? (
            terminalTasks.map((task) => (
              <button
                key={task.id}
                className={`terminal-task ${task.id === activeTerminalTask?.id ? "active" : ""}`}
                onClick={() => onSelectTerminalTask(task.id)}
                title={task.command}
              >
                <span className={`terminal-dot ${task.needsInput ? "needs-input" : task.status}`} />
                <strong>{task.title}</strong>
                <small>{formatLocalizedTerminalStatus(task, strings)}</small>
              </button>
            ))
          ) : (
            <div className="terminal-empty">{strings.empty}</div>
          )}
        </div>
        <TerminalOutput activeTerminalTask={activeTerminalTask} language={language} />
      </div>
      <div className="terminal-footer">
        <span>{runningTerminalTaskCount} {strings.running}</span>
        <span>{activeTerminalTask ? activeTerminalTask.cwd : projectRoot || strings.noProjectOpened}</span>
      </div>
    </div>
  );
}

function formatLocalizedTerminalStatus(task: TerminalTask, strings: ReturnType<typeof getLocaleStrings>["terminal"]) {
  const suffix = task.userIntervened ? ` · ${strings.statusIntervened}` : "";
  if (task.status === "running" && task.needsInput) return `${strings.statusWaiting}${suffix}`;
  if (task.status === "running") return `${strings.statusRunning}${suffix}`;
  if (task.status === "stopped") return `${strings.statusStopped}${suffix}`;
  if (task.status === "failed") return `${`${strings.statusFailed} ${task.code ?? ""}`.trim()}${suffix}`;
  return `${strings.statusExited} ${task.code ?? 0}${suffix}`;
}
