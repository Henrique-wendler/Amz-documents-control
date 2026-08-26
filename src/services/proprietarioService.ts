import { mockStore } from "../data/mock/mockStore";
import { getFarmsByOwner, getOwnerRelationCounts } from "../data/mock/selectors";
import type { Owner } from "../types/domain";
import type { OwnerDraft, OwnerFilters, OwnerListItem, OwnerListResponse, OwnerLoadMode, OwnerSummary, OwnerWithRelations } from "../types/proprietario";
import { formatArea, normalizeSearchText } from "./searchUtils";

const delay = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
const clone = <T,>(value: T): T => structuredClone(value);
const toListItem = (owner: Owner): OwnerListItem => ({ ...owner, ...getOwnerRelationCounts(owner.id) });

const summaryFrom = (records: Owner[]): OwnerSummary => ({
  total: records.length,
  individuals: records.filter((owner) => owner.type === "individual").length,
  companies: records.filter((owner) => owner.type === "company").length,
  inactive: records.filter((owner) => owner.status === "inactive").length,
});

const ownerSearchText = (owner: Owner) => normalizeSearchText([owner.name, owner.document, owner.phone, owner.email, owner.notes].filter(Boolean).join(" "));

export const proprietarioService = {
  async list(filters: OwnerFilters, mode: OwnerLoadMode = "success"): Promise<OwnerListResponse> {
    await delay(300);
    if (mode === "error") throw new Error("Não foi possível carregar os proprietários.");
    if (mode === "empty") return { records: [], total: 0, page: 1, pageSize: filters.pageSize, totalPages: 1, summary: summaryFrom([]) };
    const db = mockStore.getState();
    const query = normalizeSearchText(filters.query);
    const filtered = db.owners
      .filter((owner) => !query || ownerSearchText(owner).includes(query))
      .filter((owner) => filters.type === "all" || owner.type === filters.type)
      .filter((owner) => filters.status === "all" || owner.status === filters.status)
      .filter((owner) => !filters.farmId || getFarmsByOwner(owner.id, db).some((farm) => farm.id === filters.farmId))
      .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
    const totalPages = Math.max(Math.ceil(filtered.length / filters.pageSize), 1);
    const page = Math.min(filters.page, totalPages);
    const start = (page - 1) * filters.pageSize;
    return { records: clone(filtered.slice(start, start + filters.pageSize).map(toListItem)), total: filtered.length, page, pageSize: filters.pageSize, totalPages, summary: summaryFrom(db.owners) };
  },

  async getById(id: string): Promise<OwnerWithRelations | undefined> {
    await delay(120);
    const owner = mockStore.getState().owners.find((item) => item.id === id);
    if (!owner) return undefined;
    const farms = getFarmsByOwner(id).map((farm) => ({ id: farm.id, name: farm.name, location: `${farm.municipality} / ${farm.state}`, area: formatArea(farm.totalArea), status: farm.status }));
    return clone({ owner: toListItem(owner), farms });
  },

  async create(draft: OwnerDraft): Promise<OwnerListItem> {
    await delay(240);
    const owners = mockStore.getState().owners;
    if (owners.some((owner) => normalizeSearchText(owner.document) === normalizeSearchText(draft.document))) throw new Error("Já existe um proprietário cadastrado com este CPF/CNPJ.");
    return toListItem(mockStore.createOwner(draft));
  },

  async update(id: string, draft: OwnerDraft): Promise<OwnerListItem> {
    await delay(240);
    const owners = mockStore.getState().owners;
    if (owners.some((owner) => owner.id !== id && normalizeSearchText(owner.document) === normalizeSearchText(draft.document))) throw new Error("Já existe outro proprietário cadastrado com este CPF/CNPJ.");
    return toListItem(mockStore.updateOwner(id, draft));
  },

  async inactivate(id: string): Promise<OwnerListItem> {
    await delay(220);
    return toListItem(mockStore.updateOwner(id, { status: "inactive" }));
  },

  async delete(id: string): Promise<{ deleted: boolean; reason?: "linked" }> {
    await delay(220);
    const owner = mockStore.getState().owners.find((item) => item.id === id);
    if (!owner) return { deleted: true };
    const counts = getOwnerRelationCounts(id);
    if (counts.farmCount || counts.registrationCount || counts.operationCount) return { deleted: false, reason: "linked" };
    mockStore.deleteOwner(id);
    return { deleted: true };
  },

  getFarmOptions() {
    return clone(mockStore.getState().farms.map((farm) => ({ id: farm.id, name: farm.name, location: `${farm.municipality} / ${farm.state}`, area: formatArea(farm.totalArea), status: farm.status })));
  },
};
