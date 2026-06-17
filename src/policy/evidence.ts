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
    notes.push("Some commands are still running in the terminal, so execution is not finished yet. Do not describe this as already succeeded or already failed; state clearly that the task is still in progress and only a provisional judgement is possible from the current output.");
  }

  if (results.some((result) => result.code === 0 && isInspectionLikeCommand(result.command) && !hasMeaningfulCommandOutput(result.output))) {
    notes.push("Some inspection commands exited with code 0 but returned empty output. That only means this particular check produced no visible result. Do not conclude that something is not installed, does not exist, or is not configured; say that this check did not find it and suggest verifying through another source.");
  }

  if (results.some((result) => result.code === 0 && !hasMeaningfulCommandOutput(result.output))) {
    notes.push("Some commands exited with code 0 but produced no visible output. Unless the command is intentionally silent and has separate verification afterward, do not claim it ran successfully; say only that the command did not error, but there is no visible output proving the final result.");
  }

  if (results.some((result) => result.code !== null && result.code !== 0)) {
    notes.push("Some commands returned a non-zero exit code. You must not describe later guesses as success; first explain the failure output, then give the smallest sensible next verification or fix.");
  }

  if (results.some((result) => /request was rejected|considered high risk|high risk/i.test(result.output))) {
    notes.push("Some actions were rejected upstream as high risk. Do not pretend they already ran or produced results; say clearly that the request was blocked by the safety policy and switch to a low-risk, non-credential, non-bypass alternative.");
  }

  if (!results.some((result) => /(?:已拦截|已阻止|暂停自动执行|命令已被拦截|高风险|high risk|request was rejected|considered high risk|sensitive risk|安全策略)/i.test(result.output))) {
    notes.push("There is no clear evidence in the current command output that Novayxk intercepted the action or that a safety policy rejected it. Do not blame script errors on imagined interception, such as saying fileops was blocked or the safety policy stopped the overwrite. Analyze the real error itself instead, such as missing fields, wrong paths, old files still present, or changed response shapes.");
  }

  if (results.some((result) => /(?:\u0000|�)/.test(result.output))) {
    notes.push("Some command output shows encoding corruption or NUL characters. Do not force an interpretation of garbled text; if key information is unclear, say the output encoding is abnormal and re-check with a different command or encoding approach.");
  }

  return notes.join("\n");
}
