import { useEffect, useRef, useState } from "react";
import Editor, { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor";
import type { AppErrorShape, CoursePromptRequest, CourseView, ExecutionResult, ImportedCourseSummary, LearningSummary, ProviderStatus, ResolvedSetting, RuntimeSummary, SettingScope, SettingValue, SourceFile, ValidationIssue } from "@learnlocal/contracts";

loader.config({ monaco });

type Theme = "dark" | "light";
type PromptTemplate = { id: string; name: string; form: CoursePromptRequest };
type PromptHistoryItem = { id: string; createdAt: string; prompt: string };

function loadLocalList<T>(key: string): T[] {
  try { const value = JSON.parse(localStorage.getItem(key) ?? "[]"); return Array.isArray(value) ? value as T[] : []; }
  catch { return []; }
}

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

function inlineMarkdown(text: string) {
  return text.split(/(`[^`]+`)/g).filter(Boolean).map((part, index) => part.startsWith("`") && part.endsWith("`") ? <code key={index}>{part.slice(1, -1)}</code> : part);
}

function SafeMarkdown({ value, className = "" }: { value: string; className?: string }) {
  const lines = value.replaceAll("\r\n", "\n").split("\n");
  const blocks = [];
  for (let index = 0; index < lines.length;) {
    const line = lines[index] ?? "";
    if (!line.trim()) { index += 1; continue; }
    if (line.trim().startsWith("```")) {
      const language = line.trim().slice(3);
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index]!.trim().startsWith("```")) { code.push(lines[index]!); index += 1; }
      index += index < lines.length ? 1 : 0;
      blocks.push(<pre key={`code-${index}`}><code data-language={language || undefined}>{code.join("\n")}</code></pre>);
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line.trim());
    if (heading) {
      const content = inlineMarkdown(heading[2]!);
      blocks.push(heading[1]!.length === 1 ? <h2 key={`heading-${index}`}>{content}</h2> : <h3 key={`heading-${index}`}>{content}</h3>);
      index += 1;
      continue;
    }
    if (/^[-*]\s+/.test(line.trim())) {
      const items = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index]!.trim())) { items.push(lines[index]!.trim().replace(/^[-*]\s+/, "")); index += 1; }
      blocks.push(<ul key={`list-${index}`}>{items.map((item, itemIndex) => <li key={itemIndex}>{inlineMarkdown(item)}</li>)}</ul>);
      continue;
    }
    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index]!.trim() && !/^(#{1,3})\s+|^[-*]\s+|^```/.test(lines[index]!.trim())) { paragraph.push(lines[index]!.trim()); index += 1; }
    blocks.push(<p key={`paragraph-${index}`}>{inlineMarkdown(paragraph.join(" "))}</p>);
  }
  return <div className={`safe-markdown ${className}`.trim()}>{blocks}</div>;
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
  const [onboardingStep, setOnboardingStep] = useState(() => localStorage.getItem("learnlocal.onboarding.complete") === "1" ? -1 : 0);
  const [view, setView] = useState<"lesson" | "dashboard" | "courses">("lesson");
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [language, setLanguage] = useState<"java" | "python">("java");
  const [source, setSource] = useState(STARTER_CODE);
  const [sourceFiles, setSourceFiles] = useState<SourceFile[]>([]);
  const [activeFilePath, setActiveFilePath] = useState<string | null>(null);
  const [provider, setProvider] = useState<ProviderStatus>();
  const [courses, setCourses] = useState<ImportedCourseSummary[]>([]);
  const [importing, setImporting] = useState(false);
  const [importedCourse, setImportedCourse] = useState<ImportedCourseSummary | null>(null);
  const [importWarnings, setImportWarnings] = useState<ValidationIssue[]>([]);
  const [importFailure, setImportFailure] = useState<AppErrorShape | null>(null);
  const [repairCopied, setRepairCopied] = useState(false);
  const [showRuntimes, setShowRuntimes] = useState(false);
  const [runtimes, setRuntimes] = useState<RuntimeSummary[]>([]);
  const [runtimeOperation, setRuntimeOperation] = useState<RuntimeSummary["id"] | null>(null);
  const [runtimeOperationLabel, setRuntimeOperationLabel] = useState("Working");
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<ResolvedSetting[]>([]);
  const [settingsScope, setSettingsScope] = useState<SettingScope>("global");
  const [settingsSearch, setSettingsSearch] = useState("");
  const [showPrompt, setShowPrompt] = useState(false);
  const [promptForm, setPromptForm] = useState<CoursePromptRequest>(DEFAULT_PROMPT_FORM);
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [copied, setCopied] = useState(false);
  const [scaffoldMessage, setScaffoldMessage] = useState("");
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplate[]>(() => loadLocalList("learnlocal.promptTemplates"));
  const [promptHistory, setPromptHistory] = useState<PromptHistoryItem[]>(() => loadLocalList("learnlocal.promptHistory"));
  const [learningSummary, setLearningSummary] = useState<LearningSummary>({ totalAttempts: 0, completedExercises: 0, passedSubmissions: 0, currentStreakDays: 0, recentAttempts: [], activity: [], mastery: [] });
  const [activeCourse, setActiveCourse] = useState<CourseView | null>(null);
  const [activeLesson, setActiveLesson] = useState<CourseView["modules"][number]["lessons"][number] | null>(null);
  const [activeImportedExercise, setActiveImportedExercise] = useState<CourseView["modules"][number]["lessons"][number]["exercises"][number] | null>(null);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [quizCorrect, setQuizCorrect] = useState<boolean | null>(null);
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [error, setError] = useState<AppErrorShape | null>(null);
  const [activeExecution, setActiveExecution] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<"run" | "submit" | null>(null);
  const [executionPhase, setExecutionPhase] = useState("Preparing an isolated workspace…");
  const activeRef = useRef<string | null>(null);
  const activeActionRef = useRef<"run" | "submit" | null>(null);
  const activeCourseRef = useRef<CourseView | null>(null);
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
    const stopProgress = window.learnLocal.execution.onProgress((event) => {
      if (event.executionId === activeRef.current) setExecutionPhase(event.message);
    });
    const stopFinished = window.learnLocal.execution.onFinished((event) => {
      if (event.executionId !== activeRef.current) return;
      if ("result" in event) {
        setResult(event.result);
        setError(null);
        void window.learnLocal.progress.summary().then(setLearningSummary);
        const currentCourse = activeCourseRef.current;
        if (currentCourse && activeActionRef.current === "submit" && event.result.tests.length > 0 && event.result.tests.every((test) => test.passed)) {
          void window.learnLocal.courses.open(currentCourse.summary.id, currentCourse.summary.version).then((course) => {
            activeCourseRef.current = course;
            setActiveCourse(course);
          });
        }
      } else {
        setError(event.error);
      }
      activeRef.current = null;
      activeActionRef.current = null;
      setActiveExecution(null);
      setActiveAction(null);
    });
    return () => { stopProgress(); stopFinished(); };
  }, []);

  useEffect(() => { activeCourseRef.current = activeCourse; }, [activeCourse]);

  useEffect(() => {
    if (activeCourse) return;
    hydratedLanguage.current = null;
    void window.learnLocal.workspace.read(language).then(({ content }) => {
      setSource(content ?? (language === "java" ? STARTER_CODE : PYTHON_STARTER_CODE));
      hydratedLanguage.current = language;
    });
  }, [language, activeCourse]);

  useEffect(() => {
    if (activeCourse || hydratedLanguage.current !== language) return;
    const timeout = window.setTimeout(() => void window.learnLocal.workspace.write(language, source), 600);
    return () => window.clearTimeout(timeout);
  }, [language, source, activeCourse]);

  useEffect(() => {
    if (!activeCourse || !activeImportedExercise || !sourceFiles.length) return;
    const expectedPaths = activeImportedExercise.starterFiles.map((file) => file.path).sort();
    const currentPaths = sourceFiles.map((file) => file.path).sort();
    if (expectedPaths.length !== currentPaths.length || expectedPaths.some((path, index) => path !== currentPaths[index])) return;
    const timeout = window.setTimeout(() => void window.learnLocal.workspace.writeExercise({
      courseId: activeCourse.summary.id,
      version: activeCourse.summary.version,
      exerciseId: activeImportedExercise.id,
      files: sourceFiles
    }).catch((reason) => setError(friendlyError(reason))), 600);
    return () => window.clearTimeout(timeout);
  }, [activeCourse, activeImportedExercise, sourceFiles]);

  const execute = async (action: "run" | "submit") => {
    setResult(null);
    setError(null);
    setActiveAction(action);
    setExecutionPhase("Preparing an isolated workspace…");
    activeActionRef.current = action;
    try {
      const courseReference = activeCourse && activeImportedExercise ? { courseId: activeCourse.summary.id, courseVersion: activeCourse.summary.version, exerciseId: activeImportedExercise.id } : {};
      const { executionId } = await window.learnLocal.execution.start({ action, language, sourceCode: source, ...(sourceFiles.length ? { sourceFiles } : {}), ...courseReference });
      activeRef.current = executionId;
      setActiveExecution(executionId);
    } catch (value) {
      setError(friendlyError(value));
      setActiveAction(null);
      activeActionRef.current = null;
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
        setImportFailure(null);
        setImportedCourse(imported.course);
        setImportWarnings(imported.warnings);
        setCourses(await window.learnLocal.courses.list());
      } else if (imported.status === "failed") {
        setImportFailure(imported.error);
      }
    } catch (value) {
      setError(friendlyError(value));
    } finally {
      setImporting(false);
    }
  };

  const copyRepairPrompt = async () => {
    if (!importFailure) return;
    const issues = Array.isArray(importFailure.details?.issues) ? importFailure.details.issues as ValidationIssue[] : [];
    const issueText = issues.length
      ? issues.map((issue) => `- ${issue.file ?? "archive"}${issue.path ? ` ${issue.path}` : ""}: ${issue.message} (${issue.code})`).join("\n")
      : `- ${importFailure.message} (${importFailure.code})`;
    const prompt = `Repair my LearnPack 1.0 JSON source files using these validator findings:\n\n${issueText}\n\nReturn only the corrected files, one file per response. Start each response with SAVE AS: followed by the exact relative path, then one JSON code block containing only that file. Wait for me to say \"next file\" before returning another file. Do not create an archive; I will save and compress the JSON files into .learnpack myself. Preserve stable IDs and do not add shell commands, scripts, Docker configuration, executables, dependencies, HTML, or unsafe paths.`;
    await navigator.clipboard.writeText(prompt);
    setRepairCopied(true);
    window.setTimeout(() => setRepairCopied(false), 1500);
  };

  const openRuntimes = async () => {
    setShowRuntimes(true);
    try { setRuntimes(await window.learnLocal.runtimes.list()); }
    catch (value) { setError(friendlyError(value)); }
  };

  const runRuntimeOperation = async (runtime: RuntimeSummary, action: "install" | "verify" | "update" | "remove") => {
    setRuntimeOperation(runtime.id);
    setRuntimeOperationLabel(action === "install" ? "Installing" : action === "verify" ? "Verifying" : action === "update" ? "Updating" : "Removing");
    setError(null);
    try {
      if (action === "verify") await window.learnLocal.runtimes.verify(runtime.id);
      else if (action === "update") await window.learnLocal.runtimes.update(runtime.id);
      else if (action === "remove") await window.learnLocal.runtimes.remove(runtime.id);
      else await window.learnLocal.runtimes.install(runtime.id);
      setRuntimes(await window.learnLocal.runtimes.list());
    } catch (value) {
      setError(friendlyError(value));
      setRuntimes(await window.learnLocal.runtimes.list());
    } finally {
      setRuntimeOperation(null);
    }
  };

  const removeRuntimeAndData = async (runtime: RuntimeSummary) => {
    const confirmed = window.confirm(`Remove ${runtime.displayName} and all ${runtime.language} courses, saved workspaces, attempts, hints, and progress from this device? This cannot be undone.`);
    if (!confirmed) return;
    setRuntimeOperation(runtime.id);
    setRuntimeOperationLabel("Removing");
    setError(null);
    try {
      await window.learnLocal.runtimes.remove(runtime.id, true);
      setRuntimes(await window.learnLocal.runtimes.list());
      setCourses(await window.learnLocal.courses.list());
      setLearningSummary(await window.learnLocal.progress.summary());
      if (activeCourse?.summary.language === runtime.language) switchLanguage(runtime.language === "java" ? "python" : "java");
    } catch (value) { setError(friendlyError(value)); }
    finally { setRuntimeOperation(null); }
  };

  const switchLanguage = (next: "java" | "python") => {
    if (next === language || activeAction) return;
    setLanguage(next);
    setActiveCourse(null);
    setActiveLesson(null);
    setActiveImportedExercise(null);
    setSourceFiles([]);
    setActiveFilePath(null);
    setResult(null);
    setError(null);
  };

  const finishOnboarding = () => {
    localStorage.setItem("learnlocal.onboarding.complete", "1");
    setOnboardingStep(-1);
    setView("lesson");
  };

  const openImportedCourse = async (course: ImportedCourseSummary) => {
    try {
      const detail = await window.learnLocal.courses.open(course.id, course.version);
      const lesson = detail.modules.flatMap((module) => module.lessons).find((candidate) => candidate.exercises.length > 0);
      const exercise = lesson?.exercises[0];
      if (!lesson || !exercise) throw new Error("This course has no exercises.");
      setActiveCourse(detail);
      activeCourseRef.current = detail;
      setActiveLesson(lesson);
      setActiveImportedExercise(exercise);
      setLanguage(course.language);
      if (exercise.starterFiles.length) {
        const workspace = await window.learnLocal.workspace.readExercise({ courseId: course.id, version: course.version, exerciseId: exercise.id });
        setSourceFiles(workspace.files);
        setActiveFilePath(workspace.files[0]?.path ?? null);
        setSource(workspace.files[0]?.content ?? "");
      } else {
        setSourceFiles([]);
        setActiveFilePath(null);
        setSource("");
      }
      setResult(null);
      setSelectedChoice(null);
      setQuizCorrect(null);
      setView("lesson");
    } catch (reason) { setError(friendlyError(reason)); }
  };

  const selectCourseExercise = async (lesson: CourseView["modules"][number]["lessons"][number], exercise: CourseView["modules"][number]["lessons"][number]["exercises"][number]) => {
    setActiveLesson(lesson);
    setActiveImportedExercise(exercise);
    if (activeCourse && exercise.starterFiles.length) {
      const workspace = await window.learnLocal.workspace.readExercise({ courseId: activeCourse.summary.id, version: activeCourse.summary.version, exerciseId: exercise.id });
      setSourceFiles(workspace.files);
      setActiveFilePath(workspace.files[0]?.path ?? null);
      setSource(workspace.files[0]?.content ?? "");
    } else {
      setSourceFiles([]);
      setActiveFilePath(null);
      setSource("");
    }
    setSelectedChoice(null);
    setQuizCorrect(null);
    setResult(null);
  };

  const editSource = (content: string) => {
    setSource(content);
    if (activeFilePath) setSourceFiles((files) => files.map((file) => file.path === activeFilePath ? { ...file, content } : file));
  };

  const selectFile = (path: string) => {
    const file = sourceFiles.find((candidate) => candidate.path === path);
    if (!file) return;
    setActiveFilePath(path);
    setSource(file.content);
  };

  const resetExerciseWorkspace = () => {
    if (!activeImportedExercise) {
      setSource(language === "java" ? STARTER_CODE : PYTHON_STARTER_CODE);
      return;
    }
    const files = activeImportedExercise.starterFiles;
    setSourceFiles(files);
    setActiveFilePath(files[0]?.path ?? null);
    setSource(files[0]?.content ?? "");
  };

  const submitQuiz = async () => {
    if (!activeCourse || !activeImportedExercise || selectedChoice === null) return;
    try {
      const answer = await window.learnLocal.progress.submitQuiz({ courseId: activeCourse.summary.id, version: activeCourse.summary.version, exerciseId: activeImportedExercise.id, choiceIndex: selectedChoice });
      setQuizCorrect(answer.correct);
      if (answer.correct) {
        const updated = await window.learnLocal.courses.open(activeCourse.summary.id, activeCourse.summary.version);
        activeCourseRef.current = updated;
        setActiveCourse(updated);
        setActiveImportedExercise((current) => current ? { ...current, completed: true } : current);
      }
      setLearningSummary(await window.learnLocal.progress.summary());
    } catch (reason) { setError(friendlyError(reason)); }
  };

  const revealNextHint = async () => {
    if (!activeCourse || !activeImportedExercise || activeImportedExercise.hints.length >= activeImportedExercise.hintCount) return;
    try {
      const answer = await window.learnLocal.progress.revealHint({
        courseId: activeCourse.summary.id,
        version: activeCourse.summary.version,
        exerciseId: activeImportedExercise.id,
        hintIndex: activeImportedExercise.hints.length
      });
      setActiveImportedExercise((current) => current ? { ...current, hints: [...current.hints, answer.hint] } : current);
    } catch (reason) { setError(friendlyError(reason)); }
  };

  const openSettings = async () => {
    setShowSettings(true);
    setSettingsScope("global");
    try { setSettings(await window.learnLocal.settings.list()); }
    catch (value) { setError(friendlyError(value)); }
  };

  const settingsContext = (scope: SettingScope) => scope === "global" ? {} : scope === "language" ? { language } : { language, ...(activeCourse ? { courseId: activeCourse.summary.id } : {}) };
  const settingsScopeId = (scope: SettingScope) => scope === "global" ? null : scope === "language" ? language : activeCourse?.summary.id ?? null;

  const changeSettingsScope = async (scope: SettingScope) => {
    if (scope === "course" && !activeCourse) return;
    setSettingsScope(scope);
    try { setSettings(await window.learnLocal.settings.list(settingsContext(scope))); }
    catch (reason) { setError(friendlyError(reason)); }
  };

  const updateSetting = async (setting: ResolvedSetting, value: SettingValue) => {
    try {
      await window.learnLocal.settings.set({ key: setting.key, value, scope: settingsScope, scopeId: settingsScopeId(settingsScope) });
      setSettings(await window.learnLocal.settings.list(settingsContext(settingsScope)));
    }
    catch (reason) { setError(friendlyError(reason)); }
  };

  const resetSetting = async (setting: ResolvedSetting) => {
    try {
      await window.learnLocal.settings.reset({ key: setting.key, scope: settingsScope, scopeId: settingsScopeId(settingsScope) });
      setSettings(await window.learnLocal.settings.list(settingsContext(settingsScope)));
    }
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
      const next = [{ id: crypto.randomUUID(), createdAt: new Date().toISOString(), prompt: generated.prompt }, ...promptHistory].slice(0, 10);
      setPromptHistory(next);
      localStorage.setItem("learnlocal.promptHistory", JSON.stringify(next));
      setCopied(false);
    } catch (reason) { setError(friendlyError(reason)); }
  };

  const savePromptTemplate = () => {
    const name = window.prompt("Template name", `${promptForm.language === "java" ? "Java" : "Python"} course` )?.trim();
    if (!name) return;
    const next = [{ id: crypto.randomUUID(), name, form: promptForm }, ...promptTemplates].slice(0, 20);
    setPromptTemplates(next);
    localStorage.setItem("learnlocal.promptTemplates", JSON.stringify(next));
  };

  const removePromptTemplate = (id: string) => {
    const next = promptTemplates.filter((template) => template.id !== id);
    setPromptTemplates(next);
    localStorage.setItem("learnlocal.promptTemplates", JSON.stringify(next));
  };

  const copyPrompt = async () => {
    await navigator.clipboard.writeText(generatedPrompt);
    setCopied(true);
  };

  const scaffoldFromManifest = async () => {
    setScaffoldMessage("");
    try {
      const result = await window.learnLocal.prompts.scaffold();
      if (result.status === "created") setScaffoldMessage(`${result.created} file${result.created === 1 ? "" : "s"} created, ${result.existing} preserved for ${result.courseId}.`);
    } catch (reason) { setError(friendlyError(reason)); }
  };

  const editorFontSize = settings.find((setting) => setting.key === "editor.fontSize")?.value;
  const editorWordWrap = settings.find((setting) => setting.key === "editor.wordWrap")?.value;
  const activeStarter = activeImportedExercise?.starterFiles.find((file) => file.path === activeFilePath) ?? activeImportedExercise?.starterFiles[0];
  const courseExercises = activeCourse?.modules.flatMap((module) => module.lessons).flatMap((lesson) => lesson.exercises) ?? [];
  const completedCourseExercises = courseExercises.filter((exercise) => exercise.completed).length;

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
          <button className="nav-item" onClick={() => void window.learnLocal.diagnostics.export()}><span>?</span>Export diagnostics</button>
        </nav>
        <StatusDot status={provider} />
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="crumbs"><span>{activeCourse?.summary.title ?? `${language === "java" ? "Java" : "Python"} Foundations`}</span><b>/</b><span>{activeLesson?.title ?? `${language === "java" ? "Arrays" : "Lists"} & loops`}</span><b>/</b><strong>{activeImportedExercise?.title ?? `Sum ${language === "java" ? "an Array" : "a List"}`}</strong></div>
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
            <div className="progress-chip"><span>{activeCourse ? "Course progress" : "Exercises completed"}</span><b>{activeCourse ? `${completedCourseExercises} / ${courseExercises.length}` : learningSummary.completedExercises}</b></div>
          </div>
        </header>

        <div className="lesson-grid">
          <article className="lesson-pane">
            {activeCourse && <div className="course-outline"><strong>Course outline</strong>{activeCourse.modules.flatMap((module) => module.lessons).map((lesson) => <div key={lesson.id}><span>{lesson.title}</span>{lesson.exercises.map((exercise) => <button className={`${exercise.id === activeImportedExercise?.id ? "active" : ""} ${exercise.completed ? "completed" : ""}`} key={exercise.id} onClick={() => void selectCourseExercise(lesson, exercise)}>{exercise.completed ? "✓" : exercise.type === "multipleChoice" ? "?" : exercise.type === "debug" ? "⌁" : exercise.type === "project" ? "◆" : "›"} {exercise.title}</button>)}</div>)}{activeCourse.projects.length > 0 && <div className="project-milestones"><span>Project milestones</span>{activeCourse.projects.map((project) => <article key={project.id}><strong>{project.title}</strong><small>{project.checkpointExerciseIds.filter((id) => courseExercises.find((exercise) => exercise.id === id)?.completed).length} / {project.checkpointExerciseIds.length} checkpoints</small><SafeMarkdown value={project.descriptionMarkdown}/></article>)}</div>}</div>}
            <div className="eyebrow">{(activeImportedExercise?.type ?? "function").toUpperCase()} EXERCISE · {language === "java" ? "JAVA 21" : "PYTHON 3.13"}</div>
            <h1>{activeImportedExercise?.title ?? `Sum ${language === "java" ? "an Array" : "a List"}`}</h1>
            <SafeMarkdown className="lede" value={activeImportedExercise?.instructionMarkdown ?? `Practice traversing ${language === "java" ? "an array" : "a list"} and carrying a result through each iteration.`}/>
            <div className="concept-card">
              <span className="concept-icon">∑</span>
              <div><strong>{activeLesson?.title ?? "The accumulator pattern"}</strong><SafeMarkdown value={activeLesson?.theoryMarkdown ?? "Start with a neutral value, update it once per element, then return the final result."}/></div>
            </div>
            {!activeImportedExercise && <><h2>Your task</h2>
            <p>Complete <code>{language === "java" ? "sum" : "sum_values"}</code> so it returns the total of every number in <code>values</code>.</p>
            <ul>
              <li>An empty array should return <code>0</code>.</li>
              <li>Values may be positive, negative, or zero.</li>
              <li>Do not change the class or method signature.</li>
            </ul>
            <div className="example-block"><span>Example</span><code>{language === "java" ? "sum(new int[] {1, 2, 3}) → 6" : "sum_values([1, 2, 3]) → 6"}</code></div></>}
            {(activeImportedExercise?.hints ?? ["Create a variable named total before the loop."]).map((hint, index) => <details className="hint" key={`${index}-${hint}`} open><summary>Hint {index + 1} of {activeImportedExercise?.hintCount ?? 1}</summary><p>{hint}</p></details>)}
            {activeImportedExercise && activeImportedExercise.hints.length < activeImportedExercise.hintCount && <button className="ghost-button reveal-hint" type="button" onClick={() => void revealNextHint()}>Reveal hint {activeImportedExercise.hints.length + 1}</button>}
          </article>

          {activeImportedExercise?.type === "multipleChoice" ? (
            <section className="quiz-pane">
              <div className="quiz-heading"><span>CONCEPT CHECK</span><strong>{activeImportedExercise.title}</strong><SafeMarkdown value={activeImportedExercise.instructionMarkdown}/></div>
              <div className="quiz-choices">{activeImportedExercise.choices?.map((choice, index) => <button key={choice} className={`${selectedChoice === index ? "selected" : ""} ${quizCorrect !== null && selectedChoice === index ? quizCorrect ? "correct" : "incorrect" : ""}`} disabled={quizCorrect === true} onClick={() => { setSelectedChoice(index); setQuizCorrect(null); }}><span>{String.fromCharCode(65 + index)}</span>{choice}</button>)}</div>
              {quizCorrect !== null && <div className={`quiz-feedback ${quizCorrect ? "correct" : "incorrect"}`}><strong>{quizCorrect ? "Correct" : "Not quite"}</strong><p>{quizCorrect ? "Concept check completed. Your progress was saved." : "Review the lesson and try another answer."}</p></div>}
              <div className="quiz-actions"><button className="submit-button" disabled={selectedChoice === null || quizCorrect === true} onClick={() => void submitQuiz()}>{quizCorrect === false ? "Try again" : "Check answer"}</button></div>
            </section>
          ) : (
          <section className="coding-pane">
            <div className="editor-toolbar">
              <div className="file-tabs">{sourceFiles.length ? sourceFiles.map((file) => <button type="button" className={`file-tab ${file.path === activeFilePath ? "active" : ""}`} key={file.path} onClick={() => selectFile(file.path)}><span className={`java-icon ${language}`}>{language === "java" ? "J" : "Py"}</span>{file.path}</button>) : <div className="file-tab active"><span className={`java-icon ${language}`}>{language === "java" ? "J" : "Py"}</span>{language === "java" ? "Solution.java" : "solution.py"} <i>●</i></div>}</div>
              <div className="toolbar-actions">
                <div className="language-switch" aria-label="Exercise language">
                  <button className={language === "java" ? "active" : ""} onClick={() => switchLanguage("java")}>Java</button>
                  <button className={language === "python" ? "active" : ""} onClick={() => switchLanguage("python")}>Python</button>
                </div>
                <button className="ghost-button" onClick={resetExerciseWorkspace} disabled={Boolean(activeAction)}>Reset</button>
                {!activeCourse && <button className="ghost-button" onClick={() => setSource(language === "java" ? SOLUTION_CODE : PYTHON_SOLUTION_CODE)} disabled={Boolean(activeAction)}>Show solution</button>}
              </div>
            </div>
            <div className="editor-wrap">
              <Editor
                language={language}
                theme={theme === "dark" ? "vs-dark" : "light"}
                value={source}
                onChange={(value) => editSource(value ?? "")}
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
              {activeAction ? <div className="running-state"><span className="spinner"/><strong>{executionPhase}</strong><p>The first run can take longer while Docker downloads the pinned runtime.</p></div> : <ResultPanel result={result} error={error} />}
            </section>
          </section>
          )}
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
            <article className="mastery-card"><div><strong>Current confidence</strong><span>Recent submissions</span></div>{learningSummary.mastery.length ? learningSummary.mastery.map((item) => <div className="mastery-row" key={item.exerciseId}><p><strong>{item.exerciseId.split(":").at(-1)?.replaceAll("-", " ")}</strong><small>{item.attempts} recent attempt{item.attempts === 1 ? "" : "s"}</small></p><div><i style={{ width: `${item.confidence}%` }}/></div><b>{item.confidence}%</b></div>) : <p className="dashboard-empty">Submit an exercise to calculate confidence.</p>}</article>
          </div>
        </section>
      )}
      {view === "courses" && (
        <section className="content-view courses-view">
          <header><div><div className="eyebrow">COURSE LIBRARY</div><h1>My courses</h1><p>Built-in and imported courses are available offline.</p></div><button className="run-button" onClick={() => void importCourse()}>Import LearnPack</button></header>
          <div className="course-grid">
            <article className="course-card"><span className="course-language java">J</span><div><small>BUILT IN · JAVA 21</small><h2>Java Foundations</h2><p>Arrays, loops, functions, debugging, and tests.</p><div><span>Interactive exercise</span><span>Local runtime</span></div></div><button className="submit-button" onClick={() => { switchLanguage("java"); setView("lesson"); }}>Continue</button></article>
            <article className="course-card"><span className="course-language python">Py</span><div><small>BUILT IN · PYTHON 3.13</small><h2>Python Foundations</h2><p>Lists, loops, functions, tracebacks, and tests.</p><div><span>Interactive exercise</span><span>Local runtime</span></div></div><button className="submit-button" onClick={() => { switchLanguage("python"); setView("lesson"); }}>Continue</button></article>
            {courses.map((course) => <article className="course-card imported" key={`${course.id}-${course.version}`}><span className={`course-language ${course.language}`}>{course.language === "java" ? "J" : "Py"}</span><div><small>IMPORTED · {course.language.toUpperCase()} {course.languageVersion}</small><h2>{course.title}</h2><p>{course.description}</p><div><span>{course.moduleCount} modules</span><span>{course.exerciseCount} exercises</span><span>{course.estimatedHours} hours</span></div></div><button className="run-button" onClick={() => void openImportedCourse(course)}>Open</button></article>)}
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
            {importWarnings.length > 0 && <div className="import-warnings"><strong>Imported with {importWarnings.length} warning{importWarnings.length === 1 ? "" : "s"}</strong>{importWarnings.map((warning, index) => <p key={`${warning.code}-${index}`}><span>{warning.code}</span>{warning.message}</p>)}</div>}
            <button className="submit-button modal-action" onClick={() => setImportedCourse(null)}>View course</button>
          </section>
        </div>
      )}
      {importFailure && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setImportFailure(null)}>
          <section className="import-modal import-failure" role="dialog" aria-modal="true" aria-labelledby="import-failure-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" aria-label="Close import error" onClick={() => setImportFailure(null)}>×</button>
            <span className="import-failure-mark">!</span>
            <div className="eyebrow">LEARNPACK NEEDS REPAIR</div>
            <h2 id="import-failure-title">The course was not imported</h2>
            <p>{importFailure.message}</p>
            <div className="import-issues">{(Array.isArray(importFailure.details?.issues) ? importFailure.details.issues as ValidationIssue[] : []).map((issue, index) => <article key={`${issue.code}-${index}`}><strong>{issue.file ?? "Archive"}{issue.path ? ` · ${issue.path}` : ""}</strong><span>{issue.message}</span><code>{issue.code}</code></article>)}</div>
            <div className="import-repair-note">Fix the original JSON files, rebuild the archive with manifest.json at its root, then import it again.</div>
            <div className="import-failure-actions"><button className="run-button" onClick={() => void copyRepairPrompt()}>{repairCopied ? "Repair prompt copied" : "Copy AI repair prompt"}</button><button className="submit-button" onClick={() => setImportFailure(null)}>Close</button></div>
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
                      <div><strong>{runtime.displayName}</strong><span className={`runtime-state ${runtime.status}`}>{busy ? runtimeOperationLabel : runtime.status.replace("-", " ")}</span></div>
                      <p>Docker · {formatBytes(runtime.sizeBytes)} · {runtime.activeExecutions} active</p>
                      <small>{runtime.imageReference.slice(0, 48)}…</small>
                    </div>
                    <div className="runtime-actions">
                      {runtime.status === "ready" ? <>
                        <button className="runtime-install" disabled={Boolean(runtimeOperation)} onClick={() => void runRuntimeOperation(runtime, "verify")}>Verify</button>
                        <button className="runtime-install" disabled={Boolean(runtimeOperation)} onClick={() => void runRuntimeOperation(runtime, "update")}>Update</button>
                        <button className="runtime-remove" disabled={Boolean(runtimeOperation)} onClick={() => void runRuntimeOperation(runtime, "remove")}>Remove</button>
                      </> : <button className="runtime-install" disabled={Boolean(runtimeOperation)} onClick={() => void runRuntimeOperation(runtime, "install")}>{busy ? "Working…" : runtime.status === "broken" ? "Repair" : "Install"}</button>}
                    </div>
                    {runtime.status === "ready" && <button className="runtime-remove-data" disabled={Boolean(runtimeOperation)} onClick={() => void removeRuntimeAndData(runtime)}>Remove all data</button>}
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
            <div className="settings-toolbar"><div className="settings-scopes"><button className={settingsScope === "global" ? "active" : ""} onClick={() => void changeSettingsScope("global")}>Global</button><button className={settingsScope === "language" ? "active" : ""} onClick={() => void changeSettingsScope("language")}>{language === "java" ? "Java" : "Python"}</button><button className={settingsScope === "course" ? "active" : ""} disabled={!activeCourse} title={activeCourse ? activeCourse.summary.title : "Open an imported course to edit course settings"} onClick={() => void changeSettingsScope("course")}>Course</button></div><input type="search" value={settingsSearch} placeholder="Search settings" aria-label="Search settings" onChange={(event) => setSettingsSearch(event.target.value)} /></div>
            <div className="settings-scope-note">Editing <strong>{settingsScope}</strong> settings{settingsScope === "language" ? ` for ${language}` : settingsScope === "course" && activeCourse ? ` for ${activeCourse.summary.title}` : ""}. More specific values override broader ones.</div>
            <div className="settings-list">
              {settings.filter((setting) => `${setting.label} ${setting.description} ${setting.category}`.toLowerCase().includes(settingsSearch.toLowerCase())).map((setting) => (
                <label className="setting-row" key={setting.key}>
                  <span className="setting-copy"><strong>{setting.label}</strong><small>{setting.description}</small><i>{setting.source}</i></span>
                  <span className="setting-control">
                    {setting.type === "boolean" && <input type="checkbox" checked={setting.value === true} onChange={(event) => void updateSetting(setting, event.target.checked)} />}
                    {setting.type === "number" && <input type="number" min={setting.min} max={setting.max} value={Number(setting.value)} onChange={(event) => void updateSetting(setting, Number(event.target.value))} />}
                    {setting.type === "enum" && <select value={String(setting.value)} onChange={(event) => void updateSetting(setting, event.target.value)}>{setting.options?.map((option) => <option key={option}>{option}</option>)}</select>}
                    {setting.type === "string" && <textarea value={String(setting.value)} placeholder="No custom instructions" onChange={(event) => void updateSetting(setting, event.target.value)} />}
                    {setting.source === settingsScope && <button type="button" onClick={() => void resetSetting(setting)}>Reset override</button>}
                  </span>
                </label>
              ))}
            </div>
            <div className="settings-actions">
              <button className="run-button" onClick={() => void window.learnLocal.settings.importProfile().then(() => window.learnLocal.settings.list(settingsContext(settingsScope)).then(setSettings))}>Import profile</button>
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
            <p>Describe your goal, then paste the prompt into any AI assistant. Save its manifest first, let LearnLocal create the referenced files, and paste each JSON block into its matching file.</p>
            <div className="prompt-layout">
              <div className="prompt-form">
                <div className="prompt-template-bar"><select aria-label="Load prompt template" defaultValue="" onChange={(event) => { const template = promptTemplates.find((candidate) => candidate.id === event.target.value); if (template) setPromptForm(template.form); event.target.value = ""; }}><option value="">Load template…</option>{promptTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select><button type="button" onClick={savePromptTemplate}>Save current</button></div>
                {promptTemplates.length > 0 && <div className="prompt-template-chips">{promptTemplates.map((template) => <span key={template.id}><button type="button" onClick={() => setPromptForm(template.form)}>{template.name}</button><button type="button" aria-label={`Delete ${template.name} template`} onClick={() => removePromptTemplate(template.id)}>×</button></span>)}</div>}
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
                {generatedPrompt && <><aside className="prompt-pack-note"><strong>After generation</strong><span>Save manifest.json, create its referenced files, paste each JSON block, then ZIP the folder contents and rename it .learnpack.</span></aside><button className="run-button" onClick={() => void copyPrompt()}>{copied ? "Copied" : "Copy prompt"}</button></>}
              </div>
            </div>
            <div className="manifest-scaffold"><div><strong>Have a manifest.json?</strong><span>Create every referenced content and project file beside it. Existing files are never overwritten.</span>{scaffoldMessage && <small>{scaffoldMessage}</small>}</div><button className="run-button" type="button" onClick={() => void scaffoldFromManifest()}>Create files from manifest</button></div>
            {promptHistory.length > 0 && <details className="prompt-history"><summary>Local prompt history ({promptHistory.length})</summary><div>{promptHistory.map((item, index) => <article key={item.id}><span>{new Date(item.createdAt).toLocaleString()}</span><small>{item.prompt.length.toLocaleString()} characters</small><button type="button" onClick={() => setGeneratedPrompt(item.prompt)}>Restore</button>{index === 0 || !generatedPrompt || item.prompt === generatedPrompt ? null : <details><summary>Compare with current</summary><div className="prompt-compare"><pre>{item.prompt}</pre><pre>{generatedPrompt}</pre></div></details>}</article>)}</div></details>}
          </section>
        </div>
      )}
      {onboardingStep >= 0 && (
        <div className="modal-backdrop onboarding-backdrop">
          <section className="onboarding-modal" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
            <div className="onboarding-progress" aria-label={`Onboarding step ${onboardingStep + 1} of 3`}><i className="active"/><i className={onboardingStep >= 1 ? "active" : ""}/><i className={onboardingStep >= 2 ? "active" : ""}/></div>
            {onboardingStep === 0 && <><span className="onboarding-mark">L</span><div className="eyebrow">WELCOME TO LEARNLOCAL</div><h2 id="onboarding-title">Learn programming privately, on your computer</h2><p>Courses, code, settings, and progress stay on this device. LearnLocal does not require an account and does not send your work to an AI service.</p><div className="onboarding-points"><span>✓ Portable LearnPack courses</span><span>✓ Disposable, network-disabled runtimes</span><span>✓ Progress stored locally</span></div></>}
            {onboardingStep === 1 && <><div className="eyebrow">CHOOSE A STARTING LANGUAGE</div><h2 id="onboarding-title">What would you like to learn first?</h2><p>You can switch languages and import other courses at any time.</p><div className="onboarding-languages"><button className={language === "java" ? "active" : ""} onClick={() => switchLanguage("java")}><b>J</b><strong>Java 21</strong><small>Structured and widely used</small></button><button className={language === "python" ? "active" : ""} onClick={() => switchLanguage("python")}><b>Py</b><strong>Python 3.13</strong><small>Readable and beginner-friendly</small></button></div></>}
            {onboardingStep === 2 && <><div className="eyebrow">ENVIRONMENT CHECK</div><h2 id="onboarding-title">{provider?.available ? "Your local runner is ready" : "Finish setting up Docker"}</h2><p>{provider?.available ? `Docker ${provider.version ?? ""} is available. Install a language runtime when you run your first exercise.` : "LearnLocal needs Docker Desktop or Docker Engine to run code safely. You can still browse courses and generate prompts before installing it."}</p><div className={`onboarding-status ${provider?.available ? "ready" : "warning"}`}><span>{provider?.available ? "✓" : "!"}</span><div><strong>{provider?.available ? "Sandbox provider detected" : "Docker is not available yet"}</strong><small>{provider?.message ?? "Checking the local environment…"}</small></div></div></>}
            <footer><button className="ghost-button" disabled={onboardingStep === 0} onClick={() => setOnboardingStep((step) => Math.max(0, step - 1))}>Back</button>{onboardingStep < 2 ? <button className="submit-button" onClick={() => setOnboardingStep((step) => step + 1)}>Continue</button> : <button className="submit-button" onClick={finishOnboarding}>Start learning</button>}</footer>
          </section>
        </div>
      )}
    </main>
  );
}
