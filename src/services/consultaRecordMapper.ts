import {
  getCarByFarm,
  getDocumentsByFarm,
  getFarmsByOwner,
  getGuaranteesByOperation,
  getOperationsByFarm,
  getOperationsByRegistration,
  getOwnersByRegistration,
  getRegistrationsByFarm,
  getRegistrationsByOwner,
} from "../data/mock/selectors";
import type { MockDatabase } from "../types/domain";
import type { SearchRecord, SearchStatus } from "../types/consulta";
import { formatArea, formatCurrency, formatIsoDate } from "./searchUtils";

const entityDate = (value: string) => value.includes("/") ? value : formatIsoDate(value);
const operationStatus: Record<MockDatabase["operations"][number]["status"], SearchStatus> = {
  under_review: "Em análise",
  active: "Ativa",
  completed: "Encerrada",
  cancelled: "Cancelada",
};
const guaranteeStatus: Record<MockDatabase["guarantees"][number]["status"], SearchStatus> = {
  active: "Ativa",
  closed: "Encerrada",
  cancelled: "Cancelada",
};
const documentStatus: Record<MockDatabase["documents"][number]["status"], SearchStatus> = {
  active: "Ativa",
  expiring: "A vencer",
  expired: "Vencido",
  inactive: "Inativa",
};
const carStatus: Record<MockDatabase["carRecords"][number]["status"], SearchStatus> = {
  active: "Ativo",
  pending: "Em análise",
  inactive: "Inativa",
};
const documentCategory = (type: string) => {
  if (type.includes("Licença")) return "Licença";
  if (type.includes("Certidão")) return "Certidão";
  if (type.includes("ITR")) return "ITR";
  if (type.includes("CCIR")) return "CCIR";
  return type;
};
const countLabel = (value: number, singular: string, plural: string) => value ? `${value} ${value === 1 ? singular : plural}` : "Nenhum vínculo";

export function buildSearchRecords(db: MockDatabase): SearchRecord[] {
  const owners: SearchRecord[] = db.owners.map((owner) => {
    const farms = getFarmsByOwner(owner.id, db);
    const registrations = getRegistrationsByOwner(owner.id, db);
    const farmIds = new Set(farms.map((farm) => farm.id));
    const operations = db.operations.filter((operation) => farmIds.has(operation.farmId));
    const typeLabel = owner.type === "individual" ? "Pessoa Física" : "Pessoa Jurídica";
    return {
      id: owner.id, entityType: "owner", title: owner.name,
      reference: `${owner.type === "individual" ? "CPF" : "CNPJ"} ${owner.document}`,
      details: `${typeLabel} · ${owner.phone ?? "Sem telefone"}`,
      status: owner.status === "active" ? "Ativa" : "Inativa", updatedAt: entityDate(owner.updatedAt),
      attributes: { document: owner.document, ownerType: typeLabel, phone: owner.phone ?? "—", email: owner.email ?? "—" },
      relations: [
        { label: "Fazendas", value: countLabel(farms.length, "fazenda", "fazendas") },
        { label: "Matrículas", value: countLabel(registrations.length, "matrícula", "matrículas") },
        { label: "Operações", value: countLabel(operations.length, "operação", "operações") },
      ],
      openPath: "/proprietarios",
    };
  });

  const farms: SearchRecord[] = db.farms.map((farm) => {
    const registrations = getRegistrationsByFarm(farm.id, db);
    const ownerMap = new Map(registrations.flatMap((registration) => getOwnersByRegistration(registration.id, db)).map((owner) => [owner.id, owner]));
    const operations = getOperationsByFarm(farm.id, db);
    const documents = getDocumentsByFarm(farm.id, db);
    const car = getCarByFarm(farm.id, db);
    return {
      id: farm.id, entityType: "farm", title: farm.name, reference: `${farm.municipality} / ${farm.state}`,
      details: formatArea(farm.totalArea), status: farm.status === "active" ? "Ativa" : "Inativa", updatedAt: entityDate(farm.updatedAt),
      farmId: farm.id, farmName: farm.name,
      attributes: { municipality: farm.municipality, state: farm.state, owner: Array.from(ownerMap.values())[0]?.name ?? "—", area: formatArea(farm.totalArea) },
      relations: [
        { label: "Matrículas", value: countLabel(registrations.length, "matrícula", "matrículas") },
        { label: "Operações", value: countLabel(operations.length, "operação", "operações") },
        { label: "Documentos", value: countLabel(documents.length, "documento", "documentos") },
        { label: "CAR", value: car ? "1 cadastro" : "Nenhum cadastro" },
      ],
    };
  });

  const registrations: SearchRecord[] = db.registrations.map((registration) => {
    const farm = db.farms.find((item) => item.id === registration.farmId);
    const operations = getOperationsByRegistration(registration.id, db);
    return {
      id: registration.id, entityType: "registration", title: registration.number, reference: farm?.name ?? "—",
      details: `Área legal: ${formatArea(registration.legalArea ?? 0)}`,
      status: registration.status === "active" ? "Ativa" : "Inativa", updatedAt: entityDate(registration.updatedAt),
      farmId: farm?.id, farmName: farm?.name,
      attributes: { farm: farm?.name ?? "—", legalArea: formatArea(registration.legalArea ?? 0), hp: registration.hp ?? "—", certificateDate: registration.certificateDate ?? "—" },
      relations: [{ label: "Fazenda", value: farm?.name ?? "—" }, { label: "Operações", value: countLabel(operations.length, "operação vinculada", "operações vinculadas") }],
    };
  });

  const operations: SearchRecord[] = db.operations.map((operation) => {
    const farm = db.farms.find((item) => item.id === operation.farmId);
    const registration = operation.registrationId ? db.registrations.find((item) => item.id === operation.registrationId) : undefined;
    const guarantees = getGuaranteesByOperation(operation.id, db);
    return {
      id: operation.id, entityType: "operation", title: operation.number, reference: farm?.name ?? "—",
      details: `${operation.bank} · ${formatCurrency(operation.value)}`, status: operationStatus[operation.status], updatedAt: entityDate(operation.updatedAt),
      farmId: farm?.id, farmName: farm?.name,
      attributes: { farm: farm?.name ?? "—", bank: operation.bank, purpose: operation.purpose ?? "—", value: formatCurrency(operation.value), startDate: formatIsoDate(operation.startDate), registration: registration?.number ?? "—", registrationId: registration?.id ?? "" },
      relations: [{ label: "Fazenda", value: farm?.name ?? "—" }, { label: "Matrícula", value: registration ? `Matrícula ${registration.number}` : "—" }, { label: "Garantias", value: countLabel(guarantees.length, "garantia", "garantias") }],
      openPath: `/?id=${operation.id}`,
    };
  });

  const guarantees: SearchRecord[] = db.guarantees.map((guarantee) => {
    const operation = db.operations.find((item) => item.id === guarantee.operationId);
    const registration = db.registrations.find((item) => item.id === guarantee.registrationId);
    const farm = registration ? db.farms.find((item) => item.id === registration.farmId) : undefined;
    return {
      id: guarantee.id, entityType: "guarantee", title: guarantee.type,
      reference: `${operation?.number ?? "—"} · Matrícula ${registration?.number ?? "—"}`,
      details: `${guarantee.bank ?? operation?.bank ?? "—"} · ${formatCurrency(guarantee.value ?? 0)}`,
      status: guaranteeStatus[guarantee.status], updatedAt: entityDate(guarantee.updatedAt), farmId: farm?.id, farmName: farm?.name,
      attributes: { operation: operation?.number ?? "—", operationId: operation?.id ?? "", registration: registration?.number ?? "—", bank: guarantee.bank ?? operation?.bank ?? "—", value: formatCurrency(guarantee.value ?? 0), expiresAt: formatIsoDate(guarantee.endDate), farm: farm?.name ?? "—" },
      relations: [{ label: "Operação", value: operation?.number ?? "—" }, { label: "Fazenda", value: farm?.name ?? "—" }, { label: "Matrícula", value: registration?.number ?? "—" }],
      openPath: `/?id=${operation?.id ?? ""}&garantia=${guarantee.id}`,
    };
  });

  const documents: SearchRecord[] = db.documents.map((document) => {
    const farm = db.farms.find((item) => item.id === document.farmId);
    return {
      id: document.id, entityType: "document", title: document.type, reference: farm?.name ?? "—",
      details: `Vencimento ${formatIsoDate(document.expirationDate)}`, status: documentStatus[document.status], updatedAt: entityDate(document.updatedAt),
      farmId: farm?.id, farmName: farm?.name,
      attributes: { number: document.number ?? "—", farm: farm?.name ?? "—", issuedAt: formatIsoDate(document.issueDate), validUntil: formatIsoDate(document.expirationDate), documentType: documentCategory(document.type) },
      relations: [{ label: "Fazenda", value: farm?.name ?? "—" }, { label: "Arquivo", value: document.number ?? "Sem arquivo" }],
    };
  });

  const cars: SearchRecord[] = db.carRecords.map((car) => {
    const farm = db.farms.find((item) => item.id === car.farmId);
    const owner = car.ownerId ? db.owners.find((item) => item.id === car.ownerId) : undefined;
    return {
      id: car.id, entityType: "car", title: car.number, reference: farm?.name ?? "—",
      details: `Recibo ${car.receiptNumber ?? "—"}`, status: carStatus[car.status], updatedAt: entityDate(car.updatedAt),
      farmId: farm?.id, farmName: farm?.name,
      attributes: { farm: farm?.name ?? "—", owner: owner?.name ?? "—", receipt: car.receiptNumber ?? "—" },
      relations: [{ label: "Fazenda", value: farm?.name ?? "—" }, { label: "Proprietário", value: owner?.name ?? "—" }],
    };
  });
  return [...owners, ...farms, ...registrations, ...operations, ...guarantees, ...documents, ...cars];
}

