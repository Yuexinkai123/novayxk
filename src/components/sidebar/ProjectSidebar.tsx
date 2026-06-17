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
import type { AppLanguage, FileNode } from "../../vite-env";
import { shortPath } from "../../project/tree";
import { getLocaleStrings } from "../../app/i18n";
import { TreeNode } from "../TreeNode";

type ProjectSidebarProps = {
  isCollapsed: boolean;
  language: AppLanguage;
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
  language,
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
  const strings = getLocaleStrings(language).sidebar;

  return (
    <aside className="sidebar" aria-hidden={isCollapsed}>
      <div className="panel-heading">
        <div>
          <span>{strings.project}</span>
          <strong>{projectRoot ? shortPath(projectRoot) : strings.demoStructure}</strong>
        </div>
        <button className="panel-collapse-button" onClick={onCollapse} title={strings.hidePanel}>
          <ChevronsLeft size={15} />
        </button>
      </div>
      <div className="tree-toolbar">
        <div className="tree-search">
          <Search size={14} />
          <input
            value={treeFilter}
            onChange={(event) => onTreeFilterChange(event.target.value)}
            placeholder={strings.searchPlaceholder}
            aria-label={strings.searchLabel}
          />
          {treeFilter ? (
            <button className="tree-toolbar-button" onClick={onClearTreeFilter} title={strings.clearSearch}>
              <X size={13} />
            </button>
          ) : null}
        </div>
        <div className="tree-toolbar-actions">
          <button className="tree-toolbar-button" onClick={onRefreshTree} disabled={!hasProject} title={strings.refreshTree}>
            <RefreshCw size={14} />
          </button>
          <button className="tree-toolbar-button" onClick={onExpandAll} disabled={!hasProject} title={strings.expandAll}>
            <ChevronsDown size={14} />
          </button>
          <button className="tree-toolbar-button" onClick={onCollapseAll} disabled={!hasProject} title={strings.collapseAll}>
            <ChevronsUp size={14} />
          </button>
        </div>
      </div>
      <div className="tree-action-row">
        <button className="tree-action-button" onClick={() => onCreateEntry("file")} disabled={!hasProject} title={strings.newFileTitle}>
          <FilePlus2 size={14} />
          {strings.newFile}
        </button>
        <button
          className="tree-action-button"
          onClick={() => onCreateEntry("directory")}
          disabled={!hasProject}
          title={strings.newFolderTitle}
        >
          <FolderPlus size={14} />
          {strings.newFolder}
        </button>
      </div>
      <div className="tree-list">
        {hasProject ? (
          filteredFileTree.length ? (
            <>
              {hasTreeFilter && (
                <div className="tree-search-status">
                  <FileSearch size={13} />
                  {isSearchingTree ? strings.searching : `${filteredFileTree.length} ${strings.projectMatches}`}
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
                  language={language}
                />
              ))}
            </>
          ) : (
            <div className="tree-empty compact">
              <Search size={24} />
              <strong>{strings.noMatchesTitle}</strong>
              <span>{strings.noMatchesBody}</span>
            </div>
          )
        ) : (
          <div className="tree-empty">
            <FolderOpen size={26} />
            <strong>{strings.noProjectTitle}</strong>
            <span>{strings.noProjectBody}</span>
          </div>
        )}
      </div>
    </aside>
  );
}
