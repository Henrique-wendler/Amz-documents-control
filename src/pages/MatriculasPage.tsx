import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Toast, ToastTitle, Toaster, useToastController } from "@fluentui/react-components";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DashboardMessageState } from "../components/dashboard/DashboardState";
import { Header } from "../components/Header";
import { OwnershipFormDialog } from "../components/matriculas/OwnershipFormDialog";
import { RegistrationDetailsDrawer } from "../components/matriculas/RegistrationDetailsDrawer";
import { RegistrationFormDrawer } from "../components/matriculas/RegistrationFormDrawer";
import { RegistrationGrid } from "../components/matriculas/RegistrationGrid";
import { RegistrationSummary } from "../components/matriculas/RegistrationSummary";
import { RegistrationToolbar } from "../components/matriculas/RegistrationToolbar";
import { SectionCard } from "../components/SectionCard";
import { Sidebar } from "../components/Sidebar";
import { registrationService } from "../services/registrationService";
import type { OwnershipDraft, RegistrationDetailsViewModel, RegistrationDraft, RegistrationFarmOption, RegistrationFilters, RegistrationListItem, RegistrationListResponse, RegistrationLoadMode, RegistrationOwnerOption, RegistrationOwnershipView } from "../types/matricula";
import { usePermissions } from "../hooks/usePermissions";

interface MatriculasPageProps { onNavigate: (path: string) => void; }
type DialogState =
  | { kind: "none" }
  | { kind: "inactivate"; registration: RegistrationListItem }
  | { kind: "delete"; registration: RegistrationListItem }
  | { kind: "blocked"; registration: RegistrationListItem }
  | { kind: "close-link"; ownership: RegistrationOwnershipView }
  | { kind: "delete-link"; ownership: RegistrationOwnershipView };

const initialFilters: RegistrationFilters = { query: "", farmId: "", status: "all", ownerRelation: "all", operationRelation: "all", guaranteeRelation: "all", hp: "all", areaRange: "all", certificateFrom: "", page: 1, pageSize: 10 };
const getLoadMode = (): RegistrationLoadMode => { const state = new URLSearchParams(window.location.search).get("state"); return state === "error" || state === "empty" ? state : "success"; };

export function MatriculasPage({ onNavigate }: MatriculasPageProps) {
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission("registrations.write");
  const canManageOwnership = hasPermission("registrations.manage_ownership");
  const canInactivate = hasPermission("registrations.inactivate");
  const canDelete = hasPermission("registrations.soft_delete");
  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState(initialFilters);
  const [response, setResponse] = useState<RegistrationListResponse>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [details, setDetails] = useState<RegistrationDetailsViewModel>();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [formRegistration, setFormRegistration] = useState<RegistrationListItem>();
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [ownershipFormOpen, setOwnershipFormOpen] = useState(false);
  const [editingOwnership, setEditingOwnership] = useState<RegistrationOwnershipView>();
  const [ownershipError, setOwnershipError] = useState<string>();
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  const [farms, setFarms] = useState<RegistrationFarmOption[]>([]);
  const [owners, setOwners] = useState<RegistrationOwnerOption[]>([]);
  const requestId = useRef(0);
  const initialDetailHandled = useRef(false);
  const toasterId = "registration-feedback";
  const { dispatchToast } = useToastController(toasterId);

  const notify = useCallback((message: string, intent: "success" | "error" | "info" = "success") => dispatchToast(<Toast><ToastTitle>{message}</ToastTitle></Toast>, { intent, timeout: 3200 }), [dispatchToast]);
  const load = useCallback(async (nextFilters: RegistrationFilters, showFeedback = false) => { const currentRequest = ++requestId.current; setLoading(true); setError(false); try { const next = await registrationService.list(nextFilters, getLoadMode()); if (currentRequest !== requestId.current) return; setResponse(next); if (next.page !== nextFilters.page) setFilters((current) => ({ ...current, page: next.page })); if (showFeedback) notify("Dados atualizados."); } catch { if (currentRequest !== requestId.current) return; setResponse(undefined); setError(true); } finally { if (currentRequest === requestId.current) setLoading(false); } }, [notify]);
  useEffect(() => { void load(filters); }, [filters, load]);
  useEffect(() => { void Promise.all([registrationService.getFarmOptions(), registrationService.getOwnerOptions()]).then(([farmOptions, ownerOptions]) => { setFarms(farmOptions); setOwners(ownerOptions); }); }, []);
  useEffect(() => { const timer = window.setTimeout(() => setFilters((current) => current.query === searchInput ? current : { ...current, query: searchInput, page: 1 }), 300); return () => window.clearTimeout(timer); }, [searchInput]);
  useEffect(() => {
    if (initialDetailHandled.current || loading || error) return;
    initialDetailHandled.current = true;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("open") ?? params.get("id");
    if (!id) return;
    void registrationService.getDetails(id).then((record) => {
      if (!record) return;
      setDetails(record);
      setDetailsOpen(true);
    });
  }, [error, loading]);

  const hasActiveFilters = Boolean(searchInput || filters.farmId || filters.status !== "all" || filters.ownerRelation !== "all" || filters.operationRelation !== "all" || filters.guaranteeRelation !== "all" || filters.hp !== "all" || filters.areaRange !== "all" || filters.certificateFrom);
  const clearFilters = () => { setSearchInput(""); setFilters(initialFilters); };
  const viewRegistration = async (registration: RegistrationListItem) => { setDetailsOpen(true); setDetails(await registrationService.getDetails(registration.id)); };
  const refreshDetails = async (id?: string) => { const registrationId = id ?? details?.registration.id; if (registrationId) setDetails(await registrationService.getDetails(registrationId)); };
  const openNew = () => { setFormRegistration(undefined); setFormError(undefined); setFormOpen(true); };
  const openEdit = (registration: RegistrationListItem) => { setDetailsOpen(false); setFormRegistration(registration); setFormError(undefined); setFormOpen(true); };
  const manageOwners = async (registration: RegistrationListItem) => { const next = await registrationService.getDetails(registration.id); setDetails(next); setDetailsOpen(true); setEditingOwnership(undefined); setOwnershipError(undefined); setOwnershipFormOpen(true); };
  const openOwnership = (value?: RegistrationOwnershipView) => { setEditingOwnership(value); setOwnershipError(undefined); setOwnershipFormOpen(true); };

  const saveRegistration = async (draft: RegistrationDraft) => { setSaving(true); setFormError(undefined); try { if (formRegistration) { await registrationService.update(formRegistration.id, formRegistration.version, draft); notify("Matrícula atualizada com sucesso."); } else { await registrationService.create(draft); notify("Matrícula cadastrada com sucesso."); } setFormOpen(false); await load(filters); } catch (reason) { setFormError(reason instanceof Error ? reason.message : "Não foi possível salvar a matrícula."); } finally { setSaving(false); } };
  const saveOwnership = async (draft: OwnershipDraft) => { if (!details) return; setSaving(true); setOwnershipError(undefined); try { if (editingOwnership) { await registrationService.updateOwnershipLink(editingOwnership.link.id, editingOwnership.link.version, draft); notify("Vínculo atualizado com sucesso."); } else { await registrationService.createOwnershipLink(details.registration.id, draft); notify("Proprietário vinculado com sucesso."); } setOwnershipFormOpen(false); setEditingOwnership(undefined); await refreshDetails(); await load(filters); } catch (reason) { setOwnershipError(reason instanceof Error ? reason.message : "Não foi possível salvar o vínculo."); } finally { setSaving(false); } };
  const confirmInactivate = async () => { if (dialog.kind !== "inactivate") return; try { const updated = await registrationService.inactivate(dialog.registration.id, dialog.registration.version); setDialog({ kind: "none" }); if (details?.registration.id === updated.id) await refreshDetails(updated.id); notify("Matrícula inativada."); await load(filters); } catch (reason) { setDialog({ kind: "none" }); notify(reason instanceof Error ? reason.message : "Não foi possível inativar a matrícula.", "error"); } };
  const requestDelete = (registration: RegistrationListItem) => { const linked = Boolean(registration.ownershipLinkCount || registration.operationCount || registration.guaranteeCount || registration.documentCount || registration.carCount); setDialog({ kind: linked ? "blocked" : "delete", registration }); };
  const confirmDelete = async () => { if (dialog.kind !== "delete") return; try { const result = await registrationService.delete(dialog.registration.id, dialog.registration.version); if (!result.deleted) { setDialog({ kind: "blocked", registration: dialog.registration }); return; } setDialog({ kind: "none" }); setDetailsOpen(false); notify("Matrícula excluída."); await load(filters); } catch (reason) { setDialog({ kind: "none" }); notify(reason instanceof Error ? reason.message : "Não foi possível excluir a matrícula.", "error"); } };
  const confirmCloseLink = async () => { if (dialog.kind !== "close-link") return; try { await registrationService.closeOwnershipLink(dialog.ownership.link.id, dialog.ownership.link.version); setDialog({ kind: "none" }); notify("Vínculo encerrado."); await refreshDetails(); await load(filters); } catch (reason) { setDialog({ kind: "none" }); notify(reason instanceof Error ? reason.message : "Não foi possível encerrar o vínculo.", "error"); } };
  const confirmDeleteLink = async () => { if (dialog.kind !== "delete-link") return; try { await registrationService.deleteOwnershipLink(dialog.ownership.link.id, dialog.ownership.link.version); setDialog({ kind: "none" }); notify("Vínculo excluído."); await refreshDetails(); await load(filters); } catch (reason) { setDialog({ kind: "none" }); notify(reason instanceof Error ? reason.message : "Não foi possível excluir o vínculo.", "error"); } };

  const dialogConfig = dialog.kind === "inactivate" ? { title: "Inativar matrícula?", message: "A matrícula permanecerá no histórico, mas ficará indisponível para novos vínculos e operações.", confirmLabel: "Inativar", danger: false, onConfirm: () => void confirmInactivate() }
    : dialog.kind === "delete" ? { title: "Excluir matrícula?", message: `A matrícula ${dialog.registration.number} será removida definitivamente. Deseja continuar?`, confirmLabel: "Excluir", danger: true, onConfirm: () => void confirmDelete() }
    : dialog.kind === "blocked" ? { title: "Exclusão não permitida", message: "Esta matrícula possui registros vinculados e não pode ser excluída. Considere inativá-la.", confirmLabel: "Entendi", danger: false, onConfirm: () => setDialog({ kind: "none" }) }
    : dialog.kind === "close-link" ? { title: "Encerrar vínculo?", message: "O vínculo permanecerá no histórico, mas deixará de ser considerado ativo.", confirmLabel: "Encerrar", danger: false, onConfirm: () => void confirmCloseLink() }
    : dialog.kind === "delete-link" ? { title: "Excluir vínculo?", message: "O vínculo será removido do sistema. Para preservar o histórico, prefira encerrá-lo.", confirmLabel: "Excluir", danger: true, onConfirm: () => void confirmDeleteLink() } : undefined;
  const editingPercentage = editingOwnership?.link.status === "active" ? editingOwnership.link.percentage ?? 0 : 0;
  const currentPercentage = Math.max((details?.activePercentage ?? 0) - editingPercentage, 0);

  return <div className="app-shell"><Sidebar activePath="/matriculas" onNavigate={onNavigate} /><div className="app-workspace"><Header title="Matrículas" subtitle="Gestão registral e vínculos de propriedade dos imóveis rurais" refreshing={loading} onRefresh={() => void load(filters, true)} /><main className="main-content matriculas-content"><RegistrationSummary value={response?.summary} /><section className="section-card registration-search-panel" aria-label="Busca e filtros de matrículas"><RegistrationToolbar query={searchInput} value={filters} farms={farms} hasActiveFilters={hasActiveFilters} canCreate={canWrite} onQueryChange={setSearchInput} onChange={setFilters} onClear={clearFilters} onNew={openNew} /></section>{error ? <DashboardMessageState kind="error" title="Não foi possível carregar as matrículas" description="Tente carregar novamente a lista de registros imobiliários." onRetry={() => void load(filters)} /> : <SectionCard className="registration-results-card" title={`${response?.total ?? 0} matrícula${response?.total === 1 ? "" : "s"}`} subtitle="Selecione um registro para visualizar vínculos e informações registrais" action={<Badge appearance="tint" color="subtle">10 por página</Badge>}><RegistrationGrid records={response?.records ?? []} loading={loading} filtered={hasActiveFilters} page={response?.page ?? filters.page} totalPages={response?.totalPages ?? 1} canWrite={canWrite} canManageOwnership={canManageOwnership} canInactivate={canInactivate} canDelete={canDelete} onView={(record) => void viewRegistration(record)} onEdit={openEdit} onManageOwners={(record) => void manageOwners(record)} onInactivate={(registration) => setDialog({ kind: "inactivate", registration })} onDelete={requestDelete} onPageChange={(page) => setFilters((current) => ({ ...current, page }))} onClear={clearFilters} onNew={openNew} /></SectionCard>}</main></div>
    <RegistrationDetailsDrawer record={details} open={detailsOpen} canEdit={canWrite} canManageOwnership={canManageOwnership} onClose={() => { setDetailsOpen(false); setOwnershipFormOpen(false); }} onEdit={() => { if (details) openEdit(details.registration); }} onFarm={(id) => { setDetailsOpen(false); onNavigate(`/fazendas?open=${id}`); }} onOwner={(id) => { setDetailsOpen(false); onNavigate(`/proprietarios?open=${id}`); }} onDocument={(id) => { setDetailsOpen(false); onNavigate(`/documentos?open=${id}`); }} onCar={(id) => { setDetailsOpen(false); onNavigate(`/car?open=${id}`); }} onAddOwner={() => openOwnership()} onEditOwner={openOwnership} onCloseOwner={(ownership) => setDialog({ kind: "close-link", ownership })} onDeleteOwner={(ownership) => setDialog({ kind: "delete-link", ownership })} onSeeAllOperations={() => { const operation = details?.operations[0]; setDetailsOpen(false); onNavigate(operation ? `/?id=${operation.id}` : "/"); }} />
    <RegistrationFormDrawer open={formOpen} registration={formRegistration} farms={farms} saving={saving} canInactivate={canInactivate} serviceError={formError} onClose={() => { if (!saving) setFormOpen(false); }} onSave={(draft) => void saveRegistration(draft)} />
    <OwnershipFormDialog open={ownershipFormOpen} registrationNumber={details?.registration.number} owners={owners} value={editingOwnership} currentPercentage={currentPercentage} saving={saving} serviceError={ownershipError} onClose={() => { if (!saving) setOwnershipFormOpen(false); }} onSave={(draft) => void saveOwnership(draft)} />
    <Toaster toasterId={toasterId} position="top-end" />{dialogConfig ? <ConfirmDialog open title={dialogConfig.title} message={dialogConfig.message} confirmLabel={dialogConfig.confirmLabel} danger={dialogConfig.danger} onCancel={() => setDialog({ kind: "none" })} onConfirm={dialogConfig.onConfirm} /> : null}
  </div>;
}
