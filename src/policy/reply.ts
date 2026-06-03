import type { UserIntentProfile } from "./intent";

function hasActionBlock(content: string) {
  return /```(?:powershell-run|ps-run|shell-run|fileops|json|diff|patch)\n[\s\S]*?```/i.test(content);
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
    /(?:帮你|我来|我先)(?:查|看|确认|检查|搜|处理|执行)(?:一下)?(?:电脑里|电脑上|当前)?(?:有没有|是否)?(?:安装|存在)?[\s\S]*$/.test(compact);
  const hasConclusionSignal =
    /(?:^|[，。；：\s])(?:查到|未查到|没有查到|已安装|没有安装|存在|不存在|结果|结论|可以确定|目前看|判断是)/.test(compact);

  if (isClarifyingQuestion) return false;

  if (compact.length <= 160 && /[:：]$/.test(compact) && !hasConclusionSignal) {
    return true;
  }

  return shortLeadIn && endsLikeLeadIn && !hasConclusionSignal;
}
