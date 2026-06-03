# Novayxk

Novayxk 是一个 Windows 本地 AI 项目工作台。它可以配置 OpenAI-compatible 模型供应商，打开本地代码项目，读取文件作为上下文，向模型提问，并在你的电脑上协助完成代码修改、项目命令执行、环境排查和必要的系统级操作。

## 当前功能

- 模型供应商配置：`Base URL`、`API Key`、`Model`
- 供应商连接测试：在设置页验证 `Base URL`、`API Key` 和 `Model`
- 支持 Chat Completions 和 Responses API 两种接口类型
- 打开本地项目并展示文件树
- 读取非敏感文件内容作为 AI 上下文
- 聊天式代码分析与补丁生成
- 聊天支持流式输出，`Enter` 发送，`Shift+Enter` 换行
- 三层记忆：全局供应商配置、项目长期记忆、项目内多份任务历史
- AI PowerShell 控制：项目内执行用于开发任务，系统级执行可处理高风险命令
- 联网资料核验：模型可以通过 `Invoke-WebRequest`、`Invoke-RestMethod`、`curl` 等 PowerShell 命令检索网页，并基于可靠来源总结结论
- 软件安装卸载：模型可以优先使用 `winget`、`choco`、`scoop`、`msiexec` 等工具搜索、安装、卸载或升级软件
- 模型可通过 `fileops` 代码块请求创建目录或写入文件，并由 Novayxk 在当前项目内自动尝试执行
- 自动抽取模型返回的 `diff` / `patch` 代码块
- 确认后应用 unified diff 补丁，并支持撤销上一次补丁
- 在项目根目录执行命令，并在底部“终端任务”面板实时显示 Novayxk 执行的所有命令输出
- 默认单实例运行：重复启动 Novayxk 会聚焦已有窗口，避免多个窗口争用项目和终端任务
- 执行命令前确认，并拦截递归强删、系统修改、远程脚本直执行等危险命令
- 默认拦截 `.env`、密钥、证书等敏感文件

## 本地配置

Novayxk 的用户配置放在用户主目录下：

```text
C:\Users\你的用户名\.novayxk
```

当前会写入：

```text
C:\Users\你的用户名\.novayxk\config\providers.json
C:\Users\你的用户名\.novayxk\projects\<项目ID>\memory.md
C:\Users\你的用户名\.novayxk\projects\<项目ID>\tasks\<任务ID>.json
C:\Users\你的用户名\.novayxk\logs\app.log
C:\Users\你的用户名\.novayxk\logs\error.log
C:\Users\你的用户名\.novayxk\logs\ai.log
C:\Users\你的用户名\.novayxk\logs\behavior.log
```

`providers.json` 保存模型供应商配置、当前选中的模型和加密后的 API Key。`memory.md` 保存单个项目的长期记忆，`tasks` 目录保存这个项目下的多份任务历史。API Key 会优先使用 Electron `safeStorage` 在当前 Windows 账户下加密保存；如果当前环境暂时不支持加密，会退回为明文存储，并建议尽快切回桌面环境后重新保存一次。

## 日志

Novayxk 会把运行日志写入：

```text
C:\Users\你的用户名\.novayxk\logs
```

主要日志文件：

- `app.log`：应用启动、项目打开、文件操作、命令执行等运行日志
- `error.log`：IPC 调用失败、未捕获异常、AI 请求异常等错误日志
- `ai.log`：模型请求、流式输出、连接测试等 AI 调用日志
- `behavior.log`：临时完整行为日志，记录更详细的 IPC、模型消息、流式 chunk、命令、终端输出和用户介入行为，便于排查复杂问题

卸载清理日志会写到系统临时目录：

```text
%TEMP%\novayxk-uninstall-cleanup.log
```

日志采用 JSON Lines 格式，单个文件超过约 2MB 会自动轮转为 `.1`。日志会对 `apiKey`、`Authorization`、`token`、`password` 等敏感字段做脱敏处理。

## 记忆系统

Novayxk 当前采用三层记忆：

- 全局配置：供应商、模型、API Key，保存在 `.novayxk\config\providers.json`
- 项目长期记忆：技术栈、目录约定、常用命令、已知问题，保存在 `.novayxk\projects\<项目ID>\memory.md`
- 任务历史：同一个项目可以有多份任务记录，保存在 `.novayxk\projects\<项目ID>\tasks`

打开项目后，右侧助手面板顶部可以新建任务、切换历史、保存任务、编辑项目记忆。每次向模型发送消息时，Novayxk 会自动带上项目长期记忆和当前任务摘要。

聊天界面只显示用户实际输入的内容。Novayxk 只会在明确需要分析项目、查看文件或修改代码时，把当前选中文件、项目文件清单和相关文件片段作为隐藏上下文临时发给模型；版本、终端、环境类问题只附加极简运行上下文。用户只是打招呼或闲聊时不会附加项目上下文，避免把简单寒暄回答成项目介绍。

## AI PowerShell 控制

顶部执行范围开关有两档：

- 项目内执行：AI 可以自动执行项目目录内的常见开发命令，例如 `npm run build`、`npm test`、`git status`、`Get-ChildItem`
- 系统级执行：AI 可以执行更高风险的 PowerShell 命令，包括安装软件、系统配置修改、删除或重置等操作

这是 Novayxk 内部的 AI 执行范围，不等于设置里的“管理员模式 / Windows 系统权限”。用户要求切换管理员模式时，Novayxk 会请求 Windows UAC 并以管理员权限重启；遇到注册表、系统目录、安装卸载等系统级操作时，也会单独触发 Windows UAC 授权。

Novayxk 的 PowerShell 能力不只服务于代码项目。用户要求查资料、核实新闻、查看网页、安装/卸载软件、检查系统环境或处理常见 Windows 操作时，模型应该优先尝试给出可执行的 `powershell-run` 命令，并基于命令结果继续总结；如果命令失败，再说明真实失败原因和下一步。对于新闻和争议事件，只能基于可靠来源判断，不应把论坛或社交平台传言直接说成事实。

如果软件下载安装已经尝试多次仍失败，模型不应无限重复同一类命令。应改为查找官方网页、网页版下载地址或 Microsoft Store 页面，并用 `Start-Process "https://..."` 打开给用户继续处理。

模型需要执行命令时，会返回：

```powershell-run
npm run build
```

Novayxk 会在当前项目根目录运行该命令，并把输出写回聊天，同时在底部“终端任务”面板实时显示。AI 自动执行、确认弹窗执行和底部终端输入框启动的命令都会进入同一个终端任务列表。如果命令卡在 `Y/N`、协议确认或其他交互提示，Novayxk 会把任务标记为“等待输入”，你可以在终端任务下方的输入栏发送一行输入给当前运行任务。用户发送输入后，终端输出会记录“用户已插手”，方便后续判断命令结果。系统级执行风险很高，只建议在你明确信任当前任务时开启。

Novayxk 不使用 `<tool_call><function=shell>...` 这类 XML 工具调用协议。模型如果误输出这种格式，前端会尽量把 shell 命令归一化成 `powershell-run`，避免把原始 XML 直接展示给用户。

## 运行

```bash
npm install
npm run dev
```

如果只想预览前端页面：

```bash
npm run web
```

如果只想安装 Web/构建依赖，直接运行：

```bash
npm install
```

如果 Windows 环境下载 Electron 时出现 `ECONNRESET` 或无法写入用户缓存目录，运行：

```powershell
npm run setup:desktop
```

这个脚本会使用项目内的 `.npm-cache` 和 `.electron-cache`，并从 Electron 镜像下载桌面端二进制。

## 图标

应用图标放在：

```text
assets\icons
```

主要文件：

- `novayxk.svg`：可编辑源文件
- `novayxk.ico`：Windows `.exe` / 安装包图标
- `novayxk-256.png`、`novayxk-128.png` 等：不同尺寸 PNG

重新生成 PNG 和 ICO：

```bash
npm run icons
```

## 打包 Windows 应用

生成可运行的未压缩应用目录：

```bash
npm run pack
```

输出文件：

```text
dist-release\win-unpacked\Novayxk.exe
```

这个模式会跳过 Windows 资源编辑工具下载，适合本地快速验证。

生成完整未压缩应用目录，包含 exe 图标和资源编辑：

```bash
npm run pack:full
```

生成安装版 `.exe`：

```bash
npm run package
```

生成免安装便携版：

```bash
npm run package:portable
```

生成自定义安装器：

```bash
npm run package:custom
```

输出文件：

```text
dist-custom-installer\Novayxk-Custom-Setup-<版本号>.exe
```

这个安装器会显示 Novayxk 自己的现代安装界面，支持选择安装目录、桌面快捷方式、开始菜单快捷方式、安装后启动，并写入 Windows“应用和功能”的卸载入口。默认安装位置是：

```text
C:\Users\你的用户名\AppData\Local\Programs\Novayxk
```

卸载主程序时默认保留：

```text
C:\Users\你的用户名\.novayxk
```

这里保存模型供应商配置、项目记忆和任务历史，避免卸载时误删工作数据。

只生成未压缩应用目录，适合快速检查：

```bash
npm run pack
```

输出目录：

```text
dist-release
```

Windows 安装包会使用：

```text
assets\icons\novayxk.ico
```

如果 `npm run package` 或 `npm run package:portable` 卡在 `winCodeSign-*.7z` 下载，说明当前网络无法访问 electron-builder 的 Windows 资源编辑工具。此时可以先使用 `npm run pack` 生成的 `dist-release\win-unpacked\Novayxk.exe` 进行测试。

如果已经下载好 `winCodeSign-2.6.0.7z`，放到：

```text
.electron-builder-cache\winCodeSign\winCodeSign-2.6.0.7z
```

然后解压到：

```text
.electron-builder-cache\winCodeSign\manual
```

脚本会优先使用这个本地工具包，避免再次从 GitHub 下载。

安装版和便携版还需要 NSIS。网络不稳定时，可以手动下载这两个文件：

```text
https://github.com/electron-userland/electron-builder-binaries/releases/download/nsis-3.0.4.1/nsis-3.0.4.1.7z
https://github.com/electron-userland/electron-builder-binaries/releases/download/nsis-resources-3.4.1/nsis-resources-3.4.1.7z
```

分别放到：

```text
.electron-builder-cache\nsis\nsis-3.0.4.1.7z
.electron-builder-cache\nsis-resources\nsis-resources-3.4.1.7z
```

再次运行 `npm run package` 或 `npm run package:portable` 时，脚本会自动解压并使用本地 NSIS。

## 供应商配置示例

OpenAI:

- Base URL: `https://api.openai.com/v1`
- Model: `gpt-4.1-mini`

DeepSeek:

- Base URL: `https://api.deepseek.com/v1`
- Model: `deepseek-chat`

其他兼容 OpenAI Chat Completions 的供应商也可以用相同方式接入。

如果供应商使用 OpenAI Responses API，例如 Codex 配置中的 `wire_api = "responses"`，在设置里把“接口类型”改为 `Responses API (/responses)`。如果 `Base URL` 只填写域名，例如 `https://example.com`，Novayxk 会自动请求 `https://example.com/v1/responses` 或 `https://example.com/v1/chat/completions`。

## 文件操作

当你要求 Novayxk 创建文件夹或写入新文件时，模型可以返回：

```json
[
  { "type": "mkdir", "path": "docs" },
  { "type": "write", "path": "docs/hello.md", "content": "# Hello\n", "overwrite": false }
]
```

请把这段放在 `fileops` 代码块中。模型返回后，Novayxk 会自动尝试在当前项目内执行这些文件操作；如果自动执行失败，会保留这次文件操作，用户可以点底部工具栏的“执行文件操作”按钮手动确认后再次执行。路径必须是当前项目内的相对路径，敏感文件名会被拦截；写入已存在文件时需要显式设置 `overwrite: true`。
