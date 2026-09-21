import { useEffect, useRef, useState } from "react";
import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import type { AppErrorShape, ExecutionResult, ProviderStatus } from "@learnlocal/contracts";

loader.config({ monaco });

const STARTER_CODE = `public class Solution {
  public static int sum(int[] values) {
    // Add every value and return the total.
    return 0;
  }
}`;

const SOLUTION_CODE = `public class Solution {
  public static int sum(int[] values) {
    int total = 0;
    for (int value : values) {
      total += value;
    }
    return total;
  }
}`;

function friendlyError(error: unknown): AppErrorShape {
  if (typeof error === "object" && error && "message" in error) {
    return { code: "REQUEST_FAILED", category: "system", message: String(error.message) };
  }
  return { code: "REQUEST_FAILED", category: "system", message: "The request could not be completed." };
}

function StatusDot({ status }: { status: ProviderStatus | undefined }) {
  const className = status?.available ? "status-dot ready" : "status-dot unavailable";
  return (
    <div className="runtime-status" title={status?.message ?? "Checking Docker"}>
      <span className={className} />
      <span>{status ? (status.available ? `Docker ${status.version}` : "Docker unavailable") : "Checking runtime…"}</span>
    </div>
  );
}

function ResultPanel({ result, error }: { result: ExecutionResult | null; error: AppErrorShape | null }) {
  if (error) {
    return (
      <div className="empty-result error-state">
        <span className="result-icon">!</span>
        <div>
          <strong>{error.message}</strong>
          <p>{error.code}</p>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="empty-result">
        <span className="play-mark">▶</span>
        <div>
          <strong>Ready when you are</strong>
          <p>Run the public tests, then submit when your solution is ready.</p>
        </div>
      </div>
    );
  }

  if (!result.compile.success) {
    return (
      <div className="result-content">
        <div className="result-summary failed"><span>Compilation needs attention</span><small>{result.compile.durationMs} ms</small></div>
        {result.compile.diagnostics.map((diagnostic, index) => (
          <div className="diagnostic" key={`${diagnostic.line ?? 0}-${index}`}>
            <strong>{diagnostic.file ?? "Java compiler"}{diagnostic.line ? `:${diagnostic.line}` : ""}</strong>
            <p>{diagnostic.message}</p>
          </div>
        ))}
      </div>
    );
  }

  const passed = result.tests.filter((test) => test.passed).length;
  return (
    <div className="result-content">
      <div className={`result-summary ${passed === result.tests.length ? "passed" : "failed"}`}>
        <span>{passed === result.tests.length ? "All tests passed" : `${passed} of ${result.tests.length} tests passed`}</span>
        <small>{result.resources.wallTimeMs} ms total</small>
      </div>
      <div className="test-list">
        {result.tests.map((test) => (
          <div className="test-row" key={test.id}>
            <span className={`test-check ${test.passed ? "pass" : "fail"}`}>{test.passed ? "✓" : "×"}</span>
            <div className="test-copy">
              <strong>{test.visibility === "hidden" ? "Hidden edge case" : test.id.replaceAll("-", " ")}</strong>
              <span>{test.visibility === "hidden" ? "Expected values are kept private" : test.passed ? `Returned ${String(test.actual)}` : `Expected ${String(test.expected)}, received ${String(test.actual)}`}</span>
            </div>
            <small>{test.durationMs} ms</small>
          </div>
        ))}
      </div>
      {result.console && <pre className="console-output">{result.console}</pre>}
    </div>
  );
}

export default function App() {
  const [source, setSource] = useState(STARTER_CODE);
  const [provider, setProvider] = useState<ProviderStatus>();
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [error, setError] = useState<AppErrorShape | null>(null);
  const [activeExecution, setActiveExecution] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<"run" | "submit" | null>(null);
  const activeRef = useRef<string | null>(null);

  useEffect(() => {
    void window.learnLocal.environment.status().then(setProvider).catch((value) => setError(friendlyError(value)));
    return window.learnLocal.execution.onFinished((event) => {
      if (event.executionId !== activeRef.current) return;
      if ("result" in event) {
        setResult(event.result);
        setError(null);
      } else {
        setError(event.error);
      }
      activeRef.current = null;
      setActiveExecution(null);
      setActiveAction(null);
    });
  }, []);

  const execute = async (action: "run" | "submit") => {
    setResult(null);
    setError(null);
    setActiveAction(action);
    try {
      const { executionId } = await window.learnLocal.execution.start({ action, sourceCode: source });
      activeRef.current = executionId;
      setActiveExecution(executionId);
    } catch (value) {
      setError(friendlyError(value));
      setActiveAction(null);
    }
  };

  const cancel = async () => {
    if (!activeExecution) return;
    await window.learnLocal.execution.cancel(activeExecution);
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">L</span><span>LearnLocal</span></div>
        <nav>
          <button className="nav-item"><span>⌂</span>Dashboard</button>
          <button className="nav-item active"><span>◫</span>My courses</button>
          <button className="nav-item"><span>⌘</span>Languages</button>
          <button className="nav-item"><span>↗</span>Import course</button>
        </nav>
        <div className="sidebar-spacer" />
        <nav>
          <button className="nav-item"><span>⚙</span>Settings</button>
          <button className="nav-item"><span>?</span>Help & diagnostics</button>
        </nav>
        <StatusDot status={provider} />
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="crumbs"><span>Java Foundations</span><b>/</b><span>Arrays & loops</span><b>/</b><strong>Sum an Array</strong></div>
          <div className="progress-chip"><span>Module 2</span><b>4 / 8</b></div>
        </header>

        <div className="lesson-grid">
          <article className="lesson-pane">
            <div className="eyebrow">FUNCTION EXERCISE · JAVA 21</div>
            <h1>Sum an Array</h1>
            <p className="lede">Practice traversing an array and carrying a result through each iteration.</p>
            <div className="concept-card">
              <span className="concept-icon">∑</span>
              <div><strong>The accumulator pattern</strong><p>Start with a neutral value, update it once per element, then return the final result.</p></div>
            </div>
            <h2>Your task</h2>
            <p>Complete <code>sum</code> so it returns the total of every number in <code>values</code>.</p>
            <ul>
              <li>An empty array should return <code>0</code>.</li>
              <li>Values may be positive, negative, or zero.</li>
              <li>Do not change the class or method signature.</li>
            </ul>
            <div className="example-block"><span>Example</span><code>sum(new int[] &#123;1, 2, 3&#125;) → 6</code></div>
            <details className="hint"><summary>Hint 1 of 3</summary><p>Create an integer named <code>total</code> before the loop.</p></details>
          </article>

          <section className="coding-pane">
            <div className="editor-toolbar">
              <div className="file-tab"><span className="java-icon">J</span>Solution.java <i>●</i></div>
              <div className="toolbar-actions">
                <button className="ghost-button" onClick={() => setSource(STARTER_CODE)} disabled={Boolean(activeAction)}>Reset</button>
                <button className="ghost-button" onClick={() => setSource(SOLUTION_CODE)} disabled={Boolean(activeAction)}>Show solution</button>
              </div>
            </div>
            <div className="editor-wrap">
              <Editor
                language="java"
                theme="vs-dark"
                value={source}
                onChange={(value) => setSource(value ?? "")}
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  fontFamily: "Cascadia Code, Consolas, monospace",
                  lineHeight: 23,
                  padding: { top: 18 },
                  scrollBeyondLastLine: false,
                  smoothScrolling: true,
                  automaticLayout: true,
                  tabSize: 2
                }}
              />
            </div>
            <div className="action-bar">
              <span className="save-state">Saved locally</span>
              <div>
                {activeAction ? (
                  <button className="cancel-button" onClick={cancel}>Cancel {activeAction}</button>
                ) : (
                  <>
                    <button className="run-button" onClick={() => void execute("run")} disabled={provider?.available === false}>▶ Run</button>
                    <button className="submit-button" onClick={() => void execute("submit")} disabled={provider?.available === false}>Submit solution</button>
                  </>
                )}
              </div>
            </div>

            <section className="results-pane">
              <div className="results-header"><strong>Test results</strong><span>{activeAction ? `${activeAction === "run" ? "Running public tests" : "Checking all tests"}…` : result ? result.status : "No run yet"}</span></div>
              {activeAction ? <div className="running-state"><span className="spinner"/><strong>Preparing an isolated Java workspace…</strong><p>The first run can take longer while Docker downloads Java 21.</p></div> : <ResultPanel result={result} error={error} />}
            </section>
          </section>
        </div>
      </section>
    </main>
  );
}
