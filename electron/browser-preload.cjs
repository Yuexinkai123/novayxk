const { ipcRenderer } = require("electron");

/**
 * @typedef {{
 *   id: string;
 *   method: string;
 *   url: string;
 *   requestHeaders: Record<string, string>;
 *   startedAt: number;
 * }} NovayxkXhrMeta
 */

function sanitizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 120);
}

function selectorFor(element) {
  if (!element || element.nodeType !== 1) return "";
  if (element.id) return `#${element.id}`;
  const name = element.getAttribute("name");
  if (name) return `${element.tagName.toLowerCase()}[name="${String(name).replace(/"/g, '\\"')}"]`;
  const className = typeof element.className === "string" ? element.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
  return className ? `${element.tagName.toLowerCase()}.${className}` : element.tagName.toLowerCase();
}

function targetLabelFor(element) {
  if (!element || element.nodeType !== 1) return "";
  return sanitizeText(
    element.innerText ||
      element.value ||
      element.getAttribute("aria-label") ||
      element.getAttribute("placeholder") ||
      element.getAttribute("name") ||
      element.getAttribute("id"),
  );
}

function emitToHost(channel, payload) {
  try {
    ipcRenderer.sendToHost(channel, payload);
  } catch {
    // Keep guest page stable even if the host listener is gone.
  }
}

function trySerializeHeaders(headersLike) {
  const result = {};
  if (!headersLike) return result;
  try {
    if (typeof headersLike.forEach === "function") {
      headersLike.forEach((value, key) => {
        result[String(key)] = String(value);
      });
      return result;
    }
    if (Array.isArray(headersLike)) {
      for (const entry of headersLike) {
        if (!Array.isArray(entry) || entry.length < 2) continue;
        result[String(entry[0])] = String(entry[1]);
      }
      return result;
    }
    for (const [key, value] of Object.entries(headersLike)) {
      result[String(key)] = Array.isArray(value) ? value.join(", ") : String(value);
    }
  } catch {
    return result;
  }
  return result;
}

function normalizeBodyText(body) {
  if (body == null) return "";
  if (typeof body === "string") return body.slice(0, 20000);
  if (body instanceof URLSearchParams) return body.toString().slice(0, 20000);
  if (typeof FormData !== "undefined" && body instanceof FormData) {
    const entries = [];
    for (const [key, value] of body.entries()) {
      entries.push([key, typeof value === "string" ? value : `[binary:${value?.name || "blob"}]`]);
    }
    return JSON.stringify(entries).slice(0, 20000);
  }
  if (typeof Blob !== "undefined" && body instanceof Blob) {
    return `[blob:${body.type || "application/octet-stream"}:${body.size}]`;
  }
  if (body instanceof ArrayBuffer) {
    return `[arrayBuffer:${body.byteLength}]`;
  }
  if (ArrayBuffer.isView(body)) {
    return `[typedArray:${body.byteLength}]`;
  }
  try {
    return JSON.stringify(body).slice(0, 20000);
  } catch {
    return String(body).slice(0, 20000);
  }
}

async function readResponseBodyText(response) {
  try {
    const cloned = response.clone();
    return (await cloned.text()).slice(0, 30000);
  } catch {
    return "";
  }
}

function emitNetworkObserved(payload) {
  emitToHost("browser-network", payload);
}

function observeUserActions() {
  const emitAction = (type, element, valuePreview) => {
    emitToHost("browser-action", {
      id: `browser-action-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      source: "user",
      type,
      url: location.href,
      selector: selectorFor(element),
      targetLabel: targetLabelFor(element),
      valuePreview: sanitizeText(valuePreview || ""),
      createdAt: new Date().toISOString(),
    });
  };

  window.addEventListener(
    "click",
    (event) => {
      emitAction("click", event.target, "");
    },
    true,
  );

  window.addEventListener(
    "submit",
    (event) => {
      emitAction("submit", event.target, "");
    },
    true,
  );

  window.addEventListener(
    "input",
    (event) => {
      const element = event.target;
      if (!element || element.type === "password") return;
      emitAction("input", element, element.value || "");
    },
    true,
  );

  window.addEventListener(
    "change",
    (event) => {
      const element = event.target;
      if (!element || element.type === "password") return;
      emitAction("change", element, element.value || "");
    },
    true,
  );
}

function observeHistoryChanges() {
  const emitHistoryChange = (reason) => {
    emitToHost("browser-history", {
      reason,
      url: location.href,
      title: document.title || "",
      createdAt: new Date().toISOString(),
    });
  };

  const wrapHistoryMethod = (methodName) => {
    const original = history[methodName];
    if (typeof original !== "function") return;
    history[methodName] = function wrappedHistoryMethod(...args) {
      const result = original.apply(this, args);
      emitHistoryChange(methodName);
      return result;
    };
  };

  wrapHistoryMethod("pushState");
  wrapHistoryMethod("replaceState");
  window.addEventListener("popstate", () => emitHistoryChange("popstate"));
  window.addEventListener("hashchange", () => emitHistoryChange("hashchange"));
}

function observeConsole() {
  const originalError = console.error;
  console.error = function patchedConsoleError(...args) {
    emitToHost("browser-console", {
      level: "error",
      message: args.map((arg) => sanitizeText(typeof arg === "string" ? arg : JSON.stringify(arg))).join(" "),
      url: location.href,
      createdAt: new Date().toISOString(),
    });
    return originalError.apply(this, args);
  };
}

function observeFetchAndXhr() {
  if (typeof window.fetch === "function") {
    const originalFetch = window.fetch.bind(window);
    window.fetch = async function patchedFetch(input, init) {
      const request = typeof Request !== "undefined" && input instanceof Request ? input : null;
      const method = String(init?.method || request?.method || "GET").toUpperCase();
      const url = String(request?.url || input);
      const requestHeaders = trySerializeHeaders(init?.headers || request?.headers);
      const requestBodyText = normalizeBodyText(init?.body);
      const id = `fetch-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
      const startedAt = Date.now();

      emitNetworkObserved({
        id,
        url,
        method,
        stage: "request",
        resourceType: "fetch",
        requestHeaders,
        requestBodyText,
        source: "fetch",
        createdAt: new Date().toISOString(),
      });

      try {
        const response = await originalFetch(input, init);
        emitNetworkObserved({
          id,
          url: response.url || url,
          method,
          stage: "response",
          statusCode: response.status,
          resourceType: "fetch",
          durationMs: Math.max(0, Date.now() - startedAt),
          responseHeaders: trySerializeHeaders(response.headers),
          responseBodyText: await readResponseBodyText(response),
          responseContentType: response.headers.get("content-type") || "",
          source: "fetch",
          createdAt: new Date().toISOString(),
        });
        return response;
      } catch (error) {
        emitNetworkObserved({
          id,
          url,
          method,
          stage: "error",
          resourceType: "fetch",
          durationMs: Math.max(0, Date.now() - startedAt),
          errorText: error instanceof Error ? error.message : "fetch failed",
          source: "fetch",
          createdAt: new Date().toISOString(),
        });
        throw error;
      }
    };
  }

  if (typeof XMLHttpRequest !== "undefined") {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function patchedOpen(method, url, ...rest) {
      /** @type {NovayxkXhrMeta} */
      this.__novayxkRequestMeta = {
        id: `xhr-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        method: String(method || "GET").toUpperCase(),
        url: String(url || ""),
        requestHeaders: {},
        startedAt: 0,
      };
      return originalOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.setRequestHeader = function patchedSetRequestHeader(name, value) {
      if (this.__novayxkRequestMeta) {
        this.__novayxkRequestMeta.requestHeaders[String(name)] = String(value);
      }
      return originalSetRequestHeader.call(this, name, value);
    };

    XMLHttpRequest.prototype.send = function patchedSend(body) {
      /** @type {NovayxkXhrMeta} */
      const meta = this.__novayxkRequestMeta || {
        id: `xhr-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        method: "GET",
        url: "",
        requestHeaders: {},
        startedAt: 0,
      };
      meta.startedAt = Date.now();
      emitNetworkObserved({
        id: meta.id,
        url: meta.url,
        method: meta.method,
        stage: "request",
        resourceType: "xhr",
        requestHeaders: meta.requestHeaders,
        requestBodyText: normalizeBodyText(body),
        source: "xhr",
        createdAt: new Date().toISOString(),
      });

      const onDone = () => {
        const responseHeaders = {};
        const rawHeaders = this.getAllResponseHeaders();
        for (const line of String(rawHeaders || "").split(/\r?\n/)) {
          const separatorIndex = line.indexOf(":");
          if (separatorIndex <= 0) continue;
          const key = line.slice(0, separatorIndex).trim();
          const value = line.slice(separatorIndex + 1).trim();
          if (key) responseHeaders[key] = value;
        }
        const responseBodyText =
          typeof this.responseText === "string"
            ? this.responseText.slice(0, 30000)
            : normalizeBodyText(this.response);
        emitNetworkObserved({
          id: meta.id,
          url: this.responseURL || meta.url,
          method: meta.method,
          stage: this.status === 0 ? "error" : "response",
          statusCode: this.status || undefined,
          resourceType: "xhr",
          durationMs: Math.max(0, Date.now() - meta.startedAt),
          responseHeaders,
          responseBodyText,
          responseContentType: this.getResponseHeader("content-type") || "",
          errorText: this.status === 0 ? "xhr failed" : undefined,
          source: "xhr",
          createdAt: new Date().toISOString(),
        });
        this.removeEventListener("loadend", onDone);
      };

      this.addEventListener("loadend", onDone);
      return originalSend.call(this, body);
    };
  }
}

window.addEventListener("DOMContentLoaded", () => {
  observeUserActions();
  observeHistoryChanges();
  observeConsole();
  observeFetchAndXhr();
  emitToHost("browser-ready", {
    url: location.href,
    title: document.title || "",
    createdAt: new Date().toISOString(),
  });
});
