import { ChevronDown, ChevronRight, FileCode2, Folder, FolderOpen } from "lucide-react";
import type { AppLanguage, FileNode } from "../vite-env";
import { getLocaleStrings } from "../app/i18n";

export function TreeNode({
  node,
  language,
  depth,
  expandedPaths,
  selectedPath,
  onSelect,
  loadingPaths,
  forceExpanded = false,
}: {
  node: FileNode;
  language: AppLanguage;
  depth: number;
  expandedPaths: Set<string>;
  selectedPath?: string;
  onSelect: (node: FileNode) => void;
  loadingPaths: Set<string>;
  forceExpanded?: boolean;
}) {
  const isExpanded = forceExpanded || expandedPaths.has(node.path);
  const isDirectory = node.type === "directory";
  const isSelected = selectedPath === node.path;
  const isLoading = loadingPaths.has(node.path);
  const strings = getLocaleStrings(language).tree;

  return (
    <div>
      <button
        className={`tree-row ${isSelected ? "selected" : ""}`}
        style={{ paddingLeft: `${12 + depth * 16}px` }}
        onClick={() => onSelect(node)}
        title={node.path}
      >
        {isDirectory ? (
          <span className="tree-icon-stack">
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            {isExpanded ? <FolderOpen size={14} /> : <Folder size={14} />}
          </span>
        ) : (
          <FileCode2 size={15} />
        )}
        <span>{node.name}</span>
        {isDirectory && isLoading && <small>{strings.loading}</small>}
        {isDirectory && !node.loaded && !forceExpanded && !isLoading && <small>{strings.more}</small>}
        {node.sensitive && <small>{strings.sensitive}</small>}
      </button>
      {isDirectory &&
        isExpanded &&
        node.children?.map((child) => (
          <TreeNode
            key={child.path}
            node={child}
            language={language}
            depth={depth + 1}
            expandedPaths={expandedPaths}
            selectedPath={selectedPath}
            onSelect={onSelect}
            loadingPaths={loadingPaths}
            forceExpanded={forceExpanded}
          />
        ))}
    </div>
  );
}
