import { randomUUID } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app, BrowserWindow, dialog, ipcMain, session, shell, type IpcMainInvokeEvent } from "electron";
import {
  AppError,
  cancelRequestSchema,
  courseOpenSchema,
  coursePromptRequestSchema,
  hintRevealSchema,
  IPC_CHANNELS,
  runRequestSchema,
  quizSubmitSchema,
  runtimeRequestSchema,
  settingMutationSchema,
  settingResetSchema,
  settingsContextSchema,
  workspaceReadSchema,
  workspaceWriteSchema,
  toAppError,
  type ExecutionFinishedEvent
} from "@learnlocal/contracts";
import { AttemptRepository } from "@learnlocal/database";
import { importLearnPack, listImportedCourses, loadImportedCourse, toCourseView } from "@learnlocal/learnpack";
import { EXECUTION_POLICY, type FunctionEntrypoint, type OutputTestDefinition } from "@learnlocal/runner-core";
import { java21Adapter, SUM_EXERCISE } from "@learnlocal/runner-java";
import { python3Adapter, PYTHON_SUM_EXERCISE } from "@learnlocal/runner-python";
import { DockerProvider } from "@learnlocal/sandbox-docker";
import { createSettingsProfile, parseSettingsProfile, resolveSettings, validateSettingValue } from "@learnlocal/settings-core";
import { buildCoursePrompt } from "@learnlocal/prompt-generator";

const docker = new DockerProvider();
let attempts: AttemptRepository | undefined;

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  if (event.senderFrame !== event.sender.mainFrame) {
    throw new AppError("IPC_UNTRUSTED_SENDER", "system", "This request did not come from the main application frame.");
  }

  const url = event.senderFrame.url;
  const devUrl = process.env.ELECTRON_RENDERER_URL;
  if (devUrl ? !url.startsWith(devUrl) : !url.startsWith("file://")) {
    throw new AppError("IPC_UNTRUSTED_ORIGIN", "system", "This request came from an untrusted origin.");
  }
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1060,
    minHeight: 680,
    backgroundColor: "#0c1015",
    title: "LearnLocal",
    show: false,
    webPreferences: {
      preload: join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true
    }
  });

  window.once("ready-to-show", () => window.show());
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    const current = window.webContents.getURL();
    if (url !== current) event.preventDefault();
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    void window.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

function registerIpc(): void {
  ipcMain.handle(IPC_CHANNELS.coursesImport, async (event) => {
    assertTrustedSender(event);
    const selected = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender)!, {
      title: "Import a LearnPack",
      properties: ["openFile"],
      filters: [{ name: "LearnLocal course", extensions: ["learnpack"] }]
    });
    const sourcePath = selected.filePaths[0];
    if (selected.canceled || !sourcePath) return { status: "cancelled" as const };
    const imported = await importLearnPack(sourcePath, join(app.getPath("userData"), "courses"));
    return { status: "imported" as const, course: imported.summary, warnings: imported.warnings };
  });

  ipcMain.handle(IPC_CHANNELS.coursesList, async (event) => {
    assertTrustedSender(event);
    return listImportedCourses(join(app.getPath("userData"), "courses"));
  });

  ipcMain.handle(IPC_CHANNELS.coursesOpen, async (event, input: unknown) => {
    assertTrustedSender(event);
    const { courseId, version } = courseOpenSchema.parse(input);
    const pack = await loadImportedCourse(join(app.getPath("userData"), "courses"), courseId, version);
    return toCourseView(
      pack,
      (exerciseId) => attempts?.revealedHintCount(`${courseId}:${exerciseId}`) ?? 0,
      (exerciseId) => attempts?.isExerciseCompleted(`${courseId}:${exerciseId}`) ?? false
    );
  });

  ipcMain.handle(IPC_CHANNELS.runtimesList, async (event) => {
    assertTrustedSender(event);
    return docker.listRuntimes();
  });

  ipcMain.handle(IPC_CHANNELS.runtimesInstall, async (event, input: unknown) => {
    assertTrustedSender(event);
    const { runtimeId } = runtimeRequestSchema.parse(input);
    return docker.installManagedRuntime(runtimeId);
  });

  ipcMain.handle(IPC_CHANNELS.runtimesRemove, async (event, input: unknown) => {
    assertTrustedSender(event);
    const { runtimeId } = runtimeRequestSchema.parse(input);
    return docker.removeManagedRuntime(runtimeId);
  });

  ipcMain.handle(IPC_CHANNELS.settingsList, (event, input: unknown) => {
    assertTrustedSender(event);
    const context = settingsContextSchema.parse(input ?? {});
    return resolveSettings(attempts?.listSettings() ?? [], context);
  });

  ipcMain.handle(IPC_CHANNELS.settingsSet, (event, input: unknown) => {
    assertTrustedSender(event);
    const mutation = settingMutationSchema.parse(input);
    const scopeId = mutation.scope === "global" ? "" : mutation.scopeId;
    if (!scopeId && mutation.scope !== "global") throw new AppError("SETTING_SCOPE_INVALID", "validation", "Language and course settings require a scope identifier.");
    if (mutation.scope === "language" && scopeId !== "java" && scopeId !== "python") throw new AppError("SETTING_SCOPE_INVALID", "validation", "Unknown language scope.");
    attempts?.setSetting(mutation.key, mutation.scope, scopeId ?? "", validateSettingValue(mutation.key, mutation.value));
    const context = mutation.scope === "language" ? { language: scopeId as "java" | "python" } : mutation.scope === "course" ? { courseId: scopeId ?? undefined } : {};
    return resolveSettings(attempts?.listSettings() ?? [], context);
  });

  ipcMain.handle(IPC_CHANNELS.settingsReset, (event, input: unknown) => {
    assertTrustedSender(event);
    const reset = settingResetSchema.parse(input);
    const scopeId = reset.scope === "global" ? "" : reset.scopeId;
    if (!scopeId && reset.scope !== "global") throw new AppError("SETTING_SCOPE_INVALID", "validation", "Language and course settings require a scope identifier.");
    attempts?.resetSetting(reset.key, reset.scope, scopeId ?? "");
    return resolveSettings(attempts?.listSettings() ?? []);
  });

  ipcMain.handle(IPC_CHANNELS.settingsExport, async (event) => {
    assertTrustedSender(event);
    const selected = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender)!, {
      title: "Export LearnLocal settings",
      defaultPath: "learnlocal-settings.json",
      filters: [{ name: "JSON", extensions: ["json"] }]
    });
    if (selected.canceled || !selected.filePath) return { status: "cancelled" as const };
    const profile = createSettingsProfile(attempts?.listSettings() ?? []);
    await writeFile(selected.filePath, JSON.stringify(profile, null, 2), "utf8");
    return { status: "saved" as const };
  });

  ipcMain.handle(IPC_CHANNELS.settingsImport, async (event) => {
    assertTrustedSender(event);
    const selected = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender)!, {
      title: "Import LearnLocal settings",
      properties: ["openFile"],
      filters: [{ name: "LearnLocal settings", extensions: ["json"] }]
    });
    const path = selected.filePaths[0];
    if (selected.canceled || !path) return { status: "cancelled" as const, changed: 0 };
    const profile = parseSettingsProfile(JSON.parse(await readFile(path, "utf8")) as unknown);
    attempts?.replaceGlobalSettings(profile);
    return { status: "imported" as const, changed: profile.length };
  });

  ipcMain.handle(IPC_CHANNELS.promptsGenerate, (event, input: unknown) => {
    assertTrustedSender(event);
    return { prompt: buildCoursePrompt(coursePromptRequestSchema.parse(input)) };
  });

  ipcMain.handle(IPC_CHANNELS.progressSummary, (event) => {
    assertTrustedSender(event);
    return attempts?.learningSummary() ?? { totalAttempts: 0, completedExercises: 0, passedSubmissions: 0, currentStreakDays: 0, recentAttempts: [], activity: [] };
  });

  ipcMain.handle(IPC_CHANNELS.progressSubmitQuiz, async (event, input: unknown) => {
    assertTrustedSender(event);
    const request = quizSubmitSchema.parse(input);
    const pack = await loadImportedCourse(join(app.getPath("userData"), "courses"), request.courseId, request.version);
    const exercise = pack.modules.flatMap((module) => module.lessons).flatMap((lesson) => lesson.exercises).find((candidate) => candidate.id === request.exerciseId);
    if (!exercise || exercise.type !== "multipleChoice" || !exercise.choices || exercise.correctChoice === undefined) throw new AppError("QUIZ_NOT_FOUND", "validation", "The requested concept check is unavailable.");
    if (request.choiceIndex >= exercise.choices.length) throw new AppError("QUIZ_CHOICE_INVALID", "validation", "The selected answer is unavailable.");
    const correct = request.choiceIndex === exercise.correctChoice;
    attempts?.recordQuizAttempt(`quiz_${randomUUID()}`, `${request.courseId}:${exercise.id}`, request.choiceIndex, correct);
    return { correct };
  });

  ipcMain.handle(IPC_CHANNELS.progressRevealHint, async (event, input: unknown) => {
    assertTrustedSender(event);
    const request = hintRevealSchema.parse(input);
    const pack = await loadImportedCourse(join(app.getPath("userData"), "courses"), request.courseId, request.version);
    const exercise = pack.modules.flatMap((module) => module.lessons).flatMap((lesson) => lesson.exercises).find((candidate) => candidate.id === request.exerciseId);
    const hint = exercise?.hints?.[request.hintIndex];
    if (!exercise || hint === undefined) throw new AppError("HINT_NOT_FOUND", "validation", "The requested hint is unavailable.");
    const progressId = `${request.courseId}:${exercise.id}`;
    const revealed = attempts?.revealedHintCount(progressId) ?? 0;
    if (request.hintIndex > revealed) throw new AppError("HINT_ORDER_INVALID", "validation", "Hints must be revealed in order.");
    const revealedCount = attempts?.revealHint(progressId, request.hintIndex) ?? request.hintIndex + 1;
    return { hint, revealedCount };
  });

  ipcMain.handle(IPC_CHANNELS.workspaceRead, (event, input: unknown) => {
    assertTrustedSender(event);
    const { language } = workspaceReadSchema.parse(input);
    return { content: attempts?.readWorkspace(language) ?? null };
  });

  ipcMain.handle(IPC_CHANNELS.workspaceWrite, (event, input: unknown) => {
    assertTrustedSender(event);
    const { language, content } = workspaceWriteSchema.parse(input);
    attempts?.writeWorkspace(language, content);
  });

  ipcMain.handle(IPC_CHANNELS.diagnosticsExport, async (event) => {
    assertTrustedSender(event);
    const selected = await dialog.showSaveDialog(BrowserWindow.fromWebContents(event.sender)!, {
      title: "Export LearnLocal diagnostics",
      defaultPath: `learnlocal-diagnostics-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }]
    });
    if (selected.canceled || !selected.filePath) return { status: "cancelled" as const };
    const diagnostics = {
      format: "learnlocal-diagnostics",
      schemaVersion: "1.0.0",
      createdAt: new Date().toISOString(),
      application: { version: app.getVersion(), electron: process.versions.electron, node: process.versions.node },
      platform: { os: process.platform, architecture: process.arch },
      provider: await docker.detect(),
      runtimes: await docker.listRuntimes(),
      learning: attempts?.learningSummary()
    };
    await writeFile(selected.filePath, JSON.stringify(diagnostics, null, 2), "utf8");
    return { status: "saved" as const };
  });

  ipcMain.handle(IPC_CHANNELS.environmentStatus, async (event) => {
    assertTrustedSender(event);
    return docker.detect();
  });

  ipcMain.handle(IPC_CHANNELS.executionStart, (event, input: unknown) => {
    assertTrustedSender(event);
    const request = runRequestSchema.parse(input);
    const executionId = `exec_${randomUUID()}`;
    const sender = event.sender;

    void (async () => {
      let workspaceDirectory: string | undefined;
      try {
        const startedAt = Date.now();
        let result;
        let exerciseId: string;
        let importedTests: Array<{ id: string; visibility: "public" | "hidden"; arguments: number[]; expected: number }> | undefined;
        let outputTests: OutputTestDefinition[] | undefined;
        let importedExerciseType: "function" | "debug" | "output" | "project" | undefined;
        let importedEntrypoint: FunctionEntrypoint | undefined;
        let executionLimits: { [Key in keyof typeof EXECUTION_POLICY]: number } = EXECUTION_POLICY;
        if (request.courseId && request.courseVersion && request.exerciseId) {
          const pack = await loadImportedCourse(join(app.getPath("userData"), "courses"), request.courseId, request.courseVersion);
          if (pack.manifest.course.language !== request.language) throw new AppError("PACK_LANGUAGE_MISMATCH", "validation", "The requested exercise does not match the selected language.");
          const exercise = pack.modules.flatMap((module) => module.lessons).flatMap((lesson) => lesson.exercises).find((candidate) => candidate.id === request.exerciseId);
          if (!exercise) throw new AppError("EXERCISE_NOT_FOUND", "validation", "The requested exercise is unavailable.");
          if (exercise.type !== "function" && exercise.type !== "debug" && exercise.type !== "output" && exercise.type !== "project") throw new AppError("EXERCISE_TYPE_UNSUPPORTED", "validation", "This exercise type does not use the code runner.");
          importedExerciseType = exercise.type;
          executionLimits = {
            ...EXECUTION_POLICY,
            timeoutMs: Math.min(exercise.limits?.timeoutMs ?? EXECUTION_POLICY.timeoutMs, EXECUTION_POLICY.timeoutMs),
            memoryMb: Math.min(exercise.limits?.memoryMb ?? EXECUTION_POLICY.memoryMb, EXECUTION_POLICY.memoryMb),
            maxOutputKb: Math.min(exercise.limits?.maxOutputKb ?? EXECUTION_POLICY.maxOutputKb, EXECUTION_POLICY.maxOutputKb)
          };
          if (exercise.type === "function" || exercise.type === "debug") {
            const fallback = request.language === "java" ? { className: "Solution", name: "sum" } : { name: "sum_values" };
            const className = exercise.entrypoint?.className ?? fallback.className;
            importedEntrypoint = { ...(className ? { className } : {}), name: exercise.entrypoint?.name ?? fallback.name };
          }
          const selectedTests = (exercise.tests ?? []).filter((test) => request.action === "submit" || test.visibility === "public");
          if (exercise.type === "output" || exercise.type === "project") {
            outputTests = selectedTests.map((test) => {
              if (typeof test.input !== "string" || typeof test.expected !== "string") throw new AppError("EXERCISE_TYPES_UNSUPPORTED", "validation", "Output tests require text input and expected output.");
              return { id: test.id, visibility: test.visibility, input: test.input, expected: test.expected, comparison: (test.comparison ?? "exact") as OutputTestDefinition["comparison"] };
            });
          } else {
            importedTests = selectedTests.map((test) => {
              const values = test.arguments?.[0];
              if (!Array.isArray(values) || !values.every((value) => typeof value === "number") || typeof test.expected !== "number") {
                throw new AppError("EXERCISE_TYPES_UNSUPPORTED", "validation", "This adapter currently supports one numeric array/list argument and a numeric result.");
              }
              return { id: test.id, visibility: test.visibility, arguments: values, expected: test.expected };
            });
          }
          exerciseId = `${request.courseId}:${exercise.id}`;
        } else {
          exerciseId = request.language === "java" ? SUM_EXERCISE.id : PYTHON_SUM_EXERCISE.id;
        }
        if (request.language === "java") {
          if ((importedExerciseType === "output" || importedExerciseType === "project") && outputTests) {
            const workspace = await java21Adapter.buildOutputWorkspace(request.sourceCode, outputTests);
            workspaceDirectory = workspace.directory;
            const raw = await docker.execute({ executionId, runtimeId: "java-21", imageReference: java21Adapter.imageReference, workspace, limits: executionLimits });
            result = java21Adapter.parseOutputExecution(executionId, raw, outputTests, startedAt);
          } else {
          const tests = importedTests ?? (request.action === "submit"
            ? [...SUM_EXERCISE.publicTests, ...SUM_EXERCISE.hiddenTests]
            : SUM_EXERCISE.publicTests);
          const workspace = await java21Adapter.buildWorkspace(request.sourceCode, tests, importedEntrypoint);
          workspaceDirectory = workspace.directory;
          const raw = await docker.execute({ executionId, runtimeId: "java-21", imageReference: java21Adapter.imageReference, workspace, limits: executionLimits });
          result = java21Adapter.parseExecution(executionId, raw, tests, startedAt);
          }
        } else {
          if ((importedExerciseType === "output" || importedExerciseType === "project") && outputTests) {
            const workspace = await python3Adapter.buildOutputWorkspace(request.sourceCode, outputTests);
            workspaceDirectory = workspace.directory;
            const raw = await docker.execute({ executionId, runtimeId: "python-3", imageReference: python3Adapter.imageReference, workspace, limits: executionLimits });
            result = python3Adapter.parseOutputExecution(executionId, raw, outputTests, startedAt);
          } else {
          const tests = importedTests ?? (request.action === "submit"
            ? [...PYTHON_SUM_EXERCISE.publicTests, ...PYTHON_SUM_EXERCISE.hiddenTests]
            : PYTHON_SUM_EXERCISE.publicTests);
          const workspace = await python3Adapter.buildWorkspace(request.sourceCode, tests, importedEntrypoint);
          workspaceDirectory = workspace.directory;
          const raw = await docker.execute({ executionId, runtimeId: "python-3", imageReference: python3Adapter.imageReference, workspace, limits: executionLimits });
          result = python3Adapter.parseExecution(executionId, raw, tests, startedAt);
          }
        }
        attempts?.record(exerciseId, request.action, result);
        if (!sender.isDestroyed()) {
          sender.send(IPC_CHANNELS.executionFinished, { executionId, result } satisfies ExecutionFinishedEvent);
        }
      } catch (error) {
        if (!sender.isDestroyed()) {
          sender.send(IPC_CHANNELS.executionFinished, {
            executionId,
            error: toAppError(error)
          } satisfies ExecutionFinishedEvent);
        }
      } finally {
        if (workspaceDirectory) await rm(workspaceDirectory, { recursive: true, force: true });
      }
    })();

    return { executionId };
  });

  ipcMain.handle(IPC_CHANNELS.executionCancel, async (event, input: unknown) => {
    assertTrustedSender(event);
    const { executionId } = cancelRequestSchema.parse(input);
    await docker.cancel(executionId);
  });
}

app.whenReady().then(async () => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; worker-src 'self' blob:; connect-src 'self' ws:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"],
        "X-Content-Type-Options": ["nosniff"]
      }
    });
  });
  attempts = new AttemptRepository(join(app.getPath("userData"), "learnlocal.sqlite"));
  registerIpc();
  await docker.cleanupOwnedResources();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => attempts?.close());
