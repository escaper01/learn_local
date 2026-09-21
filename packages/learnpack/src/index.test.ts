import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { importLearnPack, inspectLearnPack, loadImportedCourse, toCourseView, validateLearnPackContent } from "./index";

function validEntries(): Map<string, unknown> {
  return new Map([
    ["manifest.json", {
      format: "learnpack",
      schemaVersion: "1.0.0",
      id: "java-foundations",
      version: "1.0.0",
      course: {
        title: "Java Foundations",
        description: "Learn Java safely.",
        language: "java",
        languageVersion: "21",
        level: "beginner",
        estimatedHours: 12,
        authors: [{ name: "LearnLocal" }]
      },
      runtime: { adapter: "java", adapterRange: ">=0.1.0 <2.0.0", runtimeVersion: "21" },
      modules: ["content/01-basics.json"],
      projects: []
    }],
    ["content/01-basics.json", {
      id: "java-basics",
      title: "Java basics",
      lessons: [{
        id: "arrays",
        title: "Arrays",
        theoryMarkdown: "Arrays hold values.",
        exercises: [{
          id: "sum-array",
          type: "function",
          title: "Sum an array",
          instructionMarkdown: "Return the total.",
          starterFiles: [{ path: "Solution.java", content: "public class Solution {}" }],
          tests: [{ id: "basic", visibility: "public", arguments: [[1, 2]], expected: 3 }]
        }]
      }]
    }]
  ]);
}

describe("LearnPack semantic validation", () => {
  it("inspects the canonical LearnPack archive without extracting it", async () => {
    const path = resolve(import.meta.dirname, "../../../learnpack-spec/examples/java-foundations.learnpack");
    const pack = await inspectLearnPack(path);
    expect(pack.summary).toMatchObject({ id: "java-foundations", exerciseCount: 1 });
  });

  it("revalidates stored courses and redacts all test definitions from the renderer view", async () => {
    const library = await mkdtemp(resolve(tmpdir(), "learnlocal-courses-"));
    const path = resolve(import.meta.dirname, "../../../learnpack-spec/examples/java-foundations.learnpack");
    try {
      await importLearnPack(path, library);
      const stored = await loadImportedCourse(library, "java-foundations", "1.0.0");
      const view = toCourseView(stored);
      const exercise = view.modules[0]?.lessons[0]?.exercises[0];
      expect(exercise).toMatchObject({ publicTestCount: 2, hiddenTestCount: 1 });
      expect(exercise).not.toHaveProperty("tests");
    } finally {
      await rm(library, { recursive: true, force: true });
    }
  });

  it("returns a deterministic import summary", () => {
    const pack = validateLearnPackContent(validEntries(), "2026-01-01T00:00:00.000Z");
    expect(pack.summary).toMatchObject({
      id: "java-foundations",
      moduleCount: 1,
      lessonCount: 1,
      exerciseCount: 1
    });
  });

  it("rejects missing referenced modules", () => {
    const entries = validEntries();
    entries.delete("content/01-basics.json");
    expect(() => validateLearnPackContent(entries)).toThrowError(/semantic validation/i);
  });

  it("rejects duplicate stable IDs", () => {
    const entries = validEntries();
    const module = entries.get("content/01-basics.json") as { id: string };
    module.id = "java-foundations";
    expect(() => validateLearnPackContent(entries)).toThrowError(/semantic validation/i);
  });
});
