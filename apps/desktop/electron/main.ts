import { randomUUID } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from "electron";
import {
  AppError,
  cancelRequestSchema,
  coursePromptRequestSchema,
  IPC_CHANNELS,
  runRequestSchema,
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
import { importLearnPack, listImportedCourses } from "@learnlocal/learnpack";
import { EXECUTION_POLICY } from "@learnlocal/runner-core";
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
        if (request.language === "java") {
          const tests = request.action === "submit"
            ? [...SUM_EXERCISE.publicTests, ...SUM_EXERCISE.hiddenTests]
            : SUM_EXERCISE.publicTests;
          const workspace = await java21Adapter.buildWorkspace(request.sourceCode, tests);
          workspaceDirectory = workspace.directory;
          const raw = await docker.execute({ executionId, runtimeId: "java-21", imageReference: java21Adapter.imageReference, workspace, limits: EXECUTION_POLICY });
          result = java21Adapter.parseExecution(executionId, raw, tests, startedAt);
          exerciseId = SUM_EXERCISE.id;
        } else {
          const tests = request.action === "submit"
            ? [...PYTHON_SUM_EXERCISE.publicTests, ...PYTHON_SUM_EXERCISE.hiddenTests]
            : PYTHON_SUM_EXERCISE.publicTests;
          const workspace = await python3Adapter.buildWorkspace(request.sourceCode, tests);
          workspaceDirectory = workspace.directory;
          const raw = await docker.execute({ executionId, runtimeId: "python-3", imageReference: python3Adapter.imageReference, workspace, limits: EXECUTION_POLICY });
          result = python3Adapter.parseExecution(executionId, raw, tests, startedAt);
          exerciseId = PYTHON_SUM_EXERCISE.id;
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
