import { rm } from "node:fs/promises";
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
});
