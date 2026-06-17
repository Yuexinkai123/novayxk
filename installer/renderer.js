const api = window.novayxkInstaller;

const COPY = {
  en: {
    shared: {
      languageSwitch: "Installer language",
      minimize: "Minimize",
      close: "Close",
      stepIndicator: "Installation steps",
      browse: "Browse",
      targetPath: "Target path",
      waitingToStart: "Waiting to start",
      pleaseWait: "Please wait",
      exit: "Exit",
      cancel: "Cancel",
      closeAction: "Close",
      done: "Done",
      openFolder: "Open folder",
      viewFolder: "View folder",
      launch: "Launch Novayxk",
      installFailed: "Install failed.",
      uninstallFailed: "Uninstall failed.",
      actionFailed: "The action failed.",
      preparingInstallation: "Preparing installation",
      preparingInstallationDetail: "Checking the install location and bundled app files.",
      preparingUninstall: "Preparing uninstall",
      preparingUninstallDetail: "Cleaning Windows entries and app files.",
    },
    install: {
      windowTitle: "Novayxk Installer",
      chromeTitle: "Novayxk Setup",
      heroEyebrow: "",
      heroTitle: "",
      heroBody:
        "Settings, project memory, and task history stay in your user directory so uninstalling the app does not wipe your work by default.",
      metricOneTitle: "",
      metricOneBody: "",
      metricTwoTitle: "",
      metricTwoBody: "",
      metricThreeTitle: "",
      metricThreeBody: "",
      optionsKicker: "Install options",
      optionsTitle: "",
      optionsBody:
        "By default Novayxk installs into your user directory without admin rights. You can also choose another dedicated folder.",
      pathLabel: "Install location",
      desktopOptionTitle: "Create desktop shortcut",
      desktopOptionBody: "Launch Novayxk from the desktop after installation",
      startMenuOptionTitle: "Add to Start menu",
      startMenuOptionBody: "Show Novayxk in the Windows Start menu",
      launchOptionTitle: "Launch after install",
      launchOptionBody: "Open the app as soon as setup finishes",
      progressKicker: "Installing",
      resultKicker: "Installation complete",
      resultTitle: "Novayxk is ready.",
      resultBody:
        "The app, shortcuts, and uninstall entry have been written. Your model settings and project memory remain in your user directory.",
      installedDirLabel: "Install directory",
      userDataLabel: "User data",
      startAction: "Start install",
      runningAction: "Installing",
    },
    uninstall: {
      windowTitle: "Novayxk Uninstaller",
      chromeTitle: "Novayxk Uninstall",
      heroEyebrow: "Custom uninstaller",
      heroTitle: "Remove Novayxk cleanly.",
      heroBody:
        "The app, shortcuts, and Windows uninstall entry will be removed. You can also choose whether to delete settings and task history from .novayxk.",
      metricOneTitle: "App cleanup",
      metricOneBody: "Remove the install folder",
      metricTwoTitle: "Shortcuts",
      metricTwoBody: "Clean desktop and Start menu links",
      metricThreeTitle: "User data",
      metricThreeBody: "Optionally remove .novayxk",
      optionsKicker: "Uninstall options",
      optionsTitle: "Confirm what to remove.",
      optionsBody:
        "Uninstalling removes the app and its shortcuts. By default .novayxk is kept so your model settings, project memory, and task history are not deleted by accident.",
      pathLabel: "Current install location",
      deleteDataOptionTitle: "Delete user data too",
      deleteDataOptionBody: "Remove settings, project memory, and task history from .novayxk",
      progressKicker: "Uninstalling",
      resultKicker: "Uninstall complete",
      resultTitle: "Novayxk has been removed.",
      resultBody:
        "The app and Windows entries have been cleaned up. Closing this window will finish directory removal.",
      resultBodyDeleteData:
        "The app has been removed. Closing this window will continue deleting the install folder and .novayxk data.",
      resultBodyKeepData:
        "The app has been removed. Closing this window will continue deleting the install folder while keeping .novayxk data.",
      installedDirLabel: "Cleaned directory",
      userDataLabel: "User data directory",
      startAction: "Start uninstall",
      runningAction: "Uninstalling",
    },
    progress: {
      "Preparing install directory": "Preparing install directory",
      "Checking app resources": "Checking app resources",
      "Copying Novayxk": "Copying Novayxk",
      "Closing old version processes": "Closing old version processes",
      "Switching install directory": "Switching install directory",
      "Writing uninstaller": "Writing uninstaller",
      "Creating desktop shortcut": "Creating desktop shortcut",
      "Creating Start menu shortcut": "Creating Start menu shortcut",
      "Registering uninstall entry": "Registering uninstall entry",
      "Installation complete": "Installation complete",
      "Extracting installation resources": "Extracting installation resources",
      "Preparing uninstall": "Preparing uninstall",
      "Closing running Novayxk processes": "Closing running Novayxk processes",
      "Removing shortcuts": "Removing shortcuts",
      "Cleaning uninstall entry": "Cleaning uninstall entry",
      "Scheduling directory cleanup": "Scheduling directory cleanup",
      "Uninstall is ready": "Uninstall is ready",
      "Counting files to copy": "Counting files to copy",
      "Writing main application files": "Writing main application files",
      "Releasing app files that may still be in use": "Releasing app files that may still be in use",
      "Replacing files from the previous version": "Replacing files from the previous version",
      "The custom uninstaller keeps .novayxk data by default": "The custom uninstaller keeps .novayxk data by default",
      "Windows Apps & Features": "Windows Apps & Features",
      "Preparing the Novayxk application files": "Preparing the Novayxk application files",
      "Releasing files that are still in use": "Releasing files that are still in use",
      "Desktop and Start menu entries": "Desktop and Start menu entries",
      "Final deletion will complete after the window closes": "Final deletion will complete after the window closes",
      ".novayxk data will also be deleted after the window closes": ".novayxk data will also be deleted after the window closes",
      ".novayxk data will be kept after the window closes": ".novayxk data will be kept after the window closes",
    },
    errors: {
      busy: [
        "Install failed: the previous install directory is still locked.",
        "Close Novayxk, the uninstaller, and any Explorer or terminal windows that still have the install folder open, then click Start install again.",
        "If it still fails, restart Windows and run the installer again before reopening the app.",
      ].join("\n"),
      invalidDir: [
        "Install failed: this directory is not suitable for a direct install.",
        "Use an empty folder, or choose a dedicated folder named Novayxk so other files are not overwritten.",
      ].join("\n"),
      missingResources: [
        "Install failed: bundled install resources are incomplete.",
        "Rebuild the installer package or download a fresh full custom installer and try again.",
      ].join("\n"),
    },
  },
  "zh-CN": {
    shared: {
      languageSwitch: "安装器语言",
      minimize: "最小化",
      close: "关闭",
      stepIndicator: "安装步骤",
      browse: "浏览",
      targetPath: "目标路径",
      waitingToStart: "等待开始",
      pleaseWait: "请稍候",
      exit: "退出",
      cancel: "取消",
      closeAction: "关闭",
      done: "完成",
      openFolder: "打开文件夹",
      viewFolder: "查看文件夹",
      launch: "启动 Novayxk",
      installFailed: "安装失败。",
      uninstallFailed: "卸载失败。",
      actionFailed: "操作失败。",
      preparingInstallation: "准备安装",
      preparingInstallationDetail: "正在检查安装位置和随附的应用文件。",
      preparingUninstall: "准备卸载",
      preparingUninstallDetail: "正在清理 Windows 项和应用文件。",
    },
    install: {
      windowTitle: "Novayxk 安装器",
      chromeTitle: "安装 Novayxk",
      heroEyebrow: "",
      heroTitle: "",
      heroBody:
        "设置、项目记忆和任务历史会保留在你的用户目录里，所以卸载应用时默认不会把你的工作一起清掉。",
      metricOneTitle: "",
      metricOneBody: "",
      metricTwoTitle: "",
      metricTwoBody: "",
      metricThreeTitle: "",
      metricThreeBody: "",
      optionsKicker: "安装选项",
      optionsTitle: "",
      optionsBody: "默认会把 Novayxk 安装到你的用户目录中，不需要管理员权限。你也可以选择另一个专用文件夹。",
      pathLabel: "安装位置",
      desktopOptionTitle: "创建桌面快捷方式",
      desktopOptionBody: "安装后可直接从桌面启动 Novayxk",
      startMenuOptionTitle: "添加到开始菜单",
      startMenuOptionBody: "让 Novayxk 出现在 Windows 开始菜单中",
      launchOptionTitle: "安装完成后启动",
      launchOptionBody: "安装结束后立即打开应用",
      progressKicker: "正在安装",
      resultKicker: "安装完成",
      resultTitle: "Novayxk 已准备就绪。",
      resultBody: "应用、快捷方式和卸载入口已经写入完成。你的模型设置和项目记忆仍保留在用户目录中。",
      installedDirLabel: "安装目录",
      userDataLabel: "用户数据",
      startAction: "开始安装",
      runningAction: "安装中",
    },
    uninstall: {
      windowTitle: "Novayxk 卸载器",
      chromeTitle: "卸载 Novayxk",
      heroEyebrow: "自定义卸载器",
      heroTitle: "把 Novayxk 干净地移除。",
      heroBody: "应用、快捷方式和 Windows 卸载项都会被移除。你也可以选择是否一并删除 .novayxk 里的设置和任务历史。",
      metricOneTitle: "应用清理",
      metricOneBody: "移除安装目录",
      metricTwoTitle: "快捷方式",
      metricTwoBody: "清理桌面和开始菜单链接",
      metricThreeTitle: "用户数据",
      metricThreeBody: "可选移除 .novayxk",
      optionsKicker: "卸载选项",
      optionsTitle: "确认要移除的内容。",
      optionsBody: "卸载会移除应用和它的快捷方式。默认会保留 .novayxk，这样你的模型设置、项目记忆和任务历史不会被误删。",
      pathLabel: "当前安装位置",
      deleteDataOptionTitle: "同时删除用户数据",
      deleteDataOptionBody: "从 .novayxk 中移除设置、项目记忆和任务历史",
      progressKicker: "正在卸载",
      resultKicker: "卸载完成",
      resultTitle: "Novayxk 已被移除。",
      resultBody: "应用和 Windows 项已经清理完成。关闭这个窗口后会继续完成目录删除。",
      resultBodyDeleteData: "应用已经移除。关闭这个窗口后会继续删除安装目录和 .novayxk 数据。",
      resultBodyKeepData: "应用已经移除。关闭这个窗口后会继续删除安装目录，同时保留 .novayxk 数据。",
      installedDirLabel: "已清理目录",
      userDataLabel: "用户数据目录",
      startAction: "开始卸载",
      runningAction: "卸载中",
    },
    progress: {
      "Preparing install directory": "准备安装目录",
      "Checking app resources": "检查应用资源",
      "Copying Novayxk": "复制 Novayxk",
      "Closing old version processes": "关闭旧版本进程",
      "Switching install directory": "切换安装目录",
      "Writing uninstaller": "写入卸载器",
      "Creating desktop shortcut": "创建桌面快捷方式",
      "Creating Start menu shortcut": "创建开始菜单快捷方式",
      "Registering uninstall entry": "写入卸载入口",
      "Installation complete": "安装完成",
      "Extracting installation resources": "解压安装资源",
      "Preparing uninstall": "准备卸载",
      "Closing running Novayxk processes": "关闭正在运行的 Novayxk 进程",
      "Removing shortcuts": "移除快捷方式",
      "Cleaning uninstall entry": "清理卸载入口",
      "Scheduling directory cleanup": "安排目录清理",
      "Uninstall is ready": "卸载已就绪",
      "Counting files to copy": "正在统计待复制文件",
      "Writing main application files": "正在写入主应用文件",
      "Releasing app files that may still be in use": "正在释放仍被占用的应用文件",
      "Replacing files from the previous version": "正在替换旧版本文件",
      "The custom uninstaller keeps .novayxk data by default": "自定义卸载器默认会保留 .novayxk 数据",
      "Windows Apps & Features": "Windows 应用和功能",
      "Preparing the Novayxk application files": "正在准备 Novayxk 应用文件",
      "Releasing files that are still in use": "正在释放仍被占用的文件",
      "Desktop and Start menu entries": "桌面和开始菜单项",
      "Final deletion will complete after the window closes": "窗口关闭后会完成最终删除",
      ".novayxk data will also be deleted after the window closes": "窗口关闭后也会删除 .novayxk 数据",
      ".novayxk data will be kept after the window closes": "窗口关闭后会保留 .novayxk 数据",
    },
    errors: {
      busy: [
        "安装失败：之前的安装目录仍被占用。",
        "请关闭 Novayxk、卸载器，以及仍打开该安装目录的资源管理器或终端窗口，然后再次点击“开始安装”。",
        "如果还是失败，请重启 Windows，然后第一时间重新运行安装器。",
      ].join("\n"),
      invalidDir: [
        "安装失败：这个目录不适合直接安装。",
        "请使用空文件夹，或者选择一个名为 Novayxk 的专用目录，避免覆盖其他文件。",
      ].join("\n"),
      missingResources: [
        "安装失败：随附的安装资源不完整。",
        "请重新构建安装包，或者重新下载完整的自定义安装器后再试。",
      ].join("\n"),
    },
  },
};

const state = {
  mode: "install",
  step: 0,
  language: "en",
  installDir: "",
  installedDir: "",
  userDataDir: "",
  userDataExists: false,
  deleteUserData: false,
  installing: false,
  completed: false,
  lastProgress: null,
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
  metricGrid: document.querySelector("#metricGrid"),
  metricCardOne: document.querySelector("#metricCardOne"),
  metricCardTwo: document.querySelector("#metricCardTwo"),
  metricCardThree: document.querySelector("#metricCardThree"),
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
  desktopOptionTitle: document.querySelector("#desktopOptionTitle"),
  desktopOptionBody: document.querySelector("#desktopOptionBody"),
  startMenuOptionTitle: document.querySelector("#startMenuOptionTitle"),
  startMenuOptionBody: document.querySelector("#startMenuOptionBody"),
  launchOptionTitle: document.querySelector("#launchOptionTitle"),
  launchOptionBody: document.querySelector("#launchOptionBody"),
  deleteDataOptionTitle: document.querySelector("#deleteDataOptionTitle"),
  deleteDataOptionBody: document.querySelector("#deleteDataOptionBody"),
  desktopShortcut: document.querySelector("#desktopShortcut"),
  startMenuShortcut: document.querySelector("#startMenuShortcut"),
  launchAfterInstall: document.querySelector("#launchAfterInstall"),
  deleteUserData: document.querySelector("#deleteUserData"),
  progressKicker: document.querySelector("#progressKicker"),
  progressPathLabel: document.querySelector("#progressPathLabel"),
  primaryButton: document.querySelector("#primaryButton"),
  secondaryButton: document.querySelector("#secondaryButton"),
  minimizeButton: document.querySelector("#minimizeButton"),
  closeButton: document.querySelector("#closeButton"),
  languageEnglishButton: document.querySelector("#languageEnglishButton"),
  languageChineseButton: document.querySelector("#languageChineseButton"),
  languageSwitch: document.querySelector("#languageSwitch"),
  stepIndicator: document.querySelector("#stepIndicator"),
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
  state.language = defaults.defaultLanguage === "zh-CN" ? "zh-CN" : "en";
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

  elements.languageEnglishButton.addEventListener("click", () => setLanguage("en"));
  elements.languageChineseButton.addEventListener("click", () => setLanguage("zh-CN"));

  elements.browseButton.addEventListener("click", async () => {
    if (state.installing || state.mode !== "install") return;
    const selected = await api.chooseDirectory(elements.installDir.value, state.language);
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

function getCopy() {
  return COPY[state.language] || COPY.en;
}

function setLanguage(nextLanguage) {
  if (state.language === nextLanguage) return;
  state.language = nextLanguage === "zh-CN" ? "zh-CN" : "en";
  applyModeCopy();
  render();
}

function applyModeCopy() {
  const copy = getCopy();
  const modeCopy = state.mode === "uninstall" ? copy.uninstall : copy.install;

  document.documentElement.lang = state.language;
  document.title = modeCopy.windowTitle;
  elements.chromeTitle.textContent = modeCopy.chromeTitle;
  elements.heroEyebrow.textContent = modeCopy.heroEyebrow;
  elements.heroEyebrow.classList.toggle("hidden", !modeCopy.heroEyebrow);
  elements.heroTitle.textContent = modeCopy.heroTitle;
  elements.heroTitle.classList.toggle("hidden", !modeCopy.heroTitle);
  elements.heroBody.textContent = modeCopy.heroBody;
  elements.metricOneTitle.textContent = modeCopy.metricOneTitle;
  elements.metricOneBody.textContent = modeCopy.metricOneBody;
  elements.metricTwoTitle.textContent = modeCopy.metricTwoTitle;
  elements.metricTwoBody.textContent = modeCopy.metricTwoBody;
  elements.metricThreeTitle.textContent = modeCopy.metricThreeTitle;
  elements.metricThreeBody.textContent = modeCopy.metricThreeBody;
  toggleMetricCard(elements.metricCardOne, modeCopy.metricOneTitle, modeCopy.metricOneBody);
  toggleMetricCard(elements.metricCardTwo, modeCopy.metricTwoTitle, modeCopy.metricTwoBody);
  toggleMetricCard(elements.metricCardThree, modeCopy.metricThreeTitle, modeCopy.metricThreeBody);
  const hasVisibleMetricCard = [elements.metricCardOne, elements.metricCardTwo, elements.metricCardThree].some(
    (card) => card && !card.classList.contains("hidden"),
  );
  elements.metricGrid.classList.toggle("hidden", !hasVisibleMetricCard);
  elements.optionsKicker.textContent = modeCopy.optionsKicker;
  elements.optionsTitle.textContent = modeCopy.optionsTitle;
  elements.optionsBody.textContent = modeCopy.optionsBody;
  elements.pathLabel.textContent = modeCopy.pathLabel;
  elements.progressKicker.textContent = modeCopy.progressKicker;
  elements.resultKicker.textContent = modeCopy.resultKicker;
  elements.resultTitle.textContent = modeCopy.resultTitle;
  elements.resultBody.textContent =
    state.mode === "uninstall" && state.completed
      ? (state.deleteUserData ? copy.uninstall.resultBodyDeleteData : copy.uninstall.resultBodyKeepData)
      : modeCopy.resultBody;
  elements.installedDirLabel.textContent = modeCopy.installedDirLabel;
  elements.userDataLabel.textContent = modeCopy.userDataLabel;

  elements.desktopOptionTitle.textContent = copy.install.desktopOptionTitle;
  elements.desktopOptionBody.textContent = copy.install.desktopOptionBody;
  elements.startMenuOptionTitle.textContent = copy.install.startMenuOptionTitle;
  elements.startMenuOptionBody.textContent = copy.install.startMenuOptionBody;
  elements.launchOptionTitle.textContent = copy.install.launchOptionTitle;
  elements.launchOptionBody.textContent = copy.install.launchOptionBody;
  elements.deleteDataOptionTitle.textContent = copy.uninstall.deleteDataOptionTitle;
  elements.deleteDataOptionBody.textContent = copy.uninstall.deleteDataOptionBody;

  elements.languageSwitch.setAttribute("aria-label", copy.shared.languageSwitch);
  elements.stepIndicator.setAttribute("aria-label", copy.shared.stepIndicator);
  elements.minimizeButton.setAttribute("aria-label", copy.shared.minimize);
  elements.closeButton.setAttribute("aria-label", copy.shared.close);
  elements.browseButton.textContent = copy.shared.browse;
  elements.openInstallDirButton.textContent = state.mode === "uninstall" ? copy.shared.viewFolder : copy.shared.openFolder;
  elements.openUserDataDirButton.textContent = copy.shared.openFolder;
  elements.progressPathLabel.textContent = copy.shared.targetPath;

  elements.languageEnglishButton.classList.toggle("active", state.language === "en");
  elements.languageChineseButton.classList.toggle("active", state.language === "zh-CN");

  elements.installDir.readOnly = state.mode === "uninstall";
  elements.installDir.disabled = false;
  elements.browseButton.classList.toggle("hidden", state.mode === "uninstall");
  elements.desktopOptionRow.classList.toggle("hidden", state.mode === "uninstall");
  elements.startMenuOptionRow.classList.toggle("hidden", state.mode === "uninstall");
  elements.launchOptionRow.classList.toggle("hidden", state.mode === "uninstall");
  elements.deleteDataOptionRow.classList.toggle("hidden", state.mode !== "uninstall");

  refreshProgressCopy();
}

async function startInstall() {
  clearError();
  state.installing = true;
  state.completed = false;
  state.lastProgress = {
    title: "Preparing installation",
    detail: "Checking the install location and bundled app files.",
    path: "",
    percent: 0,
  };
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
    showError(normalizeInstallerError(error?.message || getCopy().shared.installFailed));
    state.lastProgress = null;
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
  state.completed = false;
  state.installDir = elements.installDir.value.trim();
  state.deleteUserData = elements.deleteUserData.checked;
  state.lastProgress = {
    title: "Preparing uninstall",
    detail: "Cleaning Windows entries and app files.",
    path: "",
    percent: 0,
  };
  setStep(1);
  setProgress(0);
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
      ? getCopy().uninstall.resultBodyDeleteData
      : getCopy().uninstall.resultBodyKeepData;
    setStep(2);
  } catch (error) {
    showError(normalizeInstallerError(error?.message || getCopy().shared.uninstallFailed));
    state.lastProgress = null;
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
  state.lastProgress = {
    title: progress?.title || "",
    detail: progress?.detail || "",
    path: progress?.detail || "",
    percent: progress?.percent || 0,
  };
  applyProgressCopy();
}

function applyProgressCopy() {
  const copy = getCopy();
  if (!state.lastProgress) {
    elements.progressTitle.textContent =
      state.mode === "uninstall" ? copy.shared.preparingUninstall : copy.shared.preparingInstallation;
    elements.progressDetail.textContent =
      state.mode === "uninstall" ? copy.shared.preparingUninstallDetail : copy.shared.preparingInstallationDetail;
    elements.progressPath.textContent = copy.shared.waitingToStart;
    return;
  }

  elements.progressTitle.textContent = localizeProgressText(state.lastProgress.title);
  elements.progressDetail.textContent = localizeProgressText(state.lastProgress.detail);
  elements.progressPath.textContent = state.lastProgress.path
    ? localizeProgressText(state.lastProgress.path)
    : copy.shared.waitingToStart;
  setProgress(state.lastProgress.percent);
}

function localizeProgressText(value) {
  const text = String(value || "").trim();
  if (!text) return text;
  const localized = getCopy().progress[text];
  return localized || text;
}

function refreshProgressCopy() {
  applyProgressCopy();
}

function toggleMetricCard(card, title, body) {
  if (!card) return;
  card.classList.toggle("hidden", !String(title || "").trim() && !String(body || "").trim());
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
  const copy = getCopy();
  const modeCopy = state.mode === "uninstall" ? copy.uninstall : copy.install;

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
      elements.primaryButton.textContent = copy.shared.done;
      elements.secondaryButton.textContent = copy.shared.closeAction;
    } else {
      elements.primaryButton.textContent = elements.launchAfterInstall.checked ? copy.shared.launch : copy.shared.done;
      elements.secondaryButton.textContent = copy.shared.closeAction;
    }
  } else if (state.installing) {
    elements.primaryButton.textContent = modeCopy.runningAction;
    elements.secondaryButton.textContent = copy.shared.pleaseWait;
  } else {
    elements.primaryButton.textContent = modeCopy.startAction;
    elements.secondaryButton.textContent = isUninstall ? copy.shared.cancel : copy.shared.exit;
  }
}

function clearError() {
  elements.errorText.textContent = "";
}

function showError(message) {
  elements.errorText.textContent = message;
}

function normalizeInstallerError(message) {
  const cleaned = String(message || "")
    .replace(/^Error invoking remote method '[^']+':\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .trim();

  if (!cleaned) return getCopy().shared.actionFailed;

  if (/安装目录正在被占用|INSTALL_DIR_BUSY|EBUSY|EPERM|EACCES/i.test(cleaned)) {
    return getCopy().errors.busy;
  }

  if (/专用文件夹|已有其他文件|目录不能为空|directory is too broad|selected directory already contains other files|direct install/i.test(cleaned)) {
    return getCopy().errors.invalidDir;
  }

  if (/安装资源不存在|资源包不存在|没有找到|bundled install resources are incomplete|resource archive was not found|resources were not found/i.test(cleaned)) {
    return getCopy().errors.missingResources;
  }

  return cleaned;
}
