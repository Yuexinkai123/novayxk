const http = require("node:http");
const https = require("node:https");

const DEFAULT_MAX_REDIRECTS = 5;
const REDIRECT_STATUS_CODES = new Set([301, 302, 303, 307, 308]);

function createAbortError() {
  const error = new Error("This operation was aborted");
  error.name = "AbortError";
  error.code = "ABORT_ERR";
  return error;
}

function isAbortError(error) {
  return error?.name === "AbortError" || error?.code === "ABORT_ERR";
}

function normalizeHeaders(headers = {}) {
  const normalized = {};
  for (const [key, value] of Object.entries(headers || {})) {
    if (value === undefined || value === null) continue;
    normalized[key] = String(value);
  }
  return normalized;
}

function findHeaderKey(headers, name) {
  const target = name.toLowerCase();
  return Object.keys(headers || {}).find((key) => key.toLowerCase() === target);
}

function getHeaderValue(headers, name) {
  const key = findHeaderKey(headers, name);
  if (!key) return "";
  const value = headers[key];
  if (Array.isArray(value)) return value.join(", ");
  return value === undefined || value === null ? "" : String(value);
}

function removeHeader(headers, name) {
  const key = findHeaderKey(headers, name);
  if (key) delete headers[key];
}

function toBodyBuffer(body) {
  if (body === undefined || body === null) return null;
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  return Buffer.from(String(body), "utf8");
}

function buildRedirectOptions(options, status, method) {
  const nextOptions = {
    ...options,
    headers: normalizeHeaders(options.headers),
  };
  if (status === 303 || ((status === 301 || status === 302) && method !== "GET" && method !== "HEAD")) {
    nextOptions.method = "GET";
    delete nextOptions.body;
    removeHeader(nextOptions.headers, "content-length");
    removeHeader(nextOptions.headers, "content-type");
  }
  return nextOptions;
}

function requestBuffer(urlString, options = {}, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (options.signal?.aborted) {
      reject(createAbortError());
      return;
    }

    let parsed;
    try {
      parsed = new URL(urlString);
    } catch {
      reject(new Error(`Invalid URL: ${urlString}`));
      return;
    }

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      reject(new Error(`Only HTTP/HTTPS URLs are supported: ${urlString}`));
      return;
    }

    const bodyBuffer = toBodyBuffer(options.body);
    const method = String(options.method || (bodyBuffer ? "POST" : "GET")).toUpperCase();
    const headers = normalizeHeaders(options.headers);
    if (bodyBuffer && !findHeaderKey(headers, "content-length")) {
      headers["Content-Length"] = String(bodyBuffer.length);
    }

    const maxBytes = Number.isFinite(options.maxBytes) && options.maxBytes > 0 ? options.maxBytes : Infinity;
    const maxRedirects = Number.isFinite(options.maxRedirects) ? options.maxRedirects : DEFAULT_MAX_REDIRECTS;
    const transport = parsed.protocol === "https:" ? https : http;
    let settled = false;

    function settle(fn, value) {
      if (settled) return;
      settled = true;
      fn(value);
    }

    const req = transport.request(parsed, { method, headers, signal: options.signal }, (res) => {
      const status = Number(res.statusCode || 0);
      const location = getHeaderValue(res.headers, "location");

      if (REDIRECT_STATUS_CODES.has(status) && location && redirectCount < maxRedirects) {
        res.resume();
        const nextUrl = new URL(location, parsed).toString();
        const nextOptions = buildRedirectOptions(options, status, method);
        requestBuffer(nextUrl, nextOptions, redirectCount + 1).then(
          (value) => settle(resolve, value),
          (error) => settle(reject, error),
        );
        return;
      }

      const chunks = [];
      let receivedBytes = 0;

      res.on("data", (chunk) => {
        receivedBytes += chunk.length;
        if (receivedBytes > maxBytes) {
          const error = new Error(`Response body is too large and exceeds ${maxBytes} bytes.`);
          settle(reject, error);
          req.destroy(error);
          res.destroy(error);
          return;
        }
        chunks.push(chunk);
      });

      res.on("end", () => {
        settle(resolve, {
          ok: status >= 200 && status < 300,
          status,
          statusText: res.statusMessage || "",
          headers: res.headers,
          body: Buffer.concat(chunks),
        });
      });
      res.on("error", (error) => settle(reject, error));
    });

    req.on("error", (error) => {
      if (options.signal?.aborted && !isAbortError(error)) {
        settle(reject, createAbortError());
        return;
      }
      settle(reject, error);
    });

    if (bodyBuffer) req.write(bodyBuffer);
    req.end();
  });
}

async function requestText(urlString, options = {}) {
  const response = await requestBuffer(urlString, options);
  return {
    ...response,
    text: response.body.toString(options.encoding || "utf8"),
    getHeader: (name) => getHeaderValue(response.headers, name),
  };
}

module.exports = {
  getHeaderValue,
  isAbortError,
  requestBuffer,
  requestText,
};
