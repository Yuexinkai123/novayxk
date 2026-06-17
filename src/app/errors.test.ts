import { describe, expect, it } from "vitest";
import { formatActionableError, getDesktopBridgeUnavailableMessage } from "./errors";

describe("formatActionableError", () => {
  it("turns bridge-missing errors into a restart hint", () => {
    const message = formatActionableError(
      new Error(getDesktopBridgeUnavailableMessage("Saving files")),
      "Save failed",
    );

    expect(message).toContain("desktop bridge");
    expect(message).toContain("reopen");
  });

  it("turns network failures into a concrete retry suggestion", () => {
    const message = formatActionableError(new Error("ECONNRESET while testing provider"), "Connection test failed");

    expect(message).toContain("network request did not complete successfully");
    expect(message).toContain("Base URL");
  });

  it("keeps image generation timeout errors explicit", () => {
    const message = formatActionableError(new Error("Image generation timed out. Please check the Base URL, network, or provider status."), "Image generation failed");

    expect(message).toContain("Image generation timed out");
    expect(message).not.toContain("network request did not complete successfully");
  });

  it("turns cancelled UAC prompts into a clear next step", () => {
    const message = formatActionableError(
      new Error('Windows UAC approval was canceled. Click "Administrator mode" again and choose "Yes" in the system prompt.'),
      "Failed to switch administrator mode",
    );

    expect(message).toContain("Windows UAC approval was canceled");
    expect(message).toContain("Administrator mode");
  });
});
