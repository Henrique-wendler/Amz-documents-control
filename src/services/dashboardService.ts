import { mockStore } from "../data/mock/mockStore";
import { getExpiringDocuments, getOwnersByRegistration } from "../data/mock/selectors";
import type { Activity, MockDatabase } from "../types/domain";
import type { ChartDatum, DashboardData, DashboardLoadMode, RecentActivityItem } from "../types/dashboard";
import { formatCurrency, formatIsoDate } from "./searchUtils";

const clone = <T,>(value: T): T => structuredClone(value);
const delay = (milliseconds: number) => new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
const empty: DashboardData = { kpis: [], operationsByStatus: [], alerts: [], expiringDocuments: [], guaranteesByType: [], recentActivity: [] };
const referenceDate = "2026-08-21";

const compactCurrency = (value: number) => {
  if (value >= 1_000_000) return `R$ ${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 }).format(value / 1_000_000)} milhões`;
  return formatCurrency(value);
};

const activityRecord = (activity: Activity, db: MockDatabase) => {
  if (activity.entityType === "owner") return db.owners.find((item) => item.id === activity.entityId)?.name ?? activity.entityId;
  if (activity.entityType === "farm") return db.farms.find((item) => item.id === activity.entityId)?.name ?? activity.entityId;
  if (activity.entityType === "registration") return `Matrícula ${db.registrations.find((item) => item.id === activity.entityId)?.number ?? activity.entityId}`;
  if (activity.entityType === "operation") return db.operations.find((item) => item.id === activity.entityId)?.number ?? activity.entityId;
  if (activity.entityType === "guarantee") {
    const guarantee = db.guarantees.find((item) => item.id === activity.entityId);
    const operation = guarantee ? db.operations.find((item) => item.id === guarantee.operationId) : undefined;
    return guarantee ? `${guarantee.type} — Operação ${operation?.number ?? "—"}` : activity.entityId;
  }
  if (activity.entityType === "guaranteeItem") return db.guaranteeItems.find((item) => item.id === activity.entityId)?.description ?? activity.entityId;
  if (activity.entityType === "document") {
    const document = db.documents.find((item) => item.id === activity.entityId);
    const registration = document?.registrationId ? db.registrations.find((item) => item.id === document.registrationId) : undefined;
    return document ? `${document.type} — Matrícula ${registration?.number ?? "—"}` : activity.entityId;
  }
  return db.carRecords.find((item) => item.id === activity.entityId)?.number ?? activity.entityId;
};

const activityDate = (value: string) => new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));

const buildRecentActivity = (db: MockDatabase): RecentActivityItem[] => db.activities
  .slice()
  .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  .slice(0, 8)
  .map((activity) => ({ id: activity.id, dateTime: activityDate(activity.createdAt), action: activity.action, record: activityRecord(activity, db), user: activity.userName }));

const groupGuarantees = (db: MockDatabase): ChartDatum[] => {
  const totals = new Map<string, number>();
  db.guarantees.filter((guarantee) => guarantee.status === "active").forEach((guarantee) => totals.set(guarantee.type, (totals.get(guarantee.type) ?? 0) + 1));
  return Array.from(totals.entries()).sort((a, b) => b[1] - a[1]).map(([label, value], index) => ({ label, value, tone: index === 0 ? "primary" : index < 3 ? "light" : "neutral" }));
};

const buildDashboard = (): DashboardData => {
  const db = mockStore.getState();
  const activeFarms = db.farms.filter((farm) => farm.status === "active");
  const activeRegistrations = db.registrations.filter((registration) => registration.status === "active");
  const activeOperations = db.operations.filter((operation) => operation.status === "active");
  const activeGuarantees = db.guarantees.filter((guarantee) => guarantee.status === "active");
  const pendingDocuments = db.documents.filter((document) => document.status === "expiring" || document.status === "expired");
  const expiring = getExpiringDocuments(referenceDate, 30, db);
  const outdatedAppraisals = activeGuarantees.filter((guarantee) => (guarantee.evaluationYear ?? 0) < 2026).length;
  const registrationsWithoutActiveOwner = db.registrations.filter((registration) => !getOwnersByRegistration(registration.id, db).some((owner) => owner.status === "active")).length;
  const operationValues = activeOperations.reduce((total, operation) => total + operation.value, 0);
  const guaranteeValues = activeGuarantees.reduce((total, guarantee) => total + (guarantee.value ?? 0), 0);
  const totalArea = db.farms.reduce((total, farm) => total + farm.totalArea, 0);
  const statusCount = (status: MockDatabase["operations"][number]["status"]) => db.operations.filter((operation) => operation.status === status).length;

  return {
    kpis: [
      { id: "farms", label: "Fazendas ativas", value: String(activeFarms.length), detail: `${activeFarms.length} de ${db.farms.length} cadastradas`, icon: "farm", tone: "neutral" },
      { id: "area", label: "Área total administrada", value: `${new Intl.NumberFormat("pt-BR").format(totalArea)} ha`, detail: `${db.farms.length} propriedades`, icon: "area", tone: "neutral" },
      { id: "registries", label: "Matrículas", value: String(db.registrations.length), detail: `${activeRegistrations.length} ativas`, icon: "registry", tone: "neutral" },
      { id: "operations", label: "Operações ativas", value: String(activeOperations.length), detail: compactCurrency(operationValues), icon: "operation", tone: "neutral" },
      { id: "guarantees", label: "Garantias ativas", value: String(activeGuarantees.length), detail: compactCurrency(guaranteeValues), icon: "guarantee", tone: "neutral" },
      { id: "pending", label: "Pendências", value: String(pendingDocuments.length), detail: "Requerem atenção", icon: "pending", tone: "warning" },
    ],
    operationsByStatus: [
      { label: "Ativas", value: statusCount("active"), tone: "primary" },
      { label: "Em análise", value: statusCount("under_review"), tone: "warning" },
      { label: "Concluídas", value: statusCount("completed"), tone: "light" },
      { label: "Canceladas", value: statusCount("cancelled"), tone: "neutral" },
    ],
    alerts: [
      { id: "documents", title: "Documentos próximos do vencimento", detail: "Vencem nos próximos 30 dias", count: expiring.length, severity: "alert" },
      { id: "appraisals", title: "Avaliações desatualizadas", detail: "Garantias precisam de nova avaliação", count: outdatedAppraisals, severity: "warning" },
      { id: "owners", title: "Matrícula sem proprietário ativo", detail: "Cadastro exige regularização", count: registrationsWithoutActiveOwner, severity: "info" },
      { id: "analysis", title: "Operações em análise", detail: "Aguardam atualização cadastral", count: statusCount("under_review"), severity: "warning" },
    ],
    expiringDocuments: expiring.map((document) => {
      const farm = db.farms.find((item) => item.id === document.farmId);
      const registration = document.registrationId ? db.registrations.find((item) => item.id === document.registrationId) : undefined;
      const remaining = Math.round((new Date(`${document.expirationDate}T00:00:00Z`).getTime() - new Date(`${referenceDate}T00:00:00Z`).getTime()) / 86400000);
      return { id: document.id, document: document.type, farm: farm?.name ?? "—", registry: registration?.number ?? "—", expiresAt: formatIsoDate(document.expirationDate), daysRemaining: remaining };
    }),
    guaranteesByType: groupGuarantees(db),
    recentActivity: buildRecentActivity(db),
  };
};

export const dashboardService = {
  async getSummary(mode: DashboardLoadMode = "success"): Promise<DashboardData> {
    await delay(520);
    if (mode === "error") throw new Error("Não foi possível carregar os indicadores.");
    return clone(mode === "empty" ? empty : buildDashboard());
  },
  async getAlerts(): Promise<DashboardData["alerts"]> {
    await delay(180);
    return clone(buildDashboard().alerts);
  },
  async getRecentActivity(): Promise<DashboardData["recentActivity"]> {
    await delay(180);
    return clone(buildDashboard().recentActivity);
  },
  getFarmOptions() {
    return mockStore.getState().farms.map((farm) => ({ id: farm.id, name: farm.name }));
  },
};
