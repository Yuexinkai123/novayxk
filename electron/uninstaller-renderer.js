const api = window.novayxkUninstaller;

const state = {
  completed: false,
  running: false,
  installDir: "",
  userDataDir: "",
  userDataExists: false,
  progressPercent: 0,
  progressTitle: "等待开始",
  progressDetail: "点击“开始卸载”后会逐步清理进程、快捷方式和系统卸载入口。",
};

const elements = {
  installDir: document.querySelector("#installDir"),
  userDataDir: document.querySelector("#userDataDir"),
  deleteUserData: document.querySelector("#deleteUserData"),
  progressTitle: document.querySelector("#progressTitle"),
  progressPercent: document.querySelector("#progressPercent"),
  progressFill: document.querySelector("#progressFill"),
  progressDetail: document.querySelector("#progressDetail"),
  resultText: document.querySelector("#resultText"),
  primaryButton: document.querySelector("#primaryButton"),
  secondaryButton: document.querySelector("#secondaryButton"),
  openUserDataButton: document.querySelector("#openUserDataButton"),
  minimizeButton: document.querySelector("#minimizeButton"),
  closeButton: document.querySelector("#closeButton"),
};

init();

async function init() {
  const info = await api.getInfo();
  state.installDir = info.installDir;
  state.userDataDir = info.userDataDir;
  elements.installDir.textContent = info.installDir;
  elements.userDataDir.textContent = info.userDataDir;
  state.userDataExists = info.userDataExists === true;
  elements.openUserDataButton.disabled = !state.userDataExists;
  api.onProgress(updateProgress);
  bindEvents();
  renderProgress();
}

function bindEvents() {
  elements.minimizeButton.addEventListener("click", () => api.minimize());
  elements.closeButton.addEventListener("click", () => handleClose());
  elements.secondaryButton.addEventListener("click", () => handleClose());
  elements.openUserDataButton.addEventListener("click", () => {
    if (state.userDataDir) api.openPath(state.userDataDir);
  });
  elements.primaryButton.addEventListener("click", async () => {
    if (state.completed) {
      await api.finalize();
      return;
    }
    if (state.running) return;
    await startUninstall();
  });
}

async function startUninstall() {
  state.running = true;
  state.progressPercent = 0;
  state.progressTitle = "准备卸载";
  state.progressDetail = "正在检查程序目录并准备清理。";
  elements.resultText.textContent = "";
  render();
  try {
    const result = await api.run({
      installDir: state.installDir,
      deleteUserData: elements.deleteUserData.checked,
    });
    state.completed = true;
    state.progressPercent = 100;
    state.progressTitle = "卸载准备完成";
    state.progressDetail = result.deleteUserData
      ? "主程序已移除。点击完成后会在后台继续删除安装目录和 .novayxk 数据。"
      : "主程序已移除。点击完成后会在后台继续删除安装目录，.novayxk 数据会保留。";
    elements.resultText.textContent = result.deleteUserData
      ? "卸载准备完成。关闭窗口后会继续删除程序目录和 .novayxk 数据。"
      : "卸载准备完成。关闭窗口后会继续删除程序目录，.novayxk 数据会保留下来。";
  } catch (error) {
    state.progressTitle = "卸载失败";
    state.progressDetail = error?.message || "卸载失败。";
    elements.resultText.textContent = error?.message || "卸载失败。";
  } finally {
    state.running = false;
    render();
  }
}

async function handleClose() {
  if (state.running) return;
  if (state.completed) {
    await api.finalize();
    return;
  }
  await api.close();
}

function render() {
  elements.deleteUserData.disabled = state.running || state.completed;
  elements.secondaryButton.disabled = state.running;
  elements.openUserDataButton.disabled = state.running || !state.userDataExists;

  if (state.completed) {
    elements.primaryButton.textContent = "完成";
    elements.secondaryButton.textContent = "关闭";
  } else if (state.running) {
    elements.primaryButton.textContent = "卸载中";
    elements.secondaryButton.textContent = "请稍等";
  } else {
    elements.primaryButton.textContent = "开始卸载";
    elements.secondaryButton.textContent = "取消";
  }

  renderProgress();
}

function updateProgress(progress) {
  state.progressPercent = Math.max(0, Math.min(100, Number(progress?.percent) || 0));
  state.progressTitle = progress?.title || "正在卸载";
  state.progressDetail = progress?.detail || "请稍等。";
  renderProgress();
}

function renderProgress() {
  elements.progressTitle.textContent = state.progressTitle;
  elements.progressPercent.textContent = `${Math.round(state.progressPercent)}%`;
  elements.progressFill.style.width = `${state.progressPercent}%`;
  elements.progressDetail.textContent = state.progressDetail;
}
