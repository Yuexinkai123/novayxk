import type { ChatMessage, TokenUsage } from "../vite-env";

export function estimateTextTokens(value: string) {
  const text = String(value || "");
  if (!text.trim()) return 0;

  const cjkMatches = text.match(/[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/g) ?? [];
  const asciiWordMatches = text.match(/[A-Za-z0-9_]+/g) ?? [];
  const asciiWordTokens = asciiWordMatches.reduce((total, word) => total + Math.max(1, Math.ceil(word.length / 4)), 0);
  const symbolCount = text
    .replace(/[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/g, "")
    .replace(/[A-Za-z0-9_\s]/g, "").length;

  return Math.max(1, Math.ceil(cjkMatches.length + asciiWordTokens + symbolCount * 0.5));
}

export function estimateMessageTokens(messages: Pick<ChatMessage, "role" | "content">[]) {
  if (!messages.length) return 0;
  return messages.reduce((total, message) => total + 4 + estimateTextTokens(`${message.role}\n${message.content}`), 2);
}

export function buildEstimatedTokenUsage(
  promptMessages: Pick<ChatMessage, "role" | "content">[],
  completionText: string,
): TokenUsage {
  const promptTokens = estimateMessageTokens(promptMessages);
  const completionTokens = estimateTextTokens(completionText);
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    estimated: true,
  };
}

export function mergeTokenUsage(...usages: Array<TokenUsage | null | undefined>) {
  const valid = usages.filter((usage): usage is TokenUsage => Boolean(usage));
  if (!valid.length) return undefined;
  const promptTokens = valid.reduce((total, usage) => total + usage.promptTokens, 0);
  const completionTokens = valid.reduce((total, usage) => total + usage.completionTokens, 0);
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
    estimated: valid.every((usage) => usage.estimated !== false),
  };
}

export function formatTokenUsage(usage: TokenUsage) {
  const prefix = usage.estimated === false ? "token" : "约 token";
  return `${prefix} ${usage.totalTokens.toLocaleString()}（输入 ${usage.promptTokens.toLocaleString()} / 输出 ${usage.completionTokens.toLocaleString()}）`;
}
