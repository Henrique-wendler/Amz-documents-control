import { mockStore } from "../data/mock/mockStore";
import { supabaseOwnerRepository } from "../repositories/supabaseOwnerRepository";
import type { PersistedOwner } from "../repositories/ownerRepository";
import type { OwnerDraft, OwnerFilters, OwnerListItem, OwnerListResponse, OwnerLoadMode, OwnerWithRelations } from "../types/proprietario";
import { formatArea } from "./searchUtils";

const toListItem = (owner: PersistedOwner): OwnerListItem => ({
  ...owner,
  farmCount: 0,
  registrationCount: 0,
  operationCount: 0,
});

const toRepositoryInput = (draft: OwnerDraft) => ({
  type: draft.type,
  name: draft.name.trim(),
  documentNumber: draft.document.replace(/\D/g, ""),
  phone: draft.phone.trim() || undefined,
  email: draft.email.trim() || undefined,
  status: draft.status,
  notes: draft.notes.trim() || undefined,
});

export const proprietarioService = {
  async list(filters: OwnerFilters, mode: OwnerLoadMode = "success"): Promise<OwnerListResponse> {
    if (mode === "error") throw new Error("Não foi possível carregar os proprietários.");
    if (mode === "empty") return { records: [], total: 0, page: 1, pageSize: filters.pageSize, totalPages: 1, summary: { total: 0, individuals: 0, companies: 0, inactive: 0 } };
    const result = await supabaseOwnerRepository.list(filters);
    if (filters.farmId) return { ...result, records: [], total: 0, page: 1, totalPages: 1 };
    return { ...result, records: result.records.map(toListItem) };
  },

  async getById(id: string): Promise<OwnerWithRelations | undefined> {
    const owner = await supabaseOwnerRepository.getById(id);
    if (!owner) return undefined;
    return { owner: toListItem(owner), farms: [] };
  },

  async create(draft: OwnerDraft): Promise<OwnerListItem> {
    return toListItem(await supabaseOwnerRepository.create(toRepositoryInput(draft)));
  },

  async update(id: string, expectedVersion: number, draft: OwnerDraft): Promise<OwnerListItem> {
    return toListItem(await supabaseOwnerRepository.update(id, expectedVersion, toRepositoryInput(draft)));
  },

  async inactivate(id: string, expectedVersion: number): Promise<OwnerListItem> {
    return toListItem(await supabaseOwnerRepository.inactivate(id, expectedVersion));
  },

  async delete(id: string, expectedVersion: number): Promise<{ deleted: boolean; reason?: "linked" }> {
    await supabaseOwnerRepository.softDelete(id, expectedVersion);
    return { deleted: true };
  },

  getFarmOptions() {
    return structuredClone(mockStore.getState().farms.map((farm) => ({ id: farm.id, name: farm.name, location: `${farm.municipality} / ${farm.state}`, area: formatArea(farm.totalArea), status: farm.status })));
  },
};
