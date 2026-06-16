import type { UserIntentProfile } from "./intent";

function hasActionBlock(content: string) {
  return /```(?:powershell-run|ps-run|shell-run|fileops|json|diff|patch|browser-actions)\n[\s\S]*?```/i.test(content);
}

export function isLikelyIncompleteAssistantReply(content: string, profile: UserIntentProfile) {
  if (profile.kind === "knowledge") return false;

  if (hasActionBlock(content)) return false;

  const stripped = content.replace(/```[\s\S]*?```/g, "").trim();
  if (!stripped) return true;

  const compact = stripped.replace(/\s+/g, " ");
  const lineCount = stripped.split(/\r?\n/).filter(Boolean).length;
  const shortLeadIn = compact.length <= 120 && lineCount <= 3;
  const isClarifyingQuestion =
    /[?？]/.test(compact) &&
    /(?:是指|是不是|还是|确认一下|确认下|我理解的|你说的|你这里说的|你要的是)/.test(compact);
  const endsLikeLeadIn =
    /(?:[:：]|\.\.\.|……)$/.test(compact) ||
    /(?:帮你|我来|我先)(?:查|看|确认|检查|搜|处理|执行)(?:一下)?(?:电脑里|电脑上|当前)?(?:有没有|是否)?(?:安装|存在)?[\s\S]*$/.test(compact) ||
    /(?:我先|先|我来|帮你).{0,12}(?:快速)?(?:扫一眼|扫一下|浏览一下|读一下|看一下|看一遍|过一遍|检查一下).{0,30}(?:再|然后|待会|稍后).{0,16}(?:总结|梳理|给你总结|告诉你)/i.test(compact) ||
    /(?:让我|我来|我先|帮你).{0,16}(?:轨迹|记录|流程|操作|api|接口|请求).{0,32}(?:读出来|梳理|整理|分析|看一下|查一下|追溯)/i.test(compact) ||
    /(?:计划如下|我的计划是|先按这个计划|分几步来|按这几步来)[\s\S]*$/.test(compact);
  const hasConclusionSignal =
    /(?:^|[，。；：\s])(?:查到|未查到|没有查到|已安装|没有安装|存在|不存在|结果|结论|可以确定|目前看|判断是|轨迹显示|从轨迹|流程是|调用了|请求了|先给你结论|先说结论|初步判断|整体上看|这是一个)/.test(compact);
  const hasActionablePlanSignal =
    /(?:步骤|计划).{0,24}(?:1|一).{0,24}(?:2|二)/.test(compact) && /(?:总结|检查|读取|执行|修改|验证)/.test(compact);
  const planOnlyWithoutProgress =
    profile.needsLightPlan &&
    hasActionablePlanSignal &&
    !hasConclusionSignal &&
    !/(?:已先|先看完了|先读到|初步看|我先总结|当前判断|第一步结果|先给你结论)/.test(compact);

  if (isClarifyingQuestion) return false;
  if (planOnlyWithoutProgress) return true;

  if (compact.length <= 160 && /[:：]$/.test(compact) && !hasConclusionSignal) {
    return true;
  }

  return shortLeadIn && endsLikeLeadIn && !hasConclusionSignal;
}
