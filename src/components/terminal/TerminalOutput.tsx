import React from "react";
import type { Terminal as XTermTerminal } from "@xterm/xterm";
import type { FitAddon as XTermFitAddon } from "@xterm/addon-fit";
import type { TerminalTask } from "../../vite-env";

type TerminalOutputProps = {
  activeTerminalTask: TerminalTask | null;
};

function getInitialTerminalText(task: TerminalTask | null) {
  if (!task) {
    return "启动长期服务或后台命令后，这里会实时显示输出。AI 返回的 diff/fileops 仍可用右上角按钮处理。";
  }
  return task.output || `${task.command}\r\n\r\n任务已启动，等待输出...`;
}

export function TerminalOutput({ activeTerminalTask }: TerminalOutputProps) {
  const hostRef = React.useRef<HTMLDivElement | null>(null);
  const terminalRef = React.useRef<XTermTerminal | null>(null);
  const fitAddonRef = React.useRef<XTermFitAddon | null>(null);
  const renderedTaskIdRef = React.useRef<string | null>(null);
  const renderedOutputRef = React.useRef("");
  const latestTaskRef = React.useRef<TerminalTask | null>(activeTerminalTask);

  latestTaskRef.current = activeTerminalTask;

  React.useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    let terminal: XTermTerminal | null = null;

    void (async () => {
      const [{ Terminal }, { FitAddon }] = await Promise.all([
        import("@xterm/xterm"),
        import("@xterm/addon-fit"),
      ]);
      if (disposed) return;

      terminal = new Terminal({
        allowTransparency: true,
        convertEol: false,
        cursorBlink: false,
        disableStdin: true,
        fontFamily: '"JetBrains Mono", "Cascadia Code", Consolas, monospace',
        fontSize: 12,
        lineHeight: 1.65,
        scrollback: 5000,
        theme: {
          background: "#00000000",
          foreground: "#c8d4ff",
          cursor: "#9bb2ff",
          selectionBackground: "rgba(173, 198, 255, 0.22)",
        },
      });
      const fitAddon = new FitAddon();
      terminal.loadAddon(fitAddon);
      terminal.open(host);
      fitAddon.fit();

      terminalRef.current = terminal;
      fitAddonRef.current = fitAddon;
      const initialText = getInitialTerminalText(latestTaskRef.current);
      terminal.write(initialText);
      renderedTaskIdRef.current = latestTaskRef.current?.id ?? null;
      renderedOutputRef.current = initialText;

      resizeObserver = new ResizeObserver(() => {
        fitAddon.fit();
      });
      resizeObserver.observe(host);
    })();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      renderedTaskIdRef.current = null;
      renderedOutputRef.current = "";
      fitAddonRef.current = null;
      terminalRef.current = null;
      terminal?.dispose();
    };
  }, []);

  React.useEffect(() => {
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!terminal || !fitAddon) return;

    const nextTaskId = activeTerminalTask?.id ?? null;
    const nextOutput = getInitialTerminalText(activeTerminalTask);
    const renderedTaskId = renderedTaskIdRef.current;
    const renderedOutput = renderedOutputRef.current;

    if (nextTaskId !== renderedTaskId) {
      terminal.reset();
      terminal.clear();
      terminal.write(nextOutput);
      renderedTaskIdRef.current = nextTaskId;
      renderedOutputRef.current = nextOutput;
      fitAddon.fit();
      return;
    }

    if (nextOutput === renderedOutput) return;

    if (nextOutput.startsWith(renderedOutput)) {
      terminal.write(nextOutput.slice(renderedOutput.length));
    } else {
      terminal.reset();
      terminal.clear();
      terminal.write(nextOutput);
    }

    renderedOutputRef.current = nextOutput;
    fitAddon.fit();
  }, [activeTerminalTask]);

  return <div ref={hostRef} className="terminal-output-shell" aria-label="终端输出" />;
}
