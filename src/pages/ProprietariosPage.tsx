import { useCallback, useEffect, useRef, useState } from "react";
import { Badge, Toast, ToastTitle, Toaster, useToastController } from "@fluentui/react-components";
import { Sidebar } from "../components/Sidebar";
import { Header } from "../components/Header";
import { SectionCard } from "../components/SectionCard";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DashboardMessageState } from "../components/dashboard/DashboardState";
import { OwnerSummary } from "../components/proprietarios/OwnerSummary";
import { OwnerToolbar } from "../components/proprietarios/OwnerToolbar";
import { OwnerGrid } from "../components/proprietarios/OwnerGrid";
import { OwnerDetailsDrawer } from "../components/proprietarios/OwnerDetailsDrawer";
import { OwnerFormDrawer } from "../components/proprietarios/OwnerFormDrawer";
import { proprietarioService } from "../services/proprietarioService";
import type { OwnerDraft, OwnerFilters, OwnerListItem, OwnerListResponse, OwnerLoadMode, OwnerWithRelations } from "../types/proprietario";
import { usePermissions } from "../hooks/usePermissions";

interface ProprietariosPageProps {
  onNavigate: (path: string) => void;
}

type DialogState =
  | { kind: "none" }
  | { kind: "inactivate"; owner: OwnerListItem }
  | { kind: "delete"; owner: OwnerListItem }
  | { kind: "blocked"; owner: OwnerListItem };

const initialFilters: OwnerFilters = { query: "", type: "all", status: "all", farmId: "", page: 1, pageSize: 10 };

const getLoadMode = (): OwnerLoadMode => {
  const state = new URLSearchParams(window.location.search).get("state");
  return state === "error" || state === "empty" ? state : "success";
};

export function ProprietariosPage({ onNavigate }: ProprietariosPageProps) {
  const { hasPermission } = usePermissions();
  const canWrite = hasPermission("owners.write");
  const canInactivate = hasPermission("owners.inactivate");
  const canDelete = hasPermission("owners.soft_delete");
  const [searchInput, setSearchInput] = useState("");
  const [filters, setFilters] = useState(initialFilters);
  const [response, setResponse] = useState<OwnerListResponse>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [details, setDetails] = useState<OwnerWithRelations>();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [formOwner, setFormOwner] = useState<OwnerListItem>();
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  const requestId = useRef(0);
  const toasterId = "owner-feedback";
  const { dispatchToast } = useToastController(toasterId);
  const farms = proprietarioService.getFarmOptions();

  const notify = useCallback((message: string, intent: "success" | "error" | "info" = "success") => {
    dispatchToast(<Toast><ToastTitle>{message}</ToastTitle></Toast>, { intent, timeout: 3200 });
  }, [dispatchToast]);

  const load = useCallback(async (nextFilters: OwnerFilters, showFeedback = false) => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setError(false);
    try {
      const next = await proprietarioService.list(nextFilters, getLoadMode());
      if (currentRequest !== requestId.current) return;
      setResponse(next);
      if (next.page !== nextFilters.page) setFilters((current) => ({ ...current, page: next.page }));
      if (showFeedback) notify("Dados atualizados.");
    } catch {
      if (currentRequest !== requestId.current) return;
      setResponse(undefined);
      setError(true);
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [notify]);

  useEffect(() => { void load(filters); }, [filters, load]);

  useEffect(() => {
    const timer = window.setTimeout(() => setFilters((current) => current.query === searchInput ? current : { ...current, query: searchInput, page: 1 }), 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const hasActiveFilters = Boolean(searchInput || filters.type !== "all" || filters.status !== "all" || filters.farmId);

  const clearFilters = () => {
    setSearchInput("");
    setFilters(initialFilters);
  };

  const viewOwner = async (owner: OwnerListItem) => {
    setDetailsOpen(true);
    setDetails(await proprietarioService.getById(owner.id));
  };

  const openNew = () => {
    setFormOwner(undefined);
    setFormError(undefined);
    setFormOpen(true);
  };

  const openEdit = (owner: OwnerListItem) => {
    setDetailsOpen(false);
    setFormOwner(owner);
    setFormError(undefined);
    setFormOpen(true);
  };

  const saveOwner = async (draft: OwnerDraft) => {
    setSaving(true);
    setFormError(undefined);
    try {
      if (formOwner) {
        await proprietarioService.update(formOwner.id, draft);
        notify("Proprietário atualizado com sucesso.");
      } else {
        await proprietarioService.create(draft);
        notify("Proprietário cadastrado com sucesso.");
      }
      setFormOpen(false);
      await load(filters);
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : "Não foi possível salvar o proprietário.");
    } finally {
      setSaving(false);
    }
  };

  const requestDelete = (owner: OwnerListItem) => {
    const linked = owner.farmCount > 0 || owner.registrationCount > 0 || owner.operationCount > 0;
    setDialog({ kind: linked ? "blocked" : "delete", owner });
  };

  const confirmInactivate = async () => {
    if (dialog.kind !== "inactivate") return;
    const updated = await proprietarioService.inactivate(dialog.owner.id);
    setDialog({ kind: "none" });
    if (details?.owner.id === updated.id) setDetails(await proprietarioService.getById(updated.id));
    notify("Proprietário inativado.");
    await load(filters);
  };

  const confirmDelete = async () => {
    if (dialog.kind !== "delete") return;
    const result = await proprietarioService.delete(dialog.owner.id);
    if (!result.deleted) {
      setDialog({ kind: "blocked", owner: dialog.owner });
      return;
    }
    setDialog({ kind: "none" });
    setDetailsOpen(false);
    notify("Proprietário excluído.");
    await load(filters);
  };

  const dialogConfig = dialog.kind === "inactivate" ? {
    title: "Inativar proprietário?",
    message: "O cadastro continuará disponível para consulta e poderá ser reativado posteriormente.",
    confirmLabel: "Inativar",
    danger: false,
    onConfirm: () => void confirmInactivate(),
  } : dialog.kind === "delete" ? {
    title: "Excluir proprietário?",
    message: `O cadastro de ${dialog.owner.name} será removido definitivamente. Deseja continuar?`,
    confirmLabel: "Excluir",
    danger: true,
    onConfirm: () => void confirmDelete(),
  } : dialog.kind === "blocked" ? {
    title: "Exclusão não permitida",
    message: "Não é possível excluir este proprietário porque existem fazendas, matrículas ou operações vinculadas.",
    confirmLabel: "Entendi",
    danger: false,
    onConfirm: () => setDialog({ kind: "none" }),
  } : undefined;

  return (
    <div className="app-shell">
      <Sidebar activePath="/proprietarios" onNavigate={onNavigate} />
      <div className="app-workspace">
        <Header title="Proprietários" subtitle="Gestão de pessoas físicas e jurídicas vinculadas aos imóveis rurais" refreshing={loading} onRefresh={() => void load(filters, true)} />
        <main className="main-content proprietarios-content">
          <OwnerSummary value={response?.summary} />
          <section className="section-card owner-search-panel" aria-label="Busca e filtros de proprietários">
            <OwnerToolbar query={searchInput} value={filters} farms={farms} hasActiveFilters={hasActiveFilters} canCreate={canWrite} onQueryChange={setSearchInput} onChange={setFilters} onClear={clearFilters} onNew={openNew} />
          </section>
          {error ? (
            <DashboardMessageState kind="error" title="Não foi possível carregar os proprietários" description="Tente carregar novamente a lista de cadastros." onRetry={() => void load(filters)} />
          ) : (
            <SectionCard className="owner-results-card" title={`${response?.total ?? 0} proprietário${response?.total === 1 ? "" : "s"}`} subtitle="Selecione um cadastro para visualizar detalhes e vínculos" action={<Badge appearance="tint" color="subtle">10 por página</Badge>}>
              <OwnerGrid records={response?.records ?? []} loading={loading} filtered={hasActiveFilters} page={response?.page ?? filters.page} totalPages={response?.totalPages ?? 1} canWrite={canWrite} canInactivate={canInactivate} canDelete={canDelete} onView={(owner) => void viewOwner(owner)} onEdit={openEdit} onInactivate={(owner) => setDialog({ kind: "inactivate", owner })} onDelete={requestDelete} onPageChange={(page) => setFilters((current) => ({ ...current, page }))} onClear={clearFilters} onNew={openNew} />
            </SectionCard>
          )}
        </main>
      </div>

      <OwnerDetailsDrawer record={details} open={detailsOpen} canEdit={canWrite} onClose={() => setDetailsOpen(false)} onEdit={() => { if (details) openEdit(details.owner); }} onRelation={(message) => notify(`${message}. O módulo de Fazendas será conectado em uma próxima etapa.`, "info")} />
      <OwnerFormDrawer open={formOpen} owner={formOwner} saving={saving} serviceError={formError} onClose={() => { if (!saving) setFormOpen(false); }} onSave={(draft) => void saveOwner(draft)} />
      <Toaster toasterId={toasterId} position="top-end" />
      {dialogConfig ? <ConfirmDialog open title={dialogConfig.title} message={dialogConfig.message} confirmLabel={dialogConfig.confirmLabel} danger={dialogConfig.danger} onCancel={() => setDialog({ kind: "none" })} onConfirm={dialogConfig.onConfirm} /> : null}
    </div>
  );
}
