import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

// Catches any unhandled render/lifecycle error in the tree below it and shows
// a clean fallback instead of a blank white screen. Does NOT catch errors in
// event handlers, async code, or the DuckDB/Pyodide workers — those are
// already handled by their own try/catch paths (csv.error, duckDb.tableError,
// turn.error). This is specifically the last-resort net for a genuine React
// render crash.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error("Unhandled UI error:", error, info.componentStack);
  }

  handleReload = () => {
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center px-4">
          <div className="clay p-8 max-w-md w-full text-center flex flex-col items-center gap-4">
            <h1 className="text-xl font-semibold text-[var(--color-text)]">
              Something went wrong
            </h1>
            <p className="text-sm text-[var(--color-text-muted)]">
              This page hit an unexpected error. Nothing you uploaded ever
              leaves your browser, so it's safe to reload and start again.
            </p>
            <button
              onClick={this.handleReload}
              className="clay clay-pressable clay-solid-accent text-white text-sm font-medium px-5 py-3"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
