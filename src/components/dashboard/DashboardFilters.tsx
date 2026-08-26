import { Dropdown, Field, Option } from "@fluentui/react-components";
import type { DashboardFilters as DashboardFiltersValue } from "../../types/dashboard";

interface DashboardFiltersProps {
  value: DashboardFiltersValue;
  onChange: (value: DashboardFiltersValue) => void;
  farms: Array<{ id: string; name: string }>;
}

export function DashboardFilters({ value, onChange, farms }: DashboardFiltersProps) {
  return (
    <section className="dashboard-filters" aria-label="Filtros da visão geral">
      <span className="dashboard-filters__label">Exibindo</span>
      <Field label="Período">
        <Dropdown
          size="small"
          value={value.period}
          selectedOptions={[value.period]}
          onOptionSelect={(_, data) => onChange({ ...value, period: data.optionValue ?? value.period })}
        >
          <Option value="Últimos 30 dias">Últimos 30 dias</Option>
          <Option value="Últimos 90 dias">Últimos 90 dias</Option>
          <Option value="Ano atual">Ano atual</Option>
        </Dropdown>
      </Field>
      <Field label="Situação">
        <Dropdown
          size="small"
          value={value.status}
          selectedOptions={[value.status]}
          onOptionSelect={(_, data) => onChange({ ...value, status: data.optionValue ?? value.status })}
        >
          <Option value="Todas">Todas</Option>
          <Option value="Ativas">Ativas</Option>
          <Option value="Em análise">Em análise</Option>
        </Dropdown>
      </Field>
      <Field label="Fazenda">
        <Dropdown
          size="small"
          value={value.farm}
          selectedOptions={[value.farm]}
          onOptionSelect={(_, data) => onChange({ ...value, farm: data.optionValue ?? value.farm })}
        >
          <Option value="Todas as fazendas">Todas as fazendas</Option>
          {farms.map((farm) => <Option key={farm.id} value={farm.name}>{farm.name}</Option>)}
        </Dropdown>
      </Field>
    </section>
  );
}
