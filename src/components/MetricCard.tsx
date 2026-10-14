import type { ReactNode } from "react";

interface MetricCardProps {
  label: string;
  value: string;
  detail?: string;
  icon?: ReactNode;
  tone?: "neutral" | "warning" | "danger" | "success";
  onClick?: () => void;
}

export function MetricCard({ label, value, detail, icon, tone = "neutral", onClick }: MetricCardProps) {
  const content = <>
    <span className="dashboard-kpi__top"><span>{label}</span>{icon ? <span className="dashboard-kpi__icon" aria-hidden="true">{icon}</span> : null}</span>
    <strong>{value}</strong>
    {detail ? <small>{detail}</small> : null}
  </>;
  const className = `dashboard-kpi dashboard-kpi--${tone}${onClick ? " dashboard-kpi--interactive" : ""}`;
  return onClick
    ? <button type="button" className={className} onClick={onClick} aria-label={`${label}: ${value}. ${detail ?? ""}`}>{content}</button>
    : <article className={className}>{content}</article>;
}
