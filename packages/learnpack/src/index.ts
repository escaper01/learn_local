import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import Ajv2020, { type ErrorObject } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import yauzl, { type Entry, type ZipFile } from "yauzl";
import { AppError, type CourseView, type ImportedCourseSummary, type ValidationIssue } from "@learnlocal/contracts";
import manifestSchema from "../schema/manifest.schema.json";
import moduleSchema from "../schema/module.schema.json";
import projectSchema from "../schema/project.schema.json";

const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
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
const validateModule = ajv.compile<LearnPackModule>(moduleSchema);
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

function assertEntryAllowed(entry: Entry, normalizedPath: string, seen: Set<string>, state: { count: number; expanded: number }): void {
  state.count += 1;
  state.expanded += entry.uncompressedSize;
  if (state.count > MAX_ENTRIES) throw new AppError("PACK_ENTRY_LIMIT", "validation", `LearnPack has more than ${MAX_ENTRIES} entries.`);
  if (state.expanded > MAX_EXPANDED_BYTES) throw new AppError("PACK_EXPANDED_SIZE_LIMIT", "validation", "LearnPack expands beyond the 100 MB safety limit.");
  if (!isSafeArchivePath(normalizedPath)) throw new AppError("PACK_PATH_TRAVERSAL", "validation", `Unsafe archive path: ${entry.fileName}`);
  if (seen.has(normalizedPath)) throw new AppError("PACK_DUPLICATE_PATH", "validation", `Duplicate archive path: ${normalizedPath}`);
  seen.add(normalizedPath);

  const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff;
  if ((unixMode & 0o170000) === 0o120000) throw new AppError("PACK_SYMLINK_NOT_ALLOWED", "validation", `Symbolic links are not allowed: ${entry.fileName}`);
  if (FORBIDDEN_EXTENSIONS.has(extension(normalizedPath))) throw new AppError("PACK_EXECUTABLE_NOT_ALLOWED", "validation", `Executable content is not allowed: ${normalizedPath}`);
  if (entry.uncompressedSize > MAX_ENTRY_BYTES) throw new AppError("PACK_ENTRY_SIZE_LIMIT", "validation", `Archive entry is too large: ${entry.fileName}`);
}

function openZip(path: string): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true, autoClose: true, strictFileNames: false, validateEntrySizes: true }, (error, zip) => {
      if (error || !zip) reject(error ?? new Error("Unable to open ZIP archive."));
      else resolve(zip);
    });
  });
}

function readEntry(zip: ZipFile, entry: Entry): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (error, stream) => {
      if (error || !stream) {
        reject(error ?? new Error(`Unable to read ${entry.fileName}.`));
        return;
      }
      const chunks: Buffer[] = [];
      let size = 0;
      stream.on("data", (chunk: Buffer) => {
        size += chunk.byteLength;
        if (size > MAX_ENTRY_BYTES) stream.destroy(new Error("Archive entry exceeded its declared safety limit."));
        else chunks.push(chunk);
      });
      stream.once("error", reject);
      stream.once("end", () => resolve(Buffer.concat(chunks)));
    });
  });
}

async function readJsonEntries(path: string): Promise<Map<string, unknown>> {
  const archive = await stat(path);
  if (!archive.isFile() || archive.size > MAX_ARCHIVE_BYTES) {
    throw new AppError("PACK_ARCHIVE_SIZE_LIMIT", "validation", "LearnPack must be a file no larger than 50 MB.");
  }
  const zip = await openZip(path);
  const values = new Map<string, unknown>();
  const seen = new Set<string>();
  const limits = { count: 0, expanded: 0 };

  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      zip.close();
      reject(error);
    };
    zip.once("error", fail);
    zip.once("end", () => {
      if (!settled) {
        settled = true;
        resolve(values);
      }
    });
    zip.on("entry", (entry) => {
      void (async () => {
        try {
          const normalizedPath = normalizeArchivePath(entry.fileName);
          if (normalizedPath.endsWith("/")) {
            zip.readEntry();
            return;
          }
          assertEntryAllowed(entry, normalizedPath, seen, limits);
          if (extension(normalizedPath) === ".json") {
            const content = await readEntry(zip, entry);
            try {
              values.set(normalizedPath, JSON.parse(content.toString("utf8")) as unknown);
            } catch {
              throw new AppError("PACK_INVALID_JSON", "validation", `Invalid JSON in ${normalizedPath}.`, { file: normalizedPath });
            }
          }
          zip.readEntry();
        } catch (error) {
          fail(error);
        }
      })();
    });
    zip.readEntry();
  });
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
    modules.push(value);
    registerId(value.id, modulePath);
    for (const lesson of value.lessons) {
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
  if (!path.toLowerCase().endsWith(".learnpack")) throw new AppError("PACK_EXTENSION_INVALID", "validation", "Select a .learnpack file.");
  return validateLearnPackContent(await readJsonEntries(path));
}

export async function importLearnPack(path: string, libraryDirectory: string): Promise<ValidatedLearnPack> {
  const validated = await inspectLearnPack(path);
  const courseDirectory = join(libraryDirectory, validated.manifest.id);
  await mkdir(courseDirectory, { recursive: true });
  const baseName = validated.manifest.version;
  await Promise.all([
    copyFile(path, join(courseDirectory, `${baseName}.learnpack`)),
    writeFile(join(courseDirectory, `${baseName}.course.json`), JSON.stringify(validated, null, 2), "utf8")
  ]);
  return validated;
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
