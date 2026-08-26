import { useCallback, useEffect, useState } from "react";
import { Badge, Toast, ToastTitle, Toaster, useToastController } from "@fluentui/react-components";
import { Header } from "../components/Header";
import { ReportFiltersPanel } from "../components/reports/ReportFiltersPanel";
import { ReportGrid } from "../components/reports/ReportGrid";
import { ReportSummary } from "../components/reports/ReportSummary";
import { ReportTypeCards } from "../components/reports/ReportTypeCards";
import { SectionCard } from "../components/SectionCard";
import { Sidebar } from "../components/Sidebar";
import { initialReportFilters, reportDefinitions, reportService } from "../services/reportService";
import type { ReportFilters, ReportType, ReportViewModel } from "../types/report";

interface Props { onNavigate: (path: string) => void; }

export function RelatoriosPage({ onNavigate }: Props) {
  const [type, setType] = useState<ReportType>("farms");
  const [filters, setFilters] = useState<ReportFilters>(initialReportFilters);
  const [report, setReport] = useState<ReportViewModel>();
  const [generating, setGenerating] = useState(true);
  const toasterId = "report-feedback";
  const { dispatchToast } = useToastController(toasterId);
  const generate = useCallback(async (nextType: ReportType, nextFilters: ReportFilters) => { setGenerating(true); try { setReport(await reportService.generate(nextType, nextFilters)); } finally { setGenerating(false); } }, []);
  useEffect(() => { void generate("farms", initialReportFilters); }, [generate]);
  const selectType = (nextType: ReportType) => { const nextFilters = { ...initialReportFilters }; setType(nextType); setFilters(nextFilters); void generate(nextType, nextFilters); };
  const options = reportService.getFilterOptions(type);
  const exportReport = () => dispatchToast(<Toast><ToastTitle>{reportService.simulateExport("xlsx")}</ToastTitle></Toast>, { intent: "info", timeout: 3500 });
  return <div className="app-shell"><Sidebar activePath="/relatorios" onNavigate={onNavigate} /><div className="app-workspace"><Header title="Relatórios" subtitle="Consultas consolidadas e exportação de informações" refreshing={generating} onRefresh={() => void generate(type, filters)} /><main className="main-content reports-content">
    <ReportTypeCards items={reportDefinitions} selected={type} onSelect={selectType} />
    <SectionCard className="report-filter-card" title="Filtros do relatório" subtitle={`Configure a consulta de ${reportDefinitions.find((item) => item.id === type)?.title.toLocaleLowerCase("pt-BR")}`}><ReportFiltersPanel type={type} value={filters} options={options} generating={generating} onChange={setFilters} onGenerate={() => void generate(type, filters)} onExport={exportReport} /></SectionCard>
    <SectionCard className="report-preview-card" title={`Pré-visualização · ${report?.title ?? "Relatório"}`} subtitle={report ? `Gerado em ${report.generatedAt}` : "Preparando relatório"} action={<Badge appearance="tint" color="subtle">{report?.rows.length ?? 0} registros</Badge>}>
      {report ? <ReportSummary metrics={report.metrics} /> : null}
      <ReportGrid columns={report?.columns ?? []} rows={report?.rows ?? []} loading={generating} />
    </SectionCard>
  </main></div><Toaster toasterId={toasterId} position="top-end" /></div>;
}
