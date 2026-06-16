import {
  createBrowserAutomationScript,
  getBrowserAutomationActionLabel,
  type BrowserAutomationAction,
} from "./actions";
import type {
  BrowserActionRecord,
  BrowserAutomationResult,
  BrowserSnapshot,
} from "../vite-env";

type BrowserRuntimeView = HTMLElement & {
  getURL: () => string;
  getTitle: () => string;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  isLoading: () => boolean;
  loadURL: (url: string) => void;
  reload: () => void;
  goBack: () => void;
  goForward: () => void;
  executeJavaScript: (code: string, userGesture?: boolean) => Promise<unknown>;
};

type BrowserSnapshotSyncOptions = {
  snapshot: BrowserSnapshot;
  emitPageEvent?: (type: BrowserPageEventType, snapshot: BrowserSnapshot) => void;
};

type BrowserAutomationRunnerOptions = {
  getView: () => BrowserRuntimeView | null;
  getSnapshot: () => BrowserSnapshot;
  syncSnapshot?: (options: BrowserSnapshotSyncOptions) => void;
  emitActionObserved?: (payload: BrowserActionRecord) => void;
  onAutomationResult?: (result: BrowserAutomationResult) => void;
};

type BrowserPageEventType = BrowserSnapshotEvent["type"];

type BrowserSnapshotEvent = {
  type: "did-start-loading" | "did-stop-loading" | "page-title-updated" | "did-navigate" | "did-navigate-in-page";
};

function createActionLogRecord(
  type: BrowserActionRecord["type"],
  url: string,
  targetLabel: string,
  valuePreview: string,
): BrowserActionRecord {
  return {
    id: `browser-action-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    source: "system",
    type,
    url,
    targetLabel,
    valuePreview,
    createdAt: new Date().toISOString(),
  };
}

function toPreview(value: unknown) {
  if (typeof value === "object" && value !== null) {
    try {
      return JSON.stringify(value).slice(0, 180);
    } catch {
      return "[object]".slice(0, 180);
    }
  }
  return String(value ?? "undefined").slice(0, 180);
}

function buildSnapshotFromView(view: BrowserRuntimeView, fallback: BrowserSnapshot): BrowserSnapshot {
  return {
    currentUrl: view.getURL() || fallback.currentUrl,
    title: view.getTitle() || fallback.title,
    canGoBack: view.canGoBack(),
    canGoForward: view.canGoForward(),
    isLoading: view.isLoading(),
    startedAt: fallback.startedAt,
  };
}

function waitForNavigationSettled(view: BrowserRuntimeView, timeoutMs: number, fallback: BrowserSnapshot) {
  return new Promise<BrowserSnapshot>((resolve, reject) => {
    let settled = false;
    let timer = 0;

    const finish = (snapshot: BrowserSnapshot) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      view.removeEventListener("did-stop-loading", onDidStopLoading);
      view.removeEventListener("did-fail-load", onDidFailLoad as EventListener);
      resolve(snapshot);
    };

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      view.removeEventListener("did-stop-loading", onDidStopLoading);
      view.removeEventListener("did-fail-load", onDidFailLoad as EventListener);
      reject(new Error(message));
    };

    const onDidStopLoading = () => {
      finish(buildSnapshotFromView(view, fallback));
    };

    const onDidFailLoad = (event: Event) => {
      const detail = (event as CustomEvent).detail as { errorDescription?: string } | undefined;
      fail(detail?.errorDescription || "页面加载失败");
    };

    view.addEventListener("did-stop-loading", onDidStopLoading);
    view.addEventListener("did-fail-load", onDidFailLoad as EventListener);
    timer = window.setTimeout(() => {
      finish(buildSnapshotFromView(view, fallback));
    }, Math.max(300, timeoutMs));
  });
}

export function createBrowserAutomationRunner({
  getView,
  getSnapshot,
  syncSnapshot,
  emitActionObserved,
  onAutomationResult,
}: BrowserAutomationRunnerOptions) {
  return async function executeBrowserAutomationAction(action: BrowserAutomationAction) {
    const view = getView();
    if (!view) {
      const unavailableResult: BrowserAutomationResult = {
        ok: false,
        action: action.type,
        preview: "浏览器视图尚未就绪，请先打开浏览器工作区。",
      };
      onAutomationResult?.(unavailableResult);
      return unavailableResult;
    }

    const currentSnapshot = getSnapshot();
    const currentUrl = view.getURL() || currentSnapshot.currentUrl;
    const label = getBrowserAutomationActionLabel(action);

    if (action.type === "navigate") {
      try {
        view.loadURL(action.url);
        const snapshot = await waitForNavigationSettled(view, action.timeoutMs ?? 8000, currentSnapshot);
        syncSnapshot?.({
          snapshot,
          emitPageEvent: window.novayxk?.emitBrowserPageEvent
            ? (type, nextSnapshot) => window.novayxk?.emitBrowserPageEvent(type, nextSnapshot)
            : undefined,
        });
        emitActionObserved?.(
          createActionLogRecord("navigate", snapshot.currentUrl, label, snapshot.title || snapshot.currentUrl),
        );
        const result: BrowserAutomationResult = {
          ok: true,
          action: "navigate",
          preview: `${snapshot.title || "页面已打开"} · ${snapshot.currentUrl}`.slice(0, 180),
        };
        onAutomationResult?.(result);
        return result;
      } catch (error) {
        const preview = error instanceof Error ? error.message.slice(0, 180) : "页面打开失败";
        emitActionObserved?.(createActionLogRecord("navigate", currentUrl, `${label}失败`, preview));
        const result: BrowserAutomationResult = {
          ok: false,
          action: "navigate",
          preview,
        };
        onAutomationResult?.(result);
        return result;
      }
    }

    try {
      const rawResult = await view.executeJavaScript(createBrowserAutomationScript(action), true);
      const preview = toPreview(rawResult);
      emitActionObserved?.(
        createActionLogRecord(action.type === "click" ? "click" : "change", currentUrl, label, preview),
      );
      const result: BrowserAutomationResult = {
        ok: true,
        action: action.type,
        selector: "selector" in action ? action.selector : undefined,
        preview,
      };
      onAutomationResult?.(result);
      return result;
    } catch (error) {
      const preview = error instanceof Error ? error.message.slice(0, 180) : `${label}失败`;
      emitActionObserved?.(createActionLogRecord("change", currentUrl, `${label}失败`, preview));
      const result: BrowserAutomationResult = {
        ok: false,
        action: action.type,
        selector: "selector" in action ? action.selector : undefined,
        preview,
      };
      onAutomationResult?.(result);
      return result;
    }
  };
}

export type { BrowserRuntimeView };
