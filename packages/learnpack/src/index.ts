import { lstat, mkdir, readFile, readdir, realpath, rm, rmdir, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import Ajv2020, { type ErrorObject } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { AppError, type CourseView, type ImportedCourseSummary, type ValidationIssue } from "@learnlocal/contracts";
import manifestSchema from "../schema/manifest.schema.json";
import moduleSchema from "../schema/module.schema.json";
import projectSchema from "../schema/project.schema.json";

const MAX_EXPANDED_BYTES = 100 * 1024 * 1024;
const MAX_ENTRY_BYTES = 5 * 1024 * 1024;
const MAX_ENTRIES = 500;
const FORBIDDEN_EXTENSIONS = new Set([
  ".app", ".bat", ".cmd", ".com", ".dll", ".dylib", ".exe", ".jar", ".msi", ".ps1", ".sh", ".so"
]);

export interface LearnPackAuthor { name: string }
export interface LearnPackManifest {
  format: "learnpack";
  schemaVersion: "1.0.0";
  id: string;
  version: string;
  course: {
    title: string;
    description: string;
    language: string;
    languageVersion: string;
    fileExtension?: string;
    level: "beginner" | "intermediate" | "advanced";
    estimatedHours: number;
    authors: LearnPackAuthor[];
  };
  runtime: { adapter: string; adapterRange: string; runtimeVersion: string; containerRequirements?: string };
  modules: string[];
  projects: string[];
}

export interface LearnPackExercise {
  id: string;
  type: "output" | "function" | "debug" | "multipleChoice" | "project";
  title: string;
  instructionMarkdown: string;
  starterFiles?: Array<{ path: string; content: string }>;
  entrypoint?: { kind?: "function"; className?: string; name?: string; parameters?: Array<{ name: string; type: "int" | "double" | "boolean" | "string" | "int[]" | "double[]" | "boolean[]" | "string[]" }>; returns?: "int" | "double" | "boolean" | "string" | "int[]" | "double[]" | "boolean[]" | "string[]" };
  tests?: Array<{ id: string; visibility: "public" | "hidden"; arguments?: unknown[]; input?: string; expected: unknown; comparison?: string }>;
  hints?: string[];
  choices?: string[];
  correctChoice?: number;
  limits?: { timeoutMs?: number; memoryMb?: number; maxOutputKb?: number };
}

export interface LearnPackLesson {
  id: string;
  title: string;
  theoryMarkdown: string;
  exercises: LearnPackExercise[];
}

export interface LearnPackModule {
  id: string;
  title: string;
  description?: string;
  lessons: LearnPackLesson[];
}

type LearnPackLessonSource = Omit<LearnPackLesson, "theoryMarkdown"> & ({ theoryMarkdown: string; theoryFile?: undefined } | { theoryFile: string; theoryMarkdown?: undefined });
type LearnPackModuleSource = Omit<LearnPackModule, "lessons"> & { lessons: LearnPackLessonSource[] };

export interface LearnPackProject {
  id: string;
  title: string;
  descriptionMarkdown: string;
  learningObjectives?: string[];
  checkpointExerciseIds: string[];
}

export interface ValidatedLearnPack {
  manifest: LearnPackManifest;
  modules: LearnPackModule[];
  projects: Record<string, LearnPackProject>;
  summary: ImportedCourseSummary;
  warnings: ValidationIssue[];
}

export interface LearnPackScaffoldResult {
  courseId: string;
  root: string;
  created: number;
  existing: number;
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateManifest = ajv.compile<LearnPackManifest>(manifestSchema);
const validateModule = ajv.compile<LearnPackModuleSource>(moduleSchema);
const MAX_THEORY_CHARACTERS = 200_000;
const validateProject = ajv.compile<LearnPackProject>(projectSchema);

function schemaIssues(errors: ErrorObject[] | null | undefined, file: string): ValidationIssue[] {
  return (errors ?? []).map((error) => ({
    code: "PACK_SCHEMA_INVALID",
    severity: "error",
    file,
    path: error.instancePath || "/",
    message: error.keyword === "additionalProperties" && typeof error.params.additionalProperty === "string"
      ? `Unexpected property "${error.params.additionalProperty}".`
      : error.keyword === "required" && typeof error.params.missingProperty === "string"
        ? `Missing required property "${error.params.missingProperty}".`
        : error.message ?? "Value does not match the LearnPack schema."
  }));
}

function isSafeArchivePath(path: string): boolean {
  if (!path || path.includes("\\") || path.includes("\0") || path.startsWith("/") || /^[a-zA-Z]:/.test(path)) return false;
  const segments = path.split("/");
  return segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function matchesFunctionType(value: unknown, type: string): boolean {
  if (type.endsWith("[]")) return Array.isArray(value) && value.every((item) => matchesFunctionType(item, type.slice(0, -2)));
  if (type === "int") return typeof value === "number" && Number.isSafeInteger(value);
  if (type === "double") return typeof value === "number" && Number.isFinite(value);
  if (type === "boolean") return typeof value === "boolean";
  return type === "string" && typeof value === "string";
}

function extension(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const index = name.lastIndexOf(".");
  return index < 0 ? "" : name.slice(index).toLowerCase();
}

export function normalizeArchivePath(path: string): string {
  return path.replaceAll("\\", "/");
}

export async function scaffoldLearnPackFromManifest(manifestPath: string): Promise<LearnPackScaffoldResult> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
  } catch (error) {
    throw new AppError("PACK_INVALID_JSON", "validation", "The selected manifest is not valid JSON.", {
      diagnostics: error instanceof Error ? error.message : String(error)
    });
  }
  if (!validateManifest(value)) {
    throw new AppError("PACK_SCHEMA_INVALID", "validation", "manifest.json does not match LearnPack 1.0.", {
      issues: schemaIssues(validateManifest.errors, "manifest.json")
    });
  }

  const root = dirname(resolve(manifestPath));
  const references = [...value.modules, ...value.projects];
  let created = 0;
  let existing = 0;
  for (const reference of references) {
    if (!isSafeArchivePath(reference)) throw new AppError("PACK_PATH_TRAVERSAL", "validation", `Unsafe manifest path: ${reference}`);
    const target = resolve(root, ...reference.split("/"));
    const targetRelative = relative(root, target);
    if (!targetRelative || targetRelative.startsWith("..")) throw new AppError("PACK_PATH_TRAVERSAL", "validation", `Unsafe manifest path: ${reference}`);
    await mkdir(dirname(target), { recursive: true });
    try {
      await writeFile(target, "{}\n", { encoding: "utf8", flag: "wx" });
      created += 1;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      existing += 1;
    }
  }
  return { courseId: value.id, root, created, existing };
}

interface DirectoryFileEntry {
  relativePath: string;
  absolutePath: string;
  sizeBytes: number;
}

// Walks the imported folder from a realpath'd root so every entry's containment check
// is verified against the fully-resolved base, not just the string the user selected.
async function collectDirectoryFiles(root: string): Promise<DirectoryFileEntry[]> {
  const resolvedRoot = await realpath(resolve(root));
  const results: DirectoryFileEntry[] = [];

  async function walk(currentAbsolute: string, currentRelative: string): Promise<void> {
    const entries = await readdir(currentAbsolute, { withFileTypes: true });
    for (const entry of entries) {
      const entryAbsolute = join(currentAbsolute, entry.name);
      const entryRelative = currentRelative ? `${currentRelative}/${entry.name}` : entry.name;
      const info = await lstat(entryAbsolute);
      if (info.isSymbolicLink()) throw new AppError("PACK_SYMLINK_NOT_ALLOWED", "validation", `Symbolic links are not allowed: ${entryRelative}`);
      const resolvedEntry = await realpath(entryAbsolute);
      const resolvedRelative = relative(resolvedRoot, resolvedEntry);
      if (resolvedRelative.startsWith("..") || isAbsolute(resolvedRelative)) throw new AppError("PACK_PATH_TRAVERSAL", "validation", `Unsafe archive path: ${entryRelative}`);
      if (info.isDirectory()) {
        await walk(entryAbsolute, entryRelative);
      } else if (info.isFile()) {
        results.push({ relativePath: entryRelative, absolutePath: entryAbsolute, sizeBytes: info.size });
      } else {
        throw new AppError("PACK_UNSUPPORTED_ENTRY", "validation", `Unsupported file type: ${entryRelative}`);
      }
    }
  }

  await walk(resolvedRoot, "");
  return results;
}

// JSON files are parsed; Markdown files are kept as text for lessons that reference them.
async function readDirectoryEntries(rootPath: string): Promise<Map<string, unknown>> {
  let root;
  try {
    root = await stat(rootPath);
  } catch {
    throw new AppError("PACK_NOT_DIRECTORY", "validation", "Select a LearnPack course folder.");
  }
  if (!root.isDirectory()) throw new AppError("PACK_NOT_DIRECTORY", "validation", "Select a LearnPack course folder.");

  const files = await collectDirectoryFiles(rootPath);
  const values = new Map<string, unknown>();
  const seen = new Set<string>();
  const state = { count: 0, expanded: 0 };

  for (const file of files) {
    if (!isSafeArchivePath(file.relativePath)) throw new AppError("PACK_PATH_TRAVERSAL", "validation", `Unsafe archive path: ${file.relativePath}`);
    state.count += 1;
    if (state.count > MAX_ENTRIES) throw new AppError("PACK_ENTRY_LIMIT", "validation", `LearnPack has more than ${MAX_ENTRIES} entries.`);
    if (seen.has(file.relativePath)) throw new AppError("PACK_DUPLICATE_PATH", "validation", `Duplicate archive path: ${file.relativePath}`);
    seen.add(file.relativePath);

    const fileExtension = extension(file.relativePath);
    if (FORBIDDEN_EXTENSIONS.has(fileExtension)) throw new AppError("PACK_EXECUTABLE_NOT_ALLOWED", "validation", `Executable content is not allowed: ${file.relativePath}`);
    if (file.sizeBytes > MAX_ENTRY_BYTES) throw new AppError("PACK_ENTRY_SIZE_LIMIT", "validation", `Archive entry is too large: ${file.relativePath}`);
    state.expanded += file.sizeBytes;
    if (state.expanded > MAX_EXPANDED_BYTES) throw new AppError("PACK_EXPANDED_SIZE_LIMIT", "validation", "LearnPack expands beyond the 100 MB safety limit.");

    if (fileExtension === ".json") {
      const content = await readFile(file.absolutePath, "utf8");
      try {
        values.set(file.relativePath, JSON.parse(content) as unknown);
      } catch {
        throw new AppError("PACK_INVALID_JSON", "validation", `Invalid JSON in ${file.relativePath}.`, { file: file.relativePath });
      }
    } else if (fileExtension === ".md") {
      values.set(file.relativePath, (await readFile(file.absolutePath, "utf8")).replace(/^﻿/, ""));
    }
  }

  return values;
}

export function validateLearnPackContent(entries: ReadonlyMap<string, unknown>, importedAt = new Date().toISOString()): ValidatedLearnPack {
  const manifestValue = entries.get("manifest.json");
  if (!manifestValue) throw new AppError("PACK_MANIFEST_MISSING", "validation", "The archive does not contain manifest.json.");
  if (!validateManifest(manifestValue)) {
    throw new AppError("PACK_SCHEMA_INVALID", "validation", "manifest.json does not match LearnPack 1.0.", {
      issues: schemaIssues(validateManifest.errors, "manifest.json")
    });
  }
  const manifest = manifestValue;
  const issues: ValidationIssue[] = [];
  for (const [kind, references] of [["modules", manifest.modules], ["projects", manifest.projects]] as const) {
    const seenReferences = new Set<string>();
    for (const reference of references) {
      if (seenReferences.has(reference)) issues.push({ code: "PACK_DUPLICATE_REFERENCE", severity: "error", file: "manifest.json", path: `/${kind}`, message: `The manifest references '${reference}' more than once.` });
      seenReferences.add(reference);
    }
  }
  if (manifest.course.language !== manifest.runtime.adapter) {
    issues.push({ code: "PACK_ADAPTER_LANGUAGE_MISMATCH", severity: "error", file: "manifest.json", path: "/runtime/adapter", message: "Runtime adapter must match the course language." });
  }
  if (manifest.course.languageVersion !== manifest.runtime.runtimeVersion) {
    issues.push({ code: "PACK_RUNTIME_VERSION_MISMATCH", severity: "error", file: "manifest.json", path: "/runtime/runtimeVersion", message: "Runtime version must match the declared course language version." });
  }

  const ids = new Map<string, string>();
  const registerId = (id: string, location: string) => {
    const previous = ids.get(id);
    if (previous) issues.push({ code: "PACK_DUPLICATE_ID", severity: "error", file: location, message: `ID '${id}' is already used in ${previous}.` });
    else ids.set(id, location);
  };
  registerId(manifest.id, "manifest.json");

  const modules: LearnPackModule[] = [];
  for (const modulePath of manifest.modules) {
    const value = entries.get(modulePath);
    if (!value) {
      issues.push({ code: "PACK_REFERENCE_MISSING", severity: "error", file: "manifest.json", path: "/modules", message: `Referenced module does not exist: ${modulePath}` });
      continue;
    }
    if (!validateModule(value)) {
      issues.push(...schemaIssues(validateModule.errors, modulePath));
      continue;
    }
    const module: LearnPackModule = {
      id: value.id,
      title: value.title,
      ...(value.description !== undefined ? { description: value.description } : {}),
      lessons: value.lessons.map((lesson, lessonIndex) => {
        let theoryMarkdown = lesson.theoryMarkdown ?? "";
        if (lesson.theoryFile !== undefined) {
          const reference = lesson.theoryFile;
          const location = `/lessons/${lessonIndex}/theoryFile`;
          const text = isSafeArchivePath(reference) ? entries.get(reference) : undefined;
          if (!isSafeArchivePath(reference)) issues.push({ code: "PACK_PATH_TRAVERSAL", severity: "error", file: modulePath, path: location, message: `Lesson '${lesson.id}' references an unsafe Markdown path: ${reference}` });
          else if (typeof text !== "string") issues.push({ code: "PACK_REFERENCE_MISSING", severity: "error", file: modulePath, path: location, message: `Lesson '${lesson.id}' references a Markdown file that does not exist: ${reference}` });
          else if (!text.trim()) issues.push({ code: "PACK_THEORY_EMPTY", severity: "error", file: reference, message: `Lesson '${lesson.id}' theory file is empty.` });
          else if (text.length > MAX_THEORY_CHARACTERS) issues.push({ code: "PACK_THEORY_TOO_LARGE", severity: "error", file: reference, message: `Lesson '${lesson.id}' theory exceeds ${MAX_THEORY_CHARACTERS} characters.` });
          else theoryMarkdown = text;
        }
        return { id: lesson.id, title: lesson.title, theoryMarkdown, exercises: lesson.exercises };
      })
    };
    modules.push(module);
    registerId(module.id, modulePath);
    for (const lesson of module.lessons) {
      registerId(lesson.id, modulePath);
      for (const exercise of lesson.exercises) {
        registerId(exercise.id, modulePath);
        const location = `${modulePath}#${exercise.id}`;
        if (exercise.type === "multipleChoice") {
          if (!exercise.choices || exercise.correctChoice === undefined || exercise.correctChoice >= exercise.choices.length) {
            issues.push({ code: "PACK_QUIZ_INVALID", severity: "error", file: modulePath, message: `Concept check '${exercise.id}' requires choices and a valid correctChoice.` });
          }
        } else {
          if (!exercise.starterFiles?.length) issues.push({ code: "PACK_STARTER_MISSING", severity: "error", file: modulePath, message: `Exercise '${exercise.id}' requires at least one starter file.` });
          if (!exercise.tests?.length) issues.push({ code: "PACK_TESTS_MISSING", severity: "error", file: modulePath, message: `Exercise '${exercise.id}' requires at least one declarative test.` });
        }
        const testIds = new Set<string>();
        for (const test of exercise.tests ?? []) {
          if (testIds.has(test.id)) issues.push({ code: "PACK_DUPLICATE_TEST_ID", severity: "error", file: modulePath, message: `Exercise '${exercise.id}' repeats test ID '${test.id}'.` });
          testIds.add(test.id);
          if (exercise.type === "output" || exercise.type === "project" || (exercise.type === "debug" && !exercise.entrypoint)) {
            if (typeof test.input !== "string" || typeof test.expected !== "string") issues.push({ code: "PACK_OUTPUT_TEST_INVALID", severity: "error", file: location, message: `Output test '${test.id}' requires string input and expected output.` });
          } else if (exercise.type === "function" || exercise.type === "debug") {
            const parameters = exercise.entrypoint?.parameters;
            const returns = exercise.entrypoint?.returns;
            if (!parameters || !returns) {
              const legacyArgument = test.arguments?.[0];
              if (!Array.isArray(legacyArgument) || !legacyArgument.every((value) => typeof value === "number" && Number.isFinite(value)) || typeof test.expected !== "number") {
                issues.push({ code: "PACK_FUNCTION_ENTRYPOINT_INVALID", severity: "error", file: location, message: `Function exercise '${exercise.id}' requires typed entrypoint parameters for non-numeric-list tests.` });
              }
            } else if (!test.arguments || test.arguments.length !== parameters.length || test.arguments.some((argument, index) => !matchesFunctionType(argument, parameters[index]!.type)) || !matchesFunctionType(test.expected, returns)) {
              issues.push({ code: "PACK_FUNCTION_TYPES_UNSUPPORTED", severity: "error", file: location, message: `Function test '${test.id}' arguments or expected value do not match its declared entrypoint types.` });
            }
          }
        }
        const starterPaths = new Set<string>();
        const declaredExtension = manifest.course.fileExtension ? `.${manifest.course.fileExtension.toLowerCase()}` : undefined;
        const expectedExtension = manifest.course.language === "java" ? ".java" : manifest.course.language === "python" ? ".py" : declaredExtension;
        for (const file of exercise.starterFiles ?? []) {
          if (!isSafeArchivePath(file.path)) issues.push({ code: "PACK_STARTER_PATH_INVALID", severity: "error", file: modulePath, message: `Exercise '${exercise.id}' contains unsafe starter path '${file.path}'.` });
          if (starterPaths.has(file.path)) issues.push({ code: "PACK_STARTER_PATH_DUPLICATE", severity: "error", file: modulePath, message: `Exercise '${exercise.id}' repeats starter path '${file.path}'.` });
          if (expectedExtension && !file.path.toLowerCase().endsWith(expectedExtension)) issues.push({ code: "PACK_STARTER_LANGUAGE_MISMATCH", severity: "error", file: modulePath, message: `Exercise '${exercise.id}' starter '${file.path}' must end in ${expectedExtension}.` });
          starterPaths.add(file.path);
        }
        if ((exercise.limits?.timeoutMs ?? 0) > 5_000 || (exercise.limits?.memoryMb ?? 0) > 256 || (exercise.limits?.maxOutputKb ?? 0) > 64) {
          issues.push({ code: "PACK_LIMIT_CLAMPED", severity: "warning", file: location, message: `Exercise '${exercise.id}' requests resources above the application policy; LearnLocal will apply its safer maximums.` });
        }
      }
    }
  }
  const exerciseById = new Map(modules.flatMap((module) => module.lessons).flatMap((lesson) => lesson.exercises).map((exercise) => [exercise.id, exercise]));
  const projects: Record<string, LearnPackProject> = {};
  for (const projectPath of manifest.projects) {
    const project = entries.get(projectPath);
    if (!project) {
      issues.push({ code: "PACK_REFERENCE_MISSING", severity: "error", file: "manifest.json", path: "/projects", message: `Referenced project does not exist: ${projectPath}` });
      continue;
    }
    if (!validateProject(project)) {
      issues.push(...schemaIssues(validateProject.errors, projectPath));
      continue;
    }
    projects[projectPath] = project;
    registerId(project.id, projectPath);
    for (const exerciseId of project.checkpointExerciseIds) {
      const exercise = exerciseById.get(exerciseId);
      if (!exercise) issues.push({ code: "PACK_PROJECT_CHECKPOINT_MISSING", severity: "error", file: projectPath, path: "/checkpointExerciseIds", message: `Project '${project.id}' references missing checkpoint exercise '${exerciseId}'.` });
      else if (exercise.type !== "project") issues.push({ code: "PACK_PROJECT_CHECKPOINT_TYPE", severity: "error", file: projectPath, path: "/checkpointExerciseIds", message: `Project checkpoint '${exerciseId}' must use exercise type 'project'.` });
    }
  }
  if (issues.some((issue) => issue.severity === "error")) {
    throw new AppError("PACK_SEMANTIC_INVALID", "validation", "LearnPack contains semantic validation errors.", { issues });
  }

  const lessons = modules.flatMap((module) => module.lessons);
  const summary: ImportedCourseSummary = {
    id: manifest.id,
    version: manifest.version,
    title: manifest.course.title,
    description: manifest.course.description,
    language: manifest.course.language,
    languageVersion: manifest.course.languageVersion,
    level: manifest.course.level,
    estimatedHours: manifest.course.estimatedHours,
    moduleCount: modules.length,
    lessonCount: lessons.length,
    exerciseCount: lessons.reduce((total, lesson) => total + lesson.exercises.length, 0),
    importedAt
  };
  return { manifest, modules, projects, summary, warnings: issues.filter((issue) => issue.severity === "warning") };
}

export async function inspectLearnPack(path: string): Promise<ValidatedLearnPack> {
  return validateLearnPackContent(await readDirectoryEntries(path));
}

export async function importLearnPack(path: string, libraryDirectory: string): Promise<ValidatedLearnPack> {
  const validated = await inspectLearnPack(path);
  const courseDirectory = join(libraryDirectory, validated.manifest.id);
  await mkdir(courseDirectory, { recursive: true });
  await writeFile(join(courseDirectory, `${validated.manifest.version}.course.json`), JSON.stringify(validated, null, 2), "utf8");
  return validated;
}

export async function removeImportedCourse(libraryDirectory: string, courseId: string, version: string): Promise<void> {
  if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(courseId) || !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(version)) {
    throw new AppError("COURSE_NOT_FOUND", "validation", "The requested imported course version is unavailable.");
  }
  const library = resolve(libraryDirectory);
  const courseDirectory = resolve(library, courseId);
  if (relative(library, courseDirectory) !== courseId) throw new AppError("PACK_PATH_TRAVERSAL", "validation", "Unsafe course location.");
  const record = join(courseDirectory, `${version}.course.json`);
  try {
    await stat(record);
  } catch {
    throw new AppError("COURSE_NOT_FOUND", "validation", "The requested imported course version is unavailable.");
  }
  await rm(record, { force: true });
  try {
    await rmdir(courseDirectory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOTEMPTY" && (error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
}

export async function listImportedCourses(libraryDirectory: string): Promise<ImportedCourseSummary[]> {
  await mkdir(libraryDirectory, { recursive: true });
  const courseDirectories = await readdir(libraryDirectory, { withFileTypes: true });
  const summaries: ImportedCourseSummary[] = [];
  for (const courseDirectory of courseDirectories) {
    if (!courseDirectory.isDirectory()) continue;
    const files = await readdir(join(libraryDirectory, courseDirectory.name));
    for (const file of files) {
      if (!file.endsWith(".course.json")) continue;
      try {
        const stored = JSON.parse(await readFile(join(libraryDirectory, courseDirectory.name, file), "utf8")) as ValidatedLearnPack;
        if (stored?.summary?.id && stored?.summary?.version) summaries.push(stored.summary);
      } catch {
        // A corrupt stored record is ignored here and will be surfaced by diagnostics/repair later.
      }
    }
  }
  return summaries.sort((left, right) => right.importedAt.localeCompare(left.importedAt));
}

export async function loadImportedCourse(libraryDirectory: string, courseId: string, version: string): Promise<ValidatedLearnPack> {
  const path = join(libraryDirectory, courseId, `${version}.course.json`);
  try {
    const stored = JSON.parse(await readFile(path, "utf8")) as ValidatedLearnPack;
    const entries = new Map<string, unknown>([["manifest.json", stored.manifest]]);
    stored.manifest.modules.forEach((modulePath, index) => entries.set(modulePath, stored.modules[index]));
    Object.entries(stored.projects ?? {}).forEach(([projectPath, project]) => entries.set(projectPath, project));
    return validateLearnPackContent(entries, stored.summary.importedAt);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("COURSE_NOT_FOUND", "validation", "The requested imported course version is unavailable.");
  }
}

export function toCourseView(
  pack: ValidatedLearnPack,
  revealedHintCount: (exerciseId: string) => number = () => 0,
  isCompleted: (exerciseId: string) => boolean = () => false
): CourseView {
  return {
    summary: pack.summary,
    projects: Object.entries(pack.projects).map(([path, project]) => ({
      path,
      id: project.id,
      title: project.title,
      descriptionMarkdown: project.descriptionMarkdown,
      learningObjectives: project.learningObjectives ?? [],
      checkpointExerciseIds: project.checkpointExerciseIds
    })),
    modules: pack.modules.map((module) => ({
      id: module.id,
      title: module.title,
      ...(module.description ? { description: module.description } : {}),
      lessons: module.lessons.map((lesson) => ({
        id: lesson.id,
        title: lesson.title,
        theoryMarkdown: lesson.theoryMarkdown,
        exercises: lesson.exercises.map((exercise) => ({
          id: exercise.id,
          type: exercise.type,
          title: exercise.title,
          instructionMarkdown: exercise.instructionMarkdown,
          starterFiles: exercise.starterFiles ?? [],
          hints: (exercise.hints ?? []).slice(0, revealedHintCount(exercise.id)),
          hintCount: exercise.hints?.length ?? 0,
          completed: isCompleted(exercise.id),
          ...(exercise.choices ? { choices: exercise.choices } : {}),
          publicTestCount: (exercise.tests ?? []).filter((test) => test.visibility === "public").length,
          hiddenTestCount: (exercise.tests ?? []).filter((test) => test.visibility === "hidden").length
        }))
      }))
    }))
  };
}
