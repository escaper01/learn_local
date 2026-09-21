import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ExecutionAction, ExecutionResult } from "@learnlocal/contracts";

export class AttemptRepository {
  private readonly database: DatabaseSync;

  constructor(databasePath: string) {
    mkdirSync(dirname(databasePath), { recursive: true });
    this.database = new DatabaseSync(databasePath);
    this.database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.migrate();
  }

  record(exerciseId: string, action: ExecutionAction, result: ExecutionResult): void {
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
          Number(result.tests.length > 0 && result.tests.every((test) => test.passed)),
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
      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.database.close();
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

      INSERT OR IGNORE INTO schema_migrations (version, applied_at)
      VALUES (1, datetime('now'));
    `);
  }
}
