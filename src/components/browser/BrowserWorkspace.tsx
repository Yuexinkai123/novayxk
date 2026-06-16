import React from "react";
import {
  Eraser,
  ExternalLink,
  Globe,
  LoaderCircle,
  RefreshCw,
  StepBack,
  StepForward,
} from "lucide-react";
import type {
  BrowserAutomationResult,
  BrowserActionRecord,
  BrowserNetworkRecord,
  BrowserSnapshot,
  BrowserTraceSnapshot,
} from "../../vite-env";
import { type BrowserAutomationAction } from "../../browser/actions";
import type { BrowserPromptSnapshot } from "../../browser/context";
import {
  formatBrowserActionSummary,
  formatBrowserNetworkSummary,
} from "../../browser/workspace";
import type { BrowserRuntimeView } from "../../browser/runtime";

type BrowserWorkspaceProps = {
  webviewRef: React.MutableRefObject<BrowserRuntimeView | null>;
  browserUrlInput: string;
  browserSnapshot: BrowserSnapshot;
  browserActionLog: BrowserActionRecord[];
  browserNetworkLog: BrowserNetworkRecord[];
  browserTraceSnapshot: BrowserTraceSnapshot | null;
  browserGuestPreloadUrl: string;
  browserActionSelector: string;
  browserActionText: string;
  browserActionTimeoutMs: string;
  lastBrowserAutomationResult: BrowserAutomationResult | null;
  browserPromptSnapshot: BrowserPromptSnapshot | null;
  browserCommand: "reload" | "back" | "forward" | "navigate" | null;
  browserCommandNonce: number;
  browserTargetUrl: string;
  browserScriptInput: string;
  onBrowserUrlInputChange: (value: string) => void;
  onBrowserScriptInputChange: (value: string) => void;
  onBrowserActionSelectorChange: (value: string) => void;
  onBrowserActionTextChange: (value: string) => void;
  onBrowserActionTimeoutChange: (value: string) => void;
  onNavigateBrowser: () => void;
  onRunBrowserCommand: (command: "reload" | "back" | "forward") => void;
  onBrowserScriptExecuted: (result: { ok: boolean; preview: string }) => void;
  onRunBrowserAutomation: (action: BrowserAutomationAction) => Promise<BrowserAutomationResult>;
  onClearBrowserLogs: () => void;
  showAdvancedControls: boolean;
  isActive: boolean;
};

const BROWSER_PREVIEW_UNSUPPORTED_MESSAGE =
  "当前是浏览器预览环境，内嵌浏览器只在 Electron 桌面窗口里可用。";

function formatTimeLabel(value: string) {
  try {
    return new Date(value).toLocaleTimeString();
  } catch {
    return value;
  }
}

export function BrowserWorkspace({
  webviewRef,
  browserUrlInput,
  browserSnapshot,
  browserActionLog,
  browserNetworkLog,
  browserTraceSnapshot,
  browserGuestPreloadUrl,
  browserActionSelector,
  browserActionText,
  browserActionTimeoutMs,
  lastBrowserAutomationResult,
  browserPromptSnapshot,
  browserCommand,
  browserCommandNonce,
  browserTargetUrl,
  browserScriptInput,
  onBrowserUrlInputChange,
  onBrowserScriptInputChange,
  onBrowserActionSelectorChange,
  onBrowserActionTextChange,
  onBrowserActionTimeoutChange,
  onNavigateBrowser,
  onRunBrowserCommand,
  onBrowserScriptExecuted,
  onRunBrowserAutomation,
  onClearBrowserLogs,
  showAdvancedControls,
  isActive,
}: BrowserWorkspaceProps) {
  const [browserLoadError, setBrowserLoadError] = React.useState("");
  const [isNativeWebviewSupported, setIsNativeWebviewSupported] = React.useState(() => Boolean(window.novayxk));
  const [isBrowserViewReady, setIsBrowserViewReady] = React.useState(false);

  React.useEffect(() => {
    if (!window.novayxk) {
      setIsNativeWebviewSupported(false);
      setIsBrowserViewReady(false);
      setBrowserLoadError(BROWSER_PREVIEW_UNSUPPORTED_MESSAGE);
      return;
    }

    const view = webviewRef.current;
    if (!view) return;

    const sendSnapshot = (type: "did-start-loading" | "did-stop-loading" | "page-title-updated" | "did-navigate" | "did-navigate-in-page") => {
      const snapshot = {
        currentUrl: view.getURL() || browserSnapshot.currentUrl,
        title: view.getTitle() || browserSnapshot.title,
        canGoBack: view.canGoBack(),
        canGoForward: view.canGoForward(),
        isLoading: view.isLoading(),
        startedAt: browserSnapshot.startedAt,
      };
      window.novayxk?.syncBrowserSnapshot(snapshot);
      window.novayxk?.emitBrowserPageEvent(type, snapshot);
    };

    const onDidStartLoading = () => {
      setBrowserLoadError("");
      setIsBrowserViewReady(false);
      sendSnapshot("did-start-loading");
    };
    const onDidStopLoading = () => {
      setBrowserLoadError("");
      setIsBrowserViewReady(true);
      sendSnapshot("did-stop-loading");
    };
    const onDidNavigate = () => sendSnapshot("did-navigate");
    const onDidNavigateInPage = () => sendSnapshot("did-navigate-in-page");
    const onPageTitleUpdated = () => sendSnapshot("page-title-updated");
    const onDomReady = () => {
      setBrowserLoadError("");
      setIsBrowserViewReady(true);
    };
    const onDidFailLoad = (event: Event) => {
      const detail = (event as CustomEvent).detail as { errorDescription?: string; validatedURL?: string } | undefined;
      const failedUrl = detail?.validatedURL || view.getURL() || browserTargetUrl;
      const reason = detail?.errorDescription || "页面加载失败";
      setBrowserLoadError(`${reason} (${failedUrl})`);
      window.novayxk?.emitBrowserActionObserved({
        id: `browser-action-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        source: "system",
        type: "change",
        url: failedUrl,
        targetLabel: "load-error",
        valuePreview: reason,
        createdAt: new Date().toISOString(),
      });
    };
    const onIpcMessage = (event: Event) => {
      const payload = (event as CustomEvent).detail;
      if (!payload?.channel) return;
      if (payload.channel === "browser-action") {
        window.novayxk?.emitBrowserActionObserved(payload.args?.[0]);
        return;
      }
      if (payload.channel === "browser-network") {
        const networkPayload = payload.args?.[0];
        if (!networkPayload) return;
        window.novayxk?.emitBrowserNetworkObserved(networkPayload);
        return;
      }
      if (payload.channel === "browser-history") {
        const historyPayload = payload.args?.[0];
        if (!historyPayload) return;
        const snapshot = {
          currentUrl: historyPayload.url || view.getURL() || browserSnapshot.currentUrl,
          title: historyPayload.title || view.getTitle() || browserSnapshot.title,
          canGoBack: view.canGoBack(),
          canGoForward: view.canGoForward(),
          isLoading: view.isLoading(),
          startedAt: browserSnapshot.startedAt,
        };
        window.novayxk?.syncBrowserSnapshot(snapshot);
        window.novayxk?.emitBrowserPageEvent("did-navigate-in-page", snapshot);
        return;
      }
      if (payload.channel === "browser-ready") {
        setIsBrowserViewReady(true);
        sendSnapshot("did-stop-loading");
        return;
      }
      if (payload.channel === "browser-console") {
        const consolePayload = payload.args?.[0];
        if (!consolePayload?.message) return;
        window.novayxk?.emitBrowserActionObserved({
          id: `browser-action-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          source: "system",
          type: "change",
          url: consolePayload.url || view.getURL() || browserSnapshot.currentUrl,
          targetLabel: `console.${consolePayload.level || "log"}`,
          valuePreview: consolePayload.message,
          createdAt: consolePayload.createdAt || new Date().toISOString(),
        });
      }
    };

    view.addEventListener("did-start-loading", onDidStartLoading);
    view.addEventListener("did-stop-loading", onDidStopLoading);
    view.addEventListener("did-navigate", onDidNavigate);
    view.addEventListener("did-navigate-in-page", onDidNavigateInPage);
    view.addEventListener("dom-ready", onDomReady);
    view.addEventListener("did-fail-load", onDidFailLoad as EventListener);
    view.addEventListener("page-title-updated", onPageTitleUpdated as EventListener);
    view.addEventListener("ipc-message", onIpcMessage as EventListener);

    return () => {
      view.removeEventListener("did-start-loading", onDidStartLoading);
      view.removeEventListener("did-stop-loading", onDidStopLoading);
      view.removeEventListener("did-navigate", onDidNavigate);
      view.removeEventListener("did-navigate-in-page", onDidNavigateInPage);
      view.removeEventListener("dom-ready", onDomReady);
      view.removeEventListener("did-fail-load", onDidFailLoad as EventListener);
      view.removeEventListener("page-title-updated", onPageTitleUpdated as EventListener);
      view.removeEventListener("ipc-message", onIpcMessage as EventListener);
    };
  }, [browserSnapshot.currentUrl, browserSnapshot.startedAt, browserSnapshot.title, browserTargetUrl]);

  React.useEffect(() => {
    const view = webviewRef.current;
    if (!view || !browserCommand) return;
    setIsBrowserViewReady(false);
    if (browserCommand === "navigate") {
      view.loadURL(browserTargetUrl);
      return;
    }
    if (browserCommand === "reload") {
      view.reload();
      return;
    }
    if (browserCommand === "back") {
      if (view.canGoBack()) view.goBack();
      return;
    }
    if (browserCommand === "forward") {
      if (view.canGoForward()) view.goForward();
    }
  }, [browserCommand, browserCommandNonce, browserTargetUrl]);

  const handleRunScript = React.useCallback(async () => {
    const view = webviewRef.current;
    if (!view) return;
    try {
      const result = await view.executeJavaScript(browserScriptInput, true);
      window.novayxk?.emitBrowserActionObserved({
        id: `browser-action-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        source: "system",
        type: "change",
        url: view.getURL() || browserSnapshot.currentUrl,
        targetLabel: "script-result",
        valuePreview: String(result ?? "undefined").slice(0, 160),
        createdAt: new Date().toISOString(),
      });
      onBrowserScriptExecuted({
        ok: true,
        preview: String(result ?? "undefined").slice(0, 160),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 160) : "脚本执行失败";
      window.novayxk?.emitBrowserActionObserved({
        id: `browser-action-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        source: "system",
        type: "change",
        url: view.getURL() || browserSnapshot.currentUrl,
        targetLabel: "script-error",
        valuePreview: message,
        createdAt: new Date().toISOString(),
      });
      onBrowserScriptExecuted({
        ok: false,
        preview: message,
      });
    }
  }, [browserScriptInput, browserSnapshot.currentUrl, onBrowserScriptExecuted]);

  return (
    <div className={`browser-workspace ${isActive ? "is-active" : "is-hidden"}`}>
      <div className="browser-toolbar">
        <div className="browser-address-row">
          <button
            className="browser-nav-button"
            onClick={() => onRunBrowserCommand("back")}
            disabled={!browserSnapshot.canGoBack}
            title="后退"
          >
            <StepBack size={15} />
          </button>
          <button
            className="browser-nav-button"
            onClick={() => onRunBrowserCommand("forward")}
            disabled={!browserSnapshot.canGoForward}
            title="前进"
          >
            <StepForward size={15} />
          </button>
          <button className="browser-nav-button" onClick={() => onRunBrowserCommand("reload")} title="刷新">
            <RefreshCw size={15} />
          </button>
          <div className="browser-address-shell">
            <Globe size={14} />
            <input
              value={browserUrlInput}
              onChange={(event) => onBrowserUrlInputChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onNavigateBrowser();
                }
              }}
              placeholder="输入网址，例如 www.baidu.com"
              aria-label="浏览器地址栏"
            />
          </div>
          <button className="primary-button browser-open-button" onClick={onNavigateBrowser}>
            <ExternalLink size={15} />
            打开
          </button>
        </div>
        <div className="browser-toolbar-meta">
          <span>{browserSnapshot.title || "Browser Workspace"}</span>
          <span>{browserSnapshot.isLoading ? "加载中" : "空闲"}</span>
        </div>
        {showAdvancedControls ? (
          <>
            <div className="browser-script-row">
              <textarea
                value={browserScriptInput}
                onChange={(event) => onBrowserScriptInputChange(event.target.value)}
                placeholder="在当前页面执行一段前端脚本，例如 document.title"
                aria-label="浏览器脚本输入框"
              />
              <button className="primary-button browser-script-button" onClick={() => void handleRunScript()}>
                执行脚本
              </button>
            </div>
            <div className="browser-automation-row">
              <input
                value={browserActionSelector}
                onChange={(event) => onBrowserActionSelectorChange(event.target.value)}
                placeholder="CSS 选择器，例如 button[type=submit]"
                aria-label="浏览器动作选择器"
              />
              <input
                value={browserActionText}
                onChange={(event) => onBrowserActionTextChange(event.target.value)}
                placeholder="输入文本，可用于 type 动作"
                aria-label="浏览器动作文本"
              />
              <input
                value={browserActionTimeoutMs}
                onChange={(event) => onBrowserActionTimeoutChange(event.target.value)}
                placeholder="等待超时毫秒"
                aria-label="浏览器动作超时"
              />
              <button
                className="ghost-button browser-automation-button"
                onClick={() =>
                  void onRunBrowserAutomation({ type: "click", selector: browserActionSelector }).then((result) => {
                    onBrowserScriptExecuted({
                      ok: result.ok,
                      preview: result.preview,
                    });
                  })
                }
                disabled={!browserActionSelector.trim()}
              >
                点击
              </button>
              <button
                className="ghost-button browser-automation-button"
                onClick={() =>
                  void onRunBrowserAutomation({ type: "type", selector: browserActionSelector, text: browserActionText }).then((result) => {
                    onBrowserScriptExecuted({
                      ok: result.ok,
                      preview: result.preview,
                    });
                  })
                }
                disabled={!browserActionSelector.trim()}
              >
                输入
              </button>
              <button
                className="ghost-button browser-automation-button"
                onClick={() =>
                  void onRunBrowserAutomation({
                    type: "waitFor",
                    selector: browserActionSelector,
                    timeoutMs: Number(browserActionTimeoutMs) || 5000,
                  }).then((result) => {
                    onBrowserScriptExecuted({
                      ok: result.ok,
                      preview: result.preview,
                    });
                  })
                }
                disabled={!browserActionSelector.trim()}
              >
                等待
              </button>
            </div>
            {lastBrowserAutomationResult ? (
              <div className={`browser-automation-result ${lastBrowserAutomationResult.ok ? "ok" : "error"}`}>
                最近动作：{lastBrowserAutomationResult.action} · {lastBrowserAutomationResult.preview}
              </div>
            ) : null}
            {browserPromptSnapshot ? (
              <div className="browser-context-preview">
                页面摘要：{(browserPromptSnapshot.headings[0] || browserPromptSnapshot.title || browserPromptSnapshot.url).slice(0, 140)}
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      <div className="browser-layout">
        <div className="browser-surface">
          <div className="browser-surface-header">
            <span>内嵌浏览器</span>
            {browserSnapshot.isLoading ? <LoaderCircle size={14} className="spin" /> : null}
          </div>
          <div className={`browser-webview-shell ${browserLoadError ? "has-error" : ""}`}>
            {isNativeWebviewSupported ? (
              <webview
                ref={(node) => {
                  webviewRef.current = node as BrowserRuntimeView | null;
                  const supportsNativeApi = Boolean(
                    node &&
                      typeof (node as BrowserRuntimeView).loadURL === "function" &&
                      typeof (node as BrowserRuntimeView).executeJavaScript === "function",
                  );
                  setIsNativeWebviewSupported(supportsNativeApi);
                  if (!supportsNativeApi) {
                    setBrowserLoadError(BROWSER_PREVIEW_UNSUPPORTED_MESSAGE);
                  }
                }}
                className="browser-webview"
                src={browserTargetUrl}
                partition="novayxk-browser"
                preload={browserGuestPreloadUrl}
                webpreferences="contextIsolation=yes, nodeIntegration=no"
              />
            ) : null}
            {!browserLoadError && !isBrowserViewReady ? (
              <div className="browser-empty-state">
                <strong>浏览器内容区正在初始化</strong>
                <p>如果这里长时间没有页面内容，说明内嵌 webview 还没有真正挂载成功。</p>
              </div>
            ) : null}
            {browserLoadError ? (
              <div className="browser-empty-state browser-empty-state-error">
                <strong>这个页面没有正常显示</strong>
                <p>{browserLoadError}</p>
                <p>
                  {isNativeWebviewSupported
                    ? "不少网站会拒绝被内嵌显示，常见原因是 X-Frame-Options、CSP 或站点自身策略。"
                    : "如果你现在打开的是 http://127.0.0.1:5173/ 这种浏览器预览页，这块不会像桌面版那样工作。"}
                </p>
              </div>
            ) : null}
          </div>
        </div>

        <aside className="browser-inspector">
          <div className="browser-log-panel">
            <div className="browser-log-header">
              <strong>操作记录</strong>
              <button className="browser-clear-button" onClick={onClearBrowserLogs} title="清空日志">
                <Eraser size={14} />
              </button>
            </div>
            {browserTraceSnapshot?.path ? (
              <div className="browser-trace-file" title={browserTraceSnapshot.path}>
                临时轨迹：{browserTraceSnapshot.path}
              </div>
            ) : null}
            <div className="browser-log-list">
              {browserActionLog.length ? browserActionLog.map((record) => (
                <div key={record.id} className="browser-log-item">
                  <strong>{formatBrowserActionSummary(record)}</strong>
                  <span>{record.url}</span>
                  <small>{formatTimeLabel(record.createdAt)}</small>
                </div>
              )) : (
                <div className="browser-log-empty">还没有记录到浏览器操作。</div>
              )}
            </div>
          </div>

          <div className="browser-log-panel">
            <div className="browser-log-header">
              <strong>网络请求</strong>
            </div>
            <div className="browser-log-list">
              {browserNetworkLog.length ? browserNetworkLog.map((record) => (
                <div key={`${record.id}-${record.stage}`} className="browser-log-item">
                  <strong>{formatBrowserNetworkSummary(record)}</strong>
                  <span>{record.url}</span>
                  {record.requestBodyText ? <span>request: {record.requestBodyText.slice(0, 160)}</span> : null}
                  {record.responseBodyText ? <span>response: {record.responseBodyText.slice(0, 160)}</span> : null}
                  <small>{formatTimeLabel(record.createdAt)}</small>
                </div>
              )) : (
                <div className="browser-log-empty">还没有记录到网络请求。</div>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
