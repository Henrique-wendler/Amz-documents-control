import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { createSyncHandler, type SyncBackend } from "./handler.ts";

const url = Deno.env.get("SUPABASE_URL");
const serverKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !serverKey) throw new Error("Supabase server environment is unavailable.");
const server = createClient(url,serverKey,{auth:{autoRefreshToken:false,persistSession:false}});
const check = <T>(value: {data:T; error:unknown}): T => {
  if (value.error) throw new Error("Context lookup failed");
  return value.data;
};
const backend: SyncBackend = {
  async verifyUser(token) {
    const {data,error} = await server.auth.getUser(token);
    return error ? null : data.user;
  },
  async profileFor(id) {
    return check(await server.from("profiles").select("id,organization_id,role_key,status").eq("id",id).maybeSingle());
  },
  async organizationActive(id) {
    return Boolean(check(await server.from("organizations").select("id").eq("id",id).eq("status","active").is("deleted_at",null).maybeSingle()));
  },
  async roleActive(key) {
    return Boolean(check(await server.from("roles").select("role_key").eq("role_key",key).eq("status","active").maybeSingle()));
  },
  async hasPermission(role,permission) {
    return Boolean(check(await server.from("role_permissions").select("permission_key").eq("role_key",role).eq("permission_key",permission).maybeSingle()));
  },
  async sync(actorId,payload,revision,expectedVersion) {
    const {data,error} = await server.rpc("sync_desktop_proposal",{
      p_actor_id:actorId,p_payload:payload,p_source_revision:revision,p_expected_version:expectedVersion,
    });
    return {data,error};
  },
};
Deno.serve(createSyncHandler(backend,(Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",")));
