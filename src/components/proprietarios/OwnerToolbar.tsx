import {
  Button,
  Dropdown,
  Field,
  Input,
  Option,
  Popover,
  PopoverSurface,
  PopoverTrigger,
} from "@fluentui/react-components";
import { Add20Regular, Dismiss20Regular, Filter20Regular, Search20Regular } from "@fluentui/react-icons";
import type { OwnerFarmLink, OwnerFilters } from "../../types/proprietario";

interface OwnerToolbarProps {
  query: string;
  value: OwnerFilters;
  farms: OwnerFarmLink[];
  hasActiveFilters: boolean;
  canCreate: boolean;
  onQueryChange: (value: string) => void;
  onChange: (value: OwnerFilters) => void;
  onClear: () => void;
  onNew: () => void;
}

export function OwnerToolbar({ query, value, farms, hasActiveFilters, canCreate, onQueryChange, onChange, onClear, onNew }: OwnerToolbarProps) {
  const selectedFarm = farms.find((farm) => farm.id === value.farmId)?.name ?? "Todas as fazendas";
  return (
    <div className="owner-toolbar">
      <Field label="Buscar proprietário" className="owner-toolbar__search">
        <Input
          contentBefore={<Search20Regular />}
          value={query}
          placeholder="Nome, CPF/CNPJ, telefone ou e-mail"
          onChange={(_, data) => onQueryChange(data.value)}
        />
      </Field>

      <Field label="Tipo">
        <Dropdown
          value={value.type === "all" ? "Todos" : value.type === "individual" ? "Pessoa Física" : "Pessoa Jurídica"}
          selectedOptions={[value.type]}
          onOptionSelect={(_, data) => onChange({ ...value, type: data.optionValue as OwnerFilters["type"], page: 1 })}
        >
          <Option value="all">Todos</Option>
          <Option value="individual">Pessoa Física</Option>
          <Option value="company">Pessoa Jurídica</Option>
        </Dropdown>
      </Field>

      <Field label="Situação">
        <Dropdown
          value={value.status === "all" ? "Todas" : value.status === "active" ? "Ativo" : "Inativo"}
          selectedOptions={[value.status]}
          onOptionSelect={(_, data) => onChange({ ...value, status: data.optionValue as OwnerFilters["status"], page: 1 })}
        >
          <Option value="all">Todas</Option>
          <Option value="active">Ativo</Option>
          <Option value="inactive">Inativo</Option>
        </Dropdown>
      </Field>

      <Popover positioning="below-end" withArrow>
        <PopoverTrigger disableButtonEnhancement>
          <Button icon={<Filter20Regular />} appearance={value.farmId ? "primary" : "secondary"}>Mais filtros</Button>
        </PopoverTrigger>
        <PopoverSurface className="owner-farm-filter">
          <strong>Filtrar por fazenda</strong>
          <span>Mostre somente proprietários vinculados à fazenda selecionada.</span>
          <Dropdown
            aria-label="Fazenda vinculada"
            value={selectedFarm}
            selectedOptions={[value.farmId]}
            onOptionSelect={(_, data) => onChange({ ...value, farmId: data.optionValue ?? "", page: 1 })}
          >
            <Option value="">Todas as fazendas</Option>
            {farms.map((farm) => <Option key={farm.id} value={farm.id}>{farm.name}</Option>)}
          </Dropdown>
        </PopoverSurface>
      </Popover>

      {hasActiveFilters ? (
        <Button className="owner-toolbar__clear" appearance="subtle" icon={<Dismiss20Regular />} onClick={onClear}>Limpar</Button>
      ) : null}

      {canCreate ? <Button className="owner-toolbar__new" appearance="primary" icon={<Add20Regular />} onClick={onNew}>Novo proprietário</Button> : null}
    </div>
  );
}
