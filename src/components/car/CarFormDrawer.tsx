import { useEffect, useMemo, useState } from "react";
import { Button, Combobox, Drawer, DrawerBody, DrawerFooter, DrawerHeader, DrawerHeaderTitle, Dropdown, Field, Input, Option } from "@fluentui/react-components";
import { Dismiss24Regular, Save20Regular } from "@fluentui/react-icons";
import type { CarDraft, CarListItem, CarOption, CarOwnerOption } from "../../types/car";
import { carStatusLabels } from "../../services/statusLabels";

interface Props { open: boolean; car?: CarListItem; farms: CarOption[]; registrations: CarOption[]; owners: CarOwnerOption[]; saving: boolean; serviceError?: string; onClose: () => void; onSave: (draft: CarDraft) => void; }
type State = { farmId: string; registrationId: string; ownerId: string; number: string; receiptNumber: string; status: CarDraft["status"]; };
const empty: State = { farmId: "", registrationId: "", ownerId: "", number: "", receiptNumber: "", status: "active" };

export function CarFormDrawer({ open, car, farms, registrations, owners, saving, serviceError, onClose, onSave }: Props) {
  const [draft, setDraft] = useState<State>(empty);
  const [submitted, setSubmitted] = useState(false);
  const [farmQuery, setFarmQuery] = useState("");
  useEffect(() => {
    if (!open) return;
    const next = car ? { farmId: car.farmId, registrationId: car.registrationId ?? "", ownerId: car.ownerId ?? "", number: car.number, receiptNumber: car.receiptNumber ?? "", status: car.status } : empty;
    setDraft(next);
    setFarmQuery(farms.find((farm) => farm.id === next.farmId)?.label ?? "");
    setSubmitted(false);
  }, [car, farms, open]);
  const availableRegistrations = registrations.filter((item) => item.farmId === draft.farmId);
  const availableOwners = owners.filter((item) => item.farmIds.includes(draft.farmId));
  const filteredFarms = farms.filter((farm) => !farmQuery || farm.label.toLocaleLowerCase("pt-BR").includes(farmQuery.toLocaleLowerCase("pt-BR")) || farm.id === draft.farmId);
  const errors = useMemo(() => ({ farmId: draft.farmId ? "" : "Selecione a fazenda vinculada.", number: draft.number.trim() ? "" : "Informe o número do CAR." }), [draft.farmId, draft.number]);
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitted(true);
    if (Object.values(errors).some(Boolean)) return;
    onSave({ farmId: draft.farmId, registrationId: draft.registrationId || undefined, ownerId: draft.ownerId || undefined, number: draft.number.trim(), receiptNumber: draft.receiptNumber.trim() || undefined, status: draft.status });
  };
  return <Drawer className="search-result-drawer document-form-drawer" type="overlay" position="end" size="medium" open={open} onOpenChange={(_, data) => { if (!data.open && !saving) onClose(); }}>
    <DrawerHeader><DrawerHeaderTitle action={<Button appearance="subtle" aria-label="Fechar formulário" icon={<Dismiss24Regular />} onClick={onClose} />}>{car ? "Editar CAR" : "Novo CAR"}</DrawerHeaderTitle></DrawerHeader>
    <DrawerBody><form id="car-form" className="document-form" onSubmit={submit} noValidate><div className="document-form__intro"><strong>Cadastro Ambiental Rural</strong><span>Informe a identificação e os vínculos do cadastro</span></div><div className="document-form__grid">
      <Field className="document-form__wide" label="Fazenda" required validationState={submitted && errors.farmId ? "error" : "none"} validationMessage={submitted ? errors.farmId : undefined}><Combobox value={farmQuery} placeholder="Busque uma fazenda" onChange={(event) => { setFarmQuery(event.target.value); if (draft.farmId) setDraft((current) => ({ ...current, farmId: "", registrationId: "", ownerId: "" })); }} onOptionSelect={(_, data) => { const farmId = data.optionValue ?? ""; setDraft((current) => ({ ...current, farmId, registrationId: "", ownerId: "" })); setFarmQuery(farms.find((farm) => farm.id === farmId)?.label ?? ""); }}>{filteredFarms.map((farm) => <Option key={farm.id} value={farm.id}>{farm.label}</Option>)}</Combobox></Field>
      <Field label="Matrícula"><Dropdown disabled={!draft.farmId} value={availableRegistrations.find((item) => item.id === draft.registrationId)?.label ?? "Sem matrícula vinculada"} selectedOptions={[draft.registrationId]} onOptionSelect={(_, data) => setDraft((current) => ({ ...current, registrationId: data.optionValue ?? "" }))}><Option value="">Sem matrícula vinculada</Option>{availableRegistrations.map((item) => <Option key={item.id} value={item.id}>{item.label}</Option>)}</Dropdown></Field>
      <Field label="Proprietário do CAR"><Dropdown disabled={!draft.farmId} value={availableOwners.find((item) => item.id === draft.ownerId)?.label ?? "Não informado"} selectedOptions={[draft.ownerId]} onOptionSelect={(_, data) => setDraft((current) => ({ ...current, ownerId: data.optionValue ?? "" }))}><Option value="">Não informado</Option>{availableOwners.map((owner) => <Option key={owner.id} value={owner.id}>{owner.label}</Option>)}</Dropdown></Field>
      <Field className="document-form__wide" label="Número CAR" required validationState={submitted && errors.number ? "error" : "none"} validationMessage={submitted ? errors.number : undefined}><Input value={draft.number} placeholder="Informe o número do cadastro" onChange={(_, data) => setDraft((current) => ({ ...current, number: data.value }))} /></Field>
      <Field label="Número do recibo"><Input value={draft.receiptNumber} placeholder="Opcional" onChange={(_, data) => setDraft((current) => ({ ...current, receiptNumber: data.value }))} /></Field>
      <Field label="Situação"><Dropdown value={carStatusLabels[draft.status]} selectedOptions={[draft.status]} onOptionSelect={(_, data) => setDraft((current) => ({ ...current, status: (data.optionValue ?? "active") as State["status"] }))}>{(["active", "pending", "inactive"] as const).map((status) => <Option key={status} value={status}>{carStatusLabels[status]}</Option>)}</Dropdown></Field>
    </div>{serviceError ? <p className="registration-form__service-error" role="alert">{serviceError}</p> : null}</form></DrawerBody>
    <DrawerFooter><Button appearance="primary" icon={<Save20Regular />} type="submit" form="car-form" disabled={saving}>{saving ? "Salvando..." : car ? "Salvar alterações" : "Salvar CAR"}</Button><Button appearance="secondary" disabled={saving} onClick={onClose}>Cancelar</Button></DrawerFooter>
  </Drawer>;
}
