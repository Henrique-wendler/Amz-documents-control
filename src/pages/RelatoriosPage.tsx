import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Toast, ToastTitle, Toaster, useToastController } from "@fluentui/react-components";
import { Header } from "../components/Header";
import { DashboardMessageState } from "../components/dashboard/DashboardState";
import { ReportFiltersPanel } from "../components/reports/ReportFiltersPanel";
import { ReportGrid } from "../components/reports/ReportGrid";
import { ReportSummary } from "../components/reports/ReportSummary";
import { ReportTypeCards } from "../components/reports/ReportTypeCards";
import { SectionCard } from "../components/SectionCard";
import { Sidebar } from "../components/Sidebar";
import { initialReportFilters, reportDefinitions, reportService } from "../services/reportService";
import type { ReportFilterOptions, ReportFilters, ReportType, ReportViewModel } from "../types/report";
import { usePermissions } from "../hooks/usePermissions";

interface Props { onNavigate: (path: string) => void; }

export function RelatoriosPage({ onNavigate }: Props) {
  const { hasPermission } = usePermissions();
  const canRead = hasPermission("reports.read");
  const canGenerate = hasPermission("reports.generate");
  const canExport = hasPermission("reports.export");
  const canIncludeFinancial = hasPermission("financial.read") && hasPermission("reports.financial");
  const [type, setType] = useState<ReportType>("farms");
  const [filters, setFilters] = useState<ReportFilters>(initialReportFilters);
  const [report, setReport] = useState<ReportViewModel>();
  const [options, setOptions] = useState<ReportFilterOptions>(() => reportService.getInitialFilterOptions("farms"));
  const [generating, setGenerating] = useState(true);
  const [error, setError] = useState<string>();
  const toasterId = "report-feedback";
  const { dispatchToast } = useToastController(toasterId);
  const requestId = useRef(0);
  const generate = useCallback(async (nextType: ReportType, nextFilters: ReportFilters) => {
    const currentRequest = ++requestId.current;
    setGenerating(true);
    setError(undefined);
    try {
      if (!canRead) throw new Error("Você não possui permissão para consultar relatórios.");
      const mode = new URLSearchParams(window.location.search).get("state") === "error" ? "error" : "success";
      const loaded = await reportService.generate(nextType, nextFilters, canIncludeFinancial, mode);
      if (currentRequest !== requestId.current) return;
      setReport(loaded.report);
      setOptions(loaded.options);
    } catch (caught) {
      if (currentRequest !== requestId.current) return;
      setReport(undefined);
      setError(caught instanceof Error && caught.message.includes("permissão") ? caught.message : "Tente novamente para atualizar a pré-visualização.");
    } finally {
      if (currentRequest === requestId.current) setGenerating(false);
    }
  }, [canIncludeFinancial, canRead]);
  useEffect(() => { void generate("farms", initialReportFilters); }, [generate]);
  const selectType = (nextType: ReportType) => { const nextFilters = { ...initialReportFilters }; setType(nextType); setFilters(nextFilters); setOptions(reportService.getInitialFilterOptions(nextType)); void generate(nextType, nextFilters); };
  const exportReport = () => dispatchToast(<Toast><ToastTitle>{reportService.simulateExport("xlsx")}</ToastTitle></Toast>, { intent: "info", timeout: 3500 });
  return <div className="app-shell"><Sidebar activePath="/relatorios" onNavigate={onNavigate} /><div className="app-workspace"><Header title="Relatórios" subtitle="Consultas consolidadas e exportação de informações" refreshing={generating} onRefresh={() => void generate(type, filters)} /><main className="main-content reports-content">
    <ReportTypeCards items={reportDefinitions} selected={type} onSelect={selectType} />
    <SectionCard className="report-filter-card" title="Filtros do relatório" subtitle={`Configure a consulta de ${reportDefinitions.find((item) => item.id === type)?.title.toLocaleLowerCase("pt-BR")}`}><ReportFiltersPanel type={type} value={filters} options={options} generating={generating} canGenerate={canGenerate} canExport={canExport} onChange={setFilters} onGenerate={() => void generate(type, filters)} onExport={exportReport} /></SectionCard>
    {error ? <DashboardMessageState kind="error" title="Não foi possível gerar o relatório" description={error} onRetry={() => void generate(type, filters)} /> : <SectionCard className="report-preview-card" title={`Pré-visualização · ${report?.title ?? "Relatório"}`} subtitle={report ? `Gerado em ${report.generatedAt}` : "Preparando relatório"} action={<Badge appearance="tint" color="subtle">{report?.rows.length ?? 0} registros</Badge>}>
      {report ? <ReportSummary metrics={report.metrics} /> : null}
      <ReportGrid columns={report?.columns ?? []} rows={report?.rows ?? []} loading={generating} />
    </SectionCard>}
  </main></div><Toaster toasterId={toasterId} position="top-end" /></div>;
}
