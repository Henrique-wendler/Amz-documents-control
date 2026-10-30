import { FunctionHttpError, requireAuthenticatedContext, type AuthContextBackend } from "../_shared/authenticatedContext.ts";
import { readRequest, MAX_FILE_BYTES, type Prepare, type FileKind } from "./contract.ts";
import { validateContent } from "./content.ts";
export type Upload = {
    id: string;
    organization_id: string;
    sync_id: string;
    file_kind: FileKind;
    sha256: string;
    size_bytes: number;
    mime_type: string;
    storage_path: string;
    status: string;
    expires_at: string;
};
type Row = Record<string, unknown>;
export interface FileBackend extends AuthContextBackend {
    sessionActive(token: string): Promise<boolean>;
    prepare(actor: string, payload: Omit<Prepare, "action">): Promise<{
        upload: Upload;
        file: Row | null;
    }>;
    upload(actor: string, id: string): Promise<{
        upload: Upload;
        file: Row | null;
    }>;
    exists(path: string): Promise<boolean>;
    signUpload(path: string): Promise<string>;
    object(path: string): Promise<{
        bytes: Uint8Array;
        mime: string;
    }>;
    reject(actor: string, u: Upload, code: string): Promise<void>;
    finish(actor: string, u: Upload, hash: string): Promise<Row>;
    download(actor: string, id: string): Promise<{
        file_kind: FileKind;
        storage_path: string;
        original_filename: string;
    }>;
    signDownload(path: string, filename: string | null): Promise<string>;
    auditDownload(actor: string, id: string): Promise<void>;
}
export function createFileHandler(backend: FileBackend, allowedOrigins: string[] = []) {
    const origins = new Set(allowedOrigins.map(v => v.trim().replace(/\/+$/, ""))), windows = new Map<string, {
        count: number;
        expires: number;
    }>();
    return async (request: Request) => {
        let cors: Record<string, string> = {};
        const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store, max-age=0", ...cors } });
        try {
            const origin = request.headers.get("Origin")?.replace(/\/+$/, "");
            if (origin) {
                if (!origins.has(origin))
                    throw new FunctionHttpError(403, "permission_denied", "Origem não autorizada.");
                cors = { "Access-Control-Allow-Origin": origin, Vary: "Origin", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info" };
            }
            if (request.method === "OPTIONS")
                return new Response(null, { status: 204, headers: cors });
            if (request.method !== "POST")
                throw new FunctionHttpError(405, "method_not_allowed", "Utilize POST.");
            const body = await readRequest(request);
            const context = await requireAuthenticatedContext(request, backend, body.action === "download" ? "proposal_files.read" : "desktop_proposals.sync");
            const now = Date.now();
            for (const [id, w] of windows)
                if (w.expires <= now)
                    windows.delete(id);
            const w = windows.get(context.actorId);
            if ((w && w.count >= 60) || (!w && windows.size >= 1024))
                throw new FunctionHttpError(429, "rate_limited", "Aguarde um minuto antes de tentar novamente.");
            windows.set(context.actorId, { count: (w?.count ?? 0) + 1, expires: w?.expires ?? now + 60000 });
            if (body.action === "prepare") {
                const { action: _, ...payload } = body;
                const result = await backend.prepare(context.actorId, payload), u = result.upload;
                const url = result.file || await backend.exists(u.storage_path) ? null : await backend.signUpload(u.storage_path);
                return json({ ok: true, upload_id: u.id, organization_id: u.organization_id, sync_id: u.sync_id, file_kind: u.file_kind, sha256: u.sha256, size_bytes: Number(u.size_bytes), mime_type: u.mime_type,
                    storage_bucket: "proposal-files", storage_path: u.storage_path, expires_at: u.expires_at, maximum_bytes: MAX_FILE_BYTES, signed_upload_url: url, file: result.file });
            }
            if (body.action === "complete") {
                const result = await backend.upload(context.actorId, body.upload_id);
                if (result.file)
                    return json({ ok: true, file: result.file });
                const u = result.upload;
                const object = await backend.object(u.storage_path);
                let failure: string | null = object.bytes.length !== Number(u.size_bytes) ? "file_size_mismatch" : object.mime.split(";")[0].trim() !== u.mime_type ? "mime_mismatch" : null;
                let hash = "";
                if (!failure) {
                    try {
                        hash = await validateContent(object.bytes, u.file_kind);
                    }
                    catch (error) {
                        if (error instanceof FunctionHttpError && error.code === "invalid_file")
                            failure = "invalid_file";
                        else
                            throw error;
                    }
                }
                if (!failure && hash !== u.sha256)
                    failure = "hash_mismatch";
                if (failure) {
                    await backend.reject(context.actorId, u, failure);
                    throw new FunctionHttpError(422, failure, "O arquivo recebido não corresponde ao arquivo autorizado. Gere/envie novamente o documento.");
                }
                return json({ ok: true, file: await backend.finish(context.actorId, u, hash) });
            }
            const file = await backend.download(context.actorId, body.file_id);
            if (body.disposition === "inline" && file.file_kind !== "pdf")
                throw new FunctionHttpError(400, "invalid_payload", "XLSX está disponível somente para download.");
            if (!await backend.exists(file.storage_path))
                throw new FunctionHttpError(404, "file_not_found", "Arquivo indisponível.");
            const url = await backend.signDownload(file.storage_path, body.disposition === "attachment" ? file.original_filename : null);
            await backend.auditDownload(context.actorId, body.file_id);
            return json({ ok: true, file_id: body.file_id, signed_url: url, expires_in: 60 });
        }
        catch (error) {
            if (error instanceof FunctionHttpError)
                return json({ ok: false, code: error.code, message: error.message }, error.status);
            return json({ ok: false, code: "storage_unavailable", message: "Não foi possível acessar os arquivos agora. Os arquivos locais foram preservados." }, 503);
        }
    };
}
