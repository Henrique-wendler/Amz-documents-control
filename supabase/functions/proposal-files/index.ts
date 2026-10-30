import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import { createFileHandler, type FileBackend, type Upload } from "./handler.ts";
import { MAX_FILE_BYTES, type Prepare } from "./contract.ts";
import { FunctionHttpError } from "../_shared/authenticatedContext.ts";
const url = Deno.env.get("SUPABASE_URL")!, key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
if (!url || !key)
    throw Error("Storage server environment unavailable");
const options = { auth: { autoRefreshToken: false, persistSession: false } };
const server = createClient(url, key, options), bucket = server.storage.from("proposal-files");
function checked<T>(result: {
    data: T;
    error: unknown;
}): T { if (result.error)
    throw Error("Context unavailable"); return result.data; }
async function rpc(name: string, args: Record<string, unknown>): Promise<any> {
    const { data, error } = await server.rpc(name, args);
    if (error) {
        const map: Record<string, [
            number,
            string,
            string
        ]> = { DS400: [400, "invalid_payload", "Dados inválidos."], DS403: [403, "permission_denied", "Sem permissão para esta ação."], PF413: [413, "file_too_large", "Limite de 25 MiB excedido."], PF404: [404, "file_not_found", "Proposta/arquivo não encontrado ou ainda não sincronizado."], PF409: [409, "file_conflict", "Arquivo ou numeração indisponível; tente sincronizar os dados e reenviar."] };
        if (map[error.code]) {
            const entry = map[error.code];
            const codes = new Set(['proposal_not_synced', 'upload_not_found', 'proposal_number_required', 'upload_expired', 'file_identity_conflict', 'file_not_found']);
            throw new FunctionHttpError(entry[0], codes.has(error.message) ? error.message : entry[1], entry[2]);
        }
        throw Error("Persistence unavailable");
    }
    return data;
}
const backend: FileBackend = {
    async verifyUser(token) { const r = await server.auth.getUser(token); return r.error ? null : r.data.user; },
    async sessionActive(token) { const c = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { ...options, global: { headers: { Authorization: `Bearer ${token}` } } }); const r = await c.rpc("desktop_proposal_session_active"); return !r.error && r.data === true; },
    async profileFor(id) { return checked(await server.from("profiles").select("id,organization_id,role_key,status").eq("id", id).maybeSingle()); },
    async organizationActive(id) { return Boolean(checked(await server.from("organizations").select("id").eq("id", id).eq("status", "active").is("deleted_at", null).maybeSingle())); },
    async roleActive(role) { return Boolean(checked(await server.from("roles").select("role_key").eq("role_key", role).eq("status", "active").maybeSingle())); },
    async hasPermission(role, permission) { return Boolean(checked(await server.from("role_permissions").select("permission_key").eq("role_key", role).eq("permission_key", permission).maybeSingle())); },
    async prepare(actor, payload) { return await rpc("prepare_proposal_file_upload", { p_actor_id: actor, p_payload: payload }); },
    async upload(actor, id) { return await rpc("get_proposal_file_upload", { p_actor_id: actor, p_upload_id: id }); },
    async exists(path) { const { data, error } = await bucket.info(path); if (!error)
        return Boolean(data); if (String(error.status ?? error.statusCode) === "404" || String(error.status ?? error.statusCode) === "400")
        return false; throw Error("Storage lookup unavailable"); },
    async signUpload(path) { const r = await bucket.createSignedUploadUrl(path, { upsert: false }); if (r.error || !r.data.signedUrl)
        throw Error("Upload signing unavailable"); return r.data.signedUrl; },
    async object(path) {
        // Stream with an upper bound rather than trusting Content-Length or buffering an arbitrary object.
        const response = await fetch(url + "/storage/v1/object/authenticated/proposal-files/" + path, { headers: { Authorization: `Bearer ${key}`, apikey: key }, redirect: "error", signal: AbortSignal.timeout(30000) });
        if (response.status === 404 || response.status === 400)
            throw new FunctionHttpError(409, "upload_not_found", "O envio ainda não foi recebido. Tente novamente.");
        if (!response.ok || !response.body)
            throw Error("Storage read unavailable");
        const reader = response.body.getReader(), parts: Uint8Array[] = [];
        let size = 0;
        while (true) {
            const r = await reader.read();
            if (r.done)
                break;
            size += r.value.length;
            if (size > MAX_FILE_BYTES) {
                await reader.cancel();
                throw new FunctionHttpError(413, "file_too_large", "O arquivo excede 25 MiB.");
            }
            parts.push(r.value);
        }
        const bytes = new Uint8Array(size);
        let at = 0;
        for (const part of parts) {
            bytes.set(part, at);
            at += part.length;
        }
        return { bytes, mime: response.headers.get("content-type") ?? "" };
    },
    async reject(actor, u, code) { const r = await bucket.remove([u.storage_path]); if (r.error)
        throw Error("Invalid object cleanup unavailable"); await rpc("fail_proposal_file_upload", { p_actor_id: actor, p_upload_id: u.id, p_code: code }); },
    async finish(actor, u, hash) { return await rpc("complete_proposal_file_upload", { p_actor_id: actor, p_upload_id: u.id, p_sha256: hash, p_size_bytes: u.size_bytes, p_mime_type: u.mime_type }); },
    async download(actor, id) { return await rpc("get_proposal_file_download", { p_actor_id: actor, p_file_id: id }); },
    async signDownload(path, filename) { const r = await bucket.createSignedUrl(path, 60, filename ? { download: filename } : {}); if (r.error || !r.data.signedUrl)
        throw Error("Download signing unavailable"); return r.data.signedUrl; },
    async auditDownload(actor, id) { await rpc("audit_proposal_file_download", { p_actor_id: actor, p_file_id: id }); },
};
Deno.serve(createFileHandler(backend, (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",")));
