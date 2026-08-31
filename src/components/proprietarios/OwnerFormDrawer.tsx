import { useEffect, useMemo, useState } from "react";
import { Button, Drawer, DrawerBody, DrawerFooter, DrawerHeader, DrawerHeaderTitle, Dropdown, Field, Input, Option, Textarea } from "@fluentui/react-components";
import { Dismiss24Regular, Save20Regular } from "@fluentui/react-icons";
import type { OwnerDraft, OwnerListItem, OwnerType } from "../../types/proprietario";

interface OwnerFormDrawerProps {
  open: boolean;
  owner?: OwnerListItem;
  saving: boolean;
  canInactivate: boolean;
  serviceError?: string;
  onClose: () => void;
  onSave: (draft: OwnerDraft) => void;
}

const emptyDraft: OwnerDraft = { type: "individual", name: "", document: "", phone: "", email: "", status: "active", notes: "" };

const digits = (value: string) => value.replace(/\D/g, "");

const formatDocument = (value: string, type: OwnerType) => {
  const raw = digits(value).slice(0, type === "individual" ? 11 : 14);
  if (type === "individual") return raw.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  return raw.replace(/(\d{2})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1/$2").replace(/(\d{4})(\d{1,2})$/, "$1-$2");
};

const formatPhone = (value: string) => {
  const raw = digits(value).slice(0, 11);
  return raw.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{5})(\d{4})$/, "$1-$2");
};

export function OwnerFormDrawer({ open, owner, saving, canInactivate, serviceError, onClose, onSave }: OwnerFormDrawerProps) {
  const [draft, setDraft] = useState<OwnerDraft>(emptyDraft);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(owner ? { type: owner.type, name: owner.name, document: owner.document, phone: owner.phone ?? "", email: owner.email ?? "", status: owner.status, notes: owner.notes ?? "" } : emptyDraft);
    setSubmitted(false);
  }, [open, owner]);

  const errors = useMemo(() => {
    const documentLength = draft.type === "individual" ? 11 : 14;
    return {
      name: draft.name.trim().length < 3 ? "Informe o nome ou a razão social." : "",
      document: digits(draft.document).length !== documentLength ? `Informe um ${draft.type === "individual" ? "CPF" : "CNPJ"} válido.` : "",
      phone: draft.phone && digits(draft.phone).length < 10 ? "Informe um telefone válido." : "",
      email: draft.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.email) ? "Informe um e-mail válido." : "",
    };
  }, [draft]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (Object.values(errors).some(Boolean)) return;
    onSave({ ...draft, name: draft.name.trim(), email: draft.email.trim(), notes: draft.notes.trim() });
  };

  return (
    <Drawer className="search-result-drawer owner-form-drawer" type="overlay" position="end" size="medium" open={open} onOpenChange={(_, data) => { if (!data.open) onClose(); }}>
      <DrawerHeader><DrawerHeaderTitle action={<Button appearance="subtle" aria-label="Fechar formulário" icon={<Dismiss24Regular />} onClick={onClose} />}>{owner ? "Editar proprietário" : "Novo proprietário"}</DrawerHeaderTitle></DrawerHeader>
      <DrawerBody>
        <form id="owner-form" className="owner-form" onSubmit={submit} noValidate>
          <div className="owner-form__intro"><strong>Dados cadastrais</strong><span>Preencha as informações principais do proprietário rural.</span></div>
          <div className="owner-form__grid">
            <Field label="Tipo de pessoa" required>
              <Dropdown value={draft.type === "individual" ? "Pessoa Física" : "Pessoa Jurídica"} selectedOptions={[draft.type]} onOptionSelect={(_, data) => { const type = data.optionValue as OwnerType; setDraft((current) => ({ ...current, type, document: formatDocument(current.document, type) })); }}>
                <Option value="individual">Pessoa Física</Option><Option value="company">Pessoa Jurídica</Option>
              </Dropdown>
            </Field>
            <Field label="Situação" required>
              <Dropdown disabled={!canInactivate} value={draft.status === "active" ? "Ativo" : "Inativo"} selectedOptions={[draft.status]} onOptionSelect={(_, data) => setDraft((current) => ({ ...current, status: data.optionValue as OwnerDraft["status"] }))}>
                <Option value="active">Ativo</Option><Option value="inactive">Inativo</Option>
              </Dropdown>
            </Field>
            <Field className="owner-form__wide" label={draft.type === "individual" ? "Nome completo" : "Razão social"} required validationState={submitted && errors.name ? "error" : "none"} validationMessage={submitted ? errors.name : undefined}>
              <Input autoFocus value={draft.name} placeholder={draft.type === "individual" ? "Ex.: João da Silva" : "Ex.: Agrícola Horizonte Ltda."} onChange={(_, data) => setDraft((current) => ({ ...current, name: data.value }))} />
            </Field>
            <Field label={draft.type === "individual" ? "CPF" : "CNPJ"} required validationState={submitted && errors.document ? "error" : "none"} validationMessage={submitted ? errors.document : undefined}>
              <Input value={draft.document} placeholder={draft.type === "individual" ? "000.000.000-00" : "00.000.000/0000-00"} onChange={(_, data) => setDraft((current) => ({ ...current, document: formatDocument(data.value, current.type) }))} />
            </Field>
            <Field label="Telefone" validationState={submitted && errors.phone ? "error" : "none"} validationMessage={submitted ? errors.phone : undefined}>
              <Input value={draft.phone} placeholder="(63) 99999-9999" onChange={(_, data) => setDraft((current) => ({ ...current, phone: formatPhone(data.value) }))} />
            </Field>
            <Field className="owner-form__wide" label="E-mail" validationState={submitted && errors.email ? "error" : "none"} validationMessage={submitted ? errors.email : undefined}>
              <Input type="email" value={draft.email} placeholder="nome@empresa.com.br" onChange={(_, data) => setDraft((current) => ({ ...current, email: data.value }))} />
            </Field>
            <Field className="owner-form__wide" label="Observações">
              <Textarea resize="vertical" value={draft.notes} placeholder="Informações adicionais relevantes ao cadastro" onChange={(_, data) => setDraft((current) => ({ ...current, notes: data.value }))} />
            </Field>
          </div>
          {serviceError ? <p className="owner-form__service-error" role="alert">{serviceError}</p> : null}
        </form>
      </DrawerBody>
      <DrawerFooter><Button appearance="primary" icon={<Save20Regular />} type="submit" form="owner-form" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button><Button appearance="secondary" disabled={saving} onClick={onClose}>Cancelar</Button></DrawerFooter>
    </Drawer>
  );
}
