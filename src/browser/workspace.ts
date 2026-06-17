import type { BrowserActionRecord, BrowserNetworkRecord } from "../vite-env";

export const DEFAULT_BROWSER_START_URL = "https://www.google.com/";

export function normalizeBrowserUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return DEFAULT_BROWSER_START_URL;
  if (/^(?:https?|file|about):/i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/+/, "")}`;
}

export function upsertBrowserNetworkRecord(
  records: BrowserNetworkRecord[],
  incoming: BrowserNetworkRecord,
  limit = 240,
) {
  const next = [incoming, ...records.filter((record) => record.id !== incoming.id)]
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return next.slice(0, limit);
}

export function formatBrowserActionSummary(record: BrowserActionRecord) {
  if (record.type === "navigate") return `Navigate to ${record.url}`;
  if (record.type === "submit") return `Submit form · ${record.targetLabel || record.selector || "Unknown target"}`;
  if (record.type === "input") return `Enter text · ${record.targetLabel || record.selector || "Unknown target"}`;
  if (record.type === "change") return `Change field · ${record.targetLabel || record.selector || "Unknown target"}`;
  return `Click element · ${record.targetLabel || record.selector || "Unknown target"}`;
}

export function formatBrowserNetworkSummary(record: BrowserNetworkRecord) {
  const status = record.statusCode ? ` ${record.statusCode}` : "";
  const duration = typeof record.durationMs === "number" ? ` · ${record.durationMs}ms` : "";
  const errorText = record.errorText ? ` · ${record.errorText}` : "";
  const source = record.source ? ` · ${record.source}` : "";
  return `${record.method} ${record.resourceType || "request"}${status}${duration}${errorText}${source}`;
}
