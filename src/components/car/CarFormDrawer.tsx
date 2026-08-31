import { useEffect, useMemo, useState } from "react";
import { Button, Combobox, Drawer, DrawerBody, DrawerFooter, DrawerHeader, DrawerHeaderTitle, Dropdown, Field, Input, Option, Textarea } from "@fluentui/react-components";
import { Dismiss24Regular, Save20Regular } from "@fluentui/react-icons";
import type { CarDraft, CarListItem, CarOption } from "../../types/car";
import { carStatusLabels } from "../../services/statusLabels";

interface Props { open: boolean; car?: CarListItem; farms: CarOption[]; registrations: CarOption[]; saving: boolean; canInactivate: boolean; serviceError?: string; onClose: () => void; onSave: (draft: CarDraft) => void; }
type State = { farmId: string; registrationId: string; declaredOwnerName: string; number: string; receiptNumber: string; status: CarDraft["status"]; notes: string; };
const empty: State = { farmId: "", registrationId: "", declaredOwnerName: "", number: "", receiptNumber: "", status: "active", notes: "" };

export function CarFormDrawer({ open, car, farms, registrations, saving, canInactivate, serviceError, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<State>(empty);
  const [submitted, setSubmitted] = useState(false);
  const [farmQuery, setFarmQuery] = useState("");
  useEffect(() => {
    if (!open) return;
    const next = car ? { farmId: car.farmId, registrationId: car.registrationId ?? "", declaredOwnerName: car.declaredOwnerName ?? "", number: car.number, receiptNumber: car.receiptNumber ?? "", status: car.status, notes: car.notes ?? "" } : empty;
    setDraft(next);
    setFarmQuery(farms.find((farm) => farm.id === next.farmId)?.label ?? "");
    setSubmitted(false);
  }, [car, farms, open]);
  const availableRegistrations = registrations.filter((item) => item.farmId === draft.farmId);
  const filteredFarms = farms.filter((farm) => !farmQuery || farm.label.toLocaleLowerCase("pt-BR").includes(farmQuery.toLocaleLowerCase("pt-BR")) || farm.id === draft.farmId);
  const errors = useMemo(() => ({ farmId: draft.farmId ? "" : "Selecione a fazenda vinculada.", number: draft.number.trim() ? "" : "Informe o número do CAR." }), [draft.farmId, draft.number]);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (Object.values(errors).some(Boolean)) return;
    onSave({ farmId: draft.farmId, registrationId: draft.registrationId || undefined, declaredOwnerName: draft.declaredOwnerName.trim() || undefined, number: draft.number.trim(), receiptNumber: draft.receiptNumber.trim() || undefined, status: draft.status, notes: draft.notes.trim() || undefined });
  };
  return <Drawer className="search-result-drawer document-form-drawer" type="overlay" position="end" size="medium" open={open} onOpenChange={(_, data) => { if (!data.open && !saving) onClose(); }}>
    <DrawerHeader><DrawerHeaderTitle action={<Button appearance="subtle" aria-label="Fechar formulário" icon={<Dismiss24Regular />} onClick={onClose} />}>{car ? "Editar CAR" : "Novo CAR"}</DrawerHeaderTitle></DrawerHeader>
    <DrawerBody><form id="car-form" className="document-form" onSubmit={submit} noValidate><div className="document-form__intro"><strong>Cadastro Ambiental Rural</strong><span>Informe a identificação e os vínculos do cadastro</span></div><div className="document-form__grid">
      <Field className="document-form__wide" label="Fazenda" required validationState={submitted && errors.farmId ? "error" : "none"} validationMessage={submitted ? errors.farmId : undefined}><Combobox value={farmQuery} placeholder="Busque uma fazenda" onChange={(event) => { setFarmQuery(event.target.value); if (draft.farmId) setDraft((current) => ({ ...current, farmId: "", registrationId: "" })); }} onOptionSelect={(_, data) => { const farmId = data.optionValue ?? ""; setDraft((current) => ({ ...current, farmId, registrationId: "" })); setFarmQuery(farms.find((farm) => farm.id === farmId)?.label ?? ""); }}>{filteredFarms.map((farm) => <Option key={farm.id} value={farm.id}>{farm.label}</Option>)}</Combobox></Field>
      <Field label="Matrícula"><Dropdown disabled={!draft.farmId} value={availableRegistrations.find((item) => item.id === draft.registrationId)?.label ?? "Sem matrícula vinculada"} selectedOptions={[draft.registrationId]} onOptionSelect={(_, data) => setDraft((current) => ({ ...current, registrationId: data.optionValue ?? "" }))}><Option value="">Sem matrícula vinculada</Option>{availableRegistrations.map((item) => <Option key={item.id} value={item.id}>{item.label}</Option>)}</Dropdown></Field>
      <Field label="Proprietário declarado"><Input value={draft.declaredOwnerName} placeholder="Nome informado no CAR" onChange={(_, data) => setDraft((current) => ({ ...current, declaredOwnerName: data.value }))} /></Field>
      <Field className="document-form__wide" label="Número CAR" required validationState={submitted && errors.number ? "error" : "none"} validationMessage={submitted ? errors.number : undefined}><Input value={draft.number} placeholder="Informe o número do cadastro" onChange={(_, data) => setDraft((current) => ({ ...current, number: data.value }))} /></Field>
      <Field label="Número do recibo"><Input value={draft.receiptNumber} placeholder="Opcional" onChange={(_, data) => setDraft((current) => ({ ...current, receiptNumber: data.value }))} /></Field>
      <Field label="Situação"><Dropdown disabled={!canInactivate} value={carStatusLabels[draft.status]} selectedOptions={[draft.status]} onOptionSelect={(_, data) => setDraft((current) => ({ ...current, status: (data.optionValue ?? "active") as State["status"] }))}>{(["active", "pending", "inactive"] as const).map((status) => <Option key={status} value={status}>{carStatusLabels[status]}</Option>)}</Dropdown></Field>
      <Field className="document-form__wide" label="Observações"><Textarea value={draft.notes} placeholder="Informações complementares" onChange={(_, data) => setDraft((current) => ({ ...current, notes: data.value }))} /></Field>
    </div>{serviceError ? <p className="registration-form__service-error" role="alert">{serviceError}</p> : null}</form></DrawerBody>
    <DrawerFooter><Button appearance="primary" icon={<Save20Regular />} type="submit" form="car-form" disabled={saving}>{saving ? "Salvando..." : car ? "Salvar alterações" : "Salvar CAR"}</Button><Button appearance="secondary" disabled={saving} onClick={onClose}>Cancelar</Button></DrawerFooter>
  </Drawer>;
}
