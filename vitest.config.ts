import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/*.test.ts", "apps/desktop/renderer/src/**/*.test.tsx"],
    environment: "node"
  }
});
