import { Document24Regular, Map24Regular, People24Regular, Shield24Regular } from "@fluentui/react-icons";
import { formatArea } from "../../services/searchUtils";
import type { RegistrationSummary as RegistrationSummaryValue } from "../../types/matricula";

interface RegistrationSummaryProps { value?: RegistrationSummaryValue; }

export function RegistrationSummary({ value }: RegistrationSummaryProps) {
  const items = [
    { label: "Total de matrículas", value: value?.total ?? "—", icon: Document24Regular },
    { label: "Matrículas ativas", value: value?.active ?? "—", icon: Shield24Regular },
    { label: "Área legal registrada", value: value ? formatArea(value.legalArea) : "—", icon: Map24Regular },
    { label: "Sem proprietário ativo", value: value?.withoutActiveOwner ?? "—", icon: People24Regular, warning: Boolean(value?.withoutActiveOwner) },
  ];
  return <section className="registration-summary" aria-label="Resumo de matrículas">{items.map(({ label, value: itemValue, icon: Icon, warning }) => <article className={`registration-summary__item${warning ? " registration-summary__item--warning" : ""}`} key={label}><span className="registration-summary__icon"><Icon aria-hidden="true" /></span><span><small>{label}</small><strong>{itemValue}</strong></span></article>)}</section>;
}
