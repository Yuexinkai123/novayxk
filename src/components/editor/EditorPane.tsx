import React from "react";
import { ChevronsUp, Code2, Save, Search, ShieldCheck, TriangleAlert } from "lucide-react";
import type { AiControlMode } from "../../vite-env";
import type { ProjectSelectedFile } from "../../vite-env";
import { getExecutionModeHint } from "../../app/product";
import type { WorkspaceGuideKind } from "../../app/workspaceGuide";
import { WorkspaceGuide } from "../onboarding/WorkspaceGuide";

type EditorPaneProps = {
  selectedFile: ProjectSelectedFile | null;
  isEditorDirty: boolean;
  stats: {
    lines: number;
    characters: number;
  };
  editorFind: string;
  editorFindMatches: number;
  isWordWrapEnabled: boolean;
  isBottomCollapsed: boolean;
  aiControlMode: AiControlMode;
  workspaceGuideKind: Exclude<WorkspaceGuideKind, null> | null;
  onEditorFindChange: (value: string) => void;
  onToggleWordWrap: () => void;
  onShowBottomPanel: () => void;
  onSaveSelectedFile: () => void;
  onOpenSettings: () => void;
  onOpenProject: () => void;
  onUseGuidePrompt: (prompt: string) => void;
  onSelectedFileContentChange: (content: string) => void;
  onEditorKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
};

export function EditorPane({
  selectedFile,
  isEditorDirty,
  stats,
  editorFind,
  editorFindMatches,
  isWordWrapEnabled,
  isBottomCollapsed,
  aiControlMode,
  workspaceGuideKind,
  onEditorFindChange,
  onToggleWordWrap,
  onShowBottomPanel,
  onSaveSelectedFile,
  onOpenSettings,
  onOpenProject,
  onUseGuidePrompt,
  onSelectedFileContentChange,
  onEditorKeyDown,
}: EditorPaneProps) {
  const isTextFile = selectedFile?.kind === "text";
  const isImageFile = selectedFile?.kind === "image";
  const imageSizeLabel = isImageFile
    ? selectedFile.size >= 1024 * 1024
      ? `${(selectedFile.size / (1024 * 1024)).toFixed(1)} MB`
      : `${Math.max(1, Math.round(selectedFile.size / 1024))} KB`
    : "";

  return (
    <>
      <div className="editor-header">
        <div>
          {/* <span>代码上下文</span> */}
          <strong>{selectedFile ? `${selectedFile.path}${isEditorDirty ? " *" : ""}` : "尚未选择文件"}</strong>
        </div>
        <div className="editor-header-actions">
          {isTextFile && (
            <div className="editor-find">
              <Search size={13} />
              <input
                value={editorFind}
                onChange={(event) => onEditorFindChange(event.target.value)}
                placeholder="查找"
                aria-label="查找当前文件"
              />
              <span>{editorFind ? editorFindMatches : stats.lines}</span>
            </div>
          )}
          <button
            className={`editor-tool-button ${isWordWrapEnabled ? "active" : ""}`}
            onClick={onToggleWordWrap}
            disabled={!isTextFile}
            title="切换自动换行"
          >
            换行
          </button>
          {isBottomCollapsed && (
            <button className="panel-collapse-button" onClick={onShowBottomPanel} title="显示底部工具区">
              <ChevronsUp size={15} />
            </button>
          )}
          <button className="editor-save-button" onClick={onSaveSelectedFile} disabled={!isTextFile || !isEditorDirty} title="保存当前文件 Ctrl+S">
            <Save size={15} />
            保存
          </button>
          <div className="trust-chip">
            {aiControlMode === "full" ? <TriangleAlert size={15} /> : <ShieldCheck size={15} />}
            {getExecutionModeHint(aiControlMode)}
          </div>
        </div>
      </div>

      <div className="code-view">
        {selectedFile ? (
          isTextFile ? (
            <div className="code-editor-shell">
              <pre className="line-numbers" aria-hidden="true">
                {Array.from({ length: stats.lines }, (_, index) => index + 1).join("\n")}
              </pre>
              <textarea
                className={`code-editor ${isWordWrapEnabled ? "wrap" : ""}`}
                value={selectedFile.content}
                spellCheck={false}
                onChange={(event) => onSelectedFileContentChange(event.target.value)}
                onKeyDown={onEditorKeyDown}
              />
              <div className="editor-stats">
                {stats.lines} 行 · {stats.characters} 字符
                {editorFind ? ` · 匹配 ${editorFindMatches}` : ""}
              </div>
            </div>
          ) : isImageFile ? (
            <div className="editor-image-shell">
              <div className="editor-image-stage">
                <img className="editor-image-preview" src={selectedFile.url} alt={selectedFile.path} />
              </div>
              <div className="editor-image-meta">
                {selectedFile.mimeType} · {imageSizeLabel}
              </div>
            </div>
          ) : null
        ) : (
          <div className="empty-state-shell">
            {workspaceGuideKind ? (
              <WorkspaceGuide
                kind={workspaceGuideKind}
                onOpenSettings={onOpenSettings}
                onOpenProject={onOpenProject}
                onUsePrompt={onUseGuidePrompt}
              />
            ) : null}
            <div className="empty-state">
              <Code2 size={44} />
              <h2>打开项目并选择文件</h2>
              <p>Novayxk 会把当前文件作为上下文协助你分析、修改和执行项目内任务。你也可以直接编辑文件，用 Ctrl+S 保存。</p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
