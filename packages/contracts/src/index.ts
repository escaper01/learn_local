import { z } from "zod";

export const executionActionSchema = z.enum(["run", "submit"]);
export type ExecutionAction = z.infer<typeof executionActionSchema>;

export const runRequestSchema = z
  .object({
    action: executionActionSchema,
    language: z.enum(["java", "python"]),
    sourceCode: z.string().min(1).max(100_000),
    courseId: z.string().regex(/^[a-z0-9][a-z0-9-]{1,79}$/).optional(),
    courseVersion: z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+$/).optional(),
    exerciseId: z.string().regex(/^[a-z0-9][a-z0-9-]{1,79}$/).optional()
  })
  .strict()
  .superRefine((value, context) => {
    const count = [value.courseId, value.courseVersion, value.exerciseId].filter(Boolean).length;
    if (count !== 0 && count !== 3) context.addIssue({ code: "custom", message: "Course id, version, and exercise id must be provided together." });
  });

export type RunRequest = z.infer<typeof runRequestSchema>;

export const cancelRequestSchema = z
  .object({ executionId: z.string().regex(/^exec_[a-f0-9-]{36}$/) })
  .strict();

export interface CompileDiagnostic {
  file?: string;
  line?: number;
  column?: number;
  severity: "error" | "warning";
  message: string;
}

export interface CompileResult {
  attempted: boolean;
  success: boolean;
  durationMs: number;
  diagnostics: CompileDiagnostic[];
}

export interface TestResult {
  id: string;
  visibility: "public" | "hidden";
  passed: boolean;
  durationMs: number;
  expected?: unknown;
  actual?: unknown;
  feedbackCode?: "WRONG_RESULT" | "RUNTIME_ERROR";
  message?: string;
}

export interface ExecutionResult {
  executionId: string;
  status: "finished" | "compile-error" | "runtime-error" | "timed-out" | "cancelled";
  language: "java" | "python";
  runtimeVersion: string;
  compile: CompileResult;
  tests: TestResult[];
  console: string;
  resources: {
    wallTimeMs: number;
    timedOut: boolean;
    outputTruncated: boolean;
  };
}

export interface ProviderStatus {
  id: "docker";
  available: boolean;
  version?: string;
  message: string;
}

export interface RuntimeSummary {
  id: "java-21" | "python-3";
  language: "java" | "python";
  displayName: string;
  version: string;
  providerId: "docker";
  status: "not-installed" | "installing" | "ready" | "broken" | "removing";
  imageReference: string;
  sizeBytes: number | null;
  lastValidatedAt: string | null;
  message?: string;
}

export const runtimeRequestSchema = z
  .object({ runtimeId: z.enum(["java-21", "python-3"]) })
  .strict();

export type SettingValue = string | number | boolean;
export type SettingScope = "global" | "language" | "course";

export interface ResolvedSetting {
  key: string;
  category: string;
  label: string;
  description: string;
  type: "boolean" | "number" | "string" | "enum";
  value: SettingValue;
  defaultValue: SettingValue;
  source: SettingScope | "default";
  options?: readonly string[];
  min?: number;
  max?: number;
}

export const settingsContextSchema = z.object({
  language: z.enum(["java", "python"]).optional(),
  courseId: z.string().regex(/^[a-z0-9][a-z0-9-]{1,79}$/).optional()
}).strict();

export const settingMutationSchema = z.object({
  key: z.string().min(1).max(100),
  value: z.union([z.string().max(10_000), z.number().finite(), z.boolean()]),
  scope: z.enum(["global", "language", "course"]),
  scopeId: z.string().max(100).nullable()
}).strict();

export const settingResetSchema = z.object({
  key: z.string().min(1).max(100),
  scope: z.enum(["global", "language", "course"]),
  scopeId: z.string().max(100).nullable()
}).strict();

export const coursePromptRequestSchema = z.object({
  language: z.enum(["java", "python"]),
  experience: z.enum(["new", "beginner", "intermediate", "advanced"]),
  goal: z.string().min(3).max(1000),
  topics: z.string().max(1000),
  skipTopics: z.string().max(1000),
  dailyMinutes: z.number().int().min(10).max(240),
  durationWeeks: z.number().int().min(1).max(52),
  projectTheme: z.string().max(500),
  teachingStyle: z.enum(["supportive", "concise", "socratic", "project-based"]),
  customInstructions: z.string().max(4000)
}).strict();
export type CoursePromptRequest = z.infer<typeof coursePromptRequestSchema>;

export interface LearningSummary {
  totalAttempts: number;
  completedExercises: number;
  passedSubmissions: number;
  currentStreakDays: number;
  recentAttempts: Array<{
    exerciseId: string;
    action: ExecutionAction;
    status: string;
    passed: boolean;
    createdAt: string;
  }>;
  activity: Array<{ date: string; attempts: number }>;
}

export const workspaceReadSchema = z.object({ language: z.enum(["java", "python"]) }).strict();
export const workspaceWriteSchema = z.object({
  language: z.enum(["java", "python"]),
  content: z.string().max(500_000)
}).strict();

export interface ValidationIssue {
  code: string;
  severity: "error" | "warning";
  file?: string;
  path?: string;
  message: string;
}

export interface ImportedCourseSummary {
  id: string;
  version: string;
  title: string;
  description: string;
  language: "java" | "python";
  languageVersion: string;
  level: "beginner" | "intermediate" | "advanced";
  estimatedHours: number;
  moduleCount: number;
  lessonCount: number;
  exerciseCount: number;
  importedAt: string;
}

export interface CourseView {
  summary: ImportedCourseSummary;
  modules: Array<{
    id: string;
    title: string;
    lessons: Array<{
      id: string;
      title: string;
      theoryMarkdown: string;
      exercises: Array<{
        id: string;
        type: string;
        title: string;
        instructionMarkdown: string;
        starterFiles: Array<{ path: string; content: string }>;
        hints: string[];
        hintCount: number;
        choices?: string[];
        publicTestCount: number;
        hiddenTestCount: number;
      }>;
    }>;
  }>;
}

export const courseOpenSchema = z.object({
  courseId: z.string().regex(/^[a-z0-9][a-z0-9-]{1,79}$/),
  version: z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+$/)
}).strict();

export const quizSubmitSchema = z.object({
  courseId: z.string().regex(/^[a-z0-9][a-z0-9-]{1,79}$/),
  version: z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+$/),
  exerciseId: z.string().regex(/^[a-z0-9][a-z0-9-]{1,79}$/),
  choiceIndex: z.number().int().min(0).max(11)
}).strict();

export const hintRevealSchema = z.object({
  courseId: z.string().regex(/^[a-z0-9][a-z0-9-]{1,79}$/),
  version: z.string().regex(/^[0-9]+\.[0-9]+\.[0-9]+$/),
  exerciseId: z.string().regex(/^[a-z0-9][a-z0-9-]{1,79}$/),
  hintIndex: z.number().int().min(0).max(9)
}).strict();

export type CourseImportResult =
  | { status: "cancelled" }
  | { status: "imported"; course: ImportedCourseSummary; warnings: ValidationIssue[] };

export interface AppErrorShape {
  code: string;
  category: "validation" | "runtime" | "compile" | "execution" | "system";
  message: string;
  details?: Record<string, unknown>;
}

export interface LearnLocalApi {
  courses: {
    importPack(): Promise<CourseImportResult>;
    list(): Promise<ImportedCourseSummary[]>;
    open(courseId: string, version: string): Promise<CourseView>;
  };
  runtimes: {
    list(): Promise<RuntimeSummary[]>;
    install(runtimeId: RuntimeSummary["id"]): Promise<RuntimeSummary>;
    remove(runtimeId: RuntimeSummary["id"]): Promise<RuntimeSummary>;
  };
  settings: {
    list(context?: { language?: "java" | "python"; courseId?: string }): Promise<ResolvedSetting[]>;
    set(input: z.infer<typeof settingMutationSchema>): Promise<ResolvedSetting[]>;
    reset(input: z.infer<typeof settingResetSchema>): Promise<ResolvedSetting[]>;
    exportProfile(): Promise<{ status: "saved" | "cancelled" }>;
    importProfile(): Promise<{ status: "imported" | "cancelled"; changed: number }>;
  };
  prompts: {
    generate(input: CoursePromptRequest): Promise<{ prompt: string }>;
  };
  progress: {
    summary(): Promise<LearningSummary>;
    submitQuiz(input: z.infer<typeof quizSubmitSchema>): Promise<{ correct: boolean }>;
    revealHint(input: z.infer<typeof hintRevealSchema>): Promise<{ hint: string; revealedCount: number }>;
  };
  workspace: {
    read(language: "java" | "python"): Promise<{ content: string | null }>;
    write(language: "java" | "python", content: string): Promise<void>;
  };
  diagnostics: {
    export(): Promise<{ status: "saved" | "cancelled" }>;
  };
  environment: {
    status(): Promise<ProviderStatus>;
  };
  execution: {
    start(request: RunRequest): Promise<{ executionId: string }>;
    cancel(executionId: string): Promise<void>;
    onFinished(listener: (event: ExecutionFinishedEvent) => void): () => void;
  };
}

export type ExecutionFinishedEvent =
  | { executionId: string; result: ExecutionResult }
  | { executionId: string; error: AppErrorShape };

export const IPC_CHANNELS = {
  coursesImport: "courses:import",
  coursesList: "courses:list",
  coursesOpen: "courses:open",
  runtimesList: "runtimes:list",
  runtimesInstall: "runtimes:install",
  runtimesRemove: "runtimes:remove",
  settingsList: "settings:list",
  settingsSet: "settings:set",
  settingsReset: "settings:reset",
  settingsExport: "settings:export",
  settingsImport: "settings:import",
  promptsGenerate: "prompts:generate",
  progressSummary: "progress:summary",
  progressSubmitQuiz: "progress:submit-quiz",
  progressRevealHint: "progress:reveal-hint",
  workspaceRead: "workspace:read",
  workspaceWrite: "workspace:write",
  diagnosticsExport: "diagnostics:export",
  environmentStatus: "environment:status",
  executionStart: "execution:start",
  executionCancel: "execution:cancel",
  executionFinished: "execution:finished"
} as const;

export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly category: AppErrorShape["category"],
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function toAppError(error: unknown): AppErrorShape {
  if (error instanceof AppError) {
    return {
      code: error.code,
      category: error.category,
      message: error.message,
      ...(error.details ? { details: error.details } : {})
    };
  }

  return {
    code: "SYSTEM_UNEXPECTED",
    category: "system",
    message: error instanceof Error ? error.message : "An unexpected error occurred."
  };
}
