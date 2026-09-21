import { contextBridge, ipcRenderer } from "electron";
import {
  IPC_CHANNELS,
  type ExecutionFinishedEvent,
  type LearnLocalApi,
  type RunRequest
} from "@learnlocal/contracts";

const api: LearnLocalApi = {
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
    }
  }
};

contextBridge.exposeInMainWorld("learnLocal", api);
