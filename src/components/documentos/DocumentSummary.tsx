import { CalendarClock24Regular, CheckmarkCircle24Regular, DocumentBulletList24Regular, Warning24Regular } from "@fluentui/react-icons";
import type { DocumentSummaryViewModel } from "../../types/documento";

export function DocumentSummary({ value }: { value?: DocumentSummaryViewModel }) {
  const items = [
    { label: "Documentos cadastrados", value: value?.total ?? "—", icon: DocumentBulletList24Regular },
    { label: "Documentos vigentes", value: value?.active ?? "—", icon: CheckmarkCircle24Regular },
    { label: "A vencer em 30 dias", value: value?.expiring ?? "—", icon: CalendarClock24Regular, tone: "warning" },
    { label: "Documentos vencidos", value: value?.expired ?? "—", icon: Warning24Regular, tone: "danger" },
  ];
  return <div className="document-summary" aria-label="Indicadores de documentos">{items.map(({ label, value: count, icon: Icon, tone }) => <article key={label} className={`document-summary__item${tone ? ` document-summary__item--${tone}` : ""}`}><span className="document-summary__icon"><Icon /></span><span><small>{label}</small><strong>{count}</strong></span></article>)}</div>;
}

