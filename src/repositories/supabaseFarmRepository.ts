import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { FarmRepository, FarmRepositoryInput, PersistedFarm } from "./farmRepository";
import { FarmConcurrencyError } from "./farmRepository";

interface FarmRow {
  id: string;
  name: string;
  municipality: string;
  state: string;
  location: string | null;
  total_area: number | string;
  reserve_area: number | string | null;
  consolidated_area: number | string | null;
  status: "active" | "inactive";
  notes: string | null;
  created_at: string;
  updated_at: string;
  version: number;
}

const selection = "id, name, municipality, state, location, total_area, reserve_area, consolidated_area, status, notes, created_at, updated_at, version";
const permissionMessage = "Você não possui permissão para realizar esta ação.";
const formatTimestamp = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Araguaina" }).format(new Date(value));
const mapRow = (row: FarmRow): PersistedFarm => ({
  id: row.id,
  name: row.name,
  municipality: row.municipality,
  state: row.state,
  location: row.location ?? undefined,
  totalArea: Number(row.total_area),
  reserveArea: row.reserve_area === null ? undefined : Number(row.reserve_area),
  consolidatedArea: row.consolidated_area === null ? undefined : Number(row.consolidated_area),
  status: row.status,
  notes: row.notes ?? undefined,
  createdAt: formatTimestamp(row.created_at),
  updatedAt: formatTimestamp(row.updated_at),
  version: row.version,
});
const mapInput = (input: FarmRepositoryInput) => ({
  name: input.name,
  municipality: input.municipality,
  state: input.state,
  location: input.location || null,
  total_area: input.totalArea,
  reserve_area: input.reserveArea ?? null,
  consolidated_area: input.consolidatedArea ?? null,
  status: input.status,
  notes: input.notes || null,
});
const friendlyError = (error: PostgrestError, fallback: string) => {
  if (error.code === "42501") return new Error(permissionMessage);
  if (error.code === "40001") return new FarmConcurrencyError();
  return new Error(fallback);
};
const currentOrganizationId = async () => {
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) throw new Error("Sua sessão não pôde ser validada. Entre novamente.");
  const { data, error } = await supabase.from("profiles").select("organization_id").eq("id", authData.user.id).eq("status", "active").maybeSingle();
  if (error || !data?.organization_id) throw new Error("Seu usuário não possui um perfil ativo para acessar o sistema.");
  return data.organization_id as string;
};

export const supabaseFarmRepository: FarmRepository = {
  async list() {
    const records: PersistedFarm[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase.from("farms").select(selection).is("deleted_at", null).order("name").range(offset, offset + 499);
      if (error) throw friendlyError(error, "Não foi possível carregar as fazendas.");
      const batch = ((data ?? []) as unknown as FarmRow[]).map(mapRow);
      records.push(...batch);
      if (batch.length < 500) return records;
    }
  },

  async getById(id) {
    const { data, error } = await supabase.from("farms").select(selection).eq("id", id).is("deleted_at", null).maybeSingle();
    if (error) throw friendlyError(error, "Não foi possível carregar a fazenda.");
    return data ? mapRow(data as unknown as FarmRow) : undefined;
  },

  async getByIds(ids) {
    if (!ids.length) return [];
    const { data, error } = await supabase.from("farms").select(selection).in("id", ids).is("deleted_at", null);
    if (error) throw friendlyError(error, "Não foi possível carregar as fazendas relacionadas.");
    return ((data ?? []) as unknown as FarmRow[]).map(mapRow);
  },

  async create(input) {
    const organizationId = await currentOrganizationId();
    const { data, error } = await supabase.from("farms").insert({ organization_id: organizationId, ...mapInput(input) }).select(selection).single();
    if (error) throw friendlyError(error, "Não foi possível cadastrar a fazenda.");
    return mapRow(data as unknown as FarmRow);
  },

  async update(id, expectedVersion, input) {
    const { data, error } = await supabase.from("farms").update(mapInput(input)).eq("id", id).eq("version", expectedVersion).is("deleted_at", null).select(selection).maybeSingle();
    if (error) throw friendlyError(error, "Não foi possível atualizar a fazenda.");
    if (!data) throw new FarmConcurrencyError();
    return mapRow(data as unknown as FarmRow);
  },

  async inactivate(id, expectedVersion) {
    const { data, error } = await supabase.from("farms").update({ status: "inactive" }).eq("id", id).eq("version", expectedVersion).is("deleted_at", null).select(selection).maybeSingle();
    if (error) throw friendlyError(error, "Não foi possível inativar a fazenda.");
    if (!data) throw new FarmConcurrencyError();
    return mapRow(data as unknown as FarmRow);
  },

  async softDelete(id, expectedVersion) {
    const { data, error } = await supabase.rpc("soft_delete_record", { p_entity_type: "farms", p_id: id, p_expected_version: expectedVersion });
    if (error) throw friendlyError(error, "Não foi possível excluir a fazenda.");
    if (data !== 1) throw new FarmConcurrencyError();
  },
};

