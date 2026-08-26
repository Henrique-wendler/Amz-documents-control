import {
  Building24Regular,
  Document24Regular,
  Map24Regular,
  Money24Regular,
  ShieldCheckmark24Regular,
  Warning24Regular,
} from "@fluentui/react-icons";
import type { ComponentType } from "react";
import type { DashboardKpi } from "../../types/dashboard";

interface KpiCardProps {
  item: DashboardKpi;
}

const icons: Record<DashboardKpi["icon"], ComponentType> = {
  farm: Building24Regular,
  area: Map24Regular,
  registry: Document24Regular,
  operation: Money24Regular,
  guarantee: ShieldCheckmark24Regular,
  pending: Warning24Regular,
};

export function KpiCard({ item }: KpiCardProps) {
  const Icon = icons[item.icon];
  return (
    <article className={`dashboard-kpi${item.tone === "warning" ? " dashboard-kpi--warning" : ""}`}>
      <div className="dashboard-kpi__top">
        <span>{item.label}</span>
        <span className="dashboard-kpi__icon" aria-hidden="true"><Icon /></span>
      </div>
      <strong>{item.value}</strong>
      <small>{item.detail}</small>
    </article>
  );
}
