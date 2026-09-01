import { supabaseFarmRepository } from "../repositories/supabaseFarmRepository";
import { supabaseOwnerRepository } from "../repositories/supabaseOwnerRepository";
import { supabaseOwnershipRepository } from "../repositories/supabaseOwnershipRepository";
import { supabaseRegistrationRepository } from "../repositories/supabaseRegistrationRepository";
import { supabaseDocumentRepository } from "../repositories/supabaseDocumentRepository";
import { supabaseCarRepository } from "../repositories/supabaseCarRepository";
import type { PersistedFarm } from "../repositories/farmRepository";
import type { FarmDetailsViewModel, FarmDraft, FarmFilters, FarmListItem, FarmListResponse, FarmLoadMode, FarmSummary } from "../types/fazenda";
import { normalizeSearchText } from "./searchUtils";
import { operationService } from "./operationService";

const relationMatch = (value: "all" | "yes" | "no", count: number) => value === "all" || (value === "yes" ? count > 0 : count === 0);

const toInput = (draft: FarmDraft) => ({
  name: draft.name.trim(),
  municipality: draft.municipality.trim(),
  state: draft.state.trim().toUpperCase(),
  location: draft.location.trim() || undefined,
  totalArea: draft.totalArea,
  reserveArea: draft.reserveArea,
  consolidatedArea: draft.consolidatedArea,
  status: draft.status,
  notes: draft.notes.trim() || undefined,
});

const summaryFrom = (farms: FarmListItem[]): FarmSummary => ({
  total: farms.length,
  active: farms.filter((farm) => farm.status === "active").length,
  totalArea: farms.reduce((sum, farm) => sum + farm.totalArea, 0),
  registrations: farms.reduce((sum, farm) => sum + farm.registrationCount, 0),
});

const buildItems = async (farms: PersistedFarm[]): Promise<FarmListItem[]> => {
  const [registrations, documents, cars, related] = await Promise.all([supabaseRegistrationRepository.list(), supabaseDocumentRepository.list(), supabaseCarRepository.list(), operationService.listRelatedViews()]);
  const registrationIds = new Set(registrations.map((registration) => registration.id));
  const links = (await supabaseOwnershipRepository.list()).filter((link) => registrationIds.has(link.registrationId));

  return farms.map((farm) => {
    const farmRegistrations = registrations.filter((registration) => registration.farmId === farm.id);
    const farmRegistrationIds = new Set(farmRegistrations.map((registration) => registration.id));
    const ownerIds = new Set(links.filter((link) => link.status === "active" && farmRegistrationIds.has(link.registrationId)).map((link) => link.ownerId));
    const operations = related.operations.filter((operation) => operation.registrationIds.some((id) => farmRegistrationIds.has(id)));
    return {
      ...farm,
      registrationCount: farmRegistrations.length,
      ownerCount: ownerIds.size,
      activeOperationCount: operations.filter((operation) => operation.status === "active").length,
      operationCount: operations.length,
      documentCount: documents.filter((document) => document.farmId === farm.id).length,
      carCount: cars.filter((car) => car.farmId === farm.id).length,
    };
  });
};

export const farmService = {
  async list(filters: FarmFilters, mode: FarmLoadMode = "success"): Promise<FarmListResponse> {
    if (mode === "error") throw new Error("Não foi possível carregar as fazendas.");
    const farms = mode === "empty" ? [] : await supabaseFarmRepository.list();
    const items = await buildItems(farms);
    const query = normalizeSearchText(filters.query);
    const filtered = items
      .filter((farm) => !query || normalizeSearchText([farm.name, farm.municipality, farm.state, farm.location, farm.notes].filter(Boolean).join(" ")).includes(query))
      .filter((farm) => filters.status === "all" || farm.status === filters.status)
      .filter((farm) => !filters.state || farm.state === filters.state)
      .filter((farm) => !filters.municipality || farm.municipality === filters.municipality)
      .filter((farm) => filters.areaRange === "all"
        || (filters.areaRange === "up-to-2000" && farm.totalArea <= 2000)
        || (filters.areaRange === "2000-3500" && farm.totalArea > 2000 && farm.totalArea <= 3500)
        || (filters.areaRange === "above-3500" && farm.totalArea > 3500))
      .filter((farm) => relationMatch(filters.hasRegistration, farm.registrationCount))
      .filter((farm) => relationMatch(filters.hasActiveOperation, farm.activeOperationCount))
      .filter((farm) => relationMatch(filters.hasCar, farm.carCount))
      .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
    const totalPages = Math.max(Math.ceil(filtered.length / filters.pageSize), 1);
    const page = Math.min(filters.page, totalPages);
    const start = (page - 1) * filters.pageSize;
    return {
      records: filtered.slice(start, start + filters.pageSize),
      total: filtered.length,
      page,
      pageSize: filters.pageSize,
      totalPages,
      summary: summaryFrom(items),
      states: [...new Set(farms.map((farm) => farm.state))].sort(),
      municipalities: [...new Set(farms.filter((farm) => !filters.state || farm.state === filters.state).map((farm) => farm.municipality))].sort((a, b) => a.localeCompare(b, "pt-BR")),
    };
  },

  async getById(id: string): Promise<FarmListItem | undefined> {
    const farm = await supabaseFarmRepository.getById(id);
    if (!farm) return undefined;
    return (await buildItems([farm]))[0];
  },

  async getDetails(id: string): Promise<FarmDetailsViewModel | undefined> {
    const farm = await supabaseFarmRepository.getById(id);
    if (!farm) return undefined;
    const [registrations, documents, cars, related] = await Promise.all([supabaseRegistrationRepository.listByFarm(id), supabaseDocumentRepository.listByFarm(id), supabaseCarRepository.listByFarm(id), operationService.listRelatedViews()]);
    const registrationIds = new Set(registrations.map((registration) => registration.id));
    const links = (await supabaseOwnershipRepository.list()).filter((link) => link.status === "active" && registrationIds.has(link.registrationId));
    const ownerIds = new Set(links.map((link) => link.ownerId));
    const owners = (await supabaseOwnerRepository.listAll()).filter((owner) => ownerIds.has(owner.id));
    return {
      farm: (await buildItems([farm]))[0],
      registrations,
      owners,
      operations: related.operations.filter((operation) => operation.registrationIds.some((registrationId) => registrationIds.has(registrationId))),
      documents,
      cars,
    };
  },

  async create(draft: FarmDraft): Promise<FarmListItem> {
    const farm = await supabaseFarmRepository.create(toInput(draft));
    return (await buildItems([farm]))[0];
  },

  async update(id: string, expectedVersion: number, draft: FarmDraft): Promise<FarmListItem> {
    const farm = await supabaseFarmRepository.update(id, expectedVersion, toInput(draft));
    return (await buildItems([farm]))[0];
  },

  async inactivate(id: string, expectedVersion: number): Promise<FarmListItem> {
    const farm = await supabaseFarmRepository.inactivate(id, expectedVersion);
    return (await buildItems([farm]))[0];
  },

  async delete(id: string, expectedVersion: number): Promise<{ deleted: boolean; reason?: "linked" }> {
    if ((await supabaseRegistrationRepository.listByFarm(id)).length) return { deleted: false, reason: "linked" };
    try {
      await supabaseFarmRepository.softDelete(id, expectedVersion);
      return { deleted: true };
    } catch (error) {
      if (error instanceof Error && /vínculo|refer|matrícula/i.test(error.message)) return { deleted: false, reason: "linked" };
      throw error;
    }
  },

  async getOptions() {
    return (await supabaseFarmRepository.list()).map((farm) => ({ id: farm.id, name: farm.name, label: `${farm.name} — ${farm.municipality}/${farm.state}` }));
  },
};
