import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Dropdown, Field, Input, Option, Tab, TabList, Toast, ToastTitle, Toaster, useToastController } from "@fluentui/react-components";
import { Add20Regular, Search20Regular } from "@fluentui/react-icons";
import { CatalogFormDrawer } from "../components/administracao/CatalogFormDrawer";
import { CatalogGrid } from "../components/administracao/CatalogGrid";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { DashboardMessageState } from "../components/dashboard/DashboardState";
import { Header } from "../components/Header";
import { SectionCard } from "../components/SectionCard";
import { Sidebar } from "../components/Sidebar";
import { usePermissions } from "../hooks/usePermissions";
import { catalogAdministrationService } from "../services/catalogAdministrationService";
import type { CatalogAdministrationData, CatalogDraft, CatalogEntry, CatalogKind } from "../types/catalogAdministration";

interface CatalogsPageProps { onNavigate: (path: string) => void; }

const emptyData: CatalogAdministrationData = { financialInstitutions: [], guaranteeTypes: [], documentTypes: [] };
const labels: Record<CatalogKind, { tab: string; singular: string }> = {
  financialInstitutions: { tab: "Instituições financeiras", singular: "instituição financeira" },
  guaranteeTypes: { tab: "Tipos de garantia", singular: "tipo de garantia" },
  documentTypes: { tab: "Tipos de documento", singular: "tipo de documento" },
};

export function CatalogsPage({ onNavigate }: CatalogsPageProps) {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission("catalogs.manage");
  const [data, setData] = useState<CatalogAdministrationData>(emptyData);
  const [kind, setKind] = useState<CatalogKind>("financialInstitutions");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const [loading, setLoading] = useState(canManage);
  const [error, setError] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CatalogEntry>();
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [statusEntry, setStatusEntry] = useState<CatalogEntry>();
  const toasterId = "catalog-administration-feedback";
  const { dispatchToast } = useToastController(toasterId);

  const notify = useCallback((message: string, intent: "success" | "error" = "success") => {
    dispatchToast(<Toast><ToastTitle>{message}</ToastTitle></Toast>, { intent, timeout: 3600 });
  }, [dispatchToast]);

  const load = useCallback(async (showFeedback = false) => {
    if (!canManage) return;
    setLoading(true);
    setError(false);
    try {
      setData(await catalogAdministrationService.list());
      if (showFeedback) notify("Catálogos atualizados.");
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [canManage, notify]);

  useEffect(() => { void load(); }, [load]);

  const entries = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    return data[kind].filter((entry) => (
      (!normalized || [entry.name, entry.shortName, entry.code].some((value) => value?.toLocaleLowerCase("pt-BR").includes(normalized)))
      && (status === "all" || entry.status === status)
    ));
  }, [data, kind, query, status]);

  const openCreate = () => { setEditing(undefined); setFormError(undefined); setFormOpen(true); };
  const openEdit = (entry: CatalogEntry) => { setEditing(entry); setFormError(undefined); setFormOpen(true); };

  const save = async (draft: CatalogDraft) => {
    setSaving(true);
    setFormError(undefined);
    try {
      if (editing) await catalogAdministrationService.update(editing, draft);
      else await catalogAdministrationService.create(kind, draft);
      setFormOpen(false);
      notify(editing ? "Item atualizado com sucesso." : "Item criado com sucesso.");
      await load();
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : "Não foi possível salvar o item.");
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async () => {
    if (!statusEntry) return;
    const entry = statusEntry;
    setStatusEntry(undefined);
    try {
      await catalogAdministrationService.toggleStatus(entry);
      notify(entry.status === "active" ? "Item inativado. O histórico relacionado foi preservado." : "Item reativado.");
      await load();
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "Não foi possível alterar a situação.", "error");
    }
  };

  if (!canManage) return <div className="app-shell"><Sidebar activePath="/administracao/catalogos" onNavigate={onNavigate} /><div className="app-workspace"><Header title="Administração" subtitle="Catálogos empresariais" refreshing={false} onRefresh={() => undefined} /><main className="main-content"><DashboardMessageState kind="error" title="Acesso não autorizado" description="Você não possui permissão para gerenciar os catálogos desta organização." onRetry={() => onNavigate("/dashboard")} /></main></div></div>;

  return <div className="app-shell">
    <Sidebar activePath="/administracao/catalogos" onNavigate={onNavigate} />
    <div className="app-workspace">
      <Header title="Catálogos" subtitle="Administração das referências usadas nos cadastros" refreshing={loading} onRefresh={() => void load(true)} />
      <main className="main-content catalog-administration-content">
        <TabList className="catalog-administration-tabs" selectedValue={kind} onTabSelect={(_, value) => { setKind(value.value as CatalogKind); setQuery(""); setStatus("all"); }}>
          {(Object.keys(labels) as CatalogKind[]).map((catalogKind) => <Tab key={catalogKind} value={catalogKind}>{labels[catalogKind].tab}</Tab>)}
        </TabList>
        <section className="section-card catalog-administration-toolbar" aria-label="Busca e filtros do catálogo">
          <Field className="catalog-administration-toolbar__search" label="Buscar"><Input contentBefore={<Search20Regular />} placeholder="Nome, sigla ou código" value={query} onChange={(_, value) => setQuery(value.value)} /></Field>
          <Field label="Situação"><Dropdown value={status === "all" ? "Todas" : status === "active" ? "Ativo" : "Inativo"} selectedOptions={[status]} onOptionSelect={(_, value) => setStatus(value.optionValue as "all" | "active" | "inactive")}><Option value="all">Todas</Option><Option value="active">Ativo</Option><Option value="inactive">Inativo</Option></Dropdown></Field>
          <Button className="catalog-administration-toolbar__new" appearance="primary" icon={<Add20Regular />} onClick={openCreate}>Novo item</Button>
        </section>
        {error ? <DashboardMessageState kind="error" title="Não foi possível carregar os catálogos" description="Verifique a conexão e tente novamente." onRetry={() => void load()} /> : <SectionCard className="catalog-administration-results" title={`${entries.length} ${entries.length === 1 ? "item" : "itens"}`} subtitle={`${labels[kind].tab} da organização atual`}><CatalogGrid kind={kind} entries={entries} loading={loading} onEdit={openEdit} onToggleStatus={setStatusEntry} /></SectionCard>}
      </main>
    </div>
    <CatalogFormDrawer open={formOpen} kind={kind} entry={editing} saving={saving} error={formError} onClose={() => { if (!saving) setFormOpen(false); }} onSave={(draft) => void save(draft)} />
    <Toaster toasterId={toasterId} position="top-end" />
    {statusEntry ? <ConfirmDialog open title={statusEntry.status === "active" ? "Inativar item?" : "Reativar item?"} message={statusEntry.status === "active" ? "O item deixará de aparecer em novos cadastros, mas continuará visível no histórico já relacionado." : "O item voltará a ficar disponível para novos cadastros."} confirmLabel={statusEntry.status === "active" ? "Inativar" : "Reativar"} danger={statusEntry.status === "active"} onCancel={() => setStatusEntry(undefined)} onConfirm={() => void toggleStatus()} /> : null}
  </div>;
}
