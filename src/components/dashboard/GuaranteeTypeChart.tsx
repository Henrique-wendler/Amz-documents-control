import type { ChartDatum } from "../../types/dashboard";
import { HorizontalBarChart } from "./HorizontalBarChart";

export function GuaranteeTypeChart({ data }: { data: ChartDatum[] }) {
  return <HorizontalBarChart data={data} accessibleLabel="Distribuição das garantias por tipo" compact />;
}
