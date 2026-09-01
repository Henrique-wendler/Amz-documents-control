import { useState } from "react";
import {
  Button,
  Dropdown,
  Field,
  Option,
  Popover,
  PopoverSurface,
  PopoverTrigger,
} from "@fluentui/react-components";
import { Filter20Regular } from "@fluentui/react-icons";
import type { SearchCategory, SearchFilterOptions, SearchFilters } from "../../types/consulta";

interface AdvancedFiltersProps {
  category: SearchCategory;
  filters: SearchFilters;
  activeCount: number;
  options: SearchFilterOptions;
  onApply: (filters: SearchFilters) => void;
  onClear: () => void;
}

interface FilterFieldProps {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}

function FilterField({ label, value, options, onChange }: FilterFieldProps) {
  return (
    <Field label={label}>
      <Dropdown
        size="small"
        value={value || "Todos"}
        selectedOptions={value ? [value] : []}
        onOptionSelect={(_, data) => onChange(data.optionValue === "Todos" ? "" : (data.optionValue ?? ""))}
      >
        <Option value="Todos">Todos</Option>
        {options.map((option) => <Option value={option} key={option}>{option}</Option>)}
      </Dropdown>
    </Field>
  );
}

export function AdvancedFilters({ category, filters, activeCount, options, onApply, onClear }: AdvancedFiltersProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(filters);

  const openPopover = (nextOpen: boolean) => {
    if (nextOpen) setDraft(filters);
    setOpen(nextOpen);
  };

  const set = (key: keyof SearchFilters, value: string) => setDraft((current) => ({ ...current, [key]: value }));

  const fields = (() => {
    if (category === "owner") return <FilterField label="Tipo de pessoa" value={draft.ownerType} options={["Pessoa Física", "Pessoa Jurídica"]} onChange={(value) => set("ownerType", value)} />;
    if (category === "farm") return <><FilterField label="Município" value={draft.municipality} options={options.municipalities} onChange={(value) => set("municipality", value)} /><FilterField label="Estado" value={draft.state} options={options.states} onChange={(value) => set("state", value)} /></>;
    if (category === "operation") return <><FilterField label="Banco" value={draft.bank} options={options.banks} onChange={(value) => set("bank", value)} />{options.valueRanges.length ? <FilterField label="Faixa de valor" value={draft.valueRange} options={options.valueRanges} onChange={(value) => set("valueRange", value)} /> : null}</>;
    if (category === "guarantee") return <><FilterField label="Tipo de garantia" value={draft.guaranteeType} options={options.guaranteeTypes} onChange={(value) => set("guaranteeType", value)} /><FilterField label="Banco" value={draft.bank} options={options.banks} onChange={(value) => set("bank", value)} /></>;
    if (category === "document") return <><FilterField label="Tipo de documento" value={draft.documentType} options={options.documentTypes} onChange={(value) => set("documentType", value)} /><FilterField label="Vencimento" value={draft.expiration} options={["A vencer", "Vencidos", "Vigentes"]} onChange={(value) => set("expiration", value)} /></>;
    return <p className="advanced-filters__message">Os filtros principais disponíveis já são suficientes para esta categoria.</p>;
  })();

  return (
    <Popover open={open} onOpenChange={(_, data) => openPopover(data.open)} positioning="below-start">
      <PopoverTrigger disableButtonEnhancement>
        <Button className="consulta-filters__advanced" appearance="secondary" size="small" icon={<Filter20Regular />}>
          Mais filtros{activeCount ? ` (${activeCount})` : ""}
        </Button>
      </PopoverTrigger>
      <PopoverSurface className="advanced-filters">
        <div className="advanced-filters__heading">
          <strong>Mais filtros</strong>
          <span>Opções específicas da categoria</span>
        </div>
        <div className="advanced-filters__fields">{fields}</div>
        <div className="advanced-filters__actions">
          <Button appearance="subtle" size="small" onClick={() => { onClear(); setOpen(false); }}>Limpar</Button>
          <Button appearance="primary" size="small" onClick={() => { onApply(draft); setOpen(false); }}>Aplicar filtros</Button>
        </div>
      </PopoverSurface>
    </Popover>
  );
}
