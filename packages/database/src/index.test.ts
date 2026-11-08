import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
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
  it("removes retired curriculum-prompt tables during migration", async () => {
    const directory = await mkdtemp(join(tmpdir(), "learnlocal-db-retired-prompts-"));
    const databasePath = join(directory, "test.sqlite");
    const legacy = new DatabaseSync(databasePath);
    legacy.exec(`
      CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      INSERT INTO schema_migrations (version, applied_at) VALUES (6, datetime('now'));
      CREATE TABLE prompt_templates (id TEXT PRIMARY KEY);
      CREATE TABLE prompt_history (id TEXT PRIMARY KEY);
    `);
    legacy.close();

    const repository = new AttemptRepository(databasePath);
    repository.close();
    const migrated = new DatabaseSync(databasePath, { readOnly: true });
    try {
      const retiredTables = migrated.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('prompt_templates', 'prompt_history')").all();
      expect(retiredTables).toEqual([]);
    } finally {
      migrated.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("completes exercises only on a passing submission and persists workspaces", async () => {
    const directory = await mkdtemp(join(tmpdir(), "learnlocal-db-"));
    const repository = new AttemptRepository(join(directory, "test.sqlite"));
    try {
      expect(repository.health()).toMatchObject({ integrity: "ok", schemaVersion: 7 });
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
      repository.writeWorkspace("java", "class Solution { static int answer() { return 42; } }\n");
      expect(repository.readWorkspace("java")).toContain("42");
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

  it("removes only the selected courses' learning data when removing a language", async () => {
    const directory = await mkdtemp(join(tmpdir(), "learnlocal-db-remove-"));
    const repository = new AttemptRepository(join(directory, "test.sqlite"));
    try {
      repository.record("java-course-a:exercise", "submit", passingResult("exec_00000000-0000-0000-0000-000000000011"));
      repository.record("java-course-b:exercise", "submit", passingResult("exec_00000000-0000-0000-0000-000000000012"));
      repository.writeWorkspaceFiles("java-course-a@1.0.0:exercise", [{ path: "Main.java", content: "class Main {}" }]);
      repository.writeWorkspaceFiles("java-course-b@1.0.0:exercise", [{ path: "Main.java", content: "class Main {}" }]);
      repository.removeLanguageLearningData("java", ["java-course-a"]);
      expect(repository.isExerciseCompleted("java-course-a:exercise")).toBe(false);
      expect(repository.isExerciseCompleted("java-course-b:exercise")).toBe(true);
      expect(repository.readWorkspaceFiles("java-course-a@1.0.0:exercise")).toEqual([]);
      expect(repository.readWorkspaceFiles("java-course-b@1.0.0:exercise")).toHaveLength(1);
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

  it("tracks study sessions, closes stale ones, and rolls up totals", async () => {
    const directory = await mkdtemp(join(tmpdir(), "learnlocal-db-time-"));
    const repository = new AttemptRepository(join(directory, "test.sqlite"));
    try {
      repository.startStudySession("session_1", { language: "java", courseId: "java-course", moduleId: "m1", exerciseId: "ex-1" });
      repository.heartbeatStudySession("session_1");
      repository.stopStudySession("session_1");

      // Starting a second session auto-closes any still-open session first.
      repository.startStudySession("session_2", { language: "java", courseId: "java-course", moduleId: "m1", exerciseId: "ex-2" });
      repository.startStudySession("session_3", { language: "java", courseId: null, moduleId: null, exerciseId: null });

      const summary = repository.studyTimeSummary();
      expect(summary.todaySeconds).toBeGreaterThanOrEqual(0);
      expect(summary.perCourse.find((entry) => entry.courseId === "java-course")).toBeTruthy();
      expect(summary.perModule.find((entry) => entry.courseId === "java-course" && entry.moduleId === "m1")).toBeTruthy();

      repository.removeCourseLearningData("java-course");
      const afterRemoval = repository.studyTimeSummary();
      expect(afterRemoval.perCourse.find((entry) => entry.courseId === "java-course")).toBeUndefined();

      repository.stopAllOpenStudySessions();
    } finally {
      repository.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("persists, updates, and removes custom themes, enforcing the cap", async () => {
    const directory = await mkdtemp(join(tmpdir(), "learnlocal-db-themes-"));
    const repository = new AttemptRepository(join(directory, "test.sqlite"));
    try {
      const theme = { name: "My Theme", colorScheme: "dark" as const, baseThemeId: "leetcode-dark", tokens: { bg: "#000000" }, monacoRules: [{ token: "comment", foreground: "888888" }], monacoColors: {} };
      const afterSave = repository.saveCustomTheme("theme_1", theme);
      expect(afterSave).toMatchObject([{ id: "theme_1", name: "My Theme", colorScheme: "dark", tokens: { bg: "#000000" } }]);

      const afterUpdate = repository.updateCustomTheme("theme_1", { ...theme, name: "Renamed" });
      expect(afterUpdate).toMatchObject([{ id: "theme_1", name: "Renamed" }]);

      for (let index = 0; index < 25; index += 1) repository.saveCustomTheme(`bulk-${index}`, theme);
      const themes = repository.listCustomThemes();
      expect(themes.length).toBe(20);
      expect(themes.some((candidate) => candidate.id === "theme_1")).toBe(false);

      const remaining = repository.removeCustomTheme(themes[0]!.id);
      expect(remaining.length).toBe(19);
    } finally {
      repository.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});
