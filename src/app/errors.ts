export function getDesktopBridgeUnavailableMessage(action: string) {
  return `没有检测到 Novayxk 桌面桥接，${action}需要用桌面版完整启动。请关闭当前窗口后重新打开 Novayxk 再试。`;
}

export function createDesktopBridgeUnavailableError(action: string) {
  return new Error(getDesktopBridgeUnavailableMessage(action));
}

export function formatActionableError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message.trim() : "";
  const base = fallback.trim();

  if (!message) return base;
  if (message === base) return base;

  if (/当前在浏览器预览模式|当前是网页预览模式|没有检测到 Novayxk 桌面桥接/i.test(message)) {
    return `${base}：没有检测到 Novayxk 桌面桥接。可能当前是网页预览模式，或桌面版没有完整启动。请关闭当前窗口后重新打开 Novayxk 再试。`;
  }

  if (/INSTALL_DIR_BUSY|安装目录正在被占用|EBUSY|EPERM|EACCES/i.test(message)) {
    return `${base}：目标文件或目录正在被占用。请先关闭 Novayxk、资源管理器或相关终端窗口后重试。`;
  }

  if (/ENOENT|文件不存在|目录不存在|已不存在/i.test(message)) {
    return `${base}：目标文件或目录已经不存在。请先刷新工作区，再重新执行这一步。`;
  }

  if (/图片生成超时|模型请求超时|读取模型列表超时|连接超时|ETIMEDOUT/i.test(message)) {
    return `${base}：${message}`;
  }

  if (/ECONNRESET|ETIMEDOUT|ENOTFOUND|fetch failed|socket hang up|网络|连接超时|连接被重置/i.test(message)) {
    return `${base}：网络连接没有成功。请检查 Base URL、代理设置和当前网络后重试。`;
  }

  if (/开发模式下不能可靠地切换管理员模式|打包后的桌面版测试/i.test(message)) {
    return `${base}：当前是开发模式，管理员模式只建议在打包后的桌面版里测试。`;
  }

  if (/管理员模式没有启动，因为 Windows UAC 授权被取消了/i.test(message)) {
    return `${base}：你刚才取消了 Windows UAC 授权。重新点击“管理员模式”，并在系统弹窗里选择“是”即可。`;
  }

  if (/管理员权限|UAC|提权|Access is denied|权限不足/i.test(message)) {
    return `${base}：当前系统权限不够。请切到设置里的“管理员模式”后再试一次。`;
  }

  if (/JSON 不是合法|不完整|截断/i.test(message)) {
    return `${base}：模型返回的内容不完整。请让它分批生成，或缩小这次修改范围后重试。`;
  }

  return `${base}：${message}`;
}
