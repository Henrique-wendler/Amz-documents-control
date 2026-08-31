import { supabase } from "../lib/supabase";
import type { DocumentTypeRepository, PersistedDocumentType } from "./documentTypeRepository";

interface DocumentTypeRow { id: string; name: string; code: string | null; requires_expiration: boolean | null; version: number; }
const selection = "id, name, code, requires_expiration, version";
const mapRow = (row: DocumentTypeRow): PersistedDocumentType => ({ id: row.id, name: row.name, code: row.code ?? undefined, requiresExpiration: row.requires_expiration ?? undefined, version: row.version });

export const supabaseDocumentTypeRepository: DocumentTypeRepository = {
  async listActive() {
    const { data, error } = await supabase.from("document_types").select(selection).eq("status", "active").is("deleted_at", null).order("name");
    if (error) throw new Error("Não foi possível carregar os tipos documentais.");
    return ((data ?? []) as unknown as DocumentTypeRow[]).map(mapRow);
  },
  async getById(id) {
    const { data, error } = await supabase.from("document_types").select(selection).eq("id", id).is("deleted_at", null).maybeSingle();
    if (error) throw new Error("Não foi possível carregar o tipo documental.");
    return data ? mapRow(data as unknown as DocumentTypeRow) : undefined;
  },
};
