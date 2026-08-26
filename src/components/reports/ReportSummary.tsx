import type { ReportMetric } from "../../types/report";

export function ReportSummary({ metrics }: { metrics: ReportMetric[] }) {
  return <div className="report-summary" aria-label="Resumo do relatório">{metrics.map((metric) => <article key={metric.label}><small>{metric.label}</small><strong>{metric.value}</strong></article>)}</div>;
}
