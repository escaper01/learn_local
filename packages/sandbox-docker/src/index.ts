import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import { AppError, type ProviderStatus, type RuntimeSummary } from "@learnlocal/contracts";
import {
  OWNERSHIP_LABELS,
  type RawProcessResult,
  type RawSandboxResult,
  type SandboxExecutionRequest,
  type SandboxProvider
} from "@learnlocal/runner-core";

interface ProcessCaptureOptions {
  timeoutMs: number;
  maxOutputBytes: number;
  executionId?: string;
}

interface RuntimeDefinition {
  id: RuntimeSummary["id"];
  language: RuntimeSummary["language"];
  displayName: string;
  version: string;
  approvedReference: string;
  localReference: string;
  smokeCommand: readonly string[];
}

export const RUNTIME_CATALOG: readonly RuntimeDefinition[] = Object.freeze([
  {
    id: "java-21",
    language: "java",
    displayName: "Java 21",
    version: "21",
    approvedReference: "eclipse-temurin@sha256:c7d5863b5dd8f26b90c64f1d80cc2b0e5a5e4642f8db9955a370d348edd8f438",
    localReference: "learnlocal/runtime-java-21:1",
    smokeCommand: ["java", "-version"]
  },
  {
    id: "python-3",
    language: "python",
    displayName: "Python 3.13",
    version: "3.13",
    approvedReference: "python@sha256:2325bb286ec344af3e5898cc224b5844e2707ac6e26b1632516fd3edc84a5e26",
    localReference: "learnlocal/runtime-python-3:1",
    smokeCommand: ["python", "--version"]
  }
]);

export class DockerProvider implements SandboxProvider {
  readonly id = "docker";
  private readonly activeProcesses = new Map<string, Set<ChildProcessWithoutNullStreams>>();
  private readonly activeContainers = new Map<string, Set<string>>();
  private readonly cancelledExecutions = new Set<string>();
  private readonly runtimeStates = new Map<RuntimeSummary["id"], RuntimeSummary["status"]>();
  private readonly validationDates = new Map<RuntimeSummary["id"], string>();
  private installationLabel: string = OWNERSHIP_LABELS.installation;

  setInstallationId(installationId: string): void {
    if (!/^[a-f0-9-]{36}$/.test(installationId)) throw new AppError("INSTALLATION_ID_INVALID", "system", "The local installation identifier is invalid.");
    this.installationLabel = `com.learnlocal.installation=${installationId}`;
  }

  async detect(): Promise<ProviderStatus> {
    const result = await this.capture(["version", "--format", "{{.Server.Version}}"], {
      timeoutMs: 5_000,
      maxOutputBytes: 8_192
    });
    const version = result.stdout.trim();
    return result.exitCode === 0 && version
      ? { id: "docker", available: true, version, message: `Docker ${version} is ready.` }
      : {
          id: "docker",
          available: false,
          message: result.stderr.trim() || "Docker is not installed or its engine is not running."
        };
  }

  async execute(request: SandboxExecutionRequest): Promise<RawSandboxResult> {
    request.onPhase?.("preparing");
    const status = await this.detect();
    if (!status.available) {
      throw new AppError("PROVIDER_NOT_RUNNING", "runtime", status.message);
    }
    await this.ensureImage(request.imageReference);

    this.cancelledExecutions.delete(request.executionId);
    const compileName = this.containerName(request.executionId, "compile");
    const runName = this.containerName(request.executionId, "run");

    try {
      request.onPhase?.("compiling");
      const compile = await this.runContainer(
        request,
        compileName,
        request.workspace.compileCommand,
        Math.max(request.limits.timeoutMs, 15_000)
      );
      if (compile.exitCode !== 0 || compile.timedOut || compile.cancelled) return { compile };

      request.onPhase?.("running");
      const run = await this.runContainer(
        request,
        runName,
        request.workspace.runCommand,
        request.limits.timeoutMs
      );
      return { compile, run };
    } finally {
      request.onPhase?.("cleaning");
      await Promise.allSettled([
        this.removeContainer(compileName),
        this.removeContainer(runName)
      ]);
      this.activeContainers.delete(request.executionId);
      this.activeProcesses.delete(request.executionId);
      this.cancelledExecutions.delete(request.executionId);
    }
  }

  async listRuntimes(): Promise<RuntimeSummary[]> {
    return Promise.all(RUNTIME_CATALOG.map((runtime) => this.inspectManagedRuntime(runtime)));
  }

  async installManagedRuntime(runtimeId: RuntimeSummary["id"]): Promise<RuntimeSummary> {
    return this.provisionManagedRuntime(runtimeId, "installing");
  }

  async updateManagedRuntime(runtimeId: RuntimeSummary["id"]): Promise<RuntimeSummary> {
    return this.provisionManagedRuntime(runtimeId, "updating");
  }

  async verifyManagedRuntime(runtimeId: RuntimeSummary["id"]): Promise<RuntimeSummary> {
    const runtime = this.runtimeDefinition(runtimeId);
    this.runtimeStates.set(runtimeId, "validating");
    try {
      const provider = await this.detect();
      if (!provider.available) throw new AppError("PROVIDER_NOT_RUNNING", "runtime", provider.message);
      const inspected = await this.capture(["image", "inspect", runtime.localReference], { timeoutMs: 5_000, maxOutputBytes: 8_192 });
      if (inspected.exitCode !== 0) throw new AppError("RUNTIME_NOT_INSTALLED", "runtime", `${runtime.displayName} is not installed.`);
      await this.smokeTestRuntime(runtime);
      this.validationDates.set(runtimeId, new Date().toISOString());
      this.runtimeStates.set(runtimeId, "ready");
      return this.inspectManagedRuntime(runtime);
    } catch (error) {
      this.runtimeStates.set(runtimeId, "broken");
      throw error;
    }
  }

  private async provisionManagedRuntime(runtimeId: RuntimeSummary["id"], state: "installing" | "updating"): Promise<RuntimeSummary> {
    const runtime = this.runtimeDefinition(runtimeId);
    this.runtimeStates.set(runtimeId, state);
    try {
      const provider = await this.detect();
      if (!provider.available) throw new AppError("PROVIDER_NOT_RUNNING", "runtime", provider.message);
      const pulled = await this.capture(["pull", runtime.approvedReference], { timeoutMs: 300_000, maxOutputBytes: 512_000 });
      if (pulled.exitCode !== 0 || pulled.timedOut) throw new AppError("RUNTIME_PULL_FAILED", "runtime", `Docker could not download ${runtime.displayName}.`, { diagnostics: pulled.stderr });
      const tagged = await this.capture(["tag", runtime.approvedReference, runtime.localReference], { timeoutMs: 10_000, maxOutputBytes: 16_000 });
      if (tagged.exitCode !== 0) throw new AppError("RUNTIME_TAG_FAILED", "runtime", `Docker could not register ${runtime.displayName} for LearnLocal.`, { diagnostics: tagged.stderr });
      await this.smokeTestRuntime(runtime);
      this.validationDates.set(runtimeId, new Date().toISOString());
      this.runtimeStates.set(runtimeId, "ready");
      return this.inspectManagedRuntime(runtime);
    } catch (error) {
      this.runtimeStates.set(runtimeId, "broken");
      throw error;
    }
  }

  async removeManagedRuntime(runtimeId: RuntimeSummary["id"]): Promise<RuntimeSummary> {
    const runtime = this.runtimeDefinition(runtimeId);
    this.runtimeStates.set(runtimeId, "removing");
    const owned = await this.capture([
      "ps", "-aq",
      "--filter", `label=${OWNERSHIP_LABELS.managed}`,
      "--filter", `label=${this.installationLabel}`,
      "--filter", `label=com.learnlocal.runtime=${runtime.id}`
    ], { timeoutMs: 5_000, maxOutputBytes: 64_000 });
    const containerIds = owned.stdout.split(/\r?\n/).filter(Boolean);
    if (containerIds.length) await this.capture(["rm", "-f", ...containerIds], { timeoutMs: 15_000, maxOutputBytes: 64_000 });

    const removed = await this.capture(["image", "rm", runtime.localReference], { timeoutMs: 30_000, maxOutputBytes: 64_000 });
    if (removed.exitCode !== 0 && !/No such image/i.test(removed.stderr)) {
      this.runtimeStates.set(runtimeId, "broken");
      throw new AppError("RUNTIME_REMOVE_FAILED", "runtime", `Docker could not remove ${runtime.displayName}.`, { diagnostics: removed.stderr });
    }
    this.runtimeStates.delete(runtimeId);
    this.validationDates.delete(runtimeId);
    return this.inspectManagedRuntime(runtime);
  }

  async cancel(executionId: string): Promise<void> {
    this.cancelledExecutions.add(executionId);
    for (const process of this.activeProcesses.get(executionId) ?? []) process.kill();
    await Promise.allSettled(
      [...(this.activeContainers.get(executionId) ?? [])].map((name) => this.removeContainer(name))
    );
  }

  async cleanupOwnedResources(): Promise<void> {
    const listed = await this.capture(
      [
        "ps",
        "-aq",
        "--filter",
        `label=${OWNERSHIP_LABELS.managed}`,
        "--filter",
        `label=${this.installationLabel}`
      ],
      { timeoutMs: 5_000, maxOutputBytes: 64_000 }
    );
    const ids = listed.stdout.split(/\r?\n/).filter(Boolean);
    if (ids.length > 0) {
      await this.capture(["rm", "-f", ...ids], { timeoutMs: 10_000, maxOutputBytes: 64_000 });
    }
  }

  private async runContainer(
    request: SandboxExecutionRequest,
    name: string,
    command: readonly string[],
    timeoutMs: number
  ): Promise<RawProcessResult> {
    const set = this.activeContainers.get(request.executionId) ?? new Set<string>();
    set.add(name);
    this.activeContainers.set(request.executionId, set);

    const mount = `type=bind,src=${request.workspace.directory},dst=/workspace`;
    const hostUid = typeof process.getuid === "function" ? process.getuid() : 0;
    const hostGid = typeof process.getgid === "function" ? process.getgid() : 0;
    const containerUser = hostUid > 0 ? `${hostUid}:${hostGid}` : "1000:1000";
    const args = [
      "run",
      "--name",
      name,
      "--label",
      OWNERSHIP_LABELS.managed,
      "--label",
      this.installationLabel,
      "--label",
      `com.learnlocal.runtime=${request.runtimeId}`,
      "--label",
      `com.learnlocal.execution=${request.executionId}`,
      "--network",
      "none",
      "--memory",
      `${request.limits.memoryMb}m`,
      "--memory-swap",
      `${request.limits.memoryMb}m`,
      "--cpus",
      String(request.limits.cpus),
      "--pids-limit",
      String(request.limits.pidsLimit),
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--read-only",
      "--user",
      containerUser,
      "--tmpfs",
      "/tmp:rw,noexec,nosuid,size=64m",
      "--mount",
      mount,
      "--workdir",
      "/workspace",
      request.imageReference,
      ...command
    ];

    return this.capture(args, {
      timeoutMs,
      maxOutputBytes: request.limits.maxOutputKb * 1024,
      executionId: request.executionId
    });
  }

  private runtimeDefinition(runtimeId: RuntimeSummary["id"]): RuntimeDefinition {
    const runtime = RUNTIME_CATALOG.find((candidate) => candidate.id === runtimeId);
    if (!runtime) throw new AppError("RUNTIME_UNKNOWN", "validation", "Unknown runtime identifier.");
    return runtime;
  }

  private async inspectManagedRuntime(runtime: RuntimeDefinition): Promise<RuntimeSummary> {
    const transient = this.runtimeStates.get(runtime.id);
    if (transient && transient !== "ready") {
      return {
        id: runtime.id,
        language: runtime.language,
        displayName: runtime.displayName,
        version: runtime.version,
        providerId: "docker",
        status: transient,
        imageReference: runtime.approvedReference,
        sizeBytes: null,
        lastValidatedAt: this.validationDates.get(runtime.id) ?? null,
        activeExecutions: this.activeContainers.size
      };
    }
    const inspected = await this.capture(["image", "inspect", runtime.localReference, "--format", "{{json .Size}}"], { timeoutMs: 5_000, maxOutputBytes: 8_192 });
    const size = Number(inspected.stdout.trim());
    return {
      id: runtime.id,
      language: runtime.language,
      displayName: runtime.displayName,
      version: runtime.version,
      providerId: "docker",
      status: inspected.exitCode === 0 && Number.isFinite(size) ? "ready" : "not-installed",
      imageReference: runtime.approvedReference,
      sizeBytes: Number.isFinite(size) ? size : null,
      lastValidatedAt: this.validationDates.get(runtime.id) ?? null,
      activeExecutions: [...this.activeContainers.values()].filter((containers) => containers.size > 0).length
    };
  }

  private async smokeTestRuntime(runtime: RuntimeDefinition): Promise<void> {
    const name = `learnlocal-smoke-${runtime.id}-${randomUUID()}`;
    const smoke = await this.capture([
      "run", "--name", name,
      "--label", OWNERSHIP_LABELS.managed,
      "--label", this.installationLabel,
      "--label", `com.learnlocal.runtime=${runtime.id}`,
      "--network", "none",
      "--memory", "128m",
      "--memory-swap", "128m",
      "--cpus", "1",
      "--pids-limit", "32",
      "--cap-drop", "ALL",
      "--security-opt", "no-new-privileges",
      "--read-only",
      "--user", "1000:1000",
      "--tmpfs", "/tmp:rw,noexec,nosuid,size=32m",
      runtime.localReference,
      ...runtime.smokeCommand
    ], { timeoutMs: 30_000, maxOutputBytes: 64_000 });
    await this.removeContainer(name);
    if (smoke.exitCode !== 0 || smoke.timedOut) throw new AppError("RUNTIME_SMOKE_TEST_FAILED", "runtime", `${runtime.displayName} did not pass its validation test.`, { diagnostics: smoke.stderr });
  }

  private async ensureImage(imageReference: string): Promise<void> {
    const inspected = await this.capture(["image", "inspect", imageReference], {
      timeoutMs: 5_000,
      maxOutputBytes: 8_192
    });
    if (inspected.exitCode === 0) return;

    const pulled = await this.capture(["pull", imageReference], {
      timeoutMs: 180_000,
      maxOutputBytes: 256_000
    });
    if (pulled.exitCode !== 0 || pulled.timedOut) {
      throw new AppError(
        "RUNTIME_PULL_FAILED",
        "runtime",
        pulled.timedOut
          ? "Downloading the Java 21 runtime took too long. Check Docker and try again."
          : "Docker could not download the Java 21 runtime.",
        { diagnostics: pulled.stderr }
      );
    }
  }

  private containerName(executionId: string, phase: string): string {
    return `learnlocal-${executionId.replace(/[^a-zA-Z0-9_.-]/g, "-")}-${phase}`;
  }

  private async removeContainer(name: string): Promise<void> {
    await this.capture(["rm", "-f", name], { timeoutMs: 5_000, maxOutputBytes: 8_192 });
  }

  private capture(args: readonly string[], options: ProcessCaptureOptions): Promise<RawProcessResult> {
    return new Promise((resolve) => {
      const startedAt = Date.now();
      let stdout = "";
      let stderr = "";
      let outputBytes = 0;
      let outputTruncated = false;
      let timedOut = false;
      let settled = false;
      const child = spawn("docker", args, { windowsHide: true, shell: false });

      if (options.executionId) {
        const processes = this.activeProcesses.get(options.executionId) ?? new Set();
        processes.add(child);
        this.activeProcesses.set(options.executionId, processes);
      }

      const append = (target: "stdout" | "stderr", chunk: Buffer) => {
        const remaining = options.maxOutputBytes - outputBytes;
        if (remaining <= 0) {
          outputTruncated = true;
          return;
        }
        const selected = chunk.subarray(0, remaining);
        outputBytes += selected.byteLength;
        if (selected.byteLength < chunk.byteLength) outputTruncated = true;
        if (target === "stdout") stdout += selected.toString("utf8");
        else stderr += selected.toString("utf8");
      };

      child.stdout.on("data", (chunk: Buffer) => append("stdout", chunk));
      child.stderr.on("data", (chunk: Buffer) => append("stderr", chunk));

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, options.timeoutMs);

      const finish = (exitCode: number | null, spawnError?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (spawnError) stderr += `${basename(spawnError.name)}: ${spawnError.message}`;
        if (options.executionId) this.activeProcesses.get(options.executionId)?.delete(child);
        resolve({
          exitCode,
          stdout,
          stderr,
          durationMs: Date.now() - startedAt,
          timedOut,
          cancelled: options.executionId
            ? this.cancelledExecutions.has(options.executionId)
            : false,
          outputTruncated
        });
      };

      child.once("error", (error) => finish(null, error));
      child.once("close", (code) => finish(code));
    });
  }
}
