import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { DocumentValidityStatus } from "../types/domain";
import type { DocumentRepository, DocumentRepositoryInput, PersistedDocument } from "./documentRepository";
import { DocumentConcurrencyError } from "./documentRepository";

interface DocumentRow {
  id: string; farm_id: string; registration_id: string | null; document_type_id: string; document_number: string | null;
  exercise_year: number | null; issue_date: string | null; expiration_date: string | null; purpose: string | null;
  licensed_area: number | string | null; sigam_status: string | null; status: "active" | "inactive"; notes: string | null;
  created_at: string; updated_at: string; version: number; validity_status: DocumentValidityStatus;
}
const selection = "id, farm_id, registration_id, document_type_id, document_number, exercise_year, issue_date, expiration_date, purpose, licensed_area, sigam_status, status, notes, created_at, updated_at, version, validity_status";
const formatTimestamp = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Araguaina" }).format(new Date(value));
const mapRow = (row: DocumentRow, documentTypeName = "Tipo não encontrado"): PersistedDocument => ({
  id: row.id, farmId: row.farm_id, registrationId: row.registration_id ?? undefined, documentTypeId: row.document_type_id,
  type: documentTypeName, number: row.document_number ?? undefined,
  exercise: row.exercise_year === null ? undefined : String(row.exercise_year), issueDate: row.issue_date ?? undefined,
  expirationDate: row.expiration_date ?? undefined, purpose: row.purpose ?? undefined,
  licensedArea: row.licensed_area === null ? undefined : Number(row.licensed_area), sigamStatus: row.sigam_status ?? undefined,
  status: row.status, notes: row.notes ?? undefined, createdAt: formatTimestamp(row.created_at), updatedAt: formatTimestamp(row.updated_at),
  version: row.version, validityStatus: row.validity_status,
});
const mapInput = (input: DocumentRepositoryInput) => ({ farm_id: input.farmId, registration_id: input.registrationId ?? null, document_type_id: input.documentTypeId, document_number: input.documentNumber || null, exercise_year: input.exerciseYear ?? null, issue_date: input.issueDate || null, expiration_date: input.expirationDate || null, purpose: input.purpose || null, licensed_area: input.licensedArea ?? null, sigam_status: input.sigamStatus || null, status: input.status, notes: input.notes || null });
const friendlyError = (error: PostgrestError, fallback: string) => {
  if (error.code === "23503") return new Error("A Fazenda, Matrícula ou tipo documental informado não está disponível para esta organização.");
  if (error.code === "23514") return new Error("Revise as datas e áreas informadas para o documento.");
  if (error.code === "42501") return new Error("Você não possui permissão para realizar esta ação.");
  if (error.code === "40001") return new DocumentConcurrencyError();
  return new Error(fallback);
};
const currentOrganizationId = async () => {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error("Sua sessão não pôde ser validada. Entre novamente.");
  const { data, error } = await supabase.from("profiles").select("organization_id").eq("id", authData.user.id).eq("status", "active").maybeSingle();
  if (error || !data?.organization_id) throw new Error("Seu usuário não possui um perfil ativo para acessar o sistema.");
  return data.organization_id as string;
};
const mapRowsWithTypes = async (rows: DocumentRow[]) => {
  const ids = [...new Set(rows.map((row) => row.document_type_id))];
  if (!ids.length) return [];
  const { data, error } = await supabase.from("document_types").select("id,name").in("id", ids).is("deleted_at", null);
  if (error) throw friendlyError(error, "Não foi possível resolver os tipos documentais.");
  const names = new Map((data ?? []).map((item) => [item.id as string, item.name as string]));
  return rows.map((row) => mapRow(row, names.get(row.document_type_id)));
};
const queryList = async (column?: "farm_id" | "registration_id", id?: string) => {
  let query = supabase.from("rural_documents_with_validity").select(selection).order("updated_at", { ascending: false });
  if (column && id) query = query.eq(column, id);
  const { data, error } = await query;
  if (error) throw friendlyError(error, "Não foi possível carregar os documentos.");
  return mapRowsWithTypes((data ?? []) as unknown as DocumentRow[]);
};

export const supabaseDocumentRepository: DocumentRepository = {
  list: () => queryList(),
  listByFarm: (farmId) => queryList("farm_id", farmId),
  listByRegistration: (registrationId) => queryList("registration_id", registrationId),
  async getById(id) {
    const { data, error } = await supabase.from("rural_documents_with_validity").select(selection).eq("id", id).maybeSingle();
    if (error) throw friendlyError(error, "Não foi possível carregar o documento.");
    return data ? (await mapRowsWithTypes([data as unknown as DocumentRow]))[0] : undefined;
  },
  async create(input) {
    const organizationId = await currentOrganizationId();
    const { data, error } = await supabase.from("rural_documents").insert({ organization_id: organizationId, ...mapInput(input) }).select("id").single();
    if (error) throw friendlyError(error, "Não foi possível cadastrar o documento.");
    const created = await this.getById(data.id); if (!created) throw new Error("Documento cadastrado, mas não foi possível recarregá-lo."); return created;
  },
  async update(id, expectedVersion, input) {
    const { data, error } = await supabase.from("rural_documents").update(mapInput(input)).eq("id", id).eq("version", expectedVersion).is("deleted_at", null).select("id").maybeSingle();
    if (error) throw friendlyError(error, "Não foi possível atualizar o documento.");
    if (!data) throw new DocumentConcurrencyError();
    const updated = await this.getById(id); if (!updated) throw new DocumentConcurrencyError(); return updated;
  },
  async inactivate(id, expectedVersion) {
    const current = await this.getById(id); if (!current) throw new DocumentConcurrencyError();
    return this.update(id, expectedVersion, { farmId: current.farmId, registrationId: current.registrationId, documentTypeId: current.documentTypeId, documentNumber: current.number, exerciseYear: current.exercise ? Number(current.exercise) : undefined, issueDate: current.issueDate, expirationDate: current.expirationDate, purpose: current.purpose, licensedArea: current.licensedArea, sigamStatus: current.sigamStatus, status: "inactive", notes: current.notes });
  },
  async softDelete(id, expectedVersion) {
    const { data, error } = await supabase.rpc("soft_delete_record", { p_entity_type: "rural_documents", p_id: id, p_expected_version: expectedVersion });
    if (error) throw friendlyError(error, "Não foi possível excluir o documento.");
    if (data !== 1) throw new DocumentConcurrencyError();
  },
};
