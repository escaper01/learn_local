import { useEffect, useRef, useState } from "react";
import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import type { AppErrorShape, CoursePromptRequest, ExecutionResult, ImportedCourseSummary, LearningSummary, ProviderStatus, ResolvedSetting, RuntimeSummary, SettingValue } from "@learnlocal/contracts";

loader.config({ monaco });

type Theme = "dark" | "light";

function initialTheme(): Theme {
  const saved = localStorage.getItem("learnlocal.theme");
  if (saved === "dark" || saved === "light") return saved;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

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

const PYTHON_STARTER_CODE = `def sum_values(values):
    # Add every value and return the total.
    return 0
`;

const PYTHON_SOLUTION_CODE = `def sum_values(values):
    total = 0
    for value in values:
        total += value
    return total
`;

const DEFAULT_PROMPT_FORM: CoursePromptRequest = {
  language: "java",
  experience: "beginner",
  goal: "Build a strong programming foundation and complete practical projects",
  topics: "fundamentals, functions, collections, debugging, testing",
  skipTopics: "",
  dailyMinutes: 30,
  durationWeeks: 6,
  projectTheme: "useful command-line tools",
  teachingStyle: "supportive",
  customInstructions: ""
};

function friendlyError(error: unknown): AppErrorShape {
  if (typeof error === "object" && error && "message" in error) {
    return { code: "REQUEST_FAILED", category: "system", message: String(error.message) };
  }
  return { code: "REQUEST_FAILED", category: "system", message: "The request could not be completed." };
}

function formatBytes(value: number | null): string {
  if (value === null) return "Size available after installation";
  const units = ["B", "KB", "MB", "GB"];
  let amount = value;
  let unit = 0;
  while (amount >= 1024 && unit < units.length - 1) { amount /= 1024; unit += 1; }
  return `${amount.toFixed(unit > 1 ? 1 : 0)} ${units[unit]}`;
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
  const [view, setView] = useState<"lesson" | "dashboard" | "courses">("lesson");
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [language, setLanguage] = useState<"java" | "python">("java");
  const [source, setSource] = useState(STARTER_CODE);
  const [provider, setProvider] = useState<ProviderStatus>();
  const [courses, setCourses] = useState<ImportedCourseSummary[]>([]);
  const [importing, setImporting] = useState(false);
  const [importedCourse, setImportedCourse] = useState<ImportedCourseSummary | null>(null);
  const [showRuntimes, setShowRuntimes] = useState(false);
  const [runtimes, setRuntimes] = useState<RuntimeSummary[]>([]);
  const [runtimeOperation, setRuntimeOperation] = useState<RuntimeSummary["id"] | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<ResolvedSetting[]>([]);
  const [showPrompt, setShowPrompt] = useState(false);
  const [promptForm, setPromptForm] = useState<CoursePromptRequest>(DEFAULT_PROMPT_FORM);
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [copied, setCopied] = useState(false);
  const [learningSummary, setLearningSummary] = useState<LearningSummary>({ totalAttempts: 0, completedExercises: 0, passedSubmissions: 0, currentStreakDays: 0, recentAttempts: [], activity: [] });
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [error, setError] = useState<AppErrorShape | null>(null);
  const [activeExecution, setActiveExecution] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<"run" | "submit" | null>(null);
  const activeRef = useRef<string | null>(null);
  const hydratedLanguage = useRef<"java" | "python" | null>(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem("learnlocal.theme", theme);
  }, [theme]);

  useEffect(() => {
    void window.learnLocal.environment.status().then(setProvider).catch((value) => setError(friendlyError(value)));
    void window.learnLocal.courses.list().then(setCourses).catch((value) => setError(friendlyError(value)));
    void window.learnLocal.progress.summary().then(setLearningSummary).catch((value) => setError(friendlyError(value)));
    return window.learnLocal.execution.onFinished((event) => {
      if (event.executionId !== activeRef.current) return;
      if ("result" in event) {
        setResult(event.result);
        setError(null);
        void window.learnLocal.progress.summary().then(setLearningSummary);
      } else {
        setError(event.error);
      }
      activeRef.current = null;
      setActiveExecution(null);
      setActiveAction(null);
    });
  }, []);

  useEffect(() => {
    hydratedLanguage.current = null;
    void window.learnLocal.workspace.read(language).then(({ content }) => {
      setSource(content ?? (language === "java" ? STARTER_CODE : PYTHON_STARTER_CODE));
      hydratedLanguage.current = language;
    });
  }, [language]);

  useEffect(() => {
    if (hydratedLanguage.current !== language) return;
    const timeout = window.setTimeout(() => void window.learnLocal.workspace.write(language, source), 600);
    return () => window.clearTimeout(timeout);
  }, [language, source]);

  const execute = async (action: "run" | "submit") => {
    setResult(null);
    setError(null);
    setActiveAction(action);
    try {
      const { executionId } = await window.learnLocal.execution.start({ action, language, sourceCode: source });
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

  const importCourse = async () => {
    setImporting(true);
    setError(null);
    try {
      const imported = await window.learnLocal.courses.importPack();
      if (imported.status === "imported") {
        setImportedCourse(imported.course);
        setCourses(await window.learnLocal.courses.list());
      }
    } catch (value) {
      setError(friendlyError(value));
    } finally {
      setImporting(false);
    }
  };

  const openRuntimes = async () => {
    setShowRuntimes(true);
    try { setRuntimes(await window.learnLocal.runtimes.list()); }
    catch (value) { setError(friendlyError(value)); }
  };

  const changeRuntime = async (runtime: RuntimeSummary) => {
    setRuntimeOperation(runtime.id);
    setError(null);
    try {
      if (runtime.status === "ready") await window.learnLocal.runtimes.remove(runtime.id);
      else await window.learnLocal.runtimes.install(runtime.id);
      setRuntimes(await window.learnLocal.runtimes.list());
    } catch (value) {
      setError(friendlyError(value));
      setRuntimes(await window.learnLocal.runtimes.list());
    } finally {
      setRuntimeOperation(null);
    }
  };

  const switchLanguage = (next: "java" | "python") => {
    if (next === language || activeAction) return;
    setLanguage(next);
    setResult(null);
    setError(null);
  };

  const openSettings = async () => {
    setShowSettings(true);
    try { setSettings(await window.learnLocal.settings.list()); }
    catch (value) { setError(friendlyError(value)); }
  };

  const updateSetting = async (setting: ResolvedSetting, value: SettingValue) => {
    try { setSettings(await window.learnLocal.settings.set({ key: setting.key, value, scope: "global", scopeId: null })); }
    catch (reason) { setError(friendlyError(reason)); }
  };

  const resetSetting = async (setting: ResolvedSetting) => {
    try { setSettings(await window.learnLocal.settings.reset({ key: setting.key, scope: "global", scopeId: null })); }
    catch (reason) { setError(friendlyError(reason)); }
  };

  const openPromptGenerator = async () => {
    setShowPrompt(true);
    try {
      const values = await window.learnLocal.settings.list({ language });
      const daily = values.find((setting) => setting.key === "learning.dailyMinutes")?.value;
      const style = values.find((setting) => setting.key === "prompt.teachingStyle")?.value;
      const custom = values.find((setting) => setting.key === "prompt.customInstructions")?.value;
      setPromptForm((current) => ({
        ...current,
        language,
        ...(typeof daily === "number" ? { dailyMinutes: daily } : {}),
        ...(typeof style === "string" ? { teachingStyle: style as CoursePromptRequest["teachingStyle"] } : {}),
        ...(typeof custom === "string" ? { customInstructions: custom } : {})
      }));
    } catch (reason) { setError(friendlyError(reason)); }
  };

  const generatePrompt = async () => {
    try {
      const generated = await window.learnLocal.prompts.generate(promptForm);
      setGeneratedPrompt(generated.prompt);
      setCopied(false);
    } catch (reason) { setError(friendlyError(reason)); }
  };

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(generatedPrompt);
    setCopied(true);
  };

  const editorFontSize = settings.find((setting) => setting.key === "editor.fontSize")?.value;
  const editorWordWrap = settings.find((setting) => setting.key === "editor.wordWrap")?.value;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">L</span><span>LearnLocal</span></div>
        <nav>
          <button className={`nav-item ${view === "dashboard" ? "active" : ""}`} onClick={() => setView("dashboard")}><span>⌂</span>Dashboard</button>
          <button className={`nav-item ${view === "courses" ? "active" : ""}`} onClick={() => setView("courses")}><span>◫</span>My courses{courses.length > 0 && <b className="nav-count">{courses.length}</b>}</button>
          <button className="nav-item" onClick={() => void openRuntimes()}><span>⌘</span>Languages</button>
          <button className="nav-item" onClick={() => void openPromptGenerator()}><span>✦</span>Generate prompt</button>
          <button className="nav-item" onClick={() => void importCourse()} disabled={importing}><span>↗</span>{importing ? "Validating…" : "Import course"}</button>
        </nav>
        <div className="sidebar-spacer" />
        <nav>
          <button className="nav-item" onClick={() => void openSettings()}><span>⚙</span>Settings</button>
          <button className="nav-item"><span>?</span>Help & diagnostics</button>
        </nav>
        <StatusDot status={provider} />
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="crumbs"><span>{language === "java" ? "Java" : "Python"} Foundations</span><b>/</b><span>{language === "java" ? "Arrays" : "Lists"} & loops</span><b>/</b><strong>Sum {language === "java" ? "an Array" : "a List"}</strong></div>
          <div className="topbar-actions">
            <button
              className="theme-toggle"
              type="button"
              aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
              title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
              onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}
            >
              <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
              {theme === "dark" ? "Light" : "Dark"}
            </button>
            <div className="progress-chip"><span>Module 2</span><b>4 / 8</b></div>
          </div>
        </header>

        <div className="lesson-grid">
          <article className="lesson-pane">
            <div className="eyebrow">FUNCTION EXERCISE · {language === "java" ? "JAVA 21" : "PYTHON 3.13"}</div>
            <h1>Sum {language === "java" ? "an Array" : "a List"}</h1>
            <p className="lede">Practice traversing {language === "java" ? "an array" : "a list"} and carrying a result through each iteration.</p>
            <div className="concept-card">
              <span className="concept-icon">∑</span>
              <div><strong>The accumulator pattern</strong><p>Start with a neutral value, update it once per element, then return the final result.</p></div>
            </div>
            <h2>Your task</h2>
            <p>Complete <code>{language === "java" ? "sum" : "sum_values"}</code> so it returns the total of every number in <code>values</code>.</p>
            <ul>
              <li>An empty array should return <code>0</code>.</li>
              <li>Values may be positive, negative, or zero.</li>
              <li>Do not change the class or method signature.</li>
            </ul>
            <div className="example-block"><span>Example</span><code>{language === "java" ? "sum(new int[] {1, 2, 3}) → 6" : "sum_values([1, 2, 3]) → 6"}</code></div>
            <details className="hint"><summary>Hint 1 of 3</summary><p>Create an integer named <code>total</code> before the loop.</p></details>
          </article>

          <section className="coding-pane">
            <div className="editor-toolbar">
              <div className="file-tab"><span className={`java-icon ${language}`}>{language === "java" ? "J" : "Py"}</span>{language === "java" ? "Solution.java" : "solution.py"} <i>●</i></div>
              <div className="toolbar-actions">
                <div className="language-switch" aria-label="Exercise language">
                  <button className={language === "java" ? "active" : ""} onClick={() => switchLanguage("java")}>Java</button>
                  <button className={language === "python" ? "active" : ""} onClick={() => switchLanguage("python")}>Python</button>
                </div>
                <button className="ghost-button" onClick={() => setSource(language === "java" ? STARTER_CODE : PYTHON_STARTER_CODE)} disabled={Boolean(activeAction)}>Reset</button>
                <button className="ghost-button" onClick={() => setSource(language === "java" ? SOLUTION_CODE : PYTHON_SOLUTION_CODE)} disabled={Boolean(activeAction)}>Show solution</button>
              </div>
            </div>
            <div className="editor-wrap">
              <Editor
                language={language}
                theme={theme === "dark" ? "vs-dark" : "light"}
                value={source}
                onChange={(value) => setSource(value ?? "")}
                options={{
                  minimap: { enabled: false },
                  fontSize: typeof editorFontSize === "number" ? editorFontSize : 14,
                  fontFamily: "Cascadia Code, Consolas, monospace",
                  lineHeight: 23,
                  padding: { top: 18 },
                  scrollBeyondLastLine: false,
                  smoothScrolling: true,
                  automaticLayout: true,
                  tabSize: 2,
                  wordWrap: editorWordWrap === true ? "on" : "off"
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
              {activeAction ? <div className="running-state"><span className="spinner"/><strong>Preparing an isolated {language === "java" ? "Java" : "Python"} workspace…</strong><p>The first run can take longer while Docker downloads the pinned runtime.</p></div> : <ResultPanel result={result} error={error} />}
            </section>
          </section>
        </div>
      </section>

      {view === "dashboard" && (
        <section className="content-view dashboard-view">
          <header><div><div className="eyebrow">LOCAL LEARNING OVERVIEW</div><h1>Welcome back</h1><p>Your practice data stays on this device.</p></div><button className="submit-button" onClick={() => setView("lesson")}>Continue learning</button></header>
          <div className="metric-grid">
            <article><span>Attempts</span><strong>{learningSummary.totalAttempts}</strong><small>All local runs and submissions</small></article>
            <article><span>Completed</span><strong>{learningSummary.completedExercises}</strong><small>Exercises passed on Submit</small></article>
            <article><span>Passed</span><strong>{learningSummary.passedSubmissions}</strong><small>Successful submissions</small></article>
            <article><span>Current streak</span><strong>{learningSummary.currentStreakDays}<i> days</i></strong><small>Consecutive practice days</small></article>
          </div>
          <div className="dashboard-grid">
            <article className="activity-card"><div><strong>Practice activity</strong><span>Last 28 days</span></div><div className="activity-bars">{Array.from({ length: 28 }, (_, index) => {
              const date = new Date(); date.setUTCDate(date.getUTCDate() - (27 - index)); const key = date.toISOString().slice(0, 10);
              const attempts = learningSummary.activity.find((day) => day.date === key)?.attempts ?? 0;
              return <i key={key} className={attempts > 0 ? "active" : ""} style={{ opacity: attempts > 0 ? Math.min(.35 + attempts * .18, 1) : 1 }} title={`${key}: ${attempts} attempts`} />;
            })}</div></article>
            <article className="recent-card"><div><strong>Recent attempts</strong><span>{learningSummary.recentAttempts.length}</span></div>{learningSummary.recentAttempts.length ? learningSummary.recentAttempts.map((attempt) => <div className="recent-row" key={`${attempt.createdAt}-${attempt.exerciseId}`}><span className={attempt.passed ? "pass" : "neutral"}>{attempt.passed ? "✓" : "•"}</span><p><strong>{attempt.exerciseId.replaceAll("-", " ")}</strong><small>{attempt.action} · {new Date(attempt.createdAt).toLocaleString()}</small></p></div>) : <p className="dashboard-empty">Run your first exercise to start building activity.</p>}</article>
          </div>
        </section>
      )}
      {view === "courses" && (
        <section className="content-view courses-view">
          <header><div><div className="eyebrow">COURSE LIBRARY</div><h1>My courses</h1><p>Built-in and imported courses are available offline.</p></div><button className="run-button" onClick={() => void importCourse()}>Import LearnPack</button></header>
          <div className="course-grid">
            <article className="course-card"><span className="course-language java">J</span><div><small>BUILT IN · JAVA 21</small><h2>Java Foundations</h2><p>Arrays, loops, functions, debugging, and tests.</p><div><span>Interactive exercise</span><span>Local runtime</span></div></div><button className="submit-button" onClick={() => { switchLanguage("java"); setView("lesson"); }}>Continue</button></article>
            <article className="course-card"><span className="course-language python">Py</span><div><small>BUILT IN · PYTHON 3.13</small><h2>Python Foundations</h2><p>Lists, loops, functions, tracebacks, and tests.</p><div><span>Interactive exercise</span><span>Local runtime</span></div></div><button className="submit-button" onClick={() => { switchLanguage("python"); setView("lesson"); }}>Continue</button></article>
            {courses.map((course) => <article className="course-card imported" key={`${course.id}-${course.version}`}><span className={`course-language ${course.language}`}>{course.language === "java" ? "J" : "Py"}</span><div><small>IMPORTED · {course.language.toUpperCase()} {course.languageVersion}</small><h2>{course.title}</h2><p>{course.description}</p><div><span>{course.moduleCount} modules</span><span>{course.exerciseCount} exercises</span><span>{course.estimatedHours} hours</span></div></div><button className="run-button" onClick={() => { switchLanguage(course.language); setView("lesson"); }}>Open</button></article>)}
          </div>
        </section>
      )}

      {importedCourse && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setImportedCourse(null)}>
          <section className="import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" aria-label="Close import summary" onClick={() => setImportedCourse(null)}>×</button>
            <span className="import-success">✓</span>
            <div className="eyebrow">LEARNPACK 1.0 IMPORTED</div>
            <h2 id="import-title">{importedCourse.title}</h2>
            <p>{importedCourse.description}</p>
            <div className="import-stats">
              <div><strong>{importedCourse.moduleCount}</strong><span>Modules</span></div>
              <div><strong>{importedCourse.lessonCount}</strong><span>Lessons</span></div>
              <div><strong>{importedCourse.exerciseCount}</strong><span>Exercises</span></div>
              <div><strong>{importedCourse.estimatedHours}h</strong><span>Estimate</span></div>
            </div>
            <div className="import-meta"><span>{importedCourse.language} {importedCourse.languageVersion}</span><span>{importedCourse.level}</span><span>v{importedCourse.version}</span></div>
            <button className="submit-button modal-action" onClick={() => setImportedCourse(null)}>View course</button>
          </section>
        </div>
      )}
      {showRuntimes && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => !runtimeOperation && setShowRuntimes(false)}>
          <section className="runtime-modal" role="dialog" aria-modal="true" aria-labelledby="runtime-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" aria-label="Close runtime manager" disabled={Boolean(runtimeOperation)} onClick={() => setShowRuntimes(false)}>×</button>
            <div className="eyebrow">LANGUAGES & STORAGE</div>
            <h2 id="runtime-title">Runtime Manager</h2>
            <p>Install languages independently. Removing a runtime preserves courses, source code, attempts, and progress.</p>
            <div className="runtime-list">
              {runtimes.map((runtime) => {
                const busy = runtimeOperation === runtime.id;
                return (
                  <article className="runtime-card" key={runtime.id}>
                    <span className={`runtime-logo ${runtime.language}`}>{runtime.language === "java" ? "J" : "Py"}</span>
                    <div className="runtime-copy">
                      <div><strong>{runtime.displayName}</strong><span className={`runtime-state ${runtime.status}`}>{busy ? (runtime.status === "ready" ? "Removing" : "Installing") : runtime.status.replace("-", " ")}</span></div>
                      <p>Docker · {formatBytes(runtime.sizeBytes)}</p>
                      <small>{runtime.imageReference.slice(0, 48)}…</small>
                    </div>
                    <button
                      className={runtime.status === "ready" ? "runtime-remove" : "runtime-install"}
                      disabled={Boolean(runtimeOperation)}
                      onClick={() => void changeRuntime(runtime)}
                    >{busy ? "Working…" : runtime.status === "ready" ? "Remove" : runtime.status === "broken" ? "Repair" : "Install"}</button>
                  </article>
                );
              })}
            </div>
            {error?.category === "runtime" && <div className="runtime-error"><strong>{error.message}</strong><span>{error.code}</span></div>}
            <div className="runtime-note"><span>●</span><p>Executions use fresh containers with network disabled. No public port is opened.</p></div>
          </section>
        </div>
      )}
      {showSettings && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowSettings(false)}>
          <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" aria-label="Close settings" onClick={() => setShowSettings(false)}>×</button>
            <div className="eyebrow">CUSTOMIZATION</div>
            <h2 id="settings-title">Settings</h2>
            <p>Values are validated and stored locally. Sandbox and Electron security policy remain locked.</p>
            <div className="settings-list">
              {settings.map((setting) => (
                <label className="setting-row" key={setting.key}>
                  <span className="setting-copy"><strong>{setting.label}</strong><small>{setting.description}</small><i>{setting.source}</i></span>
                  <span className="setting-control">
                    {setting.type === "boolean" && <input type="checkbox" checked={setting.value === true} onChange={(event) => void updateSetting(setting, event.target.checked)} />}
                    {setting.type === "number" && <input type="number" min={setting.min} max={setting.max} value={Number(setting.value)} onChange={(event) => void updateSetting(setting, Number(event.target.value))} />}
                    {setting.type === "enum" && <select value={String(setting.value)} onChange={(event) => void updateSetting(setting, event.target.value)}>{setting.options?.map((option) => <option key={option}>{option}</option>)}</select>}
                    {setting.type === "string" && <textarea value={String(setting.value)} placeholder="No custom instructions" onChange={(event) => void updateSetting(setting, event.target.value)} />}
                    {setting.source !== "default" && <button type="button" onClick={() => void resetSetting(setting)}>Reset</button>}
                  </span>
                </label>
              ))}
            </div>
            <div className="settings-actions">
              <button className="run-button" onClick={() => void window.learnLocal.settings.importProfile().then(() => window.learnLocal.settings.list().then(setSettings))}>Import profile</button>
              <button className="run-button" onClick={() => void window.learnLocal.settings.exportProfile()}>Export profile</button>
              <button className="submit-button" onClick={() => setShowSettings(false)}>Done</button>
            </div>
          </section>
        </div>
      )}
      {showPrompt && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setShowPrompt(false)}>
          <section className="prompt-modal" role="dialog" aria-modal="true" aria-labelledby="prompt-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" aria-label="Close prompt generator" onClick={() => setShowPrompt(false)}>×</button>
            <div className="eyebrow">PROVIDER-INDEPENDENT</div>
            <h2 id="prompt-title">Course Prompt Generator</h2>
            <p>Describe your goal, then paste the generated prompt into any AI assistant.</p>
            <div className="prompt-layout">
              <div className="prompt-form">
                <label>Language<select value={promptForm.language} onChange={(event) => setPromptForm({ ...promptForm, language: event.target.value as "java" | "python" })}><option value="java">Java 21</option><option value="python">Python 3.13</option></select></label>
                <label>Experience<select value={promptForm.experience} onChange={(event) => setPromptForm({ ...promptForm, experience: event.target.value as CoursePromptRequest["experience"] })}><option value="new">Completely new</option><option value="beginner">Beginner</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label>
                <label className="wide">Learning goal<textarea value={promptForm.goal} onChange={(event) => setPromptForm({ ...promptForm, goal: event.target.value })} /></label>
                <label className="wide">Topics to emphasize<input value={promptForm.topics} onChange={(event) => setPromptForm({ ...promptForm, topics: event.target.value })} /></label>
                <label>Minutes per day<input type="number" min="10" max="240" value={promptForm.dailyMinutes} onChange={(event) => setPromptForm({ ...promptForm, dailyMinutes: Number(event.target.value) })} /></label>
                <label>Duration in weeks<input type="number" min="1" max="52" value={promptForm.durationWeeks} onChange={(event) => setPromptForm({ ...promptForm, durationWeeks: Number(event.target.value) })} /></label>
                <label className="wide">Project theme<input value={promptForm.projectTheme} onChange={(event) => setPromptForm({ ...promptForm, projectTheme: event.target.value })} /></label>
                <button className="submit-button prompt-generate" onClick={() => void generatePrompt()}>Generate LearnPack prompt</button>
              </div>
              <div className="prompt-preview">
                {generatedPrompt ? <textarea readOnly value={generatedPrompt} aria-label="Generated course prompt" /> : <div><span>✦</span><strong>Your prompt will appear here</strong><p>It will include the LearnPack schema contract and locked security rules.</p></div>}
                {generatedPrompt && <button className="run-button" onClick={() => void copyPrompt()}>{copied ? "Copied" : "Copy prompt"}</button>}
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
