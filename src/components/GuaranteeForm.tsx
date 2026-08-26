import {
  Button,
  Dropdown,
  Field,
  Input,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  Option,
  Textarea,
} from "@fluentui/react-components";
import {
  Add20Regular,
  Checkmark20Regular,
  Delete20Regular,
  Edit20Regular,
  MoreHorizontal20Regular,
} from "@fluentui/react-icons";
import type { GuaranteeFormModel, GuaranteeFormStatus } from "../types/models";

interface GuaranteeFormProps {
  value: GuaranteeFormModel;
  hasSelection: boolean;
  onChange: (value: GuaranteeFormModel) => void;
  onCreate: () => void;
  onUpdate: () => void;
  onClose: () => void;
  onDelete: () => void;
  onOpenSelected: () => void;
  onClear: () => void;
  onList: () => void;
}

const guaranteeStatuses: GuaranteeFormStatus[] = ["Ativa", "Encerrada", "Em análise", "Cancelada"];

export function GuaranteeForm({
  value,
  hasSelection,
  onChange,
  onCreate,
  onUpdate,
  onClose,
  onDelete,
  onOpenSelected,
  onClear,
  onList,
}: GuaranteeFormProps) {
  const update = <K extends keyof GuaranteeFormModel>(key: K, nextValue: GuaranteeFormModel[K]) => {
    onChange({ ...value, [key]: nextValue });
  };

  return (
    <>
      <div className="form-grid form-grid--guarantee">
        <Field label="Número da operação" required>
          <Input value={value.numeroOperacao} onChange={(_, data) => update("numeroOperacao", data.value)} />
        </Field>
        <Field label="Matrícula" required>
          <Input value={value.matricula} onChange={(_, data) => update("matricula", data.value)} />
        </Field>
        <Field label="Banco" required>
          <Input value={value.banco} onChange={(_, data) => update("banco", data.value)} />
        </Field>
        <Field label="Tipo de garantia" required>
          <Dropdown
            value={value.tipo}
            selectedOptions={[value.tipo]}
            onOptionSelect={(_, data) => data.optionValue && update("tipo", data.optionValue)}
          >
            {["Penhor pecuário", "Penhor agrícola", "Hipoteca", "Alienação fiduciária", "Outra"].map((type) => (
              <Option key={type} value={type}>{type}</Option>
            ))}
          </Dropdown>
        </Field>
        <Field label="Descrição" className="field-span-2">
          <Input value={value.descricao} onChange={(_, data) => update("descricao", data.value)} />
        </Field>
        <div className="field-grid field-grid--three field-span-2">
          <Field label="Grau">
            <Input value={value.grau} onChange={(_, data) => update("grau", data.value)} />
          </Field>
          <Field label="Valor">
            <Input value={value.valor} onChange={(_, data) => update("valor", data.value)} />
          </Field>
          <Field label="Ano da avaliação">
            <Input value={value.anoAvaliacao} onChange={(_, data) => update("anoAvaliacao", data.value)} />
          </Field>
        </div>
        <div className="field-grid field-grid--three field-span-2">
          <Field label="Situação">
            <Dropdown
              value={value.situacao}
              selectedOptions={[value.situacao]}
              onOptionSelect={(_, data) => data.optionValue && update("situacao", data.optionValue as GuaranteeFormStatus)}
            >
              {guaranteeStatuses.map((status) => <Option key={status} value={status}>{status}</Option>)}
            </Dropdown>
          </Field>
          <Field label="Data de início">
            <Input type="date" value={value.dataInicio} onChange={(_, data) => update("dataInicio", data.value)} />
          </Field>
          <Field label="Data de vencimento">
            <Input type="date" value={value.dataVencimento} onChange={(_, data) => update("dataVencimento", data.value)} />
          </Field>
        </div>
        <Field label="Observações" className="field-span-2">
          <Textarea resize="vertical" value={value.observacoes} onChange={(_, data) => update("observacoes", data.value)} />
        </Field>
      </div>
      <div className="card-actions">
        <Button appearance="primary" icon={<Add20Regular />} onClick={onCreate}>Cadastrar</Button>
        <Button icon={<Edit20Regular />} disabled={!hasSelection} onClick={onUpdate}>Atualizar</Button>
        <Button icon={<Checkmark20Regular />} disabled={!hasSelection} onClick={onClose}>Encerrar</Button>
        <Button className="danger-button--outline" icon={<Delete20Regular />} disabled={!hasSelection} onClick={onDelete}>
          Excluir
        </Button>
        <Menu>
          <MenuTrigger disableButtonEnhancement>
            <Button icon={<MoreHorizontal20Regular />}>Mais ações</Button>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              <MenuItem disabled={!hasSelection} onClick={onOpenSelected}>Abrir selecionada</MenuItem>
              <MenuItem onClick={onClear}>Limpar</MenuItem>
              <MenuItem onClick={onList}>Listar garantias</MenuItem>
            </MenuList>
          </MenuPopover>
        </Menu>
      </div>
    </>
  );
}
