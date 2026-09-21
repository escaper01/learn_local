import { z } from "zod";

export const executionActionSchema = z.enum(["run", "submit"]);
export type ExecutionAction = z.infer<typeof executionActionSchema>;

export const runRequestSchema = z
  .object({
    action: executionActionSchema,
    sourceCode: z.string().min(1).max(100_000)
  })
  .strict();

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
  language: "java";
  runtimeVersion: "21";
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
  };
  runtimes: {
    list(): Promise<RuntimeSummary[]>;
    install(runtimeId: RuntimeSummary["id"]): Promise<RuntimeSummary>;
    remove(runtimeId: RuntimeSummary["id"]): Promise<RuntimeSummary>;
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
  runtimesList: "runtimes:list",
  runtimesInstall: "runtimes:install",
  runtimesRemove: "runtimes:remove",
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
