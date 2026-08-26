import { Building24Regular, Document24Regular, People24Regular, Shield24Regular } from "@fluentui/react-icons";
import type { OwnerSummary as OwnerSummaryValue } from "../../types/proprietario";

interface OwnerSummaryProps {
  value?: OwnerSummaryValue;
}

export function OwnerSummary({ value }: OwnerSummaryProps) {
  const items = [
    { label: "Total de proprietários", value: value?.total ?? "—", icon: People24Regular },
    { label: "Pessoas físicas", value: value?.individuals ?? "—", icon: Document24Regular },
    { label: "Pessoas jurídicas", value: value?.companies ?? "—", icon: Building24Regular },
    { label: "Cadastros inativos", value: value?.inactive ?? "—", icon: Shield24Regular, warning: Boolean(value?.inactive) },
  ];

  return (
    <section className="owner-summary" aria-label="Resumo de proprietários">
      {items.map(({ label, value: itemValue, icon: Icon, warning }) => (
        <article className={`owner-summary__item${warning ? " owner-summary__item--warning" : ""}`} key={label}>
          <span className="owner-summary__icon"><Icon aria-hidden="true" /></span>
          <span><small>{label}</small><strong>{itemValue}</strong></span>
        </article>
      ))}
    </section>
  );
}

