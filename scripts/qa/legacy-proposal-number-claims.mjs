import {randomUUID} from "node:crypto";
import {spawnSync} from "node:child_process";
import {join} from "node:path";

export async function runLegacyClaimsQa({call,reserve,sql,quote,users,orgA,orgB,run,pass,summary,staging,base,anon}){
 const date="2026-10-29T12:00:00Z";
 const claim=(sync_id,proposal_number="2026-0015",created_at=date,user=users.a)=>call("claim-legacy-proposal-number",{sync_id,proposal_number,created_at},user);
 for(const[name,status,code]of[["aal1",403,"mfa_required"],["operator",403,"permission_denied"]]){
  const r=await claim(randomUUID(),"2026-0015",date,users[name]);pass("legacy "+name+" denied",r.status===status&&r.body.code===code);
 }
 sql(`delete from auth.sessions where user_id=${quote(users.revoked.id)};`);
 pass("legacy revoked session denied",[401,403].includes((await claim(randomUUID(),"2026-0015",date,users.revoked)).status));
 for(const field of ["organization_id","user_id","role","sequence"]){const r=await call("claim-legacy-proposal-number",{sync_id:randomUUID(),proposal_number:"2026-0015",created_at:date,[field]:orgB});pass("claim rejects untrusted "+field,r.status===400);}
 const a=randomUUID(),b=randomUUID();
 const first=await claim(a);pass("PC A claims exact free legacy 0015",first.status===200&&first.body.proposal_number==="2026-0015");
 pass("same proposal copied to PC B is idempotent",(await claim(a)).body.proposal_number==="2026-0015");
 const conflict=await claim(b);pass("different PC UUID cannot take same number",conflict.status===409&&conflict.body.code==="legacy_proposal_number_conflict");
 const different=await claim(a,"2026-0016");pass("same UUID cannot change historical number",different.status===409&&different.body.code==="legacy_proposal_number_conflict");
 const other=await claim(b,"2026-0015",date,users.b);pass("same number isolated in second tenant",other.status===200&&other.body.organization_id===orgB);
 for(const number of ["LEGACY/15","2026-10000","2026-0000"]){const r=await claim(randomUUID(),number);pass("invalid legacy "+number+" rejected",r.status===400);}
 const year=await claim(randomUUID(),"2027-0015");pass("incompatible year needs manual review",year.status===409&&year.body.code==="legacy_proposal_year_mismatch");
 const high=await claim(randomUUID(),"2026-0087");pass("higher legacy claim accepted",high.status===200);
 const next=await reserve(randomUUID());pass("next central number follows 0087",next.body.proposal_number==="2026-0088");
 const low=await claim(randomUUID(),"2026-0030");pass("lower historical claim does not lower sequence",low.status===200&&(await reserve(randomUUID())).body.proposal_number==="2026-0089");
 const occupied=await claim(randomUUID(),next.body.proposal_number);pass("existing central reservation cannot be stolen",occupied.status===409&&occupied.body.code==="legacy_proposal_number_conflict");
 const ids=Array.from({length:50},()=>randomUUID());
 const settled=await Promise.allSettled(ids.map((id,i)=>claim(id,`2030-${String(i+1).padStart(4,"0")}`,"2030-06-01T12:00:00Z",users.parallel)));
 const results=settled.map(r=>r.status==="fulfilled"?r.value:{status:0,body:{code:"transport_unavailable"}});
 summary.claim_statuses=results.reduce((a,r)=>{const k=r.status+":"+(r.body.code??"ok");a[k]=(a[k]??0)+1;return a;},{});
 pass("50 concurrent distinct legacy claims succeed",results.every(r=>r.status===200));
 pass("50 claims preserve exact distinct historical numbers",new Set(results.map(r=>r.body.proposal_number)).size===50&&results.every((r,i)=>r.body.proposal_number===`2030-${String(i+1).padStart(4,"0")}`));
 const raceIds=[randomUUID(),randomUUID()];
 const raced=await Promise.all(raceIds.map(id=>claim(id,"2031-0015","2031-06-01T12:00:00Z")));
 pass("two UUIDs racing for same number have exactly one winner",raced.filter(r=>r.status===200).length===1&&raced.filter(r=>r.status===409&&r.body.code==="legacy_proposal_number_conflict").length===1);
 const winner=raced[0].status===200?raceIds[0]:raceIds[1];
 pass("race winner retries same reservation",(await claim(winner,"2031-0015","2031-06-01T12:00:00Z")).status===200);
 const clone=randomUUID();
 const copied=await Promise.all([claim(clone,"2032-0015","2032-06-01T12:00:00Z"),claim(clone,"2032-0015","2032-06-01T12:00:00Z")]);
 pass("concurrent copies with same UUID return same number",copied.every(r=>r.status===200&&r.body.proposal_number==="2032-0015"));
 const payload={sync_id:a,proposal_number:"2026-0015",proponent_name:"Synthetic legacy applicant",created_at:date,updated_at:"2026-10-29T13:00:00Z",created_by_technician_name:"Original creator",responsible_name:"Gustavo",technician_name:"Andre",bank:"Central QA Bank "+run,purpose:"Legacy QA",total_value:"100000.00",fno_value:"70000.00",of_value:"30000.00"};
 const sync=await call("sync-desktop-proposal",payload);pass("legacy claim followed by normal sync",sync.status===201&&sync.body.result==="created");
 pass("copied proposal does not create second operation",(await call("sync-desktop-proposal",payload)).body.result==="unchanged");
 pass("already synchronized proposal can repeat claim",(await claim(a)).status===200);
 const hidden=await users.b.client.from("operations").select("id").eq("id",sync.body.operation_id);pass("legacy operation hidden cross tenant",!hidden.error&&hidden.data.length===0);
 const direct=await users.a.client.rpc("claim_legacy_proposal_number",{p_actor_id:users.b.id,p_sync_id:randomUUID(),p_proposal_number:"2026-0015",p_created_at:date});pass("direct RPC impersonation denied",Boolean(direct.error));
 const table=await users.a.client.from("proposal_number_reservations").select("*");pass("legacy reservation direct read denied",Boolean(table.error));
 const audit=sql(`select json_build_object('events',count(*),'safe',bool_and(changes::text !~* 'token|password|secret|total_value|fno_value'),'actors',bool_and(actor_user_id is not null)) data from public.audit_log where organization_id in (${quote(orgA)},${quote(orgB)}) and action='PROPOSAL_LEGACY_NUMBER_CLAIMED';`)[0];const safe=audit.data??audit;
 pass("claims audited once per identity without financial or secret data",safe.events===56&&safe.safe&&safe.actors);
 const origin=sql(`select json_build_object('canonical',count(*),'number',min(d.desktop_proposal_number),'creator',min(d.created_by_technician_name),'responsible',min(d.responsible_name),'technician',min(d.technician_name)) data from public.desktop_proposals d where d.organization_id=${quote(orgA)} and d.sync_id=${quote(a)};`)[0];const saved=origin.data??origin;
 pass("one canonical identity preserves creator and separate responsible technician",saved.canonical===1&&saved.number==="2026-0015"&&saved.creator==="Original creator"&&saved.responsible==="Gustavo"&&saved.technician==="Andre");
 if(staging){
  const desktop="C:/Dev/SistemaRural/AmazonAgro-Propostas",path=join(desktop,".tmp","legacy-staging-"+run);
  function probe(input){const r=spawnSync(join(desktop,".venv-build/Scripts/python.exe"),[join(desktop,"scripts/qa_legacy_numbering.py")],{cwd:desktop,input:JSON.stringify(input),encoding:"utf8",timeout:180000,maxBuffer:1000000,windowsHide:true});if(r.status!==0)throw Error("Legacy desktop QA failed; credentials withheld");const value=JSON.parse(r.stdout);if(!value.ok)throw Error("Legacy desktop probe failed");return value;}
  const credentials={url:base,key:anon,access_token:users.a.token,refresh_token:users.a.refresh,expires_at:users.a.expires_at,user_id:users.a.id,organization_id:orgA};
  const initial=probe({action:"prepare",path,bank:"Central QA Bank "+run});
  pass("two historical SQLite copies prepared and inventoried",initial.inventory_ok);summary.desktop_identity={sync_id:initial.sync_id,proposal_number:initial.proposal_number};
  for(const pc of [path,initial.copy_path]){const r=probe({...credentials,action:"claim",path:pc});pass("desktop explicit legacy claim leaves database byte-for-byte unchanged",r.database_unchanged);}
  for(const pc of [path,initial.copy_path]){const r=probe({...credentials,action:"sync",path:pc});pass("desktop restart sync preserves full history snapshots participants and parcels",r.history_unchanged&&r.sqlite_integrity==="ok");}
  pass("central sequence follows imported desktop 0900",(await reserve(randomUUID())).body.proposal_number==="2026-0901");
 }
 summary.legacy_claims_ok=true;summary.first_claim_number=first.body.proposal_number;
}
