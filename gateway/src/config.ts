import { isAbsolute, parse, resolve } from "node:path";
import type { GatewayConfig } from "./types.js";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const required = (name: string) => {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
};

const integer = (name: string, fallback: number, minimum: number, maximum: number) => {
  const raw = process.env[name];
  const value = raw === undefined || raw.trim() === "" ? fallback : Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`Invalid operational setting: ${name}`);
  }
  return value;
};

export const loadConfig = (): GatewayConfig => {
  const supabaseUrl = required("GATEWAY_SUPABASE_URL").replace(/\/+$/, "");
  const parsedUrl = new URL(supabaseUrl);
  if (process.env.NODE_ENV === "production" && parsedUrl.protocol !== "https:") {
    throw new Error("GATEWAY_SUPABASE_URL must use HTTPS in production.");
  }
  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") throw new Error("Invalid Supabase URL protocol.");

  const gatewayId = required("GATEWAY_INSTANCE_ID");
  if (!uuidPattern.test(gatewayId)) throw new Error("GATEWAY_INSTANCE_ID is invalid.");
  const token = required("GATEWAY_TOKEN");
  if (token.length < 32 || token.length > 512) throw new Error("GATEWAY_TOKEN must be a high-entropy value.");

  const configuredRoot = required("GATEWAY_ROOT_PATH");
  if (!isAbsolute(configuredRoot)) throw new Error("GATEWAY_ROOT_PATH must be absolute.");
  const rootPath = resolve(configuredRoot);
  const uncShareRoot = process.platform === "win32" && rootPath.startsWith("\\\\");
  if (rootPath === parse(rootPath).root && !uncShareRoot) throw new Error("GATEWAY_ROOT_PATH cannot be a filesystem root.");
  const configuredTemp = process.env.GATEWAY_TEMP_PATH?.trim();
  if (configuredTemp && !isAbsolute(configuredTemp)) throw new Error("GATEWAY_TEMP_PATH must be absolute when configured.");
  const tempPath = configuredTemp ? resolve(configuredTemp) : resolve(rootPath, ".gateway-tmp");
  if (tempPath === parse(tempPath).root) throw new Error("GATEWAY_TEMP_PATH cannot be a filesystem root.");

  return {
    supabaseUrl,
    gatewayId,
    token,
    rootPath,
    tempPath,
    batchSize: integer("GATEWAY_BATCH_SIZE", 10, 1, 50),
    pollIntervalMs: integer("GATEWAY_POLL_INTERVAL_MS", 30_000, 5_000, 3_600_000),
    requestTimeoutMs: integer("GATEWAY_REQUEST_TIMEOUT_MS", 30_000, 1_000, 300_000),
    downloadTimeoutMs: integer("GATEWAY_DOWNLOAD_TIMEOUT_MS", 120_000, 1_000, 900_000),
    maxRequestRetries: integer("GATEWAY_MAX_REQUEST_RETRIES", 3, 0, 10),
    retryBaseMs: integer("GATEWAY_RETRY_BASE_MS", 1_000, 100, 60_000),
    maxSyncAttempts: integer("GATEWAY_MAX_SYNC_ATTEMPTS", 10, 1, 100),
    leaseSeconds: integer("GATEWAY_LEASE_SECONDS", 300, 30, 3_600),
    maxUploadBytes: integer("GATEWAY_MAX_UPLOAD_BYTES", 20 * 1024 * 1024, 1, 50 * 1024 * 1024),
  };
};
