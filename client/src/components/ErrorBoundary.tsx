import { Component, type ReactNode } from "react";
import { Logo } from "./Logo";

/** Catches render crashes anywhere in the tree and shows a recoverable
 *  message instead of a white screen. Critical for Sunday-morning scale:
 *  a single bad render must never strand 2000 users. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) {
    // Best-effort breadcrumb; never throws.
    try { console.error("[tend] render crash:", error); } catch { /* noop */ }
  }
  render() {
    if (this.state.error) {
      return (
        <main className="max-w-lg mx-auto px-6 py-20 text-center">
          <Logo showWordmark />
          <h1 className="text-xl mt-8 mb-4">Something went wrong</h1>
          <p className="text-muted-foreground leading-relaxed mb-6">
            Tend hit an unexpected problem. Your prayer requests are safe.
          </p>
          <button
            type="button"
            className="brand-button"
            onClick={() => { this.setState({ error: null }); window.location.hash = "#/"; window.location.reload(); }}
          >
            Reload Tend
          </button>
        </main>
      );
    }
    return this.props.children;
  }
}
