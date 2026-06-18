export type UserIntentKind = "knowledge" | "inspect" | "execute";

export type UserIntentProfile = {
  kind: UserIntentKind;
  autoExecutePowerShell: boolean;
  needsLightPlan: boolean;
  shouldForceWebSearch: boolean;
};

function shouldUseLightPlan(prompt: string) {
  const normalized = prompt.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.length < 18) return false;

  return (
    /(?:先别改|不要改|先不改|先看|先检查|先分析|先梳理|看完后|然后总结|总结一下|排查|修复|重构|多步骤|一步一步|逐步|流程|计划)/i.test(
      normalized,
    ) ||
    /(?:并且|然后|再|同时|顺便|另外).{0,20}(?:检查|分析|总结|处理|修改|修复)/i.test(normalized)
  );
}

function hasDirectActionIntent(normalized: string) {
  return /(?:卸载|安装|删除|打开|关闭|停止|启动|更新|升级|下载|清理|移除|重启|运行|执行|处理)(?:[\s\S]{0,8}(?:吧|一下|下|它|这个|掉|了吧|一下吧|一下它|下它|一下这个))?/i.test(
    normalized,
  );
}

function hasExplicitOnlineSearchIntent(normalized: string) {
  return /(?:上网(?:去)?搜|联网(?:去)?搜|去搜|搜一下|搜一搜|查资料|查网页|查新闻|联网核实|上网核实|帮我搜|帮我查资料|搜索一下|检索一下|look ?up|search)/i.test(
    normalized,
  );
}

export function shouldForceBuiltInWebSearch(prompt: string) {
  const normalized = prompt.trim().toLowerCase();
  if (!normalized) return false;

  const likelyNewsOrReleaseSubject =
    /(?:特朗普|拜登|习近平|白宫|外交部|openai|anthropic|gpt|claude|gemini|发布|模型|新闻|消息|访问|访华|会晤|制裁|融资|收购|政策|公告|官宣|release|launch|visit|announcement|official)/i.test(
      normalized,
    );

  if (hasExplicitOnlineSearchIntent(normalized) && (!hasDirectActionIntent(normalized) || likelyNewsOrReleaseSubject)) {
    return true;
  }

  const hasTimeSensitivity =
    /(?:最新|最近|刚刚|刚才|前两天|这两天|近期|今天|昨日|昨天|明天|本周|最近几天|刚发布|新发布|最新消息|最新进展|recent|latest|today|yesterday|this week|breaking)/i.test(
      normalized,
    );
  const asksToVerify =
    /(?:是否属实|是真的吗|是真是假|有没有这回事|确认一下|核实一下|查证一下|是真的吗|真的假的|有没有发布|是否发布|是否发生|是真的吗|verify|fact check|is it true|did .* happen)/i.test(
      normalized,
    );

  return (hasTimeSensitivity || asksToVerify) && likelyNewsOrReleaseSubject;
}

export function shouldAutoExecutePowerShellForPrompt(prompt: string) {
  const normalized = prompt.trim().toLowerCase();
  if (!normalized) return false;
  const explicitOnlineSearch = hasExplicitOnlineSearchIntent(normalized);

  if (/```(?:powershell-run|ps-run|shell-run)|`[^`\n]+`/.test(prompt)) {
    return true;
  }

  if (
    /^(?:什么是|啥是|是什么意思|介绍一下|解释一下|讲讲|科普一下|聊聊|说说|你知道.*吗|了解一下)/i.test(normalized) &&
    !/(?:帮我查|帮我看|帮我搜|帮我验证|帮我检查|帮我安装|帮我运行|帮我执行|帮我打开|帮我下载|帮我配置)/i.test(normalized) &&
    !explicitOnlineSearch
  ) {
    return false;
  }

  if (/(?:如何|怎么|为啥|为什么|原理|区别|用途|作用)/i.test(normalized) && !/(?:请执行|执行一下|运行一下|帮我查一下|帮我看一下|帮我装一下)/i.test(normalized)) {
    return false;
  }

  if (hasDirectActionIntent(normalized)) {
    return true;
  }

  if (explicitOnlineSearch) {
    return true;
  }

  return /(?:请执行|执行一下|运行一下|跑一下|试一下|查一下|看一下|搜一下|搜一搜|检查看看|帮我查|帮我看|帮我搜|帮我验证|帮我检查|帮我测试|帮我安装|帮我卸载|帮我升级|帮我打开|帮我下载|帮我配置|帮我处理|直接执行|直接运行|直接帮我|替我执行|给我装|给我查|打开一下|安装一下|下载一下)/i.test(
    normalized,
  );
}

export function shouldAutoInspectCurrentMachine(prompt: string) {
  const normalized = prompt.trim().toLowerCase();
  if (!normalized) return false;

  const asksToInspect =
    /(?:有没有|有吗|是不是|在吗|装了没|装没装|查一下|看一下|查看一下|检查一下|搜一下|确认一下|核实一下|版本|状态|路径|位置|列表|有哪些|是否安装|是否存在)/i.test(
      normalized,
    );
  if (!asksToInspect) return false;

  return /(?:我的电脑|电脑上|电脑里|本机|当前电脑|系统里|系统上|windows|软件|应用|程序|进程|服务|注册表|环境变量|wsl|docker|node|python|git|uu|加速器)/i.test(
    normalized,
  );
}

export function getUserIntentProfile(prompt: string): UserIntentProfile {
  const normalized = prompt.trim().toLowerCase();
  if (!normalized) {
    return { kind: "knowledge", autoExecutePowerShell: false, needsLightPlan: false, shouldForceWebSearch: false };
  }

  const autoExecutePowerShell = shouldAutoExecutePowerShellForPrompt(prompt);
  const needsLightPlan = shouldUseLightPlan(prompt);
  const shouldForceWebSearch = shouldForceBuiltInWebSearch(prompt);
  if (autoExecutePowerShell) {
    return { kind: "execute", autoExecutePowerShell: true, needsLightPlan, shouldForceWebSearch };
  }

  if (
    /(?:浏览器|网页|页面|登录|轨迹|操作|接口|api|请求|从.+到|怎么.+进|咋.+进|你.*看到)/i.test(normalized) &&
    /(?:怎么看|怎么进|咋进|看到|轨迹|操作|接口|api|请求|登录页面|到这里|调了|掉了)/i.test(normalized)
  ) {
    return { kind: "inspect", autoExecutePowerShell: false, needsLightPlan, shouldForceWebSearch };
  }

  if (
    /^(?:什么是|啥是|是什么意思|介绍一下|解释一下|讲讲|科普一下|聊聊|说说|你知道.*吗|了解一下)/i.test(normalized) ||
    /(?:如何|怎么|为什么|为啥|原理|区别|用途|作用)/i.test(normalized)
  ) {
    return { kind: "knowledge", autoExecutePowerShell: false, needsLightPlan, shouldForceWebSearch };
  }

  if (
    /(?:有没有|有吗|是不是|在吗|装了没|装没装|查一下|看一下|查看一下|检查一下|搜一下|版本|状态|路径|位置|列表|有哪些|当前.*(状态|版本|配置)|是否安装|是否存在)/i.test(
      normalized,
    )
  ) {
    return {
      kind: "inspect",
      autoExecutePowerShell: shouldAutoInspectCurrentMachine(prompt),
      needsLightPlan,
      shouldForceWebSearch,
    };
  }

  return { kind: "knowledge", autoExecutePowerShell: false, needsLightPlan, shouldForceWebSearch };
}

export function buildUserIntentInstruction(profile: UserIntentProfile) {
  if (profile.kind === "execute") {
    return `Task type: hands-on execution. The user explicitly wants you to execute, install, open, modify, search for, or handle something this turn. You may output powershell-run, fileops, or a patch, but first make clear what this step is doing and what it may affect.${
      profile.needsLightPlan
        ? " If the task is complex, you may first give a 2-to-4-step ultra-short plan, but the same reply must continue into execution or the next directly actionable step instead of stopping at the plan."
        : ""
    }${profile.shouldForceWebSearch ? " This turn also requires built-in web search evidence before you conclude." : ""}`;
  }

  if (profile.kind === "inspect") {
    return `Task type: status verification. The user mainly wants to confirm the current state of the computer, environment, software, or project. For anything involving the current machine, installed software, system environment, installation state, processes, services, registry, or versions, check first and answer second instead of relying on assumptions. Prefer 1 to 3 of the most direct and reliable checks. Do not stitch together long multi-part scripts unless simple checks are truly insufficient. If you only checked one source, or the command output is empty, garbled, or truncated, do not conclude that something does not exist or is not installed.${
      profile.needsLightPlan
        ? " If the task clearly has stages, such as inspect first and summarize second, you may start with a minimal plan, but the same reply must continue with findings or a summary."
        : ""
    }${profile.shouldForceWebSearch ? " This turn also requires built-in web search evidence before you conclude." : ""}`;
  }

  return `Task type: explanation and Q&A. The user is mainly asking about concepts, principles, differences, or use cases. Answer directly first. Do not proactively output powershell-run, fileops, or a patch unless the user explicitly asks you to execute on their behalf.${
    profile.needsLightPlan ? " If the question itself is a complex process or a multi-stage analysis, you may use a minimal plan to organize the answer, but do not give only the plan." : ""
  }${profile.shouldForceWebSearch ? " This turn is time-sensitive or fact-sensitive, so do not rely only on prior knowledge; built-in web search evidence is required before concluding." : ""}`;
}
