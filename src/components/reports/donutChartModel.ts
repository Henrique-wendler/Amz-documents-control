export interface DonutInput {
  key: string;
  label: string;
  value: number;
  displayValue?: string;
}

export interface DonutSegment extends DonutInput {
  color: string;
  fraction: number;
  startFraction: number;
  displayPercentage: string;
}

const palette = ["#1b5e3b", "#4a8b48", "#86b93b", "#418d80", "#6d9d71", "#82918a"];
const numberFormatter = new Intl.NumberFormat("pt-BR");
const percentageFormatter = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });

const normalizeLabel = (label: string) => label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");

export const donutColor = (label: string, index: number) => {
  const normalized = normalizeLabel(label);
  if (["ativo", "ativa", "vigente", "validos", "valido", "concluida", "resolvida"].includes(normalized)) return "#2f7d49";
  if (["em analise", "a vencer", "pendente", "ate 30 dias", "31 a 60 dias"].includes(normalized)) return "#b88220";
  if (["vencido", "vencidos"].includes(normalized)) return "#a9403b";
  if (["inativo", "inativa", "cancelada", "encerrada", "outros", "sem informacao", "sem tipo", "sem validade informada"].includes(normalized)) return "#82918a";
  return palette[index % palette.length];
};

export const formatDonutValue = (value: number, displayValue?: string, unit: "registro" | "vínculo" = "registro") =>
  displayValue ?? `${numberFormatter.format(value)} ${unit}${value === 1 ? "" : "s"}`;

export function buildDonutModel(items: DonutInput[]) {
  const sanitized = items.map((item) => ({ ...item, value: Number.isFinite(item.value) ? Math.max(0, item.value) : 0 }));
  const total = sanitized.reduce((sum, item) => sum + item.value, 0);
  let startFraction = 0;
  const segments: DonutSegment[] = sanitized.map((item, index) => {
    const fraction = total > 0 ? item.value / total : 0;
    const percentage = fraction * 100;
    const segment = {
      ...item,
      color: donutColor(item.label, index),
      startFraction,
      fraction,
      displayPercentage: percentage > 0 && percentage < 0.05 ? "< 0,1%" : `${percentageFormatter.format(percentage)}%`,
    };
    startFraction += fraction;
    return segment;
  });
  return { total, segments };
}
