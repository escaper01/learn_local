import { rm } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { PYTHON_SUM_EXERCISE, python3Adapter } from "./index";

describe("Python adapter", () => {
  it("creates isolated compile and run commands", async () => {
    const workspace = await python3Adapter.buildWorkspace("def sum_values(values):\n    return 0\n", PYTHON_SUM_EXERCISE.publicTests);
    try {
      expect(workspace.compileCommand).toContain("py_compile");
      expect(workspace.runCommand).toContain("-I");
      expect(workspace.runCommand[0]).toBe("python");
    } finally {
      await rm(workspace.directory, { recursive: true, force: true });
    }
  });
});
