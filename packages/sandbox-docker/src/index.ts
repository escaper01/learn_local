import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { basename } from "node:path";
import { AppError, type ProviderStatus } from "@learnlocal/contracts";
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

export class DockerProvider implements SandboxProvider {
  readonly id = "docker";
  private readonly activeProcesses = new Map<string, Set<ChildProcessWithoutNullStreams>>();
  private readonly activeContainers = new Map<string, Set<string>>();
  private readonly cancelledExecutions = new Set<string>();

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
    const status = await this.detect();
    if (!status.available) {
      throw new AppError("PROVIDER_NOT_RUNNING", "runtime", status.message);
    }
    await this.ensureImage(request.imageReference);

    this.cancelledExecutions.delete(request.executionId);
    const compileName = this.containerName(request.executionId, "compile");
    const runName = this.containerName(request.executionId, "run");

    try {
      const compile = await this.runContainer(
        request,
        compileName,
        request.workspace.compileCommand,
        Math.max(request.limits.timeoutMs, 15_000)
      );
      if (compile.exitCode !== 0 || compile.timedOut || compile.cancelled) return { compile };

      const run = await this.runContainer(
        request,
        runName,
        request.workspace.runCommand,
        request.limits.timeoutMs
      );
      return { compile, run };
    } finally {
      await Promise.allSettled([
        this.removeContainer(compileName),
        this.removeContainer(runName)
      ]);
      this.activeContainers.delete(request.executionId);
      this.activeProcesses.delete(request.executionId);
      this.cancelledExecutions.delete(request.executionId);
    }
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
        `label=${OWNERSHIP_LABELS.installation}`
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
    const args = [
      "run",
      "--name",
      name,
      "--label",
      OWNERSHIP_LABELS.managed,
      "--label",
      OWNERSHIP_LABELS.installation,
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
      "1000:1000",
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
