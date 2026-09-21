import { resolve } from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";

const workspacePackages = [
  "@learnlocal/contracts",
  "@learnlocal/database",
  "@learnlocal/learnpack",
  "@learnlocal/runner-core",
  "@learnlocal/runner-java",
  "@learnlocal/runner-python",
  "@learnlocal/settings-core",
  "@learnlocal/prompt-generator",
  "@learnlocal/sandbox-docker"
];

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: workspacePackages })],
    build: {
      rollupOptions: {
        input: resolve("apps/desktop/electron/main.ts")
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: workspacePackages })],
    build: {
      rollupOptions: {
        input: resolve("apps/desktop/electron/preload.ts")
      }
    }
  },
  renderer: {
    root: resolve("apps/desktop/renderer"),
    plugins: [react()],
    build: {
      rollupOptions: {
        input: resolve("apps/desktop/renderer/index.html")
      }
    }
  }
});
