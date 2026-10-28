import assert from "node:assert/strict";
import {createClient} from "@supabase/supabase-js";
import {createHmac,randomUUID} from "node:crypto";
import {spawn,spawnSync} from "node:child_process";
import {readFile,writeFile} from "node:fs/promises";
import {resolve,join} from "node:path";

// Real local Auth + separate TOTP for disposable synthetic accounts. No user MFA is reset or reused.
const root=process.cwd(), qa=resolve(root,".tmp/desktop-proposal-sync-local"), project="desktop-proposal-sync-qa";
const cli=join(root,"node_modules/supabase/dist/supabase.js"), container="supabase_db_"+project;
if(process.argv.length!==2) throw Error("This runner accepts no remote targets or credentials");
const config=await readFile(join(qa,"supabase/config.toml"),"utf8");
if(!config.includes(`project_id = "${project}"`)||!config.includes("port = 56422"))throw Error("Unsafe local QA configuration");
const state=spawnSync(process.execPath,[cli,"status","--workdir",qa,"--output","json"],{encoding:"utf8",timeout:30000,maxBuffer:1000000});
if(state.status!==0)throw Error("Local QA stack is unavailable");
const status=JSON.parse(state.stdout), base=status.API_URL;
if(base!=="http://127.0.0.1:56421")throw Error("Only the disposable local API may be used");
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const admin=createClient(base,status.SERVICE_ROLE_KEY,options);
const checks=[];
function pass(name,condition=true){assert.ok(condition,name);checks.push({name,pass:true});process.stdout.write(`PASS ${name}\n`);}
function sql(text){const result=spawnSync("docker",["exec","-i",container,"psql","-X","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1","-Atq"],{input:text,encoding:"utf8",timeout:30000,maxBuffer:4000000});if(result.status!==0)throw Error("Local QA SQL failed (details withheld)");return result.stdout.trim();}
const quote=value=>"'"+String(value).replaceAll("'","''")+"'";
const select=text=>JSON.parse(sql(text));
const orgA=randomUUID(),orgB=randomUUID(),orgInactive=randomUUID(),bankA=randomUUID(),bankB=randomUUID();
const users={};const runId=randomUUID().slice(0,8);
for(const name of ["manager","tenant-b","operator","viewer","sync-only","inactive-profile","aal1","inactive-org","inactive-role"]){
 const password="Aa9!"+randomUUID();
 const email=`desktop-api-${runId}-${name}@example.invalid`;
 const result=await admin.auth.admin.createUser({email,password,email_confirm:true});
 if(result.error||!result.data.user)throw Error("Cannot prepare synthetic local Auth account");
 users[name]={id:result.data.user.id,email,password};
}
sql(`begin;
 insert into public.organizations(id,legal_name,status) values
 (${quote(orgA)},'Desktop HTTP QA A','active'),(${quote(orgB)},'Desktop HTTP QA B','active'),(${quote(orgInactive)},'Desktop HTTP QA inactive','inactive');
 insert into public.roles(role_key,name,status) values('desktop_sync_only','Desktop only QA','active'),('desktop_sync_disabled_qa','Inactive role QA','inactive') on conflict(role_key) do nothing;
 insert into public.role_permissions(role_key,permission_key) values('desktop_sync_only','desktop_proposals.sync'),('desktop_sync_disabled_qa','desktop_proposals.sync') on conflict do nothing;
 ${Object.entries(users).map(([name,user])=>`insert into public.profiles(id,organization_id,full_name,role_key,status) values(${quote(user.id)},${quote(name==="tenant-b"?orgB:name==="inactive-org"?orgInactive:orgA)},${quote("Synthetic "+name)},${quote(name==="operator"?"operator":name==="viewer"?"viewer":name==="sync-only"?"desktop_sync_only":name==="inactive-role"?"desktop_sync_disabled_qa":"manager")},${quote(name==="inactive-profile"?"inactive":"active")});`).join("\n")}
 insert into public.financial_institutions(id,organization_id,name,short_name) values
 (${quote(bankA)},${quote(orgA)},'Banco QA Desktop','SYNC QA'),(${quote(bankB)},${quote(orgB)},'Banco QA Desktop','SYNC QA');
 commit;`);
function totp(seed){
 const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";let bits="";
 for(const char of seed.replace(/=+$/,"").toUpperCase())bits+=alphabet.indexOf(char).toString(2).padStart(5,"0");
 const bytes=Buffer.from((bits.match(/.{8}/g)??[]).map(value=>parseInt(value,2)));
 const movingFactor=Buffer.alloc(8);movingFactor.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));
 const mac=createHmac("sha1",bytes).update(movingFactor).digest();const offset=mac[19]&15;
 return String((mac.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,"0");
}
for(const [name,user]of Object.entries(users)){
 const client=createClient(base,status.ANON_KEY,options);
 const login=await client.auth.signInWithPassword({email:user.email,password:user.password});
 if(login.error)throw Error("Synthetic local user login failed");
 if(name!=="aal1"){
  const enrollment=await client.auth.mfa.enroll({factorType:"totp",friendlyName:"Disposable local API QA"});
  if(enrollment.error||!enrollment.data?.totp?.secret)throw Error("Synthetic local TOTP enrollment failed");
  const verified=await client.auth.mfa.challengeAndVerify({factorId:enrollment.data.id,code:totp(enrollment.data.totp.secret)});
  if(verified.error)throw Error("Synthetic local TOTP verification failed");
 }
 const session=await client.auth.getSession();
 user.client=client;user.token=session.data.session.access_token;
 const assurance=await client.auth.mfa.getAuthenticatorAssuranceLevel();
 assert.equal(assurance.data.currentLevel,name==="aal1"?"aal1":"aal2");
 delete user.password;
}
pass("normal Auth login and per-account real AAL1/AAL2 sessions");
const payload=(overrides={})=>({sync_id:randomUUID(),proposal_number:"2026-0001",proponent_name:"Synthetic applicant",
 created_at:"2026-10-28T09:00:00.123456Z",updated_at:"2026-10-28T10:00:00.123456Z",created_by_technician_name:"Historical desktop creator",
 responsible_name:"Desktop responsible QA",technician_name:"Desktop technician QA",bank:"  BANCO   QA DESKTOP  ",purpose:"Purpose QA",
 total_value:"2000000.00",fno_value:"1500000.00",of_value:"500000.00",...overrides});
const endpoint=base+"/functions/v1/sync-desktop-proposal";
async function send(body,user=users.manager,headers={}){
 const response=await fetch(endpoint,{method:"POST",headers:{apikey:status.ANON_KEY,"Content-Type":"application/json",
 ...(user?{Authorization:"Bearer "+user.token}:{}),...headers},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
 return {status:response.status,body:await response.json()};
}
async function rest(path,user,body,method="POST"){
 const response=await fetch(base+"/rest/v1/"+path,{method,headers:{apikey:status.ANON_KEY,Authorization:"Bearer "+user.token,"Content-Type":"application/json"},
 ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});
 return {status:response.status,body:await response.json()};
}
const delivery=(body,revision,version)=>({"X-Payload-Version":"1","X-Desktop-Revision":String(revision),"Idempotency-Key":`${body.sync_id}:${revision}`,
 ...(version?{"If-Match":String(version)}:{})});
const serve=spawn(process.execPath,[cli,"functions","serve","--workdir",qa,"--env-file",join(qa,"functions.env")],{cwd:root,stdio:["ignore","pipe","pipe"],windowsHide:true});
let log="",serveError=false;
for(const stream of [serve.stdout,serve.stderr])stream.on("data",data=>{log=(log+data.toString()).slice(-4000000);});
serve.on("error",()=>{serveError=true;});
try{
 let ready=false;
 for(let attempt=0;attempt<90;attempt++){
  if(serveError||serve.exitCode!==null)break;
  try{const probe=await send(payload(),null);if(probe.status===401&&probe.body.code==="authentication_required"){ready=true;break;}}catch{}
  await new Promise(resolve=>setTimeout(resolve,2000));
 }
 await writeFile(join(qa,"edge-runtime.log"),log);
 if(!ready)throw Error("Local Edge did not become ready; inspect ignored edge-runtime.log");
 pass("new Edge executes real auth guard with standardized 401");
 const main=payload();
 for(const [name,code]of[["aal1","mfa_required"],["operator","permission_denied"],["viewer","permission_denied"],["inactive-profile","permission_denied"],["inactive-org","permission_denied"],["inactive-role","permission_denied"]]){
  const response=await send(main,users[name]);pass(`${name} rejected`,response.status===403&&response.body.code===code);
 }
 for(const [name,credential]of [["service role credential",status.SERVICE_ROLE_KEY],["anonymous API credential",status.ANON_KEY],["raw non-JWT credential","not-a-user-jwt"]]){
  const denied=await send(main,{token:credential});
  pass(name+" is not a desktop user session",denied.status===401&&denied.body.code==="authentication_required");
 }
 const invalidToken=await send(main,{token:users.manager.token.slice(0,-8)+"tampered"});
 pass("invalid JWT signature rejected",invalidToken.status===401&&invalidToken.body.code==="authentication_required");
 for(const field of ["organization_id","created_by","updated_by","approval_status","approval_deadline","delay_reason","delay_notes","operation_id","service_role","jwt_secret"]){
  const result=await send({...main,[field]:orgB});pass(`untrusted ${field} rejected`,result.status===400&&result.body.code==="invalid_payload");
 }
 for(const [name,change]of[["invalid UUID",{sync_id:"invalid"}],["float money",{total_value:1.25}],["negative money",{total_value:"-1"}],
  ["exponent money",{fno_value:"1e3"}],["invalid timestamp",{updated_at:"2026-02-30T10:00:00Z"}],
  ["overlong text",{proponent_name:"x".repeat(201)}],["rounding money",{total_value:"1.001"}],["ill-formed Unicode",{proponent_name:"\ud800"}]]){
  const response=await send({...main,...change});pass(name+" rejected",response.status===400&&response.body.code==="invalid_payload");
 }
 const unknown=await send({...main,bank:"Unknown bank QA"});pass("missing institution is controlled 404",unknown.status===404&&unknown.body.code==="institution_not_found");
 const created=await send(main,users.manager,delivery(main,1));
 pass("create response",created.status===201&&created.body.result==="created"&&created.body.ok===true&&created.body.success===true);
 pass("phase 1 acknowledgement compatibility",created.body.organization_id===orgA&&created.body.server_version===created.body.remote_version&&created.body.remote_updated_at);
 const operation=created.body.operation_id;
 const read=()=>select(`select json_build_object('integration',to_jsonb(d)-'payload_hash','tracking',to_jsonb(t),'amount',f.amount::text,'operation',to_jsonb(o)) from public.desktop_proposals d join public.operations o on o.id=d.operation_id join public.operation_financials f on f.operation_id=o.id join public.operation_approval_tracking t on t.operation_id=o.id where d.organization_id=${quote(orgA)} and d.sync_id=${quote(main.sync_id)};`);
 let saved=read();
 pass("exact total in operation_financials",saved.amount==="2000000.00");
 pass("FNO and OF preserved",saved.integration.fno_value===1500000&&saved.integration.of_value===500000);
 pass("snapshots never infer profile IDs",saved.tracking.responsible_profile_id===null&&saved.tracking.technician_profile_id===null);
 pass("server creator differs from historical technician snapshot",saved.operation.created_by===users.manager.id&&saved.integration.created_by_technician_name==="Historical desktop creator");
 pass("same normalized bank reused",saved.operation.institution_id===bankA);
 const retry=await send(main,users.manager,delivery(main,1,1));
 pass("identical retry unchanged",retry.status===200&&retry.body.result==="unchanged"&&retry.body.remote_version==="1");
 const managed=await rest("rpc/save_proposal_tracking",users.manager,{p_operation_id:operation,p_expected_version:1,p_values:{approval_status:"approved",approval_deadline:"2026-10-20",delay_reason:"QA web reason",delay_notes:"QA web notes",responsible_profile_id:users["sync-only"].id}});
 pass("existing web tracking RPC remains functional",managed.status===200&&managed.body===2);
 const tracking=read().tracking;
 const updated={...main,updated_at:"2026-10-28T10:05:00.123456Z",purpose:"Updated desktop purpose",responsible_name:"New desktop responsible",technician_name:"New desktop technician",total_value:"2100000.25",fno_value:"1600000.25"};
 const update=await send(updated,users["sync-only"],delivery(updated,2,1));
 pass("update needs only dedicated sync permission",update.status===200&&update.body.result==="updated"&&update.body.remote_version==="2");
 saved=read();
 assert.deepEqual(saved.tracking,tracking);pass("all management fields and web assignments untouched");
 pass("financial cents preserved after update",saved.amount==="2100000.25"&&saved.integration.updated_by===users["sync-only"].id);
 const replay=await send(updated,users.manager,delivery(updated,2,1));pass("lost ACK replay succeeds despite old If-Match",replay.status===200&&replay.body.result==="unchanged");
 const stale=await send(main,users.manager,delivery(main,1));pass("older source is 409 stale/no-op",stale.status===409&&stale.body.result==="stale"&&stale.body.code==="stale_update"&&stale.body.ok===false);
 assert.equal(read().amount,"2100000.25");pass("stale preserved financial amount");
 const sameTime=await send({...updated,purpose:"different content at same source time"},users.manager,delivery(updated,2,2));
 pass("ambiguous same-time mutation rejected",sameTime.status===409&&sameTime.body.code==="domain_conflict");
 const oldVersion=await send({...updated,updated_at:"2026-10-28T10:10:00Z"},users.manager,delivery(updated,3,1));
 pass("expected version guard",oldVersion.status===409&&oldVersion.body.code==="domain_conflict");
 const collision=await send(payload({proposal_number:main.proposal_number}),users.manager);
 pass("number collision cannot silently link another UUID",collision.status===409&&collision.body.code==="domain_conflict");
 const concurrent=payload({proposal_number:"2026-0002"});
 const arrivals=await Promise.all(Array.from({length:6},()=>send(concurrent,users.manager,delivery(concurrent,1))));
 pass("concurrent identical POSTs create once",arrivals.filter(r=>r.status===201).length===1&&arrivals.filter(r=>r.status===200&&r.body.result==="unchanged").length===5);
 const count=select(`select json_build_object('links',count(*),'operations',count(distinct operation_id),'financials',(select count(*) from public.operation_financials f join public.desktop_proposals d using(operation_id) where d.organization_id=${quote(orgA)} and d.sync_id=${quote(concurrent.sync_id)})) from public.desktop_proposals where organization_id=${quote(orgA)} and sync_id=${quote(concurrent.sync_id)};`);
 pass("concurrent idempotency has no duplicate operation",count.links===1&&count.operations===1&&count.financials===1);
 const conflictA=payload({proposal_number:"2026-0003"}),conflictB=payload({proposal_number:"2026-0003"});
 const conflicts=await Promise.all([send(conflictA),send(conflictB)]);
 pass("concurrent different UUIDs with same number are controlled",conflicts.filter(r=>r.status===201).length===1&&conflicts.filter(r=>r.status===409).length===1);
 const remainder=payload({proposal_number:"2026-0004",fno_value:"1200000.00",of_value:"500000.00"});
 const remainderResult=await send(remainder);assert.equal(remainderResult.status,201);
 const total=select(`select json_build_object('amount',f.amount::text,'fno',d.fno_value::text,'of',d.of_value::text) from public.desktop_proposals d join public.operation_financials f using(operation_id) where d.organization_id=${quote(orgA)} and d.sync_id=${quote(remainder.sync_id)};`);
 pass("total is never inferred from FNO plus OF",total.amount==="2000000.00"&&total.fno==="1200000.00"&&total.of==="500000.00");
 const example=payload({proposal_number:"2026-0042",bank:"Banco QA Desktop",total_value:"100000.00",fno_value:"70000.00",of_value:"30000.00"});
 const exampleCreated=await send(example);pass("official bank name resolves",exampleCreated.status===201);
 const exampleRead=()=>select(`select json_build_object('amount',f.amount::text,'fno',d.fno_value::text,'of',d.of_value::text,'bank',o.institution_id) from public.desktop_proposals d join public.operation_financials f using(operation_id) join public.operations o on o.id=d.operation_id where d.organization_id=${quote(orgA)} and d.sync_id=${quote(example.sync_id)};`);
 assert.deepEqual(exampleRead(),{amount:"100000.00",fno:"70000.00",of:"30000.00",bank:bankA});pass("100000/70000/30000 exact numeric example");
 const alias=await send({...example,bank:"SYNC QA",updated_at:"2026-10-28T11:00:00Z"});
 pass("short_name resolves to same institution",alias.status===200&&alias.body.result==="updated"&&exampleRead().bank===bankA);
 const aliasSpaces=await send({...example,bank:"  sync   qa  ",updated_at:"2026-10-28T11:05:00Z"});
 pass("short_name case and repeated spaces are deterministic",aliasSpaces.status===200&&aliasSpaces.body.result==="updated"&&exampleRead().bank===bankA);
 // The trigger is synthetic and limited to one QA proposal; remove it even if the HTTP assertion fails.
 const failed=payload({proposal_number:"2026-0090"});
 sql(`create function public.qa_sync_intermediate_failure() returns trigger language plpgsql as $$begin
 if exists(select 1 from public.operations where id=new.operation_id and organization_id=${quote(orgA)} and operation_number='2026-0090') then
  raise exception using errcode='P0001',message='SYNTHETIC_SQL_DETAILS_MUST_NOT_LEAK';
 end if;return new;end;$$;
 create trigger qa_sync_intermediate_failure before insert on public.operation_financials for each row execute function public.qa_sync_intermediate_failure();`);
 try{
  const failure=await send(failed);
  pass("intermediate SQL failure is a sanitized HTTP 500",failure.status===500&&failure.body.code==="internal_error"&&!JSON.stringify(failure.body).includes("SYNTHETIC_SQL_DETAILS_MUST_NOT_LEAK"));
  const partial=select(`select json_build_object('operations',(select count(*) from public.operations where organization_id=${quote(orgA)} and operation_number='2026-0090'),'links',(select count(*) from public.desktop_proposals where organization_id=${quote(orgA)} and sync_id=${quote(failed.sync_id)}),'audit',(select count(*) from public.audit_log where context->>'sync_id'=${quote(failed.sync_id)}));`);
  pass("HTTP failure rolls back operation integration and audit",Object.values(partial).every(n=>n===0));
 }finally{sql("drop trigger qa_sync_intermediate_failure on public.operation_financials;drop function public.qa_sync_intermediate_failure();");}
 const legacy=payload({proposal_number:"LEGADO/42",created_at:null,updated_at:null,created_by_technician_name:null,proponent_name:"",responsible_name:"",technician_name:"",purpose:"",total_value:"0",fno_value:"0",of_value:"0"});
 const legacyResult=await send(legacy);pass("partial legacy metadata preserves unknown history",legacyResult.status===201);
 const legacyData=select(`select json_build_object('created',source_created_at,'updated',source_updated_at,'creator',created_by_technician_name) from public.desktop_proposals where organization_id=${quote(orgA)} and sync_id=${quote(legacy.sync_id)};`);
 assert.deepEqual(legacyData,{created:null,updated:null,creator:null});pass("legacy history is not invented");
 const b=await send(main,users["tenant-b"],delivery(main,1));
 pass("tenant B uses its own scoped identity and operation",b.status===201&&b.body.organization_id===orgB&&b.body.operation_id!==operation);
 pass("tenant A survives same UUID in B",read().amount==="2100000.25");
 const deniedRead=await rest("desktop_proposals?select=*",users.manager,undefined,"GET");pass("direct integration read denied",deniedRead.status===403);
 const deniedRpc=await rest("rpc/sync_desktop_proposal",users.manager,{p_actor_id:users["tenant-b"].id,p_payload:main});pass("direct RPC cannot impersonate another actor",deniedRpc.status===403);
 const deniedWrite=await rest(`desktop_proposals?operation_id=eq.${b.body.operation_id}`,users.manager,{responsible_name:"Cross tenant spoof"},"PATCH");
 pass("direct cross-tenant integration update denied",deniedWrite.status===403);
 const bState=select(`select json_build_object('responsible',responsible_name,'version',version::text) from public.desktop_proposals where organization_id=${quote(orgB)} and sync_id=${quote(main.sync_id)};`);
 pass("denied write leaves tenant B untouched",bState.responsible===main.responsible_name&&bState.version==="1");
 const hidden=await rest(`operations?select=id&id=eq.${operation}`,users["tenant-b"],undefined,"GET");pass("existing operations RLS blocks cross-tenant read",hidden.status===200&&hidden.body.length===0);
 const hiddenMoney=await rest("operation_financials?select=*",users["sync-only"],undefined,"GET");pass("dedicated sync does not grant financial reads",hiddenMoney.status===200&&hiddenMoney.body.length===0);
 const audit=select(`select json_build_object('events',count(*),'actors_valid',bool_and(actor_user_id in (${quote(users.manager.id)},${quote(users["sync-only"].id)},${quote(users["tenant-b"].id)})),
 'redacted',bool_and(changes::text not like '%2100000.25%' and changes::text not like '%1500000%' and changes::text not like '%1600000.25%')) from public.audit_log where organization_id in (${quote(orgA)},${quote(orgB)}) and context->>'source'='desktop_sync';`);
 pass("audit records source actor and scoped identities",audit.events>0&&audit.actors_valid);
 pass("financial values omitted from sync audit",audit.redacted);
 sql(`insert into public.financial_institutions(organization_id,name)values(${quote(orgA)},' BANCO QA DESKTOP ');`);
 const ambiguous=await send(payload({proposal_number:"2026-0005"}));pass("ambiguous bank never guessed",ambiguous.status===409&&ambiguous.body.code==="domain_conflict");
 const integrity=select(`select json_build_object('links_without_operation',(select count(*) from public.desktop_proposals d left join public.operations o on (o.organization_id,o.id)=(d.organization_id,d.operation_id) where o.id is null),
 'links_without_tracking',(select count(*) from public.desktop_proposals d left join public.operation_approval_tracking t on t.operation_id=d.operation_id where t.operation_id is null),
 'links_without_financials',(select count(*) from public.desktop_proposals d left join public.operation_financials f on (f.organization_id,f.operation_id)=(d.organization_id,d.operation_id) where f.operation_id is null));`);
 pass("relational integrity has zero orphans",Object.values(integrity).every(n=>n===0));
 await writeFile(join(qa,"http-report.json"),JSON.stringify({ok:true,local_only:true,transport:"real Supabase Auth/MFA + deployed local Edge + PostgreSQL",checks:checks.length,results:checks,integrity},null,2)+"\n");
 process.stdout.write(`${checks.length} local HTTP/Auth/MFA/Edge checks PASS\n`);
}finally{
 await writeFile(join(qa,"edge-runtime.log"),log);
 serve.kill();
 spawnSync("docker",["stop","supabase_edge_runtime_"+project],{encoding:"utf8",timeout:30000});
}
