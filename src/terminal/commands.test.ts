import { describe, expect, it } from "vitest";
import {
  createCommandLoopState,
  extractPowerShellCommandRequests,
  inspectCommandLoop,
  normalizeCommandForLoop,
} from "./commands";

describe("terminal command guards", () => {
  it("extracts fenced powershell-run commands and deduplicates them", () => {
    const content = [
      "先看状态",
      "```powershell-run",
      "npm run build",
      "```",
      "```ps-run",
      "npm run build",
      "```",
    ].join("\n");

    expect(extractPowerShellCommandRequests(content)).toEqual([
      { command: "npm run build", source: "block" },
    ]);
  });

  it("does not auto-extract inline commands by default", () => {
    const content = "npm run build";

    expect(extractPowerShellCommandRequests(content)).toEqual([]);
  });

  it("ignores explanatory Chinese text when looking for inline commands", () => {
    const content = "你可以运行 npm run build 看看，但这句话不应该被当作命令。";

    expect(extractPowerShellCommandRequests(content, { includeInline: true })).toEqual([]);
  });

  it("can still opt in to inline command extraction for compatibility checks", () => {
    const content = "npm run build";

    expect(extractPowerShellCommandRequests(content, { includeInline: true })).toEqual([
      { command: "npm run build", source: "inline" },
    ]);
  });

  it("normalizes repeated commands for loop detection", () => {
    expect(normalizeCommandForLoop(`NPM   RUN  \"BUILD\"`)).toBe("npm run build");
  });

  it("stops after repeated command loops", () => {
    const state = createCommandLoopState();
    const command = [{ command: "npm run build", source: "block" as const }];

    for (let index = 0; index < 9; index += 1) {
      expect(inspectCommandLoop(command, state).shouldStop).toBe(false);
    }
    expect(inspectCommandLoop(command, state).shouldStop).toBe(true);
  });
});
