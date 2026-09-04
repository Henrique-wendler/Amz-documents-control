import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { access, link, mkdir, realpath, stat, statfs, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { GatewayBackendHealth, GatewayConfig, GatewayHealthApi } from "./types.js";

export interface GatewayHealthSnapshot {
  healthy: boolean;
  gatewayActive: boolean;
  backendConnected: boolean;
  rootAccessible: boolean;
  tempAccessible: boolean;
  atomicPublishSupported: boolean;
  spaceAvailableBytes: number | null;
  pendingJobs: number;
  failedJobs: number;
  retryingJobs: number;
  lastJobAt?: string;
  lastSynchronizationAt?: string;
  lastFailureAt?: string;
  version: string;
  checkedAt: string;
  errorCodes: string[];
}

const localFilesystemHealth = async (config: GatewayConfig) => {
  let rootAccessible = false;
  let tempAccessible = false;
  let atomicPublishSupported = false;
  let spaceAvailableBytes: number | null = null;
  const errorCodes: string[] = [];
  let rootCanonical: string | undefined;
  let tempCanonical: string | undefined;

  try {
    rootCanonical = await realpath(config.rootPath);
    const rootInfo = await stat(rootCanonical);
    if (!rootInfo.isDirectory()) throw Object.assign(new Error("not_directory"), { code: "ENOTDIR" });
    await access(rootCanonical, constants.R_OK | constants.W_OK);
    rootAccessible = true;
    try {
      const filesystem = await statfs(rootCanonical, { bigint: true });
      const available = filesystem.bavail * filesystem.bsize;
      spaceAvailableBytes = available <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(available) : null;
    } catch {
      errorCodes.push("space_unavailable");
    }
  } catch {
    errorCodes.push("root_unavailable");
  }

  if (rootAccessible) {
    try {
      await mkdir(config.tempPath, { recursive: true });
      tempCanonical = await realpath(config.tempPath);
      const tempInfo = await stat(tempCanonical);
      if (!tempInfo.isDirectory()) throw Object.assign(new Error("not_directory"), { code: "ENOTDIR" });
      await access(tempCanonical, constants.R_OK | constants.W_OK);
      tempAccessible = true;
    } catch {
      errorCodes.push("temp_unavailable");
    }
  }

  if (rootCanonical && tempCanonical && tempAccessible) {
    const marker = randomUUID();
    const source = resolve(tempCanonical, `.gateway-health-source-${marker}`);
    const destination = resolve(rootCanonical, `.gateway-health-target-${marker}`);
    try {
      await writeFile(source, "", { flag: "wx" });
      await link(source, destination);
      atomicPublishSupported = true;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      errorCodes.push(code === "EXDEV" ? "temp_cross_volume" : code === "EPERM" || code === "ENOTSUP" ? "atomic_publish_unsupported" : "atomic_publish_check_failed");
    } finally {
      await unlink(destination).catch(() => undefined);
      await unlink(source).catch(() => undefined);
    }
  }

  return { rootAccessible, tempAccessible, atomicPublishSupported, spaceAvailableBytes, errorCodes };
};

export const checkGatewayHealth = async (config: GatewayConfig, api: GatewayHealthApi): Promise<GatewayHealthSnapshot> => {
  const local = await localFilesystemHealth(config);
  let backend: GatewayBackendHealth = {
    gatewayActive: false,
    backendConnected: false,
    pendingJobs: 0,
    failedJobs: 0,
    retryingJobs: 0,
  };
  try {
    backend = await api.health();
  } catch {
    local.errorCodes.push("backend_unavailable");
  }
  const healthy = backend.gatewayActive && backend.backendConnected && local.rootAccessible && local.tempAccessible && local.atomicPublishSupported;
  return {
    healthy,
    ...backend,
    ...local,
    version: process.env.npm_package_version ?? "0.1.0",
    checkedAt: new Date().toISOString(),
    errorCodes: [...new Set(local.errorCodes)],
  };
};
