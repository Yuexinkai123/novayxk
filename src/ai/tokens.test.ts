import { describe, expect, it } from "vitest";
import { buildEstimatedTokenUsage, estimateMessageTokens, estimateTextTokens, formatTokenUsage, mergeTokenUsage } from "./tokens";

describe("token usage estimates", () => {
  it("estimates mixed Chinese and English text without external dependencies", () => {
    expect(estimateTextTokens("你好，Novayxk can help with npm run build.")).toBeGreaterThan(0);
    expect(estimateMessageTokens([{ role: "user", content: "帮我修一下这个 TypeScript 报错" }])).toBeGreaterThan(0);
  });

  it("formats estimated prompt, completion, and total tokens", () => {
    const usage = buildEstimatedTokenUsage(
      [
        { role: "system", content: "你是助手" },
        { role: "user", content: "解释一下 token" },
      ],
      "token 是模型处理文本的基本计量单位。",
    );

    expect(usage.totalTokens).toBe(usage.promptTokens + usage.completionTokens);
    expect(formatTokenUsage(usage)).toContain("约 token");
    expect(formatTokenUsage(usage)).toContain("输入");
    expect(formatTokenUsage(usage)).toContain("输出");
  });

  it("merges multiple token usage estimates", () => {
    expect(
      mergeTokenUsage(
        { promptTokens: 10, completionTokens: 5, totalTokens: 15, estimated: true },
        { promptTokens: 8, completionTokens: 2, totalTokens: 10, estimated: true },
      ),
    ).toEqual({
      promptTokens: 18,
      completionTokens: 7,
      totalTokens: 25,
      estimated: true,
    });
  });
});
