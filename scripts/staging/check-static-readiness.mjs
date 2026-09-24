import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];
const pass = (message) => process.stdout.write(`PASS ${message}\n`);
const fail = (message) => failures.push(message);

const migrationDirectory = resolve(root, "supabase", "migrations");
const migrationFiles = (await readdir(migrationDirectory))
  .filter((name) => name.endsWith(".sql"))
  .sort();
const migrationNumbers = migrationFiles.map((name) => Number(name.match(/^(\d{12})_/)?.[1].slice(-3)));
const expectedNumbers = Array.from({ length: 18 }, (_, index) => index + 1);
if (migrationFiles.length === 18 && JSON.stringify(migrationNumbers) === JSON.stringify(expectedNumbers)) {
  pass("migrations 001-018 are present in order");
} else {
  fail(`expected migrations 001-018; found ${migrationFiles.join(", ")}`);
}

const expectedFunctions = ["admin-users", "document-files", "file-gateway", "generate-report"];
const supabaseConfig = await readFile(resolve(root, "supabase", "config.toml"), "utf8");
if (/\[db\.seed\]\s*(?:#[^\r\n]*(?:\r?\n|$)\s*)*enabled\s*=\s*false/.test(supabaseConfig)) {
  pass("automatic database seed is disabled");
} else {
  fail("automatic database seed must remain disabled");
}
for (const functionName of expectedFunctions) {
  const entrypoint = resolve(root, "supabase", "functions", functionName, "index.ts");
  try {
    await readFile(entrypoint, "utf8");
    if (!supabaseConfig.includes(`[functions.${functionName}]`) || !supabaseConfig.includes(`./functions/${functionName}/index.ts`)) {
      fail(`Edge Function ${functionName} is not configured in supabase/config.toml`);
    } else {
      pass(`Edge Function ${functionName} is present and configured`);
    }
  } catch {
    fail(`Edge Function ${functionName} entrypoint is missing`);
  }
}

const publicEnvironment = await readFile(resolve(root, ".env.example"), "utf8");
const functionEnvironment = await readFile(resolve(root, "supabase", "functions", ".env.example"), "utf8");
const gatewayEnvironment = await readFile(resolve(root, "gateway", ".env.example"), "utf8");
if (/^VITE_(?:.*SECRET|.*SERVICE_ROLE|.*PASSWORD|.*TOKEN)=/mi.test(publicEnvironment)) {
  fail("frontend environment example contains a privileged VITE_ variable");
} else {
  pass("frontend environment contains only public Supabase variables");
}
if (/^(?:SUPABASE_SERVICE_ROLE_KEY|GATEWAY_TOKEN)=\S+/mi.test(`${functionEnvironment}\n${gatewayEnvironment}`)) {
  fail("an environment example contains a secret value");
} else {
  pass("backend and Gateway environment examples contain no secret values");
}

const runtimeFiles = [
  ...(await readdir(resolve(root, "src"), { recursive: true }))
    .filter((name) => /\.(?:ts|tsx)$/.test(name))
    .map((name) => resolve(root, "src", name)),
  ...expectedFunctions.map((name) => resolve(root, "supabase", "functions", name, "index.ts")),
  ...(await readdir(resolve(root, "gateway", "src")))
    .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    .map((name) => resolve(root, "gateway", "src", name)),
];

const localAddressPattern = /(?:localhost|127\.0\.0\.1|0\.0\.0\.0)/i;
const credentialValuePatterns = [
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/,
  /sb_secret_[A-Za-z0-9_-]{12,}/,
  /postgres(?:ql)?:\/\/[^\s:@]+:[^\s@]+@/i,
];
for (const file of runtimeFiles) {
  const content = await readFile(file, "utf8");
  const label = file.slice(root.length + 1);
  if (localAddressPattern.test(content)) fail(`${label} contains a local address in production runtime code`);
  if (credentialValuePatterns.some((pattern) => pattern.test(content))) fail(`${label} contains a credential-like literal`);
}
if (!failures.some((message) => message.includes("production runtime code"))) pass("production runtime code has no hardcoded local address");
if (!failures.some((message) => message.includes("credential-like literal"))) pass("production runtime code has no credential-like literal");

const allMigrations = (await Promise.all(migrationFiles.map((name) => readFile(resolve(migrationDirectory, name), "utf8")))).join("\n");
if (/insert into storage\.buckets[\s\S]*?'rural-documents'[\s\S]*?false/i.test(allMigrations)) {
  pass("private rural-documents bucket is provisioned by migrations");
} else {
  fail("private rural-documents bucket provisioning was not found");
}
for (const permission of ["users.manage", "catalogs.manage", "files.read", "files.manage", "reports.read", "reports.generate", "reports.export", "financial.read"]) {
  if (!allMigrations.includes(`'${permission}'`)) fail(`required permission ${permission} was not found in migrations`);
}
if (!failures.some((message) => message.startsWith("required permission"))) pass("critical staging permissions are provisioned by migrations");

if (failures.length) {
  for (const message of failures) process.stderr.write(`FAIL ${message}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write("Static staging readiness checks passed.\n");
}
