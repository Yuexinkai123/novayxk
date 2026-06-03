export type WorkspaceGuideKind = "configure-model" | "open-project" | "start-working" | null;

export function getGuidePromptStatus() {
  return "已填入示例提示词，并展开助手栏。现在可以直接回车发送。";
}

export function getWorkspaceGuideKind(options: {
  hasConfiguredProvider: boolean;
  hasProject: boolean;
  hasSelectedFile: boolean;
  messageCount: number;
}) {
  if (!options.hasConfiguredProvider) return "configure-model";
  if (!options.hasProject) return "open-project";
  if (!options.hasSelectedFile && options.messageCount === 0) return "start-working";
  return null;
}
