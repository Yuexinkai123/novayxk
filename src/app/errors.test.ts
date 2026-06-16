import { describe, expect, it } from "vitest";
import { formatActionableError, getDesktopBridgeUnavailableMessage } from "./errors";

describe("formatActionableError", () => {
  it("turns bridge-missing errors into a restart hint", () => {
    const message = formatActionableError(
      new Error(getDesktopBridgeUnavailableMessage("保存文件")),
      "保存文件失败",
    );

    expect(message).toContain("桌面桥接");
    expect(message).toContain("重新打开");
  });

  it("turns network failures into a concrete retry suggestion", () => {
    const message = formatActionableError(new Error("ECONNRESET while testing provider"), "连接测试失败");

    expect(message).toContain("网络连接没有成功");
    expect(message).toContain("Base URL");
  });

  it("keeps image generation timeout errors explicit", () => {
    const message = formatActionableError(new Error("图片生成超时，请检查 Base URL、网络或供应商状态。"), "图片生成失败");

    expect(message).toContain("图片生成超时");
    expect(message).not.toContain("网络连接没有成功");
  });

  it("turns cancelled UAC prompts into a clear next step", () => {
    const message = formatActionableError(
      new Error("管理员模式没有启动，因为 Windows UAC 授权被取消了。请重新点击“管理员模式”，并在弹窗里选择“是”。"),
      "切换管理员模式失败",
    );

    expect(message).toContain("取消了 Windows UAC 授权");
    expect(message).toContain("重新点击");
  });
});
