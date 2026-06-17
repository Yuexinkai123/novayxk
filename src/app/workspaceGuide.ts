export type WorkspaceGuideKind = "configure-model" | "open-project" | "start-working" | null;

export function getGuidePromptStatus() {
  return "A starter prompt has been inserted and the assistant panel is open. You can press Enter to send it now.";
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
