import React from "react";
import { FolderOpen, MessageSquareText, Settings, Sparkles } from "lucide-react";
import type { WorkspaceGuideKind } from "../../app/workspaceGuide";

type WorkspaceGuideProps = {
  kind: Exclude<WorkspaceGuideKind, null>;
  onOpenSettings: () => void;
  onOpenProject: () => void;
  onUsePrompt: (prompt: string) => void;
};

const startPrompts = [
  "先帮我概览这个项目的结构、技术栈和启动方式。",
  "帮我找出这个项目里最值得先看的几个文件。",
  "看看这个项目目前最可能存在的风险点或待办项。",
];

export function WorkspaceGuide({ kind, onOpenSettings, onOpenProject, onUsePrompt }: WorkspaceGuideProps) {
  if (kind === "configure-model") {
    return (
      <section className="workspace-guide">
        <div className="workspace-guide-header">
          <div className="workspace-guide-icon">
            <Settings size={18} />
          </div>
          <div>
            <strong>先连接模型</strong>
            <p>先在设置里填好 Base URL、API Key 和模型。连接测试通过后，再开始真正的项目协作。</p>
          </div>
        </div>
        <div className="workspace-guide-actions">
          <button className="ghost-button" onClick={onOpenSettings}>
            <Settings size={16} />
            打开模型设置
          </button>
        </div>
      </section>
    );
  }

  if (kind === "open-project") {
    return (
      <section className="workspace-guide">
        <div className="workspace-guide-header">
          <div className="workspace-guide-icon">
            <FolderOpen size={18} />
          </div>
          <div>
            <strong>先打开一个项目</strong>
            <p>打开本地项目后，Novayxk 才能读取文件树、保存任务历史，并把代码上下文带给模型。</p>
          </div>
        </div>
        <div className="workspace-guide-actions">
          <button className="primary-button" onClick={onOpenProject}>
            <FolderOpen size={16} />
            打开本地项目
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="workspace-guide">
      <div className="workspace-guide-header">
        <div className="workspace-guide-icon">
          <Sparkles size={18} />
        </div>
        <div>
          <strong>可以开始了</strong>
          <p>你已经连好模型，也打开了项目。现在可以从左侧选文件，或者直接发一条总览型请求让 Novayxk 先带你熟悉项目。</p>
        </div>
      </div>
      <div className="workspace-guide-prompt-list">
        {startPrompts.map((prompt) => (
          <button key={prompt} className="workspace-guide-prompt" onClick={() => onUsePrompt(prompt)}>
            <MessageSquareText size={14} />
            {prompt}
          </button>
        ))}
      </div>
    </section>
  );
}
