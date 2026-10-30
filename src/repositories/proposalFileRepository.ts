import { supabase, supabaseUrl } from "../lib/supabase";
import type { ProposalFile, ProposalFileRepository } from "../types/proposalFile";
const unavailable = () => new Error("Não foi possível acessar os arquivos da proposta. Confirme sua sessão e tente novamente.");
export const proposalFileRepository: ProposalFileRepository = {
    async list(operationId) {
        const { data, error } = await supabase.from("proposal_files").select("id,operation_id,sync_id,file_kind,original_filename,sha256,size_bytes,version,created_at,is_current").eq("operation_id", operationId).eq("is_current", true).order("file_kind");
        if (error)
            throw unavailable();
        return (data ?? []).map((r) => {
            if (r.operation_id !== operationId || !["pdf", "xlsx"].includes(r.file_kind) || !Number.isSafeInteger(Number(r.version)) || Number(r.version) < 1 || !Number.isSafeInteger(Number(r.size_bytes)) || Number(r.size_bytes) < 1 || Number(r.size_bytes) > 25 * 1024 * 1024 || r.is_current !== true || !Number.isFinite(Date.parse(r.created_at)))
                throw unavailable();
            return { id: r.id, operationId: r.operation_id, syncId: r.sync_id, kind: r.file_kind, filename: r.original_filename, sha256: r.sha256, sizeBytes: Number(r.size_bytes), version: Number(r.version), createdAt: r.created_at, isCurrent: r.is_current } as ProposalFile;
        });
    },
    async authorize(fileId, disposition) {
        const { data, error } = await supabase.functions.invoke("proposal-files", { body: { action: "download", file_id: fileId, disposition } });
        if (error || data?.ok !== true || data.file_id !== fileId || typeof data.signed_url !== "string" || !Number.isInteger(data.expires_in) || data.expires_in < 1 || data.expires_in > 120)
            throw unavailable();
        let url: URL;
        try {
            url = new URL(data.signed_url);
        }
        catch {
            throw unavailable();
        }
        if (url.protocol !== "https:" || url.origin !== new URL(supabaseUrl).origin || !url.pathname.startsWith("/storage/v1/object/sign/proposal-files/") || !url.searchParams.has("token") || url.username || url.password || url.hash)
            throw unavailable();
        return { url: url.toString(), expiresIn: Number(data.expires_in) };
    }
};
