import { loadConfig } from "./config.js";
import { HttpGatewayApi } from "./gatewayApi.js";
import { logger } from "./logger.js";
import { FileSyncWorker } from "./syncWorker.js";
import { LocalToCloudWorker } from "./remoteCopyWorker.js";

const delay = (milliseconds: number, signal: AbortSignal) => new Promise<void>((resolve) => {
  const timer = setTimeout(resolve, milliseconds);
  signal.addEventListener("abort", () => { clearTimeout(timer); resolve(); }, { once: true });
});

const config = loadConfig();
const api = new HttpGatewayApi(config);
const worker = new FileSyncWorker(config, api, logger);
const remoteCopyWorker = new LocalToCloudWorker(config, api, logger);
const polling = process.argv.includes("--poll");
const shutdown = new AbortController();
process.once("SIGINT", () => shutdown.abort());
process.once("SIGTERM", () => shutdown.abort());

do {
  try {
    const count = await worker.runOnce();
    const remoteCount = await remoteCopyWorker.runOnce();
    logger.info("sync_cycle_completed", { candidateCount: count, remoteCopyCandidateCount: remoteCount });
  } catch {
    logger.error("sync_cycle_failed");
    if (!polling) process.exitCode = 1;
  }
  if (polling && !shutdown.signal.aborted) await delay(config.pollIntervalMs, shutdown.signal);
} while (polling && !shutdown.signal.aborted);

logger.info("gateway_stopped");
