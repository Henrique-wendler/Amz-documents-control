import type { ReportAnalysisChart } from "../../types/report";
import { DonutChart } from "./DonutChart";

interface Props {
  chart: ReportAnalysisChart;
  selectedKey?: string;
  onSelect: (key: string) => void;
}

export function ReportChart({ chart, selectedKey, onSelect }: Props) {
  return <figure className="report-chart">
    <figcaption><strong>{chart.title}</strong><span>{chart.description}</span></figcaption>
    <DonutChart chart={chart} selectedKey={selectedKey} onSelect={onSelect} />
  </figure>;
}
