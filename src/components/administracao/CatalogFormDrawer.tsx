import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Drawer,
  DrawerBody,
  DrawerFooter,
  DrawerHeader,
  DrawerHeaderTitle,
  Dropdown,
  Field,
  Input,
  Option,
  Switch,
} from "@fluentui/react-components";
import { Dismiss24Regular, Save20Regular } from "@fluentui/react-icons";
import type { CatalogDraft, CatalogEntry, CatalogKind } from "../../types/catalogAdministration";

interface CatalogFormDrawerProps {
  open: boolean;
  kind: CatalogKind;
  entry?: CatalogEntry;
  saving: boolean;
  error?: string;
  onClose: () => void;
  onSave: (draft: CatalogDraft) => void;
}

const titles: Record<CatalogKind, { singular: string; intro: string }> = {
  financialInstitutions: { singular: "instituição financeira", intro: "Nome e sigla usados nas operações financeiras." },
  guaranteeTypes: { singular: "tipo de garantia", intro: "Classificação disponível para as garantias das operações." },
  documentTypes: { singular: "tipo de documento", intro: "Classificação e regra de validade dos documentos rurais." },
};

const emptyDraft: CatalogDraft = { name: "", status: "active", shortName: "", code: "", requiresExpiration: false };

export function CatalogFormDrawer({ open, kind, entry, saving, error, onClose, onSave }: CatalogFormDrawerProps) {
  const [draft, setDraft] = useState<CatalogDraft>(emptyDraft);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(entry ? {
      name: entry.name,
      shortName: entry.shortName ?? "",
      code: entry.code ?? "",
      requiresExpiration: entry.requiresExpiration ?? false,
      status: entry.status,
    } : { ...emptyDraft });
    setSubmitted(false);
  }, [entry, kind, open]);

  const validation = useMemo(() => ({
    name: !draft.name.trim() || draft.name.trim().length > 160 ? "Informe um nome válido com até 160 caracteres." : "",
    shortName: (draft.shortName?.trim().length ?? 0) > 80 ? "A sigla deve ter até 80 caracteres." : "",
    code: (draft.code?.trim().length ?? 0) > 80 ? "O código deve ter até 80 caracteres." : "",
  }), [draft]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (validation.name || (kind === "financialInstitutions" && validation.shortName) || (kind === "documentTypes" && validation.code)) return;
    onSave(draft);
  };

  const title = titles[kind];

  return (
    <Drawer className="search-result-drawer catalog-form-drawer" type="overlay" position="end" size="medium" open={open} onOpenChange={(_, data) => { if (!data.open && !saving) onClose(); }}>
      <DrawerHeader>
        <DrawerHeaderTitle action={<Button appearance="subtle" aria-label="Fechar formulário" icon={<Dismiss24Regular />} onClick={onClose} />}>
          {entry ? `Editar ${title.singular}` : `Nova ${title.singular}`}
        </DrawerHeaderTitle>
      </DrawerHeader>
      <DrawerBody>
        <form id="catalog-administration-form" className="catalog-administration-form" onSubmit={submit} noValidate>
          <div className="catalog-administration-form__intro">
            <strong>Dados do catálogo</strong>
            <span>{title.intro}</span>
          </div>
          <div className="catalog-administration-form__grid">
            <Field label="Nome" required validationState={submitted && validation.name ? "error" : "none"} validationMessage={submitted ? validation.name : undefined}>
              <Input autoFocus value={draft.name} onChange={(_, data) => setDraft((current) => ({ ...current, name: data.value }))} />
            </Field>
            {kind === "financialInstitutions" ? (
              <Field label="Sigla / nome curto" validationState={submitted && validation.shortName ? "error" : "none"} validationMessage={submitted ? validation.shortName : undefined}>
                <Input value={draft.shortName ?? ""} onChange={(_, data) => setDraft((current) => ({ ...current, shortName: data.value }))} />
              </Field>
            ) : null}
            {kind === "documentTypes" ? <>
              <Field label="Código" validationState={submitted && validation.code ? "error" : "none"} validationMessage={submitted ? validation.code : undefined}>
                <Input value={draft.code ?? ""} onChange={(_, data) => setDraft((current) => ({ ...current, code: data.value }))} />
              </Field>
              <Switch checked={Boolean(draft.requiresExpiration)} label="Exige data de validade" onChange={(_, data) => setDraft((current) => ({ ...current, requiresExpiration: data.checked }))} />
            </> : null}
            <Field label="Situação" required>
              <Dropdown value={draft.status === "active" ? "Ativo" : "Inativo"} selectedOptions={[draft.status]} onOptionSelect={(_, data) => setDraft((current) => ({ ...current, status: data.optionValue === "inactive" ? "inactive" : "active" }))}>
                <Option value="active">Ativo</Option>
                <Option value="inactive">Inativo</Option>
              </Dropdown>
            </Field>
          </div>
          {error ? <p className="catalog-administration-form__error" role="alert">{error}</p> : null}
        </form>
      </DrawerBody>
      <DrawerFooter>
        <Button appearance="primary" icon={<Save20Regular />} type="submit" form="catalog-administration-form" disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
        <Button appearance="secondary" disabled={saving} onClick={onClose}>Cancelar</Button>
      </DrawerFooter>
    </Drawer>
  );
}
