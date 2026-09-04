import assert from "node:assert/strict";
import { win32 } from "node:path";
import test from "node:test";
import { loadConfig } from "./config.js";

const keys = ["GATEWAY_SUPABASE_URL", "GATEWAY_INSTANCE_ID", "GATEWAY_TOKEN", "GATEWAY_ROOT_PATH", "GATEWAY_TEMP_PATH", "NODE_ENV"] as const;

test("Windows configuration accepts a dedicated UNC root without accessing it", { skip: process.platform !== "win32" }, () => {
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    process.env.GATEWAY_SUPABASE_URL = "https://example.invalid";
    process.env.GATEWAY_INSTANCE_ID = "66666666-6666-4666-8666-666666666666";
    process.env.GATEWAY_TOKEN = "x".repeat(48);
    process.env.GATEWAY_ROOT_PATH = "\\\\servidor\\SistemaRural-Homologacao";
    delete process.env.GATEWAY_TEMP_PATH;
    process.env.NODE_ENV = "production";
    const value = loadConfig();
    assert.equal(value.rootPath, win32.resolve("\\\\servidor\\SistemaRural-Homologacao"));
    assert.equal(value.tempPath, win32.join(value.rootPath, ".gateway-tmp"));
  } finally {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});
