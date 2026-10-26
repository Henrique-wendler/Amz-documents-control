import type { ReportMetric } from "../../types/report";
import { MetricCard } from "../MetricCard";

export function ReportSummary({ metrics }: { metrics: ReportMetric[] }) {
  return <div className="report-summary" aria-label="Resumo do relatório">{metrics.map((metric) =>
    <MetricCard key={metric.label} label={metric.label} value={metric.value} />)}</div>;
}
