import assert from "node:assert/strict";
import test from "node:test";
import {createLegacyClaimHandler} from "../supabase/functions/claim-legacy-proposal-number/handler.ts";
const id="d6102900-0000-4000-8000-000000000001";
const token=(aal="aal2")=>[{}, {role:"authenticated",aal}].map(v=>Buffer.from(JSON.stringify(v)).toString("base64url")).join(".")+".test";
function backend(){return {calls:[],async verifyUser(){return {id:"actor"};},async sessionActive(){return true;},
 async profileFor(id){return {id,organization_id:"org",role_key:"manager",status:"active"};},
 async organizationActive(){return true;},async roleActive(){return true;},async hasPermission(r,p){assert.equal(p,"desktop_proposals.sync");return true;},
 async claim(actor,syncId,proposalNumber,createdAt){this.calls.push([actor,syncId,proposalNumber,createdAt]);return {data:{ok:true,sync_id:syncId,organization_id:"org",proposal_number:proposalNumber},error:null};}};}
const body=()=>({sync_id:id,proposal_number:"2026-0015",created_at:"2027-01-01T02:50:00.123456Z"});
const request=(value=body(),headers={})=>new Request("https://qa.invalid/functions/v1/reserve-proposal-number",{method:"POST",headers:{"Content-Type":"application/json",Authorization:"Bearer "+token(),...headers},body:JSON.stringify(value)});
test("strict three-field legacy contract preserves microseconds; backend derives tenant and year",async()=>{const b=backend();const r=await createLegacyClaimHandler(b)(request());assert.equal(r.status,200);assert.deepEqual(b.calls,[["actor",id,body().proposal_number,body().created_at]]);assert.equal(r.headers.get("Cache-Control"),"private, no-store, max-age=0");});
for(const field of ["organization_id","amount","sequence","role","user_id","year","source"]){test("reject client "+field,async()=>{const b=backend();const r=await createLegacyClaimHandler(b)(request({...body(),[field]:"forged"}));assert.equal(r.status,400);assert.equal(b.calls.length,0);});}
for(const value of [null,[],{}, {...body(),sync_id:"bad"},{...body(),sync_id:"d6102900-0000-1000-8000-000000000001"},
 {...body(),created_at:null},...['infinity','2026-02-30T12:00:00Z','2026-01-01','2026-01-01T00:00:00','0000-01-01T00:00:00Z'].map(created_at=>({...body(),created_at}))]){
 test("reject invalid contract "+JSON.stringify(value),async()=>{const b=backend();assert.equal((await createLegacyClaimHandler(b)(request(value))).status,400);assert.equal(b.calls.length,0);});}
for(const [name,change,status,code]of [
 ["missing JWT",b=>b.verifyUser=async()=>null,401,"authentication_required"],
 ["revoked session",b=>b.sessionActive=async()=>false,401,"authentication_required"],
 ["inactive profile",b=>b.profileFor=async()=>null,403,"permission_denied"],
 ["inactive tenant",b=>b.organizationActive=async()=>false,403,"permission_denied"],
 ["inactive role",b=>b.roleActive=async()=>false,403,"permission_denied"],
 ["no permission",b=>b.hasPermission=async()=>false,403,"permission_denied"]])test(name,async()=>{const b=backend();change(b);const r=await createLegacyClaimHandler(b)(request());assert.equal(r.status,status);assert.equal((await r.json()).code,code);assert.equal(b.calls.length,0);});
test("AAL1 returns mfa_required",async()=>{const b=backend();const r=await createLegacyClaimHandler(b)(request(body(),{Authorization:"Bearer "+token("aal1")}));assert.equal(r.status,403);assert.equal((await r.json()).code,"mfa_required");});
for(const [db,status,code]of [["LC409",409,"legacy_proposal_number_conflict"],["LC422",409,"legacy_proposal_year_mismatch"],["DS403",403,"permission_denied"],["DS400",400,"invalid_payload"],["XX000",500,"internal_error"]])test("safe database error "+db,async()=>{const b=backend();b.claim=async()=>({data:null,error:{code:db,message:"private detail"}});const r=await createLegacyClaimHandler(b)(request());assert.equal(r.status,status);const text=await r.text();assert.equal(JSON.parse(text).code,code);assert.ok(!text.includes("private detail"));});
test("bounded body and content type",async()=>{for(const headers of [{"Content-Type":"text/plain"},{}]){const r=await createLegacyClaimHandler(backend())(request({...body(),extra:"X".repeat(2000)},headers));assert.equal(r.status,400);}});
test("CORS uses canonical allowlist; native clients need no Origin",async()=>{const handler=createLegacyClaimHandler(backend(),["https://amazon-agro-staging.vercel.app"]);assert.equal((await handler(request(body(),{Origin:"https://qa.invalid"}))).status,403);const r=await handler(request(body(),{Origin:"https://amazon-agro-staging.vercel.app"}));assert.equal(r.headers.get("Access-Control-Allow-Origin"),"https://amazon-agro-staging.vercel.app");});
test("rate limit bounds repeated reservation calls",async()=>{const handler=createLegacyClaimHandler(backend());for(let i=0;i<60;i++)assert.equal((await handler(request())).status,200);assert.equal((await handler(request())).status,429);});

for(const proposal_number of ["2026-0000","0000-0001","2026-10000","LEGACY/15","2026-15",15,null," 2026-0015"]){test("invalid legacy number "+proposal_number,async()=>{const b=backend();assert.equal((await createLegacyClaimHandler(b)(request({...body(),proposal_number}))).status,400);assert.equal(b.calls.length,0);});}
