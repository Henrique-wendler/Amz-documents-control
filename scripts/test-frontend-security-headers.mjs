import assert from "node:assert/strict";
import test from "node:test";

test("Vercel headers restrict the frontend to its configured Supabase project", async () => {
  const previousUrl = process.env.VITE_SUPABASE_URL;
  process.env.VITE_SUPABASE_URL = "https://test-staging.supabase.co";
  try {
    const { config } = await import("../vercel.mjs?valid");
    assert.deepEqual(config.rewrites, [{ source: "/(.*)", destination: "/" }]);
    assert.equal(config.headers.length, 1);
    assert.equal(config.headers[0].source, "/(.*)");

    const headers = Object.fromEntries(config.headers[0].headers.map(({ key, value }) => [key, value]));
    assert.equal(headers["X-Content-Type-Options"], "nosniff");
    assert.equal(headers["Referrer-Policy"], "strict-origin-when-cross-origin");
    assert.equal(headers["X-Frame-Options"], "DENY");
    assert.equal(headers["Permissions-Policy"], "camera=(), microphone=(), geolocation=(), payment=(), usb=()");

    const csp = headers["Content-Security-Policy"];
    const directives = new Map(csp.split("; ").map((directive) => {
      const [name, ...sources] = directive.split(" ");
      return [name, sources];
    }));
    assert.deepEqual(directives.get("default-src"), ["'self'"]);
    assert.deepEqual(directives.get("base-uri"), ["'self'"]);
    assert.deepEqual(directives.get("object-src"), ["'none'"]);
    assert.deepEqual(directives.get("frame-src"), ["'none'"]);
    assert.deepEqual(directives.get("form-action"), ["'self'"]);
    assert.deepEqual(directives.get("font-src"), ["'self'"]);
    assert.deepEqual(directives.get("style-src"), ["'self'", "'unsafe-inline'"]);
    // Auth, REST/RPC, Functions and private Storage share the configured origin.
    for (const path of ["/auth/v1/token", "/rest/v1/owners", "/rest/v1/rpc/current_user_permissions", "/functions/v1/generate-report", "/storage/v1/object/sign/rural-documents/test.pdf"]) {
      const origin = new URL(path, "https://test-staging.supabase.co").origin;
      assert.ok(directives.get("connect-src").includes(origin));
    }
    assert.match(csp, /script-src 'self'(?:;|$)/);
    assert.match(csp, /frame-ancestors 'none'(?:;|$)/);
    assert.match(csp, /img-src 'self' data: https:\/\/test-staging\.supabase\.co(?:;|$)/);
    assert.match(csp, /connect-src 'self' https:\/\/test-staging\.supabase\.co wss:\/\/test-staging\.supabase\.co(?:;|$)/);
    assert.doesNotMatch(csp, /script-src[^;]*\*|script-src[^;]*unsafe-inline|unsafe-eval/);
  } finally {
    if (previousUrl === undefined) delete process.env.VITE_SUPABASE_URL;
    else process.env.VITE_SUPABASE_URL = previousUrl;
  }
});

test("Vercel configuration requires a Supabase environment URL", async () => {
  const previousUrl = process.env.VITE_SUPABASE_URL;
  delete process.env.VITE_SUPABASE_URL;
  try {
    await assert.rejects(import("../vercel.mjs?missing"), /VITE_SUPABASE_URL is required/);
  } finally {
    if (previousUrl === undefined) delete process.env.VITE_SUPABASE_URL;
    else process.env.VITE_SUPABASE_URL = previousUrl;
  }
});

test("Vercel configuration rejects a different API host", async () => {
  const previousUrl = process.env.VITE_SUPABASE_URL;
  process.env.VITE_SUPABASE_URL = "https://supabase.co.example.test";
  try {
    await assert.rejects(import("../vercel.mjs?wrong-host"), /HTTPS Supabase project URL/);
  } finally {
    if (previousUrl === undefined) delete process.env.VITE_SUPABASE_URL;
    else process.env.VITE_SUPABASE_URL = previousUrl;
  }
});

test("Vercel configuration rejects non-HTTPS Supabase URLs", async () => {
  const previousUrl = process.env.VITE_SUPABASE_URL;
  process.env.VITE_SUPABASE_URL = "http://localhost:54321";
  try {
    await assert.rejects(import("../vercel.mjs?invalid"), /HTTPS Supabase project URL/);
  } finally {
    if (previousUrl === undefined) delete process.env.VITE_SUPABASE_URL;
    else process.env.VITE_SUPABASE_URL = previousUrl;
  }
});
