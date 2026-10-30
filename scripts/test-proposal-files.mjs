import assert from 'node:assert/strict';
import test from 'node:test';
import {validateContent} from '../supabase/functions/proposal-files/content.ts';
import {validateRequest,MIME,MAX_FILE_BYTES} from '../supabase/functions/proposal-files/contract.ts';
import {createFileHandler} from '../supabase/functions/proposal-files/handler.ts';
import {FunctionHttpError} from '../supabase/functions/_shared/authenticatedContext.ts';

const org='a6103000-0000-4000-8000-000000000001',sync='d6103000-0000-4000-8000-000000000001',id='e6103000-0000-4000-8000-000000000001';
import {pdf,xlsx,hash} from './qa/proposal-file-fixtures.mjs';
const payload=()=>({action:'prepare',sync_id:sync,file_kind:'pdf',sha256:hash(pdf()),size_bytes:pdf().length,mime_type:MIME.pdf,original_filename:'synthetic.pdf'});
const token=(aal='aal2',role='authenticated')=>[{}, {sub:'verified-actor',aal,role}].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url')).join('.')+'.synthetic';
const request=(body,aal='aal2',headers={})=>new Request('https://qa.example.invalid/functions/v1/proposal-files',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token(aal),...headers},body:JSON.stringify(body)});
function backend(){
 const calls=[],u={id,organization_id:org,sync_id:sync,file_kind:'pdf',sha256:hash(pdf()),size_bytes:pdf().length,mime_type:MIME.pdf,storage_path:`${org}/${sync}/pdf/${hash(pdf())}.pdf`,status:'authorized',expires_at:new Date(Date.now()+7200000).toISOString()};
 const file={id,organization_id:org,sync_id:sync,file_kind:'pdf',sha256:u.sha256,size_bytes:u.size_bytes,mime_type:u.mime_type,version:1};
 return {calls,u,file,
  async verifyUser(){return{id:'verified-actor'};},async sessionActive(){return true;},async profileFor(id){return{id,organization_id:org,role_key:'manager',status:'active'};},
  async organizationActive(){return true;},async roleActive(){return true;},async hasPermission(role,permission){calls.push(['permission',permission]);return true;},
  async prepare(actor,data){calls.push(['prepare',actor,data]);return{upload:u,file:null};},async upload(){return{upload:u,file:null};},
  async exists(){return false;},async signUpload(path){calls.push(['sign-upload',path]);return'https://qa.example.invalid/signed';},
  async object(){return{bytes:pdf(),mime:MIME.pdf};},async reject(actor,u,code){calls.push(['reject',code]);},
  async finish(actor,u,verified){calls.push(['finish',actor,verified]);return file;},
  async download(){return{file_kind:'pdf',storage_path:u.storage_path,original_filename:'synthetic.pdf'};},
  async signDownload(path,name){calls.push(['sign-download',path,name]);return'https://qa.example.invalid/temporary';},async auditDownload(actor,id){calls.push(['audit-download',actor,id]);}
 };
}
for(const kind of ['pdf','xlsx'])test(`valid ${kind} validates actual structure and computes server-side SHA`,async()=>{const bytes=kind==='pdf'?pdf():xlsx();assert.equal(await validateContent(bytes,kind),hash(bytes));});
test('stored/uncompressed XLSX supported',async()=>assert.equal(await validateContent(xlsx({},false),'xlsx'),hash(xlsx({},false))));
for(const [name,bytes,kind]of[
 ['fake PDF',Buffer.from('%PDF-1.4\nnot a file'),'pdf'],['fake XLSX',Buffer.from('PK-not-openxml'),'xlsx'],
 ['truncated ZIP',xlsx().subarray(0,-10),'xlsx'],['zip traversal',xlsx({'../escape':'x'}),'xlsx'],
 ['duplicate case',xlsx({'XL/WORKBOOK.XML':'<workbook/>'}),'xlsx'],['macro',xlsx({'xl/vbaProject.bin':'fake'}),'xlsx'],
 ['XML entities',xlsx({'xl/workbook.xml':'<!DOCTYPE workbook [<!ENTITY test SYSTEM "file:///tmp/a">]><workbook/>'}),'xlsx'],
 ['ZIP generic',xlsx({'[Content_Types].xml':'<Types/>'}),'xlsx'],['truncated PDF',pdf().subarray(0,-15),'pdf']
])test(name+' rejected',async()=>assert.rejects(validateContent(bytes,kind),e=>e.code==='invalid_file'));
test('CRC corruption rejected',async()=>{const bytes=xlsx({},false);bytes[60]^=1;await assert.rejects(validateContent(bytes,'xlsx'));});
test('oversize rejected before parsing',async()=>assert.rejects(validateContent(new Uint8Array(MAX_FILE_BYTES+1),'pdf'),e=>e.status===413));
for(const change of [{organization_id:org},{storage_path:'arbitrary'},{mime_type:'text/plain'},{original_filename:'fake.exe'},{original_filename:'../fake.pdf'},{sha256:'bad'},{size_bytes:1.5},{sync_id:'wrong'}])test('strict request rejects '+Object.keys(change).join(','),()=>assert.throws(()=>validateRequest({...payload(),...change})));
test('25 MiB accepted, greater rejected with domain code',()=>{assert.equal(validateRequest({...payload(),size_bytes:MAX_FILE_BYTES}).size_bytes,MAX_FILE_BYTES);assert.throws(()=>validateRequest({...payload(),size_bytes:MAX_FILE_BYTES+1}),e=>e.code==='file_too_large');});
test('prepare derives path and permission, never client org',async()=>{const b=backend(),r=await createFileHandler(b)(request(payload()));assert.equal(r.status,200);const result=await r.json();assert.equal(result.storage_path,b.u.storage_path);assert.ok(b.calls.some(c=>c[0]==='permission'&&c[1]==='desktop_proposals.sync'));assert.equal(b.calls.find(c=>c[0]==='prepare')[1],'verified-actor');});
test('existing completed file returns idempotent prepare without new URL',async()=>{const b=backend();b.prepare=async()=>({upload:b.u,file:b.file});const r=await createFileHandler(b)(request(payload()));assert.equal((await r.json()).signed_upload_url,null);assert.ok(!b.calls.some(c=>c[0]==='sign-upload'));});
for(const aal of ['aal1','aal2'])test('AAL '+aal,async()=>{const r=await createFileHandler(backend())(request(payload(),aal));assert.equal(r.status,aal==='aal1'?403:200);});
for(const denied of ['session','permission','profile','organization','role'])test('denied '+denied+' never prepares',async()=>{const b=backend();if(denied==='session')b.sessionActive=async()=>false;if(denied==='permission')b.hasPermission=async()=>false;if(denied==='profile')b.profileFor=async()=>null;if(denied==='organization')b.organizationActive=async()=>false;if(denied==='role')b.roleActive=async()=>false;const r=await createFileHandler(b)(request(payload()));assert.equal(r.status,denied==='session'?401:403);assert.ok(!b.calls.some(c=>c[0]==='prepare'));});
test('service role JWT cannot impersonate user',async()=>{const r=await createFileHandler(backend())(request(payload(),'aal2',{Authorization:'Bearer '+token('aal2','service_role')}));assert.equal(r.status,401);});
test('complete reads actual bytes and verifies SHA before registration',async()=>{const b=backend(),r=await createFileHandler(b)(request({action:'complete',upload_id:id}));assert.equal(r.status,200);assert.equal(b.calls.find(c=>c[0]==='finish')[2],hash(pdf()));});
for(const failure of ['hash_mismatch','file_size_mismatch','mime_mismatch','invalid_file'])test('invalid upload '+failure+' removed and not registered',async()=>{const b=backend();if(failure==='hash_mismatch')b.u.sha256='a'.repeat(64);if(failure==='file_size_mismatch')b.u.size_bytes++;if(failure==='mime_mismatch')b.object=async()=>({bytes:pdf(),mime:'text/plain'});if(failure==='invalid_file'){b.object=async()=>({bytes:Buffer.alloc(pdf().length),mime:MIME.pdf});}const r=await createFileHandler(b)(request({action:'complete',upload_id:id}));assert.equal(r.status,422);assert.equal((await r.json()).code,failure);assert.ok(b.calls.some(c=>c[0]==='reject'&&c[1]===failure));assert.ok(!b.calls.some(c=>c[0]==='finish'));});
test('complete retry does not validate/recreate immutable existing object',async()=>{const b=backend();b.upload=async()=>({upload:b.u,file:b.file});b.object=async()=>{throw Error('must not reread');};const r=await createFileHandler(b)(request({action:'complete',upload_id:id}));assert.equal(r.status,200);assert.equal((await r.json()).file.id,id);});
for(const disposition of ['inline','attachment'])test('download '+disposition+' short-lived, read-authorized and audited',async()=>{const b=backend();b.exists=async()=>true;const r=await createFileHandler(b)(request({action:'download',file_id:id,disposition}));assert.equal(r.status,200);assert.equal((await r.json()).expires_in,60);assert.ok(b.calls.some(c=>c[0]==='permission'&&c[1]==='proposal_files.read'));assert.equal(b.calls.find(c=>c[0]==='sign-download')[2],disposition==='inline'?null:'synthetic.pdf');assert.ok(b.calls.some(c=>c[0]==='audit-download'));});
test('unknown other tenant file has same 404',async()=>{const b=backend();b.download=async()=>{throw new FunctionHttpError(404,'file_not_found','Arquivo indisponível.');};const r=await createFileHandler(b)(request({action:'download',file_id:id,disposition:'attachment'}));assert.equal(r.status,404);});
test('canonical origin only; temporary preview origin forbidden',async()=>{const h=createFileHandler(backend(),['https://amazon-agro-staging.vercel.app']);const good=await h(request(payload(),'aal2',{Origin:'https://amazon-agro-staging.vercel.app'}));assert.equal(good.status,200);assert.equal((await h(request(payload(),'aal2',{Origin:'https://ephemeral.vercel.app'}))).status,403);});
test('unexpected failure never leaks credentials or signed URLs',async()=>{const b=backend();b.signUpload=async()=>{throw Error('Bearer SECRET https://private?token=secret');};const r=await createFileHandler(b)(request(payload()));assert.equal(r.status,503);assert.ok(!/SECRET|Bearer|token|private\?/.test(await r.text()));});
