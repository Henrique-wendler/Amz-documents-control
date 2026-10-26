import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
const supabaseOrigin = "https://iglciwizbxtkfwlboihe.supabase.co";
const headers = Object.fromEntries(config.headers[0].headers.map(({ key, value }) => [key, value]));
const csp = headers["Content-Security-Policy"];
const directives = new Map(csp.split("; ").map((directive) => {
  const [name, ...sources] = directive.split(" ");
  return [name, sources];
}));

test("Vercel configuration is static JSON with every header value materialized", async () => {
  assert.equal(config.$schema, "https://openapi.vercel.sh/vercel.json");
  assert.equal(config.headers.length, 1);
  assert.equal(config.headers[0].source, "/(.*)");
  assert.equal(config.headers[0].headers.length, 5);
  for (const header of config.headers[0].headers) {
    assert.equal(typeof header.key, "string");
    assert.equal(typeof header.value, "string");
    assert.ok(header.value.trim().length > 0);
    assert.doesNotMatch(header.value, /undefined|\$\{|process\.env/);
  }
  for (const name of ["vercel.ts", "vercel.mts", "vercel.js", "vercel.mjs", "vercel.cjs"]) {
    await assert.rejects(access(new URL(`../${name}`, import.meta.url)), { code: "ENOENT" });
  }
});

test("Vercel preserves SPA routing and the required security headers", () => {
  assert.deepEqual(config.rewrites, [{ source: "/(.*)", destination: "/" }]);
  assert.equal(headers["X-Content-Type-Options"], "nosniff");
  assert.equal(headers["Referrer-Policy"], "strict-origin-when-cross-origin");
  assert.equal(headers["X-Frame-Options"], "DENY");
  assert.equal(headers["Permissions-Policy"], "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
});

test("CSP permits only staging API origins and the frontend resources it uses", () => {
  assert.deepEqual(directives.get("default-src"), ["'self'"]);
  assert.deepEqual(directives.get("base-uri"), ["'self'"]);
  assert.deepEqual(directives.get("form-action"), ["'self'"]);
  assert.deepEqual(directives.get("script-src"), ["'self'"]);
  assert.deepEqual(directives.get("font-src"), ["'self'"]);
  // Fluent UI and charts need inline styles; the TOTP QR uses a data image.
  assert.deepEqual(directives.get("style-src"), ["'self'", "'unsafe-inline'"]);
  assert.deepEqual(directives.get("img-src"), ["'self'", "data:", supabaseOrigin]);
  assert.deepEqual(directives.get("connect-src"), ["'self'", supabaseOrigin, supabaseOrigin.replace("https:", "wss:")]);
  for (const path of ["/auth/v1/token", "/rest/v1/owners", "/rest/v1/rpc/current_user_permissions", "/functions/v1/generate-report", "/storage/v1/object/sign/rural-documents/test.pdf"]) {
    assert.ok(directives.get("connect-src").includes(new URL(path, supabaseOrigin).origin));
  }
});

test("CSP denies framing, plugin content and unsafe script execution", () => {
  assert.deepEqual(directives.get("object-src"), ["'none'"]);
  assert.deepEqual(directives.get("frame-src"), ["'none'"]);
  assert.deepEqual(directives.get("frame-ancestors"), ["'none'"]);
  assert.doesNotMatch(csp, /\*|unsafe-eval|script-src[^;]*unsafe-inline/);
});
