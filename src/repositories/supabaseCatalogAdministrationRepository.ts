import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { CatalogAdministrationData, CatalogDraft, CatalogEntry, CatalogKind } from "../types/catalogAdministration";
import type { CatalogAdministrationRepository } from "./catalogAdministrationRepository";
import { CatalogConcurrencyError } from "./catalogAdministrationRepository";

type CatalogTable = "financial_institutions" | "guarantee_types" | "document_types";

interface CatalogRow {
  id: string;
  name: string;
  short_name?: string | null;
  code?: string | null;
  requires_expiration?: boolean | null;
  status: "active" | "inactive";
  updated_at: string;
  version: number;
}

const tableByKind: Record<CatalogKind, CatalogTable> = {
  financialInstitutions: "financial_institutions",
  guaranteeTypes: "guarantee_types",
  documentTypes: "document_types",
};

const selectionByKind: Record<CatalogKind, string> = {
  financialInstitutions: "id, name, short_name, status, updated_at, version",
  guaranteeTypes: "id, name, status, updated_at, version",
  documentTypes: "id, name, code, requires_expiration, status, updated_at, version",
};

const friendlyError = (error: PostgrestError, fallback: string) => {
  if (error.code === "23505") return new Error("Já existe um item com este nome ou código nesta organização.");
  if (error.code === "23503") return new Error("Este item está relacionado a dados de outra organização.");
  if (error.code === "42501") return new Error("Você não possui permissão para gerenciar catálogos.");
  if (error.code === "40001") return new CatalogConcurrencyError();
  return new Error(fallback);
};

const formatTimestamp = (value: string) => new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Araguaina",
}).format(new Date(value));

const mapRow = (kind: CatalogKind, row: CatalogRow): CatalogEntry => ({
  id: row.id,
  kind,
  name: row.name,
  shortName: row.short_name ?? undefined,
  code: row.code ?? undefined,
  requiresExpiration: row.requires_expiration ?? undefined,
  status: row.status,
  updatedAt: formatTimestamp(row.updated_at),
  version: row.version,
});

const currentOrganizationId = async () => {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error("Sua sessão não pôde ser validada. Entre novamente.");
  const { data, error } = await supabase
    .from("profiles")
    .select("organization_id")
    .eq("id", authData.user.id)
    .eq("status", "active")
    .maybeSingle();
  if (error || !data?.organization_id) throw new Error("Seu usuário não possui um perfil ativo para acessar o sistema.");
  return data.organization_id as string;
};

const payloadFor = (kind: CatalogKind, draft: CatalogDraft) => {
  const common = { name: draft.name, status: draft.status };
  if (kind === "financialInstitutions") return { ...common, short_name: draft.shortName || null };
  if (kind === "documentTypes") return {
    ...common,
    code: draft.code || null,
    requires_expiration: draft.requiresExpiration ?? false,
  };
  return common;
};

const listKind = async (kind: CatalogKind): Promise<CatalogEntry[]> => {
  const { data, error } = await supabase
    .from(tableByKind[kind])
    .select(selectionByKind[kind])
    .is("deleted_at", null)
    .order("name");
  if (error) throw friendlyError(error, "Não foi possível carregar os catálogos.");
  return ((data ?? []) as unknown as CatalogRow[]).map((row) => mapRow(kind, row));
};

export const supabaseCatalogAdministrationRepository: CatalogAdministrationRepository = {
  async list(): Promise<CatalogAdministrationData> {
    const [financialInstitutions, guaranteeTypes, documentTypes] = await Promise.all([
      listKind("financialInstitutions"),
      listKind("guaranteeTypes"),
      listKind("documentTypes"),
    ]);
    return { financialInstitutions, guaranteeTypes, documentTypes };
  },

  async create(kind, draft) {
    const organizationId = await currentOrganizationId();
    const { data, error } = await supabase
      .from(tableByKind[kind])
      .insert({ organization_id: organizationId, ...payloadFor(kind, draft) })
      .select(selectionByKind[kind])
      .single();
    if (error) throw friendlyError(error, "Não foi possível criar o item do catálogo.");
    return mapRow(kind, data as unknown as CatalogRow);
  },

  async update(kind, id, expectedVersion, draft) {
    const { data, error } = await supabase
      .from(tableByKind[kind])
      .update(payloadFor(kind, draft))
      .eq("id", id)
      .eq("version", expectedVersion)
      .is("deleted_at", null)
      .select(selectionByKind[kind])
      .maybeSingle();
    if (error) throw friendlyError(error, "Não foi possível atualizar o item do catálogo.");
    if (!data) throw new CatalogConcurrencyError();
    return mapRow(kind, data as unknown as CatalogRow);
  },
};
