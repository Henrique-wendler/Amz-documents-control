import { reportQueryRepository, type ReportSnapshot } from "../repositories/reportQueryRepository";
import type {
  ReportColumn, ReportDefinition, ReportExportFormat, ReportFilterOptions, ReportFilters, ReportLoadResult,
  ReportMetric, ReportRow, ReportType, ReportViewModel,
} from "../types/report";
import { formatArea, formatCurrency, formatIsoDate } from "./searchUtils";
import { carStatusLabels, documentValidityLabels, operationStatusLabels } from "./statusLabels";

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

export const initialReportFilters: ReportFilters = {
  farmId: "", status: "", startDate: "", endDate: "", ownerType: "all", hp: "all", bank: "",
  guaranteeType: "", documentType: "", expirationWindow: "all",
};

const labels = {
  entity: { active: "Ativo", inactive: "Inativo" },
  guarantee: { active: "Ativa", closed: "Encerrada", cancelled: "Cancelada" },
} as const;

const statusOptions: Record<ReportType, Array<[string, string]>> = {
  farms: [["active", "Ativa"], ["inactive", "Inativa"]],
  owners: [["active", "Ativo"], ["inactive", "Inativo"]],
  registrations: [["active", "Ativa"], ["inactive", "Inativa"]],
  operations: (["under_review", "active", "completed", "cancelled"] as const).map((status) => [status, operationStatusLabels[status]]),
  guarantees: [["active", "Ativa"], ["closed", "Encerrada"], ["cancelled", "Cancelada"]],
  documents: (["active", "expiring", "expired", "inactive"] as const).map((status) => [status, documentValidityLabels[status]]),
  car: (["active", "pending", "inactive"] as const).map((status) => [status, carStatusLabels[status]]),
};

const columns = (items: Array<[string, string, ("start" | "end")?]>): ReportColumn[] => items.map(([key, label, align]) => ({ key, label, align }));
const row = (id: string, values: Record<string, string>): ReportRow => ({ id, values });
const farmMatches = (farmIds: string[], filters: ReportFilters) => !filters.farmId || farmIds.includes(filters.farmId);
const statusMatches = (status: string, filters: ReportFilters) => !filters.status || status === filters.status;
const sumMetric = (label: string, value: number, formatter: (amount: number) => string): ReportMetric => ({ label, value: formatter(value) });
const baseMetrics = (length: number): ReportMetric[] => [{ label: "Registros", value: count(length) }];
const unique = (values: Array<string | undefined>) => [...new Set(values.filter((value): value is string => Boolean(value)))];

const toCivilDate = (value?: string) => {
  if (!value) return undefined;
  const datePart = value.split(",")[0].trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart;
  const match = datePart.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[2]}-${match[1]}` : undefined;
};
const inPeriod = (date: string | undefined, filters: ReportFilters) => {
  if (!filters.startDate && !filters.endDate) return true;
  const civilDate = toCivilDate(date);
  return Boolean(civilDate && (!filters.startDate || civilDate >= filters.startDate) && (!filters.endDate || civilDate <= filters.endDate));
};
const formatReportDate = (value?: string) => {
  const civilDate = toCivilDate(value);
  return civilDate ? formatIsoDate(civilDate) : "—";
};
const todayCivil = () => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
};
const civilDaysBetween = (from: string, to: string) => Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000);

interface ReportContext {
  farmById: Map<string, ReportSnapshot["farms"][number]>;
  registrationById: Map<string, ReportSnapshot["registrations"][number]>;
  ownerById: Map<string, ReportSnapshot["owners"][number]>;
  operationById: Map<string, ReportSnapshot["operations"][number]>;
  institutionById: Map<string, ReportSnapshot["institutions"][number]>;
  guaranteeTypeById: Map<string, ReportSnapshot["guaranteeTypes"][number]>;
  registrationIdsByOwner: Map<string, Set<string>>;
  ownerIdsByRegistration: Map<string, Set<string>>;
}

const createContext = (snapshot: ReportSnapshot): ReportContext => {
  const registrationIdsByOwner = new Map<string, Set<string>>();
  const ownerIdsByRegistration = new Map<string, Set<string>>();
  snapshot.ownershipLinks.filter((link) => link.status === "active").forEach((link) => {
    const registrations = registrationIdsByOwner.get(link.ownerId) ?? new Set<string>();
    registrations.add(link.registrationId);
    registrationIdsByOwner.set(link.ownerId, registrations);
    const owners = ownerIdsByRegistration.get(link.registrationId) ?? new Set<string>();
    owners.add(link.ownerId);
    ownerIdsByRegistration.set(link.registrationId, owners);
  });
  return {
    farmById: new Map(snapshot.farms.map((item) => [item.id, item])),
    registrationById: new Map(snapshot.registrations.map((item) => [item.id, item])),
    ownerById: new Map(snapshot.owners.map((item) => [item.id, item])),
    operationById: new Map(snapshot.operations.map((item) => [item.id, item])),
    institutionById: new Map(snapshot.institutions.map((item) => [item.id, item])),
    guaranteeTypeById: new Map(snapshot.guaranteeTypes.map((item) => [item.id, item])),
    registrationIdsByOwner, ownerIdsByRegistration,
  };
};

type ReportBody = Pick<ReportViewModel, "columns" | "rows" | "metrics">;

const buildFarms = (snapshot: ReportSnapshot, filters: ReportFilters): ReportBody => {
  const registrationCountByFarm = new Map<string, number>();
  snapshot.registrations.forEach((registration) => registrationCountByFarm.set(registration.farmId, (registrationCountByFarm.get(registration.farmId) ?? 0) + 1));
  const records = snapshot.farms.filter((farm) => farmMatches([farm.id], filters) && statusMatches(farm.status, filters));
  return {
    columns: columns([["name", "Fazenda"], ["location", "Município / UF"], ["area", "Área total", "end"], ["registrations", "Matrículas", "end"], ["status", "Situação"], ["updated", "Atualizado em"]]),
    rows: records.map((farm) => row(farm.id, { name: farm.name, location: `${farm.municipality} / ${farm.state}`, area: formatArea(farm.totalArea), registrations: count(registrationCountByFarm.get(farm.id) ?? 0), status: labels.entity[farm.status], updated: farm.updatedAt })),
    metrics: [...baseMetrics(records.length), sumMetric("Área total", records.reduce((sum, farm) => sum + farm.totalArea, 0), formatArea)],
  };
};

const buildOwners = (snapshot: ReportSnapshot, filters: ReportFilters, context: ReportContext): ReportBody => {
  const farmIdsForOwner = (ownerId: string) => unique([...(context.registrationIdsByOwner.get(ownerId) ?? [])].map((id) => context.registrationById.get(id)?.farmId));
  const records = snapshot.owners.filter((owner) => statusMatches(owner.status, filters)
    && (filters.ownerType === "all" || owner.type === filters.ownerType)
    && farmMatches(farmIdsForOwner(owner.id), filters));
  return {
    columns: columns([["name", "Proprietário"], ["type", "Tipo"], ["document", "CPF / CNPJ"], ["farms", "Fazendas", "end"], ["status", "Situação"], ["updated", "Atualizado em"]]),
    rows: records.map((owner) => row(owner.id, { name: owner.name, type: owner.type === "individual" ? "Pessoa Física" : "Pessoa Jurídica", document: owner.document, farms: count(farmIdsForOwner(owner.id).length), status: labels.entity[owner.status], updated: owner.updatedAt })),
    metrics: [...baseMetrics(records.length), { label: "Pessoas físicas", value: count(records.filter((owner) => owner.type === "individual").length) }, { label: "Pessoas jurídicas", value: count(records.filter((owner) => owner.type === "company").length) }],
  };
};

const buildRegistrations = (snapshot: ReportSnapshot, filters: ReportFilters, context: ReportContext): ReportBody => {
  const records = snapshot.registrations.filter((registration) => farmMatches([registration.farmId], filters) && statusMatches(registration.status, filters));
  return {
    columns: columns([["number", "Matrícula"], ["farm", "Fazenda"], ["owners", "Proprietário"], ["hp", "HP"], ["area", "Área legal", "end"], ["status", "Situação"], ["updated", "Atualizado em"]]),
    rows: records.map((registration) => row(registration.id, {
      number: registration.number,
      farm: context.farmById.get(registration.farmId)?.name ?? "—",
      owners: [...(context.ownerIdsByRegistration.get(registration.id) ?? [])].map((id) => context.ownerById.get(id)?.name).filter(Boolean).join(", ") || "—",
      hp: "Pendente de definição", area: formatArea(registration.legalArea ?? 0), status: labels.entity[registration.status], updated: registration.updatedAt,
    })),
    metrics: [...baseMetrics(records.length), sumMetric("Área legal", records.reduce((sum, registration) => sum + (registration.legalArea ?? 0), 0), formatArea), { label: "HP", value: "Pendente de definição" }],
  };
};

const operationDate = (operation: ReportSnapshot["operations"][number]) => operation.startDate ?? operation.createdAt;
const buildOperations = (snapshot: ReportSnapshot, filters: ReportFilters, context: ReportContext, includeFinancial: boolean): ReportBody => {
  const operationFarmIds = (operation: ReportSnapshot["operations"][number]) => unique(operation.registrations.map((link) => context.registrationById.get(link.registrationId)?.farmId));
  const records = snapshot.operations.filter((operation) => farmMatches(operationFarmIds(operation), filters)
    && statusMatches(operation.status, filters)
    && (!filters.bank || context.institutionById.get(operation.institutionId)?.name === filters.bank)
    && inPeriod(operationDate(operation), filters));
  const baseColumns: ReportColumn[] = columns([["number", "Número"], ["farm", "Fazenda"], ["registration", "Matrícula"], ["bank", "Banco"], ["purpose", "Finalidade"]]);
  if (includeFinancial) baseColumns.push(...columns([["value", "Valor", "end"]]));
  baseColumns.push(...columns([["status", "Situação"], ["date", "Data"]]));
  return {
    columns: baseColumns,
    rows: records.map((operation) => {
      const registrations = operation.registrations.map((link) => context.registrationById.get(link.registrationId)).filter((item): item is NonNullable<typeof item> => Boolean(item));
      const values: Record<string, string> = {
        number: operation.operationNumber, farm: unique(registrations.map((registration) => context.farmById.get(registration.farmId)?.name)).join(", ") || "—",
        registration: registrations.map((registration) => registration.number).join(", ") || "—", bank: context.institutionById.get(operation.institutionId)?.name ?? "—",
        purpose: operation.purpose ?? "—", status: operationStatusLabels[operation.status], date: formatReportDate(operationDate(operation)),
      };
      if (includeFinancial) values.value = formatCurrency(operation.amount ?? 0);
      return row(operation.id, values);
    }),
    metrics: [
      ...baseMetrics(records.length),
      ...(includeFinancial ? [sumMetric("Valor das operações", records.reduce((sum, operation) => sum + (operation.amount ?? 0), 0), formatCurrency)] : []),
      { label: "Operações ativas", value: count(records.filter((operation) => operation.status === "active").length) },
    ],
  };
};

const guaranteeDate = (guarantee: ReportSnapshot["guarantees"][number]) => guarantee.startDate ?? guarantee.createdAt;
const buildGuarantees = (snapshot: ReportSnapshot, filters: ReportFilters, context: ReportContext, includeFinancial: boolean): ReportBody => {
  const typeNames = (guarantee: ReportSnapshot["guarantees"][number]) => guarantee.types.map((link) => context.guaranteeTypeById.get(link.guaranteeTypeId)?.name).filter((name): name is string => Boolean(name));
  const records = snapshot.guarantees.filter((guarantee) => {
    const operation = context.operationById.get(guarantee.operationId);
    const farmIds = unique(guarantee.registrationIds.map((id) => context.registrationById.get(id)?.farmId));
    return farmMatches(farmIds, filters) && statusMatches(guarantee.status, filters)
      && (!filters.bank || (operation && context.institutionById.get(operation.institutionId)?.name === filters.bank))
      && (!filters.guaranteeType || typeNames(guarantee).includes(filters.guaranteeType))
      && inPeriod(guaranteeDate(guarantee), filters);
  });
  const baseColumns: ReportColumn[] = columns([["type", "Tipo"], ["operation", "Operação"], ["farm", "Fazenda"], ["registration", "Matrícula"], ["bank", "Banco"]]);
  if (includeFinancial) baseColumns.push(...columns([["value", "Valor", "end"]]));
  baseColumns.push(...columns([["status", "Situação"], ["date", "Data"]]));
  return {
    columns: baseColumns,
    rows: records.map((guarantee) => {
      const operation = context.operationById.get(guarantee.operationId);
      const registrations = guarantee.registrationIds.map((id) => context.registrationById.get(id)).filter((item): item is NonNullable<typeof item> => Boolean(item));
      const values: Record<string, string> = {
        type: typeNames(guarantee).join(", ") || "—", operation: operation?.operationNumber ?? "—",
        farm: unique(registrations.map((registration) => context.farmById.get(registration.farmId)?.name)).join(", ") || "—",
        registration: registrations.map((registration) => registration.number).join(", ") || "—",
        bank: operation ? context.institutionById.get(operation.institutionId)?.name ?? "—" : "—",
        status: labels.guarantee[guarantee.status], date: formatReportDate(guaranteeDate(guarantee)),
      };
      if (includeFinancial) values.value = formatCurrency(guarantee.amount ?? 0);
      return row(guarantee.id, values);
    }),
    metrics: [
      ...baseMetrics(records.length),
      ...(includeFinancial ? [sumMetric("Valor das garantias", records.reduce((sum, guarantee) => sum + (guarantee.amount ?? 0), 0), formatCurrency)] : []),
      { label: "Garantias ativas", value: count(records.filter((guarantee) => guarantee.status === "active").length) },
    ],
  };
};

const documentDate = (document: ReportSnapshot["documents"][number]) => document.expirationDate ?? document.issueDate ?? document.createdAt;
const buildDocuments = (snapshot: ReportSnapshot, filters: ReportFilters, context: ReportContext): ReportBody => {
  const today = todayCivil();
  const records = snapshot.documents.filter((document) => {
    const expirationDate = toCivilDate(document.expirationDate);
    const days = expirationDate ? civilDaysBetween(today, expirationDate) : undefined;
    return farmMatches([document.farmId], filters) && statusMatches(document.validityStatus, filters)
      && (!filters.documentType || document.type === filters.documentType)
      && (filters.expirationWindow === "all" || days !== undefined && days >= 0 && days <= Number(filters.expirationWindow))
      && inPeriod(documentDate(document), filters);
  });
  const expirationCount = records.filter((document) => document.validityStatus === "expiring" || document.validityStatus === "expired").length;
  return {
    columns: columns([["document", "Documento"], ["farm", "Fazenda"], ["registration", "Matrícula"], ["validity", "Validade"], ["status", "Situação"]]),
    rows: records.map((document) => row(document.id, {
      document: document.number ? `${document.type} · ${document.number}` : document.type,
      farm: context.farmById.get(document.farmId)?.name ?? "—",
      registration: document.registrationId ? context.registrationById.get(document.registrationId)?.number ?? "—" : "—",
      validity: formatReportDate(document.expirationDate), status: documentValidityLabels[document.validityStatus],
    })),
    metrics: [...baseMetrics(records.length), { label: "Vencidos ou a vencer", value: count(expirationCount) }, { label: "Com validade", value: count(records.filter((document) => Boolean(document.expirationDate)).length) }],
  };
};

const buildCar = (snapshot: ReportSnapshot, filters: ReportFilters, context: ReportContext): ReportBody => {
  const records = snapshot.cars.filter((car) => farmMatches([car.farmId], filters) && statusMatches(car.status, filters));
  return {
    columns: columns([["number", "Número CAR"], ["farm", "Fazenda"], ["registration", "Matrícula"], ["owner", "Proprietário"], ["receipt", "Número do recibo"], ["status", "Situação"], ["updated", "Atualizado em"]]),
    rows: records.map((car) => row(car.id, {
      number: car.number, farm: context.farmById.get(car.farmId)?.name ?? "—",
      registration: car.registrationId ? context.registrationById.get(car.registrationId)?.number ?? "—" : "—",
      owner: car.declaredOwnerName ?? "—", receipt: car.receiptNumber ?? "—", status: carStatusLabels[car.status], updated: car.updatedAt,
    })),
    metrics: [...baseMetrics(records.length), { label: "Ativos", value: count(records.filter((car) => car.status === "active").length) }, { label: "Pendentes", value: count(records.filter((car) => car.status === "pending").length) }],
  };
};

const buildReport = (type: ReportType, snapshot: ReportSnapshot, filters: ReportFilters, includeFinancial: boolean): ReportBody => {
  const context = createContext(snapshot);
  if (type === "farms") return buildFarms(snapshot, filters);
  if (type === "owners") return buildOwners(snapshot, filters, context);
  if (type === "registrations") return buildRegistrations(snapshot, filters, context);
  if (type === "operations") return buildOperations(snapshot, filters, context, includeFinancial);
  if (type === "guarantees") return buildGuarantees(snapshot, filters, context, includeFinancial);
  if (type === "documents") return buildDocuments(snapshot, filters, context);
  return buildCar(snapshot, filters, context);
};

const buildFilterOptions = (type: ReportType, snapshot?: ReportSnapshot): ReportFilterOptions => ({
  farms: (snapshot?.farms ?? []).map((farm) => ({ value: farm.id, label: farm.name })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR")),
  banks: (snapshot?.institutions ?? []).map((item) => item.name).sort((a, b) => a.localeCompare(b, "pt-BR")),
  guaranteeTypes: (snapshot?.guaranteeTypes ?? []).map((item) => item.name).sort((a, b) => a.localeCompare(b, "pt-BR")),
  documentTypes: (snapshot?.documentTypes ?? []).map((item) => item.name).sort((a, b) => a.localeCompare(b, "pt-BR")),
  statuses: statusOptions[type].map(([value, label]) => ({ value, label })),
  hpAvailable: false,
});

export const reportService = {
  async generate(type: ReportType, filters: ReportFilters, includeFinancial: boolean, mode: "success" | "error" = "success"): Promise<ReportLoadResult> {
    if (mode === "error") throw new Error("Não foi possível gerar o relatório.");
    const snapshot = await reportQueryRepository.load(type, includeFinancial);
    const definition = reportDefinitions.find((item) => item.id === type)!;
    return {
      report: { type, title: definition.title, ...buildReport(type, snapshot, filters, includeFinancial), generatedAt: new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date()) },
      options: buildFilterOptions(type, snapshot),
    };
  },
  getInitialFilterOptions(type: ReportType) { return buildFilterOptions(type); },
  simulateExport(_format: ReportExportFormat) { return "Exportação será disponibilizada na integração final."; },
};
