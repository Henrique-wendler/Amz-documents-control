import assert from "node:assert/strict";
import test from "node:test";
import {createSyncHandler} from "../supabase/functions/sync-desktop-proposal/handler.ts";
import {validatePayload,validMoney,deliveryHeaders} from "../supabase/functions/sync-desktop-proposal/contract.ts";

const syncId="d6102800-0000-4000-8000-000000000001";
const payload=()=>({sync_id:syncId,proposal_number:"2026-0001",proponent_name:"Synthetic applicant",created_at:"2026-10-28T09:00:00.123456Z",
 updated_at:"2026-10-28T10:00:00.654321Z",created_by_technician_name:"Historical creator",responsible_name:"Responsible QA",
 technician_name:"Technician QA",bank:"Bank QA",purpose:"Purpose QA",total_value:"2000000.00",fno_value:"1500000.00",of_value:"500000.00"});
const token=(aal="aal2")=>[{}, {sub:"b6102800-0000-4000-8000-000000000001",aal,role:"authenticated"}].map(v=>Buffer.from(JSON.stringify(v)).toString("base64url")).join(".")+".synthetic";
function backend(){
 const calls=[];
 return {calls,
  async verifyUser(value){calls.push(["verify",value]);return {id:"verified-actor"};},
  async profileFor(id){calls.push(["profile",id]);return {id,organization_id:"verified-tenant",role_key:"manager",status:"active"};},
  async organizationActive(){return true;},async roleActive(){return true;},async hasPermission(role,permission){calls.push([role,permission]);return true;},
  async sync(actor,body,revision,version){calls.push(["sync",actor,body,revision,version]);return {data:{success:true,ok:true,sync_id:body.sync_id,organization_id:"verified-tenant",operation_id:"operation-qa",remote_version:"1",server_version:"1",remote_updated_at:"2026-10-28T12:00:00Z",result:"created"},error:null};}
 };
}
const request=(body=payload(),headers={},method="POST")=>new Request("https://sync.example.invalid/functions/v1/sync-desktop-proposal",{
 method,headers:{"Content-Type":"application/json",Authorization:"Bearer "+token(),...headers},...(method==="POST"?{body:JSON.stringify(body)}:{})});

test("only the Auth-verified token supplies AAL2, actor and tenant",async()=>{
 const server=backend();const response=await createSyncHandler(server)(request());
 assert.equal(response.status,201);const result=await response.json();assert.equal(result.organization_id,"verified-tenant");
 assert.deepEqual(server.calls[0],["verify",token()]);assert.deepEqual(server.calls[1],["profile","verified-actor"]);
 assert.ok(server.calls.some(v=>v[0]==="manager"&&v[1]==="desktop_proposals.sync"));
 assert.equal(server.calls.find(v=>v[0]==="sync")[1],"verified-actor");
 assert.equal(result.ok,true);assert.equal(result.server_version,result.remote_version);
 assert.ok(!("amount" in result)&&!("approval_status" in result));
});

test("missing or invalid JWT returns the normalized 401",async()=>{
 for(const invalid of ["", "Basic synthetic"]){const server=backend();const response=await createSyncHandler(server)(request(payload(),{Authorization:invalid}));assert.equal(response.status,401);assert.equal((await response.json()).code,"authentication_required");assert.equal(server.calls.length,0);}
 const server=backend();server.verifyUser=async()=>null;const response=await createSyncHandler(server)(request());assert.equal(response.status,401);assert.equal(server.calls.length,0);
});

test("verified privileged JWT roles cannot act as desktop user sessions",async()=>{
 for(const role of ["service_role","supabase_admin","anon"]){
  const server=backend();
  const jwt=[{}, {sub:"verified-actor",aal:"aal2",role}].map(v=>Buffer.from(JSON.stringify(v)).toString("base64url")).join(".")+".synthetic";
  const response=await createSyncHandler(server)(request(payload(),{Authorization:"Bearer "+jwt}));
  assert.equal(response.status,401);assert.equal((await response.json()).code,"authentication_required");
  assert.ok(!server.calls.some(v=>v[0]==="profile"||v[0]==="sync"));
 }
});
test("ill-formed Unicode is rejected before persistence instead of producing a database 500",async()=>{
 for(const text of ["\ud800","\udfff","Name \ud800 end"]){
  const server=backend();const response=await createSyncHandler(server)(request({...payload(),proponent_name:text}));
  assert.equal(response.status,400);assert.equal((await response.json()).code,"invalid_payload");
  assert.ok(!server.calls.some(v=>v[0]==="sync"));
 }
 assert.equal(validatePayload({...payload(),proponent_name:"Nome \ud83c\udf31"}).proponent_name,"Nome \ud83c\udf31");
});

test("AAL1 is rejected before profile or persistence lookup",async()=>{
 const server=backend();const response=await createSyncHandler(server)(request(payload(),{Authorization:"Bearer "+token("aal1")}));
 assert.equal(response.status,403);assert.equal((await response.json()).code,"mfa_required");assert.equal(server.calls.length,1);
});

for(const failed of ["profile","organization","role","permission"]){test(`inactive/unauthorized ${failed} is denied`,async()=>{
 const server=backend();if(failed==="profile")server.profileFor=async()=>null;if(failed==="organization")server.organizationActive=async()=>false;
 if(failed==="role")server.roleActive=async()=>false;if(failed==="permission")server.hasPermission=async()=>false;
 const response=await createSyncHandler(server)(request());assert.equal(response.status,403);assert.equal((await response.json()).code,"permission_denied");assert.ok(!server.calls.some(v=>v[0]==="sync"));
});}

for(const field of ["organization_id","created_by","updated_by","approval_status","approval_deadline","delay_reason","delay_notes","last_follow_up_at","service_role","jwt_secret"]){
 test(`strict payload rejects ${field}`,()=>assert.throws(()=>validatePayload({...payload(),[field]:"spoof"}),/inválidos/));
}
for(const invalid of [1,-1,null,"-1","NaN","Infinity","1e3","1,00","1.001","10000000000000"," 1"]){
 test(`invalid exact money ${String(invalid)}`,()=>assert.equal(validMoney(invalid),false));
}
for(const valid of ["0","0.01","12.3400","9999999999999.99"]){test(`exact money ${valid} has no float conversion`,()=>{
 assert.equal(validMoney(valid),true);assert.equal(validatePayload({...payload(),total_value:valid}).total_value,valid);
});}
for(const timestamp of ["2026-02-30T10:00:00Z","2026-10-28","2026-10-28T24:00:00Z","infinity","2026-10-28T10:00:00"]){
 test(`invalid timestamp ${timestamp}`,()=>assert.throws(()=>validatePayload({...payload(),updated_at:timestamp}),/inválidos/));
}
test("legacy unknown dates and partially filled draft metadata are preserved",()=>{
 const value={...payload(),created_at:null,updated_at:null,created_by_technician_name:null,proponent_name:"",purpose:"",responsible_name:"",technician_name:"",total_value:"0",fno_value:"0",of_value:"0"};
 assert.deepEqual(validatePayload(value),value);
 assert.equal(validatePayload(payload()).updated_at,"2026-10-28T10:00:00.654321Z");
});
test("UUID, key presence and text bounds are strict",()=>{
 for(const change of [{sync_id:"invalid"},{sync_id:"d6102800-0000-1000-8000-000000000001"},{bank:""},{proposal_number:""},{proponent_name:"x".repeat(201)},{purpose:"hidden\ncontrol"}])assert.throws(()=>validatePayload({...payload(),...change}));
 const value=payload();delete value.total_value;assert.throws(()=>validatePayload(value));
});
test("headers preserve exact revisions and compare-and-set version",()=>{
 assert.deepEqual(deliveryHeaders(new Headers({"X-Payload-Version":"1","X-Desktop-Revision":"9007199254740993","If-Match":"2","Idempotency-Key":syncId+":9007199254740993"}),syncId),{revision:"9007199254740993",expectedVersion:"2"});
 for(const headers of [{"X-Payload-Version":"2"},{"X-Desktop-Revision":"0"},{"X-Desktop-Revision":"1","Idempotency-Key":"wrong"},{"If-Match":"*"},{"X-Desktop-Revision":"9223372036854775808"}])assert.throws(()=>deliveryHeaders(new Headers(headers),syncId));
});
for(const [databaseCode,status,code]of[["DS400",400,"invalid_payload"],["DS403",403,"permission_denied"],["DS404",404,"institution_not_found"],["DS409",409,"domain_conflict"],["XX000",500,"internal_error"]]){
 test(`database ${databaseCode} is sanitized`,async()=>{const server=backend();server.sync=async()=>({data:null,error:{code:databaseCode,message:"SYNTHETIC_SQL_SECRET"}});const response=await createSyncHandler(server)(request());assert.equal(response.status,status);const text=await response.text();assert.equal(JSON.parse(text).code,code);assert.ok(!text.includes("SYNTHETIC_SQL_SECRET"));});
}
test("stale returns 409 so the phase 1 desktop cannot falsely mark it synced",async()=>{
 const server=backend();server.sync=async()=>({data:{result:"stale",success:false,ok:false,sync_id:syncId},error:null});
 const response=await createSyncHandler(server)(request());assert.equal(response.status,409);assert.equal((await response.json()).code,"stale_update");
});
test("method, content type and byte limit are controlled",async()=>{
 const handler=createSyncHandler(backend());assert.equal((await handler(request(null,{},"GET"))).status,405);
 assert.equal((await handler(request(payload(),{"Content-Type":"text/plain"}))).status,400);
 assert.equal((await handler(request({text:"x".repeat(17000)}))).status,400);
});
test("CORS allows only explicit browser origins and native clients need none",async()=>{
 const handler=createSyncHandler(backend(),["https://desktop-qa.example.invalid"]);
 assert.equal((await handler(request(payload(),{Origin:"https://other.example.invalid"}))).status,403);
 const response=await handler(request(null,{Origin:"https://desktop-qa.example.invalid"},"OPTIONS"));
 assert.equal(response.status,204);assert.equal(response.headers.get("Access-Control-Allow-Origin"),"https://desktop-qa.example.invalid");
 assert.equal((await handler(request())).status,201);
});
