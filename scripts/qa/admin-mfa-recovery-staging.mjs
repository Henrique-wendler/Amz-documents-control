// Explicit opt-in, approved staging only. All credentials and test seeds stay in memory.
import assert from "node:assert/strict";
import {randomBytes,randomUUID,createHmac} from "node:crypto";
import {spawnSync} from "node:child_process";
import {mkdir,writeFile} from "node:fs/promises";
import {createClient} from "@supabase/supabase-js";
if(process.argv.slice(2).join(" ")!=="--staging") throw Error("Explicit --staging is required");
const project="iglciwizbxtkfwlboihe",url=`https://${project}.supabase.co`,runId=Date.now().toString(36),organization=randomUUID(),foreignOrganization=randomUUID();
const folder=".tmp/admin-mfa-recovery",users={},checks=[],secrets=[];
let seeded=false,step="initialization",admin,publicKey;
const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}};
function cli(args){const r=spawnSync(process.execPath,["node_modules/supabase/dist/supabase.js",...args,"--output","json"],{encoding:"utf8",timeout:90000,maxBuffer:8e6});if(r.status!==0)throw Error("Scoped CLI request failed");return JSON.parse(r.stdout);}
const query=sql=>cli(["db","query","--linked","--project-ref",project,sql]).rows;
const quoted=value=>"'"+String(value).replaceAll("'","''")+"'";
const pass=(name,value)=>{assert.ok(value,name);checks.push({name,pass:true});console.log("PASS "+name);};
const checked=async(promise)=>{const r=await promise;if(r.error)throw Error("Synthetic Auth request failed");return r.data;};
function totp(seed){let bits="";for(const c of seed.replace(/=+$/,""))bits+="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".indexOf(c).toString(2).padStart(5,"0");const key=Buffer.from((bits.match(/.{8}/g)??[]).map(v=>parseInt(v,2)));const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(Date.now()/30000)));const digest=createHmac("sha1",key).update(counter).digest();return String((digest.readUInt32BE(digest[19]&15)&0x7fffffff)%1e6).padStart(6,"0");}
async function login(label){const user=users[label];user.client=createClient(url,publicKey,options);const data=await checked(user.client.auth.signInWithPassword({email:user.email,password:user.password}));secrets.push(data.session.access_token,data.session.refresh_token);return data.session;}
async function enroll(label,name){const user=users[label],factor=await checked(user.client.auth.mfa.enroll({factorType:"totp",friendlyName:`MfaRecoveryQa-${runId}-${name}`}));secrets.push(factor.totp.secret);await checked(user.client.auth.mfa.challengeAndVerify({factorId:factor.id,code:totp(factor.totp.secret)}));const session=(await checked(user.client.auth.getSession())).session;secrets.push(session.access_token,session.refresh_token);return {factor,session};}
async function invoke(label,body,token){const access=token??(await checked(users[label].client.auth.getSession())).session.access_token;const response=await fetch(url+"/functions/v1/admin-users",{method:"POST",headers:{apikey:publicKey,Authorization:"Bearer "+access,"Content-Type":"application/json"},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});return {status:response.status,body:await response.json()};}
const reset=(label,targetId)=>invoke(label,{action:"reset_mfa",targetId});
const snapshot=()=>query(`select md5(to_jsonb(p)::text)as profile_hash from public.profiles p where id=${quoted(users.target.id)}`)[0].profile_hash;
try{
 await mkdir(folder,{recursive:true});
 const history=query("select max(version)as version,count(*)::int as count from supabase_migrations.schema_migrations")[0];assert.equal(history.version,"202610290025");assert.equal(history.count,25);
 const keys=cli(["projects","api-keys","--project-ref",project]);publicKey=keys.find(v=>v.name==="anon").api_key;admin=createClient(url,keys.find(v=>v.name==="service_role").api_key,options);
 const managerHasPermission=query("select exists(select 1 from public.role_permissions where role_key='manager' and permission_key='users.manage')as allowed")[0].allowed;
 const managerRole=managerHasPermission?"manager":"qa_mfa_manager_"+runId;
 for(const label of ["admin","manager","target","denied","foreign"]){
  step="provision "+label;const email=`qa-mfa-recovery-${runId}-${label}@example.invalid`,password=randomBytes(30).toString("base64url")+"aA9!";
  const data=await checked(admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:"Synthetic MFA "+label}}));users[label]={id:data.user.id,email,password};secrets.push(password);
 }
 query(`begin;insert into public.organizations(id,legal_name)values(${quoted(organization)},${quoted("QA MFA Recovery "+runId)}),(${quoted(foreignOrganization)},${quoted("QA MFA Recovery Other "+runId)});
 ${managerHasPermission?"":`insert into public.roles(role_key,name)values(${quoted(managerRole)},'QA MFA manager');insert into public.role_permissions(role_key,permission_key)values(${quoted(managerRole)},'users.manage');`}
 insert into public.profiles(id,organization_id,full_name,role_key)values
 ${Object.entries(users).map(([label,user])=>`(${quoted(user.id)},${quoted(label==="foreign"?foreignOrganization:organization)},${quoted("Synthetic MFA "+label)},${quoted(label==="admin"||label==="target"?"admin":label==="manager"?managerRole:"operator")})`).join(",")};commit;`);seeded=true;
 step="authenticate actors";const aal1=await login("admin");
 let result=await invoke("admin",{action:"reset_mfa",targetId:users.target.id},aal1.access_token);pass("AAL1 denied as mfa_required",result.status===403&&result.body.code==="mfa_required");
 await enroll("admin","actor");await login("manager");await enroll("manager","actor");await login("denied");await enroll("denied","actor");
 await login("target");const first=await enroll("target","first");const originalProfile=snapshot();
 result=await reset("denied",users.target.id);pass("operator without users.manage denied",result.status===403&&result.body.code==="forbidden");
 result=await reset("admin",users.foreign.id);pass("cross-tenant target is sanitized 404",result.status===404&&result.body.code==="not_found");
 result=await reset("admin",randomUUID());pass("nonexistent target is sanitized 404",result.status===404&&result.body.code==="not_found");
 result=await invoke("admin",{action:"reset_mfa",targetId:users.target.id,organization_id:foreignOrganization});pass("client organization rejected",result.status===400);
 step="single factor reset";result=await reset("admin",users.target.id);pass("admin AAL2 removes one factor",result.status===200&&result.body.removedFactors===1);
 const oldClient=createClient(url,publicKey,{...options,global:{headers:{Authorization:"Bearer "+first.session.access_token}}});
 const oldPermissions=await oldClient.rpc("current_user_permissions");pass("old signed AAL2 JWT has no business permissions",Boolean(oldPermissions.error)||oldPermissions.data.length===0);
 const oldAuth=await users.target.client.auth.refreshSession({refresh_token:first.session.refresh_token});pass("old target refresh is invalid",Boolean(oldAuth.error));
 pass("actor session remains AAL2",(await checked(users.admin.client.auth.mfa.getAuthenticatorAssuranceLevel())).currentLevel==="aal2");
 pass("target profile role and organization unchanged",snapshot()===originalProfile);
 const fresh=await login("target");const factors=await checked(users.target.client.auth.mfa.listFactors());pass("normal target login returns AAL1 and enrollment",(await checked(users.target.client.auth.mfa.getAuthenticatorAssuranceLevel())).currentLevel==="aal1"&&!factors.totp.some(f=>f.status==="verified"));
 const second=await enroll("target","new");pass("new enrollment has a fresh seed and verifies to AAL2",first.factor.totp.secret!==second.factor.totp.secret&&(await checked(users.target.client.auth.mfa.getAuthenticatorAssuranceLevel())).currentLevel==="aal2");
 await enroll("target","additional");const stale=await checked(users.target.client.auth.mfa.enroll({factorType:"totp",friendlyName:`MfaRecoveryQa-${runId}-stale`}));secrets.push(stale.totp.secret);
 step="multiple factor manager reset";result=await reset("manager",users.target.id);pass("manager with real users.manage removes all three factors",result.status===200&&result.body.removedFactors===3);
 result=await reset("manager",users.target.id);pass("zero factors is controlled and idempotent",result.status===200&&result.body.removedFactors===0);
 const remaining=await checked(admin.auth.admin.mfa.listFactors({userId:users.target.id}));pass("no target factors remain",remaining.factors.length===0);
 const rows=query(`select actor_user_id,entity_id,organization_id,action,changes,context,created_at from public.audit_log where organization_id=${quoted(organization)}and action='USER_MFA_RESET' order by created_at`);
 pass("all resets audited with exact counts and actor",rows.length===3&&rows.map(r=>r.changes.removed_factor_count.new).join(",")==="1,3,0"&&rows[0].actor_user_id===users.admin.id&&rows[1].actor_user_id===users.manager.id&&rows.every(r=>r.entity_id===users.target.id&&r.organization_id===organization));
 pass("audit and responses contain no credentials",secrets.every(s=>!JSON.stringify(rows).includes(s)&&!JSON.stringify(result.body).includes(s))&&!JSON.stringify(rows).includes("factor_id"));
 const sessionCounts=query(`select(select count(*)::int from auth.sessions where user_id=${quoted(users.target.id)})as target,(select count(*)::int from auth.sessions where user_id=${quoted(users.admin.id)}and aal='aal2')as actor`)[0];pass("target sessions are zero; executor session preserved",sessionCounts.target===0&&sessionCounts.actor>0);
 result=await invoke("manager",{action:"list"});pass("manager can still administer after recovery",result.status===200&&result.body.users.every(u=>!u.factors&&!u.factor_id&&!u.totp_secret));
 pass("no cross-tenant user returned",!result.body.users.some(u=>u.id===users.foreign.id));
 const orphan=query(`select count(*)::int as count from public.profiles p left join public.organizations o on o.id=p.organization_id left join auth.users u on u.id=p.id where p.organization_id in(${quoted(organization)},${quoted(foreignOrganization)})and(o.id is null or u.id is null)`)[0].count;pass("synthetic relational integrity preserved",orphan===0);
 const report={ok:true,project_ref:project,run_id:runId,organization_id:organization,foreign_organization_id:foreignOrganization,manager_role:managerRole,checks:checks.length,results:checks};
 await writeFile(`${folder}/staging-${runId}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({ok:true,checks:checks.length,report:`${folder}/staging-${runId}.json`}));
}catch{console.error("Staging QA failed safely at: "+step);process.exitCode=1;
}finally{
 if(seeded){try{query(`begin;update public.profiles set status='inactive' where organization_id in(${quoted(organization)},${quoted(foreignOrganization)})and id<>${quoted(users.admin.id)};update public.organizations set status='inactive' where id in(${quoted(organization)},${quoted(foreignOrganization)});commit;`);}catch{console.error("Synthetic profile retirement needs review");process.exitCode=1;}}
 let retired=0;
 if(admin)for(const user of Object.values(users)){if(!user.email.startsWith(`qa-mfa-recovery-${runId}-`))throw Error("Unsafe cleanup identity");const r=await admin.auth.admin.updateUserById(user.id,{ban_duration:"876000h"});if(r.error){console.error("Synthetic Auth retirement needs review");process.exitCode=1;}else retired++;}
 await writeFile(`${folder}/cleanup-${runId}.json`,JSON.stringify({project_ref:project,organization_id:organization,technical_accounts_retired:retired,synthetic_evidence_retained:true},null,2));
}
