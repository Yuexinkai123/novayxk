import { describe, expect, it } from "vitest";
import { getGuidePromptStatus, getWorkspaceGuideKind } from "./workspaceGuide";

describe("getWorkspaceGuideKind", () => {
  it("prompts for model setup before anything else", () => {
    expect(
      getWorkspaceGuideKind({
        hasConfiguredProvider: false,
        hasProject: false,
        hasSelectedFile: false,
        messageCount: 0,
      }),
    ).toBe("configure-model");
  });

  it("prompts to open a project when a model exists but no workspace is open", () => {
    expect(
      getWorkspaceGuideKind({
        hasConfiguredProvider: true,
        hasProject: false,
        hasSelectedFile: false,
        messageCount: 0,
      }),
    ).toBe("open-project");
  });

  it("prompts with starter actions after project open but before work begins", () => {
    expect(
      getWorkspaceGuideKind({
        hasConfiguredProvider: true,
        hasProject: true,
        hasSelectedFile: false,
        messageCount: 0,
      }),
    ).toBe("start-working");
  });

  it("returns a clear follow-up status after activating a starter prompt", () => {
    expect(getGuidePromptStatus()).toContain("回车发送");
  });
});
