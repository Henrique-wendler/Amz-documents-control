import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { buildFixtureSql, canonicalScenario, QA_ORGANIZATION, operationId } from "./proposal-tracking-fixture.mjs";

test("canonical IDs and explicit civil dates remain deterministic", () => {
  const first = canonicalScenario("2026-10-27");
  assert.deepEqual(canonicalScenario("2026-10-27"), first);
  assert.equal(first.length, 9);
  assert.equal(new Set(first.map(r => r.operation_id)).size, 9);
  assert.equal(first[0].approval_deadline, "2026-10-21");
  assert.equal(first[1].approval_deadline, "2026-10-26");
  assert.equal(first[2].approval_deadline, "2026-10-17");
  assert.equal(first[3].approval_deadline, "2026-10-27");
  assert.equal(first[4].approval_deadline, "2026-10-28");
  assert.equal(first[8].approval_deadline, null);
  assert.equal(first.slice(0, 3).reduce((sum, r) => sum + BigInt(r.amount.replace(".", "")), 0n), 175000000n);
});
test("invalid or missing reference dates are rejected before SQL construction", () => {
  for (const value of ["", "2026-02-30", "2026-1-2", "2026-10-27';delete", "invalid"])
    assert.throws(() => canonicalScenario(value));
  assert.equal(canonicalScenario("2028-03-01")[1].approval_deadline, "2028-02-29");
});
const execute = (sql) => spawnSync("docker", ["exec", "-i", "supabase_db_proposal-tracking-qa", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-A", "-t"], { input: sql, encoding: "utf8", timeout: 30000, maxBuffer: 8000000 });
const setup = `begin;
insert into auth.users(id,email) values ('a6102620-0000-4000-8000-000000000001','fixture-local-manager@example.invalid'),('a6102620-0000-4000-8000-000000000002','fixture-local-operator@example.invalid');
insert into public.organizations(id,legal_name) values ('${QA_ORGANIZATION}','QA Acompanhamento 2026-10-26 A');
insert into public.profiles(id,organization_id,full_name,role_key) values
('a6102620-0000-4000-8000-000000000001','${QA_ORGANIZATION}','QA Propostas manager','manager'),
('a6102620-0000-4000-8000-000000000002','${QA_ORGANIZATION}','QA Propostas operator','operator');
insert into public.financial_institutions(id,organization_id,name) values
('a6102610-0000-4000-8000-000000000001','${QA_ORGANIZATION}','Banco QA A'),('a6102610-0000-4000-8000-000000000002','${QA_ORGANIZATION}','Banco QA B');
`;
test("three local executions remove only known pagination rows and preserve canonical data and audit history", () => {
  const body = buildFixtureSql("2026-10-27");
  const seed = `insert into public.operations(id,organization_id,operation_number,institution_id,purpose) select ('a6102630-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${QA_ORGANIZATION}','QA-TRACK-'||lpad(n::text,3,'0'),'a6102610-0000-4000-8000-000000000001','QA paginação prazo hoje' from generate_series(10,31)n;
insert into public.operation_financials(operation_id,organization_id,amount) select id,organization_id,0 from public.operations where organization_id='${QA_ORGANIZATION}';
insert into public.operation_approval_tracking(operation_id,organization_id,approval_deadline) select id,organization_id,'2026-10-26'::date from public.operations where organization_id='${QA_ORGANIZATION}';`;
  const sql = `${setup}\n${seed}\n${body}
select set_config('qa.fingerprint',(select md5(jsonb_agg(to_jsonb(t) order by operation_id)::text) from public.operation_approval_tracking t where organization_id='${QA_ORGANIZATION}'),true);
select set_config('qa.audit_count',(select count(*)::text from public.audit_log where organization_id='${QA_ORGANIZATION}'),true);
${body}\n${body}
do $$ begin
 if (select count(*) from public.operations where organization_id='${QA_ORGANIZATION}')<>9 then raise exception 'Unexpected operation count'; end if;
 if (select md5(jsonb_agg(to_jsonb(t) order by operation_id)::text) from public.operation_approval_tracking t where organization_id='${QA_ORGANIZATION}')<>current_setting('qa.fingerprint') then raise exception 'Repeated fixture changed tracking data'; end if;
 if (select count(*)::text from public.audit_log where organization_id='${QA_ORGANIZATION}')<>current_setting('qa.audit_count') then raise exception 'No-op execution changed audit history'; end if;
 if not exists(select 1 from public.audit_log where organization_id='${QA_ORGANIZATION}' and entity_id='${operationId(10)}') then raise exception 'Historical audit was removed'; end if;
end; $$;
rollback;`;
  const r = execute(sql); assert.equal(r.status, 0, r.stderr);
});
test("an unknown QA operation aborts preparation without deleting it", () => {
  const sql = `${setup}
insert into public.operations(id,organization_id,operation_number,institution_id,purpose) values ('${operationId(99)}','${QA_ORGANIZATION}','QA-UNKNOWN','a6102610-0000-4000-8000-000000000001','Must not be removed');
${buildFixtureSql("2026-10-27")}
rollback;`;
  const r = execute(sql); assert.notEqual(r.status, 0); assert.match(r.stderr, /Unknown QA operation detected/);
});

test("staging driver rejects other projects before remote calls", () => {
 const r=spawnSync(process.execPath,["scripts/qa/prepare-proposal-tracking-staging.mjs","--project-ref","not-approved","--reference-date","2026-10-27","--apply"],{encoding:"utf8",timeout:5000});
 assert.notEqual(r.status,0); assert.match(r.stderr,/Only the explicitly approved staging project is allowed/);
 const http=spawnSync(process.execPath,["scripts/qa/verify-proposal-tracking-http.mjs","--project-ref","not-approved","--credentials-file",".tmp/must-not-be-read.json"],{encoding:"utf8",timeout:5000});
 assert.notEqual(http.status,0); assert.match(http.stderr,/Only the approved staging project is allowed/);
});
test("ambiguous synthetic profiles abort before preparing data", () => {
  const sql = `${setup}
update public.profiles set full_name='QA Propostas manager',role_key='manager' where id='a6102620-0000-4000-8000-000000000002';
${buildFixtureSql("2026-10-27")}
rollback;`;
  const result = execute(sql);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Expected synthetic manager\/operator profiles were not confirmed/);
});
