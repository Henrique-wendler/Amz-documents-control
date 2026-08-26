import { mockStore } from "../data/mock/mockStore";
import {
  getDocumentValidityStatus,
  getFarmRelationCounts,
  getFarmsByOwner,
  getOwnersByRegistration,
  getRegistrationRelationCounts,
} from "../data/mock/selectors";
import type { Guarantee, Operation, RuralDocument } from "../types/domain";
import type { ReportColumn, ReportDefinition, ReportExportFormat, ReportFilterOptions, ReportFilters, ReportMetric, ReportRow, ReportType, ReportViewModel } from "../types/report";
import { formatArea, formatCurrency, formatIsoDate } from "./searchUtils";

const delay = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
const clone = <T,>(value: T): T => structuredClone(value);
const count = (value: number) => new Intl.NumberFormat("pt-BR").format(value);

export const reportDefinitions: ReportDefinition[] = [
  { id: "farms", title: "Fazendas", description: "Áreas, localização e vínculos" },
  { id: "owners", title: "Proprietários", description: "Cadastros PF e PJ" },
  { id: "registrations", title: "Matrículas", description: "Registros e áreas legais" },
  { id: "operations", title: "Operações financeiras", description: "Bancos, valores e situações" },
  { id: "guarantees", title: "Garantias", description: "Garantias vinculadas às operações" },
  { id: "documents", title: "Documentos e vencimentos", description: "Validades e pendências documentais" },
  { id: "car", title: "CAR", description: "Cadastros ambientais rurais" },
];

export const initialReportFilters: ReportFilters = { farmId: "", status: "", startDate: "", endDate: "", ownerType: "all", hp: "all", bank: "", guaranteeType: "", documentType: "", expirationWindow: "all" };

const labels = {
  entity: { active: "Ativo", inactive: "Inativo" },
  operation: { under_review: "Em análise", active: "Ativa", completed: "Concluída", cancelled: "Cancelada" },
  guarantee: { active: "Ativa", closed: "Encerrada", cancelled: "Cancelada" },
  document: { active: "Vigente", expiring: "A vencer", expired: "Vencido", inactive: "Inativo" },
  car: { active: "Ativo", pending: "Pendente", inactive: "Inativo" },
} as const;

const columns = (items: Array<[string, string, ("start" | "end")?]>): ReportColumn[] => items.map(([key, label, align]) => ({ key, label, align }));
const row = (id: string, values: Record<string, string>): ReportRow => ({ id, values });
const inPeriod = (date: string | undefined, filters: ReportFilters) => !filters.startDate && !filters.endDate || Boolean(date && (!filters.startDate || date >= filters.startDate) && (!filters.endDate || date <= filters.endDate));
const farmMatches = (farmId: string | undefined, filters: ReportFilters) => !filters.farmId || farmId === filters.farmId;
const statusMatches = (status: string, filters: ReportFilters) => !filters.status || status === filters.status;
const sumMetric = (label: string, value: number, formatter: (amount: number) => string): ReportMetric => ({ label, value: formatter(value) });
const baseMetrics = (length: number): ReportMetric[] => [{ label: "Registros", value: count(length) }];

const buildFarms = (filters: ReportFilters): Pick<ReportViewModel, "columns" | "rows" | "metrics"> => {
  const records = mockStore.getState().farms.filter((farm) => farmMatches(farm.id, filters) && statusMatches(farm.status, filters));
  return {
    columns: columns([["name", "Fazenda"], ["location", "Município / UF"], ["area", "Área total", "end"], ["registrations", "Matrículas", "end"], ["status", "Situação"], ["updated", "Atualizado em"]]),
    rows: records.map((farm) => { const relations = getFarmRelationCounts(farm.id); return row(farm.id, { name: farm.name, location: `${farm.municipality} / ${farm.state}`, area: formatArea(farm.totalArea), registrations: count(relations.registrationCount), status: labels.entity[farm.status], updated: farm.updatedAt }); }),
    metrics: [...baseMetrics(records.length), sumMetric("Área total", records.reduce((sum, farm) => sum + farm.totalArea, 0), formatArea)],
  };
};

const buildOwners = (filters: ReportFilters): Pick<ReportViewModel, "columns" | "rows" | "metrics"> => {
  const records = mockStore.getState().owners.filter((owner) => statusMatches(owner.status, filters) && (filters.ownerType === "all" || owner.type === filters.ownerType) && (!filters.farmId || getFarmsByOwner(owner.id).some((farm) => farm.id === filters.farmId)));
  return {
    columns: columns([["name", "Proprietário"], ["type", "Tipo"], ["document", "CPF / CNPJ"], ["farms", "Fazendas", "end"], ["status", "Situação"], ["updated", "Atualizado em"]]),
    rows: records.map((owner) => row(owner.id, { name: owner.name, type: owner.type === "individual" ? "Pessoa Física" : "Pessoa Jurídica", document: owner.document, farms: count(getFarmsByOwner(owner.id).length), status: labels.entity[owner.status], updated: owner.updatedAt })),
    metrics: [...baseMetrics(records.length), { label: "Pessoas físicas", value: count(records.filter((owner) => owner.type === "individual").length) }, { label: "Pessoas jurídicas", value: count(records.filter((owner) => owner.type === "company").length) }],
  };
};

const buildRegistrations = (filters: ReportFilters): Pick<ReportViewModel, "columns" | "rows" | "metrics"> => {
  const db = mockStore.getState();
  const records = db.registrations.filter((registration) => farmMatches(registration.farmId, filters) && statusMatches(registration.status, filters) && (filters.hp === "all" || (filters.hp === "yes" ? registration.hp === "Sim" : registration.hp === "Não")));
  return {
    columns: columns([["number", "Matrícula"], ["farm", "Fazenda"], ["owners", "Proprietário"], ["hp", "HP"], ["area", "Área legal", "end"], ["status", "Situação"], ["updated", "Atualizado em"]]),
    rows: records.map((registration) => row(registration.id, { number: registration.number, farm: db.farms.find((farm) => farm.id === registration.farmId)?.name ?? "—", owners: getOwnersByRegistration(registration.id).map((owner) => owner.name).join(", ") || "—", hp: registration.hp ?? "—", area: formatArea(registration.legalArea ?? 0), status: labels.entity[registration.status], updated: registration.updatedAt })),
    metrics: [...baseMetrics(records.length), sumMetric("Área legal", records.reduce((sum, registration) => sum + (registration.legalArea ?? 0), 0), formatArea), { label: "Com HP", value: count(records.filter((registration) => registration.hp === "Sim").length) }],
  };
};

const operationDate = (operation: Operation) => operation.startDate ?? operation.createdAt;
const buildOperations = (filters: ReportFilters): Pick<ReportViewModel, "columns" | "rows" | "metrics"> => {
  const db = mockStore.getState();
  const records = db.operations.filter((operation) => farmMatches(operation.farmId, filters) && statusMatches(operation.status, filters) && (!filters.bank || operation.bank === filters.bank) && inPeriod(operationDate(operation), filters));
  return {
    columns: columns([["number", "Número"], ["farm", "Fazenda"], ["registration", "Matrícula"], ["bank", "Banco"], ["purpose", "Finalidade"], ["value", "Valor", "end"], ["status", "Situação"], ["date", "Data"]]),
    rows: records.map((operation) => row(operation.id, { number: operation.number, farm: db.farms.find((farm) => farm.id === operation.farmId)?.name ?? "—", registration: operation.registrationId ? db.registrations.find((registration) => registration.id === operation.registrationId)?.number ?? "—" : "—", bank: operation.bank, purpose: operation.purpose ?? "—", value: formatCurrency(operation.value), status: labels.operation[operation.status], date: formatIsoDate(operationDate(operation)) })),
    metrics: [...baseMetrics(records.length), sumMetric("Valor das operações", records.reduce((sum, operation) => sum + operation.value, 0), formatCurrency), { label: "Operações ativas", value: count(records.filter((operation) => operation.status === "active").length) }],
  };
};

const guaranteeDate = (guarantee: Guarantee) => guarantee.startDate ?? guarantee.createdAt;
const buildGuarantees = (filters: ReportFilters): Pick<ReportViewModel, "columns" | "rows" | "metrics"> => {
  const db = mockStore.getState();
  const records = db.guarantees.filter((guarantee) => { const registration = db.registrations.find((item) => item.id === guarantee.registrationId); return farmMatches(registration?.farmId, filters) && statusMatches(guarantee.status, filters) && (!filters.bank || (guarantee.bank ?? db.operations.find((operation) => operation.id === guarantee.operationId)?.bank) === filters.bank) && (!filters.guaranteeType || guarantee.type === filters.guaranteeType) && inPeriod(guaranteeDate(guarantee), filters); });
  return {
    columns: columns([["type", "Tipo"], ["operation", "Operação"], ["farm", "Fazenda"], ["registration", "Matrícula"], ["bank", "Banco"], ["value", "Valor", "end"], ["status", "Situação"], ["date", "Data"]]),
    rows: records.map((guarantee) => { const operation = db.operations.find((item) => item.id === guarantee.operationId); const registration = db.registrations.find((item) => item.id === guarantee.registrationId); return row(guarantee.id, { type: guarantee.type, operation: operation?.number ?? "—", farm: registration ? db.farms.find((farm) => farm.id === registration.farmId)?.name ?? "—" : "—", registration: registration?.number ?? "—", bank: guarantee.bank ?? operation?.bank ?? "—", value: formatCurrency(guarantee.value ?? 0), status: labels.guarantee[guarantee.status], date: formatIsoDate(guaranteeDate(guarantee)) }); }),
    metrics: [...baseMetrics(records.length), sumMetric("Valor das garantias", records.reduce((sum, guarantee) => sum + (guarantee.value ?? 0), 0), formatCurrency), { label: "Garantias ativas", value: count(records.filter((guarantee) => guarantee.status === "active").length) }],
  };
};

const documentDate = (document: RuralDocument) => document.expirationDate ?? document.issueDate ?? document.createdAt;
const buildDocuments = (filters: ReportFilters): Pick<ReportViewModel, "columns" | "rows" | "metrics"> => {
  const db = mockStore.getState();
  const records = db.documents.filter((document) => { const validity = getDocumentValidityStatus(document); const days = document.expirationDate ? Math.round((new Date(`${document.expirationDate}T00:00:00Z`).getTime() - new Date("2026-08-21T00:00:00Z").getTime()) / 86400000) : undefined; return farmMatches(document.farmId, filters) && statusMatches(validity, filters) && (!filters.documentType || document.type === filters.documentType) && (filters.expirationWindow === "all" || days !== undefined && days >= 0 && days <= Number(filters.expirationWindow)) && inPeriod(documentDate(document), filters); });
  const expirationCount = records.filter((document) => ["expiring", "expired"].includes(getDocumentValidityStatus(document))).length;
  return {
    columns: columns([["document", "Documento"], ["farm", "Fazenda"], ["registration", "Matrícula"], ["validity", "Validade"], ["status", "Situação"]]),
    rows: records.map((document) => row(document.id, { document: document.number ? `${document.type} · ${document.number}` : document.type, farm: db.farms.find((farm) => farm.id === document.farmId)?.name ?? "—", registration: document.registrationId ? db.registrations.find((registration) => registration.id === document.registrationId)?.number ?? "—" : "—", validity: formatIsoDate(document.expirationDate), status: labels.document[getDocumentValidityStatus(document)] })),
    metrics: [...baseMetrics(records.length), { label: "Vencidos ou a vencer", value: count(expirationCount) }, { label: "Com validade", value: count(records.filter((document) => Boolean(document.expirationDate)).length) }],
  };
};

const buildCar = (filters: ReportFilters): Pick<ReportViewModel, "columns" | "rows" | "metrics"> => {
  const db = mockStore.getState();
  const records = db.carRecords.filter((car) => farmMatches(car.farmId, filters) && statusMatches(car.status, filters));
  return {
    columns: columns([["number", "Número CAR"], ["farm", "Fazenda"], ["registration", "Matrícula"], ["owner", "Proprietário"], ["receipt", "Número do recibo"], ["status", "Situação"], ["updated", "Atualizado em"]]),
    rows: records.map((car) => row(car.id, { number: car.number, farm: db.farms.find((farm) => farm.id === car.farmId)?.name ?? "—", registration: car.registrationId ? db.registrations.find((registration) => registration.id === car.registrationId)?.number ?? "—" : "—", owner: car.ownerId ? db.owners.find((owner) => owner.id === car.ownerId)?.name ?? "—" : "—", receipt: car.receiptNumber ?? "—", status: labels.car[car.status], updated: formatIsoDate(car.updatedAt) })),
    metrics: [...baseMetrics(records.length), { label: "Ativos", value: count(records.filter((car) => car.status === "active").length) }, { label: "Pendentes", value: count(records.filter((car) => car.status === "pending").length) }],
  };
};

const builders: Record<ReportType, (filters: ReportFilters) => Pick<ReportViewModel, "columns" | "rows" | "metrics">> = { farms: buildFarms, owners: buildOwners, registrations: buildRegistrations, operations: buildOperations, guarantees: buildGuarantees, documents: buildDocuments, car: buildCar };
const statusOptions: Record<ReportType, Array<[string, string]>> = {
  farms: [["active", "Ativa"], ["inactive", "Inativa"]], owners: [["active", "Ativo"], ["inactive", "Inativo"]], registrations: [["active", "Ativa"], ["inactive", "Inativa"]],
  operations: [["under_review", "Em análise"], ["active", "Ativa"], ["completed", "Concluída"], ["cancelled", "Cancelada"]],
  guarantees: [["active", "Ativa"], ["closed", "Encerrada"], ["cancelled", "Cancelada"]],
  documents: [["active", "Vigente"], ["expiring", "A vencer"], ["expired", "Vencido"], ["inactive", "Inativo"]],
  car: [["active", "Ativo"], ["pending", "Pendente"], ["inactive", "Inativo"]],
};

export const reportService = {
  async generate(type: ReportType, filters: ReportFilters): Promise<ReportViewModel> {
    await delay(220);
    const definition = reportDefinitions.find((item) => item.id === type)!;
    return clone({ type, title: definition.title, ...builders[type](filters), generatedAt: new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date()) });
  },
  getFilterOptions(type: ReportType): ReportFilterOptions {
    const db = mockStore.getState();
    const banks = new Set([...db.operations.map((operation) => operation.bank), ...db.guarantees.map((guarantee) => guarantee.bank).filter((bank): bank is string => Boolean(bank))]);
    return { farms: db.farms.map((farm) => ({ value: farm.id, label: farm.name })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR")), banks: [...banks].sort((a, b) => a.localeCompare(b, "pt-BR")), guaranteeTypes: [...new Set(db.guarantees.map((guarantee) => guarantee.type))].sort((a, b) => a.localeCompare(b, "pt-BR")), documentTypes: [...new Set(db.documents.map((document) => document.type))].sort((a, b) => a.localeCompare(b, "pt-BR")), statuses: statusOptions[type].map(([value, label]) => ({ value, label })) };
  },
  getRegistrationSummary(registrationId: string) { return clone(getRegistrationRelationCounts(registrationId)); },
  simulateExport(_format: ReportExportFormat) { return "Exportação será disponibilizada na integração final."; },
  validateIntegrity() { return clone(mockStore.validate()); },
};
