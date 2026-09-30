import { contextBridge, ipcRenderer } from "electron";
import {
  IPC_CHANNELS,
  type ExecutionFinishedEvent,
  type ExecutionProgressEvent,
  type LearnLocalApi,
  type RunRequest,
  type RuntimeInstallProgressEvent
} from "@learnlocal/contracts";

const api: LearnLocalApi = {
  courses: {
    importPack: () => ipcRenderer.invoke(IPC_CHANNELS.coursesImport),
    list: () => ipcRenderer.invoke(IPC_CHANNELS.coursesList),
    open: (courseId, version) => ipcRenderer.invoke(IPC_CHANNELS.coursesOpen, { courseId, version }),
    remove: (input) => ipcRenderer.invoke(IPC_CHANNELS.coursesRemove, input)
  },
  runtimes: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.runtimesList),
    install: (runtimeId) => ipcRenderer.invoke(IPC_CHANNELS.runtimesInstall, { runtimeId }),
    verify: (runtimeId) => ipcRenderer.invoke(IPC_CHANNELS.runtimesVerify, { runtimeId }),
    update: (runtimeId) => ipcRenderer.invoke(IPC_CHANNELS.runtimesUpdate, { runtimeId }),
    remove: (runtimeId, removeLearningData = false) => ipcRenderer.invoke(IPC_CHANNELS.runtimesRemove, { runtimeId, removeLearningData }),
    onInstallProgress: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, value: RuntimeInstallProgressEvent) => listener(value);
      ipcRenderer.on(IPC_CHANNELS.runtimesInstallProgress, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.runtimesInstallProgress, handler);
    }
  },
  settings: {
    list: (context = {}) => ipcRenderer.invoke(IPC_CHANNELS.settingsList, context),
    set: (input) => ipcRenderer.invoke(IPC_CHANNELS.settingsSet, input),
    reset: (input) => ipcRenderer.invoke(IPC_CHANNELS.settingsReset, input),
    exportProfile: () => ipcRenderer.invoke(IPC_CHANNELS.settingsExport),
    importProfile: () => ipcRenderer.invoke(IPC_CHANNELS.settingsImport)
  },
  prompts: {
    generate: (input) => ipcRenderer.invoke(IPC_CHANNELS.promptsGenerate, input),
    scaffold: () => ipcRenderer.invoke(IPC_CHANNELS.promptsScaffold),
    listTemplates: () => ipcRenderer.invoke(IPC_CHANNELS.promptsListTemplates),
    saveTemplate: (input) => ipcRenderer.invoke(IPC_CHANNELS.promptsSaveTemplate, input),
    removeTemplate: (input) => ipcRenderer.invoke(IPC_CHANNELS.promptsRemoveTemplate, input),
    listHistory: () => ipcRenderer.invoke(IPC_CHANNELS.promptsListHistory)
  },
  progress: {
    summary: () => ipcRenderer.invoke(IPC_CHANNELS.progressSummary),
    submitQuiz: (input) => ipcRenderer.invoke(IPC_CHANNELS.progressSubmitQuiz, input),
    revealHint: (input) => ipcRenderer.invoke(IPC_CHANNELS.progressRevealHint, input)
  },
  workspace: {
    read: (language) => ipcRenderer.invoke(IPC_CHANNELS.workspaceRead, { language }),
    write: (language, content) => ipcRenderer.invoke(IPC_CHANNELS.workspaceWrite, { language, content }),
    readExercise: (input) => ipcRenderer.invoke(IPC_CHANNELS.workspaceExerciseRead, input),
    writeExercise: (input) => ipcRenderer.invoke(IPC_CHANNELS.workspaceExerciseWrite, input)
  },
  diagnostics: {
    export: (rendererContext) => ipcRenderer.invoke(IPC_CHANNELS.diagnosticsExport, rendererContext ?? {})
  },
  timeTracking: {
    start: (input) => ipcRenderer.invoke(IPC_CHANNELS.timeTrackingStart, input),
    heartbeat: (input) => ipcRenderer.invoke(IPC_CHANNELS.timeTrackingHeartbeat, input),
    stop: (input) => ipcRenderer.invoke(IPC_CHANNELS.timeTrackingStop, input),
    summary: () => ipcRenderer.invoke(IPC_CHANNELS.timeTrackingSummary)
  },
  themes: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.themesList),
    save: (input) => ipcRenderer.invoke(IPC_CHANNELS.themesSave, input),
    update: (input) => ipcRenderer.invoke(IPC_CHANNELS.themesUpdate, input),
    remove: (input) => ipcRenderer.invoke(IPC_CHANNELS.themesRemove, input)
  },
  environment: {
    status: () => ipcRenderer.invoke(IPC_CHANNELS.environmentStatus)
  },
  execution: {
    start: (request: RunRequest) => ipcRenderer.invoke(IPC_CHANNELS.executionStart, request),
    cancel: (executionId: string) =>
      ipcRenderer.invoke(IPC_CHANNELS.executionCancel, { executionId }),
    onFinished: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, value: ExecutionFinishedEvent) => listener(value);
      ipcRenderer.on(IPC_CHANNELS.executionFinished, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.executionFinished, handler);
    },
    onProgress: (listener) => {
      const handler = (_event: Electron.IpcRendererEvent, value: ExecutionProgressEvent) => listener(value);
      ipcRenderer.on(IPC_CHANNELS.executionProgress, handler);
      return () => ipcRenderer.removeListener(IPC_CHANNELS.executionProgress, handler);
    }
  }
};

contextBridge.exposeInMainWorld("learnLocal", api);
