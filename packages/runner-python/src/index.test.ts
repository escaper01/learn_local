import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
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

  it("creates an isolated output exercise harness", async () => {
    const workspace = await python3Adapter.buildOutputWorkspace(
      "print(42)\n",
      [{ id: "answer", visibility: "public", input: "", expected: "42", comparison: "trimmed" }]
    );
    try {
      expect(workspace.compileCommand).toContain("_learnlocal_output.py");
      expect(workspace.runCommand).toEqual(["python", "-I", "_learnlocal_output.py"]);
    } finally {
      await rm(workspace.directory, { recursive: true, force: true });
    }
  });

  it("uses a declared function entrypoint", async () => {
    const workspace = await python3Adapter.buildWorkspace("def total(values):\n    return 0\n", PYTHON_SUM_EXERCISE.publicTests, { name: "total" });
    try {
      expect(await readFile(join(workspace.directory, "_learnlocal_harness.py"), "utf8")).toContain('getattr(solution, "total")');
    } finally { await rm(workspace.directory, { recursive: true, force: true }); }
  });
});
