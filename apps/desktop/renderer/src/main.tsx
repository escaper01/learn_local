import { Component, StrictMode, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

interface StartupBoundaryState { error: Error | null }

class StartupBoundary extends Component<{ children: ReactNode }, StartupBoundaryState> {
  state: StartupBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): StartupBoundaryState { return { error }; }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("LearnLocal renderer failed", error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return <StartupFailure title="LearnLocal could not start" detail={this.state.error.message} />;
  }
}

function StartupFailure({ title, detail }: { title: string; detail: string }) {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 32, color: "#dce5df", background: "#0c1015", fontFamily: "Inter, system-ui, sans-serif" }}>
      <section style={{ width: "min(560px, 100%)", padding: 28, border: "1px solid #34423a", borderRadius: 12, background: "#121a16" }}>
        <div style={{ color: "#65d99a", fontWeight: 800, letterSpacing: ".08em" }}>LEARNLOCAL</div>
        <h1 style={{ marginBottom: 8 }}>{title}</h1>
        <p style={{ color: "#9ba9a1", lineHeight: 1.6 }}>{detail}</p>
        <button type="button" onClick={() => window.location.reload()} style={{ marginTop: 14, padding: "10px 16px", border: 0, borderRadius: 7, color: "#07130d", background: "#65d99a", fontWeight: 750, cursor: "pointer" }}>Reload application</button>
      </section>
    </main>
  );
}

const application = typeof window.learnLocal === "object"
  ? <App />
  : <StartupFailure title="Desktop bridge unavailable" detail="The secure desktop bridge did not load. Close LearnLocal and start it again from the desktop application or with npm run dev." />;

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StartupBoundary>{application}</StartupBoundary>
  </StrictMode>
);
