import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHmac } from "node:crypto";
import { parseArgs } from "node:util";
import { createInterface } from "node:readline/promises";
import { resolve } from "node:path";
import { QA_PROJECT, QA_ORGANIZATION, operationId } from "./proposal-tracking-fixture.mjs";

const { values } = parseArgs({ options: { "project-ref": {type:"string"}, "credentials-file": {type:"string"}, "output-directory": {type:"string"}, "interactive-mfa": {type:"boolean",default:false} } });
assert.equal(values["project-ref"], QA_PROJECT, "Only the approved staging project is allowed");
assert.ok(values["credentials-file"], "Provide an ignored local credentials file");
const credentials = JSON.parse(await readFile(values["credentials-file"], "utf8"));
assert.equal(credentials.project_ref, QA_PROJECT);
const output = resolve(values["output-directory"] ?? ".tmp/proposal-tracking-http");
assert.ok(output.startsWith(resolve(".tmp") + "/") || output.startsWith(resolve(".tmp") + "\\"), "Evidence must stay in ignored .tmp");
const keys = spawnSync(process.execPath, ["node_modules/supabase/dist/supabase.js", "projects", "api-keys", "--project-ref", QA_PROJECT, "--output", "json"], {encoding:"utf8", timeout:180000, maxBuffer:2000000});
assert.equal(keys.status, 0, "Could not retrieve the staging public key");
const publicKey = JSON.parse(keys.stdout).find(k => k.name === "anon")?.api_key;
assert.ok(publicKey);
const endpoint = `https://${QA_PROJECT}.supabase.co`;
const checks = [], clients = [], sessions = new Map();
let prompt;
const check = (name, actual, expected) => { assert.deepEqual(actual, expected, name); checks.push({name,pass:true}); };
const base32 = (text) => {
  let bits = "";
  for (const c of text.replace(/=+$/, "").toUpperCase()) {
    const value = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(c); assert.ok(value >= 0);
    bits += value.toString(2).padStart(5,"0");
  }
  return Buffer.from((bits.match(/.{8}/g) ?? []).map(b => parseInt(b,2)));
};
const totp = (secret) => {
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
  const digest = createHmac("sha1",base32(secret)).update(counter).digest();
  return String((digest.readUInt32BE(digest[19]&15)&0x7fffffff)%1000000).padStart(6,"0");
};
const monetaryKeys = (value) => Array.isArray(value) ? value.flatMap(monetaryKeys) : value && typeof value === "object" ? Object.entries(value).flatMap(([key,child]) => [...(/amount|financial_value|valor/i.test(key) ? [key] : []), ...monetaryKeys(child)]) : [];
const request = async (label,path,body,method="POST") => {
  const response = await fetch(`${endpoint}/rest/v1/${path}`, {method, headers:{apikey:publicKey,Authorization:`Bearer ${sessions.get(label)}`,"Content-Type":"application/json"}, ...(body === undefined ? {} : {body:JSON.stringify(body)}), signal:AbortSignal.timeout(15000)});
  return {status:response.status,body:await response.json()};
};
try {
  // The manager's human-owned authenticator is not read or reused here.
  // Its real AAL2 session, edits and financial KPIs are validated through the preview UI.
  for (const label of ["report-no-financial","no-report","operator","tenant-b-manager"]) {
    const user = credentials.users.find(u => u.label === label);
    assert.equal(user?.email, `qa-proposals-20261026-${label}@example.invalid`);
    assert.ok(user?.id && user?.password, `Missing synthetic credentials for ${label}`);
    const client = createClient(endpoint,publicKey,{auth:{persistSession:false,autoRefreshToken:false}}); clients.push(client);
    const login = await client.auth.signInWithPassword({email:user.email,password:user.password}); assert.ifError(login.error);
    let factorId = user.factor_id, code;
    if (factorId && user.totp_secret) code = totp(user.totp_secret);
    else {
      assert.ok(values["interactive-mfa"], "Human-owned MFA: rerun with --interactive-mfa; never copy the authenticator secret into fixtures");
      const available = await client.auth.mfa.listFactors(); assert.ifError(available.error);
      factorId = available.data.totp.find(f => f.status === "verified")?.id;
      assert.ok(factorId, "Complete enrollment in the preview before running this check");
      prompt ??= createInterface({input:process.stdin,output:process.stdout});
      code = (await prompt.question(`Current MFA code for ${user.email}: `)).trim();
      assert.match(code,/^\d{6}$/,"A current six-digit code is required");
    }
    const verified = await client.auth.mfa.challengeAndVerify({factorId,code}); assert.ifError(verified.error);
    const assurance = await client.auth.mfa.getAuthenticatorAssuranceLevel();
    check(`${label}_real_aal2`,assurance.data.currentLevel,"aal2");
    sessions.set(label,verified.data.access_token);
  }
  const reader = await request("report-no-financial","rpc/proposal_tracking_report",{p_filters:{},p_page:1,p_page_size:100});
  check("reader_report_200",reader.status,200); check("reader_total",reader.body.total_rows,9);
  check("reader_financial_access",reader.body.financial_access,false); check("reader_raw_json_no_money",monetaryKeys(reader.body),[]);
  check("reader_no_financial_sentinels",["1750000","500000.00","350000.00","900000.00"].some(value => JSON.stringify(reader.body).includes(value)),false);
  const options = await request("report-no-financial","rpc/proposal_tracking_options",{});
  check("reader_options_200",options.status,200); check("reader_options_no_money",monetaryKeys(options.body),[]); check("reader_cannot_edit",options.body.profiles,[]);
  check("reader_audit_rls_empty",(await request("report-no-financial","audit_log?select=id",undefined,"GET")).body,[]);
  check("reader_financial_table_rls_empty",(await request("report-no-financial","operation_financials?select=amount",undefined,"GET")).body,[]);
  check("reader_save_denied",(await request("report-no-financial","rpc/save_proposal_tracking",{p_operation_id:operationId(1),p_expected_version:1,p_values:{approval_status:"approved"}})).status,403);
  for (const label of ["no-report","operator"]) {
    check(`${label}_report_denied`,(await request(label,"rpc/proposal_tracking_report",{})).status,403);
    check(`${label}_tracking_rls_empty`,(await request(label,"operation_approval_tracking?select=operation_id",undefined,"GET")).body,[]);
    const permissions = await request(label,"rpc/current_user_permissions",{});
    check(`${label}_no_report_permission`,JSON.stringify(permissions.body).includes("proposal_reports.read"),false);
    check(`${label}_no_report_financial_permission`,JSON.stringify(permissions.body).includes("proposal_reports.financial"),false);
  }
  const other = await request("tenant-b-manager","rpc/proposal_tracking_report",{});
  check("tenant_b_report_200",other.status,200); check("tenant_b_only_own_operation",other.body.rows.map(r => r.operation_id),[operationId(1001)]);
  const foreign = await request("tenant-b-manager",`operation_approval_tracking?organization_id=eq.${QA_ORGANIZATION}&select=operation_id`,undefined,"GET");
  check("tenant_b_cross_tenant_read_empty",foreign.body,[]);
  check("tenant_b_cross_tenant_write_denied",(await request("tenant-b-manager","rpc/save_proposal_tracking",{p_operation_id:operationId(1),p_expected_version:1,p_values:{approval_status:"approved"}})).status,403);
  await mkdir(output,{recursive:true});
  await writeFile(resolve(output,"http-readonly.json"),JSON.stringify(reader.body,null,2)+"\n");
  const result = {ok:true,project_ref:QA_PROJECT,transport:"real Auth/MFA + PostgREST HTTP",checks:checks.length,results:checks,manager_validated_separately_in_browser:true,credentials_in_evidence:false};
  await writeFile(resolve(output,"http-security.json"),JSON.stringify(result,null,2)+"\n");
  console.log(JSON.stringify(result));
} finally { prompt?.close(); for (const client of clients) await client.auth.signOut({scope:"local"}); }
