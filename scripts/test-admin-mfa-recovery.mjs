import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import {verifiedJwtHasAal2} from "../supabase/functions/_shared/verifiedJwtAal.ts";

// Execute the actual Edge entrypoint with an in-memory Deno/SDK boundary.
// AST removal changes only imports; all HTTP authorization/workflow code runs.
const source=await readFile(new URL("../supabase/functions/admin-users/index.ts",import.meta.url),"utf8");
const stripped=ts.createPrinter().printFile(ts.transform(ts.createSourceFile("index.ts",source,ts.ScriptTarget.Latest,true),[context=>node=>ts.visitNode(node,function visit(n){return ts.isImportDeclaration(n)?undefined:ts.visitEachChild(n,visit,context);})]).transformed[0]);
const code=ts.transpileModule(stripped,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext},transformers:{before:[context=>node=>ts.visitNode(node,function visit(n){return ts.isImportDeclaration(n)?undefined:ts.visitEachChild(n,visit,context);})]}}).outputText.replace(/export \{\};?\s*$/m, "");
const actorId="b6102900-0000-4000-8000-000000000001",targetId="b6102900-0000-4000-8000-000000000002",org="a6102900-0000-4000-8000-000000000001";
const token=(aal="aal2")=>[{}, {sub:actorId,aal,role:"authenticated"}].map(v=>Buffer.from(JSON.stringify(v)).toString("base64url")).join(".")+".synthetic";
const factor=(id,status="verified")=>({id,factor_type:"totp",status,secret:"NEVER_RETURN_FACTOR_SECRET"});
function fixture(options={}){
 const state={permission:true,sessionLive:true,actorActive:true,organizationActive:true,roleActive:true,targetExists:true,authTargetExists:true,sameTenant:true,role:"admin",factors:[factor("factor-one")],deleted:[],audit:[],calls:[],...options};
 const profile={id:actorId,organization_id:org,role_key:state.role,status:state.actorActive?"active":"inactive"};
 const target={id:targetId,organization_id:state.sameTenant?org:"a6102900-0000-4000-8000-000000000002",role_key:"admin",status:"active",full_name:"Synthetic target"};
 class Query{
  constructor(table){this.table=table;this.filters={};}
  select(){return this;} eq(k,v){this.filters[k]=v;return this;} is(){return this;} order(){return this;}
  async maybeSingle(){
   state.calls.push([this.table,{...this.filters}]);
   let data=this.table==="profiles"?(this.filters.id===actorId?profile:state.targetExists?target:null)
    :this.table==="organizations"?(state.organizationActive?{id:org,status:"active"}:null)
    :this.table==="roles"?(state.roleActive?{role_key:state.role,status:"active"}:null)
    :this.table==="role_permissions"?(state.permission?{permission_key:"users.manage",role_key:state.role}:null):null;
   if(data&&Object.entries(this.filters).some(([key,value])=>data[key]!==value)) data=null;
   return {data,error:null};
  }
  then(resolve,reject){return Promise.resolve({data:this.table==="profiles"?[target]:[{role_key:state.role,name:"Role"}],error:null}).then(resolve,reject);}
 }
 const admin={from:table=>new Query(table),rpc:async(name,args)=>{
  state.audit.push({name,args});return state.auditFailure?{error:{message:"PRIVATE_DATABASE_DETAIL"}}:{data:"audit-id",error:null};
 },auth:{getUser:async value=>{state.calls.push(["verify",value]);return {data:{user:state.invalidJwt?null:{id:actorId,role:"authenticated"}},error:null};},admin:{
  getUserById:async()=>({data:{user:state.authTargetExists?{id:targetId,email:"target@example.invalid"}:null},error:null}),
  listUsers:async()=>({data:{users:[{id:targetId,email:"target@example.invalid"}]},error:null}),
  mfa:{listFactors:async({userId})=>{state.calls.push(["factors",userId]);return {data:{factors:[...state.factors]},error:null};},
   deleteFactor:async({userId,id})=>{if(state.failDeleteAt===state.deleted.length+1)return {error:{message:"PRIVATE_AUTH_DETAIL"}};state.deleted.push({userId,id});state.factors=state.factors.filter(f=>f.id!==id);return {error:null};}}
 }}};
 const user={rpc:async(name)=>{assert.equal(name,"current_user_permissions");return {data:state.permission&&state.sessionLive?[{permission_key:"users.manage"}]:[],error:null};}};
 let handler;
 vm.runInNewContext(code,{createClient:(_url,_key,options)=>options.global?user:admin,verifiedJwtHasAal2,
  Deno:{env:{get:key=>({SUPABASE_URL:"https://staging.example.invalid",SUPABASE_SERVICE_ROLE_KEY:"SERVER_ONLY_SYNTHETIC"}[key])},serve:value=>handler=value},
  Request,Response,Headers,URL,atob,console,Date,Map,Set});
 const invoke=async(body={action:"reset_mfa",targetId},aal="aal2",authorization=true)=>{
  const response=await handler(new Request("https://staging.example.invalid/functions/v1/admin-users",{method:"POST",headers:{"Content-Type":"application/json",...(authorization?{Authorization:"Bearer "+token(aal)}:{})},body:JSON.stringify(body)}));
  return {status:response.status,body:await response.json()};
 };
 return {state,invoke};
}
for(const role of ["admin","manager","custom_manager"]){test(`${role}: permission and AAL2 authorize independently of role name`,async()=>{
 const {invoke,state}=fixture({role});const r=await invoke();assert.equal(r.status,200);assert.equal(r.body.removedFactors,1);assert.deepEqual(state.deleted,[{userId:targetId,id:"factor-one"}]);
 assert.deepEqual(JSON.parse(JSON.stringify(state.audit)),[{name:"complete_user_mfa_reset",args:{p_actor_user_id:actorId,p_target_user_id:targetId,p_removed_factor_count:1,p_outcome:"complete"}}]);
});}
test("AAL1 is denied before profile, factor or audit access",async()=>{const{invoke,state}=fixture();const r=await invoke(undefined,"aal1");assert.equal(r.status,403);assert.equal(r.body.code,"mfa_required");assert.equal(state.calls.length,1);assert.equal(state.audit.length,0);});
for(const options of [{permission:false},{sessionLive:false},{actorActive:false},{organizationActive:false},{roleActive:false}])test(`authorization fails closed ${JSON.stringify(options)}`,async()=>{const{invoke,state}=fixture(options);assert.equal((await invoke()).status,403);assert.equal(state.deleted.length,0);});
test("missing and invalid JWT cannot perform recovery",async()=>{for(const mode of [true,false]){const{invoke,state}=fixture({invalidJwt:true});assert.equal((await invoke(undefined,"aal2",mode)).status,401);assert.equal(state.deleted.length,0);}});
for(const options of [{sameTenant:false},{targetExists:false},{authTargetExists:false}])test(`target unavailable is sanitized ${JSON.stringify(options)}`,async()=>{const{invoke,state}=fixture(options);const r=await invoke();assert.equal(r.status,404);assert.equal(r.body.code,"not_found");assert.equal(state.deleted.length,0);assert.equal(state.audit.length,0);});
for(const key of ["organization_id","organizationId","role","permission","roleKey","factorId"])test(`payload cannot choose ${key}`,async()=>{const{invoke,state}=fixture();const r=await invoke({action:"reset_mfa",targetId,[key]:"spoof"});assert.equal(r.status,400);assert.equal(state.deleted.length,0);});
for(const count of [0,1,3])test(`${count} factors: controlled idempotent completion`,async()=>{const{invoke,state}=fixture({factors:Array.from({length:count},(_,i)=>factor("factor-"+i,i===0?"unverified":"verified"))});const r=await invoke();assert.equal(r.status,200);assert.equal(r.body.removedFactors,count);assert.equal(state.factors.length,0);assert.equal(state.audit[0].args.p_removed_factor_count,count);const again=await invoke();assert.equal(again.body.removedFactors,0);});
test("self-reset is denied to preserve executor AAL2; no last-admin count rule",async()=>{const{invoke,state}=fixture();const r=await invoke({action:"reset_mfa",targetId:actorId});assert.equal(r.status,409);assert.equal(r.body.code,"self_mfa_reset");assert.equal(state.deleted.length,0);});
test("response and audit never contain factor identifiers, secrets or server key",async()=>{const{invoke,state}=fixture();const result=JSON.stringify((await invoke()).body)+JSON.stringify(state.audit);for(const sensitive of ["factor-one","NEVER_RETURN_FACTOR_SECRET","SERVER_ONLY_SYNTHETIC"])assert.ok(!result.includes(sensitive));});
test("partial Auth deletion revokes/audits exact success count and never reports success",async()=>{const{invoke,state}=fixture({factors:[factor("one"),factor("two")],failDeleteAt:2});const r=await invoke();assert.equal(r.status,502);assert.equal(r.body.code,"mfa_reset_incomplete");assert.equal(state.audit[0].args.p_removed_factor_count,1);assert.equal(state.audit[0].args.p_outcome,"partial");assert.ok(!JSON.stringify(r.body).includes("PRIVATE_AUTH_DETAIL"));});
test("audit failure is explicit and sanitized",async()=>{const{invoke}=fixture({auditFailure:true});const r=await invoke();assert.equal(r.status,500);assert.equal(r.body.code,"audit_failed");assert.ok(!JSON.stringify(r.body).includes("PRIVATE_DATABASE_DETAIL"));});
test("list distinguishes verified MFA from stale factors without returning factor data",async()=>{const{invoke}=fixture({factors:[factor("stale","unverified")]});const r=await invoke({action:"list"});assert.equal(r.status,200);assert.equal(r.body.users[0].mfa_configured,false);assert.equal(r.body.users[0].mfa_has_factors,true);assert.ok(!JSON.stringify(r.body).includes("stale"));});
