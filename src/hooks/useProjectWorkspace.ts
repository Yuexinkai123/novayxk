import React from "react";
import type { FileNode, ProjectPayload, ProjectSelectedFile, ProjectTextFile } from "../vite-env";
import type { CreateEntryDialogState } from "../components/dialogs/CreateEntryDialog";
import { createDesktopBridgeUnavailableError, formatActionableError, getDesktopBridgeUnavailableMessage } from "../app/errors";
import {
  TREE_SEARCH_MIN_LENGTH,
  collectDirectoryPaths,
  filterFileTree,
  findTreeNode,
  getParentDirectory,
  joinRelativePath,
  listAncestorPaths,
  normalizeRelativePath,
  shortPath,
  updateTreeNode,
} from "../project/tree";

const PREVIEWABLE_IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".svg"]);

function getFileExtension(filePath: string) {
  const normalized = String(filePath || "").toLowerCase();
  const dotIndex = normalized.lastIndexOf(".");
  return dotIndex >= 0 ? normalized.slice(dotIndex) : "";
}

function isPreviewableImageFile(filePath: string) {
  return PREVIEWABLE_IMAGE_EXTENSIONS.has(getFileExtension(filePath));
}

async function loadProjectSelectedFile(relativePath: string): Promise<ProjectSelectedFile> {
  if (!window.novayxk) {
    throw createDesktopBridgeUnavailableError("读取文件");
  }

  if (isPreviewableImageFile(relativePath)) {
    return window.novayxk.getProjectFileAsset(relativePath);
  }

  const file = await window.novayxk.readFile(relativePath);
  return {
    kind: "text",
    path: file.path,
    content: file.content,
  };
}

type UseProjectWorkspaceOptions = {
  saveLastProjectRoot: (projectRoot: string | null) => Promise<void>;
  setStatus: (status: string) => void;
};

export function useProjectWorkspace({
  saveLastProjectRoot,
  setStatus,
}: UseProjectWorkspaceOptions) {
  const [project, setProject] = React.useState<ProjectPayload | null>(null);
  const [selectedFile, setSelectedFile] = React.useState<ProjectSelectedFile | null>(null);
  const [activeTreePath, setActiveTreePath] = React.useState<string | null>(null);
  const [activeTreeNodeType, setActiveTreeNodeType] = React.useState<FileNode["type"] | null>(null);
  const [isEditorDirty, setIsEditorDirty] = React.useState(false);
  const [expandedPaths, setExpandedPaths] = React.useState<Set<string>>(new Set(["src"]));
  const [treeFilter, setTreeFilter] = React.useState("");
  const [treeSearchResults, setTreeSearchResults] = React.useState<FileNode[] | null>(null);
  const [isSearchingTree, setIsSearchingTree] = React.useState(false);
  const [loadingDirectories, setLoadingDirectories] = React.useState<Set<string>>(new Set());
  const [createEntryDialog, setCreateEntryDialog] = React.useState<CreateEntryDialogState | null>(null);

  const fileTree = project?.tree ?? [];
  const hasTreeFilter = treeFilter.trim().length > 0;
  const filteredFileTree = React.useMemo(
    () => treeSearchResults ?? filterFileTree(fileTree, treeFilter),
    [fileTree, treeFilter, treeSearchResults],
  );

  React.useEffect(() => {
    if (!project || !window.novayxk) {
      setTreeSearchResults(null);
      setIsSearchingTree(false);
      return;
    }

    const query = treeFilter.trim();
    if (query.length < TREE_SEARCH_MIN_LENGTH) {
      setTreeSearchResults(null);
      setIsSearchingTree(false);
      return;
    }

    let cancelled = false;
    setIsSearchingTree(true);
    const timer = window.setTimeout(() => {
      window.novayxk
        ?.searchFiles(query)
        .then((results: FileNode[]) => {
          if (!cancelled) setTreeSearchResults(results);
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            setTreeSearchResults(null);
            setStatus(formatActionableError(error, "搜索文件失败"));
          }
        })
        .finally(() => {
          if (!cancelled) setIsSearchingTree(false);
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [project, setStatus, treeFilter]);

  const revealTreePath = React.useCallback((relativePath: string) => {
    setExpandedPaths((current) => {
      const next = new Set(current);
      for (const part of listAncestorPaths(relativePath)) {
        next.add(part);
      }
      return next;
    });
  }, []);

  const hydrateOpenedProject = React.useCallback(async (payload: ProjectPayload) => {
    setProject(payload);
    setSelectedFile(null);
    setActiveTreePath(null);
    setActiveTreeNodeType(null);
    setIsEditorDirty(false);
    setTreeFilter("");
    setTreeSearchResults(null);
    setExpandedPaths(new Set(payload.tree.filter((node) => node.type === "directory" && node.loaded).map((node) => node.path)));
  }, []);

  const openProject = React.useCallback(async () => {
    setStatus("正在选择项目...");
    try {
      const payload = await window.novayxk?.openProject();
      if (payload) {
        await hydrateOpenedProject(payload);
        await saveLastProjectRoot(payload.root);
        setStatus(`已打开项目：${payload.root}`);
      } else {
        setStatus("已取消选择项目");
      }
    } catch (error) {
      setStatus(formatActionableError(error, "打开项目失败"));
    }
  }, [hydrateOpenedProject, saveLastProjectRoot, setStatus]);

  const restoreLastProject = React.useCallback(
    async (projectRoot: string) => {
      if (!window.novayxk) return;
      try {
        setStatus(`正在恢复上次工作区：${projectRoot}`);
        const payload = await window.novayxk.openProjectPath(projectRoot);
        await hydrateOpenedProject(payload);
        setStatus(`已恢复上次工作区：${payload.root}`);
      } catch (error) {
        setProject(null);
        setStatus(formatActionableError(error, "恢复上次工作区失败"));
        await saveLastProjectRoot(null);
      }
    },
    [hydrateOpenedProject, saveLastProjectRoot, setStatus],
  );

  const saveSelectedFile = React.useCallback(async () => {
    if (!selectedFile || selectedFile.kind !== "text" || !isEditorDirty) return true;
    if (!project) {
      setStatus("请先打开一个项目。");
      return false;
    }

    try {
      if (!window.novayxk) {
        throw createDesktopBridgeUnavailableError("保存文件");
      }

      await window.novayxk.saveFile(selectedFile.path, selectedFile.content);
      setIsEditorDirty(false);
      setStatus(`已保存 ${selectedFile.path}`);
      const nextProject = await window.novayxk.refreshProject();
      setProject(nextProject);
      return true;
    } catch (error) {
      setStatus(formatActionableError(error, "保存文件失败"));
      return false;
    }
  }, [isEditorDirty, project, selectedFile, setStatus]);

  const syncProjectView = React.useCallback(
    async (options?: { preferredPath?: string | null; clearMissingSelection?: boolean }) => {
      if (!window.novayxk || !project) return;

      const nextProject = await window.novayxk.refreshProject();
      setProject(nextProject);

      const candidatePath = options?.preferredPath ?? selectedFile?.path ?? null;
      if (!candidatePath) return;

      try {
        const file = await loadProjectSelectedFile(candidatePath);
        setSelectedFile(file);
        setActiveTreePath(candidatePath);
        setActiveTreeNodeType("file");
        revealTreePath(candidatePath);
        setIsEditorDirty(false);
      } catch (error) {
        if (options?.clearMissingSelection !== false) {
          const message = error instanceof Error ? error.message : "";
          if (message.includes("ENOENT")) {
            if (selectedFile?.path === candidatePath) {
              setSelectedFile(null);
              setIsEditorDirty(false);
            }
            if (activeTreePath === candidatePath) {
              setActiveTreePath(null);
              setActiveTreeNodeType(null);
            }
            setStatus(`文件已不存在，已刷新工作区：${candidatePath}`);
            return;
          }
        }
        throw error;
      }
    },
    [activeTreePath, project, revealTreePath, selectedFile, setStatus],
  );

  const loadTreeDirectory = React.useCallback(
    async (directoryPath: string) => {
      if (!project || !window.novayxk || hasTreeFilter) return;
      const targetNode = findTreeNode(project.tree, directoryPath);
      if (!targetNode || targetNode.type !== "directory" || targetNode.loaded || loadingDirectories.has(directoryPath)) return;

      setLoadingDirectories((current) => new Set(current).add(directoryPath));
      try {
        const payload = await window.novayxk.readDirectory(directoryPath);
        setProject((current) =>
          current
            ? {
                ...current,
                tree: updateTreeNode(current.tree, payload.path, (node) => ({
                  ...node,
                  children: payload.children,
                  loaded: true,
                })),
              }
            : current,
        );
        setStatus(`已加载目录：${directoryPath || shortPath(project.root)}`);
      } catch (error) {
        setStatus(formatActionableError(error, "加载目录失败"));
      } finally {
        setLoadingDirectories((current) => {
          const next = new Set(current);
          next.delete(directoryPath);
          return next;
        });
      }
    },
    [hasTreeFilter, loadingDirectories, project, setStatus],
  );

  const selectFile = React.useCallback(
    async (node: FileNode) => {
      setActiveTreePath(node.path);
      setActiveTreeNodeType(node.type);
      if (node.type === "directory") {
        const next = new Set(expandedPaths);
        if (next.has(node.path)) {
          next.delete(node.path);
        } else {
          next.add(node.path);
          void loadTreeDirectory(node.path);
        }
        setExpandedPaths(next);
        return;
      }

      if (!project) {
        const placeholder: ProjectTextFile = {
          kind: "text",
          path: node.path,
          content: "打开真实项目后，这里会显示文件内容。",
        };
        setSelectedFile(placeholder);
        return;
      }

      if (isEditorDirty && selectedFile && selectedFile.path !== node.path) {
        const saved = await saveSelectedFile();
        if (!saved) return;
      }

      setStatus(`正在读取 ${node.path}`);
      try {
        const file = await loadProjectSelectedFile(node.path);
        if (file) {
          setSelectedFile(file);
          setActiveTreePath(file.path);
          setActiveTreeNodeType("file");
          revealTreePath(file.path);
          setIsEditorDirty(false);
          setStatus(file.kind === "image" ? `已打开图片：${file.path}` : `已读取 ${file.path}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "读取文件失败";
        if (message.includes("ENOENT")) {
          try {
            await syncProjectView({ preferredPath: null });
          } catch {
            // Ignore follow-up refresh errors and keep the original read error context.
          }
          if (selectedFile?.path === node.path) {
            setSelectedFile(null);
            setIsEditorDirty(false);
          }
          if (activeTreePath === node.path) {
            setActiveTreePath(null);
            setActiveTreeNodeType(null);
          }
          setStatus(`文件不存在，工作区已刷新：${node.path}`);
          return;
        }
        setStatus(formatActionableError(error, "读取文件失败"));
      }
    },
    [activeTreePath, expandedPaths, isEditorDirty, loadTreeDirectory, project, revealTreePath, saveSelectedFile, selectedFile, setStatus, syncProjectView],
  );

  const refreshTree = React.useCallback(async () => {
    if (!window.novayxk) {
      setStatus(getDesktopBridgeUnavailableMessage("刷新工作区"));
      return;
    }

    try {
      setStatus("正在刷新工作区...");
      if (project) {
        await syncProjectView();
        setStatus(`已刷新工作区：${shortPath(project.root)}`);
      } else {
        setStatus("当前没有打开项目。");
      }
    } catch (error) {
      setStatus(formatActionableError(error, "刷新工作区失败"));
    }
  }, [project, setStatus, syncProjectView]);

  const expandAllTreeFolders = React.useCallback(() => {
    setExpandedPaths(new Set(collectDirectoryPaths(fileTree)));
    setStatus("已展开已加载的目录；未加载目录会在点击时读取。");
  }, [fileTree, setStatus]);

  const collapseAllTreeFolders = React.useCallback(() => {
    setExpandedPaths(new Set());
    setStatus("已收起全部目录");
  }, [setStatus]);

  const getPreferredTreeDirectory = React.useCallback(() => {
    if (activeTreePath) {
      return activeTreeNodeType === "directory" ? activeTreePath : getParentDirectory(activeTreePath);
    }
    if (selectedFile?.path) {
      return getParentDirectory(selectedFile.path);
    }
    return "";
  }, [activeTreeNodeType, activeTreePath, selectedFile]);

  const createTreeEntry = React.useCallback(
    async (kind: "file" | "directory") => {
      if (!project) {
        setStatus("请先打开一个项目。");
        return;
      }

      const baseDir = getPreferredTreeDirectory();
      const defaultPath =
        kind === "file"
          ? joinRelativePath(baseDir, "new-file.txt")
          : joinRelativePath(baseDir, "new-folder");
      setCreateEntryDialog({ kind, path: defaultPath });
      setStatus(kind === "file" ? "请输入新文件路径" : "请输入新文件夹路径");
    },
    [getPreferredTreeDirectory, project, setStatus],
  );

  const submitCreateTreeEntry = React.useCallback(async () => {
    if (!createEntryDialog) return;
    if (!window.novayxk) {
      setStatus(getDesktopBridgeUnavailableMessage("新建文件或文件夹"));
      return;
    }

    const targetPath = normalizeRelativePath(createEntryDialog.path);
    if (!targetPath) {
      setStatus(createEntryDialog.kind === "file" ? "请输入新文件路径。" : "请输入新文件夹路径。");
      return;
    }

    try {
      if (createEntryDialog.kind === "file") {
        await window.novayxk.applyFileOps([{ type: "write", path: targetPath, content: "" }]);
        await syncProjectView({ preferredPath: targetPath });
        setCreateEntryDialog(null);
        setStatus(`已新建文件：${targetPath}`);
      } else {
        await window.novayxk.applyFileOps([{ type: "mkdir", path: targetPath }]);
        revealTreePath(targetPath);
        await syncProjectView({ preferredPath: null });
        setActiveTreePath(targetPath);
        setActiveTreeNodeType("directory");
        setCreateEntryDialog(null);
        setStatus(`已新建文件夹：${targetPath}`);
      }
    } catch (error) {
      setStatus(formatActionableError(error, `新建${createEntryDialog.kind === "file" ? "文件" : "文件夹"}失败`));
    }
  }, [createEntryDialog, revealTreePath, setStatus, syncProjectView]);

  return {
    project,
    setProject,
    selectedFile,
    setSelectedFile,
    activeTreePath,
    setActiveTreePath,
    activeTreeNodeType,
    setActiveTreeNodeType,
    isEditorDirty,
    setIsEditorDirty,
    fileTree,
    expandedPaths,
    setExpandedPaths,
    treeFilter,
    setTreeFilter,
    filteredFileTree,
    hasTreeFilter,
    isSearchingTree,
    loadingDirectories,
    createEntryDialog,
    setCreateEntryDialog,
    openProject,
    restoreLastProject,
    saveSelectedFile,
    syncProjectView,
    selectFile,
    refreshTree,
    expandAllTreeFolders,
    collapseAllTreeFolders,
    createTreeEntry,
    submitCreateTreeEntry,
  };
}
