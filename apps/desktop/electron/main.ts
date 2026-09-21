import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from "electron";
import {
  AppError,
  cancelRequestSchema,
  IPC_CHANNELS,
  runRequestSchema,
  runtimeRequestSchema,
  toAppError,
  type ExecutionFinishedEvent
} from "@learnlocal/contracts";
import { AttemptRepository } from "@learnlocal/database";
import { importLearnPack, listImportedCourses } from "@learnlocal/learnpack";
import { EXECUTION_POLICY } from "@learnlocal/runner-core";
import { java21Adapter, SUM_EXERCISE } from "@learnlocal/runner-java";
import { DockerProvider } from "@learnlocal/sandbox-docker";

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
        const tests = request.action === "submit"
          ? [...SUM_EXERCISE.publicTests, ...SUM_EXERCISE.hiddenTests]
          : SUM_EXERCISE.publicTests;
        const startedAt = Date.now();
        const workspace = await java21Adapter.buildWorkspace(request.sourceCode, tests);
        workspaceDirectory = workspace.directory;
        const raw = await docker.execute({
          executionId,
          runtimeId: "java-21",
          imageReference: java21Adapter.imageReference,
          workspace,
          limits: EXECUTION_POLICY
        });
        const result = java21Adapter.parseExecution(executionId, raw, tests, startedAt);
        attempts?.record(SUM_EXERCISE.id, request.action, result);
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
