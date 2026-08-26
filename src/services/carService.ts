import { mockStore } from "../data/mock/mockStore";
import { getCarById, getFarmsByOwner } from "../data/mock/selectors";
import type { CarRecord } from "../types/domain";
import type { CarDetailsViewModel, CarDraft, CarFilters, CarListItem, CarListResponse, CarLoadMode } from "../types/car";
import { normalizeSearchText } from "./searchUtils";

const clone = <T,>(value: T): T => structuredClone(value);
const delay = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

const toListItem = (car: CarRecord): CarListItem => {
  const db = mockStore.getState();
  const farm = db.farms.find((item) => item.id === car.farmId);
  const registration = car.registrationId ? db.registrations.find((item) => item.id === car.registrationId) : undefined;
  const owner = car.ownerId ? db.owners.find((item) => item.id === car.ownerId) : undefined;
  return {
    ...car,
    farmName: farm?.name ?? "Fazenda não encontrada",
    farmLocation: farm ? `${farm.municipality} / ${farm.state}` : "—",
    registrationNumber: registration?.number,
    ownerName: owner?.name,
  };
};

const validateDraft = (draft: CarDraft, currentId?: string) => {
  const db = mockStore.getState();
  if (!draft.farmId || !db.farms.some((farm) => farm.id === draft.farmId)) throw new Error("Selecione a fazenda vinculada.");
  if (!draft.number.trim()) throw new Error("Informe o número do CAR.");
  if (db.carRecords.some((car) => car.id !== currentId && normalizeSearchText(car.number) === normalizeSearchText(draft.number))) throw new Error("Já existe um CAR com este número.");
  if (draft.registrationId) {
    const registration = db.registrations.find((item) => item.id === draft.registrationId);
    if (!registration || registration.farmId !== draft.farmId) throw new Error("A matrícula selecionada não pertence à fazenda informada.");
  }
  if (draft.ownerId && !db.owners.some((owner) => owner.id === draft.ownerId)) throw new Error("O proprietário informado não foi encontrado.");
};

const allItems = () => mockStore.getState().carRecords.map(toListItem);
const summary = (records: CarListItem[]) => ({
  total: records.length,
  active: records.filter((item) => item.status === "active").length,
  pending: records.filter((item) => item.status === "pending").length,
  inactive: records.filter((item) => item.status === "inactive").length,
});

export const carService = {
  async list(filters: CarFilters, mode: CarLoadMode = "success"): Promise<CarListResponse> {
    await delay(300);
    if (mode === "error") throw new Error("Não foi possível carregar os cadastros ambientais rurais.");
    const source = mode === "empty" ? [] : allItems();
    const query = normalizeSearchText(filters.query);
    const filtered = source
      .filter((item) => !query || [item.number, item.receiptNumber, item.farmName, item.registrationNumber, item.ownerName].some((value) => normalizeSearchText(value ?? "").includes(query)))
      .filter((item) => !filters.farmId || item.farmId === filters.farmId)
      .filter((item) => filters.status === "all" || item.status === filters.status)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.number.localeCompare(b.number, "pt-BR"));
    const totalPages = Math.max(1, Math.ceil(filtered.length / filters.pageSize));
    const page = Math.min(filters.page, totalPages);
    const start = (page - 1) * filters.pageSize;
    return clone({ records: filtered.slice(start, start + filters.pageSize), total: filtered.length, page, pageSize: filters.pageSize, totalPages, summary: summary(source) });
  },

  async getDetails(id: string): Promise<CarDetailsViewModel> {
    await delay(120);
    const db = mockStore.getState();
    const car = getCarById(id, db);
    if (!car) throw new Error("CAR não encontrado.");
    return clone({
      car: toListItem(car),
      farm: db.farms.find((item) => item.id === car.farmId),
      registration: car.registrationId ? db.registrations.find((item) => item.id === car.registrationId) : undefined,
      owner: car.ownerId ? db.owners.find((item) => item.id === car.ownerId) : undefined,
    });
  },

  async create(draft: CarDraft) { validateDraft(draft); await delay(160); return clone(mockStore.createCarRecord({ ...draft, number: draft.number.trim(), receiptNumber: draft.receiptNumber?.trim() || undefined })); },
  async update(id: string, draft: CarDraft) { validateDraft(draft, id); await delay(160); return clone(mockStore.updateCarRecord(id, { ...draft, number: draft.number.trim(), receiptNumber: draft.receiptNumber?.trim() || undefined })); },
  async inactivate(id: string) { await delay(100); return clone(mockStore.updateCarRecord(id, { status: "inactive" })); },
  async delete(id: string) { await delay(100); mockStore.deleteCarRecord(id); return { deleted: true as const }; },
  getFarmOptions() { return mockStore.getState().farms.filter((farm) => farm.status === "active").map((farm) => ({ id: farm.id, label: farm.name })); },
  getRegistrationOptions() { return mockStore.getState().registrations.filter((registration) => registration.status === "active").map((registration) => ({ id: registration.id, label: `Matrícula ${registration.number}`, farmId: registration.farmId })); },
  getOwnerOptions() { return mockStore.getState().owners.filter((owner) => owner.status === "active").map((owner) => ({ id: owner.id, label: owner.name, farmIds: getFarmsByOwner(owner.id).map((farm) => farm.id) })); },
  validateIntegrity() { return clone(mockStore.validate()); },
};
