export type BrowserAutomationAction =
  | {
      type: "navigate";
      url: string;
      timeoutMs?: number;
    }
  | {
      type: "click";
      selector: string;
    }
  | {
      type: "type";
      selector: string;
      text: string;
    }
  | {
      type: "waitFor";
      selector: string;
      timeoutMs: number;
    }
  | {
      type: "pressKey";
      key: string;
      selector?: string;
    }
  | {
      type: "scrollTo";
      selector?: string;
      x?: number;
      y?: number;
      behavior?: "auto" | "smooth";
    }
  | {
      type: "select";
      selector: string;
      value: string;
    }
  | {
      type: "extractText";
      selector: string;
      multiple?: boolean;
    }
  | {
      type: "runScript";
      script: string;
    };

export function getBrowserAutomationActionLabel(action: BrowserAutomationAction) {
  if (action.type === "navigate") return `Open ${action.url}`;
  if (action.type === "click") return `Click ${action.selector}`;
  if (action.type === "type") return `Type into ${action.selector}`;
  if (action.type === "waitFor") return `Wait for ${action.selector}`;
  if (action.type === "pressKey") return `Press ${action.key}`;
  if (action.type === "scrollTo") return action.selector ? `Scroll to ${action.selector}` : "Scroll page";
  if (action.type === "select") return `Select ${action.selector}`;
  if (action.type === "extractText") return `Extract ${action.selector}`;
  return "Run page script";
}

export function isBrowserAutomationAction(value: unknown): value is BrowserAutomationAction {
  if (!value || typeof value !== "object") return false;
  const action = value as Partial<BrowserAutomationAction>;

  if (action.type === "navigate") {
    return (
      typeof action.url === "string" &&
      action.url.trim().length > 0 &&
      (action.timeoutMs === undefined || Number.isFinite(action.timeoutMs))
    );
  }

  if (action.type === "click") {
    return typeof action.selector === "string" && action.selector.trim().length > 0;
  }

  if (action.type === "type") {
    return (
      typeof action.selector === "string" &&
      action.selector.trim().length > 0 &&
      typeof action.text === "string"
    );
  }

  if (action.type === "waitFor") {
    return (
      typeof action.selector === "string" &&
      action.selector.trim().length > 0 &&
      Number.isFinite(action.timeoutMs)
    );
  }

  if (action.type === "pressKey") {
    return (
      typeof action.key === "string" &&
      action.key.trim().length > 0 &&
      (action.selector === undefined || (typeof action.selector === "string" && action.selector.trim().length > 0))
    );
  }

  if (action.type === "scrollTo") {
    return (
      (action.selector === undefined || (typeof action.selector === "string" && action.selector.trim().length > 0)) &&
      (action.x === undefined || Number.isFinite(action.x)) &&
      (action.y === undefined || Number.isFinite(action.y)) &&
      (action.behavior === undefined || action.behavior === "auto" || action.behavior === "smooth")
    );
  }

  if (action.type === "select") {
    return (
      typeof action.selector === "string" &&
      action.selector.trim().length > 0 &&
      typeof action.value === "string"
    );
  }

  if (action.type === "extractText") {
    return (
      typeof action.selector === "string" &&
      action.selector.trim().length > 0 &&
      (action.multiple === undefined || typeof action.multiple === "boolean")
    );
  }

  if (action.type === "runScript") {
    return typeof action.script === "string" && action.script.trim().length > 0;
  }

  return false;
}

export function createBrowserAutomationScript(action: BrowserAutomationAction) {
  if (action.type === "navigate") {
    return "";
  }

  if (action.type === "runScript") {
    return action.script;
  }

  if (action.type === "click") {
    return `
      (() => {
        ${createSelectorHelperScript()}
        const element = novayxkFindElement(${JSON.stringify(action.selector)});
        if (!element) {
          throw new Error("No clickable element was found: ${escapeForDoubleQuotedMessage(action.selector)}");
        }
        const result = {
          ok: true,
          action: "click",
          selector: ${JSON.stringify(action.selector)},
          text: (element.innerText || element.textContent || "").trim().slice(0, 120),
        };
        window.setTimeout(() => {
          if (typeof element.click === "function") {
            element.click();
            return;
          }
          element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
        }, 0);
        return result;
      })()
    `.trim();
  }

  if (action.type === "type") {
    return `
      (() => {
        ${createSelectorHelperScript()}
        const element = novayxkFindElement(${JSON.stringify(action.selector)});
        if (!element) {
          throw new Error("No input element was found: ${escapeForDoubleQuotedMessage(action.selector)}");
        }
        const value = ${JSON.stringify(action.text)};
        if (!("value" in element)) {
          throw new Error("The target element does not support value assignment: ${escapeForDoubleQuotedMessage(action.selector)}");
        }
        element.focus();
        element.value = value;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        return {
          ok: true,
          action: "type",
          selector: ${JSON.stringify(action.selector)},
          text: String(value).slice(0, 120),
        };
      })()
    `.trim();
  }

  if (action.type === "pressKey") {
    return `
      (() => {
        ${createSelectorHelperScript()}
        const key = ${JSON.stringify(action.key)};
        const element = ${action.selector ? `novayxkFindElement(${JSON.stringify(action.selector)})` : "document.activeElement || document.body"};
        if (!element) {
          throw new Error("No target was found that can receive the key press.");
        }
        if (typeof element.focus === "function") {
          element.focus();
        }
        const eventOptions = { key, bubbles: true, cancelable: true };
        element.dispatchEvent(new KeyboardEvent("keydown", eventOptions));
        element.dispatchEvent(new KeyboardEvent("keyup", eventOptions));
        return {
          ok: true,
          action: "pressKey",
          key,
          selector: ${JSON.stringify(action.selector ?? "")},
        };
      })()
    `.trim();
  }

  if (action.type === "scrollTo") {
    return `
      (() => {
        ${createSelectorHelperScript()}
        const behavior = ${JSON.stringify(action.behavior || "auto")};
        const selector = ${JSON.stringify(action.selector ?? "")};
        if (selector) {
          const element = novayxkFindElement(selector);
          if (!element) {
            throw new Error("No element was found to scroll to: " + selector);
          }
          element.scrollIntoView({ behavior, block: "center", inline: "nearest" });
          return {
            ok: true,
            action: "scrollTo",
            selector,
            text: (element.innerText || element.textContent || "").trim().slice(0, 120),
          };
        }
        const x = ${typeof action.x === "number" ? Math.round(action.x) : 0};
        const y = ${typeof action.y === "number" ? Math.round(action.y) : 0};
        window.scrollTo({ left: x, top: y, behavior });
        return {
          ok: true,
          action: "scrollTo",
          x,
          y,
        };
      })()
    `.trim();
  }

  if (action.type === "select") {
    return `
      (() => {
        ${createSelectorHelperScript()}
        const element = novayxkFindElement(${JSON.stringify(action.selector)});
        if (!element) {
          throw new Error("No selectable element was found: ${escapeForDoubleQuotedMessage(action.selector)}");
        }
        if (!(element instanceof HTMLSelectElement)) {
          throw new Error("The target element is not a select element: ${escapeForDoubleQuotedMessage(action.selector)}");
        }
        const value = ${JSON.stringify(action.value)};
        element.value = value;
        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        return {
          ok: true,
          action: "select",
          selector: ${JSON.stringify(action.selector)},
          text: value,
        };
      })()
    `.trim();
  }

  if (action.type === "extractText") {
    return `
      (() => {
        ${createSelectorHelperScript()}
        const selector = ${JSON.stringify(action.selector)};
        const multiple = ${action.multiple === true ? "true" : "false"};
        const elements = novayxkFindElements(selector);
        if (!elements.length) {
          throw new Error("No element was found to extract text from: " + selector);
        }
        const texts = elements
          .map((element) => String(element.innerText || element.textContent || "").replace(/\\s+/g, " ").trim())
          .filter(Boolean);
        return {
          ok: true,
          action: "extractText",
          selector,
          text: multiple ? texts.slice(0, 12).join("\\n") : (texts[0] || ""),
          count: texts.length,
        };
      })()
    `.trim();
  }

  return `
    new Promise((resolve, reject) => {
      ${createSelectorHelperScript()}
      const selector = ${JSON.stringify(action.selector)};
      const timeoutMs = ${Math.max(100, Math.round(action.timeoutMs || 5000))};
      const start = Date.now();
      const finish = (ok, extra = {}) => resolve({
        ok,
        action: "waitFor",
        selector,
        elapsedMs: Date.now() - start,
        ...extra,
      });
      const existing = novayxkFindElement(selector);
      if (existing) {
        finish(true, {
          text: (existing.innerText || existing.textContent || "").trim().slice(0, 120),
        });
        return;
      }
      const observer = new MutationObserver(() => {
        const match = novayxkFindElement(selector);
        if (!match) return;
        observer.disconnect();
        clearTimeout(timer);
        finish(true, {
          text: (match.innerText || match.textContent || "").trim().slice(0, 120),
        });
      });
      observer.observe(document.documentElement || document.body, {
        childList: true,
        subtree: true,
        attributes: true,
      });
      const timer = window.setTimeout(() => {
        observer.disconnect();
        reject(new Error("Timed out while waiting for element: " + selector));
      }, timeoutMs);
    })
  `.trim();
}

function escapeForDoubleQuotedMessage(value: string) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function createSelectorHelperScript() {
  return `
    const novayxkNormalizeText = (value) => String(value || "").replace(/\\s+/g, " ").trim();
    const novayxkElementText = (element) =>
      novayxkNormalizeText(
        element.innerText ||
        element.textContent ||
        element.getAttribute("aria-label") ||
        element.getAttribute("value") ||
        "",
      );
    const novayxkSplitSelectorList = (selectorText) => {
      const parts = [];
      let current = "";
      let quote = "";
      let bracketDepth = 0;
      let parenDepth = 0;
      for (const char of String(selectorText || "")) {
        if (quote) {
          current += char;
          if (char === quote) quote = "";
          continue;
        }
        if (char === "'" || char === '"') {
          quote = char;
          current += char;
          continue;
        }
        if (char === "[") {
          bracketDepth += 1;
          current += char;
          continue;
        }
        if (char === "]") {
          bracketDepth = Math.max(0, bracketDepth - 1);
          current += char;
          continue;
        }
        if (char === "(") {
          parenDepth += 1;
          current += char;
          continue;
        }
        if (char === ")") {
          parenDepth = Math.max(0, parenDepth - 1);
          current += char;
          continue;
        }
        if (char === "," && bracketDepth === 0 && parenDepth === 0) {
          if (current.trim()) parts.push(current.trim());
          current = "";
          continue;
        }
        current += char;
      }
      if (current.trim()) parts.push(current.trim());
      return parts;
    };
    const novayxkParseTextSelector = (selectorText) => {
      const match = String(selectorText || "").match(/^(.*?):has-text\\((["'])(.*?)\\2\\)$/);
      if (!match) return null;
      return {
        baseSelector: match[1].trim() || "*",
        text: novayxkNormalizeText(match[3]),
      };
    };
    const novayxkFindElements = (selectorText) => {
      const selectors = novayxkSplitSelectorList(selectorText);
      const results = [];
      const seen = new Set();
      for (const selector of selectors) {
        const textSelector = novayxkParseTextSelector(selector);
        if (textSelector) {
          const candidates = Array.from(document.querySelectorAll(textSelector.baseSelector));
          const exactMatches = candidates.filter((element) => novayxkElementText(element) === textSelector.text);
          const textMatches = exactMatches.length
            ? exactMatches
            : candidates.filter((element) => novayxkElementText(element).includes(textSelector.text));
          for (const element of textMatches) {
            if (seen.has(element)) continue;
            seen.add(element);
            results.push(element);
          }
          continue;
        }
        try {
          const candidates = Array.from(document.querySelectorAll(selector));
          for (const element of candidates) {
            if (seen.has(element)) continue;
            seen.add(element);
            results.push(element);
          }
        } catch {
          // Ignore invalid selector chunks so fallback candidates can still work.
        }
      }
      return results;
    };
    const novayxkFindElement = (selectorText) => novayxkFindElements(selectorText)[0] || null;
  `.trim();
}
