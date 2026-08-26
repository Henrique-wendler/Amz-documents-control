import { mockStore } from "../data/mock/mockStore";
import type { SearchCategory, SearchCounts, SearchFilters, SearchLoadMode, SearchRecord, SearchResponse } from "../types/consulta";
import { buildSearchRecords } from "./consultaRecordMapper";
import { normalizeSearchText } from "./searchUtils";

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

const records = () => buildSearchRecords(mockStore.getState());

export const consultaService = {
  async search(filters: SearchFilters, mode: SearchLoadMode = "success"): Promise<SearchResponse> {
    await delay(260);
    if (mode === "error") throw new Error("Não foi possível carregar os registros.");
    const query = normalizeSearchText(filters.query);
    const filtered = records().filter((record) => {
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
    const record = records().find((item) => item.entityType === type && item.id === id);
    return record ? structuredClone(record) : undefined;
  },

  async getCounts(): Promise<SearchCounts> {
    await delay(120);
    const data = records();
    const categories: SearchCategory[] = ["owner", "farm", "registration", "operation", "guarantee", "document", "car"];
    const counts = Object.fromEntries(categories.map((category) => [category, data.filter((item) => item.entityType === category).length]));
    return { all: data.length, ...counts } as SearchCounts;
  },

  getFarmOptions() {
    return mockStore.getState().farms.map((farm) => ({ id: farm.id, label: farm.name }));
  },
};

