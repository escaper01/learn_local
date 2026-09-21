import { rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { EXECUTION_POLICY } from "@learnlocal/runner-core";
import { java21Adapter, SUM_EXERCISE } from "@learnlocal/runner-java";
import { python3Adapter, PYTHON_SUM_EXERCISE } from "@learnlocal/runner-python";
import { DockerProvider } from "./index";

const dockerTest = process.env.RUN_DOCKER_TESTS === "1" ? describe : describe.skip;

dockerTest("Docker Java execution", () => {
  it("compiles and executes public and hidden tests in disposable containers", async () => {
    const provider = new DockerProvider();
    const tests = [...SUM_EXERCISE.publicTests, ...SUM_EXERCISE.hiddenTests];
    const workspace = await java21Adapter.buildWorkspace(
      `public class Solution {
        public static int sum(int[] values) {
          int total = 0;
          for (int value : values) total += value;
          return total;
        }
      }`,
      tests
    );
    const executionId = `exec_${randomUUID()}`;
    const startedAt = Date.now();

    try {
      const raw = await provider.execute({
        executionId,
        runtimeId: "java-21",
        imageReference: java21Adapter.imageReference,
        workspace,
        limits: EXECUTION_POLICY
      });
      const result = java21Adapter.parseExecution(executionId, raw, tests, startedAt);
      expect(result.status).toBe("finished");
      expect(result.compile.success).toBe(true);
      expect(result.tests).toHaveLength(3);
      expect(result.tests.every((test) => test.passed)).toBe(true);
    } finally {
      await rm(workspace.directory, { recursive: true, force: true });
      await provider.cleanupOwnedResources();
    }
  }, 180_000);

  it("installs, validates, inventories, and removes Python independently", async () => {
    const provider = new DockerProvider();
    const installed = await provider.installManagedRuntime("python-3");
    expect(installed).toMatchObject({ id: "python-3", status: "ready" });
    expect(installed.sizeBytes).toBeGreaterThan(0);
    const java = (await provider.listRuntimes()).find((runtime) => runtime.id === "java-21");
    expect(java?.id).toBe("java-21");
    const removed = await provider.removeManagedRuntime("python-3");
    expect(removed.status).toBe("not-installed");
  }, 360_000);

  it("executes Python public and hidden tests with normalized results", async () => {
    const provider = new DockerProvider();
    const tests = [...PYTHON_SUM_EXERCISE.publicTests, ...PYTHON_SUM_EXERCISE.hiddenTests];
    const workspace = await python3Adapter.buildWorkspace(
      "def sum_values(values):\n    total = 0\n    for value in values:\n        total += value\n    return total\n",
      tests
    );
    const executionId = `exec_${randomUUID()}`;
    const startedAt = Date.now();
    try {
      const raw = await provider.execute({ executionId, runtimeId: "python-3", imageReference: python3Adapter.imageReference, workspace, limits: EXECUTION_POLICY });
      const result = python3Adapter.parseExecution(executionId, raw, tests, startedAt);
      expect(result).toMatchObject({ status: "finished", language: "python", runtimeVersion: "3.13" });
      expect(result.tests.every((test) => test.passed)).toBe(true);
    } finally {
      await rm(workspace.directory, { recursive: true, force: true });
      await provider.cleanupOwnedResources();
    }
  }, 180_000);

  it("executes Java and Python output exercises with trusted comparisons", async () => {
    const provider = new DockerProvider();
    const tests = [{ id: "answer", visibility: "public" as const, input: "", expected: "42", comparison: "trimmed" as const }];
    const javaWorkspace = await java21Adapter.buildOutputWorkspace("public class Main { public static void main(String[] args) { System.out.println(42); } }", tests);
    const pythonWorkspace = await python3Adapter.buildOutputWorkspace("print(42)\n", tests);
    try {
      const javaId = `exec_${randomUUID()}`;
      const javaRaw = await provider.execute({ executionId: javaId, runtimeId: "java-21", imageReference: java21Adapter.imageReference, workspace: javaWorkspace, limits: EXECUTION_POLICY });
      expect(java21Adapter.parseOutputExecution(javaId, javaRaw, tests, Date.now()).tests[0]?.passed).toBe(true);
      const pythonId = `exec_${randomUUID()}`;
      const pythonRaw = await provider.execute({ executionId: pythonId, runtimeId: "python-3", imageReference: python3Adapter.imageReference, workspace: pythonWorkspace, limits: EXECUTION_POLICY });
      expect(python3Adapter.parseOutputExecution(pythonId, pythonRaw, tests, Date.now()).tests[0]?.passed).toBe(true);
    } finally {
      await rm(javaWorkspace.directory, { recursive: true, force: true });
      await rm(pythonWorkspace.directory, { recursive: true, force: true });
      await provider.cleanupOwnedResources();
    }
  }, 180_000);
});
