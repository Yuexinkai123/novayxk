import React from "react";
import { BookOpen, FolderOpen, PlayCircle, Settings, ShieldCheck, Sparkles } from "lucide-react";

type WelcomeGuideProps = {
  onOpenSettings: () => void;
  onOpenProject: () => void;
  onDismiss: () => void;
};

export function WelcomeGuide({ onOpenSettings, onOpenProject, onDismiss }: WelcomeGuideProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="welcome-modal" role="dialog" aria-modal="true" aria-label="Novayxk 起步引导">
        <div className="welcome-hero">
          <span className="welcome-kicker">首次打开</span>
          <h2>三步开始使用 Novayxk</h2>
          <p>
            先接入模型，再打开项目，然后直接让 AI 帮你分析、改代码、跑命令。API Key 会优先保存在当前 Windows 账户的本地加密存储中。
          </p>
        </div>

        <div className="welcome-grid">
          <article className="welcome-card">
            <div className="welcome-card-icon">
              <Settings size={18} />
            </div>
            <strong>1. 连接模型</strong>
            <p>配置 Base URL、API Key 和模型。保存前可以先测试连接。</p>
          </article>
          <article className="welcome-card">
            <div className="welcome-card-icon">
              <FolderOpen size={18} />
            </div>
            <strong>2. 打开项目</strong>
            <p>选择本地项目后，Novayxk 会读取文件树、任务历史和项目长期记忆。</p>
          </article>
          <article className="welcome-card">
            <div className="welcome-card-icon">
              <Sparkles size={18} />
            </div>
            <strong>3. 直接提问</strong>
            <p>你可以让它分析报错、生成补丁、执行测试，或协助处理系统级操作。</p>
          </article>
        </div>

        <div className="welcome-notes">
          <div className="welcome-note">
            <ShieldCheck size={15} />
            <span>项目内执行用于构建、测试、读写项目文件；系统级执行用于安装软件、受保护目录和系统设置。</span>
          </div>
          <div className="welcome-note">
            <BookOpen size={15} />
            <span>工作数据默认保存在 <code>%USERPROFILE%\.novayxk</code>，卸载主程序时不会自动误删。</span>
          </div>
        </div>

        <div className="modal-actions">
          <button className="ghost-button" onClick={onDismiss}>
            稍后再说
          </button>
          <button className="ghost-button" onClick={onOpenSettings}>
            <Settings size={16} />
            先配置模型
          </button>
          <button className="primary-button" onClick={onOpenProject}>
            <PlayCircle size={16} />
            打开项目开始体验
          </button>
        </div>
      </section>
    </div>
  );
}
