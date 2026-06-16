import React from "react";
import type { ProjectSelectedFile, ProjectTextFile } from "../vite-env";

export function getEditorStats(content: string) {
  return {
    lines: content ? content.split(/\r\n|\r|\n/).length : 1,
    characters: content.length,
  };
}

export function countTextMatches(content: string, query: string) {
  const needle = query.trim();
  if (!needle) return 0;
  let count = 0;
  let index = 0;
  const haystack = content.toLowerCase();
  const loweredNeedle = needle.toLowerCase();
  while ((index = haystack.indexOf(loweredNeedle, index)) !== -1) {
    count += 1;
    index += Math.max(1, loweredNeedle.length);
  }
  return count;
}

export function handleCodeEditorKeyDown(
  event: React.KeyboardEvent<HTMLTextAreaElement>,
  selectedFile: ProjectTextFile,
  setSelectedFile: React.Dispatch<React.SetStateAction<ProjectSelectedFile | null>>,
  setIsEditorDirty: React.Dispatch<React.SetStateAction<boolean>>,
) {
  if (event.key !== "Tab" && event.key !== "Enter") return;
  event.preventDefault();
  const target = event.currentTarget;
  const start = target.selectionStart;
  const end = target.selectionEnd;

  if (event.key === "Tab") {
    const selectedText = selectedFile.content.slice(start, end);
    if (event.shiftKey && selectedText.includes("\n")) {
      const lineStart = selectedFile.content.lastIndexOf("\n", start - 1) + 1;
      const block = selectedFile.content.slice(lineStart, end);
      const nextBlock = block.replace(/^(?:  |\t)/gm, "");
      const nextContent = `${selectedFile.content.slice(0, lineStart)}${nextBlock}${selectedFile.content.slice(end)}`;
      setSelectedFile({ ...selectedFile, content: nextContent });
      setIsEditorDirty(true);
      requestAnimationFrame(() => {
        target.selectionStart = lineStart;
        target.selectionEnd = lineStart + nextBlock.length;
      });
      return;
    }

    if (selectedText.includes("\n")) {
      const lineStart = selectedFile.content.lastIndexOf("\n", start - 1) + 1;
      const block = selectedFile.content.slice(lineStart, end);
      const nextBlock = block.replace(/^/gm, "  ");
      const nextContent = `${selectedFile.content.slice(0, lineStart)}${nextBlock}${selectedFile.content.slice(end)}`;
      setSelectedFile({ ...selectedFile, content: nextContent });
      setIsEditorDirty(true);
      requestAnimationFrame(() => {
        target.selectionStart = lineStart;
        target.selectionEnd = lineStart + nextBlock.length;
      });
      return;
    }

    const nextContent = `${selectedFile.content.slice(0, start)}  ${selectedFile.content.slice(end)}`;
    setSelectedFile({ ...selectedFile, content: nextContent });
    setIsEditorDirty(true);
    requestAnimationFrame(() => {
      target.selectionStart = start + 2;
      target.selectionEnd = start + 2;
    });
    return;
  }

  const lineStart = selectedFile.content.lastIndexOf("\n", start - 1) + 1;
  const currentLine = selectedFile.content.slice(lineStart, start);
  const indent = currentLine.match(/^\s*/)?.[0] ?? "";
  const nextIndent = /[{[(]\s*$/.test(currentLine) ? `${indent}  ` : indent;
  const insert = `\n${nextIndent}`;
  const nextContent = `${selectedFile.content.slice(0, start)}${insert}${selectedFile.content.slice(end)}`;
  setSelectedFile({ ...selectedFile, content: nextContent });
  setIsEditorDirty(true);
  requestAnimationFrame(() => {
    target.selectionStart = start + insert.length;
    target.selectionEnd = start + insert.length;
  });
}
