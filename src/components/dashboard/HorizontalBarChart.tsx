import type { ChartDatum } from "../../types/dashboard";

interface HorizontalBarChartProps {
  data: ChartDatum[];
  accessibleLabel: string;
  compact?: boolean;
}

export function HorizontalBarChart({ data, accessibleLabel, compact = false }: HorizontalBarChartProps) {
  const maximum = Math.max(...data.map((item) => item.value), 1);
  return (
    <div className={`horizontal-chart${compact ? " horizontal-chart--compact" : ""}`} aria-label={accessibleLabel}>
      {data.map((item) => (
        <div className="horizontal-chart__row" key={item.label}>
          <span className="horizontal-chart__label">{item.label}</span>
          <div className="horizontal-chart__track">
            <span
              className={`horizontal-chart__bar horizontal-chart__bar--${item.tone}`}
              style={{ width: `${Math.max((item.value / maximum) * 100, 7)}%` }}
            />
          </div>
          <strong>{item.value}</strong>
        </div>
      ))}
    </div>
  );
}
