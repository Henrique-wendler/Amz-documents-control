import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { QA_PROJECT, QA_ORGANIZATION, QA_ORGANIZATION_NAME, canonicalScenario, buildFixtureSql } from "./proposal-tracking-fixture.mjs";

const { values } = parseArgs({ options: {
  "project-ref": { type: "string" }, "reference-date": { type: "string" }, apply: { type: "boolean", default: false },
} });
if (values["project-ref"] !== QA_PROJECT) throw new Error("Only the explicitly approved staging project is allowed.");
const date = values["reference-date"];
const scenario = canonicalScenario(date ?? "");
const cli = resolve("node_modules/supabase/dist/supabase.js");
const run = (args) => {
  const result = spawnSync(process.execPath, [cli, ...args, "--output", "json"], { encoding: "utf8", timeout: 60000, maxBuffer: 8000000 });
  if (result.status !== 0) throw new Error(result.stderr || result.error?.code || "Supabase QA command failed.");
  return JSON.parse(result.stdout);
};
// The exact project ref is allowlisted above; confirm the exclusive tenant and migration in that project.
const query = (sql) => run(["db", "query", "--linked", "--project-ref", QA_PROJECT, sql]).rows;
const baseline = query(`select (statement_timestamp() at time zone 'America/Araguaina')::date as today,
(select legal_name from public.organizations where id='${QA_ORGANIZATION}') as organization_name,
(select max(version) from supabase_migrations.schema_migrations) as migration`)[0];
if (baseline.organization_name !== QA_ORGANIZATION_NAME || baseline.migration !== "202610260023")
  throw new Error("Unexpected QA organization or migration history; no fixture was applied.");
if (baseline.today !== date) throw new Error(`Explicit reference ${date} differs from operational date ${baseline.today}; no historical fixture will be applied silently.`);
if (!values.apply) {
  console.log(JSON.stringify({ apply: false, project_ref: QA_PROJECT, reference_date: date, scenario }, null, 2));
} else {
  const result = query(`begin;\n${buildFixtureSql(date)}\ncommit;`);
  console.log(JSON.stringify({ apply: true, project_ref: QA_PROJECT, results: result }, null, 2));
}
