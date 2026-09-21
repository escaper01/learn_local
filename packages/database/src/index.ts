import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { ExecutionAction, ExecutionResult, SettingScope, SettingValue } from "@learnlocal/contracts";

export interface StoredSettingRow {
  key: string;
  scope: SettingScope;
  scopeId: string;
  value: SettingValue;
}

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

      INSERT OR IGNORE INTO schema_migrations (version, applied_at)
      VALUES (1, datetime('now'));
    `);
  }
}
