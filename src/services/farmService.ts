import { mockStore } from "../data/mock/mockStore";
import {
  getCarByFarm,
  getDocumentsByFarm,
  getFarmRelationCounts,
  getOperationsByFarm,
  getOwnersByFarm,
  getRegistrationsByFarm,
} from "../data/mock/selectors";
import type { Farm } from "../types/domain";
import type { FarmDetailsViewModel, FarmDraft, FarmFilters, FarmListItem, FarmListResponse, FarmLoadMode, FarmSummary } from "../types/fazenda";
import { normalizeSearchText } from "./searchUtils";

const delay = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
const clone = <T,>(value: T): T => structuredClone(value);
const toListItem = (farm: Farm): FarmListItem => ({ ...farm, ...getFarmRelationCounts(farm.id) });

const summaryFrom = (farms: Farm[]): FarmSummary => ({
  total: farms.length,
  active: farms.filter((farm) => farm.status === "active").length,
  totalArea: farms.reduce((sum, farm) => sum + farm.totalArea, 0),
  registrations: farms.reduce((sum, farm) => sum + getRegistrationsByFarm(farm.id).length, 0),
});

const farmSearchText = (farm: Farm) => normalizeSearchText([farm.name, farm.municipality, farm.state, farm.location, farm.notes].filter(Boolean).join(" "));
const hasRelation = (value: "all" | "yes" | "no", count: number) => value === "all" || (value === "yes" ? count > 0 : count === 0);

export const farmService = {
  async list(filters: FarmFilters, mode: FarmLoadMode = "success"): Promise<FarmListResponse> {
    await delay(300);
    if (mode === "error") throw new Error("Não foi possível carregar as fazendas.");
    const allFarms = mode === "empty" ? [] : mockStore.getState().farms;
    const query = normalizeSearchText(filters.query);
    const filtered = allFarms.map(toListItem)
      .filter((farm) => !query || farmSearchText(farm).includes(query))
      .filter((farm) => filters.status === "all" || farm.status === filters.status)
      .filter((farm) => !filters.state || farm.state === filters.state)
      .filter((farm) => !filters.municipality || farm.municipality === filters.municipality)
      .filter((farm) => filters.areaRange === "all"
        || (filters.areaRange === "up-to-2000" && farm.totalArea <= 2000)
        || (filters.areaRange === "2000-3500" && farm.totalArea > 2000 && farm.totalArea <= 3500)
        || (filters.areaRange === "above-3500" && farm.totalArea > 3500))
      .filter((farm) => hasRelation(filters.hasRegistration, farm.registrationCount))
      .filter((farm) => hasRelation(filters.hasActiveOperation, farm.activeOperationCount))
      .filter((farm) => hasRelation(filters.hasCar, farm.carCount))
      .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
    const totalPages = Math.max(Math.ceil(filtered.length / filters.pageSize), 1);
    const page = Math.min(filters.page, totalPages);
    const start = (page - 1) * filters.pageSize;
    const states = [...new Set(allFarms.map((farm) => farm.state))].sort();
    const municipalities = [...new Set(allFarms.filter((farm) => !filters.state || farm.state === filters.state).map((farm) => farm.municipality))].sort((a, b) => a.localeCompare(b, "pt-BR"));
    return {
      records: clone(filtered.slice(start, start + filters.pageSize)),
      total: filtered.length,
      page,
      pageSize: filters.pageSize,
      totalPages,
      summary: summaryFrom(allFarms),
      states,
      municipalities,
    };
  },

  async getById(id: string): Promise<FarmListItem | undefined> {
    await delay(100);
    const farm = mockStore.getState().farms.find((item) => item.id === id);
    return farm ? clone(toListItem(farm)) : undefined;
  },

  async getDetails(id: string): Promise<FarmDetailsViewModel | undefined> {
    await delay(140);
    const farm = mockStore.getState().farms.find((item) => item.id === id);
    if (!farm) return undefined;
    return clone({
      farm: toListItem(farm),
      registrations: getRegistrationsByFarm(id),
      owners: getOwnersByFarm(id),
      operations: getOperationsByFarm(id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      documents: getDocumentsByFarm(id).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      car: getCarByFarm(id),
    });
  },

  async create(draft: FarmDraft): Promise<FarmListItem> {
    await delay(240);
    const duplicate = mockStore.getState().farms.some((farm) => normalizeSearchText(farm.name) === normalizeSearchText(draft.name) && normalizeSearchText(farm.municipality) === normalizeSearchText(draft.municipality));
    if (duplicate) throw new Error("Já existe uma fazenda com este nome no município informado.");
    return toListItem(mockStore.createFarm(draft));
  },

  async update(id: string, draft: FarmDraft): Promise<FarmListItem> {
    await delay(240);
    const duplicate = mockStore.getState().farms.some((farm) => farm.id !== id && normalizeSearchText(farm.name) === normalizeSearchText(draft.name) && normalizeSearchText(farm.municipality) === normalizeSearchText(draft.municipality));
    if (duplicate) throw new Error("Já existe outra fazenda com este nome no município informado.");
    return toListItem(mockStore.updateFarm(id, draft));
  },

  async inactivate(id: string): Promise<FarmListItem> {
    await delay(220);
    return toListItem(mockStore.updateFarm(id, { status: "inactive" }));
  },

  async delete(id: string): Promise<{ deleted: boolean; reason?: "linked" }> {
    await delay(220);
    const farm = mockStore.getState().farms.find((item) => item.id === id);
    if (!farm) return { deleted: true };
    const counts = getFarmRelationCounts(id);
    if (counts.registrationCount || counts.operationCount || counts.documentCount || counts.carCount) return { deleted: false, reason: "linked" };
    mockStore.deleteFarm(id);
    return { deleted: true };
  },

  validateIntegrity() {
    return clone(mockStore.validate());
  },
};
