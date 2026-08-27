import { Button, Dropdown, Field, Option } from "@fluentui/react-components";
import { Dismiss20Regular } from "@fluentui/react-icons";
import type { SearchCategory, SearchFilters as SearchFiltersValue } from "../../types/consulta";
import { searchStatusLabels } from "../../services/statusLabels";
import { AdvancedFilters } from "./AdvancedFilters";

interface SearchFiltersProps {
  category: SearchCategory;
  value: SearchFiltersValue;
  hasActiveFilters: boolean;
  advancedCount: number;
  onChange: (value: SearchFiltersValue) => void;
  onClear: () => void;
  onClearAdvanced: () => void;
  farms: Array<{ id: string; label: string }>;
}

export function SearchFilters({
  category,
  value,
  hasActiveFilters,
  advancedCount,
  onChange,
  onClear,
  onClearAdvanced,
  farms,
}: SearchFiltersProps) {
  const showFarm = category !== "owner";
  return (
    <div className="consulta-filters" aria-label="Filtros da consulta">
      <Field label="Situação">
        <Dropdown
          size="small"
          value={value.status || "Todas"}
          selectedOptions={value.status ? [value.status] : []}
          onOptionSelect={(_, data) => onChange({ ...value, status: data.optionValue === "Todas" ? "" : (data.optionValue ?? ""), page: 1 })}
        >
          {["Todas", ...searchStatusLabels].map((option) => <Option value={option} key={option}>{option}</Option>)}
        </Dropdown>
      </Field>

      {showFarm ? (
        <Field label="Fazenda">
          <Dropdown
            size="small"
            value={value.farmId ? farms.find((farm) => farm.id === value.farmId)?.label : "Todas as fazendas"}
            selectedOptions={value.farmId ? [value.farmId] : []}
            onOptionSelect={(_, data) => onChange({ ...value, farmId: data.optionValue === "all" ? "" : (data.optionValue ?? ""), page: 1 })}
          >
            <Option value="all">Todas as fazendas</Option>
            {farms.map((farm) => <Option value={farm.id} key={farm.id}>{farm.label}</Option>)}
          </Dropdown>
        </Field>
      ) : null}

      <AdvancedFilters
        category={category}
        filters={value}
        activeCount={advancedCount}
        onApply={(filters) => onChange({ ...filters, page: 1 })}
        onClear={onClearAdvanced}
      />

      <Field className="consulta-sort" label="Ordenar por">
        <Dropdown
          size="small"
          value={{ recent: "Mais recentes", "name-asc": "Nome A–Z", "name-desc": "Nome Z–A", status: "Situação", updated: "Última atualização" }[value.sort]}
          selectedOptions={[value.sort]}
          onOptionSelect={(_, data) => onChange({ ...value, sort: (data.optionValue ?? "recent") as SearchFiltersValue["sort"], page: 1 })}
        >
          <Option value="recent">Mais recentes</Option>
          <Option value="name-asc">Nome A–Z</Option>
          <Option value="name-desc">Nome Z–A</Option>
          <Option value="status">Situação</Option>
          <Option value="updated">Última atualização</Option>
        </Dropdown>
      </Field>

      {hasActiveFilters ? (
        <Button className="consulta-clear" appearance="subtle" size="small" icon={<Dismiss20Regular />} onClick={onClear}>
          Limpar filtros
        </Button>
      ) : null}
    </div>
  );
}
