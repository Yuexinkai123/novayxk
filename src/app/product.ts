import type { AiControlMode, AssistantMode } from "../vite-env";

export const PRODUCT_NAME = "Novayxk";
export const PRODUCT_TAGLINE = "Windows-native AI Project Workspace";

export function getExecutionModeLabel(mode: AiControlMode) {
  return mode === "full" ? "System" : "Project";
}

export function getExecutionModeTitle(mode: AiControlMode) {
  return mode === "full"
    ? "Allow AI to run system-level commands such as software installs, system settings changes, or protected-directory operations"
    : "Allow AI to run common project commands such as builds, tests, file reads, and code edits inside the current workspace";
}

export function getExecutionModeStatus(mode: AiControlMode) {
  return mode === "full" ? "Switched to system execution" : "Switched to project execution";
}

export function getExecutionModeHint(mode: AiControlMode) {
  return mode === "full" ? "System execution enabled" : "Project execution enabled";
}

export function getAssistantModeLabel(mode: AssistantMode) {
  if (mode === "low") return "Low";
  if (mode === "deep") return "Deep";
  return "Standard";
}

export function getAssistantModeTitle(mode: AssistantMode) {
  if (mode === "low") return "Lower token cost: less context, shorter explanations, and only the cheapest verification by default";
  if (mode === "deep") return "Deeper collaboration: more context retained, with a fuller verification pass after actions";
  return "Balanced collaboration: a middle ground between speed, context, completeness, and key-result verification";
}

export function getAssistantModeStatus(mode: AssistantMode) {
  return `Switched to ${getAssistantModeLabel(mode)} mode`;
}

export function getPrivilegeChipLabel(isAdmin: boolean | null | undefined) {
  return isAdmin ? "System Privilege: Admin" : "System Privilege: Standard";
}

export function getWorkspaceStatusLabel(hasProject: boolean) {
  return hasProject ? "Workspace: Project connected" : "Workspace: Preview mode";
}
