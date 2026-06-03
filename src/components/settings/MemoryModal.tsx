import React from "react";
import { BookOpen, Save } from "lucide-react";

type MemoryModalProps = {
  projectLabel: string;
  memoryDraft: string;
  canSave: boolean;
  onMemoryDraftChange: (memory: string) => void;
  onClose: () => void;
  onSave: () => void;
};

export function MemoryModal({
  projectLabel,
  memoryDraft,
  canSave,
  onMemoryDraftChange,
  onClose,
  onSave,
}: MemoryModalProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="memory-modal" role="dialog" aria-modal="true" aria-label="项目长期记忆">
        <div className="modal-header">
          <div>
            <span>项目长期记忆</span>
            <h2>{projectLabel}</h2>
          </div>
          <BookOpen size={23} />
        </div>
        <textarea
          className="memory-editor"
          value={memoryDraft}
          onChange={(event) => onMemoryDraftChange(event.target.value)}
          placeholder="记录这个项目的技术栈、目录约定、代码风格、常用命令、已知坑点。之后每次聊天都会自动带上这段长期记忆。"
        />
        <p className="memory-hint">配置属于全局记忆，项目记忆属于当前项目，任务历史属于当前项目下的某一次工作。</p>
        <div className="modal-actions">
          <button className="ghost-button" onClick={onClose}>
            取消
          </button>
          <button className="primary-button" onClick={onSave} disabled={!canSave}>
            <Save size={17} />
            保存项目记忆
          </button>
        </div>
      </section>
    </div>
  );
}
