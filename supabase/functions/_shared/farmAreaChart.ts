export interface FarmAreaChartInput {
  id: string;
  name: string;
  totalArea: number;
}

export interface FarmAreaChartItem {
  id: string;
  label: string;
  area: number;
  displayArea: string;
  percentage: number;
  displayPercentage: string;
  startFraction: number;
  fraction: number;
  color: string;
}

export interface FarmAreaChart {
  kind: "donut";
  title: string;
  totalArea: number;
  displayTotalArea: string;
  items: FarmAreaChartItem[];
}

const colors = ["#1b5e3b", "#4a8b48", "#86b93b", "#d5a530", "#418d80", "#82918a"];
const areaFormatter = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const percentageFormatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

export const formatChartArea = (area: number) => `${areaFormatter.format(area)} ha`;

export function buildFarmAreaChart(farms: FarmAreaChartInput[]): FarmAreaChart {
  const sorted = farms
    .map((farm) => ({ ...farm, totalArea: Number.isFinite(farm.totalArea) ? Math.max(0, farm.totalArea) : 0 }))
    .sort((left, right) => right.totalArea - left.totalArea || left.name.localeCompare(right.name, "pt-BR") || left.id.localeCompare(right.id));
  const totalArea = sorted.reduce((sum, farm) => sum + farm.totalArea, 0);
  const visible = sorted.length > 5
    ? [...sorted.slice(0, 5), { id: "others", name: "Outros", totalArea: sorted.slice(5).reduce((sum, farm) => sum + farm.totalArea, 0) }]
    : sorted;
  let startFraction = 0;
  const items = visible.map((farm, index) => {
    // A single farm always fills the ring, including when its recorded area is zero.
    const fraction = sorted.length === 1 ? 1 : totalArea > 0 ? farm.totalArea / totalArea : 0;
    const percentage = fraction * 100;
    const item: FarmAreaChartItem = {
      id: farm.id,
      label: farm.name,
      area: farm.totalArea,
      displayArea: formatChartArea(farm.totalArea),
      percentage,
      displayPercentage: percentage > 0 && percentage < 0.05 ? "< 0,1%" : `${percentageFormatter.format(percentage)}%`,
      startFraction,
      fraction,
      color: colors[index],
    };
    startFraction += fraction;
    return item;
  });

  return { kind: "donut", title: "Área total por fazenda", totalArea, displayTotalArea: formatChartArea(totalArea), items };
}
