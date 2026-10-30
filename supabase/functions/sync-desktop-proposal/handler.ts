import { FunctionHttpError, requireAuthenticatedContext, type AuthContextBackend } from "../_shared/authenticatedContext.ts";
import { deliveryHeaders, readPayload, type DesktopPayload } from "./contract.ts";

export interface SyncBackend extends AuthContextBackend {
  sync(actorId: string, payload: DesktopPayload, revision: string | null, expectedVersion: string | null):
    Promise<{data: Record<string, unknown> | null; error: {code: string} | null}>;
}

const json = (body: unknown, status: number, headers: Record<string,string>) => new Response(JSON.stringify(body), {
  status, headers: {"Content-Type":"application/json; charset=utf-8", "Cache-Control":"private, no-store, max-age=0", ...headers},
});

export function createSyncHandler(backend: SyncBackend, allowedOrigins: string[] = []) {
  const origins = new Set(allowedOrigins.map(value => value.trim().replace(/\/+$/, "")).filter(Boolean));
  const windows = new Map<string,{count:number; expires:number}>();
  return async (request: Request): Promise<Response> => {
    let cors: Record<string,string> = {};
    try {
      const origin = request.headers.get("Origin")?.replace(/\/+$/, "");
      if (origin) {
        if (!origins.has(origin)) throw new FunctionHttpError(403,"permission_denied","Origem não autorizada.");
        cors = {"Access-Control-Allow-Origin":origin,"Vary":"Origin",
          "Access-Control-Allow-Methods":"POST, OPTIONS",
          "Access-Control-Allow-Headers":"authorization, apikey, content-type, idempotency-key, x-payload-version, x-desktop-revision, if-match"};
      }
      if (request.method === "OPTIONS") return new Response(null,{status:204,headers:cors});
      if (request.method !== "POST") return json({success:false,ok:false,code:"method_not_allowed",message:"Utilize POST."},405,{...cors,Allow:"POST, OPTIONS"});
      const context = await requireAuthenticatedContext(request,backend,"desktop_proposals.sync");
      const now = Date.now();
      for (const [id, window] of windows) if (window.expires <= now) windows.delete(id);
      const window = windows.get(context.actorId);
      if ((window && window.count >= 60) || (!window && windows.size >= 1024)) {
        throw new FunctionHttpError(429,"rate_limited","Muitas tentativas. Aguarde um minuto.");
      }
      windows.set(context.actorId,{count:(window?.count ?? 0)+1,expires:window?.expires ?? now+60000});
      const payload = await readPayload(request);
      const headers = deliveryHeaders(request.headers,payload.sync_id);
      const result = await backend.sync(context.actorId,payload,headers.revision,headers.expectedVersion);
      if (result.error) {
        const errors: Record<string,[number,string,string]> = {
          PN404:[409,"proposal_number_not_reserved","Número histórico não reservado. Solicite conciliação antes de sincronizar."],
          PN409:[409,"proposal_number_reservation_mismatch","O número não corresponde à reserva desta proposta."],
          DS400:[400,"invalid_payload","Metadados da proposta inválidos ou incompletos."],
          DS403:[403,"permission_denied","Sem autorização para sincronizar propostas."],
          DS404:[404,"institution_not_found","Banco não encontrado no catálogo da organização."],
          DS409:[409,"domain_conflict","Conflito de identidade, versão ou cadastro. Revise os dados antes de tentar novamente."],
        };
        const error = errors[result.error.code];
        if (error) throw new FunctionHttpError(...error);
        throw new Error("Internal persistence failure");
      }
      if (!result.data) throw new Error("Missing sync acknowledgement");
      if (result.data.result === "stale") {
        return json({...result.data,success:false,ok:false,code:"stale_update",message:"Existe uma versão mais recente no servidor; os dados não foram substituídos."},409,cors);
      }
      return json(result.data,result.data.result === "created" ? 201 : 200,cors);
    } catch (error) {
      if (error instanceof FunctionHttpError) return json({success:false,ok:false,code:error.code,message:error.message},error.status,cors);
      // No SQL details, tokens, profile data or payload values are logged or returned.
      return json({success:false,ok:false,code:"internal_error",message:"Não foi possível sincronizar a proposta agora."},500,cors);
    }
  };
}
