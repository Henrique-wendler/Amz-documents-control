import { Building24Regular, Document24Regular, Map24Regular, Shield24Regular } from "@fluentui/react-icons";
import { formatArea } from "../../services/searchUtils";
import type { FarmSummary as FarmSummaryValue } from "../../types/fazenda";

interface FarmSummaryProps {
  value?: FarmSummaryValue;
}

export function FarmSummary({ value }: FarmSummaryProps) {
  const items = [
    { label: "Total de fazendas", value: value?.total ?? "—", icon: Building24Regular },
    { label: "Fazendas ativas", value: value?.active ?? "—", icon: Shield24Regular },
    { label: "Área total cadastrada", value: value ? formatArea(value.totalArea) : "—", icon: Map24Regular },
    { label: "Matrículas vinculadas", value: value?.registrations ?? "—", icon: Document24Regular },
  ];

  return (
    <section className="farm-summary" aria-label="Resumo de fazendas">
      {items.map(({ label, value: itemValue, icon: Icon }) => (
        <article className="farm-summary__item" key={label}>
          <span className="farm-summary__icon"><Icon aria-hidden="true" /></span>
          <span><small>{label}</small><strong>{itemValue}</strong></span>
        </article>
      ))}
    </section>
  );
}
