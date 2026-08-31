import { Button, Dropdown, Field, Input, Option, Popover, PopoverSurface, PopoverTrigger } from "@fluentui/react-components";
import { Add20Regular, Dismiss20Regular, Filter20Regular, Search20Regular } from "@fluentui/react-icons";
import type { RegistrationFarmOption, RegistrationFilters } from "../../types/matricula";

interface RegistrationToolbarProps {
  query: string; value: RegistrationFilters; farms: RegistrationFarmOption[]; hasActiveFilters: boolean; canCreate: boolean;
  onQueryChange: (value: string) => void; onChange: (value: RegistrationFilters) => void; onClear: () => void; onNew: () => void;
}

const relationLabel = (value: "all" | "with" | "without") => value === "all" ? "Todos" : value === "with" ? "Com vínculo" : "Sem vínculo";

export function RegistrationToolbar({ query, value, farms, hasActiveFilters, canCreate, onQueryChange, onChange, onClear, onNew }: RegistrationToolbarProps) {
  const selectedFarm = farms.find((farm) => farm.id === value.farmId)?.name ?? "Todas as fazendas";
  const advancedActive = value.ownerRelation !== "all" || value.operationRelation !== "all" || value.guaranteeRelation !== "all" || value.hp !== "all" || value.areaRange !== "all" || Boolean(value.certificateFrom);
  return <div className="registration-toolbar">
    <Field label="Buscar matrícula" className="registration-toolbar__search"><Input contentBefore={<Search20Regular />} value={query} placeholder="Número da matrícula, matrícula anterior, fazenda ou HP..." onChange={(_, data) => onQueryChange(data.value)} /></Field>
    <Field label="Fazenda"><Dropdown value={selectedFarm} selectedOptions={[value.farmId]} onOptionSelect={(_, data) => onChange({ ...value, farmId: data.optionValue ?? "", page: 1 })}><Option value="">Todas as fazendas</Option>{farms.map((farm) => <Option key={farm.id} value={farm.id}>{farm.name}</Option>)}</Dropdown></Field>
    <Field label="Situação"><Dropdown value={value.status === "all" ? "Todas" : value.status === "active" ? "Ativa" : "Inativa"} selectedOptions={[value.status]} onOptionSelect={(_, data) => onChange({ ...value, status: data.optionValue as RegistrationFilters["status"], page: 1 })}><Option value="all">Todas</Option><Option value="active">Ativa</Option><Option value="inactive">Inativa</Option></Dropdown></Field>
    <Popover positioning="below-end" withArrow><PopoverTrigger disableButtonEnhancement><Button icon={<Filter20Regular />} appearance={advancedActive ? "primary" : "secondary"}>Mais filtros</Button></PopoverTrigger><PopoverSurface className="registration-advanced-filter">
      <div className="registration-advanced-filter__heading"><strong>Filtros avançados</strong><span>Refine a lista por dados registrais e vínculos.</span></div>
      <div className="registration-advanced-filter__grid">
        <Field label="Proprietário ativo"><Dropdown value={relationLabel(value.ownerRelation)} selectedOptions={[value.ownerRelation]} onOptionSelect={(_, data) => onChange({ ...value, ownerRelation: data.optionValue as RegistrationFilters["ownerRelation"], page: 1 })}><Option value="all">Todos</Option><Option value="with">Com proprietário</Option><Option value="without">Sem proprietário</Option></Dropdown></Field>
        <Field label="Operação" hint="Aguardando migração"><Dropdown disabled value="Todos" selectedOptions={["all"]}><Option value="all">Todos</Option></Dropdown></Field>
        <Field label="Garantia" hint="Aguardando migração"><Dropdown disabled value="Todos" selectedOptions={["all"]}><Option value="all">Todos</Option></Dropdown></Field>
        <Field label="HP" hint="Pendente de definição"><Dropdown disabled value="Todos" selectedOptions={["all"]}><Option value="all">Todos</Option></Dropdown></Field>
        <Field label="Faixa de área legal"><Dropdown value={value.areaRange === "all" ? "Todas" : value.areaRange === "up-to-1000" ? "Até 1.000 ha" : value.areaRange === "1000-1800" ? "1.000 a 1.800 ha" : "Acima de 1.800 ha"} selectedOptions={[value.areaRange]} onOptionSelect={(_, data) => onChange({ ...value, areaRange: data.optionValue as RegistrationFilters["areaRange"], page: 1 })}><Option value="all">Todas</Option><Option value="up-to-1000">Até 1.000 ha</Option><Option value="1000-1800">1.000 a 1.800 ha</Option><Option value="above-1800">Acima de 1.800 ha</Option></Dropdown></Field>
        <Field label="Certidão a partir de"><Input type="date" value={value.certificateFrom} onChange={(_, data) => onChange({ ...value, certificateFrom: data.value, page: 1 })} /></Field>
      </div>
    </PopoverSurface></Popover>
    {hasActiveFilters ? <Button className="registration-toolbar__clear" appearance="subtle" icon={<Dismiss20Regular />} onClick={onClear}>Limpar</Button> : null}
    {canCreate ? <Button className="registration-toolbar__new" appearance="primary" icon={<Add20Regular />} onClick={onNew}>Nova matrícula</Button> : null}
  </div>;
}
