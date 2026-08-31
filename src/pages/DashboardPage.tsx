import { useCallback, useEffect, useState } from "react";
import {
  Button,
  Toast,
  ToastTitle,
  Toaster,
  useToastController,
} from "@fluentui/react-components";
import { DocumentBulletList20Regular } from "@fluentui/react-icons";
import { Sidebar } from "../components/Sidebar";
import { Header } from "../components/Header";
import { SectionCard } from "../components/SectionCard";
import { KpiCard } from "../components/dashboard/KpiCard";
import { DashboardFilters } from "../components/dashboard/DashboardFilters";
import { OperationsStatusChart } from "../components/dashboard/OperationsStatusChart";
import { AlertsPanel } from "../components/dashboard/AlertsPanel";
import { ExpiringDocuments } from "../components/dashboard/ExpiringDocuments";
import { GuaranteeTypeChart } from "../components/dashboard/GuaranteeTypeChart";
import { RecentActivity } from "../components/dashboard/RecentActivity";
import { DashboardLoadingState, DashboardMessageState } from "../components/dashboard/DashboardState";
import { dashboardService } from "../services/dashboardService";
import type { DashboardData, DashboardFilters as DashboardFiltersValue, DashboardLoadMode } from "../types/dashboard";

interface DashboardPageProps {
  onNavigate: (path: string) => void;
}

const initialFilters: DashboardFiltersValue = {
  period: "Últimos 30 dias",
  status: "Todas",
  farm: "Todas as fazendas",
};

const getLoadMode = (): DashboardLoadMode => {
  const state = new URLSearchParams(window.location.search).get("state");
  return state === "empty" || state === "error" ? state : "success";
};

export function DashboardPage({ onNavigate }: DashboardPageProps) {
  const [data, setData] = useState<DashboardData>();
  const [filters, setFilters] = useState(initialFilters);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [farms, setFarms] = useState<Array<{ id: string; name: string }>>([]);
  const toasterId = "dashboard-feedback";
  const { dispatchToast } = useToastController(toasterId);

  const notify = useCallback((message: string) => {
    dispatchToast(<Toast><ToastTitle>{message}</ToastTitle></Toast>, { intent: "success", timeout: 2800 });
  }, [dispatchToast]);

  const loadDashboard = useCallback(async (showFeedback = false) => {
    setLoading(true);
    setError(false);
    try {
      const loaded = await dashboardService.getSummary(getLoadMode());
      setData(loaded);
      if (showFeedback) notify("Dados atualizados.");
    } catch {
      setError(true);
      setData(undefined);
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    void loadDashboard();
    void dashboardService.getFarmOptions().then(setFarms);
  }, [loadDashboard]);

  const isEmpty = data ? data.kpis.length === 0 : false;

  return (
    <div className="app-shell">
      <Sidebar activePath="/dashboard" onNavigate={onNavigate} />
      <div className="app-workspace">
        <Header
          title="Visão Geral"
          subtitle="Acompanhamento geral dos imóveis rurais e operações"
          refreshing={loading}
          onRefresh={() => void loadDashboard(true)}
        />
        <main className="main-content dashboard-content">
          <DashboardFilters value={filters} onChange={setFilters} farms={farms} />

          {loading ? <DashboardLoadingState /> : null}
          {!loading && error ? <DashboardMessageState kind="error" onRetry={() => void loadDashboard()} /> : null}
          {!loading && !error && isEmpty ? <DashboardMessageState kind="empty" onRetry={() => void loadDashboard()} /> : null}

          {!loading && !error && data && !isEmpty ? (
            <div className="dashboard-sections">
              <section className="dashboard-kpis" aria-label="Indicadores principais">
                {data.kpis.map((item) => <KpiCard item={item} key={item.id} />)}
              </section>

              <div className="dashboard-grid dashboard-grid--primary">
                <SectionCard title="Operações por situação" subtitle="Distribuição atual das operações financeiras">
                  <OperationsStatusChart data={data.operationsByStatus} />
                </SectionCard>
                <SectionCard title="Pendências e alertas" subtitle="Itens que exigem acompanhamento">
                  <AlertsPanel items={data.alerts} onSelect={(item) => notify(`${item.title}: ${item.count} ocorrência(s).`)} />
                </SectionCard>
              </div>

              <div className="dashboard-grid dashboard-grid--secondary">
                <SectionCard
                  title="Documentos próximos do vencimento"
                  action={(
                    <Button
                      appearance="subtle"
                      size="small"
                      icon={<DocumentBulletList20Regular />}
                      onClick={() => notify("A consulta de documentos será aberta nesta área.")}
                    >
                      Ver documentos
                    </Button>
                  )}
                >
                  <ExpiringDocuments items={data.expiringDocuments} />
                </SectionCard>
                <SectionCard title="Garantias por tipo" subtitle="Composição das garantias ativas">
                  <GuaranteeTypeChart data={data.guaranteesByType} />
                </SectionCard>
              </div>

              <SectionCard title="Movimentações recentes" subtitle="Últimas alterações realizadas no sistema">
                <RecentActivity items={data.recentActivity} />
              </SectionCard>
            </div>
          ) : null}
        </main>
      </div>
      <Toaster toasterId={toasterId} position="top-end" />
    </div>
  );
}
