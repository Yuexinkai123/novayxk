const childProcess = require("node:child_process");
const { isAbortError } = require("./http.cjs");

const SEARCH_ENDPOINT = "https://lite.duckduckgo.com/lite/";
const SEARCH_TIMEOUT_MS = 18_000;
const PAGE_FETCH_TIMEOUT_MS = 12_000;
const SEARCH_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/137.0.0.0 Safari/537.36";
const DEFAULT_MAX_RESULTS = 5;
const MAX_RESULTS = 8;
const DEFAULT_PAGE_FETCH_COUNT = 2;
const MAX_PAGE_FETCH_COUNT = 3;

function createWebSearchService({ logApp = () => {}, logError = () => {} } = {}) {
  async function search(request = {}) {
    const query = String(request?.query || "").trim();
    if (!query) {
      throw new Error("The web search query cannot be empty.");
    }

    const domains = normalizeDomains(request?.domains);
    const maxResults = clampInteger(request?.maxResults, 1, MAX_RESULTS, DEFAULT_MAX_RESULTS);
    const includePageContent = request?.includePageContent !== false;
    const includePageContentCount = includePageContent
      ? clampInteger(
          request?.includePageContentCount,
          0,
          Math.min(MAX_PAGE_FETCH_COUNT, maxResults),
          Math.min(DEFAULT_PAGE_FETCH_COUNT, maxResults),
        )
      : 0;

    const startedAt = Date.now();
    try {
      const html = await fetchSearchHtml(query);
      const parsedResults = parseDuckDuckGoLiteResults(html);
      let filteredResults = domains.length
        ? parsedResults.filter((result) => matchesAnyDomain(result.url, domains) || matchesAnyDomain(result.displayedUrl, domains))
        : parsedResults;
      if (!filteredResults.length && domains.length) {
        filteredResults = await searchDomainSitemaps(query, domains, maxResults);
      }
      const selectedResults = dedupeSearchResults(filteredResults).slice(0, maxResults);
      const warnings = [];
      if (!selectedResults.length) {
        warnings.push(
          domains.length
            ? `No search results matched the requested domains: ${domains.join(", ")}.`
            : "The built-in web search did not find any usable results.",
        );
      }

      if (includePageContentCount > 0) {
        for (const result of selectedResults.slice(0, includePageContentCount)) {
          try {
            const page = await fetchPagePreview(result.url);
            result.pageTitle = page.pageTitle;
            result.pageDescription = page.pageDescription;
            result.pageExcerpt = page.pageExcerpt;
          } catch (error) {
            result.pageError = error instanceof Error ? error.message : "Failed to fetch the page.";
          }
        }
      }

      const response = {
        query,
        engine: "bing",
        searchedAt: new Date().toISOString(),
        resultCount: selectedResults.length,
        pageFetchCount: selectedResults.filter((result) => result.pageTitle || result.pageDescription || result.pageExcerpt).length,
        ...(warnings.length ? { warnings } : {}),
        results: selectedResults,
      };

      logApp("web:search", {
        query: query.slice(0, 500),
        domains,
        resultCount: response.resultCount,
        pageFetchCount: response.pageFetchCount,
        elapsedMs: Date.now() - startedAt,
      });
      return response;
    } catch (error) {
      logError("web:search:error", error, {
        query: query.slice(0, 500),
        domains,
        elapsedMs: Date.now() - startedAt,
      });
      throw error;
    }
  }

  return {
    search,
  };
}

async function fetchSearchHtml(query) {
  const url = `${SEARCH_ENDPOINT}?q=${encodeURIComponent(query)}&kl=wt-wt`;
  const response = await fetchTextWithTimeout(url, SEARCH_TIMEOUT_MS);
  if (response.status < 200 || response.status >= 300) {
    throw new Error(`The search engine returned ${response.status}.`);
  }
  return response.text;
}

async function fetchPagePreview(url) {
  const response = await fetchTextWithTimeout(url, PAGE_FETCH_TIMEOUT_MS);
  const contentType = String(response.contentType || "").toLowerCase();
  const text = response.text;
  if (!/(text\/html|application\/xhtml\+xml|text\/plain)/i.test(contentType || "text/html")) {
    throw new Error(`Unsupported page content type: ${contentType || "unknown"}.`);
  }

  if (/text\/plain/i.test(contentType)) {
    return {
      pageTitle: "",
      pageDescription: "",
      pageExcerpt: truncateText(collapseWhitespace(text), 1400),
    };
  }

  return {
    pageTitle: extractHtmlTitle(text),
    pageDescription: extractHtmlDescription(text),
    pageExcerpt: extractPageExcerpt(text),
  };
}

async function fetchTextWithTimeout(url, timeoutMs) {
  if (process.platform === "win32") {
    return fetchTextWithPowerShell(url, timeoutMs);
  }
  return fetchTextWithFetch(url, timeoutMs);
}

async function fetchTextWithFetch(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      headers: {
        "accept-language": "en-US,en;q=0.9",
        "user-agent": SEARCH_USER_AGENT,
      },
      redirect: "follow",
    });
    const text = await response.text();
    return {
      status: response.status,
      text,
      contentType: response.headers.get("content-type") || "",
    };
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error("The request timed out.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function fetchTextWithPowerShell(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const command = [
      "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
      "$ProgressPreference = 'SilentlyContinue'",
      "$status = 0",
      "$contentType = ''",
      "$text = ''",
      "try {",
      `  $response = Invoke-WebRequest -UseBasicParsing -Uri '${escapePowerShellSingleQuotedString(url)}'`,
      "  $status = [int]$response.StatusCode",
      "  $contentType = [string]$response.Headers['Content-Type']",
      "  $text = [string]$response.Content",
      "} catch {",
      "  $webResponse = $_.Exception.Response",
      "  if (-not $webResponse) { throw }",
      "  $status = [int]$webResponse.StatusCode",
      "  $contentType = [string]$webResponse.Headers['Content-Type']",
      "  $reader = New-Object System.IO.StreamReader($webResponse.GetResponseStream(), [System.Text.Encoding]::UTF8)",
      "  try { $text = $reader.ReadToEnd() } finally { $reader.Close() }",
      "}",
      "$payload = @{ status = $status; contentType = $contentType; text = $text } | ConvertTo-Json -Compress -Depth 4",
      "[Console]::Write($payload)",
    ].join("; ");

    childProcess.execFile(
      "powershell.exe",
      ["-NoLogo", "-NoProfile", "-Command", command],
      {
        windowsHide: true,
        timeout: timeoutMs,
        maxBuffer: 12 * 1024 * 1024,
        encoding: "utf8",
      },
      (error, stdout, stderr) => {
        if (error) {
          if (error.killed || error.signal === "SIGTERM" || /timed out/i.test(String(error.message || ""))) {
            reject(new Error("The request timed out."));
            return;
          }
          reject(new Error(String(stderr || error.message || "PowerShell web request failed.")));
          return;
        }
        try {
          const parsed = JSON.parse(String(stdout || "{}"));
          resolve({
            status: Number(parsed?.status || 0),
            text: String(parsed?.text || ""),
            contentType: String(parsed?.contentType || ""),
          });
        } catch {
          reject(new Error("Failed to parse the PowerShell web response."));
        }
      },
    );
  });
}

function parseDuckDuckGoLiteResults(html) {
  const results = [];
  const linkMatches = [...String(html || "").matchAll(/<a[^>]+class=['"]result-link['"][^>]+href=['"]([^'"]+)['"][^>]*>([\s\S]*?)<\/a>/gi)];

  for (let index = 0; index < linkMatches.length; index += 1) {
    const match = linkMatches[index];
    const currentIndex = match.index ?? 0;
    const nextIndex = linkMatches[index + 1]?.index ?? html.length;
    const chunk = html.slice(currentIndex, nextIndex);
    const url = extractDuckDuckGoTarget(match[1] || "");
    if (!url) continue;

    const title = collapseWhitespace(stripTags(decodeHtmlEntities(match[2] || "")));
    const snippet = collapseWhitespace(stripTags(decodeHtmlEntities(matchChunk(chunk, /<td class=['"]result-snippet['"]>([\s\S]*?)<\/td>/i))));
    const displayedUrl = collapseWhitespace(stripTags(decodeHtmlEntities(matchChunk(chunk, /<span class=['"]link-text['"]>([\s\S]*?)<\/span>/i))));
    const publishedAt = collapseWhitespace(stripTags(decodeHtmlEntities(matchChunk(chunk, /<span class=['"]timestamp['"]>([\s\S]*?)<\/span>/i))));
    const host = getHostname(url) || getHostname(displayedUrl) || "";
    if (!title || !host) continue;

    results.push({
      title,
      url,
      host,
      snippet,
      ...(displayedUrl ? { displayedUrl } : {}),
      ...(publishedAt ? { publishedAt } : {}),
    });
  }

  return results;
}

function matchChunk(value, pattern) {
  const match = String(value || "").match(pattern);
  return match?.[1] || "";
}

function dedupeSearchResults(results) {
  const seen = new Set();
  const output = [];
  for (const result of results) {
    const key = `${result.url}::${result.title}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    output.push(result);
  }
  return output;
}

async function searchDomainSitemaps(query, domains, maxResults) {
  const candidates = [];
  for (const domain of domains.slice(0, 3)) {
    const queryTokens = buildQueryTokens(query).filter((token) => !domain.toLowerCase().includes(token));
    try {
      const sitemapUrl = `https://${domain}/sitemap.xml`;
      const sitemapResponse = await fetchTextWithTimeout(sitemapUrl, SEARCH_TIMEOUT_MS);
      if (sitemapResponse.status < 200 || sitemapResponse.status >= 300) continue;
      const locs = extractXmlLocs(sitemapResponse.text);
      if (!locs.length) continue;

      const pageUrls = /<sitemapindex\b/i.test(sitemapResponse.text)
        ? await collectNestedSitemapUrls(locs, queryTokens)
        : locs;
      const scored = pageUrls
        .map((url) => ({
          url,
          score: scoreUrlForQuery(url, queryTokens),
        }))
        .filter((item) => item.score > 0)
        .sort((left, right) => right.score - left.score)
        .slice(0, Math.max(4, maxResults * 2));

      for (const item of scored) {
        candidates.push({
          title: titleFromUrl(item.url),
          url: item.url,
          host: getHostname(item.url) || domain,
          snippet: `Matched from ${domain} sitemap.`,
          displayedUrl: item.url,
        });
      }
    } catch {
      // Sitemap fallback is best-effort.
    }
  }
  return dedupeSearchResults(candidates).slice(0, maxResults);
}

async function collectNestedSitemapUrls(sitemapUrls, queryTokens) {
  const candidates = [];
  const rankedSitemaps = [...sitemapUrls]
    .map((url) => ({ url, score: scoreSitemapUrlForQuery(url, queryTokens) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 8)
    .map((item) => item.url);

  const settled = await Promise.allSettled(
    rankedSitemaps.map(async (sitemapUrl) => {
      const response = await fetchTextWithTimeout(sitemapUrl, Math.min(SEARCH_TIMEOUT_MS, 8_000));
      if (response.status < 200 || response.status >= 300) return [];
      return extractXmlLocs(response.text)
        .map((url) => ({
          url,
          score: scoreUrlForQuery(url, queryTokens),
        }))
        .filter((item) => item.score > 0);
    }),
  );

  for (const item of settled) {
    if (item.status !== "fulfilled") continue;
    candidates.push(...item.value);
  }

  return candidates
    .sort((left, right) => right.score - left.score)
    .map((item) => item.url);
}

function extractXmlLocs(xml) {
  return [...String(xml || "").matchAll(/<loc>([\s\S]*?)<\/loc>/gi)]
    .map((match) => collapseWhitespace(decodeHtmlEntities(match[1] || "")))
    .map((value) => normalizeHttpUrl(value))
    .filter(Boolean);
}

function buildQueryTokens(query) {
  const compact = String(query || "").toLowerCase();
  return compact
    .split(/[^a-z0-9]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 || /^\d+$/.test(token));
}

function scoreUrlForQuery(url, queryTokens) {
  const normalizedUrl = String(url || "").toLowerCase();
  if (!normalizedUrl) return 0;
  let score = 0;
  for (let start = 0; start < queryTokens.length; start += 1) {
    for (let length = Math.min(3, queryTokens.length - start); length >= 2; length -= 1) {
      const phrase = queryTokens.slice(start, start + length).join("-");
      if (phrase && normalizedUrl.includes(phrase)) {
        score += length === 3 ? 12 : 6;
      }
    }
  }
  for (const token of queryTokens) {
    if (normalizedUrl.includes(token)) {
      score += token.length >= 4 ? 2 : 1;
    }
  }
  return score;
}

function titleFromUrl(url) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const slug = parts.at(-1) || parsed.hostname;
    return slug
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (value) => value.toUpperCase())
      .trim();
  } catch {
    return url;
  }
}

function scoreSitemapUrlForQuery(sitemapUrl, queryTokens) {
  const value = String(sitemapUrl || "").toLowerCase();
  let score = 1;
  const containsModelLikeToken = queryTokens.some((token) => /^(gpt|model|chatgpt|api|release|launch|introducing)$/.test(token));
  if (containsModelLikeToken) {
    if (/(?:\/product\/|\/release\/|\/chatgpt\/|\/api\/|\/page\/|\/research\/)/i.test(value)) {
      score += 6;
    }
  }
  for (const token of queryTokens) {
    if (value.includes(token)) {
      score += token.length >= 4 ? 3 : 1;
    }
  }
  return score;
}

function extractDuckDuckGoTarget(rawHref) {
  const value = String(rawHref || "").trim();
  if (!value) return "";
  try {
    const normalized = value.startsWith("//") ? `https:${value}` : value;
    const parsed = new URL(normalized, SEARCH_ENDPOINT);
    const redirectTarget = parsed.searchParams.get("uddg");
    const target = redirectTarget ? decodeURIComponent(redirectTarget) : normalized;
    return normalizeHttpUrl(target);
  } catch {
    return normalizeHttpUrl(value);
  }
}

function normalizeHttpUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  try {
    const parsed = new URL(text.startsWith("//") ? `https:${text}` : text);
    if (!/^https?:$/i.test(parsed.protocol)) return "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function getHostname(value) {
  const text = normalizeHttpUrl(value);
  if (!text) return "";
  try {
    return new URL(text).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function normalizeDomains(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => String(entry || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, ""))
    .filter(Boolean)
    .slice(0, 8);
}

function matchesAnyDomain(value, domains) {
  const host = getHostname(value).replace(/^www\./, "");
  if (!host) return false;
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function extractHtmlTitle(html) {
  return truncateText(collapseWhitespace(stripTags(decodeHtmlEntities(matchChunk(html, /<title[^>]*>([\s\S]*?)<\/title>/i)))), 240);
}

function extractHtmlDescription(html) {
  const patterns = [
    /<meta[^>]+name=['"]description['"][^>]+content=['"]([\s\S]*?)['"][^>]*>/i,
    /<meta[^>]+content=['"]([\s\S]*?)['"][^>]+name=['"]description['"][^>]*>/i,
    /<meta[^>]+property=['"]og:description['"][^>]+content=['"]([\s\S]*?)['"][^>]*>/i,
    /<meta[^>]+content=['"]([\s\S]*?)['"][^>]+property=['"]og:description['"][^>]*>/i,
  ];
  const description = patterns.map((pattern) => matchChunk(html, pattern)).find(Boolean) || "";
  return truncateText(collapseWhitespace(stripTags(decodeHtmlEntities(description))), 420);
}

function extractPageExcerpt(html) {
  const withoutScripts = String(html || "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ");
  const articleSection =
    matchChunk(withoutScripts, /<main\b[^>]*>([\s\S]*?)<\/main>/i) ||
    matchChunk(withoutScripts, /<article\b[^>]*>([\s\S]*?)<\/article>/i);
  const bodySource = articleSection || matchChunk(withoutScripts, /<body\b[^>]*>([\s\S]*?)<\/body>/i) || withoutScripts;
  return truncateText(collapseWhitespace(stripTags(decodeHtmlEntities(bodySource))), 1400);
}

function decodeHtmlEntities(value) {
  return String(value || "")
    .replace(/&#(\d+);/g, (_match, code) => safeCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_match, code) => safeCodePoint(Number.parseInt(code, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

function safeCodePoint(value) {
  try {
    return String.fromCodePoint(value);
  } catch {
    return "";
  }
}

function stripTags(value) {
  return String(value || "").replace(/<[^>]+>/g, " ");
}

function collapseWhitespace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function truncateText(value, limit) {
  const text = String(value || "").trim();
  if (!text || !Number.isFinite(limit) || limit <= 0) return text;
  return text.length > limit ? `${text.slice(0, limit - 3).trimEnd()}...` : text;
}

function clampInteger(value, min, max, fallback) {
  const numeric = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, numeric));
}

function escapePowerShellSingleQuotedString(value) {
  return String(value || "").replace(/'/g, "''");
}

module.exports = {
  createWebSearchService,
};
