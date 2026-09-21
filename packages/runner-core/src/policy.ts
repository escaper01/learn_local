export const EXECUTION_POLICY = Object.freeze({
  timeoutMs: 5_000,
  compileTimeoutMs: 15_000,
  memoryMb: 256,
  maxOutputKb: 64,
  pidsLimit: 64,
  cpus: 1
});

export const OWNERSHIP_LABELS = Object.freeze({
  managed: "com.learnlocal.managed=true",
  installation: "com.learnlocal.installation=prototype"
});
