import { loadConfig } from "./config.js";
import { HttpGatewayApi } from "./gatewayApi.js";
import { logger } from "./logger.js";
import { FileSyncWorker } from "./syncWorker.js";
import { LocalToCloudWorker } from "./remoteCopyWorker.js";
import { checkGatewayHealth } from "./health.js";

const delay = (milliseconds: number, signal: AbortSignal) => new Promise<void>((resolve) => {
  const timer = setTimeout(resolve, milliseconds);
  signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
});

const config = loadConfig();
const api = new HttpGatewayApi(config);
const worker = new FileSyncWorker(config, api, logger);
const remoteCopyWorker = new LocalToCloudWorker(config, api, logger);
const polling = process.argv.includes("--poll");
const healthOnly = process.argv.includes("--health");
const shutdown = new AbortController();
process.once("SIGINT", () => shutdown.abort());
process.once("SIGTERM", () => shutdown.abort());

if (healthOnly) {
  const health = await checkGatewayHealth(config, api);
  process.stdout.write(`${JSON.stringify(health)}\n`);
  if (!health.healthy) process.exitCode = 1;
} else {
  const startupHealth = await checkGatewayHealth(config, api);
  logger.info("gateway_health_checked", {
    healthy: startupHealth.healthy,
    gatewayActive: startupHealth.gatewayActive,
    backendConnected: startupHealth.backendConnected,
    rootAccessible: startupHealth.rootAccessible,
    tempAccessible: startupHealth.tempAccessible,
    atomicPublishSupported: startupHealth.atomicPublishSupported,
    spaceAvailableBytes: startupHealth.spaceAvailableBytes,
    pendingJobs: startupHealth.pendingJobs,
    failedJobs: startupHealth.failedJobs,
    retryingJobs: startupHealth.retryingJobs,
    version: startupHealth.version,
    errorCodes: startupHealth.errorCodes,
  });
  if (!startupHealth.rootAccessible || !startupHealth.tempAccessible || !startupHealth.atomicPublishSupported) {
    throw new Error("Gateway filesystem preflight failed. Run npm run health for sanitized diagnostics.");
  }

  do {
    const startedAt = performance.now();
    try {
      const count = await worker.runOnce();
      const remoteCount = await remoteCopyWorker.runOnce();
      logger.info("sync_cycle_completed", { candidateCount: count, remoteCopyCandidateCount: remoteCount, durationMs: Math.round(performance.now() - startedAt) });
    } catch {
      logger.error("sync_cycle_failed", { durationMs: Math.round(performance.now() - startedAt) });
      if (!polling) process.exitCode = 1;
    }
    if (polling && !shutdown.signal.aborted) await delay(config.pollIntervalMs, shutdown.signal);
  } while (polling && !shutdown.signal.aborted);

  logger.info("gateway_stopped");
}
