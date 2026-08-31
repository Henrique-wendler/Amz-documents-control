import { mockStore } from "../data/mock/mockStore";
import type { SearchCategory, SearchCounts, SearchFilters, SearchLoadMode, SearchRecord, SearchResponse } from "../types/consulta";
import { buildSearchRecords } from "./consultaRecordMapper";
import { normalizeSearchText } from "./searchUtils";
import { supabaseFarmRepository } from "../repositories/supabaseFarmRepository";
import { supabaseOwnerRepository } from "../repositories/supabaseOwnerRepository";
import { supabaseOwnershipRepository } from "../repositories/supabaseOwnershipRepository";
import { supabaseRegistrationRepository } from "../repositories/supabaseRegistrationRepository";
import { formatArea } from "./searchUtils";

export { normalizeSearchText } from "./searchUtils";

const delay = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));

const matchesValueRange = (record: SearchRecord, valueRange: string) => {
  if (!valueRange || !record.attributes.value) return true;
  const value = Number(record.attributes.value.replace(/[^\d,]/g, "").replace(",", "."));
  if (valueRange === "Até R$ 300 mil") return value <= 300000;
  if (valueRange === "R$ 300 mil a R$ 700 mil") return value > 300000 && value <= 700000;
  return value > 700000;
};

const matchesExpiration = (record: SearchRecord, expiration: string) => {
  if (!expiration) return true;
  if (expiration === "A vencer") return record.status === "A vencer";
  if (expiration === "Vencidos") return record.status === "Vencido";
  return record.status === "Ativa" || record.status === "Ativo";
};

const recordSearchText = (record: SearchRecord) => normalizeSearchText([
  record.title, record.reference, record.details, record.status, record.updatedAt, record.farmName, ...Object.values(record.attributes),
].filter(Boolean).join(" "));

const sortRecords = (records: SearchRecord[], sort: SearchFilters["sort"]) => [...records].sort((left, right) => {
  if (sort === "name-asc") return left.title.localeCompare(right.title, "pt-BR");
  if (sort === "name-desc") return right.title.localeCompare(left.title, "pt-BR");
  if (sort === "status") return left.status.localeCompare(right.status, "pt-BR");
  const toComparableDate = (value: string) => value.split("/").reverse().join("");
  return toComparableDate(right.updatedAt).localeCompare(toComparableDate(left.updatedAt));
});

const coreRecords = async (): Promise<SearchRecord[]> => {
  const [owners, farms, registrations, links] = await Promise.all([
    supabaseOwnerRepository.listAll(),
    supabaseFarmRepository.list(),
    supabaseRegistrationRepository.list(),
    supabaseOwnershipRepository.list(),
  ]);
  const farmById = new Map(farms.map((farm) => [farm.id, farm]));
  const registrationsByFarm = new Map<string, typeof registrations>();
  registrations.forEach((registration) => registrationsByFarm.set(registration.farmId, [...(registrationsByFarm.get(registration.farmId) ?? []), registration]));
  const linksByRegistration = new Map<string, typeof links>();
  links.forEach((link) => linksByRegistration.set(link.registrationId, [...(linksByRegistration.get(link.registrationId) ?? []), link]));
  const ownerById = new Map(owners.map((owner) => [owner.id, owner]));
  const ownerRelations = new Map<string, { farmIds: Set<string>; registrationIds: Set<string> }>();
  links.filter((link) => link.status === "active").forEach((link) => {
    const registration = registrations.find((item) => item.id === link.registrationId);
    if (!registration) return;
    const value = ownerRelations.get(link.ownerId) ?? { farmIds: new Set<string>(), registrationIds: new Set<string>() };
    value.farmIds.add(registration.farmId); value.registrationIds.add(registration.id); ownerRelations.set(link.ownerId, value);
  });
  const ownerRecords: SearchRecord[] = owners.map((owner) => ({
    id: owner.id, entityType: "owner", title: owner.name, reference: `${owner.type === "individual" ? "CPF" : "CNPJ"} ${owner.document}`,
    details: owner.type === "individual" ? "Pessoa Física" : "Pessoa Jurídica", status: owner.status === "active" ? "Ativo" : "Inativo", updatedAt: owner.updatedAt,
    attributes: { document: owner.document, ownerType: owner.type === "individual" ? "Pessoa Física" : "Pessoa Jurídica", phone: owner.phone ?? "—", email: owner.email ?? "—" },
    relations: [{ label: "Fazendas", value: String(ownerRelations.get(owner.id)?.farmIds.size ?? 0) }, { label: "Matrículas", value: String(ownerRelations.get(owner.id)?.registrationIds.size ?? 0) }],
    openPath: `/proprietarios?open=${owner.id}`,
  }));
  const farmRecords: SearchRecord[] = farms.map((farm) => {
    const farmRegistrations = registrationsByFarm.get(farm.id) ?? [];
    const ownerIds = new Set(farmRegistrations.flatMap((registration) => linksByRegistration.get(registration.id) ?? []).filter((link) => link.status === "active").map((link) => link.ownerId));
    return { id: farm.id, entityType: "farm", title: farm.name, reference: `${farm.municipality} / ${farm.state}`, details: formatArea(farm.totalArea), status: farm.status === "active" ? "Ativa" : "Inativa", updatedAt: farm.updatedAt, farmId: farm.id, farmName: farm.name, attributes: { municipality: farm.municipality, state: farm.state, owner: ownerById.get([...ownerIds][0])?.name ?? "—", area: formatArea(farm.totalArea) }, relations: [{ label: "Matrículas", value: String(farmRegistrations.length) }, { label: "Proprietários", value: String(ownerIds.size) }], openPath: `/fazendas?open=${farm.id}` };
  });
  const registrationRecords: SearchRecord[] = registrations.map((registration) => {
    const farm = farmById.get(registration.farmId);
    const ownerIds = new Set((linksByRegistration.get(registration.id) ?? []).filter((link) => link.status === "active").map((link) => link.ownerId));
    return { id: registration.id, entityType: "registration", title: registration.number, reference: farm?.name ?? "—", details: `Área legal: ${formatArea(registration.legalArea ?? 0)}`, status: registration.status === "active" ? "Ativa" : "Inativa", updatedAt: registration.updatedAt, farmId: farm?.id, farmName: farm?.name, attributes: { farm: farm?.name ?? "—", legalArea: formatArea(registration.legalArea ?? 0), hp: "Pendente de definição", certificateDate: registration.certificateDate ?? "—" }, relations: [{ label: "Fazenda", value: farm?.name ?? "—" }, { label: "Proprietários", value: String(ownerIds.size) }], openPath: `/matriculas?open=${registration.id}` };
  });
  return [...ownerRecords, ...farmRecords, ...registrationRecords];
};

const records = async () => {
  const mockRecords = buildSearchRecords(mockStore.getState()).filter((record) => !["owner", "farm", "registration"].includes(record.entityType));
  return [...await coreRecords(), ...mockRecords];
};

export const consultaService = {
  async search(filters: SearchFilters, mode: SearchLoadMode = "success"): Promise<SearchResponse> {
    await delay(260);
    if (mode === "error") throw new Error("Não foi possível carregar os registros.");
    const query = normalizeSearchText(filters.query);
    const filtered = (await records()).filter((record) => {
      if (filters.category !== "all" && record.entityType !== filters.category) return false;
      if (filters.status && record.status !== filters.status) return false;
      if (filters.farmId && record.farmId !== filters.farmId) return false;
      if (filters.ownerType && record.attributes.ownerType !== filters.ownerType) return false;
      if (filters.municipality && record.attributes.municipality !== filters.municipality) return false;
      if (filters.state && record.attributes.state !== filters.state) return false;
      if (filters.bank && record.attributes.bank !== filters.bank) return false;
      if (filters.guaranteeType && record.title !== filters.guaranteeType) return false;
      if (filters.documentType && record.attributes.documentType !== filters.documentType) return false;
      if (!matchesValueRange(record, filters.valueRange)) return false;
      if (!matchesExpiration(record, filters.expiration)) return false;
      return !query || recordSearchText(record).includes(query);
    });
    const sorted = sortRecords(filtered, filters.sort);
    const totalPages = Math.max(Math.ceil(sorted.length / filters.pageSize), 1);
    const page = Math.min(filters.page, totalPages);
    const start = (page - 1) * filters.pageSize;
    return { records: structuredClone(sorted.slice(start, start + filters.pageSize)), total: sorted.length, page, pageSize: filters.pageSize, totalPages };
  },

  async getById(type: SearchRecord["entityType"], id: string): Promise<SearchRecord | undefined> {
    await delay(120);
    const record = (await records()).find((item) => item.entityType === type && item.id === id);
    return record ? structuredClone(record) : undefined;
  },

  async getCounts(): Promise<SearchCounts> {
    await delay(120);
    const data = await records();
    const categories: SearchCategory[] = ["owner", "farm", "registration", "operation", "guarantee", "document", "car"];
    const counts = Object.fromEntries(categories.map((category) => [category, data.filter((item) => item.entityType === category).length]));
    return { all: data.length, ...counts } as SearchCounts;
  },

  async getFarmOptions() {
    return (await supabaseFarmRepository.list()).map((farm) => ({ id: farm.id, label: farm.name }));
  },
};
