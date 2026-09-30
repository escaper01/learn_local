import { rm } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { EXECUTION_POLICY } from "@learnlocal/runner-core";
import { java21Adapter, SUM_EXERCISE } from "@learnlocal/runner-java";
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

  it("installs, verifies, updates, inventories, and removes Java independently", async () => {
    const provider = new DockerProvider();
    const installed = await provider.installManagedRuntime("java-21");
    expect(installed).toMatchObject({ id: "java-21", status: "ready" });
    expect(installed.sizeBytes).toBeGreaterThan(0);
    const verified = await provider.verifyManagedRuntime("java-21");
    expect(verified.status).toBe("ready");
    expect(verified.lastValidatedAt).toBeTruthy();
    const updated = await provider.updateManagedRuntime("java-21");
    expect(updated).toMatchObject({ id: "java-21", status: "ready" });
    const listed = (await provider.listRuntimes()).find((runtime) => runtime.id === "java-21");
    expect(listed?.id).toBe("java-21");
    const removed = await provider.removeManagedRuntime("java-21");
    expect(removed.status).toBe("not-installed");
  }, 360_000);

  it("executes Java output exercises with trusted comparisons", async () => {
    const provider = new DockerProvider();
    const tests = [{ id: "answer", visibility: "public" as const, input: "", expected: "42", comparison: "trimmed" as const }];
    const javaSource = "public class Main { public static void main(String[] args) { System.out.println(Helper.answer()); } }";
    const javaWorkspace = await java21Adapter.buildOutputWorkspace(javaSource, tests, [
      { path: "Main.java", content: javaSource },
      { path: "Helper.java", content: "public final class Helper { static int answer() { return 42; } }" }
    ]);
    try {
      const javaId = `exec_${randomUUID()}`;
      const javaRaw = await provider.execute({ executionId: javaId, runtimeId: "java-21", imageReference: java21Adapter.imageReference, workspace: javaWorkspace, limits: EXECUTION_POLICY });
      expect(java21Adapter.parseOutputExecution(javaId, javaRaw, tests, Date.now()).tests[0]?.passed).toBe(true);
    } finally {
      await rm(javaWorkspace.directory, { recursive: true, force: true });
      await provider.cleanupOwnedResources();
    }
  }, 180_000);

  it("executes typed multi-argument functions in Java", async () => {
    const provider = new DockerProvider();
    const tests = [{ id: "format", visibility: "public" as const, arguments: ["go", 3, true], expected: "GOGOGO" }];
    const entrypoint = { name: "format", className: "Solution", parameters: [{ name: "text", type: "string" as const }, { name: "count", type: "int" as const }, { name: "upper", type: "boolean" as const }], returns: "string" as const };
    const javaWorkspace = await java21Adapter.buildWorkspace("public class Solution { public static String format(String text, int count, boolean upper) { String value = text.repeat(count); return upper ? value.toUpperCase() : value; } }", tests, entrypoint);
    try {
      const javaId = `exec_${randomUUID()}`;
      const javaRaw = await provider.execute({ executionId: javaId, runtimeId: "java-21", imageReference: java21Adapter.imageReference, workspace: javaWorkspace, limits: EXECUTION_POLICY });
      expect(java21Adapter.parseExecution(javaId, javaRaw, tests, Date.now()).tests[0]?.passed).toBe(true);
    } finally {
      await rm(javaWorkspace.directory, { recursive: true, force: true });
      await provider.cleanupOwnedResources();
    }
  }, 180_000);
});
