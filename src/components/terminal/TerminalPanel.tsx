import React from "react";
import { Check, ChevronsDown, Copy, Play, Plus, RotateCcw } from "lucide-react";
import type { TerminalTask } from "../../vite-env";
import { formatTerminalStatus } from "../../terminal/commands";
import { TerminalOutput } from "./TerminalOutput";

type TerminalPanelProps = {
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
  return (
    <div className="terminal-panel">
      <div className="mini-heading split-heading">
        <span>
          <Play size={16} />
          终端任务
        </span>
        <div className="terminal-actions">
          <button onClick={onUndoPatch} disabled={!canUndoPatch || isLoading} title="撤销上次补丁">
            <RotateCcw size={14} />
          </button>
          <button onClick={onAskApplyPatch} disabled={!hasPatchPreview || !hasProject || isLoading} title="应用补丁">
            <Check size={14} />
          </button>
          <button onClick={onAskApplyFileOps} disabled={!fileOpsPreviewCount || !hasProject || isLoading} title="执行文件操作">
            <Plus size={14} />
          </button>
          <button onClick={onCopyTerminalOutput} disabled={!activeTerminalTask?.output} title="复制输出">
            <Copy size={14} />
          </button>
          <button className="panel-collapse-button mini" onClick={onCollapse} title="隐藏底部工具区">
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
                <small>{formatTerminalStatus(task)}</small>
              </button>
            ))
          ) : (
            <div className="terminal-empty">暂无终端任务</div>
          )}
        </div>
        <TerminalOutput activeTerminalTask={activeTerminalTask} />
      </div>
      <div className="terminal-footer">
        <span>{runningTerminalTaskCount} 个运行中</span>
        <span>{activeTerminalTask ? activeTerminalTask.cwd : projectRoot || "未打开项目"}</span>
      </div>
    </div>
  );
}
