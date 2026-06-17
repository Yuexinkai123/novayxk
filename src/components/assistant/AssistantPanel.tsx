import React from "react";
import { createPortal } from "react-dom";
import { BookOpen, Bot, Brain, ChevronsRight, Copy, ExternalLink, Gauge, History, Image as ImageIcon, KeyRound, Leaf, Pencil, Plus, RotateCcw, Save, Send, Square, X } from "lucide-react";
import type { AppLanguage, AssistantMode, ChatMessage, GeneratedImageAttachment, TaskSummary } from "../../vite-env";
import { formatElapsedSeconds } from "../../ai/providers";
import { formatTaskLabel, stripContext } from "../../ai/chat";
import { getLocaleStrings } from "../../app/i18n";
import { MarkdownView } from "../MarkdownView";

type AssistantStrings = ReturnType<typeof getLocaleStrings>["assistant"];
type AssistantImageStrings = AssistantStrings["images"];

type AssistantPanelProps = {
  isCollapsed: boolean;
  language: AppLanguage;
  model: string;
  assistantMode: AssistantMode;
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
  editingMessageIndex: number | null;
  chatListRef: React.RefObject<HTMLDivElement | null>;
  onCollapse: () => void;
  onLoadTask: (taskId: string) => void;
  onStartNewTask: () => void;
  onSaveCurrentTask: () => void;
  onOpenMemory: () => void;
  onTaskTitleChange: (title: string) => void;
  onTaskTitleBlur: () => void;
  onPromptChange: (prompt: string) => void;
  onSendMessage: (promptOverride?: string) => void;
  onAssistantModeChange: (mode: AssistantMode) => void | Promise<void>;
  onStopGeneration: () => void;
  onEditPreviousPrompt: (index: number) => void;
};

export function AssistantPanel({
  isCollapsed,
  language,
  model,
  assistantMode,
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
  editingMessageIndex,
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
  onAssistantModeChange,
  onStopGeneration,
  onEditPreviousPrompt,
}: AssistantPanelProps) {
  const promptInputRef = React.useRef<HTMLTextAreaElement | null>(null);
  const isPromptComposingRef = React.useRef(false);
  const isSubmittingPromptRef = React.useRef(false);
  const lastSubmittedPromptRef = React.useRef("");
  const modeMenuRef = React.useRef<HTMLDivElement | null>(null);
  const [isModeMenuOpen, setIsModeMenuOpen] = React.useState(false);
  const strings = getLocaleStrings(language).assistant;

  const submitPrompt = React.useCallback(() => {
    const currentPrompt = promptInputRef.current?.value ?? prompt;
    const trimmed = currentPrompt.trim();
    if (!trimmed) return;
    isSubmittingPromptRef.current = true;
    lastSubmittedPromptRef.current = currentPrompt;
    onSendMessage(currentPrompt);
    window.setTimeout(() => {
      isSubmittingPromptRef.current = false;
      lastSubmittedPromptRef.current = "";
    }, 0);
  }, [onSendMessage, prompt]);

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

  React.useEffect(() => {
    if (!isModeMenuOpen) return;
    const closeMenu = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Node && modeMenuRef.current?.contains(target)) return;
      setIsModeMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsModeMenuOpen(false);
    };
    const closeOnBlur = () => setIsModeMenuOpen(false);
    window.addEventListener("mousedown", closeMenu);
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("blur", closeOnBlur);
    return () => {
      window.removeEventListener("mousedown", closeMenu);
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("blur", closeOnBlur);
    };
  }, [isModeMenuOpen]);

  const lastUserMessageIndex = React.useMemo(() => {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index]?.role === "user") return index;
    }
    return -1;
  }, [messages]);

  return (
    <aside className="assistant-panel" aria-hidden={isCollapsed}>
      <div className="panel-heading">
        <div>
          {/* <span>助手</span> */}
          <strong>{model}</strong>
        </div>
        <button className="panel-collapse-button" onClick={onCollapse} title={strings.hidePanel}>
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
            aria-label={strings.chooseTaskHistory}
          >
            <option value="">{strings.newTask}</option>
            {tasks.map((task) => (
              <option key={task.id} value={task.id}>
                {formatTaskLabel(task)}
              </option>
            ))}
          </select>
          <input
            className="task-title-input"
            value={activeTaskTitle}
            onChange={(event) => onTaskTitleChange(event.target.value)}
            onBlur={onTaskTitleBlur}
            disabled={!hasProject}
            aria-label={strings.taskTitle}
          />
          <button className="task-icon-button" onClick={onSaveCurrentTask} disabled={!hasProject} title={strings.saveTask}>
            <Save size={15} />
          </button>
          <button className="task-icon-button" onClick={onStartNewTask} disabled={!hasProject} title={strings.createNewTask}>
            <Plus size={15} />
          </button>
          <button className="task-icon-button" onClick={onOpenMemory} disabled={!hasProject} title={strings.projectMemory}>
            <BookOpen size={15} />
          </button>
        </div>
        <div className="task-meta">
          <History size={13} />
          <span>
            {activeTask
              ? `${activeTask.messageCount} ${strings.messages} / ${tasks.length} ${strings.savedTasks}`
              : `${projectMemoryLength} ${strings.projectMemoryChars}`}
          </span>
        </div>
      </div>

      <div className="chat-list" ref={chatListRef}>
        {messages.map((message, index) => (
          <article key={`${message.role}-${index}`} className={`chat-message ${message.role}`}>
            <div className="avatar">{message.role === "assistant" ? <Bot size={16} /> : <KeyRound size={16} />}</div>
            <div className="message-body">
              {message.role === "user" && index === lastUserMessageIndex ? (
                <button
                  type="button"
                  className={`message-edit-button ${editingMessageIndex === index ? "active" : ""}`}
                  onClick={() => onEditPreviousPrompt(index)}
                  title={strings.editLastPrompt}
                  disabled={isLoading}
                >
                  <Pencil size={13} />
                </button>
              ) : null}
              <MarkdownView content={stripContext(message.content)} language={language} />
              <MessageAttachments attachments={message.attachments} strings={strings.images} />
              {message.role === "assistant" ? (
                <MessageMeta elapsedMs={message.elapsedMs} tokenUsage={message.tokenUsage} strings={strings} />
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
              <MarkdownView content={strings.working} language={language} />
              <div className="message-meta">{strings.elapsed} {formatElapsedSeconds(loadingElapsedMs)}</div>
            </div>
          </article>
        )}
      </div>

      <div className="prompt-box">
        <textarea
          ref={promptInputRef}
          aria-label={strings.inputLabel}
          value={prompt}
          onChange={(event) => {
            if (isSubmittingPromptRef.current && event.target.value === lastSubmittedPromptRef.current) {
              return;
            }
            onPromptChange(event.target.value);
          }}
          onCompositionStart={() => {
            isPromptComposingRef.current = true;
          }}
          onCompositionEnd={() => {
            isPromptComposingRef.current = false;
          }}
          onKeyDown={(event) => {
            if (isPromptComposingRef.current || event.nativeEvent.isComposing) {
              return;
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submitPrompt();
            }
          }}
          placeholder={
            isModelReady
              ? strings.sendPlaceholder
              : strings.configureModelPlaceholder
          }
        />
        <div className="prompt-mode-control" ref={modeMenuRef}>
          <button
            type="button"
            className={`prompt-mode-button ${assistantMode}`}
            onClick={() => setIsModeMenuOpen((value) => !value)}
            title={`${strings.modePrefix}: ${strings.modes[assistantMode].label}. ${strings.clickToSwitch}.`}
            aria-label={`${strings.modePrefix}: ${strings.modes[assistantMode].label}`}
            aria-haspopup="menu"
            aria-expanded={isModeMenuOpen}
          >
            {assistantMode === "low" ? <Leaf size={18} /> : assistantMode === "deep" ? <Brain size={18} /> : <Gauge size={18} />}
          </button>
          {isModeMenuOpen ? (
            <div className="prompt-mode-menu" role="menu" aria-label={strings.chooseMode}>
              <PromptModeMenuItem
                mode="low"
                activeMode={assistantMode}
                icon={<Leaf size={15} />}
                strings={strings}
                onSelect={(mode) => {
                  setIsModeMenuOpen(false);
                  void onAssistantModeChange(mode);
                }}
              />
              <PromptModeMenuItem
                mode="standard"
                activeMode={assistantMode}
                icon={<Gauge size={15} />}
                strings={strings}
                onSelect={(mode) => {
                  setIsModeMenuOpen(false);
                  void onAssistantModeChange(mode);
                }}
              />
              <PromptModeMenuItem
                mode="deep"
                activeMode={assistantMode}
                icon={<Brain size={15} />}
                strings={strings}
                onSelect={(mode) => {
                  setIsModeMenuOpen(false);
                  void onAssistantModeChange(mode);
                }}
              />
            </div>
          ) : null}
        </div>
        <button
          className={`send-button ${isLoading ? "stop" : ""}`}
          onClick={isLoading ? onStopGeneration : submitPrompt}
          disabled={isLoading ? isStopping : !prompt.trim() || !isModelReady}
          title={isLoading ? (runningTerminalTaskCount ? strings.stopGenerationAndTasks : strings.stopGeneration) : strings.send}
        >
          {isLoading ? <Square size={16} /> : <Send size={18} />}
        </button>
      </div>
    </aside>
  );
}

function PromptModeMenuItem({
  mode,
  activeMode,
  icon,
  strings,
  onSelect,
}: {
  mode: AssistantMode;
  activeMode: AssistantMode;
  icon: React.ReactNode;
  strings: AssistantStrings;
  onSelect: (mode: AssistantMode) => void;
}) {
  return (
    <button
      type="button"
      role="menuitemradio"
      aria-checked={mode === activeMode}
      className={mode === activeMode ? "active" : ""}
      onClick={() => onSelect(mode)}
      title={strings.modes[mode].title}
    >
      {icon}
      <span>{strings.modes[mode].label}</span>
    </button>
  );
}

function MessageMeta({
  elapsedMs,
  tokenUsage,
  strings,
}: {
  elapsedMs?: number;
  tokenUsage?: ChatMessage["tokenUsage"];
  strings: AssistantStrings;
}) {
  const parts = [
    typeof elapsedMs === "number" ? `${strings.elapsed} ${formatElapsedSeconds(elapsedMs)}` : "",
    tokenUsage ? formatLocalizedTokenUsage(tokenUsage, strings) : "",
  ].filter(Boolean);
  if (!parts.length) return null;
  return <div className="message-meta">{parts.join(" / ")}</div>;
}

function formatLocalizedTokenUsage(tokenUsage: NonNullable<ChatMessage["tokenUsage"]>, strings: AssistantStrings) {
  const prefix = tokenUsage.estimated === false ? strings.tokens : strings.approxTokens;
  return `${prefix} ${tokenUsage.totalTokens.toLocaleString()} (${strings.inputTokens} ${tokenUsage.promptTokens.toLocaleString()} / ${strings.outputTokens} ${tokenUsage.completionTokens.toLocaleString()})`;
}

function MessageAttachments({ attachments, strings }: { attachments?: GeneratedImageAttachment[]; strings: AssistantImageStrings }) {
  const images = attachments?.filter((attachment) => attachment.type === "image") ?? [];
  const [previewImage, setPreviewImage] = React.useState<GeneratedImageAttachment | null>(null);
  const [contextMenu, setContextMenu] = React.useState<{
    image: GeneratedImageAttachment;
    x: number;
    y: number;
  } | null>(null);

  const openImageContextMenu = React.useCallback((event: React.MouseEvent, image: GeneratedImageAttachment) => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      image,
      x: event.clientX,
      y: event.clientY,
    });
  }, []);

  const copyImage = React.useCallback(async (image: GeneratedImageAttachment) => {
    try {
      await window.novayxk?.copyGeneratedImage(image.path);
    } catch (error) {
      console.error("copyGeneratedImage failed", error);
    }
  }, []);

  React.useEffect(() => {
    if (!previewImage) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreviewImage(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [previewImage]);

  React.useEffect(() => {
    if (!contextMenu) return;
    const closeMenu = () => setContextMenu(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    window.addEventListener("click", closeMenu);
    window.addEventListener("blur", closeMenu);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("blur", closeMenu);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [contextMenu]);

  if (!images.length) return null;

  return (
    <>
      <div className="message-attachments">
        {images.map((image, index) => (
          <figure key={`${image.path}-${index}`} className="message-image-card">
            <button
              type="button"
              className="message-image-preview-button"
              onClick={() => setPreviewImage(image)}
              onContextMenu={(event) => openImageContextMenu(event, image)}
              title={strings.previewImage}
            >
              <img src={image.url} alt={image.prompt || strings.generatedImage} loading="lazy" />
            </button>
            <figcaption>
              <span>
                <ImageIcon size={13} />
                {image.mimeType || "image/png"}
              </span>
              <button
                type="button"
                onClick={() => {
                  void window.novayxk?.openGeneratedImage(image.path);
                }}
                title={strings.openGeneratedImageFile}
              >
                <ExternalLink size={13} />
              </button>
            </figcaption>
          </figure>
        ))}
      </div>
      {previewImage
        ? createPortal(
            <ImagePreviewModal
              image={previewImage}
              strings={strings}
              onClose={() => setPreviewImage(null)}
              onContextMenu={(event) => openImageContextMenu(event, previewImage)}
            />,
            document.body,
          )
        : null}
      {contextMenu
        ? createPortal(
            <ImageAttachmentContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              onCopy={() => copyImage(contextMenu.image)}
              onOpen={() => {
                void window.novayxk?.openGeneratedImage(contextMenu.image.path);
              }}
              onClose={() => setContextMenu(null)}
              strings={strings}
            />,
            document.body,
          )
        : null}
    </>
  );
}

function ImagePreviewModal({
  image,
  strings,
  onClose,
  onContextMenu,
}: {
  image: GeneratedImageAttachment;
  strings: AssistantImageStrings;
  onClose: () => void;
  onContextMenu: (event: React.MouseEvent) => void;
}) {
  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const dragRef = React.useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const [view, setView] = React.useState(createDefaultImagePreviewView);
  const [isDragging, setIsDragging] = React.useState(false);

  React.useEffect(() => {
    setView(createDefaultImagePreviewView());
  }, [image.url]);

  const resetView = React.useCallback(() => {
    setView(createDefaultImagePreviewView());
  }, []);

  const handleWheel = React.useCallback((event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const rect = stageRef.current?.getBoundingClientRect();
    const factor = event.deltaY < 0 ? 1.14 : 1 / 1.14;
    setView((current) => {
      const nextZoom = clampImagePreviewZoom(current.zoom * factor);
      if (!rect || nextZoom === current.zoom) return current;
      const localX = event.clientX - (rect.left + rect.width / 2);
      const localY = event.clientY - (rect.top + rect.height / 2);
      const imageX = (localX - current.x) / current.zoom;
      const imageY = (localY - current.y) / current.zoom;
      return {
        zoom: nextZoom,
        x: localX - imageX * nextZoom,
        y: localY - imageY * nextZoom,
      };
    });
  }, []);

  const handlePointerDown = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: view.x,
      originY: view.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
  }, [view.x, view.y]);

  const handlePointerMove = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    event.preventDefault();
    setView((current) => ({
      ...current,
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    }));
  }, []);

  const finishDragging = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (drag?.pointerId === event.pointerId) {
      dragRef.current = null;
      setIsDragging(false);
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    }
  }, []);

  return (
    <div className="image-preview-backdrop" role="presentation" onClick={onClose}>
      <section
        className="image-preview-modal"
        role="dialog"
        aria-modal="true"
        aria-label={strings.imagePreview}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="image-preview-toolbar">
          <button type="button" onClick={resetView} title={strings.resetView}>
            <RotateCcw size={16} />
          </button>
          <button
            type="button"
            onClick={() => {
              void window.novayxk?.openGeneratedImage(image.path);
            }}
            title={strings.openGeneratedImageFile}
          >
            <ExternalLink size={16} />
          </button>
          <button type="button" onClick={onClose} title={strings.close}>
            <X size={18} />
          </button>
        </div>
        <div
          ref={stageRef}
          className={`image-preview-stage ${isDragging ? "dragging" : ""}`}
          onWheel={handleWheel}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishDragging}
          onPointerCancel={finishDragging}
          onDoubleClick={resetView}
        >
          <img
            src={image.url}
            alt={image.prompt || strings.generatedImage}
            draggable={false}
            onContextMenu={onContextMenu}
            style={{
              transform: `translate3d(${view.x}px, ${view.y}px, 0) scale(${view.zoom})`,
            }}
          />
        </div>
      </section>
    </div>
  );
}

function clampImagePreviewZoom(value: number) {
  return Math.min(8, Math.max(0.2, value));
}

function createDefaultImagePreviewView() {
  return { zoom: 0.6, x: 0, y: -125 };
}

function ImageAttachmentContextMenu({
  x,
  y,
  onCopy,
  onOpen,
  onClose,
  strings,
}: {
  x: number;
  y: number;
  onCopy: () => Promise<void>;
  onOpen: () => void;
  onClose: () => void;
  strings: AssistantImageStrings;
}) {
  const style = React.useMemo(
    () => ({
      left: Math.min(x, window.innerWidth - 180),
      top: Math.min(y, window.innerHeight - 92),
    }),
    [x, y],
  );

  return (
    <div
      className="image-context-menu"
      style={style}
      role="menu"
      aria-label={strings.imageMenu}
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button
        type="button"
        role="menuitem"
        onClick={async () => {
          await onCopy();
          onClose();
        }}
      >
        <Copy size={14} />
        {strings.copy}
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          onOpen();
          onClose();
        }}
      >
        <ExternalLink size={14} />
        {strings.open}
      </button>
    </div>
  );
}
