import type { BrowserActionRecord, BrowserNetworkRecord, BrowserSnapshot, BrowserTraceSnapshot } from "../vite-env";

export type BrowserPromptSnapshot = {
  url: string;
  title: string;
  readyState: string;
  headings: string[];
  buttons: string[];
  inputs: Array<{
    selector: string;
    label: string;
    type: string;
  }>;
  links: Array<{
    text: string;
    href: string;
  }>;
};

export function createBrowserPromptSnapshotScript() {
  return `
    (() => {
      const clean = (value) => String(value || "").replace(/\\s+/g, " ").trim();
      const selectorFor = (element) => {
        if (!element || element.nodeType !== 1) return "";
        if (element.id) return "#" + element.id;
        const name = element.getAttribute("name");
        if (name) return element.tagName.toLowerCase() + '[name="' + String(name).replace(/"/g, '\\"') + '"]';
        const testId = element.getAttribute("data-testid");
        if (testId) return element.tagName.toLowerCase() + '[data-testid="' + String(testId).replace(/"/g, '\\"') + '"]';
        const className = typeof element.className === "string" ? element.className.trim().split(/\\s+/).slice(0, 2).join(".") : "";
        return className ? element.tagName.toLowerCase() + "." + className : element.tagName.toLowerCase();
      };
      const textList = (selector, limit) =>
        Array.from(document.querySelectorAll(selector))
          .map((element) => clean(element.innerText || element.textContent || element.getAttribute("aria-label") || ""))
          .filter(Boolean)
          .slice(0, limit);
      const inputs = Array.from(document.querySelectorAll("input, textarea, select"))
        .map((element) => {
          const label =
            clean(element.getAttribute("aria-label")) ||
            clean(element.getAttribute("placeholder")) ||
            clean(element.getAttribute("name")) ||
            clean(element.id);
          return {
            selector: selectorFor(element),
            label,
            type: clean(element.getAttribute("type")) || element.tagName.toLowerCase(),
          };
        })
        .filter((item) => item.selector && item.type !== "password")
        .slice(0, 8);
      const links = Array.from(document.querySelectorAll("a[href]"))
        .map((element) => ({
          text: clean(element.innerText || element.textContent || element.getAttribute("aria-label") || ""),
          href: clean(element.href || element.getAttribute("href") || ""),
        }))
        .filter((item) => item.href)
        .slice(0, 6);
      return {
        url: location.href,
        title: clean(document.title || ""),
        readyState: document.readyState,
        headings: textList("h1, h2, h3", 8),
        buttons: textList("button, [role=button], input[type=submit]", 8),
        inputs,
        links,
      };
    })()
  `.trim();
}

function isSensitiveHeaderName(name: string) {
  return /(?:authorization|cookie|set-cookie|token|session|secret|password|passwd|pwd|credential|api[-_]?key|new-api-user)/i.test(name);
}

function redactSensitiveJson(value: unknown, key = ""): unknown {
  if (value == null) return value;
  if (isSensitiveHeaderName(key)) return "[redacted]";
  if (Array.isArray(value)) return value.map((item) => redactSensitiveJson(item, key));
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [entryKey, entryValue] of Object.entries(value)) {
      output[entryKey] = redactSensitiveJson(entryValue, entryKey);
    }
    return output;
  }
  return value;
}

function compactText(value: string, limit = 900) {
  return value.replace(/\s+/g, " ").trim().slice(0, limit);
}

function tryFormatBody(text: string, limit = 900) {
  const trimmed = text.trim();
  if (!trimmed) return "";
  try {
    return JSON.stringify(redactSensitiveJson(JSON.parse(trimmed))).slice(0, limit);
  } catch {
    return compactText(trimmed, limit);
  }
}

function formatHeaderEvidence(headers: Record<string, string> | undefined, limit = 8) {
  const entries = Object.entries(headers ?? {})
    .filter(([key]) => !/^sec-|^accept-|^user-agent$|^connection$|^host$/i.test(key))
    .slice(0, limit)
    .map(([key, value]) => `${key}: ${isSensitiveHeaderName(key) ? "[redacted]" : compactText(value, 120)}`);
  return entries.length ? entries.join("; ") : "";
}

function isLikelyApiNetworkRecord(record: BrowserNetworkRecord) {
  if (record.source !== "fetch" && record.source !== "xhr") return false;
  if (record.resourceType && record.resourceType !== "fetch" && record.resourceType !== "xhr") return false;
  if (/\/api\/|graphql|checkin|login|auth|user/i.test(record.url)) return true;
  return Boolean(record.requestBodyText || record.responseBodyText);
}

function mergeNetworkRecords(records: BrowserNetworkRecord[]) {
  const byId = new Map<string, BrowserNetworkRecord>();
  for (const record of records) {
    const current = byId.get(record.id);
    byId.set(record.id, current ? { ...current, ...record } : record);
  }
  return [...byId.values()].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
}

export function formatBrowserApiEvidence(network: BrowserNetworkRecord[], limit = 30) {
  const records = mergeNetworkRecords(network).filter(isLikelyApiNetworkRecord).slice(-limit);
  if (!records.length) return "";

  const lines: string[] = [];
  lines.push("Browser API evidence pack (sorted by real capture time, sensitive values redacted):");
  lines.push(
    "Rule: when writing scripts, prioritize the real method, URL, header names, request body, and response fields captured here. Do not guess token, session, or access_token values from older chat history.",
  );
  records.forEach((record, index) => {
    const requestHeaders = formatHeaderEvidence(record.requestHeaders);
    const responseHeaders = formatHeaderEvidence(record.responseHeaders, 5);
    const requestBody = tryFormatBody(record.requestBodyText ?? "");
    const responseBody = tryFormatBody(record.responseBodyText ?? "", 1200);
    const status = record.statusCode ? ` status=${record.statusCode}` : "";
    lines.push(`${index + 1}. ${record.method} ${record.url}${status} source=${record.source ?? record.resourceType ?? "unknown"}`);
    if (requestHeaders) lines.push(`   requestHeaders: ${requestHeaders}`);
    if (requestBody) lines.push(`   requestBody: ${requestBody}`);
    if (responseHeaders) lines.push(`   responseHeaders: ${responseHeaders}`);
    if (responseBody) lines.push(`   responseBody: ${responseBody}`);
  });
  return lines.join("\n").slice(0, 12000);
}

export function formatBrowserPromptContext(params: {
  snapshot: BrowserSnapshot;
  page: BrowserPromptSnapshot | null;
  actions: BrowserActionRecord[];
  network: BrowserNetworkRecord[];
  trace?: BrowserTraceSnapshot | null;
}) {
  const { snapshot, page, actions, network, trace } = params;
  const lines: string[] = [];

  lines.push("Current browser workspace context:");
  lines.push(`- Current URL: ${snapshot.currentUrl}`);
  lines.push(`- Page title: ${snapshot.title || "Unknown"}`);
  lines.push(`- Load state: ${snapshot.isLoading ? "Loading" : "Idle"}`);

  if (page) {
    lines.push(`- DOM readyState: ${page.readyState}`);
    if (page.headings.length) lines.push(`- Visible headings: ${page.headings.join(" | ").slice(0, 500)}`);
    if (page.buttons.length) lines.push(`- Visible buttons: ${page.buttons.join(" | ").slice(0, 500)}`);
    if (page.inputs.length) {
      lines.push(
        `- Input controls: ${page.inputs.map((item) => `${item.selector} (${item.label || item.type})`).join(" | ").slice(0, 600)}`,
      );
    }
    if (page.links.length) {
      lines.push(
        `- Links: ${page.links.map((item) => `${item.text || item.href} -> ${item.href}`).join(" | ").slice(0, 700)}`,
      );
    }
  }

  const recentActions = actions
    .slice(0, 6)
    .map((item) => `${item.type} ${item.targetLabel || item.selector || item.url}`)
    .filter(Boolean);
  if (recentActions.length) {
    lines.push(`- Recent browser actions: ${recentActions.join(" | ").slice(0, 500)}`);
  }

  const recentNetwork = network
    .slice(0, 6)
    .map((item) => {
      const requestPart = item.requestBodyText ? ` req=${item.requestBodyText.slice(0, 160)}` : "";
      const responsePart = item.responseBodyText ? ` res=${item.responseBodyText.slice(0, 160)}` : "";
      return `${item.method} ${item.statusCode ?? item.stage} ${item.url}${requestPart}${responsePart}`;
    })
    .filter(Boolean);
  if (recentNetwork.length) {
    lines.push(`- Recent network requests: ${recentNetwork.join(" | ").slice(0, 700)}`);
  }

  const apiEvidence = formatBrowserApiEvidence(network);
  if (apiEvidence) {
    lines.push(apiEvidence);
  }

  if (trace?.path) {
    lines.push(`- Temporary browser trace file: ${trace.path}`);
    if (trace.preview.trim()) {
      lines.push(`- Latest browser trace snippet (JSONL):\n${trace.preview.trim().slice(-6000)}`);
    }
  }

  lines.push("If you need to continue operating on the current page, prefer generating browser-actions from these controls, buttons, links, and the current URL.");
  return `\n\n${lines.join("\n")}`;
}
