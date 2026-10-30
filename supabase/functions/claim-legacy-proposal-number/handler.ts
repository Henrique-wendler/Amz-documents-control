import { FunctionHttpError, requireAuthenticatedContext, type AuthContextBackend } from "../_shared/authenticatedContext.ts";
import { validTimestamp } from "../sync-desktop-proposal/contract.ts";
export interface LegacyClaimBackend extends AuthContextBackend {
 sessionActive(token: string): Promise<boolean>;
 claim(actor: string, syncId: string, proposalNumber: string, createdAt: string): Promise<{data:Record<string,unknown>|null;error:{code:string}|null}>;
}
export function createLegacyClaimHandler(backend: LegacyClaimBackend, allowedOrigins: string[] = []) {
 const origins=new Set(allowedOrigins.map(v=>v.trim().replace(/\/+$/,"")));
 const windows=new Map<string,{count:number;expires:number}>();
 return async(request: Request): Promise<Response> => {
  let cors:Record<string,string>={};
  const json=(body:unknown,status:number)=>new Response(JSON.stringify(body),{status,headers:{
   "Content-Type":"application/json; charset=utf-8","Cache-Control":"private, no-store, max-age=0",...cors}});
  try {
   const origin=request.headers.get("Origin")?.replace(/\/+$/,"");
   if(origin){
    if(!origins.has(origin)) throw new FunctionHttpError(403,"permission_denied","Origem não autorizada.");
    cors={"Access-Control-Allow-Origin":origin,Vary:"Origin","Access-Control-Allow-Methods":"POST, OPTIONS",
     "Access-Control-Allow-Headers":"authorization, apikey, content-type"};
   }
   if(request.method==="OPTIONS") return new Response(null,{status:204,headers:cors});
   if(request.method!=="POST") return json({ok:false,code:"method_not_allowed"},405);
   const context=await requireAuthenticatedContext(request,backend,"desktop_proposals.sync");
   const now=Date.now(); for(const[id,v]of windows)if(v.expires<=now)windows.delete(id);
   const w=windows.get(context.actorId);
   if((w&&w.count>=60)||(!w&&windows.size>=1024))throw new FunctionHttpError(429,"rate_limited","Aguarde um minuto.");
   windows.set(context.actorId,{count:(w?.count??0)+1,expires:w?.expires??now+60000});
   const invalid=()=>new FunctionHttpError(400,"invalid_payload","Informe somente sync_id UUID v4, proposal_number AAAA-NNNN e created_at ISO-8601 válido.");
   if(request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase()!=="application/json"||!request.body)throw invalid();
   const reader=request.body.getReader();let bytes=new Uint8Array();
   while(true){const r=await reader.read();if(r.done)break;if(bytes.length+r.value.length>1024){await reader.cancel();throw invalid();}
    const next=new Uint8Array(bytes.length+r.value.length);next.set(bytes);next.set(r.value,bytes.length);bytes=next;}
   let body:Record<string,unknown>;
   try{body=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));}catch{throw invalid();}
   if(!body||Array.isArray(body)||Object.keys(body).length!==3||typeof body.sync_id!=="string"
    ||!(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i).test(body.sync_id)
    ||typeof body.proposal_number!=="string"||!(/^(?!0000)[0-9]{4}-(?!0000)[0-9]{4}$/).test(body.proposal_number)
    ||typeof body.created_at!=="string"||!validTimestamp(body.created_at))throw invalid();
   const result=await backend.claim(context.actorId,body.sync_id.toLowerCase(),body.proposal_number,body.created_at);
   if(result.error){
    const errors:Record<string,[number,string,string]>={DS400:[400,"invalid_payload","Identidade legada inválida ou incompleta."],
     DS403:[403,"permission_denied","Sem permissão para conciliar propostas."],
     LC409:[409,"legacy_proposal_number_conflict","O número ou UUID já pertence a uma identidade diferente. Nenhum dado foi substituído; solicite revisão manual."],
     LC422:[409,"legacy_proposal_year_mismatch","O ano do número não corresponde à criação em America/Araguaina. Revise o histórico sem renumerar automaticamente."]};
    if(errors[result.error.code])throw new FunctionHttpError(...errors[result.error.code]);throw Error("Legacy claim failed");
   }
   if(!result.data)throw Error("Missing receipt");return json(result.data,200);
  }catch(error){if(error instanceof FunctionHttpError)return json({ok:false,code:error.code,message:error.message},error.status);
   return json({ok:false,code:"internal_error",message:"Não foi possível conciliar o número histórico agora."},500);}
 };
}
