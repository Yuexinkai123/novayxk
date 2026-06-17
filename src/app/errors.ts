export function getDesktopBridgeUnavailableMessage(action: string) {
  return `Novayxk desktop bridge was not detected. ${action} requires the full desktop app. Close this window and reopen Novayxk, then try again.`;
}

export function createDesktopBridgeUnavailableError(action: string) {
  return new Error(getDesktopBridgeUnavailableMessage(action));
}

export function formatActionableError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message.trim() : "";
  const base = fallback.trim();

  if (!message) return base;
  if (message === base) return base;

  if (/当前在浏览器预览模式|当前是网页预览模式|没有检测到 Novayxk 桌面桥接|desktop bridge was not detected/i.test(message)) {
    return `${base}: Novayxk desktop bridge was not detected. You may be in browser preview mode, or the desktop app may not have started fully. Close this window and reopen Novayxk, then try again.`;
  }

  if (/INSTALL_DIR_BUSY|安装目录正在被占用|install directory is currently in use|EBUSY|EPERM|EACCES/i.test(message)) {
    return `${base}: The target file or folder is currently in use. Close Novayxk, File Explorer, or related terminal windows, then try again.`;
  }

  if (/ENOENT|文件不存在|目录不存在|已不存在|does not exist|no longer exists/i.test(message)) {
    return `${base}: The target file or folder no longer exists. Refresh the workspace first, then try this step again.`;
  }

  if (/图片生成超时|模型请求超时|读取模型列表超时|连接超时|Image generation timed out|Model request timed out|Timed out while reading the model list|ETIMEDOUT/i.test(message)) {
    return `${base}: ${message}`;
  }

  if (/ECONNRESET|ETIMEDOUT|ENOTFOUND|fetch failed|socket hang up|网络|连接超时|连接被重置|network|connection timed out|connection was reset/i.test(message)) {
    return `${base}: The network request did not complete successfully. Check the Base URL, proxy settings, and current network connection, then try again.`;
  }

  if (/开发模式下不能可靠地切换管理员模式|打包后的桌面版测试|development mode|packaged desktop app/i.test(message)) {
    return `${base}: You are in development mode. Admin mode should only be tested in the packaged desktop app.`;
  }

  if (/管理员模式没有启动，因为 Windows UAC 授权被取消了|Windows UAC approval was canceled/i.test(message)) {
    return `${base}: Windows UAC approval was canceled. Click "Administrator mode" again and choose "Yes" in the system prompt.`;
  }

  if (/管理员权限|UAC|提权|Access is denied|权限不足|system privileges|administrator mode/i.test(message)) {
    return `${base}: The current process does not have enough system privileges. Switch to "Administrator mode" in Settings, then try again.`;
  }

  if (/JSON 不是合法|不完整|截断|response was incomplete/i.test(message)) {
    return `${base}: The model response was incomplete. Ask it to generate the result in smaller parts, or reduce the scope of this change and try again.`;
  }

  return `${base}: ${message}`;
}
