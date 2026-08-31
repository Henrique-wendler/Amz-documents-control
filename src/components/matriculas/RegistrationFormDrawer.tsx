import { useEffect, useMemo, useState } from "react";
import { Button, Drawer, DrawerBody, DrawerFooter, DrawerHeader, DrawerHeaderTitle, Dropdown, Field, Input, Option } from "@fluentui/react-components";
import { Dismiss24Regular, Save20Regular } from "@fluentui/react-icons";
import type { RegistrationDraft, RegistrationFarmOption, RegistrationListItem } from "../../types/matricula";

interface RegistrationFormDrawerProps {
  open: boolean; registration?: RegistrationListItem; farms: RegistrationFarmOption[]; saving: boolean; canInactivate: boolean; serviceError?: string;
  onClose: () => void; onSave: (draft: RegistrationDraft) => void;
}

interface RegistrationFormState { farmId: string; number: string; previousNumber: string; legalArea: string; hp: string; certificateDate: string; status: RegistrationDraft["status"]; }
const emptyDraft: RegistrationFormState = { farmId: "", number: "", previousNumber: "", legalArea: "", hp: "Não", certificateDate: "", status: "active" };
const toNumber = (value: string) => Number(value.replace(/\./g, "").replace(",", "."));
const toIsoDate = (value?: string) => { if (!value) return ""; if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) { const [day, month, year] = value.split("/"); return `${year}-${month}-${day}`; } return value.slice(0, 10); };
const toPtBrDate = (value: string) => { if (!value) return ""; const [year, month, day] = value.split("-"); return `${day}/${month}/${year}`; };

export function RegistrationFormDrawer({ open, registration, farms, saving, canInactivate, serviceError, onClose, onSave }: RegistrationFormDrawerProps) {
  const [draft, setDraft] = useState<RegistrationFormState>(emptyDraft);
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => { if (!open) return; setDraft(registration ? { farmId: registration.farmId, number: registration.number, previousNumber: registration.previousNumber ?? "", legalArea: registration.legalArea === undefined ? "" : String(registration.legalArea).replace(".", ","), hp: registration.hp || "Não", certificateDate: toIsoDate(registration.certificateDate), status: registration.status } : emptyDraft); setSubmitted(false); }, [open, registration]);
  const duplicateError = serviceError?.startsWith("Já existe uma matrícula") ? serviceError : "";
  const errors = useMemo(() => ({ farmId: !draft.farmId ? "Selecione a fazenda vinculada." : "", number: !draft.number.trim() ? "Informe o número da matrícula." : duplicateError, legalArea: draft.legalArea && (!Number.isFinite(toNumber(draft.legalArea)) || toNumber(draft.legalArea) < 0) ? "A área legal não pode ser negativa." : "" }), [draft, duplicateError]);
  const submit = (event: React.FormEvent) => { event.preventDefault(); setSubmitted(true); if (Object.values(errors).some(Boolean)) return; onSave({ farmId: draft.farmId, number: draft.number.trim(), previousNumber: draft.previousNumber.trim(), legalArea: draft.legalArea ? toNumber(draft.legalArea) : undefined, hp: draft.hp, certificateDate: toPtBrDate(draft.certificateDate), status: draft.status }); };
  const selectedFarm = farms.find((farm) => farm.id === draft.farmId)?.label ?? "Selecione uma fazenda";
  return <Drawer className="search-result-drawer registration-form-drawer" type="overlay" position="end" size="medium" open={open} onOpenChange={(_, data) => { if (!data.open) onClose(); }}><DrawerHeader><DrawerHeaderTitle action={<Button appearance="subtle" aria-label="Fechar formulário" icon={<Dismiss24Regular />} onClick={onClose} />}>{registration ? "Editar matrícula" : "Nova matrícula"}</DrawerHeaderTitle></DrawerHeader><DrawerBody><form id="registration-form" className="registration-form" onSubmit={submit} noValidate><div className="registration-form__intro"><strong>Dados registrais</strong><span>Cadastre os dados registrais do imóvel</span></div><div className="registration-form__grid">
    <Field className="registration-form__wide" label="Fazenda" required validationState={submitted && errors.farmId ? "error" : "none"} validationMessage={submitted ? errors.farmId : undefined}><Dropdown value={selectedFarm} selectedOptions={[draft.farmId]} onOptionSelect={(_, data) => setDraft((current) => ({ ...current, farmId: data.optionValue ?? "" }))}><Option value="">Selecione uma fazenda</Option>{farms.map((farm) => <Option key={farm.id} value={farm.id}>{farm.label}</Option>)}</Dropdown></Field>
    <Field label="Número da matrícula" required validationState={(submitted || Boolean(duplicateError)) && errors.number ? "error" : "none"} validationMessage={(submitted || duplicateError) ? errors.number : undefined}><Input autoFocus value={draft.number} placeholder="Ex.: 1111" onChange={(_, data) => setDraft((current) => ({ ...current, number: data.value }))} /></Field>
    <Field label="Matrícula anterior"><Input value={draft.previousNumber} placeholder="Opcional" onChange={(_, data) => setDraft((current) => ({ ...current, previousNumber: data.value }))} /></Field>
    <Field label="Área legal" validationState={submitted && errors.legalArea ? "error" : "none"} validationMessage={submitted ? errors.legalArea : undefined}><Input inputMode="decimal" contentAfter="ha" value={draft.legalArea} placeholder="0,00" onChange={(_, data) => setDraft((current) => ({ ...current, legalArea: data.value }))} /></Field>
    <Field label="HP" hint="Pendente de definição"><Dropdown disabled value="Pendente" selectedOptions={[]}><Option value="">Pendente</Option></Dropdown></Field>
    <Field label="Data da certidão"><Input type="date" value={draft.certificateDate} onChange={(_, data) => setDraft((current) => ({ ...current, certificateDate: data.value }))} /></Field>
    <Field label="Situação"><Dropdown disabled={!canInactivate} value={draft.status === "active" ? "Ativa" : "Inativa"} selectedOptions={[draft.status]} onOptionSelect={(_, data) => setDraft((current) => ({ ...current, status: data.optionValue as RegistrationDraft["status"] }))}><Option value="active">Ativa</Option><Option value="inactive">Inativa</Option></Dropdown></Field>
  </div>{serviceError && !duplicateError ? <p className="registration-form__service-error" role="alert">{serviceError}</p> : null}</form></DrawerBody><DrawerFooter><Button appearance="primary" icon={<Save20Regular />} type="submit" form="registration-form" disabled={saving}>{saving ? "Salvando..." : registration ? "Salvar alterações" : "Salvar"}</Button><Button appearance="secondary" disabled={saving} onClick={onClose}>Cancelar</Button></DrawerFooter></Drawer>;
}
