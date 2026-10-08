import type { ReportChart as ReportChartModel } from "../../types/report";

export function ReportChart({ chart }: { chart: ReportChartModel }) {
  const circumference = 2 * Math.PI * 82;

  return (
    <figure className="report-chart" aria-label={chart.title}>
      <figcaption>{chart.title}</figcaption>
      {chart.items.length ? (
        <div className="report-chart__body">
          <svg className="report-chart__donut" viewBox="0 0 220 220" role="img" aria-label={`Distribuição de ${chart.displayTotalArea} entre as fazendas`}>
            <circle cx="110" cy="110" r="82" fill="none" stroke="#e3ece1" strokeWidth="34" />
            {chart.items.filter((item) => item.fraction > 0).map((item) => (
              <circle
                key={item.id}
                cx="110" cy="110" r="82" fill="none" stroke={item.color} strokeWidth="34"
                strokeDasharray={`${item.fraction * circumference} ${circumference}`}
                strokeDashoffset={-item.startFraction * circumference}
                transform="rotate(-90 110 110)"
              />
            ))}
            <text x="110" y="104" textAnchor="middle" className="report-chart__center-label">Área total</text>
            <text x="110" y="125" textAnchor="middle" className="report-chart__center-value">{chart.displayTotalArea}</text>
          </svg>
          <ol className="report-chart__items" aria-label="Fazendas por área total">
            {chart.items.map((item) => (
              <li key={item.id} className="report-chart__item">
                <span className="report-chart__swatch" style={{ backgroundColor: item.color }} aria-hidden="true" />
                <span className="report-chart__label">{item.label}</span>
                <span className="report-chart__area">{item.displayArea}</span>
                <strong className="report-chart__percentage">{item.displayPercentage}</strong>
              </li>
            ))}
          </ol>
        </div>
      ) : <p>Nenhuma fazenda para exibir no gráfico.</p>}
    </figure>
  );
}
