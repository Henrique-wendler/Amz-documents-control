import { supabaseCarRepository } from "../repositories/supabaseCarRepository";
import { supabaseFarmRepository } from "../repositories/supabaseFarmRepository";
import { supabaseRegistrationRepository } from "../repositories/supabaseRegistrationRepository";
import type { PersistedCarRecord } from "../repositories/carRepository";
import type { CarDetailsViewModel, CarDraft, CarFilters, CarListItem, CarListResponse, CarLoadMode } from "../types/car";
import { normalizeSearchText } from "./searchUtils";

const toInput = (draft: CarDraft) => ({ farmId: draft.farmId, registrationId: draft.registrationId, carNumber: draft.number.trim(), receiptNumber: draft.receiptNumber?.trim() || undefined, declaredOwnerName: draft.declaredOwnerName?.trim() || undefined, status: draft.status, notes: draft.notes?.trim() || undefined });
const buildItems = async (cars: PersistedCarRecord[]): Promise<CarListItem[]> => {
  const [farms, registrations] = await Promise.all([supabaseFarmRepository.getByIds([...new Set(cars.map((car) => car.farmId))]), supabaseRegistrationRepository.getByIds([...new Set(cars.flatMap((car) => car.registrationId ? [car.registrationId] : []))])]);
  const farmById = new Map(farms.map((farm) => [farm.id, farm])); const registrationById = new Map(registrations.map((registration) => [registration.id, registration]));
  return cars.map((car) => { const farm = farmById.get(car.farmId); return { ...car, farmName: farm?.name ?? "Fazenda não encontrada", farmLocation: farm ? `${farm.municipality} / ${farm.state}` : "—", registrationNumber: car.registrationId ? registrationById.get(car.registrationId)?.number : undefined, ownerName: car.declaredOwnerName }; });
};
const validateDraft = async (draft: CarDraft) => {
  if (!draft.number.trim()) throw new Error("Informe o número do CAR.");
  const farm = await supabaseFarmRepository.getById(draft.farmId); if (!farm) throw new Error("Selecione a Fazenda vinculada.");
  if (draft.registrationId) { const registration = await supabaseRegistrationRepository.getById(draft.registrationId); if (!registration || registration.farmId !== draft.farmId) throw new Error("A Matrícula selecionada não pertence à Fazenda informada."); }
};
const summary = (records: CarListItem[]) => ({ total: records.length, active: records.filter((item) => item.status === "active").length, pending: records.filter((item) => item.status === "pending").length, inactive: records.filter((item) => item.status === "inactive").length });

export const carService = {
  async list(filters: CarFilters, mode: CarLoadMode = "success"): Promise<CarListResponse> {
    if (mode === "error") throw new Error("Não foi possível carregar os cadastros ambientais rurais.");
    const source = mode === "empty" ? [] : await buildItems(await supabaseCarRepository.list()); const query = normalizeSearchText(filters.query);
    const filtered = source.filter((item) => !query || [item.number, item.receiptNumber, item.farmName, item.registrationNumber, item.ownerName].some((value) => normalizeSearchText(value ?? "").includes(query))).filter((item) => !filters.farmId || item.farmId === filters.farmId).filter((item) => filters.status === "all" || item.status === filters.status).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.number.localeCompare(b.number, "pt-BR"));
    const totalPages = Math.max(1, Math.ceil(filtered.length / filters.pageSize)); const page = Math.min(filters.page, totalPages); const start = (page - 1) * filters.pageSize;
    return { records: filtered.slice(start, start + filters.pageSize), total: filtered.length, page, pageSize: filters.pageSize, totalPages, summary: summary(source) };
  },
  async getDetails(id: string): Promise<CarDetailsViewModel> { const car = await supabaseCarRepository.getById(id); if (!car) throw new Error("CAR não encontrado."); const [item] = await buildItems([car]); const [farm, registration] = await Promise.all([supabaseFarmRepository.getById(car.farmId), car.registrationId ? supabaseRegistrationRepository.getById(car.registrationId) : Promise.resolve(undefined)]); return { car: item, farm, registration }; },
  async create(draft: CarDraft) { await validateDraft(draft); return supabaseCarRepository.create(toInput(draft)); },
  async update(id: string, expectedVersion: number, draft: CarDraft) { await validateDraft(draft); return supabaseCarRepository.update(id, expectedVersion, toInput(draft)); },
  async inactivate(id: string, expectedVersion: number) { return supabaseCarRepository.inactivate(id, expectedVersion); },
  async delete(id: string, expectedVersion: number) { await supabaseCarRepository.softDelete(id, expectedVersion); return { deleted: true as const }; },
  async getFarmOptions() { return (await supabaseFarmRepository.list()).filter((farm) => farm.status === "active").map((farm) => ({ id: farm.id, label: farm.name })); },
  async getRegistrationOptions() { return (await supabaseRegistrationRepository.list()).filter((registration) => registration.status === "active").map((registration) => ({ id: registration.id, label: `Matrícula ${registration.number}`, farmId: registration.farmId })); },
};
