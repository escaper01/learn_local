import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { java21Adapter, SUM_EXERCISE } from "./index";

describe("Java adapter", () => {
  it("rejects package declarations before execution", async () => {
    await expect(
      java21Adapter.buildWorkspace("package unsafe; public class Solution {}", SUM_EXERCISE.publicTests)
    ).rejects.toMatchObject({ code: "JAVA_PACKAGE_NOT_ALLOWED" });
  });

  it("creates a structured workspace with allowlisted commands", async () => {
    const workspace = await java21Adapter.buildWorkspace(
      "public class Solution { public static int sum(int[] values) { return 0; } }",
      SUM_EXERCISE.publicTests
    );
    try {
      expect(workspace.compileCommand[0]).toBe("javac");
      expect(workspace.runCommand[0]).toBe("java");
      expect(workspace.compileCommand.join(" ")).not.toContain("sh -c");
    } finally {
      await rm(workspace.directory, { recursive: true, force: true });
    }
  });

  it("creates a trusted output harness without a shell command", async () => {
    const workspace = await java21Adapter.buildOutputWorkspace(
      "public class Main { public static void main(String[] args) { System.out.println(42); } }",
      [{ id: "answer", visibility: "public", input: "", expected: "42", comparison: "trimmed" }]
    );
    try {
      expect(workspace.compileCommand).toContain("LearnLocalOutputHarness.java");
      expect(workspace.runCommand[0]).toBe("java");
      expect(workspace.runCommand.join(" ")).not.toContain("sh -c");
    } finally {
      await rm(workspace.directory, { recursive: true, force: true });
    }
  });

  it("uses a declared function entrypoint", async () => {
    const workspace = await java21Adapter.buildWorkspace("public class Calculator { public static int total(int[] values) { return 0; } }", SUM_EXERCISE.publicTests, { className: "Calculator", name: "total" });
    try {
      expect(workspace.compileCommand).toContain("Calculator.java");
      expect(await readFile(join(workspace.directory, "LearnLocalHarness.java"), "utf8")).toContain("Calculator.total(input)");
    } finally { await rm(workspace.directory, { recursive: true, force: true }); }
  });
});
