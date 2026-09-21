import { copyFile, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import Ajv2020, { type ErrorObject } from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import yauzl, { type Entry, type ZipFile } from "yauzl";
import { AppError, type CourseView, type ImportedCourseSummary, type ValidationIssue } from "@learnlocal/contracts";
import manifestSchema from "../schema/manifest.schema.json";
import moduleSchema from "../schema/module.schema.json";

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
    language: "java" | "python";
    languageVersion: string;
    level: "beginner" | "intermediate" | "advanced";
    estimatedHours: number;
    authors: LearnPackAuthor[];
  };
  runtime: { adapter: "java" | "python"; adapterRange: string; runtimeVersion: string };
  modules: string[];
  projects: string[];
}

export interface LearnPackExercise {
  id: string;
  type: "output" | "function" | "debug" | "multipleChoice" | "project";
  title: string;
  instructionMarkdown: string;
  starterFiles?: Array<{ path: string; content: string }>;
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

export interface ValidatedLearnPack {
  manifest: LearnPackManifest;
  modules: LearnPackModule[];
  projects: Record<string, unknown>;
  summary: ImportedCourseSummary;
  warnings: ValidationIssue[];
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validateManifest = ajv.compile<LearnPackManifest>(manifestSchema);
const validateModule = ajv.compile<LearnPackModule>(moduleSchema);

function schemaIssues(errors: ErrorObject[] | null | undefined, file: string): ValidationIssue[] {
  return (errors ?? []).map((error) => ({
    code: "PACK_SCHEMA_INVALID",
    severity: "error",
    file,
    path: error.instancePath || "/",
    message: error.message ?? "Value does not match the LearnPack schema."
  }));
}

function isSafeArchivePath(path: string): boolean {
  if (!path || path.includes("\\") || path.includes("\0") || path.startsWith("/") || /^[a-zA-Z]:/.test(path)) return false;
  const segments = path.split("/");
  return segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function extension(path: string): string {
  const name = path.slice(path.lastIndexOf("/") + 1);
  const index = name.lastIndexOf(".");
  return index < 0 ? "" : name.slice(index).toLowerCase();
}

function assertEntryAllowed(entry: Entry, seen: Set<string>, state: { count: number; expanded: number }): void {
  state.count += 1;
  state.expanded += entry.uncompressedSize;
  if (state.count > MAX_ENTRIES) throw new AppError("PACK_ENTRY_LIMIT", "validation", `LearnPack has more than ${MAX_ENTRIES} entries.`);
  if (state.expanded > MAX_EXPANDED_BYTES) throw new AppError("PACK_EXPANDED_SIZE_LIMIT", "validation", "LearnPack expands beyond the 100 MB safety limit.");
  if (!isSafeArchivePath(entry.fileName)) throw new AppError("PACK_PATH_TRAVERSAL", "validation", `Unsafe archive path: ${entry.fileName}`);
  if (seen.has(entry.fileName)) throw new AppError("PACK_DUPLICATE_PATH", "validation", `Duplicate archive path: ${entry.fileName}`);
  seen.add(entry.fileName);

  const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff;
  if ((unixMode & 0o170000) === 0o120000) throw new AppError("PACK_SYMLINK_NOT_ALLOWED", "validation", `Symbolic links are not allowed: ${entry.fileName}`);
  if (FORBIDDEN_EXTENSIONS.has(extension(entry.fileName))) throw new AppError("PACK_EXECUTABLE_NOT_ALLOWED", "validation", `Executable content is not allowed: ${entry.fileName}`);
  if (entry.uncompressedSize > MAX_ENTRY_BYTES) throw new AppError("PACK_ENTRY_SIZE_LIMIT", "validation", `Archive entry is too large: ${entry.fileName}`);
}

function openZip(path: string): Promise<ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(path, { lazyEntries: true, autoClose: true, strictFileNames: true, validateEntrySizes: true }, (error, zip) => {
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
          if (entry.fileName.endsWith("/")) {
            zip.readEntry();
            return;
          }
          assertEntryAllowed(entry, seen, limits);
          if (extension(entry.fileName) === ".json") {
            const content = await readEntry(zip, entry);
            try {
              values.set(entry.fileName, JSON.parse(content.toString("utf8")) as unknown);
            } catch {
              throw new AppError("PACK_INVALID_JSON", "validation", `Invalid JSON in ${entry.fileName}.`, { file: entry.fileName });
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
        const testIds = new Set<string>();
        for (const test of exercise.tests ?? []) {
          if (testIds.has(test.id)) issues.push({ code: "PACK_DUPLICATE_TEST_ID", severity: "error", file: modulePath, message: `Exercise '${exercise.id}' repeats test ID '${test.id}'.` });
          testIds.add(test.id);
        }
        for (const file of exercise.starterFiles ?? []) {
          if (!isSafeArchivePath(file.path)) issues.push({ code: "PACK_STARTER_PATH_INVALID", severity: "error", file: modulePath, message: `Exercise '${exercise.id}' contains unsafe starter path '${file.path}'.` });
        }
      }
    }
  }
  const projects: Record<string, unknown> = {};
  for (const projectPath of manifest.projects) {
    if (!entries.has(projectPath)) issues.push({ code: "PACK_REFERENCE_MISSING", severity: "error", file: "manifest.json", path: "/projects", message: `Referenced project does not exist: ${projectPath}` });
    else projects[projectPath] = entries.get(projectPath);
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

export function toCourseView(pack: ValidatedLearnPack): CourseView {
  return {
    summary: pack.summary,
    modules: pack.modules.map((module) => ({
      id: module.id,
      title: module.title,
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
          hints: exercise.hints ?? [],
          ...(exercise.choices ? { choices: exercise.choices } : {}),
          publicTestCount: (exercise.tests ?? []).filter((test) => test.visibility === "public").length,
          hiddenTestCount: (exercise.tests ?? []).filter((test) => test.visibility === "hidden").length
        }))
      }))
    }))
  };
}
