import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Toast, ToastTitle, Toaster, useToastController } from "@fluentui/react-components";
import { CarDetailsDrawer } from "../components/car/CarDetailsDrawer";
import { CarFormDrawer } from "../components/car/CarFormDrawer";
import { CarGrid } from "../components/car/CarGrid";
import { CarSummary } from "../components/car/CarSummary";
import { CarToolbar } from "../components/car/CarToolbar";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DashboardMessageState } from "../components/dashboard/DashboardState";
import { Header } from "../components/Header";
import { SectionCard } from "../components/SectionCard";
import { Sidebar } from "../components/Sidebar";
import { carService } from "../services/carService";
import type { CarDetailsViewModel, CarDraft, CarFilters, CarListItem, CarListResponse, CarLoadMode } from "../types/car";

interface Props { onNavigate: (path: string) => void; }
type DialogState = { kind: "none" } | { kind: "inactivate"; car: CarListItem } | { kind: "delete"; car: CarListItem };
const initialFilters: CarFilters = { query: "", farmId: "", status: "all", page: 1, pageSize: 10 };
const loadMode = (): CarLoadMode => { const state = new URLSearchParams(window.location.search).get("state"); return state === "empty" || state === "error" ? state : "success"; };

export function CarPage({ onNavigate }: Props) {
  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState(initialFilters);
  const [response, setResponse] = useState<CarListResponse>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [details, setDetails] = useState<CarDetailsViewModel>();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [formCar, setFormCar] = useState<CarListItem>();
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  const requestId = useRef(0);
  const initialDetailHandled = useRef(false);
  const toasterId = "car-feedback";
  const { dispatchToast } = useToastController(toasterId);
  const farms = carService.getFarmOptions();
  const registrations = carService.getRegistrationOptions();
  const owners = carService.getOwnerOptions();
  const notify = useCallback((message: string, intent: "success" | "error" = "success") => dispatchToast(<Toast><ToastTitle>{message}</ToastTitle></Toast>, { intent, timeout: 3000 }), [dispatchToast]);
  const load = useCallback(async (next: CarFilters, feedback = false) => {
    const id = ++requestId.current;
    setLoading(true); setError(false);
    try { const result = await carService.list(next, loadMode()); if (id !== requestId.current) return; setResponse(result); if (result.page !== next.page) setFilters((current) => ({ ...current, page: result.page })); if (feedback) notify("Dados atualizados."); }
    catch { if (id !== requestId.current) return; setResponse(undefined); setError(true); }
    finally { if (id === requestId.current) setLoading(false); }
  }, [notify]);
  useEffect(() => { void load(filters); }, [filters, load]);
  useEffect(() => { const timer = window.setTimeout(() => setFilters((current) => current.query === searchInput ? current : { ...current, query: searchInput, page: 1 }), 300); return () => window.clearTimeout(timer); }, [searchInput]);
  useEffect(() => { if (initialDetailHandled.current || loading || error) return; initialDetailHandled.current = true; const id = new URLSearchParams(window.location.search).get("id"); if (id) void carService.getDetails(id).then((record) => { setDetails(record); setDetailsOpen(true); }).catch(() => undefined); }, [error, loading]);
  const hasActiveFilters = Boolean(searchInput || filters.farmId || filters.status !== "all");
  const clearFilters = () => { setSearchInput(""); setFilters(initialFilters); };
  const view = async (car: CarListItem) => { setDetailsOpen(true); setDetails(await carService.getDetails(car.id)); };
  const openNew = () => { setFormCar(undefined); setFormError(undefined); setFormOpen(true); };
  const openEdit = (car: CarListItem) => { setDetailsOpen(false); setFormCar(car); setFormError(undefined); setFormOpen(true); };
  const save = async (draft: CarDraft) => {
    setSaving(true); setFormError(undefined);
    try { if (formCar) { await carService.update(formCar.id, draft); notify("CAR atualizado com sucesso."); } else { await carService.create(draft); notify("CAR cadastrado com sucesso."); } setFormOpen(false); await load(filters); }
    catch (reason) { setFormError(reason instanceof Error ? reason.message : "Não foi possível salvar o CAR."); }
    finally { setSaving(false); }
  };
  const confirmAction = async () => {
    if (dialog.kind === "none") return;
    if (dialog.kind === "inactivate") { await carService.inactivate(dialog.car.id); notify("CAR inativado."); if (details?.car.id === dialog.car.id) setDetails(await carService.getDetails(dialog.car.id)); }
    else { const result = await carService.delete(dialog.car.id); if (!result.deleted) { notify("Não foi possível excluir o CAR.", "error"); return; } notify("CAR excluído do protótipo."); if (details?.car.id === dialog.car.id) setDetailsOpen(false); }
    setDialog({ kind: "none" }); await load(filters);
  };
  const dialogConfig = dialog.kind === "inactivate" ? { title: "Inativar CAR?", message: "O cadastro permanecerá no histórico, com situação inativa.", confirmLabel: "Inativar", danger: false }
    : dialog.kind === "delete" ? { title: "Excluir CAR?", message: `O cadastro ${dialog.car.number} será removido do protótipo.`, confirmLabel: "Excluir", danger: true } : undefined;
  return <div className="app-shell"><Sidebar activePath="/car" onNavigate={onNavigate} /><div className="app-workspace"><Header title="Cadastro Ambiental Rural" subtitle="Gestão dos cadastros ambientais vinculados aos imóveis rurais" refreshing={loading} onRefresh={() => void load(filters, true)} /><main className="main-content documentos-content"><CarSummary value={response?.summary} /><section className="section-card document-search-panel" aria-label="Busca e filtros do CAR"><CarToolbar query={searchInput} value={filters} farms={farms} onQueryChange={setSearchInput} onChange={setFilters} onNew={openNew} /></section>{error ? <DashboardMessageState kind="error" title="Não foi possível carregar os cadastros CAR" description="Tente carregar novamente os dados ambientais." onRetry={() => void load(filters)} /> : <SectionCard className="document-results-card" title={`${response?.total ?? 0} cadastro${response?.total === 1 ? "" : "s"} CAR`} subtitle="Vínculos resolvidos pela base relacional central" action={<Badge appearance="tint" color="subtle">10 por página</Badge>}><CarGrid records={response?.records ?? []} loading={loading} filtered={hasActiveFilters} page={response?.page ?? filters.page} totalPages={response?.totalPages ?? 1} onView={(item) => void view(item)} onEdit={openEdit} onInactivate={(car) => setDialog({ kind: "inactivate", car })} onDelete={(car) => setDialog({ kind: "delete", car })} onPageChange={(page) => setFilters((current) => ({ ...current, page }))} onClear={clearFilters} onNew={openNew} /></SectionCard>}</main></div>
    <CarDetailsDrawer record={details} open={detailsOpen} onClose={() => setDetailsOpen(false)} onEdit={() => { if (details) openEdit(details.car); }} />
    <CarFormDrawer open={formOpen} car={formCar} farms={farms} registrations={registrations} owners={owners} saving={saving} serviceError={formError} onClose={() => { if (!saving) setFormOpen(false); }} onSave={(draft) => void save(draft)} />
    <Toaster toasterId={toasterId} position="top-end" />{dialogConfig ? <ConfirmDialog open title={dialogConfig.title} message={dialogConfig.message} confirmLabel={dialogConfig.confirmLabel} danger={dialogConfig.danger} onCancel={() => setDialog({ kind: "none" })} onConfirm={() => void confirmAction()} /> : null}
  </div>;
}
