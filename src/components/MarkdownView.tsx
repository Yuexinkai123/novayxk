import React from "react";
import type { AppLanguage } from "../vite-env";

export function MarkdownView({ content, language = "en" }: { content: string; language?: AppLanguage }) {
  const isChinese = language === "zh-CN";
  const blocks = parseMarkdownBlocks(content);
  return (
    <>
      {blocks.map((block, index) => {
        if (block.type === "code") {
          if (isCollapsibleShellBlock(block.language)) {
            return <CollapsibleCodeBlock key={`code-${index}`} language={block.language} content={block.content} isChinese={isChinese} />;
          }
          if (isCollapsibleOutputBlock(block.language, content, index)) {
            return (
              <CollapsibleCodeBlock
                key={`code-${index}`}
                language={block.language}
                content={block.content}
                forceLabel={isChinese ? "执行结果" : "Execution Output"}
                isChinese={isChinese}
              />
            );
          }
          return (
            <pre key={`code-${index}`} className="markdown-code">
              <code>{block.content}</code>
            </pre>
          );
        }

        if (block.type === "heading") {
          const HeadingTag = `h${Math.min(block.level, 3)}` as "h1" | "h2" | "h3";
          return <HeadingTag key={`heading-${index}`}>{renderInlineMarkdown(block.content)}</HeadingTag>;
        }

        if (block.type === "list") {
          return (
            <ul key={`list-${index}`}>
              {block.items.map((item, itemIndex) => (
                <li key={`${item}-${itemIndex}`}>{renderInlineMarkdown(item)}</li>
              ))}
            </ul>
          );
        }

        if (block.type === "table") {
          return (
            <div key={`table-${index}`} className="markdown-table-shell">
              <table className="markdown-table">
                <thead>
                  <tr>
                    {block.headers.map((header, headerIndex) => (
                      <th key={`table-header-${index}-${headerIndex}`}>{renderInlineMarkdown(header)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={`table-row-${index}-${rowIndex}`}>
                      {row.map((cell, cellIndex) => (
                        <td key={`table-cell-${index}-${rowIndex}-${cellIndex}`}>{renderInlineMarkdown(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        return <p key={`paragraph-${index}`}>{renderInlineMarkdown(block.content)}</p>;
      })}
    </>
  );
}

type MarkdownBlock =
  | { type: "paragraph"; content: string }
  | { type: "heading"; level: number; content: string }
  | { type: "list"; items: string[] }
  | { type: "table"; headers: string[]; rows: string[][] }
  | { type: "code"; language: string; content: string };

function parseMarkdownBlocks(content: string): MarkdownBlock[] {
  const lines = content.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let codeLines: string[] = [];
  let codeLanguage = "";
  let isInCode = false;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    blocks.push({ type: "paragraph", content: paragraph.join("\n").trim() });
    paragraph = [];
  };

  const flushList = () => {
    if (!listItems.length) return;
    blocks.push({ type: "list", items: listItems });
    listItems = [];
  };

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const fence = line.match(/^```([A-Za-z][\w-]*)?\s*$/);
    if (fence) {
      if (isInCode) {
        blocks.push({ type: "code", language: codeLanguage, content: codeLines.join("\n") });
        codeLines = [];
        codeLanguage = "";
        isInCode = false;
      } else {
        flushParagraph();
        flushList();
        isInCode = true;
        codeLanguage = fence[1] ?? "";
      }
      continue;
    }

    if (isInCode) {
      codeLines.push(line);
      continue;
    }

    if (!line.trim()) {
      flushParagraph();
      flushList();
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", level: heading[1].length, content: heading[2].trim() });
      continue;
    }

    if (looksLikeMarkdownTableHeader(line) && isMarkdownTableDivider(lines[lineIndex + 1] ?? "")) {
      flushParagraph();
      flushList();
      const headerCells = splitMarkdownTableRow(line);
      const rows: string[][] = [];
      let rowIndex = lineIndex + 2;
      while (rowIndex < lines.length) {
        const rowLine = lines[rowIndex];
        if (!looksLikeMarkdownTableRow(rowLine)) break;
        rows.push(normalizeTableRow(splitMarkdownTableRow(rowLine), headerCells.length));
        rowIndex += 1;
      }
      blocks.push({
        type: "table",
        headers: normalizeTableRow(headerCells, headerCells.length),
        rows,
      });
      lineIndex = rowIndex - 1;
      continue;
    }

    const listItem = line.match(/^\s*[-*]\s+(.+)$/);
    if (listItem) {
      flushParagraph();
      listItems.push(listItem[1].trim());
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  if (isInCode) {
    blocks.push({ type: "code", language: codeLanguage, content: codeLines.join("\n") });
  }
  flushParagraph();
  flushList();
  return blocks.length ? blocks : [{ type: "paragraph", content }];
}

function renderInlineMarkdown(content: string) {
  const nodes: React.ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(content))) {
    if (match.index > lastIndex) {
      nodes.push(content.slice(lastIndex, match.index));
    }

    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(<strong key={`strong-${match.index}`}>{token.slice(2, -2)}</strong>);
    } else {
      nodes.push(<code key={`code-${match.index}`}>{token.slice(1, -1)}</code>);
    }
    lastIndex = match.index + token.length;
  }

  if (lastIndex < content.length) {
    nodes.push(content.slice(lastIndex));
  }

  return nodes;
}

function looksLikeMarkdownTableHeader(line: string) {
  return splitMarkdownTableRow(line).length >= 2;
}

function looksLikeMarkdownTableRow(line: string) {
  if (!line.trim()) return false;
  return splitMarkdownTableRow(line).length >= 2;
}

function isMarkdownTableDivider(line: string) {
  const cells = splitMarkdownTableRow(line);
  return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")));
}

function splitMarkdownTableRow(line: string) {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) return [];
  const normalized = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  return normalized
    .split("|")
    .map((cell) => cell.trim())
    .filter((cell, index, array) => !(array.length === 1 && !cell));
}

function normalizeTableRow(cells: string[], length: number) {
  const normalized = cells.slice(0, length);
  while (normalized.length < length) {
    normalized.push("");
  }
  return normalized;
}

function isCollapsibleShellBlock(language: string) {
  return /^(?:powershell|powershell-run|ps-run|shell-run|pwsh|cmd|bat|bash|shell)$/i.test(language.trim());
}

function isCollapsibleOutputBlock(language: string, markdownContent: string, blockIndex: number) {
  if (!/^(?:text|plaintext)?$/i.test(language.trim())) return false;
  const previousContent = markdownContent
    .replace(/\r\n/g, "\n")
    .split(/```(?:[A-Za-z][\w-]*)?\s*[\s\S]*?```/g)
    .slice(0, blockIndex + 1)
    .join("\n");
  return /PowerShell execution output|execution output|terminal output|PowerShell 执行结果|执行结果|终端输出/i.test(previousContent);
}

function getCodePreview(content: string) {
  const firstLine = content.split("\n").find((line) => line.trim()) ?? "";
  return firstLine.length > 88 ? `${firstLine.slice(0, 88)}...` : firstLine || "(empty command)";
}

function getCodeLanguageLabel(language: string, forceLabel?: string) {
  if (forceLabel) return forceLabel;
  if (/^(?:powershell|powershell-run|ps-run|pwsh)$/i.test(language)) return "PowerShell";
  if (/^(?:cmd|bat)$/i.test(language)) return "CMD";
  if (/^(?:bash|shell|shell-run)$/i.test(language)) return "Shell";
  if (/^browser-actions$/i.test(language)) return "Browser Actions";
  if (/^(?:text|plaintext)?$/i.test(language)) return "Text";
  return language || "Command";
}

function CollapsibleCodeBlock({
  language,
  content,
  forceLabel,
  isChinese,
}: {
  language: string;
  content: string;
  forceLabel?: string;
  isChinese: boolean;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const preview = React.useMemo(() => getCodePreview(content), [content]);
  const label = React.useMemo(() => getLocalizedCodeLanguageLabel(language, forceLabel, isChinese), [forceLabel, isChinese, language]);

  return (
    <div className={`markdown-code-shell ${expanded ? "expanded" : "collapsed"}`}>
      <button
        type="button"
        className="markdown-code-toggle"
        onClick={() => setExpanded((value) => !value)}
        title={expanded ? (isChinese ? "收起命令" : "Collapse command") : isChinese ? "展开命令" : "Expand command"}
      >
        <span className="markdown-code-toggle-label">{label}</span>
        <span className="markdown-code-toggle-preview">{preview}</span>
        <span className="markdown-code-toggle-icon">{expanded ? (isChinese ? "收起" : "Collapse") : isChinese ? "展开" : "Expand"}</span>
      </button>
      {expanded ? (
        <pre className="markdown-code">
          <code>{content}</code>
        </pre>
      ) : null}
    </div>
  );
}

function getLocalizedCodeLanguageLabel(language: string, forceLabel: string | undefined, isChinese: boolean) {
  if (forceLabel) return forceLabel;
  if (/^(?:powershell|powershell-run|ps-run|pwsh)$/i.test(language)) return "PowerShell";
  if (/^(?:cmd|bat)$/i.test(language)) return "CMD";
  if (/^(?:bash|shell|shell-run)$/i.test(language)) return isChinese ? "Shell" : "Shell";
  if (/^browser-actions$/i.test(language)) return isChinese ? "浏览器动作" : "Browser Actions";
  if (/^(?:text|plaintext)?$/i.test(language)) return isChinese ? "文本" : "Text";
  return language || (isChinese ? "命令" : "Command");
}
