import type { SearchCategory, SearchCounts, SearchFilters, SearchLoadMode, SearchRecord, SearchResponse } from "../types/consulta";
import { normalizeSearchText } from "./searchUtils";
import { supabaseFarmRepository } from "../repositories/supabaseFarmRepository";
import { supabaseOwnerRepository } from "../repositories/supabaseOwnerRepository";
import { supabaseOwnershipRepository } from "../repositories/supabaseOwnershipRepository";
import { supabaseRegistrationRepository } from "../repositories/supabaseRegistrationRepository";
import { supabaseDocumentRepository } from "../repositories/supabaseDocumentRepository";
import { supabaseDocumentAttachmentRepository } from "../repositories/supabaseDocumentAttachmentRepository";
import { supabaseCarRepository } from "../repositories/supabaseCarRepository";
import { formatArea, formatCurrency, formatIsoDate } from "./searchUtils";
import { carStatusLabels, documentValidityLabels, operationStatusLabels } from "./statusLabels";
import { operationService } from "./operationService";

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
  const [owners, farms, registrations, links, documents, cars, attachments] = await Promise.all([
    supabaseOwnerRepository.listAll(),
    supabaseFarmRepository.list(),
    supabaseRegistrationRepository.list(),
    supabaseOwnershipRepository.list(),
    supabaseDocumentRepository.list(),
    supabaseCarRepository.list(),
    supabaseDocumentAttachmentRepository.list().catch(() => []),
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
  const documentRecords: SearchRecord[] = documents.map((document) => {
    const farm = farmById.get(document.farmId);
    const registration = document.registrationId ? registrations.find((item) => item.id === document.registrationId) : undefined;
    const attachmentCount = attachments.filter((attachment) => attachment.documentId === document.id).length;
    return { id: document.id, entityType: "document", title: document.type, reference: farm?.name ?? "—", details: document.expirationDate ? `Vencimento ${formatIsoDate(document.expirationDate)}` : "Sem validade informada", status: documentValidityLabels[document.validityStatus], updatedAt: document.updatedAt, farmId: farm?.id, farmName: farm?.name, attributes: { number: document.number ?? "—", farm: farm?.name ?? "—", issuedAt: formatIsoDate(document.issueDate), validUntil: formatIsoDate(document.expirationDate), documentType: document.type }, relations: [{ label: "Fazenda", value: farm?.name ?? "—" }, { label: "Matrícula", value: registration?.number ?? "Sem vínculo" }, { label: "Arquivos", value: attachmentCount === 0 ? "Nenhum arquivo" : `${attachmentCount} ${attachmentCount === 1 ? "arquivo" : "arquivos"}` }], openPath: `/documentos?open=${document.id}` };
  });
  const carRecords: SearchRecord[] = cars.map((car) => {
    const farm = farmById.get(car.farmId);
    const registration = car.registrationId ? registrations.find((item) => item.id === car.registrationId) : undefined;
    return { id: car.id, entityType: "car", title: car.number, reference: farm?.name ?? "—", details: `Recibo ${car.receiptNumber ?? "—"}`, status: carStatusLabels[car.status], updatedAt: car.updatedAt, farmId: farm?.id, farmName: farm?.name, attributes: { farm: farm?.name ?? "—", registration: registration?.number ?? "—", owner: car.declaredOwnerName ?? "—", receipt: car.receiptNumber ?? "—" }, relations: [{ label: "Fazenda", value: farm?.name ?? "—" }, { label: "Matrícula", value: registration?.number ?? "Sem vínculo" }, { label: "Proprietário declarado", value: car.declaredOwnerName ?? "—" }], openPath: `/car?open=${car.id}` };
  });
  return [...ownerRecords, ...farmRecords, ...registrationRecords, ...documentRecords, ...carRecords];
};

const operationRecords = async (includeFinancial = false): Promise<SearchRecord[]> => {
  const data = await operationService.listRecords(includeFinancial);
  const institutionById = new Map(data.institutions.map((item) => [item.id, item]));
  const registrationById = new Map(data.registrations.map((item) => [item.id, item]));
  const operationById = new Map(data.operations.map((item) => [item.id, item]));
  const typeById = new Map(data.guaranteeTypes.map((item) => [item.id, item]));
  const operations: SearchRecord[] = data.operations.map((operation) => {
    const primaryRegistrationId = operation.registrations.find((item) => item.isPrimary)?.registrationId ?? operation.registrations[0]?.registrationId;
    const primaryRegistration = primaryRegistrationId ? registrationById.get(primaryRegistrationId) : undefined;
    const institution = institutionById.get(operation.institutionId);
    return {
      id: operation.id,
      entityType: "operation",
      title: operation.operationNumber,
      reference: institution?.name ?? "Instituição não encontrada",
      details: operation.purpose || "Sem finalidade informada",
      status: operationStatusLabels[operation.status],
      updatedAt: operation.updatedAt,
      farmId: primaryRegistration?.farmId,
      farmName: primaryRegistration?.farmName,
      attributes: {
        bank: institution?.name ?? "—",
        farm: primaryRegistration?.farmName ?? "—",
        registration: primaryRegistration?.number ?? "—",
        value: operation.amount === undefined ? "" : formatCurrency(operation.amount),
      },
      relations: [
        { label: "Matrículas", value: String(operation.registrations.length) },
        { label: "Garantias", value: String(data.guarantees.filter((guarantee) => guarantee.operationId === operation.id).length) },
      ],
      openPath: `/?id=${operation.id}`,
    };
  });
  const guarantees: SearchRecord[] = data.guarantees.flatMap((guarantee) => {
    const operation = operationById.get(guarantee.operationId);
    if (!operation) return [];
    const institution = institutionById.get(operation.institutionId);
    const primaryRegistration = registrationById.get(guarantee.registrationIds[0] ?? operation.registrations[0]?.registrationId);
    const primaryTypeId = guarantee.types.find((item) => item.isPrimary)?.guaranteeTypeId ?? guarantee.types[0]?.guaranteeTypeId;
    const typeName = primaryTypeId ? typeById.get(primaryTypeId)?.name : undefined;
    return [{
      id: guarantee.id,
      entityType: "guarantee" as const,
      title: typeName ?? "Garantia sem tipo",
      reference: operation.operationNumber,
      details: guarantee.description || "Sem descrição informada",
      status: guarantee.status === "active" ? "Ativa" as const : guarantee.status === "closed" ? "Encerrada" as const : "Cancelada" as const,
      updatedAt: guarantee.updatedAt,
      farmId: primaryRegistration?.farmId,
      farmName: primaryRegistration?.farmName,
      attributes: {
        bank: institution?.name ?? "—",
        farm: primaryRegistration?.farmName ?? "—",
        operation: operation.operationNumber,
        value: guarantee.amount === undefined ? "" : formatCurrency(guarantee.amount),
      },
      relations: [
        { label: "Tipos", value: String(guarantee.types.length) },
        { label: "Matrículas", value: String(guarantee.registrationIds.length) },
        { label: "Itens", value: String(data.items.filter((item) => item.guaranteeId === guarantee.id).length) },
      ],
      openPath: `/?id=${operation.id}&garantia=${guarantee.id}`,
    }];
  });
  return [...operations, ...guarantees];
};

const records = async (includeFinancial = false) => {
  const [core, operations] = await Promise.all([coreRecords(), operationRecords(includeFinancial)]);
  return [...core, ...operations];
};

export const consultaService = {
  async search(filters: SearchFilters, mode: SearchLoadMode = "success", includeFinancial = false): Promise<SearchResponse> {
    await delay(260);
    if (mode === "error") throw new Error("Não foi possível carregar os registros.");
    const query = normalizeSearchText(filters.query);
    const filtered = (await records(includeFinancial)).filter((record) => {
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

  async getById(type: SearchRecord["entityType"], id: string, includeFinancial = false): Promise<SearchRecord | undefined> {
    await delay(120);
    const record = (await records(includeFinancial)).find((item) => item.entityType === type && item.id === id);
    return record ? structuredClone(record) : undefined;
  },

  async getCounts(includeFinancial = false): Promise<SearchCounts> {
    await delay(120);
    const data = await records(includeFinancial);
    const categories: SearchCategory[] = ["owner", "farm", "registration", "operation", "guarantee", "document", "car"];
    const counts = Object.fromEntries(categories.map((category) => [category, data.filter((item) => item.entityType === category).length]));
    return { all: data.length, ...counts } as SearchCounts;
  },

  async getFarmOptions() {
    return (await supabaseFarmRepository.list()).map((farm) => ({ id: farm.id, label: farm.name }));
  },
};
