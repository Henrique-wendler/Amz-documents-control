import { FunctionHttpError } from "../_shared/authenticatedContext.ts";
export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MIME = { pdf: "application/pdf", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" } as const;
export type FileKind = keyof typeof MIME;
export type Prepare = {
    action: "prepare";
    sync_id: string;
    file_kind: FileKind;
    sha256: string;
    size_bytes: number;
    mime_type: string;
    original_filename: string;
};
export type FileRequest = Prepare | {
    action: "complete";
    upload_id: string;
} | {
    action: "download";
    file_id: string;
    disposition: "inline" | "attachment";
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const invalid = () => new FunctionHttpError(400, "invalid_payload", "Dados de arquivo inválidos ou incompletos.");
export function validateRequest(value: unknown): FileRequest {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw invalid();
    const b = value as Record<string, unknown>;
    const fields = b.action === "prepare" ? ["action", "sync_id", "file_kind", "sha256", "size_bytes", "mime_type", "original_filename"] :
        b.action === "complete" ? ["action", "upload_id"] : b.action === "download" ? ["action", "file_id", "disposition"] : [];
    if (!fields.length || Object.keys(b).length !== fields.length || fields.some(k => !Object.hasOwn(b, k)))
        throw invalid();
    if (b.action === "prepare") {
        if (typeof b.sync_id !== "string" || !uuid.test(b.sync_id) || b.sync_id[14] !== "4" || !(b.file_kind === "pdf" || b.file_kind === "xlsx")
            || typeof b.sha256 !== "string" || !(/^[0-9a-f]{64}$/).test(b.sha256) || !Number.isSafeInteger(b.size_bytes) || Number(b.size_bytes) <= 0
            || b.mime_type !== MIME[b.file_kind] || typeof b.original_filename !== "string" || !b.original_filename.isWellFormed()
            || [...b.original_filename].length > 255 || !b.original_filename.length || b.original_filename.trim() !== b.original_filename
            || (/[\\/\u0000-\u001f\u007f-\u009f]/).test(b.original_filename) || !b.original_filename.toLowerCase().endsWith("." + b.file_kind))
            throw invalid();
        if (Number(b.size_bytes) > MAX_FILE_BYTES)
            throw new FunctionHttpError(413, "file_too_large", "O arquivo excede o limite de 25 MiB.");
        return { ...b, sync_id: b.sync_id.toLowerCase() } as Prepare;
    }
    const key = b.action === "complete" ? "upload_id" : "file_id";
    if (typeof b[key] !== "string" || !uuid.test(b[key] as string))
        throw invalid();
    if (b.action === "download" && b.disposition !== "inline" && b.disposition !== "attachment")
        throw invalid();
    return b as FileRequest;
}
export async function readRequest(request: Request): Promise<FileRequest> {
    if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json" || !request.body)
        throw invalid();
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        while (true) {
            const r = await reader.read();
            if (r.done)
                break;
            size += r.value.length;
            if (size > 4096) {
                await reader.cancel();
                throw invalid();
            }
            chunks.push(r.value);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const c of chunks) {
            bytes.set(c, offset);
            offset += c.length;
        }
        return validateRequest(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
    }
    catch (error) {
        if (error instanceof FunctionHttpError)
            throw error;
        throw invalid();
    }
}
