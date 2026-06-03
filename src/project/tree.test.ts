import { describe, expect, it } from "vitest";
import type { FileNode } from "../vite-env";
import {
  filterFileTree,
  findTreeNode,
  formatProjectContext,
  getParentDirectory,
  joinRelativePath,
  listAncestorPaths,
  normalizeRelativePath,
  updateTreeNode,
} from "./tree";

const tree: FileNode[] = [
  {
    type: "directory",
    name: "src",
    path: "src",
    children: [
      { type: "file", name: "main.tsx", path: "src/main.tsx" },
      { type: "file", name: "secret.env", path: "src/secret.env", sensitive: true },
    ],
  },
  { type: "file", name: "README.md", path: "README.md" },
];

describe("project tree helpers", () => {
  it("normalizes and joins project-relative paths", () => {
    expect(normalizeRelativePath("\\src\\\\components//App.tsx")).toBe("src/components/App.tsx");
    expect(joinRelativePath("src/components", "../ignored")).toBe("src/components/../ignored");
    expect(getParentDirectory("src/components/App.tsx")).toBe("src/components");
    expect(listAncestorPaths("src/components/App.tsx")).toEqual(["src", "src/components"]);
  });

  it("filters and finds nested files without losing ancestor directories", () => {
    const filtered = filterFileTree(tree, "main");

    expect(filtered).toHaveLength(1);
    expect(filtered[0].path).toBe("src");
    expect(filtered[0].children?.[0].path).toBe("src/main.tsx");
    expect(findTreeNode(tree, "README.md")?.name).toBe("README.md");
  });

  it("updates one tree node immutably", () => {
    const updated = updateTreeNode(tree, "src", (node) => ({ ...node, loaded: true }));

    expect(updated).not.toBe(tree);
    expect(updated[0].loaded).toBe(true);
    expect(tree[0].loaded).toBeUndefined();
  });

  it("omits sensitive files from formatted project context", () => {
    const context = formatProjectContext({
      root: "D:/repo",
      files: [
        { path: "src/main.tsx", size: 120 },
        { path: ".env", size: 20, sensitive: true },
      ],
      relatedFiles: [{ path: "src/main.tsx", content: "console.log(1);" }],
    });

    expect(context).toContain("src/main.tsx");
    expect(context).not.toContain(".env");
  });
});
