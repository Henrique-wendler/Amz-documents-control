import { useEffect, useMemo, useState } from "react";
import { Button, Combobox, Dialog, DialogActions, DialogBody, DialogContent, DialogSurface, DialogTitle, Dropdown, Field, Input, Option } from "@fluentui/react-components";
import { Save20Regular } from "@fluentui/react-icons";
import type { OwnershipDraft, RegistrationOwnerOption, RegistrationOwnershipView } from "../../types/matricula";

interface OwnershipFormDialogProps {
  open: boolean; registrationNumber?: string; owners: RegistrationOwnerOption[]; value?: RegistrationOwnershipView; currentPercentage: number; saving: boolean; serviceError?: string;
  onClose: () => void; onSave: (draft: OwnershipDraft) => void;
}
interface OwnershipFormState { ownerId: string; type: OwnershipDraft["type"]; percentage: string; startDate: string; status: OwnershipDraft["status"]; }
const emptyDraft: OwnershipFormState = { ownerId: "", type: "owner", percentage: "", startDate: "", status: "active" };
const typeLabels: Record<OwnershipDraft["type"], string> = { owner: "Proprietário", "co-owner": "Coproprietário", usufructuary: "Usufrutuário", other: "Outro" };
const toNumber = (value: string) => Number(value.replace(/\./g, "").replace(",", "."));
const toIsoDate = (value?: string) => { if (!value) return ""; if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) { const [day, month, year] = value.split("/"); return `${year}-${month}-${day}`; } return value.slice(0, 10); };
const formatPercentage = (value: number) => `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value)}%`;

export function OwnershipFormDialog({ open, registrationNumber, owners, value, currentPercentage, saving, serviceError, onClose, onSave }: OwnershipFormDialogProps) {
  const [draft, setDraft] = useState<OwnershipFormState>(emptyDraft);
  const [ownerQuery, setOwnerQuery] = useState("");
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    if (!open) return;
    setDraft(value ? { ownerId: value.link.ownerId, type: value.link.type, percentage: value.link.percentage === undefined ? "" : String(value.link.percentage).replace(".", ","), startDate: toIsoDate(value.link.startDate), status: value.link.status } : emptyDraft);
    setOwnerQuery(value ? owners.find((owner) => owner.id === value.link.ownerId)?.label ?? "" : "");
    setSubmitted(false);
  }, [open, owners, value]);
  const percentValue = draft.percentage === "" ? undefined : toNumber(draft.percentage);
  const percentServiceError = serviceError === "A soma dos percentuais ativos desta matrícula ultrapassaria 100%." ? serviceError : "";
  const errors = useMemo(() => ({ ownerId: !draft.ownerId ? "Selecione um proprietário." : "", percentage: percentValue !== undefined && (!Number.isFinite(percentValue) || percentValue < 0 || percentValue > 100) ? "Informe um percentual entre 0 e 100." : draft.status === "active" && percentValue !== undefined && currentPercentage + percentValue > 100 ? "A soma dos percentuais ativos desta matrícula ultrapassaria 100%." : percentServiceError }), [currentPercentage, draft.ownerId, draft.status, percentServiceError, percentValue]);
  const submit = (event: React.FormEvent) => { event.preventDefault(); setSubmitted(true); if (Object.values(errors).some(Boolean)) return; onSave({ ownerId: draft.ownerId, type: draft.type, percentage: percentValue, startDate: draft.startDate, status: draft.status }); };
  return <Dialog open={open} modalType="modal" onOpenChange={(_, data) => { if (!data.open) onClose(); }}><DialogSurface className="ownership-dialog"><DialogBody><DialogTitle>{value ? "Editar vínculo" : "Vincular proprietário"}</DialogTitle><DialogContent><form id="ownership-form" className="ownership-form" onSubmit={submit} noValidate><div className="ownership-form__intro"><span>Matrícula {registrationNumber}</span><strong>Percentual atualmente vinculado: {formatPercentage(currentPercentage)}</strong></div>
    <Field label="Proprietário" required validationState={submitted && errors.ownerId ? "error" : "none"} validationMessage={submitted ? errors.ownerId : undefined}><Combobox value={ownerQuery} selectedOptions={draft.ownerId ? [draft.ownerId] : []} placeholder="Buscar por nome ou CPF/CNPJ" onChange={(event) => { setOwnerQuery(event.target.value); setDraft((current) => ({ ...current, ownerId: "" })); }} onOptionSelect={(_, data) => { const ownerId = data.optionValue ?? ""; setDraft((current) => ({ ...current, ownerId })); setOwnerQuery(owners.find((owner) => owner.id === ownerId)?.label ?? ""); }}>{owners.map((owner) => <Option key={owner.id} value={owner.id} text={owner.label}>{owner.label}</Option>)}</Combobox></Field>
    <div className="ownership-form__grid"><Field label="Tipo de vínculo" required><Dropdown value={typeLabels[draft.type]} selectedOptions={[draft.type]} onOptionSelect={(_, data) => setDraft((current) => ({ ...current, type: data.optionValue as OwnershipDraft["type"] }))}><Option value="owner">Proprietário</Option><Option value="co-owner">Coproprietário</Option><Option value="usufructuary">Usufrutuário</Option><Option value="other">Outro</Option></Dropdown></Field><Field label="Percentual" validationState={(submitted || Boolean(percentServiceError)) && errors.percentage ? "error" : "none"} validationMessage={(submitted || percentServiceError) ? errors.percentage : undefined}><Input inputMode="decimal" contentAfter="%" value={draft.percentage} placeholder="Opcional" onChange={(_, data) => setDraft((current) => ({ ...current, percentage: data.value }))} /></Field><Field label="Data de início"><Input type="date" value={draft.startDate} onChange={(_, data) => setDraft((current) => ({ ...current, startDate: data.value }))} /></Field><Field label="Situação"><Dropdown value={draft.status === "active" ? "Ativo" : "Inativo"} selectedOptions={[draft.status]} onOptionSelect={(_, data) => setDraft((current) => ({ ...current, status: data.optionValue as OwnershipDraft["status"] }))}><Option value="active">Ativo</Option><Option value="inactive">Inativo</Option></Dropdown></Field></div>
    {serviceError && !percentServiceError ? <p className="ownership-form__service-error" role="alert">{serviceError}</p> : null}
  </form></DialogContent><DialogActions><Button appearance="secondary" disabled={saving} onClick={onClose}>Cancelar</Button><Button appearance="primary" icon={<Save20Regular />} type="submit" form="ownership-form" disabled={saving}>{saving ? "Salvando..." : "Salvar vínculo"}</Button></DialogActions></DialogBody></DialogSurface></Dialog>;
}
