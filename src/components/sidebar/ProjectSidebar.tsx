import React from "react";
import {
  ChevronsDown,
  ChevronsLeft,
  ChevronsUp,
  FilePlus2,
  FileSearch,
  FolderOpen,
  FolderPlus,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import type { FileNode } from "../../vite-env";
import { shortPath } from "../../project/tree";
import { TreeNode } from "../TreeNode";

type ProjectSidebarProps = {
  isCollapsed: boolean;
  projectRoot: string | null;
  treeFilter: string;
  filteredFileTree: FileNode[];
  hasTreeFilter: boolean;
  isSearchingTree: boolean;
  expandedPaths: Set<string>;
  selectedPath: string | undefined;
  loadingDirectories: Set<string>;
  onCollapse: () => void;
  onTreeFilterChange: (filter: string) => void;
  onClearTreeFilter: () => void;
  onRefreshTree: () => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  onCreateEntry: (kind: "file" | "directory") => void;
  onSelectFile: (node: FileNode) => void;
};

export function ProjectSidebar({
  isCollapsed,
  projectRoot,
  treeFilter,
  filteredFileTree,
  hasTreeFilter,
  isSearchingTree,
  expandedPaths,
  selectedPath,
  loadingDirectories,
  onCollapse,
  onTreeFilterChange,
  onClearTreeFilter,
  onRefreshTree,
  onExpandAll,
  onCollapseAll,
  onCreateEntry,
  onSelectFile,
}: ProjectSidebarProps) {
  const hasProject = Boolean(projectRoot);

  return (
    <aside className="sidebar" aria-hidden={isCollapsed}>
      <div className="panel-heading">
        <div>
          <span>项目</span>
          <strong>{projectRoot ? shortPath(projectRoot) : "演示结构"}</strong>
        </div>
        <button className="panel-collapse-button" onClick={onCollapse} title="隐藏项目栏">
          <ChevronsLeft size={15} />
        </button>
      </div>
      <div className="tree-toolbar">
        <div className="tree-search">
          <Search size={14} />
          <input
            value={treeFilter}
            onChange={(event) => onTreeFilterChange(event.target.value)}
            placeholder="搜索文件和目录"
            aria-label="搜索文件和目录"
          />
          {treeFilter ? (
            <button className="tree-toolbar-button" onClick={onClearTreeFilter} title="清空搜索">
              <X size={13} />
            </button>
          ) : null}
        </div>
        <div className="tree-toolbar-actions">
          <button className="tree-toolbar-button" onClick={onRefreshTree} disabled={!hasProject} title="刷新文件树">
            <RefreshCw size={14} />
          </button>
          <button className="tree-toolbar-button" onClick={onExpandAll} disabled={!hasProject} title="展开全部">
            <ChevronsDown size={14} />
          </button>
          <button className="tree-toolbar-button" onClick={onCollapseAll} disabled={!hasProject} title="收起全部">
            <ChevronsUp size={14} />
          </button>
        </div>
      </div>
      <div className="tree-action-row">
        <button className="tree-action-button" onClick={() => onCreateEntry("file")} disabled={!hasProject} title="在当前目录新建文件">
          <FilePlus2 size={14} />
          新建文件
        </button>
        <button
          className="tree-action-button"
          onClick={() => onCreateEntry("directory")}
          disabled={!hasProject}
          title="在当前目录新建文件夹"
        >
          <FolderPlus size={14} />
          新建文件夹
        </button>
      </div>
      <div className="tree-list">
        {hasProject ? (
          filteredFileTree.length ? (
            <>
              {hasTreeFilter && (
                <div className="tree-search-status">
                  <FileSearch size={13} />
                  {isSearchingTree ? "正在搜索项目文件..." : `项目搜索结果 ${filteredFileTree.length} 项`}
                </div>
              )}
              {filteredFileTree.map((node) => (
                <TreeNode
                  key={node.path}
                  node={node}
                  depth={0}
                  expandedPaths={expandedPaths}
                  selectedPath={selectedPath}
                  onSelect={onSelectFile}
                  forceExpanded={hasTreeFilter}
                  loadingPaths={loadingDirectories}
                />
              ))}
            </>
          ) : (
            <div className="tree-empty compact">
              <Search size={24} />
              <strong>没有匹配结果</strong>
              <span>换个关键词试试，或者清空当前过滤。</span>
            </div>
          )
        ) : (
          <div className="tree-empty">
            <FolderOpen size={26} />
            <strong>尚未打开项目</strong>
            <span>选择一个代码目录后，这里会显示真实文件树。</span>
          </div>
        )}
      </div>
    </aside>
  );
}
