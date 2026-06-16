import { describe, expect, it } from "vitest";
import {
  createBrowserAutomationScript,
  getBrowserAutomationActionLabel,
  isBrowserAutomationAction,
  type BrowserAutomationAction,
} from "./actions";

describe("browser automation action helpers", () => {
  it("returns readable labels for browser actions", () => {
    expect(getBrowserAutomationActionLabel({ type: "navigate", url: "https://example.com" })).toBe("打开 https://example.com");
    expect(getBrowserAutomationActionLabel({ type: "click", selector: ".submit" })).toBe("点击 .submit");
    expect(getBrowserAutomationActionLabel({ type: "type", selector: "#email", text: "a@b.com" })).toBe("输入 #email");
    expect(getBrowserAutomationActionLabel({ type: "waitFor", selector: ".done", timeoutMs: 1500 })).toBe("等待 .done");
    expect(getBrowserAutomationActionLabel({ type: "pressKey", key: "Enter", selector: "#q" })).toBe("按键 Enter");
    expect(getBrowserAutomationActionLabel({ type: "scrollTo", selector: "#result" })).toBe("滚动到 #result");
    expect(getBrowserAutomationActionLabel({ type: "select", selector: "select[name=city]", value: "shanghai" })).toBe("选择 select[name=city]");
    expect(getBrowserAutomationActionLabel({ type: "extractText", selector: ".result", multiple: true })).toBe("提取 .result");
  });

  it("generates browser scripts for supported browser actions", () => {
    const actions: BrowserAutomationAction[] = [
      { type: "navigate", url: "https://example.com" },
      { type: "click", selector: ".submit" },
      { type: "type", selector: "#email", text: "a@b.com" },
      { type: "waitFor", selector: ".done", timeoutMs: 1500 },
      { type: "pressKey", key: "Enter", selector: "#email" },
      { type: "scrollTo", selector: "#result", behavior: "smooth" },
      { type: "select", selector: "select[name=city]", value: "shanghai" },
      { type: "extractText", selector: ".result", multiple: true },
      { type: "runScript", script: "document.title" },
    ];

    const scripts = actions.map(createBrowserAutomationScript);

    expect(scripts[0]).toBe("");
    expect(scripts[1]).toContain('novayxkFindElement(".submit")');
    expect(scripts[1]).toContain("window.setTimeout");
    expect(scripts[1]).toContain("element.click()");
    expect(scripts[2]).toContain('element.value = value');
    expect(scripts[3]).toContain("MutationObserver");
    expect(scripts[4]).toContain('new KeyboardEvent("keydown"');
    expect(scripts[5]).toContain("scrollIntoView");
    expect(scripts[6]).toContain("HTMLSelectElement");
    expect(scripts[7]).toContain("querySelectorAll");
    expect(scripts[8]).toBe("document.title");
  });

  it("supports has-text style selector matching in generated scripts", () => {
    const clickScript = createBrowserAutomationScript({
      type: "click",
      selector: `button:has-text("Log in"), a:has-text("Log in")`,
    });
    const waitScript = createBrowserAutomationScript({
      type: "waitFor",
      selector: `input[type='email'], input[name='email'], button:has-text("Continue")`,
      timeoutMs: 5000,
    });

    expect(clickScript).toContain("novayxkFindElement");
    expect(clickScript).toContain(":has-text");
    expect(clickScript).toContain("exactMatches");
    expect(clickScript).toContain("novayxkElementText");
    expect(waitScript).toContain("novayxkFindElement");
    expect(waitScript).toContain("novayxkSplitSelectorList");
  });

  it("validates browser action payloads", () => {
    expect(isBrowserAutomationAction({ type: "navigate", url: "https://example.com" })).toBe(true);
    expect(isBrowserAutomationAction({ type: "click", selector: ".ok" })).toBe(true);
    expect(isBrowserAutomationAction({ type: "type", selector: "#email", text: "hi" })).toBe(true);
    expect(isBrowserAutomationAction({ type: "waitFor", selector: ".done", timeoutMs: 1000 })).toBe(true);
    expect(isBrowserAutomationAction({ type: "pressKey", key: "Enter", selector: "#q" })).toBe(true);
    expect(isBrowserAutomationAction({ type: "scrollTo", selector: "#result", behavior: "smooth" })).toBe(true);
    expect(isBrowserAutomationAction({ type: "select", selector: "select[name=city]", value: "shanghai" })).toBe(true);
    expect(isBrowserAutomationAction({ type: "extractText", selector: ".result", multiple: true })).toBe(true);
    expect(isBrowserAutomationAction({ type: "runScript", script: "document.title" })).toBe(true);
    expect(isBrowserAutomationAction({ type: "click" })).toBe(false);
    expect(isBrowserAutomationAction({ type: "pressKey", key: "" })).toBe(false);
    expect(isBrowserAutomationAction({ type: "select", selector: "", value: "x" })).toBe(false);
  });
});
