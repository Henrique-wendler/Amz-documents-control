import { supabaseFarmRepository } from "../repositories/supabaseFarmRepository";
import { supabaseOwnerRepository } from "../repositories/supabaseOwnerRepository";
import { supabaseOwnershipRepository } from "../repositories/supabaseOwnershipRepository";
import { supabaseRegistrationRepository } from "../repositories/supabaseRegistrationRepository";
import type { PersistedOwnershipLink } from "../repositories/ownershipRepository";
import type { PersistedRegistration } from "../repositories/registrationRepository";
import type { OwnershipDraft, RegistrationDetailsViewModel, RegistrationDraft, RegistrationFilters, RegistrationListItem, RegistrationListResponse, RegistrationLoadMode, RegistrationSummary } from "../types/matricula";
import { normalizeSearchText } from "./searchUtils";

const dateKey = (value?: string) => {
  if (!value) return "";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) { const [day, month, year] = value.split("/"); return `${year}-${month}-${day}`; }
  return value.slice(0, 10);
};

const activePercentage = (links: PersistedOwnershipLink[], registrationId: string, excludeLinkId?: string) => links
  .filter((link) => link.registrationId === registrationId && link.status === "active" && link.id !== excludeLinkId)
  .reduce((sum, link) => sum + (link.percentage ?? 0), 0);

const buildItems = async (registrations: PersistedRegistration[]): Promise<RegistrationListItem[]> => {
  const farmIds = [...new Set(registrations.map((registration) => registration.farmId))];
  const farms = await supabaseFarmRepository.getByIds(farmIds);
  const farmById = new Map(farms.map((farm) => [farm.id, farm]));
  const registrationIds = new Set(registrations.map((registration) => registration.id));
  const links = (await supabaseOwnershipRepository.list()).filter((link) => registrationIds.has(link.registrationId));
  return registrations.map((registration) => {
    const farm = farmById.get(registration.farmId);
    const registrationLinks = links.filter((link) => link.registrationId === registration.id);
    return {
      ...registration,
      farmName: farm?.name ?? "Fazenda não encontrada",
      farmLocation: farm ? `${farm.municipality} / ${farm.state}` : "—",
      ownerCount: new Set(registrationLinks.filter((link) => link.status === "active").map((link) => link.ownerId)).size,
      ownershipLinkCount: registrationLinks.length,
      operationCount: 0,
      guaranteeCount: 0,
      documentCount: 0,
      activePercentage: activePercentage(links, registration.id),
    };
  });
};

const toInput = (draft: RegistrationDraft) => ({
  farmId: draft.farmId,
  number: draft.number.trim(),
  previousNumber: draft.previousNumber.trim() || undefined,
  legalArea: draft.legalArea,
  certificateDate: draft.certificateDate || undefined,
  status: draft.status,
});

const toOwnershipInput = (draft: OwnershipDraft) => ({
  ownerId: draft.ownerId,
  type: draft.type,
  percentage: draft.percentage,
  status: draft.status,
  startDate: draft.startDate || undefined,
});

const relationMatch = (value: "all" | "with" | "without", count: number) => value === "all" || (value === "with" ? count > 0 : count === 0);

export const registrationService = {
  async list(filters: RegistrationFilters, mode: RegistrationLoadMode = "success"): Promise<RegistrationListResponse> {
    if (mode === "error") throw new Error("Não foi possível carregar as matrículas.");
    const registrations = mode === "empty" ? [] : await supabaseRegistrationRepository.list();
    const items = await buildItems(registrations);
    const query = normalizeSearchText(filters.query);
    const filtered = items
      .filter((registration) => !query || normalizeSearchText([registration.number, registration.previousNumber, registration.farmName, registration.farmLocation].filter(Boolean).join(" ")).includes(query))
      .filter((registration) => !filters.farmId || registration.farmId === filters.farmId)
      .filter((registration) => filters.status === "all" || registration.status === filters.status)
      .filter((registration) => relationMatch(filters.ownerRelation, registration.ownerCount))
      .filter((registration) => relationMatch(filters.operationRelation, registration.operationCount))
      .filter((registration) => relationMatch(filters.guaranteeRelation, registration.guaranteeCount))
      .filter(() => filters.hp === "all")
      .filter((registration) => filters.areaRange === "all"
        || (filters.areaRange === "up-to-1000" && (registration.legalArea ?? 0) <= 1000)
        || (filters.areaRange === "1000-1800" && (registration.legalArea ?? 0) > 1000 && (registration.legalArea ?? 0) <= 1800)
        || (filters.areaRange === "above-1800" && (registration.legalArea ?? 0) > 1800))
      .filter((registration) => !filters.certificateFrom || dateKey(registration.certificateDate) >= filters.certificateFrom)
      .sort((left, right) => left.number.localeCompare(right.number, "pt-BR", { numeric: true }));
    const totalPages = Math.max(Math.ceil(filtered.length / filters.pageSize), 1);
    const page = Math.min(filters.page, totalPages);
    const start = (page - 1) * filters.pageSize;
    const summary: RegistrationSummary = {
      total: items.length,
      active: items.filter((registration) => registration.status === "active").length,
      legalArea: items.reduce((sum, registration) => sum + (registration.legalArea ?? 0), 0),
      withoutActiveOwner: items.filter((registration) => registration.ownerCount === 0).length,
    };
    return { records: filtered.slice(start, start + filters.pageSize), total: filtered.length, page, pageSize: filters.pageSize, totalPages, summary };
  },

  async getById(id: string): Promise<RegistrationListItem | undefined> {
    const registration = await supabaseRegistrationRepository.getById(id);
    if (!registration) return undefined;
    return (await buildItems([registration]))[0];
  },

  async getDetails(id: string): Promise<RegistrationDetailsViewModel | undefined> {
    const registration = await supabaseRegistrationRepository.getById(id);
    if (!registration) return undefined;
    const farm = await supabaseFarmRepository.getById(registration.farmId);
    const links = await supabaseOwnershipRepository.listByRegistration(id);
    const owners = await supabaseOwnerRepository.listAll();
    const ownerById = new Map(owners.map((owner) => [owner.id, owner]));
    const ownerships = links.flatMap((link) => {
      const owner = ownerById.get(link.ownerId);
      return owner ? [{ link, owner }] : [];
    });
    return {
      registration: (await buildItems([registration]))[0],
      farm,
      ownerships,
      operations: [],
      guarantees: [],
      documents: [],
      activePercentage: activePercentage(links, id),
    };
  },

  async create(draft: RegistrationDraft): Promise<RegistrationListItem> {
    const registration = await supabaseRegistrationRepository.create(toInput(draft));
    return (await buildItems([registration]))[0];
  },

  async update(id: string, expectedVersion: number, draft: RegistrationDraft): Promise<RegistrationListItem> {
    const registration = await supabaseRegistrationRepository.update(id, expectedVersion, toInput(draft));
    return (await buildItems([registration]))[0];
  },

  async inactivate(id: string, expectedVersion: number): Promise<RegistrationListItem> {
    const registration = await supabaseRegistrationRepository.inactivate(id, expectedVersion);
    return (await buildItems([registration]))[0];
  },

  async delete(id: string, expectedVersion: number): Promise<{ deleted: boolean; reason?: "linked" }> {
    if ((await supabaseOwnershipRepository.listByRegistration(id)).length) return { deleted: false, reason: "linked" };
    try {
      await supabaseRegistrationRepository.softDelete(id, expectedVersion);
      return { deleted: true };
    } catch (error) {
      if (error instanceof Error && /vínculo|refer|propriet/i.test(error.message)) return { deleted: false, reason: "linked" };
      throw error;
    }
  },

  async createOwnershipLink(registrationId: string, draft: OwnershipDraft) {
    const existing = await supabaseOwnershipRepository.listByRegistration(registrationId);
    if (existing.some((link) => link.ownerId === draft.ownerId && link.status === "active")) throw new Error("Este proprietário já possui um vínculo ativo com a matrícula.");
    return supabaseOwnershipRepository.create(registrationId, toOwnershipInput(draft));
  },

  async updateOwnershipLink(id: string, expectedVersion: number, draft: OwnershipDraft) {
    const current = await supabaseOwnershipRepository.getById(id);
    if (!current) throw new Error("Vínculo não encontrado.");
    const existing = await supabaseOwnershipRepository.listByRegistration(current.registrationId);
    if (existing.some((link) => link.id !== id && link.ownerId === draft.ownerId && link.status === "active")) throw new Error("Este proprietário já possui um vínculo ativo com a matrícula.");
    return supabaseOwnershipRepository.update(id, expectedVersion, toOwnershipInput(draft));
  },

  async closeOwnershipLink(id: string, expectedVersion: number) { return supabaseOwnershipRepository.close(id, expectedVersion); },
  async deleteOwnershipLink(id: string, expectedVersion: number) { return supabaseOwnershipRepository.softDelete(id, expectedVersion); },
  async getFarmOptions() { return (await supabaseFarmRepository.list()).map((farm) => ({ id: farm.id, name: farm.name, label: `${farm.name} — ${farm.municipality}/${farm.state}` })); },
  async getOwnerOptions() { return (await supabaseOwnerRepository.listAll()).filter((owner) => owner.status === "active").map((owner) => ({ id: owner.id, name: owner.name, document: owner.document, type: owner.type, label: `${owner.name} — ${owner.type === "individual" ? "CPF" : "CNPJ"} ${owner.document}` })); },
  async getActivePercentage(registrationId: string, excludeLinkId?: string) { return activePercentage(await supabaseOwnershipRepository.listByRegistration(registrationId), registrationId, excludeLinkId); },
};
