import { describe, expect, it } from "vitest";
import { inspectSensitiveGeneratedContent, isWriteLikePowerShellCommand } from "./sensitive";

describe("sensitive generated content guard", () => {
  it("allows scripts that reference auth-shaped response field names without hard-coded credentials", () => {
    const script = `
import os
token = response.json()["data"]["access_token"]
headers = {"Authorization": f"Bearer {token}"}
`;

    expect(inspectSensitiveGeneratedContent(script)).toEqual({ blocked: false, reason: "" });
  });

  it("allows placeholders and environment variables", () => {
    const script = `
API_KEY = os.environ["XCODE_API_KEY"]
headers = {"Authorization": "Bearer ${"${ACCESS_TOKEN}"}"}
password = "<手动填写>"
`;

    expect(inspectSensitiveGeneratedContent(script)).toEqual({ blocked: false, reason: "" });
  });

  it("blocks concrete credentials and tokens", () => {
    expect(inspectSensitiveGeneratedContent('password = "yuexinkai."').blocked).toBe(true);
    expect(inspectSensitiveGeneratedContent('headers = {"Authorization": "Bearer abcdefghijklmnop"}').blocked).toBe(true);
    expect(inspectSensitiveGeneratedContent('api_key = "sk-abcdefghijklmnop"').blocked).toBe(true);
  });

  it("allows login endpoint scripts when credentials are variables rather than hard-coded literals", () => {
    expect(inspectSensitiveGeneratedContent("fetch('/api/user/login', { body: JSON.stringify({ password }) })")).toEqual({
      blocked: false,
      reason: "",
    });
  });

  it("blocks credential capture logic", () => {
    expect(inspectSensitiveGeneratedContent("const c = document.cookie").blocked).toBe(true);
    expect(inspectSensitiveGeneratedContent("window.fetch = new Proxy(window.fetch, {})").blocked).toBe(true);
  });

  it("detects common powershell write commands", () => {
    expect(isWriteLikePowerShellCommand("Set-Content auto_checkin.py 'hi'")).toBe(true);
    expect(isWriteLikePowerShellCommand("[System.IO.File]::WriteAllText('a.py', 'hi')")).toBe(true);
    expect(isWriteLikePowerShellCommand("python auto_checkin.py")).toBe(false);
  });
});
