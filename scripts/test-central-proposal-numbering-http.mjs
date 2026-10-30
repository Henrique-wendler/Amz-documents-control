import assert from "node:assert/strict";
import {createClient} from "@supabase/supabase-js";
import {createHmac,randomUUID} from "node:crypto";
import {spawnSync,spawn} from "node:child_process";
import {mkdir,writeFile,readFile} from "node:fs/promises";
import {resolve,join} from "node:path";
import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");
// Explicit targets only. Credentials and disposable per-account TOTP secrets stay in memory.
const staging=process.argv[2]==="--staging";
const legacyClaims=process.argv[3]==="--legacy-claims";
const fileSync=process.argv[3]==="--proposal-files";
if(!["--local","--staging"].includes(process.argv[2])||process.argv.length!==((legacyClaims||fileSync)?4:3))throw Error("Use --local or --staging, optionally --legacy-claims or --proposal-files");
const root=process.cwd(),ref="iglciwizbxtkfwlboihe",project="central-proposal-numbering-qa";
const qa=resolve(root,".tmp",staging?"central-numbering-staging":"central-proposal-numbering-local");
await mkdir(qa,{recursive:true});
const cli=join(root,"node_modules/supabase/dist/supabase.js");
function command(args){const r=spawnSync(process.execPath,[cli,...args],{cwd:root,encoding:"utf8",timeout:60000,maxBuffer:8000000});if(r.status!==0)throw Error("QA CLI command failed; details withheld");return r.stdout;}
let base,anon,serverKey;
if(staging){
 base=`https://${ref}.supabase.co`;
 const keys=JSON.parse(command(["projects","api-keys","--project-ref",ref,"--output","json"]));
 anon=keys.find(k=>k.name==="anon")?.api_key;serverKey=keys.find(k=>k.name==="service_role")?.api_key;
}else{const s=JSON.parse(command(["status","--workdir",qa,"--output","json"]));base=s.API_URL;anon=s.ANON_KEY;serverKey=s.SERVICE_ROLE_KEY;
 if(base!=="http://127.0.0.1:59421")throw Error("Not the isolated local stack");}
if(!anon||!serverKey)throw Error("QA runtime credentials unavailable");
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
const admin=createClient(base,serverKey,options);
function sql(text){
 if(staging){const r=JSON.parse(command(["db","query","--project-ref",ref,"--linked",text,"--output","json"]));return r.rows??r;}
 const r=spawnSync("docker",["exec","-i","supabase_db_"+project,"psql","-X","-U","postgres","-d","postgres","-v","ON_ERROR_STOP=1","-Atq"],{input:text,cwd:root,encoding:"utf8",timeout:60000,maxBuffer:8000000});if(r.status!==0)throw Error("QA SQL failed; details withheld");
 return r.stdout.trim()?r.stdout.trim().split("\n").filter(Boolean).map(line=>JSON.parse(line)):[];
}
const quote=v=>"'"+String(v).replaceAll("'","''")+"'";
const orgA=randomUUID(),orgB=randomUUID(),run=randomUUID().slice(0,8),users={},checks=[];
const summary={ok:false,staging,project_ref:staging?ref:project,organization_ids:[orgA,orgB],users:[],checks};
const pass=(name,condition=true)=>{assert.ok(condition,name);checks.push(name);process.stdout.write("PASS "+name+"\n");};
async function record(){await writeFile(join(qa,fileSync?"proposal-files-report.json":legacyClaims?"legacy-claims-report.json":"numbering-report.json"),JSON.stringify(summary,null,2)+"\n");}
function totp(seed){const alphabet="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";let bits="";for(const c of seed.toUpperCase().replace(/=+$/,""))bits+=alphabet.indexOf(c).toString(2).padStart(5,"0");const key=Buffer.from((bits.match(/.{8}/g)??[]).map(v=>parseInt(v,2)));const moving=Buffer.alloc(8);moving.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const mac=createHmac("sha1",key).update(moving).digest(),offset=mac[19]&15;return String((mac.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,"0");}
async function call(name,body,user=users.a){
 // Both endpoints are idempotent for the same immutable UUID/body. Retry transport loss with identical bytes.
 const serialized=JSON.stringify(body);
 for(let attempt=0;attempt<4;attempt++){
  try{
   const response=await fetch(base+"/functions/v1/"+name,{method:"POST",headers:{apikey:anon,"Content-Type":"application/json",...(staging?{Origin:"https://amazon-agro-staging.vercel.app"}:{}),...(user?{Authorization:"Bearer "+user.token}:{})},body:serialized,signal:AbortSignal.timeout(45000)});
   const result={status:response.status,body:await response.json()};
   if(response.status<500||attempt===3)return result;
  }catch{
   if(attempt===3)throw Error("QA HTTPS transport unavailable after bounded idempotent retries");
  }
  await new Promise(resolve=>setTimeout(resolve,500*2**attempt));
 }
 throw Error("QA transport exhausted");
}

const date="2026-10-29T12:00:00.123456Z";
const reserve=(id=randomUUID(),created_at=date,user=users.a)=>call("reserve-proposal-number",{sync_id:id,created_at},user);
let serve;
try{
 sql(`insert into public.organizations(id,legal_name) values(${quote(orgA)},${quote("Central numbering QA A "+run)}),(${quote(orgB)},${quote("Central numbering QA B "+run)});`);
 await record();
 for(const name of ["a","b","parallel","operator","aal1","revoked"]){
  const email=`qa-central-${run}-${name}@example.invalid`,password="Aa9!"+randomUUID();
  const r=await admin.auth.admin.createUser({email,password,email_confirm:true,ban_duration:"1h"});
  if(r.error||!r.data.user)throw Error(`Synthetic account creation failed (${r.error?.status}/${r.error?.code})`);
  users[name]={id:r.data.user.id,email};summary.users.push({id:r.data.user.id,email});await record();
  sql(`insert into public.profiles(id,organization_id,full_name,role_key,status) values(${quote(r.data.user.id)},${quote(name==="b"?orgB:orgA)},${quote("Central QA "+name)},${quote(name==="operator"?"operator":"manager")},'active');`);
  const enabled=await admin.auth.admin.updateUserById(r.data.user.id,{ban_duration:"none"});if(enabled.error)throw Error("Cannot activate owned fixture");
  const client=createClient(base,anon,options);const login=await client.auth.signInWithPassword({email,password});if(login.error)throw Error("Synthetic password login failed");
  if(name!=="aal1"){
   const enrollment=await client.auth.mfa.enroll({factorType:"totp",friendlyName:"Disposable numbering QA"});if(enrollment.error)throw Error("Synthetic enrollment failed");
   const verification=await client.auth.mfa.challengeAndVerify({factorId:enrollment.data.id,code:totp(enrollment.data.totp.secret)});if(verification.error)throw Error("Synthetic MFA failed");
  }
  const s=(await client.auth.getSession()).data.session;users[name].token=s.access_token;users[name].refresh=s.refresh_token;users[name].expires_at=s.expires_at;users[name].client=client;
 }
 sql(`insert into public.financial_institutions(organization_id,name) values(${quote(orgA)},${quote("Central QA Bank "+run)}),(${quote(orgB)},${quote("Central QA Bank "+run)});`);
 if(!staging){
  serve=spawn(process.execPath,[cli,"functions","serve","--workdir",qa,"--env-file",join(qa,"functions.env")],{cwd:root,stdio:["ignore","ignore","ignore"],windowsHide:true});
  let ready=false;for(let i=0;i<45;i++){try{if((await reserve(randomUUID(),date,null)).status===401){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,1000));}if(!ready)throw Error("Local Edge not ready");
 }
 if(fileSync){
  const {runProposalFilesQa}=await import("./qa/proposal-files.mjs");
  await runProposalFilesQa({call,reserve,sql,quote,users,orgA,orgB,run,pass,summary,staging,base,anon,admin});summary.ok=true;
 }else if(legacyClaims){
  const {runLegacyClaimsQa}=await import("./qa/legacy-proposal-number-claims.mjs");
  await runLegacyClaimsQa({call,reserve,sql,quote,users,orgA,orgB,run,pass,summary,staging,base,anon});summary.ok=true;
 }else{
 pass("normal password authentication and independent real MFA sessions");
 for(const [name,status,code]of [["aal1",403,"mfa_required"],["operator",403,"permission_denied"]]){const r=await reserve(randomUUID(),date,users[name]);pass(name+" denied",r.status===status&&r.body.code===code);}
 sql(`delete from auth.sessions where user_id=${quote(users.revoked.id)};`);
 const revoked=await reserve(randomUUID(),date,users.revoked);pass("revoked session denied",[401,403].includes(revoked.status));
 for(const field of ["organization_id","proposal_number","sequence","role","user_id"]){const r=await call("reserve-proposal-number",{sync_id:randomUUID(),created_at:date,[field]:orgB});pass("client "+field+" rejected",r.status===400);}
 const syncA=randomUUID(),syncB=randomUUID();
 const a=await reserve(syncA),b=await reserve(syncB),retry=await reserve(syncA);
 pass("PC A first number",a.status===200&&a.body.proposal_number==="2026-0001");
 pass("PC B next number",b.status===200&&b.body.proposal_number==="2026-0002");
 pass("lost-response retry returns same number",retry.status===200&&retry.body.proposal_number===a.body.proposal_number);
 const before=(await reserve(randomUUID(),"2027-01-01T02:50:00Z")).body;
 const after=(await reserve(randomUUID(),"2027-01-01T03:00:00Z")).body;
 pass("offline Dec31 to January sync keeps Araguaina year",before.proposal_number==="2026-0003"&&after.proposal_number==="2027-0001");
 const independent=await reserve(syncA,date,users.b);pass("independent organization starts at 0001",independent.body.proposal_number==="2026-0001"&&independent.body.organization_id===orgB);
 const ids=Array.from({length:50},()=>randomUUID());
 const settled=await Promise.allSettled(ids.map(id=>reserve(id,date,users.parallel)));
 const parallel=settled.map(r=>r.status==="fulfilled"?r.value:{status:0,body:{code:"transport_unavailable"}});
 summary.concurrent_statuses=parallel.reduce((all,r)=>{const key=String(r.status)+":"+(r.body.code??"ok");all[key]=(all[key]??0)+1;return all;},{});
 await record();
 pass("50 concurrent real HTTP reservations succeed",parallel.every(r=>r.status===200&&r.body.ok));
 const numbers=parallel.map(r=>r.body.proposal_number);
 pass("50 concurrent numbers unique contiguous and do not reuse previous reservations",new Set(numbers).size===50&&numbers.every(n=>Number(n.slice(5))>=4)&&Math.max(...numbers.map(n=>Number(n.slice(5))))===53);
 const retryParallel=await reserve(ids[0],date,users.parallel);pass("concurrent batch retry idempotent",retryParallel.body.proposal_number===numbers[0]);
 const payload={sync_id:syncA,proposal_number:a.body.proposal_number,proponent_name:"Synthetic numbering applicant",created_at:date,updated_at:"2026-10-29T13:00:00.123456Z",created_by_technician_name:"Historical QA creator",responsible_name:"QA responsible",technician_name:"QA technician",bank:"Central QA Bank "+run,purpose:"Synthetic numbering QA",total_value:"100000.00",fno_value:"70000.00",of_value:"30000.00"};
 const mismatch=await call("sync-desktop-proposal",{...payload,proposal_number:b.body.proposal_number});pass("reservation mismatch controlled 409",mismatch.status===409&&mismatch.body.code==="proposal_number_reservation_mismatch");
 const synced=await call("sync-desktop-proposal",payload);pass("reserved identity syncs existing 13-field contract",synced.status===201&&synced.body.result==="created");
 const again=await call("sync-desktop-proposal",payload);pass("full sync retry unchanged",again.status===200&&again.body.result==="unchanged");
 const unreserved=await call("sync-desktop-proposal",{...payload,sync_id:randomUUID(),proposal_number:"2026-0099"});
 pass("unknown historical number is not silently claimed",unreserved.status===409&&unreserved.body.code==="proposal_number_not_reserved");
 const operation=synced.body.operation_id;
 const managed=await users.a.client.rpc("save_proposal_tracking",{p_operation_id:operation,p_expected_version:1,p_values:{approval_status:"pending",approval_deadline:"2026-11-01",delay_notes:"Synthetic QA preserved"}});
 pass("tracking remains web-owned",!managed.error);
 const changed=await call("sync-desktop-proposal",{...payload,updated_at:"2026-10-29T14:00:00Z",total_value:"110000.00"});pass("metadata updates preserve official identity",changed.status===200&&changed.body.result==="updated");
 const stale=await call("sync-desktop-proposal",payload);
 pass("stale payload cannot overwrite newer metadata",stale.status===409&&stale.body.code==="stale_update");
 const data=sql(`select json_build_object('number',o.operation_number,'sync_number',d.desktop_proposal_number,'amount',f.amount::text,'tracking_deadline',t.approval_deadline,'creator',d.created_by_technician_name) data from public.desktop_proposals d join public.operations o on o.id=d.operation_id join public.operation_financials f on f.operation_id=o.id join public.operation_approval_tracking t on t.operation_id=o.id where d.organization_id=${quote(orgA)} and d.sync_id=${quote(syncA)};`)[0];
 const row=data.data??data;
 pass("desktop/operation/financial coherent and tracking preserved",row.number===a.body.proposal_number&&row.sync_number===row.number&&row.amount==="110000.00"&&row.tracking_deadline==="2026-11-01"&&row.creator==="Historical QA creator");
 const hidden=await users.b.client.from("operations").select("id").eq("id",operation);pass("cross-tenant RLS hides operation",!hidden.error&&hidden.data.length===0);
 const direct=await users.a.client.from("proposal_number_reservations").select("*");pass("reservation table cannot be read by user JWT",Boolean(direct.error));
 const rpc=await users.a.client.rpc("reserve_proposal_number",{p_actor_id:users.b.id,p_sync_id:randomUUID(),p_created_at:date});pass("user cannot bypass Edge and impersonate actor",Boolean(rpc.error));
 const audit=sql(`select json_build_object('events',count(*),'safe',bool_and(changes::text !~* 'token|password|secret|total_value|fno_value'),'actors',bool_and(actor_user_id is not null)) data from public.audit_log where organization_id in (${quote(orgA)},${quote(orgB)}) and action='PROPOSAL_NUMBER_RESERVED';`)[0];const audited=audit.data??audit;
 pass("one safe audit per new reservation with actor",audited.events===55&&audited.safe&&audited.actors);
 if(staging){
  const desktop="C:/Dev/SistemaRural/AmazonAgro-Propostas";
  for(const pc of ["a","b"]){
   const input={url:base,key:anon,access_token:users.a.token,refresh_token:users.a.refresh,expires_at:users.a.expires_at,user_id:users.a.id,organization_id:orgA,bank:"Central QA Bank "+run,path:join(desktop,".tmp","central-staging-"+run+"-pc-"+pc)};
   const r=spawnSync(join(desktop,".venv-build/Scripts/python.exe"),[join(desktop,"scripts/qa_central_numbering.py")],{cwd:desktop,input:JSON.stringify(input),encoding:"utf8",timeout:180000,maxBuffer:1000000,windowsHide:true});
   if(r.status!==0)throw Error("Desktop real reservation/sync QA failed (credentials withheld)");
   const result=JSON.parse(r.stdout);pass("desktop PC "+pc+" offline-save/reserve/persist/sync/reopen",result.ok);summary["desktop_"+pc]=result;
  }
  pass("two real desktop databases obtain different official numbers",summary.desktop_a.proposal_number!==summary.desktop_b.proposal_number);
  const ids=[summary.desktop_a.sync_id,summary.desktop_b.sync_id].map(quote).join(",");
  const verified=sql(`select count(*)::integer coherent from public.desktop_proposals d join public.operations o on o.id=d.operation_id join public.operation_financials f on f.operation_id=o.id join public.operation_approval_tracking t on t.operation_id=o.id join public.proposal_number_reservations r on r.organization_id=d.organization_id and r.sync_id=d.sync_id where d.organization_id=${quote(orgA)} and d.sync_id in (${ids}) and d.desktop_proposal_number=r.proposal_number and o.operation_number=r.proposal_number and f.amount=100000 and d.fno_value=70000 and d.of_value=30000;`)[0];
  pass("real desktop receipts operation financial and tracking coherent",verified.coherent===2);
 }
 summary.ok=true;summary.concurrent_numbers=numbers;summary.pc_a_number=a.body.proposal_number;summary.pc_b_number=b.body.proposal_number;
 }
}catch(error){summary.failure=error instanceof assert.AssertionError?error.message:"QA operation failed; no credentials retained";throw error;
}finally{
 // Find only this nonce's owned accounts too, in case an Auth creation response was lost.
 const owned=sql(`select json_build_object('id',id,'email',email) data from auth.users where email like ${quote("qa-central-"+run+"-%@example.invalid")};`);
 for(const item of owned){const u=item.data??item;if(!summary.users.some(v=>v.id===u.id))summary.users.push(u);}
 // Retain immutable reservation/audit evidence only in isolated inactive QA tenants. Retire every owned session.
 if(summary.users.length){
  const ids=summary.users.map(u=>quote(u.id)).join(",");
  sql(`begin; delete from auth.sessions where user_id in (${ids}); update public.profiles set status='inactive' where id in (${ids}) and organization_id in (${quote(orgA)},${quote(orgB)}); update public.organizations set status='inactive' where id in (${quote(orgA)},${quote(orgB)}); commit;`);
  for(const u of summary.users){const r=await admin.auth.admin.updateUserById(u.id,{ban_duration:"876000h"});if(r.error)throw Error("Could not retire owned QA account");}
  summary.fixtures_retired=true;
 }else{sql(`update public.organizations set status='inactive' where id in (${quote(orgA)},${quote(orgB)});`);}
 await record();
 if(serve){serve.kill();spawnSync("docker",["stop","supabase_edge_runtime_"+project],{encoding:"utf8",timeout:30000});}
}
process.stdout.write(`${checks.length} real ${staging?"staging":"local"} Auth/MFA/HTTP checks PASS\n`);
