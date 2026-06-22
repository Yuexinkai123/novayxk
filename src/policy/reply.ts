import type { UserIntentProfile } from "./intent";

function hasActionBlock(content: string) {
  return /```(?:powershell-run|ps-run|shell-run|fileops|json|diff|patch|browser-actions|web-search)\n[\s\S]*?```/i.test(content);
}

const CLARIFYING_QUESTION_PATTERN =
  /(?:是指|是不是|还是|确认一下|确认下|我理解的|你说的|你这里说的|你要的是|do you mean|are you referring to|just to confirm|to confirm|if i understand correctly|are you asking for)/i;

const LEAD_IN_PATTERN =
  /(?:[:：]|\.\.\.|……)$|(?:帮你|我来|我先|让我|我需要先|需要先)(?:查|看|确认|检查|搜|搜索|核实|处理|执行)(?:一下)?(?:电脑里|电脑上|当前|这个消息|这个情况)?(?:有没有|是否|属实)?(?:安装|存在|发布|发生)?[\s\S]*$|(?:我先|先|我来|帮你|让我|我需要先).{0,12}(?:快速)?(?:扫一眼|扫一下|浏览一下|读一下|看一下|看一遍|过一遍|检查一下).{0,30}(?:再|然后|待会|稍后).{0,16}(?:总结|梳理|给你总结|告诉你)|(?:让我|我来|我先|帮你|我需要先).{0,16}(?:轨迹|记录|流程|操作|api|接口|请求|资料|信息|消息).{0,32}(?:读出来|梳理|整理|分析|看一下|查一下|搜一下|搜索一下|追溯|核实一下)|(?:计划如下|我的计划是|先按这个计划|分几步来|按这几步来)[\s\S]*$|(?:let me|i(?:'ll| will)|i(?:'m| am) going to|i need to|first,?\s*i(?:'ll| will)|i(?:'ll| will) first).{0,48}(?:check|look|inspect|review|scan|read|trace|analy[sz]e|verify|search|handle|run|summari[sz]e)\b[\s\S]*$|(?:here(?:'s| is) the plan|my plan is|let'?s break it down|plan:)[\s\S]*$/i;

const KNOWLEDGE_STALL_PATTERN =
  /^(?:好|好的|行|嗯|那我|我)(?:，|,|\s)?(?:我(?:需要|得|要)?先|让我先|先让我|需要先).{0,24}(?:查|搜|搜索|确认|核实|看一下|查一下|搜一下|搜索一下)|^(?:我不确定|还不确定).{0,24}(?:发布|发生|属实|真假|有没有|是否|消息|传闻|报道)|^(?:let me|i need to|i should first).{0,32}(?:check|search|verify|confirm|look into)|^(?:i'?m not sure).{0,24}(?:whether|if)/i;

const CONCLUSION_SIGNAL_PATTERN =
  /(?:^|[，。；：\s])(?:查到|未查到|没有查到|已安装|没有安装|存在|不存在|结果|结论|可以确定|目前看|判断是|轨迹显示|从轨迹|流程是|调用了|请求了|先给你结论|先说结论|初步判断|整体上看|这是一个|found|did not find|not found|installed|not installed|exists|does not exist|result|conclusion|confirmed|it looks like|the flow is|called|requested|here'?s the conclusion|preliminary conclusion|overall|this is a|this appears to be)/i;

const ACTIONABLE_PLAN_PATTERN =
  /(?:步骤|计划).{0,24}(?:1|一).{0,24}(?:2|二)|(?:steps?|plan).{0,24}(?:1|one).{0,24}(?:2|two)/i;

const ACTIONABLE_PLAN_VERB_PATTERN = /(?:总结|检查|读取|执行|修改|验证|summari[sz]e|check|inspect|read|run|execute|modify|verify|fix)/i;

const PLAN_PROGRESS_PATTERN =
  /(?:已先|先看完了|先读到|初步看|我先总结|当前判断|第一步结果|先给你结论|i already|i've already|here'?s the conclusion|preliminary conclusion|first result|current judgment)/i;

export function isLikelyIncompleteAssistantReply(content: string, profile: UserIntentProfile) {
  if (hasActionBlock(content)) return false;

  const stripped = content.replace(/```[\s\S]*?```/g, "").trim();
  if (!stripped) return true;

  const compact = stripped.replace(/\s+/g, " ");
  const lineCount = stripped.split(/\r?\n/).filter(Boolean).length;
  const shortLeadIn = compact.length <= 120 && lineCount <= 3;
  const isClarifyingQuestion = /[?？]/.test(compact) && CLARIFYING_QUESTION_PATTERN.test(compact);
  const endsLikeLeadIn = LEAD_IN_PATTERN.test(compact);
  const hasConclusionSignal = CONCLUSION_SIGNAL_PATTERN.test(compact);
  const hasActionablePlanSignal = ACTIONABLE_PLAN_PATTERN.test(compact) && ACTIONABLE_PLAN_VERB_PATTERN.test(compact);
  const planOnlyWithoutProgress =
    profile.needsLightPlan &&
    hasActionablePlanSignal &&
    !hasConclusionSignal &&
    !PLAN_PROGRESS_PATTERN.test(compact);

  if (isClarifyingQuestion) return false;
  if (planOnlyWithoutProgress) return true;

  if (compact.length <= 160 && /[:：]$/.test(compact) && !hasConclusionSignal) {
    return true;
  }

  if (profile.kind === "knowledge") {
    return shortLeadIn && !hasConclusionSignal && (endsLikeLeadIn || KNOWLEDGE_STALL_PATTERN.test(compact));
  }

  return shortLeadIn && endsLikeLeadIn && !hasConclusionSignal;
}
