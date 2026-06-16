import http from "node:http";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { isAbortError, requestBuffer, requestText } = require("./http.cjs");

const servers = [];

async function createTestServer(handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  const address = server.address();
  return `http://127.0.0.1:${address.port}`;
}

function readRequestBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

afterEach(async () => {
  while (servers.length) {
    const server = servers.pop();
    await new Promise((resolve) => server.close(resolve));
  }
});

describe("long HTTP helper", () => {
  it("posts JSON and reads the text response", async () => {
    const baseUrl = await createTestServer(async (req, res) => {
      const body = JSON.parse(await readRequestBody(req));
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ data: [{ b64_json: Buffer.from(body.prompt).toString("base64") }] }));
    });

    const response = await requestText(`${baseUrl}/v1/images/generations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt: "makima photo" }),
      maxBytes: 4096,
    });

    expect(response.ok).toBe(true);
    expect(JSON.parse(response.text).data[0].b64_json).toBe(Buffer.from("makima photo").toString("base64"));
  });

  it("reports application aborts as AbortError", async () => {
    const baseUrl = await createTestServer(() => {});
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 10);

    let error;
    try {
      await requestBuffer(baseUrl, { signal: controller.signal });
    } catch (caught) {
      error = caught;
    }

    expect(isAbortError(error)).toBe(true);
  });
});
