const api = window.novayxkUninstaller;

const state = {
  completed: false,
  running: false,
  installDir: "",
  userDataDir: "",
  userDataExists: false,
  progressPercent: 0,
  progressTitle: "Waiting to start",
  progressDetail: "Click Start uninstall to clean running processes, shortcuts, and the Windows uninstall entry step by step.",
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
  state.progressTitle = "Preparing uninstall";
  state.progressDetail = "Checking the app directory and preparing cleanup.";
  elements.resultText.textContent = "";
  render();
  try {
    const result = await api.run({
      installDir: state.installDir,
      deleteUserData: elements.deleteUserData.checked,
    });
    state.completed = true;
    state.progressPercent = 100;
    state.progressTitle = "Uninstall ready to finish";
    state.progressDetail = result.deleteUserData
      ? "The app has been removed. Click Done to continue deleting the install folder and .novayxk data in the background."
      : "The app has been removed. Click Done to continue deleting the install folder while keeping .novayxk data.";
    elements.resultText.textContent = result.deleteUserData
      ? "Uninstall is ready to finish. Closing the window will continue deleting the app folder and .novayxk data."
      : "Uninstall is ready to finish. Closing the window will continue deleting the app folder while keeping .novayxk data.";
  } catch (error) {
    state.progressTitle = "Uninstall failed";
    const message = normalizeUninstallError(error?.message || "Uninstall failed.");
    state.progressDetail = message;
    elements.resultText.textContent = message;
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
    elements.primaryButton.textContent = "Done";
    elements.secondaryButton.textContent = "Close";
  } else if (state.running) {
    elements.primaryButton.textContent = "Uninstalling";
    elements.secondaryButton.textContent = "Please wait";
  } else {
    elements.primaryButton.textContent = "Start uninstall";
    elements.secondaryButton.textContent = "Cancel";
  }

  renderProgress();
}

function updateProgress(progress) {
  state.progressPercent = Math.max(0, Math.min(100, Number(progress?.percent) || 0));
  state.progressTitle = progress?.title || "Uninstalling";
  state.progressDetail = progress?.detail || "Please wait.";
  renderProgress();
}

function renderProgress() {
  elements.progressTitle.textContent = state.progressTitle;
  elements.progressPercent.textContent = `${Math.round(state.progressPercent)}%`;
  elements.progressFill.style.width = `${state.progressPercent}%`;
  elements.progressDetail.textContent = state.progressDetail;
}

function normalizeUninstallError(message) {
  const cleaned = String(message || "")
    .replace(/^Error invoking remote method '[^']+':\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .trim();

  if (!cleaned) return "Uninstall failed.";

  if (/没有在这里找到|找不到 Novayxk 主程序或卸载器/i.test(cleaned)) {
    return [
      "Uninstall failed: the Novayxk app was not found in this folder.",
      "Make sure you selected the real Novayxk install directory, or start uninstall again from Windows Apps & features.",
    ].join("\n");
  }

  if (/EBUSY|EPERM|EACCES|占用|拒绝访问/i.test(cleaned)) {
    return [
      "Uninstall failed: some files are still in use.",
      "Close Novayxk, any Explorer windows opened at the install folder, and related terminal sessions, then try again.",
    ].join("\n");
  }

  return cleaned;
}
