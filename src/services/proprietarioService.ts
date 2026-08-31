import { supabaseFarmRepository } from "../repositories/supabaseFarmRepository";
import { supabaseOwnerRepository } from "../repositories/supabaseOwnerRepository";
import { supabaseOwnershipRepository } from "../repositories/supabaseOwnershipRepository";
import { supabaseRegistrationRepository } from "../repositories/supabaseRegistrationRepository";
import type { PersistedOwner } from "../repositories/ownerRepository";
import type { OwnerDraft, OwnerFilters, OwnerListItem, OwnerListResponse, OwnerLoadMode, OwnerWithRelations } from "../types/proprietario";
import { formatArea } from "./searchUtils";

interface OwnerRelations { farmIds: Set<string>; registrationIds: Set<string>; }

const toListItem = (owner: PersistedOwner, relations?: OwnerRelations): OwnerListItem => ({
  ...owner,
  farmCount: relations?.farmIds.size ?? 0,
  registrationCount: relations?.registrationIds.size ?? 0,
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

const loadRelations = async () => {
  const [links, registrations] = await Promise.all([supabaseOwnershipRepository.list(), supabaseRegistrationRepository.list()]);
  const registrationById = new Map(registrations.map((registration) => [registration.id, registration]));
  const byOwner = new Map<string, OwnerRelations>();
  for (const link of links.filter((item) => item.status === "active")) {
    const registration = registrationById.get(link.registrationId);
    if (!registration) continue;
    const current = byOwner.get(link.ownerId) ?? { farmIds: new Set<string>(), registrationIds: new Set<string>() };
    current.farmIds.add(registration.farmId);
    current.registrationIds.add(registration.id);
    byOwner.set(link.ownerId, current);
  }
  return { byOwner, registrations };
};

export const proprietarioService = {
  async list(filters: OwnerFilters, mode: OwnerLoadMode = "success"): Promise<OwnerListResponse> {
    if (mode === "error") throw new Error("Não foi possível carregar os proprietários.");
    if (mode === "empty") return { records: [], total: 0, page: 1, pageSize: filters.pageSize, totalPages: 1, summary: { total: 0, individuals: 0, companies: 0, inactive: 0 } };
    const { byOwner } = await loadRelations();
    const ownerIds = filters.farmId ? [...byOwner.entries()].filter(([, relations]) => relations.farmIds.has(filters.farmId)).map(([ownerId]) => ownerId) : undefined;
    const result = await supabaseOwnerRepository.list({ ...filters, ownerIds });
    return { ...result, records: result.records.map((owner) => toListItem(owner, byOwner.get(owner.id))) };
  },

  async getById(id: string): Promise<OwnerWithRelations | undefined> {
    const owner = await supabaseOwnerRepository.getById(id);
    if (!owner) return undefined;
    const { byOwner, registrations } = await loadRelations();
    const relations = byOwner.get(id);
    const farmIds = [...(relations?.farmIds ?? [])];
    const farms = await supabaseFarmRepository.getByIds(farmIds);
    const farmById = new Map(farms.map((farm) => [farm.id, farm]));
    return {
      owner: toListItem(owner, relations),
      farms: farms.map((farm) => ({ id: farm.id, name: farm.name, location: `${farm.municipality} / ${farm.state}`, area: formatArea(farm.totalArea), status: farm.status })),
      registrations: registrations.filter((registration) => relations?.registrationIds.has(registration.id)).map((registration) => ({ id: registration.id, farmId: registration.farmId, farmName: farmById.get(registration.farmId)?.name ?? "Fazenda não encontrada", number: registration.number, status: registration.status })),
    };
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
    if ((await supabaseOwnershipRepository.listByOwner(id)).length) return { deleted: false, reason: "linked" };
    try {
      await supabaseOwnerRepository.softDelete(id, expectedVersion);
      return { deleted: true };
    } catch (error) {
      if (error instanceof Error && /vínculo|refer|matrícula/i.test(error.message)) return { deleted: false, reason: "linked" };
      throw error;
    }
  },

  async getFarmOptions() {
    return (await supabaseFarmRepository.list()).map((farm) => ({ id: farm.id, name: farm.name, location: `${farm.municipality} / ${farm.state}`, area: formatArea(farm.totalArea), status: farm.status }));
  },
};
