const { isAbortError, requestText } = require("./http.cjs");

let logAi = () => {};
let logError = () => {};
const IMAGE_GENERATION_TIMEOUT_MS = 10 * 60 * 1000;
const IMAGE_GENERATION_RESPONSE_LIMIT_BYTES = 160 * 1024 * 1024;

function createOptionalAbortTimeout(controller, timeoutMs) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return {
      clear() {},
      didTimeout: () => false,
    };
  }

  let didTimeout = false;
  const timer = setTimeout(() => {
    didTimeout = true;
    controller.abort();
  }, timeoutMs);

  return {
    clear() {
      clearTimeout(timer);
    },
    didTimeout: () => didTimeout,
  };
}

async function requestChatCompletion(provider, messages, options = {}) {
  if (!provider?.baseUrl || !provider?.apiKey || !provider?.model) {
    throw new Error("供应商配置不完整。");
  }
  if (provider.apiMode === "imageGenerations") {
    throw new Error("当前供应商配置为图片生成接口，请使用图片生成请求。");
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 45_000);
  const apiMode = provider.apiMode ?? "chatCompletions";
  const endpoint = buildProviderEndpoint(provider.baseUrl, apiMode);
  const providerProfile = getProviderProfile(provider);
  logAi("request:start", {
    providerName: provider.name,
    model: provider.model,
    apiMode,
    endpoint,
    providerProfile,
    messageCount: Array.isArray(messages) ? messages.length : 0,
    stream: false,
  });
  const body = buildProviderRequestBody(provider, messages, {
    ...options,
    stream: false,
  });

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: buildProviderHeaders(provider),
      signal: controller.signal,
      body: JSON.stringify(body),
    });

    const responseText = await response.text();
    if (!response.ok) {
      logAi("request:httpError", {
        providerName: provider.name,
        model: provider.model,
        apiMode,
        endpoint,
        status: response.status,
        elapsedMs: Date.now() - startedAt,
        responsePreview: responseText.slice(0, 500),
      }, "warn");
      throw new Error(`模型请求失败：${response.status} ${formatProviderError(responseText, endpoint)}`);
    }

    try {
      const parsed = JSON.parse(responseText);
      logAi("request:done", {
        providerName: provider.name,
        model: provider.model,
        apiMode,
        endpoint,
        elapsedMs: Date.now() - startedAt,
      });
      return parsed;
    } catch {
      logAi("request:invalidJson", {
        providerName: provider.name,
        model: provider.model,
        apiMode,
        endpoint,
        elapsedMs: Date.now() - startedAt,
        responsePreview: responseText.slice(0, 500),
      }, "error");
      throw new Error(`供应商返回的不是 JSON。请检查接口类型和 Base URL。当前请求：${endpoint}`);
    }
  } catch (error) {
    logError("ai:request:error", error, {
      providerName: provider.name,
      model: provider.model,
      apiMode,
      endpoint,
      elapsedMs: Date.now() - startedAt,
    });
    if (error.name === "AbortError") {
      throw new Error("模型请求超时，请检查 Base URL、网络或供应商状态。");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function buildProviderModelsEndpoint(baseUrl) {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Base URL 无效，请填写类似 https://api.openai.com/v1 的地址。");
  }

  const pathName = parsed.pathname.replace(/\/+$/, "");
  const apiBase = pathName && pathName !== "/" ? trimmed : `${trimmed}/v1`;
  return `${apiBase}/models`;
}

function buildProviderImageEndpoint(baseUrl) {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Base URL 无效，请填写类似 https://api.openai.com/v1 的地址。");
  }

  const pathName = parsed.pathname.replace(/\/+$/, "");
  const apiBase = pathName && pathName !== "/" ? trimmed : `${trimmed}/v1`;
  return `${apiBase}/images/generations`;
}

function buildProviderEndpoint(baseUrl, apiMode) {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Base URL 无效，请填写类似 https://api.openai.com/v1 的地址。");
  }

  const pathName = parsed.pathname.replace(/\/+$/, "");
  const apiBase = pathName && pathName !== "/" ? trimmed : `${trimmed}/v1`;
  return apiMode === "responses" ? `${apiBase}/responses` : `${apiBase}/chat/completions`;
}

async function requestImageGeneration(provider, prompt, options = {}) {
  if (!provider?.baseUrl || !provider?.apiKey || !provider?.model) {
    throw new Error("供应商配置不完整。");
  }
  const normalizedPrompt = String(prompt || "").trim();
  if (!normalizedPrompt) {
    throw new Error("图片提示词不能为空。");
  }

  const startedAt = Date.now();
  const controller = options.controller ?? new AbortController();
  const timeout = createOptionalAbortTimeout(controller, options.timeoutMs ?? IMAGE_GENERATION_TIMEOUT_MS);
  const endpoint = buildProviderImageEndpoint(provider.baseUrl);
  const providerProfile = getProviderProfile(provider);
  const imageCount = Math.max(1, Math.min(4, Number(options.n || 1)));
  const body = {
    model: provider.model,
    prompt: normalizedPrompt,
    n: imageCount,
    size: String(options.size || "1024x1024"),
  };
  logAi("image:start", {
    providerName: provider.name,
    model: provider.model,
    endpoint,
    providerProfile,
    imageCount,
    size: body.size,
  });

  try {
    const response = await requestText(endpoint, {
      method: "POST",
      headers: buildProviderHeaders(provider),
      signal: controller.signal,
      body: JSON.stringify(body),
      maxBytes: IMAGE_GENERATION_RESPONSE_LIMIT_BYTES,
    });
    const responseText = response.text;
    if (!response.ok) {
      logAi("image:httpError", {
        providerName: provider.name,
        model: provider.model,
        endpoint,
        status: response.status,
        elapsedMs: Date.now() - startedAt,
        responsePreview: responseText.slice(0, 500),
      }, "warn");
      throw new Error(`图片生成失败：${response.status} ${formatProviderError(responseText, endpoint)}`);
    }

    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      throw new Error(`图片生成接口没有返回 JSON。请检查 Base URL。当前请求：${endpoint}`);
    }

    if (!Array.isArray(parsed?.data) || parsed.data.length === 0) {
      throw new Error("图片生成接口返回成功，但没有图片数据。");
    }

    logAi("image:done", {
      providerName: provider.name,
      model: provider.model,
      endpoint,
      imageCount: parsed.data.length,
      elapsedMs: Date.now() - startedAt,
    });
    return parsed;
  } catch (error) {
    logError("ai:image:error", error, {
      providerName: provider?.name,
      model: provider?.model,
      endpoint,
      elapsedMs: Date.now() - startedAt,
    });
    if (isAbortError(error)) {
      if (!timeout.didTimeout() && options.abortMessage) {
        throw new Error(options.abortMessage);
      }
      throw new Error("图片生成超时，请检查 Base URL、网络或供应商状态。");
    }
    throw error;
  } finally {
    timeout.clear();
  }
}

async function listProviderModels(provider, options = {}) {
  if (!provider?.baseUrl || !provider?.apiKey) {
    throw new Error("请先填写 Base URL 和 API Key。");
  }

  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 20_000);
  const endpoint = buildProviderModelsEndpoint(provider.baseUrl);
  const providerProfile = getProviderProfile(provider);
  logAi("models:start", {
    providerName: provider.name,
    endpoint,
    providerProfile,
  });

  try {
    const response = await fetch(endpoint, {
      method: "GET",
      headers: buildProviderHeaders(provider),
      signal: controller.signal,
    });
    const responseText = await response.text();
    if (!response.ok) {
      logAi("models:httpError", {
        providerName: provider.name,
        endpoint,
        status: response.status,
        elapsedMs: Date.now() - startedAt,
        responsePreview: responseText.slice(0, 500),
      }, "warn");
      throw new Error(`读取模型列表失败：${response.status} ${formatProviderError(responseText, endpoint)}`);
    }

    let parsed;
    try {
      parsed = JSON.parse(responseText);
    } catch {
      throw new Error(`模型列表接口没有返回 JSON。请检查 Base URL。当前请求：${endpoint}`);
    }

    const ids = Array.isArray(parsed?.data)
      ? parsed.data
          .map((item) => String(item?.id || "").trim())
          .filter(Boolean)
      : [];

    if (!ids.length) {
      throw new Error("模型列表接口返回成功，但没有可用模型。");
    }

    const models = [...new Set(ids)].sort((a, b) => a.localeCompare(b));
    logAi("models:done", {
      providerName: provider.name,
      endpoint,
      modelCount: models.length,
      elapsedMs: Date.now() - startedAt,
    });
    return models;
  } catch (error) {
    logError("ai:models:error", error, {
      providerName: provider?.name,
      endpoint,
      elapsedMs: Date.now() - startedAt,
    });
    if (error.name === "AbortError") {
      throw new Error("读取模型列表超时，请检查 Base URL、网络或供应商状态。");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function getProviderProfile(provider) {
  const source = `${provider?.name || ""} ${provider?.baseUrl || ""} ${provider?.model || ""}`;
  if (/xiaomimimo|mimo-v2|mimo-v/i.test(source)) return "mimo";
  return "openai-compatible";
}

function buildProviderHeaders(provider) {
  const headers = {
    "Content-Type": "application/json",
  };
  if (getProviderProfile(provider) === "mimo") {
    headers["api-key"] = provider.apiKey;
  } else {
    headers.Authorization = `Bearer ${provider.apiKey}`;
  }
  return headers;
}

function buildProviderRequestBody(provider, messages, options = {}) {
  const apiMode = provider.apiMode ?? "chatCompletions";
  const providerProfile = getProviderProfile(provider);

  if (apiMode === "responses") {
    return {
      model: provider.model,
      input: messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
      temperature: options.temperature ?? 0.2,
      ...(options.stream ? { stream: true } : {}),
      ...(options.maxTokens ? { max_output_tokens: options.maxTokens } : {}),
    };
  }

  if (providerProfile === "mimo") {
    return {
      model: provider.model,
      messages,
      temperature: options.temperature ?? 0.7,
      top_p: options.topP ?? 0.95,
      stream: options.stream === true,
      stop: null,
      frequency_penalty: 0,
      presence_penalty: 0,
      thinking: { type: "disabled" },
      ...(options.maxTokens ? { max_completion_tokens: options.maxTokens } : {}),
    };
  }

  return {
    model: provider.model,
    messages,
    temperature: options.temperature ?? 0.2,
    ...(options.stream ? { stream: true } : {}),
    ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
  };
}

function formatProviderError(responseText, endpoint) {
  const trimmed = responseText.trim();
  if (trimmed.startsWith("<")) {
    return `供应商返回了 HTML 页面，通常是 Base URL 或接口类型不匹配。当前请求：${endpoint}`;
  }
  return trimmed.slice(0, 500);
}

function extractModelText(data, apiMode) {
  if (apiMode === "responses") {
    if (typeof data.output_text === "string") return data.output_text;
    const parts = [];
    for (const item of data.output ?? []) {
      for (const content of item.content ?? []) {
        if (typeof content.text === "string") parts.push(content.text);
      }
    }
    return parts.join("\n");
  }

  return data.choices?.[0]?.message?.content ?? "";
}

function extractStreamText(data, apiMode) {
  if (apiMode === "responses") {
    if (typeof data.delta === "string") return data.delta;
    if (data.type === "response.output_text.delta" && typeof data.delta === "string") return data.delta;
    if (data.type === "response.output_item.done") return extractModelText(data.item ?? {}, "responses");
    return "";
  }

  return data.choices?.[0]?.delta?.content ?? "";
}

async function requestChatCompletionStream(provider, messages, onChunk, options = {}) {
  if (!provider?.baseUrl || !provider?.apiKey || !provider?.model) {
    throw new Error("供应商配置不完整。");
  }
  if (provider.apiMode === "imageGenerations") {
    throw new Error("当前供应商配置为图片生成接口，请使用图片生成请求。");
  }

  const startedAt = Date.now();
  const controller = options.controller ?? new AbortController();
  const timeout = createOptionalAbortTimeout(controller, options.timeoutMs);
  const apiMode = provider.apiMode ?? "chatCompletions";
  const endpoint = buildProviderEndpoint(provider.baseUrl, apiMode);
  const providerProfile = getProviderProfile(provider);
  let chunkCount = 0;
  logAi("stream:start", {
    providerName: provider.name,
    model: provider.model,
    apiMode,
    endpoint,
    providerProfile,
    messageCount: Array.isArray(messages) ? messages.length : 0,
    stream: true,
  });
  const body = buildProviderRequestBody(provider, messages, {
    ...options,
    stream: true,
  });

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        ...buildProviderHeaders(provider),
        Accept: "text/event-stream",
      },
      signal: controller.signal,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logAi("stream:httpError", {
        providerName: provider.name,
        model: provider.model,
        apiMode,
        endpoint,
        status: response.status,
        elapsedMs: Date.now() - startedAt,
        responsePreview: errorText.slice(0, 500),
      }, "warn");
      throw new Error(`模型请求失败：${response.status} ${formatProviderError(errorText, endpoint)}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("供应商没有返回可读取的流。");

    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() ?? "";
      for (const event of events) {
        for (const line of event.split(/\r?\n/)) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const parsed = JSON.parse(payload);
            const text = extractStreamText(parsed, apiMode);
            if (text) {
              chunkCount += 1;
              onChunk(text);
            }
          } catch {
            // Ignore malformed keepalive/event payloads.
          }
        }
      }
    }
    logAi("stream:done", {
      providerName: provider.name,
      model: provider.model,
      apiMode,
      endpoint,
      elapsedMs: Date.now() - startedAt,
      chunkCount,
    });
  } catch (error) {
    logError("ai:stream:error", error, {
      providerName: provider.name,
      model: provider.model,
      apiMode,
      endpoint,
      elapsedMs: Date.now() - startedAt,
      chunkCount,
    });
    if (error.name === "AbortError") {
      if (!timeout.didTimeout() && options.abortMessage) {
        throw new Error(options.abortMessage);
      }
      throw new Error("模型请求超时，请检查 Base URL、网络或供应商状态。");
    }
    throw error;
  } finally {
    timeout.clear();
  }
}

function createAiService(loggers = {}) {
  logAi = loggers.logAi || logAi;
  logError = loggers.logError || logError;
  return {
    listProviderModels,
    requestImageGeneration,
    requestChatCompletion,
    requestChatCompletionStream,
    extractModelText,
  };
}

module.exports = { createAiService };
