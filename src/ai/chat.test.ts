import { describe, expect, it } from "vitest";
import {
  STREAM_ABORT_PLACEHOLDER,
  detectAdminPrivilegeRequest,
  detectInternalControlModeRequest,
  extractFileOps,
  getFileOpsParseIssue,
  hasDestructiveFileOps,
  normalizeAssistantToolCallContent,
  sanitizeChatHistory,
  stripInjectedContext,
} from "./chat";
import {
  buildCommandResultJudgementNote,
  buildUserIntentInstruction,
  getUserIntentProfile,
  isLikelyIncompleteAssistantReply,
  shouldAutoInspectCurrentMachine,
  shouldAutoExecutePowerShellForPrompt,
} from "../policy";

describe("AI chat parsing guards", () => {
  it("strips hidden project context before saving user history", () => {
    expect(stripInjectedContext("帮我看看\n\n项目上下文摘要：D:/repo\n- src/main.tsx")).toBe("帮我看看");
    expect(
      sanitizeChatHistory([
        { role: "user", content: "修一下\n\n当前选中文件：src/main.tsx\n```tsx\nx\n```" },
        { role: "assistant", content: STREAM_ABORT_PLACEHOLDER },
      ]),
    ).toEqual([{ role: "user", content: "修一下" }]);
  });

  it("normalizes shell-like XML tool calls into powershell-run blocks", () => {
    const normalized = normalizeAssistantToolCallContent(
      "<tool_call><function=shell><parameter=command>npm run build</parameter></function></tool_call>",
    );

    expect(normalized).toContain("```powershell-run");
    expect(normalized).toContain("npm run build");
  });

  it("converts JSON tool_call payloads and strips tool_result noise", () => {
    const normalized = normalizeAssistantToolCallContent(
      '先帮你查一下。<tool_call>\n{"name":"powershell-run","arguments":{"command":"winget list Tencent.QQLive"}}\n</tool_call>\n<tool_result>\n已找到 腾讯视频\n</tool_result>\n已经帮你搞定了',
    );

    expect(normalized).toContain("先帮你查一下");
    expect(normalized).toContain("```powershell-run");
    expect(normalized).toContain("winget list Tencent.QQLive");
    expect(normalized).not.toContain("<tool_result>");
    expect(normalized).not.toContain("已找到 腾讯视频");
    expect(normalized).not.toContain("已经帮你搞定了");
  });

  it("extracts valid fileops and reports malformed blocks", () => {
    const operations = extractFileOps(
      '```fileops\n[{"type":"mkdir","path":"docs"},{"type":"write","path":"docs/a.md","content":"hi"},{"type":"delete","path":"dist"}]\n```',
    );

    expect(operations).toEqual([
      { type: "mkdir", path: "docs" },
      { type: "write", path: "docs/a.md", content: "hi" },
      { type: "delete", path: "dist" },
    ]);
    expect(hasDestructiveFileOps(operations)).toBe(true);
    expect(getFileOpsParseIssue('```fileops\n[{"type":"write","path":"a.md"}]\n```')).toContain("JSON 不是合法");
  });

  it("recognizes the renamed execution-range phrases", () => {
    expect(detectInternalControlModeRequest("切换到项目内执行")).toBe("safe");
    expect(detectInternalControlModeRequest("改成系统级执行")).toBe("full");
  });

  it("does not mistake admin follow-up questions for a fresh elevation request", () => {
    expect(detectAdminPrivilegeRequest("帮我打开管理员权限")).toBe(true);
    expect(detectAdminPrivilegeRequest("我现在已经打开了管理员权限我现在可以做非管理员权限的什么操作呢用你")).toBe(false);
    expect(detectAdminPrivilegeRequest("当前已经在管理员模式下我还能让你做什么")).toBe(false);
  });

  it("does not auto-execute concept questions, but allows explicit action requests", () => {
    expect(shouldAutoExecutePowerShellForPrompt("什么是 WSL")).toBe(false);
    expect(shouldAutoExecutePowerShellForPrompt("解释一下 Docker 和 WSL 的区别")).toBe(false);
    expect(shouldAutoExecutePowerShellForPrompt("帮我查一下当前装了哪些 WSL 发行版")).toBe(true);
    expect(shouldAutoExecutePowerShellForPrompt("帮我执行 `wsl --list --verbose`")).toBe(true);
    expect(shouldAutoExecutePowerShellForPrompt("卸载了吧把它")).toBe(true);
  });

  it("classifies intent and gives the model a matching instruction", () => {
    expect(getUserIntentProfile("什么是 WSL").kind).toBe("knowledge");
    expect(getUserIntentProfile("我电脑上是不是有 uu 加速器").kind).toBe("inspect");
    expect(getUserIntentProfile("帮我查一下当前装了哪些 WSL 发行版").kind).toBe("execute");
    expect(getUserIntentProfile("卸载了吧把它").kind).toBe("execute");
    expect(getUserIntentProfile("查看一下我的电脑有uu加速器吗").autoExecutePowerShell).toBe(true);
    expect(buildUserIntentInstruction(getUserIntentProfile("什么是 WSL"))).toContain("解释问答");
  });

  it("recognizes local machine inspection tasks that should auto-check", () => {
    expect(shouldAutoInspectCurrentMachine("查看一下我的电脑有uu加速器吗")).toBe(true);
    expect(shouldAutoInspectCurrentMachine("看一下当前系统有没有装 python")).toBe(true);
    expect(shouldAutoInspectCurrentMachine("看看这个概念是什么意思")).toBe(false);
  });

  it("warns against over-trusting empty or garbled command output", () => {
    const note = buildCommandResultJudgementNote([
      {
        command: "npm run dev",
        output: "ready - started server on http://127.0.0.1:5173",
        code: null,
      },
      {
        command: "Get-ItemProperty HKLM:\\... | Where-Object { $_.DisplayName -like \"*UU*\" }",
        output: "",
        code: 0,
      },
      {
        command: "wsl --status",
        output: "w\u0000s\u0000l\u0000: �hKm",
        code: 0,
      },
    ]);

    expect(note).toContain("不能直接下");
    expect(note).toContain("编码乱码");
    expect(note).toContain("还在终端任务里继续运行");
  });

  it("detects action replies that stop at a half sentence", () => {
    const inspectProfile = getUserIntentProfile("查看一下我的电脑有uu加速器吗");
    const executeProfile = getUserIntentProfile("帮我卸载丁丁");

    expect(isLikelyIncompleteAssistantReply("帮你查一下电脑里有没有安装 UU 加速器（网易 UU）：", inspectProfile)).toBe(true);
    expect(
      isLikelyIncompleteAssistantReply(
        "帮你查一下。\n\n```powershell-run\nGet-ItemProperty \"HKLM:\\Software\\...\"\n```",
        inspectProfile,
      ),
    ).toBe(false);
    expect(
      isLikelyIncompleteAssistantReply(
        "```powershell-run\nwinget list --id Tencent.QQLive\n```",
        inspectProfile,
      ),
    ).toBe(false);
    expect(
      isLikelyIncompleteAssistantReply(
        "你说的“丁丁”是指钉钉（DingTalk）吗？确认一下我帮你搜。",
        executeProfile,
      ),
    ).toBe(false);
  });
});
