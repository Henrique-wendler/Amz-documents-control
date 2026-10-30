import {cp,mkdir,readFile,readdir,writeFile,unlink} from "node:fs/promises";
import {resolve,join,isAbsolute,relative} from "node:path";
import {spawnSync} from "node:child_process";

// Only this disposable local stack may be reset. No --linked, project-ref or remote command exists here.
const root=process.cwd(), qa=resolve(root,".tmp/central-proposal-numbering-local"), config=join(qa,"supabase");
const project="central-proposal-numbering-qa", cli=join(root,"node_modules/supabase/dist/supabase.js");
const inside=relative(root,qa);
if (isAbsolute(inside)||inside.startsWith("..")||!inside.startsWith(".tmp")) throw Error("Unsafe QA directory");
const flags=process.argv.slice(2);
if (flags.some(flag=>flag!=="--database-only")) throw Error("Only --database-only is accepted");
await mkdir(join(config,"migrations"),{recursive:true});
await mkdir(join(config,"tests"),{recursive:true});
const settings=(await readFile(join(root,"supabase/config.toml"),"utf8"))
 .replace(/^project_id\s*=.*$/m,`project_id = "${project}"`).replace(/543(\d{2})/g,"594$1");
if(!settings.includes(`project_id = "${project}"`)||!settings.includes("port = 59422")) throw Error("Unsafe QA config");
await writeFile(join(config,"config.toml"),settings);
const migrations=(await readdir(join(root,"supabase/migrations"))).filter(v=>v.endsWith(".sql")).sort();
if(migrations.length!==27||!migrations[26].startsWith("202610290027_")) throw Error("Expected clean migrations 001–027");
for(const name of await readdir(join(config,"migrations"))) if(!migrations.includes(name)) await unlink(join(config,"migrations",name));
for(const name of migrations) await cp(join(root,"supabase/migrations",name),join(config,"migrations",name));
for(const name of (await readdir(join(root,"supabase/tests"))).filter(v=>v.endsWith(".sql"))) await cp(join(root,"supabase/tests",name),join(config,"tests",name));
await cp(join(root,"supabase/functions"),join(config,"functions"),{recursive:true});
await writeFile(join(qa,"functions.env"),"ALLOWED_ORIGINS=https://desktop-qa.example.invalid\n");
function run(label,args,timeout=300000){
 process.stdout.write(`${label} (${project})…\n`);
 const result=spawnSync(process.execPath,[cli,...args,"--workdir",qa],{cwd:root,encoding:"utf8",timeout,maxBuffer:16000000});
 const log=(result.stdout??"")+"\n"+(result.stderr??"");
 return writeFile(join(qa,label+".log"),log).then(()=>{
  if(result.status!==0||result.error) throw Error(`${label} failed; inspect .tmp/central-proposal-numbering-local/${label}.log`);
  if(label==="db-tests") process.stdout.write((log.match(/Files=\d+, Tests=\d+[^\r\n]*/)?.[0]??"SQL suite finished")+"\nResult: PASS\n");
 });
}
await run("start",["start","--exclude","studio,pgadmin,pgmeta,imgproxy,realtime,logflare,vector,edge-runtime,supavisor,inbucket"]);
await run("reset",["db","reset","--local"]);
await run("db-tests",["test","db"]);
process.stdout.write("Clean local reset 001–027: PASS\n");
if(!flags.includes("--database-only")){
 const result=spawnSync(process.execPath,[join(root,"scripts/test-central-proposal-numbering-http.mjs"),"--local"],{cwd:root,encoding:"utf8",timeout:480000,maxBuffer:16000000});
 await writeFile(join(qa,"http.log"),(result.stdout??"")+"\n"+(result.stderr??""));
 if(result.status!==0||result.error) throw Error("Local HTTP QA failed; inspect ignored http.log");
 process.stdout.write(result.stdout);
}
