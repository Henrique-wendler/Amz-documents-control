import { useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import type { ReportAnalysisChart } from "../../types/report";
import { buildDonutModel, formatDonutValue } from "./donutChartModel";

interface Props {
  chart: ReportAnalysisChart;
  selectedKey?: string;
  onSelect: (key: string) => void;
}

const radius = 78;
const circumference = 2 * Math.PI * radius;
const numberFormatter = new Intl.NumberFormat("pt-BR");

export function DonutChart({ chart, selectedKey, onSelect }: Props) {
  const { total, segments } = useMemo(() => buildDonutModel(chart.items), [chart.items]);
  const [hoveredKey, setHoveredKey] = useState<string>();
  if (total <= 0) return <p className="report-donut__empty">Nenhum dado encontrado para os filtros atuais.</p>;
  const centerValue = chart.centerValue ?? numberFormatter.format(total);

  const tooltip = (segment: typeof segments[number]) =>
    `${segment.label} · ${formatDonutValue(segment.value, segment.displayValue, chart.valueUnit)} · ${segment.displayPercentage}`;
  const handleKeyDown = (event: KeyboardEvent<SVGCircleElement>, key: string) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(key); }
  };

  return <div className="report-donut__body">
    <div className="report-donut__visual">
      <svg className="report-donut__svg" viewBox="0 0 210 210" role="group" aria-label={`Distribuição: ${chart.title}`}>
        <circle cx="105" cy="105" r={radius} fill="none" stroke="#e3ece1" strokeWidth="30" aria-hidden="true" />
        {segments.filter((segment) => segment.value > 0).map((segment) => {
          const muted = Boolean(selectedKey && selectedKey !== segment.key);
          const highlighted = hoveredKey === segment.key || selectedKey === segment.key;
          return <circle key={segment.key} cx="105" cy="105" r={radius} fill="none"
            stroke={segment.color} strokeWidth={highlighted ? 36 : 30} opacity={muted ? 0.4 : 1}
            strokeDasharray={`${segment.fraction * circumference} ${circumference}`}
            strokeDashoffset={-segment.startFraction * circumference}
            transform="rotate(-90 105 105)" className="report-donut__segment"
            role="button" tabIndex={0} aria-pressed={selectedKey === segment.key}
            aria-label={tooltip(segment)} onClick={() => onSelect(segment.key)}
            onKeyDown={(event) => handleKeyDown(event, segment.key)}
            onMouseEnter={() => setHoveredKey(segment.key)} onMouseLeave={() => setHoveredKey(undefined)}
            onFocus={() => setHoveredKey(segment.key)} onBlur={() => setHoveredKey(undefined)}>
            <title>{tooltip(segment)}</title>
          </circle>;
        })}
        <text x="105" y="100" textAnchor="middle"
          className={`report-donut__center-value${centerValue.length > 10 ? " report-donut__center-value--long" : ""}`}
          aria-hidden="true">
          {centerValue}
        </text>
        <text x="105" y="121" textAnchor="middle" className="report-donut__center-label" aria-hidden="true">{chart.centerLabel}</text>
      </svg>
    </div>
    <ol className="report-donut__legend" aria-label={`Legenda: ${chart.title}`}>
      {segments.map((segment) => <li key={segment.key}>
        <button type="button" className={`report-donut__legend-button${selectedKey === segment.key ? " report-donut__legend-button--selected" : ""}`}
          aria-pressed={selectedKey === segment.key} title={tooltip(segment)} onClick={() => onSelect(segment.key)}>
          <span className="report-donut__swatch" style={{ backgroundColor: segment.color }} aria-hidden="true" />
          <span className="report-donut__legend-label">{segment.label}</span>
          <span className="report-donut__legend-value">{segment.displayValue ?? numberFormatter.format(segment.value)}</span>
          <span className="report-donut__legend-percentage">{segment.displayPercentage}</span>
        </button>
      </li>)}
    </ol>
  </div>;
}
