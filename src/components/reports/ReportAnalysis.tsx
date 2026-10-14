import type { ReportAnalysisChart } from "../../types/report";
import { ReportChart } from "./ReportChart";

interface Props {
  charts: ReportAnalysisChart[];
  selected?: { chart: string; key: string };
  onSelect: (chart: string, key: string) => void;
}

export function ReportAnalysis({ charts, selected, onSelect }: Props) {
  return <div className="report-analysis" aria-label="Análise visual do relatório">
    {charts.map((chart) => <ReportChart key={chart.title} chart={chart}
      selectedKey={selected?.chart === chart.title ? selected.key : undefined}
      onSelect={(key) => onSelect(chart.title, key)} />)}
  </div>;
}
