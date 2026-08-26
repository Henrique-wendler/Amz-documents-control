import { Building24Regular, Document24Regular, Folder24Regular, Money24Regular, People24Regular, Shield24Regular } from "@fluentui/react-icons";
import type { ComponentType } from "react";
import type { ReportDefinition, ReportType } from "../../types/report";

interface Props { items: ReportDefinition[]; selected: ReportType; onSelect: (type: ReportType) => void; }
const icons: Record<ReportType, ComponentType> = { farms: Building24Regular, owners: People24Regular, registrations: Document24Regular, operations: Money24Regular, guarantees: Shield24Regular, documents: Folder24Regular, car: Shield24Regular };

export function ReportTypeCards({ items, selected, onSelect }: Props) {
  return <div className="report-types" aria-label="Tipos de relatório">{items.map((item) => { const Icon = icons[item.id]; const active = item.id === selected; return <button key={item.id} type="button" className={`report-type-card${active ? " report-type-card--active" : ""}`} aria-pressed={active} onClick={() => onSelect(item.id)}><span><Icon /></span><strong>{item.title}</strong><small>{item.description}</small></button>; })}</div>;
}
