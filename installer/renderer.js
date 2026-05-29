const api = window.novayxkInstaller;

const state = {
  mode: "install",
  step: 0,
  installDir: "",
  installedDir: "",
  userDataDir: "",
  userDataExists: false,
  deleteUserData: false,
  installing: false,
  completed: false,
};

const elements = {
  chromeTitle: document.querySelector("#chromeTitle"),
  heroEyebrow: document.querySelector("#heroEyebrow"),
  heroTitle: document.querySelector("#heroTitle"),
  heroBody: document.querySelector("#heroBody"),
  metricOneTitle: document.querySelector("#metricOneTitle"),
  metricOneBody: document.querySelector("#metricOneBody"),
  metricTwoTitle: document.querySelector("#metricTwoTitle"),
  metricTwoBody: document.querySelector("#metricTwoBody"),
  metricThreeTitle: document.querySelector("#metricThreeTitle"),
  metricThreeBody: document.querySelector("#metricThreeBody"),
  versionLabel: document.querySelector("#versionLabel"),
  brandLogo: document.querySelector("#brandLogo"),
  installForm: document.querySelector("#installForm"),
  optionsKicker: document.querySelector("#optionsKicker"),
  optionsTitle: document.querySelector("#optionsTitle"),
  optionsBody: document.querySelector("#optionsBody"),
  pathLabel: document.querySelector("#pathLabel"),
  installDir: document.querySelector("#installDir"),
  browseButton: document.querySelector("#browseButton"),
  desktopOptionRow: document.querySelector("#desktopOptionRow"),
  startMenuOptionRow: document.querySelector("#startMenuOptionRow"),
  launchOptionRow: document.querySelector("#launchOptionRow"),
  deleteDataOptionRow: document.querySelector("#deleteDataOptionRow"),
  desktopShortcut: document.querySelector("#desktopShortcut"),
  startMenuShortcut: document.querySelector("#startMenuShortcut"),
  launchAfterInstall: document.querySelector("#launchAfterInstall"),
  deleteUserData: document.querySelector("#deleteUserData"),
  progressKicker: document.querySelector("#progressKicker"),
  primaryButton: document.querySelector("#primaryButton"),
  secondaryButton: document.querySelector("#secondaryButton"),
  minimizeButton: document.querySelector("#minimizeButton"),
  closeButton: document.querySelector("#closeButton"),
  errorText: document.querySelector("#errorText"),
  progressTitle: document.querySelector("#progressTitle"),
  progressDetail: document.querySelector("#progressDetail"),
  progressPath: document.querySelector("#progressPath"),
  progressPercent: document.querySelector("#progressPercent"),
  progressCircle: document.querySelector("#progressCircle"),
  resultKicker: document.querySelector("#resultKicker"),
  resultTitle: document.querySelector("#resultTitle"),
  resultBody: document.querySelector("#resultBody"),
  installedDirLabel: document.querySelector("#installedDirLabel"),
  installedDir: document.querySelector("#installedDir"),
  userDataLabel: document.querySelector("#userDataLabel"),
  userDataDir: document.querySelector("#userDataDir"),
  openInstallDirButton: document.querySelector("#openInstallDirButton"),
  openUserDataDirButton: document.querySelector("#openUserDataDirButton"),
};

const CIRCLE_LENGTH = 326.73;
const INSTALL_DIR_NAME = "Novayxk";

init();

async function init() {
  const defaults = await api.getDefaults();
  state.mode = defaults.mode === "uninstall" ? "uninstall" : "install";
  state.installDir = defaults.defaultInstallDir;
  state.userDataDir = defaults.userDataDir;
  state.userDataExists = defaults.userDataExists === true;

  elements.installDir.value = defaults.defaultInstallDir;
  elements.versionLabel.textContent = `v${defaults.version}`;
  elements.userDataDir.textContent = defaults.userDataDir;
  if (defaults.logoDataUrl) elements.brandLogo.src = defaults.logoDataUrl;

  api.onProgress(updateProgress);
  bindEvents();
  applyModeCopy();
  render();
}

function bindEvents() {
  elements.minimizeButton.addEventListener("click", () => api.minimize());
  elements.closeButton.addEventListener("click", async () => {
    if (state.installing) return;
    if (state.mode === "uninstall" && state.completed) {
      await api.finalizeUninstall();
      return;
    }
    api.close();
  });

  elements.browseButton.addEventListener("click", async () => {
    if (state.installing || state.mode !== "install") return;
    const selected = await api.chooseDirectory(elements.installDir.value);
    if (selected) {
      setInstallDir(selected);
    }
  });

  elements.installDir.addEventListener("input", () => {
    state.installDir = elements.installDir.value;
  });

  elements.installDir.addEventListener("blur", () => {
    if (state.mode !== "install") return;
    setInstallDir(normalizeInstallDirForDisplay(elements.installDir.value));
  });

  elements.deleteUserData.addEventListener("change", () => {
    state.deleteUserData = elements.deleteUserData.checked;
  });

  elements.installForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (state.installing) return;

    if (state.mode === "uninstall") {
      if (state.completed) {
        await api.finalizeUninstall();
        return;
      }
      await startUninstall();
      return;
    }

    if (state.completed) {
      await finishAndMaybeLaunch();
      return;
    }

    await startInstall();
  });

  elements.secondaryButton.addEventListener("click", async () => {
    if (state.installing) return;
    if (state.mode === "uninstall" && state.completed) {
      await api.finalizeUninstall();
      return;
    }
    await api.close();
  });

  elements.openInstallDirButton.addEventListener("click", () => {
    if (state.installedDir) api.openPath(state.installedDir);
  });

  elements.openUserDataDirButton.addEventListener("click", () => {
    if (state.userDataDir) api.openPath(state.userDataDir);
  });
}

function applyModeCopy() {
  const isUninstall = state.mode === "uninstall";
  document.title = isUninstall ? "Novayxk Uninstaller" : "Novayxk Installer";
  elements.chromeTitle.textContent = isUninstall ? "Novayxk Uninstall" : "Novayxk Setup";
  elements.heroEyebrow.textContent = isUninstall ? "Custom uninstaller" : "Custom installer";
  elements.heroTitle.textContent = isUninstall
    ? "干净地移除 Novayxk。"
    : "把你的 AI 编程工作台装进 Windows。";
  elements.heroBody.textContent = isUninstall
    ? "主程序、快捷方式和系统卸载入口会被移除。你也可以决定是否连同 .novayxk 里的配置与任务历史一起删除。"
    : "配置、项目记忆和任务历史会保存在用户目录，卸载主程序时默认不会误删你的工作数据。";

  elements.metricOneTitle.textContent = isUninstall ? "主程序清理" : "本地安装";
  elements.metricOneBody.textContent = isUninstall ? "移除安装目录" : "无需老式向导";
  elements.metricTwoTitle.textContent = isUninstall ? "快捷方式" : "开始菜单";
  elements.metricTwoBody.textContent = isUninstall ? "桌面与开始菜单一起清理" : "可选快捷方式";
  elements.metricThreeTitle.textContent = isUninstall ? "用户数据" : "卸载入口";
  elements.metricThreeBody.textContent = isUninstall ? "可选删除 .novayxk" : "接入系统设置";

  elements.optionsKicker.textContent = isUninstall ? "卸载选项" : "安装选项";
  elements.optionsTitle.textContent = isUninstall ? "确认要移除的内容。" : "选择一个干净利落的安装方式。";
  elements.optionsBody.textContent = isUninstall
    ? "卸载会移除 Novayxk 主程序和快捷方式。默认保留 .novayxk，避免误删你的模型配置、项目记忆和任务历史。"
    : "默认安装到当前用户目录，不需要管理员权限。你也可以换到其它专用目录。";
  elements.pathLabel.textContent = isUninstall ? "当前安装位置" : "安装位置";
  elements.progressKicker.textContent = isUninstall ? "正在卸载" : "正在安装";
  elements.resultKicker.textContent = isUninstall ? "卸载完成" : "安装完成";
  elements.resultTitle.textContent = isUninstall ? "Novayxk 已完成卸载。" : "Novayxk 已准备好。";
  elements.resultBody.textContent = isUninstall
    ? "主程序和系统入口已经清理。关闭这个窗口后会完成目录删除。"
    : "主程序、快捷方式和卸载入口已经写入。你的模型配置和项目记忆会保存在用户目录。";
  elements.installedDirLabel.textContent = isUninstall ? "已清理目录" : "安装目录";
  elements.userDataLabel.textContent = isUninstall ? "用户数据目录" : "用户配置";
  elements.openInstallDirButton.textContent = isUninstall ? "查看目录" : "打开目录";
  elements.openUserDataDirButton.textContent = "打开目录";

  elements.installDir.readOnly = isUninstall;
  elements.installDir.disabled = false;
  elements.browseButton.classList.toggle("hidden", isUninstall);
  elements.desktopOptionRow.classList.toggle("hidden", isUninstall);
  elements.startMenuOptionRow.classList.toggle("hidden", isUninstall);
  elements.launchOptionRow.classList.toggle("hidden", isUninstall);
  elements.deleteDataOptionRow.classList.toggle("hidden", !isUninstall);
}

async function startInstall() {
  clearError();
  state.installing = true;
  setInstallDir(normalizeInstallDirForDisplay(elements.installDir.value));
  setStep(1);
  setProgress(0);
  render();

  try {
    const result = await api.install({
      installDir: state.installDir,
      createDesktopShortcut: elements.desktopShortcut.checked,
      createStartMenuShortcut: elements.startMenuShortcut.checked,
      launchAfterInstall: elements.launchAfterInstall.checked,
    });

    state.completed = true;
    state.installedDir = result.installDir;
    state.userDataDir = result.userDataDir;
    elements.installedDir.textContent = result.installDir;
    elements.userDataDir.textContent = result.userDataDir;
    setStep(2);
  } catch (error) {
    showError(error?.message || "安装失败。");
    setStep(0);
  } finally {
    state.installing = false;
    render();
  }
}

function setInstallDir(installDir) {
  state.installDir = installDir;
  elements.installDir.value = installDir;
}

function normalizeInstallDirForDisplay(rawInstallDir) {
  const raw = String(rawInstallDir || "").trim();
  if (!raw) return raw;
  if (/^[a-zA-Z]:[\\/]*$/.test(raw)) {
    return `${raw.slice(0, 2)}\\${INSTALL_DIR_NAME}`;
  }
  return raw;
}

async function startUninstall() {
  clearError();
  state.installing = true;
  state.installDir = elements.installDir.value.trim();
  state.deleteUserData = elements.deleteUserData.checked;
  setStep(1);
  setProgress(0);
  elements.progressTitle.textContent = "准备卸载";
  elements.progressDetail.textContent = "正在清理系统入口与程序目录。";
  render();

  try {
    const result = await api.uninstall({
      installDir: state.installDir,
      deleteUserData: state.deleteUserData,
    });

    state.completed = true;
    state.installedDir = result.installDir;
    state.userDataDir = result.userDataDir;
    elements.installedDir.textContent = result.installDir;
    elements.userDataDir.textContent = result.userDataDir;
    elements.resultBody.textContent = result.deleteUserData
      ? "主程序已经移除。关闭这个窗口后会继续删除安装目录和 .novayxk 数据。"
      : "主程序已经移除。关闭这个窗口后会继续删除安装目录，.novayxk 数据会保留下来。";
    setStep(2);
  } catch (error) {
    showError(error?.message || "卸载失败。");
    setStep(0);
  } finally {
    state.installing = false;
    render();
  }
}

async function finishAndMaybeLaunch() {
  if (elements.launchAfterInstall.checked && state.installedDir) {
    await api.launchApp(state.installedDir);
  }
  await api.close();
}

function updateProgress(progress) {
  elements.progressTitle.textContent = progress.title || (state.mode === "uninstall" ? "正在卸载" : "正在安装");
  elements.progressDetail.textContent = progress.detail || "请稍等。";
  elements.progressPath.textContent = progress.detail || "";
  setProgress(progress.percent || 0);
}

function setProgress(percent) {
  const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
  const offset = CIRCLE_LENGTH - (safePercent / 100) * CIRCLE_LENGTH;
  elements.progressCircle.style.strokeDashoffset = String(offset);
  elements.progressPercent.textContent = `${Math.round(safePercent)}%`;
}

function setStep(step) {
  state.step = step;
  render();
}

function render() {
  document.querySelectorAll("[data-step]").forEach((stepEl) => {
    stepEl.classList.toggle("active", Number(stepEl.dataset.step) === state.step);
  });

  document.querySelectorAll("[data-step-dot]").forEach((dotEl) => {
    dotEl.classList.toggle("active", Number(dotEl.dataset.stepDot) <= state.step);
  });

  const isUninstall = state.mode === "uninstall";
  elements.primaryButton.disabled = state.installing;
  elements.secondaryButton.disabled = state.installing;
  elements.browseButton.disabled = state.installing || isUninstall;
  elements.installDir.disabled = state.installing;
  elements.desktopShortcut.disabled = state.installing;
  elements.startMenuShortcut.disabled = state.installing;
  elements.launchAfterInstall.disabled = state.installing;
  elements.deleteUserData.disabled = state.installing;

  if (state.completed) {
    if (isUninstall) {
      elements.primaryButton.textContent = "完成";
      elements.secondaryButton.textContent = "关闭";
    } else {
      elements.primaryButton.textContent = elements.launchAfterInstall.checked ? "启动 Novayxk" : "完成";
      elements.secondaryButton.textContent = "关闭";
    }
  } else if (state.installing) {
    elements.primaryButton.textContent = isUninstall ? "卸载中" : "安装中";
    elements.secondaryButton.textContent = "请稍等";
  } else {
    elements.primaryButton.textContent = isUninstall ? "开始卸载" : "开始安装";
    elements.secondaryButton.textContent = isUninstall ? "取消" : "退出";
  }
}

function clearError() {
  elements.errorText.textContent = "";
}

function showError(message) {
  elements.errorText.textContent = message;
}
