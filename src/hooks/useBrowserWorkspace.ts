import React from "react";
import type {
  BrowserAutomationResult,
  BrowserActionRecord,
  BrowserNetworkRecord,
  BrowserPageEvent,
  BrowserRemoteRequest,
  BrowserSnapshot,
  BrowserTraceSnapshot,
} from "../vite-env";
import { type BrowserAutomationAction } from "../browser/actions";
import {
  createBrowserPromptSnapshotScript,
  formatBrowserPromptContext,
  type BrowserPromptSnapshot,
} from "../browser/context";
import { createBrowserAutomationRunner, type BrowserRuntimeView } from "../browser/runtime";
import {
  DEFAULT_BROWSER_START_URL,
  normalizeBrowserUrl,
  upsertBrowserNetworkRecord,
} from "../browser/workspace";
import { formatActionableError } from "../app/errors";

const emptyBrowserSnapshot: BrowserSnapshot = {
  currentUrl: DEFAULT_BROWSER_START_URL,
  title: "Browser Workspace",
  canGoBack: false,
  canGoForward: false,
  isLoading: false,
  startedAt: new Date().toISOString(),
};

type UseBrowserWorkspaceOptions = {
  setStatus: (status: string) => void;
};

export function useBrowserWorkspace({ setStatus }: UseBrowserWorkspaceOptions) {
  const webviewRef = React.useRef<BrowserRuntimeView | null>(null);
  const [browserUrlInput, setBrowserUrlInput] = React.useState(DEFAULT_BROWSER_START_URL);
  const [browserSnapshot, setBrowserSnapshot] = React.useState<BrowserSnapshot>(emptyBrowserSnapshot);
  const [browserActionLog, setBrowserActionLog] = React.useState<BrowserActionRecord[]>([]);
  const [browserNetworkLog, setBrowserNetworkLog] = React.useState<BrowserNetworkRecord[]>([]);
  const [browserTraceSnapshot, setBrowserTraceSnapshot] = React.useState<BrowserTraceSnapshot | null>(null);
  const [browserGuestPreloadUrl, setBrowserGuestPreloadUrl] = React.useState("");
  const [browserScriptInput, setBrowserScriptInput] = React.useState("document.title");
  const [browserActionSelector, setBrowserActionSelector] = React.useState("");
  const [browserActionText, setBrowserActionText] = React.useState("");
  const [browserActionTimeoutMs, setBrowserActionTimeoutMs] = React.useState("5000");
  const [lastBrowserAutomationResult, setLastBrowserAutomationResult] = React.useState<BrowserAutomationResult | null>(null);
  const [browserPromptSnapshot, setBrowserPromptSnapshot] = React.useState<BrowserPromptSnapshot | null>(null);
  const [browserCommandNonce, setBrowserCommandNonce] = React.useState(0);
  const [browserCommand, setBrowserCommand] = React.useState<"reload" | "back" | "forward" | "navigate" | null>(null);
  const [browserTargetUrl, setBrowserTargetUrl] = React.useState(DEFAULT_BROWSER_START_URL);

  React.useEffect(() => {
    if (!window.novayxk) return;
    void window.novayxk.getBrowserSnapshot().then(setBrowserSnapshot).catch(() => {
      // Keep local fallback state when the browser snapshot is not available yet.
    });
    void window.novayxk.browserGetActionLog().then(setBrowserActionLog).catch(() => {
      // Ignore bootstrap failures and let live events hydrate the panel.
    });
    void window.novayxk.browserGetNetworkLog().then(setBrowserNetworkLog).catch(() => {
      // Ignore bootstrap failures and let live events hydrate the panel.
    });
    void window.novayxk.browserGetTrace?.().then(setBrowserTraceSnapshot).catch(() => {
      // Trace files are optional and recreated with the browser workspace window.
    });
    void window.novayxk.browserGetGuestPreloadUrl().then(setBrowserGuestPreloadUrl).catch(() => {
      // Fallback to inline-less mode if preload resolution fails.
    });

    const unsubscribePage = window.novayxk.onBrowserPageEvent((payload: BrowserPageEvent) => {
      setBrowserSnapshot(payload.snapshot);
      setBrowserUrlInput(payload.snapshot.currentUrl);
    });
    const unsubscribeAction = window.novayxk.onBrowserActionEvent((payload) => {
      setBrowserActionLog((current) => [payload, ...current.filter((item) => item.id !== payload.id)].slice(0, 180));
    });
    const unsubscribeNetwork = window.novayxk.onBrowserNetworkEvent((payload) => {
      setBrowserNetworkLog((current) => upsertBrowserNetworkRecord(current, payload));
    });

    return () => {
      unsubscribePage();
      unsubscribeAction();
      unsubscribeNetwork();
    };
  }, []);

  React.useEffect(() => {
    setBrowserUrlInput(browserSnapshot.currentUrl || DEFAULT_BROWSER_START_URL);
  }, [browserSnapshot.currentUrl]);

  const navigateBrowser = React.useCallback(async () => {
    const nextUrl = normalizeBrowserUrl(browserUrlInput);
    setBrowserTargetUrl(nextUrl);
    setBrowserCommand("navigate");
    setBrowserCommandNonce((value) => value + 1);
    try {
      const snapshot = await window.novayxk?.browserNavigate(nextUrl);
      if (snapshot) {
        setBrowserSnapshot(snapshot);
      }
      setStatus(`Browser opened: ${nextUrl}`);
    } catch (error) {
      setStatus(formatActionableError(error, "Failed to open the browser URL"));
    }
  }, [browserUrlInput, setStatus]);

  const runBrowserCommand = React.useCallback(
    async (command: "reload" | "back" | "forward") => {
      setBrowserCommand(command);
      setBrowserCommandNonce((value) => value + 1);
      try {
        let snapshot: BrowserSnapshot | undefined;
        if (command === "reload") snapshot = await window.novayxk?.browserReload();
        if (command === "back") snapshot = await window.novayxk?.browserGoBack();
        if (command === "forward") snapshot = await window.novayxk?.browserGoForward();
        if (snapshot) {
          setBrowserSnapshot(snapshot);
        }
      } catch (error) {
        setStatus(formatActionableError(error, "Failed to execute the browser navigation command"));
      }
    },
    [setStatus],
  );

  const clearBrowserLogs = React.useCallback(async () => {
    try {
      await window.novayxk?.browserClearLogs();
      setBrowserActionLog([]);
      setBrowserNetworkLog([]);
      setStatus("Cleared browser action and network logs");
    } catch (error) {
      setStatus(formatActionableError(error, "Failed to clear browser logs"));
    }
  }, [setStatus]);

  const captureBrowserPromptSnapshot = React.useCallback(async () => {
    const view = webviewRef.current;
    if (!view) return null;
    try {
      const rawSnapshot = await view.executeJavaScript(createBrowserPromptSnapshotScript(), true);
      if (!rawSnapshot || typeof rawSnapshot !== "object") return null;
      const nextSnapshot = rawSnapshot as BrowserPromptSnapshot;
      setBrowserPromptSnapshot(nextSnapshot);
      return nextSnapshot;
    } catch {
      return null;
    }
  }, []);

  const getBrowserPromptContext = React.useCallback(async () => {
    const pageSnapshot = await captureBrowserPromptSnapshot();
    const traceSnapshot = await window.novayxk?.browserGetTrace?.().catch(() => browserTraceSnapshot ?? null);
    if (traceSnapshot) {
      setBrowserTraceSnapshot(traceSnapshot);
    }
    return formatBrowserPromptContext({
      snapshot: browserSnapshot,
      page: pageSnapshot,
      actions: browserActionLog,
      network: browserNetworkLog,
      trace: traceSnapshot ?? browserTraceSnapshot,
    });
  }, [browserActionLog, browserNetworkLog, browserSnapshot, browserTraceSnapshot, captureBrowserPromptSnapshot]);

  const executeBrowserAutomationAction = React.useMemo(
    () =>
      createBrowserAutomationRunner({
        getView: () => webviewRef.current,
        getSnapshot: () => browserSnapshot,
        syncSnapshot: ({ snapshot, emitPageEvent }) => {
          setBrowserSnapshot(snapshot);
          setBrowserUrlInput(snapshot.currentUrl);
          window.novayxk?.syncBrowserSnapshot(snapshot);
          emitPageEvent?.("did-navigate", snapshot);
        },
        emitActionObserved: (payload) => {
          window.novayxk?.emitBrowserActionObserved(payload);
        },
        onAutomationResult: (result) => {
          setLastBrowserAutomationResult(result);
        },
      }),
    [browserSnapshot],
  );

  const runBrowserAutomation = React.useCallback(
    async (action: BrowserAutomationAction) => {
      const result = await executeBrowserAutomationAction(action);
      const label = action.type === "navigate" ? action.url : result.preview;
      setStatus(result.ok ? `Browser action completed: ${label}` : `Browser action failed: ${result.preview}`);
      return result;
    },
    [executeBrowserAutomationAction, setStatus],
  );

  const handleRemoteBrowserRequest = React.useCallback(
    async (request: BrowserRemoteRequest) => {
      if (request.type === "navigate") {
        const nextUrl = normalizeBrowserUrl(request.url);
        setBrowserUrlInput(nextUrl);
        setBrowserTargetUrl(nextUrl);
        setBrowserCommand("navigate");
        setBrowserCommandNonce((value) => value + 1);
        const snapshot = await window.novayxk?.browserNavigate(nextUrl);
        if (snapshot) {
          setBrowserSnapshot(snapshot);
        }
        return snapshot ?? browserSnapshot;
      }

      if (request.type === "command") {
        await runBrowserCommand(request.command);
        return browserSnapshot;
      }

      if (request.type === "automation") {
        return runBrowserAutomation(request.action);
      }

      return getBrowserPromptContext();
    },
    [browserSnapshot, getBrowserPromptContext, runBrowserAutomation, runBrowserCommand],
  );

  React.useEffect(() => {
    if (!window.novayxk?.onBrowserWorkspaceCommand || !window.novayxk?.replyBrowserWorkspaceCommand) return;
    const unsubscribe = window.novayxk.onBrowserWorkspaceCommand(({ requestId, request }) => {
      void handleRemoteBrowserRequest(request)
        .then((result) => {
          window.novayxk?.replyBrowserWorkspaceCommand(requestId, {
            ok: true,
            result,
          });
        })
        .catch((error) => {
          window.novayxk?.replyBrowserWorkspaceCommand(requestId, {
            ok: false,
            error: error instanceof Error ? error.message : "Browser workspace command execution failed",
          });
        });
    });
    window.novayxk.notifyBrowserWorkspaceReady?.();
    return unsubscribe;
  }, [handleRemoteBrowserRequest]);

  return {
    webviewRef,
    browserUrlInput,
    setBrowserUrlInput,
    browserSnapshot,
    browserActionLog,
    browserNetworkLog,
    browserTraceSnapshot,
    browserGuestPreloadUrl,
    browserScriptInput,
    setBrowserScriptInput,
    browserActionSelector,
    setBrowserActionSelector,
    browserActionText,
    setBrowserActionText,
    browserActionTimeoutMs,
    setBrowserActionTimeoutMs,
    lastBrowserAutomationResult,
    setLastBrowserAutomationResult,
    browserPromptSnapshot,
    browserCommand,
    browserCommandNonce,
    browserTargetUrl,
    navigateBrowser,
    runBrowserCommand,
    runBrowserAutomation,
    captureBrowserPromptSnapshot,
    getBrowserPromptContext,
    clearBrowserLogs,
  };
}
