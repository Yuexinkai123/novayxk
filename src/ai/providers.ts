import type { AiControlMode, ProviderConfig, ThemeMode } from "../vite-env";

export const defaultProvider: ProviderConfig = {
  id: "provider-openai-compatible",
  name: "OpenAI Compatible",
  baseUrl: "https://api.openai.com/v1",
  apiKey: "",
  model: "gpt-4.1-mini",
  apiMode: "chatCompletions",
};

export function getProviderId(providers: ProviderConfig[], preferredId?: string | null, fallbackId?: string | null) {
  if (preferredId && providers.some((provider) => provider.id === preferredId)) return preferredId;
  if (fallbackId && providers.some((provider) => provider.id === fallbackId)) return fallbackId;
  return providers[0]?.id ?? defaultProvider.id;
}

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "dark" || value === "light";
}

export function isAiControlMode(value: unknown): value is AiControlMode {
  return value === "safe" || value === "full";
}

export function formatElapsedSeconds(elapsedMs: number) {
  const seconds = Math.max(0, elapsedMs) / 1000;
  return `${seconds < 10 ? seconds.toFixed(1) : seconds.toFixed(0)} 秒`;
}

export function hasUsableProvider(provider: ProviderConfig | null | undefined) {
  if (!provider) return false;
  return Boolean(provider.baseUrl.trim() && provider.model.trim() && provider.apiKey.trim());
}

export function hasAnyConfiguredProvider(providers: ProviderConfig[]) {
  return providers.some((provider) => hasUsableProvider(provider));
}
