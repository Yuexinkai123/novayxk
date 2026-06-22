import React from "react";
import { ChevronsUp, Code2, Save, ShieldCheck, TriangleAlert } from "lucide-react";
import type { AiControlMode, AppLanguage } from "../../vite-env";
import type { ProjectSelectedFile } from "../../vite-env";
import type { WorkspaceGuideKind } from "../../app/workspaceGuide";
import { getLocaleStrings } from "../../app/i18n";
import { WorkspaceGuide } from "../onboarding/WorkspaceGuide";

type EditorPaneProps = {
  language: AppLanguage;
  selectedFile: ProjectSelectedFile | null;
  isEditorDirty: boolean;
  stats: {
    lines: number;
    characters: number;
  };
  isBottomCollapsed: boolean;
  aiControlMode: AiControlMode;
  workspaceGuideKind: Exclude<WorkspaceGuideKind, null> | null;
  onShowBottomPanel: () => void;
  onSaveSelectedFile: () => void;
  onOpenSettings: () => void;
  onOpenProject: () => void;
  onUseGuidePrompt: (prompt: string) => void;
  onSelectedFileContentChange: (content: string) => void;
  onEditorKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => void;
};

export function EditorPane({
  language,
  selectedFile,
  isEditorDirty,
  stats,
  isBottomCollapsed,
  aiControlMode,
  workspaceGuideKind,
  onShowBottomPanel,
  onSaveSelectedFile,
  onOpenSettings,
  onOpenProject,
  onUseGuidePrompt,
  onSelectedFileContentChange,
  onEditorKeyDown,
}: EditorPaneProps) {
  const strings = getLocaleStrings(language).editor;
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
          <strong>{selectedFile ? `${selectedFile.path}${isEditorDirty ? " *" : ""}` : strings.noFileSelected}</strong>
        </div>
        <div className="editor-header-actions">
          {isBottomCollapsed && (
            <button className="panel-collapse-button" onClick={onShowBottomPanel} title={strings.showBottomTools}>
              <ChevronsUp size={15} />
            </button>
          )}
          <button className="editor-save-button" onClick={onSaveSelectedFile} disabled={!isTextFile || !isEditorDirty} title={strings.saveCurrentFile}>
            <Save size={15} />
            {strings.save}
          </button>
          <div className="trust-chip">
            {aiControlMode === "full" ? <TriangleAlert size={15} /> : <ShieldCheck size={15} />}
            {aiControlMode === "full" ? strings.systemExecutionEnabled : strings.projectExecutionEnabled}
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
                className="code-editor"
                value={selectedFile.content}
                spellCheck={false}
                onChange={(event) => onSelectedFileContentChange(event.target.value)}
                onKeyDown={onEditorKeyDown}
              />
              <div className="editor-stats">
                {stats.lines} {strings.lines} · {stats.characters} {strings.characters}
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
                language={language}
              />
            ) : null}
            <div className="empty-state">
              <Code2 size={44} />
              <h2>{strings.emptyTitle}</h2>
              <p>{strings.emptyBody}</p>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
