import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Dropdown, Field, Input, Option, Toast, ToastTitle, Toaster, useToastController } from "@fluentui/react-components";
import { PersonAdd20Regular, Search20Regular } from "@fluentui/react-icons";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Header } from "../components/Header";
import { SectionCard } from "../components/SectionCard";
import { Sidebar } from "../components/Sidebar";
import { UserFormDrawer } from "../components/administracao/UserFormDrawer";
import { UserGrid } from "../components/administracao/UserGrid";
import { DashboardMessageState } from "../components/dashboard/DashboardState";
import { useAuth } from "../contexts/AuthContext";
import { usePermissions } from "../hooks/usePermissions";
import { userAdministrationService } from "../services/userAdministrationService";
import type { ManagedUser, UserAdministrationData, UserInvitationDraft, UserProfileStatus, UserUpdateDraft } from "../types/userAdministration";

interface UsersPageProps { onNavigate: (path: string) => void; }
type DialogState = { kind: "none" } | { kind: "status"; user: ManagedUser } | { kind: "recovery"; user: ManagedUser };

export function UsersPage({ onNavigate }: UsersPageProps) {
  const { profile, refreshProfile } = useAuth();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission("users.manage");
  const [data, setData] = useState<UserAdministrationData>({ users: [], roles: [] });
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState<"all" | UserProfileStatus>("all");
  const [loading, setLoading] = useState(canManage);
  const [error, setError] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedUser>();
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string>();
  const [dialog, setDialog] = useState<DialogState>({ kind: "none" });
  const toasterId = "user-administration-feedback";
  const { dispatchToast } = useToastController(toasterId);

  const notify = useCallback((message: string, intent: "success" | "error" = "success") => {
    dispatchToast(<Toast><ToastTitle>{message}</ToastTitle></Toast>, { intent, timeout: 3600 });
  }, [dispatchToast]);

  const load = useCallback(async (showFeedback = false) => {
    if (!canManage) return;
    setLoading(true);
    setError(false);
    try {
      setData(await userAdministrationService.list());
      if (showFeedback) notify("Usuários atualizados.");
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [canManage, notify]);

  useEffect(() => { void load(); }, [load]);

  const users = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    return data.users.filter((user) => (
      (!normalized || user.fullName.toLocaleLowerCase("pt-BR").includes(normalized) || user.email.toLocaleLowerCase("pt-BR").includes(normalized))
      && (role === "all" || user.roleKey === role)
      && (status === "all" || user.status === status)
    ));
  }, [data.users, query, role, status]);

  const openInvite = () => { setEditing(undefined); setFormError(undefined); setFormOpen(true); };
  const openEdit = (user: ManagedUser) => { setEditing(user); setFormError(undefined); setFormOpen(true); };

  const invite = async (draft: UserInvitationDraft) => {
    setSaving(true);
    setFormError(undefined);
    try {
      await userAdministrationService.invite(draft);
      setFormOpen(false);
      notify("Convite enviado e perfil criado com sucesso.");
      await load();
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : "Não foi possível convidar o usuário.");
    } finally {
      setSaving(false);
    }
  };

  const update = async (draft: UserUpdateDraft) => {
    if (!editing) return;
    setSaving(true);
    setFormError(undefined);
    try {
      await userAdministrationService.update(editing.id, draft);
      setFormOpen(false);
      notify("Usuário atualizado com sucesso.");
      await load();
      if (editing.id === profile?.id) await refreshProfile();
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : "Não foi possível atualizar o usuário.");
    } finally {
      setSaving(false);
    }
  };

  const confirmDialog = async () => {
    if (dialog.kind === "none") return;
    const current = dialog;
    setDialog({ kind: "none" });
    try {
      if (current.kind === "status") {
        await userAdministrationService.update(current.user.id, { fullName: current.user.fullName, roleKey: current.user.roleKey, status: current.user.status === "active" ? "inactive" : "active" });
        notify(current.user.status === "active" ? "Usuário inativado." : "Usuário reativado.");
        await load();
        if (current.user.id === profile?.id) await refreshProfile();
      } else {
        await userAdministrationService.sendRecovery(current.user.id);
        notify("E-mail de recuperação enviado.");
      }
    } catch (reason) {
      notify(reason instanceof Error ? reason.message : "Não foi possível concluir a ação.", "error");
    }
  };

  if (!canManage) return <div className="app-shell"><Sidebar activePath="/administracao/usuarios" onNavigate={onNavigate} /><div className="app-workspace"><Header title="Administração" subtitle="Gerenciamento de usuários" refreshing={false} onRefresh={() => undefined} /><main className="main-content"><DashboardMessageState kind="error" title="Acesso não autorizado" description="Você não possui permissão para gerenciar usuários desta organização." onRetry={() => onNavigate("/dashboard")} /></main></div></div>;

  const activeDialog = dialog.kind === "status" ? {
    title: dialog.user.status === "active" ? "Inativar usuário?" : "Reativar usuário?",
    message: dialog.user.status === "active" ? "O acesso será bloqueado e o histórico permanecerá preservado." : "O usuário poderá voltar a autenticar e acessar o sistema.",
    confirmLabel: dialog.user.status === "active" ? "Inativar" : "Reativar",
  } : dialog.kind === "recovery" ? {
    title: dialog.user.lastSignInAt ? "Enviar recuperação de senha?" : "Reenviar acesso?",
    message: "O usuário receberá um link seguro e definirá a própria senha.",
    confirmLabel: "Enviar e-mail",
  } : undefined;

  return <div className="app-shell">
    <Sidebar activePath="/administracao/usuarios" onNavigate={onNavigate} />
    <div className="app-workspace">
      <Header title="Usuários" subtitle="Administração de acessos, perfis e situação dos usuários" refreshing={loading} onRefresh={() => void load(true)} />
      <main className="main-content user-administration-content">
        <section className="section-card user-administration-toolbar" aria-label="Busca e filtros de usuários">
          <Field className="user-administration-toolbar__search" label="Buscar"><Input contentBefore={<Search20Regular />} placeholder="Nome ou e-mail" value={query} onChange={(_, value) => setQuery(value.value)} /></Field>
          <Field label="Perfil"><Dropdown value={role === "all" ? "Todos" : data.roles.find((item) => item.key === role)?.name ?? "Todos"} selectedOptions={[role]} onOptionSelect={(_, value) => setRole(value.optionValue ?? "all")}><Option value="all">Todos</Option>{data.roles.map((item) => <Option key={item.key} value={item.key}>{item.name}</Option>)}</Dropdown></Field>
          <Field label="Situação"><Dropdown value={status === "all" ? "Todas" : status === "active" ? "Ativo" : "Inativo"} selectedOptions={[status]} onOptionSelect={(_, value) => setStatus(value.optionValue as "all" | UserProfileStatus)}><Option value="all">Todas</Option><Option value="active">Ativo</Option><Option value="inactive">Inativo</Option></Dropdown></Field>
          <Button className="user-administration-toolbar__new" appearance="primary" icon={<PersonAdd20Regular />} onClick={openInvite}>Convidar usuário</Button>
        </section>
        {error ? <DashboardMessageState kind="error" title="Não foi possível carregar os usuários" description="Verifique a conexão e tente novamente." onRetry={() => void load()} /> : <SectionCard className="user-administration-results" title={`${users.length} usuário${users.length === 1 ? "" : "s"}`} subtitle="Somente usuários vinculados à sua organização"><UserGrid users={users} roles={data.roles} loading={loading} onEdit={openEdit} onToggleStatus={(user) => setDialog({ kind: "status", user })} onSendRecovery={(user) => setDialog({ kind: "recovery", user })} /></SectionCard>}
      </main>
    </div>
    <UserFormDrawer open={formOpen} user={editing} roles={data.roles} saving={saving} error={formError} onClose={() => { if (!saving) setFormOpen(false); }} onInvite={(draft) => void invite(draft)} onUpdate={(draft) => void update(draft)} />
    <Toaster toasterId={toasterId} position="top-end" />
    {activeDialog ? <ConfirmDialog open title={activeDialog.title} message={activeDialog.message} confirmLabel={activeDialog.confirmLabel} danger={dialog.kind === "status" && dialog.user.status === "active"} onCancel={() => setDialog({ kind: "none" })} onConfirm={() => void confirmDialog()} /> : null}
  </div>;
}
