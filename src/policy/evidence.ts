export type CommandResultEvidence = {
  command: string;
  output: string;
  code: number | null;
};

function isInspectionLikeCommand(command: string) {
  return /\b(?:Get-ItemProperty|Get-Package|Get-Process|Get-Service|Get-ChildItem|Test-Path|where(?:\.exe)?|Get-Command|winget\s+(?:list|search)|reg(?:\.exe)?\s+query|wsl\s+(?:--status|--list|-l))\b/i.test(
    command,
  );
}

function hasMeaningfulCommandOutput(output: string) {
  return output.replace(/\u0000/g, "").trim().length > 0;
}

export function buildCommandResultJudgementNote(results: CommandResultEvidence[]) {
  const notes: string[] = [];

  if (results.some((result) => result.code === 0 && isInspectionLikeCommand(result.command) && !hasMeaningfulCommandOutput(result.output))) {
    notes.push("有些查询命令虽然退出码为 0，但输出是空的。这只能说明这一次检查没有返回可见结果，不能直接下“没有安装”“不存在”“没有配置”的结论；应该改说“这次检查未查到”，并建议再换一个来源复核。");
  }

  if (results.some((result) => /(?:\u0000|�)/.test(result.output))) {
    notes.push("有些命令输出存在编码乱码或 NUL 字符。遇到这种情况，不要硬解释乱码内容；如果关键信息不清楚，应明确说输出编码异常，需要换一种命令或编码方式复查。");
  }

  return notes.join("\n");
}
