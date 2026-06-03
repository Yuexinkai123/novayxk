import { describe, expect, it } from "vitest";
import { hasAnyConfiguredProvider, hasUsableProvider } from "./providers";

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
});
