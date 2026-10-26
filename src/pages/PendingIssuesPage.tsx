import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { Badge, Button, Field, Input, Select, Spinner } from "@fluentui/react-components";
import { ArrowClockwise20Regular, ChevronLeft20Regular, ChevronRight20Regular } from "@fluentui/react-icons";
import { PendingIssueDrawer } from "../components/pendencias/PendingIssueDrawer";
import { DashboardMessageState } from "../components/dashboard/DashboardState";
import { Header } from "../components/Header";
import { SectionCard } from "../components/SectionCard";
import { MetricCard } from "../components/MetricCard";
import { CategoryBarChart } from "../components/CategoryBarChart";
import { Sidebar } from "../components/Sidebar";
import { usePermissions } from "../hooks/usePermissions";
import { PendingIssueConcurrencyError } from "../repositories/pendingIssueRepository";
import {
  conditionLabel, financialAllowed, formatCivilDate, formatCount, formatInternalTime,
  formatSourceTime, formatSummaryAmount, pendingIssueStatusLabels, pendingIssueTypeLabels,
  pendingEmptyMessage, pendingIssueCapabilities, showReopenReview, summarizeNames, validatePendingIssueFilters,
} from "../services/pendingIssuePresentation";
import { initialPendingIssueFilters, pendingIssueService } from "../services/pendingIssueService";
import type {
  PendingIssue, PendingIssueAssignee, PendingIssueEvent, PendingIssueFilters,
  PendingIssueManagement, PendingIssuePage, PendingIssueStatus, PendingIssueSummary,
  PendingIssueType, PendingIssueUpdate,
} from "../types/pendingIssue";

interface Props { onNavigate: (path: string) => void; }
type EditDraft = Pick<PendingIssueUpdate, "assignedTo" | "status" | "resolutionDueDate" | "justification">;
const issueTypes = Object.keys(pendingIssueTypeLabels) as PendingIssueType[];
const statuses = Object.keys(pendingIssueStatusLabels) as PendingIssueStatus[];
export function PendingIssuesPage({ onNavigate }: Props) {
  const { permissions } = usePermissions();
  const { canRead, canManage } = pendingIssueCapabilities(permissions);
  const [draftFilters, setDraftFilters] = useState<PendingIssueFilters>(initialPendingIssueFilters);
  const [filters, setFilters] = useState<PendingIssueFilters>(initialPendingIssueFilters);
  const [validationError, setValidationError] = useState("");
  const [summary, setSummary] = useState<PendingIssueSummary>();
  const [page, setPage] = useState<PendingIssuePage>();
  const [assignees, setAssignees] = useState<PendingIssueAssignee[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [overviewError, setOverviewError] = useState("");
  const [tableError, setTableError] = useState("");
  const [selected, setSelected] = useState<PendingIssue>();
  const [management, setManagement] = useState<PendingIssueManagement>();
  const [events, setEvents] = useState<PendingIssueEvent[]>([]);
  const [hasMoreEvents, setHasMoreEvents] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [detailError, setDetailError] = useState("");
  const started = useRef(false);
  const initialized = useRef(false);
  const listRequest = useRef(0);
  const detailRequest = useRef(0);

  const loadList = useCallback(async (next: PendingIssueFilters) => {
    const request = ++listRequest.current;
    setTableLoading(true);
    setTableError("");
    try {
      const result = await pendingIssueService.list(next);
      if (request !== listRequest.current) return;
      if (next.page > 1 && result.items.length === 0) {
        setFilters((current) => ({ ...current, page: 1 }));
        return;
      }
      setPage(result);
      setSelected((current) => current ? result.items.find((issue) => issue.id === current.id) ?? current : undefined);
    } catch (reason) {
      if (request === listRequest.current) setTableError(reason instanceof Error ? reason.message : "Não foi possível carregar a lista.");
    } finally {
      if (request === listRequest.current) setTableLoading(false);
    }
  }, []);

  const refreshOverview = useCallback(async (reconcile: boolean, nextFilters: PendingIssueFilters) => {
    const request = ++listRequest.current;
    setReconciling(reconcile);
    setTableLoading(true);
    setOverviewError("");
    setTableError("");
    try {
      const result = await pendingIssueService.refresh(nextFilters, reconcile);
      if (request !== listRequest.current) return;
      setSummary(result.summary);
      setPage(result.page);
      setSelected((current) => current
        ? result.page.items.find((issue) => issue.id === current.id) ?? current : undefined);
    } catch (reason) {
      if (request === listRequest.current) setOverviewError(reason instanceof Error ? reason.message : "Não foi possível carregar a Central.");
    } finally {
      if (request === listRequest.current) { setReconciling(false); setTableLoading(false); }
    }
  }, []);

  useEffect(() => {
    if (!canRead || started.current) return;
    started.current = true;
    void (async () => {
      await refreshOverview(canManage, initialPendingIssueFilters);
      if (canManage) {
        try { setAssignees(await pendingIssueService.listAssignees()); }
        catch { setAssignees([]); }
      }
      initialized.current = true;
      setInitialLoading(false);
    })();
  }, [canRead, canManage, refreshOverview]);

  useEffect(() => {
    if (!initialized.current) return;
    void loadList(filters);
  }, [filters, loadList]);

  const applyFilters = () => {
    const error = validatePendingIssueFilters(draftFilters);
    setValidationError(error);
    if (error) return;
    setFilters({ ...draftFilters, operationId: draftFilters.operationId.trim(),
      institutionId: draftFilters.institutionId.trim(), farmId: draftFilters.farmId.trim(),
      search: draftFilters.search.trim(), page: 1 });
  };

  const clearFilters = () => {
    setDraftFilters(initialPendingIssueFilters);
    setValidationError("");
    setFilters({ ...initialPendingIssueFilters });
  };
  const removeFilter = (key: keyof PendingIssueFilters) => {
    setDraftFilters((current) => ({ ...current, [key]: initialPendingIssueFilters[key] }));
    setFilters((current) => ({ ...current, [key]: initialPendingIssueFilters[key], page: 1 }));
  };

  const openIssue = async (issue: PendingIssue) => {
    setSelected(issue);
    setManagement(undefined);
    setEvents([]);
    setHasMoreEvents(false);
    await loadDetail(issue.id);
  };

  const loadDetail = async (id: string) => {
    const request = ++detailRequest.current;
    setDetailLoading(true);
    setDetailError("");
    try {
      const result = await pendingIssueService.getDetail(id);
      if (request !== detailRequest.current) return;
      setManagement(result.management);
      setEvents(result.events.items);
      setHasMoreEvents(result.events.hasMore);
    } catch (reason) {
      if (request === detailRequest.current) setDetailError(reason instanceof Error ? reason.message : "Não foi possível abrir a pendência.");
    } finally {
      if (request === detailRequest.current) setDetailLoading(false);
    }
  };

  const closeDetail = () => { detailRequest.current += 1; setSelected(undefined); setManagement(undefined); setDetailError(""); };

  const save = async (draft: EditDraft) => {
    if (!selected || !management || !canManage) return;
    setSaving(true);
    setDetailError("");
    try {
      const updated = await pendingIssueService.update({ id: selected.id, expectedVersion: management.version, ...draft });
      setManagement(updated);
      await Promise.all([refreshOverview(false, filters), loadDetail(selected.id)]);
    } catch (reason) {
      if (reason instanceof PendingIssueConcurrencyError) {
        setDetailError(reason.message);
        await Promise.all([refreshOverview(false, filters), loadDetail(selected.id)]);
        setDetailError(reason.message);
      } else setDetailError(reason instanceof Error ? reason.message : "Não foi possível salvar a pendência.");
    } finally { setSaving(false); }
  };

  const addNote = async (note: string): Promise<boolean> => {
    if (!selected || !canManage) return false;
    setNoteSaving(true);
    setDetailError("");
    try {
      await pendingIssueService.addNote(selected.id, note);
      const result = await pendingIssueService.listEvents(selected.id, 0);
      setEvents(result.items);
      setHasMoreEvents(result.hasMore);
      return true;
    } catch (reason) {
      setDetailError(reason instanceof Error ? reason.message : "Não foi possível adicionar a observação.");
      return false;
    } finally { setNoteSaving(false); }
  };

  const loadMoreEvents = async () => {
    if (!selected || !hasMoreEvents || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await pendingIssueService.listEvents(selected.id, events.length);
      setEvents((current) => [...current, ...result.items]);
      setHasMoreEvents(result.hasMore);
    } catch (reason) { setDetailError(reason instanceof Error ? reason.message : "Não foi possível carregar o histórico."); }
    finally { setLoadingMore(false); }
  };

  const openOnKeyboard = (event: KeyboardEvent<HTMLTableRowElement>, issue: PendingIssue) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); void openIssue(issue); }
  };

  if (!canRead) return <div className="app-shell"><Sidebar activePath="/pendencias" onNavigate={onNavigate} />
    <div className="app-workspace"><Header title="Central de Pendências" subtitle="Acompanhe ocorrências que exigem análise ou regularização." onRefresh={() => undefined} />
      <main className="main-content"><DashboardMessageState kind="error" title="Acesso não autorizado"
        description="Você não possui permissão para consultar a Central de Pendências." onRetry={() => onNavigate("/dashboard")} /></main></div></div>;

  const cards = summary ? [
    { label: "Pendências abertas", value: formatCount(summary.openCount), detail: "Inclui análise e tratamento", tone: "warning" as const },
    { label: "Condições atuais", value: formatCount(summary.currentlyDetectedCount), detail: "Detectadas neste momento", tone: "neutral" as const },
    { label: "Prazos internos vencidos", value: formatCount(summary.internalOverdueCount), detail: "Acompanhamentos fora do prazo", tone: "danger" as const },
    { label: "Sem responsável", value: formatCount(summary.unassignedCount), detail: "Precisam de atribuição", tone: "warning" as const },
    { label: "Valor associado", value: formatSummaryAmount(summary), detail: financialAllowed(summary)
      ? `${formatCount(summary.affectedOperationsCount)} operações afetadas${summary.operationsWithoutFinancialValue ? ` · ${formatCount(summary.operationsWithoutFinancialValue)} sem valor` : ""}`
      : "Acesso financeiro restrito", tone: "neutral" as const },
  ] : [];
  const totalPages = Math.max(1, Math.ceil((page?.total ?? 0) / filters.pageSize));
  const hasFilters = Boolean(filters.status || filters.type || filters.assignedTo || filters.search
    || filters.operationId || filters.institutionId || filters.farmId
    || filters.currentlyDetected !== "all" || filters.internalOverdue !== "all");
  const filterChips: Array<{ key: keyof PendingIssueFilters; label: string }> = [
    ...(filters.search ? [{ key: "search" as const, label: `Busca: ${filters.search}` }] : []),
    ...(filters.status ? [{ key: "status" as const, label: `Status: ${pendingIssueStatusLabels[filters.status]}` }] : []),
    ...(filters.type ? [{ key: "type" as const, label: `Tipo: ${pendingIssueTypeLabels[filters.type]}` }] : []),
    ...(filters.assignedTo ? [{ key: "assignedTo" as const, label: `Responsável: ${assignees.find((person) => person.id === filters.assignedTo)?.name ?? filters.assignedTo}` }] : []),
    ...(filters.internalOverdue !== "all" ? [{ key: "internalOverdue" as const, label: `Prazo: ${filters.internalOverdue === "yes" ? "vencido" : "não vencido"}` }] : []),
    ...(filters.currentlyDetected !== "all" ? [{ key: "currentlyDetected" as const, label: `Condição: ${filters.currentlyDetected === "yes" ? "atual" : "não atual"}` }] : []),
    ...(["operationId", "institutionId", "farmId"] as const).filter((key) => filters[key]).map((key) => ({ key, label: `${{ operationId: "Operação", institutionId: "Instituição", farmId: "Fazenda" }[key]}: ${filters[key]}` })),
  ];
  const chartItems = (key: "status" | "type") => (key === "status" ? statuses : issueTypes).map((value) => ({
    key: value, label: key === "status" ? pendingIssueStatusLabels[value as PendingIssueStatus] : pendingIssueTypeLabels[value as PendingIssueType],
    value: page?.items.filter((item) => item[key] === value).length ?? 0,
  }));
  const selectChartFilter = (key: "status" | "type", value: string) => {
    const next = filters[key] === value ? "" : value;
    setDraftFilters((current) => ({ ...current, [key]: next }));
    setFilters((current) => ({ ...current, [key]: next, page: 1 }));
  };

  return <div className="app-shell"><Sidebar activePath="/pendencias" onNavigate={onNavigate} />
    <div className="app-workspace"><Header title="Central de Pendências" subtitle="Acompanhe ocorrências que exigem análise ou regularização."
      refreshing={tableLoading || reconciling} onRefresh={() => void refreshOverview(false, filters)} />
      <main className="main-content pending-content">
        <div className="pending-page-actions"><p>Condições atuais e histórico de acompanhamento da organização.</p>
          {canManage ? <Button appearance="primary" icon={<ArrowClockwise20Regular />} disabled={reconciling || initialLoading}
            onClick={() => void refreshOverview(true, filters)}>{reconciling ? "Atualizando…" : "Atualizar pendências"}</Button> : null}</div>
        {initialLoading ? <div className="pending-initial-loading"><Spinner label="Carregando a Central de Pendências…" /></div> : null}
        {!initialLoading && overviewError ? <DashboardMessageState kind="error" title="Não foi possível carregar a Central de Pendências"
          description={overviewError} onRetry={() => void refreshOverview(false, filters)} /> : null}
        {!initialLoading && summary ? <><div className="pending-cards">{cards.map((card) => <MetricCard key={card.label} {...card} />)}</div>
          {summary.needsReopenReviewCount > 0 ? <p className="pending-review" role="status">{formatCount(summary.needsReopenReviewCount)} pendência(s) exigem revisão de reabertura.</p> : null}</> : null}

        {!initialLoading && page?.items.length ? <SectionCard title="Análise da página atual" subtitle="Distribuição somente dos registros exibidos nesta página; use as barras para filtrar a consulta completa.">
          <div className="pending-analysis"><div><h3>Por status</h3><CategoryBarChart items={chartItems("status")}
            emptyMessage="Nenhuma pendência nesta página." selectedKey={filters.status}
            onSelect={(value) => selectChartFilter("status", value)} /></div>
            <div><h3>Por tipo</h3><CategoryBarChart items={chartItems("type")}
              emptyMessage="Nenhuma pendência nesta página." selectedKey={filters.type}
              onSelect={(value) => selectChartFilter("type", value)} /></div></div>
        </SectionCard> : null}

        {!initialLoading ? <>
          <SectionCard title="Filtros" subtitle="Encontre as pendências que precisam de atenção">
            <div className="pending-filters">
              <Field label="Busca"><Input value={draftFilters.search} placeholder="Operação, instituição ou origem"
                onChange={(_, data) => setDraftFilters((current) => ({ ...current, search: data.value }))} /></Field>
              <Field label="Status"><Select value={draftFilters.status} onChange={(event) => setDraftFilters((current) => ({ ...current, status: event.target.value as PendingIssueFilters["status"] }))}>
                <option value="">Todos</option>{statuses.map((status) => <option key={status} value={status}>{pendingIssueStatusLabels[status]}</option>)}
              </Select></Field>
              <Field label="Tipo"><Select value={draftFilters.type} onChange={(event) => setDraftFilters((current) => ({ ...current, type: event.target.value as PendingIssueFilters["type"] }))}>
                <option value="">Todos</option>{issueTypes.map((type) => <option key={type} value={type}>{pendingIssueTypeLabels[type]}</option>)}
              </Select></Field>
              <Field label="Prazo interno"><Select value={draftFilters.internalOverdue}
                onChange={(event) => setDraftFilters((current) => ({ ...current, internalOverdue: event.target.value as PendingIssueFilters["internalOverdue"] }))}>
                <option value="all">Todos</option><option value="yes">Vencido</option><option value="no">Não vencido</option>
              </Select></Field>
              <Field label="Responsável">{canManage ? <Select value={draftFilters.assignedTo}
                onChange={(event) => setDraftFilters((current) => ({ ...current, assignedTo: event.target.value }))}>
                <option value="">Todos</option>{assignees.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
              </Select> : <Input value={draftFilters.assignedTo} placeholder="ID do responsável"
                onChange={(_, data) => setDraftFilters((current) => ({ ...current, assignedTo: data.value }))} />}</Field>
            </div>
            <details className="pending-advanced"><summary>Mais filtros</summary><p>Refine pela condição atual, ordenação ou IDs de vínculo.</p>
              <div className="pending-filters pending-filters--advanced">
              <Field label="Condição atual"><Select value={draftFilters.currentlyDetected}
                onChange={(event) => setDraftFilters((current) => ({ ...current, currentlyDetected: event.target.value as PendingIssueFilters["currentlyDetected"] }))}>
                <option value="all">Todas</option><option value="yes">Detectada atualmente</option><option value="no">Não detectada atualmente</option>
              </Select></Field>
              <Field label="Ordenação"><Select value={draftFilters.sort}
                onChange={(event) => setDraftFilters((current) => ({ ...current, sort: event.target.value as PendingIssueFilters["sort"] }))}>
                <option value="identified_desc">Identificação mais recente</option><option value="identified_asc">Identificação mais antiga</option>
                <option value="source_date_asc">Data de origem crescente</option><option value="source_date_desc">Data de origem decrescente</option>
              </Select></Field>
                <Field label="ID da operação"><Input value={draftFilters.operationId} onChange={(_, data) => setDraftFilters((current) => ({ ...current, operationId: data.value }))} /></Field>
                <Field label="ID da instituição"><Input value={draftFilters.institutionId} onChange={(_, data) => setDraftFilters((current) => ({ ...current, institutionId: data.value }))} /></Field>
                <Field label="ID da fazenda"><Input value={draftFilters.farmId} onChange={(_, data) => setDraftFilters((current) => ({ ...current, farmId: data.value }))} /></Field>
              </div></details>
            {validationError ? <p className="pending-filter-error" role="alert">{validationError}</p> : null}
            <div className="pending-filter-actions"><Button appearance="primary" onClick={applyFilters}>Aplicar filtros</Button>
              <Button appearance="secondary" onClick={clearFilters}>Limpar filtros</Button></div>
            {filterChips.length ? <div className="pending-filter-chips" aria-label="Filtros ativos">{filterChips.map((chip) =>
              <Button key={chip.key} size="small" appearance="subtle" aria-label={`Remover filtro ${chip.label}`}
                onClick={() => removeFilter(chip.key)}>{chip.label} ×</Button>)}</div> : null}
          </SectionCard>

          <SectionCard title="Pendências" subtitle={page ? `${formatCount(page.total)} resultado${page.total === 1 ? "" : "s"}` : "Acompanhamento por ocorrência"}
            className="pending-results" action={tableLoading ? <Spinner size="tiny" label="Atualizando lista" /> : <Badge appearance="tint" color="subtle">{filters.pageSize} por página</Badge>}>
            {tableError ? <div className="pending-list-error" role="alert">{tableError} <Button size="small" onClick={() => void loadList(filters)}>Tentar novamente</Button></div> : null}
            {!tableLoading && page && !page.items.length && !tableError ? <div className="pending-empty"><strong>{pendingEmptyMessage(hasFilters)}</strong>
              {hasFilters ? <Button appearance="secondary" onClick={clearFilters}>Limpar filtros</Button> : null}</div> : null}
            {page?.items.length ? <div className="pending-table-wrap"><table className="pending-table"><thead><tr>
              <th>Pendência</th><th>Origem</th><th>Fazenda</th><th>Situação</th><th>Prazo</th><th>Responsável</th><th>Ação</th>
            </tr></thead><tbody>{page.items.map((issue) => <tr key={issue.id} tabIndex={0}
              onClick={() => void openIssue(issue)} onKeyDown={(event) => openOnKeyboard(event, issue)} aria-label={`Abrir ${pendingIssueTypeLabels[issue.type]}`}>
              <td><strong>{pendingIssueTypeLabels[issue.type]}</strong>{showReopenReview(issue) ? <span className="pending-review">Revisão de reabertura</span> : null}</td>
              <td title={issue.sourceName ?? ""}>{issue.sourceName ?? "—"}<small>{formatSourceTime(issue)}</small></td>
              <td title={issue.farms.map((farm) => farm.name).join(", ")}>{summarizeNames(issue.farms.map((farm) => farm.name))}</td>
              <td><Badge appearance="tint" color={issue.status === "resolved" ? "success" : issue.status === "justified" ? "subtle" : issue.status === "open" ? "warning" : "informative"}>
                {pendingIssueStatusLabels[issue.status]}</Badge><small>{conditionLabel(issue)}</small></td>
              <td>{formatCivilDate(issue.resolutionDueDate)}<small>{formatInternalTime(issue)}</small></td>
              <td>{issue.responsibleName ?? "Sem responsável"}</td>
              <td><Button size="small" appearance="subtle" onClick={(event) => { event.stopPropagation(); void openIssue(issue); }}>Detalhes</Button></td>
            </tr>)}</tbody></table></div> : null}
            {page && page.total > 0 ? <nav className="pending-pagination" aria-label="Paginação de pendências">
              <Button appearance="subtle" icon={<ChevronLeft20Regular />} disabled={filters.page <= 1 || tableLoading}
                onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}>Anterior</Button>
              <span>Página {filters.page} de {totalPages}</span>
              <Button appearance="subtle" icon={<ChevronRight20Regular />} iconPosition="after" disabled={filters.page >= totalPages || tableLoading}
                onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}>Próxima</Button>
            </nav> : null}
          </SectionCard>
        </> : null}
      </main>
    </div>
    <PendingIssueDrawer open={Boolean(selected)} issue={selected} management={management} events={events}
      hasMoreEvents={hasMoreEvents} loading={detailLoading} loadingMore={loadingMore} saving={saving} noteSaving={noteSaving}
      canManage={canManage} financialVisible={summary ? financialAllowed(summary) : false} assignees={assignees}
      error={detailError} onClose={closeDetail} onRetry={() => { if (selected) void loadDetail(selected.id); }}
      onSave={(draft) => void save(draft)} onAddNote={addNote} onLoadMore={() => void loadMoreEvents()} />
  </div>;
}
