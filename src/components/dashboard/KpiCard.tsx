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
import { MetricCard } from "../MetricCard";

interface KpiCardProps {
  item: DashboardKpi;
  onNavigate?: (path: string) => void;
}

const icons: Record<DashboardKpi["icon"], ComponentType> = {
  farm: Building24Regular,
  area: Map24Regular,
  registry: Document24Regular,
  operation: Money24Regular,
  guarantee: ShieldCheckmark24Regular,
  pending: Warning24Regular,
};

const destinations: Partial<Record<DashboardKpi["id"], string>> = {
  farms: "/fazendas", registries: "/matriculas", pending: "/documentos",
};

export function KpiCard({ item, onNavigate }: KpiCardProps) {
  const Icon = icons[item.icon];
  const destination = destinations[item.id];
  return <MetricCard label={item.label} value={item.value} detail={item.detail} icon={<Icon />}
    tone={item.tone} onClick={destination && onNavigate ? () => onNavigate(destination) : undefined} />;
}
