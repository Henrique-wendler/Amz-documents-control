import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";

// Disposable project with separate ports. Never reset the operator's Supabase project.
const root = process.cwd();
const qa = resolve(root, ".tmp", "proposal-tracking-local");
const configuration = join(qa, "supabase");
const cli = join(root, "node_modules", "supabase", "dist", "supabase.js");
const projectId = "proposal-tracking-qa";
await mkdir(join(configuration, "migrations"), { recursive: true });
await mkdir(join(configuration, "tests"), { recursive: true });
const config = (await readFile(join(root, "supabase", "config.toml"), "utf8"))
  .replace(/^project_id\s*=.*$/m, `project_id = "${projectId}"`)
  .replace(/543(\d{2})/g, "554$1");
if (
  !config.includes(`project_id = "${projectId}"`) ||
  !config.includes("port = 55422")
)
  throw new Error("Unexpected local project configuration.");
await writeFile(join(configuration, "config.toml"), config);
const migrations = (await readdir(join(root, "supabase", "migrations")))
  .filter((name) => name.endsWith(".sql"))
  .sort();
for (const name of migrations)
  await cp(
    join(root, "supabase", "migrations", name),
    join(configuration, "migrations", name),
  );
await cp(
  join(root, "supabase", "tests", "proposal_approval_tracking.test.sql"),
  join(configuration, "tests", "proposal_approval_tracking.test.sql"),
);
const run = async (label, args) => {
  process.stdout.write(`${label} (${projectId})…\n`);
  const result = spawnSync(process.execPath, [cli, ...args, "--workdir", qa], {
    cwd: root,
    encoding: "utf8",
    timeout: 300000,
    maxBuffer: 16000000,
  });
  const log = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  await writeFile(join(qa, `${label}.log`), log);
  if (result.status !== 0 || result.error)
    throw new Error(
      `${label} failed. Inspect .tmp/proposal-tracking-local/${label}.log locally.`,
    );
  if (label === "db-tests") {
    const summary = log.match(/Files=\d+, Tests=\d+[^\r\n]*/)?.[0];
    if (!summary || !log.includes("Result: PASS"))
      throw new Error("Database test summary unavailable.");
    process.stdout.write(`${summary}\nResult: PASS\n`);
  }
};
await run("start", [
  "start",
  "--exclude",
  "studio,pgadmin,pgmeta,imgproxy,realtime,logflare,vector,edge-runtime,supavisor,inbucket",
]);
await run("reset", ["db", "reset", "--local"]);
await run("db-tests", ["test", "db"]);
process.stdout.write(
  `Clean migrations 001–${String(migrations.length).padStart(3, "0")} validated in the isolated local project.\n`,
);
