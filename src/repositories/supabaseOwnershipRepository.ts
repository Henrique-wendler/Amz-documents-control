import type { PostgrestError } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { OwnershipRepository, OwnershipRepositoryInput, PersistedOwnershipLink } from "./ownershipRepository";
import { OwnershipConcurrencyError } from "./ownershipRepository";
import { toPostgresDate } from "./civilDate";

interface OwnershipRow {
  id: string;
  owner_id: string;
  registration_id: string;
  ownership_type: "owner" | "co_owner" | "usufructuary" | "other";
  percentage: number | string | null;
  status: "active" | "inactive";
  start_date: string | null;
  end_date: string | null;
  version: number;
}

const selection = "id, owner_id, registration_id, ownership_type, percentage, status, start_date, end_date, version";
const typeFromDatabase = { owner: "owner", co_owner: "co-owner", usufructuary: "usufructuary", other: "other" } as const;
const typeToDatabase = { owner: "owner", "co-owner": "co_owner", usufructuary: "usufructuary", other: "other" } as const;
const mapRow = (row: OwnershipRow): PersistedOwnershipLink => ({
  id: row.id,
  ownerId: row.owner_id,
  registrationId: row.registration_id,
  type: typeFromDatabase[row.ownership_type],
  percentage: row.percentage === null ? undefined : Number(row.percentage),
  status: row.status,
  startDate: row.start_date ?? undefined,
  endDate: row.end_date ?? undefined,
  version: row.version,
});
const mapInput = (input: OwnershipRepositoryInput) => ({
  p_owner_id: input.ownerId,
  p_ownership_type: typeToDatabase[input.type],
  p_percentage: input.percentage ?? null,
  p_status: input.status,
  p_start_date: toPostgresDate(input.startDate),
  p_end_date: toPostgresDate(input.endDate),
});
const friendlyError = (error: PostgrestError, fallback: string) => {
  if (error.code === "23514") return new Error("A soma dos percentuais ativos desta matrícula ultrapassaria 100%.");
  if (error.code === "23503") return new Error("O proprietário ou a matrícula não pertence à organização atual.");
  if (error.code === "42501") return new Error("Você não possui permissão para gerenciar vínculos de propriedade.");
  if (error.code === "40001") return new OwnershipConcurrencyError();
  return new Error(fallback);
};

export const supabaseOwnershipRepository: OwnershipRepository = {
  async list() {
    const records: PersistedOwnershipLink[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase.from("ownership_links").select(selection).is("deleted_at", null).range(offset, offset + 499);
      if (error) throw friendlyError(error, "Não foi possível carregar os vínculos de propriedade.");
      const batch = ((data ?? []) as unknown as OwnershipRow[]).map(mapRow);
      records.push(...batch);
      if (batch.length < 500) return records;
    }
  },

  async listByRegistration(registrationId) {
    const { data, error } = await supabase.from("ownership_links").select(selection).eq("registration_id", registrationId).is("deleted_at", null).order("start_date");
    if (error) throw friendlyError(error, "Não foi possível carregar os vínculos da matrícula.");
    return ((data ?? []) as unknown as OwnershipRow[]).map(mapRow);
  },

  async listByOwner(ownerId) {
    const { data, error } = await supabase.from("ownership_links").select(selection).eq("owner_id", ownerId).is("deleted_at", null).order("start_date");
    if (error) throw friendlyError(error, "Não foi possível carregar os vínculos do proprietário.");
    return ((data ?? []) as unknown as OwnershipRow[]).map(mapRow);
  },

  async getById(id) {
    const { data, error } = await supabase.from("ownership_links").select(selection).eq("id", id).is("deleted_at", null).maybeSingle();
    if (error) throw friendlyError(error, "Não foi possível carregar o vínculo.");
    return data ? mapRow(data as unknown as OwnershipRow) : undefined;
  },

  async create(registrationId, input) {
    const { data, error } = await supabase.rpc("create_ownership_link", { p_registration_id: registrationId, ...mapInput(input) });
    if (error) throw friendlyError(error, "Não foi possível criar o vínculo de propriedade.");
    return mapRow(data as unknown as OwnershipRow);
  },

  async update(id, expectedVersion, input) {
    const { data, error } = await supabase.rpc("update_ownership_link", { p_id: id, p_expected_version: expectedVersion, ...mapInput(input) });
    if (error) throw friendlyError(error, "Não foi possível atualizar o vínculo de propriedade.");
    if (!data) throw new OwnershipConcurrencyError();
    return mapRow(data as unknown as OwnershipRow);
  },

  async close(id, expectedVersion) {
    const current = await this.getById(id);
    if (!current) throw new OwnershipConcurrencyError();
    const endDate = new Date().toISOString().slice(0, 10);
    return this.update(id, expectedVersion, { ownerId: current.ownerId, type: current.type, percentage: current.percentage, status: "inactive", startDate: current.startDate, endDate });
  },

  async softDelete(id, expectedVersion) {
    const { data, error } = await supabase.rpc("soft_delete_record", { p_entity_type: "ownership_links", p_id: id, p_expected_version: expectedVersion });
    if (error) throw friendlyError(error, "Não foi possível excluir o vínculo de propriedade.");
    if (data !== 1) throw new OwnershipConcurrencyError();
  },
};
