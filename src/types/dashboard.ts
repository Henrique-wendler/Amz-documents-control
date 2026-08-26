export type DashboardTone = "neutral" | "warning";

export interface DashboardKpi {
  id: string;
  label: string;
  value: string;
  detail: string;
  icon: "farm" | "area" | "registry" | "operation" | "guarantee" | "pending";
  tone: DashboardTone;
}

export interface ChartDatum {
  label: string;
  value: number;
  tone: "primary" | "light" | "neutral" | "warning";
}

export interface DashboardAlert {
  id: string;
  title: string;
  detail: string;
  count: number;
  severity: "alert" | "warning" | "info";
}

export interface ExpiringDocument {
  id: string;
  document: string;
  farm: string;
  registry: string;
  expiresAt: string;
  daysRemaining: number;
}

export interface RecentActivityItem {
  id: string;
  dateTime: string;
  action: string;
  record: string;
  user: string;
}

export interface DashboardFilters {
  period: string;
  status: string;
  farm: string;
}

export interface DashboardData {
  kpis: DashboardKpi[];
  operationsByStatus: ChartDatum[];
  alerts: DashboardAlert[];
  expiringDocuments: ExpiringDocument[];
  guaranteesByType: ChartDatum[];
  recentActivity: RecentActivityItem[];
}

export type DashboardLoadMode = "success" | "empty" | "error";
