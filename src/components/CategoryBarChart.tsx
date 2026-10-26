export interface CategoryBarItem {
  key: string;
  label: string;
  value: number;
}

interface CategoryBarChartProps {
  items: CategoryBarItem[];
  emptyMessage: string;
  selectedKey?: string;
  onSelect?: (key: string) => void;
}

export function CategoryBarChart({ items, emptyMessage, selectedKey, onSelect }: CategoryBarChartProps) {
  const maximum = Math.max(0, ...items.map((item) => item.value));
  if (maximum === 0) return <p className="category-chart__empty">{emptyMessage}</p>;

  return <div className="category-chart">
    {items.filter((item) => item.value > 0).map((item) => {
      const content = <>
        <span className="category-chart__label" title={item.label}>{item.label}</span>
        <span className="category-chart__track" aria-hidden="true"><span style={{ width: `${item.value / maximum * 100}%` }} /></span>
        <strong>{new Intl.NumberFormat("pt-BR").format(item.value)}</strong>
      </>;
      return onSelect
        ? <button type="button" className={`category-chart__row${selectedKey === item.key ? " category-chart__row--selected" : ""}`}
            aria-pressed={selectedKey === item.key} aria-label={`${item.label}: ${item.value} registros`}
            onClick={() => onSelect(item.key)} key={item.key}>{content}</button>
        : <div className="category-chart__row" key={item.key}>{content}</div>;
    })}
  </div>;
}
