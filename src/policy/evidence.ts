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

  if (results.some((result) => result.code === null)) {
    notes.push("有些命令还在终端任务里继续运行，当前并没有执行完成。不能把这种结果说成“已经成功”或“已经失败”；应明确告诉用户任务仍在进行中，只能先根据当前输出给阶段性判断。");
  }

  if (results.some((result) => result.code === 0 && isInspectionLikeCommand(result.command) && !hasMeaningfulCommandOutput(result.output))) {
    notes.push("有些查询命令虽然退出码为 0，但输出是空的。这只能说明这一次检查没有返回可见结果，不能直接下“没有安装”“不存在”“没有配置”的结论；应该改说“这次检查未查到”，并建议再换一个来源复核。");
  }

  if (results.some((result) => result.code === 0 && !hasMeaningfulCommandOutput(result.output))) {
    notes.push("有些命令退出码为 0 但没有任何可见输出。除非命令本身就是静默操作并且随后有独立验证，否则不能说“跑通了”“成功了”“真实结果成功”；应该说“命令没有报错，但没有输出可证明结果”。");
  }

  if (results.some((result) => result.code !== null && result.code !== 0)) {
    notes.push("有些命令退出码不是 0。不能把后续猜测说成成功；必须先说明失败输出，再给出下一步最小验证或修复。");
  }

  if (results.some((result) => /request was rejected|considered high risk|high risk/i.test(result.output))) {
    notes.push("有些操作被上游安全策略判定为 high risk 并拒绝。不能继续假装已经执行或已经看到结果；应明确说明该请求被安全策略拒绝，并换成低风险、非凭据、非绕过式方案。");
  }

  if (!results.some((result) => /(?:已拦截|已阻止|暂停自动执行|命令已被拦截|高风险|high risk|request was rejected|considered high risk|sensitive risk|安全策略)/i.test(result.output))) {
    notes.push("当前命令输出里没有任何明确的 Novayxk 拦截或安全策略拒绝证据。严禁把脚本报错归因成“fileops 写入被拦截”“安全策略又拦了”“文件没覆盖是因为拦截”；只能根据真实报错本身分析，例如字段不存在、路径不对、旧文件仍在、接口响应结构变化。");
  }

  if (results.some((result) => /(?:\u0000|�)/.test(result.output))) {
    notes.push("有些命令输出存在编码乱码或 NUL 字符。遇到这种情况，不要硬解释乱码内容；如果关键信息不清楚，应明确说输出编码异常，需要换一种命令或编码方式复查。");
  }

  return notes.join("\n");
}
