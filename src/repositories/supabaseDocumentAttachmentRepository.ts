import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { DocumentAttachmentRepository, DocumentAttachmentRepositoryInput, PersistedAttachmentLocation, PersistedDocumentAttachment } from "./documentAttachmentRepository";
import { DocumentAttachmentConcurrencyError } from "./documentAttachmentRepository";

interface AttachmentRow { id: string; document_id: string; file_name: string; storage_type: "network_share" | "supabase_storage" | "external"; mime_type: string | null; file_size: number | string | null; checksum: string | null; status: "active" | "inactive"; created_at: string; updated_at: string; version: number; }
interface LocationRow { id: string; attachment_id: string; storage_type: "network_share" | "supabase_storage" | "external"; status: "uploading" | "active" | "removing" | "inactive" | "failed"; version: number; }
interface RemoteCopyJobRow { source_location_id: string; status: "pending" | "processing" | "completed" | "failed"; error_code: string | null; }
const selection = "id, document_id, file_name, storage_type, mime_type, file_size, checksum, status, created_at, updated_at, version";
const locationSelection = "id, attachment_id, storage_type, status, version";
const formatTimestamp = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Araguaina" }).format(new Date(value));
const mapLocation = (row: LocationRow): PersistedAttachmentLocation => ({ id: row.id, storageType: row.storage_type, status: row.status, version: row.version });
const mapRow = (row: AttachmentRow, locations: PersistedAttachmentLocation[] = []): PersistedDocumentAttachment => ({ id: row.id, documentId: row.document_id, fileName: row.file_name, storageType: row.storage_type, filePath: "", fileType: row.mime_type ?? undefined, fileSize: row.file_size === null ? undefined : Number(row.file_size), checksum: row.checksum ?? undefined, status: row.status, createdAt: formatTimestamp(row.created_at), updatedAt: formatTimestamp(row.updated_at), version: row.version, locations });
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
const withLocations = async (rows: AttachmentRow[]) => {
  if (!rows.length) return [];
  const { data, error } = await supabase.from("attachment_locations").select(locationSelection).in("attachment_id", rows.map((row) => row.id)).is("deleted_at", null).order("created_at");
  if (error) throw friendlyError(error, "Não foi possível carregar a disponibilidade dos arquivos.");
  const locationRows = (data ?? []) as unknown as LocationRow[];
  const networkLocationIds = locationRows.filter((row) => row.storage_type === "network_share").map((row) => row.id);
  const jobsBySource = new Map<string, RemoteCopyJobRow>();
  if (networkLocationIds.length) {
    const { data: jobData, error: jobError } = await supabase
      .from("remote_copy_jobs")
      .select("source_location_id, status, error_code")
      .in("source_location_id", networkLocationIds)
      .order("created_at", { ascending: false });
    if (jobError) throw friendlyError(jobError, "Não foi possível carregar o estado da disponibilização remota.");
    ((jobData ?? []) as unknown as RemoteCopyJobRow[]).forEach((job) => {
      if (!jobsBySource.has(job.source_location_id)) jobsBySource.set(job.source_location_id, job);
    });
  }
  const locationsByAttachment = new Map<string, PersistedAttachmentLocation[]>();
  locationRows.forEach((row) => {
    const current = locationsByAttachment.get(row.attachment_id) ?? [];
    const location = mapLocation(row);
    const job = jobsBySource.get(row.id);
    current.push(job ? { ...location, remoteCopyStatus: job.status, remoteCopyErrorCode: job.error_code ?? undefined } : location);
    locationsByAttachment.set(row.attachment_id, current);
  });
  return rows.map((row) => mapRow(row, locationsByAttachment.get(row.id) ?? []));
};
export const supabaseDocumentAttachmentRepository: DocumentAttachmentRepository = {
  async list() { const { data, error } = await supabase.from("document_attachments").select(selection).eq("status", "active").is("deleted_at", null).order("file_name"); if (error) throw friendlyError(error, "Não foi possível carregar as referências."); return withLocations((data ?? []) as unknown as AttachmentRow[]); },
  async listByDocument(documentId) { const { data, error } = await supabase.from("document_attachments").select(selection).eq("document_id", documentId).eq("status", "active").is("deleted_at", null).order("file_name"); if (error) throw friendlyError(error, "Não foi possível carregar as referências."); return withLocations((data ?? []) as unknown as AttachmentRow[]); },
  async getById(id) { const { data, error } = await supabase.from("document_attachments").select(selection).eq("id", id).is("deleted_at", null).maybeSingle(); if (error) throw friendlyError(error, "Não foi possível carregar a referência."); return data ? (await withLocations([data as unknown as AttachmentRow]))[0] : undefined; },
  async create(documentId, input) { const organizationId = await currentOrganizationId(); const { data, error } = await supabase.from("document_attachments").insert({ organization_id: organizationId, document_id: documentId, ...mapInput(input) }).select(selection).single(); if (error) throw friendlyError(error, "Não foi possível adicionar a referência."); return (await withLocations([data as unknown as AttachmentRow]))[0]; },
  async update(id, expectedVersion, input) { const { data, error } = await supabase.from("document_attachments").update(mapInput(input)).eq("id", id).eq("version", expectedVersion).is("deleted_at", null).select(selection).maybeSingle(); if (error) throw friendlyError(error, "Não foi possível atualizar a referência."); if (!data) throw new DocumentAttachmentConcurrencyError(); return (await withLocations([data as unknown as AttachmentRow]))[0]; },
  async softDelete(id, expectedVersion) { const { data, error } = await supabase.rpc("soft_delete_record", { p_entity_type: "document_attachments", p_id: id, p_expected_version: expectedVersion }); if (error) throw friendlyError(error, "Não foi possível remover a referência."); if (data !== 1) throw new DocumentAttachmentConcurrencyError(); },
  async logAccess(id, action) { const { error } = await supabase.rpc("log_file_access", { p_attachment_id: id, p_action: action, p_context: { source: "frontend" } }); if (error) throw friendlyError(error, "Não foi possível registrar o acesso à referência."); },
};
