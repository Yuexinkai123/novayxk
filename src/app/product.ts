import type { AiControlMode } from "../vite-env";

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

export function getPrivilegeChipLabel(isAdmin: boolean | null | undefined) {
  return isAdmin ? "系统权限: 管理员" : "系统权限: 普通";
}

export function getWorkspaceStatusLabel(hasProject: boolean) {
  return hasProject ? "工作区: 已连接项目" : "工作区: 预览模式";
}
