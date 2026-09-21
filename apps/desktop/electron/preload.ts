import { contextBridge, ipcRenderer } from "electron";
import {
  IPC_CHANNELS,
  type ExecutionFinishedEvent,
  type ExecutionProgressEvent,
  type LearnLocalApi,
  type RunRequest
} from "@learnlocal/contracts";

const api: LearnLocalApi = {
  courses: {
    importPack: () => ipcRenderer.invoke(IPC_CHANNELS.coursesImport),
    list: () => ipcRenderer.invoke(IPC_CHANNELS.coursesList),
    open: (courseId, version) => ipcRenderer.invoke(IPC_CHANNELS.coursesOpen, { courseId, version })
  },
  runtimes: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.runtimesList),
    install: (runtimeId) => ipcRenderer.invoke(IPC_CHANNELS.runtimesInstall, { runtimeId }),
    verify: (runtimeId) => ipcRenderer.invoke(IPC_CHANNELS.runtimesVerify, { runtimeId }),
    update: (runtimeId) => ipcRenderer.invoke(IPC_CHANNELS.runtimesUpdate, { runtimeId }),
    remove: (runtimeId, removeLearningData = false) => ipcRenderer.invoke(IPC_CHANNELS.runtimesRemove, { runtimeId, removeLearningData })
  },
  settings: {
    list: (context = {}) => ipcRenderer.invoke(IPC_CHANNELS.settingsList, context),
    set: (input) => ipcRenderer.invoke(IPC_CHANNELS.settingsSet, input),
    reset: (input) => ipcRenderer.invoke(IPC_CHANNELS.settingsReset, input),
    exportProfile: () => ipcRenderer.invoke(IPC_CHANNELS.settingsExport),
    importProfile: () => ipcRenderer.invoke(IPC_CHANNELS.settingsImport)
  },
  prompts: {
    generate: (input) => ipcRenderer.invoke(IPC_CHANNELS.promptsGenerate, input)
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
    export: () => ipcRenderer.invoke(IPC_CHANNELS.diagnosticsExport)
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
