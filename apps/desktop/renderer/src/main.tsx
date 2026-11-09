import { Component, StrictMode, type ErrorInfo, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import "./foundation-theme.css";

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
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 32, color: "#111111", background: "#f4f2eb", fontFamily: '"Segoe UI", system-ui, sans-serif' }}>
      <section style={{ width: "min(620px, 100%)", padding: 36, border: "2px solid #111111", borderRadius: "0 46px 0 0", background: "#ffffff", boxShadow: "9px 9px 0 #c9c5ba" }}>
        <div style={{ color: "#8f2d0c", fontWeight: 850, letterSpacing: ".16em", fontSize: 11 }}>LEARNLOCAL · LOCAL FIRST</div>
        <h1 style={{ margin: "10px 0", fontFamily: 'Georgia, "Iowan Old Style", serif', fontSize: 42, lineHeight: 1 }}>{title}</h1>
        <p style={{ color: "#55534e", lineHeight: 1.65 }}>{detail}</p>
        <button type="button" onClick={() => window.location.reload()} style={{ marginTop: 16, padding: "11px 18px", border: "2px solid #111111", borderRadius: 0, color: "#111111", background: "#ff7139", fontWeight: 800, cursor: "pointer" }}>Reload application</button>
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
