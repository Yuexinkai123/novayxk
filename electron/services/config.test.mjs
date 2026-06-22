import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { createConfigService } = require("./config.cjs");

const tempDirs = [];

function createSafeStorageMock() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (value) => Buffer.from(`enc:${value}`, "utf8"),
    decryptString: (buffer) => {
      const text = Buffer.from(buffer).toString("utf8");
      return text.startsWith("enc:") ? text.slice(4) : "";
    },
  };
}

async function createTempConfigService() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "novayxk-config-test-"));
  tempDirs.push(tempDir);
  const configDir = path.join(tempDir, "config");
  const configFile = path.join(configDir, "providers.json");
  const service = createConfigService({
    configDir,
    configFile,
    logApp: () => {},
    safeStorage: createSafeStorageMock(),
  });
  return { tempDir, configFile, service };
}

afterEach(async () => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

describe("config service secure storage", () => {
  it("stores api keys encrypted on disk and returns decrypted config", async () => {
    const { configFile, service } = await createTempConfigService();

    await service.writeConfig({
      providers: [
        {
          id: "provider-1",
          name: "OpenAI",
          baseUrl: "https://api.openai.com/v1",
          apiKey: "sk-secret",
          model: "gpt-4.1-mini",
          apiMode: "chatCompletions",
        },
      ],
      activeProviderId: "provider-1",
      lastProjectRoot: "D:/repo",
      theme: "dark",
      aiControlMode: "safe",
      assistantMode: "low",
      hasSeenWelcome: true,
      hasSeenWorkspaceGuide: true,
      workspaceLayout: {
        leftPanelWidth: 302,
        rightPanelWidth: 688,
        bottomPanelHeight: 260,
        isLeftCollapsed: false,
        isRightCollapsed: false,
        isBottomCollapsed: true,
      },
      pendingAdminResume: {
        action: "run-command",
        source: "ai",
        command: "winget uninstall --id Example.App",
        controlMode: "full",
        taskId: "task-12345678",
        projectRoot: "D:/repo",
        createdAt: "2026-06-02T12:00:00.000Z",
        messages: [
          { role: "user", content: "卸载示例应用" },
          { role: "assistant", content: "我先帮你卸载。" },
        ],
      },
    });

    const raw = JSON.parse(await fs.readFile(configFile, "utf8"));
    expect(raw.providers[0].apiKey).toBeUndefined();
    expect(raw.providers[0].apiKeyEncrypted).toBeTruthy();
    expect(raw.providers[0].apiKeyStorage).toBe("safeStorage");

    const config = await service.readConfig();
    expect(config.providers[0].apiKey).toBe("sk-secret");
    expect(config.assistantMode).toBe("low");
    expect(config.hasSeenWelcome).toBe(true);
    expect(config.hasSeenWorkspaceGuide).toBe(true);
    expect(config.workspaceLayout?.rightPanelWidth).toBe(688);
    expect(config.workspaceLayout?.isBottomCollapsed).toBe(true);
    expect(config.pendingAdminResume?.command).toBe("winget uninstall --id Example.App");
    expect(config.pendingAdminResume?.messages?.[0]?.content).toBe("卸载示例应用");
  });

  it("migrates plaintext api keys to encrypted storage when reading", async () => {
    const { configFile, service } = await createTempConfigService();

    await fs.mkdir(path.dirname(configFile), { recursive: true });
    await fs.writeFile(
      configFile,
      JSON.stringify({
        providers: [
          {
            id: "provider-legacy",
            name: "Legacy",
            baseUrl: "https://example.com/v1",
            apiKey: "legacy-secret",
            model: "legacy-model",
            apiMode: "chatCompletions",
          },
        ],
        activeProviderId: "provider-legacy",
        theme: "dark",
        aiControlMode: "safe",
      }),
      "utf8",
    );

    const config = await service.readConfig();
    expect(config.providers[0].apiKey).toBe("legacy-secret");

    const migrated = JSON.parse(await fs.readFile(configFile, "utf8"));
    expect(migrated.providers[0].apiKey).toBeUndefined();
    expect(migrated.providers[0].apiKeyEncrypted).toBeTruthy();
  });

  it("preserves image generation provider mode", async () => {
    const { service } = await createTempConfigService();

    await service.writeConfig({
      providers: [
        {
          id: "provider-image",
          name: "OpenAI Images",
          baseUrl: "https://api.openai.com/v1",
          apiKey: "sk-secret",
          model: "gpt-image-1",
          apiMode: "imageGenerations",
        },
      ],
      activeProviderId: "provider-image",
    });

    const config = await service.readConfig();
    expect(config.providers[0].apiMode).toBe("imageGenerations");
  });

  it("migrates obvious image models away from chat completions mode", async () => {
    const { configFile, service } = await createTempConfigService();

    await fs.mkdir(path.dirname(configFile), { recursive: true });
    await fs.writeFile(
      configFile,
      JSON.stringify({
        providers: [
          {
            id: "provider-image-legacy",
            name: "Legacy Images",
            baseUrl: "https://api.openai.com/v1",
            apiKey: "sk-secret",
            model: "gpt-image-1",
            apiMode: "chatCompletions",
          },
        ],
        activeProviderId: "provider-image-legacy",
      }),
      "utf8",
    );

    const config = await service.readConfig();
    expect(config.providers[0].apiMode).toBe("imageGenerations");
  });
});
