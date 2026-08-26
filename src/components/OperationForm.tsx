import { Button, Dropdown, Field, Input, Option, Tooltip } from "@fluentui/react-components";
import {
  Add20Regular,
  Delete20Regular,
  Dismiss20Regular,
  Edit20Regular,
  Save20Regular,
} from "@fluentui/react-icons";
import type { OperationFormModel, OperationFormStatus } from "../types/models";
import { SectionCard } from "./SectionCard";

interface OperationFormProps {
  value: OperationFormModel;
  onChange: (value: OperationFormModel) => void;
  onNew: () => void;
  onSave: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onClear: () => void;
}

const operationStatuses: OperationFormStatus[] = ["Em análise", "Ativa", "Concluída", "Cancelada"];

export function OperationForm({
  value,
  onChange,
  onNew,
  onSave,
  onEdit,
  onDelete,
  onClear,
}: OperationFormProps) {
  const update = <K extends keyof OperationFormModel>(key: K, nextValue: OperationFormModel[K]) => {
    onChange({ ...value, [key]: nextValue });
  };

  return (
    <SectionCard title="Dados da operação" subtitle="Informações principais da operação financeira">
      <div className="form-grid form-grid--operation">
        <Field label="Matrícula" required>
          <Input value={value.matricula} onChange={(_, data) => update("matricula", data.value)} />
        </Field>
        <Field label="Banco" required>
          <Input value={value.banco} onChange={(_, data) => update("banco", data.value)} />
        </Field>
        <Field label="Número da operação" required>
          <Input value={value.numero} onChange={(_, data) => update("numero", data.value)} />
        </Field>
        <Field label="Finalidade">
          <Input value={value.finalidade} onChange={(_, data) => update("finalidade", data.value)} />
        </Field>
        <Field label="Valor">
          <Input value={value.valor} onChange={(_, data) => update("valor", data.value)} />
        </Field>
        <Field label="Situação" required>
          <Dropdown
            value={value.situacao}
            selectedOptions={[value.situacao]}
            onOptionSelect={(_, data) => data.optionValue && update("situacao", data.optionValue as OperationFormStatus)}
          >
            {operationStatuses.map((status) => (
              <Option key={status} value={status}>
                {status}
              </Option>
            ))}
          </Dropdown>
        </Field>
        <Field label="Data de início" required>
          <Input type="date" value={value.dataInicio} onChange={(_, data) => update("dataInicio", data.value)} />
        </Field>
      </div>
      <div className="card-actions card-actions--split">
        <div className="card-actions__group">
          <Button icon={<Add20Regular />} onClick={onNew}>Novo</Button>
          <Button appearance="primary" icon={<Save20Regular />} onClick={onSave}>Salvar</Button>
          <Button icon={<Edit20Regular />} onClick={onEdit}>Editar</Button>
        </div>
        <div className="card-actions__group">
          <Tooltip content="Excluir a operação atual" relationship="label">
            <Button className="danger-button--outline" icon={<Delete20Regular />} onClick={onDelete}>
              Excluir
            </Button>
          </Tooltip>
          <Button icon={<Dismiss20Regular />} onClick={onClear}>Limpar</Button>
        </div>
      </div>
    </SectionCard>
  );
}
