import React from "react";
import ReactDOM from "react-dom/client";
import App from "./components/App";
import "@xterm/xterm/css/xterm.css";
import "./styles.css";

class AppErrorBoundary extends React.Component<React.PropsWithChildren, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("Novayxk renderer crashed", error);
  }

  render() {
    if (this.state.error) {
      return (
        <main className="renderer-error">
          <h1>界面加载失败</h1>
          <p>{this.state.error.message}</p>
        </main>
      );
    }

    return this.props.children;
  }
}

window.addEventListener("error", (event) => {
  const root = document.getElementById("root");
  if (!root || root.childElementCount) return;
  root.innerHTML = `<main class="renderer-error"><h1>界面加载失败</h1><p>${String(event.error?.message || event.message || "未知错误")}</p></main>`;
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);
