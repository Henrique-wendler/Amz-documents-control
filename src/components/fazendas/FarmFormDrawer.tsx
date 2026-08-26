import { useEffect, useMemo, useState } from "react";
import { Button, Drawer, DrawerBody, DrawerFooter, DrawerHeader, DrawerHeaderTitle, Dropdown, Field, Input, Option, Textarea } from "@fluentui/react-components";
import { Dismiss24Regular, Save20Regular } from "@fluentui/react-icons";
import type { FarmDraft, FarmListItem } from "../../types/fazenda";

interface FarmFormDrawerProps {
  open: boolean;
  farm?: FarmListItem;
  saving: boolean;
  serviceError?: string;
  onClose: () => void;
  onSave: (draft: FarmDraft) => void;
}

interface FarmFormState {
  name: string; municipality: string; state: string; location: string; totalArea: string; reserveArea: string; consolidatedArea: string; status: FarmDraft["status"]; notes: string;
}

const emptyDraft: FarmFormState = { name: "", municipality: "", state: "TO", location: "", totalArea: "", reserveArea: "", consolidatedArea: "", status: "active", notes: "" };
const states = ["AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO"];
const toNumber = (value: string) => Number(value.replace(/\./g, "").replace(",", "."));
const areaString = (value?: number) => value === undefined ? "" : String(value).replace(".", ",");

export function FarmFormDrawer({ open, farm, saving, serviceError, onClose, onSave }: FarmFormDrawerProps) {
  const [draft, setDraft] = useState<FarmFormState>(emptyDraft);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDraft(farm ? { name: farm.name, municipality: farm.municipality, state: farm.state, location: farm.location ?? "", totalArea: areaString(farm.totalArea), reserveArea: areaString(farm.reserveArea), consolidatedArea: areaString(farm.consolidatedArea), status: farm.status, notes: farm.notes ?? "" } : emptyDraft);
    setSubmitted(false);
  }, [farm, open]);

  const errors = useMemo(() => {
    const totalArea = toNumber(draft.totalArea);
    const reserveArea = draft.reserveArea ? toNumber(draft.reserveArea) : 0;
    const consolidatedArea = draft.consolidatedArea ? toNumber(draft.consolidatedArea) : 0;
    return {
      name: draft.name.trim().length < 3 ? "Informe o nome da fazenda." : "",
      municipality: draft.municipality.trim().length < 2 ? "Informe o município." : "",
      state: !states.includes(draft.state) ? "Selecione uma UF válida." : "",
      totalArea: !Number.isFinite(totalArea) || totalArea <= 0 ? "Informe uma área total maior que zero." : "",
      reserveArea: !Number.isFinite(reserveArea) || reserveArea < 0 ? "A área de reserva não pode ser negativa." : reserveArea > totalArea ? "A reserva não pode superar a área total." : "",
      consolidatedArea: !Number.isFinite(consolidatedArea) || consolidatedArea < 0 ? "A área consolidada não pode ser negativa." : consolidatedArea > totalArea ? "A área consolidada não pode superar a área total." : reserveArea + consolidatedArea > totalArea ? "Reserva e área consolidada não podem superar a área total." : "",
    };
  }, [draft]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (Object.values(errors).some(Boolean)) return;
    onSave({ name: draft.name.trim(), municipality: draft.municipality.trim(), state: draft.state, location: draft.location.trim(), totalArea: toNumber(draft.totalArea), reserveArea: draft.reserveArea ? toNumber(draft.reserveArea) : 0, consolidatedArea: draft.consolidatedArea ? toNumber(draft.consolidatedArea) : 0, status: draft.status, notes: draft.notes.trim() });
  };

  return <Drawer className="search-result-drawer farm-form-drawer" type="overlay" position="end" size="medium" open={open} onOpenChange={(_, data) => { if (!data.open) onClose(); }}>
    <DrawerHeader><DrawerHeaderTitle action={<Button appearance="subtle" aria-label="Fechar formulário" icon={<Dismiss24Regular />} onClick={onClose} />}>{farm ? "Editar fazenda" : "Nova fazenda"}</DrawerHeaderTitle></DrawerHeader>
    <DrawerBody><form id="farm-form" className="farm-form" onSubmit={submit} noValidate>
      <div className="farm-form__intro"><strong>Dados do imóvel rural</strong><span>Preencha as informações territoriais e cadastrais da fazenda.</span></div>
      <div className="farm-form__grid">
        <Field className="farm-form__wide" label="Nome da fazenda" required validationState={submitted && errors.name ? "error" : "none"} validationMessage={submitted ? errors.name : undefined}><Input autoFocus value={draft.name} placeholder="Ex.: Fazenda Santa Clara" onChange={(_, data) => setDraft((current) => ({ ...current, name: data.value }))} /></Field>
        <Field label="Município" required validationState={submitted && errors.municipality ? "error" : "none"} validationMessage={submitted ? errors.municipality : undefined}><Input value={draft.municipality} placeholder="Ex.: Palmas" onChange={(_, data) => setDraft((current) => ({ ...current, municipality: data.value }))} /></Field>
        <Field label="UF" required validationState={submitted && errors.state ? "error" : "none"} validationMessage={submitted ? errors.state : undefined}><Dropdown value={draft.state} selectedOptions={[draft.state]} onOptionSelect={(_, data) => setDraft((current) => ({ ...current, state: data.optionValue ?? "TO" }))}>{states.map((state) => <Option key={state} value={state}>{state}</Option>)}</Dropdown></Field>
        <Field className="farm-form__wide" label="Localização"><Input value={draft.location} placeholder="Ex.: Zona Rural — Região Norte" onChange={(_, data) => setDraft((current) => ({ ...current, location: data.value }))} /></Field>
        <Field label="Área total" required validationState={submitted && errors.totalArea ? "error" : "none"} validationMessage={submitted ? errors.totalArea : undefined}><Input inputMode="decimal" contentAfter="ha" value={draft.totalArea} placeholder="0,00" onChange={(_, data) => setDraft((current) => ({ ...current, totalArea: data.value }))} /></Field>
        <Field label="Área de reserva" validationState={submitted && errors.reserveArea ? "error" : "none"} validationMessage={submitted ? errors.reserveArea : undefined}><Input inputMode="decimal" contentAfter="ha" value={draft.reserveArea} placeholder="0,00" onChange={(_, data) => setDraft((current) => ({ ...current, reserveArea: data.value }))} /></Field>
        <Field label="Área consolidada" validationState={submitted && errors.consolidatedArea ? "error" : "none"} validationMessage={submitted ? errors.consolidatedArea : undefined}><Input inputMode="decimal" contentAfter="ha" value={draft.consolidatedArea} placeholder="0,00" onChange={(_, data) => setDraft((current) => ({ ...current, consolidatedArea: data.value }))} /></Field>
        <Field label="Situação" required><Dropdown value={draft.status === "active" ? "Ativa" : "Inativa"} selectedOptions={[draft.status]} onOptionSelect={(_, data) => setDraft((current) => ({ ...current, status: data.optionValue as FarmDraft["status"] }))}><Option value="active">Ativa</Option><Option value="inactive">Inativa</Option></Dropdown></Field>
        <Field className="farm-form__wide" label="Observações"><Textarea resize="vertical" value={draft.notes} placeholder="Informações adicionais relevantes ao imóvel" onChange={(_, data) => setDraft((current) => ({ ...current, notes: data.value }))} /></Field>
      </div>
      {serviceError ? <p className="farm-form__service-error" role="alert">{serviceError}</p> : null}
    </form></DrawerBody>
    <DrawerFooter><Button appearance="primary" icon={<Save20Regular />} type="submit" form="farm-form" disabled={saving}>{saving ? "Salvando..." : farm ? "Salvar alterações" : "Salvar"}</Button><Button appearance="secondary" disabled={saving} onClick={onClose}>Cancelar</Button></DrawerFooter>
  </Drawer>;
}
