import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { AppError, type ExecutionAction, type ExecutionResult, type LearningSummary, type SettingScope, type SettingValue } from "@learnlocal/contracts";

export interface StoredSettingRow {
  key: string;
  scope: SettingScope;
  scopeId: string;
  value: SettingValue;
}

export class AttemptRepository {
  private readonly database: DatabaseSync;
  private readonly backupPath: string;

  constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.backupPath = `${databasePath}.backup`;
    if (existsSync(databasePath) && statSync(databasePath).size > 0) {
      const inspection = new DatabaseSync(databasePath);
      const integrity = inspection.prepare("PRAGMA integrity_check").get() as { integrity_check?: unknown } | undefined;
      inspection.close();
      if (integrity?.integrity_check !== "ok") throw new AppError("DATABASE_INTEGRITY_FAILED", "system", "The local learning database is damaged. A previous .backup file was preserved for recovery.", { databasePath, backupPath: this.backupPath });
      copyFileSync(databasePath, this.backupPath);
    }
    this.database = new DatabaseSync(databasePath);
    this.database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.migrate();
  }

  record(exerciseId: string, action: ExecutionAction, result: ExecutionResult): void {
    const passed = action === "submit" && result.tests.length > 0 && result.tests.every((test) => test.passed);
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database
        .prepare(`
          INSERT INTO exercise_attempts (
            id, exercise_id, action, status, passed, compile_success,
            wall_time_ms, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          result.executionId,
          exerciseId,
          action,
          result.status,
          Number(passed),
          Number(result.compile.success),
          result.resources.wallTimeMs,
          new Date().toISOString()
        );

      const insertTest = this.database.prepare(`
        INSERT INTO test_results (
          attempt_id, test_id, visibility, passed, duration_ms, feedback_code
        ) VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const test of result.tests) {
        insertTest.run(
          result.executionId,
          test.id,
          test.visibility,
          Number(test.passed),
          test.durationMs,
          test.feedbackCode ?? null
        );
      }
      if (passed) {
        this.database.prepare(`
          INSERT INTO exercise_progress (exercise_id, completed_at, last_attempt_id)
          VALUES (?, ?, ?)
          ON CONFLICT (exercise_id) DO UPDATE SET completed_at = COALESCE(exercise_progress.completed_at, excluded.completed_at), last_attempt_id = excluded.last_attempt_id
        `).run(exerciseId, new Date().toISOString(), result.executionId);
      }
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.database.close();
  }

  health(): { integrity: "ok"; schemaVersion: number; backupAvailable: boolean; backupBytes: number } {
    const integrity = this.database.prepare("PRAGMA integrity_check").get() as { integrity_check?: unknown } | undefined;
    if (integrity?.integrity_check !== "ok") throw new AppError("DATABASE_INTEGRITY_FAILED", "system", "The local learning database failed its integrity check.");
    const version = this.database.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations").get() as { version: number };
    const backupAvailable = existsSync(this.backupPath);
    return { integrity: "ok", schemaVersion: Number(version.version), backupAvailable, backupBytes: backupAvailable ? statSync(this.backupPath).size : 0 };
  }

  listSettings(): StoredSettingRow[] {
    const rows = this.database.prepare("SELECT key, scope, scope_id, value_json FROM settings_values").all() as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      key: String(row.key),
      scope: String(row.scope) as SettingScope,
      scopeId: String(row.scope_id),
      value: JSON.parse(String(row.value_json)) as SettingValue
    }));
  }

  setSetting(key: string, scope: SettingScope, scopeId: string, value: SettingValue): void {
    this.database.prepare(`
      INSERT INTO settings_values (key, scope, scope_id, value_json, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (key, scope, scope_id) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at
    `).run(key, scope, scopeId, JSON.stringify(value), new Date().toISOString());
  }

  resetSetting(key: string, scope: SettingScope, scopeId: string): void {
    this.database.prepare("DELETE FROM settings_values WHERE key = ? AND scope = ? AND scope_id = ?").run(key, scope, scopeId);
  }

  replaceGlobalSettings(settings: readonly { key: string; value: SettingValue }[]): void {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.prepare("DELETE FROM settings_values WHERE scope = 'global'").run();
      const insert = this.database.prepare("INSERT INTO settings_values (key, scope, scope_id, value_json, updated_at) VALUES (?, 'global', '', ?, ?)");
      const now = new Date().toISOString();
      for (const setting of settings) insert.run(setting.key, JSON.stringify(setting.value), now);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  readWorkspace(language: "java" | "python"): string | null {
    const row = this.database.prepare("SELECT content FROM workspace_files WHERE workspace_id = ? AND path = ?").get(`builtin-${language}`, language === "java" ? "Solution.java" : "solution.py") as { content?: unknown } | undefined;
    return typeof row?.content === "string" ? row.content : null;
  }

  writeWorkspace(language: "java" | "python", content: string): void {
    const path = language === "java" ? "Solution.java" : "solution.py";
    this.database.prepare(`
      INSERT INTO workspace_files (workspace_id, path, content, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT (workspace_id, path) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at
    `).run(`builtin-${language}`, path, content, new Date().toISOString());
  }

  readWorkspaceFiles(workspaceId: string): Array<{ path: string; content: string }> {
    const rows = this.database.prepare("SELECT path, content FROM workspace_files WHERE workspace_id = ? ORDER BY path").all(workspaceId) as Array<{ path: string; content: string }>;
    return rows.map((row) => ({ path: String(row.path), content: String(row.content) }));
  }

  writeWorkspaceFiles(workspaceId: string, files: readonly { path: string; content: string }[]): void {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const allowed = new Set(files.map((file) => file.path));
      const existing = this.database.prepare("SELECT path FROM workspace_files WHERE workspace_id = ?").all(workspaceId) as Array<{ path: string }>;
      const remove = this.database.prepare("DELETE FROM workspace_files WHERE workspace_id = ? AND path = ?");
      for (const row of existing) if (!allowed.has(row.path)) remove.run(workspaceId, row.path);
      const upsert = this.database.prepare(`
        INSERT INTO workspace_files (workspace_id, path, content, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT (workspace_id, path) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at
      `);
      const now = new Date().toISOString();
      for (const file of files) upsert.run(workspaceId, file.path, file.content, now);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  removeLanguageLearningData(language: "java" | "python", courseIds: readonly string[]): void {
    const exercisePatterns = courseIds.map((courseId) => `${courseId}:%`);
    const builtInExercise = language === "java" ? "java-arrays-sum" : "python-lists-sum";
    const clauses = ["exercise_id = ?", ...exercisePatterns.map(() => "exercise_id LIKE ? ESCAPE '\\'")].join(" OR ");
    const values = [builtInExercise, ...exercisePatterns];
    this.database.exec("BEGIN IMMEDIATE");
    try {
      this.database.prepare(`DELETE FROM hint_reveals WHERE ${clauses}`).run(...values);
      this.database.prepare(`DELETE FROM quiz_attempts WHERE ${clauses}`).run(...values);
      this.database.prepare(`DELETE FROM exercise_progress WHERE ${clauses}`).run(...values);
      this.database.prepare(`DELETE FROM exercise_attempts WHERE ${clauses}`).run(...values);
      this.database.prepare("DELETE FROM workspace_files WHERE workspace_id = ?").run(`builtin-${language}`);
      for (const courseId of courseIds) this.database.prepare("DELETE FROM workspace_files WHERE workspace_id LIKE ? ESCAPE '\\'").run(`${courseId}@%`);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  removeCourseLearningData(courseId: string): void {
    const exercisePattern = `${courseId}:%`;
    this.database.exec("BEGIN IMMEDIATE");
    try {
      for (const table of ["hint_reveals", "quiz_attempts", "exercise_progress", "exercise_attempts"]) {
        this.database.prepare(`DELETE FROM ${table} WHERE exercise_id LIKE ? ESCAPE '\\'`).run(exercisePattern);
      }
      this.database.prepare("DELETE FROM workspace_files WHERE workspace_id LIKE ? ESCAPE '\\'").run(`${courseId}@%`);
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  learningSummary(): LearningSummary {
    const totals = this.database.prepare(`
      SELECT COUNT(*) AS total_attempts,
             SUM(CASE WHEN action = 'submit' AND passed = 1 THEN 1 ELSE 0 END) AS passed_submissions
      FROM exercise_attempts
    `).get() as Record<string, number | null>;
    const completed = this.database.prepare("SELECT COUNT(*) AS count FROM exercise_progress WHERE completed_at IS NOT NULL").get() as { count: number };
    const recentRows = this.database.prepare(`
      SELECT exercise_id, action, status, passed, created_at
      FROM exercise_attempts ORDER BY created_at DESC LIMIT 8
    `).all() as Array<Record<string, unknown>>;
    const activityRows = this.database.prepare(`
      SELECT substr(created_at, 1, 10) AS date, COUNT(*) AS attempts
      FROM exercise_attempts
      WHERE created_at >= datetime('now', '-27 days')
      GROUP BY substr(created_at, 1, 10) ORDER BY date
    `).all() as Array<{ date: string; attempts: number }>;
    const masteryRows = this.database.prepare(`
      WITH ranked AS (
        SELECT exercise_id, passed,
               ROW_NUMBER() OVER (PARTITION BY exercise_id ORDER BY created_at DESC) AS recent_rank
        FROM exercise_attempts WHERE action = 'submit'
      )
      SELECT exercise_id,
             ROUND(100.0 * SUM(passed * (6 - recent_rank)) / SUM(6 - recent_rank)) AS confidence,
             COUNT(*) AS attempts
      FROM ranked WHERE recent_rank <= 5
      GROUP BY exercise_id
      ORDER BY confidence ASC, attempts DESC, exercise_id
      LIMIT 8
    `).all() as Array<{ exercise_id: string; confidence: number; attempts: number }>;
    const activeDates = new Set(activityRows.map((row) => row.date));
    let streak = 0;
    const cursor = new Date();
    const today = cursor.toISOString().slice(0, 10);
    if (!activeDates.has(today)) cursor.setUTCDate(cursor.getUTCDate() - 1);
    while (activeDates.has(cursor.toISOString().slice(0, 10))) {
      streak += 1;
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    }
    return {
      totalAttempts: Number(totals.total_attempts ?? 0),
      completedExercises: Number(completed.count ?? 0),
      passedSubmissions: Number(totals.passed_submissions ?? 0),
      currentStreakDays: streak,
      recentAttempts: recentRows.map((row) => ({
        exerciseId: String(row.exercise_id),
        action: String(row.action) as ExecutionAction,
        status: String(row.status),
        passed: Number(row.passed) === 1,
        createdAt: String(row.created_at)
      })),
      activity: activityRows.map((row) => ({ date: row.date, attempts: Number(row.attempts) })),
      mastery: masteryRows.map((row) => ({ exerciseId: row.exercise_id, confidence: Number(row.confidence), attempts: Number(row.attempts) }))
    };
  }

  recordQuizAttempt(attemptId: string, exerciseId: string, choiceIndex: number, correct: boolean): void {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const now = new Date().toISOString();
      this.database.prepare(`
        INSERT INTO exercise_attempts (id, exercise_id, action, status, passed, compile_success, wall_time_ms, created_at)
        VALUES (?, ?, 'submit', 'finished', ?, 1, 0, ?)
      `).run(attemptId, exerciseId, Number(correct), now);
      this.database.prepare("INSERT INTO quiz_attempts (id, exercise_id, choice_index, correct, created_at) VALUES (?, ?, ?, ?, ?)").run(attemptId, exerciseId, choiceIndex, Number(correct), now);
      if (correct) {
        this.database.prepare(`
          INSERT INTO exercise_progress (exercise_id, completed_at, last_attempt_id)
          VALUES (?, ?, ?)
          ON CONFLICT (exercise_id) DO UPDATE SET completed_at = COALESCE(exercise_progress.completed_at, excluded.completed_at), last_attempt_id = excluded.last_attempt_id
        `).run(exerciseId, now, attemptId);
      }
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  revealedHintCount(exerciseId: string): number {
    const row = this.database.prepare("SELECT COUNT(*) AS count FROM hint_reveals WHERE exercise_id = ?").get(exerciseId) as { count: number };
    return Number(row.count);
  }

  isExerciseCompleted(exerciseId: string): boolean {
    return Boolean(this.database.prepare("SELECT 1 AS completed FROM exercise_progress WHERE exercise_id = ? AND completed_at IS NOT NULL").get(exerciseId));
  }

  revealHint(exerciseId: string, hintIndex: number): number {
    this.database.prepare(`
      INSERT OR IGNORE INTO hint_reveals (exercise_id, hint_index, revealed_at)
      VALUES (?, ?, ?)
    `).run(exerciseId, hintIndex, new Date().toISOString());
    return this.revealedHintCount(exerciseId);
  }

  private migrate(): void {
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS exercise_attempts (
        id TEXT PRIMARY KEY,
        exercise_id TEXT NOT NULL,
        action TEXT NOT NULL CHECK (action IN ('run', 'submit')),
        status TEXT NOT NULL,
        passed INTEGER NOT NULL CHECK (passed IN (0, 1)),
        compile_success INTEGER NOT NULL CHECK (compile_success IN (0, 1)),
        wall_time_ms INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS test_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        attempt_id TEXT NOT NULL REFERENCES exercise_attempts(id) ON DELETE CASCADE,
        test_id TEXT NOT NULL,
        visibility TEXT NOT NULL CHECK (visibility IN ('public', 'hidden')),
        passed INTEGER NOT NULL CHECK (passed IN (0, 1)),
        duration_ms INTEGER NOT NULL,
        feedback_code TEXT
      );

      CREATE TABLE IF NOT EXISTS settings_values (
        key TEXT NOT NULL,
        scope TEXT NOT NULL CHECK (scope IN ('global', 'language', 'course')),
        scope_id TEXT NOT NULL,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (key, scope, scope_id)
      );

      CREATE TABLE IF NOT EXISTS exercise_progress (
        exercise_id TEXT PRIMARY KEY,
        completed_at TEXT,
        last_attempt_id TEXT NOT NULL REFERENCES exercise_attempts(id)
      );

      CREATE TABLE IF NOT EXISTS workspace_files (
        workspace_id TEXT NOT NULL,
        path TEXT NOT NULL,
        content TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (workspace_id, path)
      );

      CREATE TABLE IF NOT EXISTS quiz_attempts (
        id TEXT PRIMARY KEY,
        exercise_id TEXT NOT NULL,
        choice_index INTEGER NOT NULL,
        correct INTEGER NOT NULL CHECK (correct IN (0, 1)),
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS hint_reveals (
        exercise_id TEXT NOT NULL,
        hint_index INTEGER NOT NULL,
        revealed_at TEXT NOT NULL,
        PRIMARY KEY (exercise_id, hint_index)
      );

      INSERT OR IGNORE INTO schema_migrations (version, applied_at)
      VALUES (1, datetime('now'));
    `);
    const version = this.database.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations").get() as { version: number };
    if (Number(version.version) < 2) {
      this.database.exec("BEGIN IMMEDIATE");
      try {
        this.database.exec(`
          CREATE TABLE IF NOT EXISTS app_metadata (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          INSERT INTO schema_migrations (version, applied_at) VALUES (2, datetime('now'));
        `);
        this.database.exec("COMMIT");
      } catch (error) {
        this.database.exec("ROLLBACK");
        throw error;
      }
    }
  }
}
