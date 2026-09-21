import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CompileDiagnostic, ExecutionResult, TestResult } from "@learnlocal/contracts";
import type { RawProcessResult, RawSandboxResult } from "@learnlocal/runner-core";

const RESULT_PREFIX = "__LEARNLOCAL_RESULT__";

export interface PythonTestDefinition {
  id: string;
  visibility: "public" | "hidden";
  arguments: number[];
  expected: number;
}

export interface PreparedPythonWorkspace {
  directory: string;
  compileCommand: readonly string[];
  runCommand: readonly string[];
  tests: readonly PythonTestDefinition[];
}

function harness(tests: readonly PythonTestDefinition[]): string {
  return `import json
import importlib.util
import time
import traceback
from pathlib import Path

spec = importlib.util.spec_from_file_location("learnlocal_solution", Path(__file__).with_name("solution.py"))
if spec is None or spec.loader is None:
    raise RuntimeError("Unable to load solution.py")
solution = importlib.util.module_from_spec(spec)
spec.loader.exec_module(solution)

PREFIX = ${JSON.stringify(RESULT_PREFIX)}
TESTS = ${JSON.stringify(tests)}

for test in TESTS:
    started = time.perf_counter_ns()
    try:
        actual = solution.sum_values(list(test["arguments"]))
        duration_ms = (time.perf_counter_ns() - started) // 1_000_000
        print(PREFIX + json.dumps({
            "id": test["id"],
            "visibility": test["visibility"],
            "passed": actual == test["expected"],
            "durationMs": duration_ms,
            "expected": test["expected"],
            "actual": actual
        }, separators=(",", ":")))
    except BaseException as error:
        duration_ms = (time.perf_counter_ns() - started) // 1_000_000
        print(PREFIX + json.dumps({
            "id": test["id"],
            "visibility": test["visibility"],
            "passed": False,
            "durationMs": duration_ms,
            "error": type(error).__name__ + ": " + str(error)
        }, separators=(",", ":")))
`;
}

function diagnostics(stderr: string): CompileDiagnostic[] {
  const match = /File "[^"]*[/\\]?(?<file>[^/\\"]+)", line (?<line>\d+)/.exec(stderr);
  if (!stderr.trim()) return [];
  return [{
    ...(match?.groups?.file ? { file: match.groups.file } : {}),
    ...(match?.groups?.line ? { line: Number(match.groups.line) } : {}),
    severity: "error",
    message: stderr.trim()
  }];
}

function abnormalStatus(process: RawProcessResult): ExecutionResult["status"] {
  if (process.cancelled) return "cancelled";
  if (process.timedOut) return "timed-out";
  return "runtime-error";
}

export const python3Adapter = {
  id: "python" as const,
  adapterVersion: "0.1.0",
  languageVersions: ["3.13"] as const,
  imageReference: "python@sha256:2325bb286ec344af3e5898cc224b5844e2707ac6e26b1632516fd3edc84a5e26",

  async buildWorkspace(sourceCode: string, tests: readonly PythonTestDefinition[]): Promise<PreparedPythonWorkspace> {
    const directory = await mkdtemp(join(tmpdir(), "learnlocal-python-"));
    await Promise.all([
      writeFile(join(directory, "solution.py"), sourceCode, "utf8"),
      writeFile(join(directory, "_learnlocal_harness.py"), harness(tests), "utf8")
    ]);
    return {
      directory,
      compileCommand: ["python", "-I", "-m", "py_compile", "solution.py", "_learnlocal_harness.py"],
      runCommand: ["python", "-I", "_learnlocal_harness.py"],
      tests
    };
  },

  parseExecution(executionId: string, raw: RawSandboxResult, tests: readonly PythonTestDefinition[], startedAt: number): ExecutionResult {
    const base = {
      executionId,
      language: "python" as const,
      runtimeVersion: "3.13",
      resources: {
        wallTimeMs: Date.now() - startedAt,
        timedOut: raw.compile.timedOut || Boolean(raw.run?.timedOut),
        outputTruncated: raw.compile.outputTruncated || Boolean(raw.run?.outputTruncated)
      }
    };
    if (raw.compile.exitCode !== 0 || raw.compile.timedOut || raw.compile.cancelled) {
      return {
        ...base,
        status: raw.compile.timedOut || raw.compile.cancelled ? abnormalStatus(raw.compile) : "compile-error",
        compile: { attempted: true, success: false, durationMs: raw.compile.durationMs, diagnostics: diagnostics(raw.compile.stderr) },
        tests: [],
        console: raw.compile.stderr
      };
    }
    const run = raw.run;
    if (!run) throw new Error("The sandbox did not return a Python run result.");
    const parsed = new Map<string, Record<string, unknown>>();
    const consoleLines: string[] = [];
    for (const line of run.stdout.split(/\r?\n/)) {
      if (line.startsWith(RESULT_PREFIX)) {
        try {
          const value = JSON.parse(line.slice(RESULT_PREFIX.length)) as Record<string, unknown>;
          if (typeof value.id === "string") parsed.set(value.id, value);
        } catch { consoleLines.push(line); }
      } else if (line) consoleLines.push(line);
    }
    const results: TestResult[] = tests.map((test) => {
      const value = parsed.get(test.id);
      const passed = value?.passed === true;
      const common = { id: test.id, visibility: test.visibility, passed, durationMs: typeof value?.durationMs === "number" ? value.durationMs : 0 };
      if (test.visibility === "hidden") return passed ? common : { ...common, feedbackCode: "WRONG_RESULT" as const };
      if (typeof value?.error === "string") return { ...common, feedbackCode: "RUNTIME_ERROR" as const, message: value.error };
      return { ...common, expected: test.expected, actual: value?.actual, ...(!passed ? { feedbackCode: "WRONG_RESULT" as const } : {}) };
    });
    const abnormal = run.exitCode !== 0 || run.timedOut || run.cancelled;
    return {
      ...base,
      status: abnormal ? abnormalStatus(run) : "finished",
      compile: { attempted: true, success: true, durationMs: raw.compile.durationMs, diagnostics: [] },
      tests: results,
      console: [...consoleLines, run.stderr].filter(Boolean).join("\n")
    };
  }
};

export const PYTHON_SUM_EXERCISE = Object.freeze({
  id: "python-lists-sum",
  title: "Sum a List",
  publicTests: [
    { id: "public-basic", visibility: "public", arguments: [1, 2, 3], expected: 6 },
    { id: "public-empty", visibility: "public", arguments: [], expected: 0 }
  ] satisfies PythonTestDefinition[],
  hiddenTests: [
    { id: "hidden-negative", visibility: "hidden", arguments: [-2, 5, 10], expected: 13 }
  ] satisfies PythonTestDefinition[]
});
