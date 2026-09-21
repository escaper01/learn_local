import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { ExecutionResult } from "@learnlocal/contracts";
import { AttemptRepository } from "./index";

function passingResult(id: string): ExecutionResult {
  return {
    executionId: id,
    status: "finished",
    language: "java",
    runtimeVersion: "21",
    compile: { attempted: true, success: true, durationMs: 1, diagnostics: [] },
    tests: [{ id: "public", visibility: "public", passed: true, durationMs: 1, expected: 1, actual: 1 }],
    console: "",
    resources: { wallTimeMs: 2, timedOut: false, outputTruncated: false }
  };
}

describe("local database", () => {
  it("completes exercises only on a passing submission and persists workspaces", async () => {
    const directory = await mkdtemp(join(tmpdir(), "learnlocal-db-"));
    const repository = new AttemptRepository(join(directory, "test.sqlite"));
    try {
      repository.record("exercise", "run", passingResult("exec_00000000-0000-0000-0000-000000000001"));
      expect(repository.learningSummary()).toMatchObject({ totalAttempts: 1, completedExercises: 0 });
      repository.record("exercise", "submit", passingResult("exec_00000000-0000-0000-0000-000000000002"));
      expect(repository.learningSummary()).toMatchObject({ totalAttempts: 2, completedExercises: 1, passedSubmissions: 1 });
      repository.writeWorkspace("python", "def answer(): return 42\n");
      expect(repository.readWorkspace("python")).toContain("42");
    } finally {
      repository.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
