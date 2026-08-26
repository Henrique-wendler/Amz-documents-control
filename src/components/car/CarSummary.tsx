import { CheckmarkCircle24Regular, Clock24Regular, PersonProhibited24Regular, Shield24Regular } from "@fluentui/react-icons";
import type { CarSummaryViewModel } from "../../types/car";

export function CarSummary({ value }: { value?: CarSummaryViewModel }) {
  const items = [
    { label: "Cadastros CAR", value: value?.total ?? "—", icon: Shield24Regular },
    { label: "CAR ativos", value: value?.active ?? "—", icon: CheckmarkCircle24Regular },
    { label: "CAR pendentes", value: value?.pending ?? "—", icon: Clock24Regular, tone: "warning" },
    { label: "CAR inativos", value: value?.inactive ?? "—", icon: PersonProhibited24Regular },
  ];
  return <div className="document-summary" aria-label="Indicadores do CAR">{items.map(({ label, value: count, icon: Icon, tone }) => <article key={label} className={`document-summary__item${tone ? ` document-summary__item--${tone}` : ""}`}><span className="document-summary__icon"><Icon /></span><span><small>{label}</small><strong>{count}</strong></span></article>)}</div>;
}
