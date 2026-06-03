import React from "react";
import { BookOpen, Bot, ChevronsRight, History, KeyRound, Plus, Save, Send, Square } from "lucide-react";
import type { ChatMessage, TaskSummary } from "../../vite-env";
import { formatElapsedSeconds } from "../../ai/providers";
import { formatTaskLabel, stripContext } from "../../ai/chat";
import { MarkdownView } from "../MarkdownView";

type AssistantPanelProps = {
  isCollapsed: boolean;
  model: string;
  hasProject: boolean;
  isModelReady: boolean;
  activeTaskId: string | null;
  activeTaskTitle: string;
  activeTask: TaskSummary | null;
  tasks: TaskSummary[];
  projectMemoryLength: number;
  messages: ChatMessage[];
  isLoading: boolean;
  loadingElapsedMs: number;
  prompt: string;
  isStopping: boolean;
  runningTerminalTaskCount: number;
  promptFocusNonce: number;
  chatListRef: React.RefObject<HTMLDivElement | null>;
  onCollapse: () => void;
  onLoadTask: (taskId: string) => void;
  onStartNewTask: () => void;
  onSaveCurrentTask: () => void;
  onOpenMemory: () => void;
  onTaskTitleChange: (title: string) => void;
  onTaskTitleBlur: () => void;
  onPromptChange: (prompt: string) => void;
  onSendMessage: () => void;
  onStopGeneration: () => void;
};

export function AssistantPanel({
  isCollapsed,
  model,
  hasProject,
  isModelReady,
  activeTaskId,
  activeTaskTitle,
  activeTask,
  tasks,
  projectMemoryLength,
  messages,
  isLoading,
  loadingElapsedMs,
  prompt,
  isStopping,
  runningTerminalTaskCount,
  promptFocusNonce,
  chatListRef,
  onCollapse,
  onLoadTask,
  onStartNewTask,
  onSaveCurrentTask,
  onOpenMemory,
  onTaskTitleChange,
  onTaskTitleBlur,
  onPromptChange,
  onSendMessage,
  onStopGeneration,
}: AssistantPanelProps) {
  const promptInputRef = React.useRef<HTMLTextAreaElement | null>(null);

  React.useEffect(() => {
    if (isCollapsed || promptFocusNonce === 0) return;
    const timer = window.setTimeout(() => {
      const textarea = promptInputRef.current;
      if (!textarea) return;
      textarea.focus();
      const cursor = textarea.value.length;
      textarea.setSelectionRange(cursor, cursor);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [isCollapsed, promptFocusNonce]);

  return (
    <aside className="assistant-panel" aria-hidden={isCollapsed}>
      <div className="panel-heading">
        <div>
          <span>助手</span>
          <strong>{model}</strong>
        </div>
        <button className="panel-collapse-button" onClick={onCollapse} title="隐藏助手栏">
          <ChevronsRight size={15} />
        </button>
      </div>

      <div className="task-strip">
        <div className="task-row">
          <select
            className="task-select"
            value={activeTaskId ?? ""}
            onChange={(event) => {
              if (event.target.value) onLoadTask(event.target.value);
              else onStartNewTask();
            }}
            disabled={!hasProject}
            aria-label="选择任务历史"
          >
            <option value="">新任务</option>
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                {formatTaskLabel(task)}
              </option>
            ))}
          </select>
          <button className="task-icon-button" onClick={onSaveCurrentTask} disabled={!hasProject} title="保存任务">
            <Save size={15} />
          </button>
          <button className="task-icon-button" onClick={onStartNewTask} disabled={!hasProject} title="新建任务">
            <Plus size={15} />
          </button>
          <button className="task-icon-button" onClick={onOpenMemory} disabled={!hasProject} title="项目记忆">
            <BookOpen size={15} />
          </button>
        </div>
        <input
          className="task-title-input"
          value={activeTaskTitle}
          onChange={(event) => onTaskTitleChange(event.target.value)}
          onBlur={onTaskTitleBlur}
          disabled={!hasProject}
          aria-label="任务标题"
        />
        <div className="task-meta">
          <History size={13} />
          <span>
            {activeTask
              ? `${activeTask.messageCount} 条消息 / ${tasks.length} 份历史`
              : `${projectMemoryLength} 字项目记忆`}
          </span>
        </div>
      </div>

      <div className="chat-list" ref={chatListRef}>
        {messages.map((message, index) => (
          <article key={`${message.role}-${index}`} className={`chat-message ${message.role}`}>
            <div className="avatar">{message.role === "assistant" ? <Bot size={16} /> : <KeyRound size={16} />}</div>
            <div className="message-body">
              <MarkdownView content={stripContext(message.content)} />
              {message.role === "assistant" && typeof message.elapsedMs === "number" ? (
                <div className="message-meta">处理 {formatElapsedSeconds(message.elapsedMs)}</div>
              ) : null}
            </div>
          </article>
        ))}
        {isLoading && (
          <article className="chat-message assistant">
            <div className="avatar">
              <Bot size={16} />
            </div>
            <div className="message-body">
              <MarkdownView content="正在处理..." />
              <div className="message-meta">已处理 {formatElapsedSeconds(loadingElapsedMs)}</div>
            </div>
          </article>
        )}
      </div>

      <div className="prompt-box">
        <textarea
          ref={promptInputRef}
          aria-label="助手输入框"
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              onSendMessage();
            }
          }}
          placeholder={
            isModelReady
              ? "发消息.."
              : "先到“设置”里配置模型连接，测试通过后再开始对话"
          }
        />
        <button
          className={`send-button ${isLoading ? "stop" : ""}`}
          onClick={isLoading ? onStopGeneration : onSendMessage}
          disabled={isLoading ? isStopping : !prompt.trim() || !isModelReady}
          title={isLoading ? (runningTerminalTaskCount ? "停止生成和终端任务" : "停止生成") : "发送"}
        >
          {isLoading ? <Square size={16} /> : <Send size={18} />}
        </button>
      </div>
    </aside>
  );
}
