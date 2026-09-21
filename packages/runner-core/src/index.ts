import type { CompileResult, ExecutionResult, ProviderStatus } from "@learnlocal/contracts";

export * from "./policy";

export interface CommandSpec {
  executable: string;
  args: readonly string[];
  cwd: string;
  env: Readonly<Record<string, string>>;
  timeoutMs: number;
}

export interface JavaTestDefinition {
  id: string;
  visibility: "public" | "hidden";
  arguments: number[];
  expected: number;
}

export interface PreparedJavaWorkspace {
  directory: string;
  compileCommand: readonly string[];
  runCommand: readonly string[];
  tests: readonly JavaTestDefinition[];
}

export interface RawProcessResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  cancelled: boolean;
  outputTruncated: boolean;
}

export interface RawSandboxResult {
  compile: RawProcessResult;
  run?: RawProcessResult;
}

export interface SandboxExecutionRequest {
  executionId: string;
  runtimeId: "java-21" | "python-3";
  imageReference: string;
  workspace: Pick<PreparedJavaWorkspace, "directory" | "compileCommand" | "runCommand">;
  limits: {
    timeoutMs: number;
    memoryMb: number;
    maxOutputKb: number;
    pidsLimit: number;
    cpus: number;
  };
}

export interface SandboxProvider {
  readonly id: string;
  detect(): Promise<ProviderStatus>;
  execute(request: SandboxExecutionRequest): Promise<RawSandboxResult>;
  cancel(executionId: string): Promise<void>;
  cleanupOwnedResources(): Promise<void>;
}

export interface JavaAdapter {
  readonly id: "java";
  readonly adapterVersion: string;
  readonly languageVersions: readonly ["21"];
  readonly imageReference: string;
  buildWorkspace(sourceCode: string, tests: readonly JavaTestDefinition[]): Promise<PreparedJavaWorkspace>;
  parseExecution(
    executionId: string,
    raw: RawSandboxResult,
    tests: readonly JavaTestDefinition[],
    startedAt: number
  ): ExecutionResult;
}

export function emptyCompile(): CompileResult {
  return { attempted: false, success: false, durationMs: 0, diagnostics: [] };
}
