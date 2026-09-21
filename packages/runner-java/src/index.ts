import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { CompileDiagnostic, ExecutionResult, TestResult } from "@learnlocal/contracts";
import { AppError } from "@learnlocal/contracts";
import type {
  JavaAdapter,
  JavaTestDefinition,
  FunctionEntrypoint,
  OutputTestDefinition,
  PreparedOutputWorkspace,
  PreparedJavaWorkspace,
  RawProcessResult,
  RawSandboxResult
} from "@learnlocal/runner-core";

const RESULT_PREFIX = "__LEARNLOCAL_RESULT__";

function javaArray(values: readonly number[]): string {
  return `new int[]{${values.join(",")}}`;
}

function createHarness(tests: readonly JavaTestDefinition[], entrypoint: Required<FunctionEntrypoint>): string {
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
      int actual = ${entrypoint.className}.${entrypoint.name}(input);
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

function javaString(value: string): string {
  return JSON.stringify(value).replaceAll("\\n", "\\n").replaceAll("\\r", "\\r");
}

function createOutputHarness(tests: readonly OutputTestDefinition[], className: string): string {
  const invocations = tests.map((test) => `runTest(${javaString(test.id)}, ${javaString(test.visibility)}, ${javaString(test.input)}, ${javaString(test.expected)}, ${javaString(test.comparison)});`).join("\n    ");
  return `import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

public final class LearnLocalOutputHarness {
  private static final String PREFIX = "${RESULT_PREFIX}";
  public static void main(String[] args) throws Exception { ${invocations} }
  private static void runTest(String id, String visibility, String input, String expected, String comparison) throws Exception {
    long started = System.nanoTime();
    Process process = new ProcessBuilder("java", "${className}").redirectErrorStream(true).start();
    process.getOutputStream().write(input.getBytes(StandardCharsets.UTF_8));
    process.getOutputStream().close();
    String actual = new String(process.getInputStream().readAllBytes(), StandardCharsets.UTF_8);
    int exit = process.waitFor();
    boolean passed = exit == 0 && compare(actual, expected, comparison);
    long durationMs = (System.nanoTime() - started) / 1_000_000;
    System.out.println(PREFIX + "{\\\"id\\\":\\\"" + escape(id) + "\\\",\\\"visibility\\\":\\\"" + visibility
      + "\\\",\\\"passed\\\":" + passed + ",\\\"durationMs\\\":" + durationMs + ",\\\"expected\\\":\\\""
      + escape(expected) + "\\\",\\\"actual\\\":\\\"" + escape(actual) + "\\\"}");
  }
  private static boolean compare(String actual, String expected, String mode) {
    if ("trimmed".equals(mode)) return actual.trim().equals(expected.trim());
    if ("lines".equals(mode)) return Arrays.equals(actual.strip().split("\\\\R"), expected.strip().split("\\\\R"));
    if ("numeric".equals(mode)) { try { return Double.compare(Double.parseDouble(actual.trim()), Double.parseDouble(expected.trim())) == 0; } catch (NumberFormatException ignored) { return false; } }
    return actual.equals(expected);
  }
  private static String escape(String value) { return value.replace("\\\\", "\\\\\\\\").replace("\\\"", "\\\\\\\"").replace("\\n", "\\\\n").replace("\\r", "\\\\r"); }
}`;
}

function parseTaggedResults(stdout: string): { parsed: Map<string, Record<string, unknown>>; consoleLines: string[] } {
  const parsed = new Map<string, Record<string, unknown>>();
  const consoleLines: string[] = [];
  for (const line of stdout.split(/\r?\n/)) {
    if (line.startsWith(RESULT_PREFIX)) {
      try { const value = JSON.parse(line.slice(RESULT_PREFIX.length)) as Record<string, unknown>; if (typeof value.id === "string") parsed.set(value.id, value); }
      catch { consoleLines.push(line); }
    } else if (line) consoleLines.push(line);
  }
  return { parsed, consoleLines };
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

  async buildWorkspace(sourceCode, tests, entrypoint = { className: "Solution", name: "sum" }): Promise<PreparedJavaWorkspace> {
    if (/^\s*package\s+/m.test(sourceCode)) {
      throw new AppError(
        "JAVA_PACKAGE_NOT_ALLOWED",
        "validation",
        "Package declarations are not supported in this exercise."
      );
    }

    const resolved = { className: entrypoint.className ?? "Solution", name: entrypoint.name };
    if (!/^[A-Za-z_$][\w$]*$/.test(resolved.className) || !/^[A-Za-z_$][\w$]*$/.test(resolved.name)) throw new AppError("ENTRYPOINT_INVALID", "validation", "The Java function entrypoint is invalid.");
    const directory = await mkdtemp(join(tmpdir(), "learnlocal-java-"));
    await Promise.all([
      writeFile(join(directory, `${resolved.className}.java`), sourceCode, "utf8"),
      writeFile(join(directory, "LearnLocalHarness.java"), createHarness(tests, resolved), "utf8")
    ]);

    return {
      directory,
      compileCommand: ["javac", "-encoding", "UTF-8", `${resolved.className}.java`, "LearnLocalHarness.java"],
      runCommand: ["java", "-Xms16m", "-Xmx128m", "LearnLocalHarness"],
      tests
    };
  },

  async buildOutputWorkspace(sourceCode, tests): Promise<PreparedOutputWorkspace> {
    if (/^\s*package\s+/m.test(sourceCode)) throw new AppError("JAVA_PACKAGE_NOT_ALLOWED", "validation", "Package declarations are not supported in this exercise.");
    const className = /public\s+(?:final\s+)?class\s+([A-Za-z_$][\w$]*)/.exec(sourceCode)?.[1] ?? "Main";
    const directory = await mkdtemp(join(tmpdir(), "learnlocal-java-output-"));
    await Promise.all([
      writeFile(join(directory, `${className}.java`), sourceCode, "utf8"),
      writeFile(join(directory, "LearnLocalOutputHarness.java"), createOutputHarness(tests, className), "utf8")
    ]);
    return {
      directory,
      compileCommand: ["javac", "-encoding", "UTF-8", `${className}.java`, "LearnLocalOutputHarness.java"],
      runCommand: ["java", "-Xms16m", "-Xmx128m", "LearnLocalOutputHarness"],
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
  },

  parseOutputExecution(executionId, raw, tests, startedAt): ExecutionResult {
    const wallTimeMs = Date.now() - startedAt;
    const resources = { wallTimeMs, timedOut: raw.compile.timedOut || Boolean(raw.run?.timedOut), outputTruncated: raw.compile.outputTruncated || Boolean(raw.run?.outputTruncated) };
    if (raw.compile.exitCode !== 0 || raw.compile.timedOut || raw.compile.cancelled) {
      return { executionId, language: "java", runtimeVersion: "21", status: raw.compile.timedOut || raw.compile.cancelled ? statusFromProcess(raw.compile) : "compile-error", compile: { attempted: true, success: false, durationMs: raw.compile.durationMs, diagnostics: parseDiagnostics(raw.compile.stderr) }, tests: [], console: raw.compile.stderr, resources };
    }
    const run = raw.run;
    if (!run) throw new Error("The sandbox did not return a Java run result.");
    const { parsed, consoleLines } = parseTaggedResults(run.stdout);
    const results: TestResult[] = tests.map((test) => {
      const value = parsed.get(test.id);
      const common = { id: test.id, visibility: test.visibility, passed: value?.passed === true, durationMs: typeof value?.durationMs === "number" ? value.durationMs : 0 };
      return test.visibility === "hidden" ? (common.passed ? common : { ...common, feedbackCode: "WRONG_RESULT" as const }) : { ...common, expected: test.expected, actual: value?.actual, ...(!common.passed ? { feedbackCode: "WRONG_RESULT" as const } : {}) };
    });
    return { executionId, language: "java", runtimeVersion: "21", status: run.exitCode !== 0 || run.timedOut || run.cancelled ? statusFromProcess(run) : "finished", compile: { attempted: true, success: true, durationMs: raw.compile.durationMs, diagnostics: [] }, tests: results, console: [...consoleLines, run.stderr].filter(Boolean).join("\n"), resources };
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
