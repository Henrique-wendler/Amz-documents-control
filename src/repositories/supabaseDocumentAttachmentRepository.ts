import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { DocumentAttachmentRepository, DocumentAttachmentRepositoryInput, PersistedDocumentAttachment } from "./documentAttachmentRepository";
import { DocumentAttachmentConcurrencyError } from "./documentAttachmentRepository";

interface AttachmentRow { id: string; document_id: string; file_name: string; storage_type: "network_share" | "supabase_storage" | "external"; file_path: string; mime_type: string | null; file_size: number | string | null; status: "active" | "inactive"; created_at: string; updated_at: string; version: number; }
const selection = "id, document_id, file_name, storage_type, file_path, mime_type, file_size, status, created_at, updated_at, version";
const formatTimestamp = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Araguaina" }).format(new Date(value));
const mapRow = (row: AttachmentRow): PersistedDocumentAttachment => ({ id: row.id, documentId: row.document_id, fileName: row.file_name, storageType: row.storage_type, filePath: row.file_path, fileType: row.mime_type ?? undefined, fileSize: row.file_size === null ? undefined : Number(row.file_size), status: row.status, createdAt: formatTimestamp(row.created_at), updatedAt: formatTimestamp(row.updated_at), version: row.version });
const mapInput = (input: DocumentAttachmentRepositoryInput) => ({ file_name: input.fileName, storage_type: input.storageType, file_path: input.filePath, mime_type: input.mimeType || null, file_size: input.fileSize ?? null });
const friendlyError = (error: PostgrestError, fallback: string) => {
  if (error.code === "23514") return new Error("O caminho contém credencial ou metadado inválido e não pode ser armazenado.");
  if (error.code === "23503") return new Error("O documento não está disponível para esta organização.");
  if (error.code === "42501") return new Error("Você não possui permissão para gerenciar referências de arquivo.");
  if (error.code === "40001") return new DocumentAttachmentConcurrencyError();
  return new Error(fallback);
};
const currentOrganizationId = async () => {
  const { data: authData } = await supabase.auth.getUser(); if (!authData.user) throw new Error("Sua sessão não pôde ser validada. Entre novamente.");
  const { data, error } = await supabase.from("profiles").select("organization_id").eq("id", authData.user.id).eq("status", "active").maybeSingle();
  if (error || !data?.organization_id) throw new Error("Seu usuário não possui um perfil ativo para acessar o sistema."); return data.organization_id as string;
};
export const supabaseDocumentAttachmentRepository: DocumentAttachmentRepository = {
  async list() { const { data, error } = await supabase.from("document_attachments").select(selection).eq("status", "active").is("deleted_at", null).order("file_name"); if (error) throw friendlyError(error, "Não foi possível carregar as referências."); return ((data ?? []) as unknown as AttachmentRow[]).map(mapRow); },
  async listByDocument(documentId) { const { data, error } = await supabase.from("document_attachments").select(selection).eq("document_id", documentId).eq("status", "active").is("deleted_at", null).order("file_name"); if (error) throw friendlyError(error, "Não foi possível carregar as referências."); return ((data ?? []) as unknown as AttachmentRow[]).map(mapRow); },
  async getById(id) { const { data, error } = await supabase.from("document_attachments").select(selection).eq("id", id).is("deleted_at", null).maybeSingle(); if (error) throw friendlyError(error, "Não foi possível carregar a referência."); return data ? mapRow(data as unknown as AttachmentRow) : undefined; },
  async create(documentId, input) { const organizationId = await currentOrganizationId(); const { data, error } = await supabase.from("document_attachments").insert({ organization_id: organizationId, document_id: documentId, ...mapInput(input) }).select(selection).single(); if (error) throw friendlyError(error, "Não foi possível adicionar a referência."); return mapRow(data as unknown as AttachmentRow); },
  async update(id, expectedVersion, input) { const { data, error } = await supabase.from("document_attachments").update(mapInput(input)).eq("id", id).eq("version", expectedVersion).is("deleted_at", null).select(selection).maybeSingle(); if (error) throw friendlyError(error, "Não foi possível atualizar a referência."); if (!data) throw new DocumentAttachmentConcurrencyError(); return mapRow(data as unknown as AttachmentRow); },
  async softDelete(id, expectedVersion) { const { data, error } = await supabase.rpc("soft_delete_record", { p_entity_type: "document_attachments", p_id: id, p_expected_version: expectedVersion }); if (error) throw friendlyError(error, "Não foi possível remover a referência."); if (data !== 1) throw new DocumentAttachmentConcurrencyError(); },
  async logAccess(id, action) { const { error } = await supabase.rpc("log_file_access", { p_attachment_id: id, p_action: action, p_context: { source: "frontend" } }); if (error) throw friendlyError(error, "Não foi possível registrar o acesso à referência."); },
};
