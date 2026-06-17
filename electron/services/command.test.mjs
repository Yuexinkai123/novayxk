import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { detectCommandScope, inspectCommand, inspectCommandForMode } = require("./command.cjs");

describe("detectCommandScope", () => {
  it("routes software and URL tasks as system commands", () => {
    expect(detectCommandScope('winget search "Youku"')).toBe("system");
    expect(detectCommandScope('cmd /c "winget search Youku"')).toBe("system");
    expect(detectCommandScope('Start-Process "https://youku.com/product"')).toBe("system");
    expect(detectCommandScope('Start-Process "ms-windows-store://search/?query=Youku"')).toBe("system");
  });

  it("keeps project development commands in the project scope", () => {
    expect(detectCommandScope("npm run dev")).toBe("project");
    expect(detectCommandScope("git status")).toBe("project");
  });

  it("blocks recursive deletes in safe mode even without force", () => {
    expect(inspectCommand("Remove-Item .\\dist -Recurse")).toMatchObject({
      allowed: false,
      reason: "This includes recursive deletion.",
    });
    expect(inspectCommand("rd /s build")).toMatchObject({
      allowed: false,
      reason: "This includes recursive deletion.",
    });
  });

  it("still allows the same recursive delete only in full mode", () => {
    expect(inspectCommandForMode("Remove-Item .\\dist -Recurse", "full")).toMatchObject({
      allowed: true,
    });
  });
});
