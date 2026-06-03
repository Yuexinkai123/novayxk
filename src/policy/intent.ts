export type UserIntentKind = "knowledge" | "inspect" | "execute";

export type UserIntentProfile = {
  kind: UserIntentKind;
  autoExecutePowerShell: boolean;
};

function hasDirectActionIntent(normalized: string) {
  return /(?:卸载|安装|删除|打开|关闭|停止|启动|更新|升级|下载|清理|移除|重启|运行|执行|处理)(?:[\s\S]{0,8}(?:吧|一下|下|它|这个|掉|了吧|一下吧|一下它|下它|一下这个))?/i.test(
    normalized,
  );
}

export function shouldAutoExecutePowerShellForPrompt(prompt: string) {
  const normalized = prompt.trim().toLowerCase();
  if (!normalized) return false;

  if (/```(?:powershell-run|ps-run|shell-run)|`[^`\n]+`/.test(prompt)) {
    return true;
  }

  if (
    /^(?:什么是|啥是|是什么意思|介绍一下|解释一下|讲讲|科普一下|聊聊|说说|你知道.*吗|了解一下)/i.test(normalized) &&
    !/(?:帮我查|帮我看|帮我搜|帮我验证|帮我检查|帮我安装|帮我运行|帮我执行|帮我打开|帮我下载|帮我配置)/i.test(normalized)
  ) {
    return false;
  }

  if (/(?:如何|怎么|为啥|为什么|原理|区别|用途|作用)/i.test(normalized) && !/(?:请执行|执行一下|运行一下|帮我查一下|帮我看一下|帮我装一下)/i.test(normalized)) {
    return false;
  }

  if (hasDirectActionIntent(normalized)) {
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
    return { kind: "knowledge", autoExecutePowerShell: false };
  }

  const autoExecutePowerShell = shouldAutoExecutePowerShellForPrompt(prompt);
  if (autoExecutePowerShell) {
    return { kind: "execute", autoExecutePowerShell: true };
  }

  if (
    /^(?:什么是|啥是|是什么意思|介绍一下|解释一下|讲讲|科普一下|聊聊|说说|你知道.*吗|了解一下)/i.test(normalized) ||
    /(?:如何|怎么|为什么|为啥|原理|区别|用途|作用)/i.test(normalized)
  ) {
    return { kind: "knowledge", autoExecutePowerShell: false };
  }

  if (
    /(?:有没有|有吗|是不是|在吗|装了没|装没装|查一下|看一下|查看一下|检查一下|搜一下|版本|状态|路径|位置|列表|有哪些|当前.*(状态|版本|配置)|是否安装|是否存在)/i.test(
      normalized,
    )
  ) {
    return { kind: "inspect", autoExecutePowerShell: shouldAutoInspectCurrentMachine(prompt) };
  }

  return { kind: "knowledge", autoExecutePowerShell: false };
}

export function buildUserIntentInstruction(profile: UserIntentProfile) {
  if (profile.kind === "execute") {
    return "【本轮任务类型】代为操作。用户这轮明确要求你执行、安装、打开、修改、搜索或处理某件事。可以输出 powershell-run、fileops 或补丁，但要先说清这一步是在做什么，以及结果会影响哪里。";
  }

  if (profile.kind === "inspect") {
    return "【本轮任务类型】状态核实。用户这轮主要是想确认电脑、环境、软件或项目的当前状态。凡是涉及当前电脑、本机软件、系统环境、安装状态、进程、服务、注册表或版本的判断，优先先查再答，不要只凭常识直接下结论。优先用 1 到 3 条最直接、最可靠的检查命令完成任务，不要为了显得全面就拼接很长的多段脚本，除非简单检查确实不够。若只做了单一来源检查，或命令输出为空、乱码、截断，不要直接下“不存在/没有安装”的结论。";
  }

  return "【本轮任务类型】解释问答。用户这轮主要是在问概念、原理、区别或用途。先直接回答，不要为了顺手帮忙主动输出 powershell-run、fileops 或补丁，除非用户明确要求你代为执行。";
}
