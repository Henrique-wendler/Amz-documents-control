import { Button, Dropdown, Field, Input, Option, Popover, PopoverSurface, PopoverTrigger } from "@fluentui/react-components";
import { Add20Regular, Dismiss20Regular, Filter20Regular, Search20Regular } from "@fluentui/react-icons";
import type { FarmFilters } from "../../types/fazenda";

interface FarmToolbarProps {
  query: string;
  value: FarmFilters;
  states: string[];
  municipalities: string[];
  hasActiveFilters: boolean;
  onQueryChange: (value: string) => void;
  onChange: (value: FarmFilters) => void;
  onClear: () => void;
  onNew: () => void;
}

const yesNoLabel = (value: "all" | "yes" | "no") => value === "all" ? "Todos" : value === "yes" ? "Sim" : "Não";

export function FarmToolbar({ query, value, states, municipalities, hasActiveFilters, onQueryChange, onChange, onClear, onNew }: FarmToolbarProps) {
  const advancedActive = Boolean(value.municipality || value.areaRange !== "all" || value.hasRegistration !== "all" || value.hasActiveOperation !== "all" || value.hasCar !== "all");
  return (
    <div className="farm-toolbar">
      <Field label="Buscar fazenda" className="farm-toolbar__search">
        <Input contentBefore={<Search20Regular />} value={query} placeholder="Nome, município, UF ou localização" onChange={(_, data) => onQueryChange(data.value)} />
      </Field>
      <Field label="Situação">
        <Dropdown value={value.status === "all" ? "Todas" : value.status === "active" ? "Ativa" : "Inativa"} selectedOptions={[value.status]} onOptionSelect={(_, data) => onChange({ ...value, status: data.optionValue as FarmFilters["status"], page: 1 })}>
          <Option value="all">Todas</Option><Option value="active">Ativa</Option><Option value="inactive">Inativa</Option>
        </Dropdown>
      </Field>
      <Field label="UF">
        <Dropdown value={value.state || "Todas"} selectedOptions={[value.state]} onOptionSelect={(_, data) => onChange({ ...value, state: data.optionValue ?? "", municipality: "", page: 1 })}>
          <Option value="">Todas</Option>{states.map((state) => <Option key={state} value={state}>{state}</Option>)}
        </Dropdown>
      </Field>
      <Popover positioning="below-end" withArrow>
        <PopoverTrigger disableButtonEnhancement><Button icon={<Filter20Regular />} appearance={advancedActive ? "primary" : "secondary"}>Mais filtros</Button></PopoverTrigger>
        <PopoverSurface className="farm-advanced-filter">
          <div className="farm-advanced-filter__heading"><strong>Filtros avançados</strong><span>Refine a lista pelos vínculos existentes.</span></div>
          <Field label="Município">
            <Dropdown value={value.municipality || "Todos"} selectedOptions={[value.municipality]} onOptionSelect={(_, data) => onChange({ ...value, municipality: data.optionValue ?? "", page: 1 })}>
              <Option value="">Todos</Option>{municipalities.map((municipality) => <Option key={municipality} value={municipality}>{municipality}</Option>)}
            </Dropdown>
          </Field>
          <Field label="Faixa de área">
            <Dropdown value={value.areaRange === "all" ? "Todas" : value.areaRange === "up-to-2000" ? "Até 2.000 ha" : value.areaRange === "2000-3500" ? "2.000 a 3.500 ha" : "Acima de 3.500 ha"} selectedOptions={[value.areaRange]} onOptionSelect={(_, data) => onChange({ ...value, areaRange: data.optionValue as FarmFilters["areaRange"], page: 1 })}>
              <Option value="all">Todas</Option><Option value="up-to-2000">Até 2.000 ha</Option><Option value="2000-3500">2.000 a 3.500 ha</Option><Option value="above-3500">Acima de 3.500 ha</Option>
            </Dropdown>
          </Field>
          <div className="farm-advanced-filter__relations">
            <Field label="Com matrícula"><Dropdown value={yesNoLabel(value.hasRegistration)} selectedOptions={[value.hasRegistration]} onOptionSelect={(_, data) => onChange({ ...value, hasRegistration: data.optionValue as FarmFilters["hasRegistration"], page: 1 })}><Option value="all">Todos</Option><Option value="yes">Sim</Option><Option value="no">Não</Option></Dropdown></Field>
            <Field label="Operação ativa"><Dropdown value={yesNoLabel(value.hasActiveOperation)} selectedOptions={[value.hasActiveOperation]} onOptionSelect={(_, data) => onChange({ ...value, hasActiveOperation: data.optionValue as FarmFilters["hasActiveOperation"], page: 1 })}><Option value="all">Todos</Option><Option value="yes">Sim</Option><Option value="no">Não</Option></Dropdown></Field>
            <Field label="Com CAR"><Dropdown value={yesNoLabel(value.hasCar)} selectedOptions={[value.hasCar]} onOptionSelect={(_, data) => onChange({ ...value, hasCar: data.optionValue as FarmFilters["hasCar"], page: 1 })}><Option value="all">Todos</Option><Option value="yes">Sim</Option><Option value="no">Não</Option></Dropdown></Field>
          </div>
        </PopoverSurface>
      </Popover>
      {hasActiveFilters ? <Button className="farm-toolbar__clear" appearance="subtle" icon={<Dismiss20Regular />} onClick={onClear}>Limpar</Button> : null}
      <Button className="farm-toolbar__new" appearance="primary" icon={<Add20Regular />} onClick={onNew}>Nova fazenda</Button>
    </div>
  );
}
