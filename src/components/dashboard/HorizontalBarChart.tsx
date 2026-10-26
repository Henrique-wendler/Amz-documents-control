import type { ChartDatum } from "../../types/dashboard";

interface HorizontalBarChartProps {
  data: ChartDatum[];
  accessibleLabel: string;
  compact?: boolean;
}

export function HorizontalBarChart({ data, accessibleLabel, compact = false }: HorizontalBarChartProps) {
  const maximum = Math.max(0, ...data.map((item) => item.value));
  if (maximum === 0) return <p className="category-chart__empty">Nenhum registro encontrado para os filtros atuais.</p>;
  return (
    <div className={`horizontal-chart${compact ? " horizontal-chart--compact" : ""}`} aria-label={accessibleLabel}>
      {data.filter((item) => item.value > 0).map((item) => (
        <div className="horizontal-chart__row" key={item.label}>
          <span className="horizontal-chart__label">{item.label}</span>
          <div className="horizontal-chart__track">
            <span
              className={`horizontal-chart__bar horizontal-chart__bar--${item.tone}`}
              style={{ width: `${(item.value / maximum) * 100}%` }}
            />
          </div>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}
