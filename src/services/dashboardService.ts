import { dashboardQueryRepository, type DashboardQueryAccess, type DashboardSnapshot } from "../repositories/dashboardQueryRepository";
import { supabaseFarmRepository } from "../repositories/supabaseFarmRepository";
import type { ChartDatum, DashboardData, DashboardFilters, DashboardLoadMode, RecentActivityItem } from "../types/dashboard";
import { formatCurrency, formatIsoDate } from "./searchUtils";

const empty: DashboardData = { kpis: [], operationsByStatus: [], alerts: [], expiringDocuments: [], guaranteesByType: [], recentActivity: [] };
const dayMs = 86_400_000;

const compactCurrency = (value: number) => value >= 1_000_000
  ? `R$ ${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value / 1_000_000)} milhões`
  : formatCurrency(value);

const parseDate = (value?: string) => {
  if (!value) return undefined;
  const [datePart] = value.split(",");
  const parts = datePart.trim().split("/");
  const normalized = parts.length === 3 ? `${parts[2]}-${parts[1]}-${parts[0]}` : datePart;
  const date = new Date(`${normalized}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const periodStart = (period: string, now: Date) => period === "Ano atual"
  ? new Date(Date.UTC(now.getUTCFullYear(), 0, 1))
  : new Date(now.getTime() - (period === "Últimos 90 dias" ? 90 : 30) * dayMs);

const inPeriod = (updatedAt: string, start: Date) => (parseDate(updatedAt)?.getTime() ?? 0) >= start.getTime();
const formatActivityDate = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Araguaina" }).format(new Date(value));

const actionLabels: Record<string, string> = {
  INSERT: "Cadastro realizado", UPDATE: "Cadastro atualizado", INACTIVATE: "Cadastro inativado",
  CLOSE: "Cadastro encerrado", CANCEL: "Cadastro cancelado", SOFT_DELETE: "Cadastro excluído", RESTORE: "Cadastro restaurado",
};

const buildRecentActivity = (snapshot: DashboardSnapshot, allowedIds: Set<string>, start: Date, farmIsFiltered: boolean): RecentActivityItem[] => {
  const farmById = new Map(snapshot.farms.map((item) => [item.id, item.name]));
  const registrationById = new Map(snapshot.registrations.map((item) => [item.id, item.number]));
  const ownerById = new Map(snapshot.owners.map((item) => [item.id, item.name]));
  const operationById = new Map(snapshot.operations.map((item) => [item.id, item.operationNumber]));
  const guaranteeById = new Map(snapshot.guarantees.map((item) => [item.id, item]));
  const documentById = new Map(snapshot.documents.map((item) => [item.id, item.type]));
  const carById = new Map(snapshot.cars.map((item) => [item.id, item.number]));
  const itemById = new Map(snapshot.guaranteeItems.map((item) => [item.id, item.description]));
  const recordName = (entityType: string, entityId: string) => {
    if (entityType === "owners") return ownerById.get(entityId) ?? "Proprietário";
    if (entityType === "farms") return farmById.get(entityId) ?? "Fazenda";
    if (entityType === "registrations") return `Matrícula ${registrationById.get(entityId) ?? ""}`.trim();
    if (entityType === "operations" || entityType === "operation_financials") return `Operação ${operationById.get(entityId) ?? ""}`.trim();
    if (entityType === "guarantees" || entityType === "guarantee_financials") {
      const operation = guaranteeById.get(entityId)?.operationId;
      return operation ? `Garantia da operação ${operationById.get(operation) ?? ""}`.trim() : "Garantia";
    }
    if (entityType === "guarantee_items") return itemById.get(entityId) ?? "Item de garantia";
    if (entityType === "rural_documents") return documentById.get(entityId) ?? "Documento";
    if (entityType === "car_records") return `CAR ${carById.get(entityId) ?? ""}`.trim();
    return "Registro do sistema";
  };
  return snapshot.audit
    .filter((item) => new Date(item.createdAt).getTime() >= start.getTime())
    .filter((item) => !farmIsFiltered || allowedIds.has(item.entityId))
    .slice(0, 8)
    .map((item) => ({ id: item.id, dateTime: formatActivityDate(item.createdAt), action: actionLabels[item.action] ?? item.action, record: recordName(item.entityType, item.entityId), user: item.actorName }));
};

const buildDashboard = (snapshot: DashboardSnapshot, filters: DashboardFilters, access: DashboardQueryAccess): DashboardData => {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const start = periodStart(filters.period, today);
  const farmIds = new Set(snapshot.farms.filter((farm) => filters.farm === "all" || farm.id === filters.farm).map((farm) => farm.id));
  const farms = snapshot.farms.filter((farm) => farmIds.has(farm.id));
  const registrations = snapshot.registrations.filter((registration) => farmIds.has(registration.farmId));
  const registrationIds = new Set(registrations.map((registration) => registration.id));
  const operations = snapshot.operations.filter((operation) => operation.registrations.some((link) => registrationIds.has(link.registrationId)) && inPeriod(operation.startDate ?? operation.updatedAt, start));
  const operationIds = new Set(operations.map((operation) => operation.id));
  const guarantees = snapshot.guarantees.filter((guarantee) => operationIds.has(guarantee.operationId) && guarantee.registrationIds.some((id) => registrationIds.has(id)) && inPeriod(guarantee.startDate ?? guarantee.updatedAt, start));
  const documents = snapshot.documents.filter((document) => farmIds.has(document.farmId));
  const cars = snapshot.cars.filter((car) => farmIds.has(car.farmId));
  const statusOperations = filters.status === "Ativas" ? operations.filter((item) => item.status === "active")
    : filters.status === "Em análise" ? operations.filter((item) => item.status === "under_review") : operations;
  const activeFarms = farms.filter((farm) => farm.status === "active");
  const activeRegistrations = registrations.filter((registration) => registration.status === "active");
  const activeOperations = statusOperations.filter((operation) => operation.status === "active");
  const activeGuarantees = guarantees.filter((guarantee) => guarantee.status === "active");
  const pendingDocuments = documents.filter((document) => document.validityStatus === "expiring" || document.validityStatus === "expired");
  const expiringDocuments = documents
    .filter((document) => document.validityStatus === "expiring" && document.expirationDate)
    .map((document) => ({ document, days: Math.round(((parseDate(document.expirationDate)?.getTime() ?? today.getTime()) - today.getTime()) / dayMs) }))
    .sort((left, right) => left.days - right.days)
    .slice(0, 8);
  const currentYear = today.getUTCFullYear();
  const outdatedAppraisals = activeGuarantees.filter((guarantee) => !guarantee.evaluationYear || guarantee.evaluationYear < currentYear).length;
  const activeOwnerIds = new Set(snapshot.owners.filter((owner) => owner.status === "active").map((owner) => owner.id));
  const registrationIdsWithOwner = new Set(snapshot.ownershipLinks.filter((link) => link.status === "active" && registrationIds.has(link.registrationId) && activeOwnerIds.has(link.ownerId)).map((link) => link.registrationId));
  const operationsByStatus = ([
    ["Ativas", "active", "primary"], ["Em análise", "under_review", "warning"], ["Concluídas", "completed", "light"], ["Canceladas", "cancelled", "neutral"],
  ] as const).map(([label, status, tone]) => ({ label, value: statusOperations.filter((item) => item.status === status).length, tone } satisfies ChartDatum));
  const guaranteeTypeById = new Map(snapshot.guaranteeTypes.map((type) => [type.id, type.name]));
  const guaranteeTotals = new Map<string, number>();
  activeGuarantees.forEach((guarantee) => {
    const primary = guarantee.types.find((type) => type.isPrimary) ?? guarantee.types[0];
    const label = primary ? guaranteeTypeById.get(primary.guaranteeTypeId) ?? "Tipo não encontrado" : "Sem tipo";
    guaranteeTotals.set(label, (guaranteeTotals.get(label) ?? 0) + 1);
  });
  const guaranteeIds = new Set(guarantees.map((guarantee) => guarantee.id));
  const ownerIds = new Set(snapshot.ownershipLinks.filter((link) => registrationIds.has(link.registrationId)).map((link) => link.ownerId));
  const allowedAuditIds = new Set<string>([
    ...farmIds, ...registrationIds, ...operationIds, ...guaranteeIds,
    ...documents.map((item) => item.id), ...cars.map((item) => item.id), ...ownerIds,
    ...snapshot.guaranteeItems.filter((item) => guaranteeIds.has(item.guaranteeId)).map((item) => item.id),
  ]);
  const operationTotal = activeOperations.reduce((total, operation) => total + (operation.amount ?? 0), 0);
  const guaranteeTotal = activeGuarantees.reduce((total, guarantee) => total + (guarantee.amount ?? 0), 0);
  return {
    kpis: [
      { id: "farms", label: "Fazendas ativas", value: String(activeFarms.length), detail: `${activeFarms.length} de ${farms.length} cadastradas`, icon: "farm", tone: "neutral" },
      { id: "area", label: "Área total administrada", value: `${new Intl.NumberFormat("pt-BR").format(farms.reduce((total, farm) => total + farm.totalArea, 0))} ha`, detail: `${farms.length} propriedades`, icon: "area", tone: "neutral" },
      { id: "registries", label: "Matrículas", value: String(registrations.length), detail: `${activeRegistrations.length} ativas`, icon: "registry", tone: "neutral" },
      { id: "operations", label: filters.status === "Em análise" ? "Operações em análise" : "Operações ativas", value: String(filters.status === "Em análise" ? statusOperations.length : activeOperations.length), detail: access.readFinancial ? compactCurrency(operationTotal) : "Valores restritos", icon: "operation", tone: "neutral" },
      { id: "guarantees", label: "Garantias ativas", value: String(activeGuarantees.length), detail: access.readFinancial ? compactCurrency(guaranteeTotal) : "Valores restritos", icon: "guarantee", tone: "neutral" },
      { id: "pending", label: "Pendências", value: String(pendingDocuments.length), detail: "Requerem atenção", icon: "pending", tone: "warning" },
    ],
    operationsByStatus,
    alerts: [
      { id: "documents", title: "Documentos próximos do vencimento", detail: "Vencem conforme validade calculada", count: expiringDocuments.length, severity: "alert" },
      { id: "appraisals", title: "Avaliações desatualizadas", detail: "Garantias precisam de nova avaliação", count: outdatedAppraisals, severity: "warning" },
      { id: "owners", title: "Matrícula sem proprietário ativo", detail: "Cadastro exige regularização", count: registrations.filter((registration) => !registrationIdsWithOwner.has(registration.id)).length, severity: "info" },
      { id: "analysis", title: "Operações em análise", detail: "Aguardam atualização cadastral", count: operations.filter((operation) => operation.status === "under_review").length, severity: "warning" },
    ],
    expiringDocuments: expiringDocuments.map(({ document, days }) => ({
      id: document.id, document: document.type, farm: snapshot.farms.find((farm) => farm.id === document.farmId)?.name ?? "—",
      registry: snapshot.registrations.find((registration) => registration.id === document.registrationId)?.number ?? "—",
      expiresAt: formatIsoDate(document.expirationDate), daysRemaining: days,
    })),
    guaranteesByType: [...guaranteeTotals.entries()].sort((a, b) => b[1] - a[1]).map(([label, value], index) => ({ label, value, tone: index === 0 ? "primary" : index < 3 ? "light" : "neutral" })),
    recentActivity: access.readAudit ? buildRecentActivity(snapshot, allowedAuditIds, start, filters.farm !== "all") : [],
  };
};

export const dashboardService = {
  async getSummary(filters: DashboardFilters, access: DashboardQueryAccess, mode: DashboardLoadMode = "success"): Promise<DashboardData> {
    if (mode === "error") throw new Error("Não foi possível carregar os indicadores.");
    if (mode === "empty") return structuredClone(empty);
    return buildDashboard(await dashboardQueryRepository.load(access), filters, access);
  },
  async getFarmOptions() {
    return (await supabaseFarmRepository.list()).map((farm) => ({ id: farm.id, name: farm.name }));
  },
};
