import type { Logger } from "./types.js";

const write = (level: "info" | "warn" | "error", event: string, context: Record<string, unknown> = {}) => {
  const safeContext = Object.fromEntries(
    Object.entries(context).filter(([key]) => !/(authorization|credential|password|secret|signed.?url|token|path)/i.test(key)),
  );
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...safeContext });
  if (level === "error") process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
};

export const logger: Logger = {
  info: (event, context) => write("info", event, context),
  warn: (event, context) => write("warn", event, context),
  error: (event, context) => write("error", event, context),
};
