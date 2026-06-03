import type { FileNode, ProjectContext } from "../vite-env";

export const TREE_SEARCH_MIN_LENGTH = 2;

export function shortPath(fullPath: string) {
  const normalized = fullPath.replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts.slice(-2).join("/");
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function formatProjectContext(context: ProjectContext) {
  const visibleFiles = context.files.filter((file) => !file.sensitive);
  const fileList = visibleFiles
    .slice(0, 180)
    .map((file) => `- ${file.path} (${formatBytes(file.size)})`)
    .join("\n");
  const relatedBlocks = context.relatedFiles
    .map(
      (file) =>
        `\n\n相关文件：${file.path}${file.truncated ? "（已截断）" : ""}\n\`\`\`\n${file.content.slice(0, 8000)}\n\`\`\``,
    )
    .join("");

  return `\n\n项目上下文摘要：${context.root}\n文件清单（节选 ${Math.min(visibleFiles.length, 180)}/${visibleFiles.length}）：\n${fileList || "- 无可读文件"}${relatedBlocks}`;
}

export function filterFileTree(nodes: FileNode[], keyword: string): FileNode[] {
  const term = keyword.trim().toLowerCase();
  if (!term) return nodes;

  return nodes.flatMap((node) => {
    const isMatch = node.name.toLowerCase().includes(term) || node.path.toLowerCase().includes(term);
    if (node.type === "directory") {
      const nextChildren = filterFileTree(node.children ?? [], keyword);
      if (isMatch || nextChildren.length) {
        return [{ ...node, children: nextChildren }];
      }
      return [];
    }

    return isMatch ? [node] : [];
  });
}

export function updateTreeNode(nodes: FileNode[], targetPath: string, updater: (node: FileNode) => FileNode): FileNode[] {
  return nodes.map((node) => {
    if (node.path === targetPath) return updater(node);
    if (node.type === "directory" && node.children?.length) {
      return { ...node, children: updateTreeNode(node.children, targetPath, updater) };
    }
    return node;
  });
}

export function findTreeNode(nodes: FileNode[], targetPath: string): FileNode | null {
  for (const node of nodes) {
    if (node.path === targetPath) return node;
    if (node.type === "directory") {
      const found = findTreeNode(node.children ?? [], targetPath);
      if (found) return found;
    }
  }
  return null;
}

export function collectDirectoryPaths(nodes: FileNode[]): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.type !== "directory") continue;
    paths.push(node.path);
    paths.push(...collectDirectoryPaths(node.children ?? []));
  }
  return paths;
}

export function listAncestorPaths(relativePath: string): string[] {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized) return [];
  const parts = normalized.split("/");
  const ancestors: string[] = [];
  for (let index = 1; index < parts.length; index += 1) {
    ancestors.push(parts.slice(0, index).join("/"));
  }
  return ancestors;
}

export function getParentDirectory(relativePath: string) {
  const normalized = normalizeRelativePath(relativePath);
  const index = normalized.lastIndexOf("/");
  return index > -1 ? normalized.slice(0, index) : "";
}

export function joinRelativePath(baseDir: string, childPath: string) {
  const normalizedBase = normalizeRelativePath(baseDir);
  const normalizedChild = normalizeRelativePath(childPath);
  if (!normalizedBase) return normalizedChild;
  if (!normalizedChild) return normalizedBase;
  return `${normalizedBase}/${normalizedChild}`.replace(/\/+/g, "/");
}

export function normalizeRelativePath(input: string) {
  return input.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/").trim();
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
