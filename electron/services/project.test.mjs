import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createProjectService } = require("./project.cjs");

const projectService = createProjectService();

describe("project patch workflow", () => {
  it("parses a unified diff and applies hunks to file content", () => {
    const patchText = [
      "diff --git a/src/App.tsx b/src/App.tsx",
      "--- a/src/App.tsx",
      "+++ b/src/App.tsx",
      "@@ -1,3 +1,3 @@",
      " import React from \"react\";",
      "-console.log(\"before\");",
      "+console.log(\"after\");",
      " export default function App() {}",
      "",
    ].join("\n");

    const files = projectService.parseUnifiedPatch(patchText);
    expect(files).toHaveLength(1);
    expect(files[0].path).toBe("src/App.tsx");

    const nextContent = projectService.applyHunks(
      'import React from "react";\nconsole.log("before");\nexport default function App() {}',
      files[0].hunks,
    );

    expect(nextContent).toContain('console.log("after");');
    expect(nextContent).not.toContain('console.log("before");');
  });
});
