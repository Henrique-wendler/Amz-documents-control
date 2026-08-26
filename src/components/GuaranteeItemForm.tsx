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
import { Add20Regular, Delete20Regular, Edit20Regular, MoreHorizontal20Regular } from "@fluentui/react-icons";
import type { GuaranteeItemFormModel } from "../types/models";

interface GuaranteeItemFormProps {
  value: GuaranteeItemFormModel;
  hasSelection: boolean;
  onChange: (value: GuaranteeItemFormModel) => void;
  onCreate: () => void;
  onUpdate: () => void;
  onDelete: () => void;
  onSearch: () => void;
  onClear: () => void;
  onList: () => void;
}

export function GuaranteeItemForm({
  value,
  hasSelection,
  onChange,
  onCreate,
  onUpdate,
  onDelete,
  onSearch,
  onClear,
  onList,
}: GuaranteeItemFormProps) {
  const update = <K extends keyof GuaranteeItemFormModel>(key: K, nextValue: GuaranteeItemFormModel[K]) => {
    onChange({ ...value, [key]: nextValue });
  };

  return (
    <>
      <div className="form-grid form-grid--item">
        <Field label="Categoria" required>
          <Dropdown
            value={value.categoria}
            selectedOptions={[value.categoria]}
            onOptionSelect={(_, data) => data.optionValue && update("categoria", data.optionValue)}
          >
            {["Animal", "Máquina", "Equipamento", "Implemento", "Produção agrícola", "Estoque", "Outro"].map((category) => (
              <Option key={category} value={category}>{category}</Option>
            ))}
          </Dropdown>
        </Field>
        <Field label="Descrição" required>
          <Input value={value.descricao} onChange={(_, data) => update("descricao", data.value)} />
        </Field>
        <div className="field-grid field-grid--two">
          <Field label="Quantidade" required>
            <Input
              type="number"
              min={0}
              value={String(value.quantidade)}
              onChange={(_, data) => update("quantidade", Number(data.value))}
            />
          </Field>
          <Field label="Unidade" required>
            <Dropdown
              value={value.unidade}
              selectedOptions={[value.unidade]}
              onOptionSelect={(_, data) => data.optionValue && update("unidade", data.optionValue)}
            >
              {["Cabeças", "Unidade", "kg", "Tonelada", "Saca", "ha"].map((unit) => (
                <Option key={unit} value={unit}>{unit}</Option>
              ))}
            </Dropdown>
          </Field>
        </div>
        <Field label="Observações">
          <Textarea resize="vertical" value={value.observacoes} onChange={(_, data) => update("observacoes", data.value)} />
        </Field>
      </div>
      <div className="card-actions">
        <Button appearance="primary" icon={<Add20Regular />} onClick={onCreate}>Cadastrar</Button>
        <Button icon={<Edit20Regular />} disabled={!hasSelection} onClick={onUpdate}>Atualizar</Button>
        <Button className="danger-button--outline" icon={<Delete20Regular />} disabled={!hasSelection} onClick={onDelete}>
          Excluir
        </Button>
        <Menu>
          <MenuTrigger disableButtonEnhancement>
            <Button icon={<MoreHorizontal20Regular />}>Mais ações</Button>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              <MenuItem onClick={onSearch}>Buscar</MenuItem>
              <MenuItem onClick={onClear}>Limpar</MenuItem>
              <MenuItem onClick={onList}>Listar itens</MenuItem>
            </MenuList>
          </MenuPopover>
        </Menu>
      </div>
    </>
  );
}
