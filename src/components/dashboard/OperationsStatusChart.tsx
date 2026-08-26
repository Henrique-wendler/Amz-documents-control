import type { ChartDatum } from "../../types/dashboard";
import { HorizontalBarChart } from "./HorizontalBarChart";

export function OperationsStatusChart({ data }: { data: ChartDatum[] }) {
  return <HorizontalBarChart data={data} accessibleLabel="Distribuição das operações por situação" />;
}
