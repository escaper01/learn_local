import { describe, expect, it } from "vitest";
import { join, resolve } from "node:path";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { importLearnPack, inspectLearnPack, loadImportedCourse, normalizeArchivePath, scaffoldLearnPackFromManifest, toCourseView, validateLearnPackContent } from "./index";

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
          entrypoint: { kind: "function", className: "Solution", name: "sum", parameters: [{ name: "values", type: "int[]" }], returns: "int" },
          tests: [{ id: "basic", visibility: "public", arguments: [[1, 2]], expected: 3 }]
        }]
      }]
    }]
  ]);
}

describe("LearnPack semantic validation", () => {
  it("validates the complete Java developer academy", async () => {
    const root = resolve(import.meta.dirname, "../../../examples");
    const manifest = JSON.parse(await readFile(join(root, "manifest.json"), "utf8")) as { modules: string[]; projects: string[] };
    const entries = new Map<string, unknown>([["manifest.json", manifest]]);
    for (const path of [...manifest.modules, ...manifest.projects]) {
      entries.set(path, JSON.parse(await readFile(join(root, ...path.split("/")), "utf8")));
    }
    expect(validateLearnPackContent(entries).summary).toMatchObject({
      id: "java-developer-academy-21",
      moduleCount: 25,
      lessonCount: 152,
      exerciseCount: 208
    });

    const modules = manifest.modules.map((path) => entries.get(path)) as Array<{
      description: string;
      lessons: Array<{ title: string; theoryMarkdown: string; exercises: unknown[] }>;
    }>;
    const teachingLessons = modules.flatMap((module) => module.lessons.slice(0, -1));
    expect(teachingLessons).toHaveLength(127);
    expect(modules.every((module) => module.description.length > 250)).toBe(true);
    expect(teachingLessons.every((lesson) => lesson.exercises.length >= 1)).toBe(true);
    expect(teachingLessons.every((lesson) => lesson.theoryMarkdown.startsWith(`# ${lesson.title}\n`))).toBe(true);
    expect(new Set(teachingLessons.map((lesson) => lesson.theoryMarkdown)).size).toBe(teachingLessons.length);
    expect(teachingLessons.some((lesson) => lesson.theoryMarkdown.includes("Define it in your own words"))).toBe(false);

    const bodies = teachingLessons.map((lesson) => lesson.theoryMarkdown.split("\n\n").slice(1).join("\n\n"));
    expect(new Set(bodies).size).toBe(bodies.length);
    expect(bodies.every((body) => !body.includes("Trace the example four times"))).toBe(true);
    const exercises = modules.flatMap((module) => module.lessons.flatMap((lesson) => lesson.exercises)) as Array<{
      type: string; instructionMarkdown: string; tests?: Array<{ input?: string; expected: unknown }>;
    }>;
    const questions = exercises.filter((exercise) => exercise.type === "multipleChoice");
    expect(new Set(questions.map((question) => question.instructionMarkdown)).size).toBe(questions.length);
    for (const project of exercises.filter((exercise) => exercise.type === "project")) {
      expect(new Set(project.tests?.map((test) => test.input)).size).toBeGreaterThanOrEqual(5);
      expect(new Set(project.tests?.map((test) => test.expected)).size).toBeGreaterThanOrEqual(4);
    }

    const archive = await inspectLearnPack(resolve(root, "../my-course.learnpack"));
    const source = validateLearnPackContent(entries);
    expect(archive.manifest).toEqual(source.manifest);
    expect(archive.modules).toEqual(source.modules);
    expect(archive.projects).toEqual(source.projects);
    expect(archive.summary).toMatchObject({
      id: "java-developer-academy-21",
      moduleCount: 25,
      lessonCount: 152,
      exerciseCount: 208
    });
  });

  it("normalizes Windows ZIP separators before validating paths", () => {
    expect(normalizeArchivePath("content\\module-01.json")).toBe("content/module-01.json");
    expect(normalizeArchivePath("..\\manifest.json")).toBe("../manifest.json");
  });

  it("imports an otherwise valid archive containing Windows ZIP separators", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "learnlocal-windows-zip-"));
    const source = resolve(import.meta.dirname, "../../../learnpack-spec/examples/java-foundations.learnpack");
    const archive = join(directory, "windows.learnpack");
    try {
      const bytes = await readFile(source);
      const slashPath = Buffer.from("content/01-arrays.json");
      const windowsPath = Buffer.from("content\\01-arrays.json");
      let replaced = 0;
      for (let offset = 0; offset <= bytes.length - slashPath.length; offset += 1) {
        if (bytes.subarray(offset, offset + slashPath.length).equals(slashPath)) {
          windowsPath.copy(bytes, offset);
          replaced += 1;
        }
      }
      expect(replaced).toBeGreaterThanOrEqual(2);
      await writeFile(archive, bytes);
      await expect(inspectLearnPack(archive)).resolves.toMatchObject({ summary: { id: "java-foundations" } });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("creates referenced files from a valid manifest without overwriting existing work", async () => {
    const directory = await mkdtemp(resolve(tmpdir(), "learnlocal-scaffold-"));
    const manifestPath = join(directory, "manifest.json");
    const manifest = validEntries().get("manifest.json") as Record<string, unknown>;
    manifest.projects = ["projects/final-project.json"];
    try {
      await writeFile(manifestPath, JSON.stringify(manifest));
      const first = await scaffoldLearnPackFromManifest(manifestPath);
      expect(first).toMatchObject({ courseId: "java-foundations", created: 2, existing: 0 });
      expect(await readFile(join(directory, "content", "01-basics.json"), "utf8")).toBe("{}\n");
      await writeFile(join(directory, "content", "01-basics.json"), "{\"saved\":true}\n");
      const second = await scaffoldLearnPackFromManifest(manifestPath);
      expect(second).toMatchObject({ created: 0, existing: 2 });
      expect(await readFile(join(directory, "content", "01-basics.json"), "utf8")).toBe("{\"saved\":true}\n");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

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

  it("imports an arbitrary language as study content with declared runtime metadata", () => {
    const entries = validEntries();
    const manifest = entries.get("manifest.json") as {
      course: Record<string, unknown>;
      runtime: Record<string, unknown>;
    };
    manifest.course.title = "Rust Foundations";
    manifest.course.language = "rust";
    manifest.course.languageVersion = "1.82";
    manifest.course.fileExtension = "rs";
    manifest.runtime.adapter = "rust";
    manifest.runtime.runtimeVersion = "1.82";
    manifest.runtime.containerRequirements = "Rust 1.82 compiler and Cargo";
    const exercise = (entries.get("content/01-basics.json") as { lessons: Array<{ exercises: Array<Record<string, unknown>> }> }).lessons[0]!.exercises[0]!;
    exercise.starterFiles = [{ path: "solution.rs", content: "fn main() {}" }];

    expect(validateLearnPackContent(entries).summary).toMatchObject({
      title: "Rust Foundations",
      language: "rust",
      languageVersion: "1.82"
    });
  });

  it("names unexpected and missing manifest properties in repair details", () => {
    const entries = validEntries();
    const manifest = entries.get("manifest.json") as Record<string, unknown>;
    manifest.title = "Wrong location";
    delete (manifest.course as Record<string, unknown>).title;
    try {
      validateLearnPackContent(entries);
      throw new Error("Expected manifest validation to fail.");
    } catch (error) {
      expect(error).toMatchObject({
        details: {
          issues: expect.arrayContaining([
            expect.objectContaining({ message: 'Unexpected property "title".' }),
            expect.objectContaining({ path: "/course", message: 'Missing required property "title".' })
          ])
        }
      });
    }
  });

  it("exposes quiz choices without revealing the trusted answer", () => {
    const entries = validEntries();
    const module = entries.get("content/01-basics.json") as {
      lessons: Array<{ exercises: Array<Record<string, unknown>> }>;
    };
    module.lessons[0]?.exercises.push({
      id: "array-concept",
      type: "multipleChoice",
      title: "Choose the array",
      instructionMarkdown: "Which value is an array?",
      choices: ["1", "[1, 2]", "true"],
      correctChoice: 1
    });

    const pack = validateLearnPackContent(entries);
    const exercise = toCourseView(pack).modules[0]?.lessons[0]?.exercises[1];
    expect(exercise?.choices).toEqual(["1", "[1, 2]", "true"]);
    expect(exercise).not.toHaveProperty("correctChoice");
  });

  it("only exposes hints that the learner already revealed", () => {
    const entries = validEntries();
    const module = entries.get("content/01-basics.json") as {
      lessons: Array<{ exercises: Array<Record<string, unknown>> }>;
    };
    module.lessons[0]!.exercises[0]!.hints = ["Start small", "Use a loop"];
    const pack = validateLearnPackContent(entries);
    const hidden = toCourseView(pack).modules[0]!.lessons[0]!.exercises[0]!;
    const revealed = toCourseView(pack, () => 1).modules[0]!.lessons[0]!.exercises[0]!;
    expect(hidden).toMatchObject({ hints: [], hintCount: 2 });
    expect(revealed.hints).toEqual(["Start small"]);
  });

  it("maps persisted completion into the course outline", () => {
    const pack = validateLearnPackContent(validEntries());
    const exercise = toCourseView(pack, () => 0, (id) => id === "sum-array").modules[0]!.lessons[0]!.exercises[0]!;
    expect(exercise.completed).toBe(true);
  });

  it("validates and exposes ordered project milestones", () => {
    const entries = validEntries();
    const manifest = entries.get("manifest.json") as { projects: string[] };
    const module = entries.get("content/01-basics.json") as { lessons: Array<{ exercises: Array<Record<string, unknown>> }> };
    manifest.projects = ["projects/array-tool.json"];
    module.lessons[0]!.exercises[0]!.type = "project";
    module.lessons[0]!.exercises[0]!.tests = [{ id: "basic", visibility: "public", input: "", expected: "3" }];
    entries.set("projects/array-tool.json", {
      id: "array-tool",
      title: "Array tool",
      descriptionMarkdown: "Build a useful array utility.",
      learningObjectives: ["Combine loops and input"],
      checkpointExerciseIds: ["sum-array"]
    });
    const view = toCourseView(validateLearnPackContent(entries));
    expect(view.projects[0]).toMatchObject({ id: "array-tool", checkpointExerciseIds: ["sum-array"] });
  });

  it("rejects project files with missing checkpoints", () => {
    const entries = validEntries();
    (entries.get("manifest.json") as { projects: string[] }).projects = ["projects/missing.json"];
    entries.set("projects/missing.json", { id: "missing-project", title: "Missing", descriptionMarkdown: "Invalid project.", checkpointExerciseIds: ["not-found"] });
    expect(() => validateLearnPackContent(entries)).toThrowError(/semantic validation/i);
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

  it("rejects duplicate and language-mismatched starter files", () => {
    const entries = validEntries();
    const exercise = (entries.get("content/01-basics.json") as { lessons: Array<{ exercises: Array<Record<string, unknown>> }> }).lessons[0]!.exercises[0]!;
    exercise.starterFiles = [{ path: "solution.py", content: "pass" }, { path: "solution.py", content: "pass" }];
    expect(() => validateLearnPackContent(entries)).toThrowError(/semantic validation/i);
  });

  it("rejects duplicate manifest references", () => {
    const entries = validEntries();
    (entries.get("manifest.json") as { modules: string[] }).modules.push("content/01-basics.json");
    expect(() => validateLearnPackContent(entries)).toThrowError(/manifest|semantic validation/i);
  });

  it("rejects exercises whose declarative tests cannot be executed", () => {
    const entries = validEntries();
    const module = entries.get("content/01-basics.json") as { lessons: Array<{ exercises: Array<Record<string, unknown>> }> };
    module.lessons[0]!.exercises[0]!.type = "output";
    expect(() => validateLearnPackContent(entries)).toThrowError(/semantic validation/i);
  });

  it("accepts typed multi-argument function tests", () => {
    const entries = validEntries();
    const exercise = (entries.get("content/01-basics.json") as { lessons: Array<{ exercises: Array<Record<string, unknown>> }> }).lessons[0]!.exercises[0]!;
    exercise.entrypoint = { kind: "function", className: "Solution", name: "format", parameters: [{ name: "text", type: "string" }, { name: "count", type: "int" }, { name: "upper", type: "boolean" }], returns: "string" };
    exercise.tests = [{ id: "format", visibility: "public", arguments: ["go", 3, true], expected: "GOGOGO" }];
    expect(validateLearnPackContent(entries).summary.exerciseCount).toBe(1);
  });

  it("warns when course limits exceed the locked sandbox policy", () => {
    const entries = validEntries();
    const module = entries.get("content/01-basics.json") as { lessons: Array<{ exercises: Array<Record<string, unknown>> }> };
    module.lessons[0]!.exercises[0]!.limits = { timeoutMs: 10_000, memoryMb: 512, maxOutputKb: 128 };
    const pack = validateLearnPackContent(entries);
    expect(pack.warnings).toContainEqual(expect.objectContaining({ code: "PACK_LIMIT_CLAMPED" }));
  });
});
