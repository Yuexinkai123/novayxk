import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { detectCommandScope } = require("./command.cjs");

describe("detectCommandScope", () => {
  it("routes software and URL tasks as system commands", () => {
    expect(detectCommandScope('winget search "优酷"')).toBe("system");
    expect(detectCommandScope('cmd /c "winget search 优酷"')).toBe("system");
    expect(detectCommandScope('Start-Process "https://youku.com/product"')).toBe("system");
    expect(detectCommandScope('Start-Process "ms-windows-store://search/?query=优酷"')).toBe("system");
  });

  it("keeps project development commands in the project scope", () => {
    expect(detectCommandScope("npm run dev")).toBe("project");
    expect(detectCommandScope("git status")).toBe("project");
  });
});
