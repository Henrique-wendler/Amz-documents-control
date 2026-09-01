import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Toast, ToastTitle, Toaster, useToastController } from "@fluentui/react-components";
import { Sidebar } from "../components/Sidebar";
import { Header } from "../components/Header";
import { SectionCard } from "../components/SectionCard";
import { DashboardMessageState } from "../components/dashboard/DashboardState";
import { GlobalSearch } from "../components/consulta/GlobalSearch";
import { CategoryTabs } from "../components/consulta/CategoryTabs";
import { SearchFilters } from "../components/consulta/SearchFilters";
import { SearchResultsGrid } from "../components/consulta/SearchResultsGrid";
import { SearchResultDrawer } from "../components/consulta/SearchResultDrawer";
import { consultaService } from "../services/consultaService";
import type {
  SearchCategory,
  SearchCounts,
  SearchFilters as SearchFiltersValue,
  SearchLoadMode,
  SearchRecord,
  SearchResponse,
} from "../types/consulta";
import { usePermissions } from "../hooks/usePermissions";

interface ConsultaPageProps {
  onNavigate: (path: string) => void;
}

const initialFilters: SearchFiltersValue = {
  query: "",
  category: "all",
  status: "",
  farmId: "",
  ownerType: "",
  municipality: "",
  state: "",
  bank: "",
  valueRange: "",
  guaranteeType: "",
  documentType: "",
  expiration: "",
  sort: "recent",
  page: 1,
  pageSize: 10,
};

const advancedKeys: Array<keyof SearchFiltersValue> = [
  "ownerType",
  "municipality",
  "state",
  "bank",
  "valueRange",
  "guaranteeType",
  "documentType",
  "expiration",
];

const getLoadMode = (): SearchLoadMode => new URLSearchParams(window.location.search).get("state") === "error" ? "error" : "success";

export function ConsultaPage({ onNavigate }: ConsultaPageProps) {
  const { hasPermission } = usePermissions();
  const canReadFinancial = hasPermission("financial.read");
  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState(initialFilters);
  const [response, setResponse] = useState<SearchResponse>();
  const [counts, setCounts] = useState<SearchCounts>();
  const [farms, setFarms] = useState<Array<{ id: string; label: string }>>([]);
  const [selectedRecord, setSelectedRecord] = useState<SearchRecord>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const requestId = useRef(0);
  const toasterId = "consulta-feedback";
  const { dispatchToast } = useToastController(toasterId);

  const notify = useCallback((message: string) => {
    dispatchToast(<Toast><ToastTitle>{message}</ToastTitle></Toast>, { intent: "success", timeout: 2800 });
  }, [dispatchToast]);

  const loadCounts = useCallback(async () => setCounts(await consultaService.getCounts(canReadFinancial)), [canReadFinancial]);

  const search = useCallback(async (nextFilters: SearchFiltersValue, showFeedback = false) => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(false);
    try {
      const nextResponse = await consultaService.search(nextFilters, getLoadMode(), canReadFinancial);
      if (currentRequest !== requestId.current) return;
      setResponse(nextResponse);
      if (showFeedback) notify("Dados atualizados.");
    } catch {
      if (currentRequest !== requestId.current) return;
      setError(true);
      setResponse(undefined);
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [canReadFinancial, notify]);

  useEffect(() => {
    void loadCounts();
    void consultaService.getFarmOptions().then(setFarms);
  }, [loadCounts]);

  useEffect(() => {
    void search(filters);
  }, [filters, search]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilters((current) => current.query === searchInput ? current : { ...current, query: searchInput, page: 1 });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const advancedCount = useMemo(
    () => advancedKeys.filter((key) => Boolean(filters[key])).length,
    [filters],
  );

  const hasActiveFilters = Boolean(
    searchInput ||
    filters.category !== "all" ||
    filters.status ||
    filters.farmId ||
    advancedCount ||
    filters.sort !== "recent",
  );

  const clearAdvanced = () => setFilters((current) => ({
    ...current,
    ...Object.fromEntries(advancedKeys.map((key) => [key, ""])),
    page: 1,
  }));

  const clearFilters = () => {
    setSearchInput("");
    setFilters(initialFilters);
    setSelectedRecord(undefined);
  };

  const changeCategory = (category: SearchCategory) => {
    setSelectedRecord(undefined);
    setFilters((current) => ({
      ...initialFilters,
      query: current.query,
      sort: current.sort,
      category,
    }));
  };

  const feedback = (() => {
    if (loading && !response) return "Carregando resultados";
    const total = response?.total ?? 0;
    if (filters.query) return `${total} resultado${total === 1 ? "" : "s"} para “${filters.query}”`;
    if (filters.category !== "all") {
      const labels: Record<Exclude<SearchCategory, "all">, [string, string]> = {
        owner: ["proprietário encontrado", "proprietários encontrados"],
        farm: ["fazenda encontrada", "fazendas encontradas"],
        registration: ["matrícula encontrada", "matrículas encontradas"],
        operation: ["operação encontrada", "operações encontradas"],
        guarantee: ["garantia encontrada", "garantias encontradas"],
        document: ["documento encontrado", "documentos encontrados"],
        car: ["registro CAR encontrado", "registros CAR encontrados"],
      };
      return `${total} ${labels[filters.category][total === 1 ? 0 : 1]}`;
    }
    return `${total} resultados`;
  })();

  const openRecord = (record: SearchRecord) => {
    const fallbackPaths: Record<SearchRecord["entityType"], string> = {
      owner: "/proprietarios",
      farm: "/fazendas",
      registration: "/matriculas",
      operation: "/",
      guarantee: "/",
      document: "/documentos",
      car: "/car",
    };
    onNavigate(record.openPath ?? fallbackPaths[record.entityType]);
  };

  return (
    <div className="app-shell">
      <Sidebar activePath="/consulta" onNavigate={onNavigate} />
      <div className="app-workspace">
        <Header
          title="Consulta Geral"
          subtitle="Localize rapidamente informações em todos os cadastros"
          refreshing={loading}
          onRefresh={() => { void loadCounts(); void search(filters, true); }}
        />
        <main className="main-content consulta-content">
          <section className="section-card consulta-search-panel" aria-label="Pesquisa e filtros">
            <div className="consulta-search-panel__body">
              <GlobalSearch value={searchInput} onChange={setSearchInput} />
              <CategoryTabs value={filters.category} counts={counts} onChange={changeCategory} />
              <SearchFilters
                category={filters.category}
                value={filters}
                farms={farms}
                hasActiveFilters={hasActiveFilters}
                advancedCount={advancedCount}
                onChange={setFilters}
                onClear={clearFilters}
                onClearAdvanced={clearAdvanced}
              />
            </div>
          </section>

          {error ? (
            <DashboardMessageState
              kind="error"
              title="Não foi possível carregar a Consulta Geral"
              description="Tente carregar novamente os registros da pesquisa."
              onRetry={() => void search(filters)}
            />
          ) : (
            <SectionCard
              className="consulta-results-card"
              title={feedback}
              subtitle="Selecione um registro para visualizar seus detalhes"
              action={<Badge appearance="tint" color="subtle">10 por página</Badge>}
            >
              <SearchResultsGrid
                records={response?.records ?? []}
                category={filters.category}
                loading={loading}
                selectedId={selectedRecord?.id}
                page={response?.page ?? filters.page}
                totalPages={response?.totalPages ?? 1}
                onSelect={setSelectedRecord}
                onPageChange={(page) => { setSelectedRecord(undefined); setFilters((current) => ({ ...current, page })); }}
                onClear={clearFilters}
              />
            </SectionCard>
          )}
        </main>
      </div>

      <SearchResultDrawer
        record={selectedRecord}
        open={Boolean(selectedRecord)}
        onClose={() => setSelectedRecord(undefined)}
        onOpenRecord={openRecord}
        onRelation={(message) => notify(`${message}. A navegação será conectada em uma próxima etapa.`)}
      />
      <Toaster toasterId={toasterId} position="top-end" />
    </div>
  );
}
