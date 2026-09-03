import { useEffect, useMemo, useState } from "react";
import { Button, Drawer, DrawerBody, DrawerFooter, DrawerHeader, DrawerHeaderTitle, Dropdown, Field, Input, Option } from "@fluentui/react-components";
import { Dismiss24Regular, Save20Regular } from "@fluentui/react-icons";
import type { ManagedUser, UserInvitationDraft, UserProfileStatus, UserRoleOption, UserUpdateDraft } from "../../types/userAdministration";

interface UserFormDrawerProps {
  open: boolean;
  user?: ManagedUser;
  roles: UserRoleOption[];
  saving: boolean;
  error?: string;
  onClose: () => void;
  onInvite: (draft: UserInvitationDraft) => void;
  onUpdate: (draft: UserUpdateDraft) => void;
}

const emptyDraft: UserInvitationDraft = { fullName: "", email: "", roleKey: "", status: "active" };

export function UserFormDrawer({ open, user, roles, saving, error, onClose, onInvite, onUpdate }: UserFormDrawerProps) {
  const [draft, setDraft] = useState(emptyDraft);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(user
      ? { fullName: user.fullName, email: user.email, roleKey: user.roleKey, status: user.status }
      : { ...emptyDraft, roleKey: roles[0]?.key ?? "" });
    setSubmitted(false);
  }, [open, roles, user]);

  const validation = useMemo(() => ({
    fullName: draft.fullName.trim().length < 3 ? "Informe o nome completo." : "",
    email: !user && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email.trim()) ? "Informe um e-mail válido." : "",
    roleKey: !draft.roleKey ? "Selecione um perfil." : "",
  }), [draft, user]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (Object.values(validation).some(Boolean)) return;
    if (user) onUpdate({ fullName: draft.fullName, roleKey: draft.roleKey, status: draft.status });
    else onInvite(draft);
  };

  const selectedRoleName = roles.find((role) => role.key === draft.roleKey)?.name ?? "Selecione";

  return (
    <Drawer className="search-result-drawer user-form-drawer" type="overlay" position="end" size="medium" open={open} onOpenChange={(_, data) => { if (!data.open && !saving) onClose(); }}>
      <DrawerHeader>
        <DrawerHeaderTitle action={<Button appearance="subtle" aria-label="Fechar formulário" icon={<Dismiss24Regular />} onClick={onClose} />}>
          {user ? "Editar usuário" : "Convidar usuário"}
        </DrawerHeaderTitle>
      </DrawerHeader>
      <DrawerBody>
        <form id="user-administration-form" className="user-administration-form" onSubmit={submit} noValidate>
          <div className="user-administration-form__intro">
            <strong>{user ? "Dados de acesso" : "Novo acesso à organização"}</strong>
            <span>{user ? "Atualize o nome, o perfil ou a situação do usuário." : "O usuário receberá um link seguro para definir a própria senha."}</span>
          </div>
          <div className="user-administration-form__grid">
            <Field label="Nome completo" required validationState={submitted && validation.fullName ? "error" : "none"} validationMessage={submitted ? validation.fullName : undefined}>
              <Input autoFocus value={draft.fullName} onChange={(_, data) => setDraft((current) => ({ ...current, fullName: data.value }))} />
            </Field>
            <Field label="E-mail" required validationState={submitted && validation.email ? "error" : "none"} validationMessage={submitted ? validation.email : undefined}>
              <Input type="email" autoComplete="email" disabled={Boolean(user)} value={draft.email} onChange={(_, data) => setDraft((current) => ({ ...current, email: data.value }))} />
            </Field>
            <Field label="Perfil" required validationState={submitted && validation.roleKey ? "error" : "none"} validationMessage={submitted ? validation.roleKey : undefined}>
              <Dropdown value={selectedRoleName} selectedOptions={draft.roleKey ? [draft.roleKey] : []} onOptionSelect={(_, data) => setDraft((current) => ({ ...current, roleKey: data.optionValue ?? "" }))}>
                {roles.map((role) => <Option key={role.key} value={role.key}>{role.name}</Option>)}
              </Dropdown>
            </Field>
            <Field label="Situação inicial" required>
              <Dropdown value={draft.status === "active" ? "Ativo" : "Inativo"} selectedOptions={[draft.status]} onOptionSelect={(_, data) => setDraft((current) => ({ ...current, status: data.optionValue as UserProfileStatus }))}>
                <Option value="active">Ativo</Option>
                <Option value="inactive">Inativo</Option>
              </Dropdown>
            </Field>
          </div>
          {error ? <p className="user-administration-form__error" role="alert">{error}</p> : null}
        </form>
      </DrawerBody>
      <DrawerFooter>
        <Button appearance="primary" icon={<Save20Regular />} type="submit" form="user-administration-form" disabled={saving}>{saving ? "Salvando..." : user ? "Salvar alterações" : "Enviar convite"}</Button>
        <Button appearance="secondary" disabled={saving} onClick={onClose}>Cancelar</Button>
      </DrawerFooter>
    </Drawer>
  );
}

