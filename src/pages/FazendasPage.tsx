import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Toast, ToastTitle, Toaster, useToastController } from "@fluentui/react-components";
import { Sidebar } from "../components/Sidebar";
import { Header } from "../components/Header";
import { SectionCard } from "../components/SectionCard";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DashboardMessageState } from "../components/dashboard/DashboardState";
import { FarmSummary } from "../components/fazendas/FarmSummary";
import { FarmToolbar } from "../components/fazendas/FarmToolbar";
import { FarmGrid } from "../components/fazendas/FarmGrid";
import { FarmDetailsDrawer } from "../components/fazendas/FarmDetailsDrawer";
import { FarmFormDrawer } from "../components/fazendas/FarmFormDrawer";
import { farmService } from "../services/farmService";
import type { FarmDetailsViewModel, FarmDraft, FarmFilters, FarmListItem, FarmListResponse, FarmLoadMode } from "../types/fazenda";

interface FazendasPageProps { onNavigate: (path: string) => void; }
type DialogState = { kind: "none" } | { kind: "inactivate"; farm: FarmListItem } | { kind: "delete"; farm: FarmListItem } | { kind: "blocked"; farm: FarmListItem };
const initialFilters: FarmFilters = { query: "", status: "all", state: "", municipality: "", areaRange: "all", hasRegistration: "all", hasActiveOperation: "all", hasCar: "all", page: 1, pageSize: 10 };
const getLoadMode = (): FarmLoadMode => { const state = new URLSearchParams(window.location.search).get("state"); return state === "error" || state === "empty" ? state : "success"; };

export function FazendasPage({ onNavigate }: FazendasPageProps) {
  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState(initialFilters);
  const [response, setResponse] = useState<FarmListResponse>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [details, setDetails] = useState<FarmDetailsViewModel>();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [formFarm, setFormFarm] = useState<FarmListItem>();
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  const requestId = useRef(0);
  const initialDetailHandled = useRef(false);
  const toasterId = "farm-feedback";
  const { dispatchToast } = useToastController(toasterId);

  const notify = useCallback((message: string, intent: "success" | "error" | "info" = "success") => dispatchToast(<Toast><ToastTitle>{message}</ToastTitle></Toast>, { intent, timeout: 3200 }), [dispatchToast]);
  const load = useCallback(async (nextFilters: FarmFilters, showFeedback = false) => {
    const currentRequest = ++requestId.current; setLoading(true); setError(false);
    try { const next = await farmService.list(nextFilters, getLoadMode()); if (currentRequest !== requestId.current) return; setResponse(next); if (next.page !== nextFilters.page) setFilters((current) => ({ ...current, page: next.page })); if (showFeedback) notify("Dados atualizados."); }
    catch { if (currentRequest !== requestId.current) return; setResponse(undefined); setError(true); }
    finally { if (currentRequest === requestId.current) setLoading(false); }
  }, [notify]);

  useEffect(() => { void load(filters); }, [filters, load]);
  useEffect(() => { const timer = window.setTimeout(() => setFilters((current) => current.query === searchInput ? current : { ...current, query: searchInput, page: 1 }), 300); return () => window.clearTimeout(timer); }, [searchInput]);
  useEffect(() => {
    if (initialDetailHandled.current || loading || error) return;
    initialDetailHandled.current = true;
    const id = new URLSearchParams(window.location.search).get("id");
    if (!id) return;
    void farmService.getDetails(id).then((record) => {
      if (!record) return;
      setDetails(record);
      setDetailsOpen(true);
    });
  }, [error, loading]);

  const hasActiveFilters = Boolean(searchInput || filters.status !== "all" || filters.state || filters.municipality || filters.areaRange !== "all" || filters.hasRegistration !== "all" || filters.hasActiveOperation !== "all" || filters.hasCar !== "all");
  const clearFilters = () => { setSearchInput(""); setFilters(initialFilters); };
  const viewFarm = async (farm: FarmListItem) => { setDetailsOpen(true); setDetails(await farmService.getDetails(farm.id)); };
  const openNew = () => { setFormFarm(undefined); setFormError(undefined); setFormOpen(true); };
  const openEdit = (farm: FarmListItem) => { setDetailsOpen(false); setFormFarm(farm); setFormError(undefined); setFormOpen(true); };
  const saveFarm = async (draft: FarmDraft) => {
    setSaving(true); setFormError(undefined);
    try { if (formFarm) { await farmService.update(formFarm.id, draft); notify("Fazenda atualizada com sucesso."); } else { await farmService.create(draft); notify("Fazenda cadastrada com sucesso."); } setFormOpen(false); await load(filters); }
    catch (reason) { setFormError(reason instanceof Error ? reason.message : "Não foi possível salvar a fazenda."); }
    finally { setSaving(false); }
  };
  const requestDelete = (farm: FarmListItem) => { const linked = Boolean(farm.registrationCount || farm.operationCount || farm.documentCount || farm.carCount); setDialog({ kind: linked ? "blocked" : "delete", farm }); };
  const confirmInactivate = async () => { if (dialog.kind !== "inactivate") return; const updated = await farmService.inactivate(dialog.farm.id); setDialog({ kind: "none" }); if (details?.farm.id === updated.id) setDetails(await farmService.getDetails(updated.id)); notify("Fazenda inativada."); await load(filters); };
  const confirmDelete = async () => { if (dialog.kind !== "delete") return; const result = await farmService.delete(dialog.farm.id); if (!result.deleted) { setDialog({ kind: "blocked", farm: dialog.farm }); return; } setDialog({ kind: "none" }); setDetailsOpen(false); notify("Fazenda excluída."); await load(filters); };
  const dialogConfig = dialog.kind === "inactivate" ? { title: "Inativar fazenda?", message: "A fazenda permanecerá no histórico do sistema, mas ficará indisponível para novos vínculos e operações.", confirmLabel: "Inativar", danger: false, onConfirm: () => void confirmInactivate() }
    : dialog.kind === "delete" ? { title: "Excluir fazenda?", message: `O cadastro de ${dialog.farm.name} será removido definitivamente. Deseja continuar?`, confirmLabel: "Excluir", danger: true, onConfirm: () => void confirmDelete() }
    : dialog.kind === "blocked" ? { title: "Exclusão não permitida", message: "Esta fazenda possui registros vinculados e não pode ser excluída. Considere inativá-la.", confirmLabel: "Entendi", danger: false, onConfirm: () => setDialog({ kind: "none" }) } : undefined;

  return <div className="app-shell"><Sidebar activePath="/fazendas" onNavigate={onNavigate} /><div className="app-workspace"><Header title="Fazendas" subtitle="Cadastro e gestão dos imóveis rurais" refreshing={loading} onRefresh={() => void load(filters, true)} /><main className="main-content fazendas-content">
    <FarmSummary value={response?.summary} />
    <section className="section-card farm-search-panel" aria-label="Busca e filtros de fazendas"><FarmToolbar query={searchInput} value={filters} states={response?.states ?? []} municipalities={response?.municipalities ?? []} hasActiveFilters={hasActiveFilters} onQueryChange={setSearchInput} onChange={setFilters} onClear={clearFilters} onNew={openNew} /></section>
    {error ? <DashboardMessageState kind="error" title="Não foi possível carregar as fazendas" description="Tente carregar novamente a lista de imóveis rurais." onRetry={() => void load(filters)} /> : <SectionCard className="farm-results-card" title={`${response?.total ?? 0} fazenda${response?.total === 1 ? "" : "s"}`} subtitle="Selecione um imóvel para visualizar seus dados e vínculos" action={<Badge appearance="tint" color="subtle">10 por página</Badge>}><FarmGrid records={response?.records ?? []} loading={loading} filtered={hasActiveFilters} page={response?.page ?? filters.page} totalPages={response?.totalPages ?? 1} onView={(farm) => void viewFarm(farm)} onEdit={openEdit} onInactivate={(farm) => setDialog({ kind: "inactivate", farm })} onDelete={requestDelete} onPageChange={(page) => setFilters((current) => ({ ...current, page }))} onClear={clearFilters} onNew={openNew} /></SectionCard>}
  </main></div>
  <FarmDetailsDrawer record={details} open={detailsOpen} onClose={() => setDetailsOpen(false)} onEdit={() => { if (details) openEdit(details.farm); }} onSeeAllOperations={() => { setDetailsOpen(false); onNavigate("/"); }} />
  <FarmFormDrawer open={formOpen} farm={formFarm} saving={saving} serviceError={formError} onClose={() => { if (!saving) setFormOpen(false); }} onSave={(draft) => void saveFarm(draft)} />
  <Toaster toasterId={toasterId} position="top-end" />
  {dialogConfig ? <ConfirmDialog open title={dialogConfig.title} message={dialogConfig.message} confirmLabel={dialogConfig.confirmLabel} danger={dialogConfig.danger} onCancel={() => setDialog({ kind: "none" })} onConfirm={dialogConfig.onConfirm} /> : null}
  </div>;
}
