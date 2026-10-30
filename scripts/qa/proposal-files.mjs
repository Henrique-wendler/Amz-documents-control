import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {join} from 'node:path';
import {readFile} from 'node:fs/promises';
import {pdf,xlsx,hash} from './proposal-file-fixtures.mjs';

export async function runProposalFilesQa(ctx){
 const {call,reserve,sql,quote:q,users,orgA,orgB,run,pass,summary,staging,base,anon,admin}=ctx;
 const mime={pdf:'application/pdf',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
 const row=values=>values[0]?.data??values[0];
 // The isolated CLI Edge runtime signs its internal Kong address. Translate only that exact local fixture origin.
 const capability=value=>{
  const url=new URL(value);
  if(!staging&&url.origin==='http://kong:8000'){const host=new URL(base);url.host=host.host;url.protocol=host.protocol;}
  assert.equal(url.origin,base);
  return url.toString();
 };
 const preserved=()=>row(sql(`select json_build_object('desktop',coalesce(md5((jsonb_agg(to_jsonb(d) order by id))::text),'empty')) data from public.desktop_proposals d where organization_id not in (${q(orgA)},${q(orgB)});`));
 const before=preserved();
 let files=[],syncId,operation,desktopInput;
 async function upload(prepared,bytes,contentType){
  assert.equal(prepared.organization_id,orgA);assert.equal(prepared.storage_bucket,'proposal-files');
  const u=new URL(capability(prepared.signed_upload_url));
  assert.equal(u.origin,base);assert.equal(u.pathname,'/storage/v1/object/upload/sign/proposal-files/'+prepared.storage_path);
  const r=await fetch(u,{method:'PUT',headers:{'Content-Type':contentType,'x-upsert':'false'},body:bytes,signal:AbortSignal.timeout(45000),redirect:'error'});
  assert.ok(r.ok,'direct signed binary PUT succeeds');
 }
 async function prepare(bytes,kind,changes={}){
  return call('proposal-files',{action:'prepare',sync_id:syncId,file_kind:kind,sha256:hash(bytes),size_bytes:bytes.length,mime_type:mime[kind],original_filename:'synthetic.'+kind,...changes});
 }
 async function complete(prepared){return call('proposal-files',{action:'complete',upload_id:prepared.upload_id});}
 async function generated(bytes,kind){
  const prepared=await prepare(bytes,kind);assert.equal(prepared.status,200);
  if(prepared.body.signed_upload_url)await upload(prepared.body,bytes,mime[kind]);
  const done=await complete(prepared.body);assert.equal(done.status,200,'complete '+kind+' code '+done.body.code);
  return{...done.body.file,bytes};
 }
 function desktop(action){
  const root='C:/Dev/SistemaRural/AmazonAgro-Propostas';
  const r=spawnSync(join(root,'.venv-build/Scripts/python.exe'),[join(root,'scripts/qa_proposal_file_sync.py')],{
   cwd:root,input:JSON.stringify({...desktopInput,action}),encoding:'utf8',timeout:240000,maxBuffer:1000000,windowsHide:true,
   env:{...process.env,PATH:'C:\\Windows\\System32\\WindowsPowerShell\\v1.0;'+process.env.PATH}
  });
  let result;try{result=JSON.parse(r.stdout);}catch{throw Error('Synthetic desktop QA returned an invalid response; credentials withheld');}
  if(r.status!==0||!result.ok)throw Error('Synthetic desktop file QA failed: '+(result.code??'unknown'));
  return result;
 }
 try{
  const bucket=await admin.storage.getBucket('proposal-files');
  pass('dedicated private bucket, 25 MiB limit, PDF/XLSX only',!bucket.error&&!bucket.data.public&&Number(bucket.data.file_size_limit)===25*1024*1024&&bucket.data.allowed_mime_types.length===2);
  const unknown=await call('proposal-files',{action:'prepare',sync_id:randomUUID(),file_kind:'pdf',sha256:hash(pdf()),size_bytes:pdf().length,mime_type:mime.pdf,original_filename:'synthetic.pdf'});
  pass('unknown/unsynchronized proposal cannot authorize object',unknown.status===404&&unknown.body.code==='proposal_not_synced');
  if(staging){
   desktopInput={url:base,key:anon,access_token:users.a.token,refresh_token:users.a.refresh,expires_at:users.a.expires_at,user_id:users.a.id,organization_id:orgA,bank:'Central QA Bank '+run,path:join('C:/Dev/SistemaRural/AmazonAgro-Propostas','.tmp','qa-proposal-files-'+run)};
   const result=desktop('initial');summary.desktop_initial=result;syncId=result.sync_id;
   pass('real desktop export retains XLSX/PDF locally, offline queue and restart delivery',result.offline_preserved&&result.restart_resumed&&result.files.length===2);
   pass('real Excel COM, financial rules, template, SQLite, no Excel process left',result.pdf_backend==='Excel COM'&&result.template_unchanged&&result.sqlite_integrity==='ok'&&result.abc==='3500'&&result.new_excel_processes_remaining.length===0);
   for(const item of result.files){files.push({...item,id:item.remote_file_id,bytes:await readFile(item.local_path)});}
  }else{
   syncId=randomUUID();const number=await reserve(syncId,'2026-10-30T12:00:00Z');assert.equal(number.status,200);
   const payload={sync_id:syncId,proposal_number:number.body.proposal_number,proponent_name:'Synthetic file applicant',created_at:'2026-10-30T12:00:00Z',updated_at:'2026-10-30T13:00:00Z',created_by_technician_name:'Synthetic creator',responsible_name:'Synthetic responsible',technician_name:'Synthetic technician',bank:'Central QA Bank '+run,purpose:'Synthetic file QA',total_value:'100000.00',fno_value:'70000.00',of_value:'30000.00'};
   const synced=await call('sync-desktop-proposal',payload);assert.ok([200,201].includes(synced.status));
   files=[await generated(pdf(),'pdf'),await generated(xlsx(),'xlsx')];
   pass('local real signed Storage upload and server content validation for PDF/XLSX');
  }
  operation=row(sql(`select json_build_object('operation_id',operation_id) data from public.desktop_proposals where organization_id=${q(orgA)} and sync_id=${q(syncId)};`)).operation_id;
  const listed=await users.a.client.from('proposal_files').select('id,operation_id,sync_id,file_kind,original_filename,sha256,size_bytes,version,created_at,is_current').eq('operation_id',operation).eq('is_current',true).order('file_kind');
  pass('web metadata contract lists current PDF and XLSX by technical operation id',!listed.error&&listed.data.length===2&&listed.data.every(f=>f.sync_id===syncId));
  const links=[];
  for(const file of files){
   const authorized=await call('proposal-files',{action:'download',file_id:file.id,disposition:'attachment'});
   pass(file.file_kind+' authenticated short signed download',authorized.status===200&&authorized.body.expires_in===60);
   const downloaded=await fetch(capability(authorized.body.signed_url),{redirect:'error',signal:AbortSignal.timeout(45000)});
   const bytes=new Uint8Array(await downloaded.arrayBuffer());
   pass(file.file_kind+' local and downloaded SHA-256 are exactly equal',downloaded.ok&&hash(bytes)===hash(file.bytes)&&hash(bytes)===file.sha256);
   links.push({url:capability(authorized.body.signed_url),expires:Date.now()+65000});
   const anonymous=await fetch(base+'/storage/v1/object/public/proposal-files/'+orgA+'/'+syncId+'/'+file.file_kind+'/'+file.sha256+'.'+file.file_kind,{signal:AbortSignal.timeout(30000)});
   pass(file.file_kind+' has no permanent public access',!anonymous.ok);
   const direct=await users.a.client.storage.from('proposal-files').download(orgA+'/'+syncId+'/'+file.file_kind+'/'+file.sha256+'.'+file.file_kind);
   pass(file.file_kind+' direct object access denied despite read permission',Boolean(direct.error));
   const repeat=await prepare(file.bytes,file.file_kind);const again=await complete(repeat.body);
   pass(file.file_kind+' prepare/complete retry reuses exact file id',repeat.status===200&&repeat.body.signed_upload_url===null&&again.status===200&&again.body.file.id===file.id);
  }
  const preview=await call('proposal-files',{action:'download',file_id:files.find(f=>f.file_kind==='pdf').id,disposition:'inline'});
  const pdfResponse=await fetch(capability(preview.body.signed_url),{signal:AbortSignal.timeout(30000)});
  pass('PDF preview opens valid bytes through temporary inline capability',preview.status===200&&pdfResponse.ok&&(pdfResponse.headers.get('content-type')??'').includes('application/pdf'));
  for(const name of ['b','operator','aal1']){
   const hidden=await users[name].client.from('proposal_files').select('id').eq('operation_id',operation);
   pass(name+' cannot list file metadata',!hidden.error&&hidden.data.length===0);
   const denied=await call('proposal-files',{action:'download',file_id:files[0].id,disposition:'attachment'},users[name]);
   pass(name+' cannot obtain download capability',denied.status===(name==='b'?404:403));
   const send=await call('proposal-files',{action:'prepare',sync_id:syncId,file_kind:'pdf',sha256:hash(pdf()),size_bytes:pdf().length,mime_type:mime.pdf,original_filename:'synthetic.pdf'},users[name]);
   pass(name+' cannot authorize this proposal upload',send.status===(name==='b'?404:403));
  }
  sql(`delete from auth.sessions where user_id=${q(users.revoked.id)};`);
  const revoked=await call('proposal-files',{action:'download',file_id:files[0].id,disposition:'attachment'},users.revoked);
  pass('revoked real AAL2 session cannot authorize download',[401,403].includes(revoked.status));
  const directRpc=await users.a.client.rpc('complete_proposal_file_upload',{p_actor_id:users.a.id,p_upload_id:randomUUID(),p_sha256:'a'.repeat(64),p_size_bytes:100,p_mime_type:mime.pdf});
  pass('user cannot forge verified metadata via direct RPC',Boolean(directRpc.error));
  const big=await prepare(pdf(),'pdf',{size_bytes:25*1024*1024+1});pass('oversize rejected before upload',big.status===413&&big.body.code==='file_too_large');
  const extension=await prepare(pdf(),'pdf',{original_filename:'synthetic.exe'});pass('false extension rejected',extension.status===400);
  for(const [name,bytes,kind,changes,contentType,code]of[
   ['hash',pdf(),'pdf',{sha256:'a'.repeat(64)},mime.pdf,'hash_mismatch'],
   ['corrupt PDF',Buffer.from('%PDF-obviously-invalid'),'pdf',{},mime.pdf,'invalid_file'],
   ['corrupt XLSX',Buffer.from('PK-not-openxml'),'xlsx',{},mime.xlsx,'invalid_file'],
   ['MIME',pdf(),'pdf',{sha256:hash(Buffer.from('synthetic-mime-mismatch-only'))},mime.xlsx,'mime_mismatch']
  ]){
   const prepared=await prepare(bytes,kind,changes);assert.equal(prepared.status,200);
   await upload(prepared.body,bytes,contentType);
   const rejected=await complete(prepared.body);pass(name+' rejected by real complete',rejected.status===422&&rejected.body.code===code);
   const remains=await admin.storage.from('proposal-files').info(prepared.body.storage_path);
   pass(name+' invalid object removed, no completed metadata',Boolean(remains.error));
  }
  if(staging){
   const result=desktop('repeat');summary.desktop_repeat=result;
   pass('desktop same file remains idempotent after restart',result.files.length===2);
   const next=desktop('regenerate');summary.desktop_regenerated=next;
   pass('real regenerated PDF/XLSX create new immutable versions',next.files.length===4);
  }else{const next=Buffer.concat([pdf(),Buffer.from('\n')]);const version=await generated(next,'pdf');pass('new content creates version 2',version.version===2);}
  const previous=files.find(f=>f.file_kind==='pdf'),stale=await prepare(previous.bytes,'pdf');await complete(stale.body);
  const current=await users.a.client.from('proposal_files').select('id,file_kind,sha256,version').eq('operation_id',operation).eq('is_current',true);
  pass('one current file per kind; old idempotent retry does not roll back current',!current.error&&current.data.length===2&&current.data.find(f=>f.file_kind==='pdf').version===2);
  const audit=row(sql(`select json_build_object('upload',count(*) filter(where action='PROPOSAL_FILE_UPLOADED'),'version',count(*) filter(where action='PROPOSAL_FILE_VERSION_CREATED'),'download',count(*) filter(where action='PROPOSAL_FILE_DOWNLOAD_AUTHORIZED'),'safe',bool_and((changes::text||context::text) !~* 'password|secret|token|signed_url|total_value|fno_value')) data from public.audit_log where organization_id=${q(orgA)} and action like 'PROPOSAL_FILE_%';`));
  pass('upload/version/download events audited with sanitized identity',audit.upload===(staging?4:3)&&audit.version===audit.upload&&audit.download>=3&&audit.safe);
  const remaining=Math.max(...links.map(l=>l.expires))-Date.now();
  if(remaining>0)await new Promise(resolve=>setTimeout(resolve,remaining));
  for(const [i,link]of links.entries()){
   const expired=await fetch(link.url,{signal:AbortSignal.timeout(30000)});pass(files[i].file_kind+' signed URL really expires',!expired.ok);
  }
  const stats=row(sql(`select json_build_object('orphan_objects',(select count(*) from storage.objects o where o.bucket_id='proposal-files' and split_part(o.name,'/',1) in (${q(orgA)},${q(orgB)}) and not exists(select 1 from public.proposal_files f where f.storage_path=o.name)), 'orphan_metadata',(select count(*) from public.proposal_files f where f.organization_id in (${q(orgA)},${q(orgB)}) and not exists(select 1 from storage.objects o where o.bucket_id=f.storage_bucket and o.name=f.storage_path)), 'duplicates',(select count(*) from (select desktop_proposal_id,file_kind,sha256 from public.proposal_files where organization_id in (${q(orgA)},${q(orgB)}) group by 1,2,3 having count(*)>1) d)) data;`));
  pass('zero orphan objects, zero orphan metadata, zero logical duplicates',stats.orphan_objects===0&&stats.orphan_metadata===0&&stats.duplicates===0);
  pass('pre-existing canonical proposals unchanged',JSON.stringify(before)===JSON.stringify(preserved()));
  summary.files={sync_id:syncId,operation_id:operation,current:current.data,stats,audit,download_hashes_equal:true,expiry_tested:true};
 }finally{
  // Remove only incomplete objects from this nonce's QA tenants, never completed history.
  const abandoned=sql(`select json_build_object('storage_path',storage_path) data from public.proposal_file_uploads u where organization_id in (${q(orgA)},${q(orgB)}) and not exists(select 1 from public.proposal_files f where f.upload_id=u.id);`);
  if(abandoned.length){const clean=await admin.storage.from('proposal-files').remove(abandoned.map(r=>(r.data??r).storage_path));if(clean.error)throw Error('Incomplete owned QA object cleanup failed');}
 }
}
