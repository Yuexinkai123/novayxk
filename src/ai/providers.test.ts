import { describe, expect, it } from "vitest";
import { getProviderModeLabel, hasAnyConfiguredProvider, hasUsableProvider, inferProviderApiMode, isAssistantMode, isLikelyImageModel } from "./providers";

describe("provider readiness helpers", () => {
  it("requires base url, model, and api key to treat a provider as usable", () => {
    expect(
      hasUsableProvider({
        id: "p1",
        name: "OpenAI",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "sk-test",
        model: "gpt-4.1-mini",
        apiMode: "chatCompletions",
      }),
    ).toBe(true);

    expect(
      hasUsableProvider({
        id: "p2",
        name: "Incomplete",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "",
        model: "gpt-4.1-mini",
        apiMode: "chatCompletions",
      }),
    ).toBe(false);
  });

  it("detects whether any provider is configured enough to start chatting", () => {
    expect(
      hasAnyConfiguredProvider([
        {
          id: "p1",
          name: "Default",
          baseUrl: "https://api.openai.com/v1",
          apiKey: "",
          model: "gpt-4.1-mini",
          apiMode: "chatCompletions",
        },
      ]),
    ).toBe(false);
  });

  it("recognizes common image generation model names", () => {
    expect(isLikelyImageModel("gpt-image-1")).toBe(true);
    expect(isLikelyImageModel("dall-e-3")).toBe(true);
    expect(isLikelyImageModel("gpt-4.1-mini")).toBe(false);
    expect(inferProviderApiMode("gpt-image-1")).toBe("imageGenerations");
    expect(inferProviderApiMode("gpt-4.1-mini")).toBe("chatCompletions");
    expect(getProviderModeLabel("imageGenerations")).toBe("Image generation");
  });

  it("recognizes assistant token modes", () => {
    expect(isAssistantMode("low")).toBe(true);
    expect(isAssistantMode("standard")).toBe(true);
    expect(isAssistantMode("deep")).toBe(true);
    expect(isAssistantMode("quiet")).toBe(false);
  });
});
