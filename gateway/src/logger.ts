import type { Logger } from "./types.js";

export const sanitizeLogValue = (value: unknown, key = ""): unknown => {
  if (/(authorization|credential|password|secret|signed.?url|token|path)/i.test(key)) return "[REDACTED]";
  if (typeof value === "string") {
    if (/^(?:[a-z]:[\\/]|\\\\)/i.test(value) || /^https?:\/\//i.test(value) || /^bearer\s/i.test(value)) return "[REDACTED]";
    return value.length > 256 ? `${value.slice(0, 253)}...` : value;
  }
  if (Array.isArray(value)) return value.map((entry) => sanitizeLogValue(entry));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([entryKey, entryValue]) => [entryKey, sanitizeLogValue(entryValue, entryKey)]));
  return value;
};

const write = (level: "info" | "warn" | "error", event: string, context: Record<string, unknown> = {}) => {
  const safeContext = sanitizeLogValue(context) as Record<string, unknown>;
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...safeContext });
  if (level === "error") process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
};

export const logger: Logger = {
  info: (event, context) => write("info", event, context),
  warn: (event, context) => write("warn", event, context),
  error: (event, context) => write("error", event, context),
};
