import { describe, expect, it } from "vitest";
import {
  DEFAULT_BROWSER_START_URL,
  formatBrowserActionSummary,
  formatBrowserNetworkSummary,
  normalizeBrowserUrl,
  upsertBrowserNetworkRecord,
} from "./workspace";
import { formatBrowserApiEvidence } from "./context";

describe("browser workspace helpers", () => {
  it("normalizes common browser addresses", () => {
    expect(normalizeBrowserUrl("")).toBe(DEFAULT_BROWSER_START_URL);
    expect(normalizeBrowserUrl("example.com")).toBe("https://example.com");
    expect(normalizeBrowserUrl("https://openai.com")).toBe("https://openai.com");
  });

  it("upserts network records by id and keeps newest first", () => {
    const initial = [
      {
        id: "1",
        url: "https://example.com/a",
        method: "GET",
        stage: "request" as const,
        createdAt: "2026-06-03T10:00:00.000Z",
      },
    ];
    const next = upsertBrowserNetworkRecord(initial, {
      id: "1",
      url: "https://example.com/a",
      method: "GET",
      stage: "response",
      statusCode: 200,
      createdAt: "2026-06-03T10:00:01.000Z",
    });

    expect(next).toEqual([
      {
        id: "1",
        url: "https://example.com/a",
        method: "GET",
        stage: "response",
        statusCode: 200,
        createdAt: "2026-06-03T10:00:01.000Z",
      },
    ]);
  });

  it("formats action and network summaries for compact UI display", () => {
    expect(
      formatBrowserActionSummary({
        id: "a1",
        source: "user",
        type: "click",
        url: "https://example.com",
        targetLabel: "Sign in button",
        createdAt: "2026-06-03T10:00:00.000Z",
      }),
    ).toContain("Click element");

    expect(
      formatBrowserNetworkSummary({
        id: "n1",
        url: "https://example.com/api/login",
        method: "POST",
        stage: "response",
        statusCode: 200,
        resourceType: "xhr",
        durationMs: 124,
        createdAt: "2026-06-03T10:00:00.000Z",
      }),
    ).toContain("POST xhr 200");
  });

  it("builds a browser api evidence timeline without leaking sensitive values", () => {
    const evidence = formatBrowserApiEvidence([
      {
        id: "login",
        url: "https://xcode.best/api/user/login",
        method: "POST",
        stage: "response",
        statusCode: 200,
        resourceType: "fetch",
        requestHeaders: {
          "Content-Type": "application/json",
          Authorization: "Bearer real-token",
        },
        requestBodyText: JSON.stringify({ username: "yxk", password: "secret" }),
        responseBodyText: JSON.stringify({ success: true, data: { access_token: "sk-real-token", username: "yxk" } }),
        source: "fetch",
        createdAt: "2026-06-04T10:00:00.000Z",
      },
      {
        id: "checkin",
        url: "https://xcode.best/api/user/checkin",
        method: "POST",
        stage: "response",
        statusCode: 200,
        resourceType: "xhr",
        requestHeaders: {
          "New-Api-User": "sk-real-token",
          "Content-Type": "application/json",
        },
        responseBodyText: JSON.stringify({ success: true, message: "ok" }),
        source: "xhr",
        createdAt: "2026-06-04T10:01:00.000Z",
      },
    ]);

    expect(evidence).toContain("POST https://xcode.best/api/user/login status=200");
    expect(evidence).toContain("New-Api-User: [redacted]");
    expect(evidence).toContain('"access_token":"[redacted]"');
    expect(evidence).toContain('"password":"[redacted]"');
    expect(evidence).not.toContain("sk-real-token");
    expect(evidence).not.toContain("secret");
  });
});
