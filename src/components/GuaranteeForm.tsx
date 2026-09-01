import { Button, Dropdown, Field, Input, Menu, MenuItem, MenuList, MenuPopover, MenuTrigger, Option, Textarea } from "@fluentui/react-components";
import { Add20Regular, Checkmark20Regular, Delete20Regular, Edit20Regular, MoreHorizontal20Regular, Open20Regular } from "@fluentui/react-icons";
import type { GuaranteeTypeOption, OperationRegistrationOption } from "../types/operacao";
import type { GuaranteeFormModel, GuaranteeFormStatus } from "../types/models";

interface GuaranteeFormProps {
  value: GuaranteeFormModel;
  registrations: OperationRegistrationOption[];
  guaranteeTypes: GuaranteeTypeOption[];
  availableRegistrationIds: string[];
  hasSelection: boolean;
  canWrite: boolean;
  canDelete: boolean;
  canClose: boolean;
  canCancel: boolean;
  canReadFinancial: boolean;
  canWriteFinancial: boolean;
  onChange: (value: GuaranteeFormModel) => void;
  onCreate: () => void;
  onUpdate: () => void;
  onClose: () => void;
  onDelete: () => void;
  onOpenSelected: () => void;
  onClear: () => void;
  onList: () => void;
  onOpenRegistration: (id: string) => void;
}

const guaranteeStatuses: GuaranteeFormStatus[] = ["Ativa", "Encerrada", "Cancelada"];

export function GuaranteeForm({
  value, registrations, guaranteeTypes, availableRegistrationIds, hasSelection, canWrite, canDelete, canClose, canCancel,
  canReadFinancial, canWriteFinancial, onChange, onCreate, onUpdate, onClose, onDelete, onOpenSelected, onClear, onList, onOpenRegistration,
}: GuaranteeFormProps) {
  const update = <K extends keyof GuaranteeFormModel>(key: K, nextValue: GuaranteeFormModel[K]) => onChange({ ...value, [key]: nextValue });
  const availableRegistrations = registrations.filter((registration) => availableRegistrationIds.includes(registration.id));
  const selectedRegistrationLabels = value.registrationIds.map((id) => registrations.find((item) => item.id === id)?.label).filter(Boolean).join(", ");
  const selectedTypeLabels = value.guaranteeTypeIds.map((id) => guaranteeTypes.find((item) => item.id === id)?.name).filter(Boolean).join(", ");
  const primaryType = guaranteeTypes.find((type) => type.id === value.primaryGuaranteeTypeId);
  const firstLinkedRegistrationId = value.registrationIds[0];

  return (
    <>
      <div className="form-grid form-grid--guarantee">
        <Field label="Número da operação">
          <Input value={value.numeroOperacao} disabled />
        </Field>
        <Field label="Instituição financeira">
          <Input value={value.banco} disabled />
        </Field>
        <Field label="Matrículas da garantia" hint="Disponíveis somente matrículas já ligadas à operação." required>
          <Dropdown multiselect disabled={!canWrite || !value.operationId} value={selectedRegistrationLabels} selectedOptions={value.registrationIds} onOptionSelect={(_, data) => {
            const registrationIds = data.selectedOptions;
            const linked = registrationIds.map((id) => registrations.find((item) => item.id === id)).filter((item): item is OperationRegistrationOption => Boolean(item));
            onChange({ ...value, registrationIds, matricula: linked.map((item) => item.number).join(", "), fazenda: [...new Set(linked.map((item) => item.farmName))].join(", ") });
          }}>
            {availableRegistrations.map((registration) => <Option key={registration.id} value={registration.id}>{registration.label}</Option>)}
          </Dropdown>
        </Field>
        <Field label="Tipos de garantia" required>
          <Dropdown multiselect disabled={!canWrite} value={selectedTypeLabels} selectedOptions={value.guaranteeTypeIds} onOptionSelect={(_, data) => {
            const guaranteeTypeIds = data.selectedOptions;
            const primaryGuaranteeTypeId = guaranteeTypeIds.includes(value.primaryGuaranteeTypeId) ? value.primaryGuaranteeTypeId : guaranteeTypeIds[0] ?? "";
            onChange({ ...value, guaranteeTypeIds, primaryGuaranteeTypeId, tipo: guaranteeTypeIds.map((id) => guaranteeTypes.find((item) => item.id === id)?.name).filter(Boolean).join(", ") });
          }}>
            {guaranteeTypes.map((type) => <Option key={type.id} value={type.id}>{type.name}</Option>)}
          </Dropdown>
        </Field>
        <Field label="Tipo principal" required>
          <Dropdown disabled={!canWrite || !value.guaranteeTypeIds.length} value={primaryType?.name ?? ""} selectedOptions={value.primaryGuaranteeTypeId ? [value.primaryGuaranteeTypeId] : []} onOptionSelect={(_, data) => data.optionValue && update("primaryGuaranteeTypeId", data.optionValue)}>
            {guaranteeTypes.filter((type) => value.guaranteeTypeIds.includes(type.id)).map((type) => <Option key={type.id} value={type.id}>{type.name}</Option>)}
          </Dropdown>
        </Field>
        <Field label="Descrição">
          <Input disabled={!canWrite} value={value.descricao} onChange={(_, data) => update("descricao", data.value)} />
        </Field>
        <div className="field-grid field-grid--three field-span-2">
          <Field label="Grau"><Input disabled={!canWrite} value={value.grau} onChange={(_, data) => update("grau", data.value)} /></Field>
          <Field label="Valor"><Input disabled={!canWrite || !canReadFinancial || !canWriteFinancial} value={canReadFinancial ? value.valor : "Acesso restrito"} onChange={(_, data) => update("valor", data.value)} /></Field>
          <Field label="Ano da avaliação"><Input disabled={!canWrite} type="number" min={1900} max={2200} value={value.anoAvaliacao} onChange={(_, data) => update("anoAvaliacao", data.value)} /></Field>
        </div>
        <div className="field-grid field-grid--three field-span-2">
          <Field label="Situação">
            <Dropdown disabled={!canWrite} value={value.situacao} selectedOptions={[value.situacao]} onOptionSelect={(_, data) => data.optionValue && update("situacao", data.optionValue as GuaranteeFormStatus)}>
              {guaranteeStatuses.map((status) => <Option key={status} value={status} disabled={(status === "Encerrada" && !canClose) || (status === "Cancelada" && !canCancel)}>{status}</Option>)}
            </Dropdown>
          </Field>
          <Field label="Data de início"><Input disabled={!canWrite} type="date" value={value.dataInicio} onChange={(_, data) => update("dataInicio", data.value)} /></Field>
          <Field label="Data de vencimento"><Input disabled={!canWrite} type="date" value={value.dataVencimento} onChange={(_, data) => update("dataVencimento", data.value)} /></Field>
        </div>
        <Field label="Observações" className="field-span-2"><Textarea disabled={!canWrite} resize="vertical" value={value.observacoes} onChange={(_, data) => update("observacoes", data.value)} /></Field>
      </div>
      <div className="card-actions">
        <Button appearance="primary" icon={<Add20Regular />} disabled={!canWrite || !value.operationId} onClick={onCreate}>Cadastrar</Button>
        <Button icon={<Edit20Regular />} disabled={!canWrite || !hasSelection} onClick={onUpdate}>Atualizar</Button>
        <Button icon={<Checkmark20Regular />} disabled={!canClose || !hasSelection} onClick={onClose}>Encerrar</Button>
        <Button className="danger-button--outline" icon={<Delete20Regular />} disabled={!canDelete || !hasSelection} onClick={onDelete}>Excluir</Button>
        <Button icon={<Open20Regular />} disabled={!firstLinkedRegistrationId} onClick={() => firstLinkedRegistrationId && onOpenRegistration(firstLinkedRegistrationId)}>Abrir matrícula</Button>
        <Menu>
          <MenuTrigger disableButtonEnhancement><Button icon={<MoreHorizontal20Regular />}>Mais ações</Button></MenuTrigger>
          <MenuPopover><MenuList>
            <MenuItem disabled={!hasSelection} onClick={onOpenSelected}>Abrir selecionada</MenuItem>
            <MenuItem onClick={onClear}>Limpar</MenuItem>
            <MenuItem onClick={onList}>Listar garantias</MenuItem>
          </MenuList></MenuPopover>
        </Menu>
      </div>
    </>
  );
}
