import { Button, Dropdown, Field, Input, Option } from "@fluentui/react-components";
import { Add20Regular, Search20Regular } from "@fluentui/react-icons";
import type { CarFilters, CarOption } from "../../types/car";
import { carStatusLabels } from "../../services/statusLabels";

interface Props { query: string; value: CarFilters; farms: CarOption[]; onQueryChange: (value: string) => void; onChange: React.Dispatch<React.SetStateAction<CarFilters>>; onNew: () => void; }
const farmLabel = (farms: CarOption[], id: string) => farms.find((farm) => farm.id === id)?.label ?? "Todas as fazendas";

export function CarToolbar({ query, value, farms, onQueryChange, onChange, onNew }: Props) {
  const set = <K extends keyof CarFilters>(key: K, next: CarFilters[K]) => onChange((current) => ({ ...current, [key]: next, page: 1 }));
  return <div className="document-toolbar car-toolbar">
    <Field className="document-toolbar__search" label="Busca"><Input value={query} contentBefore={<Search20Regular />} placeholder="Buscar por número, recibo, fazenda, matrícula ou proprietário" onChange={(_, data) => onQueryChange(data.value)} /></Field>
    <Field label="Fazenda"><Dropdown value={farmLabel(farms, value.farmId)} selectedOptions={[value.farmId]} onOptionSelect={(_, data) => set("farmId", data.optionValue ?? "")}><Option value="">Todas as fazendas</Option>{farms.map((farm) => <Option key={farm.id} value={farm.id}>{farm.label}</Option>)}</Dropdown></Field>
    <Field label="Situação"><Dropdown value={value.status === "all" ? "Todas" : carStatusLabels[value.status]} selectedOptions={[value.status]} onOptionSelect={(_, data) => set("status", (data.optionValue ?? "all") as CarFilters["status"])}><Option value="all">Todas</Option>{(["active", "pending", "inactive"] as const).map((status) => <Option key={status} value={status}>{carStatusLabels[status]}</Option>)}</Dropdown></Field>
    <Button className="document-toolbar__new" appearance="primary" icon={<Add20Regular />} onClick={onNew}>Novo CAR</Button>
  </div>;
}
