import { mockStore } from "../data/mock/mockStore";
import {
  getActiveOwnershipPercentage,
  getDocumentsByRegistration,
  getDocumentValidityStatus,
  getFarmByRegistration,
  getGuaranteesByRegistration,
  getOperationsByRegistration,
  getOwnersByRegistration,
  getOwnershipLinksByRegistration,
  getRegistrationRelationCounts,
} from "../data/mock/selectors";
import type { Registration } from "../types/domain";
import type { OwnershipDraft, RegistrationDetailsViewModel, RegistrationDraft, RegistrationFilters, RegistrationListItem, RegistrationListResponse, RegistrationLoadMode, RegistrationSummary } from "../types/matricula";
import { normalizeSearchText } from "./searchUtils";

const delay = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
const clone = <T,>(value: T): T => structuredClone(value);
const dateKey = (value?: string) => {
  if (!value) return "";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) { const [day, month, year] = value.split("/"); return `${year}-${month}-${day}`; }
  return value.slice(0, 10);
};

const toListItem = (registration: Registration): RegistrationListItem => {
  const farm = getFarmByRegistration(registration.id);
  return {
    ...registration,
    farmName: farm?.name ?? "Fazenda não encontrada",
    farmLocation: farm ? `${farm.municipality} / ${farm.state}` : "—",
    ...getRegistrationRelationCounts(registration.id),
  };
};

const summaryFrom = (registrations: Registration[]): RegistrationSummary => ({
  total: registrations.length,
  active: registrations.filter((registration) => registration.status === "active").length,
  legalArea: registrations.reduce((sum, registration) => sum + (registration.legalArea ?? 0), 0),
  withoutActiveOwner: registrations.filter((registration) => getOwnersByRegistration(registration.id).length === 0).length,
});

const relationMatch = (value: "all" | "with" | "without", count: number) => value === "all" || (value === "with" ? count > 0 : count === 0);

const ensurePercentage = (registrationId: string, percentage: number | undefined, excludeLinkId?: string) => {
  if (percentage === undefined) return;
  const current = getActiveOwnershipPercentage(registrationId, undefined, excludeLinkId);
  if (current + percentage > 100.00001) throw new Error("A soma dos percentuais ativos desta matrícula ultrapassaria 100%.");
};

export const registrationService = {
  async list(filters: RegistrationFilters, mode: RegistrationLoadMode = "success"): Promise<RegistrationListResponse> {
    await delay(300);
    if (mode === "error") throw new Error("Não foi possível carregar as matrículas.");
    const registrations = mode === "empty" ? [] : mockStore.getState().registrations;
    const query = normalizeSearchText(filters.query);
    const filtered = registrations.map(toListItem)
      .filter((registration) => !query || normalizeSearchText([registration.number, registration.previousNumber, registration.farmName, registration.farmLocation, registration.hp].filter(Boolean).join(" ")).includes(query))
      .filter((registration) => !filters.farmId || registration.farmId === filters.farmId)
      .filter((registration) => filters.status === "all" || registration.status === filters.status)
      .filter((registration) => relationMatch(filters.ownerRelation, registration.ownerCount))
      .filter((registration) => relationMatch(filters.operationRelation, registration.operationCount))
      .filter((registration) => relationMatch(filters.guaranteeRelation, registration.guaranteeCount))
      .filter((registration) => filters.hp === "all" || registration.hp === filters.hp)
      .filter((registration) => filters.areaRange === "all"
        || (filters.areaRange === "up-to-1000" && (registration.legalArea ?? 0) <= 1000)
        || (filters.areaRange === "1000-1800" && (registration.legalArea ?? 0) > 1000 && (registration.legalArea ?? 0) <= 1800)
        || (filters.areaRange === "above-1800" && (registration.legalArea ?? 0) > 1800))
      .filter((registration) => !filters.certificateFrom || dateKey(registration.certificateDate) >= filters.certificateFrom)
      .sort((left, right) => left.number.localeCompare(right.number, "pt-BR", { numeric: true }));
    const totalPages = Math.max(Math.ceil(filtered.length / filters.pageSize), 1);
    const page = Math.min(filters.page, totalPages);
    const start = (page - 1) * filters.pageSize;
    return { records: clone(filtered.slice(start, start + filters.pageSize)), total: filtered.length, page, pageSize: filters.pageSize, totalPages, summary: summaryFrom(registrations) };
  },

  async getById(id: string): Promise<RegistrationListItem | undefined> {
    await delay(100);
    const registration = mockStore.getState().registrations.find((item) => item.id === id);
    return registration ? clone(toListItem(registration)) : undefined;
  },

  async getDetails(id: string): Promise<RegistrationDetailsViewModel | undefined> {
    await delay(140);
    const db = mockStore.getState();
    const registration = db.registrations.find((item) => item.id === id);
    if (!registration) return undefined;
    const ownerships = getOwnershipLinksByRegistration(id, db).map((link) => ({ link, owner: db.owners.find((owner) => owner.id === link.ownerId) })).filter((item): item is { link: typeof item.link; owner: NonNullable<typeof item.owner> } => Boolean(item.owner));
    const documents = getDocumentsByRegistration(id, db).map((document) => ({ ...document, validityStatus: getDocumentValidityStatus(document) }));
    return clone({ registration: toListItem(registration), farm: getFarmByRegistration(id, db), ownerships, operations: getOperationsByRegistration(id, db), guarantees: getGuaranteesByRegistration(id, db), documents, activePercentage: getActiveOwnershipPercentage(id, db) });
  },

  async create(draft: RegistrationDraft): Promise<RegistrationListItem> {
    await delay(240);
    if (mockStore.getState().registrations.some((registration) => registration.status === "active" && normalizeSearchText(registration.number) === normalizeSearchText(draft.number))) throw new Error("Já existe uma matrícula com este número.");
    return toListItem(mockStore.createRegistration(draft));
  },

  async update(id: string, draft: RegistrationDraft): Promise<RegistrationListItem> {
    await delay(240);
    if (mockStore.getState().registrations.some((registration) => registration.id !== id && registration.status === "active" && normalizeSearchText(registration.number) === normalizeSearchText(draft.number))) throw new Error("Já existe uma matrícula com este número.");
    return toListItem(mockStore.updateRegistration(id, draft));
  },

  async inactivate(id: string): Promise<RegistrationListItem> {
    await delay(220);
    return toListItem(mockStore.updateRegistration(id, { status: "inactive" }));
  },

  async delete(id: string): Promise<{ deleted: boolean; reason?: "linked" }> {
    await delay(220);
    const db = mockStore.getState();
    const linked = getOwnershipLinksByRegistration(id, db).length || getOperationsByRegistration(id, db).length || getGuaranteesByRegistration(id, db).length || getDocumentsByRegistration(id, db).length;
    if (linked) return { deleted: false, reason: "linked" };
    mockStore.deleteRegistration(id);
    return { deleted: true };
  },

  async createOwnershipLink(registrationId: string, draft: OwnershipDraft) {
    await delay(180);
    const duplicate = getOwnershipLinksByRegistration(registrationId).some((link) => link.ownerId === draft.ownerId && link.status === "active");
    if (duplicate) throw new Error("Este proprietário já possui um vínculo ativo com a matrícula.");
    if (draft.status === "active") ensurePercentage(registrationId, draft.percentage);
    return clone(mockStore.createOwnershipLink({ ...draft, registrationId }));
  },

  async updateOwnershipLink(id: string, draft: OwnershipDraft) {
    await delay(180);
    const current = mockStore.getState().ownershipLinks.find((link) => link.id === id);
    if (!current) throw new Error("Vínculo não encontrado.");
    const duplicate = getOwnershipLinksByRegistration(current.registrationId).some((link) => link.id !== id && link.ownerId === draft.ownerId && link.status === "active");
    if (duplicate) throw new Error("Este proprietário já possui um vínculo ativo com a matrícula.");
    if (draft.status === "active") ensurePercentage(current.registrationId, draft.percentage, id);
    return clone(mockStore.updateOwnershipLink(id, draft));
  },

  async closeOwnershipLink(id: string) { await delay(160); return mockStore.closeOwnershipLink(id); },
  async deleteOwnershipLink(id: string) { await delay(160); mockStore.deleteOwnershipLink(id); },
  getFarmOptions() { return clone(mockStore.getState().farms.map((farm) => ({ id: farm.id, name: farm.name, label: `${farm.name} — ${farm.municipality}/${farm.state}` }))); },
  getOwnerOptions() { return clone(mockStore.getState().owners.filter((owner) => owner.status === "active").map((owner) => ({ id: owner.id, name: owner.name, document: owner.document, type: owner.type, label: `${owner.name} — ${owner.type === "individual" ? "CPF" : "CNPJ"} ${owner.document}` }))); },
  getActivePercentage(registrationId: string, excludeLinkId?: string) { return getActiveOwnershipPercentage(registrationId, undefined, excludeLinkId); },
  validateIntegrity() { return clone(mockStore.validate()); },
};
