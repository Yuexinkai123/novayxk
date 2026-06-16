import { describe, expect, it } from "vitest";
import {
  STREAM_ABORT_PLACEHOLDER,
  buildModelChatHistory,
  getAssistantModeProfile,
  getAutomationRecoveryIssue,
  buildSystemPrompt,
  detectAdminPrivilegeRequest,
  detectAssistantModeRequest,
  detectInternalControlModeRequest,
  extractBrowserActions,
  extractFileOps,
  getBrowserActionsParseIssue,
  getFileOpsParseIssue,
  hasDestructiveFileOps,
  normalizeAssistantToolCallContent,
  sanitizeChatHistory,
  stripPrematurePowerShellResultText,
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

  it("keeps token usage metadata when sanitizing saved history", () => {
    expect(
      sanitizeChatHistory([
        {
          role: "assistant",
          content: "好了",
          tokenUsage: {
            promptTokens: 120,
            completionTokens: 20,
            totalTokens: 140,
            estimated: true,
          },
        },
      ]),
    ).toEqual([
      {
        role: "assistant",
        content: "好了",
        tokenUsage: {
          promptTokens: 120,
          completionTokens: 20,
          totalTokens: 140,
          estimated: true,
        },
      },
    ]);
  });

  it("keeps browser api evidence prompts focused on the latest user request", () => {
    const history = buildModelChatHistory(
      [
        { role: "user", content: "旧问题" },
        { role: "assistant", content: "旧猜测：可能是 session 或 access_token" },
        { role: "user", content: "基于刚才操作写签到脚本" },
      ],
      "\n\n浏览器 API 证据包（按真实捕获时间排序，敏感值已脱敏）：\n1. POST https://xcode.best/api/user/login status=200",
    );

    expect(history).toHaveLength(1);
    expect(history[0].content).toContain("基于刚才操作写签到脚本");
    expect(history[0].content).toContain("浏览器 API 证据包");
    expect(history[0].content).not.toContain("旧猜测");
  });

  it("limits ordinary history more aggressively in low token mode", () => {
    const history = buildModelChatHistory(
      [
        { role: "user", content: "u1" },
        { role: "assistant", content: "a1" },
        { role: "user", content: "u2" },
        { role: "assistant", content: "a2" },
        { role: "user", content: "u3" },
        { role: "assistant", content: "a3" },
      ],
      "",
      "low",
    );

    expect(history.map((message) => message.content)).toEqual(["a1", "u2", "a2", "u3", "a3"]);
  });

  it("keeps low mode compact but less fragile for complex tasks", () => {
    const profile = getAssistantModeProfile("low");

    expect(profile.historyLimitWithContext).toBe(6);
    expect(profile.projectRelatedFileLimit).toBe(4);
    expect(profile.projectRelatedContentLimit).toBe(5000);
  });

  it("keeps low and standard modes focused on solving the problem", () => {
    const runtimePermission = {
      controlMode: "safe" as const,
      isAdmin: false,
      privilegeLabel: "Windows 普通权限",
    };

    const lowPrompt = buildSystemPrompt("", "", runtimePermission, "low");
    const standardPrompt = buildSystemPrompt("", "", runtimePermission, "standard");

    expect(lowPrompt).toContain("低 token 不等于低质量");
    expect(lowPrompt).toContain("目标仍然是解决问题");
    expect(lowPrompt).toContain("主动用最小必要检查补齐");
    expect(standardPrompt).toContain("目标仍然是完整解决用户问题");
    expect(standardPrompt).toContain("先补最相关的信息");
  });

  it("keeps image attachments in saved history but strips them from model context", () => {
    const messages = [
      { role: "user" as const, content: "画一张雪山" },
      {
        role: "assistant" as const,
        content: "图片生成完成：1 张",
        attachments: [
          {
            type: "image" as const,
            path: "D:/generated/image.png",
            url: "novayxk-image://image.png",
            mimeType: "image/png",
            prompt: "画一张雪山",
          },
        ],
      },
    ];

    const savedHistory = sanitizeChatHistory(messages);
    expect("attachments" in savedHistory[1] ? savedHistory[1].attachments : []).toHaveLength(1);
    expect(buildModelChatHistory(messages, "")[1]).not.toHaveProperty("attachments");
  });

  it("normalizes shell-like XML tool calls into powershell-run blocks", () => {
    const normalized = normalizeAssistantToolCallContent(
      "<tool_call><function=shell><parameter=command>npm run build</parameter></function></tool_call>",
    );

    expect(normalized).toContain("```powershell-run");
    expect(normalized).toContain("npm run build");
  });

  it("strips premature result text after powershell-run blocks", () => {
    const content = stripPrematurePowerShellResultText(
      "我来检查一下你电脑上的 Python 安装情况。\n\n```powershell-run\npython --version 2>&1; where python 2>&1\n```\n\n检查结果：\n\nPython 已安装 ✅\n版本：Python 3.13.5\n路径：C:\\Users\\x\\Python313\\python.exe",
    );

    expect(content).toContain("我来检查一下");
    expect(content).toContain("```powershell-run");
    expect(content).toContain("python --version");
    expect(content).not.toContain("检查结果");
    expect(content).not.toContain("Python 3.13.5");
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
      '```fileops\n[{"type":"mkdir","path":"docs"},{"type":"write","path":"docs/a.md","content":"hi"},{"type":"replace","path":"auto_checkin.py","search":"data[\\"data\\"][\\"session\\"]","replace":"data[\\"data\\"][\\"access_token\\"]"},{"type":"delete","path":"dist"}]\n```',
    );

    expect(operations).toEqual([
      { type: "mkdir", path: "docs" },
      { type: "write", path: "docs/a.md", content: "hi" },
      {
        type: "replace",
        path: "auto_checkin.py",
        search: 'data["data"]["session"]',
        replace: 'data["data"]["access_token"]',
      },
      { type: "delete", path: "dist" },
    ]);
    expect(hasDestructiveFileOps(operations)).toBe(true);
    expect(getFileOpsParseIssue('```fileops\n[{"type":"write","path":"a.md"}]\n```')).toContain("JSON 不是合法");
  });

  it("extracts bare fileops json without fences", () => {
    const operations = extractFileOps(
      '我来直接改。\n\n[{"type":"replace","path":"hospital.html","search":"</style>","replace":"<style>body{color:red;}</style>"},{"type":"write","path":"notes.txt","content":"done"}]',
    );

    expect(operations).toEqual([
      {
        type: "replace",
        path: "hospital.html",
        search: "</style>",
        replace: "<style>body{color:red;}</style>",
      },
      {
        type: "write",
        path: "notes.txt",
        content: "done",
      },
    ]);
  });

  it("reports malformed bare fileops json", () => {
    expect(getFileOpsParseIssue('[{"type":"write","path":"a.md","content":"hi"}')).toContain("疑似裸 JSON fileops");
  });

  it("detects invalid automation blocks that need model-side recovery", () => {
    expect(
      getAutomationRecoveryIssue(
        '```fileops\n{"operation":"create","path":"C:\\\\Users\\\\29794\\\\Desktop\\\\login-page.html","content":"<html></html>"}\n```',
      ),
    ).toContain("旧版或伪 fileops");

    expect(
      getAutomationRecoveryIssue(
        '```fileops\n[{"type":"write","path":"C:\\\\Users\\\\29794\\\\Desktop\\\\login-page.html","content":"<html></html>"}]\n```',
      ),
    ).toContain("绝对路径或项目外路径");

    expect(
      getAutomationRecoveryIssue(
        '[{"type":"write","path":"C:\\\\Users\\\\29794\\\\Desktop\\\\login-page.html","content":"<html></html>"}]',
      ),
    ).toContain("绝对路径或项目外路径");
  });

  it("extracts valid browser-actions and reports malformed blocks", () => {
    const actions = extractBrowserActions(
      '```browser-actions\n[{"type":"navigate","url":"https://example.com"},{"type":"click","selector":"button[type=submit]"},{"type":"type","selector":"#email","text":"a@b.com"},{"type":"waitFor","selector":".done","timeoutMs":3000},{"type":"pressKey","key":"Enter","selector":"#email"},{"type":"scrollTo","selector":"#result"},{"type":"select","selector":"select[name=city]","value":"shanghai"},{"type":"extractText","selector":".result","multiple":true}]\n```',
    );

    expect(actions).toEqual([
      { type: "navigate", url: "https://example.com" },
      { type: "click", selector: "button[type=submit]" },
      { type: "type", selector: "#email", text: "a@b.com" },
      { type: "waitFor", selector: ".done", timeoutMs: 3000 },
      { type: "pressKey", key: "Enter", selector: "#email" },
      { type: "scrollTo", selector: "#result" },
      { type: "select", selector: "select[name=city]", value: "shanghai" },
      { type: "extractText", selector: ".result", multiple: true },
    ]);
    expect(getBrowserActionsParseIssue('```browser-actions\n[{"type":"click"}]\n```')).toContain("JSON 不是合法");
  });

  it("accepts legacy browser action payloads with actions/action keys", () => {
    expect(
      extractBrowserActions('```browser-actions\n{"actions":[{"action":"navigate","url":"about:blank"}]}\n```'),
    ).toEqual([{ type: "navigate", url: "about:blank" }]);
  });

  it("does not mistake browser json blocks for fileops", () => {
    const browserJson = '```json\n[{"type":"click","selector":"button:has-text(\\"继续\\")"},{"type":"waitFor","selector":"input[type=password]","timeoutMs":5000}]\n```';

    expect(extractFileOps(browserJson)).toEqual([]);
    expect(getFileOpsParseIssue(browserJson)).toBe("");
    expect(extractBrowserActions(browserJson)).toEqual([
      { type: "click", selector: 'button:has-text("继续")' },
      { type: "waitFor", selector: "input[type=password]", timeoutMs: 5000 },
    ]);
  });

  it("recognizes the renamed execution-range phrases", () => {
    expect(detectInternalControlModeRequest("切换到项目内执行")).toBe("safe");
    expect(detectInternalControlModeRequest("改成系统级执行")).toBe("full");
  });

  it("recognizes assistant token mode switch phrases", () => {
    expect(detectAssistantModeRequest("切到极省模式")).toBe("low");
    expect(detectAssistantModeRequest("改成标准模式")).toBe("standard");
    expect(detectAssistantModeRequest("开启深度模式")).toBe("deep");
    expect(detectAssistantModeRequest("什么是低 token 模式")).toBeNull();
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
    expect(getUserIntentProfile("我怎么从登录页面到这里的你能看到吗，掉了什么api啥的").kind).toBe("inspect");
    expect(getUserIntentProfile("帮我查一下当前装了哪些 WSL 发行版").kind).toBe("execute");
    expect(getUserIntentProfile("卸载了吧把它").kind).toBe("execute");
    expect(getUserIntentProfile("查看一下我的电脑有uu加速器吗").autoExecutePowerShell).toBe(true);
    expect(getUserIntentProfile("看一下我的项目，然后先别改代码，看完后总结一下").needsLightPlan).toBe(true);
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
      {
        command: "run sensitive action",
        output: "The request was rejected because it was considered high risk",
        code: 1,
      },
    ]);

    expect(note).toContain("不能直接下");
    expect(note).toContain("编码乱码");
    expect(note).toContain("还在终端任务里继续运行");
    expect(note).toContain("没有任何可见输出");
    expect(note).toContain("不能说“跑通了”");
    expect(note).toContain("high risk");
  });

  it("warns when command failures are followed by speculative fixes", () => {
    const note = buildCommandResultJudgementNote([
      {
        command: "python auto_checkin.py",
        output: "KeyError: 'token'",
        code: 1,
      },
    ]);

    expect(note).toContain("退出码不是 0");
    expect(note).toContain("不能把后续猜测说成成功");
    expect(note).toContain("严禁把脚本报错归因成");
  });

  it("detects action replies that stop at a half sentence", () => {
    const inspectProfile = getUserIntentProfile("查看一下我的电脑有uu加速器吗");
    const executeProfile = getUserIntentProfile("帮我卸载丁丁");

    expect(isLikelyIncompleteAssistantReply("帮你查一下电脑里有没有安装 UU 加速器（网易 UU）：", inspectProfile)).toBe(true);
    expect(
      isLikelyIncompleteAssistantReply(
        "能看到！让我把完整的轨迹读出来，帮你梳理从登录到现在的完整流程。",
        getUserIntentProfile("我怎么从登录页面到这里的你能看到吗，掉了什么api啥的"),
      ),
    ).toBe(true);
    expect(
      isLikelyIncompleteAssistantReply(
        "我先快速扫一眼主要代码文件的内容，再给你总结。",
        getUserIntentProfile("看一下我的项目，然后先别改代码，看完后总结一下"),
      ),
    ).toBe(true);
    expect(
      isLikelyIncompleteAssistantReply(
        "计划如下：1. 先看项目结构 2. 再读核心文件 3. 最后总结模块关系",
        getUserIntentProfile("看一下我的项目，然后先别改代码，看完后总结一下"),
      ),
    ).toBe(true);
    expect(
      isLikelyIncompleteAssistantReply(
        "计划如下：1. 先看项目结构 2. 再读核心文件 3. 最后总结模块关系。先给你结论：这是一个 Electron + React 的桌面项目，主线分成界面层、桌面桥接层和本地执行层。",
        getUserIntentProfile("看一下我的项目，然后先别改代码，看完后总结一下"),
      ),
    ).toBe(false);
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

  it("treats explicit online-search requests as executable inspection", () => {
    const profile = getUserIntentProfile("你知道Fable吗，我说的是Anthropic 新模型 Fable，你不知道的话你就上网去搜");
    expect(profile.autoExecutePowerShell).toBe(true);
    expect(profile.kind).toBe("execute");
  });
});
