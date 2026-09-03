import { Button, Dropdown, Field, Input, Option, Textarea, Tooltip } from "@fluentui/react-components";
import { Add20Regular, Delete20Regular, Dismiss20Regular, Edit20Regular, Open20Regular, Save20Regular } from "@fluentui/react-icons";
import type { FinancialInstitutionOption, OperationRegistrationOption } from "../types/operacao";
import type { OperationFormModel, OperationFormStatus, OperationOption } from "../types/models";
import { operationStatusLabels } from "../services/statusLabels";
import { SectionCard } from "./SectionCard";

interface OperationFormProps {
  value: OperationFormModel;
  operations: OperationOption[];
  institutions: FinancialInstitutionOption[];
  registrations: OperationRegistrationOption[];
  canWrite: boolean;
  canDelete: boolean;
  canClose: boolean;
  canCancel: boolean;
  canReadFinancial: boolean;
  canWriteFinancial: boolean;
  onChange: (value: OperationFormModel) => void;
  onSelectOperation: (id: string) => void;
  onNew: () => void;
  onSave: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onClear: () => void;
  onOpenRegistration: (id: string) => void;
  onOpenFarm: (id: string) => void;
}

const operationStatuses: OperationFormStatus[] = ["under_review", "active", "completed", "cancelled"].map(
  (status) => operationStatusLabels[status as keyof typeof operationStatusLabels],
);

export function OperationForm({
  value, operations, institutions, registrations, canWrite, canDelete, canClose, canCancel, canReadFinancial, canWriteFinancial,
  onChange, onSelectOperation, onNew, onSave, onEdit, onDelete, onClear, onOpenRegistration, onOpenFarm,
}: OperationFormProps) {
  const update = <K extends keyof OperationFormModel>(key: K, nextValue: OperationFormModel[K]) => onChange({ ...value, [key]: nextValue });
  const selectedRegistrationLabels = value.registrationIds.map((id) => registrations.find((item) => item.id === id)?.label).filter(Boolean).join(", ");
  const primaryRegistration = registrations.find((item) => item.id === value.primaryRegistrationId);
  const selectedInstitution = institutions.find((item) => item.id === value.institutionId);
  const availableInstitutions = institutions.filter((item) => item.status !== "inactive" || item.id === value.institutionId);

  return (
    <SectionCard title="Dados da operação" subtitle="Informações principais da operação financeira">
      <div className="form-grid form-grid--operation">
        <Field label="Operação cadastrada">
          <Dropdown value={operations.find((item) => item.id === value.id)?.label ?? "Nova operação"} selectedOptions={value.id ? [value.id] : []} onOptionSelect={(_, data) => data.optionValue && onSelectOperation(data.optionValue)}>
            {operations.map((operation) => <Option key={operation.id} value={operation.id}>{operation.label}</Option>)}
          </Dropdown>
        </Field>
        <Field label="Instituição financeira" required>
          <Dropdown disabled={!canWrite} value={selectedInstitution?.name ?? ""} selectedOptions={value.institutionId ? [value.institutionId] : []} onOptionSelect={(_, data) => {
            const institution = institutions.find((item) => item.id === data.optionValue);
            onChange({ ...value, institutionId: institution?.id ?? "", banco: institution?.name ?? "" });
          }}>
            {availableInstitutions.map((institution) => {
              const label = `${institution.name}${institution.status === "inactive" ? " (inativa)" : ""}`;
              return <Option key={institution.id} value={institution.id} text={label}>{label}</Option>;
            })}
          </Dropdown>
        </Field>
        <Field label="Número da operação" required>
          <Input disabled={!canWrite} value={value.numero} onChange={(_, data) => update("numero", data.value)} />
        </Field>
        <Field label="Finalidade">
          <Input disabled={!canWrite} value={value.finalidade} onChange={(_, data) => update("finalidade", data.value)} />
        </Field>
        <Field label="Matrículas vinculadas" hint="Selecione uma ou mais matrículas." required>
          <Dropdown multiselect disabled={!canWrite} value={selectedRegistrationLabels} selectedOptions={value.registrationIds} onOptionSelect={(_, data) => {
            const registrationIds = data.selectedOptions;
            const primaryRegistrationId = registrationIds.includes(value.primaryRegistrationId) ? value.primaryRegistrationId : registrationIds[0] ?? "";
            onChange({ ...value, registrationIds, primaryRegistrationId, matricula: registrationIds.map((id) => registrations.find((item) => item.id === id)?.number).filter(Boolean).join(", ") });
          }}>
            {registrations.map((registration) => <Option key={registration.id} value={registration.id}>{registration.label}</Option>)}
          </Dropdown>
        </Field>
        <Field label="Matrícula principal" required>
          <Dropdown disabled={!canWrite || !value.registrationIds.length} value={primaryRegistration?.label ?? ""} selectedOptions={value.primaryRegistrationId ? [value.primaryRegistrationId] : []} onOptionSelect={(_, data) => data.optionValue && update("primaryRegistrationId", data.optionValue)}>
            {registrations.filter((registration) => value.registrationIds.includes(registration.id)).map((registration) => <Option key={registration.id} value={registration.id}>{registration.label}</Option>)}
          </Dropdown>
        </Field>
        <Field label="Valor">
          <Input disabled={!canWrite || !canReadFinancial || !canWriteFinancial} value={canReadFinancial ? value.valor : "Acesso restrito"} onChange={(_, data) => update("valor", data.value)} />
        </Field>
        <Field label="Situação" required>
          <Dropdown disabled={!canWrite} value={value.situacao} selectedOptions={[value.situacao]} onOptionSelect={(_, data) => data.optionValue && update("situacao", data.optionValue as OperationFormStatus)}>
            {operationStatuses.map((status) => <Option key={status} value={status} disabled={(status === "Concluída" && !canClose) || (status === "Cancelada" && !canCancel)}>{status}</Option>)}
          </Dropdown>
        </Field>
        <Field label="Data de início">
          <Input disabled={!canWrite} type="date" value={value.dataInicio} onChange={(_, data) => update("dataInicio", data.value)} />
        </Field>
        <Field label="Data de término">
          <Input disabled={!canWrite} type="date" value={value.dataFim} onChange={(_, data) => update("dataFim", data.value)} />
        </Field>
        <Field label="Observações" className="field-span-2">
          <Textarea disabled={!canWrite} resize="vertical" value={value.observacoes} onChange={(_, data) => update("observacoes", data.value)} />
        </Field>
      </div>
      <div className="card-actions card-actions--split">
        <div className="card-actions__group">
          <Button icon={<Add20Regular />} disabled={!canWrite} onClick={onNew}>Novo</Button>
          <Button appearance="primary" icon={<Save20Regular />} disabled={!canWrite || Boolean(value.id)} onClick={onSave}>Salvar</Button>
          <Button icon={<Edit20Regular />} disabled={!canWrite || !value.id} onClick={onEdit}>Editar</Button>
        </div>
        <div className="card-actions__group">
          <Button icon={<Open20Regular />} disabled={!primaryRegistration} onClick={() => primaryRegistration && onOpenRegistration(primaryRegistration.id)}>Abrir matrícula</Button>
          <Button icon={<Open20Regular />} disabled={!primaryRegistration} onClick={() => primaryRegistration && onOpenFarm(primaryRegistration.farmId)}>Abrir fazenda</Button>
          <Tooltip content="Excluir a operação atual" relationship="label">
            <Button className="danger-button--outline" icon={<Delete20Regular />} disabled={!canDelete || !value.id} onClick={onDelete}>Excluir</Button>
          </Tooltip>
          <Button icon={<Dismiss20Regular />} onClick={onClear}>Limpar</Button>
        </div>
      </div>
    </SectionCard>
  );
}
