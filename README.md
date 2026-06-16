# Novayxk

Novayxk is a Windows-native AI project workspace for local development, system assistance, and guided automation.

It lets you connect OpenAI-compatible model providers, open local code projects, feed project context to the model, and let the assistant help with code changes, terminal commands, browser workflows, troubleshooting, and selected system-level tasks on your own machine.

## Highlights

- Windows desktop app built with Electron, React, and Vite
- Configurable OpenAI-compatible providers: `Base URL`, `API Key`, `Model`
- Supports both Chat Completions and Responses API
- Local project tree and file context for code-aware conversations
- AI-assisted file creation and file editing with structured `fileops`
- AI-triggered PowerShell execution with safety checks and confirmation flow
- Browser workspace for guided page actions and browser-aware automation
- Multi-task history and per-project long-term memory
- Streaming chat replies with token usage and elapsed time display
- Single-instance desktop behavior
- Built-in logging, task history, and recovery-oriented UX

## What Novayxk Can Do

- Open a local project and inspect non-sensitive files as model context
- Ask the AI to explain, refactor, patch, or extend your codebase
- Run project commands such as `npm run build`, `npm test`, or `git status`
- Use system-level PowerShell when explicitly allowed
- Search the web through PowerShell for fact-checking and external verification
- Install, uninstall, or upgrade software through tools such as `winget`, `choco`, `scoop`, and `msiexec`
- Apply structured file operations inside the current project
- Use an embedded browser workspace for navigation, page actions, and workflow observation

## Core Features

### Model Provider Settings

- Provider configuration: `Base URL`, `API Key`, `Model`
- Connection testing from the settings screen
- Support for multiple providers and model switching
- Compatible with OpenAI-style APIs

### Project Workspace

- Open a local project and browse its file tree
- Read related project files as hidden AI context when needed
- Keep simple chats lightweight without forcing full project context every time

### Memory System

Novayxk uses a three-layer memory model:

- Global configuration: provider settings, selected models, encrypted API keys
- Per-project long-term memory: stack, conventions, commands, known issues
- Per-project task history: multiple saved task sessions for the same project

### AI PowerShell Control

Novayxk supports two execution scopes:

- `Project execution`: for normal development commands inside the current project
- `System-level execution`: for higher-risk PowerShell tasks such as software installation, system configuration, deletion, or reset flows

This execution scope is separate from Windows administrator privilege.  
When admin privilege is required, Novayxk can request Windows UAC and restart in elevated mode.

### File Operations

When the assistant needs to create folders or write files, it can return structured `fileops` JSON.

Example:

```fileops
[
  { "type": "mkdir", "path": "docs" },
  { "type": "write", "path": "docs/hello.md", "content": "# Hello\n", "overwrite": false }
]
```

Supported operations:

- `mkdir`
- `write`
- `replace`
- `delete`

Rules:

- Paths must be relative to the current project
- Sensitive-looking files are blocked
- `delete` operations require manual confirmation
- Existing files require `overwrite: true` for full writes

### Browser Workspace

Novayxk includes an embedded browser workspace that can:

- Open and navigate pages
- Observe page state and network traces
- Run structured browser actions
- Feed browser context back into the AI workflow

This is especially useful for automation tasks, debugging flows, and browser-assisted reasoning.

### Safety Controls

Novayxk is designed to be useful without being reckless.

Built-in protections include:

- Sensitive file blocking for `.env`, credentials, certificates, and similar targets
- Confirmation flow for destructive or system-level actions
- Risk inspection before command execution
- Prevention of dangerous recursive deletion, direct remote-script execution, and similar unsafe patterns
- Verification-oriented assistant behavior after actions complete

## Local Configuration

Novayxk stores user data under:

```text
C:\Users\<YourUser>\.novayxk
```

Current storage includes:

```text
C:\Users\<YourUser>\.novayxk\config\providers.json
C:\Users\<YourUser>\.novayxk\projects\<project-id>\memory.md
C:\Users\<YourUser>\.novayxk\projects\<project-id>\tasks\<task-id>.json
C:\Users\<YourUser>\.novayxk\logs\app.log
C:\Users\<YourUser>\.novayxk\logs\error.log
C:\Users\<YourUser>\.novayxk\logs\ai.log
C:\Users\<YourUser>\.novayxk\logs\behavior.log
```

`providers.json` stores provider configuration, selected models, and encrypted API keys when Electron `safeStorage` is available.

## Logs

Runtime logs are written to:

```text
C:\Users\<YourUser>\.novayxk\logs
```

Main log files:

- `app.log`: app lifecycle, project open events, file operations, command execution
- `error.log`: IPC failures, uncaught exceptions, AI request failures
- `ai.log`: provider requests, stream output, connection tests
- `behavior.log`: higher-detail temporary behavior log for IPC, model streams, commands, terminal output, and user intervention

Uninstall cleanup logs are written to:

```text
%TEMP%\novayxk-uninstall-cleanup.log
```

Logs use JSON Lines format and rotate automatically when files grow too large. Sensitive fields such as `apiKey`, `Authorization`, `token`, and `password` are redacted.

## Running the App

Install dependencies:

```bash
npm install
```

Run desktop development mode:

```bash
npm run dev
```

Run frontend-only preview:

```bash
npm run web
```

Build the app:

```bash
npm run build
```

Run tests:

```bash
npm test
```

## Windows / Electron Setup

If Electron download fails on Windows with errors such as `ECONNRESET`, run:

```powershell
npm run setup:desktop
```

This script uses the local `.npm-cache` and `.electron-cache` folders and downloads Electron through the configured mirror.

## App Icons

Icons are stored in:

```text
assets\icons
```

Main files:

- `novayxk.svg`: editable source icon
- `novayxk.ico`: Windows executable / installer icon
- `novayxk-256.png`, `novayxk-128.png`, etc.: generated PNG sizes

Regenerate icons and installer artwork:

```bash
npm run icons
```

## Packaging for Windows

Generate an unpacked app directory:

```bash
npm run pack
```

Output:

```text
dist-release\win-unpacked\Novayxk.exe
```

Generate a fuller unpacked app build:

```bash
npm run pack:full
```

Generate a standard installer:

```bash
npm run package
```

Generate a portable build:

```bash
npm run package:portable
```

Generate the custom installer:

```bash
npm run package:custom
```

Output:

```text
dist-custom-installer\Novayxk-Custom-Setup-<version>.exe
```

The custom installer includes a branded installation experience with install directory selection, shortcut options, post-install launch, and Windows uninstall integration.

Default install path:

```text
C:\Users\<YourUser>\AppData\Local\Programs\Novayxk
```

By default, uninstall keeps:

```text
C:\Users\<YourUser>\.novayxk
```

This preserves provider settings, project memory, and task history.

## Provider Examples

OpenAI:

- Base URL: `https://api.openai.com/v1`
- Model: `gpt-4.1-mini`

DeepSeek:

- Base URL: `https://api.deepseek.com/v1`
- Model: `deepseek-chat`

Other OpenAI-compatible providers can be configured the same way.

If a provider uses the OpenAI Responses API, set the API mode to `Responses API (/responses)` in settings.

## Command and Automation Notes

- PowerShell commands must be returned inside a dedicated `powershell-run` block
- File operations should be returned as strict `fileops` JSON
- Browser automation should be returned as strict `browser-actions` JSON
- Plain-text command examples are not auto-executed
- XML-style tool-call protocols are normalized when possible, but are not Novayxk's native interaction format

## Tech Stack

- Electron
- React
- TypeScript
- Vite
- Lucide icons
- xterm.js

## Status

Novayxk is an actively evolving desktop AI workspace focused on practical local execution, safer automation, and better end-to-end collaboration between users and models on Windows.
