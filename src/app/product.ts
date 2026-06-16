import type { AiControlMode, AssistantMode } from "../vite-env";

export const PRODUCT_NAME = "Novayxk";
export const PRODUCT_TAGLINE = "Windows 本地 AI 项目工作台";

export function getExecutionModeLabel(mode: AiControlMode) {
  return mode === "full" ? "系统级执行" : "项目内执行";
}

export function getExecutionModeTitle(mode: AiControlMode) {
  return mode === "full"
    ? "允许 AI 执行系统级命令，例如安装软件、改系统设置或处理受保护目录"
    : "允许 AI 执行项目目录内的常见开发命令，例如构建、测试、读取文件和修改代码";
}

export function getExecutionModeStatus(mode: AiControlMode) {
  return mode === "full" ? "已切换到系统级执行" : "已切换到项目内执行";
}

export function getExecutionModeHint(mode: AiControlMode) {
  return mode === "full" ? "系统级执行已开启" : "项目内执行已开启";
}

export function getAssistantModeLabel(mode: AssistantMode) {
  if (mode === "low") return "极省";
  if (mode === "deep") return "深度";
  return "标准";
}

export function getAssistantModeTitle(mode: AssistantMode) {
  if (mode === "low") return "低 token 消耗：减少上下文和长解释，默认只做最低成本复查";
  if (mode === "deep") return "深度协作：保留更多上下文，并在执行后做完整复查链路";
  return "标准协作：在速度和完整度之间保持平衡，并补关键结果复查";
}

export function getAssistantModeStatus(mode: AssistantMode) {
  return `已切换到${getAssistantModeLabel(mode)}模式`;
}

export function getPrivilegeChipLabel(isAdmin: boolean | null | undefined) {
  return isAdmin ? "系统权限: 管理员" : "系统权限: 普通";
}

export function getWorkspaceStatusLabel(hasProject: boolean) {
  return hasProject ? "工作区: 已连接项目" : "工作区: 预览模式";
}
