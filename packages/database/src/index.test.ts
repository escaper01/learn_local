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
      expect(repository.health()).toMatchObject({ integrity: "ok", schemaVersion: 4 });
      repository.record("exercise", "run", passingResult("exec_00000000-0000-0000-0000-000000000001"));
      expect(repository.learningSummary()).toMatchObject({ totalAttempts: 1, completedExercises: 0 });
      expect(repository.isExerciseCompleted("exercise")).toBe(false);
      repository.record("exercise", "submit", passingResult("exec_00000000-0000-0000-0000-000000000002"));
      expect(repository.learningSummary()).toMatchObject({ totalAttempts: 2, completedExercises: 1, passedSubmissions: 1 });
      expect(repository.learningSummary().mastery).toContainEqual({ exerciseId: "exercise", confidence: 100, attempts: 1 });
      expect(repository.isExerciseCompleted("exercise")).toBe(true);
      repository.recordQuizAttempt("quiz_00000000-0000-0000-0000-000000000001", "course:quiz", 0, false);
      expect(repository.learningSummary()).toMatchObject({ totalAttempts: 3, completedExercises: 1, passedSubmissions: 1 });
      repository.recordQuizAttempt("quiz_00000000-0000-0000-0000-000000000002", "course:quiz", 1, true);
      expect(repository.learningSummary()).toMatchObject({ totalAttempts: 4, completedExercises: 2, passedSubmissions: 2 });
      expect(repository.revealedHintCount("course:exercise")).toBe(0);
      expect(repository.revealHint("course:exercise", 0)).toBe(1);
      expect(repository.revealHint("course:exercise", 0)).toBe(1);
      repository.writeWorkspace("python", "def answer(): return 42\n");
      expect(repository.readWorkspace("python")).toContain("42");
      repository.writeWorkspaceFiles("course:test", [{ path: "main.py", content: "import helper" }, { path: "helper.py", content: "answer = 42" }]);
      expect(repository.readWorkspaceFiles("course:test")).toEqual([
        { path: "helper.py", content: "answer = 42" },
        { path: "main.py", content: "import helper" }
      ]);
    } finally {
      repository.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("removes only the selected language learning data", async () => {
    const directory = await mkdtemp(join(tmpdir(), "learnlocal-db-remove-"));
    const repository = new AttemptRepository(join(directory, "test.sqlite"));
    try {
      repository.record("java-course:exercise", "submit", passingResult("exec_00000000-0000-0000-0000-000000000011"));
      repository.record("python-course:exercise", "submit", passingResult("exec_00000000-0000-0000-0000-000000000012"));
      repository.writeWorkspaceFiles("java-course@1.0.0:exercise", [{ path: "Main.java", content: "class Main {}" }]);
      repository.writeWorkspaceFiles("python-course@1.0.0:exercise", [{ path: "main.py", content: "pass" }]);
      repository.removeLanguageLearningData("java", ["java-course"]);
      expect(repository.isExerciseCompleted("java-course:exercise")).toBe(false);
      expect(repository.isExerciseCompleted("python-course:exercise")).toBe(true);
      expect(repository.readWorkspaceFiles("java-course@1.0.0:exercise")).toEqual([]);
      expect(repository.readWorkspaceFiles("python-course@1.0.0:exercise")).toHaveLength(1);
    } finally {
      repository.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("removes only the selected course's learning data", async () => {
    const directory = await mkdtemp(join(tmpdir(), "learnlocal-db-course-"));
    const repository = new AttemptRepository(join(directory, "test.sqlite"));
    try {
      repository.record("java-course:exercise", "submit", passingResult("exec_00000000-0000-0000-0000-000000000021"));
      repository.record("java-course-advanced:exercise", "submit", passingResult("exec_00000000-0000-0000-0000-000000000022"));
      repository.recordQuizAttempt("quiz_00000000-0000-0000-0000-000000000021", "java-course:quiz", 0, true);
      expect(repository.revealHint("java-course:exercise", 0)).toBe(1);
      repository.writeWorkspaceFiles("java-course@1.0.0:exercise", [{ path: "Main.java", content: "class Main {}" }]);
      repository.writeWorkspaceFiles("java-course-advanced@1.0.0:exercise", [{ path: "Main.java", content: "class Main {}" }]);
      repository.removeCourseLearningData("java-course");
      expect(repository.isExerciseCompleted("java-course:exercise")).toBe(false);
      expect(repository.isExerciseCompleted("java-course:quiz")).toBe(false);
      expect(repository.revealedHintCount("java-course:exercise")).toBe(0);
      expect(repository.readWorkspaceFiles("java-course@1.0.0:exercise")).toEqual([]);
      expect(repository.isExerciseCompleted("java-course-advanced:exercise")).toBe(true);
      expect(repository.readWorkspaceFiles("java-course-advanced@1.0.0:exercise")).toHaveLength(1);
    } finally {
      repository.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("persists prompt templates and history, enforcing their caps", async () => {
    const directory = await mkdtemp(join(tmpdir(), "learnlocal-db-prompts-"));
    const repository = new AttemptRepository(join(directory, "test.sqlite"));
    try {
      const form = { language: "Java", learningRequest: "Teach me Java.", topics: ["Records"] };
      expect(repository.savePromptTemplate("t1", "Java basics", form)).toMatchObject([{ id: "t1", name: "Java basics", form }]);
      for (let index = 0; index < 25; index += 1) repository.savePromptTemplate(`bulk-${index}`, `Bulk ${index}`, form);
      const templates = repository.listPromptTemplates();
      expect(templates.length).toBe(20);
      expect(templates.some((template) => template.id === "t1")).toBe(false);
      const remaining = repository.removePromptTemplate(templates[0]!.id);
      expect(remaining.length).toBe(19);

      expect(repository.addPromptHistory("h1", "prompt one", form)).toMatchObject([{ id: "h1", prompt: "prompt one" }]);
      for (let index = 0; index < 15; index += 1) repository.addPromptHistory(`bulk-h-${index}`, `prompt ${index}`, form);
      const history = repository.listPromptHistory();
      expect(history.length).toBe(10);
      expect(history.some((item) => item.id === "h1")).toBe(false);
    } finally {
      repository.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("tracks study sessions, closes stale ones, and rolls up totals", async () => {
    const directory = await mkdtemp(join(tmpdir(), "learnlocal-db-time-"));
    const repository = new AttemptRepository(join(directory, "test.sqlite"));
    try {
      repository.startStudySession("session_1", { language: "java", courseId: "java-course", exerciseId: "ex-1" });
      repository.heartbeatStudySession("session_1");
      repository.stopStudySession("session_1");

      // Starting a second session auto-closes any still-open session first.
      repository.startStudySession("session_2", { language: "java", courseId: "java-course", exerciseId: "ex-2" });
      repository.startStudySession("session_3", { language: "python", courseId: null, exerciseId: null });

      const summary = repository.studyTimeSummary();
      expect(summary.todaySeconds).toBeGreaterThanOrEqual(0);
      expect(summary.perCourse.find((entry) => entry.courseId === "java-course")).toBeTruthy();

      repository.removeCourseLearningData("java-course");
      const afterRemoval = repository.studyTimeSummary();
      expect(afterRemoval.perCourse.find((entry) => entry.courseId === "java-course")).toBeUndefined();

      repository.stopAllOpenStudySessions();
    } finally {
      repository.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
