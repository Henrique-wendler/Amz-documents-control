import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { PersistedRegistration, RegistrationRepository, RegistrationRepositoryInput } from "./registrationRepository";
import { RegistrationConcurrencyError } from "./registrationRepository";

interface RegistrationRow {
  id: string;
  farm_id: string;
  number: string;
  previous_number: string | null;
  legal_area: number | string | null;
  certificate_date: string | null;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
  version: number;
}

const selection = "id, farm_id, number, previous_number, legal_area, certificate_date, status, created_at, updated_at, version";
const formatTimestamp = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Araguaina" }).format(new Date(value));
const mapRow = (row: RegistrationRow): PersistedRegistration => ({
  id: row.id,
  farmId: row.farm_id,
  number: row.number,
  previousNumber: row.previous_number ?? undefined,
  legalArea: row.legal_area === null ? undefined : Number(row.legal_area),
  certificateDate: row.certificate_date ?? undefined,
  status: row.status,
  createdAt: formatTimestamp(row.created_at),
  updatedAt: formatTimestamp(row.updated_at),
  version: row.version,
});
const mapInput = (input: RegistrationRepositoryInput) => ({
  farm_id: input.farmId,
  number: input.number,
  previous_number: input.previousNumber || null,
  legal_area: input.legalArea ?? null,
  certificate_date: input.certificateDate || null,
  status: input.status,
});
const friendlyError = (error: PostgrestError, fallback: string) => {
  if (error.code === "23505") return new Error("Já existe uma matrícula com este número para a Fazenda selecionada.");
  if (error.code === "23503") return new Error("A Fazenda selecionada não está disponível para esta organização.");
  if (error.code === "42501") return new Error("Você não possui permissão para realizar esta ação.");
  if (error.code === "40001") return new RegistrationConcurrencyError();
  return new Error(fallback);
};
const currentOrganizationId = async () => {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error("Sua sessão não pôde ser validada. Entre novamente.");
  const { data, error } = await supabase.from("profiles").select("organization_id").eq("id", authData.user.id).eq("status", "active").maybeSingle();
  if (error || !data?.organization_id) throw new Error("Seu usuário não possui um perfil ativo para acessar o sistema.");
  return data.organization_id as string;
};

export const supabaseRegistrationRepository: RegistrationRepository = {
  async list() {
    const records: PersistedRegistration[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase.from("registrations").select(selection).is("deleted_at", null).order("number").range(offset, offset + 499);
      if (error) throw friendlyError(error, "Não foi possível carregar as matrículas.");
      const batch = ((data ?? []) as unknown as RegistrationRow[]).map(mapRow);
      records.push(...batch);
      if (batch.length < 500) return records;
    }
  },

  async listByFarm(farmId) {
    const { data, error } = await supabase.from("registrations").select(selection).eq("farm_id", farmId).is("deleted_at", null).order("number");
    if (error) throw friendlyError(error, "Não foi possível carregar as matrículas da Fazenda.");
    return ((data ?? []) as unknown as RegistrationRow[]).map(mapRow);
  },

  async getById(id) {
    const { data, error } = await supabase.from("registrations").select(selection).eq("id", id).is("deleted_at", null).maybeSingle();
    if (error) throw friendlyError(error, "Não foi possível carregar a matrícula.");
    return data ? mapRow(data as unknown as RegistrationRow) : undefined;
  },

  async getByIds(ids) {
    if (!ids.length) return [];
    const { data, error } = await supabase.from("registrations").select(selection).in("id", ids).is("deleted_at", null);
    if (error) throw friendlyError(error, "Não foi possível carregar as matrículas relacionadas.");
    return ((data ?? []) as unknown as RegistrationRow[]).map(mapRow);
  },

  async create(input) {
    const organizationId = await currentOrganizationId();
    const { data, error } = await supabase.from("registrations").insert({ organization_id: organizationId, ...mapInput(input) }).select(selection).single();
    if (error) throw friendlyError(error, "Não foi possível cadastrar a matrícula.");
    return mapRow(data as unknown as RegistrationRow);
  },

  async update(id, expectedVersion, input) {
    const { data, error } = await supabase.from("registrations").update(mapInput(input)).eq("id", id).eq("version", expectedVersion).is("deleted_at", null).select(selection).maybeSingle();
    if (error) throw friendlyError(error, "Não foi possível atualizar a matrícula.");
    if (!data) throw new RegistrationConcurrencyError();
    return mapRow(data as unknown as RegistrationRow);
  },

  async inactivate(id, expectedVersion) {
    const { data, error } = await supabase.from("registrations").update({ status: "inactive" }).eq("id", id).eq("version", expectedVersion).is("deleted_at", null).select(selection).maybeSingle();
    if (error) throw friendlyError(error, "Não foi possível inativar a matrícula.");
    if (!data) throw new RegistrationConcurrencyError();
    return mapRow(data as unknown as RegistrationRow);
  },

  async softDelete(id, expectedVersion) {
    const { data, error } = await supabase.rpc("soft_delete_record", { p_entity_type: "registrations", p_id: id, p_expected_version: expectedVersion });
    if (error) throw friendlyError(error, "Não foi possível excluir a matrícula.");
    if (data !== 1) throw new RegistrationConcurrencyError();
  },
};

