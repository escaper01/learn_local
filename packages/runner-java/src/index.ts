import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CompileDiagnostic, ExecutionResult, TestResult } from "@learnlocal/contracts";
import { AppError } from "@learnlocal/contracts";
import type {
  JavaAdapter,
  JavaTestDefinition,
  PreparedJavaWorkspace,
  RawProcessResult,
  RawSandboxResult
} from "@learnlocal/runner-core";

const RESULT_PREFIX = "__LEARNLOCAL_RESULT__";

function javaArray(values: readonly number[]): string {
  return `new int[]{${values.join(",")}}`;
}

function createHarness(tests: readonly JavaTestDefinition[]): string {
  const invocations = tests
    .map(
      (test) => `runTest(${JSON.stringify(test.id)}, ${JSON.stringify(test.visibility)}, ${javaArray(test.arguments)}, ${test.expected});`
    )
    .join("\n    ");

  return `public final class LearnLocalHarness {
  private static final String PREFIX = "${RESULT_PREFIX}";

  public static void main(String[] args) {
    ${invocations}
  }

  private static void runTest(String id, String visibility, int[] input, int expected) {
    long started = System.nanoTime();
    try {
      int actual = Solution.sum(input);
      long durationMs = (System.nanoTime() - started) / 1_000_000;
      boolean passed = actual == expected;
      System.out.println(PREFIX + "{\\\"id\\\":\\\"" + escape(id) + "\\\",\\\"visibility\\\":\\\"" + visibility
        + "\\\",\\\"passed\\\":" + passed + ",\\\"durationMs\\\":" + durationMs + ",\\\"expected\\\":" + expected
        + ",\\\"actual\\\":" + actual + "}");
    } catch (Throwable error) {
      long durationMs = (System.nanoTime() - started) / 1_000_000;
      System.out.println(PREFIX + "{\\\"id\\\":\\\"" + escape(id) + "\\\",\\\"visibility\\\":\\\"" + visibility
        + "\\\",\\\"passed\\\":false,\\\"durationMs\\\":" + durationMs + ",\\\"error\\\":\\\""
        + escape(error.getClass().getSimpleName() + ": " + String.valueOf(error.getMessage())) + "\\\"}");
    }
  }

  private static String escape(String value) {
    return value.replace("\\\\", "\\\\\\\\").replace("\\\"", "\\\\\\\"").replace("\\n", "\\\\n").replace("\\r", "\\\\r");
  }
}
`;
}

function parseDiagnostics(stderr: string): CompileDiagnostic[] {
  const diagnostics: CompileDiagnostic[] = [];
  const pattern = /^(.*\.java):(\d+): error: (.+)$/gm;
  for (const match of stderr.matchAll(pattern)) {
    diagnostics.push({
      file: match[1]?.split(/[\\/]/).at(-1) ?? "Solution.java",
      line: Number(match[2]),
      severity: "error",
      message: match[3] ?? "Java compilation failed."
    });
  }

  if (diagnostics.length === 0 && stderr.trim()) {
    diagnostics.push({ severity: "error", message: stderr.trim() });
  }
  return diagnostics;
}

function statusFromProcess(process: RawProcessResult): ExecutionResult["status"] {
  if (process.cancelled) return "cancelled";
  if (process.timedOut) return "timed-out";
  return "runtime-error";
}

export const java21Adapter: JavaAdapter = {
  id: "java",
  adapterVersion: "0.1.0",
  languageVersions: ["21"],
  imageReference: "eclipse-temurin@sha256:c7d5863b5dd8f26b90c64f1d80cc2b0e5a5e4642f8db9955a370d348edd8f438",

  async buildWorkspace(sourceCode, tests): Promise<PreparedJavaWorkspace> {
    if (/^\s*package\s+/m.test(sourceCode)) {
      throw new AppError(
        "JAVA_PACKAGE_NOT_ALLOWED",
        "validation",
        "Package declarations are not supported in this exercise."
      );
    }

    const directory = await mkdtemp(join(tmpdir(), "learnlocal-java-"));
    await Promise.all([
      writeFile(join(directory, "Solution.java"), sourceCode, "utf8"),
      writeFile(join(directory, "LearnLocalHarness.java"), createHarness(tests), "utf8")
    ]);

    return {
      directory,
      compileCommand: ["javac", "-encoding", "UTF-8", "Solution.java", "LearnLocalHarness.java"],
      runCommand: ["java", "-Xms16m", "-Xmx128m", "LearnLocalHarness"],
      tests
    };
  },

  parseExecution(executionId, raw, tests, startedAt): ExecutionResult {
    const wallTimeMs = Date.now() - startedAt;
    const base = {
      executionId,
      language: "java" as const,
      runtimeVersion: "21" as const,
      console: "",
      resources: {
        wallTimeMs,
        timedOut: raw.compile.timedOut || Boolean(raw.run?.timedOut),
        outputTruncated: raw.compile.outputTruncated || Boolean(raw.run?.outputTruncated)
      }
    };

    if (raw.compile.exitCode !== 0 || raw.compile.timedOut || raw.compile.cancelled) {
      return {
        ...base,
        status: raw.compile.timedOut || raw.compile.cancelled ? statusFromProcess(raw.compile) : "compile-error",
        compile: {
          attempted: true,
          success: false,
          durationMs: raw.compile.durationMs,
          diagnostics: parseDiagnostics(raw.compile.stderr)
        },
        console: raw.compile.stderr,
        tests: []
      };
    }

    const run = raw.run;
    if (!run) throw new Error("The sandbox did not return a Java run result.");

    const parsed = new Map<string, Record<string, unknown>>();
    const consoleLines: string[] = [];
    for (const line of run.stdout.split(/\r?\n/)) {
      if (line.startsWith(RESULT_PREFIX)) {
        try {
          const value = JSON.parse(line.slice(RESULT_PREFIX.length)) as Record<string, unknown>;
          if (typeof value.id === "string") parsed.set(value.id, value);
        } catch {
          consoleLines.push(line);
        }
      } else if (line) {
        consoleLines.push(line);
      }
    }

    const results: TestResult[] = tests.map((test) => {
      const value = parsed.get(test.id);
      const passed = value?.passed === true;
      const common = {
        id: test.id,
        visibility: test.visibility,
        passed,
        durationMs: typeof value?.durationMs === "number" ? value.durationMs : 0
      };
      if (test.visibility === "hidden") {
        return passed ? common : { ...common, feedbackCode: "WRONG_RESULT" as const };
      }
      if (typeof value?.error === "string") {
        return { ...common, feedbackCode: "RUNTIME_ERROR", message: value.error };
      }
      return { ...common, expected: test.expected, actual: value?.actual, ...(!passed ? { feedbackCode: "WRONG_RESULT" as const } : {}) };
    });

    const abnormal = run.exitCode !== 0 || run.timedOut || run.cancelled;
    return {
      ...base,
      status: abnormal ? statusFromProcess(run) : "finished",
      compile: {
        attempted: true,
        success: true,
        durationMs: raw.compile.durationMs,
        diagnostics: []
      },
      tests: results,
      console: [...consoleLines, run.stderr].filter(Boolean).join("\n")
    };
  }
};

export const SUM_EXERCISE = Object.freeze({
  id: "java-arrays-sum",
  title: "Sum an Array",
  publicTests: [
    { id: "public-basic", visibility: "public", arguments: [1, 2, 3], expected: 6 },
    { id: "public-empty", visibility: "public", arguments: [], expected: 0 }
  ] satisfies JavaTestDefinition[],
  hiddenTests: [
    { id: "hidden-negative", visibility: "hidden", arguments: [-2, 5, 10], expected: 13 }
  ] satisfies JavaTestDefinition[]
});
